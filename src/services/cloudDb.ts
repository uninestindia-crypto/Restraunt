/**
 * NextGenOS Cloud-First Data Access Layer
 */
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Cloud-First Data Access Layer
 *  Version: 2.1.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *
 *  Architecture: Online-First with Offline Cache
 *  - Online:  All reads/writes go to Supabase FIRST, then cache in IndexedDB
 *  - Offline: Reads from IndexedDB cache, writes queued for flush on reconnect
 *  - Any device that logs in sees the SAME live data instantly
 *
 *  Reads enter through `ensureFresh()`: it pulls the requested tables from
 *  Supabase into IndexedDB, and the caller then reads Dexie as usual. The cache
 *  is a fallback for an unreachable cloud, NOT a second source of truth that
 *  happens to be synced periodically — a login hydration is no longer what
 *  stands between a screen and the store's real state.
 * ═══════════════════════════════════════════════════
 */

import { db, generateLocalUuid, getDisplayToken } from '../db/database';
import { getSupabaseClient } from './supabaseClient';
import { runWithHydrationGuard } from './hydrationGuard';
import { createFreshnessTracker } from './freshness';

const DEFAULT_STORE_ID = 'the-taste';

export function getStoreId() {
  return localStorage.getItem('store_id') || DEFAULT_STORE_ID;
}

// ── Offline Write Queue ─────────────────────────────────────────
// Stored in localStorage as JSON array. Survives page refreshes.
const QUEUE_KEY = 'cloudDb_offlineQueue';

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch { return []; }
}

function pushToOfflineQueue(entry) {
  const queue = getOfflineQueue();
  queue.push({ ...entry, queuedAt: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  console.log(`[CloudDB] Queued offline write: ${entry.action} on ${entry.table}`);
}

function clearOfflineQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

// ── Connection State ────────────────────────────────────────────
let _isOnline = navigator.onLine;
let _supabaseReady = false;

window.addEventListener('online', () => { _isOnline = true; });
window.addEventListener('offline', () => { _isOnline = false; });

async function getClient() {
  // Use the live navigator.onLine instead of the cached _isOnline, because
  // during app startup on mobile the 'online' event may not have fired yet
  // even though the network is actually available.
  if (!navigator.onLine && !_isOnline) return null;
  const client = await getSupabaseClient({ persistSession: true });
  _supabaseReady = !!client;
  return client;
}

function isCloudAvailable() {
  return _isOnline && _supabaseReady;
}

// ── Mapping Helpers (Remote ↔ Local) ────────────────────────────

function mapCategoryToLocal(row: any) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || '',
    sortOrder: parseInt(row.sort_order) || 0,
    isActive: row.is_active ? 1 : 0,
    isSynced: 1
  };
}

function mapItemToLocal(row: any) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    price: parseFloat(row.price) || 0,
    isAvailable: row.is_available ? 1 : 0,
    isVeg: row.is_veg ? 1 : 0,
    sortOrder: parseInt(row.sort_order) || 0,
    description: row.description || '',
    // Omitting this used to blank every dish photo on each hydration, because
    // the pull writes whole records back over the local rows.
    imageUrl: row.image_url || '',
    isSynced: 1
  };
}

function mapAddonToLocal(row: any) {
  return {
    id: row.id,
    menuItemId: row.menu_item_id,
    name: row.name,
    price: parseFloat(row.price) || 0,
    isActive: row.is_active ? 1 : 0,
    sortOrder: parseInt(row.sort_order) || 0,
    updatedAt: row.updated_at,
    isSynced: 1
  };
}

/**
 * Carry device-local fields across a hydration.
 *
 * The cloud has no column for an inlined image, so a pull would otherwise
 * discard a picture that was set while offline.
 */
async function preserveLocalItemImages(incoming: any[]) {
  const existing = await db.menuItems.bulkGet(incoming.map(row => row.id));
  return incoming.map((row, index) => {
    const localImage = String(existing[index]?.imageData || '');
    return localImage ? { ...row, imageData: localImage } : row;
  });
}

