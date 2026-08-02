/**
 * Cover for the online-first read path.
 *
 * The data layer used to be cache-first: views read IndexedDB, and cloud state
 * only arrived at login, on reconnect, or through the realtime channel. A till
 * whose channel had dropped, or a manager on a second device, therefore read
 * whatever that browser happened to have cached — a menu price, a stock level
 * or a day's takings could be arbitrarily stale with nothing on screen saying
 * so.
 *
 * Reads now go to Supabase and fall back to the cache only when the cloud
 * cannot be reached. These tests pin both halves of that: the query really is
 * issued and the rows really are the cloud's, and an unreachable cloud still
 * serves the last known rows instead of failing the read.
 */

import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ── Browser surface the data layer expects ──────────────────────
// Set up before the modules under test are imported: cloudDb registers window
// listeners and reads the store id out of localStorage at module scope.
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true,
  writable: true
});
(globalThis as any).window = { addEventListener: () => {} };

const localStorageBacking = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => localStorageBacking.get(key) ?? null,
  setItem: (key: string, value: string) => void localStorageBacking.set(key, String(value)),
  removeItem: (key: string) => void localStorageBacking.delete(key)
};

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'stub-anon-key';

// ── Stub Supabase REST endpoint ─────────────────────────────────

/** Rows the fake project returns, per table. */
let cloudRows: Record<string, any[]> = {};
/** Every REST URL the code under test requested, in order. */
let requestedUrls: string[] = [];
/** When set, every request fails — the cloud is unreachable. */
let networkDown = false;

(globalThis as any).fetch = async (input: any) => {
  const url = typeof input === 'string' ? input : input?.url;
  requestedUrls.push(url);
  if (networkDown) throw new TypeError('fetch failed');

  const table = String(url).match(/\/rest\/v1\/([^?]+)/)?.[1] || '';
  return new Response(JSON.stringify(cloudRows[table] || []), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

const { db, getCategories, getAllItems, getOrders } = await import('../src/db/database');
const { ensureFresh, markCloudDataStale, CLOUD_RESOURCES } = await import('../src/services/cloudDb');
const { createFreshnessTracker } = await import('../src/services/freshness');

/** Reset both sides of the layer so each test starts from a known state. */
async function reset() {
  cloudRows = {};
  requestedUrls = [];
  networkDown = false;
  markCloudDataStale();
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true
  });
  await db.menuCategories.clear();
  await db.menuItems.clear();
  await db.orders.clear();
}

const restCalls = (table: string) => requestedUrls.filter(url => url.includes(`/rest/v1/${table}`));

// ── Reads are served from Supabase ──────────────────────────────

test('a menu read queries Supabase for the store and returns the cloud rows', async () => {
  await reset();

  // What this device has cached is a *different* menu from the store's.
  await db.menuCategories.put({ id: 1, name: 'Stale Local Category', sortOrder: 1, isActive: 1 });
  cloudRows.menu_categories = [
    { id: 42, name: 'Live Cloud Category', sort_order: 1, is_active: true }
  ];

  const categories = await getCategories();

  assert.equal(restCalls('menu_categories').length, 1, 'the read must go to Supabase');
  assert.match(restCalls('menu_categories')[0], /store_id=eq\.the-taste/, 'reads are scoped to the store');
  assert.deepEqual(categories.map((c: any) => c.name), ['Live Cloud Category']);

  // And the cache now holds the cloud's menu, not the one it opened with.
  assert.deepEqual(
    (await db.menuCategories.toArray()).map((c: any) => c.id),
    [42],
    'a category the cloud no longer publishes must not survive locally'
  );
});

test('a dish withdrawn in the cloud disappears from the next read', async () => {
  await reset();

  cloudRows.menu_items = [
    { id: 1, category_id: 42, name: 'Paneer Tikka', price: 240, is_available: true, is_veg: true, sort_order: 1 },
    { id: 2, category_id: 42, name: 'Seasonal Special', price: 320, is_available: true, is_veg: true, sort_order: 2 }
  ];
  assert.equal((await getAllItems()).length, 2);

  // The kitchen pulls the special. The next read must not still offer it.
  markCloudDataStale();
  cloudRows.menu_items = cloudRows.menu_items.slice(0, 1);

  const items = await getAllItems();
  assert.deepEqual(items.map((i: any) => i.name), ['Paneer Tikka']);
});

