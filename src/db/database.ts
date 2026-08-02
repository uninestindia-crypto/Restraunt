/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Database Schema & Data Access
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import Dexie from 'dexie';

export interface MenuCategory {
  id?: number;
  name: string;
  sortOrder: number;
  isActive: number | boolean;
  updatedAt?: string;
  isSynced?: number;
}

export interface MenuItem {
  id?: number;
  categoryId: number;
  name: string;
  price: number;
  isAvailable: number | boolean;
  isVeg: number | boolean;
  sortOrder: number;
  imageUrl?: string;
  /**
   * Device-local inlined image (data URL). Used when Supabase Storage is not
   * reachable. Deliberately unindexed and never pushed to the cloud, whose
   * `image_url` column is a varchar(500).
   */
  imageData?: string;
  updatedAt?: string;
  isSynced?: number;
}

export interface OrderItem {
  itemId?: number;
  itemName?: string;
  name?: string;
  price: number;
  quantity: number;
  notes?: string;
}

export interface Order {
  id?: number;
  clientOrderId: string;
  idempotencyKey: string;
  orderNumber: string;
  displayToken: string;
  type: 'takeaway' | 'dinein' | 'delivery' | string;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' | string;
  paymentMethod: 'cash' | 'upi' | 'card' | 'pending' | string | null;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'unpaid' | string;
  createdAt: string;
  completedAt?: string | null;
  customerId?: number | null;
  staffId?: number | null;
  tableId?: number | null;
  channel: string;
  source: string;
  deliveryStatus: 'none' | 'pending' | 'assigned' | 'out_for_delivery' | 'delivered' | 'failed' | string;
  deliveryStaffId?: number | null;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed' | string;
  syncAttempts?: number;
  validationStatus: string;
  items: string | OrderItem[];
  subtotal: number;
  tax: number;
  taxPercent?: number;
  deliveryFee?: number;
  total: number;
  serverOrderId?: string | null;
  paymentReference?: string;
  paymentVerifiedAt?: string | null;
  paymentVerifiedBy?: string;
  paymentCollectedAt?: string | null;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryLandmark?: string;
  deliveryNotes?: string;
  deliveryStaffName?: string;
  deliveryAssignedAt?: string | null;
  deliveryOutAt?: string | null;
  deliveredAt?: string | null;
  staffName?: string;
  notes?: string;
  /** Minutes the kitchen expects the order to take; drives the KDS prep timer. */
  estimatedPrepTime?: number;
  /** When the kitchen started cooking; the KDS timer counts up from here. */
  prepStartTime?: string;
  requiresServerValidation?: boolean;
  lastSyncError?: string;
  lastSyncedAt?: string | null;
  lastSyncAttemptAt?: string | null;
  isSynced?: number;
}

export interface Setting {
  key: string;
  value: any;
}

export interface Customer {
  id?: number;
  phone: string;
  name: string;
  authUserId?: string;
  totalSpent: number;
  visitCount: number;
  loyaltyPoints: number;
  tier: string;
  lastVisit?: string;
  createdAt: string;
  isSynced?: number;
}

export interface Staff {
  id?: number;
  name: string;
  role: string;
  cloudUserId?: string;
  isActive: number | boolean;
  createdAt: string;
  allowExpress?: number | boolean;
  isSynced?: number;
}

export interface Shift {
  id?: number;
  staffId: number;
  date: string;
  clockIn: string;
  clockOut?: string;
  isSynced?: number;
}

export interface InventoryItem {
  id?: number;
  name: string;
  unit: string;
  quantity: number;
  minThreshold: number;
  categoryTag?: string;
  isSynced?: number;
}

export interface Supplier {
  id?: number;
  name: string;
  phone: string;
  category?: string;
  isSynced?: number;
}

export interface Recipe {
  id?: number;
  menuItemId: number;
  ingredients?: Array<{ inventoryId: number; name: string; quantity: number }>;
  isSynced?: number;
}

export interface Table {
  id?: number;
  number: number;
  status: string;
  floorSection?: string;
  capacity?: number;
  isSynced?: number;
}

export interface Reservation {
  id?: number;
  tableId: number;
  customerId: number;
  date: string;
  time: string;
  status: string;
  isSynced?: number;
}

export interface ActivityLogEntry {
  id?: number;
  staffId: number;
  action: string;
  timestamp: string;
  isSynced?: number;
}

export interface AIConversation {
  id?: number;
  createdAt: string;
  title: string;
  isSynced?: number;
}

export interface LocalEmbedding {
  id?: number;
  content: string;
  source: string; // 'recipes' | 'faq' | 'suppliers' | 'menu'
  metadata?: any;
  vector: number[];
  isSynced?: number;
}

