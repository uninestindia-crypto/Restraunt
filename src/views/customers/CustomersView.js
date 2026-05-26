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
      <div style="flex:1;display:flex;flex-direction:column;height:calc(100vh - 60px);height:calc(100dvh - 60px);overflow:hidden;background:var(--bg-primary);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:rgba(9,9,14,0.8);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="material-symbols-rounded" style="color:var(--color-primary);font-size:24px;filter:drop-shadow(0 0 8px rgba(255,94,54,0.45));">loyalty</span>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);letter-spacing:-0.02em;margin:0;">Customer CRM</h2>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="customer-search" placeholder="Search by name or phone..." style="padding:8px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:8px;color:var(--text-primary);font-size:var(--text-xs);outline:none;width:200px;font-family:'Inter',sans-serif;">
            <button id="add-customer-btn" style="padding:8px 14px;background:var(--gradient-primary);border:none;border-radius:8px;color:white;font-size:var(--text-xs);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Plus Jakarta Sans',sans-serif;">
              <span class="material-symbols-rounded" style="font-size:16px;">person_add</span> Add
            </button>
          </div>
        </div>
        <div id="customers-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:16px 24px;"></div>
        <div style="flex:1;overflow-y:auto;padding:0 24px 24px;" id="customers-list"></div>
      </div>
      <div id="customer-modal" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
        <div style="background:var(--bg-secondary);border:1px solid var(--border-glass);border-radius:20px;padding:28px;width:90%;max-width:400px;box-shadow:var(--shadow-modal);">
          <h3 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-md);font-weight:800;color:var(--text-primary);margin:0 0 20px;">Add Customer</h3>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <input type="text" id="cust-name" placeholder="Customer name" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:'Inter',sans-serif;">
            <input type="tel" id="cust-phone" placeholder="Phone number" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:'Inter',sans-serif;">
            <input type="date" id="cust-birthday" placeholder="Birthday" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:'Inter',sans-serif;">
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button id="cust-cancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-secondary);font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Cancel</button>
            <button id="cust-save" style="flex:1;padding:10px;background:var(--gradient-primary);border:none;border-radius:10px;color:white;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    document.getElementById('add-customer-btn').addEventListener('click', () => {
      playSound(700, 80);
      document.getElementById('customer-modal').style.display = 'flex';
    });
    document.getElementById('cust-cancel').addEventListener('click', () => {
      document.getElementById('customer-modal').style.display = 'none';
    });
    document.getElementById('cust-save').addEventListener('click', async () => {
      const name = document.getElementById('cust-name').value.trim();
      const phone = document.getElementById('cust-phone').value.trim();
      const birthday = document.getElementById('cust-birthday').value;
      if (!name || !phone) { showToast('Name and phone required', 'error'); return; }
      await db.customers.add({ name, phone, birthday, totalSpent: 0, visitCount: 0, loyaltyPoints: 0, tier: 'bronze', lastVisit: null, createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' });
      document.getElementById('customer-modal').style.display = 'none';
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
        { label: 'TOTAL', value: customers.length, color: 'var(--color-primary)' },
        { label: 'ACTIVE (30d)', value: active, color: 'var(--color-success)' },
        { label: 'AVG POINTS', value: avgPoints, color: '#A29BFE' },
        { label: 'GOLD+', value: topTier, color: '#FFD700' },
      ].map(k => `
        <div style="padding:14px 16px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:12px;">
          <div style="font-size:0.6rem;color:var(--text-muted);font-weight:700;letter-spacing:0.06em;">${k.label}</div>
          <div style="font-size:1.4rem;font-weight:800;color:${k.color};font-family:'Plus Jakarta Sans',sans-serif;margin-top:4px;">${k.value}</div>
        </div>
      `).join('');
    }

    // List
    const list = document.getElementById('customers-list');
    if (!list) return;
    if (customers.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
        <span class="material-symbols-rounded" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;">person_off</span>
        <div style="font-weight:600;">No customers yet</div>
        <div style="font-size:0.75rem;margin-top:4px;">Customers are auto-added when orders include a phone number.</div>
      </div>`;
      return;
    }

    list.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${customers.map(c => {
      const tier = TIERS[c.tier] || TIERS.bronze;
      const lastVisit = c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Never';
      return `
        <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:14px;transition:background 0.2s;cursor:default;">
          <div style="width:42px;height:42px;border-radius:12px;background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.15);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--color-primary);font-family:'Plus Jakarta Sans',sans-serif;font-size:1rem;flex-shrink:0;">${(c.name || '?')[0].toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name || 'Unknown'}</span>
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