test('an order taken on another till is visible without waiting for a hydration', async () => {
  await reset();

  cloudRows.orders = [{
    id: 900,
    client_order_id: 'cloud-order-1',
    order_number: 'TT-20260730-004',
    status: 'preparing',
    items: [{ itemName: 'Paneer Tikka', price: 240, quantity: 1 }],
    total: 240,
    created_at: '2026-07-30T10:00:00.000Z',
    updated_at: '2026-07-30T10:00:00.000Z'
  }];

  const orders = await getOrders();
  assert.deepEqual(orders.map((o: any) => o.orderNumber), ['TT-20260730-004']);
  assert.equal(orders[0].status, 'preparing');
});

// ── Reconciliation rules the read path must keep ────────────────

test('hydrating orders updates the local row instead of inserting a twin', async () => {
  await reset();

  // Created on this device: local auto-increment key, cloud id not yet known.
  const localId = await db.orders.add({
    clientOrderId: 'cloud-order-1',
    orderNumber: 'TT-20260730-004',
    status: 'pending',
    items: '[]',
    total: 240,
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
    syncStatus: 'synced'
  } as any);

  cloudRows.orders = [{
    id: 900,
    client_order_id: 'cloud-order-1',
    order_number: 'TT-20260730-004',
    status: 'ready',
    items: [],
    total: 240,
    created_at: '2026-07-30T10:00:00.000Z',
    updated_at: '2026-07-30T10:05:00.000Z'
  }];

  await getOrders();

  const rows = await db.orders.where('clientOrderId').equals('cloud-order-1').toArray();
  assert.equal(rows.length, 1, 'the kitchen board must not show the same ticket twice');
  assert.equal(rows[0].id, localId, 'the local key is preserved so open views keep their handle');
  assert.equal(rows[0].status, 'ready', 'the cloud status wins');
  assert.equal(rows[0].serverOrderId, 900);
});

test('an order still queued for the cloud survives a read', async () => {
  await reset();

  await db.orders.add({
    clientOrderId: 'offline-order-1',
    orderNumber: 'TT-20260730-009',
    status: 'pending',
    items: '[]',
    total: 120,
    createdAt: '2026-07-30T11:00:00.000Z',
    updatedAt: '2026-07-30T11:00:00.000Z',
    syncStatus: 'pending',
    isSynced: 0
  } as any);

  cloudRows.orders = [];
  await getOrders();

  const pending = await db.orders.where('clientOrderId').equals('offline-order-1').first();
  assert.ok(pending, 'a read must never drop an order the cloud has not accepted yet');
  assert.equal(pending.syncStatus, 'pending');
});

test('a cloud order whose id collides with a local order does not overwrite it', async () => {
  await reset();

  // Taken offline on this device; Dexie handed it key 1.
  const localKey = await db.orders.add({
    clientOrderId: 'offline-order-1',
    orderNumber: 'TT-20260730-009',
    status: 'pending',
    items: '[]',
    total: 120,
    createdAt: '2026-07-30T11:00:00.000Z',
    updatedAt: '2026-07-30T11:00:00.000Z',
    syncStatus: 'pending',
    isSynced: 0
  } as any);

  // A different order, from another till, that happens to carry the same id.
  cloudRows.orders = [{
    id: localKey,
    client_order_id: 'cloud-order-7',
    order_number: 'TT-20260730-011',
    status: 'ready',
    items: [],
    total: 480,
    created_at: '2026-07-30T11:30:00.000Z',
    updated_at: '2026-07-30T11:30:00.000Z'
  }];

  await getOrders();

  const survivor = await db.orders.where('clientOrderId').equals('offline-order-1').first();
  assert.ok(survivor, 'the local order must not be overwritten by an unrelated cloud order');
  assert.equal(survivor.total, 120);

  const incoming = await db.orders.where('clientOrderId').equals('cloud-order-7').first();
  assert.ok(incoming, 'the cloud order is still stored, under a fresh local key');
  assert.notEqual(incoming.id, survivor.id);
});