export class RestaurantDatabase extends Dexie {
  menuCategories!: Dexie.Table<MenuCategory, number>;
  menuItems!: Dexie.Table<MenuItem, number>;
  orders!: Dexie.Table<Order, number>;
  settings!: Dexie.Table<Setting, string>;
  customers!: Dexie.Table<Customer, number>;
  staff!: Dexie.Table<Staff, number>;
  shifts!: Dexie.Table<Shift, number>;
  inventory!: Dexie.Table<InventoryItem, number>;
  suppliers!: Dexie.Table<Supplier, number>;
  recipes!: Dexie.Table<Recipe, number>;
  reservations!: Dexie.Table<Reservation, number>;
  activityLog!: Dexie.Table<ActivityLogEntry, number>;
  aiConversations!: Dexie.Table<AIConversation, number>;
  localEmbeddings!: Dexie.Table<LocalEmbedding, number>;

  constructor() {
    super('TheTastePOS');
  }
}

export const db = new RestaurantDatabase();

// ── Schema v1 (Original) ────────────────────────
db.version(1).stores({
  menuCategories: '++id, name, sortOrder, isActive',
  menuItems: '++id, categoryId, name, price, isAvailable, isVeg, sortOrder',
  orders: '++id, orderNumber, type, status, paymentMethod, paymentStatus, createdAt, completedAt',
  settings: 'key'
});

// ── Schema v2 (Restaurant OS Expansion) ─────────
db.version(2).stores({
  menuCategories: '++id, name, sortOrder, isActive',
  menuItems: '++id, categoryId, name, price, isAvailable, isVeg, sortOrder',
  orders: '++id, orderNumber, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel',
  settings: 'key',
  customers: '++id, phone, name, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, pin, isActive, createdAt',
  shifts: '++id, staffId, date, clockIn, clockOut',
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  suppliers: '++id, name, phone, category',
  recipes: '++id, menuItemId',
  tables: '++id, number, status, floorSection',
  reservations: '++id, tableId, customerId, date, time, status',
  activityLog: '++id, staffId, action, timestamp',
  aiConversations: '++id, createdAt, title',
});

// ── Schema v3 (Cryptographic PIN Security) ──────
db.version(3).stores({
  menuCategories: '++id, name, sortOrder, isActive',
  menuItems: '++id, categoryId, name, price, isAvailable, isVeg, sortOrder',
  orders: '++id, orderNumber, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel',
  settings: 'key',
  customers: '++id, phone, name, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, isActive, createdAt',
  shifts: '++id, staffId, date, clockIn, clockOut',
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  suppliers: '++id, name, phone, category',
  recipes: '++id, menuItemId',
  tables: '++id, number, status, floorSection',
  reservations: '++id, tableId, customerId, date, time, status',
  activityLog: '++id, staffId, action, timestamp',
  aiConversations: '++id, createdAt, title',
}).upgrade(async (tx) => {
  const staffTable = tx.table('staff');
  const staffMembers = await staffTable.toArray();
  for (const staff of staffMembers) {
    delete staff.pin;
    delete staff.pinHash;
    await staffTable.put(staff);
  }
});

// Schema v4: launch ordering fields, delivery workflow, and category availability index.
db.version(4).stores({
  menuCategories: '++id, name, sortOrder, isActive, updatedAt',
  menuItems: '++id, categoryId, [categoryId+isAvailable], name, price, isAvailable, isVeg, sortOrder, updatedAt',
  orders: '++id, orderNumber, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel, source, deliveryStatus, deliveryStaffId, updatedAt, syncStatus',
  settings: 'key',
  customers: '++id, phone, name, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, isActive, createdAt',
  shifts: '++id, staffId, date, clockIn, clockOut',
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  suppliers: '++id, name, phone, category',
  recipes: '++id, menuItemId',
  tables: '++id, number, status, floorSection',
  reservations: '++id, tableId, customerId, date, time, status',
  activityLog: '++id, staffId, action, timestamp',
  aiConversations: '++id, createdAt, title',
}).upgrade(async (tx) => {
  const now = new Date().toISOString();
  const orders = await tx.table('orders').toArray();
  for (const order of orders) {
    await tx.table('orders').update(order.id, {
      channel: order.channel || 'pos',
      source: order.source || order.channel || 'pos',
      deliveryStatus: order.type === 'delivery' ? (order.deliveryStatus || 'pending') : (order.deliveryStatus || 'none'),
      updatedAt: order.updatedAt || now,
      syncStatus: order.syncStatus || (order.isSynced ? 'synced' : 'pending')
    });
  }

});

