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
    localStorage.removeItem('auth_staff_pin');

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
