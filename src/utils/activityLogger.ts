// @ts-nocheck
/**
 * ============================================
 * NextGenOS - Restaurant POS System
 * Activity Logger Utility
 * ============================================
 * Centralized activity logging for tracking
 * staff actions, order events, inventory
 * changes, and system operations.
 * ============================================
 */

import { db } from '../db/database';
import { authService } from '../services/auth';

// ── Core Logger ──────────────────────────────────────────────

/**
 * Logs an activity record to the database.
 * @param {string} action - The action being logged.
 * @param {string} details - Additional details about the action.
 */
export async function logActivity(action, details = '') {
    try {
        const currentStaff = authService.getCurrentStaff();

        await db.activityLog.add({
            staffId: currentStaff?.id || null,
            staffName: currentStaff?.name || 'System',
            action,
            details,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[ActivityLogger] Failed to log activity:', error);
    }
}

// ── Preset Loggers ───────────────────────────────────────────

/**
 * Logs when a new order is placed.
 */
export function logOrderPlaced(orderNumber, total) {
    return logActivity('ORDER_PLACED', `Order #${orderNumber} placed (₹${total})`);
}

/**
 * Logs when an order is completed.
 */
export function logOrderCompleted(orderNumber) {
    return logActivity('ORDER_COMPLETED', `Order #${orderNumber} completed`);
}

/**
 * Logs when a staff member logs in.
 */
export function logStaffLogin(staffName) {
    return logActivity('STAFF_LOGIN', `Staff login: ${staffName}`);
}

/**
 * Logs when a staff member logs out.
 */
export function logStaffLogout(staffName) {
    return logActivity('STAFF_LOGOUT', `Staff logout: ${staffName}`);
}

/**
 * Logs when a new menu item is added.
 */
export function logItemAdded(itemName) {
    return logActivity('ITEM_ADDED', `Menu item added: ${itemName}`);
}

/**
 * Logs when inventory stock is updated.
 */
export function logInventoryUpdated(itemName, qty) {
    return logActivity('INVENTORY_UPDATED', `Stock updated: ${itemName} to ${qty}`);
}

/**
 * Logs when a new customer is added.
 */
export function logCustomerAdded(name) {
    return logActivity('CUSTOMER_ADDED', `Customer added: ${name}`);
}

/**
 * Logs when a staff shift starts.
 */
export function logShiftStarted(staffName) {
    return logActivity('SHIFT_STARTED', `Shift started: ${staffName}`);
}

/**
 * Logs when a staff shift ends.
 */
export function logShiftEnded(staffName) {
    return logActivity('SHIFT_ENDED', `Shift ended: ${staffName}`);
}

/**
 * Logs when data is exported.
 */
export function logDataExported() {
    return logActivity('DATA_EXPORTED', 'Data exported');
}
