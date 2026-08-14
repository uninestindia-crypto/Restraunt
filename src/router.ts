/**
 * Simple hash-based SPA router with Role-Based Access Control (RBAC)
 */

import { checkForUpdateAndGate } from './utils/watermark';

export class Router {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare container: any;
  declare currentHash: any;
  declare currentView: any;
  declare onAuthRequired: any;
  declare onNavigate: any;
  declare routes: any;

  /**
   * The screen a role starts on.
   *
   * Every role except cashier, manager and owner works somewhere other than
   * #/pos, which is the app's default route — so without this they signed in,
   * were bounced off the default, and only then found their way home.
   */
  static homeRouteFor(role) {
    switch (String(role || '').toLowerCase()) {
      case 'developer': return '#/developer';
      case 'kitchen': return '#/kitchen';
      case 'waiter': return '#/tables';
      case 'delivery': return '#/orders';
      case 'temporary_staff': return '#/pos-kitchen';
      case 'customer': return '#/self-order';
      case 'owner':
      case 'manager':
      case 'cashier': return '#/pos';
      default: return '#/self-order';
    }
  }

  constructor() {
    this.routes = {};
    this.currentView = null;
    this.currentHash = '';
    this.container = null;
    this.onNavigate = null;
    this.onAuthRequired = null;

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  /**
   * Register a route
   * @param {string} hash - Route hash (e.g. '#/pos')
   * @param {Function} viewFactory - Async factory function that returns a view instance
   * @param {Array<string>} [allowedRoles] - Optional roles allowed to access this route
   */
  register(hash, viewFactory, allowedRoles = null) {
    const portal = process.env.NEXT_PUBLIC_APP_PORTAL || 'all';
    if (portal === 'customer' && hash !== '#/self-order') {
      return this;
    }
    if (portal === 'pos' && hash === '#/self-order') {
      return this;
    }
    this.routes[hash] = { viewFactory, allowedRoles };
    return this;
  }

  /**
   * Set the container element for views
   */
  setContainer(container) {
    this.container = container;
    return this;
  }

  /**
   * Navigate to a route
   */
  navigate(hash) {
    window.location.hash = hash;
  }

  /**
   * Handle route change
   */
  async handleRoute() {
    // Auto-routing based on query parameter (to bypass native WebView hash stripping)
    const urlParams = new URLSearchParams(window.location.search);
    const queryPortal = urlParams.get('portal');
    if (queryPortal && !window.location.hash) {
      if (queryPortal === 'pos') {
        window.location.hash = '#/pos';
        return;
      } else if (queryPortal === 'customer') {
        window.location.hash = '#/self-order';
        return;
      }
    }

    // Trigger non-blocking version check in background on route change
    checkForUpdateAndGate().catch(err => console.debug('[Router] Version check error:', err));

    const portal = process.env.NEXT_PUBLIC_APP_PORTAL || 'all';
    const defaultFallback = portal === 'pos' ? '#/pos' : '#/self-order';
    const fullHash = window.location.hash || defaultFallback;
    const path = fullHash.split('?')[0];

    // Don't re-render same view
    if (fullHash === this.currentHash && this.currentView) return;

    // Check if route exists
    const routeConfig = this.routes[path];
    if (!routeConfig) {
      this.navigate(defaultFallback);
      return;
    }

    const { viewFactory, allowedRoles } = routeConfig;

    // Kiosk view (#/self-order) is public, all other routes require authentication
    const isPublic = path === '#/self-order';

    let authService = null;
    if (!isPublic) {
      ({ authService } = await import('./services/auth'));
    }

    if (!isPublic && !authService.requireAuth()) {
      console.warn(`[Router] Access to protected route "${path}" blocked: User is not authenticated.`);
      
      // Clear container and show login
      if (this.onAuthRequired) {
        this.onAuthRequired();
      }
      return;
    }

    // Role-based authorization check
    if (!isPublic && allowedRoles) {
      const currentStaff = authService.getCurrentStaff();
      const staffRole = currentStaff?.role?.toLowerCase();
      if (!staffRole || !allowedRoles.includes(staffRole)) {
        console.warn(`[Router] Access to "${path}" denied for role "${staffRole}". Required: [${allowedRoles.join(', ')}]`);

        const home = Router.homeRouteFor(staffRole);

        // Landing on the app's default route is not an attempt to break in.
        // Every role that does not start on #/pos was being met with "Access
        // denied: Insufficient permissions" the moment they signed in, which is
        // what made every role except cashier look broken. Only a deliberate
        // navigation to a forbidden page is worth an error.
        if (!this.currentHash) {
          this.navigate(home);
          return;
        }

        const { showToast } = await import('./utils/helpers');
        showToast('Access denied: Insufficient permissions', 'error');
        this.navigate(home);
        return;
      }

      // Explicit administrative access check for Express Panel
      if (path === '#/pos-kitchen') {
        const isOwnerOrDev = staffRole === 'owner' || staffRole === 'developer';
        // The express-only role exists to use this screen; requiring the
        // allow-express flag on top of it bounced those accounts straight back
        // out to the customer storefront.
        const isExpressOnly = staffRole === 'temporary_staff';
        const hasExpressAccess = currentStaff?.allowExpress === 1 || currentStaff?.allowExpress === true;
        if (!isOwnerOrDev && !isExpressOnly && !hasExpressAccess) {
          console.warn(`[Router] Access to "#/pos-kitchen" denied: Express Panel permission not granted for "${currentStaff?.name}".`);
          const { showToast } = await import('./utils/helpers');
          showToast('Access denied: Express Panel permission not granted by administrator', 'error');
          this.navigate('#/pos');
          return;
        }
      }
    }

    // Unmount current view
    if (this.currentView && typeof this.currentView.unmount === 'function') {
      this.currentView.unmount();
    }

    // Clear container with transition
    if (this.container) {
      this.container.classList.remove('view-enter');
      this.container.innerHTML = '';

      // Small delay for transition
      requestAnimationFrame(() => {
        if (this.container) this.container.classList.add('view-enter');
      });
    }

    this.currentHash = fullHash;

    try {
      // Create and mount new view
      this.currentView = await viewFactory();
      if (this.container && typeof this.currentView.mount === 'function') {
        await this.currentView.mount(this.container);
      }
    } catch (error) {
      console.error('Failed to mount view:', error);
      if (this.container) {
        this.container.innerHTML = `
          <div class="empty-state" style="height: 80vh;">
            <span class="material-symbols-rounded">error</span>
            <p>This screen could not finish loading. Nothing you had open was lost.</p>
            <button class="btn btn-primary" id="route-error-home" style="margin-top: 16px;">
              Go to POS
            </button>
          </div>
        `;
        this.container.querySelector('#route-error-home')?.addEventListener('click', () => {
          window.location.hash = '#/pos';
        });
      }
    }

    // Notify navigation listeners with path
    if (this.onNavigate) {
      this.onNavigate(path);
    }
  }

  /**
   * Get current route hash
   */
  getCurrentRoute() {
    const hash = window.location.hash || '#/self-order';
    return hash.split('?')[0];
  }

  /**
   * Start the router (initial route)
   */
  start() {
    this.handleRoute();
  }
}

export const router = new Router();
