export const STAFF_ROLES = ['developer', 'owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery', 'temporary_staff'];

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
  const role = normalizeStaffRole(metadata.role);
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
  const hint = hintedAccess
    ? ' Server metadata identifies a staff account, but the active database membership required by RLS is missing or inactive.'
    : '';
  throw new CloudStaffAccessError(`Cloud staff access is not active for this restaurant.${hint}`);
}
