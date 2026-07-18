// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudStaffAccessError,
  appMetadataToStaffAccess,
  membershipToStaffAccess,
  requireCloudStaffAccess
} from '../src/services/authGuards';

test('cloud staff access requires an active database membership', () => {
  assert.throws(
    () => requireCloudStaffAccess({ user_metadata: { role: 'owner' } }, null),
    CloudStaffAccessError
  );

  assert.deepEqual(
    requireCloudStaffAccess(
      { user_metadata: { role: 'customer' } },
      { store_id: 'the-taste', role: 'owner', staff_id: 7, is_active: true }
    ),
    { role: 'owner', staffId: 7, storeId: 'the-taste' }
  );
});

test('user-controlled metadata can never grant staff or developer access', () => {
  assert.equal(
    appMetadataToStaffAccess({ user_metadata: { role: 'developer', store_id: 'the-taste' } }),
    null
  );
  assert.throws(
    () => requireCloudStaffAccess({ user_metadata: { role: 'developer' } }, null),
    CloudStaffAccessError
  );
  assert.throws(
    () => requireCloudStaffAccess({ app_metadata: { role: 'developer' } }, null),
    CloudStaffAccessError
  );
});

test('staff metadata is only a hint and must match the active store', () => {
  assert.equal(appMetadataToStaffAccess({ app_metadata: { role: 'owner', store_id: 'other' } }), null);
  assert.deepEqual(
    appMetadataToStaffAccess({ app_metadata: { role: 'manager', stores: ['the-taste'], staff_id: 8 } }),
    { role: 'manager', staffId: 8, storeId: 'the-taste' }
  );
});

test('inactive memberships and unknown roles are rejected', () => {
  assert.equal(membershipToStaffAccess({ store_id: 'the-taste', role: 'owner', is_active: false }), null);
  assert.equal(membershipToStaffAccess({ store_id: 'the-taste', role: 'admin', is_active: true }), null);
});

test('developer role is accepted as a valid staff role with full access', () => {
  // Developer membership is accepted
  assert.deepEqual(
    membershipToStaffAccess({ store_id: 'the-taste', role: 'developer', is_active: true }),
    { role: 'developer', staffId: null, storeId: 'the-taste' }
  );

  // Developer cloud staff access works via membership
  assert.deepEqual(
    requireCloudStaffAccess(
      { user_metadata: { role: 'customer' } },
      { store_id: 'the-taste', role: 'developer', staff_id: 99, is_active: true }
    ),
    { role: 'developer', staffId: 99, storeId: 'the-taste' }
  );
});
