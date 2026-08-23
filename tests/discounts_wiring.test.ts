// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/**
 * "There should be a discount system on per product and per whole bill."
 *
 * The hard part is not the UI. `enforce_order_integrity` rebuilds every line and every money column
 * from the live menu on insert — that is what stops a browser dictating what a customer pays — so a
 * discount added only in the app would be shown, printed, and then silently erased by the server,
 * and the customer would be charged full price.
 *
 * So the client sends the *rule* and the server decides what it is worth. These tests hold that
 * split in place. The arithmetic itself is checked twice over: `tests/sql/discount_math.sql` runs
 * it against the real trigger, `tests/pricing.test.ts` runs the same cases through the client copy.
 */

const migration = readFileSync('supabase/migrations/20260823120000_discounts.sql', 'utf8');
const sync = readFileSync('src/services/sync.ts', 'utf8');
const database = readFileSync('src/db/database.ts', 'utf8');
const receipt = readFileSync('src/services/receipt.ts', 'utf8');
const invoice = readFileSync('src/services/invoiceGenerator.ts', 'utf8');
const express = readFileSync('src/views/express/ExpressView.tsx', 'utf8');
const cartPanel = readFileSync('src/views/pos/CartPanel.tsx', 'utf8');
const posView = readFileSync('src/views/pos/PosView.tsx', 'utf8');

test('a guest cannot discount their own bill', () => {
  // Without this, the storefront could send discountPercent: 100 on every line.
  assert.match(migration, /and not coalesce\(public\.can_settle_payments\(new\.store_id\), false\) then\s*\n\s*raise exception 'Only staff who can take payment may apply a discount'/);
});