export function mapOrderToLocal(row: any) {
  return {
    id: row.id,
    serverOrderId: row.id,
    clientOrderId: row.client_order_id,
    idempotencyKey: row.idempotency_key,
    orderNumber: row.order_number,
    displayToken: row.display_token || String(row.order_number || row.id || '').split('-').pop(),
    type: row.type || 'takeaway',
    status: row.status || 'pending',
    channel: row.channel || 'pos',
    source: row.source || row.channel || 'pos',
    items: JSON.stringify(row.items || []),
    subtotal: parseFloat(row.subtotal) || 0,
    tax: parseFloat(row.tax) || 0,
    taxPercent: parseFloat(row.tax_percent) || 0,
    deliveryFee: parseFloat(row.delivery_fee) || 0,
    total: parseFloat(row.total) || 0,
    paymentMethod: row.payment_method || null,
    paymentStatus: row.payment_status || 'unpaid',
    paymentReference: row.payment_reference || '',
    paymentVerifiedAt: row.payment_verified_at || null,
    paymentVerifiedBy: row.payment_verified_by || '',
    paymentCollectedAt: row.payment_collected_at || null,
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    deliveryAddress: row.delivery_address || '',
    deliveryLandmark: row.delivery_landmark || '',
    deliveryNotes: row.delivery_notes || '',
    deliveryStatus: row.delivery_status || (row.type === 'delivery' ? 'pending' : 'none'),
    deliveryStaffId: row.delivery_staff_id || null,
    deliveryStaffName: row.delivery_staff_name || '',
    deliveryAssignedAt: row.delivery_assigned_at || null,
    deliveryOutAt: row.delivery_out_at || null,
    deliveredAt: row.delivered_at || null,
    staffId: row.staff_id || null,
    staffName: row.staff_name || '',
    tableId: row.table_id || null,
    notes: row.notes || '',
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at,
    validationStatus: row.validation_status || 'accepted',
    requiresServerValidation: Boolean(row.requires_server_validation),
    syncStatus: 'synced',
    syncAttempts: parseInt(row.sync_attempts) || 0,
    isSynced: 1
  };
}

function mapStaffToLocal(row: any) {
  return {
    id: row.id,
    cloudUserId: row.auth_user_id || null,
    name: row.name,
    role: row.role,
    allowExpress: row.allow_express ? 1 : 0,
    isActive: row.is_active ? 1 : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isSynced: 1
  };
}

function mapTableToLocal(row) {
  return {
    id: row.id,
    number: parseInt(row.number),
    capacity: parseInt(row.capacity) || 2,
    floorSection: row.floor_section || 'Main',
    status: row.status || 'available',
    isSynced: 1
  };
}

function mapInventoryToLocal(row) {
  return {
    id: row.id,
    name: row.name,
    quantity: parseFloat(row.quantity) || 0.00,
    minThreshold: parseFloat(row.min_threshold) || 0.00,
    isSynced: 1
  };
}

function mapSupplierToLocal(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.contact || '',
    isSynced: 1
  };
}

function mapCustomerToLocal(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    birthday: row.birthday || '',
    totalSpent: parseFloat(row.total_spent) || 0.00,
    visitCount: parseInt(row.visit_count) || 0,
    loyaltyPoints: parseInt(row.loyalty_points) || 0,
    tier: row.tier || 'bronze',
    lastVisit: row.last_visit || null,
    createdAt: row.created_at,
    isSynced: 1
  };
}

function mapShiftToLocal(row) {
  return {
    id: row.id,
    staffId: parseInt(row.staff_id),
    clockIn: row.clock_in || '',
    clockOut: row.clock_out || '',
    date: row.date || '',
    isSynced: 1
  };
}

function mapRecipeToLocal(row) {
  return {
    id: row.id,
    menuItemId: row.menu_item_id,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    isSynced: 1
  };
}

// ── Cloud Reads (Online-First) ──────────────────────────────────
// Every cloud-owned table is described once, here. A read of that table goes
// to Supabase and lands in IndexedDB; the cache is what a read falls back to
// when the device is offline or the cloud refuses the query. Login hydration
// (`fullPull`) and an individual screen's read therefore share the same fetch
// and the same reconciliation rules — there is no second, drifting copy of
// "how orders are pulled".

/**
 * Run a hydration transaction. Every local write inside `body` is an echo of
 * cloud state, so the sync hooks must not replicate it back to Supabase.
 */
function hydrateTx(stores: any, body: () => Promise<void>) {
  return runWithHydrationGuard(() => db.transaction('rw', stores, body));
}

