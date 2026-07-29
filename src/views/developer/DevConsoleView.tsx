// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Developer Console (developer-only)
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db, getSetting, setSetting } from '../../db/database';
import { showToast, escapeHtml } from '../../utils/helpers';

const TABS = [
  { id: 'system', icon: 'monitoring', label: 'System Info' },
  { id: 'settings', icon: 'settings', label: 'Settings Editor' },
  { id: 'audit', icon: 'shield', label: 'Audit Browser' },
  { id: 'flags', icon: 'flag', label: 'Feature Flags' },
  { id: 'ai-config', icon: 'smart_toy', label: 'AI Config' },
];

const FEATURE_FLAGS = [
  { key: 'enablePublicOrdering', label: 'Public Self-Ordering (QR/Kiosk)', default: 'true' },
  { key: 'enableDelivery', label: 'Delivery Management', default: 'true' },
  { key: 'enableLoyaltyProgram', label: 'Customer Loyalty Program', default: 'true' },
  { key: 'enableCloudSync', label: 'Cloud Sync (Supabase)', default: 'true' },
  { key: 'enableAIChat', label: 'AI Chat Assistant (Groq)', default: 'true' },
  { key: 'enableAIAnalytics', label: 'AI Analytics (Lightning)', default: 'false' },
  { key: 'enableBLEPrinter', label: 'BLE Thermal Printer', default: 'true' },
  { key: 'enableWhatsAppSharing', label: 'WhatsApp Receipt Sharing', default: 'true' },
  { key: 'maintenanceMode', label: 'Maintenance Mode (blocks all staff)', default: 'false' },
];

