/**
 * NextGenOS Sync Service
 */
import { db } from '../db/database';
import { getSupabaseClient, resetSupabaseClient, testSupabaseMenuRead } from './supabaseClient';
import { isHydrating } from './hydrationGuard';
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

/**
 * `menu_items.image_url` is a varchar(500), so an inlined data URL or an
 * over-long link would make the whole menu upsert fail. Those images live in
 * the local-only `imageData` field instead and are simply not published.
 */
const MAX_REMOTE_IMAGE_URL_LENGTH = 500;

function toRemoteImageUrl(value: any) {
  const url = String(value || '').trim();
  if (!url || url.length > MAX_REMOTE_IMAGE_URL_LENGTH) return '';
  return /^data:/i.test(url) ? '' : url;
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
    description: String(item.description || ''),
    image_url: toRemoteImageUrl(item.imageUrl)
  };
}

/**
 * True when Supabase rejected a write because the schema does not have the
 * column or table yet — i.e. the app was deployed before its migration ran.
 *
 * Publishing a dish must not start failing just because the description column
 * has not been added: the rest of the row is still valid and still has to
 * reach the cloud.
 */
export function isMissingSchemaError(error: any) {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === 'PGRST204' || code === 'PGRST205' || code === '42P01' || code === '42703' ||
    message.includes('does not exist') ||
    message.includes('could not find the') ||
    message.includes('schema cache')
  );
}

function mapAddonToRemote(addon: any) {
  return {
    id: addon.id,
    store_id: getStoreId(),
    menu_item_id: addon.menuItemId,
    name: String(addon.name || '').slice(0, 60),
    price: parseFloat(addon.price) || 0,
    is_active: addon.isActive === 1 || addon.isActive === true,
    sort_order: parseInt(addon.sortOrder) || 0,
    updated_at: new Date().toISOString()
  };
}

export function mapAddonToLocal(row: any) {
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

export function mapItemToLocal(row: any) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    price: parseFloat(row.price) || 0,
    isAvailable: row.is_available ? 1 : 0,
    isVeg: row.is_veg ? 1 : 0,
    sortOrder: parseInt(row.sort_order) || 0,
    description: row.description || '',
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
    birthday: cust.birthday || null
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

export interface SyncOutcome {
  success: boolean;
  /** True when the server definitively refused the write (constraint, trigger, RLS). */
  rejected: boolean;
  offline: boolean;
  error?: string;
}

/**
 * Distinguish a definitive server refusal from a transient network problem.
 *
 * This drives whether an optimistic local write is rolled back or kept for a
 * later retry. Rolling back on a flaky connection would break offline use;
 * keeping a write the database has permanently refused leaves the local cache
 * lying to the user until the next hydration silently reverts it.
 */
function isServerRejection(error: any) {
  const status = error?.status ?? error?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return true;
  }
  // PostgREST surfaces Postgres SQLSTATEs, e.g. P0001 for `raise exception`
  // from the order-status transition trigger, or 42501 for an RLS denial.
  return typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code);
}

/**
 * Prefer the database's own message — triggers raise text written for humans
 * ("Paid orders must be refunded before cancellation") that is far more useful
 * than a generic failure notice.
 */
