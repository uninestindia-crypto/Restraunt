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
    <div className="settings-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
      
      {/* LEFT COLUMN: Configuration settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Bluetooth printer setup */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>print</span>
            Bluetooth Thermal Printer Setup
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Web Bluetooth API Status</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {isPrinterSupported ? 'Supported in this browser (Chrome / Edge / Opera)' : '⚠️ Not supported. Use Google Chrome on Android.'}
                </div>
              </div>
              <span className={`badge ${isPrinterSupported ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                {isPrinterSupported ? 'Ready' : 'Not Supported'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Printer Connection Status</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {printerConnected ? `Connected (${printerService.device?.name || 'BLE Device'})` : 'No printer connected'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: printerConnected ? 'var(--color-success)' : 'var(--text-muted)' }}>
                  {printerConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
                <span className={`status-dot ${printerConnected ? 'online' : 'offline'}`} style={{ width: '8px', height: '8px' }}></span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleTogglePrinter} disabled={!isPrinterSupported} className={`btn ${printerConnected ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                {printerConnected ? 'Disconnect Printer' : 'Connect BLE Printer'}
              </button>
              <button onClick={handlePrintTest} disabled={!printerConnected} className="btn btn-secondary" style={{ flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                Print Test Page
              </button>
            </div>
          </div>
        </div>

        {/* Restaurant profile setup */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>storefront</span>
            Restaurant Profile & Branding
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                <label>Restaurant Name</label>
                <input type="text" className="input" value={config.restaurantName} onChange={(e) => handleConfigChange('restaurantName', e.target.value)} placeholder="e.g. The Taste" />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                <label>Tagline / Subtitle</label>
                <input type="text" className="input" value={config.restaurantTagline} onChange={(e) => handleConfigChange('restaurantTagline', e.target.value)} placeholder="e.g. Chinese & Fast Food" />
              </div>
            </div>

            <div className="input-group">
              <label>Store Address</label>
              <input type="text" className="input" value={config.restaurantAddress} onChange={(e) => handleConfigChange('restaurantAddress', e.target.value)} placeholder="e.g. Counter 4, Sector 5, Kolkata" />
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Phone Number</label>
                <input type="tel" className="input" value={config.restaurantPhone} onChange={(e) => handleConfigChange('restaurantPhone', e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Email Address</label>
                <input type="email" className="input" value={config.restaurantEmail} onChange={(e) => handleConfigChange('restaurantEmail', e.target.value)} placeholder="hello@thetaste.co.in" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Website</label>
                <input type="url" className="input" value={config.restaurantWebsite} onChange={(e) => handleConfigChange('restaurantWebsite', e.target.value)} placeholder="thetaste.co.in" />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Operating Hours</label>
                <input type="text" className="input" value={config.operatingHours} onChange={(e) => handleConfigChange('operatingHours', e.target.value)} placeholder="10:00 AM - 11:00 PM" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>GSTIN / Tax ID</label>
                <input type="text" className="input" value={config.gstin} onChange={(e) => handleConfigChange('gstin', e.target.value)} placeholder="e.g. 22AAAAA0000A1Z5" />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>FSSAI License No.</label>
                <input type="text" className="input" value={config.fssaiNumber} onChange={(e) => handleConfigChange('fssaiNumber', e.target.value)} placeholder="12345678901234" />
              </div>
            </div>

            <div className="input-group">
              <label>Receipt Footer Message</label>
              <input type="text" className="input" value={config.receiptFooter} onChange={(e) => handleConfigChange('receiptFooter', e.target.value)} placeholder="Thank you! Visit again!" />
            </div>
          </div>
        </div>

        {/* Payments and tax setup */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>account_balance_wallet</span>
            Payments & Tax Setup
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1.5, minWidth: '200px' }}>
                <label>UPI ID (VPA)</label>
                <input type="text" className="input" style={{ border: '1px solid rgba(255, 94, 54, 0.25)' }} value={config.upiId} onChange={(e) => handleConfigChange('upiId', e.target.value)} placeholder="thetaste@upi" />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Merchant Name</label>
                <input type="text" className="input" value={config.upiName} onChange={(e) => handleConfigChange('upiName', e.target.value)} placeholder="The Taste Store" />
              </div>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: '#FF8960', marginTop: '-6px', fontWeight: 500 }}>
              * Critical: Make sure the UPI VPA is correct. Scanning customers will pay directly to this account.
            </p>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Tax Rate (%)</label>
                <input type="number" className="input" value={config.gstPercent} onChange={(e) => handleConfigChange('gstPercent', e.target.value)} placeholder="5" min="0" step="0.5" />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Order Number Prefix</label>
                <input type="text" className="input" value={config.orderNumberPrefix} onChange={(e) => handleConfigChange('orderNumberPrefix', e.target.value)} placeholder="TT" maxLength="4" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Currency Code</label>
                <select className="input" value={config.currencyCode} onChange={(e) => handleConfigChange('currencyCode', e.target.value)}>
                  <option value="INR">INR (Indian Rupee)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                  <option value="AUD">AUD (Australian Dollar)</option>
                  <option value="CAD">CAD (Canadian Dollar)</option>
                </select>
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Currency Symbol</label>
                <input type="text" className="input" value={config.currencySymbol} onChange={(e) => handleConfigChange('currencySymbol', e.target.value)} placeholder="₹" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Tax Type</label>
                <select className="input" value={config.taxType} onChange={(e) => handleConfigChange('taxType', e.target.value)}>
                  <option value="GST">GST (Goods & Services Tax)</option>
                  <option value="VAT">VAT (Value Added Tax)</option>
                  <option value="Sales Tax">Sales Tax</option>
                  <option value="None">None (Tax-Free)</option>
                </select>
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Tax Label on Bill</label>
                <input type="text" className="input" value={config.taxLabel} onChange={(e) => handleConfigChange('taxLabel', e.target.value)} placeholder="GST or VAT" />
              </div>
            </div>
          </div>
        </div>

        {/* Security master PIN change */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>security</span>
            {isOwner ? 'Security Credentials (Owner)' : 'Security Credentials (Manager)'}
          </h3>
          <div className="input-group" style={{ maxWidth: '320px' }}>
            <label htmlFor="adminPin">{isOwner ? 'Admin Lock PIN' : 'Personal Manager PIN'} (leave blank to keep)</label>
            <input
              type="password"
              id="adminPin"
              className="input"
              value={newPin}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]{0,4}$/.test(val)) setNewPin(val);
              }}
              maxLength={4}
              placeholder="4 digits"
              style={{
                background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-glass)',
                color: 'var(--text-primary)', letterSpacing: '0.5em', textAlign: 'center',
                fontWeight: 800, fontSize: '1.25rem', padding: '12px 14px',
                borderRadius: 'var(--radius-md)', width: '100%', outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Access permissions */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>admin_panel_settings</span>
            Access & Permissions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', padding: '6px 16px' }}>
              {[
                { id: 'requirePinForOrder', label: 'Require PIN for every order' },
                { id: 'allowManagerAdmin', label: 'Allow managers to access admin panel' },
                { id: 'allowCashierVoid', label: 'Allow cashiers to void/refund orders' },
                { id: 'autoLockTerminal', label: 'Auto-lock terminal after inactivity' }
              ].map(toggle => (
                <div key={toggle.id} className="settings-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="settings-toggle-row-label" style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>{toggle.label}</span>
                  <label className="settings-toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                    <input
                      type="checkbox"
                      className="receipt-toggle"
                      checked={config[toggle.id] === 'true' || config[toggle.id] === true}
                      onChange={(e) => handleConfigChange(toggle.id, e.target.checked ? 'true' : 'false')}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span className="settings-toggle-track" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: config[toggle.id] === 'true' || config[toggle.id] === true ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)', borderRadius: '34px', transition: '0.2s' }}></span>
                    <span className="settings-toggle-thumb" style={{ position: 'absolute', height: '16px', width: '16px', left: config[toggle.id] === 'true' || config[toggle.id] === true ? '19px' : '3px', bottom: '3px', background: 'white', borderRadius: '50%', transition: '0.2s' }}></span>
                  </label>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '200px', opacity: config.autoLockTerminal === 'true' ? 1 : 0.4 }}>
                <label>Auto-Lock Inactivity Timeout</label>
                <select className="input" disabled={config.autoLockTerminal !== 'true'} value={config.autoLockTimeout} onChange={(e) => handleConfigChange('autoLockTimeout', e.target.value)}>
                  <option value="5">5 Minutes</option>
                  <option value="10">10 Minutes</option>
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                </select>
              </div>

              <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                <label>Active Session Duration</label>
                <select className="input" value={config.sessionDuration} onChange={(e) => handleConfigChange('sessionDuration', e.target.value)}>
                  <option value="4">4 Hours</option>
                  <option value="8">8 Hours (Standard)</option>
                  <option value="12">12 Hours</option>
                  <option value="24">24 Hours</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Theme Preferences */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>palette</span>
            Theme Preference
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0', fontWeight: 500 }}>
            Select your preferred display theme for the console terminal.
          </p>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            {[
              { id: 'dark', label: 'Dark Mode', icon: 'dark_mode' },
              { id: 'light', label: 'Light Mode', icon: 'light_mode' },
              { id: 'system', label: 'System Theme', icon: 'computer' }
            ].map(theme => {
              const active = config.app_theme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => {
                    playSound(700, 60);
                    handleConfigChange('app_theme', theme.id);
                  }}
                  className={`btn btn-theme-option ${active ? 'active' : ''}`}
                  style={{
                    flex: 1, minHeight: '44px', display: 'inline-flex', alignItems: 'center',
                    justifyContent: 'center', gap: '8px', borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                    background: active ? 'rgba(255,94,54,0.12)' : 'rgba(0,0,0,0.15)',
                    color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
                    fontWeight: active ? '700' : '500', cursor: 'pointer'
                  }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>{theme.icon}</span>
                  {theme.label}
                </button>
              );
            })}
          </div>
          {/* Colors preview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700 }}>BACKGROUND</span>
              <div style={{ width: '100%', height: '32px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', background: config.app_theme === 'light' ? '#F8F9FC' : '#040406', transition: 'background 0.3s' }}></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700 }}>SURFACE</span>
              <div style={{ width: '100%', height: '32px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', background: config.app_theme === 'light' ? '#FFFFFF' : '#0B0B0F', transition: 'background 0.3s' }}></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700 }}>TEXT COLOR</span>
              <div style={{ width: '100%', height: '32px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, background: config.app_theme === 'light' ? '#F1F3F9' : '#0E0E14', color: config.app_theme === 'light' ? '#0F172A' : '#F9FAFB', transition: 'background 0.3s, color 0.3s' }}>Aa</div>
            </div>
          </div>
        </div>

        {/* Supabase Synchronization setup */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>cloud_sync</span>
            Cloud Synchronization (Supabase)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="input-group">
              <label>Supabase Project URL</label>
              <input type="url" className="input" value={config.supabaseUrl} onChange={(e) => handleConfigChange('supabaseUrl', e.target.value)} placeholder="https://your-project.supabase.co" />
            </div>

            <div className="input-group">
              <label>Supabase Anon Key</label>
              <input type="password" className="input" value={config.supabaseKey} onChange={(e) => handleConfigChange('supabaseKey', e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIs..." />
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Staff Cloud Email</label>
                <input type="email" className="input" value={config.supabaseEmail} onChange={(e) => handleConfigChange('supabaseEmail', e.target.value)} placeholder="owner@example.com" />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>Staff Cloud Password</label>
                <input type="password" className="input" value={supabasePassword} onChange={(e) => setSupabasePassword(e.target.value)} placeholder="Enter to sign in device" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
              <button onClick={handleTestCloudSync} disabled={syncTesting} className="btn btn-secondary" style={{ flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {syncTesting ? <span className="material-symbols-rounded animate-spin">sync</span> : <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>sync</span>}
                {syncTesting ? 'Testing...' : 'Test Cloud Connection'}
              </button>
              <button onClick={handleCloudSignIn} className="btn btn-primary" style={{ flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>login</span>
                Staff Cloud Sign In
              </button>
              <button onClick={handleCloudSignOut} className="btn btn-secondary" style={{ flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>logout</span>
                Sign Out Cloud
              </button>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Staff cloud password is used only for Supabase Auth session creation and is never saved.
            </p>
          </div>
        </div>

        {/* Google Drive setup */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>cloud_upload</span>
            Google Drive Integration
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Backup business reports directly to your Google Drive in an organized folder structure.
            </p>
            <div className="input-group">
              <label>Google Client ID</label>
              <input type="text" className="input" value={config.googleClientId} onChange={(e) => handleConfigChange('googleClientId', e.target.value)} placeholder="e.g. 1234-abc.apps.googleusercontent.com" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Drive Connection Status</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>{driveConnected ? 'Connected to Google Drive' : 'Disconnected'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: driveConnected ? 'var(--color-success)' : 'var(--text-muted)' }}>
                  {driveConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
                <span className={`status-dot ${driveConnected ? 'online' : 'offline'}`} style={{ width: '8px', height: '8px' }}></span>
              </div>
            </div>

            <button onClick={handleToggleDrive} className={`btn ${driveConnected ? 'btn-danger' : 'btn-primary'}`} style={{ minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>cloud_sync</span>
              {driveConnected ? 'Disconnect Google Drive' : 'Connect Google Drive'}
            </button>

            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', padding: '6px 16px' }}>
              <div className="settings-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <span className="settings-toggle-row-label" style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>Auto-upload Reports to Drive</span>
                <label className="settings-toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                  <input
                    type="checkbox"
                    className="receipt-toggle"
                    checked={config.autoUploadToDrive === 'true' || config.autoUploadToDrive === true}
                    onChange={(e) => handleConfigChange('autoUploadToDrive', e.target.checked ? 'true' : 'false')}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="settings-toggle-track" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: config.autoUploadToDrive === 'true' || config.autoUploadToDrive === true ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)', borderRadius: '34px', transition: '0.2s' }}></span>
                  <span className="settings-toggle-thumb" style={{ position: 'absolute', height: '16px', width: '16px', left: config.autoUploadToDrive === 'true' || config.autoUploadToDrive === true ? '19px' : '3px', bottom: '3px', background: 'white', borderRadius: '50%', transition: '0.2s' }}></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Data backups & CSV exports */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '10px' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>backup</span>
            Data Backup & Export
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Export all store configurations as a JSON file, or orders list for custom analysis.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={handleExportJSON} className="btn btn-secondary" style={{ flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>download</span>
                Full Backup (JSON)
              </button>
              <button onClick={handleExportCSV} className="btn btn-secondary" style={{ flex: 1, minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>table_view</span>
                Orders CSV (30d)
              </button>
            </div>
            <div>
              <input ref={importFileInputRef} type="file" accept=".json" onChange={handleImportRestore} style={{ display: 'none' }} />
              <button onClick={() => importFileInputRef.current?.click()} className="btn btn-secondary" style={{ width: '100%', minHeight: '40px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)', color: '#F59E0B' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>upload</span>
                Restore from Backup
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Live Previews */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'sticky', top: '10px' }}>
        
        {/* Advanced thermal print settings */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>tune</span>
            Advanced Print Configuration
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="input-group">
              <label>Paper Roll Size</label>
              <select className="input" value={config.printerWidth} onChange={(e) => handleConfigChange('printerWidth', e.target.value)}>
                <option value="58">58mm (32 chars) — Standard Thermal</option>
                <option value="76">76mm (42 chars) — 3-inch Thermal</option>
                <option value="80">80mm (48 chars) — Wide Thermal</option>
                <option value="A4">A4 (210mm) — Full Page (browser print)</option>
              </select>
            </div>

            <div className="input-group">
              <label>Print Density</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['light', 'normal', 'bold'].map(d => {
                  const active = config.printDensity === d;
                  return (
                    <button
                      key={d}
                      onClick={() => handleConfigChange('printDensity', d)}
                      className={`btn btn-density-option ${active ? 'active' : ''}`}
                      style={{
                        flex: 1, minHeight: '38px', fontSize: 'var(--text-xs)', fontWeight: active ? 700 : 500,
                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                        background: active ? 'rgba(255,94,54,0.12)' : 'rgba(0,0,0,0.2)',
                        color: active ? 'var(--color-primary)' : 'var(--text-secondary)'
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="input-group" style={{ maxWidth: '200px' }}>
              <label>Copies Per Order</label>
              <input type="number" className="input" min="1" max="5" value={config.printCopies} onChange={(e) => handleConfigChange('printCopies', e.target.value)} />
            </div>

            <div>
              <label style={{ marginBottom: '12px', display: 'block' }}>Receipt Content</label>
              <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', padding: '6px 16px' }}>
                {[
                  { id: 'showLogoOnReceipt', label: 'Show Restaurant Logo / Header' },
                  { id: 'showAddressOnReceipt', label: 'Show Address on Receipt' },
                  { id: 'showPhoneOnReceipt', label: 'Show Phone on Receipt' },
                  { id: 'showGstinOnReceipt', label: 'Show GSTIN on Receipt' },
                  { id: 'showFssaiOnReceipt', label: 'Show FSSAI on Receipt' },
                  { id: 'showNotesOnReceipt', label: 'Show Order Notes' },
                  { id: 'showFooterOnReceipt', label: 'Show Footer Message' },
                  { id: 'autoPrintOnConfirm', label: 'Auto-print on Order Confirm' }
                ].map(toggle => (
                  <div key={toggle.id} className="settings-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="settings-toggle-row-label" style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>{toggle.label}</span>
                    <label className="settings-toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                      <input
                        type="checkbox"
                        className="receipt-toggle"
                        checked={config[toggle.id] === 'true' || config[toggle.id] === true}
                        onChange={(e) => handleConfigChange(toggle.id, e.target.checked ? 'true' : 'false')}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span className="settings-toggle-track" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: config[toggle.id] === 'true' || config[toggle.id] === true ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)', borderRadius: '34px', transition: '0.2s' }}></span>
                      <span className="settings-toggle-thumb" style={{ position: 'absolute', height: '16px', width: '16px', left: config[toggle.id] === 'true' || config[toggle.id] === true ? '19px' : '3px', bottom: '3px', background: 'white', borderRadius: '50%', transition: '0.2s' }}></span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Invoice configuration and template selection */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>palette</span>
            Bill & Invoice Designer
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0', fontWeight: 500 }}>
            Customize the look and feel of printed A4 invoices.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                <label>Invoice Template Style</label>
                <select className="input" value={config.invoiceTemplate} onChange={(e) => handleConfigChange('invoiceTemplate', e.target.value)}>
                  <option value="minimalist">Modern Minimalist (Sleek & Airy)</option>
                  <option value="luxury">Luxury Gold / Royal (Elegant Serif)</option>
                  <option value="executive">Executive Navy / Bold (Corporate Grid)</option>
                  <option value="chic">Chic Rose / Peach (Aesthetic Cafe)</option>
                </select>
              </div>

              <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                <label>Invoice Font Selection</label>
                <select className="input" value={config.invoiceFontFamily} onChange={(e) => handleConfigChange('invoiceFontFamily', e.target.value)}>
                  <option value="sans-serif">Inter / Plus Jakarta Sans (Modern)</option>
                  <option value="serif">EB Garamond / Georgia (Serif)</option>
                  <option value="slab">Roboto Slab (Executive)</option>
                  <option value="monospace">JetBrains Mono / Courier (Retro)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="input-group" style={{ flex: 1.5, minWidth: '200px' }}>
                <label>Invoice Document Title</label>
                <input type="text" className="input" value={config.invoiceTitle} onChange={(e) => handleConfigChange('invoiceTitle', e.target.value)} placeholder="e.g. TAX INVOICE" />
              </div>

              <div className="input-group" style={{ flex: 0.5, minWidth: '150px' }}>
                <label>Brand Accent Color</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={config.invoicePrimaryColor}
                    onChange={(e) => handleConfigChange('invoicePrimaryColor', e.target.value)}
                    style={{ border: '1px solid var(--border-glass)', background: 'none', width: '42px', height: '42px', borderRadius: 'var(--radius-md)', cursor: 'pointer', padding: 0 }}
                  />
                  <input
                    type="text"
                    className="input"
                    value={config.invoicePrimaryColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-F]{0,6}$/i.test(val)) handleConfigChange('invoicePrimaryColor', val);
                    }}
                    placeholder="#FF5E36"
                    style={{ maxWidth: '90px', textTransform: 'uppercase', textAlign: 'center' }}
                  />
                </div>
              </div>
            </div>

            <div className="input-group">
              <label>Logo Image URL (Optional)</label>
              <input type="url" className="input" value={config.invoiceLogoUrl} onChange={(e) => handleConfigChange('invoiceLogoUrl', e.target.value)} placeholder="e.g. https://yoursite.com/logo.png" />
            </div>

            <div className="input-group">
              <label>Terms & Conditions</label>
              <textarea className="input" value={config.invoiceTerms} onChange={(e) => handleConfigChange('invoiceTerms', e.target.value)} placeholder="Enter terms of sale..." style={{ minHeight: '80px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
            </div>

            <div className="input-group" style={{ maxWidth: '320px' }}>
              <label>Signature Label Text</label>
              <input type="text" className="input" value={config.invoiceSignatureText} onChange={(e) => handleConfigChange('invoiceSignatureText', e.target.value)} placeholder="Authorized Signatory" />
            </div>

            <div>
              <label style={{ marginBottom: '12px', display: 'block' }}>Invoice Layout Elements</label>
              <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', padding: '6px 16px' }}>
                {[
                  { id: 'invoiceShowUpiQr', label: 'Show Dynamic UPI Payment QR Code' },
                  { id: 'invoiceShowGrid', label: 'Show Grid Lines in Items Table' },
                  { id: 'invoiceShowSignature', label: 'Show Signature Block' },
                  { id: 'invoiceShowWatermark', label: 'Show Subtle Watermark' }
                ].map(toggle => (
                  <div key={toggle.id} className="settings-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="settings-toggle-row-label" style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>{toggle.label}</span>
                    <label className="settings-toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px' }}>
                      <input
                        type="checkbox"
                        className="receipt-toggle"
                        checked={config[toggle.id] === 'true' || config[toggle.id] === true}
                        onChange={(e) => handleConfigChange(toggle.id, e.target.checked ? 'true' : 'false')}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span className="settings-toggle-track" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: config[toggle.id] === 'true' || config[toggle.id] === true ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)', borderRadius: '34px', transition: '0.2s' }}></span>
                      <span className="settings-toggle-thumb" style={{ position: 'absolute', height: '16px', width: '16px', left: config[toggle.id] === 'true' || config[toggle.id] === true ? '19px' : '3px', bottom: '3px', background: 'white', borderRadius: '50%', transition: '0.2s' }}></span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic preview block */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>preview</span>
            Live Document Preview
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0', fontWeight: 500 }}>
            See how your receipts and invoices look before printing.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '14px' }}>
            <button
              onClick={() => {
                playSound(800, 60);
                setActivePreviewTab('thermal');
              }}
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 700, padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                border: `1px solid ${activePreviewTab === 'thermal' ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                background: activePreviewTab === 'thermal' ? 'rgba(255,94,54,0.1)' : 'rgba(0,0,0,0.2)',
                color: activePreviewTab === 'thermal' ? 'var(--color-primary)' : 'var(--text-secondary)'
              }}
            >
              Thermal Receipt (BLE)
            </button>
            <button
              onClick={() => {
                playSound(800, 60);
                setActivePreviewTab('invoice');
              }}
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 700, padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                border: `1px solid ${activePreviewTab === 'invoice' ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                background: activePreviewTab === 'invoice' ? 'rgba(255,94,54,0.1)' : 'rgba(0,0,0,0.2)',
                color: activePreviewTab === 'invoice' ? 'var(--color-primary)' : 'var(--text-secondary)'
              }}
            >
              Standard Invoice (A4)
            </button>
          </div>

          <div id="receipt-preview-container" style={{ display: 'flex', justifyContent: 'center', padding: '16px 0', overflowX: 'auto' }}>
            {activePreviewTab === 'thermal' ? (
              <div
                className="receipt-preview-paper"
                style={{
                  width: config.printerWidth === '58' ? '220px' : config.printerWidth === '76' ? '280px' : config.printerWidth === '80' ? '310px' : '480px',
                  fontWeight: config.printDensity === 'bold' ? '700' : config.printDensity === 'light' ? '300' : '400',
                  background: '#FFF', color: '#000', padding: '20px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)'
                }}
              >
                {thermalPreviewContent}
              </div>
            ) : (
              <iframe
                id="invoice-preview-iframe"
                srcDoc={invoiceHtml}
                style={{
                  width: '100%', maxWidth: '580px', height: '720px', border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-lg)', background: '#fff', boxShadow: '0 15px 35px rgba(0,0,0,0.4)'
                }}
              ></iframe>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
            <button onClick={handlePrintTest} disabled={!printerConnected} className="btn btn-secondary" style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 24px' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>print</span>
              Print Sample Receipt
            </button>
          </div>
        </div>

        {/* Global Floating Save Configuration Footer */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', marginBottom: '30px' }}>
          <button onClick={handleSave} className="btn btn-primary btn-block btn-lg" style={{ flex: 1, minHeight: '48px', fontSize: 'var(--text-sm)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-primary)' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>save</span>
            Save All Configurations
          </button>
        </div>

      </div>

    </div>
  );
}
