/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Table Management
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../../db/database';
import { tableService } from '../../services/tables';
import { showToast, playSound, vibrateDevice, escapeHtml } from '../../utils/helpers';

const STATUS_CONFIG = {
  available: { label: 'Available', color: 'var(--color-success-on-surface)', bg: 'rgba(var(--color-success-rgb),0.08)', border: 'rgba(var(--color-success-rgb),0.25)', icon: 'check_circle' },
  occupied: { label: 'Occupied', color: 'var(--color-danger)', bg: 'rgba(var(--color-danger-rgb),0.08)', border: 'rgba(var(--color-danger-rgb),0.25)', icon: 'group' },
  reserved: { label: 'Reserved', color: 'var(--color-warning)', bg: 'rgba(var(--color-warning-rgb),0.08)', border: 'rgba(var(--color-warning-rgb),0.25)', icon: 'event' },
  cleaning: { label: 'Cleaning', color: 'var(--color-info)', bg: 'rgba(var(--color-info-rgb),0.08)', border: 'rgba(var(--color-info-rgb),0.25)', icon: 'cleaning_services' },
};
const STATUS_CYCLE = ['available', 'occupied', 'reserved', 'cleaning'];

export class TablesView {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare app: any;
  declare container: any;

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
      <div class="main-area">
        <div class="header-bar">
          <div class="header-bar-title">
            <span class="material-symbols-rounded">table_bar</span>
            <h2>Table Management</h2>
          </div>
          <button id="add-table-btn" class="btn btn-primary btn-sm">
            <span class="material-symbols-rounded" style="font-size:16px;">add</span> Add Table
          </button>
        </div>
        <div id="table-stats" class="stats-grid"></div>
        <div style="padding:4px 24px 8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          ${Object.entries(STATUS_CONFIG).map(([k, v]) => `<span style="display:flex;align-items:center;gap:6px;font-size:0.65rem;color:var(--text-secondary);font-weight:600;"><span style="width:8px;height:8px;border-radius:50%;background:${v.color};display:inline-block;box-shadow: 0 0 6px ${v.color};"></span>${v.label}</span>`).join('')}
        </div>
        <div style="flex:1;overflow-y:auto;padding:8px 24px 24px;" id="tables-grid"></div>
      </div>
      <div id="table-modal" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:360px;">
          <div class="modal-header">
            <h3>Add Table</h3>
            <button class="btn-icon" id="tbl-close-icon"><span class="material-symbols-rounded">close</span></button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
            <div class="input-group">
              <label for="tbl-number">Table Number</label>
              <input type="number" id="tbl-number" class="input" placeholder="e.g. 5">
            </div>
            <div class="input-group">
              <label for="tbl-capacity">Capacity (Seats)</label>
              <input type="number" id="tbl-capacity" class="input" placeholder="e.g. 4">
            </div>
            <div class="input-group">
              <label for="tbl-section">Floor Section</label>
              <input type="text" id="tbl-section" class="input" placeholder="e.g. Main">
            </div>
          </div>
          <div class="modal-footer">
            <button id="tbl-cancel" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="tbl-save" class="btn btn-primary btn-sm">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const modal = document.getElementById('table-modal');
    document.getElementById('add-table-btn').addEventListener('click', () => {
      playSound(700, 80);
      modal.style.display = 'flex';
    });
    const closeModal = () => { modal.style.display = 'none'; };
    document.getElementById('tbl-cancel').addEventListener('click', closeModal);
    document.getElementById('tbl-close-icon')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('tbl-save').addEventListener('click', async () => {
      const number = parseInt((document.getElementById('tbl-number') as HTMLInputElement).value) || 0;
      const capacity = parseInt((document.getElementById('tbl-capacity') as HTMLInputElement).value) || 2;
      const floorSection = (document.getElementById('tbl-section') as HTMLInputElement).value.trim() || 'Main';
      if (!number) { showToast('Table number required', 'error'); return; }
      await tableService.addTable({ number, capacity, floorSection });
      document.getElementById('table-modal').style.display = 'none';
      playSound(900, 100); vibrateDevice([40]);
      showToast('Table added!', 'success');
      await this.loadTables();
    });
  }

  async loadTables() {
    // tableService.getAllTables() reads the floor live; nothing else on this
    // screen comes from a cloud-owned table.
    const tables = await tableService.getAllTables();
    const stats = await tableService.getTableStats();

    // Stats
    const statsEl = document.getElementById('table-stats');
    if (statsEl) {
      statsEl.innerHTML = [
        { label: 'TOTAL', value: stats.total, color: 'var(--text-primary)' },
        { label: 'AVAILABLE', value: stats.available, color: 'var(--color-success-on-surface)' },
        { label: 'OCCUPIED', value: stats.occupied, color: 'var(--color-danger)' },
        { label: 'RESERVED', value: stats.reserved, color: 'var(--color-warning)' },
      ].map(k => `
        <div class="stats-card" style="text-align: center;">
          <div class="stats-card-label">${k.label}</div>
          <div class="stats-card-value" style="color:${k.color};">${k.value}</div>
        </div>
      `).join('');
    }

    // Grid
    const grid = document.getElementById('tables-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="content-grid" style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));">${tables.map(t => {
      const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.available;
      return `
        <div class="table-card card" data-id="${escapeHtml(String(t.id ?? ''))}" style="border: 1.5px solid ${cfg.border}; background: ${cfg.bg}; text-align: center; cursor: pointer; padding: 18px 14px;">
          <div style="font-family:var(--font-display); font-size:1.45rem; font-weight:800; color:${cfg.color}; margin-bottom:6px;">T${escapeHtml(String(t.number ?? ''))}</div>
          <span class="material-symbols-rounded" style="font-size:24px; color:${cfg.color}; display:block; margin-bottom:6px; filter: drop-shadow(0 0 6px ${cfg.border});">${cfg.icon}</span>
          <div style="font-size:0.7rem; color:var(--text-muted); font-weight:600;">${escapeHtml(t.capacity)} seats · ${escapeHtml(t.floorSection || 'Main')}</div>
          <div style="font-size:0.6rem; color:${cfg.color}; font-weight:700; margin-top:6px; text-transform:uppercase; letter-spacing:0.06em;">${cfg.label}</div>
        </div>
      `;
    }).join('')}</div>`;

    // Click to cycle status
    grid.querySelectorAll('.table-card').forEach(card => {
      card.addEventListener('click', async () => {
        const id = parseInt((card as HTMLElement).dataset.id);
        const table = await db.table('tables').get(id);
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