/**
 * True when the device holds a change to this row that Supabase has not
 * accepted yet — an order cancelled while the sync service was disconnected, a
 * price edited offline, a dish created before a reconnect.
 *
 * The cloud is authoritative for everything *except* those rows: they are the
 * one piece of state the cloud does not have yet, and the push queue is what
 * resolves them. Overwriting one loses a real edit and, worse, tells the
 * operator it was applied — the kitchen's "order cancelled" toast followed by
 * the card reappearing on the next refresh was exactly this.
 */
function hasUnpushedLocalEdit(row: any) {
  if (!row) return false;
  if (row.syncStatus === 'pending' || row.syncStatus === 'error') return true;
  return row.isSynced === 0;
}

/**
 * Replace a local store's contents with the authoritative cloud rows.
 *
 * Deliberately NOT `clear()` + `bulkPut()`: `clear()` fires Dexie's 'deleting'
 * hook for every row, which the sync layer replicates as a cloud DELETE. That
 * raced the re-insert and permanently destroyed menu rows in Supabase. Only
 * rows genuinely absent from the cloud payload are removed, and the hydration
 * guard keeps even those from echoing back.
 */
async function replaceLocalStore(store: any, incoming: any[]) {
  const incomingIds = new Set(incoming.map(row => row.id));
  const staleIds = (await store.toCollection().primaryKeys())
    .filter((id: any) => !incomingIds.has(id));

  if (staleIds.length > 0) {
    // A row missing from the payload is usually one the cloud no longer has —
    // but it is also what a dish created offline looks like, and that one is
    // waiting to be pushed, not deleted.
    const staleRows = await store.bulkGet(staleIds);
    const prunableIds = staleIds.filter((_: any, index: number) => !hasUnpushedLocalEdit(staleRows[index]));
    if (prunableIds.length > 0) {
      await store.bulkDelete(prunableIds);
    }
  }

  const existing = await store.bulkGet(incoming.map(row => row.id));
  const writable = incoming.filter((_, index) => !hasUnpushedLocalEdit(existing[index]));
  await store.bulkPut(writable);
}

async function selectStoreRows(client: any, table: string, columns = '*') {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq('store_id', getStoreId());
  if (error) throw error;
  return data || [];
}

/**
 * Returned by `resolveLocalId` for a cloud row that has no local counterpart
 * *and* must not be stored under its cloud id — the local store hands it a
 * fresh key instead. See the orders resource for why that matters.
 */
const ASSIGN_LOCAL_KEY = Symbol('assign-local-key');

/**
 * Hydrate rows whose local primary key is a device-local auto-increment that
 * does not match the cloud id (orders), or whose identity is a natural key the
 * cloud id cannot be matched on across devices (a table's number, an
 * ingredient's name). `resolveLocalId` maps a cloud row onto the local row it
 * already owns so hydration updates it instead of inserting a twin.
 */
async function mergeLocalStore(store: any, incoming: any[], resolveLocalId: (row: any) => Promise<any>) {
  for (const row of incoming) {
    const localId = await resolveLocalId(row);
    if (localId === ASSIGN_LOCAL_KEY) {
      delete row.id;
    } else if (localId !== undefined && localId !== null) {
      row.id = localId;
      // Leave the device's own unpushed change in place; the sync queue owns it
      // until Supabase accepts or refuses it.
      if (hasUnpushedLocalEdit(await store.get(localId))) continue;
    }
    await store.put(row);
  }
}

/** Newest orders a non-kitchen pull keeps locally available for history views. */
const ORDER_PULL_LIMIT = 500;

/**
 * How long a resource that was just read from Supabase is reused before the
 * next read goes back to the network.
 *
 * Small enough that a screen shows the store's live state, large enough that
 * one screen's cascade of reads (categories, then items, then items per
 * category) costs a single query per table.
 */
const READ_FRESHNESS_MS = 3000;

interface CloudResource {
  /** Supabase table this resource reads. */
  table: string;
  /** Fetch the authoritative rows. Throws on a Supabase error. */
  fetch(client: any, options: any): Promise<any[]>;
  /** Write the fetched rows into the local cache. Returns the row count. */
  hydrate(rows: any[]): Promise<number>;
}