// Schema v5: production launch order identity, idempotency, server validation, and sync diagnostics.
db.version(5).stores({
  menuCategories: '++id, name, sortOrder, isActive, updatedAt',
  menuItems: '++id, categoryId, [categoryId+isAvailable], name, price, isAvailable, isVeg, sortOrder, updatedAt',
  orders: '++id, clientOrderId, idempotencyKey, orderNumber, displayToken, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel, source, deliveryStatus, deliveryStaffId, updatedAt, syncStatus, validationStatus',
  settings: 'key',
  customers: '++id, phone, name, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, cloudUserId, isActive, createdAt',
  shifts: '++id, staffId, date, clockIn, clockOut',
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  suppliers: '++id, name, phone, category',
  recipes: '++id, menuItemId',
  tables: '++id, number, status, floorSection',
  reservations: '++id, tableId, customerId, date, time, status',
  activityLog: '++id, staffId, action, timestamp',
  aiConversations: '++id, createdAt, title',
}).upgrade(async (tx) => {
  const now = new Date().toISOString();
  const orders = await tx.table('orders').toArray();
  for (const order of orders) {
    const clientOrderId = order.clientOrderId || generateLocalUuid();
    await tx.table('orders').update(order.id, {
      clientOrderId,
      idempotencyKey: order.idempotencyKey || clientOrderId,
      displayToken: order.displayToken || String(order.orderNumber || order.id || '').split('-').pop(),
      requiresServerValidation: Boolean(order.requiresServerValidation),
      validationStatus: order.validationStatus || (order.source === 'online' || order.source === 'qr' ? 'pending' : 'trusted_staff'),
      syncStatus: order.syncStatus || (order.isSynced ? 'synced' : 'pending'),
      syncAttempts: parseInt(order.syncAttempts) || 0,
      updatedAt: order.updatedAt || now
    });
  }
});

// Schema v6: customer auth and menu item image URL support
db.version(6).stores({
  menuCategories: '++id, name, sortOrder, isActive, updatedAt',
  menuItems: '++id, categoryId, [categoryId+isAvailable], name, price, isAvailable, isVeg, sortOrder, imageUrl, updatedAt',
  orders: '++id, clientOrderId, idempotencyKey, orderNumber, displayToken, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel, source, deliveryStatus, deliveryStaffId, updatedAt, syncStatus, validationStatus',
  settings: 'key',
  customers: '++id, phone, name, authUserId, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, cloudUserId, isActive, createdAt',
  shifts: '++id, staffId, date, clockIn, clockOut',
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  suppliers: '++id, name, phone, category',
  recipes: '++id, menuItemId',
  tables: '++id, number, status, floorSection',
  reservations: '++id, tableId, customerId, date, time, status',
  activityLog: '++id, staffId, action, timestamp',
  aiConversations: '++id, createdAt, title',
}).upgrade(async (tx) => {
  // Safe migration
});

// Schema v7: Local RAG Vector Embedding Support
db.version(7).stores({
  menuCategories: '++id, name, sortOrder, isActive, updatedAt',
  menuItems: '++id, categoryId, [categoryId+isAvailable], name, price, isAvailable, isVeg, sortOrder, imageUrl, updatedAt',
  orders: '++id, clientOrderId, idempotencyKey, orderNumber, displayToken, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel, source, deliveryStatus, deliveryStaffId, updatedAt, syncStatus, validationStatus',
  settings: 'key',
  customers: '++id, phone, name, authUserId, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, cloudUserId, isActive, createdAt',
  shifts: '++id, staffId, date, clockIn, clockOut',
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  suppliers: '++id, name, phone, category',
  recipes: '++id, menuItemId',
  tables: '++id, number, status, floorSection',
  reservations: '++id, tableId, customerId, date, time, status',
  activityLog: '++id, staffId, action, timestamp',
  aiConversations: '++id, createdAt, title',
  localEmbeddings: '++id, source',
});

// Schema v8: retire all local staff credentials. Staff authorization is cloud-only.
db.version(8).stores({
  menuCategories: '++id, name, sortOrder, isActive, updatedAt',
  menuItems: '++id, categoryId, [categoryId+isAvailable], name, price, isAvailable, isVeg, sortOrder, imageUrl, updatedAt',
  orders: '++id, clientOrderId, idempotencyKey, orderNumber, displayToken, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel, source, deliveryStatus, deliveryStaffId, updatedAt, syncStatus, validationStatus',
  settings: 'key',
  customers: '++id, phone, name, authUserId, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, cloudUserId, isActive, createdAt',
  shifts: '++id, staffId, date, clockIn, clockOut',
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  suppliers: '++id, name, phone, category',
  recipes: '++id, menuItemId',
  tables: '++id, number, status, floorSection',
  reservations: '++id, tableId, customerId, date, time, status',
  activityLog: '++id, staffId, action, timestamp',
  aiConversations: '++id, createdAt, title',
  localEmbeddings: '++id, source',
}).upgrade(async (tx) => {
  const staffMembers = await tx.table('staff').toArray();
  for (const staff of staffMembers) {
    delete staff.pin;
    delete staff.pinHash;
    await tx.table('staff').put(staff);
  }
  await tx.table('settings').bulkDelete(['adminPin', 'adminPinHash', 'requirePinForOrder']);
});


