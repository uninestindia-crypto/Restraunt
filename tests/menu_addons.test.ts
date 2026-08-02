import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Per-dish descriptions and paid add-ons.
 *
 * Add-ons change what a customer pays, so the rule that already governs the
 * dish price governs them too: the client says *which* add-ons were chosen and
 * the server decides what they cost. A client that sends prices, or an add-on
 * attached to a dish it does not belong to, must not be able to move the total.
 */

const edge = readFileSync('supabase/functions/public-order/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260802120000_menu_descriptions_and_addons.sql', 'utf8');

test('add-on prices are read from the database, never from the request', () => {
  assert.match(edge, /from\("menu_item_addons"\)/);
  assert.match(edge, /\.select\("id, menu_item_id, name, price"\)/);
  assert.match(edge, /\.eq\("is_active", true\)/);

  // The line price is the dish price plus prices looked up server-side.
  assert.match(edge, /const addonsPrice = addons\.reduce\(/);
  assert.match(edge, /const price = \(Number\(menu\.price\) \|\| 0\) \+ addonsPrice;/);

  // Nothing price-shaped is taken off the incoming item.
  const normaliser = edge.slice(edge.indexOf('const normalizedItems = items.map'), edge.indexOf('if (normalizedItems.some'));
  assert.doesNotMatch(normaliser, /price/i, 'the payload normaliser must not read any price from the client');
});

test('an add-on belonging to another dish is refused', () => {
  assert.match(edge, /Number\(addon\.menu_item_id\) !== item\.itemId/);
  assert.match(edge, /One or more selected add-ons are unavailable/);
});

test('the client sends add-on ids only', () => {
  const client = readFileSync('src/services/publicOrders.ts', 'utf8');
  const payload = client.slice(client.indexOf('return items.map'), client.indexOf('export function buildPublicOrderPayload'));
  assert.match(payload, /addonIds:/);
  assert.doesNotMatch(payload, /addonPrice|price:/, 'the payload must not carry add-on prices');
});

test('add-ons are readable by a customer only while they are on offer', () => {
  assert.match(migration, /create policy "public active menu addons read" on public\.menu_item_addons/);
  assert.match(migration, /for select to anon, authenticated using \(is_active\)/);

  // Writing them is a manager's job, like the rest of the menu.
  assert.match(migration, /create policy "managers write menu_item_addons"/);
  assert.match(migration, /array\['developer','owner','manager'\]/);
});

test('an add-on cannot outlive the dish it belongs to', () => {
  assert.match(migration, /menu_item_id bigint not null references public\.menu_items\(id\) on delete cascade/);
});

test('dish descriptions travel to the cloud with the dish', () => {
  const sync = readFileSync('src/services/sync.ts', 'utf8');
  const toRemote = sync.slice(sync.indexOf('function mapItemToRemote'), sync.indexOf('export function mapItemToLocal'));
  assert.match(toRemote, /description: String\(item\.description \|\| ''\)/);
  assert.match(migration, /add column if not exists description text not null default ''/);
});

test('two portions of one dish are separate lines when ordered differently', async () => {
  const { globalStore } = await import('../src/store/Store');

  const dish = { id: 7, name: 'Masala Fries', price: 90 };
  globalStore.clearCart();

  globalStore.addToCart({ ...dish, price: 110 }, 1, 'Spicy: Mild | Add-ons: Extra Cheese', {
    addonIds: [3], addons: [{ id: 3, name: 'Extra Cheese', price: 20 }], spiceLevel: 'Mild'
  });
  globalStore.addToCart({ ...dish }, 1, 'Spicy: Spicy', { addonIds: [], addons: [], spiceLevel: 'Spicy' });

  assert.equal(globalStore.getState().cart.length, 2, 'different add-ons or spice must not merge');

  // The same choices merge, so a customer tapping twice gets quantity 2.
  globalStore.addToCart({ ...dish, price: 110 }, 1, 'Spicy: Mild | Add-ons: Extra Cheese', {
    addonIds: [3], addons: [{ id: 3, name: 'Extra Cheese', price: 20 }], spiceLevel: 'Mild'
  });
  const cart = globalStore.getState().cart;
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 2);
  assert.deepEqual(cart[0].addonIds, [3]);

  globalStore.clearCart();
});

test('a plain add still merges by dish, as the POS relies on', async () => {
  const { globalStore } = await import('../src/store/Store');
  globalStore.clearCart();
  globalStore.addToCart({ id: 9, name: 'Veg Roll', price: 65 }, 1);
  globalStore.addToCart({ id: 9, name: 'Veg Roll', price: 65 }, 2);
  const cart = globalStore.getState().cart;
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  globalStore.clearCart();
});
