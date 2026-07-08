// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, getSetting, setSetting } from '../../db/database';
import { escapeHtml, showToast, playSound, vibrateDevice } from '../../utils/helpers';
import { printerService } from '../../services/printer';
import { ReceiptBuilder } from '../../services/receipt';
import { exportAllData, exportOrdersCSV, importData } from '../../utils/dataExport';
import { logDataExported } from '../../utils/activityLogger';
import { hashPin } from '../../utils/crypto';
import { signOutCloudStaff } from '../../services/supabaseClient';
import { authService, CLOUD_REQUIRED_ROLES } from '../../services/auth';

const CONFIG_KEYS = [
  'restaurantName', 'restaurantTagline', 'restaurantPhone', 'restaurantAddress',
  'upiId', 'upiName', 'gstPercent', 'printerWidth', 'adminPin', 'adminPinHash',
  'orderNumberPrefix', 'supabaseUrl', 'supabaseKey', 'supabaseEmail',
  'gstin', 'fssaiNumber', 'restaurantEmail', 'restaurantWebsite',
  'operatingHours', 'receiptFooter', 'printDensity', 'printCopies',
  'showLogoOnReceipt', 'showAddressOnReceipt', 'showPhoneOnReceipt',
  'showGstinOnReceipt', 'showFssaiOnReceipt', 'showNotesOnReceipt',
  'showFooterOnReceipt', 'autoPrintOnConfirm', 'googleClientId',
  'autoUploadToDrive', 'invoiceTemplate', 'invoicePrimaryColor',
  'invoiceFontFamily', 'invoiceLogoUrl', 'invoiceTitle', 'invoiceTerms',
  'invoiceShowSignature', 'invoiceSignatureText', 'invoiceShowGrid',
  'invoiceShowWatermark', 'invoiceShowUpiQr', 'currencyCode',
  'currencySymbol', 'taxType', 'taxLabel', 'requirePinForOrder',
  'allowManagerAdmin', 'allowCashierVoid', 'autoLockTerminal',
  'autoLockTimeout', 'sessionDuration', 'app_theme'
];