function normalizeOrderItems(items) {
  if (Array.isArray(items)) return items;
  if (typeof items !== 'string' || !items.trim()) return [];
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[Database] Failed to parse order items:', error);
    return [];
  }
}

function serializeOrderItems(items) {
  return JSON.stringify(normalizeOrderItems(items));
}

export function generateLocalUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function getDisplayToken(orderNumber, fallback = '') {
  const token = String(orderNumber || fallback || '').split('-').pop();
  return token || String(Math.floor(1000 + Math.random() * 9000));
}

function syncOrderInBackground(order, context = 'order update') {
  import('../services/sync').then(({ syncService }) => {
    syncService.syncUpOrder(order).catch(err => {
      console.error(`[Database] Async syncUpOrder failed on ${context}:`, err);
    });
  }).catch(err => {
    console.error(`[Database] Async sync import failed on ${context}:`, err);
  });
}

/**
 * Bring cloud-owned tables up to date before reading them locally.
 *
 * This is what makes the read path online-first rather than cache-first: the
 * local store is a fallback for when Supabase cannot be reached, not the
 * primary source. A failure here is never fatal — the read that follows simply
 * serves the last known rows, which is how the app keeps working offline.
 *
 * The cloud layer collapses concurrent and repeated calls into a single query
 * per table (see services/freshness.ts), so callers are free to ask on every
 * read without worrying about round trips.
 */
async function refreshFromCloud(resources: string[], options: any = {}) {
  try {
    const { ensureFresh } = await import('../services/cloudDb');
    return await ensureFresh(resources, options);
  } catch (error) {
    console.warn(`[Database] Cloud read unavailable for ${resources.join(', ')}; serving cached rows:`, error);
    return { ok: false, fresh: [], stale: resources, counts: {} };
  }
}

/**
 * Get all active categories sorted by sortOrder.
 *
 * Reads live from Supabase; the local cache answers only when the cloud is
 * unreachable.
 *
 * @returns {Promise<Array>} Active categories
 */
export async function getCategories() {
  await refreshFromCloud(['categories']);

  try {
    return await db.menuCategories
      .where('isActive')
      .equals(1)
      .sortBy('sortOrder');
  } catch (error) {
    console.error('[Database] Dexie database error in getCategories:', error);
    return [];
  }
}

/**
 * Get available menu items for a specific category.
 * @param {number} categoryId
 * @returns {Promise<Array>} Available items in the category
 */
export async function getItemsByCategory(categoryId) {
  await refreshFromCloud(['items']);

  try {
    return await db.menuItems
      .where('[categoryId+isAvailable]')
      .equals([categoryId, 1])
      .sortBy('sortOrder');
  } catch (error) {
    console.warn(`[Database] Compound category index unavailable; using fallback for category ${categoryId}:`, error);
    try {
      const items = await db.menuItems
        .where('categoryId')
        .equals(categoryId)
        .toArray();
      return items
        .filter(item => item.isAvailable === 1 || item.isAvailable === true)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    } catch (fallbackError) {
      console.error(`[Database] Dexie database error in getItemsByCategory(${categoryId}):`, fallbackError);
      return [];
    }
  }
}

/**
 * Get all available menu items.
 * @returns {Promise<Array>} All available items
 */
export async function getAllItems() {
  await refreshFromCloud(['items']);

  try {
    return await db.menuItems
      .where('isAvailable')
      .equals(1)
      .sortBy('sortOrder');
  } catch (error) {
    console.error('[Database] Dexie database error in getAllItems:', error);
    return [];
  }
}

/**
 * Case-insensitive search on item name.
 * @param {string} query - Search query
 * @returns {Promise<Array>} Matching items
 */
export async function searchItems(query) {
  try {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return [];

    await refreshFromCloud(['items']);

    const allItems = await db.menuItems
      .where('isAvailable')
      .equals(1)
      .toArray();

    return allItems.filter(item =>
      item.name.toLowerCase().includes(lowerQuery)
    );
  } catch (error) {
    console.error(`[Database] Dexie database error in searchItems("${query}"):`, error);
    return [];
  }
}

