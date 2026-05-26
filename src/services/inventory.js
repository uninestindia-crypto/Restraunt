/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Inventory Service
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../db/database.js';

class InventoryService {
  async getStockLevels() {
    try {
      return await db.inventory.toArray();
    } catch (e) {
      console.error('[InventoryService] Dexie database error in getStockLevels:', e);
      return [];
    }
  }

  async getLowStockItems() {
    try {
      const items = await db.inventory.toArray();
      return items.filter(i => i.quantity <= (i.minThreshold || 0));
    } catch (e) {
      console.error('[InventoryService] Dexie database error in getLowStockItems:', e);
      return [];
    }
  }

  async updateStock(id, quantity) {
    try {
      return await db.inventory.update(id, { quantity });
    } catch (e) {
      console.error(`[InventoryService] Dexie database error in updateStock for ID ${id}:`, e);
      return 0;
    }
  }

  async addItem(item) {
    try {
      return await db.inventory.add({ ...item, isSynced: 0, _platform: 'nextgenos' });
    } catch (e) {
      console.error('[InventoryService] Dexie database error in addItem:', e);
      return null;
    }
  }

  async deleteItem(id) {
    try {
      return await db.inventory.delete(id);
    } catch (e) {
      console.error(`[InventoryService] Dexie database error in deleteItem for ID ${id}:`, e);
      return null;
    }
  }

  async getSuppliers() {
    try {
      return await db.suppliers.toArray();
    } catch (e) {
      console.error('[InventoryService] Dexie database error in getSuppliers:', e);
      return [];
    }
  }

  async addSupplier(supplier) {
    try {
      return await db.suppliers.add({ ...supplier, createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' });
    } catch (e) {
      console.error('[InventoryService] Dexie database error in addSupplier:', e);
      return null;
    }
  }

  async deleteSupplier(id) {
    try {
      return await db.suppliers.delete(id);
    } catch (e) {
      console.error(`[InventoryService] Dexie database error in deleteSupplier for ID ${id}:`, e);
      return null;
    }
  }
}

export const inventoryService = new InventoryService();
