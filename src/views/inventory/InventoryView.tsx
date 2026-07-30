// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Inventory Management
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../../db/database';
import { ensureFresh } from '../../services/cloudDb';
import { inventoryService } from '../../services/inventory';
import { escapeHtml, showToast, playSound, vibrateDevice } from '../../utils/helpers';

export class InventoryView {
  constructor(app) { this.app = app; this.container = null; this.tab = 'stock'; }

  async mount(container) {
    this.container = container;
    this.render();
    this.bindEvents();
    await this.loadData();
  }

  render() {
    this.container.innerHTML = `
      <div class="main-area">
        <div class="header-bar">
          <div class="header-bar-title">
            <span class="material-symbols-rounded">inventory_2</span>
            <h2>Inventory & Stock</h2>
          </div>
          <button id="add-inventory-btn" class="btn btn-primary btn-sm">
            <span class="material-symbols-rounded" style="font-size:16px;">add</span> Add Item
          </button>
        </div>
        <div id="low-stock-alert" style="display:none;padding:10px 24px;background:rgba(var(--color-danger-rgb),0.08);border-bottom:1px solid rgba(var(--color-danger-rgb),0.2);"></div>
        
        <div class="tab-container">
          <button class="tab inv-tab active" data-tab="stock">Stock Levels</button>
          <button class="tab inv-tab" data-tab="suppliers">Suppliers</button>
        </div>
        
        <div style="flex:1;overflow-y:auto;padding:24px;" id="inv-content"></div>
      </div>

      <div id="inv-modal" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:400px;">
          <div class="modal-header">
            <h3 id="inv-modal-title">Add Item</h3>
            <button class="btn-icon" id="inv-close-icon"><span class="material-symbols-rounded">close</span></button>
          </div>
          <div class="modal-body" id="inv-modal-fields" style="display:flex;flex-direction:column;gap:14px;"></div>
          <div class="modal-footer">
            <button id="inv-cancel" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="inv-save" class="btn btn-primary btn-sm">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const modal = document.getElementById('inv-modal');
    
    document.getElementById('add-inventory-btn').addEventListener('click', () => {
      playSound(700, 80);
      const isStock = this.tab === 'stock';
      document.getElementById('inv-modal-title').textContent = isStock ? 'Add Inventory Item' : 'Add Supplier';
      document.getElementById('inv-modal-fields').innerHTML = isStock ? `
        <div class="input-group">
          <label for="inv-name">Item Name</label>
          <input type="text" id="inv-name" class="input" placeholder="e.g. Chicken">
        </div>
        <div class="input-group">
          <label for="inv-unit">Measurement Unit</label>
          <select id="inv-unit" class="input">
            <option value="kg">Kilograms (kg)</option>
            <option value="liters">Liters</option>
            <option value="pieces">Pieces</option>
            <option value="packs">Packs</option>
          </select>
        </div>
        <div class="input-group">
          <label for="inv-qty">Current Quantity</label>
          <input type="number" id="inv-qty" class="input" placeholder="0">
        </div>
        <div class="input-group">
          <label for="inv-min">Minimum Threshold</label>
          <input type="number" id="inv-min" class="input" placeholder="e.g. 5">
        </div>
        <div class="input-group">
          <label for="inv-max">Maximum Capacity</label>
          <input type="number" id="inv-max" class="input" placeholder="e.g. 100">
        </div>
      ` : `
        <div class="input-group">
          <label for="sup-name">Supplier Name</label>
          <input type="text" id="sup-name" class="input" placeholder="Supplier name">
        </div>
        <div class="input-group">
          <label for="sup-phone">Phone Number</label>
          <input type="tel" id="sup-phone" class="input" placeholder="Phone">
        </div>
        <div class="input-group">
          <label for="sup-email">Email Address</label>
          <input type="email" id="sup-email" class="input" placeholder="Email">
        </div>
        <div class="input-group">
          <label for="sup-category">Category</label>
          <select id="sup-category" class="input">
            <option value="Produce">Produce</option>
            <option value="Dairy">Dairy</option>
            <option value="Meat">Meat</option>
            <option value="Dry Goods">Dry Goods</option>
            <option value="Beverages">Beverages</option>
            <option value="Other">Other</option>
          </select>
        </div>
      `;
      modal.style.display = 'flex';
    });

    const closeModal = () => { modal.style.display = 'none'; };
    document.getElementById('inv-cancel').addEventListener('click', closeModal);
    document.getElementById('inv-close-icon')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    document.getElementById('inv-save').addEventListener('click', async () => {
      if (this.tab === 'stock') {
        const name = document.getElementById('inv-name')?.value.trim();
        const unit = document.getElementById('inv-unit')?.value;
        const quantity = parseFloat(document.getElementById('inv-qty')?.value) || 0;
        const minThreshold = parseFloat(document.getElementById('inv-min')?.value) || 0;
        const maxCapacity = parseFloat(document.getElementById('inv-max')?.value) || 100;
        if (!name) { showToast('Name is required', 'error'); return; }
        await inventoryService.addItem({ name, unit, quantity, minThreshold, maxCapacity });
      } else {
        const name = document.getElementById('sup-name')?.value.trim();
        const phone = document.getElementById('sup-phone')?.value.trim();
        const email = document.getElementById('sup-email')?.value.trim();
        const category = document.getElementById('sup-category')?.value;
        if (!name) { showToast('Name is required', 'error'); return; }
        await inventoryService.addSupplier({ name, phone, email, category });
      }
      modal.style.display = 'none';
      playSound(900, 100); vibrateDevice([40]);
      showToast('Saved!', 'success');
      await this.loadData();
    });

    this.container.querySelectorAll('.inv-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.tab = btn.dataset.tab;
        playSound(700, 80);
        this.container.querySelectorAll('.inv-tab').forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        await this.loadData();
      });
    });
  }

  async loadData() {
    const content = document.getElementById('inv-content');
    if (!content) return;

    // Stock is depleted by every till in the store, so both the levels and the
    // supplier list are read from the cloud.
    await ensureFresh(['inventory', 'suppliers']);

    // Low stock alert
    const lowStock = await inventoryService.getLowStockItems();
    const alert = document.getElementById('low-stock-alert');
    if (alert) {
      if (lowStock.length > 0) {
        alert.style.display = 'flex';
        alert.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;color:var(--color-error);margin-right:8px;">warning</span><span style="font-size:var(--text-xs);color:var(--color-error);font-weight:600;">⚠️ ${lowStock.length} item${lowStock.length > 1 ? 's' : ''} below minimum stock: ${lowStock.map(i => escapeHtml(i.name)).join(', ')}</span>`;
      } else { alert.style.display = 'none'; }
    }

    if (this.tab === 'stock') {
      const items = await inventoryService.getStockLevels();
      content.innerHTML = items.length === 0 ?
        '<div class="empty-state"><span class="material-symbols-rounded">inventory_2</span><p>No inventory items yet. Add items to track stock.</p></div>' :
        `<div class="content-grid">${items.map(item => {
          const quantity = Number(item.quantity) || 0;
          const max = Math.max(1, Number(item.maxCapacity) || 100);
          const minThreshold = Number(item.minThreshold) || 0;
          const pct = Math.max(0, Math.min(100, (quantity / max) * 100));
          const barColor = pct > 50 ? 'var(--color-success)' : pct > 20 ? 'var(--color-warning)' : 'var(--color-danger)';
          const status = pct > 50 ? '✅' : pct > 20 ? '⚠️' : '🔴';
          return `
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div>
                  <span style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">${escapeHtml(item.name)}</span>
                  <span style="font-size:0.65rem;color:var(--text-muted);margin-left:8px;">${escapeHtml(item.unit)}</span>
                </div>
                <div style="font-size:var(--text-sm);font-weight:800;color:${barColor};">${status} ${quantity} / ${max}</div>
              </div>
              <div style="height:8px;background:rgba(0,0,0,0.3);border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.5s ease;"></div>
              </div>
              <div style="font-size:0.6rem;color:var(--text-muted);margin-top:6px;">Min threshold: ${minThreshold} ${escapeHtml(item.unit)}</div>
            </div>`;
        }).join('')}</div>`;
    } else {
      const suppliers = await inventoryService.getSuppliers();
      content.innerHTML = suppliers.length === 0 ?
        '<div class="empty-state"><span class="material-symbols-rounded">local_shipping</span><p>No suppliers yet.</p></div>' :
        `<div class="content-grid">${suppliers.map(s => `
          <div class="card">
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">${escapeHtml(s.name)}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">📱 ${escapeHtml(s.phone || '—')} · ✉️ ${escapeHtml(s.email || '—')}</div>
            <span style="display:inline-block;margin-top:8px;font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color: var(--color-primary-on-surface);background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.15);">${escapeHtml(s.category || 'Other')}</span>
          </div>
        `).join('')}</div>`;
    }
  }

  unmount() { this.container = null; }
}
