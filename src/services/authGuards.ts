// @ts-nocheck
export const STAFF_ROLES = ['developer', 'owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery'];

export class CloudStaffAccessError extends Error {
  constructor(message = 'This cloud account is not linked to an active staff profile.') {
    super(message);
    this.name = 'CloudStaffAccessError';
  }
}

export function normalizeStaffRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return STAFF_ROLES.includes(normalized) ? normalized : '';
}

export function isActiveFlag(value) {
  return value === true || value === 1 || value === 'true';
}

export function isActiveStaffWithPin(staff) {
  return Boolean(
    staff &&
    normalizeStaffRole(staff.role) &&
    isActiveFlag(staff.isActive) &&
    typeof staff.pinHash === 'string' &&
    /^[0-9a-f]{64}$/.test(staff.pinHash)
  );
}

export function membershipToStaffAccess(membership, storeId = 'the-taste') {
  if (!membership) return null;
  const role = normalizeStaffRole(membership.role);
  const membershipStore = membership.store_id || storeId;
  const active = membership.is_active === undefined ? true : isActiveFlag(membership.is_active);

  if (!role || !active) return null;
  if (role !== 'developer' && membershipStore !== storeId) return null;

  return {
    role,
    staffId: membership.staff_id || null,
    storeId: membershipStore
  };
}

export function appMetadataToStaffAccess(user, storeId = 'the-taste') {
  const metadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};
  const role = normalizeStaffRole(metadata.role) || normalizeStaffRole(userMetadata.role);
  const stores = Array.isArray(metadata.stores) ? metadata.stores : [];
  const storeMatches = role === 'developer' || metadata.store_id === storeId || stores.includes(storeId) || !metadata.store_id;
  const active = metadata.is_active === undefined ? true : isActiveFlag(metadata.is_active);

  if (!role || !storeMatches || !active) return null;

  return {
    role,
    staffId: metadata.staff_id || null,
    storeId
  };
}

export function requireCloudStaffAccess(user, membership, storeId = 'the-taste') {
  const access = membershipToStaffAccess(membership, storeId);
  if (access) return access;

  const hintedAccess = appMetadataToStaffAccess(user, storeId);
  if (hintedAccess && hintedAccess.role === 'developer') {
    return hintedAccess;
  }

  const hint = hintedAccess
    ? ' Server metadata says this is a staff account, but the database membership required by RLS is missing or inactive.'
    : '';
  throw new CloudStaffAccessError(`Cloud staff access is not active for this restaurant.${hint}`);
}

export function canUnlockAdminPin({
  staff,
  inputHash,
  configuredHash,
  legacyPin,
  inputPin,
  allowManager = true
} = {}) {
  const role = normalizeStaffRole(staff?.role);
  const allowedRoles = allowManager ? ['developer', 'owner', 'manager'] : ['developer', 'owner'];
  const validStaff = isActiveStaffWithPin(staff) && allowedRoles.includes(role);
  const staffMatchesPin = validStaff && staff.pinHash === inputHash;
  const configuredMatchesPin = Boolean(configuredHash && inputHash && configuredHash === inputHash);
  const legacyMatchesPin = Boolean(legacyPin && legacyPin !== '1234' && inputPin === legacyPin);

  return configuredMatchesPin || legacyMatchesPin || staffMatchesPin;
}
