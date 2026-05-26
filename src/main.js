/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Main Application Entry Point
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

// Styles
import './styles/variables.css';
import './styles/base.css';
import './styles/components-v2.css';
import './styles/layout.css';
import './styles/sidebar.css';

// Database
import { db } from './db/database.js';
import { seedDatabase } from './db/seed.js';

// Router
import { router } from './router.js';

// Services
import { printerService } from './services/printer.js';
import { syncService } from './services/sync.js';
import { showToast } from './utils/helpers.js';

// NextGenOS
import { printConsoleSignature, injectBuildGlobal } from './utils/watermark.js';
import { Sidebar } from './components/Sidebar.js';

// Auth
import { authService } from './services/auth.js';
import { LoginScreen } from './components/LoginScreen.js';

class App {
  constructor() {
    this.deferredInstallPrompt = null;
    this.initialized = false;
    this.sidebar = null;
    this.loginScreen = null;
  }

  async init() {
    try {
      // Initialize database and seed data
      await seedDatabase();

      // Initialize cloud sync service asynchronously to prevent blocking UI boot
      syncService.init().catch(err => console.error('[App] Sync init error:', err));

      // Hide loading screen
      this.hideLoadingScreen();

      // NextGenOS boot signature
      printConsoleSignature();
      injectBuildGlobal();

      // Setup router auth handler
      router.onAuthRequired = () => {
        this.initialized = false;
        this.showLogin();
      };

      // Listen for session expiry
      window.addEventListener('auth-session-expired', () => {
        if (router.currentView && typeof router.currentView.unmount === 'function') {
          router.currentView.unmount();
        }
        this.initialized = false;
        this.showLogin();
        showToast('Session expired. Please log in again.', 'warning');
      });

      // Show login screen
      this.showLogin();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showFatalError(error);
    }
  }

  showLogin() {
    const appEl = document.getElementById('app');
    appEl.innerHTML = '';
    this.loginScreen = new LoginScreen((staff) => {
      this.onLoginSuccess(staff);
    });
    this.loginScreen.render(appEl);
  }

  async onLoginSuccess(staff) {
    // Build the app shell
    this.renderShell();

    // Initialize sidebar
    this.sidebar = new Sidebar();
    this.sidebar.render(document.getElementById('app-sidebar'));

    // Setup router
    this.setupRouter();

    // Setup PWA install prompt
    this.setupPWA();

    // Setup printer status listener
    this.setupPrinter();

    // Setup cloud sync indicator listener
    this.setupSync();

    // Setup online/offline indicators
    this.setupConnectivity();

    // Setup mobile sidebar toggle
    this.setupMobileSidebar();

    // Update header with staff info
    this.updateStaffDisplay(staff);

    // Start router
    router.start();

    this.initialized = true;
    console.log(`🍜 The Taste Restaurant OS — Logged in as ${staff.name} (${staff.role})`);
  }

  updateStaffDisplay(staff) {
    const staffEl = document.getElementById('header-staff-name');
    if (staffEl) staffEl.textContent = staff.name;
    const roleEl = document.getElementById('header-staff-role');
    if (roleEl) roleEl.textContent = staff.role;
  }

  renderShell() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="app-layout">
        <!-- Sidebar Navigation -->
        <aside class="sidebar" id="app-sidebar"></aside>

        <!-- Mobile Overlay -->
        <div class="sidebar-mobile-overlay" id="sidebar-overlay"></div>

        <!-- Main Area -->
        <div class="main-area">
          <!-- Header -->
          <header class="app-header">
            <button class="btn-icon sidebar-mobile-toggle" id="sidebar-toggle" title="Toggle Menu">
              <span class="material-symbols-rounded">menu</span>
            </button>
            <a href="#/pos" class="logo" id="app-logo">
              <span class="logo-icon">🍜</span>
              <span>The Taste</span>
            </a>
            <span class="nextgenos-header-badge">NextGenOS</span>
            <div class="header-actions">
              <div class="header-printer-status" id="header-staff-display" title="Logged in staff" style="gap:4px;">
                <span class="material-symbols-rounded" style="font-size: 16px;">person</span>
                <span id="header-staff-name" style="font-weight:700;"></span>
                <span id="header-staff-role" style="font-size:0.55rem;opacity:0.5;text-transform:capitalize;"></span>
              </div>
              <button class="header-printer-status" id="sync-status-btn" title="Cloud Sync Status">
                <span class="material-symbols-rounded" style="font-size: 16px;">cloud_sync</span>
                <span id="sync-status-text">Connecting</span>
                <span class="status-dot offline" id="sync-status-dot"></span>
              </button>
              <button class="header-printer-status" id="printer-status-btn" title="Printer Status">
                <span class="material-symbols-rounded" style="font-size: 16px;">print</span>
                <span id="printer-status-text">Not Connected</span>
                <span class="status-dot offline" id="printer-status-dot"></span>
              </button>
              <button class="btn-icon" id="btn-install-app" title="Install App" style="display:none;">
                <span class="material-symbols-rounded">install_mobile</span>
              </button>
              <button class="btn-icon" id="btn-logout" title="Logout" style="color:var(--text-muted);">
                <span class="material-symbols-rounded">logout</span>
              </button>
            </div>
          </header>

