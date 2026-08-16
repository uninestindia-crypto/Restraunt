// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const STORE_ID = Deno.env.get("STORE_ID") || "the-taste";
const GST_PERCENT = Number(Deno.env.get("GST_PERCENT") || "5");
const DELIVERY_FEE = Number(Deno.env.get("DELIVERY_FEE") || "0");
const ORDER_PREFIX = Deno.env.get("ORDER_PREFIX") || "TT";
const MAX_ORDERS_PER_WINDOW = Number(Deno.env.get("PUBLIC_ORDER_RATE_LIMIT_MAX") || "12");
const RATE_LIMIT_WINDOW_MINUTES = Number(Deno.env.get("PUBLIC_ORDER_RATE_LIMIT_MINUTES") || "10");
const RATE_LIMIT_SALT = Deno.env.get("PUBLIC_ORDER_RATE_LIMIT_SALT") || "the-taste-public-order";

/** Spice levels the kitchen recognises. Free of charge, so no pricing here. */
const SPICE_LEVELS = ["Mild", "Medium", "Spicy"];

type PublicOrderItem = {
  itemId: number;
  quantity: number;
  notes?: string;
  /** Chosen add-ons, by id. The client never sends what they cost. */
  addonIds?: number[];
  spiceLevel?: string;
};

type PublicOrderPayload = {
  clientOrderId?: string;
  idempotencyKey?: string;
  type?: "delivery" | "takeaway" | "dinein";
  channel?: "online" | "qr";
  source?: "online" | "qr";
  tableId?: number | null;
  customer?: {
    name?: string;
    phone?: string;
  };
  delivery?: {
    address?: string;
    landmark?: string;
    notes?: string;
  };
  payment?: {
    method?: "upi" | "cash";
  };
  items?: PublicOrderItem[];
};

function isUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanText(value: unknown, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function validPhone(value = "") {
  return /^[6-9]\d{9}$/.test(value);
}

function getIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return req.headers.get("cf-connecting-ip") || forwarded.split(",")[0].trim() || "unknown";
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeOrderNumber(clientOrderId: string) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const token = clientOrderId.replace(/-/g, "").slice(0, 16).toUpperCase();
  return {
    orderNumber: `${ORDER_PREFIX}-${yyyy}${mm}${dd}-${token}`,
    displayToken: token.slice(-6)
  };
}

