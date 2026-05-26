/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Inventory Management
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../../db/database.js';
import { inventoryService } from '../../services/inventory.js';
import { showToast, playSound, vibrateDevice } from '../../utils/helpers.js';

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
      <div style="flex:1;display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-primary);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:rgba(9,9,14,0.8);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="material-symbols-rounded" style="color:var(--color-primary);font-size:24px;">inventory_2</span>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);margin:0;">Inventory & Stock</h2>
          </div>
          <button id="add-inventory-btn" style="padding:8px 14px;background:var(--gradient-primary);border:none;border-radius:8px;color:white;font-size:var(--text-xs);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Plus Jakarta Sans',sans-serif;">
            <span class="material-symbols-rounded" style="font-size:16px;">add</span> Add Item
          </button>
        </div>
        <div id="low-stock-alert" style="display:none;padding:10px 24px;background:rgba(239,68,68,0.08);border-bottom:1px solid rgba(239,68,68,0.2);"></div>
        <div style="display:flex;gap:6px;padding:12px 24px;border-bottom:1px solid var(--border-glass);">
          <button class="inv-tab active" data-tab="stock" style="padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:700;cursor:pointer;background:var(--gradient-primary);color:white;border:none;font-family:'Plus Jakarta Sans',sans-serif;">Stock Levels</button>
          <button class="inv-tab" data-tab="suppliers" style="padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:700;cursor:pointer;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid var(--border-glass);font-family:'Plus Jakarta Sans',sans-serif;">Suppliers</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px 24px;" id="inv-content"></div>
      </div>
      <div id="inv-modal" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
        <div style="background:var(--bg-secondary);border:1px solid var(--border-glass);border-radius:20px;padding:28px;width:90%;max-width:400px;">
          <h3 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-md);font-weight:800;color:var(--text-primary);margin:0 0 20px;" id="inv-modal-title">Add Item</h3>
          <div style="display:flex;flex-direction:column;gap:14px;" id="inv-modal-fields"></div>
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button id="inv-cancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-secondary);font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Cancel</button>
            <button id="inv-save" style="flex:1;padding:10px;background:var(--gradient-primary);border:none;border-radius:10px;color:white;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const inputStyle = 'padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:Inter,sans-serif;';
    document.getElementById('add-inventory-btn').addEventListener('click', () => {
      playSound(700, 80);
      const isStock = this.tab === 'stock';
      document.getElementById('inv-modal-title').textContent = isStock ? 'Add Inventory Item' : 'Add Supplier';
      document.getElementById('inv-modal-fields').innerHTML = isStock ? `
        <input type="text" id="inv-name" placeholder="Item name (e.g., Chicken)" style="${inputStyle}">
        <select id="inv-unit" style="${inputStyle}"><option value="kg">Kilograms (kg)</option><option value="liters">Liters</option><option value="pieces">Pieces</option><option value="packs">Packs</option></select>
        <input type="number" id="inv-qty" placeholder="Current quantity" style="${inputStyle}">
        <input type="number" id="inv-min" placeholder="Minimum threshold" style="${inputStyle}">
        <input type="number" id="inv-max" placeholder="Max capacity" style="${inputStyle}">
      ` : `
        <input type="text" id="sup-name" placeholder="Supplier name" style="${inputStyle}">
        <input type="tel" id="sup-phone" placeholder="Phone" style="${inputStyle}">
        <input type="email" id="sup-email" placeholder="Email" style="${inputStyle}">
        <select id="sup-category" style="${inputStyle}"><option value="Produce">Produce</option><option value="Dairy">Dairy</option><option value="Meat">Meat</option><option value="Dry Goods">Dry Goods</option><option value="Beverages">Beverages</option><option value="Other">Other</option></select>
      `;
      document.getElementById('inv-modal').style.display = 'flex';
    });
    document.getElementById('inv-cancel').addEventListener('click', () => { document.getElementById('inv-modal').style.display = 'none'; });
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
      document.getElementById('inv-modal').style.display = 'none';
      playSound(900, 100); vibrateDevice([40]);
      showToast('Saved!', 'success');
      await this.loadData();
    });
    this.container.querySelectorAll('.inv-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.tab = btn.dataset.tab;
        playSound(700, 80);
        this.container.querySelectorAll('.inv-tab').forEach(b => {
          b.style.background = 'rgba(255,255,255,0.03)'; b.style.color = 'var(--text-secondary)'; b.style.border = '1px solid var(--border-glass)'; b.classList.remove('active');
        });
        btn.style.background = 'var(--gradient-primary)'; btn.style.color = 'white'; btn.style.border = 'none'; btn.classList.add('active');
        await this.loadData();
      });
    });
  }

  async loadData() {
    const content = document.getElementById('inv-content');
    if (!content) return;

    // Low stock alert
    const lowStock = await inventoryService.getLowStockItems();
    const alert = document.getElementById('low-stock-alert');
    if (alert) {
      if (lowStock.length > 0) {
        alert.style.display = 'flex';
        alert.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;color:var(--color-error);margin-right:8px;">warning</span><span style="font-size:var(--text-xs);color:var(--color-error);font-weight:600;">⚠️ ${lowStock.length} item${lowStock.length > 1 ? 's' : ''} below minimum stock: ${lowStock.map(i => i.name).join(', ')}</span>`;
      } else { alert.style.display = 'none'; }
    }

    if (this.tab === 'stock') {
      const items = await inventoryService.getStockLevels();
      content.innerHTML = items.length === 0 ?
        '<div style="text-align:center;padding:60px;color:var(--text-muted);"><span class="material-symbols-rounded" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;">inventory_2</span>No inventory items yet. Add items to track stock.</div>' :
        `<div style="display:flex;flex-direction:column;gap:12px;">${items.map(item => {
          const max = item.maxCapacity || 100;
          const pct = Math.min(100, (item.quantity / max) * 100);
          const barColor = pct > 50 ? '#10B981' : pct > 20 ? '#F59E0B' : '#EF4444';
          const status = pct > 50 ? '✅' : pct > 20 ? '⚠️' : '🔴';
          return `
            <div style="padding:16px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div>
                  <span style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">${item.name}</span>
                  <span style="font-size:0.65rem;color:var(--text-muted);margin-left:8px;">${item.unit}</span>
                </div>
                <div style="font-size:var(--text-sm);font-weight:800;color:${barColor};">${status} ${item.quantity} / ${max}</div>
              </div>
              <div style="height:8px;background:rgba(0,0,0,0.3);border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.5s ease;"></div>
              </div>
              <div style="font-size:0.6rem;color:var(--text-muted);margin-top:6px;">Min threshold: ${item.minThreshold || 0} ${item.unit}</div>
            </div>`;
        }).join('')}</div>`;
    } else {
      const suppliers = await inventoryService.getSuppliers();
      content.innerHTML = suppliers.length === 0 ?
        '<div style="text-align:center;padding:60px;color:var(--text-muted);"><span class="material-symbols-rounded" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;">local_shipping</span>No suppliers yet.</div>' :
        `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">${suppliers.map(s => `
          <div style="padding:16px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:14px;">
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">${s.name}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">📱 ${s.phone || '—'} · ✉️ ${s.email || '—'}</div>
            <span style="display:inline-block;margin-top:8px;font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:var(--color-primary);background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.15);">${s.category || 'Other'}</span>
          </div>
        `).join('')}</div>`;
    }
  }

  unmount() { this.container = null; }
}
