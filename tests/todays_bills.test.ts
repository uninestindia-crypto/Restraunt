// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * "Allow every staff to fetch same-day orders so that if by mistake or request of customer they
 * need to reprint the bill they can."
 *
 * They could not. Reprinting lived inside the full Orders console, which the sidebar offers to
 * developer, owner, manager, cashier and delivery — so a cook, a waiter or an express-only account
 * had no route to it at all. The server was never the obstacle: `staff read orders` already admits
 * every role, because the kitchen board needs it.
 *
 * The fix is a door, not a wider database. `#/bills` is its own screen with one job — find a bill
 * from this service and print it again — rather than handing every role the Orders console, which
 * also carries customer addresses, phone numbers, staff assignment and payment editing.
 */

const view = readFileSync('src/views/receipts/BillsView.tsx', 'utf8');
const main = readFileSync('src/main.ts', 'utf8');
const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const migrations = readFileSync('supabase/migrations/20260802140000_express_only_staff_role.sql', 'utf8');

const ALL_STAFF = ['developer', 'owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery', 'temporary_staff'];

test('every staff role can reach the screen', () => {
  const route = main.slice(main.indexOf("router.register('#/bills'"), main.indexOf("router.register('#/orders'"));
  for (const role of ALL_STAFF) {
    assert.ok(route.includes(`'${role}'`), `${role} cannot reach #/bills`);
  }
  const item = sidebar.match(/\{ hash: '#\/bills',[^}]*\}/)[0];
  for (const role of ALL_STAFF) {
    assert.ok(item.includes(`'${role}'`), `${role} is not offered Today's Bills in the sidebar`);
  }
});

test('the database already allowed the read — this did not widen it', () => {
  // If the fix had needed an RLS change, that would be the thing to review. It did not.
  const policy = migrations.slice(migrations.indexOf('create policy "staff read orders"'));
  const body = policy.slice(0, policy.indexOf(';') + 1);
  for (const role of ALL_STAFF) assert.ok(body.includes(`'${role}'`), `${role} cannot read orders`);
});

test('the full Orders console did not open up with it', () => {
  // The point of a separate screen: a cook gets to reprint without also getting delivery
  // assignment, payment editing and every customer's address and phone number.
  const orders = sidebar.match(/\{ hash: '#\/orders',[^}]*\}/)[0];
  for (const role of ['kitchen', 'waiter', 'temporary_staff']) {
    assert.ok(!orders.includes(`'${role}'`), `${role} should not have been given the Orders console`);
  }
});

test('it shows this service, not this calendar day', () => {
  // An order rung up at 00:30 belongs to the evening that has not finished. Cutting at midnight
  // empties the screen mid-service, which is when a duplicate is most likely to be asked for.
  assert.match(view, /const SERVICE_DAY_STARTS_AT_HOUR = 4;/);
  assert.match(view, /export function serviceDayStart\(now = new Date\(\)\)/);
  assert.match(view, /if \(now\.getTime\(\) < start\.getTime\(\)\) start\.setDate\(start\.getDate\(\) - 1\);/);
  assert.match(view, /return Number\.isFinite\(at\) && at >= since;/);
});

test('the reprint reads the server\'s copy, not the cached one', () => {
  const fn = view.slice(view.indexOf('async reprint('), view.indexOf('printInBrowser('));
  assert.match(fn, /const order = \(await getOrder\(orderId\)\) \|\| this\.orders\.find/,
    'a bill reprinted from a stale local row disagrees with the one the customer was handed');
});

test('a device with no thermal printer still prints', () => {
  const fn = view.slice(view.indexOf('async reprint('), view.indexOf('unmount()'));
  assert.match(fn, /if \(printerService\.isConnected\) \{/);
  assert.match(fn, /this\.printInBrowser\(order, settings\);/,
    'refusing outright leaves the customer standing there');
  assert.match(fn, /No thermal printer here/);
  assert.match(view, /InvoiceGenerator\.generateInvoiceHTML\(order, settings\)/);
});

test('the screen does only the one job', () => {
  // Status changes, refunds and cancellation all have screens already, gated to the people who
  // should be doing them. None of them belong on a reprint screen handed to every role.
  for (const forbidden of ['updateOrderStatus', 'cancelOrder', 'updatePayment', 'deleteOrder', 'assignDelivery']) {
    assert.ok(!view.includes(forbidden), `${forbidden} does not belong on the reprint screen`);
  }
});

test('it has the states a screen needs, with words that say what to do', () => {
  assert.match(view, /Getting today's bills…/);                      // loading
  assert.match(view, /No bills yet today/);                          // empty
  assert.match(view, /No bill matches that/);                        // no results
  assert.match(view, /Couldn't load today's bills/);                 // error
  assert.match(view, /Try the order number without its prefix/);     // what to do next
  assert.match(view, /Printing…/);                                   // in flight
  assert.match(view, /Couldn't reprint that bill/);                  // failure
});

test('status is never colour alone', () => {
  // Roughly one in twelve men cannot separate the red from the green, and this is read at a counter.
  assert.match(view, /const STATUS_WORD = \{/);
  assert.match(view, /const PAYMENT_WORD = \{/);
  assert.match(view, /\$\{escapeHtml\(status\)\}/);
  assert.match(view, /\$\{escapeHtml\(payment\)\}/);
  assert.match(view, /settled \? 'check_circle' : 'pending'/, 'the glyph has to differ too, not just the colour');
});

test('every interpolation of order data is escaped', () => {
  // Law 9. This view composes HTML strings, and a dish name, a customer note or an order number is
  // user data. Toasts are exempt because showToast assigns textContent, not innerHTML — so they are
  // stripped first rather than quietly excused by the pattern below.
  const html = view.replace(/showToast\([\s\S]*?\);/g, '');
  const interpolations = html.match(/\$\{[^}]+\}/g) || [];
  const touchesUserData = /\border\.|\bitem\.|\blines\b|\bmore\b|\bstatus\b|\bpayment\b|this\.error/;
  const unescaped = interpolations.filter((s) => touchesUserData.test(s) && !s.includes('escapeHtml'));
  assert.deepEqual(unescaped, [], `unescaped interpolation of order data: ${unescaped.join(', ')}`);
});

test('the controls are thumb-sized', () => {
  // Law 3: a counter screen is tapped in a hurry, often with a wet hand.
  const buttons = view.match(/<button[^>]*>/g) || [];
  for (const button of buttons) {
    assert.match(button, /min-height:44px/, `a control is under 44px: ${button.slice(0, 70)}`);
  }
  assert.match(view, /id="bills-search"[\s\S]{0,240}min-height:44px/);
});

test('it stops polling when it is unmounted', () => {
  const fn = view.slice(view.indexOf('unmount()'));
  assert.match(fn, /clearInterval\(this\.refreshInterval\)/);
  assert.match(fn, /removeEventListener\('sync-data-changed', this\.onSyncDataChanged\)/);
});