          <!-- Main Content Area -->
          <main id="main-content" class="view-enter" style="flex: 1; display: flex; flex-direction: column;"></main>
        </div>
      </div>
    `;

    // Printer status button
    document.getElementById('printer-status-btn').addEventListener('click', async () => {
      if (printerService.isConnected) {
        showToast('Printer is connected', 'success');
      } else {
        if (!printerService.isSupported()) {
          showToast('Bluetooth not supported in this browser. Use Chrome on Android.', 'warning', 5000);
          return;
        }
        try {
          showToast('Connecting to printer...', 'info');
          await printerService.connect();
          showToast('Printer connected!', 'success');
        } catch (err) {
          if (err.name !== 'NotFoundError') { // User cancelled picker
            showToast('Failed to connect printer: ' + err.message, 'error');
          }
        }
      }
    });

    // Logout button
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        authService.logout();
        if (router.currentView && typeof router.currentView.unmount === 'function') {
          router.currentView.unmount();
        }
        this.initialized = false;
        this.showLogin();
        showToast('Logged out', 'info');
      }
    });
  }

  setupMobileSidebar() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = sidebar.classList.contains('mobile-open');
        sidebar.classList.toggle('mobile-open', !isOpen);
        if (overlay) {
          overlay.classList.toggle('show', !isOpen);
          overlay.classList.toggle('visible', !isOpen);
        }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('show', 'visible');
      });
    }
  }

  setupRouter() {
    router.setContainer(document.getElementById('main-content'));

    // ── Operations ──
    router.register('#/pos', async () => {
      const { PosView } = await import('./views/pos/PosView.js');
      return new PosView(this);
    }, ['owner', 'manager', 'cashier', 'waiter']);

    router.register('#/kitchen', async () => {
      const { KitchenView } = await import('./views/kitchen/KitchenView.js');
      return new KitchenView(this);
    }, ['owner', 'manager', 'cashier', 'kitchen']);

    router.register('#/tables', async () => {
      const { TablesView } = await import('./views/tables/TablesView.js');
      return new TablesView(this);
    }, ['owner', 'manager', 'cashier', 'waiter', 'kitchen']);

    router.register('#/channels', async () => {
      const { ChannelHub } = await import('./views/channels/ChannelHub.js');
      return new ChannelHub(this);
    }, ['owner', 'manager', 'cashier']);

    router.register('#/self-order', async () => {
      const { CustomerView } = await import('./views/customer/CustomerView.js');
      return new CustomerView(this);
    }, null); // Public (no auth required)

    // ── Business ──
    router.register('#/analytics', async () => {
      const { AnalyticsDashboard } = await import('./views/analytics/AnalyticsDashboard.js');
      return new AnalyticsDashboard(this);
    }, ['owner', 'manager']);

    router.register('#/inventory', async () => {
      const { InventoryView } = await import('./views/inventory/InventoryView.js');
      return new InventoryView(this);
    }, ['owner', 'manager']);

    router.register('#/customers', async () => {
      const { CustomersView } = await import('./views/customers/CustomersView.js');
      return new CustomersView(this);
    }, ['owner', 'manager', 'cashier', 'waiter']);

    router.register('#/staff', async () => {
      const { StaffView } = await import('./views/staff/StaffView.js');
      return new StaffView(this);
    }, ['owner', 'manager']);

    // ── Intelligence ──
    router.register('#/ai', async () => {
      const { AICommandCenter } = await import('./views/ai/AICommandCenter.js');
      return new AICommandCenter(this);
    }, ['owner', 'manager', 'cashier']);

    // ── System ──
    router.register('#/orders', async () => {
      const { OrderHistory } = await import('./views/admin/OrderHistory.js');
      return new OrderHistory(this);
    }, ['owner', 'manager', 'cashier']);

    router.register('#/admin', async () => {
      const { AdminView } = await import('./views/admin/AdminView.js');
      return new AdminView(this);
    }, ['owner', 'manager']);

    // Update sidebar + header on route change
    router.onNavigate = (hash) => {
      const header = document.querySelector('.app-header');
      const sidebar = document.getElementById('app-sidebar');
      const overlay = document.getElementById('sidebar-overlay');

      if (hash === '#/self-order') {
        if (header) header.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';
      } else {
        if (header) header.style.display = 'flex';
        if (sidebar) sidebar.style.display = '';
      }

      // Close mobile sidebar on navigate
      if (sidebar) sidebar.classList.remove('mobile-open');
      if (overlay) { overlay.classList.remove('show', 'visible'); }

      // Update sidebar active state
      if (this.sidebar) this.sidebar.setActive(hash);
    };
  }

  setupPWA() {
    // Capture install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const installBtn = document.getElementById('btn-install-app');
      if (installBtn) {
        installBtn.style.display = 'flex';
        installBtn.addEventListener('click', async () => {
          if (this.deferredInstallPrompt) {
            this.deferredInstallPrompt.prompt();
            const { outcome } = await this.deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
              showToast('App installed! Find it on your home screen.', 'success', 5000);
              installBtn.style.display = 'none';
            }
            this.deferredInstallPrompt = null;
          }
        });
      }
    });

    // App installed
    window.addEventListener('appinstalled', () => {
      showToast('The Taste Restaurant OS installed successfully!', 'success');
      this.deferredInstallPrompt = null;
      const installBtn = document.getElementById('btn-install-app');
      if (installBtn) installBtn.style.display = 'none';
    });
  }

  setupPrinter() {
    printerService.onStatusChange = (isConnected) => {
      const dot = document.getElementById('printer-status-dot');
      const text = document.getElementById('printer-status-text');
      if (dot) {
        dot.className = `status-dot ${isConnected ? 'online' : 'offline'}`;
      }
      if (text) {
        text.textContent = isConnected ? 'Connected' : 'Not Connected';
      }
    };
  }

  setupSync() {
    const dot = document.getElementById('sync-status-dot');
    const text = document.getElementById('sync-status-text');
    const btn = document.getElementById('sync-status-btn');

    syncService.onStatusChange((status, isConnected, isOnline) => {
      if (!dot || !text) return;

      if (status === 'connected') {
        dot.className = 'status-dot online';
        dot.style.background = '';
        dot.style.boxShadow = '';
        text.textContent = 'Cloud Active';
        if (btn) btn.title = 'Cloud Sync: Connected & Active';
      } else if (status === 'connecting') {
        dot.className = 'status-dot';
        dot.style.background = '#F59E0B';
        dot.style.boxShadow = '0 0 6px rgba(245, 158, 11, 0.6)';
        text.textContent = 'Syncing...';
        if (btn) btn.title = 'Cloud Sync: Connecting...';
      } else if (status === 'unconfigured') {
        dot.className = 'status-dot';
        dot.style.background = '#F59E0B';
        dot.style.boxShadow = '0 0 6px rgba(245, 158, 11, 0.6)';
        text.textContent = 'Cloud Off';
        if (btn) btn.title = 'Cloud Sync: Unconfigured. Click to setup.';
      } else if (status === 'offline') {
        dot.className = 'status-dot offline';
        dot.style.background = '';
        dot.style.boxShadow = '';
        text.textContent = 'Offline';
        if (btn) btn.title = 'Cloud Sync: Network is offline';
      } else { // 'error'
        dot.className = 'status-dot offline';
        dot.style.background = '';
        dot.style.boxShadow = '';
        text.textContent = 'Sync Error';
        if (btn) btn.title = 'Cloud Sync: Connection or Sync Error';
      }
    });

    if (btn) {
      btn.addEventListener('click', () => {
        import('./utils/helpers.js').then(({ playSound, vibrateDevice }) => {
          playSound(800, 100);
          vibrateDevice([40]);
        });
        window.location.hash = '#/admin';
      });
    }
  }

  setupConnectivity() {
    const updateStatus = () => {
      if (!navigator.onLine) {
        showToast('You are offline. Orders will be saved locally.', 'warning', 4000);
      }
    };

    window.addEventListener('online', () => {
      showToast('Back online!', 'success');
    });
    window.addEventListener('offline', updateStatus);
  }

  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('hide');
      setTimeout(() => loadingScreen.remove(), 500);
    }
  }

  showFatalError(error) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div class="loading-brand" style="margin-bottom: 16px;">⚠️</div>
          <h2 style="color: #FF1744; margin-bottom: 8px;">Failed to Start</h2>
          <p style="color: #94A3B8; margin-bottom: 20px; max-width: 300px;">
            ${error.message || 'An unexpected error occurred'}
          </p>
          <button onclick="location.reload()" 
            style="padding: 12px 24px; background: #FF6B35; color: white; border: none; border-radius: 10px; font-size: 16px; cursor: pointer;">
            Retry
          </button>
          <div style="margin-top: 16px; font-size: 0.6rem; color: rgba(148,163,184,0.4);">NextGenOS Restaurant OS v2.0.0</div>
        </div>
      `;
    }
  }
}

// Boot the app
const app = new App();
app.init();