/**
 * Create a new order with items.
 * @param {Object} orderData - Order data including items array
 * @returns {Promise<Object>} The created order with id
 */
export async function createOrder(orderData: any, options: any = {}) {
  const clientOrderId = orderData.clientOrderId || generateLocalUuid();
  const idempotencyKey = orderData.idempotencyKey || clientOrderId;

  let serverOrderId = null;
  let isSynced = 0;
  let syncStatus = 'pending';

  // Force cloud write first if not skipped (e.g. not cloud pull / seeding)
  if (!options.skipSync) {
    if (navigator.onLine) {
      try {
        const { getSupabaseClient } = await import('../services/supabaseClient');
        const supabase = await getSupabaseClient();
        if (!supabase) {
          throw new Error('Supabase client is not configured.');
        }

        const { mapOrderToRemote } = await import('../services/sync');
        const remoteOrder = mapOrderToRemote({
          ...orderData,
          clientOrderId,
          idempotencyKey
        });

        const storeId = localStorage.getItem('store_id') || 'the-taste';

        // The lockout below measures the order against cloud stock, so the
        // recipes it multiplies out must be the cloud's too — an outdated local
        // recipe silently checks the wrong ingredients.
        await refreshFromCloud(['recipes']);

        // ── Cloud Inventory Lockout Check ──
        const { data: dbInventory, error: invError } = await supabase
          .from('inventory')
          .select('id, name, quantity, min_threshold')
          .eq('store_id', storeId);

        if (!invError && dbInventory) {
          const itemsToCheck = Array.isArray(orderData.items) ? orderData.items : [];
          for (const item of itemsToCheck) {
            let recipeFound = false;
            if (item.itemId !== undefined && item.itemId !== null) {
              const recipes = await db.recipes.where('menuItemId').equals(item.itemId).toArray();
              if (recipes.length > 0) {
                recipeFound = true;
                for (const recipe of recipes) {
                  for (const ingredient of recipe.ingredients || []) {
                    const invItem = dbInventory.find(i => i.id === ingredient.inventoryId);
                    if (invItem) {
                      const required = (ingredient.quantity || 0) * (item.quantity || 1);
                      if (invItem.quantity < required) {
                        throw new Error(`Out of stock: Ingredient "${invItem.name}" has only ${invItem.quantity} units remaining.`);
                      }
                    }
                  }
                }
              }
            }
            if (!recipeFound) {
              const nameToMatch = item.itemName || item.name;
              const match = dbInventory.find(inv => {
                const na = (inv.name || '').toLowerCase().trim().replace(/\s+/g, ' ');
                const nb = (nameToMatch || '').toLowerCase().trim().replace(/\s+/g, ' ');
                return na && nb && (na.includes(nb) || nb.includes(na));
              });
              if (match) {
                const required = item.quantity || 1;
                if (match.quantity < required) {
                  throw new Error(`Out of stock: "${match.name}" has only ${match.quantity} units remaining.`);
                }
              }
            }
          }
        }

        const { data, error } = await supabase
          .from('orders')
          .insert(remoteOrder)
          .select('id')
          .single();

        if (error) {
          throw new Error(error.message);
        }

        if (data) {
          serverOrderId = data.id;
          isSynced = 1;
          syncStatus = 'synced';
        }
      } catch (cloudErr) {
        console.error('[Database] Direct cloud write failed for order:', cloudErr);
        throw new Error(`Checkout Aborted: Direct cloud write failed to ensure data safety. Connection error or RLS policy violation. Details: ${cloudErr.message}`);
      }
    } else {
      throw new Error('Checkout Aborted: Device is offline. An active internet connection is required to process and secure orders in the cloud.');
    }
  } else {
    // If skipping sync (e.g. seeding / cloud pull), preserve incoming values
    serverOrderId = orderData.serverOrderId || null;
    isSynced = orderData.isSynced ? 1 : 0;
    syncStatus = orderData.syncStatus || 'synced';
  }

  let result;
  try {
    result = await db.transaction('rw', db.orders, async () => {
      const order = {
        clientOrderId,
        idempotencyKey,
        serverOrderId,
        orderNumber: orderData.orderNumber,
        displayToken: orderData.displayToken || getDisplayToken(orderData.orderNumber, idempotencyKey),
        type: orderData.type || 'takeaway',
        status: orderData.status || 'pending',
        channel: orderData.channel || (orderData.source === 'online' ? 'online' : 'pos'),
        source: orderData.source || orderData.channel || 'pos',
        items: serializeOrderItems(orderData.items || []),
        subtotal: orderData.subtotal || 0,
        tax: orderData.tax || 0,
        taxPercent: orderData.taxPercent || 0,
        deliveryFee: orderData.deliveryFee || 0,
        total: orderData.total || 0,
        paymentMethod: orderData.paymentMethod || null,
        paymentStatus: orderData.paymentStatus || 'unpaid',
        paymentReference: orderData.paymentReference || '',
        paymentVerifiedAt: orderData.paymentVerifiedAt || null,
        paymentVerifiedBy: orderData.paymentVerifiedBy || '',
        paymentCollectedAt: orderData.paymentCollectedAt || null,
        customerName: orderData.customerName || '',
        customerPhone: orderData.customerPhone || '',
        deliveryAddress: orderData.deliveryAddress || '',
        deliveryLandmark: orderData.deliveryLandmark || '',
        deliveryNotes: orderData.deliveryNotes || '',
        deliveryStatus: orderData.deliveryStatus || (orderData.type === 'delivery' ? 'pending' : 'none'),
        deliveryStaffId: orderData.deliveryStaffId || null,
        deliveryStaffName: orderData.deliveryStaffName || '',
        deliveryAssignedAt: orderData.deliveryAssignedAt || null,
        deliveryOutAt: orderData.deliveryOutAt || null,
        deliveredAt: orderData.deliveredAt || null,
        staffId: orderData.staffId || null,
        staffName: orderData.staffName || '',
        tableId: orderData.tableId || null,
        notes: orderData.notes || '',
        createdAt: orderData.createdAt || new Date().toISOString(),
        completedAt: orderData.completedAt || null,
        updatedAt: orderData.updatedAt || new Date().toISOString(),
        requiresServerValidation: Boolean(orderData.requiresServerValidation),
        validationStatus: orderData.validationStatus || ((orderData.source === 'online' || orderData.source === 'qr') ? 'pending' : 'trusted_staff'),
        lastSyncError: orderData.lastSyncError || '',
        syncStatus,
        syncAttempts: parseInt(orderData.syncAttempts) || 0,
        isSynced
      };

      const id = await db.orders.add(order);
      return { ...order, id };
    });
  } catch (error) {
    console.error('[Database] Dexie database error in createOrder transaction:', error);
    throw error;
  }

  return result;
}