const CLOUD_RESOURCE_MAP: Record<string, CloudResource> = {
  categories: {
    table: 'menu_categories',
    fetch: (client) => selectStoreRows(client, 'menu_categories'),
    hydrate: async (rows) => {
      const local = rows.map(mapCategoryToLocal);
      await hydrateTx(db.menuCategories, () => replaceLocalStore(db.menuCategories, local));
      return local.length;
    }
  },

  items: {
    table: 'menu_items',
    fetch: (client) => selectStoreRows(client, 'menu_items'),
    hydrate: async (rows) => {
      const local = await preserveLocalItemImages(rows.map(mapItemToLocal));
      await hydrateTx(db.menuItems, () => replaceLocalStore(db.menuItems, local));
      return local.length;
    }
  },

  addons: {
    table: 'menu_item_addons',
    fetch: (client) => selectStoreRows(client, 'menu_item_addons'),
    hydrate: async (rows) => {
      const local = rows.map(mapAddonToLocal);
      await hydrateTx(db.menuItemAddons, () => replaceLocalStore(db.menuItemAddons, local));
      return local.length;
    }
  },

  staff: {
    table: 'staff',
    fetch: (client) => selectStoreRows(
      client,
      'staff',
      'id, auth_user_id, name, role, allow_express, is_active, created_at, updated_at'
    ),
    hydrate: async (rows) => {
      const local = rows.map(mapStaffToLocal);
      await hydrateTx(db.staff, async () => {
        const localStaffList = await db.staff.toArray();
        const incomingIds = new Set(local.map(s => s.id));

        for (const existing of localStaffList) {
          if (!incomingIds.has(existing.id)) {
            await db.staff.delete(existing.id);
          }
        }

        for (const s of local) {
          let existing = null;
          if (s.cloudUserId) {
            existing = await db.staff.where('cloudUserId').equals(s.cloudUserId).first();
          }
          if (!existing) {
            existing = await db.staff.where('name').equals(s.name).first();
          }
          if (!existing) {
            existing = await db.staff.get(s.id);
          }

          if (existing && existing.id !== s.id) {
            await db.staff.delete(existing.id);
          }
          await db.staff.put(s);
        }
      });
      return local.length;
    }
  },

  orders: {
    table: 'orders',
    // Temporary staff only ever see the live kitchen board, so they pull the
    // active tickets rather than the store's trading history.
    fetch: async (client, options) => {
      let query = client.from('orders').select('*').eq('store_id', getStoreId());
      if (options?.role === 'temporary_staff') {
        query = query.in('status', ['confirmed', 'preparing', 'ready']);
      } else {
        query = query.order('created_at', { ascending: false }).limit(ORDER_PULL_LIMIT);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    hydrate: async (rows) => {
      const local = rows.map(mapOrderToLocal);
      // Orders are NOT pruned against the payload: an order created on this
      // device and not yet accepted by the cloud is absent from it, and must
      // survive a hydration so it can still be pushed.
      await hydrateTx(db.orders, () => mergeLocalStore(db.orders, local, async (row) => {
        const existing = await db.orders.where('clientOrderId').equals(row.clientOrderId).first();
        if (existing) return existing.id; // preserve the local auto-increment key

        // A cloud order this device has never seen still carries a cloud id, and
        // that number can already belong to an unrelated order created offline
        // here. Storing it under the cloud id would overwrite that order — a
        // real ticket, with a real payment on it — so the incoming row takes a
        // fresh local key. Its cloud identity lives in serverOrderId.
        const collision = await db.orders.get(row.id);
        return collision ? ASSIGN_LOCAL_KEY : row.id;
      }));
      return local.length;
    }
  },

  tables: {
    table: 'tables',
    fetch: (client) => selectStoreRows(client, 'tables'),
    hydrate: async (rows) => {
      const local = rows.map(mapTableToLocal);
      const store = db.table('tables');
      await hydrateTx(store, () => mergeLocalStore(
        store,
        local,
        async (row) => (await store.where('number').equals(row.number).first())?.id
      ));
      return local.length;
    }
  },

  inventory: {
    table: 'inventory',
    fetch: (client) => selectStoreRows(client, 'inventory'),
    hydrate: async (rows) => {
      const local = rows.map(mapInventoryToLocal);
      await hydrateTx(db.inventory, () => mergeLocalStore(
        db.inventory,
        local,
        async (row) => (await db.inventory.where('name').equals(row.name).first())?.id
      ));
      return local.length;
    }
  },

  suppliers: {
    table: 'suppliers',
    fetch: (client) => selectStoreRows(client, 'suppliers'),
    hydrate: async (rows) => {
      const local = rows.map(mapSupplierToLocal);
      await hydrateTx(db.suppliers, () => mergeLocalStore(
        db.suppliers,
        local,
        async (row) => (await db.suppliers.where('name').equals(row.name).first())?.id
      ));
      return local.length;
    }
  },

  customers: {
    table: 'customers',
    fetch: (client) => selectStoreRows(client, 'customers'),
    hydrate: async (rows) => {
      const local = rows.map(mapCustomerToLocal);
      await hydrateTx(db.customers, () => mergeLocalStore(
        db.customers,
        local,
        async (row) => (await db.customers.where('phone').equals(row.phone).first())?.id
      ));
      return local.length;
    }
  },

  shifts: {
    table: 'shifts',
    fetch: (client) => selectStoreRows(client, 'shifts'),
    hydrate: async (rows) => {
      const local = rows.map(mapShiftToLocal);
      await hydrateTx(db.shifts, () => mergeLocalStore(
        db.shifts,
        local,
        async (row) => (await db.shifts
          .where('date')
          .equals(row.date)
          .and((s: any) => s.staffId === row.staffId)
          .first())?.id
      ));
      return local.length;
    }
  },

  recipes: {
    table: 'recipes',
    fetch: (client) => selectStoreRows(client, 'recipes'),
    hydrate: async (rows) => {
      const local = rows.map(mapRecipeToLocal);
      await hydrateTx(db.recipes, () => mergeLocalStore(
        db.recipes,
        local,
        async (row) => (await db.recipes.where('menuItemId').equals(row.menuItemId).first())?.id
      ));
      return local.length;
    }
  }
};

const freshness = createFreshnessTracker({ ttlMs: READ_FRESHNESS_MS });

/** Row counts from the most recent successful pull, for diagnostics/logging. */
const lastPullCounts: Record<string, number> = {};

/** Every cloud-owned resource a full-access role may read. */
export const CLOUD_RESOURCES = Object.keys(CLOUD_RESOURCE_MAP);

/** Menu data the anonymous storefront reads. */
export const PUBLIC_RESOURCES = ['categories', 'items', 'addons', 'tables'];

/** The live kitchen board — all a temporary staff account is allowed to read. */
export const KITCHEN_RESOURCES = ['categories', 'items', 'addons', 'staff', 'orders', 'tables'];

async function pullResource(name: string, options: any) {
  const resource = CLOUD_RESOURCE_MAP[name];
  if (!resource) {
    console.warn(`[CloudDB] Unknown cloud resource "${name}".`);
    return false;
  }

  const client = await getClient();
  if (!client) return false;

  try {
    const rows = await resource.fetch(client, options);

    // An empty payload is ambiguous: a table with no rows and a table the
    // current role cannot see through RLS look identical. The fetch itself
    // succeeded, so the read is live — but the cache is left alone rather than
    // wiped on the strength of a payload that may just be invisible to us.
    if (rows.length === 0) {
      lastPullCounts[name] = 0;
      return true;
    }

    lastPullCounts[name] = await resource.hydrate(rows);
    return true;
  } catch (error: any) {
    // A table the schema does not have yet (its migration has not run) is not a
    // failed read — there is simply nothing of it to show. Treating it as a
    // failure would retry it on every single read, forever.
    const message = String(error?.message || error || '').toLowerCase();
    const code = String(error?.code || '');
    if (code === 'PGRST205' || code === '42P01' || message.includes('does not exist') || message.includes('schema cache')) {
      console.warn(`[CloudDB] ${resource.table} is not in the database yet — run the pending migration to enable it.`);
      lastPullCounts[name] = 0;
      return true;
    }
    console.error(`[CloudDB] Failed to read ${resource.table} from cloud:`, error?.message || error);
    return false;
  }
}

export interface EnsureFreshResult {
  /** True when every requested resource now holds live cloud state. */
  ok: boolean;
  /** Resources served from the cloud (or still inside their fresh window). */
  fresh: string[];
  /** Resources that could not be reached; their reads fall back to the cache. */
  stale: string[];
  /** Rows hydrated per resource by the most recent pull. */
  counts: Record<string, number>;
}

/**
 * Bring `resources` up to date from Supabase before they are read locally.
 *
 * This is the entry point for online-first reads: callers await it, then read
 * IndexedDB as they always have. When the cloud is unreachable it resolves
 * quickly with `ok: false` and the caller transparently serves its cache, so
 * the app stays usable offline.
 *
 * Concurrent callers asking for the same resource share one query, and a
 * resource read moments ago is not re-fetched — see `freshness.ts`.
 */
export async function ensureFresh(
  resources: string | string[],
  options: any = {}
): Promise<EnsureFreshResult> {
  const names = (Array.isArray(resources) ? resources : [resources]).filter(Boolean);
  const fresh: string[] = [];
  const stale: string[] = [];
  const counts: Record<string, number> = {};

  await Promise.all(names.map(async (name) => {
    const ok = await freshness.run(name, () => pullResource(name, options), { force: options.force === true });
    (ok ? fresh : stale).push(name);
    if (name in lastPullCounts) counts[name] = lastPullCounts[name];
  }));

  return { ok: stale.length === 0, fresh, stale, counts };
}

/**
 * Drop the freshness window so the next read goes back to Supabase.
 *
 * Used when something happened that the cache cannot be trusted to reflect —
 * a reconnect, or a realtime channel coming back after missing changes.
 */
export function markCloudDataStale(resources?: string | string[]) {
  freshness.markStale(resources);
}

/** True while `resource` is inside its read-freshness window. */
export function isCloudDataFresh(resource: string) {
  return freshness.isFresh(resource);
}

// ── Full Cloud Pull (Hydration) ─────────────────────────────────
// Login and reconnect hydration: pull everything the signed-in role may read,
// so a device opens on the store's real state instead of a stale local seed.

/**
 * Pull all data this role may read from Supabase into IndexedDB.
 *
 * @param {Object} options
 * @param {boolean} options.publicOnly - Only pull menu data (for customer storefront)
 * @param {string} options.role - Signed-in staff role; narrows the pull
 * @returns {Promise<{success: boolean, tables: Object}>}
 */
export async function fullPull(options: any = {}) {
  const { publicOnly = false, role = '' } = options;

  const client = await getClient();
  if (!client) {
    console.warn('[CloudDB] Cannot perform full pull: Supabase unavailable.');
    return { success: false, tables: {} };
  }

  const names = publicOnly
    ? PUBLIC_RESOURCES
    : role === 'temporary_staff'
      ? KITCHEN_RESOURCES
      : CLOUD_RESOURCES;

  console.log(`[CloudDB] Starting full pull from cloud (store: ${getStoreId()}, role: ${role || 'n/a'})...`);

  // `force` so a hydration never settles for a fresh-window hit — a login or a
  // reconnect is exactly when the cache is least trustworthy.
  const result = await ensureFresh(names, { ...options, force: true });

  if (result.stale.length > 0) {
    console.warn(`[CloudDB] Full pull could not refresh: ${result.stale.join(', ')}.`);
  }

  // A pull that reached nothing at all is a failed pull: callers use this to
  // decide whether to re-render from the cache or leave the screen as it is.
  const success = result.fresh.length > 0;
  console.log(`[CloudDB] ${success ? '✅' : '⚠️'} Full pull complete. Results:`, result.counts);
  return { success, tables: result.counts };
}

// ── Flush Offline Queue ─────────────────────────────────────────
/**
 * Flush all queued offline writes to Supabase.
 * Called automatically when the app reconnects to the network.
 */
export async function flushOfflineQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const client = await getClient();
  if (!client) {
    console.warn('[CloudDB] Cannot flush offline queue: Supabase unavailable.');
    return;
  }

  console.log(`[CloudDB] Flushing ${queue.length} offline writes...`);
  const failed = [];

  for (const entry of queue) {
    try {
      if (entry.action === 'upsert') {
        const { error } = await client.from(entry.table).upsert(entry.data, entry.options || {});
        if (error) throw error;
      } else if (entry.action === 'update') {
        const { error } = await client.from(entry.table).update(entry.data).eq('id', entry.id);
        if (error) throw error;
      } else if (entry.action === 'delete') {
        const { error } = await client.from(entry.table).delete().eq('id', entry.id);
        if (error) throw error;
      }
      console.log(`[CloudDB] Flushed: ${entry.action} on ${entry.table}`);
    } catch (err) {
      console.error(`[CloudDB] Failed to flush: ${entry.action} on ${entry.table}:`, err);
      // Discard permanent database errors (like RLS/Permission violation) to avoid infinite sync retries
      const isPermanentError = err.code === '42501' || err.status === 401 || err.status === 403 || String(err.message || '').includes('row-level security');
      if (!isPermanentError) {
        failed.push(entry);
      } else {
        console.warn(`[CloudDB] Permanent failure: Discarding ${entry.action} on ${entry.table} from sync queue due to permission constraints.`);
      }
    }
  }

  if (failed.length > 0) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
    console.warn(`[CloudDB] ${failed.length} offline writes still pending.`);
  } else {
    clearOfflineQueue();
    console.log('[CloudDB] ✅ All offline writes flushed successfully.');
  }
}

