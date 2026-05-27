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
import './styles/storefront.css';

// Database
import { db } from './db/database.js';
import { seedDatabase } from './db/seed.js';

// Router
import { router } from './router.js';

import { showToast } from './utils/helpers.js';

// NextGenOS
import { printConsoleSignature, injectBuildGlobal, performVersionGate } from './utils/watermark.js';
class App {
  constructor() {
    this.deferredInstallPrompt = null;
    this.initialized = false;
    this.sidebar = null;
    this.loginScreen = null;
    this.syncStarted = false;
    this.syncServicePromise = null;
    this.authServicePromise = null;
  }

  async init() {
    try {
      // ── Version Gate ──────────────────────────────────
      // Clear stale auth tokens whenever the build version changes.
      // This prevents ghost PIN sessions from old database states
      // surviving across app updates (laptop vs phone inconsistency).
      performVersionGate();

      // Cache currency and tax settings to localStorage for synchronous access in helpers
      try {
        const appCurrencySymbol = await db.settings.get('currencySymbol');
        const appCurrencyCode = await db.settings.get('currencyCode');
        const appTaxType = await db.settings.get('taxType');
        const appTaxLabel = await db.settings.get('taxLabel');
        
        localStorage.setItem('app_currency_symbol', appCurrencySymbol ? appCurrencySymbol.value : '₹');
        localStorage.setItem('app_currency_code', appCurrencyCode ? appCurrencyCode.value : 'INR');
        localStorage.setItem('app_tax_type', appTaxType ? appTaxType.value : 'GST');
        localStorage.setItem('app_tax_label', appTaxLabel ? appTaxLabel.value : 'GST');
      } catch (dbErr) {
        console.warn('[App] Failed to cache database settings in localStorage:', dbErr);
      }

      const initialHash = window.location.hash || '#/self-order';
      const initialPath = initialHash.split('?')[0];
      const isPublicEntry = initialPath === '#/self-order';

      if (!window.location.hash) {
        window.location.hash = '#/self-order';
      }

      // Public customers only need catalog data. Staff/admin demo data is seeded on staff entry.
      await seedDatabase({ publicOnly: isPublicEntry });

      // Hide loading screen
      this.hideLoadingScreen();

      // NextGenOS boot signature
      printConsoleSignature();
      injectBuildGlobal();

      // Inject interactive portal switcher widget
      this.injectSandboxWidget();

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

      // Public website entry opens customer ordering. Staff use explicit staff routes.
      if (isPublicEntry) {
        this.startPublicRoute();
        return;
      }

      const authService = await this.getAuthService();

      // Check for persistent session first (both staff PIN, and Supabase Auth cloud user)
      // This ensures that on a new device, we restore the cloud session first which pulls
      // the latest synced staff members before deciding to show FirstRunSetup.
      let autoLoggedIn = false;
      try {
        const staff = await authService.restoreSession();
        if (staff && staff.role !== 'customer') {
          await this.onLoginSuccess(staff);
          autoLoggedIn = true;
        }
      } catch (e) {
        console.error('[App] Auto-login failed:', e);
      }

      if (autoLoggedIn) {
        return;
      }

      // Verify if we have an active owner in the local database.
      // If we don't, we show first-run setup.
      const activeOwner = await db.staff
        .where('role')
        .equals('owner')
        .and(staff => staff.isActive === 1 || staff.isActive === true)
        .first();

      if (!activeOwner) {
        this.showFirstRunSetup();
        return;
      }

      // Show login screen
      this.showLogin();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showFatalError(error);
    }
  }

  async startPublicRoute() {
    this.renderPublicShell();
    this.setupRouter();
    this.setupPWA();
    this.setupConnectivity();

    // Attempt to restore cloud session for customer if any
    try {
      const authService = await this.getAuthService();
      await authService.restoreSession();
    } catch (e) {
      console.warn('[App] Customer session restore failed:', e);
    }

    router.start();
    this.initialized = true;
  }

  async showLogin() {
    const appEl = document.getElementById('app');
    appEl.innerHTML = '';
    const { LoginScreen } = await import('./components/LoginScreen.js');
    this.loginScreen = new LoginScreen((staff) => {
      this.onLoginSuccess(staff);
    });
    this.loginScreen.render(appEl);
  }

  async showFirstRunSetup() {
    const appEl = document.getElementById('app');
    appEl.innerHTML = '';
    const { FirstRunSetup } = await import('./components/FirstRunSetup.js');
    const setup = new FirstRunSetup(() => {
      this.showLogin();
    });
    setup.render(appEl);
  }

