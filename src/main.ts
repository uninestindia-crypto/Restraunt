// @ts-nocheck
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
import { db } from './db/database';
import { seedDatabase } from './db/seed';

// Router
import { router } from './router';

// Telemetry & Observability
import { telemetry } from './services/telemetry';

import { showToast } from './utils/helpers';

// NextGenOS
import { printConsoleSignature, injectBuildGlobal, performVersionGate, checkForUpdateAndGate } from './utils/watermark';
class App {
  constructor() {
    this.deferredInstallPrompt = null;
    this.initialized = false;
    this.sidebar = null;
    this.loginScreen = null;
    this.syncStarted = false;
    this.syncServicePromise = null;
    this.authServicePromise = null;

    // Initialize theme immediately to prevent FOUC
    this.initTheme();
  }

  initTheme() {
    const saved = localStorage.getItem('app_theme') || 'system';
    document.documentElement.setAttribute('data-theme', saved);

    // Listen for OS preference changes when using 'system' theme
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const current = localStorage.getItem('app_theme') || 'system';
        if (current === 'system') {
          // Re-apply system attribute to trigger CSS media query re-evaluation
          document.documentElement.setAttribute('data-theme', 'system');
        }
      });
    }
  }

  /**
   * Set the app theme and persist to localStorage.
   * @param {'dark'|'light'|'system'} theme
   */
  static setTheme(theme) {
    const validThemes = ['dark', 'light', 'system'];
    if (!validThemes.includes(theme)) theme = 'system';
    localStorage.setItem('app_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
  }

  /**
   * Get the current theme setting.
   * @returns {'dark'|'light'|'system'}
   */
  static getTheme() {
    return localStorage.getItem('app_theme') || 'system';
  }

  /**
   * Get the resolved theme (what is actually visually applied).
   * @returns {'dark'|'light'}
   */
  static getResolvedTheme() {
    const theme = App.getTheme();
    if (theme === 'system') {
      return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return theme;
  }

  async init() {
    try {
      // ── Remote Version Gate Check ─────────────────────
      // Check for newer build version deployed on the server.
      // If version differs, this triggers clean reload and stops boot.
      const updating = await checkForUpdateAndGate();
      if (updating) return;

      // ── Version Gate ──────────────────────────────────
      // Clear stale auth tokens whenever the build version changes.
      // This prevents ghost PIN sessions from old database states
      // surviving across app updates (laptop vs phone inconsistency).
      performVersionGate();

      // Set up background periodic check for new deployments (every 5 minutes)
      setInterval(() => {
        checkForUpdateAndGate().catch(err => console.debug('[App] Background version check failed:', err));
      }, 5 * 60 * 1000);

      // Set up visibility change check (when tab becomes active/visible)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          console.log('[App] Tab visible. Checking for updates...');
          checkForUpdateAndGate().catch(err => console.debug('[App] Visibility change version check failed:', err));
        }
      });

      // Set up global ChunkLoadError / script load failure listener
      window.addEventListener('error', (event) => {
        const message = event.message || '';
        const error = event.error || {};
        const isChunkError = 
          /chunk|loading/i.test(message) || 
          /loading.*chunk/i.test(message) ||
          /failed.*import/i.test(message) ||
          (error.message && /chunk|loading|import/i.test(error.message));
        
        if (isChunkError) {
          console.warn('[App] Dynamic chunk/script load failure detected. Triggering urgent version check...');
          checkForUpdateAndGate().catch(err => console.debug('[App] Error handler version check failed:', err));
        }
      });
      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason || {};
        const message = reason.message || String(reason);
        const isChunkError = /chunk|loading|import/i.test(message);
        
        if (isChunkError) {
          console.warn('[App] Unhandled dynamic import rejection detected. Triggering urgent version check...');
          checkForUpdateAndGate().catch(err => console.debug('[App] Promise rejection version check failed:', err));
        }
      });

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
      // this.injectSandboxWidget();

      // Setup router auth handler
      router.onAuthRequired = async () => {
        this.initialized = false;
        this.showLogin();
      };

      // Listen for session expiry
      window.addEventListener('auth-session-expired', () => {
        if (this.inactivityTimeout) {
          clearTimeout(this.inactivityTimeout);
          this.inactivityTimeout = null;
        }
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
      // If we don't, attempt a last-resort cloud pull before deciding what to show.
      let activeOwner = await db.staff
        .where('role')
        .equals('owner')
        .and(staff => staff.isActive === 1 || staff.isActive === true)
        .first();

      if (!activeOwner) {
        // ── Last-Resort Cloud Staff Pull ──────────────────────────
        // The seed-phase hydration might have failed (timing, offline, etc).
        // Before deciding what to show, try one more direct cloud pull.
        try {
          if (navigator.onLine) {
            console.log('[App] No local owner found. Attempting direct cloud staff pull...');
            const { getSupabaseClient } = await import('./services/supabaseClient');
            const client = await getSupabaseClient({ persistSession: true });
            if (client) {
              const storeId = localStorage.getItem('store_id') || 'the-taste';
              const { data: cloudStaff, error } = await client
                .from('staff')
                .select('*')
                .eq('store_id', storeId)
                .eq('is_active', true);

              if (!error && cloudStaff && cloudStaff.length > 0) {
                console.log(`[App] Found ${cloudStaff.length} active staff in cloud. Hydrating...`);
                for (const row of cloudStaff) {
                  const localStaff = {
                    id: row.id,
                    cloudUserId: row.auth_user_id || null,
                    name: row.name,
                    role: row.role,
                    pinHash: row.pin_hash,
                    allowExpress: row.allow_express ? 1 : 0,
                    isActive: row.is_active ? 1 : 0,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    isSynced: 1
                  };
                  await db.staff.put(localStaff);
                }

                // Re-check for owner after hydration
                activeOwner = await db.staff
                  .where('role')
                  .equals('owner')
                  .and(staff => staff.isActive === 1 || staff.isActive === true)
                  .first();

                if (activeOwner) {
                  console.log(`[App] Cloud owner "${activeOwner.name}" hydrated successfully. Showing login.`);
                }
              }
            }
          }
        } catch (cloudErr) {
          console.warn('[App] Last-resort cloud staff pull failed:', cloudErr.message);
        }
      }

      if (!activeOwner) {
        console.warn('[App] No active owner found. Showing login page.');
        this.showLogin();
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
    const { LoginScreen } = await import('./components/LoginScreen');
    this.loginScreen = new LoginScreen((staff) => {
      this.onLoginSuccess(staff);
    });
    this.loginScreen.render(appEl);
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

    try {
      // Initialize sidebar
      const { Sidebar } = await import('./components/Sidebar');
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
      // Hydrate from cloud in the background to avoid blocking the UI thread
      this.syncStarted = true;
      this.getSyncService().then(syncService => {
        syncService.init().catch(err => {
          console.error('[App] Sync init error during boot:', err);
        });
      }).catch(err => {
        console.error('[App] Failed to load sync service:', err);
      });

      // Update header with staff info
      this.updateStaffDisplay(staff);

      // Start router
      router.start();

      // Start inactivity auto-lock checker
      this.startInactivityTimer();

      this.initialized = true;
      console.log(`🍜 The Taste Restaurant OS — Logged in as ${staff.name} (${staff.role})`);
    } catch (error) {
      console.error('[App] Failed to load staff interface:', error);
      showToast('Failed to load staff console: ' + error.message, 'error', 10000);
      
      const mainEl = document.getElementById('main-content') || document.getElementById('app');
      if (mainEl) {
        mainEl.innerHTML = `
          <div class="empty-state" style="height: 80vh; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 16px;">
            <span class="material-symbols-rounded" style="font-size: 48px; color: var(--color-error, #EF4444);">error</span>
            <h3 style="color: var(--text-primary); font-size: 1.25rem;">Failed to load staff console</h3>
            <p style="color: var(--text-muted); max-width: 400px; font-size: 0.875rem;">
              ${error.message || 'An unexpected error occurred while initializing the user interface.'}
            </p>
            <button class="btn btn-primary" onclick="localStorage.removeItem('auth_staff_pin'); localStorage.removeItem('auth_staff_email'); location.reload();" style="margin-top: 8px;">
              Reset Session & Retry
            </button>
          </div>
        `;
      }
    }
  }

  startInactivityTimer() {
    this.inactivityTimeout = null;
    this.activityEvents = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];

    this.resetInactivityTimer = async () => {
      if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);

      const authService = await this.getAuthService();
      if (!authService.isAuthenticated || !authService.getCurrentStaff() || authService.getCurrentStaff().role === 'customer') {
        return;
      }

      const { getSetting } = await import('./db/database');
      const autoLockVal = await getSetting('autoLockTerminal');
      if (autoLockVal === 'true' || autoLockVal === true) {
        const timeoutVal = await getSetting('autoLockTimeout') || '5';
        const minutes = parseInt(timeoutVal, 10);
        const ms = (isNaN(minutes) ? 5 : minutes) * 60 * 1000;

        this.inactivityTimeout = setTimeout(() => {
          this.lockTerminalOnInactivity();
        }, ms);
      }
    };

    this.activityEvents.forEach(evt => {
      window.addEventListener(evt, this.resetInactivityTimer, { passive: true });
    });

    this.resetInactivityTimer();
  }

  async lockTerminalOnInactivity() {
    const authService = await this.getAuthService();
    if (authService.isAuthenticated) {
      console.warn('[App] Inactivity timeout reached. Auto-locking terminal.');
      authService.logout();
      if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
      if (router.currentView && typeof router.currentView.unmount === 'function') {
        router.currentView.unmount();
      }
      this.initialized = false;
      this.showLogin();
      showToast('Terminal auto-locked due to inactivity', 'info');
    }
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
      this.syncServicePromise = import('./services/sync').then(module => module.syncService);
    }
    return this.syncServicePromise;
  }

  async getAuthService() {
    if (!this.authServicePromise) {
      this.authServicePromise = import('./services/auth').then(module => module.authService);
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
              <img src="/assets/the-taste-logo.png" class="logo-img" alt="Logo" style="width:28px;height:28px;border-radius:6px;object-fit:contain;margin-right:8px;border:1px solid var(--border-active);box-shadow:var(--shadow-glow-active);" />
              <span style="font-weight: 800; font-family: var(--font-display); letter-spacing: -0.04em;">The Taste</span>
            </a>
            <button class="btn-icon" id="btn-theme-toggle" title="Toggle Theme" style="margin-left: 4px; color: var(--text-muted);">
              <span class="material-symbols-rounded" id="theme-toggle-icon" style="font-size: 18px;">${App.getResolvedTheme() === 'dark' ? 'light_mode' : 'dark_mode'}</span>
            </button>
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
      const { printerService } = await import('./services/printer');
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

    // Theme toggle button
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = App.getTheme();
        const cycle = { dark: 'light', light: 'system', system: 'dark' };
        const next = cycle[current] || 'dark';
        App.setTheme(next);
        const icon = document.getElementById('theme-toggle-icon');
        if (icon) {
          const resolved = App.getResolvedTheme();
          icon.textContent = resolved === 'dark' ? 'light_mode' : 'dark_mode';
        }
        showToast(`Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`, 'info');
      });
    }

    // Logout button
    document.getElementById('btn-logout').addEventListener('click', async () => {
      if (confirm('Are you sure you want to logout?')) {
        const authService = await this.getAuthService();
        authService.logout();
        if (this.inactivityTimeout) {
          clearTimeout(this.inactivityTimeout);
          this.inactivityTimeout = null;
        }
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
      const { PosView } = await import('./views/pos/PosView');
      return new PosView(this);
    }, ['owner', 'manager', 'cashier', 'waiter']);

    router.register('#/kitchen', async () => {
      const { KitchenView } = await import('./views/kitchen/KitchenView');
      return new KitchenView(this);
    }, ['owner', 'manager', 'cashier', 'kitchen']);

    router.register('#/pos-kitchen', async () => {
      const { ExpressView } = await import('./views/express/ExpressView');
      return new ExpressView(this);
    }, ['owner', 'manager', 'cashier', 'waiter', 'kitchen']);

    router.register('#/tables', async () => {
      const { TablesView } = await import('./views/tables/TablesView');
      return new TablesView(this);
    }, ['owner', 'manager', 'cashier', 'waiter', 'kitchen']);

    router.register('#/channels', async () => {
      const { ChannelHub } = await import('./views/channels/ChannelHub');
      return new ChannelHub(this);
    }, ['owner', 'manager', 'cashier']);

    router.register('#/self-order', async () => {
      const { CustomerView } = await import('./views/customer/CustomerView');
      return new CustomerView(this);
    }, null); // Public (no auth required)

    // ── Business ──
    router.register('#/analytics', async () => {
      const { AnalyticsDashboard } = await import('./views/analytics/AnalyticsDashboard');
      return new AnalyticsDashboard(this);
    }, ['developer', 'owner', 'manager']);

    router.register('#/inventory', async () => {
      const { InventoryView } = await import('./views/inventory/InventoryView');
      return new InventoryView(this);
    }, ['owner', 'manager']);

    router.register('#/customers', async () => {
      const { CustomersView } = await import('./views/customers/CustomersView');
      return new CustomersView(this);
    }, ['owner', 'manager', 'cashier', 'waiter']);

    router.register('#/staff', async () => {
      const { StaffView } = await import('./views/staff/StaffView');
      return new StaffView(this);
    }, ['developer', 'owner', 'manager']);

    // ── Intelligence ──
    router.register('#/ai', async () => {
      const { AICommandCenter } = await import('./views/ai/AICommandCenter');
      return new AICommandCenter(this);
    }, ['developer', 'owner', 'manager', 'cashier']);

    // ── System ──
    router.register('#/orders', async () => {
      const { OrderHistory } = await import('./views/admin/OrderHistory');
      return new OrderHistory(this);
    }, ['owner', 'manager', 'cashier', 'delivery']);

    router.register('#/admin', async () => {
      const { AdminView } = await import('./views/admin/AdminView');
      return new AdminView(this);
    }, ['developer', 'owner', 'manager']);

    router.register('#/help', async () => {
      const { HelpView } = await import('./views/admin/HelpView');
      return new HelpView(this);
    }, ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'delivery']);

    // ── Developer ──
    router.register('#/developer', async () => {
      const { DevConsoleView } = await import('./views/developer/DevConsoleView');
      return new DevConsoleView(this);
    }, ['developer']);

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

    // Setup automatic Service Worker updates
    const schedulePwaRegistration = (callback) => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(callback, { timeout: 8000 });
      } else {
        window.setTimeout(callback, 5000);
      }
    };

    schedulePwaRegistration(() => {
      try {
        // Auto reload when a new service worker takes over control
        let refreshing = false;
        if ('serviceWorker' in navigator) {
          const hasController = !!navigator.serviceWorker.controller;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hasController) return; // Ignore first SW registration
            if (refreshing) return;
            refreshing = true;
            console.log('[PWA] Service worker updated. Reloading page...');
            window.location.reload();
          });
        }

        import('virtual:pwa-register')
        .then(({ registerSW }) => {
          registerSW({
            immediate: true,
            onOfflineReady: () => {
              console.log('[PWA] Platform is offline-ready and assets are fully cached.');
            },
            onRegisteredSW(swUrl, r) {
              if (r) {
                // Periodically check for service worker updates every 10 minutes
                setInterval(() => {
                  r.update();
                }, 10 * 60 * 1000);
              }
            }
          });
        })
        .catch(err => {
          console.debug('[PWA] Service Worker registration skipped (expected during local dev/testing):', err.message);
        });
      } catch (e) {
        console.warn('[PWA] Failed to set up Service Worker auto-update:', e);
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
    import('./utils/helpers').then(({ playSound, vibrateDevice }) => {
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
    const { printerService } = await import('./services/printer');
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
        import('./utils/helpers').then(({ playSound, vibrateDevice }) => {
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
        import('./utils/helpers').then(({ playSound, vibrateDevice }) => {
          playSound(700, 50);
          vibrateDevice([15]);
        });
      });
    }

    const goKiosk = widget.querySelector('#sandbox-go-kiosk');
    if (goKiosk) {
      goKiosk.addEventListener('click', () => {
        import('./utils/helpers').then(({ playSound }) => playSound(800, 80));
        widget.classList.remove('is-expanded');
        if (window.location.hash === '#/self-order' || window.location.hash === '') {
          window.location.reload();
        } else {
          window.location.hash = '#/self-order';
        }
      });
    }

    const goPos = widget.querySelector('#sandbox-go-pos');
    if (goPos) {
      goPos.addEventListener('click', () => {
        import('./utils/helpers').then(({ playSound }) => playSound(800, 80));
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

// Boot the app only once
if (typeof window !== 'undefined') {
  if (!window.__app_instance__) {
    window.__app_instance__ = new App();
    window.__app_instance__.init();
  }
}