// ── Offline fallback ────────────────────────────────────────────

test('an unreachable cloud falls back to the cached rows rather than failing', async () => {
  await reset();

  cloudRows.menu_categories = [{ id: 42, name: 'Live Cloud Category', sort_order: 1, is_active: true }];
  await getCategories();

  markCloudDataStale();
  networkDown = true;

  const categories = await getCategories();
  assert.deepEqual(
    categories.map((c: any) => c.name),
    ['Live Cloud Category'],
    'the last known menu keeps the till trading through an outage'
  );
});

test('an offline device serves its cache instead of failing the read', async () => {
  await reset();
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false },
    configurable: true,
    writable: true
  });
  networkDown = true;

  await db.menuCategories.put({ id: 7, name: 'Cached Category', sortOrder: 1, isActive: 1 });

  const categories = await getCategories();
  assert.deepEqual(categories.map((c: any) => c.name), ['Cached Category']);
});

test('a failed pull is not cached as fresh, so the next read retries the cloud', async () => {
  await reset();

  networkDown = true;
  const first = await ensureFresh(['categories']);
  assert.equal(first.ok, false);
  assert.deepEqual(first.stale, ['categories']);

  networkDown = false;
  cloudRows.menu_categories = [{ id: 42, name: 'Live Cloud Category', sort_order: 1, is_active: true }];
  const second = await ensureFresh(['categories']);
  assert.equal(second.ok, true, 'the read must go back to the cloud instead of trusting the cache');
});

// ── Cost control: one query per resource, not per caller ────────

test('concurrent reads of the same resource share a single query', async () => {
  await reset();

  cloudRows.menu_categories = [{ id: 42, name: 'Live Cloud Category', sort_order: 1, is_active: true }];
  cloudRows.menu_items = [
    { id: 1, category_id: 42, name: 'Paneer Tikka', price: 240, is_available: true, is_veg: true, sort_order: 1 }
  ];

  await Promise.all([getCategories(), getCategories(), getAllItems(), getAllItems()]);

  assert.equal(restCalls('menu_categories').length, 1);
  assert.equal(restCalls('menu_items').length, 1);
});

test('a forced read bypasses the freshness window', async () => {
  await reset();

  cloudRows.orders = [];
  await getOrders();
  const afterFirst = restCalls('orders').length;

  await getOrders();
  assert.equal(restCalls('orders').length, afterFirst, 'a repeat read reuses the fresh window');

  await getOrders(null, true);
  assert.equal(restCalls('orders').length, afterFirst + 1, 'a forced read must hit Supabase');
});

// ── Freshness primitive ─────────────────────────────────────────

test('freshness tracker collapses concurrent pulls and honours its window', async () => {
  let now = 1_000;
  let pulls = 0;
  const tracker = createFreshnessTracker({ ttlMs: 100, now: () => now });

  const pull = async () => { pulls += 1; return true; };

  await Promise.all([tracker.run('orders', pull), tracker.run('orders', pull), tracker.run('orders', pull)]);
  assert.equal(pulls, 1, 'concurrent callers share one pull');

  await tracker.run('orders', pull);
  assert.equal(pulls, 1, 'a read inside the window reuses the pull');

  now += 101;
  await tracker.run('orders', pull);
  assert.equal(pulls, 2, 'the window expires');

  await tracker.run('orders', pull, { force: true });
  assert.equal(pulls, 3, 'force ignores the window');

  tracker.markStale('orders');
  assert.equal(tracker.isFresh('orders'), false);
  await tracker.run('orders', pull);
  assert.equal(pulls, 4, 'a retired window pulls again');
});

test('freshness tracker never caches a failed or throwing pull as fresh', async () => {
  const tracker = createFreshnessTracker({ ttlMs: 60_000 });

  assert.equal(await tracker.run('items', async () => false), false);
  assert.equal(tracker.isFresh('items'), false);

  assert.equal(await tracker.run('items', async () => { throw new Error('offline'); }), false);
  assert.equal(tracker.isFresh('items'), false);

  assert.equal(await tracker.run('items', async () => true), true);
  assert.equal(tracker.isFresh('items'), true);
});

