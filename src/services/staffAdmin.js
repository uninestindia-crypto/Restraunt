import { getSupabaseClient } from './supabaseClient.js';

const DEFAULT_STORE_ID = 'the-taste';
const STAFF_ROLES = ['owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery'];

function getStoreId() {
  return localStorage.getItem('store_id') || DEFAULT_STORE_ID;
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return STAFF_ROLES.includes(value) ? value : 'cashier';
}

function isActive(value) {
  return value === true || value === 1 || value === 'true';
}

export function mapStaffForAdminFunction(staff) {
  return {
    id: staff?.id || null,
    storeId: getStoreId(),
    cloudUserId: staff?.cloudUserId || null,
    name: String(staff?.name || '').trim(),
    role: normalizeRole(staff?.role),
    pinHash: staff?.pinHash || null,
    allowExpress: staff?.allowExpress === 1 || staff?.allowExpress === true,
    isActive: staff?.isActive === undefined ? true : isActive(staff.isActive),
    createdAt: staff?.createdAt || null,
    updatedAt: staff?.updatedAt || new Date().toISOString()
  };
}

export async function invokeStaffAdmin(action, body = {}) {
  const client = await getSupabaseClient({ persistSession: true });
  if (!client) {
    return { success: false, message: 'Supabase URL and anon key are not configured.' };
  }

  const { data, error } = await client.functions.invoke('staff-admin', {
    body: { action, storeId: getStoreId(), ...body }
  });

  if (error) {
    let message = error.message || String(error);
    try {
      const body = await error.context?.json?.();
      message = body?.error || message;
    } catch (_parseError) {
      // Keep the Supabase client error message when the function body is empty.
    }
    return { success: false, message };
  }
  if (data?.error) {
    return { success: false, message: data.error };
  }

  return { success: true, data };
}

export async function syncStaffViaAdminFunction(staff) {
  const mapped = mapStaffForAdminFunction(staff);
  if (!mapped.name) {
    return { success: false, message: 'Staff name is required.' };
  }
  return invokeStaffAdmin('upsert-staff', { staff: mapped });
}

export async function setStaffActiveViaAdminFunction(staffOrId, active) {
  const staffId = typeof staffOrId === 'object' ? staffOrId?.id : staffOrId;
  if (!staffId) {
    return { success: false, message: 'Staff ID is required.' };
  }
  return invokeStaffAdmin('set-active', { staffId, isActive: Boolean(active) });
}

/**
 * Look up a Supabase Auth user by email to verify they have real credentials.
 * Used by StaffView to enforce that operational backend access is only granted
 * to users with actual Supabase Auth accounts (not fake/local-only staff).
 *
 * @param {string} email - Email address to look up
 * @returns {{ success: boolean, data?: { found: boolean, authUserId?: string, email?: string, confirmed?: boolean, existingMembership?: object }, message?: string }}
 */
export async function lookupAuthUser(email) {
  if (!email || !email.includes('@')) {
    return { success: false, message: 'A valid email address is required.' };
  }
  return invokeStaffAdmin('lookup-auth-user', { email: email.toLowerCase().trim() });
}