// ── Cloud-First Write Helpers ───────────────────────────────────

/**
 * Write to Supabase first, then update local IndexedDB cache.
 * If offline, write to IndexedDB and queue for later cloud flush.
 */
export async function cloudUpsert(tableName: string, localStoreName: string, remoteData: any, localData: any, options: any = {}) {
  // Always write to local cache immediately (optimistic update)
  try {
    await db[localStoreName].put(localData);
  } catch (err) {
    console.error(`[CloudDB] Local cache write failed for ${localStoreName}:`, err);
  }

  // Attempt cloud write
  const client = await getClient();
  if (client) {
    try {
      const { error } = await client.from(tableName).upsert(remoteData, options);
      if (error) throw error;
      // Mark as synced
      await db[localStoreName].update(localData.id, { isSynced: 1 });
      return { success: true, offline: false };
    } catch (err) {
      console.error(`[CloudDB] Cloud upsert failed for ${tableName}:`, err);
      await db[localStoreName].update(localData.id, { isSynced: 0 });
      pushToOfflineQueue({ action: 'upsert', table: tableName, data: remoteData, options });
      return { success: false, offline: false, error: err };
    }
  } else {
    // Offline — queue for later
    await db[localStoreName].update(localData.id, { isSynced: 0 });
    pushToOfflineQueue({ action: 'upsert', table: tableName, data: remoteData, options });
    return { success: true, offline: true };
  }
}