// ── Wiring: no cloud-owned screen may read cache-first ──────────

test('every cloud-owned table is registered as a readable resource', () => {
  for (const resource of [
    'categories', 'items', 'orders', 'staff', 'tables',
    'inventory', 'suppliers', 'customers', 'shifts', 'recipes'
  ]) {
    assert.ok(CLOUD_RESOURCES.includes(resource), `${resource} must be readable from the cloud`);
  }
});

test('login hydration and individual reads share one pull implementation', () => {
  const source = readFileSync('src/services/cloudDb.ts', 'utf8');

  // fullPull must not carry its own copy of "how each table is fetched" — that
  // is how the two paths drifted apart in the first place.
  const fullPullStart = source.indexOf('export async function fullPull');
  assert.ok(fullPullStart > -1, 'cloudDb must still export fullPull');
  const fullPullBody = source.slice(fullPullStart, source.indexOf('\n}\n', fullPullStart));
  assert.doesNotMatch(fullPullBody, /\.from\(/, 'fullPull must delegate its queries to the resource registry');
  assert.match(fullPullBody, /ensureFresh\(names, \{ \.\.\.options, force: true \}\)/);
});

test('the local cache is never wiped on the strength of an empty cloud payload', () => {
  const source = readFileSync('src/services/cloudDb.ts', 'utf8');
  const pullBody = source.slice(source.indexOf('async function pullResource'));
  assert.match(pullBody, /if \(rows\.length === 0\)/);
  assert.match(pullBody, /return true;/);
});

test('screens that read cloud-owned tables pull before reading Dexie', () => {
  const entryPoints: Array<[string, string[]]> = [
    ['src/db/database.ts', ['refreshFromCloud']],
    ['src/services/tables.ts', ['ensureFresh']],
    ['src/services/inventory.ts', ['ensureFresh']],
    ['src/services/analytics.ts', ['ensureFresh']],
    ['src/views/admin/MenuManager.tsx', ['ensureFresh']],
    ['src/views/admin/Dashboard.tsx', ['ensureFresh']],
    ['src/views/admin/OrderHistory.tsx', ['ensureFresh']],
    ['src/views/admin/AdminView.tsx', ['ensureFresh']],
    ['src/views/admin/BrandingView.tsx', ['ensureFresh']],
    ['src/views/staff/StaffView.tsx', ['ensureFresh']],
    ['src/views/customers/CustomersView.tsx', ['ensureFresh']],
    ['src/views/inventory/InventoryView.tsx', ['ensureFresh']],
    ['src/views/channels/ChannelHub.tsx', ['ensureFresh']]
  ];

  for (const [path, needles] of entryPoints) {
    const source = readFileSync(path, 'utf8');
    for (const needle of needles) {
      assert.match(source, new RegExp(`await ${needle}\\(`), `${path} must refresh from the cloud before reading`);
    }
  }
});

test('the menu, order and reporting reads in the data layer are all online-first', () => {
  const source = readFileSync('src/db/database.ts', 'utf8');

  for (const fn of [
    'getCategories', 'getAllItems', 'getItemsByCategory',
    'getOrders', 'getTodayStats', 'getNextOrderNumber'
  ]) {
    const body = source.slice(source.indexOf(`export async function ${fn}(`));
    const refreshAt = body.indexOf('refreshFromCloud(');
    const dexieAt = body.search(/await db\.\w+/);
    assert.ok(refreshAt > -1, `${fn} must refresh from the cloud`);
    assert.ok(
      dexieAt === -1 || refreshAt < dexieAt,
      `${fn} must pull from the cloud before falling back to the local cache`
    );
  }
});

// ── Local changes the cloud has not accepted yet ─────────────────

/**
 * Reproduces "the kitchen says the order was cancelled and nothing happens".
 *
 * Cancelling from the KDS writes the new status locally, then pushes it. When
 * the push cannot go out — no cloud session, a dropped connection — the change
 * is queued and the board is told so. The very next read then pulled the order
 * back from Supabase, still active, and hydration wrote it straight over the
 * queued local change: the card reappeared, the queued push was gone, and the
 * operator had been shown a success message.
 */
test('a queued local change is not overwritten by the next cloud read', async () => {
  await reset();

  await db.orders.add({
    clientOrderId: 'kds-order-1',
    orderNumber: 'TT-20260730-021',
    status: 'cancelled',           // cancelled on this device...
    items: '[]',
    total: 300,
    createdAt: '2026-07-30T09:00:00.000Z',
    updatedAt: '2026-07-30T12:00:00.000Z',
    syncStatus: 'pending',         // ...and not yet accepted by the cloud
    isSynced: 0
  } as any);

  cloudRows.orders = [{
    id: 500,
    client_order_id: 'kds-order-1',
    order_number: 'TT-20260730-021',
    status: 'preparing',           // the cloud still has it live
    items: [],
    total: 300,
    created_at: '2026-07-30T09:00:00.000Z',
    updated_at: '2026-07-30T09:00:00.000Z'
  }];

  const orders = await getOrders();

  const order = orders.find((o: any) => o.clientOrderId === 'kds-order-1');
  assert.equal(order.status, 'cancelled', 'the queued cancellation must survive the read');
  assert.equal(order.syncStatus, 'pending', 'and must still be queued for the cloud');
});

test('a menu edit made offline is not discarded by the next cloud read', async () => {
  await reset();

  await db.menuItems.put({
    id: 1, categoryId: 42, name: 'Paneer Tikka',
    price: 260,                    // repriced on this device
    isAvailable: 1, isVeg: 1, sortOrder: 1,
    isSynced: 0                    // not pushed yet
  } as any);

  cloudRows.menu_items = [
    { id: 1, category_id: 42, name: 'Paneer Tikka', price: 240, is_available: true, is_veg: true, sort_order: 1 }
  ];

  const items = await getAllItems();
  assert.equal(items[0].price, 260, 'an unpushed price change must not be reverted by a read');
});

test('an item created offline is not pruned by a read that cannot see it yet', async () => {
  await reset();

  await db.menuItems.put({
    id: 99, categoryId: 42, name: 'New Special',
    price: 199, isAvailable: 1, isVeg: 1, sortOrder: 9,
    isSynced: 0
  } as any);

  cloudRows.menu_items = [
    { id: 1, category_id: 42, name: 'Paneer Tikka', price: 240, is_available: true, is_veg: true, sort_order: 1 }
  ];

  await getAllItems();
  const created = await db.menuItems.get(99);
  assert.ok(created, 'a dish created offline must survive until it has been pushed');
});

/**
 * Recording a payment must not be undone by the read-through in getOrder().
 *
 * updatePayment wrote the payment locally and then read the order back with
 * getOrder(), which is a *cloud* read: it replaced the row it had just written
 * with the server's older copy, and pushed that copy back up. The till showed
 * the bill settled while Supabase — and every other device — kept it unpaid.
 * updateOrderStatus already had this fixed; the payment path did not.
 */
test('recording a payment survives the push and reaches the cloud', async () => {
  await reset();

  const { updatePayment } = await import('../src/db/database');

  const localId = await db.orders.add({
    clientOrderId: 'pay-order-1',
    orderNumber: 'TT-20260730-031',
    status: 'ready',
    items: '[]',
    subtotal: 400, tax: 20, total: 420,
    paymentMethod: null,
    paymentStatus: 'unpaid',
    createdAt: '2026-07-30T13:00:00.000Z',
    updatedAt: '2026-07-30T13:00:00.000Z',
    syncStatus: 'synced',
    isSynced: 1
  } as any);

  // The cloud still has it unpaid — the state a read-through would restore.
  cloudRows.orders = [{
    id: 700,
    client_order_id: 'pay-order-1',
    order_number: 'TT-20260730-031',
    status: 'ready',
    items: [],
    total: 420,
    payment_status: 'unpaid',
    created_at: '2026-07-30T13:00:00.000Z',
    updated_at: '2026-07-30T13:00:00.000Z'
  }];

  await updatePayment(localId, 'cash', 'paid', { paymentVerifiedBy: 'Aarav' });

  const settled = await db.orders.get(localId);
  assert.equal(settled.paymentStatus, 'paid', 'the recorded payment must not be reverted');
  assert.equal(settled.paymentMethod, 'cash');
});