/**
 * Get orders, optionally filtered by status, sorted by createdAt descending.
 *
 * Always reads the store's live orders from Supabase first, so a device shows
 * what the store actually has rather than what this browser last cached; the
 * local cache answers only when the cloud is unreachable.
 *
 * @param {string} [status] - Optional status filter
 * @param {boolean} [forceRefresh] - Bypass the short read-freshness window, for
 *   callers that must not see even a seconds-old snapshot (a manual refresh, or
 *   a re-read right after a staff action).
 * @returns {Promise<Array>} Orders
 */
export async function getOrders(status, forceRefresh = false) {
  await refreshFromCloud(['orders'], { force: forceRefresh });

  try {
    let collection;

    if (status) {
      collection = db.orders.where('status').equals(status);
    } else {
      collection = db.orders.toCollection();
    }

    const orders = await collection.toArray();
    return orders.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error(`[Database] Dexie database error in getOrders(${status}):`, error);
    return [];
  }
}

/**
 * Get a single order by id.
 * @param {number|string} id
 * @returns {Promise<Object|undefined>} The order
 */
export async function getOrder(id) {
  if (navigator.onLine) {
    try {
      const { getSupabaseClient } = await import('../services/supabaseClient');
      const supabase = await getSupabaseClient({ persistSession: true });
      if (supabase) {
        const storeId = localStorage.getItem('store_id') || 'the-taste';
        let localOrder;
        if (typeof id === 'string') {
          localOrder = await db.orders.where('clientOrderId').equals(id).first();
        } else {
          localOrder = await db.orders.get(id);
        }

        const clientOrderId = localOrder ? localOrder.clientOrderId : (typeof id === 'string' ? id : null);
        if (clientOrderId) {
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('store_id', storeId)
            .eq('client_order_id', clientOrderId)
            .single();
          if (!error && data) {
            const { mapOrderToLocal } = await import('../services/cloudDb');
            const mapped = mapOrderToLocal(data);
            if (localOrder) {
              mapped.id = localOrder.id;
            }
            await db.orders.put(mapped);
          }
        }
      }
    } catch (err) {
      console.warn('[Database] Failed to fetch order from cloud:', err);
    }
  }

  try {
    if (typeof id === 'string') {
      return await db.orders.where('clientOrderId').equals(id).first();
    }
    return await db.orders.get(id);
  } catch (error) {
    console.error(`[Database] Dexie database error in getOrder(${id}):`, error);
    return undefined;
  }
}

