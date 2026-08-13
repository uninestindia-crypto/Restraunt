import { db } from '../db/database';
import {
  CloudStaffAccessError,
  appMetadataToStaffAccess,
  isActiveFlag,
  normalizeStaffRole,
  requireCloudStaffAccess
} from './authGuards';
import { signInCloudStaff, signOutCloudStaff } from './supabaseClient';
import { globalStore } from '../store/Store';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_STORE_ID = 'the-taste';
class AuthService {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare currentStaff: any;
  declare isAuthenticated: any;
  declare sessionTimeout: any;

  constructor() {
    this.currentStaff = null;
    this.isAuthenticated = false;
    this.sessionTimeout = null;
  }

  _getStoreId() {
    return localStorage.getItem('store_id') || DEFAULT_STORE_ID;
  }

  async _getRemoteStaffMembership(user) {
    const { getSupabaseClient } = await import('./supabaseClient');
    const client = await getSupabaseClient();
    if (!client) {
      throw new CloudStaffAccessError('Supabase is not configured for cloud staff login.');
    }

    const { data, error } = await client
      .from('staff_memberships')
      .select('role, staff_id, store_id, is_active')
      .eq('store_id', this._getStoreId())
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new CloudStaffAccessError(`Unable to verify staff membership: ${error.message}`);
    }

