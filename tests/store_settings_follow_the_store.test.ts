// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

/**
 * "That's the problem — everything should go to cloud."
 *
 * It didn't. Only the tax rate and the delivery fee left the device; the restaurant's name, its
 * UPI ID, its receipt and invoice wording all lived in whichever browser typed them. Set the UPI
 * ID on the laptop and the phone still had none. Configure till 1 and till 2 printed differently.
 * Replace a device and the configuration went with it.
 *
 * `store_settings` is one row per store per key, staff-read and manager-write. The split that
 * matters is which keys go: a restaurant has one name and one UPI ID, but each till has its own
 * printer and each person their own theme, so those stay put. A key is store-scoped *unless* it is
 * listed as device-local — the safer direction to be wrong in, because a shared value turning up
 * on a second till is a surprise someone can undo and a credential leaking to every screen is not.
 */

const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
const latest = readFileSync('supabase/migrations/20260822120000_store_settings_follow_the_store.sql', 'utf8');
const service = readFileSync('src/services/storeSettings.ts', 'utf8');
const cloudDb = readFileSync('src/services/cloudDb.ts', 'utf8');
const settingsView = readFileSync('src/views/admin/Settings.tsx', 'utf8');

test('the table exists, keyed per store and per setting', () => {
  assert.match(latest, /create table if not exists public\.store_settings/);
  assert.match(latest, /primary key \(store_id, key\)/,
    'one row per store per key, so a new setting needs no migration');
  assert.match(latest, /alter table public\.store_settings enable row level security;/);
});

test('the storefront cannot read it', () => {
  // Some of what lands here is public (the address) and some is not (whatever gets added next).
  // The table cannot tell them apart, and the storefront does not need it.
  assert.match(latest, /revoke all on table public\.store_settings from anon, authenticated;/);
  assert.match(latest, /grant select on table public\.store_settings to authenticated;/);
  assert.doesNotMatch(latest, /grant select[^;]*store_settings[^;]*to anon/);

  const read = latest.slice(latest.indexOf('create policy "staff read store settings"'), latest.indexOf('-- ── Write'));
  assert.doesNotMatch(read, /to anon/);
});

test('only the roles that may already change money can write it', () => {
  for (const name of ['managers write store settings', 'managers update store settings']) {
    const policy = latest.slice(latest.indexOf(`create policy "${name}"`));
    const body = policy.slice(0, policy.indexOf(';') + 1);
    assert.match(body, /array\['developer','owner','manager'\]/,
      `${name} must not admit a cashier — the UPI ID is worth real money`);
    assert.doesNotMatch(body, /'cashier'/);
  }
  assert.doesNotMatch(latest, /create policy[^;]*on public\.store_settings\s*\n\s*for delete/,
    'a delete policy would let one device blank another device"s configuration');
});

test('updated_at is the server\'s, not the client\'s', () => {
  assert.match(latest, /create or replace function public\.touch_store_settings\(\)/);
  assert.match(latest, /new\.updated_at := now\(\);/);
  assert.match(latest, /before insert or update on public\.store_settings/);
});

test('the keys that describe one machine stay on it', () => {
  const local = service.slice(service.indexOf('DEVICE_LOCAL_SETTINGS'), service.indexOf('export const isStoreScoped'));
  for (const key of ['supabaseUrl', 'supabaseKey', 'supabaseEmail', 'googleClientId']) {
    assert.ok(local.includes(`'${key}'`), `${key} is a credential and must never be shared`);
  }
  for (const key of ['printerWidth', 'printDensity', 'printCopies', 'autoPrintOnConfirm']) {
    assert.ok(local.includes(`'${key}'`), `${key} describes this till's printer`);
  }
  assert.ok(local.includes("'app_theme'"), 'the theme belongs to the person, not the restaurant');

  // The tax rate has one home already; two would be the bug that started all of this.
  assert.ok(local.includes("'gstPercent'") && local.includes("'deliveryFee'"),
    'the rates are owned by store_security_settings, which prices orders server-side');
});

test('a setting is shared unless it is on that list', () => {
  assert.match(service, /export const isStoreScoped = \(key: string\) => !DEVICE_LOCAL_SETTINGS\.has\(key\);/);
  // Both directions use the same predicate, so a key cannot be pushed but not pulled.
  assert.match(service, /\.filter\(\(\[key\]\) => isStoreScoped\(key\)\)/);
  assert.match(service, /rows\.filter\(\(row\) => row && typeof row\.key === 'string' && isStoreScoped\(row\.key\)\)/);
});

test('the cloud is written before the device is', () => {
  const publish = service.slice(service.indexOf('export async function publishStoreSettings'), service.indexOf('export async function hydrateStoreSettings'));
  const upsert = publish.indexOf(".from('store_settings')");
  const cache = publish.indexOf('await setSetting(row.key, row.value)');
  assert.ok(upsert > -1 && cache > upsert, 'caching first leaves a device showing a value the server refused');

  // An upsert the policy filtered out returns 200 with no rows.
  assert.match(publish, /\.select\('key, value'\)/);
  assert.match(publish, /if \(!data\?\.length\) \{/);
  assert.match(publish, /Manager access is required\./);
  assert.match(publish, /onConflict: 'store_id,key'/);
});

test('the pull brings them back down', () => {
  assert.match(cloudDb, /storeSettings: \{\s*\n\s*table: 'store_settings',/);
  assert.match(cloudDb, /hydrateStoreSettings/);
  assert.match(cloudDb, /KITCHEN_RESOURCES = \[[^\]]*'storeSettings'\]/,
    'a kitchen or express till needs the store\'s own details too');
});

test('the Settings screen publishes what it saved', () => {
  const save = settingsView.slice(settingsView.indexOf('// Save all field values'), settingsView.indexOf('// Update cached variables'));
  assert.match(save, /const \{ publishStoreSettings \} = await import\('\.\.\/\.\.\/services\/storeSettings'\);/);
  assert.match(save, /const shared = await publishStoreSettings\(saved\);/);
  assert.match(save, /the other screens were not updated/,
    'a refused share has to say so — silently local is how this started');
});

test('the screen says which settings are this device\'s', () => {
  assert.match(settingsView, /Printer settings belong to this device/);
});
