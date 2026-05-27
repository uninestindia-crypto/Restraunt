/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Authentication Service
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../db/database.js';
import { hashPin } from '../utils/crypto.js';
import { signInCloudStaff, signOutCloudStaff } from './supabaseClient.js';

/** 8-hour session duration in milliseconds */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

class AuthService {
  constructor() {
    this.currentStaff = null;
    this.isAuthenticated = false;
    this.sessionTimeout = null;
  }

  /**
   * Resolves a Supabase Auth user to a local staff or customer object.
   * Checks local IndexedDB cache first, then checks user_metadata, and falls back to Supabase queries.
   * @private
   */
  async _resolveStaffOrCustomer(user, emailFallback = '') {
    if (!user) return null;

    // 1. Try to find local staff record by cloudUserId
    let staff = await db.staff
      .where('cloudUserId')
      .equals(user.id)
      .first();

    if (staff) return staff;

    // 2. Not found locally. Determine if user is staff or customer.
    const staffRoles = ['owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery'];
    const metadataRole = user.user_metadata?.role;
    let isStaff = metadataRole && staffRoles.includes(metadataRole.toLowerCase());
    let resolvedRole = metadataRole || 'cashier';
    let resolvedStaffId = null;

    // 3. If metadata doesn't explicitly state staff role, query Supabase staff_memberships table
    if (!isStaff) {
      try {
        const { getSupabaseClient } = await import('./supabaseClient.js');
        const client = await getSupabaseClient();
        if (client) {
          const { data: membership } = await client
            .from('staff_memberships')
            .select('role, staff_id')
            .eq('auth_user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();
          if (membership) {
            isStaff = true;
            resolvedRole = membership.role;
            resolvedStaffId = membership.staff_id;
          }
        }
      } catch (e) {
        console.error('[AuthService] Error checking remote memberships:', e);
      }
    }

    // 4. Fallback to email pattern matching if we still aren't sure (failsafe)
    if (!isStaff) {
      const userEmail = user.email || emailFallback || '';
      const lowercaseEmail = userEmail.toLowerCase();
      isStaff = lowercaseEmail.includes('admin') || 
                lowercaseEmail.includes('staff') || 
                lowercaseEmail.includes('owner') || 
                lowercaseEmail.includes('manager') || 
                lowercaseEmail.includes('cashier') || 
                lowercaseEmail.includes('kitchen') || 
                lowercaseEmail.includes('waiter');
      if (isStaff) {
        resolvedRole = lowercaseEmail.includes('admin') || lowercaseEmail.includes('owner') ? 'owner' : 'cashier';
      }
    }

    const userEmail = user.email || emailFallback || '';
    const name = user.user_metadata?.name || userEmail.split('@')[0] || 'Cloud User';

    if (isStaff) {
      // Build and insert a staff profile locally
      const tempId = resolvedStaffId || Date.now();
      staff = {
        id: tempId,
        name,
        role: resolvedRole.toLowerCase(),
        cloudUserId: user.id,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await db.staff.put(staff);
      return staff;
    } else {
      // Customer flow
      let customer = await db.customers
        .where('authUserId')
        .equals(user.id)
        .first();

      if (!customer) {
        customer = await db.customers
          .filter(c => c.name.toLowerCase() === name.toLowerCase())
          .first();
      }

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
      } else if (!customer.authUserId) {
        await db.customers.update(customer.id, { authUserId: user.id, isSynced: 0 });
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
  }

  /**
   * Attempt to restore a persistent session (both staff PIN, and Supabase Auth cloud user).
   * @returns {Promise<Object|null>} The restored staff/customer object, or null
   */
  async restoreSession() {
    // 1. Check for active Supabase Auth cloud session first
    try {
      const { getCloudSession } = await import('./supabaseClient.js');
      const session = await getCloudSession();
      if (session?.user) {
        const staff = await this._resolveStaffOrCustomer(session.user);
        if (staff) {
          this.currentStaff = staff;
          this.isAuthenticated = true;
          this._startSessionTimer();
          return staff;
        }
      }
    } catch (e) {
      console.error('[AuthService] Error restoring cloud session:', e);
    }

    // 2. Fallback to PIN auto-login
    const savedPin = localStorage.getItem('auth_staff_pin');
    if (savedPin) {
      try {
        const staff = await this.login(savedPin);
        return staff;
      } catch (e) {
        console.error('[AuthService] Error restoring PIN session:', e);
      }
    }

    return null;
  }

  /**
   * Look up a staff member by their PIN code.
   * Supports both raw PINs (hashes it first) and pre-hashed PINs (for auto-login).
   * @param {string} pin - The staff PIN (plain text or SHA-256 hash)
   * @returns {Promise<Object|null>} The matching staff record or null
   */
  async getStaffByPin(pin) {
    if (!pin) return null;
    try {
      const hashedPin = pin.length === 64 ? pin : await hashPin(pin);
      const staff = await db.staff
        .where('pinHash')
        .equals(hashedPin)
        .and(s => s.isActive === 1 || s.isActive === true)
        .first();
      return staff || null;
    } catch (error) {
      console.error('[AuthService] Dexie database error in getStaffByPin:', error);
      return null;
    }
  }

  /**
   * Authenticate a staff member using their PIN (plain text or hash).
   * Starts an 8-hour session timer and logs the login to activityLog.
   * @param {string} pin - The staff PIN (plain text or SHA-256 hash)
   * @returns {Promise<Object|null>} The authenticated staff object, or null on failure
   */
  async login(pin) {
    if (!pin) return null;
    try {
      if (this.getLockoutRemaining() > 0) {
        console.warn('[AuthService] Login blocked by PIN lockout.');
        return null;
      }

      const staff = await this.getStaffByPin(pin);
      if (!staff) {
        this.recordFailedAttempt();
        console.warn('[AuthService] Login failed: no active staff found.');
        return null;
      }

      // Store hashed PIN in localStorage for security (never store plain-text!)
      const hashedPin = pin.length === 64 ? pin : await hashPin(pin);

      this.currentStaff = staff;
      this.isAuthenticated = true;
      localStorage.setItem('auth_staff_pin', hashedPin);
      localStorage.removeItem('auth_failed_attempts');
      localStorage.removeItem('auth_lockout_until');

      // Start session expiry timer (8 hours)
      this._startSessionTimer();

      // Log the login activity
      try {
        await db.activityLog.add({
          staffId: staff.id,
          action: 'login',
          timestamp: new Date().toISOString()
        });
      } catch (logError) {
        console.error('[AuthService] Dexie database error logging login activity:', logError);
      }

      console.log(`[AuthService] Staff "${staff.name}" (${staff.role}) authenticated successfully.`);
      return staff;
    } catch (error) {
      console.error('[AuthService] Dexie database error in login:', error);
      return null;
    }
  }

  /**
   * Authenticate a staff member using their Supabase Auth cloud credentials (email & password).
   * Binds the live cloud session to the local staff record.
   * @param {string} email - Supabase Auth cloud email
   * @param {string} password - Supabase Auth cloud password
   * @returns {Promise<Object|null>} The authenticated staff object, or null on failure
   */
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

      const staff = await this._resolveStaffOrCustomer(user, email);
      if (!staff) return null;

      this.currentStaff = staff;
      this.isAuthenticated = true;
      localStorage.setItem('auth_staff_email', email);
      localStorage.removeItem('auth_failed_attempts');
      localStorage.removeItem('auth_lockout_until');

      // Start session expiry timer (8 hours)
      this._startSessionTimer();

      // Log activity
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
      throw error;
    }
  }

  /**
   * Log out the current staff member.
   * Clears authentication state, cancels the session timer, and logs the action.
   */
  logout() {
    const staffName = this.currentStaff?.name || 'Unknown';
    const staffId = this.currentStaff?.id || null;

    // Clear session timer
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }

    // Call Supabase cloud sign-out asynchronously
    signOutCloudStaff().catch(err => {
      console.error('[AuthService] Supabase cloud signout error on logout:', err);
    });

    this.currentStaff = null;
    this.isAuthenticated = false;
    localStorage.removeItem('auth_staff_pin');
    localStorage.removeItem('auth_staff_email');

    // Log the logout activity
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

  /**
   * Get the currently authenticated staff member.
   * @returns {Object|null} The current staff object or null
   */
  getCurrentStaff() {
    return this.currentStaff;
  }

  /**
   * Check if the current staff member has an owner or manager role.
   * @returns {boolean} True if staff role is 'owner' or 'manager'
   */
  isOwnerOrManager() {
    if (!this.currentStaff) return false;
    const role = this.currentStaff.role?.toLowerCase();
    return role === 'owner' || role === 'manager';
  }

  /**
   * Check whether a staff member is currently authenticated.
   * @returns {boolean} True if authenticated
   */
  requireAuth() {
    return this.isAuthenticated;
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

  /**
   * Start (or restart) the session expiry timer.
   * Automatically logs out the staff member after SESSION_DURATION_MS.
   * @private
   */
  _startSessionTimer() {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
    }

    this.sessionTimeout = setTimeout(() => {
      console.warn('[AuthService] Session expired. Logging out automatically.');
      this.logout();
      window.dispatchEvent(new CustomEvent('auth-session-expired'));
    }, SESSION_DURATION_MS);
  }
}

export const authService = new AuthService();
