// @ts-nocheck
import { getSupabaseClient } from './supabaseClient';
import { normalizeStaffRole } from './authGuards';

const DEFAULT_STORE_ID = 'the-taste';

function getStoreId() {
  return localStorage.getItem('store_id') || DEFAULT_STORE_ID;
}

/**
 * The role list lives in authGuards and nowhere else.
 *
 * This module used to keep its own copy, which had fallen a role behind, and an
 * unrecognised role was quietly rewritten to 'cashier'. So an owner who picked
 * "Express Only" saved a cashier to the cloud — the screen said the account was
 * created, and the account came back as a cashier. Anything this function
 * cannot name is now reported rather than substituted.
 */
function normalizeRole(role) {
  return normalizeStaffRole(role);
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
  if (!mapped.role) {
    return { success: false, message: `"${String(staff?.role || '')}" is not a staff role this app can assign.` };
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