export function SettingsView() {
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'payments' | 'printer' | 'invoice' | 'cloud' | 'security'>('profile');
  const [activePreviewTab, setActivePreviewTab] = useState<'thermal' | 'invoice'>('thermal');
  const [invoiceHtml, setInvoiceHtml] = useState('');
  const [printerConnected, setPrinterConnected] = useState(printerService.isConnected);
  const [driveConnected, setDriveConnected] = useState(false);
  const [syncTesting, setSyncTesting] = useState(false);
  const [supabasePassword, setSupabasePassword] = useState('');
  const [newPin, setNewPin] = useState('');

  const importFileInputRef = useRef<HTMLInputElement>(null);
  const isPrinterSupported = printerService.isSupported();

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data: Record<string, any> = {};
      for (const key of CONFIG_KEYS) {
        data[key] = await getSetting(key) || '';
      }

      // Sync adminPinHash with active owner hash
      const owner = await db.staff
        .where('role')
        .equals('owner')
        .and((s: any) => (s.isActive === 1 || s.isActive === true) && /^[0-9a-f]{64}$/.test(s.pinHash || ''))
        .first();
      if (owner && owner.pinHash && owner.pinHash !== data.adminPinHash) {
        await setSetting('adminPinHash', owner.pinHash);
        data.adminPinHash = owner.pinHash;
      }

      // Default toggles
      const defaultOn = ['showLogoOnReceipt', 'showAddressOnReceipt', 'showPhoneOnReceipt', 'showFooterOnReceipt', 'invoiceShowGrid', 'invoiceShowUpiQr', 'allowManagerAdmin'];
      for (const t of defaultOn) {
        if (data[t] === '') data[t] = 'true';
      }
      const defaultOff = ['showGstinOnReceipt', 'showFssaiOnReceipt', 'showNotesOnReceipt', 'autoPrintOnConfirm', 'autoUploadToDrive', 'invoiceShowSignature', 'invoiceShowWatermark', 'requirePinForOrder', 'allowCashierVoid', 'autoLockTerminal'];
      for (const t of defaultOff) {
        if (data[t] === '') data[t] = 'false';
      }

      // Sensible standard defaults
      if (!data.printerWidth) data.printerWidth = '58';
      if (!data.printDensity) data.printDensity = 'normal';
      if (!data.printCopies) data.printCopies = '1';
      if (!data.invoiceTemplate) data.invoiceTemplate = 'minimalist';
      if (!data.invoicePrimaryColor) data.invoicePrimaryColor = '#FF5E36';
      if (!data.invoiceFontFamily) data.invoiceFontFamily = 'sans-serif';
      if (!data.invoiceTitle) data.invoiceTitle = 'TAX INVOICE';
      if (!data.invoiceTerms) data.invoiceTerms = '1. Goods once sold cannot be returned.\n2. Please check bill before leaving.';
      if (!data.invoiceSignatureText) data.invoiceSignatureText = 'Authorized Signatory';
      if (!data.currencyCode) data.currencyCode = 'INR';
      if (!data.currencySymbol) data.currencySymbol = '₹';
      if (!data.taxType) data.taxType = 'GST';
      if (!data.taxLabel) data.taxLabel = 'GST';
      if (!data.autoLockTimeout) data.autoLockTimeout = '5';
      if (!data.sessionDuration) data.sessionDuration = '8';
      if (!data.app_theme) data.app_theme = localStorage.getItem('app_theme') || 'system';

      setConfig(data);

      // Check Drive status
      const { isDriveConnected } = await import('../../services/driveUpload');
      setDriveConnected(isDriveConnected());
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();

    // Setup printer state listeners
    const originalOnStatusChange = printerService.onStatusChange;
    printerService.onStatusChange = (isConnected) => {
      setPrinterConnected(isConnected);
      const dotHeader = document.getElementById('printer-status-dot');
      const textHeader = document.getElementById('printer-status-text');
      if (dotHeader) dotHeader.className = `status-dot ${isConnected ? 'online' : 'offline'}`;
      if (textHeader) textHeader.textContent = isConnected ? 'Connected' : 'Not Connected';

      if (originalOnStatusChange) {
        originalOnStatusChange(isConnected);
      }
    };

    return () => {
      printerService.onStatusChange = originalOnStatusChange;
    };
  }, []);

  const handleConfigChange = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  // --- Bluetooth Thermal Printer connect triggers ---
  const handleTogglePrinter = async () => {
    playSound(800, 100);
    vibrateDevice([40]);
    if (printerConnected) {
      try {
        await printerService.disconnect();
        showToast('Printer disconnected', 'info');
      } catch (e) {
        console.error('Failed to disconnect:', e);
      }
    } else {
      try {
        showToast('Connecting to Bluetooth printer...', 'info');
        await printerService.connect();
        showToast('Printer connected successfully!', 'success');
      } catch (e: any) {
        if (e.name !== 'NotFoundError') {
          showToast('Bluetooth error: ' + e.message, 'error');
        }
      }
    }
  };

  const handlePrintTest = async () => {
    playSound(800, 100);
    vibrateDevice([40]);
    if (!printerConnected) return;

    try {
      const pw = config.printerWidth || '58';
      const width = pw === '58' ? 32 : pw === '76' ? 42 : pw === '80' ? 48 : 32;
      const rb = new ReceiptBuilder(width);
      
      const testBytes = rb
        .initialize()
        .center()
        .big()
        .text(config.restaurantName || 'THE TASTE')
        .normal()
        .text('BLE Printer Test page')
        .line('=')
        .left()
        .text('Connection status: SUCCESS')
        .text(`Paper width format: ${pw}mm (${width} columns)`)
        .text(`Date & Time: ${new Date().toLocaleString('en-IN')}`)
        .line('-')
        .center()
        .text('Everything looks good! 👍')
        .feed(3)
        .cut()
        .build();

      await printerService.print(testBytes);
      showToast('Test page printed!', 'success');
    } catch (e: any) {
      console.error('Test print failed:', e);
      showToast('Print error: ' + e.message, 'error');
    }
  };

  // --- Google Drive Authentication connect/disconnect ---
  const handleToggleDrive = async () => {
    playSound(800, 100);
    vibrateDevice([40]);
    const { isDriveConnected, authenticateGDrive, disconnectGDrive } = await import('../../services/driveUpload');

    if (isDriveConnected()) {
      disconnectGDrive();
      showToast('Google Drive disconnected', 'info');
      setDriveConnected(false);
    } else {
      const clientId = config.googleClientId?.trim();
      if (!clientId) {
        showToast('Please enter your Google Client ID first.', 'warning');
        return;
      }
      try {
        await authenticateGDrive(clientId);
        showToast('Google Drive connected successfully! 🎉', 'success');
        setDriveConnected(true);
      } catch (e: any) {
        showToast('Connection failed: ' + e.message, 'error');
        setDriveConnected(false);
      }
    }
  };

  // --- Cloud Synchronization test ---
  const handleTestCloudSync = async () => {
    playSound(800, 100);
    vibrateDevice([40]);
    const url = config.supabaseUrl?.trim();
    const key = config.supabaseKey?.trim();

    if (!url || !key) {
      showToast('Please enter both Supabase URL and Anon Key to test.', 'warning');
      return;
    }

    setSyncTesting(true);
    try {
      const { syncService } = await import('../../services/sync');
      const result = await syncService.testConnection(url, key);
      if (result.success) {
        showToast('Supabase connection successful! 🎉', 'success');
      } else {
        showToast('Connection failed: ' + result.message, 'error');
      }
    } catch (err: any) {
      showToast('Test failed: ' + err.message, 'error');
    } finally {
      setSyncTesting(false);
    }
  };

  const handleCloudSignIn = async () => {
    const email = config.supabaseEmail?.trim() || '';
    try {
      const { authService } = await import('../../services/auth');
      await authService.loginWithCloudCredentials(email, supabasePassword);
      setSupabasePassword('');
      showToast('Cloud staff session active on this device', 'success');
      const { syncService } = await import('../../services/sync');
      await syncService.connect();
    } catch (err: any) {
      console.error('Cloud staff sign in failed:', err);
      showToast(err.message || 'Cloud staff sign in failed', 'error');
    }
  };

  const handleCloudSignOut = async () => {
    try {
      await signOutCloudStaff();
      showToast('Cloud staff session signed out', 'info');
    } catch (err: any) {
      showToast('Cloud sign out failed: ' + err.message, 'error');
    }
  };

  // --- Save Configurations ---
  const handleSave = async () => {
    playSound(800, 100);
    vibrateDevice([50, 30]);

    const name = config.restaurantName?.trim();
    const upiId = config.upiId?.trim();
    const currentStaff = authService.getCurrentStaff();
    const isOwner = currentStaff?.role === 'owner';

    if (!name) {
      showToast('Restaurant name is required', 'warning');
      return;
    }
    if (!upiId) {
      showToast('UPI ID is required for checkout QR generation', 'warning');
      return;
    }
    if (newPin && (newPin.length !== 4 || isNaN(Number(newPin)))) {
      showToast(`${isOwner ? 'Admin' : 'Manager'} lock PIN must be exactly 4 digits`, 'warning');
      return;
    }
    if (isOwner && !config.adminPinHash && !newPin) {
      showToast('Set an admin lock PIN before launch', 'warning');
      return;
    }

    try {
      // Save all field values
      for (const k of CONFIG_KEYS) {
        if (k !== 'adminPin' && config[k] !== undefined) {
          await setSetting(k, String(config[k]));
        }
      }

      // Reset master lock PIN if entered
      if (newPin) {
        const pinHashVal = await hashPin(newPin);
        if (currentStaff && currentStaff.role === 'manager') {
          await db.staff.update(currentStaff.id, { pinHash: pinHashVal, isSynced: 0 });
          localStorage.setItem(`pin_authorized_${currentStaff.id}`, 'true');
          localStorage.setItem('auth_staff_pin', pinHashVal);
        } else {
          await setSetting('adminPinHash', pinHashVal);
          await db.settings.delete('adminPin');
          handleConfigChange('adminPinHash', pinHashVal);

          const owners = await db.staff.where('role').equals('owner').toArray();
          for (const o of owners) {
            await db.staff.update(o.id, { pinHash: pinHashVal, isSynced: 0 });
            localStorage.setItem(`pin_authorized_${o.id}`, 'true');
            if (currentStaff && o.id === currentStaff.id) {
              localStorage.setItem('auth_staff_pin', pinHashVal);
            }
          }
        }
        setNewPin('');
      }

      // Update cached variables
      localStorage.setItem('app_currency_symbol', config.currencySymbol || '₹');
      localStorage.setItem('app_currency_code', config.currencyCode || 'INR');
      localStorage.setItem('app_tax_type', config.taxType || 'GST');
      localStorage.setItem('app_tax_label', config.taxLabel || 'GST');

      // Theme toggle
      const savedTheme = config.app_theme || 'system';
      localStorage.setItem('app_theme', savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: savedTheme } }));

      const logo = document.getElementById('app-logo')?.querySelector('span:last-child');
      if (logo) logo.textContent = config.restaurantName;

      showToast('Settings saved successfully! 🎨', 'success');

      // Hot-reconnect cloud sync syncService
      try {
        const { syncService } = await import('../../services/sync');
        await syncService.connect();
      } catch (syncErr) {
        console.error('Sync hot-reconnect error:', syncErr);
      }
    } catch (err: any) {
      showToast('Save failed: ' + err.message, 'error');
    }
  };

  // --- File backup helpers ---
  const handleExportJSON = async () => {
    playSound(800, 80);
    try {
      await exportAllData();
      await logDataExported();
      showToast('Full JSON backup downloaded!', 'success');
    } catch (e: any) {
      showToast('Export failed: ' + e.message, 'error');
    }
  };

  const handleExportCSV = async () => {
    playSound(800, 80);
    try {
      await exportOrdersCSV(30);
      showToast('Orders CSV downloaded!', 'success');
    } catch (e: any) {
      showToast('CSV export failed: ' + e.message, 'error');
    }
  };

  const handleImportRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('This will restore and merge backup data into IndexedDB. Continue?')) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const result = await importData(text);
      if (result.success) {
        const counts = Object.entries(result.counts)
          .filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        showToast(`Restored successfully! ${counts}`, 'success', 5000);
        loadConfig();
      }
    } catch (err: any) {
      showToast('Import failed: ' + err.message, 'error');
    }
    e.target.value = '';
  };

  // Mono-spaced formatted receipt builder for Thermal preview
  const thermalPreviewContent = useMemo(() => {
    if (loading) return '';
    const pw = config.printerWidth || '58';
    const cols = pw === '58' ? 32 : pw === '76' ? 42 : pw === '80' ? 48 : 32;
    const divider = (ch: string) => ch.repeat(cols);

    const padRow = (left: string, mid: string, right: string) => {
      const l = left || '';
      const m = mid || '';
      const r = right || '';
      const usedLen = l.length + m.length + r.length;
      const totalSpaces = Math.max(cols - usedLen, 2);
      const leftPad = Math.floor(totalSpaces / 2);
      const rightPad = totalSpaces - leftPad;
      return `${l}${' '.repeat(leftPad)}${m}${' '.repeat(rightPad)}${r}`;
    };

    const lines: string[] = [];
    const showLogo = config.showLogoOnReceipt === 'true' || config.showLogoOnReceipt === true;
    if (showLogo) {
      lines.push(config.restaurantName || 'THE TASTE');
      if (config.restaurantTagline) lines.push(config.restaurantTagline);
    }
    if (config.showAddressOnReceipt === 'true' && config.restaurantAddress) {
      lines.push(config.restaurantAddress);
    }
    if (config.showPhoneOnReceipt === 'true' && config.restaurantPhone) {
      lines.push(`Ph: ${config.restaurantPhone}`);
    }
    if (config.showGstinOnReceipt === 'true' && config.gstin) {
      lines.push(`GSTIN: ${config.gstin}`);
    }
    if (config.showFssaiOnReceipt === 'true' && config.fssaiNumber) {
      lines.push(`FSSAI: ${config.fssaiNumber}`);
    }

    lines.push(divider('='));
    lines.push(`Order: #TT-0042   Table: 5`);
    lines.push(`Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    lines.push(divider('-'));

    lines.push(padRow('Item', 'Qty', 'Amt'));
    lines.push(divider('-'));
    lines.push(padRow('Chicken Biryani', 'x2', `${config.currencySymbol}440`));
    lines.push(padRow('Paneer Butter Masala', 'x1', `${config.currencySymbol}180`));
    lines.push(padRow('Cold Coffee', 'x2', `${config.currencySymbol}180`));
    lines.push(divider('-'));

    lines.push(padRow('Subtotal', '', `${config.currencySymbol}800`));
    lines.push(padRow(`${config.taxLabel} (5%)`, '', `${config.currencySymbol}40`));
    lines.push(divider('='));
    lines.push(padRow('TOTAL', '', `${config.currencySymbol}840`));
    lines.push(divider('='));

    if (config.showNotesOnReceipt === 'true') {
      lines.push(`Note: Extra spicy, no onion`);
      lines.push(divider('-'));
    }
    if (config.showFooterOnReceipt === 'true' && config.receiptFooter) {
      lines.push(config.receiptFooter);
    }

    return lines.join('\n');
  }, [config, loading]);

  // Dynamic A4 iframe preview renderer
  useEffect(() => {
    if (activePreviewTab === 'invoice' && !loading) {
      const dummyOrder = {
        orderNumber: 'TT-20260527-0042',
        createdAt: new Date().toISOString(),
        type: 'dine_in',
        paymentStatus: 'paid',
        paymentMethod: 'upi',
        customerName: 'Aria Sen',
        customerPhone: '9876543210',
        tableId: '5',
        subtotal: 800.00,
        tax: 40.00,
        total: 840.00,
        items: JSON.stringify([
          { name: 'Chicken Biryani', qty: 2, price: 220 },
          { name: 'Paneer Butter Masala', qty: 1, price: 180 },
          { name: 'Cold Coffee', qty: 2, price: 90 }
        ])
      };

      const dummyQr = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><rect x="10" y="10" width="30" height="30" fill="black"/><rect x="15" y="15" width="20" height="20" fill="white"/><rect x="60" y="10" width="30" height="30" fill="black"/><rect x="65" y="15" width="20" height="20" fill="white"/><rect x="10" y="60" width="30" height="30" fill="black"/><rect x="15" y="65" width="20" height="20" fill="white"/><rect x="45" y="45" width="10" height="10" fill="black"/><rect x="60" y="60" width="10" height="10" fill="black"/><rect x="75" y="75" width="15" height="15" fill="black"/></svg>';

      const invoiceSettings = {
        restaurantName: config.restaurantName || 'THE TASTE',
        restaurantTagline: config.restaurantTagline || 'Fast Food & Chinese',
        restaurantAddress: config.restaurantAddress || 'Counter 4, Sector 5, Kolkata',
        restaurantPhone: config.restaurantPhone || '+91 98765 43210',
        restaurantEmail: config.restaurantEmail || 'hello@thetaste.co.in',
        restaurantWebsite: config.restaurantWebsite || 'thetaste.co.in',
        gstin: config.gstin,
        fssaiNumber: config.fssaiNumber,
        receiptFooter: config.receiptFooter || 'Thank you! Visit again!',
        showAddressOnReceipt: config.showAddressOnReceipt === 'true' || config.showAddressOnReceipt === true ? 'true' : 'false',
        showPhoneOnReceipt: config.showPhoneOnReceipt === 'true' || config.showPhoneOnReceipt === true ? 'true' : 'false',
        showGstinOnReceipt: config.showGstinOnReceipt === 'true' || config.showGstinOnReceipt === true ? 'true' : 'false',
        showFssaiOnReceipt: config.showFssaiOnReceipt === 'true' || config.showFssaiOnReceipt === true ? 'true' : 'false',
        showFooterOnReceipt: config.showFooterOnReceipt === 'true' || config.showFooterOnReceipt === true ? 'true' : 'false',
        gstPercent: config.gstPercent || '5',
        invoiceTemplate: config.invoiceTemplate,
        invoicePrimaryColor: config.invoicePrimaryColor,
        invoiceFontFamily: config.invoiceFontFamily,
        invoiceLogoUrl: config.invoiceLogoUrl,
        invoiceTitle: config.invoiceTitle,
        invoiceTerms: config.invoiceTerms,
        invoiceShowSignature: config.invoiceShowSignature === 'true' || config.invoiceShowSignature === true ? 'true' : 'false',
        invoiceSignatureText: config.invoiceSignatureText,
        invoiceShowGrid: config.invoiceShowGrid === 'true' || config.invoiceShowGrid === true ? 'true' : 'false',
        invoiceShowWatermark: config.invoiceShowWatermark === 'true' || config.invoiceShowWatermark === true ? 'true' : 'false',
        invoiceShowUpiQr: config.invoiceShowUpiQr === 'true' || config.invoiceShowUpiQr === true ? 'true' : 'false',
        upiId: config.upiId || 'thetaste@upi',
        currencySymbol: config.currencySymbol,
        taxLabel: config.taxLabel
      };

      import('../../services/invoiceGenerator').then(({ InvoiceGenerator }) => {
        const html = InvoiceGenerator.generateInvoiceHTML(dummyOrder, invoiceSettings, dummyQr);
        setInvoiceHtml(html.replace("window.location.search.includes('preview=true')", 'true'));
      }).catch(err => {
        console.error('Invoice preview compilation error:', err);
      });
    }
  }, [config, activePreviewTab, loading]);

  const handleTabSelect = (tab: any) => {
    playSound(700, 60);
    setSettingsTab(tab);
    if (tab === 'invoice') {
      setActivePreviewTab('invoice');
    } else if (tab === 'printer') {
      setActivePreviewTab('thermal');
    }
  };

  const currentStaff = authService.getCurrentStaff();
  const isOwner = currentStaff?.role === 'owner';

  if (loading) {
    return (
      <div className="settings-container" style={{ padding: '24px' }}>
        <div className="skeleton-card" style={{ height: '40px', width: '220px', borderRadius: '8px', marginBottom: '24px' }}></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="card skeleton-card" style={{ height: '450px', borderRadius: '12px' }}></div>
          <div className="card skeleton-card" style={{ height: '450px', borderRadius: '12px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container" style={{
      padding: '24px',
      maxWidth: '1200px',
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1.2fr 0.8fr',
      gap: '24px',
      alignItems: 'start'
    }}>
      <style>{`
        .settings-sidebar-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: var(--text-xs);
          font-weight: 700;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }
        .settings-sidebar-btn span {
          font-size: 18px;
        }
        .settings-sidebar-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
        }
        .settings-sidebar-btn.active {
          background: rgba(255, 94, 54, 0.08);
          border-color: rgba(255, 94, 54, 0.2);
          color: var(--color-primary);
        }
      `}</style>

      {/* LEFT COLUMN: Settings forms inside segmented tabs */}
      <div style={{ display: 'flex', gap: '20px' }}>
        
        {/* Left vertical settings sidebar */}
        <div style={{
          width: '180px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flexShrink: 0,
          background: 'var(--bg-primary)',
          padding: '12px 8px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-glass)'
        }}>
          <button className={`settings-sidebar-btn ${settingsTab === 'profile' ? 'active' : ''}`} onClick={() => handleTabSelect('profile')}>
            <span className="material-symbols-rounded">storefront</span>Store Details
          </button>
          <button className={`settings-sidebar-btn ${settingsTab === 'payments' ? 'active' : ''}`} onClick={() => handleTabSelect('payments')}>
            <span className="material-symbols-rounded">account_balance_wallet</span>Payments & Tax
          </button>
          <button className={`settings-sidebar-btn ${settingsTab === 'printer' ? 'active' : ''}`} onClick={() => handleTabSelect('printer')}>
            <span className="material-symbols-rounded">print</span>Printer Roll
          </button>
          <button className={`settings-sidebar-btn ${settingsTab === 'invoice' ? 'active' : ''}`} onClick={() => handleTabSelect('invoice')}>
            <span className="material-symbols-rounded">description</span>A4 Designer
          </button>
          <button className={`settings-sidebar-btn ${settingsTab === 'cloud' ? 'active' : ''}`} onClick={() => handleTabSelect('cloud')}>
            <span className="material-symbols-rounded">cloud_sync</span>Cloud & Drive
          </button>
          <button className={`settings-sidebar-btn ${settingsTab === 'security' ? 'active' : ''}`} onClick={() => handleTabSelect('security')}>
            <span className="material-symbols-rounded">security</span>Lock & Backup
          </button>
        </div>

        {/* Tab configuration viewport */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* PROFILE CONFIG */}
          {settingsTab === 'profile' && (
            <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>storefront</span>
                Restaurant Profile
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>Store Name</label>
                    <input type="text" className="input" value={config.restaurantName} onChange={(e) => handleConfigChange('restaurantName', e.target.value)} placeholder="e.g. The Taste" />
                  </div>
                  <div className="input-group">
                    <label>Tagline / Cuisine</label>
                    <input type="text" className="input" value={config.restaurantTagline} onChange={(e) => handleConfigChange('restaurantTagline', e.target.value)} placeholder="e.g. Chinese & Fast Food" />
                  </div>
                </div>

                <div className="input-group">
                  <label>Store Address</label>
                  <input type="text" className="input" value={config.restaurantAddress} onChange={(e) => handleConfigChange('restaurantAddress', e.target.value)} placeholder="e.g. Kumhrar, Sandalpur Road, Patna" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>Store Phone</label>
                    <input type="tel" className="input" value={config.restaurantPhone} onChange={(e) => handleConfigChange('restaurantPhone', e.target.value)} placeholder="+91 XXXXXXXXXX" />
                  </div>
                  <div className="input-group">
                    <label>Store Email</label>
                    <input type="email" className="input" value={config.restaurantEmail} onChange={(e) => handleConfigChange('restaurantEmail', e.target.value)} placeholder="hello@thetaste.com" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>Website URL</label>
                    <input type="url" className="input" value={config.restaurantWebsite} onChange={(e) => handleConfigChange('restaurantWebsite', e.target.value)} placeholder="thetaste.com" />
                  </div>
                  <div className="input-group">
                    <label>Operating Hours</label>
                    <input type="text" className="input" value={config.operatingHours} onChange={(e) => handleConfigChange('operatingHours', e.target.value)} placeholder="11:00 AM - 11:00 PM" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>GSTIN / Tax ID</label>
                    <input type="text" className="input" value={config.gstin} onChange={(e) => handleConfigChange('gstin', e.target.value)} placeholder="GSTIN code" />
                  </div>
                  <div className="input-group">
                    <label>FSSAI License No.</label>
                    <input type="text" className="input" value={config.fssaiNumber} onChange={(e) => handleConfigChange('fssaiNumber', e.target.value)} placeholder="FSSAI number" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PAYMENTS & TAXES */}
          {settingsTab === 'payments' && (
            <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>account_balance_wallet</span>
                Payments & Tax Setup
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>UPI ID (VPA) for Scanning</label>
                    <input type="text" className="input" style={{ borderColor: 'rgba(255, 94, 54, 0.3)' }} value={config.upiId} onChange={(e) => handleConfigChange('upiId', e.target.value)} placeholder="merchant@upi" />
                  </div>
                  <div className="input-group">
                    <label>Merchant Name</label>
                    <input type="text" className="input" value={config.upiName} onChange={(e) => handleConfigChange('upiName', e.target.value)} placeholder="Store Name" />
                  </div>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', marginTop: '-8px', fontWeight: 600 }}>
                  ⚠️ Critical: Verification of UPI VPA is required. Customers scan and pay directly to this address.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>Tax Percentage Rate (%)</label>
                    <input type="number" className="input" value={config.gstPercent} onChange={(e) => handleConfigChange('gstPercent', e.target.value)} placeholder="5" min="0" step="0.5" />
                  </div>
                  <div className="input-group">
                    <label>Order Number Prefix</label>
                    <input type="text" className="input" value={config.orderNumberPrefix} onChange={(e) => handleConfigChange('orderNumberPrefix', e.target.value)} placeholder="TT" maxLength="4" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>Currency Code</label>
                    <select className="input" value={config.currencyCode} onChange={(e) => handleConfigChange('currencyCode', e.target.value)} style={{ fontWeight: 700 }}>
                      <option value="INR">INR (Indian Rupee)</option>
                      <option value="USD">USD (US Dollar)</option>
                      <option value="EUR">EUR (Euro)</option>
                      <option value="GBP">GBP (British Pound)</option>
                      <option value="AUD">AUD (Australian Dollar)</option>
                      <option value="CAD">CAD (Canadian Dollar)</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Currency Symbol</label>
                    <input type="text" className="input" value={config.currencySymbol} onChange={(e) => handleConfigChange('currencySymbol', e.target.value)} placeholder="₹" style={{ fontWeight: 700 }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>Tax System Type</label>
                    <select className="input" value={config.taxType} onChange={(e) => handleConfigChange('taxType', e.target.value)} style={{ fontWeight: 700 }}>
                      <option value="GST">GST (Goods & Services Tax)</option>
                      <option value="VAT">VAT (Value Added Tax)</option>
                      <option value="Sales Tax">Sales Tax</option>
                      <option value="None">None (Tax-Free)</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Tax Label on Bill</label>
                    <input type="text" className="input" value={config.taxLabel} onChange={(e) => handleConfigChange('taxLabel', e.target.value)} placeholder="GST or VAT" style={{ fontWeight: 700 }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PRINTER ROLL SETTINGS */}
          {settingsTab === 'printer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>print</span>
                  Bluetooth Printer setup
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Web Bluetooth API Support</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {isPrinterSupported ? 'Ready for connection' : '⚠️ Use Chrome on Android / Windows'}
                      </div>
                    </div>
                    <span className={`badge ${isPrinterSupported ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '9px', fontWeight: 800 }}>
                      {isPrinterSupported ? 'OK' : 'ERR'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Connection Status</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {printerConnected ? `Connected to ${printerService.device?.name || 'Device'}` : 'Offline'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`status-dot ${printerConnected ? 'online' : 'offline'}`} style={{ width: '8px', height: '8px' }}></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={handleTogglePrinter} disabled={!isPrinterSupported} className={`btn ${printerConnected ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1, minHeight: '38px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                      {printerConnected ? 'Disconnect' : 'Connect BLE'}
                    </button>
                    <button onClick={handlePrintTest} disabled={!printerConnected} className="btn btn-secondary" style={{ flex: 1, minHeight: '38px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                      Print Test
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Print Roll Settings */}
              <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>tune</span>
                  Thermal Layout & Receipt content
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '16px' }}>
                    <div className="input-group">
                      <label>Paper Width Roll</label>
                      <select className="input" value={config.printerWidth} onChange={(e) => handleConfigChange('printerWidth', e.target.value)} style={{ fontWeight: 700 }}>
                        <option value="58">58mm (32 chars roll)</option>
                        <option value="76">76mm (42 chars roll)</option>
                        <option value="80">80mm (48 chars roll)</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Print Copies</label>
                      <input type="number" className="input" min="1" max="5" value={config.printCopies} onChange={(e) => handleConfigChange('printCopies', e.target.value)} />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Print Density / Font Thickness</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['light', 'normal', 'bold'].map(d => {
                        const active = config.printDensity === d;
                        return (
                          <button
                            key={d}
                            onClick={() => handleConfigChange('printDensity', d)}
                            className={`btn`}
                            style={{
                              flex: 1, minHeight: '34px', fontSize: 'var(--text-xs)', fontWeight: active ? 800 : 500,
                              borderRadius: 'var(--radius-md)', cursor: 'pointer',
                              border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                              background: active ? 'var(--color-primary-glow)' : 'var(--bg-primary)',
                              color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
                              transition: 'all 0.2s'
                            }}
                          >
                            {d.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={{ marginBottom: '10px', display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700 }}>Include in Receipt</label>
                    <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', padding: '4px 16px' }}>
                      {[
                        { id: 'showLogoOnReceipt', label: 'Show Brand Logo / Header Title' },
                        { id: 'showAddressOnReceipt', label: 'Print Address Details' },
                        { id: 'showPhoneOnReceipt', label: 'Print Contact Phone Number' },
                        { id: 'showGstinOnReceipt', label: 'Print Store GSTIN Number' },
                        { id: 'showFssaiOnReceipt', label: 'Print Store FSSAI License' },
                        { id: 'showNotesOnReceipt', label: 'Print Customer Cooking Notes' },
                        { id: 'showFooterOnReceipt', label: 'Print Receipt Footer message' },
                        { id: 'autoPrintOnConfirm', label: 'Auto-print instantly on payment confirm' }
                      ].map(toggle => (
                        <div key={toggle.id} className="settings-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>{toggle.label}</span>
                          <label className="settings-toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                            <input
                              type="checkbox"
                              checked={config[toggle.id] === 'true' || config[toggle.id] === true}
                              onChange={(e) => handleConfigChange(toggle.id, e.target.checked ? 'true' : 'false')}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span className="settings-toggle-track" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: config[toggle.id] === 'true' || config[toggle.id] === true ? 'var(--color-primary)' : 'var(--border-active)', borderRadius: '34px', transition: '0.2s' }}></span>
                            <span className="settings-toggle-thumb" style={{ position: 'absolute', height: '16px', width: '16px', left: config[toggle.id] === 'true' || config[toggle.id] === true ? '19px' : '3px', bottom: '3px', background: 'white', borderRadius: '50%', transition: '0.2s' }}></span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* INVOICE A4 DESIGNER */}
          {settingsTab === 'invoice' && (
            <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>palette</span>
                Bill & A4 Invoice Designer
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label>Invoice Theme Style</label>
                    <select className="input" value={config.invoiceTemplate} onChange={(e) => handleConfigChange('invoiceTemplate', e.target.value)} style={{ fontWeight: 700 }}>
                      <option value="minimalist">Minimalist Modern (Airy & Clean)</option>
                      <option value="luxury">Luxury Gold (Elegant Serif Titles)</option>
                      <option value="executive">Executive Navy (Corporate Solid Grid)</option>
                      <option value="chic">Chic Rose (Cafe Peach Aesthetic)</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Font Family</label>
                    <select className="input" value={config.invoiceFontFamily} onChange={(e) => handleConfigChange('invoiceFontFamily', e.target.value)} style={{ fontWeight: 700 }}>
                      <option value="sans-serif">Plus Jakarta Sans / Inter (Modern)</option>
                      <option value="serif">Georgia / Garamond (Classic Serif)</option>
                      <option value="slab">Roboto Slab (Solid Executive)</option>
                      <option value="monospace">JetBrains Mono (Retro Grid)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '16px', alignItems: 'flex-end' }}>
                  <div className="input-group">
                    <label>Invoice Title Header</label>
                    <input type="text" className="input" value={config.invoiceTitle} onChange={(e) => handleConfigChange('invoiceTitle', e.target.value)} placeholder="TAX INVOICE" />
                  </div>
                  <div className="input-group">
                    <label>Theme Brand Color</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={config.invoicePrimaryColor}
                        onChange={(e) => handleConfigChange('invoicePrimaryColor', e.target.value)}
                        style={{ border: '1px solid var(--border-glass)', background: 'none', width: '38px', height: '38px', borderRadius: '8px', cursor: 'pointer', padding: 0 }}
                      />
                      <input
                        type="text"
                        className="input"
                        value={config.invoicePrimaryColor}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9A-F]{0,6}$/i.test(val)) handleConfigChange('invoicePrimaryColor', val);
                        }}
                        style={{ maxWidth: '80px', textTransform: 'uppercase', textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 700 }}
                      />
                    </div>
                  </div>
                </div>

                <div className="input-group">
                  <label>Logo URL (Direct HTTP Link)</label>
                  <input type="url" className="input" value={config.invoiceLogoUrl} onChange={(e) => handleConfigChange('invoiceLogoUrl', e.target.value)} placeholder="https://site.com/logo.png" />
                </div>

                <div className="input-group">
                  <label>Invoice Terms & Conditions</label>
                  <textarea className="input" value={config.invoiceTerms} onChange={(e) => handleConfigChange('invoiceTerms', e.target.value)} style={{ minHeight: '60px', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)' }} />
                </div>

                <div className="input-group" style={{ maxWidth: '320px' }}>
                  <label>Signature Text label</label>
                  <input type="text" className="input" value={config.invoiceSignatureText} onChange={(e) => handleConfigChange('invoiceSignatureText', e.target.value)} />
                </div>

                <div>
                  <label style={{ marginBottom: '10px', display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700 }}>Invoice Layout elements</label>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', padding: '4px 16px' }}>
                    {[
                      { id: 'invoiceShowUpiQr', label: 'Show dynamic scan-to-pay UPI QR block' },
                      { id: 'invoiceShowGrid', label: 'Draw item grid gridlines' },
                      { id: 'invoiceShowSignature', label: 'Draw signature authorization line' },
                      { id: 'invoiceShowWatermark', label: 'Draw subtle branding background watermark' }
                    ].map(toggle => (
                      <div key={toggle.id} className="settings-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>{toggle.label}</span>
                        <label className="settings-toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                          <input
                            type="checkbox"
                            checked={config[toggle.id] === 'true' || config[toggle.id] === true}
                            onChange={(e) => handleConfigChange(toggle.id, e.target.checked ? 'true' : 'false')}
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span className="settings-toggle-track" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: config[toggle.id] === 'true' || config[toggle.id] === true ? 'var(--color-primary)' : 'var(--border-active)', borderRadius: '34px', transition: '0.2s' }}></span>
                          <span className="settings-toggle-thumb" style={{ position: 'absolute', height: '16px', width: '16px', left: config[toggle.id] === 'true' || config[toggle.id] === true ? '19px' : '3px', bottom: '3px', background: 'white', borderRadius: '50%', transition: '0.2s' }}></span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CLOUD SYNC & DRIVE */}
          {settingsTab === 'cloud' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Supabase Sync */}
              <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>cloud_sync</span>
                  Supabase DB Sync Integration
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="input-group">
                    <label>Supabase project URL</label>
                    <input type="url" className="input" value={config.supabaseUrl} onChange={(e) => handleConfigChange('supabaseUrl', e.target.value)} placeholder="https://project.supabase.co" />
                  </div>
                  <div className="input-group">
                    <label>Anon Client Public key</label>
                    <input type="password" className="input" value={config.supabaseKey} onChange={(e) => handleConfigChange('supabaseKey', e.target.value)} placeholder="Anon Client Key" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="input-group">
                      <label>Cloud staff email</label>
                      <input type="email" className="input" value={config.supabaseEmail} onChange={(e) => handleConfigChange('supabaseEmail', e.target.value)} placeholder="staff@taste.com" />
                    </div>
                    <div className="input-group">
                      <label>Cloud staff password</label>
                      <input type="password" className="input" value={supabasePassword} onChange={(e) => setSupabasePassword(e.target.value)} placeholder="Password" />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <button onClick={handleTestCloudSync} disabled={syncTesting} className="btn btn-secondary btn-sm" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '34px' }}>
                      <span className={`material-symbols-rounded ${syncTesting ? 'animate-spin' : ''}`} style={{ fontSize: '16px' }}>sync</span>
                      Test Conn
                    </button>
                    <button onClick={handleCloudSignIn} className="btn btn-primary btn-sm" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '34px' }}>
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>login</span>
                      Sign In Device
                    </button>
                    <button onClick={handleCloudSignOut} className="btn btn-secondary btn-sm" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '34px' }}>
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>logout</span>
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>

              {/* Google Drive */}
              <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>cloud_upload</span>
                  Google Drive Report Backups
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="input-group">
                    <label>OAuth 2.0 Client ID</label>
                    <input type="text" className="input" value={config.googleClientId} onChange={(e) => handleConfigChange('googleClientId', e.target.value)} placeholder="Client ID string" />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>OAuth Status</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>{driveConnected ? 'Backup folder active' : 'Drive disconnected'}</div>
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: driveConnected ? 'var(--color-success)' : 'var(--text-muted)' }}>
                      {driveConnected ? 'CONNECTED' : 'OFFLINE'}
                    </span>
                  </div>

                  <button onClick={handleToggleDrive} className={`btn ${driveConnected ? 'btn-danger' : 'btn-primary'}`} style={{ minHeight: '36px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>backup</span>
                    {driveConnected ? 'Disconnect' : 'Connect GDrive'}
                  </button>

                  <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', padding: '4px 16px' }}>
                    <div className="settings-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>Auto-upload report backups</span>
                      <label className="settings-toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                        <input
                          type="checkbox"
                          checked={config.autoUploadToDrive === 'true' || config.autoUploadToDrive === true}
                          onChange={(e) => handleConfigChange('autoUploadToDrive', e.target.checked ? 'true' : 'false')}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span className="settings-toggle-track" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: config.autoUploadToDrive === 'true' || config.autoUploadToDrive === true ? 'var(--color-primary)' : 'var(--border-active)', borderRadius: '34px', transition: '0.2s' }}></span>
                        <span className="settings-toggle-thumb" style={{ position: 'absolute', height: '16px', width: '16px', left: config.autoUploadToDrive === 'true' || config.autoUploadToDrive === true ? '19px' : '3px', bottom: '3px', background: 'white', borderRadius: '50%', transition: '0.2s' }}></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECURITY & DATA BACKUPS */}
          {settingsTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Security PIN Change & Auto-lock */}
              <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>security</span>
                  Terminal Lock & Session Timeout
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="input-group" style={{ maxWidth: '280px' }}>
                    <label>Set Lock PIN Code (leave blank to keep)</label>
                    <input
                      type="password"
                      className="input"
                      value={newPin}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^[0-9]{0,4}$/.test(val)) setNewPin(val);
                      }}
                      maxLength={4}
                      placeholder="4 digits"
                      style={{
                        background: 'var(--bg-primary)', border: '1px solid var(--border-glass)',
                        color: 'var(--text-primary)', letterSpacing: '0.5em', textAlign: 'center',
                        fontWeight: 800, fontSize: '1.2rem', padding: '8px 10px',
                        borderRadius: '6px', width: '100%', outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', padding: '4px 16px' }}>
                    {[
                      { id: 'requirePinForOrder', label: 'Require security PIN verification for every POS order checkout' },
                      { id: 'allowManagerAdmin', label: 'Grant managers full authorization to access Admin Console' },
                      { id: 'allowCashierVoid', label: 'Grant cashiers privilege to void or refund order records' },
                      { id: 'autoLockTerminal', label: 'Activate automatic lock during cashier terminal inactivity' }
                    ].map(toggle => (
                      <div key={toggle.id} className="settings-toggle-row" style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>{toggle.label}</span>
                        <label className="settings-toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                          <input
                            type="checkbox"
                            checked={config[toggle.id] === 'true' || config[toggle.id] === true}
                            onChange={(e) => handleConfigChange(toggle.id, e.target.checked ? 'true' : 'false')}
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span className="settings-toggle-track" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: config[toggle.id] === 'true' || config[toggle.id] === true ? 'var(--color-primary)' : 'var(--border-active)', borderRadius: '34px', transition: '0.2s' }}></span>
                          <span className="settings-toggle-thumb" style={{ position: 'absolute', height: '16px', width: '16px', left: config[toggle.id] === 'true' || config[toggle.id] === true ? '19px' : '3px', bottom: '3px', background: 'white', borderRadius: '50%', transition: '0.2s' }}></span>
                        </label>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="input-group" style={{ opacity: config.autoLockTerminal === 'true' || config.autoLockTerminal === true ? 1 : 0.4 }}>
                      <label>Auto-Lock Inactivity Limit</label>
                      <select className="input" disabled={config.autoLockTerminal !== 'true' && config.autoLockTerminal !== true} value={config.autoLockTimeout} onChange={(e) => handleConfigChange('autoLockTimeout', e.target.value)} style={{ fontWeight: 700 }}>
                        <option value="5">5 Minutes</option>
                        <option value="10">10 Minutes</option>
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes</option>
                      </select>
                    </div>

                    <div className="input-group">
                      <label>Active Staff session limit</label>
                      <select className="input" value={config.sessionDuration} onChange={(e) => handleConfigChange('sessionDuration', e.target.value)} style={{ fontWeight: 700 }}>
                        <option value="4">4 Hours</option>
                        <option value="8">8 Hours (Standard)</option>
                        <option value="12">12 Hours</option>
                        <option value="24">24 Hours</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data backups */}
              <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>backup</span>
                  Database Backups & CSV ledger exports
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    Execute exports of store details as a JSON config file, or backup transaction logs directly.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button onClick={handleExportJSON} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '36px', fontWeight: 700 }}>
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>download</span>
                      JSON Config Backup
                    </button>
                    <button onClick={handleExportCSV} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '36px', fontWeight: 700 }}>
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>table_view</span>
                      CSV Order Logs (30d)
                    </button>
                  </div>
                  <div>
                    <input ref={importFileInputRef} type="file" accept=".json" onChange={handleImportRestore} style={{ display: 'none' }} />
                    <button onClick={() => importFileInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{ width: '100%', height: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)', color: '#F59E0B', fontWeight: 700 }}>
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>upload</span>
                      Restore / Upload JSON Backup file
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Theme setting block under Store Details */}
          {settingsTab === 'profile' && (
            <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>palette</span>
                Theme Preference
              </h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                {[
                  { id: 'dark', label: 'Dark Mode', icon: 'dark_mode' },
                  { id: 'light', label: 'Light Mode', icon: 'light_mode' },
                  { id: 'system', label: 'System Theme', icon: 'computer' }
                ].map(theme => {
                  const active = config.app_theme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => handleConfigChange('app_theme', theme.id)}
                      className={`btn`}
                      style={{
                        flex: 1, minHeight: '38px', display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', gap: '6px', borderRadius: 'var(--radius-md)',
                        border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                        background: active ? 'var(--color-primary-glow)' : 'var(--bg-primary)',
                        color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
                        fontWeight: active ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>{theme.icon}</span>
                      {theme.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
        </div>
      </div>

      {/* RIGHT COLUMN: Live Document Previews (Receipt or A4 invoice) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'sticky', top: '24px' }}>
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '20px 24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>preview</span>
            Live Document Preview
          </h3>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
            <button
              onClick={() => {
                playSound(800, 60);
                setActivePreviewTab('thermal');
              }}
              style={{
                fontSize: '11px', fontWeight: 700, padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                border: `1px solid ${activePreviewTab === 'thermal' ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                background: activePreviewTab === 'thermal' ? 'var(--color-primary-glow)' : 'var(--bg-primary)',
                color: activePreviewTab === 'thermal' ? 'var(--color-primary)' : 'var(--text-secondary)'
              }}
            >
              Thermal Roll
            </button>
            <button
              onClick={() => {
                playSound(800, 60);
                setActivePreviewTab('invoice');
              }}
              style={{
                fontSize: '11px', fontWeight: 700, padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                border: `1px solid ${activePreviewTab === 'invoice' ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                background: activePreviewTab === 'invoice' ? 'var(--color-primary-glow)' : 'var(--bg-primary)',
                color: activePreviewTab === 'invoice' ? 'var(--color-primary)' : 'var(--text-secondary)'
              }}
            >
              Standard A4 Invoice
            </button>
          </div>

          <div id="receipt-preview-container" style={{ display: 'flex', justifyContent: 'center', padding: '10px 0', overflowX: 'auto' }}>
            {activePreviewTab === 'thermal' ? (
              <div
                className="receipt-preview-paper"
                style={{
                  width: config.printerWidth === '58' ? '200px' : config.printerWidth === '76' ? '250px' : config.printerWidth === '80' ? '280px' : '360px',
                  fontWeight: config.printDensity === 'bold' ? '700' : config.printDensity === 'light' ? '300' : '400',
                  background: '#FFF', color: '#000', padding: '16px', fontFamily: 'monospace', fontSize: '10px', whiteSpace: 'pre-wrap',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.4)', borderRadius: '4px'
                }}
              >
                {thermalPreviewContent}
              </div>
            ) : (
              <iframe
                id="invoice-preview-iframe"
                srcDoc={invoiceHtml}
                style={{
                  width: '100%', height: '540px', border: '1px solid var(--border-glass)',
                  borderRadius: '12px', background: '#fff', boxShadow: '0 15px 35px rgba(0,0,0,0.4)'
                }}
              ></iframe>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
            <button onClick={handlePrintTest} disabled={!printerConnected} className="btn btn-secondary btn-sm" style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 16px' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>print</span>
              Print Sample Bill
            </button>
          </div>
        </div>

        {/* Floating Save All Button */}
        <button onClick={handleSave} className="btn btn-primary btn-block btn-lg" style={{
          height: '48px', fontSize: 'var(--text-sm)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-primary)'
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>save</span>
          Save All Configurations
        </button>
      </div>

    </div>
  );
}
