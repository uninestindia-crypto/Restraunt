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
 *  Architecture: Cloud-First with Offline Cache
 *  - Online:  All reads/writes go to Supabase FIRST, then cache in IndexedDB
 *  - Offline: Reads from IndexedDB cache, writes queued for flush on reconnect
 *  - Any device that logs in sees the SAME live data instantly
 * ═══════════════════════════════════════════════════
 */

import { db, generateLocalUuid, getDisplayToken } from '../db/database';
import { getSupabaseClient } from './supabaseClient';
import { runWithHydrationGuard } from './hydrationGuard';

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
    // Omitting this used to blank every dish photo on each hydration, because
    // the pull writes whole records back over the local rows.
    imageUrl: row.image_url || '',
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

// ── Full Cloud Pull (Hydration) ─────────────────────────────────
// This is THE key function that solves multi-device data consistency.
// On every login/reconnect, it pulls ALL data from Supabase → IndexedDB.

/**
 * Pull all data from Supabase cloud into IndexedDB.
 * This ensures any device that connects sees the real production data
 * instead of stale local seeds or data from a different device.
 *
 * @param {Object} options
 * @param {boolean} options.publicOnly - Only pull menu data (for customer storefront)
 * @returns {Promise<{success: boolean, tables: Object}>}
 */
/**
 * Run a hydration transaction. Every local write inside `body` is an echo of
 * cloud state, so the sync hooks must not replicate it back to Supabase.
 */
function hydrateTx(stores: any, body: () => Promise<void>) {
  return runWithHydrationGuard(() => db.transaction('rw', stores, body));
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
    await store.bulkDelete(staleIds);
  }
  await store.bulkPut(incoming);
}

