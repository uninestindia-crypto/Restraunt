// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ── Browser surface these modules touch at import time ──────────
// The router registers a hashchange listener and staffAdmin reads the store id
// out of localStorage, both at module scope — so the shims go in before the
// dynamic imports below.
(globalThis as any).window = { addEventListener: () => {} };
(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const { Router } = await import('../src/router');
const { STAFF_ROLES, normalizeStaffRole } = await import('../src/services/authGuards');
const { mapStaffForAdminFunction } = await import('../src/services/staffAdmin');

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Regression cover for "only the Cashier role works; the others look like
 * placeholders".
 *
 * Four separate defects produced that one symptom, and each of them ends with
 * the member behaving like a cashier or like nobody at all:
 *
 *  1. staffAdmin kept a private role list that had fallen a role behind, and
 *     rewrote anything it did not recognise to 'cashier' — so picking
 *     "Express Only" saved a cashier, silently.
 *  2. The staff-admin edge function's list had the same gap, and rejects a role
 *     it cannot name before the database is asked.
 *  3. The CHECK constraints on staff.role and staff_memberships.role listed
 *     seven roles, so the eighth could not be stored at all.
 *  4. The router greeted every role whose home is not #/pos with "Access
 *     denied: Insufficient permissions" on sign-in, because the app's default
 *     route is #/pos and landing on it counted as an intrusion.
 */

const EXPECTED_ROLES = [
  'developer',
  'owner',
  'manager',
  'cashier',
  'kitchen',
  'waiter',
  'delivery',
  'temporary_staff'
];

test('every role the staff screen offers is a role the app knows', () => {
  const view = read('src/views/staff/StaffView.tsx');
  const select = view.match(/<select id="staff-role"[\s\S]*?<\/select>/)?.[0];
  assert.ok(select, 'StaffView must still render the role picker');

  const offered = [...select.matchAll(/value="([a-z_]+)"/g)].map(m => m[1]);
  assert.ok(offered.length >= 6, `expected the full role picker, saw ${offered.join(', ')}`);

  for (const role of offered) {
    assert.ok(
      STAFF_ROLES.includes(role),
      `the picker offers "${role}", which the app cannot resolve to a real role`
    );
  }
});

test('the three role lists that must agree do agree', () => {
  assert.deepEqual(STAFF_ROLES, EXPECTED_ROLES);

  // The edge function rejects an unknown role before Postgres sees it.
  const fn = read('supabase/functions/staff-admin/index.ts');
  const fnList = fn.match(/const STAFF_ROLES = \[([^\]]+)\]/)?.[1];
  assert.ok(fnList, 'the staff-admin function must still declare STAFF_ROLES');
  const fnRoles = [...fnList.matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual(fnRoles, EXPECTED_ROLES, 'staff-admin drifted from authGuards');

  // Postgres has the last word: a role missing here cannot be stored.
  const migration = read('supabase/migrations/20260802160000_allow_express_only_role.sql');
  for (const table of ['staff', 'staff_memberships']) {
    const constraint = new RegExp(`constraint ${table}_role_check\\s+check \\(role in \\(([^)]+)\\)\\)`);
    const listed = migration.match(constraint)?.[1];
    assert.ok(listed, `${table}_role_check must be replaced, not merely dropped`);
    const dbRoles = [...listed.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    assert.deepEqual(dbRoles, EXPECTED_ROLES, `${table}.role rejects a role the app can assign`);
  }
});

test('an unrecognised role is reported, never quietly turned into a cashier', () => {
  // This is the defect verbatim: the picker sent temporary_staff, the cloud
  // stored cashier, and the screen said the account had been created.
  assert.equal(mapStaffForAdminFunction({ name: 'Asha', role: 'temporary_staff' }).role, 'temporary_staff');

  for (const role of EXPECTED_ROLES) {
    assert.equal(mapStaffForAdminFunction({ name: 'Asha', role }).role, role);
    assert.equal(mapStaffForAdminFunction({ name: 'Asha', role: role.toUpperCase() }).role, role);
  }

  // Nothing outside the list may be substituted for something inside it.
  for (const bogus of ['chef', 'admin', '', null, undefined]) {
    assert.equal(
      mapStaffForAdminFunction({ name: 'Asha', role: bogus }).role,
      '',
      `"${bogus}" must not be silently accepted as some other role`
    );
    assert.equal(normalizeStaffRole(bogus), '');
  }

  const service = read('src/services/staffAdmin.ts');
  assert.doesNotMatch(service, /:\s*'cashier'/, 'no fallback may name a role');
  assert.match(service, /is not a staff role this app can assign/);
});

test('every role has a home screen it is actually allowed to open', () => {
  const main = read('src/main.ts');
  const allowed = new Map();
  for (const [, hash, roles] of main.matchAll(
    /router\.register\('(#\/[a-z-]+)'[\s\S]*?\}, (\[[^\]]*\]|null)\);/g
  )) {
    allowed.set(hash, roles === 'null' ? null : [...roles.matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
  }
  assert.ok(allowed.size > 5, 'could not read the route table out of main.ts');

  for (const role of STAFF_ROLES) {
    const home = Router.homeRouteFor(role);
    assert.ok(allowed.has(home), `${role} is sent to ${home}, which is not a registered route`);

    const roles = allowed.get(home);
    assert.ok(
      roles === null || roles.includes(role),
      `${role} is sent to ${home}, which then denies ${role} — an endless bounce`
    );
  }

  // A signed-out visitor and an unknown role both belong on the public screen.
  assert.equal(Router.homeRouteFor(''), '#/self-order');
  assert.equal(Router.homeRouteFor('chef'), '#/self-order');
  assert.equal(Router.homeRouteFor('CASHIER'), '#/pos');
});

test('landing on the default route is not reported as an access violation', () => {
  const source = read('src/router.ts');
  const guard = source.slice(
    source.indexOf('if (!staffRole || !allowedRoles.includes(staffRole))'),
    source.indexOf('Explicit administrative access check')
  );

  // The bounce home has to happen before the toast, or every kitchen, delivery
  // and express-only sign-in opens with "Access denied".
  const bounce = guard.indexOf('if (!this.currentHash)');
  const toast = guard.indexOf('Access denied: Insufficient permissions');
  assert.ok(bounce > -1, 'the first-load bounce must be distinguished from a denial');
  assert.ok(bounce < toast, 'the toast fires before the first-load bounce is ruled out');

  // One table of home routes, not a chain of if/else in the denial branch.
  assert.match(guard, /Router\.homeRouteFor\(staffRole\)/);
  assert.doesNotMatch(guard, /staffRole === 'kitchen'/);
});

test('the express-only role can open the one screen it exists for', () => {
  const source = read('src/router.ts');
  assert.match(source, /const isExpressOnly = staffRole === 'temporary_staff';/);
  assert.match(source, /if \(!isOwnerOrDev && !isExpressOnly && !hasExpressAccess\)/);

  // ...and the route itself has to admit it.
  const main = read('src/main.ts');
  const express = main.match(/router\.register\('#\/pos-kitchen'[\s\S]*?\}, (\[[^\]]*\])\);/)?.[1];
  assert.ok(express, 'the Express Panel route must still be registered');
  assert.match(express, /'temporary_staff'/);
});

