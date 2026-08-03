import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * The express-only staff role.
 *
 * `temporary_staff` reaches the Express Panel and the Help Center and nothing
 * else. It existed in the client — router, sidebar, landing route — but in no
 * RLS policy, so such an account signed in successfully and then saw an empty
 * panel, because every cloud read was denied and no order could be banked.
 */

const grants = readFileSync('supabase/migrations/20260802140000_express_only_staff_role.sql', 'utf8');
const hardening = readFileSync('supabase/migrations/20260716154206_launch_security_hardening.sql', 'utf8');
const transitions = readFileSync('supabase/migrations/20260718000000_enforce_order_status_transitions.sql', 'utf8');
const main = readFileSync('src/main.ts', 'utf8');
const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');

/** Every policy in the grant migration that names the role. */
function policiesGranting(role: string) {
  return [...grants.matchAll(/create policy "([^"]+)" on public\.(\w+)\s+for (\w+)[\s\S]*?;/g)]
    .filter(m => m[0].includes(`'${role}'`))
    .map(m => `${m[2]}:${m[3]}`);
}

test('the role can run a till: read the menu, take orders, move them on', () => {
  const granted = policiesGranting('temporary_staff');
  for (const needed of [
    'menu_categories:select', 'menu_items:select', 'menu_item_addons:select',
    'orders:select', 'orders:insert', 'orders:update',
    'inventory:select', 'recipes:select'
  ]) {
    assert.ok(granted.includes(needed), `an express-only account needs ${needed}`);
  }
});

test('a sale may deplete stock, but stock cannot be managed', () => {
  const granted = policiesGranting('temporary_staff');
  assert.ok(granted.includes('inventory:update'), 'a sale has to be able to reduce stock');

  // Adding, restocking and deleting stay with managers: the write policy this
  // migration leaves in place is the managers-only one.
  assert.match(hardening, /create policy "managers write inventory"[\s\S]*?array\['developer','owner','manager'\]/);
  assert.doesNotMatch(grants, /managers write inventory/);
});

test('an express-only account cannot cancel an order', () => {
  // The database is the authority, not the button: cancelling is gated on the
  // caller's role inside the order-status trigger.
  assert.match(transitions, /caller_role not in \('developer', 'owner', 'manager'\)/);
  assert.doesNotMatch(transitions, /temporary_staff/);
});

test('the role is not granted anything the panel does not use', () => {
  for (const table of ['staff', 'staff_memberships', 'customers', 'suppliers', 'shifts', 'audit_events', 'document_embeddings']) {
    assert.doesNotMatch(
      grants,
      new RegExp(`on public\\.${table}\\b`),
      `${table} is not part of the Express Panel and must not be opened up`
    );
  }
  // Menu writes stay with managers.
  assert.doesNotMatch(grants, /managers write menu_(categories|items)/);
});

test('the client sends an express-only account straight to its one screen', () => {
  assert.match(main, /staff\.role === 'temporary_staff'[\s\S]{0,80}router\.navigate\('#\/pos-kitchen'\)/);

  // And the router only admits it to that screen and the help centre.
  const routes = [...main.matchAll(/router\.register\('(#\/[a-z-]+)'[\s\S]*?\}, (\[[^\]]*\])\);/g)]
    .filter(m => m[2].includes('temporary_staff'))
    .map(m => m[1]);
  assert.deepEqual(routes.sort(), ['#/help', '#/pos-kitchen']);
});

test('the sidebar shows an express-only account nothing else', () => {
  const withRole = [...sidebar.matchAll(/hash: '(#\/[a-z-]+)'[^\n]*roles: \[([^\]]*)\]/g)]
    .filter(m => m[2].includes('temporary_staff'))
    .map(m => m[1]);
  assert.deepEqual(withRole.sort(), ['#/help', '#/pos-kitchen']);
});
