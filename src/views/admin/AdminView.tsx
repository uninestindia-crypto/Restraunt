// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { db, getSetting } from '../../db/database';
import { formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers';
import { authService, CLOUD_REQUIRED_ROLES } from '../../services/auth';
import { canUnlockAdminPin } from '../../services/authGuards';
import { hashPin } from '../../utils/crypto';
import { globalStore } from '../../store/Store';

// Views
import { Dashboard, useGlobalStore } from './Dashboard';
import { MenuManager } from './MenuManager';
import { OrderHistory } from './OrderHistory';
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
    owner: { label: 'Owner', color: '#FF6B35', icon: 'shield_person' },
    manager: { label: 'Manager', color: '#6C5CE7', icon: 'manage_accounts' },
    cashier: { label: 'Cashier', color: '#10B981', icon: 'point_of_sale' },
    kitchen: { label: 'Kitchen', color: '#F59E0B', icon: 'restaurant' },
    waiter: { label: 'Waiter', color: '#3B82F6', icon: 'room_service' },
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

  const handleRoleChange = async (staffId: number, newRole: string, currentRole: string, name: string, pinHash: string) => {
    if (currentRole === newRole) return;

    if (currentRole === 'owner' && newRole !== 'owner') {
      if (owners.length <= 1) {
        showToast('Cannot demote the last active owner', 'error');
        fetchStaff(); // reset select element visual state
        return;
      }
    }

    await db.staff.update(staffId, { role: newRole, isSynced: 0 });

    if (newRole === 'owner' && pinHash) {
      await db.settings.put({ key: 'adminPinHash', value: pinHash });
    }

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
    <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '22px', verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }}>groups</span>
          Staff & Role Management
        </div>
      </div>

      {/* Staff Cards Grid */}
      <div className="content-grid">
        {staffList.map((s) => {
          const role = ROLES[s.role] || ROLES.cashier;
          const isDeletable = !(s.role === 'owner' && owners.length <= 1);
          return (
            <div key={s.id} className="premium-card" style={{ position: 'relative', display: 'flex', gap: '16px', padding: '16px', alignItems: 'center' }}>
              <div className="premium-card-avatar" style={{
                background: `rgba(${s.role === 'owner' ? '255,107,53' : '108,92,231'}, 0.1)`,
                color: role.color,
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1rem',
                flexShrink: 0
              }}>
                {(s.name || '?')[0].toUpperCase()}
              </div>
              <div className="premium-card-body" style={{ flex: 1, minWidth: 0 }}>
                <span className="premium-card-title" style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name || 'Unknown'}</span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.55rem', color: s.isActive ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>
                    {s.isActive ? '● Active' : '● Inactive'}
                  </span>
                </div>
                {/* Inline Role Selector */}
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select
                    className="input staff-role-select"
                    value={s.role}
                    onChange={(e) => handleRoleChange(s.id, e.target.value, s.role, s.name, s.pinHash)}
                    style={{
                      fontSize: '0.65rem',
                      padding: '4px 8px',
                      height: '28px',
                      minHeight: '28px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      maxWidth: '130px',
                      color: role.color,
                      borderColor: `${role.color}33`,
                      background: 'var(--bg-input)'
                    }}
                  >
                    {Object.entries(ROLES).map(([key, r]) => (
                      <option key={key} value={key} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    className="btn-icon staff-toggle-active-btn"
                    onClick={() => handleToggleActive(s.id, s.isActive)}
                    title={s.isActive ? 'Deactivate' : 'Activate'}
                    style={{ color: s.isActive ? 'var(--color-warning)' : 'var(--color-success)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>{s.isActive ? 'person_off' : 'person'}</span>
                  </button>
                  {isDeletable && (
                    <button
                      className="btn-icon staff-delete-btn"
                      onClick={() => handleDelete(s.id, s.name)}
                      style={{ color: 'var(--color-danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      title="Remove"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>delete</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Access Matrix */}
      <div className="card" style={{ overflowX: 'auto', padding: '20px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '18px', color: 'var(--color-info)' }}>security</span>
          Role Access Matrix
        </div>
        <table style={{ width: '100%', fontSize: '0.65rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)', fontWeight: 700, borderBottom: '1px solid var(--border-glass)' }}>Module</th>
              {Object.keys(ROLES).map((r) => (
                <th key={r} style={{ textAlign: 'center', padding: '8px', color: ROLES[r].color, fontWeight: 700, borderBottom: '1px solid var(--border-glass)' }}>
                  {ROLES[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.name}>
                <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-glass)' }}>{route.name}</td>
                {Object.keys(ROLES).map((r) => (
                  <td key={r} style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid var(--border-glass)' }}>
                    {route.roles.includes(r) ? (
                      <span style={{ color: 'var(--color-success)', fontSize: '14px', fontWeight: 'bold' }}>✓</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>—</span>
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState(localStorage.getItem('app_theme') || 'system');

  const currentStaff = authService.getCurrentStaff();
  const isAuthorizedStaff = currentStaff && ['owner', 'manager'].includes(currentStaff.role?.toLowerCase());

  // Direct access if already logged in with valid session
  useEffect(() => {
    if (isAuthorizedStaff) {
      setIsAuthenticated(true);
    }
  }, [isAuthorizedStaff]);

  // Sync state to body element or layout
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle PIN validation
  const handlePinKey = (val: string) => {
    playSound(700, 80);
    vibrateDevice([20]);

    if (val === 'clear') {
      setPinInput('');
    } else if (val === 'backspace') {
      setPinInput((prev) => prev.slice(0, -1));
    } else {
      if (pinInput.length < 4) {
        const nextInput = pinInput + val;
        setPinInput(nextInput);
        if (nextInput.length === 4) {
          setTimeout(() => verifyPin(nextInput), 250);
        }
      }
    }
  };

  const verifyPin = async (input: string) => {
    try {
      const configuredHash = await getSetting('adminPinHash');
      const legacyPin = await getSetting('adminPin');
      const inputHash = await hashPin(input);
      const staff = await authService.getStaffByPin(input);

      const allowManagerAdminVal = await getSetting('allowManagerAdmin');
      const allowManager = allowManagerAdminVal === 'true' || allowManagerAdminVal === true || allowManagerAdminVal === undefined || allowManagerAdminVal === '';

      const canUnlock = canUnlockAdminPin({
        staff,
        inputHash,
        configuredHash,
        legacyPin,
        inputPin: input,
        allowManager,
      });

      if (canUnlock) {
        let staffToVerify = staff;
        if (!staffToVerify && (inputHash === configuredHash || (legacyPin && input === legacyPin))) {
          staffToVerify = await db.staff.where('role').equals('owner').first();
        }

        if (staffToVerify && CLOUD_REQUIRED_ROLES.includes(staffToVerify.role?.toLowerCase())) {
          if (localStorage.getItem(`pin_authorized_${staffToVerify.id}`) !== 'true') {
            playSound(300, 200, 'square');
            vibrateDevice([150]);
            showToast('Device not authorized for PIN unlock. Please log in with cloud credentials first.', 'error');
            setPinInput('');
            return;
          }
        }

        setIsAuthenticated(true);
        playSound(800, 100);
        setTimeout(() => playSound(1200, 120), 100);
        vibrateDevice([40, 20, 40]);
        showToast('Authorized!', 'success');
      } else {
        playSound(300, 200, 'square');
        vibrateDevice([150]);
        showToast('Invalid PIN code', 'error');
        setPinInput('');
      }
    } catch (err) {
      console.error('Failed to verify PIN:', err);
      setPinInput('');
    }
  };

  const handleLogout = () => {
    playSound(600, 100);
    authService.logout();
    if (app.inactivityTimeout) {
      clearTimeout(app.inactivityTimeout);
      app.inactivityTimeout = null;
    }
    setIsAuthenticated(false);
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

  if (!isAuthenticated) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', maxWidth: '380px', margin: '0 auto', padding: '20px' }}>
        <div className="card" style={{ width: '100%', textAlign: 'center', padding: '40px 32px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(255, 94, 54, 0.08)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            border: '1px solid rgba(255, 94, 54, 0.2)',
            boxShadow: '0 0 20px rgba(255, 94, 54, 0.2)',
          }}>
            <span className="material-symbols-rounded" style={{ fontSize: '28px', color: 'var(--color-primary)', filter: 'drop-shadow(0 0 6px var(--color-primary))' }}>lock</span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '-0.02em' }}>Terminal Access</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: '28px', fontWeight: 500 }}>Enter your 4-digit master PIN code to unlock console</p>

          {/* PIN Dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '36px' }}>
            {[0, 1, 2, 3].map((idx) => {
              const active = idx < pinInput.length;
              return (
                <span
                  key={idx}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    border: `2px solid ${active ? 'var(--color-primary)' : 'rgba(255,255,255,0.15)'}`,
                    background: active ? 'var(--color-primary)' : 'transparent',
                    transform: active ? 'scale(1.2)' : 'scale(1)',
                    boxShadow: active ? '0 0 10px rgba(255, 94, 54, 0.6)' : 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                />
              );
            })}
          </div>

          {/* Numpad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((val) => (
              <button key={val} className="btn btn-secondary num-key" onClick={() => handlePinKey(val)} style={{ height: '52px' }}>{val}</button>
            ))}
            <button className="btn btn-danger num-key" onClick={() => handlePinKey('clear')} style={{ height: '52px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#FF4D4D' }}>C</button>
            <button className="btn btn-secondary num-key" onClick={() => handlePinKey('0')} style={{ height: '52px' }}>0</button>
            <button className="btn btn-secondary num-key" onClick={() => handlePinKey('backspace')} style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>backspace</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeStaff = storeState.activeTerminalStaff;

  return (
    <div className="main-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header Tabs */}
      <div className="header-bar" style={{ padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div className="tab-container scrollbar-none" style={{ padding: 0, borderBottom: 'none', overflowX: 'auto', flex: 1, marginRight: '12px', display: 'flex', gap: '4px' }}>
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
                  background: isActive ? 'var(--glass-bg-hover)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: '18px', marginRight: '4px' }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Theme Segmented Control */}
          <div className="admin-theme-switcher" style={{ display: 'flex', gap: '2px', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', padding: '3px', border: '1px solid var(--border-glass)' }}>
            {[
              { id: 'dark', icon: 'dark_mode', title: 'Dark Theme' },
              { id: 'light', icon: 'light_mode', title: 'Light Theme' },
              { id: 'system', icon: 'computer', title: 'System Theme' },
            ].map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleThemeChange(t.id)}
                  title={t.title}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: active ? 'var(--color-primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>{t.icon}</span>
                </button>
              );
            })}
          </div>

          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, marginRight: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '14px', color: 'var(--color-success)', filter: 'drop-shadow(0 0 4px rgba(16,185,129,0.4))' }}>check_circle</span>
            <span>{activeStaff ? activeStaff.name : 'Unknown Staff'}</span>
          </span>

          <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ background: 'rgba(239, 68, 68, 0.04)', borderColor: 'rgba(239, 68, 68, 0.15)', color: '#FF4D4D', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
        {activeTab === 'orders' && <OrderHistory />}
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
