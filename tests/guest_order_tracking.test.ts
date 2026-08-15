// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/**
 * "Live order tracking" that could not track.
 *
 * A guest has no Supabase session, and `anon` deliberately holds no select on `orders` — one grant
 * there would expose every customer's name, phone and delivery address to anyone holding the
 * publishable key, which is shipped in the bundle. The storefront polled that table anyway, every
 * ten seconds, and was refused every time:
 *
 *     42501 permission denied for table orders
 *     hint: GRANT SELECT ON public.orders TO anon;
 *
 * The guard was `if (!error && data)`, so the refusal was swallowed and the screen kept showing
 * the status the order had at the moment it was placed. The hint, followed literally, would have
 * turned a broken feature into a data breach.
 *
 * Status now comes from the `public-order` Edge Function under the service role, scoped to the one
 * order whose client_order_id is presented — a v4 UUID the customer's own device minted.
 */

const client = readFileSync('src/services/customerPlatform.ts', 'utf8');
const fn = readFileSync('supabase/functions/public-order/index.ts', 'utf8');

test('the storefront never selects from orders directly', () => {
  // Any anon-context read of this table is either refused or, if someone "fixes" the grant, a leak.
  assert.doesNotMatch(
    client.slice(client.indexOf('export async function fetchLiveOrder')),
    /\.from\('orders'\)/,
    'guest code must not query orders through PostgREST'
  );
  assert.match(
    client,
    /supabase\.functions\.invoke\('public-order', \{\s*\n?\s*body: \{ action: 'status'/,
    'status must come from the Edge Function'
  );
});

test('a refused status lookup is reported, not swallowed', () => {
  const body = client.slice(
    client.indexOf('export async function fetchLiveOrder'),
    client.indexOf('export async function fetchCustomerOffers')
  );
  assert.match(body, /if \(error\) \{/, 'an error path that logs nothing is how this hid for so long');
});

test('the function answers status for exactly one order, never a listing', () => {
  const branch = fn.slice(fn.indexOf('action === "status"'), fn.indexOf('const clientOrderId = cleanText'));

  assert.match(branch, /\.eq\("client_order_id", wanted\)/, 'scoped to the presented id');
  assert.match(branch, /\.eq\("store_id", STORE_ID\)/);
  assert.match(branch, /\.maybeSingle\(\)/, 'one row, never a collection');

  // A short or empty id must not be allowed to probe.
  assert.match(branch, /wanted\.length < 20/, 'a guessable identifier is not a capability');

  // The tracking screen needs status, not the customer record.
  assert.doesNotMatch(branch, /select\(\s*"\*"/, 'never return the whole row');
  for (const leak of ['customer_phone', 'customer_name', 'delivery_address', 'auth_user_id']) {
    assert.equal(branch.includes(leak), false, `status payload must not carry ${leak}`);
  }
});

test('anon is never granted select on orders', () => {
  const dir = 'supabase/migrations';
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n').toLowerCase();

  for (const [stmt, privileges, table, grantee] of
    sql.matchAll(/grant ([^;]*?) on (?:table )?([^;]*?\borders\b[^;]*?) to ([^;]+);/g)) {
    if (!/\banon\b/.test(grantee)) continue;
    assert.fail(`anon must never hold privileges on orders: ${stmt.trim().slice(0, 140)}`);
  }
});
