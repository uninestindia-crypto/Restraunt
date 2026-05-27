/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Sidebar Navigation
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { authService } from '../services/auth.js';

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { hash: '#/pos', icon: 'point_of_sale', label: 'POS', roles: ['owner', 'manager', 'cashier', 'waiter'] },
      { hash: '#/kitchen', icon: 'restaurant', label: 'Kitchen', roles: ['owner', 'manager', 'cashier', 'kitchen'] },
      { hash: '#/tables', icon: 'table_bar', label: 'Tables', roles: ['owner', 'manager', 'cashier', 'waiter', 'kitchen'] },
      { hash: '#/channels', icon: 'hub', label: 'Channels', roles: ['owner', 'manager', 'cashier'] },
    ],
  },
  {
    label: 'Business',
    items: [
      { hash: '#/analytics', icon: 'analytics', label: 'Analytics', roles: ['owner', 'manager'] },
      { hash: '#/inventory', icon: 'inventory_2', label: 'Inventory', roles: ['owner', 'manager'] },
      { hash: '#/customers', icon: 'loyalty', label: 'Customers', roles: ['owner', 'manager', 'cashier', 'waiter'] },
      { hash: '#/staff', icon: 'groups', label: 'Staff', roles: ['owner', 'manager'] },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { hash: '#/ai', icon: 'smart_toy', label: 'AI Center', roles: ['owner', 'manager', 'cashier'] },
    ],
  },
  {
    label: 'System',
    items: [
      { hash: '#/orders', icon: 'receipt_long', label: 'Orders', roles: ['owner', 'manager', 'cashier', 'delivery'] },
      { hash: '#/admin', icon: 'admin_panel_settings', label: 'Admin', roles: ['owner', 'manager'] },
      { hash: '#/help', icon: 'help', label: 'Help Center', roles: ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'delivery'] },
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
        return !item.roles || item.roles.includes(staffRole);
      });

      // Hide group if no items are visible
      if (visibleItems.length === 0) return '';

      return `
        <div class="sidebar-group">
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
        <img src="/assets/aether-icon.png" class="sidebar-logo-img" alt="Logo" style="width:28px;height:28px;border-radius:6px;object-fit:contain;margin-right:2px;border:1px solid var(--border-active);box-shadow:var(--shadow-glow-active);" />
        <span class="sidebar-brand">The Taste</span>
        <span class="sidebar-version">v2.0</span>
      </div>

      <nav class="sidebar-nav">
        ${groupsHTML}
      </nav>

      <div class="sidebar-footer">
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
  }

  setActive(hash) {
    this.activeHash = hash;
    if (!this.container) return;

    this.container.querySelectorAll('.sidebar-item').forEach(item => {
      const isActive = item.dataset.route === hash;
      item.classList.toggle('active', isActive);
    });
  }

  toggleMobile(show) {
    if (!this.container) return;
    const sidebar = this.container.closest('.sidebar');
    if (sidebar) {
      sidebar.classList.toggle('mobile-open', show);
    }
  }
}
