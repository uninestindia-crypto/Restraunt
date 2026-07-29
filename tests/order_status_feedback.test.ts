import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Regression cover for a silently failing kitchen "cancel/void" button.
 *
 * Order lifecycle rules live in Postgres — cancelling a paid order raises
 * "Paid orders must be refunded before cancellation". The client wrote the new
 * status to IndexedDB first, ignored the rejected cloud write, and showed a
 * success toast regardless. The order vanished from the KDS, then reappeared
 * when the next hydration restored the authoritative row.
 */

test('syncUpOrder reports its outcome instead of swallowing failures', () => {
  const source = read('src/services/sync.ts');

  assert.match(source, /async syncUpOrder\(order\): Promise<SyncOutcome>/);
  assert.match(source, /export interface SyncOutcome/);

  // A definitive refusal must be distinguishable from a flaky connection:
  // one rolls the optimistic write back, the other keeps it queued.
  assert.match(source, /function isServerRejection/);
  assert.match(source, /const rejected = isServerRejection\(e\)/);
  assert.match(source, /return \{ success: false, rejected, offline: false, error: describeSyncError\(e\) \}/);

  // Postgres SQLSTATEs (P0001 from a trigger, 42501 from RLS) count as refusals.
  assert.match(source, /\^\[0-9A-Z\]\{5\}\$/);
});

test('a refused status transition is rolled back instead of left diverged', () => {
  const source = read('src/db/database.ts');

  assert.match(source, /export async function updateOrderStatus\([\s\S]{0,120}?\): Promise<OrderStatusUpdateResult>/);
  assert.match(source, /if \(outcome\?\.rejected\)/);

  // The rollback restores the snapshot taken before the optimistic write.
  assert.match(source, /previous = \{\};/);
  assert.match(source, /await db\.orders\.update\(id, \{ \.\.\.previous, syncStatus: 'synced', isSynced: 1 \}\)/);
});

test('a transient network failure keeps the local change queued', () => {
  const source = read('src/db/database.ts');

  // Only `rejected` triggers a rollback. An offline or failed-but-retryable
  // sync must still return applied:true so the app keeps working offline.
  assert.match(source, /if \(!navigator\.onLine\) \{\s*\n\s*syncOrderInBackground\(order, 'status update'\);\s*\n\s*return \{ applied: true, synced: false \};/);
  assert.doesNotMatch(source, /if \(outcome\?\.success === false\)\s*\{\s*\n\s*.*rollback/i);
});

test('kitchen and express views announce the real outcome, never an unconditional success', () => {
  for (const path of ['src/views/kitchen/KitchenView.tsx', 'src/views/express/ExpressView.tsx']) {
    const source = read(path);

    assert.match(source, /reportStatusChange/, `${path} must report the real outcome`);

    // The old bug: a success toast fired regardless of what the server said.
    assert.doesNotMatch(
      source,
      /await updateOrderStatus\(orderId, 'cancelled'\);\s*\n[\s\S]{0,600}?showToast\('Order cancelled & voided', 'success'\)/,
      `${path} must not claim a cancellation succeeded without checking`
    );

    // The activity log should only record a void that actually happened.
    assert.match(
      source,
      /if \(outcome\.applied\) \{\s*\n\s*await db\.activityLog\.add/,
      `${path} must only log a void that was applied`
    );
  }
});

test('no view writes an order status directly, bypassing the rollback path', () => {
  for (const path of ['src/views/kitchen/KitchenView.tsx', 'src/views/express/ExpressView.tsx']) {
    const source = read(path);

    // The 'preparing' action used to write straight to Dexie and fire a
    // discarded sync, so it got neither a rollback nor an honest toast.
    assert.doesNotMatch(
      source,
      /db\.orders\.update\([^)]*status:/,
      `${path} must route status changes through updateOrderStatus`
    );
    assert.doesNotMatch(
      source,
      /syncUpOrder/,
      `${path} must not fire its own discarded order sync`
    );
    assert.match(
      source,
      /updateOrderStatus\(orderId, 'preparing', \{/,
      `${path} must set prep fields through updateOrderStatus`
    );
  }
});

test('updateOrderStatus carries extra fields and rolls them back too', () => {
  const source = read('src/db/database.ts');

  assert.match(source, /extraFields: Partial<Order> = \{\}/);
  assert.match(source, /\.\.\.extraFields,/);

  // The snapshot is derived from what is actually being written, so extra
  // fields are restored on a refusal rather than left behind.
  assert.match(source, /for \(const key of Object\.keys\(updates\)\) \{\s*\n\s*previous\[key\] = existing\[key\];/);
});

test('the outcome reporter surfaces the database message and distinguishes offline saves', () => {
  const source = read('src/utils/helpers.ts');

  assert.match(source, /export function reportStatusChange/);
  // Prefer the trigger's own human-readable text over a generic message.
  assert.match(source, /outcome\?\.error \|\| 'The server refused this change\.'/);
  assert.match(source, /saved offline, will sync when reconnected/);
});