test('changing a role is confirmed by the cloud before the operator is told it worked', () => {
  const view = read('src/views/staff/StaffView.tsx');
  // Anchored on the save branch, not on the earlier `isEdit` lookup above it.
  const start = view.indexOf('const updateData = { name, role, phone');
  assert.ok(start > -1, 'StaffView must still have an edit branch in the save handler');
  const edit = view.slice(start, view.indexOf('const localId = await db.staff.add(', start));

  assert.match(edit, /await syncStaffViaAdminFunction\(updated\)/, 'a role change must reach the cloud');
  assert.match(edit, /if \(result\.success\)/);
  assert.match(edit, /the cloud refused it/, 'a refused role change must not read as success');

  // The role lives in the cloud membership; a local-only edit is reverted by
  // the next roster refresh without anyone being told.
  assert.doesNotMatch(edit, /showToast\('Staff member updated!'/);
});

test('the express-only role may write the audit trail its work generates', () => {
  const migration = read('supabase/migrations/20260802160000_allow_express_only_role.sql');
  for (const table of ['activity_log', 'audit_events']) {
    const policy = migration.match(
      new RegExp(`create policy "staff insert ${table}"[\\s\\S]*?;`)
    )?.[0];
    assert.ok(policy, `${table} inserts must be regranted alongside the role`);
    assert.match(policy, /'temporary_staff'/);
  }
});
