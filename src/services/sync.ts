/**
 * NextGenOS Sync Service
 */
import { db } from '../db/database';
import { getSupabaseClient, resetSupabaseClient, testSupabaseMenuRead } from './supabaseClient';
import { submitPublicOrder } from './publicOrders';
import { setStaffActiveViaAdminFunction, syncStaffViaAdminFunction } from './staffAdmin';
import { showToast } from '../utils/helpers';
import { orderNotificationService } from './orderNotification';

const DEFAULT_STORE_ID = 'the-taste';

function getStoreId() {
  return localStorage.getItem('store_id') || DEFAULT_STORE_ID;
}

function tableStore() {
  return db.table('tables');
}

function normalizeRemoteItems(items) {
  if (Array.isArray(items)) return items;
  if (typeof items !== 'string' || !items.trim()) return [];
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[Sync] Failed to parse order items for remote sync:', error);
    return [];
  }
}

function isPublicOrder(order) {
  return ['online', 'qr'].includes(order?.source) || ['online', 'qr'].includes(order?.channel);
}

function needsServerValidation(order) {
  return isPublicOrder(order) && order?.validationStatus !== 'accepted';
}

// Table mapping helper functions
function mapCategoryToRemote(cat: any) {
  return {
    id: cat.id,
    store_id: getStoreId(),
    name: cat.name,
    icon: cat.icon || '',
    sort_order: parseInt(cat.sortOrder) || 0,
    is_active: cat.isActive === 1
  };
}

export function mapCategoryToLocal(row: any) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || '',
    sortOrder: parseInt(row.sort_order) || 0,
    isActive: row.is_active ? 1 : 0,
    isSynced: 1
  };
}

function mapItemToRemote(item: any) {
  return {
    id: item.id,
    store_id: getStoreId(),
    category_id: item.categoryId,
    name: item.name,
    price: parseFloat(item.price) || 0,
    is_available: item.isAvailable === 1,
    is_veg: item.isVeg === 1,
    sort_order: parseInt(item.sortOrder) || 0,
    image_url: item.imageUrl || ''
  };
}

export function mapItemToLocal(row: any) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    price: parseFloat(row.price) || 0,
    isAvailable: row.is_available ? 1 : 0,
    isVeg: row.is_veg ? 1 : 0,
    sortOrder: parseInt(row.sort_order) || 0,
    imageUrl: row.image_url || '',
    isSynced: 1
  };
}

