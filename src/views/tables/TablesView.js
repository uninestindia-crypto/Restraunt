/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Table Management
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../../db/database.js';
import { tableService } from '../../services/tables.js';
import { showToast, playSound, vibrateDevice } from '../../utils/helpers.js';

const STATUS_CONFIG = {
  available: { label: 'Available', color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', icon: 'check_circle' },
  occupied: { label: 'Occupied', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', icon: 'group' },
  reserved: { label: 'Reserved', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: 'event' },
  cleaning: { label: 'Cleaning', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', icon: 'cleaning_services' },
};
const STATUS_CYCLE = ['available', 'occupied', 'reserved', 'cleaning'];

export class TablesView {
  constructor(app) { this.app = app; this.container = null; }

  async mount(container) {
    this.container = container;
    await tableService.seedDefaultTables();
    this.render();
    this.bindEvents();
    await this.loadTables();
  }

  render() {
    this.container.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;height:calc(100vh - 60px);height:calc(100dvh - 60px);overflow:hidden;background:var(--bg-primary);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:rgba(9,9,14,0.8);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="material-symbols-rounded" style="color:var(--color-primary);font-size:24px;">table_bar</span>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);margin:0;">Table Management</h2>
          </div>
          <button id="add-table-btn" style="padding:8px 14px;background:var(--gradient-primary);border:none;border-radius:8px;color:white;font-size:var(--text-xs);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Plus Jakarta Sans',sans-serif;">
            <span class="material-symbols-rounded" style="font-size:16px;">add</span> Add Table
          </button>
        </div>
        <div id="table-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;padding:16px 24px;"></div>
        <div style="padding:4px 24px 8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          ${Object.entries(STATUS_CONFIG).map(([k, v]) => `<span style="display:flex;align-items:center;gap:4px;font-size:0.65rem;color:var(--text-muted);font-weight:600;"><span style="width:8px;height:8px;border-radius:50%;background:${v.color};"></span>${v.label}</span>`).join('')}
        </div>
        <div style="flex:1;overflow-y:auto;padding:8px 24px 24px;" id="tables-grid"></div>
      </div>
      <div id="table-modal" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
        <div style="background:var(--bg-secondary);border:1px solid var(--border-glass);border-radius:20px;padding:28px;width:90%;max-width:360px;">
          <h3 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-md);font-weight:800;color:var(--text-primary);margin:0 0 20px;">Add Table</h3>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <input type="number" id="tbl-number" placeholder="Table number" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:Inter,sans-serif;">
            <input type="number" id="tbl-capacity" placeholder="Capacity (seats)" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:Inter,sans-serif;">
            <input type="text" id="tbl-section" placeholder="Floor section (e.g., Main)" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:Inter,sans-serif;">
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button id="tbl-cancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-secondary);font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Cancel</button>
            <button id="tbl-save" style="flex:1;padding:10px;background:var(--gradient-primary);border:none;border-radius:10px;color:white;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    document.getElementById('add-table-btn').addEventListener('click', () => {
      playSound(700, 80);
      document.getElementById('table-modal').style.display = 'flex';
    });
    document.getElementById('tbl-cancel').addEventListener('click', () => { document.getElementById('table-modal').style.display = 'none'; });
    document.getElementById('tbl-save').addEventListener('click', async () => {
      const number = parseInt(document.getElementById('tbl-number').value) || 0;
      const capacity = parseInt(document.getElementById('tbl-capacity').value) || 2;
      const floorSection = document.getElementById('tbl-section').value.trim() || 'Main';
      if (!number) { showToast('Table number required', 'error'); return; }
      await tableService.addTable({ number, capacity, floorSection });
      document.getElementById('table-modal').style.display = 'none';
      playSound(900, 100); vibrateDevice([40]);
      showToast('Table added!', 'success');
      await this.loadTables();
    });
  }

  async loadTables() {
    const tables = await tableService.getAllTables();
    const stats = await tableService.getTableStats();

    // Stats
    const statsEl = document.getElementById('table-stats');
    if (statsEl) {
      statsEl.innerHTML = [
        { label: 'TOTAL', value: stats.total, color: 'var(--text-primary)' },
        { label: 'AVAILABLE', value: stats.available, color: '#10B981' },
        { label: 'OCCUPIED', value: stats.occupied, color: '#EF4444' },
        { label: 'RESERVED', value: stats.reserved, color: '#F59E0B' },
      ].map(k => `
        <div style="padding:12px 14px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:10px;text-align:center;">
          <div style="font-size:0.55rem;color:var(--text-muted);font-weight:700;letter-spacing:0.08em;">${k.label}</div>
          <div style="font-size:1.3rem;font-weight:800;color:${k.color};font-family:'Plus Jakarta Sans',sans-serif;margin-top:2px;">${k.value}</div>
        </div>
      `).join('');
    }

    // Grid
    const grid = document.getElementById('tables-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px;">${tables.map(t => {
      const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.available;
      return `
        <div class="table-card" data-id="${t.id}" style="padding:20px;background:${cfg.bg};border:2px solid ${cfg.border};border-radius:16px;text-align:center;cursor:pointer;transition:all 0.2s;user-select:none;">
          <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:1.4rem;font-weight:800;color:${cfg.color};margin-bottom:6px;">T${t.number}</div>
          <span class="material-symbols-rounded" style="font-size:24px;color:${cfg.color};display:block;margin-bottom:6px;">${cfg.icon}</span>
          <div style="font-size:0.7rem;color:var(--text-muted);font-weight:600;">${t.capacity} seats · ${t.floorSection || 'Main'}</div>
          <div style="font-size:0.6rem;color:${cfg.color};font-weight:700;margin-top:6px;text-transform:uppercase;letter-spacing:0.06em;">${cfg.label}</div>
        </div>
      `;
    }).join('')}</div>`;

    // Click to cycle status
    grid.querySelectorAll('.table-card').forEach(card => {
      card.addEventListener('click', async () => {
        const id = parseInt(card.dataset.id);
        const table = await db.tables.get(id);
        if (!table) return;
        const idx = STATUS_CYCLE.indexOf(table.status || 'available');
        const nextStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
        await tableService.updateTableStatus(id, nextStatus);
        playSound(700, 80);
        vibrateDevice([30]);
        await this.loadTables();
      });
    });
  }

  unmount() { this.container = null; }
}
