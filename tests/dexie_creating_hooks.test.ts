// @ts-nocheck
import 'fake-indexeddb/auto'; // must precede Dexie: it binds the global at import time
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Dexie from 'dexie';

/**
 * Everything the owner created was saved locally and never left the device.
 *
 * Dexie does not know an auto-incremented key while a `creating` hook is running. `primKey` is
 * undefined there; the generated key arrives on the hook's own `onsuccess`. Every table in this
 * schema is declared `++id`, and all eleven creating hooks did `await table.get(primKey)`, so all
 * eleven threw:
 *
 *     TypeError: Invalid argument to Table.get()
 *
 * inside a setTimeout, after the local write had already committed. A new menu item, category,
 * staff member, table, supplier, recipe or inventory line appeared on the screen that created it,
 * was never pushed to Supabase, and vanished at the next hydration. Nothing failed visibly.
 *
 * The first test pins Dexie's actual contract, so the reason the fix exists cannot be forgotten.
 */

test('Dexie really does withhold the key from a creating hook on ++id tables', async () => {
  const db = new Dexie(`hook-contract-${Math.random()}`);
  db.version(1).stores({ things: '++id, name' });

  const seenInHook = [];
  const seenOnSuccess = [];

  db.things.hook('creating', function (primKey, obj) {
    seenInHook.push(primKey);
    this.onsuccess = (pk) => seenOnSuccess.push(pk);
  });

  await db.things.add({ name: 'first' });
  await db.things.add({ name: 'second' });

  assert.deepEqual(seenInHook, [undefined, undefined],
    'if this ever changes, the helper below can be simplified — until then, primKey is not the key');
  assert.deepEqual(seenOnSuccess, [1, 2], 'the generated key is delivered on onsuccess');

  // And the call that used to be made, to show what it did.
  await assert.rejects(() => db.things.get(undefined), /Invalid argument/);
  await db.delete();
});

const sync = readFileSync('src/services/sync.ts', 'utf8');

test('every creating hook reads the key Dexie actually provides', () => {
  // Take the rest of each hook's line; the argument itself contains parentheses, so a
  // balanced-paren regex is more trouble than it is worth here.
  const hooks = sync.split('\n').filter((l) => l.includes(".hook('creating'"));
  assert.ok(hooks.length >= 11, `expected the schema's creating hooks, found ${hooks.length}`);

  for (const h of hooks) {
    assert.match(h, /this\.createHook\(/,
      `a creating hook must go through createHook, which knows the key arrives on onsuccess: ${h.trim().slice(0, 90)}`);
  }

  // The shape that was broken: a creating hook whose body reads primKey. The `updating` hooks
  // legitimately do so — there the key exists — so this looks only at creating-hook lines.
  for (const h of hooks) {
    assert.doesNotMatch(h, /\.get\(primKey\)/,
      'primKey is undefined in a creating hook on an auto-incremented table');
  }
});

test('the helper takes the key from onsuccess and guards replication synchronously', () => {
  const start = sync.indexOf('  createHook(label: string');
  assert.ok(start > -1, 'createHook helper not found');
  const helper = sync.slice(start, sync.indexOf('\n  setupLocalHooks() {', start));
  assert.ok(helper.length > 100, 'helper body came out empty — the slice bounds are wrong');

  assert.match(helper, /this\.onsuccess = \(primKey: any\) => \{/, 'the key comes from onsuccess');
  assert.match(helper, /await table\(\)\.get\(primKey\)/);

  // The guard must be evaluated before the deferral, not inside it: isHydrating() is only true for
  // the duration of the write that fired the hook, so a deferred check replicates the echo.
  const guard = helper.indexOf('if (isHydrating() || service.isSyncingFromServer) return;');
  const success = helper.indexOf('this.onsuccess');
  assert.ok(guard > -1 && guard < success, 'the replication guard must run before onsuccess is armed');

  // A plain function, not an arrow: `this` has to be Dexie's hook context to set onsuccess.
  assert.match(helper, /return function \(this: any, _primKey: any/,
    'an arrow function here would bind the wrong `this` and onsuccess would never fire');
});
