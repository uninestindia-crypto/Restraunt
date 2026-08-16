// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/**
 * The tax rate had three homes and no owner.
 *
 *   1. Per device — the client read `getSetting('gstPercent')` from IndexedDB, which is not a
 *      synced store and has no table. Two tills could charge differently.
 *   2. Per deployment — `public-order`, the only authority on what a customer actually pays, read
 *      `Deno.env.get("GST_PERCENT")`.
 *   3. Nowhere — `store_security_settings.gst_percent` existed, defaulted to 5.00, and was read by
 *      no code at all.
 *
 * They agreed only because all three sat at their 5% default. Changing the rate in Settings moved
 * the number the customer was *shown* and not the number they were *charged* — the same defect as
 * the storefront's ₹160/₹168 split, but across the client/server boundary, where the server wins.
 *
 * (3) is now the single source. These tests fail if any of the other two comes back.
 */

const fn = readFileSync('supabase/functions/public-order/index.ts', 'utf8');
const settings = readFileSync('src/views/admin/Settings.tsx', 'utf8');
const rates = readFileSync('src/services/storeRates.ts', 'utf8');
const cloudDb = readFileSync('src/services/cloudDb.ts', 'utf8');

const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'))
  .join('\n');

test('the order function prices from the table, never from its environment', () => {
  assert.match(fn, /\.from\("store_security_settings"\)\s*\n\s*\.select\("gst_percent, delivery_fee"\)/);
  assert.match(fn, /const rates = await storeRates\(supabase\);/);
  assert.match(fn, /subtotal \* \(rates\.gstPercent \/ 100\)/);
  assert.match(fn, /tax_percent: rates\.gstPercent,/);

  // The env var is the thing that made the Settings screen a lie.
  assert.doesNotMatch(fn, /Deno\.env\.get\("GST_PERCENT"\)/);
  assert.doesNotMatch(fn, /Deno\.env\.get\("DELIVERY_FEE"\)/);
});

test('the fallback is a last resort, not a second configuration point', () => {
  // A fallback that can be *set* is just the old bug with a new name. These are literals.
  assert.match(fn, /const FALLBACK_GST_PERCENT = 5;/);
  assert.match(fn, /const FALLBACK_DELIVERY_FEE = 0;/);
  assert.match(fn, /Could not read the store's rates; falling back/,
    'falling back silently is how a wrong rate goes unnoticed');
});

test('the Settings screen writes the rate to the server, not only to this device', () => {
  assert.match(settings, /const \{ publishStoreRates \} = await import\('\.\.\/\.\.\/services\/storeRates'\)/);
  assert.match(settings, /const published = await publishStoreRates\(\{ gstPercent: gst \}\)/);
  assert.match(settings, /if \(!published\.ok\)/, 'a refused write must be reported, not swallowed');
  assert.match(settings, /gst >= 0 && gst <= 30/, 'the client checks the range the column constrains');
});

test('a filtered update is not mistaken for a successful one', () => {
  // PostgREST answers an RLS-filtered UPDATE with 200 and zero rows, which is byte-identical to a
  // successful write unless the rows are asked for. A cashier saving Settings must not be told the
  // store's tax rate changed when the policy silently dropped it.
  assert.match(rates, /\.select\('gst_percent, delivery_fee'\)/);
  assert.match(rates, /if \(!data\?\.length\)/);
  assert.match(rates, /Manager access is required/);
});

test('the local cache is written after the server accepts, never before', () => {
  const body = rates.slice(rates.indexOf('export async function publishStoreRates'));
  const accepted = body.indexOf('if (!data?.length)');
  const cached = body.indexOf("setSetting('gstPercent'");
  assert.ok(accepted > -1 && cached > -1);
  assert.ok(accepted < cached,
    'caching before the server accepts leaves the device showing a rate the store never had');
});

test('the rate is pulled like any other cloud resource', () => {
  assert.match(cloudDb, /storeRates: \{\s*\n\s*table: 'store_security_settings',/);
  // The storefront prices a cart before anyone signs in, so the public pull has to include it.
  assert.match(cloudDb, /PUBLIC_RESOURCES = \['categories', 'items', 'addons', 'tables', 'storeRates'\]/);
});

test('the table is readable by the storefront and writable only by managers', () => {
  assert.match(migrations, /grant select \(store_id, gst_percent, delivery_fee, updated_at\)\s*\n\s*on table public\.store_security_settings to anon, authenticated;/);
  assert.match(migrations, /grant update \(gst_percent, delivery_fee, updated_at\)/,
    'the update grant must name its columns, so a later column is not writable by accident');
  assert.match(migrations, /public\.current_staff_role\(store_id\) in \('developer', 'owner', 'manager'\)/);

  // Nothing should be able to delete the row that prices the store's orders.
  assert.doesNotMatch(migrations, /grant delete[^;]*store_security_settings/);
});
