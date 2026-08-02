import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Two tills billing at the same moment must not lose a sale.
 *
 * Order numbers are handed out per device by counting the day's orders, but
 * Postgres holds `unique (store_id, order_number)`. When two tills computed the
 * same number, the second insert was refused and the customer standing at that
 * till got "Checkout Aborted: Direct cloud write failed" — a real sale lost to
 * a clash the app could simply have stepped past.
 */

const source = readFileSync('src/db/database.ts', 'utf8');
const schema = readFileSync('supabase/migrations/20260628000000_initial_schema.sql', 'utf8');

test('the constraint this guards against is still in the schema', () => {
  assert.match(schema, /unique \(store_id, order_number\)/);
});

test('a taken order number is retried, not surfaced as a failed checkout', () => {
  const body = source.slice(source.indexOf('export async function createOrder'), source.indexOf('export async function getOrders'));

  assert.match(body, /23505/, 'a unique violation must be recognised');
  assert.match(body, /order_number/i);
  assert.match(body, /bumpOrderNumber\(remoteOrder\.order_number, 1\)/);
  assert.match(body, /attempt >= 4/, 'the retry must be bounded');
});

test('the same order submitted twice is treated as already banked', () => {
  const body = source.slice(source.indexOf('export async function createOrder'), source.indexOf('export async function getOrders'));
  // A clash on client_order_id means this exact order is already in the cloud.
  assert.match(body, /if \(conflict && !onOrderNumber\)/);
  assert.match(body, /\.eq\('client_order_id', clientOrderId\)/);
});

test('bumpOrderNumber steps past a taken number and keeps its shape', async () => {
  const { bumpOrderNumber } = await import('../src/db/database');

  assert.equal(bumpOrderNumber('TT-20260802-007'), 'TT-20260802-008');
  assert.equal(bumpOrderNumber('TT-20260802-099'), 'TT-20260802-100');
  assert.equal(bumpOrderNumber('TT-20260802-007', 3), 'TT-20260802-010');

  // Width is preserved, so the kitchen keeps reading a fixed-length token.
  assert.equal(bumpOrderNumber('TT-20260802-001').length, 'TT-20260802-001'.length);

  // A number with no numeric tail must still change, or the retry loops on the
  // same rejected value.
  const odd = bumpOrderNumber('TT-FALLBACK');
  assert.notEqual(odd, 'TT-FALLBACK');
  assert.match(odd, /^TT-FALLBACK-\d{4}$/);
});
