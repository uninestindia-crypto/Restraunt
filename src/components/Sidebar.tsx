// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Sidebar Navigation
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { authService } from '../services/auth';

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { hash: '#/pos', icon: 'point_of_sale', label: 'POS', roles: ['developer', 'owner', 'manager', 'cashier', 'waiter'] },
      { hash: '#/pos-kitchen', icon: 'bolt', label: 'Express Panel', roles: ['developer', 'owner', 'manager', 'cashier', 'waiter', 'kitchen'] },
      { hash: '#/kitchen', icon: 'restaurant', label: 'Kitchen', roles: ['developer', 'owner', 'manager', 'cashier', 'kitchen'] },
      { hash: '#/tables', icon: 'table_bar', label: 'Tables', roles: ['developer', 'owner', 'manager', 'cashier', 'waiter', 'kitchen'] },
      { hash: '#/channels', icon: 'hub', label: 'Channels', roles: ['developer', 'owner', 'manager', 'cashier'] },
    ],
  },
  {
    label: 'Business',
    items: [
      { hash: '#/analytics', icon: 'analytics', label: 'Analytics', roles: ['developer', 'owner', 'manager'] },
      { hash: '#/inventory', icon: 'inventory_2', label: 'Inventory', roles: ['developer', 'owner', 'manager'] },
      { hash: '#/customers', icon: 'loyalty', label: 'Customers', roles: ['developer', 'owner', 'manager', 'cashier', 'waiter'] },
      { hash: '#/staff', icon: 'groups', label: 'Staff', roles: ['developer', 'owner', 'manager'] },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { hash: '#/ai', icon: 'smart_toy', label: 'AI Center', roles: ['developer', 'owner', 'manager', 'cashier'] },
    ],
  },
  {
    label: 'System',
    items: [
      { hash: '#/orders', icon: 'receipt_long', label: 'Orders', roles: ['developer', 'owner', 'manager', 'cashier', 'delivery'] },
      { hash: '#/admin', icon: 'admin_panel_settings', label: 'Admin', roles: ['developer', 'owner', 'manager'] },
      { hash: '#/help', icon: 'help', label: 'Help Center', roles: ['developer', 'owner', 'manager', 'cashier', 'waiter', 'kitchen', 'delivery'] },
    ],
  },
  {
    label: 'Developer',
    items: [
      { hash: '#/developer', icon: 'terminal', label: 'Dev Console', roles: ['developer'] },
    ],
  },
];

export class Sidebar {
  constructor() {
    this.container = null;
    this.activeHash = window.location.hash || '#/pos';
  }

