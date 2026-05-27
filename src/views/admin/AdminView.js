/**
 * AdminView — PIN protection, enhanced dynamic dashboard, and sub-views container
 * Tabs: Dashboard, Menu CRUD, Order Log, Branding, Staff, Settings
 */

import { db, getSetting, getTodayStats } from '../../db/database.js';
import { formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers.js';
import { authService } from '../../services/auth.js';
import { hashPin } from '../../utils/crypto.js';
import { MenuManager } from './MenuManager.js';
import { OrderHistory } from './OrderHistory.js';
import { SettingsView } from './Settings.js';

export class AdminView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.isAuthenticated = false;
    this.pinInput = '';

    // Sub-view navigation
    this.activeTab = 'dashboard';

    this.menuManager = null;
    this.orderHistory = null;
    this.settingsView = null;
    this.brandingView = null;
    this.staffView = null;
  }

  async mount(container) {
    this.container = container;
    this.pinInput = '';

    const currentStaff = authService.getCurrentStaff();
    const isAuthorizedStaff = currentStaff && ['owner', 'manager'].includes(currentStaff.role?.toLowerCase());

    if (this.isAuthenticated || isAuthorizedStaff) {
      this.isAuthenticated = true;
      await this.renderAdminConsole();
    } else {
      this.renderPinScreen();
    }
  }

  renderPinScreen() {
    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh; max-width: 380px; margin: 0 auto; padding: 20px;">
        <div class="card" style="width: 100%; text-align: center; padding: 40px 32px;">
          <div style="
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: rgba(255, 94, 54, 0.08);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            border: 1px solid rgba(255, 94, 54, 0.2);
            box-shadow: 0 0 20px rgba(255, 94, 54, 0.2);
          ">
            <span class="material-symbols-rounded" style="font-size: 28px; color: var(--color-primary); filter: drop-shadow(0 0 6px var(--color-primary));">lock</span>
          </div>

          <h2 style="font-family: var(--font-display); font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.02em;">Terminal Access</h2>
          <p style="color: var(--text-secondary); font-size: var(--text-xs); margin-bottom: 28px; font-weight: 500;">Enter your 4-digit master PIN code to unlock console</p>

          <!-- PIN Dots -->
          <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 36px;" id="pin-dots">
            <span class="pin-dot" style="width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.15); background: transparent; transition: all var(--transition-fast);"></span>
            <span class="pin-dot" style="width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.15); background: transparent; transition: all var(--transition-fast);"></span>
            <span class="pin-dot" style="width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.15); background: transparent; transition: all var(--transition-fast);"></span>
            <span class="pin-dot" style="width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.15); background: transparent; transition: all var(--transition-fast);"></span>
          </div>

          <!-- Numpad -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;" id="numpad">
            <button class="btn btn-secondary num-key" data-val="1" style="height: 52px;">1</button>
            <button class="btn btn-secondary num-key" data-val="2" style="height: 52px;">2</button>
            <button class="btn btn-secondary num-key" data-val="3" style="height: 52px;">3</button>
            <button class="btn btn-secondary num-key" data-val="4" style="height: 52px;">4</button>
            <button class="btn btn-secondary num-key" data-val="5" style="height: 52px;">5</button>
            <button class="btn btn-secondary num-key" data-val="6" style="height: 52px;">6</button>
            <button class="btn btn-secondary num-key" data-val="7" style="height: 52px;">7</button>
            <button class="btn btn-secondary num-key" data-val="8" style="height: 52px;">8</button>
            <button class="btn btn-secondary num-key" data-val="9" style="height: 52px;">9</button>
            <button class="btn btn-danger num-key" data-val="clear" style="height: 52px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239,68,68,0.25); color: #FF4D4D;">C</button>
            <button class="btn btn-secondary num-key" data-val="0" style="height: 52px;">0</button>
            <button class="btn btn-secondary num-key" data-val="backspace" style="height: 52px; display: flex; align-items: center; justify-content: center;"><span class="material-symbols-rounded" style="font-size: 18px; color: var(--text-secondary);">backspace</span></button>
          </div>
        </div>
      </div>
    `;

    this.bindPinEvents();
  }

  bindPinEvents() {
    const keys = this.container.querySelectorAll('.num-key');
    keys.forEach(key => {
      key.addEventListener('click', async () => {
        const val = key.dataset.val;
        playSound(700, 80);
        vibrateDevice([20]);

        if (val === 'clear') {
          this.pinInput = '';
        } else if (val === 'backspace') {
          this.pinInput = this.pinInput.slice(0, -1);
        } else {
          if (this.pinInput.length < 4) {
            this.pinInput += val;
          }
        }

        this.updatePinDots();

        if (this.pinInput.length === 4) {
          setTimeout(() => this.verifyPin(), 250);
        }
      });
    });
  }

  updatePinDots() {
    const dots = this.container.querySelectorAll('.pin-dot');
    dots.forEach((dot, index) => {
      if (index < this.pinInput.length) {
        dot.style.background = 'var(--color-primary)';
        dot.style.borderColor = 'var(--color-primary)';
        dot.style.transform = 'scale(1.2)';
        dot.style.boxShadow = '0 0 10px rgba(255, 94, 54, 0.6)';
      } else {
        dot.style.background = 'transparent';
        dot.style.borderColor = 'rgba(255,255,255,0.15)';
        dot.style.transform = 'scale(1)';
        dot.style.boxShadow = 'none';
      }
    });
  }

  async verifyPin() {
    try {
      const configuredHash = await getSetting('adminPinHash');
      const legacyPin = await getSetting('adminPin');
      const inputHash = await hashPin(this.pinInput);
      const staff = await authService.getStaffByPin(this.pinInput);
      
      const allowManagerAdminVal = await getSetting('allowManagerAdmin');
      const allowManager = allowManagerAdminVal === 'true' || allowManagerAdminVal === true || allowManagerAdminVal === undefined || allowManagerAdminVal === '';
      const allowedRoles = ['owner'];
      if (allowManager) allowedRoles.push('manager');

      const canStaffUnlock = staff && allowedRoles.includes(staff.role?.toLowerCase());
      const legacyAllowed = legacyPin && legacyPin !== '1234' && this.pinInput === legacyPin;

      if ((configuredHash && inputHash === configuredHash) || legacyAllowed || canStaffUnlock) {
        this.isAuthenticated = true;
        playSound(800, 100);
        setTimeout(() => playSound(1200, 120), 100);
        vibrateDevice([40, 20, 40]);
        showToast('Authorized!', 'success');
        await this.renderAdminConsole();
      } else {
        playSound(300, 200, 'square');
        vibrateDevice([150]);
        showToast('Invalid PIN code', 'error');
        this.pinInput = '';
        this.updatePinDots();
      }
    } catch (err) {
      console.error('Failed to verify PIN:', err);
    }
  }

  async renderAdminConsole() {
    const currentTheme = localStorage.getItem('app_theme') || 'dark';

    this.container.innerHTML = `
      <div class="main-area">
        <!-- Admin Views Header Tabs -->
        <div class="header-bar" style="padding: 10px 24px;">
          <div class="tab-container scrollbar-none" style="padding: 0; border-bottom: none; overflow-x: auto; flex: 1; margin-right: 12px;">
            <button class="tab admin-tab ${this.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">
              <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">dashboard</span>
              Dashboard
            </button>
            <button class="tab admin-tab ${this.activeTab === 'menu' ? 'active' : ''}" data-tab="menu">
              <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">edit_document</span>
              Menu CRUD
            </button>
            <button class="tab admin-tab ${this.activeTab === 'orders' ? 'active' : ''}" data-tab="orders">
              <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">history</span>
              Order Log
            </button>
            <button class="tab admin-tab ${this.activeTab === 'branding' ? 'active' : ''}" data-tab="branding">
              <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">palette</span>
              Branding
            </button>
            <button class="tab admin-tab ${this.activeTab === 'staff' ? 'active' : ''}" data-tab="staff">
              <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">groups</span>
              Staff
            </button>
            <button class="tab admin-tab ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
              <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">settings</span>
              Settings
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- Theme Segmented Control -->
            <div class="admin-theme-switcher" style="display: flex; gap: 2px; background: rgba(0,0,0,0.15); border-radius: var(--radius-md); padding: 3px; border: 1px solid var(--border-glass);">
              <button class="admin-theme-btn ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark" title="Dark Theme" style="padding: 4px 8px; border-radius: 8px; border: none; cursor: pointer; background: ${currentTheme === 'dark' ? 'var(--color-primary)' : 'transparent'}; color: ${currentTheme === 'dark' ? '#fff' : 'var(--text-muted)'}; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center;">
                <span class="material-symbols-rounded" style="font-size: 14px;">dark_mode</span>
              </button>
              <button class="admin-theme-btn ${currentTheme === 'light' ? 'active' : ''}" data-theme="light" title="Light Theme" style="padding: 4px 8px; border-radius: 8px; border: none; cursor: pointer; background: ${currentTheme === 'light' ? 'var(--color-primary)' : 'transparent'}; color: ${currentTheme === 'light' ? '#fff' : 'var(--text-muted)'}; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center;">
                <span class="material-symbols-rounded" style="font-size: 14px;">light_mode</span>
              </button>
              <button class="admin-theme-btn ${currentTheme === 'system' ? 'active' : ''}" data-theme="system" title="System Theme" style="padding: 4px 8px; border-radius: 8px; border: none; cursor: pointer; background: ${currentTheme === 'system' ? 'var(--color-primary)' : 'transparent'}; color: ${currentTheme === 'system' ? '#fff' : 'var(--text-muted)'}; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center;">
                <span class="material-symbols-rounded" style="font-size: 14px;">computer</span>
              </button>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-admin-logout" style="background: rgba(239, 68, 68, 0.04); border-color: rgba(239, 68, 68, 0.15); color: #FF4D4D;">
              <span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">lock</span>
              Lock Terminal
            </button>
          </div>
        </div>

        <!-- Admin Viewport Area -->
        <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column;" id="admin-viewport">
          <!-- View sub-contents render here -->
        </div>
      </div>
    `;

    this.bindConsoleEvents();
    await this.mountActiveSubView();
  }

  bindConsoleEvents() {
    // Tab switching
    this.container.querySelectorAll('.admin-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tab = btn.dataset.tab;
        if (tab === this.activeTab) return;

        playSound(700, 80);
        this.activeTab = tab;

        this.container.querySelectorAll('.admin-tab').forEach(b => {
          b.classList.toggle('active', b.dataset.tab === tab);
        });

        await this.mountActiveSubView();
      });
    });

    // Theme switcher
    this.container.querySelectorAll('.admin-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        playSound(700, 60);

        // Update visual
        this.container.querySelectorAll('.admin-theme-btn').forEach(b => {
          const isActive = b.dataset.theme === theme;
          b.style.background = isActive ? 'var(--color-primary)' : 'transparent';
          b.style.color = isActive ? '#fff' : 'var(--text-muted)';
          b.classList.toggle('active', isActive);
        });

        // Apply theme
        localStorage.setItem('app_theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));

        showToast(`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`, 'info');
      });
    });

    // Logout/Lock
    document.getElementById('btn-admin-logout').addEventListener('click', () => {
      playSound(600, 100);
      authService.logout();
      if (this.app.inactivityTimeout) {
        clearTimeout(this.app.inactivityTimeout);
        this.app.inactivityTimeout = null;
      }
      this.isAuthenticated = false;
      this.activeTab = 'dashboard';
      if (router.currentView && typeof router.currentView.unmount === 'function') {
        router.currentView.unmount();
      }
      this.app.initialized = false;
      this.app.showLogin();
      showToast('Terminal locked', 'info');
    });
  }

  async mountActiveSubView() {
    const viewport = document.getElementById('admin-viewport');
    if (!viewport) return;

    // Unmount current subview
    if (this.menuManager && this.menuManager.unmount) this.menuManager.unmount();
    if (this.orderHistory && this.orderHistory.unmount) this.orderHistory.unmount();
    if (this.settingsView && this.settingsView.unmount) this.settingsView.unmount();
    if (this.brandingView && this.brandingView.unmount) this.brandingView.unmount();
    if (this.staffView && this.staffView.unmount) this.staffView.unmount();

    viewport.innerHTML = '';

    if (this.activeTab === 'dashboard') {
      await this.renderDashboard(viewport);
    } else if (this.activeTab === 'menu') {
      this.menuManager = new MenuManager(this.app);
      await this.menuManager.mount(viewport);
    } else if (this.activeTab === 'orders') {
      this.orderHistory = new OrderHistory(this.app);
      await this.orderHistory.mount(viewport);
    } else if (this.activeTab === 'branding') {
      const { BrandingView } = await import('./BrandingView.js');
      this.brandingView = new BrandingView(this.app);
      await this.brandingView.mount(viewport);
    } else if (this.activeTab === 'staff') {
      await this.renderStaffManager(viewport);
    } else if (this.activeTab === 'settings') {
      this.settingsView = new SettingsView(this.app);
      await this.settingsView.mount(viewport);
    }
  }

  async renderDashboard(viewport) {
    viewport.innerHTML = `
      <div style="padding: 28px 24px; display: flex; flex-direction: column; gap: 24px; max-width: 1100px; margin: 0 auto; width: 100%;">
        <div style="font-family: var(--font-display); font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em;">
          Console Overview
        </div>

        <!-- Dashboard Stats Grid -->
        <div class="stats-grid" style="padding: 0;">
          <div class="stats-card">
            <div class="stats-card-label">TODAY'S REVENUE</div>
            <div class="stats-card-value" style="color: var(--color-success); filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.25));" id="dash-revenue">₹0.00</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-label">COMPLETED ORDERS</div>
            <div class="stats-card-value" style="color: var(--color-primary); filter: drop-shadow(0 0 10px rgba(255, 94, 54, 0.25));" id="dash-orders">0</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-label">AVERAGE BILL VALUE</div>
            <div class="stats-card-value" style="color: var(--color-info); filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.25));" id="dash-avg">₹0.00</div>
          </div>
        </div>

        <!-- Week Revenue Trend -->
        <div class="card">
          <div style="font-family: var(--font-display); font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: 16px; letter-spacing: -0.01em;">
            <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 6px; color: var(--color-info);">trending_up</span>
            7-Day Revenue Trend
          </div>
          <div style="display: flex; align-items: flex-end; gap: 8px; height: 120px; padding: 0 4px;" id="dash-week-chart">
            <!-- Bars rendered dynamically -->
          </div>
        </div>

        <!-- Top Selling Items & Active Staff Row -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Top Items -->
          <div class="card">
            <div style="font-family: var(--font-display); font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: 16px; letter-spacing: -0.01em;">
              <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 6px; color: var(--color-warning);">local_fire_department</span>
              Top Selling Items (Today)
            </div>
            <div id="dash-top-items" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 500;">Loading...</div>
            </div>
          </div>

          <!-- System Health -->
          <div class="card">
            <div style="font-family: var(--font-display); font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: 16px; letter-spacing: -0.01em;">
              <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 6px; color: var(--color-success);">monitor_heart</span>
              System Health
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;" id="dash-system-health">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </div>

        <!-- Payment split card -->
        <div class="card">
          <div style="font-family: var(--font-display); font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: 20px; letter-spacing: -0.01em;">Revenue Split by Method</div>
          <div style="display: flex; flex-direction: column; gap: 16px;" id="dash-payments-list">
            <!-- Loaded dynamically -->
          </div>
        </div>
      </div>
    `;

    await this._loadDashboardData();
  }

  async _loadDashboardData() {
    try {
      // Today's stats
      const stats = await getTodayStats();
      document.getElementById('dash-revenue').textContent = formatCurrency(stats.totalRevenue);
      document.getElementById('dash-orders').textContent = stats.totalOrders;
      document.getElementById('dash-avg').textContent = formatCurrency(stats.avgOrderValue);

      // Payment breakdown
      const listContainer = document.getElementById('dash-payments-list');
      if (listContainer) {
        listContainer.innerHTML = '';
        const methods = Object.keys(stats.paymentBreakdown);
        if (methods.length === 0) {
          listContainer.innerHTML = `<div style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 500;">No sales recorded yet today.</div>`;
        } else {
          methods.forEach(method => {
            const data = stats.paymentBreakdown[method];
            const methodLabel = method === 'upi' ? '📱 UPI (Digital Pay)' : method === 'cash' ? '💵 Cash Pay' : method.toUpperCase();
            const percent = stats.totalRevenue > 0 ? (data.total / stats.totalRevenue) * 100 : 0;

            listContainer.innerHTML += `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: var(--text-sm); font-weight: 600;">
                  <span style="color: var(--text-secondary);">${methodLabel} <span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">(${data.count} orders)</span></span>
                  <span style="font-weight: 700; color: var(--text-primary);">${formatCurrency(data.total)}</span>
                </div>
                <div style="height: 6px; background: rgba(0, 0, 0, 0.25); border-radius: var(--radius-full); overflow: hidden; border: 1px solid var(--border-glass);">
                  <div style="height: 100%; background: linear-gradient(90deg, #FF5E36 0%, #FF8960 100%); width: ${percent}%; border-radius: var(--radius-full); box-shadow: 0 0 10px rgba(255, 94, 54, 0.4); transition: width 0.8s ease;"></div>
                </div>
              </div>
            `;
          });
        }
      }

      // 7-Day Revenue Trend
      await this._loadWeeklyTrend();

      // Top Selling Items
      await this._loadTopItems();

      // System Health
      await this._loadSystemHealth();

    } catch (e) {
      console.error('Failed to load dashboard metrics:', e);
    }
  }

  async _loadWeeklyTrend() {
    const chartContainer = document.getElementById('dash-week-chart');
    if (!chartContainer) return;

    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

      try {
        const orders = await db.orders.where('createdAt').between(dayStart, dayEnd).toArray();
        const revenue = orders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + (o.total || 0), 0);
        days.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), revenue, date: d });
      } catch {
        days.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), revenue: 0, date: d });
      }
    }

    const maxRevenue = Math.max(...days.map(d => d.revenue), 1);

    chartContainer.innerHTML = days.map((d, i) => {
      const height = Math.max((d.revenue / maxRevenue) * 100, 4);
      const isToday = i === 6;
      return `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;">
          <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 600;">${formatCurrency(d.revenue)}</div>
          <div style="
            width: 100%; height: ${height}px;
            background: ${isToday ? 'linear-gradient(180deg, #FF5E36, #FF8960)' : 'rgba(255, 255, 255, 0.06)'};
            border-radius: var(--radius-sm);
            border: 1px solid ${isToday ? 'rgba(255, 94, 54, 0.3)' : 'var(--border-glass)'};
            ${isToday ? 'box-shadow: 0 0 12px rgba(255, 94, 54, 0.3);' : ''}
            transition: height 0.6s ease;
          "></div>
          <div style="font-size: 0.6rem; color: ${isToday ? 'var(--color-primary)' : 'var(--text-muted)'}; font-weight: ${isToday ? '700' : '500'};">${d.label}</div>
        </div>
      `;
    }).join('');
  }

  async _loadTopItems() {
    const container = document.getElementById('dash-top-items');
    if (!container) return;

    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const todayOrders = await db.orders.where('createdAt').between(todayStart, todayEnd).toArray();

      const itemCounts = {};
      for (const order of todayOrders) {
        let items = order.items;
        if (typeof items === 'string') {
          try { items = JSON.parse(items); } catch { items = []; }
        }
        if (!Array.isArray(items)) items = [];
        for (const item of items) {
          const name = item.name || 'Unknown';
          itemCounts[name] = (itemCounts[name] || 0) + (item.qty || 1);
        }
      }

      const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

      if (sorted.length === 0) {
        container.innerHTML = `<div style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 500;">No orders yet today.</div>`;
        return;
      }

      const maxQty = sorted[0][1];
      container.innerHTML = sorted.map(([name, qty], i) => {
        const width = (qty / maxQty) * 100;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        return `
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 0.8rem; width: 24px; text-align: center; flex-shrink: 0;">${medal}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="font-size: var(--text-xs); color: var(--text-primary); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span>
                <span style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 700; flex-shrink: 0; margin-left: 8px;">×${qty}</span>
              </div>
              <div style="height: 4px; background: rgba(0,0,0,0.2); border-radius: var(--radius-full); overflow: hidden;">
                <div style="height: 100%; width: ${width}%; background: linear-gradient(90deg, var(--color-warning), #FBBF24); border-radius: var(--radius-full); transition: width 0.6s ease;"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      container.innerHTML = `<div style="font-size: var(--text-xs); color: var(--text-muted);">Failed to load.</div>`;
    }
  }

  async _loadSystemHealth() {
    const container = document.getElementById('dash-system-health');
    if (!container) return;

    const staffCount = await db.staff.filter(s => s.isActive === true || s.isActive === 1).count();
    const totalMenuItems = await db.menuItems.count();
    const totalOrders = await db.orders.count();
    const isOnline = navigator.onLine;

    const currentTheme = localStorage.getItem('app_theme') || 'dark';
    const themeLabel = { dark: '🌙 Dark', light: '☀️ Light', system: '💻 System' }[currentTheme] || 'Dark';

    const items = [
      { icon: 'cloud', label: 'Network Status', value: isOnline ? 'Online' : 'Offline', color: isOnline ? 'var(--color-success)' : 'var(--color-danger)' },
      { icon: 'groups', label: 'Active Staff', value: `${staffCount} members`, color: 'var(--color-info)' },
      { icon: 'restaurant_menu', label: 'Menu Items', value: `${totalMenuItems} items`, color: 'var(--color-warning)' },
      { icon: 'receipt_long', label: 'Total Orders (All Time)', value: `${totalOrders}`, color: 'var(--color-primary)' },
      { icon: 'palette', label: 'Active Theme', value: themeLabel, color: 'var(--nextgenos-purple)' },
    ];

    container.innerHTML = items.map(item => `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="material-symbols-rounded" style="font-size: 18px; color: ${item.color}; flex-shrink: 0;">${item.icon}</span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 500;">${item.label}</div>
        </div>
        <div style="font-size: var(--text-xs); color: var(--text-primary); font-weight: 700;">${item.value}</div>
      </div>
    `).join('');
  }

  async renderStaffManager(viewport) {
    const staffList = await db.staff.toArray();
    const owners = staffList.filter(s => s.role === 'owner' && (s.isActive === true || s.isActive === 1));
    const ROLES = {
      owner: { label: 'Owner', color: '#FF6B35', icon: 'shield_person' },
      manager: { label: 'Manager', color: '#6C5CE7', icon: 'manage_accounts' },
      cashier: { label: 'Cashier', color: '#10B981', icon: 'point_of_sale' },
      kitchen: { label: 'Kitchen', color: '#F59E0B', icon: 'restaurant' },
      waiter: { label: 'Waiter', color: '#3B82F6', icon: 'room_service' },
      delivery: { label: 'Delivery', color: '#06B6D4', icon: 'delivery_dining' },
    };

    // Access matrix
    const routes = [
      { name: 'POS', roles: ['owner', 'manager', 'cashier', 'waiter'] },
      { name: 'Kitchen', roles: ['owner', 'manager', 'cashier', 'kitchen'] },
      { name: 'Tables', roles: ['owner', 'manager', 'cashier', 'waiter', 'kitchen'] },
      { name: 'Channels', roles: ['owner', 'manager', 'cashier'] },
      { name: 'Analytics', roles: ['owner', 'manager'] },
      { name: 'Inventory', roles: ['owner', 'manager'] },
      { name: 'Customers', roles: ['owner', 'manager', 'cashier', 'waiter'] },
      { name: 'Staff', roles: ['owner', 'manager'] },
      { name: 'Admin', roles: ['owner', 'manager'] },
    ];
    const allRoles = Object.keys(ROLES);

    viewport.innerHTML = `
      <div style="padding: 28px 24px; display: flex; flex-direction: column; gap: 24px; max-width: 1100px; margin: 0 auto; width: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-family: var(--font-display); font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em;">
            <span class="material-symbols-rounded" style="font-size: 22px; vertical-align: middle; margin-right: 8px; color: var(--color-primary);">groups</span>
            Staff & Role Management
          </div>
        </div>

        <!-- Staff Cards with Inline Promotion -->
        <div class="content-grid" id="admin-staff-grid">
          ${staffList.map(s => {
            const role = ROLES[s.role] || ROLES.cashier;
            const isDeletable = !(s.role === 'owner' && owners.length <= 1);
            const lastLogin = ''; // Populated from activity log
            return `
              <div class="premium-card" style="position: relative;">
                <div class="premium-card-avatar" style="background: rgba(${s.role === 'owner' ? '255,107,53' : '108,92,231'}, 0.1); color: ${role.color};">
                  ${(s.name || '?')[0].toUpperCase()}
                </div>
                <div class="premium-card-body" style="flex: 1; min-width: 0;">
                  <span class="premium-card-title">${s.name || 'Unknown'}</span>
                  <div style="display: flex; gap: 6px; align-items: center; margin-top: 4px; flex-wrap: wrap;">
                    <span style="font-size: 0.55rem; color: ${s.isActive ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 700;">${s.isActive ? '● Active' : '● Inactive'}</span>
                  </div>
                  <!-- Inline Role Selector -->
                  <div style="margin-top: 8px; display: flex; gap: 6px; align-items: center;">
                    <select class="input staff-role-select" data-staff-id="${s.id}" style="
                      font-size: 0.65rem; padding: 4px 8px; height: 28px; min-height: 28px;
                      border-radius: 6px; font-weight: 700; max-width: 130px;
                      color: ${role.color}; border-color: ${role.color}33;
                    ">
                      ${Object.entries(ROLES).map(([key, r]) => `
                        <option value="${key}" ${s.role === key ? 'selected' : ''}>${r.label}</option>
                      `).join('')}
                    </select>
                    <button class="btn-icon staff-toggle-active-btn" data-staff-id="${s.id}" data-active="${s.isActive ? 1 : 0}" title="${s.isActive ? 'Deactivate' : 'Activate'}" style="color: ${s.isActive ? 'var(--color-warning)' : 'var(--color-success)'};">
                      <span class="material-symbols-rounded" style="font-size: 16px;">${s.isActive ? 'person_off' : 'person'}</span>
                    </button>
                    ${isDeletable ? `
                      <button class="btn-icon staff-delete-btn" data-staff-id="${s.id}" style="color: var(--color-danger);" title="Remove">
                        <span class="material-symbols-rounded" style="font-size: 16px;">delete</span>
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Access Matrix -->
        <div class="card" style="overflow-x: auto;">
          <div style="font-family: var(--font-display); font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: 16px; letter-spacing: -0.01em;">
            <span class="material-symbols-rounded" style="font-size: 18px; vertical-align: middle; margin-right: 6px; color: var(--color-info);">security</span>
            Role Access Matrix
          </div>
          <table style="width: 100%; font-size: 0.65rem; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 8px; color: var(--text-secondary); font-weight: 700; border-bottom: 1px solid var(--border-glass);">Module</th>
                ${allRoles.map(r => `<th style="text-align: center; padding: 8px; color: ${ROLES[r].color}; font-weight: 700; border-bottom: 1px solid var(--border-glass);">${ROLES[r].label}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${routes.map(route => `
                <tr>
                  <td style="padding: 6px 8px; color: var(--text-primary); font-weight: 600; border-bottom: 1px solid var(--border-glass);">${route.name}</td>
                  ${allRoles.map(r => `
                    <td style="text-align: center; padding: 6px 8px; border-bottom: 1px solid var(--border-glass);">
                      ${route.roles.includes(r) ? '<span style="color: var(--color-success); font-size: 14px;">✓</span>' : '<span style="color: var(--text-muted); opacity: 0.3;">—</span>'}
                    </td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Bind staff events
    viewport.querySelectorAll('.staff-role-select').forEach(select => {
      select.addEventListener('change', async () => {
        const staffId = parseInt(select.dataset.staffId);
        const newRole = select.value;
        const staffMember = await db.staff.get(staffId);
        if (!staffMember) return;

        const prevRole = staffMember.role;
        if (prevRole === newRole) return;

        // Safety: prevent demoting the last owner
        if (prevRole === 'owner' && newRole !== 'owner') {
          const ownerCount = await db.staff.where('role').equals('owner').and(s => s.isActive === true || s.isActive === 1).count();
          if (ownerCount <= 1) {
            showToast('Cannot demote the last active owner', 'error');
            select.value = prevRole;
            return;
          }
        }

        await db.staff.update(staffId, { role: newRole, isSynced: 0 });

        // If promoted to owner, update admin PIN hash
        if (newRole === 'owner' && staffMember.pinHash) {
          await db.settings.put({ key: 'adminPinHash', value: staffMember.pinHash });
        }

        playSound(900, 100);
        vibrateDevice([40]);
        showToast(`${staffMember.name} → ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}`, 'success');

        // Refresh
        await this.renderStaffManager(viewport);
      });
    });

    // Toggle active
    viewport.querySelectorAll('.staff-toggle-active-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const staffId = parseInt(btn.dataset.staffId);
        const currentlyActive = btn.dataset.active === '1';
        await db.staff.update(staffId, { isActive: currentlyActive ? 0 : 1, isSynced: 0 });
        playSound(700, 80);
        showToast(currentlyActive ? 'Staff deactivated' : 'Staff activated', 'info');
        await this.renderStaffManager(viewport);
      });
    });

    // Delete
    viewport.querySelectorAll('.staff-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const staffId = parseInt(btn.dataset.staffId);
        const staffMember = await db.staff.get(staffId);
        if (!staffMember) return;
        if (confirm(`Remove ${staffMember.name}?`)) {
          await db.staff.delete(staffId);
          playSound(900, 100);
          showToast('Staff member removed', 'success');
          await this.renderStaffManager(viewport);
        }
      });
    });
  }

  unmount() {
    if (this.menuManager && this.menuManager.unmount) this.menuManager.unmount();
    if (this.orderHistory && this.orderHistory.unmount) this.orderHistory.unmount();
    if (this.settingsView && this.settingsView.unmount) this.settingsView.unmount();
    if (this.brandingView && this.brandingView.unmount) this.brandingView.unmount();
    if (this.staffView && this.staffView.unmount) this.staffView.unmount();
    this.container = null;
  }
}