export function mapOrderToRemote(order: any) {
  const remote: any = {
    store_id: getStoreId(),
    client_order_id: order.clientOrderId,
    idempotency_key: order.idempotencyKey || order.clientOrderId,
    order_number: order.orderNumber,
    display_token: order.displayToken || String(order.orderNumber || order.id || '').split('-').pop(),
    type: order.type || 'takeaway',
    status: order.status || 'pending',
    channel: order.channel || 'pos',
    source: order.source || order.channel || 'pos',
    items: normalizeRemoteItems(order.items), // array of items, stored as jsonb in Supabase
    subtotal: parseFloat(order.subtotal) || 0,
    tax: parseFloat(order.tax) || 0,
    tax_percent: parseFloat(order.taxPercent) || 0,
    delivery_fee: parseFloat(order.deliveryFee) || 0,
    total: parseFloat(order.total) || 0,
    payment_method: order.paymentMethod || null,
    payment_status: order.paymentStatus || 'unpaid',
    payment_reference: order.paymentReference || '',
    payment_verified_at: order.paymentVerifiedAt || null,
    payment_verified_by: order.paymentVerifiedBy || '',
    payment_collected_at: order.paymentCollectedAt || null,
    customer_name: order.customerName || '',
    customer_phone: order.customerPhone || '',
    delivery_address: order.deliveryAddress || '',
    delivery_landmark: order.deliveryLandmark || '',
    delivery_notes: order.deliveryNotes || '',
    delivery_status: order.deliveryStatus || (order.type === 'delivery' ? 'pending' : 'none'),
    delivery_staff_id: order.deliveryStaffId || null,
    delivery_staff_name: order.deliveryStaffName || '',
    delivery_assigned_at: order.deliveryAssignedAt || null,
    delivery_out_at: order.deliveryOutAt || null,
    delivered_at: order.deliveredAt || null,
    staff_id: order.staffId || null,
    staff_name: order.staffName || '',
    table_id: order.tableId || null,
    notes: order.notes || '',
    created_at: order.createdAt || new Date().toISOString(),
    completed_at: order.completedAt || null,
    updated_at: order.updatedAt || new Date().toISOString(),
    sync_attempts: parseInt(order.syncAttempts) || 0,
    validation_status: order.validationStatus || (isPublicOrder(order) ? 'pending' : 'trusted_staff'),
    requires_server_validation: Boolean(order.requiresServerValidation)
  };
  if (order.serverOrderId) remote.id = order.serverOrderId;
  return remote;
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

function mapStaffToRemote(staff: any) {
  return {
    id: staff.id,
    store_id: getStoreId(),
    auth_user_id: staff.cloudUserId || null,
    name: staff.name,
    role: staff.role,
    pin_hash: staff.pinHash,
    allow_express: staff.allowExpress === 1 || staff.allowExpress === true,
    is_active: staff.isActive === 1 || staff.isActive === true,
    created_at: staff.createdAt || new Date().toISOString(),
    updated_at: staff.updatedAt || new Date().toISOString()
  };
}

function mapStaffToLocal(row: any) {
  return {
    id: row.id,
    cloudUserId: row.auth_user_id || null,
    name: row.name,
    role: row.role,
    pinHash: row.pin_hash,
    allowExpress: row.allow_express ? 1 : 0,
    isActive: row.is_active ? 1 : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isSynced: 1
  };
}

function mapTableToRemote(table) {
  return {
    id: table.id,
    store_id: getStoreId(),
    number: parseInt(table.number),
    capacity: parseInt(table.capacity) || 2,
    floor_section: table.floorSection || 'Main',
    status: table.status || 'available'
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

function mapInventoryToRemote(inv) {
  return {
    id: inv.id,
    store_id: getStoreId(),
    name: inv.name,
    quantity: parseFloat(inv.quantity) || 0.00,
    min_threshold: parseFloat(inv.minThreshold) || 0.00
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

function mapSupplierToRemote(sup) {
  return {
    id: sup.id,
    store_id: getStoreId(),
    name: sup.name,
    contact: sup.phone || sup.contact || ''
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

function mapShiftToRemote(shift) {
  return {
    id: shift.id,
    store_id: getStoreId(),
    staff_id: parseInt(shift.staffId),
    clock_in: shift.clockIn || '',
    clock_out: shift.clockOut || '',
    date: shift.date || ''
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

function mapRecipeToRemote(recipe) {
  return {
    id: recipe.id,
    store_id: getStoreId(),
    menu_item_id: recipe.menuItemId,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : JSON.parse(recipe.ingredients || '[]')
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

function mapActivityToRemote(log) {
  return {
    id: log.id,
    store_id: getStoreId(),
    timestamp: log.timestamp || new Date().toISOString(),
    action: log.action,
    staff_name: log.staffName || 'System',
    details: log.details || ''
  };
}

function mapActivityToLocal(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    action: row.action,
    staffName: row.staff_name || 'System',
    details: row.details || '',
    isSynced: 1
  };
}

export function mapCustomerToRemote(cust) {
  return {
    id: cust.id,
    store_id: getStoreId(),
    auth_user_id: cust.authUserId || null,
    name: cust.name,
    phone: cust.phone,
    birthday: cust.birthday || null,
    total_spent: parseFloat(cust.totalSpent) || 0.00,
    visit_count: parseInt(cust.visitCount) || 0,
    loyalty_points: parseInt(cust.loyaltyPoints) || 0,
    tier: cust.tier || 'bronze',
    last_visit: cust.lastVisit || null,
    created_at: cust.createdAt || new Date().toISOString()
  };
}

export function mapCustomerToLocal(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    authUserId: row.auth_user_id || null,
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

let supabase = null;

/**
 * Exponential backoff helper for network calls.
 * Throws immediately for bad credentials or format errors.
 */
async function retryWithBackoff(fn: any, options: any = {}) {
  const {
    maxRetries = 5,
    initialDelayMs = 1000,
    backoffFactor = 2,
    jitter = true,
    onRetry = null
  } = options;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      
      const errorMessage = error?.message || String(error);
      const isBadCredentials = 
        errorMessage.includes('Invalid API key') ||
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('JWT') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('auth') ||
        errorMessage.includes('invalid URL') ||
        errorMessage.includes('URL is not valid') ||
        errorMessage.includes('Failed to parse URL') ||
        errorMessage.includes('Invalid URL') ||
        errorMessage.toLowerCase().includes('owner') ||
        errorMessage.toLowerCase().includes('permission') ||
        errorMessage.toLowerCase().includes('denied') ||
        errorMessage.toLowerCase().includes('policy') ||
        errorMessage.toLowerCase().includes('forbidden') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('not allowed') ||
        (error?.status >= 400 && error?.status < 500 && error?.status !== 408 && error?.status !== 429);

      if (isBadCredentials) {
        console.warn(`[Sync] Bad credentials or client error detected (${errorMessage}). Skipping retries.`);
        throw error;
      }

      if (attempt > maxRetries) {
        console.error(`[Sync] Max retries reached (${maxRetries}). Final error: ${errorMessage}`);
        throw error;
      }
      
      // Calculate delay with backoff
      let delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      if (jitter) {
        // Jitter +/- 20%
        const jitterRange = delay * 0.2;
        delay = delay + (Math.random() * 2 - 1) * jitterRange;
      }
      
      console.warn(`[Sync] Attempt ${attempt} failed: ${errorMessage}. Retrying in ${Math.round(delay)}ms...`);
      if (onRetry) {
        try {
          onRetry(error, attempt, delay);
        } catch (cbErr) {
          console.error('[Sync] Error in onRetry callback:', cbErr);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

class SyncService {
  isConnected: boolean;
  isOnline: boolean;
  status: string;
  onStatusChangeCallbacks: Function[];
  isSyncingFromServer: boolean;
  channel: any;
  lastFullPullTime: number;

  constructor() {
    this.isConnected = false;
    this.isOnline = navigator.onLine;
    this.status = 'unconfigured'; // 'connected' | 'connecting' | 'unconfigured' | 'offline' | 'error'
    this.onStatusChangeCallbacks = [];
    this.isSyncingFromServer = false;
    this.channel = null;
    this.lastFullPullTime = 0;
  }

  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this.onStatusChangeCallbacks.push(callback);
      // Immediately call with current status
      callback(this.status, this.isConnected, this.isOnline);
    }
  }

  async fullPull(options: any = {}) {
    const force = options.force === true;
    const now = Date.now();
    if (!force && this.lastFullPullTime && (now - this.lastFullPullTime < 15000)) {
      console.log('[Sync] Skipping redundant fullPull (completed within last 15s).');
      return { success: true, skipped: true };
    }

    try {
      const { fullPull } = await import('./cloudDb');
      const result = await fullPull(options);
      if (result && result.success) {
        this.lastFullPullTime = Date.now();
      }
      return result;
    } catch (err) {
      console.error('[Sync] fullPull failed:', err);
      return { success: false, tables: {} };
    }
  }

  triggerStatusChange(status) {
    this.status = status;
    const isConnected = this.isConnected;
    const isOnline = this.isOnline;
    console.log(`[Sync status] Transitioned to: ${status} (online: ${isOnline}, connected: ${isConnected})`);
    this.onStatusChangeCallbacks.forEach(cb => {
      try {
        cb(status, isConnected, isOnline);
      } catch (err) {
        console.error('[Sync] Error in sync status change callback:', err);
      }
    });
  }

  async init() {
    this.isOnline = navigator.onLine;

    // Listen to network status changes
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));

    // Connect to Supabase
    await this.connect();

    // Setup local Dexie hooks to automatically replicate category and item updates
    this.setupLocalHooks();
  }

  async connect() {
    if (this.channel) {
      try {
        await this.channel.unsubscribe();
      } catch (err) {
        console.warn('[Sync] Channel unsubscribe failed:', err);
      }
      this.channel = null;
    }
    resetSupabaseClient();
    supabase = null;
    this.isConnected = false;
    this.triggerStatusChange('connecting');

    if (!this.isOnline) {
      this.triggerStatusChange('offline');
      return;
    }

    supabase = await getSupabaseClient({ persistSession: true });
    if (!supabase) {
      this.triggerStatusChange('unconfigured');
      return;
    }

    // Verify that we have an active cloud staff session
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData || !sessionData.session) {
        console.warn('[Sync] No active cloud session. Sync connection aborted.');
        this.triggerStatusChange('unconfigured');
        return;
      }
    } catch (sessionErr) {
      console.error('[Sync] Error checking cloud session:', sessionErr);
      this.triggerStatusChange('error');
      return;
    }

    try {
      // Perform a lightweight health check query with backoff retries
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('menu_categories').select('id').limit(1);
        if (error) {
          throw error;
        }
      }, {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2,
        onRetry: (err, attempt, delay) => {
          console.warn(`[Sync] Health check failed on attempt ${attempt}. Retrying in ${Math.round(delay)}ms...`);
        }
      });

      this.isConnected = true;
      this.triggerStatusChange('connected');
      console.log('☁️ Supabase cloud synchronization connected successfully');

      // 1. Perform initial push of unsynced local records
      await this.pushUnsynced();

      // 2. Perform a full pull to hydrate the local cache with the latest cloud state
      await this.fullPull();

      // 3. Subscribe to real-time updates
      this.subscribeRealtime();

    } catch (e) {
      console.error('[Sync] Supabase connection verification failed:', e);
      this.isConnected = false;
      
      const errorMessage = e?.message || String(e);
      const isBadCredentials = 
        errorMessage.includes('Invalid API key') ||
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('JWT') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('auth');

      if (isBadCredentials) {
        console.error('❌ Supabase connection failed: Bad credentials or unauthorized API key.');
      }
      this.triggerStatusChange('error');
    }
  }

  async handleNetworkChange(online) {
    this.isOnline = online;
    console.log(`Network connection: ${online ? 'ONLINE' : 'OFFLINE'}`);

    if (online) {
      showToast('Network restored. Reconnecting cloud synchronization...', 'success');
      await this.connect();
    } else {
      showToast('Network offline. Cloud synchronization paused.', 'warning');
      this.isConnected = false;
      if (this.channel) {
        try {
          await this.channel.unsubscribe();
        } catch (e) {}
        this.channel = null;
      }
      this.triggerStatusChange('offline');
    }
  }

  async pushUnsynced() {
    if (!this.isConnected || !supabase) {
      console.warn('[Sync cache] Cannot push unsynced records: disconnected or unconfigured.');
      return;
    }

    try {
      console.log('[Sync cache] Checking for unsynced local records...');

      // 1. Sync Categories
      let unsyncedCategories = [];
      try {
        unsyncedCategories = await db.menuCategories.filter(c => !c.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced categories:', dbErr);
      }

      if (unsyncedCategories.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedCategories.length} unsynced categories in local cache.`);
        const remoteCats = unsyncedCategories.map(mapCategoryToRemote);
        
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('menu_categories').upsert(remoteCats);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.menuCategories, async () => {
              for (const c of unsyncedCategories) {
                await db.menuCategories.update(c.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedCategories.length} categories.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating category sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced categories to cloud after retries:', netErr);
        }
      }

      // 2. Sync Items
      let unsyncedItems = [];
      try {
        unsyncedItems = await db.menuItems.filter(i => !i.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced items:', dbErr);
      }

      if (unsyncedItems.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedItems.length} unsynced items in local cache.`);
        const remoteItems = unsyncedItems.map(mapItemToRemote);
        
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('menu_items').upsert(remoteItems);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.menuItems, async () => {
              for (const i of unsyncedItems) {
                await db.menuItems.update(i.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedItems.length} items.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating item sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced items to cloud after retries:', netErr);
        }
      }

      // 3. Sync Orders
      let unsyncedOrders = [];
      try {
        unsyncedOrders = await db.orders.filter(o => !o.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced orders:', dbErr);
      }

      if (unsyncedOrders.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedOrders.length} unsynced orders in local cache.`);
        const publicOrders = unsyncedOrders.filter(needsServerValidation);
        for (const order of publicOrders) {
          await this.syncUpOrder(order);
        }

        const staffOrders = unsyncedOrders.filter(order => !needsServerValidation(order));
        const remoteOrders = staffOrders.map(mapOrderToRemote);
        
        if (remoteOrders.length > 0) try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('orders').upsert(remoteOrders, { onConflict: 'store_id,client_order_id' });
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.orders, async () => {
              for (const o of staffOrders) {
                await db.orders.update(o.id, {
                  isSynced: 1,
                  validationStatus: o.validationStatus || 'trusted_staff',
                  syncStatus: 'synced',
                  lastSyncedAt: new Date().toISOString()
                });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${staffOrders.length} staff-created orders.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating order sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced orders to cloud after retries:', netErr);
          await db.transaction('rw', db.orders, async () => {
            for (const o of staffOrders) {
              await db.orders.update(o.id, {
                isSynced: 0,
                syncStatus: 'error',
                lastSyncError: netErr?.message || String(netErr),
                syncAttempts: (parseInt(o.syncAttempts) || 0) + 1,
                lastSyncAttemptAt: new Date().toISOString()
              });
            }
          });
        }
      }

      // 4. Sync Staff
      let unsyncedStaff = [];
      try {
        unsyncedStaff = await db.staff.filter(s => !s.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced staff:', dbErr);
      }

      if (unsyncedStaff.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedStaff.length} unsynced staff members in local cache.`);

        for (const staff of unsyncedStaff) {
          let synced = false;

          // Strategy 1: Try staff-admin edge function (works for anon PIN sessions)
          try {
            const result = await retryWithBackoff(async () => {
              const res = await syncStaffViaAdminFunction(staff);
              if (!res.success) throw new Error(res.message || 'Staff admin function failed.');
              return res;
            }, { maxRetries: 2 });
            synced = result?.success === true;
            if (synced) {
              console.log(`[Sync cache] Staff "${staff.name}" synced via edge function.`);
            }
          } catch (edgeFnErr) {
            console.warn(`[Sync net] Edge function failed for staff "${staff.name}":`, edgeFnErr.message);
          }

          // Strategy 2: Fallback to direct upsert (works for authenticated sessions)
          if (!synced && supabase) {
            try {
              const remoteStaff = mapStaffToRemote(staff);
              const { error } = await supabase.from('staff').upsert(remoteStaff);
              if (error) {
                // RLS denial is expected for anon/PIN sessions — don't retry
                const isRlsDenied = error.message?.includes('policy') ||
                  error.message?.includes('permission') ||
                  error.code === '42501';
                if (isRlsDenied) {
                  console.warn(`[Sync net] Direct staff upsert denied by RLS for "${staff.name}". Staff sync requires edge function or authenticated session.`);
                } else {
                  console.error(`[Sync net] Direct staff upsert failed for "${staff.name}":`, error.message);
                }
              } else {
                synced = true;
                console.log(`[Sync cache] Staff "${staff.name}" synced via direct upsert.`);
              }
            } catch (directErr) {
              console.error(`[Sync net] Direct staff upsert error for "${staff.name}":`, directErr.message);
            }
          }

          // Update local sync status
          try {
            if (synced) {
              await db.staff.update(staff.id, { isSynced: 1 });
            }
          } catch (dbErr) {
            console.error(`[Sync db] Error updating staff sync status for "${staff.name}":`, dbErr);
          }
        }
      }

      // 5. Sync Tables
      let unsyncedTables = [];
      try {
        unsyncedTables = await tableStore().filter(t => !t.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced tables:', dbErr);
      }

      if (unsyncedTables.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedTables.length} unsynced tables in local cache.`);
        const remoteTables = unsyncedTables.map(mapTableToRemote);
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('tables').upsert(remoteTables);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', tableStore(), async () => {
              for (const t of unsyncedTables) {
                await tableStore().update(t.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedTables.length} tables.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating table sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced tables to cloud after retries:', netErr);
        }
      }

      // 6. Sync Inventory
      let unsyncedInventory = [];
      try {
        unsyncedInventory = await db.inventory.filter(i => !i.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced inventory:', dbErr);
      }

      if (unsyncedInventory.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedInventory.length} unsynced inventory items in local cache.`);
        const remoteInv = unsyncedInventory.map(mapInventoryToRemote);
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('inventory').upsert(remoteInv);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.inventory, async () => {
              for (const i of unsyncedInventory) {
                await db.inventory.update(i.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedInventory.length} inventory items.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating inventory sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced inventory items to cloud after retries:', netErr);
        }
      }

      // 7. Sync Suppliers
      let unsyncedSuppliers = [];
      try {
        unsyncedSuppliers = await db.suppliers.filter(s => !s.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced suppliers:', dbErr);
      }

      if (unsyncedSuppliers.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedSuppliers.length} unsynced suppliers in local cache.`);
        const remoteSups = unsyncedSuppliers.map(mapSupplierToRemote);
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('suppliers').upsert(remoteSups);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.suppliers, async () => {
              for (const s of unsyncedSuppliers) {
                await db.suppliers.update(s.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedSuppliers.length} suppliers.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating supplier sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced suppliers to cloud after retries:', netErr);
        }
      }

      // 8. Sync Shifts
      let unsyncedShifts = [];
      try {
        unsyncedShifts = await db.shifts.filter(s => !s.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced shifts:', dbErr);
      }

      if (unsyncedShifts.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedShifts.length} unsynced shifts in local cache.`);
        const remoteShifts = unsyncedShifts.map(mapShiftToRemote);
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('shifts').upsert(remoteShifts);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.shifts, async () => {
              for (const s of unsyncedShifts) {
                await db.shifts.update(s.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedShifts.length} shifts.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating shift sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced shifts to cloud after retries:', netErr);
        }
      }

      // 9. Sync Activity Logs
      let unsyncedActivities = [];
      try {
        unsyncedActivities = await db.activityLog.filter(a => !a.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced activities:', dbErr);
      }

      if (unsyncedActivities.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedActivities.length} unsynced activities in local cache.`);
        const remoteActs = unsyncedActivities.map(mapActivityToRemote);
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('activity_log').upsert(remoteActs);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.activityLog, async () => {
              for (const a of unsyncedActivities) {
                await db.activityLog.update(a.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedActivities.length} activities.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating activity sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced activities to cloud after retries:', netErr);
        }
      }

      // 10. Sync Customers
      let unsyncedCustomers = [];
      try {
        unsyncedCustomers = await db.customers.filter(c => !c.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced customers:', dbErr);
      }

      if (unsyncedCustomers.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedCustomers.length} unsynced customers in local cache.`);
        const remoteCustomers = unsyncedCustomers.map(mapCustomerToRemote);
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('customers').upsert(remoteCustomers);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.customers, async () => {
              for (const c of unsyncedCustomers) {
                await db.customers.update(c.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedCustomers.length} customers.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating customer sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced customers to cloud after retries:', netErr);
        }
      }

      // 11. Sync Recipes
      let unsyncedRecipes = [];
      try {
        unsyncedRecipes = await db.recipes.filter(r => !r.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced recipes:', dbErr);
      }

      if (unsyncedRecipes.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedRecipes.length} unsynced recipes in local cache.`);
        const remoteRecipes = unsyncedRecipes.map(mapRecipeToRemote);
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('recipes').upsert(remoteRecipes);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.recipes, async () => {
              for (const r of unsyncedRecipes) {
                await db.recipes.update(r.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedRecipes.length} recipes.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating recipe sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced recipes to cloud after retries:', netErr);
        }
      }

    } catch (e) {
      console.error('[Sync] Failed to perform initial push of unsynced records:', e);
      showToast('Failed to sync local data to cloud: ' + e.message, 'error');
    }
  }

  subscribeRealtime() {
    if (!supabase) return;

    this.channel = supabase.channel('pos-realtime-channel');

    // Handle menu_categories updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'menu_categories' },
      async (payload) => {
        await this.handleRemoteChange('menuCategories', payload, mapCategoryToLocal);
      }
    );

    // Handle menu_items updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'menu_items' },
      async (payload) => {
        await this.handleRemoteChange('menuItems', payload, mapItemToLocal);
      }
    );

    // Handle orders updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      async (payload) => {
        await this.handleRemoteChange('orders', payload, mapOrderToLocal);
      }
    );

    // Handle staff updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'staff' },
      async (payload) => {
        await this.handleRemoteChange('staff', payload, mapStaffToLocal);
      }
    );

    // Handle tables updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tables' },
      async (payload) => {
        await this.handleRemoteChange('tables', payload, mapTableToLocal);
      }
    );

    // Handle inventory updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory' },
      async (payload) => {
        await this.handleRemoteChange('inventory', payload, mapInventoryToLocal);
      }
    );

    // Handle suppliers updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'suppliers' },
      async (payload) => {
        await this.handleRemoteChange('suppliers', payload, mapSupplierToLocal);
      }
    );

    // Handle shifts updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shifts' },
      async (payload) => {
        await this.handleRemoteChange('shifts', payload, mapShiftToLocal);
      }
    );

    // Handle activity_log updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activity_log' },
      async (payload) => {
        await this.handleRemoteChange('activityLog', payload, mapActivityToLocal);
      }
    );

    // Handle customers updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'customers' },
      async (payload) => {
        await this.handleRemoteChange('customers', payload, mapCustomerToLocal);
      }
    );

    // Handle recipes updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'recipes' },
      async (payload) => {
        await this.handleRemoteChange('recipes', payload, mapRecipeToLocal);
      }
    );

    this.channel.subscribe((status) => {
      console.log(`Supabase real-time channel state: ${status}`);
    });
  }

  async handleRemoteChange(storeName, payload, mapToLocalFn) {
    // If the change originated from this client's push, ignore it
    this.isSyncingFromServer = true;

    try {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const localData = mapToLocalFn(payload.new);
        
        // Put data into local IndexedDB
        await db[storeName].put(localData);
        console.log(`[Sync Remote] Applied ${payload.eventType} to ${storeName}:`, localData);
      } else if (payload.eventType === 'DELETE') {
        const id = payload.old.id;
        if (id) {
          await db[storeName].delete(id);
          console.log(`[Sync Remote] Applied DELETE to ${storeName} for ID: ${id}`);
        }
      }

      // Dispatch a DOM event so current active views can dynamically refresh and update their state
      window.dispatchEvent(new CustomEvent('sync-data-changed', {
        detail: { storeName, eventType: payload.eventType, oldId: payload.old?.id, newObj: payload.new }
      }));

      // Fire audible notification for newly confirmed orders arriving via realtime
      if (storeName === 'orders' && payload.eventType === 'INSERT') {
        const incomingOrder = payload.new;
        if (incomingOrder && (incomingOrder.status === 'confirmed' || incomingOrder.status === 'pending')) {
          orderNotificationService.alertNewOrder({
            orderNumber: incomingOrder.order_number || incomingOrder.orderNumber,
            items: incomingOrder.items,
            tableNumber: incomingOrder.table_number || incomingOrder.tableNumber,
            channel: incomingOrder.channel,
            source: incomingOrder.source,
          });
        }
      }

    } catch (e) {
      console.error(`[Sync db] Failed to apply remote database change to local ${storeName}:`, e);
    } finally {
      this.isSyncingFromServer = false;
    }
  }

  // Active sync-up method for newly created or updated Orders
  async syncUpOrder(order) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping order sync for ${order?.orderNumber || order?.id}: offline or disconnected.`);
      return;
    }
    try {
      if (needsServerValidation(order)) {
        const result = await submitPublicOrder(order);
        if (!result.accepted) {
          throw new Error(result.message || 'Public order validation failed.');
        }
        await db.orders.update(order.id, {
          ...result.order,
          isSynced: 1,
          syncStatus: 'synced',
          validationStatus: 'accepted',
          requiresServerValidation: false,
          lastSyncError: '',
          lastSyncedAt: new Date().toISOString()
        });
        console.log(`[Sync cache] Public order ${order.orderNumber} validated by Edge Function.`);
        return;
      }

      const remote = mapOrderToRemote(order);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('orders').upsert(remote, { onConflict: 'store_id,client_order_id' });
        if (error) throw error;
      }, {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2
      });

      this.isSyncingFromServer = true;
      try {
        await db.orders.update(order.id, {
          isSynced: 1,
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString()
        });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking order ${order.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }

      console.log(`[Sync cache] Order ${order.orderNumber} successfully replicated to cloud and updated in cache.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for order ${order?.orderNumber || order?.id}:`, e);
      if (order?.id) {
        try {
          await db.orders.update(order.id, {
          isSynced: 0,
          syncStatus: 'error',
            lastSyncError: e?.message || String(e),
            syncAttempts: (parseInt(order.syncAttempts) || 0) + 1,
            lastSyncAttemptAt: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error(`[Sync db] Error marking order ${order.id} sync failure:`, dbErr);
        }
      }
    }
  }

  // Active sync-up method for Menu Items
  async syncUpItem(item) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping item sync for "${item?.name}": offline or disconnected.`);
      return;
    }
    try {
      const remote = mapItemToRemote(item);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('menu_items').upsert(remote);
        if (error) throw error;
      }, {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2
      });

      this.isSyncingFromServer = true;
      try {
        await db.menuItems.update(item.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking item ${item.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }

      console.log(`[Sync cache] Menu item "${item.name}" successfully replicated to cloud and updated in cache.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for item "${item.name}":`, e);
    }
  }

  // Active sync-up method for Categories
  async syncUpCategory(category) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping category sync for "${category?.name}": offline or disconnected.`);
      return;
    }
    try {
      const remote = mapCategoryToRemote(category);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('menu_categories').upsert(remote);
        if (error) throw error;
      }, {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2
      });

      this.isSyncingFromServer = true;
      try {
        await db.menuCategories.update(category.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking category ${category.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }

      console.log(`[Sync cache] Category "${category.name}" successfully replicated to cloud and updated in cache.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for category "${category.name}":`, e);
    }
  }

  // Active sync-up method for Staff
  async syncUpStaff(staff) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping staff sync for "${staff?.name}": offline or disconnected.`);
      return;
    }
    try {
      await retryWithBackoff(async () => {
        const result = await syncStaffViaAdminFunction(staff);
        if (!result.success) throw new Error(result.message || 'Staff admin function failed.');
      }, {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2
      });

      this.isSyncingFromServer = true;
      try {
        await db.staff.update(staff.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking staff ${staff.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }

      console.log(`[Sync cache] Staff member "${staff.name}" successfully replicated to cloud and updated in cache.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for staff "${staff.name}":`, e);
    }
  }

  // Active sync-up method for Tables
  async syncUpTable(table) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping table sync for ${table?.number || table?.id}: offline or disconnected.`);
      return;
    }
    try {
      const remote = mapTableToRemote(table);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('tables').upsert(remote);
        if (error) throw error;
      }, { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 });

      this.isSyncingFromServer = true;
      try {
        await tableStore().update(table.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking table ${table.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }
      console.log(`[Sync cache] Table ${table.number} successfully replicated to cloud.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for table ${table?.number || table?.id}:`, e);
    }
  }

  // Active sync-up method for Inventory Items
  async syncUpInventory(inv) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping inventory sync for "${inv?.name}": offline or disconnected.`);
      return;
    }
    try {
      const remote = mapInventoryToRemote(inv);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('inventory').upsert(remote);
        if (error) throw error;
      }, { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 });

      this.isSyncingFromServer = true;
      try {
        await db.inventory.update(inv.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking inventory ${inv.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }
      console.log(`[Sync cache] Inventory item "${inv.name}" successfully replicated to cloud.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for inventory "${inv?.name}":`, e);
    }
  }

  // Active sync-up method for Suppliers
  async syncUpSupplier(sup) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping supplier sync for "${sup?.name}": offline or disconnected.`);
      return;
    }
    try {
      const remote = mapSupplierToRemote(sup);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('suppliers').upsert(remote);
        if (error) throw error;
      }, { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 });

      this.isSyncingFromServer = true;
      try {
        await db.suppliers.update(sup.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking supplier ${sup.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }
      console.log(`[Sync cache] Supplier "${sup.name}" successfully replicated to cloud.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for supplier "${sup?.name}":`, e);
    }
  }

  // Active sync-up method for Shifts
  async syncUpShift(shift) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping shift sync for ${shift?.id}: offline or disconnected.`);
      return;
    }
    try {
      const remote = mapShiftToRemote(shift);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('shifts').upsert(remote);
        if (error) throw error;
      }, { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 });

      this.isSyncingFromServer = true;
      try {
        await db.shifts.update(shift.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking shift ${shift.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }
      console.log(`[Sync cache] Shift ${shift.id} successfully replicated to cloud.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for shift ${shift?.id}:`, e);
    }
  }

  // Active sync-up method for Activity Logs
  async syncUpActivity(log) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping activity log sync for ${log?.id}: offline or disconnected.`);
      return;
    }
    try {
      const remote = mapActivityToRemote(log);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('activity_log').upsert(remote);
        if (error) throw error;
      }, { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 });

      this.isSyncingFromServer = true;
      try {
        await db.activityLog.update(log.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking activity log ${log.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }
      console.log(`[Sync cache] Activity log ${log.id} successfully replicated to cloud.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for activity log ${log?.id}:`, e);
    }
  }

  // Active sync-up method for Customers
  async syncUpCustomer(cust) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping customer sync for "${cust?.name}": offline or disconnected.`);
      return;
    }
    try {
      const remote = mapCustomerToRemote(cust);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('customers').upsert(remote);
        if (error) throw error;
      }, { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 });

      this.isSyncingFromServer = true;
      try {
        await db.customers.update(cust.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking customer ${cust.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }
      console.log(`[Sync cache] Customer "${cust.name}" successfully replicated to cloud.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for customer "${cust?.name}":`, e);
    }
  }

  // Active sync-up method for Recipes
  async syncUpRecipe(recipe) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping recipe sync for ${recipe?.id}: offline or disconnected.`);
      return;
    }
    try {
      const remote = mapRecipeToRemote(recipe);

      await retryWithBackoff(async () => {
        const { error } = await supabase.from('recipes').upsert(remote);
        if (error) throw error;
      }, { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 });

      this.isSyncingFromServer = true;
      try {
        await db.recipes.update(recipe.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking recipe ${recipe.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }
      console.log(`[Sync cache] Recipe ${recipe.id} (menuItemId: ${recipe.menuItemId}) successfully replicated to cloud.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for recipe ${recipe?.id}:`, e);
    }
  }

  setupLocalHooks() {
    // Menu Categories hook
    db.menuCategories.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const cat = await db.menuCategories.get(primKey);
          if (cat) await this.syncUpCategory(cat);
        } catch (dbErr) {
          console.error('[Sync db] Error in menuCategories creating hook:', dbErr);
        }
      }, 50);
    });

    db.menuCategories.hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const cat = await db.menuCategories.get(primKey);
          if (cat) await this.syncUpCategory(cat);
        } catch (dbErr) {
          console.error('[Sync db] Error in menuCategories updating hook:', dbErr);
        }
      }, 50);
    });

    db.menuCategories.hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('menu_categories').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted category ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete category ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });

    // Menu Items hook
    db.menuItems.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const item = await db.menuItems.get(primKey);
          if (item) await this.syncUpItem(item);
        } catch (dbErr) {
          console.error('[Sync db] Error in menuItems creating hook:', dbErr);
        }
      }, 50);
    });

    db.menuItems.hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const item = await db.menuItems.get(primKey);
          if (item) await this.syncUpItem(item);
        } catch (dbErr) {
          console.error('[Sync db] Error in menuItems updating hook:', dbErr);
        }
      }, 50);
    });

    db.menuItems.hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('menu_items').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted menu item ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete item ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });

    // Staff hooks
    db.staff.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const s = await db.staff.get(primKey);
          if (s) await this.syncUpStaff(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in staff creating hook:', dbErr);
        }
      }, 50);
    });

    db.staff.hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const s = await db.staff.get(primKey);
          if (s) await this.syncUpStaff(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in staff updating hook:', dbErr);
        }
      }, 50);
    });

    db.staff.hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const result = await setStaffActiveViaAdminFunction(obj || primKey, false);
            if (!result.success) throw new Error(result.message || 'Staff admin function failed.');
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deactivated staff member ${primKey} in cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to deactivate staff member ${primKey} in cloud after retries:`, e);
        }
      }, 50);
    });

    // Tables hooks
    tableStore().hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const t = await tableStore().get(primKey);
          if (t) await this.syncUpTable(t);
        } catch (dbErr) {
          console.error('[Sync db] Error in tables creating hook:', dbErr);
        }
      }, 50);
    });

    tableStore().hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const t = await tableStore().get(primKey);
          if (t) await this.syncUpTable(t);
        } catch (dbErr) {
          console.error('[Sync db] Error in tables updating hook:', dbErr);
        }
      }, 50);
    });

    tableStore().hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('tables').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted table ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete table ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });

    // Inventory hooks
    db.inventory.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const i = await db.inventory.get(primKey);
          if (i) await this.syncUpInventory(i);
        } catch (dbErr) {
          console.error('[Sync db] Error in inventory creating hook:', dbErr);
        }
      }, 50);
    });

    db.inventory.hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const i = await db.inventory.get(primKey);
          if (i) await this.syncUpInventory(i);
        } catch (dbErr) {
          console.error('[Sync db] Error in inventory updating hook:', dbErr);
        }
      }, 50);
    });

    db.inventory.hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('inventory').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted inventory item ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete inventory item ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });

    // Suppliers hooks
    db.suppliers.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const s = await db.suppliers.get(primKey);
          if (s) await this.syncUpSupplier(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in suppliers creating hook:', dbErr);
        }
      }, 50);
    });

    db.suppliers.hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const s = await db.suppliers.get(primKey);
          if (s) await this.syncUpSupplier(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in suppliers updating hook:', dbErr);
        }
      }, 50);
    });

    db.suppliers.hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('suppliers').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted supplier ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete supplier ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });

    // Shifts hooks
    db.shifts.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const s = await db.shifts.get(primKey);
          if (s) await this.syncUpShift(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in shifts creating hook:', dbErr);
        }
      }, 50);
    });

    db.shifts.hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const s = await db.shifts.get(primKey);
          if (s) await this.syncUpShift(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in shifts updating hook:', dbErr);
        }
      }, 50);
    });

    db.shifts.hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('shifts').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted shift ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete shift ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });

    // Activity Log hooks
    db.activityLog.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const a = await db.activityLog.get(primKey);
          if (a) await this.syncUpActivity(a);
        } catch (dbErr) {
          console.error('[Sync db] Error in activityLog creating hook:', dbErr);
        }
      }, 50);
    });

    // Customers hooks
    db.customers.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const c = await db.customers.get(primKey);
          if (c) await this.syncUpCustomer(c);
        } catch (dbErr) {
          console.error('[Sync db] Error in customers creating hook:', dbErr);
        }
      }, 50);
    });

    db.customers.hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const c = await db.customers.get(primKey);
          if (c) await this.syncUpCustomer(c);
        } catch (dbErr) {
          console.error('[Sync db] Error in customers updating hook:', dbErr);
        }
      }, 50);
    });

    db.customers.hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('customers').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted customer ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete customer ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });

    // Recipes hooks
    db.recipes.hook('creating', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const r = await db.recipes.get(primKey);
          if (r) await this.syncUpRecipe(r);
        } catch (dbErr) {
          console.error('[Sync db] Error in recipes creating hook:', dbErr);
        }
      }, 50);
    });

    db.recipes.hook('updating', (mods, primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer) return;
        try {
          const r = await db.recipes.get(primKey);
          if (r) await this.syncUpRecipe(r);
        } catch (dbErr) {
          console.error('[Sync db] Error in recipes updating hook:', dbErr);
        }
      }, 50);
    });

    db.recipes.hook('deleting', (primKey, obj, transaction) => {
      setTimeout(async () => {
        if (this.isSyncingFromServer || !this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('recipes').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted recipe ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete recipe ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });
  }

  // Helper method to trigger manual connection test
  async testConnection(url, key) {
    return testSupabaseMenuRead(url, key);
  }
}

export const syncService = new SyncService();
