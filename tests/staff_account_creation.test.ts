import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * "It says the account was created, but it does not work."
 *
 * Creating a staff member only wrote a local row and let the background sync
 * push it whenever it next connected. Until that happened there was no `staff`
 * row and — more to the point — no `staff_memberships` row in the cloud, and
 * membership is what gives an account a role. The new person signed in and was
 * refused, while the admin had been told "Staff member added!".
 */

const view = readFileSync('src/views/staff/StaffView.tsx', 'utf8');
const edge = readFileSync('supabase/functions/staff-admin/index.ts', 'utf8');

test('a new staff member is written to the cloud before success is claimed', () => {
  const save = view.slice(view.indexOf("document.getElementById('staff-save')"));
  assert.match(save, /await syncStaffViaAdminFunction\(/);

  const successIndex = save.indexOf('added and active in the cloud');
  const callIndex = save.indexOf('await syncStaffViaAdminFunction(');
  assert.ok(callIndex > -1 && successIndex > callIndex, 'success must be reported after the cloud accepts it');
});

test('a refusal is reported as a failure, not as success', () => {
  const save = view.slice(view.indexOf("document.getElementById('staff-save')"));
  assert.match(save, /the cloud refused it/);
  assert.match(save, /cannot sign in until this is resolved/);
  assert.match(save, /'error'/, 'a refusal must not be dressed up as a warning');
});

test('the device-local key is never sent as the cloud staff id', () => {
  const save = view.slice(view.indexOf("document.getElementById('staff-save')"));
  // A Dexie auto-increment is device-scoped: sending it as the cloud id
  // upserts over whichever unrelated person already holds that id.
  assert.match(save, /syncStaffViaAdminFunction\(\{ \.\.\.created, id: null \}\)/);
  assert.match(save, /result\.data\?\.staffId/, 'the row must adopt the id the server allocated');
});

test('the admin function is what creates the membership that grants a role', () => {
  const upsert = edge.slice(edge.indexOf('if (action === "upsert-staff")'), edge.indexOf('if (action === "set-active")'));
  assert.match(upsert, /from\("staff_memberships"\)/);
  assert.match(upsert, /onConflict: "store_id,auth_user_id"/);

  // And only when the staff member is linked to a real auth user — a row with
  // no cloud user cannot sign in, so it gets no membership.
  assert.match(upsert, /if \(cloudUserId\) \{/);
});