  render(container) {
    this.container = container;
    const currentStaff = authService.getCurrentStaff();
    const staffRole = currentStaff?.role?.toLowerCase() || '';

    const groupsHTML = NAV_GROUPS.map(group => {
      // Filter items that this role can view
      const visibleItems = group.items.filter(item => {
        const hasRole = !item.roles || item.roles.includes(staffRole);
        if (!hasRole) return false;

        // Custom Express Panel permission check
        if (item.hash === '#/pos-kitchen') {
          const isDeveloperOrOwner = staffRole === 'developer' || staffRole === 'owner';
          const hasExpressAccess = currentStaff?.allowExpress === 1 || currentStaff?.allowExpress === true;
          return isDeveloperOrOwner || hasExpressAccess;
        }

        return true;
      });

      // Hide group if no items are visible
      if (visibleItems.length === 0) return '';

      // Custom display behavior (e.g., hide Operations group when viewing the Developer Console)
      const isDevConsole = this.activeHash === '#/developer';
      const displayStyle = (group.label === 'Operations' && isDevConsole) ? 'display: none;' : '';

      return `
        <div class="sidebar-group" data-group-label="${group.label}" style="${displayStyle}">
          <div class="sidebar-group-label">${group.label}</div>
          ${visibleItems.map(item => `
            <div class="sidebar-item ${this.activeHash === item.hash ? 'active' : ''}" data-route="${item.hash}" title="${item.label}">
              <span class="material-symbols-rounded sidebar-icon">${item.icon}</span>
              <span class="sidebar-label">${item.label}</span>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="sidebar-header">
        <img src="/assets/the-taste-logo.png" class="sidebar-logo-img" alt="Logo" style="width:28px;height:28px;border-radius:6px;object-fit:contain;margin-right:2px;border:1px solid var(--border-active);box-shadow:var(--shadow-glow-active);" />
        <span class="sidebar-brand">The Taste</span>
        <span class="sidebar-version">v2.0</span>
      </div>

      <nav class="sidebar-nav">
        ${groupsHTML}
      </nav>

      <div class="sidebar-footer">
        <button class="sidebar-theme-toggle" id="sidebar-theme-btn" title="Toggle Theme">
          <span class="material-symbols-rounded" id="sidebar-theme-icon" style="font-size: 16px;">${this._getThemeIcon()}</span>
          <span class="sidebar-theme-label" id="sidebar-theme-label">${this._getThemeLabel()}</span>
        </button>
        <div class="nextgenos-attr">
          <span class="ng-diamond">◆</span>
          <span class="ng-text-small">Powered by</span>
          <span class="ng-text-brand">NextGenOS</span>
        </div>
      </div>
    `;

    // Bind click events
    container.querySelectorAll('.sidebar-item[data-route]').forEach(item => {
      item.addEventListener('click', () => {
        const hash = item.dataset.route;
        window.location.hash = hash;
      });
    });

    // Bind theme toggle
    const themeBtn = container.querySelector('#sidebar-theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = localStorage.getItem('app_theme') || 'system';
        const cycle = { dark: 'light', light: 'system', system: 'dark' };
        const next = cycle[current] || 'system';
        // Use App.setTheme if available, otherwise manual
        localStorage.setItem('app_theme', next);
        document.documentElement.setAttribute('data-theme', next);
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: next } }));
        this._updateThemeUI();
        // Update header toggle icon too
        const headerIcon = document.getElementById('theme-toggle-icon');
        if (headerIcon) {
          const resolved = next === 'system'
            ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
            : next;
          headerIcon.textContent = resolved === 'dark' ? 'light_mode' : 'dark_mode';
        }
      });
    }

    // Listen for external theme changes
    window.addEventListener('theme-changed', () => this._updateThemeUI());
  }

  _getThemeIcon() {
    const theme = localStorage.getItem('app_theme') || 'system';
    const icons = { dark: 'dark_mode', light: 'light_mode', system: 'computer' };
    return icons[theme] || 'computer';
  }

  _getThemeLabel() {
    const theme = localStorage.getItem('app_theme') || 'system';
    const labels = { dark: 'Dark', light: 'Light', system: 'System' };
    return labels[theme] || 'System';
  }

  _updateThemeUI() {
    const icon = this.container?.querySelector('#sidebar-theme-icon');
    const label = this.container?.querySelector('#sidebar-theme-label');
    if (icon) icon.textContent = this._getThemeIcon();
    if (label) label.textContent = this._getThemeLabel();
  }

  setActive(hash) {
    this.activeHash = hash;
    if (!this.container) return;

    this.container.querySelectorAll('.sidebar-item').forEach(item => {
      const isActive = item.dataset.route === hash;
      item.classList.toggle('active', isActive);
    });

    // Hide/show Operations group based on whether we are on the developer console
    const operationsGroup = this.container.querySelector('.sidebar-group[data-group-label="Operations"]');
    if (operationsGroup) {
      if (hash === '#/developer') {
        operationsGroup.style.display = 'none';
      } else {
        operationsGroup.style.display = '';
      }
    }
  }

  toggleMobile(show) {
    if (!this.container) return;
    const sidebar = this.container.closest('.sidebar');
    if (sidebar) {
      sidebar.classList.toggle('mobile-open', show);
    }
  }
}
