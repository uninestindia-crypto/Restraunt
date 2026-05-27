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

export const db = new Dexie('TheTastePOS');

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
  staff: '++id, name, role, pinHash, isActive, createdAt',
  shifts: '++id, staffId, date, clockIn, clockOut',
  inventory: '++id, name, unit, quantity, minThreshold, categoryTag',
  suppliers: '++id, name, phone, category',
  recipes: '++id, menuItemId',
  tables: '++id, number, status, floorSection',
  reservations: '++id, tableId, customerId, date, time, status',
  activityLog: '++id, staffId, action, timestamp',
  aiConversations: '++id, createdAt, title',
}).upgrade(async (tx) => {
  try {
    const staffTable = tx.table('staff');
    const staffMembers = await staffTable.toArray();
    for (const s of staffMembers) {
      if (s.pin && s.pin.length !== 64) {
        // Hash the PIN using native Web Crypto SHA-256
        const encoder = new TextEncoder();
        const data = encoder.encode(s.pin.trim());
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        s.pinHash = hashHex;
        delete s.pin;
        await staffTable.put(s);
      }
    }
    console.log('[Database] Dexie schema upgraded to version 3 successfully. Plain-text PINs migrated to SHA-256.');
  } catch (error) {
    console.error('[Database] Failed to migrate staff PINs in version 3 upgrade:', error);
  }
});

// Schema v4: launch ordering fields, delivery workflow, and category availability index.
db.version(4).stores({
  menuCategories: '++id, name, sortOrder, isActive, updatedAt',
  menuItems: '++id, categoryId, [categoryId+isAvailable], name, price, isAvailable, isVeg, sortOrder, updatedAt',
  orders: '++id, orderNumber, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel, source, deliveryStatus, deliveryStaffId, updatedAt, syncStatus',
  settings: 'key',
  customers: '++id, phone, name, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, pinHash, isActive, createdAt',
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

  const staffMembers = await tx.table('staff').toArray();
  for (const staff of staffMembers) {
    if (staff.pin && !staff.pinHash) {
      const encoder = new TextEncoder();
      const data = encoder.encode(staff.pin.trim());
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      await tx.table('staff').update(staff.id, { pinHash: hashHex, pin: undefined, updatedAt: now });
    }
  }
});

// Schema v5: production launch order identity, idempotency, server validation, and sync diagnostics.
db.version(5).stores({
  menuCategories: '++id, name, sortOrder, isActive, updatedAt',
  menuItems: '++id, categoryId, [categoryId+isAvailable], name, price, isAvailable, isVeg, sortOrder, updatedAt',
  orders: '++id, clientOrderId, idempotencyKey, orderNumber, displayToken, type, status, paymentMethod, paymentStatus, createdAt, completedAt, customerId, staffId, tableId, channel, source, deliveryStatus, deliveryStaffId, updatedAt, syncStatus, validationStatus',
  settings: 'key',
  customers: '++id, phone, name, totalSpent, visitCount, loyaltyPoints, tier, lastVisit, createdAt',
  staff: '++id, name, role, pinHash, cloudUserId, isActive, createdAt',
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
  import('../services/sync.js').then(({ syncService }) => {
    syncService.syncUpOrder(order).catch(err => {
      console.error(`[Database] Async syncUpOrder failed on ${context}:`, err);
    });
  }).catch(err => {
    console.error(`[Database] Async sync import failed on ${context}:`, err);
  });
}

/**
 * Get all active categories sorted by sortOrder.
 * @returns {Promise<Array>} Active categories
 */
export async function getCategories() {
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
export async function createOrder(orderData, options = {}) {
  let result;
  try {
    result = await db.transaction('rw', db.orders, async () => {
      const clientOrderId = orderData.clientOrderId || generateLocalUuid();
      const idempotencyKey = orderData.idempotencyKey || clientOrderId;
      const order = {
        clientOrderId,
        idempotencyKey,
        serverOrderId: orderData.serverOrderId || null,
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
        syncStatus: orderData.syncStatus || 'pending',
        syncAttempts: parseInt(orderData.syncAttempts) || 0,
        isSynced: orderData.isSynced ? 1 : 0
      };

      const id = await db.orders.add(order);
      return { ...order, id };
    });
  } catch (error) {
    console.error('[Database] Dexie database error in createOrder transaction:', error);
    throw error; // Re-throw to inform UI of creation failure
  }

  // Replicate to cloud asynchronously in the background
  if (!options.skipSync) {
    syncOrderInBackground(result, 'order creation');
  }

  return result;
}

/**
 * Get orders, optionally filtered by status, sorted by createdAt descending.
 * @param {string} [status] - Optional status filter
 * @returns {Promise<Array>} Orders
 */
export async function getOrders(status) {
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
 * @param {number} id
 * @returns {Promise<Object|undefined>} The order
 */
export async function getOrder(id) {
  try {
    return await db.orders.get(id);
  } catch (error) {
    console.error(`[Database] Dexie database error in getOrder(${id}):`, error);
    return undefined;
  }
}

/**
 * Update the status of an order.
 * @param {number} id
 * @param {string} status
 * @returns {Promise<number>} Number of updated records
 */
export async function updateOrderStatus(id, status) {
  let result = 0;
  try {
    const existing = await db.orders.get(id);
    const updates = {
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
    result = await db.orders.update(id, updates);
  } catch (error) {
    console.error(`[Database] Dexie database error in updateOrderStatus(${id}, ${status}):`, error);
    return 0;
  }

  if (result > 0) {
    getOrder(id).then(order => {
      if (order) {
        syncOrderInBackground(order, 'status update');
      }
    }).catch(err => console.error('[Database] Failed to get order for status sync:', err));
  }

  return result;
}

/**
 * Update payment details of an order.
 * @param {number} id
 * @param {string} paymentMethod
 * @param {string} paymentStatus
 * @returns {Promise<number>} Number of updated records
 */
export async function updatePayment(id, paymentMethod, paymentStatus, metadata = {}) {
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
    getOrder(id).then(order => {
      if (order) {
        syncOrderInBackground(order, 'payment update');
      }
    }).catch(err => console.error('[Database] Failed to get order for payment sync:', err));
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
    getOrder(id).then(order => {
      if (order) syncOrderInBackground(order, 'field update');
    }).catch(err => console.error('[Database] Failed to get order for field sync:', err));
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
