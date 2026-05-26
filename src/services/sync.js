import { createClient } from '@supabase/supabase-js';
import { db, getSetting } from '../db/database.js';
import { showToast } from '../utils/helpers.js';

// Table mapping helper functions
function mapCategoryToRemote(cat) {
  return {
    id: cat.id,
    name: cat.name,
    icon: cat.icon || '',
    sort_order: parseInt(cat.sortOrder) || 0,
    is_active: cat.isActive === 1
  };
}

function mapCategoryToLocal(row) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || '',
    sortOrder: parseInt(row.sort_order) || 0,
    isActive: row.is_active ? 1 : 0,
    isSynced: 1
  };
}

function mapItemToRemote(item) {
  return {
    id: item.id,
    category_id: item.categoryId,
    name: item.name,
    price: parseFloat(item.price) || 0,
    is_available: item.isAvailable === 1,
    is_veg: item.isVeg === 1,
    sort_order: parseInt(item.sortOrder) || 0
  };
}

function mapItemToLocal(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    price: parseFloat(row.price) || 0,
    isAvailable: row.is_available ? 1 : 0,
    isVeg: row.is_veg ? 1 : 0,
    sortOrder: parseInt(row.sort_order) || 0,
    isSynced: 1
  };
}

function mapOrderToRemote(order) {
  return {
    id: order.id,
    order_number: order.orderNumber,
    type: order.type || 'takeaway',
    status: order.status || 'pending',
    items: order.items || [], // array of items, stored as jsonb in Supabase
    subtotal: parseFloat(order.subtotal) || 0,
    tax: parseFloat(order.tax) || 0,
    total: parseFloat(order.total) || 0,
    payment_method: order.paymentMethod || null,
    payment_status: order.paymentStatus || 'unpaid',
    customer_name: order.customerName || '',
    customer_phone: order.customerPhone || '',
    notes: order.notes || '',
    created_at: order.createdAt || new Date().toISOString(),
    completed_at: order.completedAt || null
  };
}

function mapOrderToLocal(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    type: row.type || 'takeaway',
    status: row.status || 'pending',
    items: row.items || [],
    subtotal: parseFloat(row.subtotal) || 0,
    tax: parseFloat(row.tax) || 0,
    total: parseFloat(row.total) || 0,
    paymentMethod: row.payment_method || null,
    paymentStatus: row.payment_status || 'unpaid',
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
    isSynced: 1
  };
}

function mapStaffToRemote(staff) {
  return {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    pin_hash: staff.pinHash,
    is_active: staff.isActive === 1 || staff.isActive === true,
    created_at: staff.createdAt || new Date().toISOString(),
    updated_at: staff.updatedAt || new Date().toISOString()
  };
}

function mapStaffToLocal(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    pinHash: row.pin_hash,
    isActive: row.is_active ? 1 : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isSynced: 1
  };
}

let supabase = null;

async function initSupabase() {
  let url = await getSetting('supabaseUrl');
  let key = await getSetting('supabaseKey');

  // Fallback to environment variables if settings are empty
  if (!url || !key) {
    url = import.meta.env.VITE_SUPABASE_URL || '';
    key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  }

  if (!url || !key) {
    console.warn('[Sync] Supabase URL or Key is missing. Cloud synchronization is unconfigured.');
    return null;
  }

  // Validate URL format to handle bad credential formats early
  try {
    new URL(url);
  } catch (e) {
    console.error('[Sync] Invalid Supabase URL format configured:', url, e);
    return null;
  }

  try {
    return createClient(url, key, {
      auth: {
        persistSession: false
      }
    });
  } catch (e) {
    console.error('[Sync] Failed to create Supabase client:', e);
    return null;
  }
}

/**
 * Exponential backoff helper for network calls.
 * Throws immediately for bad credentials or format errors.
 */
async function retryWithBackoff(fn, options = {}) {
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
  constructor() {
    this.isConnected = false;
    this.isOnline = navigator.onLine;
    this.status = 'unconfigured'; // 'connected' | 'connecting' | 'unconfigured' | 'offline' | 'error'
    this.onStatusChangeCallbacks = [];
    this.isSyncingFromServer = false;
    this.channel = null;
  }

  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this.onStatusChangeCallbacks.push(callback);
      // Immediately call with current status
      callback(this.status, this.isConnected, this.isOnline);
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
    supabase = null;
    this.isConnected = false;
    this.triggerStatusChange('connecting');

    if (!this.isOnline) {
      this.triggerStatusChange('offline');
      return;
    }

    supabase = await initSupabase();
    if (!supabase) {
      this.triggerStatusChange('unconfigured');
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

      // 2. Subscribe to real-time updates
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
        const remoteOrders = unsyncedOrders.map(mapOrderToRemote);
        
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('orders').upsert(remoteOrders);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.orders, async () => {
              for (const o of unsyncedOrders) {
                await db.orders.update(o.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedOrders.length} orders.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating order sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced orders to cloud after retries:', netErr);
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
        const remoteStaff = unsyncedStaff.map(mapStaffToRemote);
        
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.from('staff').upsert(remoteStaff);
            if (error) throw error;
          }, { maxRetries: 3 });

          try {
            await db.transaction('rw', db.staff, async () => {
              for (const s of unsyncedStaff) {
                await db.staff.update(s.id, { isSynced: 1 });
              }
            });
            console.log(`[Sync cache] Successfully synced and updated cache for ${unsyncedStaff.length} staff members.`);
          } catch (dbErr) {
            console.error('[Sync db] Error updating staff sync status in local cache:', dbErr);
          }
        } catch (netErr) {
          console.error('[Sync net] Failed to push unsynced staff to cloud after retries:', netErr);
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
      const remote = mapOrderToRemote(order);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('orders').upsert(remote);
        if (error) throw error;
      }, {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2
      });

      this.isSyncingFromServer = true;
      try {
        await db.orders.update(order.id, { isSynced: 1 });
      } catch (dbErr) {
        console.error(`[Sync db] Error marking order ${order.id} as synced:`, dbErr);
      } finally {
        this.isSyncingFromServer = false;
      }

      console.log(`[Sync cache] Order ${order.orderNumber} successfully replicated to cloud and updated in cache.`);
    } catch (e) {
      console.error(`[Sync net] Cloud replication failed for order ${order?.orderNumber || order?.id}:`, e);
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
      const remote = mapStaffToRemote(staff);
      
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('staff').upsert(remote);
        if (error) throw error;
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
            const { error } = await supabase.from('staff').delete().eq('id', primKey);
            if (error) throw error;
          }, { maxRetries: 3 });
          console.log(`[Sync cache] Deleted staff member ${primKey} from cloud.`);
        } catch (e) {
          console.error(`[Sync net] Failed to delete staff member ${primKey} from cloud after retries:`, e);
        }
      }, 50);
    });
  }

  // Helper method to trigger manual connection test
  async testConnection(url, key) {
    if (!url || !key) {
      return { success: false, message: 'URL and Key are required.' };
    }
    try {
      new URL(url); // Verify URL format
      const client = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await client.from('menu_categories').select('id').limit(1);
      if (error) throw error;
      return { success: true, message: 'Connection successful!' };
    } catch (e) {
      return { success: false, message: e.message || String(e) };
    }
  }
}

export const syncService = new SyncService();
