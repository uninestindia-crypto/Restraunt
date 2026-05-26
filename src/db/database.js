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
    console.error(`[Database] Dexie database error in getItemsByCategory(${categoryId}):`, error);
    return [];
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
export async function createOrder(orderData) {
  let result;
  try {
    result = await db.transaction('rw', db.orders, async () => {
      const order = {
        orderNumber: orderData.orderNumber,
        type: orderData.type || 'takeaway',
        status: orderData.status || 'pending',
        items: orderData.items || [],
        subtotal: orderData.subtotal || 0,
        tax: orderData.tax || 0,
        total: orderData.total || 0,
        paymentMethod: orderData.paymentMethod || null,
        paymentStatus: orderData.paymentStatus || 'unpaid',
        customerName: orderData.customerName || '',
        customerPhone: orderData.customerPhone || '',
        notes: orderData.notes || '',
        createdAt: orderData.createdAt || new Date().toISOString(),
        completedAt: orderData.completedAt || null,
        isSynced: 0
      };

      const id = await db.orders.add(order);
      return { ...order, id };
    });
  } catch (error) {
    console.error('[Database] Dexie database error in createOrder transaction:', error);
    throw error; // Re-throw to inform UI of creation failure
  }

  // Replicate to cloud asynchronously in the background
  import('../services/sync.js').then(({ syncService }) => {
    syncService.syncUpOrder(result).catch(err => {
      console.error('[Database] Async syncUpOrder failed:', err);
    });
  }).catch(err => {
    console.error('[Database] Async sync import failed:', err);
  });

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
    const updates = { status, isSynced: 0 };
    if (status === 'completed') {
      updates.completedAt = new Date().toISOString();
    }
    result = await db.orders.update(id, updates);
  } catch (error) {
    console.error(`[Database] Dexie database error in updateOrderStatus(${id}, ${status}):`, error);
    return 0;
  }

  if (result > 0) {
    getOrder(id).then(order => {
      if (order) {
        import('../services/sync.js').then(({ syncService }) => {
          syncService.syncUpOrder(order).catch(err => {
            console.error('[Database] Async syncUpOrder failed on status update:', err);
          });
        }).catch(err => console.error('[Database] Async sync import failed on status update:', err));
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
export async function updatePayment(id, paymentMethod, paymentStatus) {
  let result = 0;
  try {
    result = await db.orders.update(id, { paymentMethod, paymentStatus, isSynced: 0 });
  } catch (error) {
    console.error(`[Database] Dexie database error in updatePayment(${id}):`, error);
    return 0;
  }

  if (result > 0) {
    getOrder(id).then(order => {
      if (order) {
        import('../services/sync.js').then(({ syncService }) => {
          syncService.syncUpOrder(order).catch(err => {
            console.error('[Database] Async syncUpOrder failed on payment update:', err);
          });
        }).catch(err => console.error('[Database] Async sync import failed on payment update:', err));
      }
    }).catch(err => console.error('[Database] Failed to get order for payment sync:', err));
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

    const completedOrders = todayOrders.filter(o =>
      o.paymentStatus === 'paid' || o.status === 'completed'
    );

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
