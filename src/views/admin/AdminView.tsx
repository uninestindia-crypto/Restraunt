// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { db } from '../../db/database';
import { formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers';
import { authService } from '../../services/auth';
import { globalStore } from '../../store/Store';

// Views
import { Dashboard, useGlobalStore } from './Dashboard';
import { MenuManager } from './MenuManager';
import { OrderHistoryComponent } from './OrderHistory';
import { SettingsView } from './Settings';
import { BrandingView } from './BrandingView';
import { AnalyticsView } from './AnalyticsView';

/**
 * StaffManager - Decoupled React component replacing direct DOM queries of legacy view.
 */
function StaffManager() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);

  const ROLES = {
    owner: { label: 'Owner', color: 'var(--color-primary-on-surface)', icon: 'shield_person' },
    manager: { label: 'Manager', color: 'var(--nextgenos-purple-on-surface)', icon: 'manage_accounts' },
    cashier: { label: 'Cashier', color: 'var(--color-success-on-surface)', icon: 'point_of_sale' },
    kitchen: { label: 'Kitchen', color: '#F59E0B', icon: 'restaurant' },
    waiter: { label: 'Waiter', color: 'var(--color-info)', icon: 'room_service' },
    delivery: { label: 'Delivery', color: '#06B6D4', icon: 'delivery_dining' },
  };

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

  const fetchStaff = async () => {
    const list = await db.staff.toArray();
    setStaffList(list);
    setOwners(list.filter((s: any) => s.role === 'owner' && (s.isActive === true || s.isActive === 1)));
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleRoleChange = async (staffId: number, newRole: string, currentRole: string, name: string) => {
    if (currentRole === newRole) return;

    if (currentRole === 'owner' && newRole !== 'owner') {
      if (owners.length <= 1) {
        showToast('Cannot demote the last active owner', 'error');
        fetchStaff();
        return;
      }
    }

    await db.staff.update(staffId, { role: newRole, isSynced: 0 });

    playSound(900, 100);
    vibrateDevice([40]);
    showToast(`${name} → ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}`, 'success');
    fetchStaff();
  };

  const handleToggleActive = async (staffId: number, isActive: boolean) => {
    await db.staff.update(staffId, { isActive: isActive ? 0 : 1, isSynced: 0 });
    playSound(700, 80);
    showToast(isActive ? 'Staff deactivated' : 'Staff activated', 'info');
    fetchStaff();
  };

  const handleDelete = async (staffId: number, name: string) => {
    if (confirm(`Remove ${name}?`)) {
      await db.staff.delete(staffId);
      playSound(900, 100);
      showToast('Staff member removed', 'success');
      fetchStaff();
    }
  };

  return (
    <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '24px', color: 'var(--color-primary)', filter: 'drop-shadow(0 0 8px var(--color-primary))' }}>groups</span>
          Staff & Role Management
        </div>
      </div>

      {/* Staff Cards Grid */}
      <div className="content-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {staffList.map((s) => {
          const role = ROLES[s.role] || ROLES.cashier;
          const isDeletable = !(s.role === 'owner' && owners.length <= 1);
          return (
            <div key={s.id} className="premium-card" style={{
              position: 'relative',
              display: 'flex',
              gap: '16px',
              padding: '20px',
              alignItems: 'center',
              background: 'var(--glass-bg)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.25s ease'
            }}>
              <div style={{
                background: `${role.color}15`,
                color: role.color,
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.2rem',
                flexShrink: 0,
                border: `1px solid ${role.color}33`,
                boxShadow: `0 0 10px ${role.color}18`
              }}>
                {(s.name || '?')[0].toUpperCase()}
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || 'Unknown'}</span>
                  <span style={{
                    fontSize: '10px',
                    color: s.isActive ? 'var(--color-success)' : 'var(--color-danger)',
                    background: s.isActive ? 'rgba(var(--color-success-rgb), 0.08)' : 'rgba(var(--color-danger-rgb), 0.08)',
                    border: `1px solid ${s.isActive ? 'rgba(var(--color-success-rgb),0.2)' : 'rgba(var(--color-danger-rgb),0.2)'}`,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 700
                  }}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                {/* Inline Role Selector & Actions */}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    className="input"
                    value={s.role}
                    onChange={(e) => handleRoleChange(s.id, e.target.value, s.role, s.name)}
                    style={{
                      fontSize: 'var(--text-xs)',
                      padding: '4px 10px',
                      height: '30px',
                      minHeight: '30px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      flex: 1,
                      color: role.color,
                      borderColor: `${role.color}33`,
                      background: 'var(--bg-secondary)'
                    }}
                  >
                    {Object.entries(ROLES).map(([key, r]) => (
                      <option key={key} value={key} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{r.label}</option>
                    ))}
                  </select>
                  
                  <button
                    onClick={() => handleToggleActive(s.id, s.isActive)}
                    title={s.isActive ? 'Deactivate Member' : 'Activate Member'}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-glass)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: s.isActive ? 'var(--color-warning)' : 'var(--color-success)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>{s.isActive ? 'person_off' : 'person'}</span>
                  </button>
                  
                  {isDeletable && (
                    <button
                      onClick={() => handleDelete(s.id, s.name)}
                      title="Remove Staff"
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '6px',
                        background: 'rgba(var(--color-danger-rgb), 0.05)',
                        border: '1px solid rgba(var(--color-danger-rgb), 0.15)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-danger)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>delete</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Access Matrix */}
      <div className="card" style={{ padding: '24px', background: 'var(--glass-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflowX: 'auto' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '18px', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '20px', color: 'var(--color-info)' }}>security</span>
          Role Access Matrix
        </div>
        <table style={{ width: '100%', fontSize: 'var(--text-xs)', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 700, borderBottom: '2.5px solid var(--border-active)' }}>Module</th>
              {Object.keys(ROLES).map((r) => (
                <th key={r} style={{ textAlign: 'center', padding: '12px 8px', color: ROLES[r].color, fontWeight: 700, borderBottom: '2.5px solid var(--border-active)' }}>
                  {ROLES[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.name} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>{route.name}</td>
                {Object.keys(ROLES).map((r) => (
                  <td key={r} style={{ textAlign: 'center', padding: '10px 8px' }}>
                    {route.roles.includes(r) ? (
                      <span style={{
                        color: 'var(--color-success-on-surface)',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        filter: 'drop-shadow(0 0 4px rgba(var(--color-success-rgb),0.35))'
                      }}>✓</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', opacity: 0.25 }}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * AdminConsoleShell - Main UI container managing auth and tabs.
 */
function AdminConsoleShell({ app }) {
  const storeState = useGlobalStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState(localStorage.getItem('app_theme') || 'system');

  const currentStaff = authService.getCurrentStaff();
  const isAuthorizedStaff = currentStaff && ['owner', 'manager'].includes(currentStaff.role?.toLowerCase());

  // Sync state to body element or layout
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleLogout = () => {
    playSound(600, 100);
    authService.logout();
    if (app.inactivityTimeout) {
      clearTimeout(app.inactivityTimeout);
      app.inactivityTimeout = null;
    }
    setActiveTab('dashboard');
    if (app.router && app.router.currentView && typeof app.router.currentView.unmount === 'function') {
      app.router.currentView.unmount();
    }
    app.initialized = false;
    app.showLogin();
    showToast('Terminal locked', 'info');
  };

  const handleThemeChange = (newTheme: string) => {
    playSound(700, 60);
    setTheme(newTheme);
    localStorage.setItem('app_theme', newTheme);
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: newTheme } }));
    showToast(`Theme: ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)}`, 'info');
  };

  if (!isAuthorizedStaff) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: '70vh', padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, textAlign: 'center', padding: 40 }}>
          <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 42, color: 'var(--color-danger)' }}>shield_lock</span>
          <h2 style={{ margin: '16px 0 8px' }}>Cloud authorization required</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            The administrative console is available only to signed-in owners and managers with an active staff membership.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => app.showLogin()} style={{ marginTop: 20 }}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const activeStaff = storeState.activeTerminalStaff;

  return (
    <div className="main-area" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'radial-gradient(circle at bottom left, rgba(var(--color-primary-rgb), 0.04) 0%, transparent 60%)' }}>
      
      {/* Header Tabs */}
      <div className="header-bar" style={{
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        
        <div className="tab-container scrollbar-none" style={{
          padding: 0,
          borderBottom: 'none',
          overflowX: 'auto',
          flex: 1,
          marginRight: '12px',
          display: 'flex',
          gap: '10px'
        }}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
            { id: 'analytics', label: 'Analytics', icon: 'analytics' },
            { id: 'menu', label: 'Menu CRUD', icon: 'edit_document' },
            { id: 'orders', label: 'Order Log', icon: 'history' },
            { id: 'branding', label: 'Branding', icon: 'palette' },
            { id: 'staff', label: 'Staff', icon: 'groups' },
            { id: 'settings', label: 'Settings', icon: 'settings' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  playSound(700, 80);
                  setActiveTab(tab.id);
                }}
                className={`tab admin-tab ${isActive ? 'active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: isActive ? 'var(--gradient-primary)' : 'var(--bg-surface)',
                  color: isActive ? '#ffffff' : 'var(--text-primary)',
                  border: isActive ? '1px solid transparent' : '1px solid var(--border-color)',
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  transition: 'all 0.2s ease',
                  boxShadow: isActive ? 'var(--shadow-primary)' : 'var(--shadow-sm)',
                  transform: isActive ? 'scale(1.02)' : 'none',
                }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: '18px', marginRight: '6px', color: isActive ? '#ffffff' : 'var(--text-secondary)' }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <button onClick={handleLogout} className="btn" style={{
            background: 'rgba(var(--color-danger-rgb), 0.08)',
            border: '1px solid rgba(var(--color-danger-rgb), 0.2)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-danger)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 700,
            fontSize: 'var(--text-xs)',
            padding: '10px 16px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-danger)';
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(var(--color-danger-rgb), 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(var(--color-danger-rgb), 0.08)';
            e.currentTarget.style.color = 'var(--color-danger)';
            e.currentTarget.style.borderColor = 'rgba(var(--color-danger-rgb), 0.2)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>lock</span>
            Lock Terminal
          </button>
        </div>
      </div>

      {/* Viewport Area */}
      <div id="admin-viewport" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'menu' && <MenuManager />}
        {activeTab === 'orders' && <OrderHistoryComponent />}
        {activeTab === 'branding' && <BrandingView />}
        {activeTab === 'staff' && <StaffManager />}
        {activeTab === 'settings' && <SettingsView />}
      </div>
    </div>
  );
}

/**
 * AdminView Export class matching SPA entry signature.
 */
export class AdminView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.root = null;
  }

  async mount(container) {
    this.container = container;
    this.root = createRoot(container);
    this.root.render(<AdminConsoleShell app={this.app} />);
  }

  unmount() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.container = null;
  }
}
