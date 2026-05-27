/**
 * Simple hash-based SPA router with Role-Based Access Control (RBAC)
 */

export class Router {
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
    const fullHash = window.location.hash || '#/self-order';
    const path = fullHash.split('?')[0];

    // Don't re-render same view
    if (fullHash === this.currentHash && this.currentView) return;

    // Check if route exists
    const routeConfig = this.routes[path];
    if (!routeConfig) {
      // Fallback to the public customer ordering entry.
      this.navigate('#/self-order');
      return;
    }

    const { viewFactory, allowedRoles } = routeConfig;

    // Kiosk view (#/self-order) is public, all other routes require authentication
    const isPublic = path === '#/self-order';

    let authService = null;
    if (!isPublic) {
      ({ authService } = await import('./services/auth.js'));
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
        const { showToast } = await import('./utils/helpers.js');
        showToast('Access denied: Insufficient permissions', 'error');
        
        // Redirect to a safe default view based on their role
        if (staffRole === 'kitchen') {
          this.navigate('#/kitchen');
        } else if (staffRole === 'waiter') {
          this.navigate('#/tables');
        } else {
          this.navigate('#/pos');
        }
        return;
      }

      // Explicit administrative access check for Express Panel
      if (path === '#/pos-kitchen') {
        const isOwner = staffRole === 'owner';
        const hasExpressAccess = currentStaff?.allowExpress === 1 || currentStaff?.allowExpress === true;
        if (!isOwner && !hasExpressAccess) {
          console.warn(`[Router] Access to "#/pos-kitchen" denied: Express Panel permission not granted for "${currentStaff?.name}".`);
          const { showToast } = await import('./utils/helpers.js');
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
            <p>Something went wrong loading this page.</p>
            <button class="btn btn-primary" onclick="location.hash='#/pos'" style="margin-top: 16px;">
              Go to POS
            </button>
          </div>
        `;
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
