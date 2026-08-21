// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/**
 * The complaint: "staff1 cannot take orders."
 *
 * The account was real, active, signed in fine, and the sidebar offered it the Express Panel — a
 * full register with a menu, a cart, Takeaway/Dine-In/Delivery and Cash and UPI buttons. Pressing
 * Cash failed every time, with nothing but a console line to say why.
 *
 * Three server gates stand between the Cash button and a banked sale, and a `kitchen` account
 * failed two of them. The one that actually fired was not RLS but a BEFORE trigger:
 *
 *     Role kitchen cannot confirm payment
 *
 * An express sale is a counter sale: it is settled the instant it is rung up, so the insert always
 * carries payment_status 'paid'. The trigger admitted only developer, owner, manager and cashier,
 * which made the Express Panel unusable by every other role — kitchen, waiter, and
 * `temporary_staff`, the express-only role that exists for that one screen. That is the whole of
 * the earlier report that "only the Cashier role works properly".
 *
 * The rule now has one definition on each side and they have to agree: the owner's per-person
 * "Allow access to Express Panel" checkbox decides both what the sidebar draws and what Postgres
 * accepts. These tests fail if either side is changed alone.
 */

const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
const latest = readFileSync(
  'supabase/migrations/20260821120000_express_staff_can_take_orders.sql',
  'utf8'
);
const allSql = migrations.map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');

const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const router = readFileSync('src/router.ts', 'utf8');
const database = readFileSync('src/db/database.ts', 'utf8');

/**
 * Comments quote the wording they replaced, so a search for the old strings finds the very
 * explanation of why they are gone. Strip them before asserting on what the code says.
 */
function code(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The last definition wins — Postgres runs the migrations in name order. */
function lastPolicy(name: string) {
  let found = null;
  for (const file of migrations) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
    const re = new RegExp(`create policy "${name}"[\\s\\S]*?;`, 'g');
    for (const m of sql.matchAll(re)) found = m[0];
  }
  assert.ok(found, `no policy named "${name}" is ever created`);
  return found;
}

test('the server has a definition of the owner\'s express grant', () => {
  assert.match(latest, /create or replace function public\.has_express_access\(target_store_id text\)/);

  // It has to read the same column the Staff screen writes, or it is measuring something else.
  assert.match(latest, /s\.allow_express/);
  assert.match(latest, /sm\.role = 'temporary_staff'/,
    'the express-only role reaches the panel without the flag; the server must admit it the same way');

  // Off by default, and only for an active membership on an active staff row.
  assert.match(latest, /sm\.is_active = true/);
  assert.match(latest, /s\.is_active = true/);
  assert.match(latest, /coalesce\(s\.allow_express, false\)/,
    'a missing staff row must read as "no", never as "yes"');

  // security definer with a pinned search_path, like every other policy helper here.
  const fn = latest.slice(latest.indexOf('function public.has_express_access'), latest.indexOf('revoke all on function public.has_express_access'));
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
  assert.match(latest, /revoke all on function public\.has_express_access\(text\) from public, anon;/,
    'anon must not be able to ask who has express access');
});

test('the Staff screen writes the column the server now reads', () => {
  const staffView = readFileSync('src/views/staff/StaffView.tsx', 'utf8');
  assert.match(staffView, /Allow access to Express Panel/);
  assert.match(staffView, /staff-allow-express/);
  assert.match(staffView, /allowExpress/);
});

test('the sidebar gate and the server gate are the same rule', () => {
  // Client: express-only role, or the owner's per-person flag (owner/developer always).
  assert.match(sidebar, /staffRole === 'temporary_staff'/);
  assert.match(sidebar, /currentStaff\?\.allowExpress === 1 \|\| currentStaff\?\.allowExpress === true/);
  // Router: the same test again, so a direct URL cannot get further than the sidebar.
  assert.match(router, /staffRole === 'temporary_staff'/);
  assert.match(router, /currentStaff\?\.allowExpress === 1 \|\| currentStaff\?\.allowExpress === true/);
});

test('taking the order is allowed for express staff', () => {
  const policy = lastPolicy('staff insert orders');
  assert.match(policy, /public\.has_express_access\(store_id\)/,
    'a kitchen account with express access could not insert an order at all');
});