    return data || null;
  }

  async _getRemoteStaffRecord(user, access) {
    const { getSupabaseClient } = await import('./supabaseClient');
    const client = await getSupabaseClient();
    if (!client) return null;

    let query = client
      .from('staff')
      .select('id, auth_user_id, name, role, allow_express, is_active, created_at, updated_at')
      .eq('store_id', this._getStoreId())
      .eq('is_active', true);

    query = access.staffId
      ? query.eq('id', access.staffId)
      : query.eq('auth_user_id', user.id);

    const { data, error } = await query.maybeSingle();
    if (error) {
      console.warn('[AuthService] Unable to load staff profile:', error.message);
    }
    if (data) {
      return {
        id: data.id,
        cloudUserId: data.auth_user_id || user.id,
        name: data.name,
        role: normalizeStaffRole(data.role) || access.role,
        allowExpress: data.allow_express ? 1 : 0,
        isActive: data.is_active ? 1 : 0,
        createdAt: data.created_at || new Date().toISOString(),
        updatedAt: data.updated_at || new Date().toISOString(),
        isSynced: 1
      };
    }

    return null;
  }

  async _resolveCloudStaff(user, emailFallback = '') {
    if (!user) return null;

    const membership = await this._getRemoteStaffMembership(user);
    const access = requireCloudStaffAccess(user, membership, this._getStoreId());
    const remoteStaff = await this._getRemoteStaffRecord(user, access);
    if (!remoteStaff || !isActiveFlag(remoteStaff.isActive)) {
      throw new CloudStaffAccessError('Cloud staff profile is missing or inactive. Run the admin recovery tool.');
    }

    const userEmail = user.email || emailFallback || '';
    const fallbackName = user.app_metadata?.name || user.user_metadata?.name || userEmail.split('@')[0] || 'Cloud User';
    remoteStaff.name = remoteStaff.name || fallbackName;
    remoteStaff.cloudUserId = user.id;
    remoteStaff.role = access.role;

    await db.staff.put(remoteStaff);
    return remoteStaff;
  }

  async _resolveCustomer(user, emailFallback = '') {
    if (!user) return null;

    const userEmail = user.email || emailFallback || '';
    const name = user.user_metadata?.name || userEmail.split('@')[0] || 'Cloud User';

    let customer = await db.customers
      .where('authUserId')
      .equals(user.id)
      .first();

    if (!customer) {
      customer = {
        id: Date.now(),
        name,
        phone: '',
        authUserId: user.id,
        totalSpent: 0,
        visitCount: 0,
        loyaltyPoints: 0,
        tier: 'bronze',
        createdAt: new Date().toISOString()
      };
      await db.customers.put(customer);
    }

    return {
      id: customer.id,
      name: customer.name,
      role: 'customer',
      cloudUserId: user.id,
      isActive: true,
      createdAt: customer.createdAt || new Date().toISOString()
    };
  }

  async _hydrateStaffCloudData(role = '') {
    try {
      const { fullPull } = await import('./cloudDb');
      const result = await fullPull({ publicOnly: false, role });
      return result?.success === true;
    } catch (error) {
      console.warn('[AuthService] Cloud hydration after staff login failed:', error);
      return false;
    }
  }

  async restoreSession() {
    try {
      const { getCloudSession } = await import('./supabaseClient');
      const session = await getCloudSession();
      if (session?.user) {
        let account = null;
        try {
          account = await this._resolveCloudStaff(session.user);
        } catch (error) {
          if (!(error instanceof CloudStaffAccessError)) throw error;
          const staffHint = appMetadataToStaffAccess(session.user, this._getStoreId());
          if (staffHint) {
            console.warn('[AuthService] Stored cloud staff session lacks active membership. Clearing session.');
            await signOutCloudStaff();
            return null;
          }
          account = await this._resolveCustomer(session.user);
        }

        if (account) {
          this.currentStaff = account;
          this.isAuthenticated = true;
          this._startSessionTimer();
          return account;
        }
      }
    } catch (e) {
      console.error('[AuthService] Error restoring cloud session:', e);
    }

    // PIN sessions are deliberately not restored from browser-controlled storage.
    localStorage.removeItem('auth_staff_pin');

    return null;
  }

  async loginWithCloudCredentials(email, password) {
    if (!email || !password) return null;
    try {
      const result = await signInCloudStaff(email, password);
      if (!result.success) {
        console.warn('[AuthService] Cloud login failed:', result.message);
        throw new Error(result.message || 'Cloud authentication failed');
      }

      const user = result.user;
      if (!user) return null;

      let staff = await this._resolveCloudStaff(user, email);
      await this._hydrateStaffCloudData(staff.role);

      const hydratedStaff = await db.staff.get(staff.id);
      if (hydratedStaff && isActiveFlag(hydratedStaff.isActive)) {
        staff = hydratedStaff as typeof staff;
      }

      this.currentStaff = staff;
      this.isAuthenticated = true;
      globalStore.updateState({ activeTerminalStaff: staff });
      localStorage.setItem('auth_staff_email', email);
      
      localStorage.removeItem('auth_failed_attempts');
      localStorage.removeItem('auth_lockout_until');

      this._startSessionTimer();

      try {
        await db.activityLog.add({
          staffId: staff.id,
          action: 'cloud_login',
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.error('[AuthService] Error logging cloud login activity:', e);
      }

      console.log(`[AuthService] Enterprise Cloud Staff "${staff.name}" (${staff.role}) authenticated successfully.`);
      return staff;
    } catch (error) {
      console.error('[AuthService] Cloud login failed:', error);
      if (error instanceof CloudStaffAccessError) {
        await signOutCloudStaff().catch(signOutError => {
          console.warn('[AuthService] Could not clear rejected cloud staff session:', signOutError);
        });
      }
      throw error;
    }
  }

  async loginCustomerWithCloudCredentials(email, password) {
    if (!email || !password) return null;
    const result = await signInCloudStaff(email, password);
    if (!result.success) {
      throw new Error(result.message || 'Cloud authentication failed');
    }

    const customer = await this._resolveCustomer(result.user, email);
    this.currentStaff = customer;
    this.isAuthenticated = true;
    globalStore.updateState({ activeTerminalStaff: customer });
    this._startSessionTimer();
    return customer;
  }

  logout() {
    const staffName = this.currentStaff?.name || 'Unknown';
    const staffId = this.currentStaff?.id || null;

    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }

    signOutCloudStaff().catch(err => {
      console.error('[AuthService] Supabase cloud signout error on logout:', err);
    });

    this.currentStaff = null;
    this.isAuthenticated = false;
    globalStore.updateState({ activeTerminalStaff: null });
    localStorage.removeItem('auth_staff_pin');
    localStorage.removeItem('auth_staff_email');

    if (staffId) {
      try {
        db.activityLog.add({
          staffId,
          action: 'logout',
          timestamp: new Date().toISOString()
        });
      } catch (logError) {
        console.error('[AuthService] Dexie database error logging logout activity:', logError);
      }
    }

    console.log(`[AuthService] Staff "${staffName}" logged out.`);
  }

  getCurrentStaff() {
    return this.currentStaff;
  }

  isOwnerOrManager() {
    if (!this.currentStaff) return false;
    const role = this.currentStaff.role?.toLowerCase();
    return role === 'owner' || role === 'manager';
  }

  requireAuth() {
    return this.isAuthenticated && this.currentStaff && this.currentStaff.role !== 'customer';
  }

  getLockoutRemaining() {
    const lockoutUntil = parseInt(localStorage.getItem('auth_lockout_until') || '0', 10);
    const remaining = lockoutUntil - Date.now();
    if (remaining <= 0) {
      localStorage.removeItem('auth_lockout_until');
      return 0;
    }
    return remaining;
  }

  recordFailedAttempt() {
    const attempts = parseInt(localStorage.getItem('auth_failed_attempts') || '0', 10) + 1;
    localStorage.setItem('auth_failed_attempts', String(attempts));
    if (attempts >= LOCKOUT_MAX_ATTEMPTS) {
      localStorage.setItem('auth_lockout_until', String(Date.now() + LOCKOUT_DURATION_MS));
      localStorage.setItem('auth_failed_attempts', '0');
    }
  }

  async _startSessionTimer() {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
    }

    let durationMs = SESSION_DURATION_MS;
    try {
      const { getSetting } = await import('../db/database');
      const settingVal = await getSetting('sessionDuration');
      if (settingVal) {
        const hours = parseInt(settingVal, 10);
        if (!isNaN(hours) && hours > 0) {
          durationMs = hours * 60 * 60 * 1000;
        }
      }
    } catch (e) {
      console.error('[AuthService] Error loading sessionDuration setting, using default:', e);
    }

    this.sessionTimeout = setTimeout(() => {
      console.warn('[AuthService] Session expired. Logging out automatically.');
      this.logout();
      window.dispatchEvent(new CustomEvent('auth-session-expired'));
    }, durationMs);
  }
}

export const authService = new AuthService();
