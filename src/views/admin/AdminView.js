/**
 * AdminView — PIN protection, reports dashboard, and sub-views container
 */

import { getSetting, getTodayStats } from '../../db/database.js';
import { formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers.js';
import { MenuManager } from './MenuManager.js';
import { OrderHistory } from './OrderHistory.js';
import { SettingsView } from './Settings.js';

export class AdminView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.isAuthenticated = false;
    this.pinInput = '';
    
    // Sub-view navigation: 'dashboard' | 'menu' | 'orders' | 'settings'
    this.activeTab = 'dashboard';
    
    this.menuManager = null;
    this.orderHistory = null;
    this.settingsView = null;
  }

  async mount(container) {
    this.container = container;
    this.pinInput = '';
    
    if (this.isAuthenticated) {
      await this.renderAdminConsole();
    } else {
      this.renderPinScreen();
    }
  }

  renderPinScreen() {
    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh; max-width: 380px; margin: 0 auto; padding: 20px;">
        <div style="
          background: rgba(17, 17, 30, 0.7); 
          border: 1px solid var(--border-glass); 
          padding: 40px 32px; 
          border-radius: var(--radius-xl); 
          width: 100%; 
          text-align: center; 
          backdrop-filter: blur(24px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        " class="card-glass">
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
          
          <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.02em;">Terminal Access</h2>
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
            <button class="btn btn-secondary num-key" data-val="1" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">1</button>
            <button class="btn btn-secondary num-key" data-val="2" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">2</button>
            <button class="btn btn-secondary num-key" data-val="3" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">3</button>
            <button class="btn btn-secondary num-key" data-val="4" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">4</button>
            <button class="btn btn-secondary num-key" data-val="5" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">5</button>
            <button class="btn btn-secondary num-key" data-val="6" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">6</button>
            <button class="btn btn-secondary num-key" data-val="7" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">7</button>
            <button class="btn btn-secondary num-key" data-val="8" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">8</button>
            <button class="btn btn-secondary num-key" data-val="9" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">9</button>
            <button class="btn btn-danger num-key" data-val="clear" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-sm); font-weight: 800; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239,68,68,0.25); color: #FF4D4D;">C</button>
            <button class="btn btn-secondary num-key" data-val="0" style="height: 52px; border-radius: var(--radius-md); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 700; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);">0</button>
            <button class="btn btn-secondary num-key" data-val="backspace" style="height: 52px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass);"><span class="material-symbols-rounded" style="font-size: 18px; color: var(--text-secondary);">backspace</span></button>
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
          // Delay briefly for visual dot feedback
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
      const correctPin = await getSetting('adminPin') || '1234';
      if (this.pinInput === correctPin) {
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
    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg-primary);">
        <!-- Admin Views Header Tabs -->
        <div style="
          background: rgba(9, 9, 14, 0.8); 
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border-glass); 
          padding: 10px 24px; 
          overflow-x: auto; 
          display: flex; 
          align-items: center;
          gap: 12px;
          z-index: 10;
        " class="scrollbar-none">
          <button class="tab admin-tab ${this.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            font-size: var(--text-xs);
            gap: 6px;
            display: inline-flex;
            align-items: center;
            padding: 8px 16px;
            border-radius: var(--radius-md);
            transition: all var(--transition-normal);
          ">
            <span class="material-symbols-rounded" style="font-size: 18px;">dashboard</span>
            Dashboard
          </button>
          <button class="tab admin-tab ${this.activeTab === 'menu' ? 'active' : ''}" data-tab="menu" style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            font-size: var(--text-xs);
            gap: 6px;
            display: inline-flex;
            align-items: center;
            padding: 8px 16px;
            border-radius: var(--radius-md);
            transition: all var(--transition-normal);
          ">
            <span class="material-symbols-rounded" style="font-size: 18px;">edit_document</span>
            Menu CRUD
          </button>
          <button class="tab admin-tab ${this.activeTab === 'orders' ? 'active' : ''}" data-tab="orders" style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            font-size: var(--text-xs);
            gap: 6px;
            display: inline-flex;
            align-items: center;
            padding: 8px 16px;
            border-radius: var(--radius-md);
            transition: all var(--transition-normal);
          ">
            <span class="material-symbols-rounded" style="font-size: 18px;">history</span>
            Order Log
          </button>
          <button class="tab admin-tab ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings" style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            font-size: var(--text-xs);
            gap: 6px;
            display: inline-flex;
            align-items: center;
            padding: 8px 16px;
            border-radius: var(--radius-md);
            transition: all var(--transition-normal);
          ">
            <span class="material-symbols-rounded" style="font-size: 18px;">settings</span>
            Settings
          </button>
          <button class="btn btn-secondary btn-sm" id="btn-admin-logout" style="
            margin-left: auto; 
            min-height: 36px; 
            padding: 6px 16px; 
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            font-size: var(--text-xs); 
            background: rgba(239, 68, 68, 0.03);
            border: 1px solid rgba(239, 68, 68, 0.2); 
            color: #FF4D4D;
            border-radius: var(--radius-md);
            transition: all var(--transition-fast);
          ">
            <span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">lock</span>
            Lock Terminal
          </button>
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

    // Logout/Lock
    document.getElementById('btn-admin-logout').addEventListener('click', () => {
      playSound(600, 100);
      this.isAuthenticated = false;
      this.activeTab = 'dashboard';
      this.renderPinScreen();
    });
  }

  async mountActiveSubView() {
    const viewport = document.getElementById('admin-viewport');
    if (!viewport) return;

    // Unmount current subview
    if (this.menuManager && this.menuManager.unmount) this.menuManager.unmount();
    if (this.orderHistory && this.orderHistory.unmount) this.orderHistory.unmount();
    if (this.settingsView && this.settingsView.unmount) this.settingsView.unmount();

    viewport.innerHTML = '';

    if (this.activeTab === 'dashboard') {
      await this.renderDashboard(viewport);
    } else if (this.activeTab === 'menu') {
      this.menuManager = new MenuManager(this.app);
      await this.menuManager.mount(viewport);
    } else if (this.activeTab === 'orders') {
      this.orderHistory = new OrderHistory(this.app);
      await this.orderHistory.mount(viewport);
    } else if (this.activeTab === 'settings') {
      this.settingsView = new SettingsView(this.app);
      await this.settingsView.mount(viewport);
    }
  }

  async renderDashboard(viewport) {
    viewport.innerHTML = `
      <div style="padding: 28px 24px; display: flex; flex-direction: column; gap: 24px; max-width: 1000px; margin: 0 auto; width: 100%;">
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em;">
          Console Overview (Today)
        </div>

        <!-- Dashboard Stats Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px;">
          <div class="card card-glass" style="
            padding: 24px; 
            display: flex; 
            flex-direction: column; 
            gap: 10px;
            background: rgba(255,255,255,0.01);
            border: 1px solid var(--border-glass);
            border-radius: var(--radius-xl);
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          ">
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">TODAY'S REVENUE</div>
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 2.4rem; font-weight: 800; color: var(--color-success); line-height: 1; letter-spacing: -0.03em; filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.25));" id="dash-revenue">₹0.00</div>
          </div>
          <div class="card card-glass" style="
            padding: 24px; 
            display: flex; 
            flex-direction: column; 
            gap: 10px;
            background: rgba(255,255,255,0.01);
            border: 1px solid var(--border-glass);
            border-radius: var(--radius-xl);
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          ">
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">COMPLETED ORDERS</div>
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 2.4rem; font-weight: 800; color: var(--color-primary); line-height: 1; letter-spacing: -0.03em; filter: drop-shadow(0 0 10px rgba(255, 94, 54, 0.25));" id="dash-orders">0</div>
          </div>
          <div class="card card-glass" style="
            padding: 24px; 
            display: flex; 
            flex-direction: column; 
            gap: 10px;
            background: rgba(255,255,255,0.01);
            border: 1px solid var(--border-glass);
            border-radius: var(--radius-xl);
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          ">
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">AVERAGE BILL VALUE</div>
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 2.4rem; font-weight: 800; color: var(--color-info); line-height: 1; letter-spacing: -0.03em; filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.25));" id="dash-avg">₹0.00</div>
          </div>
        </div>

        <!-- Payment split card -->
        <div class="card card-glass" style="
          padding: 24px;
          background: rgba(255,255,255,0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-xl);
          box-shadow: 0 15px 35px rgba(0,0,0,0.15);
        ">
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: 20px; letter-spacing: -0.01em;">Revenue Split by Method</div>
          <div style="display: flex; flex-direction: column; gap: 16px;" id="dash-payments-list">
            <!-- Loaded dynamically -->
          </div>
        </div>
      </div>
    `;

    // Load statistics
    try {
      const stats = await getTodayStats();
      
      document.getElementById('dash-revenue').textContent = formatCurrency(stats.totalRevenue);
      document.getElementById('dash-orders').textContent = stats.totalOrders;
      document.getElementById('dash-avg').textContent = formatCurrency(stats.avgOrderValue);

      const listContainer = document.getElementById('dash-payments-list');
      if (listContainer) {
        listContainer.innerHTML = '';
        
        const methods = Object.keys(stats.paymentBreakdown);
        if (methods.length === 0) {
          listContainer.innerHTML = `<div style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 500;">No sales recorded yet today.</div>`;
          return;
        }

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
                <div style="height: 100%; background: linear-gradient(90deg, #FF5E36 0%, #FF8960 100%); width: ${percent}%; border-radius: var(--radius-full); box-shadow: 0 0 10px rgba(255, 94, 54, 0.4);"></div>
              </div>
            </div>
          `;
        });
      }

    } catch (e) {
      console.error('Failed to load dashboard metrics:', e);
    }
  }

  unmount() {
    if (this.menuManager && this.menuManager.unmount) this.menuManager.unmount();
    if (this.orderHistory && this.orderHistory.unmount) this.orderHistory.unmount();
    if (this.settingsView && this.settingsView.unmount) this.settingsView.unmount();
    this.container = null;
  }
}
