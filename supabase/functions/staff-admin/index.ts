// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const DEFAULT_STORE_ID = "the-taste";
const STAFF_ROLES = ["developer", "owner", "manager", "cashier", "kitchen", "waiter", "delivery"];

type StaffAdminPayload = {
  action?: string;
  storeId?: string;
  staffId?: number;
  role?: string;
  isActive?: boolean;
  staff?: {
    id?: number | null;
    storeId?: string;
    cloudUserId?: string | null;
    name?: string;
    role?: string;
    pinHash?: string | null;
    allowExpress?: boolean;
    isActive?: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
};

function bad(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function cleanText(value: unknown, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function normalizeRole(role: unknown) {
  const value = cleanText(role, 30).toLowerCase();
  return STAFF_ROLES.includes(value) ? value : "";
}

function validPinHash(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function getNextStaffId(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await serviceClient
    .from("staff")
    .select("id")
    .order("id", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.length ? Number(data[0].id) + 1 : 1;
}

async function activeOwnerCount(serviceClient: ReturnType<typeof createClient>, storeId: string) {
  const { count, error } = await serviceClient
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("role", "owner")
    .eq("is_active", true);

  if (error) throw error;
  return count || 0;
}

async function requireOwner({
  serviceClient,
  token,
  storeId
}: {
  serviceClient: ReturnType<typeof createClient>;
  token: string;
  storeId: string;
}): Promise<{ user: any; membership: any } | { error: string; status: number }> {
  if (!token) return { error: "Missing authorization token.", status: 401 };

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { error: "Invalid authorization token.", status: 401 };

  const { data: membership, error: membershipError } = await serviceClient
    .from("staff_memberships")
    .select("role, is_active, staff_id")
    .eq("store_id", storeId)
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError) return { error: `Membership check failed: ${membershipError.message}`, status: 500 };
  if (membership?.role !== "owner" && membership?.role !== "developer") {
    return { error: "Only active owners or developers can manage cloud staff.", status: 403 };
  }

  return { user, membership };
}

async function audit(serviceClient: ReturnType<typeof createClient>, storeId: string, action: string, details: Record<string, unknown>) {
  const { error } = await serviceClient.from("audit_events").insert({
    store_id: storeId,
    action,
    target_table: "staff",
    target_id: String(details.staffId || ""),
    details
  });
  if (error) console.warn(`staff-admin audit failed: ${error.message}`);
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
    return bad("Staff admin function is not configured.", 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let payload: StaffAdminPayload;
  try {
    payload = await req.json();
  } catch (_error) {
    return bad("Invalid JSON body.");
  }

  const storeId = cleanText(payload.storeId || payload.staff?.storeId || Deno.env.get("STORE_ID") || DEFAULT_STORE_ID, 80);
  const action = cleanText(payload.action, 40);
  const now = new Date().toISOString();

  // Bypassing requireOwner check for login-by-pin action so unauthenticated PIN users can log in
  if (action === "login-by-pin") {
    try {
      const pinHash = cleanText((payload as any).pinHash, 64);
      if (!pinHash || !validPinHash(pinHash)) {
        return bad("Invalid PIN hash format.");
      }

      const { data: staffMember, error: staffErr } = await serviceClient
        .from("staff")
        .select("*")
        .eq("store_id", storeId)
        .eq("pin_hash", pinHash)
        .eq("is_active", true)
        .maybeSingle();

      if (staffErr) throw staffErr;
      if (!staffMember) {
        return jsonResponse({ ok: false, message: "Invalid PIN code." });
      }

      return jsonResponse({
        ok: true,
        staff: {
          id: staffMember.id,
          storeId: staffMember.store_id,
          cloudUserId: staffMember.auth_user_id,
          name: staffMember.name,
          role: staffMember.role,
          pinHash: staffMember.pin_hash,
          allowExpress: staffMember.allow_express,
          isActive: staffMember.is_active,
          createdAt: staffMember.created_at,
          updatedAt: staffMember.updated_at
        }
      });
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err), 500);
    }
  }

  // All other actions require Owner authentication
  const owner = await requireOwner({ serviceClient, token: bearerToken(req), storeId });
  if ("error" in owner) return bad(owner.error || "Unknown error", owner.status);

  try {
    if (action === "upsert-staff") {
      const input = payload.staff;
      if (!input) return bad("staff payload is required.");

      const name = cleanText(input.name, 100);
      const role = normalizeRole(input.role);
      const isActive = input.isActive !== false;
      const staffId = Number(input.id) || await getNextStaffId(serviceClient);
      const cloudUserId = cleanText(input.cloudUserId, 80) || null;

      if (!name) return bad("Staff name is required.");
      if (!role) return bad("Invalid staff role.");

      const { data: existing, error: existingError } = await serviceClient
        .from("staff")
        .select("pin_hash, created_at, role, is_active")
        .eq("store_id", storeId)
        .eq("id", staffId)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing?.role === "owner" && existing.is_active && (!isActive || role !== "owner")) {
        const owners = await activeOwnerCount(serviceClient, storeId);
        if (owners <= 1) return bad("Cannot remove or demote the last active owner.", 409);
      }

      const pinHash = input.pinHash || existing?.pin_hash || null;
      if (isActive && !validPinHash(pinHash)) {
        return bad("Active staff must have a valid PIN hash.");
      }

      const staffRow = {
        id: staffId,
        store_id: storeId,
        auth_user_id: cloudUserId,
        name,
        role,
        pin_hash: pinHash,
        allow_express: Boolean(input.allowExpress),
        is_active: isActive,
        created_at: existing?.created_at || input.createdAt || now,
        updated_at: now
      };

      const { error: staffError } = await serviceClient.from("staff").upsert(staffRow);
      if (staffError) throw staffError;

      if (cloudUserId) {
        const { error: membershipError } = await serviceClient
          .from("staff_memberships")
          .upsert({
            store_id: storeId,
            staff_id: staffId,
            auth_user_id: cloudUserId,
            role,
            is_active: isActive,
            updated_at: now
          }, { onConflict: "store_id,auth_user_id" });
        if (membershipError) throw membershipError;
      }

      await audit(serviceClient, storeId, "staff_admin_upsert", { staffId, role, isActive, by: owner.user.id });
      return jsonResponse({ ok: true, staffId });
    }

    if (action === "set-active") {
      const staffId = Number(payload.staffId);
      if (!staffId) return bad("staffId is required.");

      const isActive = Boolean(payload.isActive);
      const { data: existing, error: existingError } = await serviceClient
        .from("staff")
        .select("role, is_active")
        .eq("store_id", storeId)
        .eq("id", staffId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.role === "owner" && existing.is_active && !isActive) {
        const owners = await activeOwnerCount(serviceClient, storeId);
        if (owners <= 1) return bad("Cannot deactivate the last active owner.", 409);
      }

      const { error: staffError } = await serviceClient
        .from("staff")
        .update({ is_active: isActive, updated_at: now })
        .eq("store_id", storeId)
        .eq("id", staffId);
      if (staffError) throw staffError;

      const { error: membershipError } = await serviceClient
        .from("staff_memberships")
        .update({ is_active: isActive, updated_at: now })
        .eq("store_id", storeId)
        .eq("staff_id", staffId);
      if (membershipError) throw membershipError;

      await audit(serviceClient, storeId, "staff_admin_set_active", { staffId, isActive, by: owner.user.id });
      return jsonResponse({ ok: true, staffId, isActive });
    }

    if (action === "set-role") {
      const staffId = Number(payload.staffId);
      const role = normalizeRole(payload.role);
      if (!staffId) return bad("staffId is required.");
      if (!role) return bad("Invalid staff role.");

      const { data: existing, error: existingError } = await serviceClient
        .from("staff")
        .select("role, is_active")
        .eq("store_id", storeId)
        .eq("id", staffId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.role === "owner" && existing.is_active && role !== "owner") {
        const owners = await activeOwnerCount(serviceClient, storeId);
        if (owners <= 1) return bad("Cannot demote the last active owner.", 409);
      }

      const { error: staffError } = await serviceClient
        .from("staff")
        .update({ role, updated_at: now })
        .eq("store_id", storeId)
        .eq("id", staffId);
      if (staffError) throw staffError;

      const { error: membershipError } = await serviceClient
        .from("staff_memberships")
        .update({ role, updated_at: now })
        .eq("store_id", storeId)
        .eq("staff_id", staffId);
      if (membershipError) throw membershipError;

      await audit(serviceClient, storeId, "staff_admin_set_role", { staffId, role, by: owner.user.id });
      return jsonResponse({ ok: true, staffId, role });
    }

    if (action === "lookup-auth-user") {
      // Look up a Supabase Auth user by email to verify they have real credentials.
      // Only returns minimal info — never exposes passwords, tokens, etc.
      const email = cleanText(payload.staff?.name || (payload as any).email, 320).toLowerCase();
      if (!email || !email.includes("@")) {
        return bad("A valid email address is required.");
      }

      // Use the admin API to list users filtered by email
      const { data: userList, error: listError } = await serviceClient.auth.admin.listUsers({
        filter: email,
        page: 1,
        perPage: 5,
      });

      if (listError) {
        return bad(`Auth lookup failed: ${listError.message}`, 500);
      }

      // Find an exact email match (listUsers filter is substring-based)
      const matchedUser = userList?.users?.find(
        (u: any) => u.email?.toLowerCase() === email
      );

      if (!matchedUser) {
        return jsonResponse({
          ok: true,
          found: false,
          message: "No Supabase Auth account found with this email.",
        });
      }

      // Check if they already have a staff_membership for this store
      const { data: existingMembership } = await serviceClient
        .from("staff_memberships")
        .select("staff_id, role, is_active")
        .eq("store_id", storeId)
        .eq("auth_user_id", matchedUser.id)
        .maybeSingle();

      return jsonResponse({
        ok: true,
        found: true,
        authUserId: matchedUser.id,
        email: matchedUser.email,
        confirmed: !!matchedUser.email_confirmed_at,
        existingMembership: existingMembership
          ? {
              staffId: existingMembership.staff_id,
              role: existingMembership.role,
              isActive: existingMembership.is_active,
            }
          : null,
      });
    }

    return bad("Unsupported staff admin action.");
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error), 500);
  }
});
