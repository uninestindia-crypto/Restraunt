// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { priceOrder, lineDiscount, round2 } from '../src/services/pricing.ts';

/**
 * The client's copy of the server's arithmetic, held to the server's answers.
 *
 * `enforce_order_integrity` decides what a customer pays. `src/services/pricing.ts` exists only so
 * a till can show the operator that number *before* the order is sent — a cashier reading one total
 * off the screen while the customer is charged another is worse than showing no total at all.
 *
 * Two copies of money arithmetic is a liability. What makes it acceptable is that both are pinned
 * to the same worked examples: every case below also appears in `tests/sql/discount_math.sql`,
 * which runs it against the real trigger on a real Postgres (`npm run test:sql`). The numbers are
 * the contract between them.
 */

const MENU = { fries: 80, masala: 90, crispy: 120 };
const line = (price, quantity, extra = {}) => ({ price, quantity, ...extra });

test('a bill with no discount is priced exactly as before', () => {
  const p = priceOrder({ items: [line(MENU.fries, 2)], taxPercent: 5 });
  assert.equal(p.subtotal, 160);
  assert.equal(p.discountTotal, 0);
  assert.equal(p.tax, 8);
  assert.equal(p.total, 168);
});

test('a percentage off one line', () => {
  const p = priceOrder({ items: [line(MENU.fries, 2, { discountPercent: 10 })], taxPercent: 5 });
  assert.equal(p.subtotal, 160, 'subtotal stays gross so reports keep meaning gross sales');
  assert.equal(p.itemDiscountTotal, 16);
  assert.equal(p.tax, 7.2, 'GST is charged on the discounted value, not the gross');
  assert.equal(p.total, 151.2);
  assert.equal(p.items[0].discount, 16);
});

test('an amount off one of two lines', () => {
  const p = priceOrder({ items: [line(MENU.fries, 1, { discountAmount: 20 }), line(MENU.crispy, 1)], taxPercent: 5 });
  assert.equal(p.subtotal, 200);
  assert.equal(p.itemDiscountTotal, 20);
  assert.equal(p.total, 189);
});

test('a percentage off the whole bill', () => {
  const p = priceOrder({ items: [line(MENU.masala, 2)], billDiscountType: 'percent', billDiscountValue: 25, taxPercent: 5 });
  assert.equal(p.billDiscountAmount, 45);
  assert.equal(p.discountTotal, 45);
  assert.equal(p.total, 141.75);
});

test('an amount off the whole bill', () => {
  const p = priceOrder({ items: [line(MENU.crispy, 1)], billDiscountType: 'amount', billDiscountValue: 20, taxPercent: 5 });
  assert.equal(p.total, 105);
});

test('the two compose — the bill discount applies to what is left', () => {
  // 160 gross, 16 off the line, 144 left, 10% of that is 14.40 -> 129.60 + 5% = 136.08
  const p = priceOrder({
    items: [line(MENU.fries, 2, { discountPercent: 10 })],
    billDiscountType: 'percent', billDiscountValue: 10, taxPercent: 5
  });
  assert.equal(p.itemDiscountTotal, 16);
  assert.equal(p.billDiscountAmount, 14.4, 'not 16 — the bill discount is not applied to the gross');
  assert.equal(p.discountTotal, 30.4);
  assert.equal(p.total, 136.08);
});

test('nothing can make a bill owe the customer money', () => {
  const overLine = priceOrder({ items: [line(MENU.fries, 1, { discountAmount: 500 })], taxPercent: 5 });
  assert.equal(overLine.itemDiscountTotal, 80);
  assert.equal(overLine.total, 0);
  // The line's own figure has to be clamped too, not just the bill's. The receipt prints this
  // number under the dish it came off, so an unclamped line reads "-₹500.00" beneath an ₹80 chips
  // while the total is right — which is worse than either being wrong on its own.
  assert.equal(overLine.items[0].discount, 80);

  const overBill = priceOrder({ items: [line(MENU.fries, 1)], billDiscountType: 'amount', billDiscountValue: 500, taxPercent: 5 });
  assert.equal(overBill.billDiscountAmount, 80);
  assert.equal(overBill.total, 0);

  const negative = priceOrder({ items: [line(MENU.fries, 1, { discountPercent: -30 })], taxPercent: 5 });
  assert.equal(negative.itemDiscountTotal, 0, 'a negative discount is not a surcharge');
  assert.equal(negative.total, 84);
});

test('the delivery fee is charged on top and never discounted away', () => {
  const p = priceOrder({
    items: [line(MENU.fries, 1)], billDiscountType: 'percent', billDiscountValue: 100,
    taxPercent: 5, deliveryFee: 40, type: 'delivery'
  });
  assert.equal(p.total, 40, 'free food, paid delivery');
});

test('a delivery fee is not charged on a bill that is not a delivery', () => {
  const p = priceOrder({ items: [line(MENU.fries, 1)], taxPercent: 5, deliveryFee: 40, type: 'takeaway' });
  assert.equal(p.deliveryFee, 0);
  assert.equal(p.total, 84);
});

test('the effective percentage is measured against the gross bill', () => {
  // This is what a store's ceiling is checked against, so splitting a discount across lines
  // cannot slip past it.
  const p = priceOrder({
    items: [line(MENU.fries, 1, { discountPercent: 25 }), line(MENU.masala, 1, { discountPercent: 25 })],
    taxPercent: 5
  });
  assert.equal(p.effectiveDiscountPercent, 25);
});

test('rounding matches Postgres, not toFixed', () => {
  // Postgres round(numeric, 2) is half-away-from-zero. JS's nearest-even would drift a paisa on
  // exactly the values a percentage discount produces.
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(0), 0);
  assert.equal(round2(Number.NaN), 0);
});

test('an empty or malformed line cannot produce a discount', () => {
  assert.equal(lineDiscount({}), 0);
  assert.equal(lineDiscount({ price: 80, quantity: 1, discountPercent: null }), 0);
  assert.equal(lineDiscount({ price: 80, quantity: 1, discountPercent: '' }), 0);
  assert.equal(priceOrder({ items: [] }).total, 0);
});

test('every case here is also run against the real trigger', () => {
  // The whole justification for a second copy of this arithmetic. If the SQL suite stops covering
  // a case, the two can drift without anything noticing.
  const sql = readFileSync('tests/sql/discount_math.sql', 'utf8');
  for (const expected of ['168.00', '151.20', '189.00', '141.75', '105.00', '136.08', '84.00', '40.00']) {
    assert.ok(sql.includes(expected), `tests/sql/discount_math.sql no longer asserts ${expected}`);
  }
  assert.match(sql, /_ring\(/, 'the SQL suite must still insert real orders through the trigger');
});
