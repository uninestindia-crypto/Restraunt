/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Customer CRM & Loyalty
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../../db/database.js';
import { formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers.js';

const TIERS = {
  bronze: { label: 'Bronze', icon: '🥉', color: '#CD7F32', min: 0 },
  silver: { label: 'Silver', icon: '🥈', color: '#C0C0C0', min: 500 },
  gold: { label: 'Gold', icon: '🥇', color: '#FFD700', min: 2000 },
  platinum: { label: 'Platinum', icon: '💎', color: '#E5E4E2', min: 5000 },
};

export class CustomersView {
  constructor(app) { this.app = app; this.container = null; this.searchQuery = ''; }

  async mount(container) {
    this.container = container;
    this.render();
    this.bindEvents();
    await this.loadCustomers();
  }

  render() {
    this.container.innerHTML = `
      <div class="main-area">
        <div class="header-bar">
          <div class="header-bar-title">
            <span class="material-symbols-rounded">loyalty</span>
            <h2>Customer CRM</h2>
          </div>
          <div style="display:flex;gap:12px;align-items:center;">
            <input type="text" id="customer-search" placeholder="Search customer..." class="input" style="width:200px;">
            <button id="add-customer-btn" class="btn btn-primary btn-sm">
              <span class="material-symbols-rounded" style="font-size:16px;">person_add</span> Add
            </button>
          </div>
        </div>
        <div id="customers-kpis" class="stats-grid"></div>
        <div style="flex:1;overflow-y:auto;padding:0 24px 24px;" id="customers-list"></div>
      </div>

      <div id="customer-modal" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:400px;">
          <div class="modal-header">
            <h3>Add Customer</h3>
            <button class="btn-icon" id="cust-close-icon"><span class="material-symbols-rounded">close</span></button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
            <div class="input-group">
              <label for="cust-name">Customer Name</label>
              <input type="text" id="cust-name" class="input" placeholder="Customer name">
            </div>
            <div class="input-group">
              <label for="cust-phone">Phone Number</label>
              <input type="tel" id="cust-phone" class="input" placeholder="Phone number">
            </div>
            <div class="input-group">
              <label for="cust-birthday">Birthday</label>
              <input type="date" id="cust-birthday" class="input" placeholder="Birthday">
            </div>
          </div>
          <div class="modal-footer">
            <button id="cust-cancel" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="cust-save" class="btn btn-primary btn-sm">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const modal = document.getElementById('customer-modal');
    document.getElementById('add-customer-btn').addEventListener('click', () => {
      playSound(700, 80);
      modal.style.display = 'flex';
    });
    const closeModal = () => {
      modal.style.display = 'none';
    };
    document.getElementById('cust-cancel').addEventListener('click', closeModal);
    document.getElementById('cust-close-icon')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.getElementById('cust-save').addEventListener('click', async () => {
      const name = document.getElementById('cust-name').value.trim();
      const phone = document.getElementById('cust-phone').value.trim();
      const birthday = document.getElementById('cust-birthday').value;
      if (!name || !phone) { showToast('Name and phone required', 'error'); return; }
      await db.customers.add({ name, phone, birthday, totalSpent: 0, visitCount: 0, loyaltyPoints: 0, tier: 'bronze', lastVisit: null, createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' });
      modal.style.display = 'none';
      document.getElementById('cust-name').value = '';
      document.getElementById('cust-phone').value = '';
      document.getElementById('cust-birthday').value = '';
      playSound(900, 100);
      vibrateDevice([40]);
      showToast('Customer added!', 'success');
      await this.loadCustomers();
    });
    document.getElementById('customer-search').addEventListener('input', async (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      await this.loadCustomers();
    });
  }

  async loadCustomers() {
    let customers = await db.customers.reverse().sortBy('createdAt');
    if (this.searchQuery) {
      customers = customers.filter(c => (c.name || '').toLowerCase().includes(this.searchQuery) || (c.phone || '').includes(this.searchQuery));
    }

    // KPIs
    const kpis = document.getElementById('customers-kpis');
    const now = new Date();
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const active = customers.filter(c => c.lastVisit && new Date(c.lastVisit) >= monthAgo).length;
    const avgPoints = customers.length > 0 ? Math.round(customers.reduce((s, c) => s + (c.loyaltyPoints || 0), 0) / customers.length) : 0;
    const topTier = customers.filter(c => c.tier === 'gold' || c.tier === 'platinum').length;

    if (kpis) {
      kpis.innerHTML = [
        { label: 'TOTAL', value: customers.length, color: 'var(--text-primary)' },
        { label: 'ACTIVE (30d)', value: active, color: 'var(--color-success)' },
        { label: 'AVG POINTS', value: avgPoints, color: '#A29BFE' },
        { label: 'GOLD+', value: topTier, color: '#FFD700' },
      ].map(k => `
        <div class="stats-card">
          <div class="stats-card-label">${k.label}</div>
          <div class="stats-card-value" style="color:${k.color};">${k.value}</div>
        </div>
      `).join('');
    }

    // List
    const list = document.getElementById('customers-list');
    if (!list) return;
    if (customers.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <span class="material-symbols-rounded">person_off</span>
        <div style="font-weight:600;">No customers yet</div>
        <p>Customers are auto-added when orders include a phone number.</p>
      </div>`;
      return;
    }

    list.innerHTML = `<div class="content-grid">${customers.map(c => {
      const tier = TIERS[c.tier] || TIERS.bronze;
      const lastVisit = c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Never';
      return `
        <div class="premium-card">
          <div class="premium-card-avatar" style="background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.15);color:var(--color-primary);">${(c.name || '?')[0].toUpperCase()}</div>
          <div class="premium-card-body">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="premium-card-title">${c.name || 'Unknown'}</span>
              <span style="font-size:0.65rem;padding:2px 6px;border-radius:6px;font-weight:700;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:${tier.color};">${tier.icon} ${tier.label}</span>
            </div>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:3px;">📱 ${c.phone || '—'} · Last: ${lastVisit}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--color-primary);">${formatCurrency(c.totalSpent || 0)}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">${c.visitCount || 0} visits · ${c.loyaltyPoints || 0} pts</div>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  unmount() { this.container = null; }
}