export interface OrderStatusUpdateResult {
  /** True when the new status is safe to show as the order's real state. */
  applied: boolean;
  /** True once the cloud has accepted it; false while queued for later sync. */
  synced: boolean;
  /** Set when the server refused the transition — a message fit to show a user. */
  error?: string;
}

/**
 * Update the status of an order, locally and then in the cloud.
 *
 * Order lifecycle rules live in Postgres (see the order status transition
 * trigger), so the server is free to refuse a transition the UI offered —
 * cancelling a paid order, for instance. The local write is optimistic, so a
 * refusal must be rolled back here: leaving it in place makes the KDS hide an
 * order that is still live, until the next hydration silently brings it back.
 *
 * Transient network failures are NOT rolled back; those stay queued so the app
 * keeps working offline.
 *
 * @param extraFields additional order fields to write alongside the status, so
 *   callers never have to bypass this function (and its rollback) to record
 *   something like the kitchen's prep estimate.
 */
export async function updateOrderStatus(
  id,
  status,
  extraFields: Partial<Order> = {}
): Promise<OrderStatusUpdateResult> {
  let result = 0;
  let previous: Partial<Order> | null = null;

  try {
    const existing = await db.orders.get(id);
    if (!existing) {
      return { applied: false, synced: false, error: 'Order not found.' };
    }

    const updates: Partial<Order> = {
      ...extraFields,
      status,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
      isSynced: 0
    };
    if (status === 'completed') {
      updates.completedAt = new Date().toISOString();
    }
    if (existing?.type === 'delivery' && status === 'ready') {
      updates.deliveryStatus = 'ready_for_dispatch';
    }

    // Snapshot exactly the fields this call touches, so a rollback restores the
    // prior state without clobbering concurrent edits to other fields. A field
    // that did not exist before snapshots as undefined, which removes it again.
    previous = {};
    for (const key of Object.keys(updates)) {
      previous[key] = existing[key];
    }

    result = await db.orders.update(id, updates);
  } catch (error) {
    console.error(`[Database] Dexie database error in updateOrderStatus(${id}, ${status}):`, error);
    return { applied: false, synced: false, error: 'Could not update the order locally.' };
  }

  if (result === 0) {
    return { applied: false, synced: false, error: 'Order not found.' };
  }

  try {
    // Read the local row, NOT getOrder(): when online getOrder() is a
    // read-through that overwrites the cache with the server's copy, which
    // would undo the optimistic write above and then push the *stale* status
    // back to the cloud — the change would look like it applied and silently
    // reappear on the next refresh.
    const order = await db.orders.get(id);
    if (!order) {
      return { applied: true, synced: false };
    }

    if (!navigator.onLine) {
      syncOrderInBackground(order, 'status update');
      return { applied: true, synced: false };
    }

    const { syncService } = await import('../services/sync');
    const outcome = await syncService.syncUpOrder(order);

    if (outcome?.rejected) {
      if (previous) {
        await db.orders.update(id, { ...previous, syncStatus: 'synced', isSynced: 1 });
      }
      console.warn(`[Database] Server refused status ${status} for order ${id}; local change rolled back.`);
      return { applied: false, synced: false, error: outcome.error };
    }

    return { applied: true, synced: Boolean(outcome?.success) };
  } catch (err) {
    console.error('[Database] Failed to sync order status update:', err);
    return { applied: true, synced: false };
  }
}

/**
 * Update payment details of an order.
 * @param {number} id
 * @param {string} paymentMethod
 * @param {string} paymentStatus
 * @returns {Promise<number>} Number of updated records
 */
export async function updatePayment(id: number, paymentMethod: string, paymentStatus: string, metadata: any = {}) {
  let result = 0;
  try {
    result = await db.orders.update(id, {
      paymentMethod,
      paymentStatus,
      paymentReference: metadata.paymentReference || '',
      paymentVerifiedAt: metadata.paymentVerifiedAt || (paymentStatus === 'paid' ? new Date().toISOString() : null),
      paymentVerifiedBy: metadata.paymentVerifiedBy || '',
      paymentCollectedAt: metadata.paymentCollectedAt || (paymentStatus === 'paid' ? new Date().toISOString() : null),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
      isSynced: 0
    });
  } catch (error) {
    console.error(`[Database] Dexie database error in updatePayment(${id}):`, error);
    return 0;
  }

  if (result > 0) {
    try {
      // Read the local row, NOT getOrder(): when online getOrder() is a
      // read-through that overwrites the cache with the server's copy, which
      // would undo the payment just recorded and then push the *stale* payment
      // status back to the cloud — the till would show the bill settled while
      // the cloud kept it unpaid.
      const order = await db.orders.get(id);
      if (order) {
        if (navigator.onLine) {
          const { syncService } = await import('../services/sync');
          await syncService.syncUpOrder(order);
        } else {
          syncOrderInBackground(order, 'payment update');
        }
      }
    } catch (err) {
      console.error('[Database] Failed to sync order payment update:', err);
    }
  }

  return result;
}

