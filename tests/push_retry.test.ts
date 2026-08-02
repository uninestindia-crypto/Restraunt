import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Cover for silently lost writes.
 *
 * `pushUnsynced()` retries exactly the rows flagged `isSynced: 0`. Every
 * replication helper except `syncUpOrder` used to log a skipped or failed push
 * and return, leaving the row flagged `isSynced: 1` from its last hydration —
 * so it was never retried. The edit stayed on that device, and once reads
 * became online-first the next read replaced it with the server's older copy.
 *
 * A checkout's stock deduction goes through this path, so the effect was stock
 * quietly not decreasing store-wide.
 */

const source = readFileSync('src/services/sync.ts', 'utf8');

/** Replication helpers that own a locally-edited row. */
const PUSH_FUNCTIONS = [
  'syncUpItem', 'syncUpCategory', 'syncUpStaff', 'syncUpTable', 'syncUpInventory',
  'syncUpSupplier', 'syncUpShift', 'syncUpActivity', 'syncUpCustomer', 'syncUpRecipe'
];

function bodyOf(name: string) {
  const start = source.indexOf(`  async ${name}(`);
  assert.ok(start > -1, `sync.ts must still define ${name}`);
  return source.slice(start, source.indexOf('\n  }\n', start));
}

test('every push flags the row for a later retry when it cannot reach the cloud', () => {
  for (const name of PUSH_FUNCTIONS) {
    const body = bodyOf(name);

    const skipIndex = body.indexOf('Skipping');
    const returnIndex = body.indexOf('return;');
    const markBeforeReturn = body.lastIndexOf('markPushPending', returnIndex);
    assert.ok(
      skipIndex > -1 && markBeforeReturn > skipIndex,
      `${name} must flag the row before returning on a disconnected push`
    );

    const catchIndex = body.indexOf('} catch (e) {');
    assert.ok(catchIndex > -1, `${name} must still handle push failures`);
    assert.ok(
      body.indexOf('markPushPending', catchIndex) > -1,
      `${name} must flag the row when the push fails, or it is never retried`
    );
  }
});

test('the retry flag is written without re-triggering the replication hooks', () => {
  const helper = source.slice(source.indexOf('  async markPushPending('));

  // The Dexie hooks skip while isSyncingFromServer is set; without it this
  // bookkeeping write would schedule another push, and that one another.
  assert.match(helper, /this\.isSyncingFromServer = true;/);
  assert.match(helper, /await store\.update\(id, \{ isSynced: 0 \}\);/);
  assert.match(helper, /finally \{\s*\n\s*this\.isSyncingFromServer = false;/);
});

test('a row with no primary key is not flagged', () => {
  const helper = source.slice(source.indexOf('  async markPushPending('));
  assert.match(helper, /if \(id === undefined \|\| id === null\) return;/);
});

test('pushUnsynced retries exactly the rows those pushes flag', () => {
  // The contract the flag depends on: if this filter changes, marking the row
  // stops meaning "retry me".
  for (const store of [
    'db.menuCategories', 'db.menuItems', 'db.orders', 'db.staff',
    'db.inventory', 'db.suppliers', 'db.shifts', 'db.activityLog', 'db.customers'
  ]) {
    assert.match(
      source,
      new RegExp(`${store.replace('.', '\\.')}\\.filter\\(\\w+ => !\\w+\\.isSynced\\)`),
      `pushUnsynced must retry unsynced rows in ${store}`
    );
  }
});
