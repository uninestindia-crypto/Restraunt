import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudStaffAccessError,
  appMetadataToStaffAccess,
  canUnlockAdminPin,
  isActiveStaffWithPin,
  membershipToStaffAccess,
  requireCloudStaffAccess
} from '../src/services/authGuards.js';

const VALID_HASH = 'a'.repeat(64);

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

test('local staff PIN login only accepts active staff with valid hashes', () => {
  assert.equal(isActiveStaffWithPin({ role: 'owner', isActive: true, pinHash: VALID_HASH }), true);
  assert.equal(isActiveStaffWithPin({ role: 'owner', isActive: false, pinHash: VALID_HASH }), false);
  assert.equal(isActiveStaffWithPin({ role: 'owner', isActive: true, pinHash: '' }), false);
});

test('admin PIN unlock respects active owner or manager staff and configured hashes', () => {
  assert.equal(
    canUnlockAdminPin({
      staff: { role: 'owner', isActive: true, pinHash: VALID_HASH },
      inputHash: VALID_HASH
    }),
    true
  );

  assert.equal(
    canUnlockAdminPin({
      staff: { role: 'cashier', isActive: true, pinHash: VALID_HASH },
      inputHash: VALID_HASH
    }),
    false
  );

  assert.equal(
    canUnlockAdminPin({
      staff: null,
      inputHash: VALID_HASH,
      configuredHash: VALID_HASH
    }),
    true
  );
});