export class DevConsoleView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.activeTab = 'system';
    this.auditPage = 0;
    this.auditPageSize = 25;
  }

  async mount(container) {
    this.container = container;
    await this.render();
    this.bindEvents();
  }

  async render() {
    if (!this.container) return;

    const tabsHTML = TABS.map(t => `
      <button class="dev-tab ${this.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
        <span class="material-symbols-rounded" style="font-size:18px;">${t.icon}</span>
        <span>${t.label}</span>
      </button>
    `).join('');

    this.container.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-primary);">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:12px;padding:16px 24px;background:var(--glass-bg);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;">
          <div style="width:40px;height:40px;border-radius:12px;background:rgba(var(--color-success-rgb),0.1);border:1px solid rgba(var(--color-success-rgb),0.25);display:flex;align-items:center;justify-content:center;">
            <span class="material-symbols-rounded" style="font-size:22px;color:var(--color-success-on-surface);filter:drop-shadow(0 0 6px rgba(var(--color-success-rgb),0.4));">terminal</span>
          </div>
          <div>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);letter-spacing:-0.02em;margin:0;">Developer Console</h2>
            <div style="font-size:0.55rem;color:var(--color-success-on-surface);font-weight:500;letter-spacing:0.08em;text-transform:uppercase;">NextGenOS Internal • Super Admin Access</div>
          </div>
          <div style="margin-left:auto;padding:4px 12px;border-radius:20px;background:rgba(var(--color-success-rgb),0.08);border:1px solid rgba(var(--color-success-rgb),0.2);font-size:0.65rem;color:var(--color-success-on-surface);font-weight:700;letter-spacing:0.06em;">DEVELOPER</div>
        </div>

        <!-- Tabs -->
        <div style="display:flex;gap:4px;padding:12px 24px;background:rgba(17,17,30,0.6);border-bottom:1px solid var(--border-glass);overflow-x:auto;">
          ${tabsHTML}
        </div>

        <!-- Tab Content -->
        <div id="dev-tab-content" tabindex="0" role="region" aria-label="Developer console output" style="flex:1;overflow-y:auto;padding:24px;"></div>
      </div>
    `;

    // Add tab styles
    if (!document.getElementById('dev-console-styles')) {
      const style = document.createElement('style');
      style.id = 'dev-console-styles';
      style.textContent = `
        .dev-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px; border: 1px solid transparent;
          background: transparent; color: var(--text-muted); cursor: pointer;
          font-size: 0.8rem; font-weight: 600; font-family: 'Inter', sans-serif;
          transition: all 0.2s; white-space: nowrap;
        }
        .dev-tab:hover { background: rgba(var(--color-success-rgb),0.06); color: var(--text-primary); }
        .dev-tab.active {
          background: rgba(var(--color-success-rgb),0.1); border-color: rgba(var(--color-success-rgb),0.25);
          color: var(--color-success-on-surface);
        }
        .dev-card {
          background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass);
          border-radius: 12px; padding: 20px; margin-bottom: 16px;
        }
        .dev-card h3 {
          font-size: 0.85rem; font-weight: 700; color: var(--text-primary);
          margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;
        }
        .dev-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
          font-size: 0.8rem;
        }
        .dev-row:last-child { border-bottom: none; }
        .dev-key { color: var(--text-muted); font-weight: 500; }
        .dev-val { color: var(--text-primary); font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
        .dev-input {
          width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-glass); border-radius: 8px;
          color: var(--text-primary); font-size: 0.8rem; font-family: 'Inter', sans-serif;
          outline: none; transition: border-color 0.2s;
        }
        .dev-input:focus { border-color: rgba(var(--color-success-rgb),0.4); }
        .dev-toggle {
          position: relative; width: 40px; height: 22px; border-radius: 11px;
          background: rgba(255,255,255,0.08); border: 1px solid var(--border-glass);
          cursor: pointer; transition: all 0.2s; flex-shrink: 0;
        }
        .dev-toggle.on { background: rgba(var(--color-success-rgb),0.3); border-color: rgba(var(--color-success-rgb),0.5); }
        .dev-toggle::after {
          content: ''; position: absolute; top: 2px; left: 2px;
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--text-muted); transition: all 0.2s;
        }
        .dev-toggle.on::after { left: 20px; background: var(--color-success); }
        .dev-btn {
          padding: 8px 18px; border-radius: 8px; border: 1px solid rgba(var(--color-success-rgb),0.25);
          background: rgba(var(--color-success-rgb),0.08); color: var(--color-success-on-surface); cursor: pointer;
          font-size: 0.8rem; font-weight: 600; font-family: 'Inter', sans-serif;
          transition: all 0.2s;
        }
        .dev-btn:hover { background: rgba(var(--color-success-rgb),0.15); }
        .dev-audit-row {
          padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.03);
          font-size: 0.75rem; display: grid; grid-template-columns: 140px 120px 1fr;
          gap: 12px; align-items: start;
        }
        .dev-audit-row:hover { background: rgba(var(--color-success-rgb),0.03); }
      `;
      document.head.appendChild(style);
    }

    await this.renderTabContent();
  }

  async renderTabContent() {
    const content = document.getElementById('dev-tab-content');
    if (!content) return;

    switch (this.activeTab) {
      case 'system': await this.renderSystemInfo(content); break;
      case 'settings': await this.renderSettingsEditor(content); break;
      case 'audit': await this.renderAuditBrowser(content); break;
      case 'flags': await this.renderFeatureFlags(content); break;
      case 'ai-config': await this.renderAIConfig(content); break;
    }
  }

  async renderSystemInfo(el) {
    const staffCount = await db.staff.count();
    const orderCount = await db.orders.count();
    const menuCount = await db.menuItems.count();
    const categoryCount = await db.menuCategories.count();
    const customerCount = await db.customers.count();
    const inventoryCount = await db.inventory.count();

    const dbEstimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const usedMB = dbEstimate ? (dbEstimate.usage / 1024 / 1024).toFixed(2) : 'N/A';
    const quotaMB = dbEstimate ? (dbEstimate.quota / 1024 / 1024).toFixed(0) : 'N/A';

    const swStatus = navigator.serviceWorker?.controller ? 'Active' : 'None';
    const onlineStatus = navigator.onLine ? '🟢 Online' : '🔴 Offline';

    const supabaseUrl = (await getSetting('supabaseUrl')) || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = (await getSetting('supabaseKey'))
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || '';
    const currencyCode = (await getSetting('currencyCode')) || 'INR';
    const currencySymbol = (await getSetting('currencySymbol')) || '₹';
    const taxType = (await getSetting('taxType')) || 'gst';
    const theme = (await getSetting('app_theme')) || localStorage.getItem('app_theme') || 'system';
    const storeId = localStorage.getItem('store_id') || 'the-taste';

    el.innerHTML = `
      <div class="dev-card">
        <h3><span class="material-symbols-rounded" style="font-size:18px;color:var(--color-success-on-surface);">info</span> Application</h3>
        <div class="dev-row"><span class="dev-key">App Version</span><span class="dev-val">2.0.0</span></div>
        <div class="dev-row"><span class="dev-key">Platform</span><span class="dev-val">NextGenOS Restaurant OS</span></div>
        <div class="dev-row"><span class="dev-key">Store ID</span><span class="dev-val">${escapeHtml(storeId)}</span></div>
        <div class="dev-row"><span class="dev-key">Network</span><span class="dev-val">${onlineStatus}</span></div>
        <div class="dev-row"><span class="dev-key">Service Worker</span><span class="dev-val">${swStatus}</span></div>
        <div class="dev-row"><span class="dev-key">Theme</span><span class="dev-val">${escapeHtml(theme)}</span></div>
      </div>

      <div class="dev-card">
        <h3><span class="material-symbols-rounded" style="font-size:18px;color:#6C5CE7;">database</span> Database</h3>
        <div class="dev-row"><span class="dev-key">IndexedDB Usage</span><span class="dev-val">${usedMB} MB / ${quotaMB} MB</span></div>
        <div class="dev-row"><span class="dev-key">Staff Records</span><span class="dev-val">${staffCount}</span></div>
        <div class="dev-row"><span class="dev-key">Orders</span><span class="dev-val">${orderCount}</span></div>
        <div class="dev-row"><span class="dev-key">Menu Items</span><span class="dev-val">${menuCount}</span></div>
        <div class="dev-row"><span class="dev-key">Categories</span><span class="dev-val">${categoryCount}</span></div>
        <div class="dev-row"><span class="dev-key">Customers</span><span class="dev-val">${customerCount}</span></div>
        <div class="dev-row"><span class="dev-key">Inventory Items</span><span class="dev-val">${inventoryCount}</span></div>
      </div>

      <div class="dev-card">
        <h3><span class="material-symbols-rounded" style="font-size:18px;color:var(--color-warning);">cloud</span> Cloud Connection</h3>
        <div class="dev-row"><span class="dev-key">Supabase URL</span><span class="dev-val">${supabaseUrl ? '✅ Configured' : '❌ Not set'}</span></div>
        <div class="dev-row"><span class="dev-key">Supabase Key</span><span class="dev-val">${supabaseKey ? '✅ Configured' : '❌ Not set'}</span></div>
        <div class="dev-row"><span class="dev-key">Currency</span><span class="dev-val">${escapeHtml(currencyCode)} (${escapeHtml(currencySymbol)})</span></div>
        <div class="dev-row"><span class="dev-key">Tax Type</span><span class="dev-val">${escapeHtml(taxType)}</span></div>
      </div>
    `;
  }

  async renderSettingsEditor(el) {
    const allSettings = await db.settings.toArray();
    const rows = allSettings.map(s => `
      <div class="dev-row" style="flex-wrap:wrap;gap:8px;">
        <span class="dev-key" style="min-width:200px;word-break:break-all;">${escapeHtml(s.key)}</span>
        <input class="dev-input setting-input" data-key="${escapeHtml(s.key)}" value="${escapeHtml(s.value || '')}" style="flex:1;min-width:200px;">
        <button class="dev-btn save-setting-btn" data-key="${escapeHtml(s.key)}" style="padding:6px 12px;font-size:0.7rem;">Save</button>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="dev-card">
        <h3>
          <span class="material-symbols-rounded" style="font-size:18px;color:var(--color-warning);">settings</span>
          All Settings (${allSettings.length})
        </h3>
        <div style="margin-bottom:12px;display:flex;gap:8px;">
          <input class="dev-input" id="new-setting-key" placeholder="New key" style="flex:1;">
          <input class="dev-input" id="new-setting-val" placeholder="Value" style="flex:1;">
          <button class="dev-btn" id="add-setting-btn">Add</button>
        </div>
        ${rows || '<div style="color:var(--text-muted);font-size:0.8rem;padding:12px;">No settings found.</div>'}
      </div>
    `;
  }

  async renderAuditBrowser(el) {
    let audits = [];
    try {
      const { getSupabaseClient } = await import('../../services/supabaseClient');
      const client = await getSupabaseClient({ persistSession: true });
      if (client) {
        const { data, error } = await client
          .from('audit_events')
          .select('*')
          .order('created_at', { ascending: false })
          .range(this.auditPage * this.auditPageSize, (this.auditPage + 1) * this.auditPageSize - 1);
        if (!error && data) audits = data;
      }
    } catch (e) {
      console.warn('[DevConsole] Audit fetch failed:', e);
    }

    const rows = audits.map(a => `
      <div class="dev-audit-row">
        <span style="color:var(--text-muted);font-family:'JetBrains Mono',monospace;font-size:0.7rem;">${new Date(a.created_at).toLocaleString()}</span>
        <span style="color:var(--color-success-on-surface);font-weight:600;">${escapeHtml(a.action)}</span>
        <span style="color:var(--text-primary);font-size:0.7rem;word-break:break-all;">${escapeHtml(JSON.stringify(a.details || {}).slice(0, 200))}</span>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="dev-card">
        <h3><span class="material-symbols-rounded" style="font-size:18px;color:var(--color-danger);">shield</span> Audit Events (Cloud)</h3>
        <div style="border:1px solid var(--border-glass);border-radius:8px;overflow:hidden;">
          <div class="dev-audit-row" style="background:rgba(var(--color-success-rgb),0.05);font-weight:700;color:var(--text-muted);font-size:0.7rem;">
            <span>Timestamp</span><span>Action</span><span>Details</span>
          </div>
          ${rows || '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.8rem;">No audit events found. Cloud connection may be required.</div>'}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">
          <button class="dev-btn" id="audit-prev" ${this.auditPage === 0 ? 'disabled style="opacity:0.4;"' : ''}>← Previous</button>
          <span style="color:var(--text-muted);font-size:0.75rem;padding:8px;">Page ${this.auditPage + 1}</span>
          <button class="dev-btn" id="audit-next" ${audits.length < this.auditPageSize ? 'disabled style="opacity:0.4;"' : ''}>Next →</button>
        </div>
      </div>
    `;
  }

  async renderFeatureFlags(el) {
    const flags = [];
    for (const flag of FEATURE_FLAGS) {
      const val = await getSetting(flag.key);
      flags.push({ ...flag, value: val || flag.default });
    }

    const rows = flags.map(f => `
      <div class="dev-row">
        <div>
          <span class="dev-key">${f.label}</span>
          <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;font-family:'JetBrains Mono',monospace;">${f.key}</div>
        </div>
        <div class="dev-toggle ${f.value === 'true' ? 'on' : ''}" data-flag="${f.key}" data-state="${f.value}"></div>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="dev-card">
        <h3><span class="material-symbols-rounded" style="font-size:18px;color:var(--nextgenos-purple);">flag</span> Feature Flags</h3>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:16px;">Toggle features on/off without deploying code changes. Changes take effect immediately.</div>
        ${rows}
      </div>
    `;
  }

  async renderAIConfig(el) {
    el.innerHTML = `
      <div class="dev-card">
        <h3><span class="material-symbols-rounded" style="font-size:18px;color:var(--color-warning);">smart_toy</span> AI Provider Configuration</h3>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:16px;">Provider credentials are server-managed Supabase secrets. They are never stored in or sent directly from this browser.</div>

        <div style="margin-bottom:20px;">
          <div style="font-weight:700;color:var(--color-success-on-surface);font-size:0.8rem;margin-bottom:8px;">⚡ Tier 2 — Groq (Chat Assistant)</div>
          <div class="dev-row"><span class="dev-key">Status</span><span>Protected Edge Function</span></div>
        </div>

        <div style="margin-bottom:20px;">
          <div style="font-weight:700;color:var(--nextgenos-purple);font-size:0.8rem;margin-bottom:8px;">🧠 Tier 3 — Lightning AI (Complex Analytics)</div>
          <div class="dev-row"><span class="dev-key">Status</span><span>Protected Edge Function</span></div>
        </div>

        <div style="display:flex;gap:8px;">
          <button class="dev-btn" id="test-groq-btn" style="border-color:var(--color-success-on-surface);">Test Groq</button>
          <button class="dev-btn" id="test-lightning-btn" style="border-color:rgba(var(--nextgenos-purple-rgb),0.25);color:var(--nextgenos-purple);">Test Lightning</button>
        </div>
      </div>

      <div class="dev-card">
        <h3><span class="material-symbols-rounded" style="font-size:18px;color:var(--text-muted);">computer</span> Tier 1 — Codebase AI (Local)</h3>
        <div style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">
          The local AI engine runs entirely offline using keyword matching against IndexedDB data.
          It handles: report generation, WhatsApp guides, order counts, and customer lookups.
          <br><br>
          <strong style="color:var(--text-primary);">Status:</strong> Always available (no API key required)
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Tab switching
    this.container.addEventListener('click', async (e) => {
      const tab = e.target.closest('.dev-tab');
      if (tab) {
        this.activeTab = tab.dataset.tab;
        this.container.querySelectorAll('.dev-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === this.activeTab));
        await this.renderTabContent();
        this.bindTabEvents();
        return;
      }

      // Feature flag toggles
      const toggle = e.target.closest('.dev-toggle');
      if (toggle) {
        const key = toggle.dataset.flag;
        const newState = toggle.dataset.state === 'true' ? 'false' : 'true';
        await setSetting(key, newState);
        toggle.dataset.state = newState;
        toggle.classList.toggle('on', newState === 'true');
        showToast(`${key} = ${newState}`, 'info');
        return;
      }

      // Settings save buttons
      const saveBtn = e.target.closest('.save-setting-btn');
      if (saveBtn) {
        const key = saveBtn.dataset.key;
        const input = this.container.querySelector(`.setting-input[data-key="${key}"]`);
        if (input) {
          await setSetting(key, input.value);
          showToast(`Setting "${key}" saved`, 'success');
        }
        return;
      }

      // Add new setting
      if (e.target.id === 'add-setting-btn') {
        const keyEl = document.getElementById('new-setting-key');
        const valEl = document.getElementById('new-setting-val');
        if (keyEl?.value?.trim()) {
          await setSetting(keyEl.value.trim(), valEl?.value || '');
          showToast(`Setting "${keyEl.value}" added`, 'success');
          await this.renderTabContent();
          this.bindTabEvents();
        }
        return;
      }

      // Audit pagination
      if (e.target.id === 'audit-prev' && this.auditPage > 0) {
        this.auditPage--;
        await this.renderTabContent();
        this.bindTabEvents();
        return;
      }
      if (e.target.id === 'audit-next') {
        this.auditPage++;
        await this.renderTabContent();
        this.bindTabEvents();
        return;
      }

      // Test Groq
      if (e.target.id === 'test-groq-btn') {
        showToast('Testing Groq connection...', 'info');
        try {
          const { aiService } = await import('../../services/ai');
          const result = await aiService.testGroqConnection();
          showToast(result ? '✅ Groq API connected!' : '❌ Groq connection failed', result ? 'success' : 'error');
        } catch (err) {
          showToast('❌ Groq test failed: ' + err.message, 'error');
        }
        return;
      }

      // Test Lightning
      if (e.target.id === 'test-lightning-btn') {
        showToast('Testing Lightning AI connection...', 'info');
        try {
          const { aiService } = await import('../../services/ai');
          const result = await aiService.testLightningConnection();
          showToast(result ? '✅ Lightning AI connected!' : '❌ Lightning connection failed', result ? 'success' : 'error');
        } catch (err) {
          showToast('❌ Lightning test failed: ' + err.message, 'error');
        }
        return;
      }
    });

    this.bindTabEvents();
  }

  bindTabEvents() {
    // Currently all events are handled by the delegated click handler above
  }

  unmount() {
    this.container = null;
  }
}