function bearerToken(req: Request) {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function bad(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return bad("Method not allowed.", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return bad("Public order function is not configured.", 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  let authenticatedUserId: string | null = null;
  const token = bearerToken(req);
  if (token) {
    const { data: userData } = await supabase.auth.getUser(token);
    authenticatedUserId = userData?.user?.id || null;
  }

  let payload: PublicOrderPayload;
  try {
    payload = await req.json();
  } catch (_error) {
    return bad("Invalid JSON body.");
  }

  // ── Status lookup ────────────────────────────────────────────────
  //
  // A guest has no session, and `anon` deliberately holds no select on `orders` — one grant there
  // would expose every customer's name, phone and address to anyone with the publishable key. So
  // the storefront used to poll the table directly, be refused 42501 every ten seconds, swallow
  // the error and keep showing the status the order had when it was placed. "Live order tracking"
  // that could not track.
  //
  // The client_order_id is the capability: a v4 UUID the customer's own device minted and only it
  // holds. It authorises exactly one row, and only the fields a tracking screen needs — never the
  // whole record, and never a listing.
  if ((payload as any).action === "status") {
    const wanted = cleanText(payload.clientOrderId, 64);
    if (!wanted || wanted.length < 20) {
      return bad("A valid clientOrderId is required to look up an order.", 400);
    }

    const { data, error } = await supabase
      .from("orders")
      .select(
        "order_number, display_token, type, status, payment_status, delivery_status, " +
        "subtotal, tax, tax_percent, delivery_fee, total, created_at, updated_at, completed_at"
      )
      .eq("store_id", STORE_ID)
      .eq("client_order_id", wanted)
      .maybeSingle();

    if (error) return bad(`Status lookup failed: ${error.message}`, 500);
    if (!data) return bad("No such order.", 404);
    return jsonResponse({ order: { ...data, client_order_id: wanted } });
  }

  const clientOrderId = cleanText(payload.clientOrderId, 64);
  const idempotencyKey = cleanText(payload.idempotencyKey || clientOrderId, 128);
  const type = payload.type;
  const channel = payload.channel || "online";
  const source = payload.source || channel;
  const paymentMethod = payload.payment?.method;
  const customerName = cleanText(payload.customer?.name, 100);
  const customerPhone = cleanText(payload.customer?.phone, 20);
  const deliveryAddress = cleanText(payload.delivery?.address, 500);
  const deliveryLandmark = cleanText(payload.delivery?.landmark, 240);
  const deliveryNotes = cleanText(payload.delivery?.notes, 240);

  if (!isUuid(clientOrderId)) return bad("clientOrderId must be a valid UUID.");
  if (!idempotencyKey) return bad("idempotencyKey is required.");
  if (!["delivery", "takeaway", "dinein"].includes(type || "")) return bad("Invalid order type.");
  if (!["online", "qr"].includes(channel) || !["online", "qr"].includes(source)) return bad("Invalid public channel.");
  if (!["upi", "cash"].includes(paymentMethod || "")) return bad("Invalid payment method.");
  if (!customerName) return bad("Customer name is required.");
  if (!validPhone(customerPhone)) return bad("Valid 10-digit customer phone is required.");
  if (type === "delivery" && !deliveryAddress) return bad("Delivery address is required.");
  if (type === "dinein" && !payload.tableId) return bad("Table ID is required for dine-in orders.");

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return bad("Order must include at least one item.");
  if (items.length > 40) return bad("Too many line items.");

  const normalizedItems = items.map((item) => ({
    itemId: Number(item.itemId),
    quantity: Math.max(1, Math.min(50, Number(item.quantity) || 1)),
    notes: cleanText(item.notes, 240),
    addonIds: [...new Set(
      (Array.isArray(item.addonIds) ? item.addonIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )].slice(0, 10),
    spiceLevel: SPICE_LEVELS.includes(String(item.spiceLevel)) ? String(item.spiceLevel) : ""
  }));

  if (normalizedItems.some((item) => !Number.isFinite(item.itemId) || item.itemId <= 0)) {
    return bad("Order contains an invalid menu item.");
  }

  const { data: existingOrder, error: existingError } = await supabase
    .from("orders")
    .select("client_order_id, order_number, display_token, status, payment_status, delivery_status, total, created_at")
    .eq("store_id", STORE_ID)
    .eq("client_order_id", clientOrderId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) return bad(`Idempotency lookup failed: ${existingError.message}`, 500);
  if (existingOrder) return jsonResponse({ order: existingOrder, idempotent: true });

  const ipHash = await sha256(`${RATE_LIMIT_SALT}:${getIp(req)}`);
  const { data: rateAllowed, error: rateError } = await supabase.rpc("consume_public_order_attempt", {
    target_store_id: STORE_ID,
    target_ip_hash: ipHash,
    max_attempts: MAX_ORDERS_PER_WINDOW,
    window_minutes: RATE_LIMIT_WINDOW_MINUTES
  });
  if (rateError) return bad(`Rate limit check failed: ${rateError.message}`, 500);
  if (!rateAllowed) {
    return bad("Too many order attempts. Please wait a few minutes.", 429);
  }

  const ids = [...new Set(normalizedItems.map((item) => item.itemId))];
  const { data: menuRows, error: menuError } = await supabase
    .from("menu_items")
    .select("id, name, price, is_available, is_veg")
    .eq("store_id", STORE_ID)
    .eq("is_available", true)
    .in("id", ids);

  if (menuError) return bad(`Menu validation failed: ${menuError.message}`, 500);
  const menuById = new Map<number, any>((menuRows || []).map((row: any) => [Number(row.id), row]));
  if (ids.some((id) => !menuById.has(id))) {
    return bad("One or more items are unavailable.");
  }

  // Add-ons are charged, so their price is read here and never taken from the
  // request. Each one must also still be on offer AND belong to the dish it was
  // chosen for, or a caller could attach a cheap add-on id to any line.
  const requestedAddonIds = [...new Set(normalizedItems.flatMap((item) => item.addonIds))];
  const addonById = new Map<number, any>();
  if (requestedAddonIds.length > 0) {
    const { data: addonRows, error: addonError } = await supabase
      .from("menu_item_addons")
      .select("id, menu_item_id, name, price")
      .eq("store_id", STORE_ID)
      .eq("is_active", true)
      .in("id", requestedAddonIds);

    if (addonError) return bad(`Add-on validation failed: ${addonError.message}`, 500);
    for (const row of addonRows || []) addonById.set(Number(row.id), row);

    for (const item of normalizedItems) {
      for (const addonId of item.addonIds) {
        const addon = addonById.get(addonId);
        if (!addon || Number(addon.menu_item_id) !== item.itemId) {
          return bad("One or more selected add-ons are unavailable.");
        }
      }
    }
  }

  if (type === "dinein") {
    const { data: table, error: tableError } = await supabase
      .from("tables")
      .select("id")
      .eq("store_id", STORE_ID)
      .eq("id", Number(payload.tableId))
      .maybeSingle();
    if (tableError) return bad(`Table validation failed: ${tableError.message}`, 500);
    if (!table) return bad("Selected table does not exist.");
  }

  let subtotal = 0;
  const validatedItems = normalizedItems.map((item) => {
    const menu = menuById.get(item.itemId)!;
    const addons = item.addonIds.map((addonId) => {
      const addon = addonById.get(addonId)!;
      return { id: Number(addon.id), name: addon.name, price: Number(addon.price) || 0 };
    });

    // Add-ons are per unit of the dish, so they scale with the quantity.
    const addonsPrice = addons.reduce((sum, addon) => sum + addon.price, 0);
    const price = (Number(menu.price) || 0) + addonsPrice;
    const lineTotal = price * item.quantity;
    subtotal += lineTotal;
    return {
      itemId: Number(menu.id),
      itemName: menu.name,
      price,
      basePrice: Number(menu.price) || 0,
      quantity: item.quantity,
      isVeg: Boolean(menu.is_veg),
      addons,
      spiceLevel: item.spiceLevel,
      notes: item.notes
    };
  });

  const tax = Number((subtotal * (GST_PERCENT / 100)).toFixed(2));
  const deliveryFee = type === "delivery" ? DELIVERY_FEE : 0;
  const total = Number((subtotal + tax + deliveryFee).toFixed(2));
  const paymentStatus = paymentMethod === "upi" ? "pending" : "unpaid";
  const deliveryStatus = type === "delivery" ? "pending" : "none";
  const { orderNumber, displayToken } = makeOrderNumber(clientOrderId);

  const order = {
    store_id: STORE_ID,
    client_order_id: clientOrderId,
    idempotency_key: idempotencyKey,
    order_number: orderNumber,
    display_token: displayToken,
    type,
    status: "confirmed",
    channel,
    source,
    items: validatedItems,
    subtotal,
    tax,
    tax_percent: GST_PERCENT,
    delivery_fee: deliveryFee,
    total,
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    customer_name: customerName,
    customer_phone: customerPhone,
    delivery_address: type === "delivery" ? deliveryAddress : "",
    delivery_landmark: type === "delivery" ? deliveryLandmark : "",
    delivery_notes: type === "delivery" ? deliveryNotes : "",
    delivery_status: deliveryStatus,
    auth_user_id: authenticatedUserId,
    table_id: type === "dinein" ? Number(payload.tableId) : null,
    requires_server_validation: false,
    validation_status: "accepted",
    updated_at: new Date().toISOString()
  };

  const { data: savedOrder, error: orderError } = await supabase
    .from("orders")
    .upsert(order, { onConflict: "store_id,client_order_id" })
    .select("*")
    .single();

  if (orderError) return bad(`Order save failed: ${orderError.message}`, 500);

  await supabase.from("audit_events").insert({
    store_id: STORE_ID,
    action: "public_order_created",
    target_table: "orders",
    target_id: String(savedOrder.id),
    details: { clientOrderId, source, channel, total }
  });

  return jsonResponse({ order: savedOrder });
});