export async function fullPull(options: any = {}) {
  const { publicOnly = false, role = '' } = options;
  const client = await getClient();
  if (!client) {
    console.warn('[CloudDB] Cannot perform full pull: Supabase unavailable.');
    return { success: false, tables: {} };
  }

  const storeId = getStoreId();
  const results: any = {};
  const isTempStaff = role === 'temporary_staff';

  try {
    console.log(`[CloudDB] Starting full pull from cloud (store: ${storeId}, role: ${role})...`);

    // 1. Categories (always needed)
    const { data: categories, error: catErr } = await client
      .from('menu_categories')
      .select('*')
      .eq('store_id', storeId);
    if (catErr) {
      console.error('[CloudDB] Failed to fetch menu categories from cloud:', catErr.message || catErr);
    } else if (categories?.length > 0) {
      const localCats = categories.map(mapCategoryToLocal);
      await hydrateTx(db.menuCategories, () => replaceLocalStore(db.menuCategories, localCats));
      results.categories = localCats.length;
      console.log(`[CloudDB] Hydrated ${localCats.length} categories from cloud.`);
    }

    // 2. Menu Items (always needed)
    const { data: items, error: itemErr } = await client
      .from('menu_items')
      .select('*')
      .eq('store_id', storeId);
    if (itemErr) {
      console.error('[CloudDB] Failed to fetch menu items from cloud:', itemErr.message || itemErr);
    } else if (items?.length > 0) {
      const localItems = await preserveLocalItemImages(items.map(mapItemToLocal));
      await hydrateTx(db.menuItems, () => replaceLocalStore(db.menuItems, localItems));
      results.items = localItems.length;
      console.log(`[CloudDB] Hydrated ${localItems.length} menu items from cloud.`);
    }

    // Public storefront only needs menu data
    if (publicOnly) {
      // Also pull tables for QR ordering
      const { data: tables, error: tblErr } = await client
        .from('tables')
        .select('*')
        .eq('store_id', storeId);
      if (tblErr) {
        console.error('[CloudDB] Failed to fetch tables from cloud (publicOnly):', tblErr.message || tblErr);
      } else if (tables?.length > 0) {
        const localTables = tables.map(mapTableToLocal);
        const tableStore = db.table('tables');
        await hydrateTx(tableStore, () => replaceLocalStore(tableStore, localTables));
        results.tables = localTables.length;
      }
      console.log('[CloudDB] Full pull complete (public-only mode).');
      return { success: true, tables: results };
    }

    // 3. Staff
    const { data: staff, error: staffErr } = await client
      .from('staff')
      .select('id, auth_user_id, name, role, allow_express, is_active, created_at, updated_at')
      .eq('store_id', storeId);
    if (staffErr) {
      console.error('[CloudDB] Failed to fetch staff from cloud:', staffErr.message || staffErr);
    } else if (staff?.length > 0) {
      const localStaff = staff.map(mapStaffToLocal);
      await hydrateTx(db.staff, async () => {
        const localStaffList = await db.staff.toArray();
        const incomingIds = new Set(localStaff.map(s => s.id));

        for (const local of localStaffList) {
          if (!incomingIds.has(local.id)) {
            await db.staff.delete(local.id);
          }
        }

        for (const s of localStaff) {
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
      results.staff = localStaff.length;
      console.log(`[CloudDB] Hydrated ${localStaff.length} staff members from cloud.`);
    }

    // 4. Orders (for temporary staff, only pull active kitchen orders; else last 500)
    let orderQuery = client
      .from('orders')
      .select('*')
      .eq('store_id', storeId);

    if (isTempStaff) {
      orderQuery = orderQuery.in('status', ['confirmed', 'preparing', 'ready']);
    } else {
      orderQuery = orderQuery.order('created_at', { ascending: false }).limit(500);
    }

    const { data: orders, error: orderErr } = await orderQuery;
    if (orderErr) {
      console.error('[CloudDB] Failed to fetch orders from cloud:', orderErr.message || orderErr);
    } else if (orders?.length > 0) {
      const localOrders = orders.map(mapOrderToLocal);
      await hydrateTx(db.orders, async () => {
        for (const order of localOrders) {
          const existing = await db.orders.where('clientOrderId').equals(order.clientOrderId).first();
          if (existing) {
            order.id = existing.id; // Preserve local auto-increment key
          }
          await db.orders.put(order);
        }
      });
      results.orders = localOrders.length;
      console.log(`[CloudDB] Hydrated ${localOrders.length} orders from cloud.`);
    }

    // 5. Tables
    const { data: tables, error: tblErr } = await client
      .from('tables')
      .select('*')
      .eq('store_id', storeId);
    if (tblErr) {
      console.error('[CloudDB] Failed to fetch tables from cloud:', tblErr.message || tblErr);
    } else if (tables?.length > 0) {
      const localTables = tables.map(mapTableToLocal);
      const tableStore = db.table('tables');
      await hydrateTx(tableStore, async () => {
        for (const tbl of localTables) {
          const existing = await tableStore.where('number').equals(tbl.number).first();
          if (existing) {
            tbl.id = existing.id;
          }
          await tableStore.put(tbl);
        }
      });
      results.tables = localTables.length;
    }

    if (!isTempStaff) {
      // 6. Inventory
      const { data: inventory, error: invErr } = await client
        .from('inventory')
        .select('*')
        .eq('store_id', storeId);
      if (invErr) {
        console.error('[CloudDB] Failed to fetch inventory from cloud:', invErr.message || invErr);
      } else if (inventory?.length > 0) {
        const localInv = inventory.map(mapInventoryToLocal);
        await hydrateTx(db.inventory, async () => {
          for (const inv of localInv) {
            const existing = await db.inventory.where('name').equals(inv.name).first();
            if (existing) {
              inv.id = existing.id;
            }
            await db.inventory.put(inv);
          }
        });
        results.inventory = localInv.length;
      }

      // 7. Suppliers
      const { data: suppliers, error: supErr } = await client
        .from('suppliers')
        .select('*')
        .eq('store_id', storeId);
      if (supErr) {
        console.error('[CloudDB] Failed to fetch suppliers from cloud:', supErr.message || supErr);
      } else if (suppliers?.length > 0) {
        const localSups = suppliers.map(mapSupplierToLocal);
        await hydrateTx(db.suppliers, async () => {
          for (const sup of localSups) {
            const existing = await db.suppliers.where('name').equals(sup.name).first();
            if (existing) {
              sup.id = existing.id;
            }
            await db.suppliers.put(sup);
          }
        });
        results.suppliers = localSups.length;
      }

      // 8. Customers
      const { data: customers, error: custErr } = await client
        .from('customers')
        .select('*')
        .eq('store_id', storeId);
      if (custErr) {
        console.error('[CloudDB] Failed to fetch customers from cloud:', custErr.message || custErr);
      } else if (customers?.length > 0) {
        const localCusts = customers.map(mapCustomerToLocal);
        await hydrateTx(db.customers, async () => {
          for (const cust of localCusts) {
            const existing = await db.customers.where('phone').equals(cust.phone).first();
            if (existing) {
              cust.id = existing.id;
            }
            await db.customers.put(cust);
          }
        });
        results.customers = localCusts.length;
      }

      // 9. Shifts
      const { data: shifts, error: shiftErr } = await client
        .from('shifts')
        .select('*')
        .eq('store_id', storeId);
      if (shiftErr) {
        console.error('[CloudDB] Failed to fetch shifts from cloud:', shiftErr.message || shiftErr);
      } else if (shifts?.length > 0) {
        const localShifts = shifts.map(mapShiftToLocal);
        await hydrateTx(db.shifts, async () => {
          for (const shift of localShifts) {
            const existing = await db.shifts
              .where('date')
              .equals(shift.date)
              .and(s => s.staffId === shift.staffId)
              .first();
            if (existing) {
              shift.id = existing.id;
            }
            await db.shifts.put(shift);
          }
        });
        results.shifts = localShifts.length;
      }

      // 10. Recipes
      const { data: recipes, error: recipeErr } = await client
        .from('recipes')
        .select('*')
        .eq('store_id', storeId);
      if (recipeErr) {
        console.error('[CloudDB] Failed to fetch recipes from cloud:', recipeErr.message || recipeErr);
      } else if (recipeErr && recipes?.length > 0) {
        const localRecipes = recipes.map(mapRecipeToLocal);
        await hydrateTx(db.recipes, async () => {
          for (const recipe of localRecipes) {
            const existing = await db.recipes
              .where('menuItemId')
              .equals(recipe.menuItemId)
              .first();
            if (existing) {
              recipe.id = existing.id;
            }
            await db.recipes.put(recipe);
          }
        });
        results.recipes = localRecipes.length;
        console.log(`[CloudDB] Hydrated ${localRecipes.length} recipes from cloud.`);
      }
    }

    console.log('[CloudDB] ✅ Full pull complete. Results:', results);
    return { success: true, tables: results };
  } catch (error) {
    console.error('[CloudDB] Full pull failed:', error);
    return { success: false, tables: results };
  }
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
  setTimeout(async () => {
    console.log('[CloudDB] Network restored. Flushing offline queue...');
    await flushOfflineQueue();
  }, 2000); // Small delay to let network stabilize
});

export { isCloudAvailable };
