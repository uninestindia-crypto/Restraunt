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

/** 8-hour session duration in milliseconds */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

class AuthService {
  constructor() {
    this.currentStaff = null;
    this.isAuthenticated = false;
    this.sessionTimeout = null;
  }

  /**
   * Look up a staff member by their PIN code.
   * @param {string} pin - The staff PIN
   * @returns {Promise<Object|null>} The matching staff record or null
   */
  async getStaffByPin(pin) {
    try {
      const staff = await db.staff
        .where('pin')
        .equals(pin)
        .and(s => s.isActive === 1 || s.isActive === true)
        .first();
      return staff || null;
    } catch (error) {
      console.error('[AuthService] Dexie database error in getStaffByPin:', error);
      return null;
    }
  }

  /**
   * Authenticate a staff member using their PIN.
   * Starts an 8-hour session timer and logs the login to activityLog.
   * @param {string} pin - The staff PIN
   * @returns {Promise<Object|null>} The authenticated staff object, or null on failure
   */
  async login(pin) {
    try {
      const staff = await this.getStaffByPin(pin);
      if (!staff) {
        console.warn('[AuthService] Login failed: no active staff found for the provided PIN.');
        return null;
      }

      this.currentStaff = staff;
      this.isAuthenticated = true;

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

    this.currentStaff = null;
    this.isAuthenticated = false;

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
