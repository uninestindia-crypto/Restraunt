// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * "I saved the UPI link in Settings but after refreshing it gets lost."
 *
 * It was never saved. Three things had to line up, and they did:
 *
 * 1. `seedDatabase()` writes the store's default settings, but only on the branch that seeds a
 *    fresh menu — and it is only called for a *public* entry. A device that opens #/pos and signs
 *    in never runs it at all, so `db.settings` held exactly two keys, `gstPercent` and
 *    `deliveryFee`, the two the cloud pull writes. Confirmed on the live cloud:
 *      settings after boot: {"deliveryFee":"0","gstPercent":"0"}
 *
 * 2. With no `restaurantName` row, the Settings screen's own guard refused the save — every field,
 *    not just that one — and said so in a three-second toast on whatever tab the operator was on.
 *    Fill in the UPI ID on Payments, press Save All Configurations, and a warning about the store
 *    name flashes past on a tab you cannot see. Nothing is written. The screen reads as fake.
 *
 * 3. And a blank tax box published 0%: `Number('')` is 0, which passes `>= 0 && <= 30`. The live
 *    store rate was found at 0% with every order priced accordingly.
 *
 * The settings themselves were never dummy — `setSetting` has always written to IndexedDB. The
 * save just never got that far.
 */

const seed = readFileSync('src/db/seed.ts', 'utf8');
const main = readFileSync('src/main.ts', 'utf8');
const settings = readFileSync('src/views/admin/Settings.tsx', 'utf8');
const database = readFileSync('src/db/database.ts', 'utf8');

test('a setting is written to IndexedDB, not held in component state', () => {
  // The premise of the whole report. If this ever stops being true the rest is moot.
  assert.match(database, /export async function setSetting\(key, value\) \{[\s\S]*?db\.settings\.put\(\{ key, value \}\)/);
});

test('the store defaults are filled on every boot, not only on the seed path', () => {
  assert.match(seed, /export async function ensureDefaultSettings\(\)/);
  assert.match(main, /import \{ seedDatabase, ensureDefaultSettings \} from '\.\/db\/seed';/);
  assert.match(main, /await ensureDefaultSettings\(\)\.catch\(/,
    'it has to run for the staff portal too — seedDatabase() only runs for a public entry');

  // Before the settings are read into localStorage, or the first read still misses them.
  assert.ok(
    main.indexOf('await ensureDefaultSettings()') < main.indexOf("db.settings.get('currencySymbol')"),
    'the fill must happen before anything reads a setting'
  );
});

test('filling the gaps never overwrites what the owner set', () => {
  const fn = seed.slice(seed.indexOf('export async function ensureDefaultSettings'), seed.indexOf('* Seeds the database'));
  assert.match(fn, /=== undefined\) missing\.push\(setting\)/,
    'only a missing row is filled — an empty string is a deliberate empty, not a gap');
  assert.doesNotMatch(fn, /bulkPut\(DEFAULT_SETTINGS\)/,
    'writing the whole list would reset a saved UPI ID on the next refresh');
});

test('the fresh-device seed and the gap-fill share one list', () => {
  // Two copies is how the keys drifted apart in the first place.
  assert.match(seed, /const DEFAULT_SETTINGS: Array<\{ key: string; value: string \}> = \[/);
  assert.match(seed, /await db\.settings\.bulkPut\(DEFAULT_SETTINGS\);/);
  assert.equal((seed.match(/key: 'restaurantName'/g) || []).length, 1);
});

test('the required keys include the one the save guard tests', () => {
  const list = seed.slice(seed.indexOf('const DEFAULT_SETTINGS'), seed.indexOf('export async function ensureDefaultSettings'));
  for (const key of ['restaurantName', 'upiId', 'gstPercent', 'orderNumberPrefix']) {
    assert.ok(list.includes(`key: '${key}'`), `${key} is missing from the defaults`);
  }
});

test('a refused save lands the operator on the field it is waiting on', () => {
  assert.match(settings, /const REQUIRED_FIELDS: Array<\{ key: string; label: string; tab: 'profile' \| 'payments'; why: string \}>/);
  assert.match(settings, /\{ key: 'restaurantName', label: 'Store Name', tab: 'profile'/);
  assert.match(settings, /\{ key: 'upiId', label: 'UPI ID \(VPA\)', tab: 'payments'/);

  const guard = settings.slice(settings.indexOf('const handleSave'), settings.indexOf('// Save all field values'));
  assert.match(guard, /const missing = REQUIRED_FIELDS\.find\(/);
  assert.match(guard, /focusRequiredField\(missing\)/, 'the tab has to change, or the message names a field nobody can see');
  assert.match(guard, /nothing was saved\./, 'the operator has to know the rest of the form went nowhere');

  // The old shape: two separate guards that only toasted.
  assert.doesNotMatch(settings, /showToast\('Restaurant name is required', 'warning'\)/);
  assert.doesNotMatch(settings, /showToast\('UPI ID is required for checkout QR generation', 'warning'\)/);
});

test('the field says so too, not just a toast that fades', () => {
  assert.match(settings, /'aria-invalid': invalidKey === key/);
  assert.match(settings, /'aria-describedby': invalidKey === key \? `setting-\$\{key\}-error` : undefined/);
  assert.match(settings, /borderColor: 'var\(--color-danger\)'/);
  assert.match(settings, /Needed before anything on this screen can be saved/);

  // Both required inputs are wired to it, and labels point at them.
  for (const key of ['restaurantName', 'upiId']) {
    assert.match(settings, new RegExp(`htmlFor="setting-${key}"`), `${key} label is not associated`);
    assert.match(settings, new RegExp(`requiredFieldProps\\('${key}'\\)`), `${key} input is not marked`);
    assert.match(settings, new RegExp(`fieldError\\('${key}'\\)`), `${key} has no error text`);
  }
});

test('the marker clears as soon as the field is typed into', () => {
  // Validate on blur, re-validate on change only after a field has errored — the Field contract.
  assert.match(settings, /if \(invalidKey === key && String\(value\)\.trim\(\)\) setInvalidKey\(''\);/);
});

test('a blank tax box does not publish 0% to the whole store', () => {
  assert.match(settings, /const rawGst = String\(config\.gstPercent \?\? ''\)\.trim\(\);/);
  assert.match(settings, /const gst = rawGst === '' \? NaN : Number\(rawGst\);/,
    "Number('') is 0, and 0 passes every range check below it");
  assert.match(settings, /Tax rate is blank, so it was left as it is\. Type 0 if you charge no tax\./);

  // 0 typed deliberately must still publish — a store may genuinely charge no tax.
  const branch = settings.slice(settings.indexOf('const rawGst'), settings.indexOf('// Update cached variables'));
  assert.match(branch, /Number\.isFinite\(gst\) && gst >= 0 && gst <= 30/);
});

test('the success message says what happened', () => {
  assert.match(settings, /showToast\('Settings saved\.', 'success'\)/);
  assert.doesNotMatch(settings, /Settings saved successfully\. 🎨/);
});