/**
 * Update specific fields in Supabase first, then local cache.
 */
export async function cloudUpdate(tableName: string, localStoreName: string, id: any, remoteFields: any, localFields: any) {
  // Optimistic local update
  try {
    await db[localStoreName].update(id, { ...localFields, isSynced: 0 });
  } catch (err) {
    console.error(`[CloudDB] Local cache update failed for ${localStoreName}:`, err);
  }

  const client = await getClient();
  if (client) {
    try {
      const { error } = await client.from(tableName).update(remoteFields).eq('id', id);
      if (error) throw error;
      await db[localStoreName].update(id, { isSynced: 1 });
      return { success: true, offline: false };
    } catch (err) {
      console.error(`[CloudDB] Cloud update failed for ${tableName} id=${id}:`, err);
      pushToOfflineQueue({ action: 'update', table: tableName, id, data: remoteFields });
      return { success: false, offline: false, error: err };
    }
  } else {
    pushToOfflineQueue({ action: 'update', table: tableName, id, data: remoteFields });
    return { success: true, offline: true };
  }
}

/**
 * Check whether Supabase has data for this store.
 * Used by seed.js to skip seeding when cloud data exists.
 */
export async function cloudHasData() {
  const client = await getClient();
  if (!client) return false;
  try {
    const { data: categories, error: categoryError } = await client
      .from('menu_categories')
      .select('id')
      .eq('store_id', getStoreId())
      .limit(1);

    if (categoryError) throw categoryError;
    if (!categories?.length) return false;

    const { data: items, error: itemError } = await client
      .from('menu_items')
      .select('id')
      .eq('store_id', getStoreId())
      .limit(1);

    if (itemError) throw itemError;

    if (items && items.length === 0) {
      console.warn('[CloudDB] Cloud categories exist but menu_items is empty. Local fallback seed will keep the storefront usable; run seed-cloud-menu to repair Supabase.');
    }

    return items && items.length > 0;
  } catch (err) {
    console.error('[CloudDB] Failed to check if cloud has data:', err);
    throw err;
  }
}

// ── Network Reconnect Handler ───────────────────────────────────
// Auto-flush offline queue and re-hydrate when connectivity returns
window.addEventListener('online', () => {
  _isOnline = true;
  // Anything read while the device was offline came from the cache, and reads
  // taken during the drop may sit inside a freshness window. Retire all of it
  // so the first read after reconnecting goes to Supabase.
  markCloudDataStale();
  setTimeout(async () => {
    console.log('[CloudDB] Network restored. Flushing offline queue...');
    await flushOfflineQueue();
  }, 2000); // Small delay to let network stabilize
});

export { isCloudAvailable };