function describeSyncError(error: any) {
  return error?.message || error?.details || error?.hint || String(error);
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

      // 2b. Sync Add-ons
      let unsyncedAddons = [];
      try {
        unsyncedAddons = await db.menuItemAddons.filter(a => !a.isSynced).toArray();
      } catch (dbErr) {
        console.error('[Sync db] Error fetching unsynced add-ons:', dbErr);
      }

      if (unsyncedAddons.length > 0) {
        console.log(`[Sync cache] Found ${unsyncedAddons.length} unsynced add-ons in local cache.`);
        for (const addon of unsyncedAddons) {
          await this.syncUpAddon(addon);
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

        // Reconnect replays every queued order at once, which is the widest
        // path for a stale copy to overwrite newer cloud state — the one that
        // brought cancelled tickets back onto the kitchen board. Each is
        // compared with the cloud first, exactly as a single push is.
        const candidateOrders = unsyncedOrders.filter(order => !needsServerValidation(order));
        const staffOrders = [];
        for (const order of candidateOrders) {
          const comparison = await this.serverOrderIsNewer(order);
          if (comparison.serverWins) {
            await this.adoptServerOrder(order, comparison.row);
            console.warn(`[Sync] Dropped a stale queued copy of order ${order.orderNumber || order.id}; the cloud's is newer.`);
            continue;
          }
          staffOrders.push(order);
        }

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
            // Append-only, deliberately. `authenticated` holds select and insert on this table and
            // nothing else, because an audit trail staff can rewrite is not an audit trail. A plain
            // upsert compiles to ON CONFLICT DO UPDATE, asks for a privilege that is withheld on
            // purpose, and fails 42501 on every retry forever — which is why no staff activity had
            // ever reached the cloud. `ignoreDuplicates` compiles to DO NOTHING and needs only
            // insert, while still making a replayed row harmless.
            const { error } = await supabase
              .from('activity_log')
              .upsert(remoteActs, { ignoreDuplicates: true });
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

    // Handle menu_item_addons updates
    this.channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'menu_item_addons' },
      async (payload) => {
        await this.handleRemoteChange('menuItemAddons', payload, mapAddonToLocal);
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

      // A channel that just came up may have missed changes while it was down,
      // and one that just went down will miss them from here on. Either way the
      // cached rows can no longer be assumed current, so retire the read
      // freshness windows and let the next read go back to Supabase.
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        import('./cloudDb')
          .then(({ markCloudDataStale }) => markCloudDataStale())
          .catch(err => console.warn('[Sync] Could not retire cloud read freshness:', err));
      }
    });
  }

  async handleRemoteChange(storeName, payload, mapToLocalFn) {
    // If the change originated from this client's push, ignore it
    this.isSyncingFromServer = true;

    try {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const localData = mapToLocalFn(payload.new);

        // A device-local dish image has no cloud column, so carry it across
        // the overwrite instead of losing it to a remote edit.
        if (storeName === 'menuItems' && localData.id != null) {
          const existing = await db.menuItems.get(localData.id);
          if (existing?.imageData) localData.imageData = existing.imageData;
        }

        // Orders are written offline first under a local auto-increment key, so
        // the server id carried in the payload is not this device's primary key.
        // Reconcile on clientOrderId the way every other order path does
        // (getOrders, getOrder, hydrateFromCloud) — otherwise the realtime echo
        // of our own push lands as a *second* row, and the kitchen board shows a
        // twin that no status change can clear.
        if (storeName === 'orders' && localData.clientOrderId) {
          const existing = await db.orders.where('clientOrderId').equals(localData.clientOrderId).first();
          if (existing) {
            localData.id = existing.id; // Preserve local auto-increment key
          }
        }

        // Put data into local IndexedDB
        await db[storeName].put(localData);
        console.log(`[Sync Remote] Applied ${payload.eventType} to ${storeName}:`, localData);
      } else if (payload.eventType === 'DELETE') {
        let id = payload.old.id;

        // Same key mismatch as above: the deleted row's server id is not the
        // local order key, so resolve it before deleting or we would silently
        // remove nothing (or worse, an unrelated order).
        if (storeName === 'orders' && id != null) {
          const local = payload.old.client_order_id
            ? await db.orders.where('clientOrderId').equals(payload.old.client_order_id).first()
            : await db.orders.filter(o => o.serverOrderId === id).first();
          id = local ? local.id : null;
        }

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

  /**
   * Replicate a locally created or updated order to the cloud.
   *
   * Returns the outcome rather than swallowing it, so optimistic callers can
   * tell a definitive server refusal (roll the local write back) apart from a
   * transient network failure (keep it and retry later).
   */
  /**
   * Decide whether this device's copy of an order may overwrite the cloud's.
   *
   * `syncUpOrder` upserts the whole row, so any queued push carrying an older
   * copy silently reverts newer state. That is how a cancelled ticket came back
   * on the kitchen board seconds after it was cleared: another till — or this
   * one, replaying a queued write — still held the order as active and pushed
   * that copy over the cancellation.
   *
   * The cloud wins when its row is newer, and always when it has reached a
   * terminal state. Cancelled and completed are final, which is exactly what
   * the order-status trigger enforces server-side.
   */
  async serverOrderIsNewer(order) {
    if (!order?.clientOrderId || !supabase) return { serverWins: false, row: null };

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('store_id', getStoreId())
        .eq('client_order_id', order.clientOrderId)
        .maybeSingle();

      if (error || !data) return { serverWins: false, row: null };

      const serverAt = Date.parse(data.updated_at || '') || 0;
      const localAt = Date.parse(order.updatedAt || '') || 0;
      const terminal = ['cancelled', 'completed'];
      const serverTerminal = terminal.includes(String(data.status || ''));
      const localTerminal = terminal.includes(String(order.status || ''));

      if (serverTerminal && !localTerminal) return { serverWins: true, row: data };
      return { serverWins: serverAt > localAt, row: data };
    } catch (e) {
      // A failed comparison must not block the push: losing a write is worse
      // than risking one, and the server's trigger is the final word anyway.
      console.warn('[Sync] Could not compare the cloud copy of an order:', e);
      return { serverWins: false, row: null };
    }
  }

  /** Take the cloud's copy of an order and stop trying to push this one. */
  async adoptServerOrder(order, row) {
    const local = mapOrderToLocal(row);
    local.id = order.id;
    this.isSyncingFromServer = true;
    try {
      await db.orders.put(local);
    } catch (dbErr) {
      console.error(`[Sync db] Could not adopt the cloud copy of order ${order.id}:`, dbErr);
    } finally {
      this.isSyncingFromServer = false;
    }
  }

  async syncUpOrder(order): Promise<SyncOutcome> {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping order sync for ${order?.orderNumber || order?.id}: offline or disconnected.`);
      return { success: false, rejected: false, offline: true, error: 'Offline or disconnected.' };
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
        return { success: true, rejected: false, offline: false };
      }

      // Never push over a newer cloud copy — see serverOrderIsNewer.
      const comparison = await this.serverOrderIsNewer(order);
      if (comparison.serverWins) {
        await this.adoptServerOrder(order, comparison.row);
        console.warn(`[Sync] Cloud holds a newer copy of order ${order.orderNumber || order.id}; keeping it and dropping this device's stale copy.`);
        return { success: true, rejected: false, offline: false };
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
          // Clear any refusal shown on the ticket: it no longer applies.
          lastSyncError: '',
          lastSyncedAt: new Date().toISOString()
        });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking order ${order.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }

      console.log(`[Sync cache] Order ${order.orderNumber} successfully replicated to cloud and updated in cache.`);
      return { success: true, rejected: false, offline: false };
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for order ${order?.orderNumber || order?.id}:`, e);
      const rejected = isServerRejection(e);
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
      return { success: false, rejected, offline: false, error: describeSyncError(e) };
    }
  }

  /**
   * Mark a row as still owed to the cloud.
   *
   * `pushUnsynced()` retries exactly the rows flagged `isSynced: 0`, so a push
   * that was skipped (disconnected) or that failed has to leave the row flagged
   * or it is never retried — the edit stays on this device, invisible, and the
   * next cloud read replaces it with the server's older copy. That is how a
   * checkout's stock deduction, a price change or a table status could be lost
   * with nothing on screen. Orders already did this; everything else did not.
   *
   * The `isSyncingFromServer` guard stops this bookkeeping write from firing
   * the Dexie hook that would schedule yet another push.
   */
  async markPushPending(store, id) {
    if (id === undefined || id === null) return;
    this.isSyncingFromServer = true;
    try {
      await store.update(id, { isSynced: 0 });
    } catch (dbErr) {
      console.error(`[Sync db] Could not flag row ${id} for a later push:`, dbErr);
    } finally {
      this.isSyncingFromServer = false;
    }
  }

  // Active sync-up method for Menu Items
  async syncUpItem(item) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping item sync for "${item?.name}": offline or disconnected.`);
      await this.markPushPending(db.menuItems, item.id);
      return;
    }
    try {
      const remote = mapItemToRemote(item);

      await retryWithBackoff(async () => {
        const { error } = await supabase.from('menu_items').upsert(remote);
        if (!error) return;

        // The description column arrives with a migration. Until it has run,
        // publish everything else rather than failing the whole dish.
        if (isMissingSchemaError(error) && 'description' in remote) {
          console.warn('[Sync] menu_items.description is missing — run the pending migration to publish dish descriptions. Publishing the rest of the dish for now.');
          const { description, ...withoutDescription } = remote;
          const { error: retryError } = await supabase.from('menu_items').upsert(withoutDescription);
          if (retryError) throw retryError;
          return;
        }

        throw error;
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
      await this.markPushPending(db.menuItems, item.id);
    }
  }

  async syncUpAddon(addon) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping add-on sync for "${addon?.name}": offline or disconnected.`);
      await this.markPushPending(db.menuItemAddons, addon.id);
      return;
    }
    try {
      const remote = mapAddonToRemote(addon);

      await retryWithBackoff(async () => {
        const { error } = await supabase.from('menu_item_addons').upsert(remote);
        if (error) throw error;
      }, { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 });

      this.isSyncingFromServer = true;
      try {
        await db.menuItemAddons.update(addon.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking add-on ${addon.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }
      console.log(`[Sync cache] Add-on "${addon.name}" successfully replicated to cloud.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for add-on "${addon?.name}":`, e);
      await this.markPushPending(db.menuItemAddons, addon.id);
    }
  }

  // Active sync-up method for Categories
  async syncUpCategory(category) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping category sync for "${category?.name}": offline or disconnected.`);
      await this.markPushPending(db.menuCategories, category.id);
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
      await this.markPushPending(db.menuCategories, category.id);
    }
  }

  // Active sync-up method for Staff
  async syncUpStaff(staff) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping staff sync for "${staff?.name}": offline or disconnected.`);
      await this.markPushPending(db.staff, staff.id);
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
      await this.markPushPending(db.staff, staff.id);
    }
  }

  // Active sync-up method for Tables
  async syncUpTable(table) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping table sync for ${table?.number || table?.id}: offline or disconnected.`);
      await this.markPushPending(tableStore(), table.id);
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
      await this.markPushPending(tableStore(), table.id);
    }
  }

  // Active sync-up method for Inventory Items
  async syncUpInventory(inv) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping inventory sync for "${inv?.name}": offline or disconnected.`);
      await this.markPushPending(db.inventory, inv.id);
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
      await this.markPushPending(db.inventory, inv.id);
    }
  }

  // Active sync-up method for Suppliers
  async syncUpSupplier(sup) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping supplier sync for "${sup?.name}": offline or disconnected.`);
      await this.markPushPending(db.suppliers, sup.id);
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
      await this.markPushPending(db.suppliers, sup.id);
    }
  }

  // Active sync-up method for Shifts
  async syncUpShift(shift) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping shift sync for ${shift?.id}: offline or disconnected.`);
      await this.markPushPending(db.shifts, shift.id);
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
      await this.markPushPending(db.shifts, shift.id);
    }
  }

  // Active sync-up method for Activity Logs
  async syncUpActivity(log) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping activity log sync for ${log?.id}: offline or disconnected.`);
      await this.markPushPending(db.activityLog, log.id);
      return;
    }
    try {
      const remote = mapActivityToRemote(log);
      
      await retryWithBackoff(async () => {
        // Append-only: see the batch push above. UPDATE is withheld from `authenticated` on this
        // table by design, so DO NOTHING is the only conflict behaviour available — and the right
        // one for an audit row.
        const { error } = await supabase
          .from('activity_log')
          .upsert(remote, { ignoreDuplicates: true });
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
      await this.markPushPending(db.activityLog, log.id);
    }
  }

  // Active sync-up method for Customers
  async syncUpCustomer(cust) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping customer sync for "${cust?.name}": offline or disconnected.`);
      await this.markPushPending(db.customers, cust.id);
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
      await this.markPushPending(db.customers, cust.id);
    }
  }

  // Active sync-up method for Recipes
  async syncUpRecipe(recipe) {
    if (!this.isConnected || !supabase) {
      console.warn(`[Sync cache] Skipping recipe sync for ${recipe?.id}: offline or disconnected.`);
      await this.markPushPending(db.recipes, recipe.id);
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
      await this.markPushPending(db.recipes, recipe.id);
    }
  }

  /**
   * Replicate local Dexie writes up to Supabase.
   *
   * Every hook decides whether to replicate *synchronously*, before deferring
   * the network call. The deferral is what makes this subtle: `isHydrating()`
   * and `isSyncingFromServer` are only true for the duration of the write that
   * triggered the hook, so a check inside the setTimeout would almost always
   * read `false` and replicate an echo. For the 'deleting' hooks that mistake
   * was destructive — a cloud hydration rebuilding the local cache replicated
   * its own teardown back as cloud DELETEs and permanently destroyed rows.
   */
  setupLocalHooks() {
    // Menu Categories hook
    db.menuCategories.hook('creating', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const cat = await db.menuCategories.get(primKey);
          if (cat) await this.syncUpCategory(cat);
        } catch (dbErr) {
          console.error('[Sync db] Error in menuCategories creating hook:', dbErr);
        }
      }, 50);
    });

    db.menuCategories.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const cat = await db.menuCategories.get(primKey);
          if (cat) await this.syncUpCategory(cat);
        } catch (dbErr) {
          console.error('[Sync db] Error in menuCategories updating hook:', dbErr);
        }
      }, 50);
    });

    db.menuCategories.hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
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
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const item = await db.menuItems.get(primKey);
          if (item) await this.syncUpItem(item);
        } catch (dbErr) {
          console.error('[Sync db] Error in menuItems creating hook:', dbErr);
        }
      }, 50);
    });

    db.menuItems.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const item = await db.menuItems.get(primKey);
          if (item) await this.syncUpItem(item);
        } catch (dbErr) {
          console.error('[Sync db] Error in menuItems updating hook:', dbErr);
        }
      }, 50);
    });

    db.menuItems.hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
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
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const s = await db.staff.get(primKey);
          if (s) await this.syncUpStaff(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in staff creating hook:', dbErr);
        }
      }, 50);
    });

    db.staff.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const s = await db.staff.get(primKey);
          if (s) await this.syncUpStaff(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in staff updating hook:', dbErr);
        }
      }, 50);
    });

    db.staff.hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
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
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const t = await tableStore().get(primKey);
          if (t) await this.syncUpTable(t);
        } catch (dbErr) {
          console.error('[Sync db] Error in tables creating hook:', dbErr);
        }
      }, 50);
    });

    tableStore().hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const t = await tableStore().get(primKey);
          if (t) await this.syncUpTable(t);
        } catch (dbErr) {
          console.error('[Sync db] Error in tables updating hook:', dbErr);
        }
      }, 50);
    });

    tableStore().hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
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
    db.menuItemAddons.hook('creating', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const addon = await db.menuItemAddons.get(primKey);
          if (addon) await this.syncUpAddon(addon);
        } catch (dbErr) {
          console.error('[Sync db] Error in add-on creating hook:', dbErr);
        }
      }, 50);
    });

    db.menuItemAddons.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const addon = await db.menuItemAddons.get(primKey);
          if (addon) await this.syncUpAddon(addon);
        } catch (dbErr) {
          console.error('[Sync db] Error in add-on updating hook:', dbErr);
        }
      }, 50);
    });

    db.menuItemAddons.hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('menu_item_addons').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted add-on ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete add-on ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });

    db.inventory.hook('creating', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const i = await db.inventory.get(primKey);
          if (i) await this.syncUpInventory(i);
        } catch (dbErr) {
          console.error('[Sync db] Error in inventory creating hook:', dbErr);
        }
      }, 50);
    });

    db.inventory.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const i = await db.inventory.get(primKey);
          if (i) await this.syncUpInventory(i);
        } catch (dbErr) {
          console.error('[Sync db] Error in inventory updating hook:', dbErr);
        }
      }, 50);
    });

    db.inventory.hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
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
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const s = await db.suppliers.get(primKey);
          if (s) await this.syncUpSupplier(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in suppliers creating hook:', dbErr);
        }
      }, 50);
    });

    db.suppliers.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const s = await db.suppliers.get(primKey);
          if (s) await this.syncUpSupplier(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in suppliers updating hook:', dbErr);
        }
      }, 50);
    });

    db.suppliers.hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
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
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const s = await db.shifts.get(primKey);
          if (s) await this.syncUpShift(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in shifts creating hook:', dbErr);
        }
      }, 50);
    });

    db.shifts.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const s = await db.shifts.get(primKey);
          if (s) await this.syncUpShift(s);
        } catch (dbErr) {
          console.error('[Sync db] Error in shifts updating hook:', dbErr);
        }
      }, 50);
    });

    db.shifts.hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
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
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
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
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const c = await db.customers.get(primKey);
          if (c) await this.syncUpCustomer(c);
        } catch (dbErr) {
          console.error('[Sync db] Error in customers creating hook:', dbErr);
        }
      }, 50);
    });

    db.customers.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const c = await db.customers.get(primKey);
          if (c) await this.syncUpCustomer(c);
        } catch (dbErr) {
          console.error('[Sync db] Error in customers updating hook:', dbErr);
        }
      }, 50);
    });

    // Customer deletion is local-cache-only. Financial records are retained in
    // the cloud and can only be anonymized through an audited server workflow.

    // Recipes hooks
    db.recipes.hook('creating', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const r = await db.recipes.get(primKey);
          if (r) await this.syncUpRecipe(r);
        } catch (dbErr) {
          console.error('[Sync db] Error in recipes creating hook:', dbErr);
        }
      }, 50);
    });

    db.recipes.hook('updating', (mods, primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        try {
          const r = await db.recipes.get(primKey);
          if (r) await this.syncUpRecipe(r);
        } catch (dbErr) {
          console.error('[Sync db] Error in recipes updating hook:', dbErr);
        }
      }, 50);
    });

    db.recipes.hook('deleting', (primKey, obj, transaction) => {
      if (isHydrating() || this.isSyncingFromServer) return;
      setTimeout(async () => {
        if (!this.isConnected || !supabase) return;
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
