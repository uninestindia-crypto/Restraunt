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
    owner: { label: 'Owner', color: '#FF5E36', icon: 'shield_person' },
    manager: { label: 'Manager', color: '#8B5CF6', icon: 'manage_accounts' },
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
        fetchStaff();
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
                    background: s.isActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${s.isActive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
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
                    onChange={(e) => handleRoleChange(s.id, e.target.value, s.role, s.name, s.pinHash)}
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
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.15)',
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
                        color: 'var(--color-success)',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        filter: 'drop-shadow(0 0 4px rgba(16,185,129,0.35))'
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', maxWidth: '420px', margin: '0 auto', padding: '20px' }}>
        <style>{`
          @keyframes shield-pulse {
            0% { box-shadow: 0 0 10px rgba(255, 94, 54, 0.1); }
            50% { box-shadow: 0 0 25px rgba(255, 94, 54, 0.4); }
            100% { box-shadow: 0 0 10px rgba(255, 94, 54, 0.1); }
          }
          .num-key {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            font-size: 1.25rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: var(--shadow-sm);
          }
          .num-key:hover {
            background: var(--bg-card-hover);
            border-color: var(--border-active);
            transform: scale(1.03);
          }
          .num-key:active {
            background: var(--border-color);
            transform: scale(0.96);
          }
          .pin-dot {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }
        `}</style>
        
        <div className="card" style={{
          width: '100%',
          textAlign: 'center',
          padding: '40px 32px',
          background: 'var(--glass-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          backdropFilter: 'blur(30px)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'rgba(255, 94, 54, 0.06)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
            border: '1px solid rgba(255, 94, 54, 0.25)',
            animation: 'shield-pulse 3s infinite',
          }}>
            <span className="material-symbols-rounded" style={{ fontSize: '32px', color: 'var(--color-primary)', filter: 'drop-shadow(0 0 6px var(--color-primary))' }}>shield</span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.02em' }}>Terminal Lock</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: '32px', fontWeight: 500, lineHeight: 1.4 }}>Enter your 4-digit security PIN to unlock the administrative console</p>

          {/* PIN Dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '40px' }}>
            {[0, 1, 2, 3].map((idx) => {
              const active = idx < pinInput.length;
              return (
                <span
                  key={idx}
                  className="pin-dot"
                  style={{
                    border: `2px solid ${active ? 'var(--color-primary)' : 'rgba(255,255,255,0.15)'}`,
                    background: active ? 'var(--color-primary)' : 'transparent',
                    transform: active ? 'scale(1.25)' : 'scale(1)',
                    boxShadow: active ? '0 0 12px rgba(255, 94, 54, 0.6)' : 'none',
                  }}
                />
              );
            })}
          </div>

          {/* Numpad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((val) => (
              <button key={val} className="num-key" onClick={() => handlePinKey(val)} style={{ height: '54px' }}>{val}</button>
            ))}
            <button className="num-key" onClick={() => handlePinKey('clear')} style={{ height: '54px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--color-danger)' }}>C</button>
            <button className="num-key" onClick={() => handlePinKey('0')} style={{ height: '54px' }}>0</button>
            <button className="num-key" onClick={() => handlePinKey('backspace')} style={{ height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '20px', color: 'var(--text-secondary)' }}>backspace</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeStaff = storeState.activeTerminalStaff;

  return (
    <div className="main-area" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'radial-gradient(circle at bottom left, rgba(255, 94, 54, 0.04) 0%, transparent 60%)' }}>
      
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
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
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
            e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
            e.currentTarget.style.color = 'var(--color-danger)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
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