  async onLoginSuccess(staff) {
    if (staff && staff.role === 'customer') {
      this.startPublicRoute();
      router.navigate('#/self-order');
      this.initialized = true;
      console.log(`🍜 The Taste — Customer ${staff.name} logged in successfully.`);
      return;
    }

    // Build the app shell
    this.renderShell();

    // Initialize sidebar
    const { Sidebar } = await import('./components/Sidebar.js');
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

    // Staff cloud sync starts only after staff authentication.
    // Hydrate from cloud before starting router / POS view
    this.syncStarted = true;
    try {
      const syncService = await this.getSyncService();
      await syncService.init();
    } catch (err) {
      console.error('[App] Sync init error during boot:', err);
    }

    // Update header with staff info
    this.updateStaffDisplay(staff);

    // Start router
    router.start();

    this.initialized = true;
    console.log(`🍜 The Taste Restaurant OS — Logged in as ${staff.name} (${staff.role})`);
  }

  startSyncService() {
    // Left for backward compatibility/external triggers, but main flow now awaits inline
    if (this.syncStarted) return;
    this.syncStarted = true;
    this.getSyncService()
      .then(syncService => syncService.init())
      .catch(err => console.error('[App] Sync init error:', err));
  }

  async getSyncService() {
    if (!this.syncServicePromise) {
      this.syncServicePromise = import('./services/sync.js').then(module => module.syncService);
    }
    return this.syncServicePromise;
  }

  async getAuthService() {
    if (!this.authServicePromise) {
      this.authServicePromise = import('./services/auth.js').then(module => module.authService);
    }
    return this.authServicePromise;
  }

  updateStaffDisplay(staff) {
    const staffEl = document.getElementById('header-staff-name');
    if (staffEl) staffEl.textContent = staff.name;
    const roleEl = document.getElementById('header-staff-role');
    if (roleEl) roleEl.textContent = staff.role;
  }

  renderPublicShell() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <main id="main-content" class="public-main" style="min-height: 100vh;"></main>
    `;
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
              <img src="/assets/aether-icon.png" class="logo-img" alt="Logo" style="width:28px;height:28px;border-radius:6px;object-fit:contain;margin-right:8px;border:1px solid var(--border-active);box-shadow:var(--shadow-glow-active);" />
              <span style="font-weight: 800; font-family: var(--font-display); letter-spacing: -0.04em;">The Taste</span>
            </a>
            <span class="nextgenos-header-badge" style="background: var(--nextgenos-purple-bg); color: var(--nextgenos-purple); border: 1px solid var(--nextgenos-purple-border); box-shadow: var(--shadow-glow-purple); font-weight: 700; padding: 2px 8px; border-radius: var(--radius-full); font-size: 0.65rem; letter-spacing: 0.08em; text-transform: uppercase;">NextGenOS</span>
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
          <main id="main-content" class="view-enter" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;"></main>
        </div>
      </div>
    `;

    // Printer status button
    document.getElementById('printer-status-btn').addEventListener('click', async () => {
      const { printerService } = await import('./services/printer.js');
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
    document.getElementById('btn-logout').addEventListener('click', async () => {
      if (confirm('Are you sure you want to logout?')) {
        const authService = await this.getAuthService();
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
    }, ['owner', 'manager', 'cashier', 'delivery']);

    router.register('#/admin', async () => {
      const { AdminView } = await import('./views/admin/AdminView.js');
      return new AdminView(this);
    }, ['owner', 'manager']);

    router.register('#/help', async () => {
      const { HelpView } = await import('./views/admin/HelpView.js');
      return new HelpView(this);
    }, ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'delivery']);

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

    // PWA Service Worker Update Prompt Registry
    const schedulePwaRegistration = (callback) => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(callback, { timeout: 8000 });
      } else {
        window.setTimeout(callback, 5000);
      }
    };