export async function updateOrderFields(id, fields) {
  let result = 0;
  try {
    const updates = {
      ...fields,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
      isSynced: 0
    };
    result = await db.orders.update(id, updates);
  } catch (error) {
    console.error(`[Database] Dexie database error in updateOrderFields(${id}):`, error);
    return 0;
  }

  if (result > 0) {
    try {
      // Local row only — see updatePayment: a read-through here would replace
      // the fields just written (a delivery assignment, a prep estimate) with
      // the server's older copy and then push that back.
      const order = await db.orders.get(id);
      if (order) {
        if (navigator.onLine) {
          const { syncService } = await import('../services/sync');
          await syncService.syncUpOrder(order);
        } else {
          syncOrderInBackground(order, 'field update');
        }
      }
    } catch (err) {
      console.error('[Database] Failed to sync order fields update:', err);
    }
  }

  return result;
}

/**
 * Get a setting value by key.
 * @param {string} key
 * @returns {Promise<*>} The setting value
 */
export async function getSetting(key) {
  try {
    const record = await db.settings.get(key);
    return record ? record.value : undefined;
  } catch (error) {
    console.error(`[Database] Dexie database error in getSetting(${key}):`, error);
    return undefined;
  }
}

/**
 * Set a setting value.
 * @param {string} key
 * @param {*} value
 * @returns {Promise<string>} The key
 */
export async function setSetting(key, value) {
  try {
    return await db.settings.put({ key, value });
  } catch (error) {
    console.error(`[Database] Dexie database error in setSetting(${key}):`, error);
    throw error;
  }
}

/**
 * Get Supabase configuration settings.
 * @returns {Promise<Object>} { url, key }
 */
export async function getSupabaseConfig() {
  try {
    const url = await getSetting('supabaseUrl');
    const key = await getSetting('supabaseKey');
    return { url, key };
  } catch (error) {
    console.error('[Database] Dexie database error in getSupabaseConfig:', error);
    return { url: undefined, key: undefined };
  }
}

/**
 * Set Supabase configuration settings.
 * @param {string} url
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function setSupabaseConfig(url, key) {
  try {
    await setSetting('supabaseUrl', url);
    await setSetting('supabaseKey', key);
  } catch (error) {
    console.error('[Database] Dexie database error in setSupabaseConfig:', error);
    throw error;
  }
}

/**
 * Get the next sequential order number based on today's date.
 * Format: PREFIX-YYYYMMDD-NNN
 * @returns {Promise<string>} Next order number
 */
export async function getNextOrderNumber() {
  // The sequence is per store, not per till: without the cloud's orders in
  // hand, two devices trading at once both hand out the same number.
  await refreshFromCloud(['orders']);

  try {
    const prefix = (await getSetting('orderNumberPrefix')) || 'TT';

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const todayStart = new Date(year, now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(year, now.getMonth(), now.getDate() + 1).toISOString();

    const todayOrders = await db.orders
      .where('createdAt')
      .between(todayStart, todayEnd)
      .toArray();

    const count = todayOrders.length + 1;
    const countStr = String(count).padStart(3, '0');

    return `${prefix}-${dateStr}-${countStr}`;
  } catch (error) {
    console.error('[Database] Dexie database error in getNextOrderNumber:', error);
    // Return a random suffix in case database fails
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `TT-FALLBACK-${dateStr}-${rand}`;
  }
}

/**
 * Get today's order statistics.
 * @returns {Promise<Object>} { totalOrders, totalRevenue, avgOrderValue, paymentBreakdown }
 */
export async function getTodayStats() {
  // Today's takings are a whole-store figure, so they have to come from the
  // cloud: orders taken on another till are not in this device's cache.
  await refreshFromCloud(['orders']);

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const todayOrders = await db.orders
      .where('createdAt')
      .between(todayStart, todayEnd)
      .toArray();

    const completedOrders = todayOrders.filter(o => o.paymentStatus === 'paid');

    const totalOrders = completedOrders.length;
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const paymentBreakdown = {};
    for (const order of completedOrders) {
      const method = order.paymentMethod || 'unknown';
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { count: 0, total: 0 };
      }
      paymentBreakdown[method].count += 1;
      paymentBreakdown[method].total += order.total || 0;
    }

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue,
      paymentBreakdown
    };
  } catch (error) {
    console.error('[Database] Dexie database error in getTodayStats:', error);
    return {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      paymentBreakdown: {}
    };
  }
}