test('the permission check cannot be defeated by a NULL', () => {
  // `null = any(array[...])` is NULL, not false — and `not NULL` is NULL, so the guard would not
  // fire and the discount would stand. On a money check the unknown answer has to be "no".
  const trigger = migration.slice(migration.indexOf('function public.enforce_order_integrity'));
  for (const call of trigger.match(/not (coalesce\()?public\.(can_settle_payments|has_staff_role)\([^;]*/g) || []) {
    assert.match(call, /^not coalesce\(/, `an unguarded permission call: ${call.slice(0, 80)}`);
  }
});

test("the store's ceiling is measured on the whole bill", () => {
  // Otherwise it is defeated by discounting every line a little.
  assert.match(migration, /effective_percent := round\(\(items_discount \+ bill_discount\) \* 100 \/ computed_subtotal, 3\)/);
  assert.match(migration, /above the % percent this store allows\. Ask a manager to apply it\./,
    'the refusal has to say what to do next');
  assert.match(migration, /max_discount_percent numeric\(5, 2\) not null default 100\.00/);
  // Managers are exempt: someone has to be able to make a complaint go away.
  assert.match(migration, /array\['developer','owner','manager'\]\), false\)\s*\n\s*and \(select auth\.uid\(\) *\) is not null then/);
});

test('nothing can make a bill owe the customer money', () => {
  assert.match(migration, /line_discount := least\(line_discount, line_gross\);/);
  assert.match(migration, /bill_discount := least\(bill_discount, after_item_discounts\);/);
  assert.match(migration, /least\(greatest\(\(raw_item->>'discountPercent'\)::numeric, 0\), 100\)/);
});

test('GST is charged on the discounted value, not the gross', () => {
  // An invoice that taxed the gross and then subtracted the discount would not add up.
  assert.match(migration, /taxable_value := computed_subtotal - items_discount - bill_discount;/);
  assert.match(migration, /new\.tax := round\(taxable_value \* configured_tax \/ 100, 2\);/);
  assert.match(migration, /new\.total := taxable_value \+ new\.tax \+ new\.delivery_fee;/);
  assert.match(migration, /new\.subtotal := computed_subtotal;/,
    'subtotal stays gross so reports keep meaning gross sales');
});

test('the client sends the rule, never the money', () => {
  const toRemote = sync.slice(sync.indexOf('export function mapOrderToRemote'), sync.indexOf('export function mapOrderToLocal'));
  assert.match(toRemote, /bill_discount_type:/);
  assert.match(toRemote, /bill_discount_value:/);
  assert.match(toRemote, /discount_reason:/);
  for (const computed of ['bill_discount_amount', 'discount_total', 'item_discount_total']) {
    assert.ok(!toRemote.includes(`${computed}:`),
      `${computed} is the server's answer; sending it invites the client and server to disagree`);
  }
});

test('a lifecycle update does not resend the discount columns', () => {
  // The trigger guards them, so a status change carrying them is refused outright.
  const list = sync.slice(sync.indexOf('const IMMUTABLE_ORDER_COLUMNS'), sync.indexOf('];', sync.indexOf('const IMMUTABLE_ORDER_COLUMNS')));
  for (const column of ['item_discount_total', 'bill_discount_type', 'bill_discount_value', 'bill_discount_amount', 'discount_total']) {
    assert.ok(list.includes(`'${column}'`), `${column} must not be resent on an update`);
  }
});

test('the till adopts the server\'s arithmetic rather than its own', () => {
  // The preview was a preview. What gets printed and stored is what the server banked.
  const fn = database.slice(database.indexOf('export async function createOrder'), database.indexOf('let result;'));
  assert.match(fn, /\.select\('id, items, subtotal, tax, tax_percent, delivery_fee, total, item_discount_total/);
  assert.match(fn, /total: Number\(data\.total\),/);
  assert.match(fn, /discountTotal: Number\(data\.discount_total\) \|\| 0/);
});

test('both tills price through the one shared module', () => {
  for (const [name, source] of [['ExpressView', express], ['CartPanel', cartPanel], ['PosView', posView]]) {
    assert.match(source, /priceOrder\(/, `${name} must not compute a total of its own`);
  }
  // And each sends the rule on to the order.
  assert.match(express, /billDiscountType: this\.billDiscountType,/);
  assert.match(posView, /billDiscountType: this\.cartPanel\?\.billDiscountType \|\| 'none',/);
});

test('the UPI QR encodes the discounted amount', () => {
  // Otherwise the customer scans and pays the undiscounted total.
  assert.match(express, /generateUPIQR\(canvas, \{ amount: priced\.total, orderId: orderNumber \}\)/);
});

test('the next customer does not inherit the last one\'s discount', () => {
  const resets = (express.match(/this\.billDiscountType = 'none';/g) || []).length;
  assert.ok(resets >= 2, 'the cart reset must clear the discount as well as the items');
});

test('a discount is recorded with a reason', () => {
  // A discount nobody can account for later is a hole in the till.
  assert.match(migration, /discount_reason text not null default ''/);
  assert.match(migration, /new\.discount_reason := left\(coalesce\(new\.discount_reason, ''\), 160\);/);
  assert.match(express, /placeholder="Why\? \(regular customer, complaint…\)"/);
  assert.match(cartPanel, /placeholder="Why\? \(regular customer, complaint…\)"/);
});

test('the bill shows what came off, and what was taxed', () => {
  for (const [name, source] of [['receipt', receipt], ['invoice', invoice]]) {
    assert.match(source, /Item discounts/, `${name} does not show item discounts`);
    assert.match(source, /Bill discount/, `${name} does not show the bill discount`);
    assert.match(source, /Taxable value/, `${name} must show what GST was charged on, or it does not add up`);
  }
  assert.match(receipt, /You saved /, 'a saving is worth saying out loud');
  assert.match(receipt, /Delivery/, 'the delivery fee is on the total, so it belongs on the bill');
});

test('the arithmetic is verified against a real Postgres, not just asserted about', () => {
  const runner = readFileSync('scripts/run-sql-tests.sh', 'utf8');
  assert.match(runner, /supabase\/migrations\/20260823120000_discounts\.sql/,
    'the SQL suite must apply the real migration, not a copy of it');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['test:sql'], 'bash scripts/run-sql-tests.sh');
  assert.match(pkg.scripts['launch:verify'], /npm run test:sql/,
    'a money check that is not in launch:verify is a money check nobody runs');
});
