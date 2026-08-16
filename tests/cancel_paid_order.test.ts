// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/**
 * The ticket that came back, part two.
 *
 * Fixing the full-row upsert made unpaid tickets cancel correctly. Paid ones still bounced: the
 * card left the board, the server refused, the local change rolled back, and the ticket reappeared
 * on the next refresh. Five of the eight tickets on the live board were settled, so most of what
 * an owner tried to clear came straight back.
 *
 * That refusal is correct — money had changed hands:
 *
 *     if new.status = 'cancelled' then
 *       if old.payment_status = 'paid' then
 *         raise exception 'Paid orders must be refunded before cancellation';
 *
 * What was missing was any way through it. The kitchen board offered no refund, so a settled ticket
 * could not be cleared by any sequence of actions available to the operator.
 *
 * The ordering is the whole subtlety, and it is not guessable from the UI: the trigger compares
 * `old.payment_status`, so refunding and cancelling in a single update is refused exactly as
 * cancelling alone is. The refund has to be committed first, in its own round trip.
 */

const db = readFileSync('src/db/database.ts', 'utf8');
const kds = readFileSync('src/views/kitchen/KitchenView.tsx', 'utf8');

const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'))
  .join('\n');

test('the database still refuses to cancel a paid order — this is the rule being served', () => {
  // If this ever stops being true, cancelOrder's two-step dance is unnecessary complexity and
  // should be removed rather than left as cargo.
  assert.match(migrations, /raise exception 'Paid orders must be refunded before cancellation'/);
  assert.match(migrations, /if old\.payment_status = 'paid' then/,
    'the check reads the OLD row, which is why one combined update cannot satisfy it');
});

test('the refund is committed before the cancellation, not with it', () => {
  const fn = db.slice(db.indexOf('export async function cancelOrder'), db.indexOf('* Update payment details'));

  const refund = fn.indexOf("updateOrderStatus(id, existing.status, { paymentStatus: 'refunded' })");
  const cancel = fn.indexOf("updateOrderStatus(id, 'cancelled')");
  assert.ok(refund > -1, 'the refund step is missing');
  assert.ok(cancel > -1, 'the cancellation step is missing');
  assert.ok(refund < cancel, 'the refund must be committed first — the trigger compares the old row');

  // The refund keeps the current status deliberately: the transition trigger returns early when
  // the status has not changed, so this does not have to satisfy the lifecycle rules as well.
  assert.match(fn, /updateOrderStatus\(id, existing\.status, \{ paymentStatus: 'refunded' \}\)/);

  // A refused refund must stop the sequence, or the cancel runs and fails anyway.
  assert.match(fn, /if \(!refunded\.applied\) return refunded;/);
});

test('cancelling a paid order without a refund is refused by the client too', () => {
  const fn = db.slice(db.indexOf('export async function cancelOrder'), db.indexOf('* Update payment details'));
  assert.match(fn, /if \(!refundPaid\) \{/);
  assert.match(fn, /This order is marked paid\. Refund it before cancelling\./,
    'the refusal has to say what to do next, not just that it failed');
});

test('the kitchen asks a different question for a settled ticket', () => {
  // Same confirmation for both is what made this feel broken: the operator answered "yes" to a
  // question that did not mention money, and nothing happened.
  assert.match(kds, /const isPaid = String\(order\?\.paymentStatus \|\| ''\) === 'paid';/);
  assert.match(kds, /Cancelling it will also record a refund of \$\{amount\}/);
  assert.match(kds, /Only continue if you have returned the money to the customer/);
  assert.match(kds, /await cancelOrder\(orderId, \{ refundPaid: isPaid \}\)/);
});

test('a refund is recorded in the activity log as a refund', () => {
  // "void_order" alone would leave no trace that money went back, which is the one part of this
  // an owner may later need to account for.
  assert.match(kds, /refund_and_void_order_kds_id_\$\{orderId\}/);
  assert.match(kds, /Order refunded \$\{amount\} and cancelled/);
});
