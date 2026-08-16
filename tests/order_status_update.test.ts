// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/**
 * The ticket that came back.
 *
 * Cancelling an order from the kitchen board removed the card and changed nothing. On the next
 * refresh the ticket returned. So did advancing it — the same push carried every lifecycle change.
 *
 * A status change was sent as a full-row upsert, `items` and money columns included.
 * `enforce_order_integrity` rebuilds `items` and every money column from the *live* menu whenever
 * the submitted items differ from the stored ones:
 *
 *     if tg_op = 'INSERT' or new.items is distinct from old.items then … recompute …
 *
 * and the update branch then refuses the write if anything it rebuilt no longer matches the stored
 * row:
 *
 *     raise exception 'Order identity, items, and totals are immutable';
 *
 * Two things made that certain rather than unlikely. The cached copy spells `isVeg` as `1` where
 * the server stores `true`, so the items always differed as jsonb and the rebuild always ran. And
 * the rebuild prices the order at today's menu, so the moment any dish on a ticket was repriced,
 * the rebuilt total could never equal the total the customer was actually charged.
 *
 * The fix is not to make the payload match. It is to stop sending columns that may not change.
 */

const sync = readFileSync('src/services/sync.ts', 'utf8');

/** The columns the trigger guards, read out of the migration rather than trusted from memory. */
function guardedColumns() {
  const dir = 'supabase/migrations';
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

  const raise = sql.indexOf("raise exception 'Order identity, items, and totals are immutable'");
  assert.ok(raise > -1, 'the immutability trigger was not found in any migration');

  const condition = sql.slice(sql.lastIndexOf('if new.', 0 + raise - 1200) || 0, raise);
  return new Set(
    [...condition.matchAll(/new\.([a-z_]+) is distinct from old\.\1/g)].map((m) => m[1])
  );
}

test('the client omits exactly the columns Postgres refuses to let change', () => {
  const guarded = guardedColumns();
  assert.ok(guarded.size >= 10, `parsed only ${guarded.size} guarded columns`);

  const listed = new Set(
    [...sync.slice(sync.indexOf('const IMMUTABLE_ORDER_COLUMNS'), sync.indexOf('];', sync.indexOf('const IMMUTABLE_ORDER_COLUMNS')))
      .matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  );

  for (const column of guarded) {
    assert.ok(listed.has(column),
      `the trigger guards "${column}" but IMMUTABLE_ORDER_COLUMNS does not list it — an update sending it will be refused`);
  }
  for (const column of listed) {
    assert.ok(guarded.has(column),
      `IMMUTABLE_ORDER_COLUMNS strips "${column}", which the trigger does not guard — that silently drops a legitimate update`);
  }
});

test('an order the server already has is updated, not re-upserted whole', () => {
  const fn = sync.slice(sync.indexOf('async syncUpOrder'), sync.indexOf('async syncUpActivity'));

  assert.match(fn, /if \(comparison\.row\) \{/,
    'the existing-row check is what distinguishes a lifecycle change from a first push');
  assert.match(fn, /for \(const column of IMMUTABLE_ORDER_COLUMNS\) delete patch\[column\];/);
  assert.match(fn, /\.update\(patch\)\s*\n\s*\.eq\('store_id', remote\.store_id\)\s*\n\s*\.eq\('client_order_id', remote\.client_order_id\)/,
    'the update must be scoped by the natural key it no longer sends in the payload');

  // A first push still has to carry everything, or the insert has no items.
  assert.match(fn, /supabase\.from\('orders'\)\.upsert\(remote, \{ onConflict: 'store_id,client_order_id' \}\)/);
});

test('a refusal from the database is recognised and surfaced, not swallowed', () => {
  // P0001 is what `raise exception` becomes. If this stops counting as a rejection, the local
  // optimistic write is never rolled back and the board silently disagrees with the server.
  assert.match(sync, /function isServerRejection/);
  assert.match(sync, /typeof error\?\.code === 'string' && \/\^\[0-9A-Z\]\{5\}\$\/\.test\(error\.code\)/);

  const db = readFileSync('src/db/database.ts', 'utf8');
  const upd = db.slice(db.indexOf('export async function updateOrderStatus'), db.indexOf('export async function updatePayment'));
  assert.match(upd, /if \(outcome\?\.rejected\) \{/);
  assert.match(upd, /return \{ applied: false, synced: false, error: outcome\.error \}/,
    'a refused change must report applied:false so the caller can tell the user');
});
