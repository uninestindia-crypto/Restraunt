// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Table Service
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../db/database';

const tablesStore = () => db.table('tables');

class TableService {
  async getAllTables() {
    try {
      return await tablesStore().orderBy('number').toArray();
    } catch (e) {
      console.error('[TableService] Dexie database error in getAllTables:', e);
      return [];
    }
  }

  async updateTableStatus(id, status) {
    try {
      return await tablesStore().update(id, { status });
    } catch (e) {
      console.error(`[TableService] Dexie database error in updateTableStatus for ID ${id}:`, e);
      return 0;
    }
  }

  async addTable(table) {
    try {
      return await tablesStore().add({ ...table, status: 'available', isSynced: 0, _platform: 'nextgenos' });
    } catch (e) {
      console.error('[TableService] Dexie database error in addTable:', e);
      return null;
    }
  }

  async deleteTable(id) {
    try {
      return await tablesStore().delete(id);
    } catch (e) {
      console.error(`[TableService] Dexie database error in deleteTable for ID ${id}:`, e);
      return null;
    }
  }

  async getTableStats() {
    try {
      const tables = await this.getAllTables();
      return {
        total: tables.length,
        available: tables.filter(t => t.status === 'available').length,
        occupied: tables.filter(t => t.status === 'occupied').length,
        reserved: tables.filter(t => t.status === 'reserved').length,
        cleaning: tables.filter(t => t.status === 'cleaning').length,
      };
    } catch (e) {
      console.error('[TableService] Dexie database error in getTableStats:', e);
      return { total: 0, available: 0, occupied: 0, reserved: 0, cleaning: 0 };
    }
  }

  async seedDefaultTables() {
    try {
      const count = await tablesStore().count();
      if (count > 0) return;

      const defaults = [
        { number: 1, capacity: 2, floorSection: 'Main', status: 'available' },
        { number: 2, capacity: 4, floorSection: 'Main', status: 'available' },
        { number: 3, capacity: 2, floorSection: 'Main', status: 'available' },
        { number: 4, capacity: 6, floorSection: 'Main', status: 'available' },
        { number: 5, capacity: 2, floorSection: 'Window', status: 'available' },
        { number: 6, capacity: 4, floorSection: 'Window', status: 'available' },
        { number: 7, capacity: 4, floorSection: 'Patio', status: 'available' },
        { number: 8, capacity: 2, floorSection: 'Patio', status: 'available' },
      ];

      await tablesStore().bulkAdd(defaults.map(t => ({ ...t, isSynced: 0, _platform: 'nextgenos' })));
    } catch (e) {
      console.error('[TableService] Dexie database error in seedDefaultTables:', e);
    }
  }
}

export const tableService = new TableService();