    schedulePwaRegistration(() => {
      try {
        import('virtual:pwa-register')
        .then(({ registerSW }) => {
          const updateSW = registerSW({
            onNeedRefresh: () => {
              console.log('[PWA] A new service worker update is available. Prompting reload.');
              this.showUpdateBanner(() => updateSW(true));
            },
            onOfflineReady: () => {
              console.log('[PWA] Platform is offline-ready and assets are fully cached.');
            }
          });
        })
        .catch(err => {
          console.debug('[PWA] Service Worker registration skipped (expected during local dev/testing):', err.message);
        });
      } catch (e) {
        console.warn('[PWA] Failed to set up Service Worker update prompt:', e);
      }
    });
  }

  showUpdateBanner(onConfirm) {
    if (document.getElementById('pwa-update-prompt')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-prompt';
    banner.className = 'pwa-update-banner';
    banner.innerHTML = `
      <div class="pwa-update-content">
        <span class="material-symbols-rounded pwa-update-icon">system_update</span>
        <div class="pwa-update-text">
          <strong>Update Available!</strong>
          <span>A new version of the platform is ready.</span>
        </div>
      </div>
      <div class="pwa-update-actions">
        <button class="btn btn-sm btn-primary pwa-update-btn">Reload</button>
        <button class="btn-icon pwa-close-btn" title="Dismiss">
          <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
        </button>
      </div>
    `;
    document.body.appendChild(banner);

    // Audio & haptic feedback for user alert
    import('./utils/helpers.js').then(({ playSound, vibrateDevice }) => {
      playSound(600, 150);
      vibrateDevice([60, 40, 60]);
    });

    const reloadBtn = banner.querySelector('.pwa-update-btn');
    reloadBtn.addEventListener('click', () => {
      banner.classList.add('loading');
      reloadBtn.disabled = true;
      reloadBtn.textContent = 'Updating...';
      // Clear stale auth state before the new service worker activates,
      // so the next boot starts clean with the version gate.
      localStorage.removeItem('auth_staff_pin');
      localStorage.removeItem('auth_staff_email');
      localStorage.removeItem('app_build_version');
      onConfirm();
    });

    const closeBtn = banner.querySelector('.pwa-close-btn');
    closeBtn.addEventListener('click', () => {
      banner.classList.add('slide-out');
      setTimeout(() => banner.remove(), 400);
    });
  }

  async setupPrinter() {
    const { printerService } = await import('./services/printer.js');
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

    this.getSyncService()
      .then(syncService => {
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
          } else {
            dot.className = 'status-dot offline';
            dot.style.background = '';
            dot.style.boxShadow = '';
            text.textContent = 'Sync Error';
            if (btn) btn.title = 'Cloud Sync: Connection or Sync Error';
          }
        });
      })
      .catch(err => console.error('[App] Sync status setup error:', err));

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

  injectSandboxWidget() {
    if (document.getElementById('aether-sandbox-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'aether-sandbox-widget';
    widget.className = 'aether-sandbox-widget';
    widget.innerHTML = `
      <div class="aether-sandbox-trigger">
        <span class="material-symbols-rounded">admin_panel_settings</span>
        <span class="sandbox-txt">OS Portals</span>
      </div>
      <div class="aether-sandbox-panel">
        <div class="aether-sandbox-header">
          <strong>NextGenOS OS Switcher</strong>
          <small>Interactive Sandbox Switcher</small>
        </div>
        <div class="aether-sandbox-body">
          <button class="sandbox-panel-btn" id="sandbox-go-kiosk">
            <span class="material-symbols-rounded" style="color:var(--color-primary);">shopping_cart</span>
            <div>
              <strong>Customer Kiosk</strong>
              <small>Public storefront (/#/self-order)</small>
            </div>
          </button>
          <button class="sandbox-panel-btn" id="sandbox-go-pos">
            <span class="material-symbols-rounded" style="color:var(--nextgenos-purple);">point_of_sale</span>
            <div>
              <strong>Staff POS Portal</strong>
              <small>Operations backend (/#/pos)</small>
            </div>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    const trigger = widget.querySelector('.aether-sandbox-trigger');
    if (trigger) {
      trigger.addEventListener('click', () => {
        widget.classList.toggle('is-expanded');
        import('./utils/helpers.js').then(({ playSound, vibrateDevice }) => {
          playSound(700, 50);
          vibrateDevice([15]);
        });
      });
    }

    const goKiosk = widget.querySelector('#sandbox-go-kiosk');
    if (goKiosk) {
      goKiosk.addEventListener('click', () => {
        import('./utils/helpers.js').then(({ playSound }) => playSound(800, 80));
        window.location.hash = '#/self-order';
        widget.classList.remove('is-expanded');
      });
    }

    const goPos = widget.querySelector('#sandbox-go-pos');
    if (goPos) {
      goPos.addEventListener('click', () => {
        import('./utils/helpers.js').then(({ playSound }) => playSound(800, 80));
        window.location.hash = '#/pos';
        widget.classList.remove('is-expanded');
      });
    }

    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target)) {
        widget.classList.remove('is-expanded');
      }
    });
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