test('seating an express dine-in is allowed for express staff', () => {
  const policy = lastPolicy('staff write tables');
  assert.match(policy, /public\.has_express_access\(store_id\)/,
    'an express dine-in sets its table occupied; without this the sale banks and the floor does not move');
});

test('confirming the payment is allowed for express staff — the gate that actually fired', () => {
  assert.match(latest, /create or replace function public\.can_settle_payments\(target_store_id text\)/);
  assert.match(latest, /public\.has_staff_role\(target_store_id, array\['developer','owner','manager','cashier'\]\)\s*\n\s*or public\.has_express_access\(target_store_id\)/);

  // The trigger must ask the function, not a frozen list.
  const trigger = latest.slice(latest.indexOf('function public.enforce_order_integrity'));
  assert.match(trigger, /new\.payment_status in \('paid','partial'\)\s*\n\s*and not public\.can_settle_payments\(new\.store_id\) then/,
    'the INSERT gate still tests a hard-coded role list');
  assert.match(trigger, /and not public\.can_settle_payments\(new\.store_id\) then\s*\n\s*raise exception 'Role % cannot modify payment state'/,
    'the UPDATE gate still tests a hard-coded role list');
});

test('refunds did not widen with it', () => {
  // Taking money at a counter and giving it back are different decisions. Only the first moved.
  const trigger = latest.slice(latest.indexOf('function public.enforce_order_integrity'));
  assert.match(trigger, /and caller_role not in \('developer','owner','manager'\) then\s*\n\s*raise exception 'Role % cannot refund payments'/);
  assert.doesNotMatch(trigger, /cannot refund payments[\s\S]{0,200}has_express_access/);
});

test('an anonymous storefront order is unaffected', () => {
  // The public checkout runs with no auth.uid(); the payment gate has always skipped it, and that
  // guard has to survive, or every guest order starts failing instead.
  const trigger = latest.slice(latest.indexOf('function public.enforce_order_integrity'));
  assert.match(trigger, /if \(select auth\.uid\(\)\) is not null\s*\n\s*and new\.payment_status in \('paid','partial'\)/);
});

test('the eighth role can be stored', () => {
  // Without this the express-only role is written locally and refused by Postgres, which looks
  // exactly like "the role does not work".
  assert.match(latest, /add constraint staff_role_check[\s\S]*?'temporary_staff'/);
  assert.match(latest, /add constraint staff_memberships_role_check[\s\S]*?'temporary_staff'/);
});

test('every staff role can still append to the audit trail', () => {
  const policy = lastPolicy('staff insert activity_log');
  for (const role of ['kitchen', 'waiter', 'delivery', 'temporary_staff']) {
    assert.ok(policy.includes(`'${role}'`), `${role} cannot write to the activity log`);
  }
  // Append-only: still no update policy anywhere.
  assert.doesNotMatch(allSql, /create policy "[^"]*" on public\.activity_log\s*\n\s*for update/);
});

test('a refused checkout says what to do next, not what the transport did', () => {
  assert.match(database, /export function describeCheckoutFailure/);

  const fn = database.slice(
    database.indexOf('export function describeCheckoutFailure'),
    database.indexOf('export async function createOrder')
  );
  assert.match(fn, /cannot confirm payment\|cannot modify payment state/);
  assert.match(fn, /Allow access to Express Panel/,
    'the message has to name the checkbox the owner needs to tick');
  assert.match(fn, /Nothing has been billed\./,
    'the first thing the operator needs to know is whether the customer was charged');
  assert.match(fn, /\/\^Out of stock:\/i\.test\(message\)/,
    'the stock refusal already names the dish and the count; it must not be reworded');

  // And the old wording is gone from the throw sites.
  assert.doesNotMatch(code(database), /Checkout Aborted: Direct cloud write failed/);
  assert.doesNotMatch(code(database), /RLS policy violation/);
  assert.match(database, /throw new Error\(describeCheckoutFailure\(cloudErr\)\);/);
});

test('both tills show that message instead of burying it', () => {
  for (const path of ['src/views/express/ExpressView.tsx', 'src/views/pos/PosView.tsx']) {
    const view = readFileSync(path, 'utf8');
    assert.doesNotMatch(view, /'Failed to save order: '/, `${path} still prefixes the message`);
    assert.match(view, /showToast\((err|error)\.message, 'error', 8000\)/,
      `${path} must show the whole message, and for long enough to read`);
  }
});
