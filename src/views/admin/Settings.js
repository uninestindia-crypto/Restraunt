/**
 * SettingsView — Admin panel settings, including restaurant profile, GST, security PIN, and BLE printer connect
 */

import { db, getSetting, setSetting } from '../../db/database.js';
import { escapeHtml, showToast, playSound, vibrateDevice } from '../../utils/helpers.js';
import { printerService } from '../../services/printer.js';
import { ReceiptBuilder } from '../../services/receipt.js';
import { exportAllData, exportOrdersCSV, importData } from '../../utils/dataExport.js';
import { logDataExported } from '../../utils/activityLogger.js';
import { hashPin } from '../../utils/crypto.js';
import { signOutCloudStaff } from '../../services/supabaseClient.js';
import { authService, CLOUD_REQUIRED_ROLES } from '../../services/auth.js';

export class SettingsView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.config = {};
    this._previewDebounceTimer = null;
    this.activePreviewTab = 'thermal';
  }

  async mount(container) {
    this.container = container;
    await this.loadConfig();
    this.render();
    this.bindEvents();
    this.setupPrinterStateListener();
  }

  async loadConfig() {
    try {
      const keys = [
        'restaurantName',
        'restaurantTagline',
        'restaurantPhone',
        'restaurantAddress',
        'upiId',
        'upiName',
        'gstPercent',
        'printerWidth',
        'adminPin',
        'adminPinHash',
        'orderNumberPrefix',
        'supabaseUrl',
        'supabaseKey',
        'supabaseEmail',
        // New profile fields
        'gstin',
        'fssaiNumber',
        'restaurantEmail',
        'restaurantWebsite',
        'operatingHours',
        'receiptFooter',
        // New print settings
        'printDensity',
        'printCopies',
        // Receipt content toggles
        'showLogoOnReceipt',
        'showAddressOnReceipt',
        'showPhoneOnReceipt',
        'showGstinOnReceipt',
        'showFssaiOnReceipt',
        'showNotesOnReceipt',
        'showFooterOnReceipt',
        'autoPrintOnConfirm',
        // Google Drive settings
        'googleClientId',
        'autoUploadToDrive',
        // Premium invoice designer settings
        'invoiceTemplate',
        'invoicePrimaryColor',
        'invoiceFontFamily',
        'invoiceLogoUrl',
        'invoiceTitle',
        'invoiceTerms',
        'invoiceShowSignature',
        'invoiceSignatureText',
        'invoiceShowGrid',
        'invoiceShowWatermark',
        'invoiceShowUpiQr',
        // Multi-currency and dynamic tax settings
        'currencyCode',
        'currencySymbol',
        'taxType',
        'taxLabel',
        // Enterprise Access Controls
        'requirePinForOrder',
        'allowManagerAdmin',
        'allowCashierVoid',
        'autoLockTerminal',
        'autoLockTimeout',
        'sessionDuration',
        'app_theme'
      ];

      for (const key of keys) {
        this.config[key] = await getSetting(key) || '';
      }

      // Always align adminPinHash with an active owner that has a real PIN hash.
      const owner = await db.staff
        .where('role')
        .equals('owner')
        .and(s => (s.isActive === 1 || s.isActive === true) && /^[0-9a-f]{64}$/.test(s.pinHash || ''))
        .first();
      if (owner && owner.pinHash && owner.pinHash !== this.config.adminPinHash) {
        await setSetting('adminPinHash', owner.pinHash);
        this.config.adminPinHash = owner.pinHash;
      }

      // Set sensible defaults for toggles (default ON for most)
      const defaultOnToggles = ['showLogoOnReceipt', 'showAddressOnReceipt', 'showPhoneOnReceipt', 'showFooterOnReceipt'];
      for (const t of defaultOnToggles) {
        if (this.config[t] === '') this.config[t] = 'true';
      }
      const defaultOffToggles = ['showGstinOnReceipt', 'showFssaiOnReceipt', 'showNotesOnReceipt', 'autoPrintOnConfirm', 'autoUploadToDrive'];
      for (const t of defaultOffToggles) {
        if (this.config[t] === '') this.config[t] = 'false';
      }
      if (!this.config.printerWidth) this.config.printerWidth = '58';
      if (!this.config.printDensity) this.config.printDensity = 'normal';
      if (!this.config.printCopies) this.config.printCopies = '1';
      if (!this.config.receiptFooter) this.config.receiptFooter = '';

      // Sensible defaults for invoice settings
      if (!this.config.invoiceTemplate) this.config.invoiceTemplate = 'minimalist';
      if (!this.config.invoicePrimaryColor) this.config.invoicePrimaryColor = '#FF5E36';
      if (!this.config.invoiceFontFamily) this.config.invoiceFontFamily = 'sans-serif';
      if (!this.config.invoiceTitle) this.config.invoiceTitle = 'TAX INVOICE';
      if (!this.config.invoiceTerms) this.config.invoiceTerms = '1. Goods once sold cannot be returned.\n2. Please check bill before leaving.';
      if (this.config.invoiceShowSignature === '') this.config.invoiceShowSignature = 'false';
      if (!this.config.invoiceSignatureText) this.config.invoiceSignatureText = 'Authorized Signatory';
      if (this.config.invoiceShowGrid === '') this.config.invoiceShowGrid = 'true';
      if (this.config.invoiceShowWatermark === '') this.config.invoiceShowWatermark = 'false';
      if (this.config.invoiceShowUpiQr === '') this.config.invoiceShowUpiQr = 'true';

      // Defaults for currency and tax
      if (!this.config.currencyCode) this.config.currencyCode = 'INR';
      if (!this.config.currencySymbol) this.config.currencySymbol = '₹';
      if (!this.config.taxType) this.config.taxType = 'GST';
      if (!this.config.taxLabel) this.config.taxLabel = 'GST';

      // Enterprise defaults
      if (this.config.requirePinForOrder === '') this.config.requirePinForOrder = 'false';
      if (this.config.allowManagerAdmin === '') this.config.allowManagerAdmin = 'true';
      if (this.config.allowCashierVoid === '') this.config.allowCashierVoid = 'false';
      if (this.config.autoLockTerminal === '') this.config.autoLockTerminal = 'false';
      if (!this.config.autoLockTimeout) this.config.autoLockTimeout = '5';
      if (!this.config.sessionDuration) this.config.sessionDuration = '8';
      if (!this.config.app_theme) this.config.app_theme = localStorage.getItem('app_theme') || 'dark';
    } catch (e) {
      console.error('Failed to load system settings:', e);
    }
  }

  /** Helper: generates class name instead of style */
  _inputStyle(extra = '') {
    return extra;
  }

  /** Helper: returns empty for labels as class is used directly */
  _labelStyle() {
    return '';
  }

  /** Helper: generates the standard card opening with css class */
  _cardOpen() {
    return `<div class="settings-card">`;
  }

  /** Helper: generates card heading with css class */
  _cardHeading(icon, title) {
    return `<h3 class="settings-card-heading">
      <span class="material-symbols-rounded settings-card-heading-icon">${icon}</span>
      ${title}
    </h3>`;
  }

  render() {
    const isPrinterSupported = printerService.isSupported();
    const isPrinterConnected = printerService.isConnected;

    // Escape values for safe HTML attribute injection
    const esc = (v) => escapeHtml(v || '');

    this.container.innerHTML = `
      <div class="settings-container">
        
        <!-- Bluetooth Printer Section -->
        ${this._cardOpen()}
          ${this._cardHeading('print', 'Bluetooth Thermal Printer Setup')}
          
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="
              display: flex; 
              justify-content: space-between; 
              align-items: center; 
              background: rgba(0,0,0,0.2); 
              padding: 14px 18px; 
              border-radius: var(--radius-lg); 
              border: 1px solid var(--border-glass);
            ">
              <div>
                <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">
                  Web Bluetooth API Status
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 4px; font-weight: 500; line-height: 1.4;">
                  ${isPrinterSupported ? 'Supported in this browser (Chrome / Edge / Opera)' : '⚠️ Not supported. Use Google Chrome on Android.'}
                </div>
              </div>
              <span class="badge ${isPrinterSupported ? 'badge-success' : 'badge-danger'}" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700;">
                ${isPrinterSupported ? 'Ready' : 'Not Supported'}
              </span>
            </div>

            <div style="
              display: flex; 
              justify-content: space-between; 
              align-items: center; 
              background: rgba(0,0,0,0.2); 
              padding: 14px 18px; 
              border-radius: var(--radius-lg); 
              border: 1px solid var(--border-glass);
            ">
              <div>
                <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">
                  Printer Connection Status
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 4px; font-weight: 500;" id="printer-device-info">
                  ${isPrinterConnected ? 'Printer is connected' : 'No printer connected'}
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="printer-state-text" style="
                  font-family: 'Plus Jakarta Sans', sans-serif;
                  font-size: var(--text-xs); 
                  font-weight: 800; 
                  color: ${isPrinterConnected ? 'var(--color-success)' : 'var(--text-muted)'};
                ">
                  ${isPrinterConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
                <span class="status-dot ${isPrinterConnected ? 'online' : 'offline'}" id="printer-state-dot" style="width: 8px; height: 8px;"></span>
              </div>
            </div>

            <!-- Printer Actions -->
            <div style="display: flex; gap: 12px; margin-top: 4px; flex-wrap: wrap;">
              <button class="btn ${isPrinterConnected ? 'btn-danger' : 'btn-primary'}" id="btn-toggle-printer" ${!isPrinterSupported ? 'disabled' : ''} style="
                flex: 1;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">print</span>
                <span id="btn-printer-text">${isPrinterConnected ? 'Disconnect Printer' : 'Connect BLE Printer'}</span>
              </button>
              
              <button class="btn btn-secondary" id="btn-print-test" ${!isPrinterConnected ? 'disabled' : ''} style="
                flex: 1;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                border: 1px solid var(--border-glass);
                background: rgba(255,255,255,0.02);
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">receipt</span>
                Print Test Page
              </button>
            </div>
          </div>
        </div>

        <!-- Restaurant Profile Section -->
        ${this._cardOpen()}
          ${this._cardHeading('storefront', 'Restaurant Profile & Branding')}
          
          <div style="display: flex; flex-direction: column; gap: 18px;">
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 240px;">
                <label for="restaurantName" style="${this._labelStyle()}">Restaurant Name</label>
                <input type="text" id="restaurantName" class="input" value="${esc(this.config.restaurantName)}" placeholder="e.g. The Taste" style="${this._inputStyle()}">
              </div>
              <div class="input-group" style="flex: 1; min-width: 240px;">
                <label for="restaurantTagline" style="${this._labelStyle()}">Tagline / Subtitle</label>
                <input type="text" id="restaurantTagline" class="input" value="${esc(this.config.restaurantTagline)}" placeholder="e.g. Fast Food & Chinese" style="${this._inputStyle()}">
              </div>
            </div>

            <div class="input-group">
              <label for="restaurantAddress" style="${this._labelStyle()}">Store Address (printed on receipt)</label>
              <input type="text" id="restaurantAddress" class="input" value="${esc(this.config.restaurantAddress)}" placeholder="e.g. Counter 4, Sector 5, Kolkata" style="${this._inputStyle()}">
            </div>

            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="restaurantPhone" style="${this._labelStyle()}">Contact Phone Number</label>
                <input type="tel" id="restaurantPhone" class="input" value="${esc(this.config.restaurantPhone)}" placeholder="e.g. +91 98765 43210" style="${this._inputStyle()}">
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="restaurantEmail" style="${this._labelStyle()}">Email Address</label>
                <input type="email" id="restaurantEmail" class="input" value="${esc(this.config.restaurantEmail)}" placeholder="e.g. hello@thetaste.co.in" style="${this._inputStyle()}">
              </div>
            </div>

            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="restaurantWebsite" style="${this._labelStyle()}">Website / Domain</label>
                <input type="url" id="restaurantWebsite" class="input" value="${esc(this.config.restaurantWebsite)}" placeholder="thetaste.co.in" style="${this._inputStyle()}">
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="operatingHours" style="${this._labelStyle()}">Operating Hours</label>
                <input type="text" id="operatingHours" class="input" value="${esc(this.config.operatingHours)}" placeholder="10:00 AM - 11:00 PM" style="${this._inputStyle()}">
              </div>
            </div>

            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="gstin" style="${this._labelStyle()}">GSTIN / Tax ID</label>
                <input type="text" id="gstin" class="input" value="${esc(this.config.gstin)}" placeholder="e.g. 22AAAAA0000A1Z5" style="${this._inputStyle()}">
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="fssaiNumber" style="${this._labelStyle()}">FSSAI License Number</label>
                <input type="text" id="fssaiNumber" class="input" value="${esc(this.config.fssaiNumber)}" placeholder="e.g. 12345678901234" style="${this._inputStyle()}">
              </div>
            </div>

            <div class="input-group">
              <label for="receiptFooter" style="${this._labelStyle()}">Receipt Footer Message</label>
              <input type="text" id="receiptFooter" class="input" value="${esc(this.config.receiptFooter)}" placeholder="Thank you! Visit again!" style="${this._inputStyle()}">
            </div>
          </div>
        </div>

        <!-- Payments & Tax Configuration -->
        ${this._cardOpen()}
          ${this._cardHeading('account_balance_wallet', 'Payments & Tax Setup')}
          
          <div style="display: flex; flex-direction: column; gap: 18px;">
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1.5; min-width: 240px;">
                <label for="upiId" style="${this._labelStyle()}">UPI ID / Virtual Payment Address (VPA)</label>
                <input type="text" id="upiId" class="input" value="${esc(this.config.upiId)}" placeholder="e.g. thetaste@upi" style="${this._inputStyle('border: 1px solid rgba(255, 94, 54, 0.25);')}">
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="upiName" style="${this._labelStyle()}">Merchant Name</label>
                <input type="text" id="upiName" class="input" value="${esc(this.config.upiName)}" placeholder="e.g. The Taste Store" style="${this._inputStyle()}">
              </div>
            </div>
            
            <p style="font-size: var(--text-xs); color: #FF8960; margin-top: -6px; line-height: 1.5; font-weight: 500;">
              * Critical: Make sure the UPI VPA is correct. Scanning customers will pay directly to this account.
            </p>

            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="gstPercent" style="${this._labelStyle()}">Tax Rate (%)</label>
                <input type="number" id="gstPercent" class="input" value="${esc(this.config.gstPercent)}" placeholder="5" min="0" step="0.5" style="${this._inputStyle()}">
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="orderNumberPrefix" style="${this._labelStyle()}">Order Prefix</label>
                <input type="text" id="orderNumberPrefix" class="input" value="${esc(this.config.orderNumberPrefix)}" placeholder="TT" maxlength="4" style="${this._inputStyle()}">
              </div>
            </div>

            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="currencyCode" style="${this._labelStyle()}">Currency Code</label>
                <select id="currencyCode" class="input" style="${this._inputStyle()}">
                  <option value="INR" ${this.config.currencyCode === 'INR' ? 'selected' : ''}>INR (Indian Rupee)</option>
                  <option value="USD" ${this.config.currencyCode === 'USD' ? 'selected' : ''}>USD (US Dollar)</option>
                  <option value="EUR" ${this.config.currencyCode === 'EUR' ? 'selected' : ''}>EUR (Euro)</option>
                  <option value="GBP" ${this.config.currencyCode === 'GBP' ? 'selected' : ''}>GBP (British Pound)</option>
                  <option value="AUD" ${this.config.currencyCode === 'AUD' ? 'selected' : ''}>AUD (Australian Dollar)</option>
                  <option value="CAD" ${this.config.currencyCode === 'CAD' ? 'selected' : ''}>CAD (Canadian Dollar)</option>
                </select>
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="currencySymbol" style="${this._labelStyle()}">Currency Symbol</label>
                <input type="text" id="currencySymbol" class="input" value="${esc(this.config.currencySymbol)}" placeholder="₹" style="${this._inputStyle()}">
              </div>
            </div>

            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="taxType" style="${this._labelStyle()}">Tax Type</label>
                <select id="taxType" class="input" style="${this._inputStyle()}">
                  <option value="GST" ${this.config.taxType === 'GST' ? 'selected' : ''}>GST (Goods & Services Tax)</option>
                  <option value="VAT" ${this.config.taxType === 'VAT' ? 'selected' : ''}>VAT (Value Added Tax)</option>
                  <option value="Sales Tax" ${this.config.taxType === 'Sales Tax' ? 'selected' : ''}>Sales Tax</option>
                  <option value="None" ${this.config.taxType === 'None' ? 'selected' : ''}>None (Tax-Free)</option>
                </select>
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="taxLabel" style="${this._labelStyle()}">Tax Label (displayed on bill)</label>
                <input type="text" id="taxLabel" class="input" value="${esc(this.config.taxLabel)}" placeholder="e.g. GST or VAT" style="${this._inputStyle()}">
              </div>
            </div>
          </div>
        </div>

        <!-- Advanced Print Configuration -->
        ${this._cardOpen()}
          ${this._cardHeading('tune', 'Advanced Print Configuration')}

          <div style="display: flex; flex-direction: column; gap: 18px;">
            <!-- Paper Size Selection -->
            <div class="input-group">
              <label for="printerWidth" style="${this._labelStyle()}">Paper Roll Size</label>
              <select id="printerWidth" class="input receipt-toggle" style="${this._inputStyle()}">
                <option value="58" ${this.config.printerWidth === '58' ? 'selected' : ''}>58mm (32 chars) — Standard Thermal</option>
                <option value="76" ${this.config.printerWidth === '76' ? 'selected' : ''}>76mm (42 chars) — 3-inch Thermal</option>
                <option value="80" ${this.config.printerWidth === '80' ? 'selected' : ''}>80mm (48 chars) — Wide Thermal</option>
                <option value="A4" ${this.config.printerWidth === 'A4' ? 'selected' : ''}>A4 (210mm) — Full Page (browser print)</option>
              </select>
            </div>

            <!-- Print Density -->
            <div class="input-group">
              <label for="printDensity" style="${this._labelStyle()}">Print Density</label>
              <div style="display: flex; gap: 8px;">
                ${['light', 'normal', 'bold'].map(d => `
                  <button type="button" class="btn btn-density-option ${this.config.printDensity === d ? 'active' : ''}" data-density="${d}" style="
                    flex: 1;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-weight: ${this.config.printDensity === d ? '700' : '500'};
                    font-size: var(--text-xs);
                    min-height: 38px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--radius-md);
                    border: 1px solid ${this.config.printDensity === d ? 'var(--color-primary)' : 'var(--border-glass)'};
                    background: ${this.config.printDensity === d ? 'rgba(255,94,54,0.12)' : 'rgba(0,0,0,0.2)'};
                    color: ${this.config.printDensity === d ? 'var(--color-primary)' : 'var(--text-secondary)'};
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-transform: capitalize;
                  ">${d}</button>
                `).join('')}
              </div>
              <input type="hidden" id="printDensity" value="${esc(this.config.printDensity)}">
            </div>

            <!-- Copies per order -->
            <div class="input-group" style="max-width: 200px;">
              <label for="printCopies" style="${this._labelStyle()}">Copies Per Order</label>
              <input type="number" id="printCopies" class="input receipt-toggle" value="${esc(this.config.printCopies)}" min="1" max="5" step="1" style="${this._inputStyle()}">
            </div>

            <!-- Receipt Content Toggles -->
            <div>
              <label style="${this._labelStyle()} margin-bottom: 12px;">Receipt Content</label>
              <div style="
                background: rgba(0,0,0,0.15);
                border-radius: var(--radius-lg);
                border: 1px solid var(--border-glass);
                padding: 6px 16px;
              ">
                ${this._buildToggleRow('showLogoOnReceipt', 'Show Restaurant Logo / Header', this.config.showLogoOnReceipt)}
                ${this._buildToggleRow('showAddressOnReceipt', 'Show Address on Receipt', this.config.showAddressOnReceipt)}
                ${this._buildToggleRow('showPhoneOnReceipt', 'Show Phone on Receipt', this.config.showPhoneOnReceipt)}
                ${this._buildToggleRow('showGstinOnReceipt', 'Show GSTIN on Receipt', this.config.showGstinOnReceipt)}
                ${this._buildToggleRow('showFssaiOnReceipt', 'Show FSSAI on Receipt', this.config.showFssaiOnReceipt)}
                ${this._buildToggleRow('showNotesOnReceipt', 'Show Order Notes', this.config.showNotesOnReceipt)}
                ${this._buildToggleRow('showFooterOnReceipt', 'Show Footer Message', this.config.showFooterOnReceipt)}
                ${this._buildToggleRow('autoPrintOnConfirm', 'Auto-print on Order Confirm', this.config.autoPrintOnConfirm)}
              </div>
            </div>
          </div>
        </div>

        <!-- Bill & Invoice Designer -->
        ${this._cardOpen()}
          ${this._cardHeading('palette', 'Bill & Invoice Designer')}
          <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: -8px 0 16px 0; font-weight: 500;">
            Customize the look and feel of the printed A4/standard invoices.
          </p>

          <div style="display: flex; flex-direction: column; gap: 18px;">
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 240px;">
                <label for="invoiceTemplate" style="${this._labelStyle()}">Invoice Template Style</label>
                <select id="invoiceTemplate" class="input invoice-designer-input" style="${this._inputStyle()}">
                  <option value="minimalist" ${this.config.invoiceTemplate === 'minimalist' ? 'selected' : ''}>Modern Minimalist (Sleek & Airy)</option>
                  <option value="luxury" ${this.config.invoiceTemplate === 'luxury' ? 'selected' : ''}>Luxury Gold / Royal (Elegant Serif)</option>
                  <option value="executive" ${this.config.invoiceTemplate === 'executive' ? 'selected' : ''}>Executive Navy / Bold (Corporate Grid)</option>
                  <option value="chic" ${this.config.invoiceTemplate === 'chic' ? 'selected' : ''}>Chic Rose / Peach (Aesthetic Cafe)</option>
                </select>
              </div>

              <div class="input-group" style="flex: 1; min-width: 240px;">
                <label for="invoiceFontFamily" style="${this._labelStyle()}">Invoice Font Selection</label>
                <select id="invoiceFontFamily" class="input invoice-designer-input" style="${this._inputStyle()}">
                  <option value="sans-serif" ${this.config.invoiceFontFamily === 'sans-serif' ? 'selected' : ''}>Inter / Plus Jakarta Sans (Modern)</option>
                  <option value="serif" ${this.config.invoiceFontFamily === 'serif' ? 'selected' : ''}>EB Garamond / Georgia (Elegant Serif)</option>
                  <option value="slab" ${this.config.invoiceFontFamily === 'slab' ? 'selected' : ''}>Roboto Slab (Executive)</option>
                  <option value="monospace" ${this.config.invoiceFontFamily === 'monospace' ? 'selected' : ''}>JetBrains Mono / Courier (Retro Tech)</option>
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">
              <div class="input-group" style="flex: 1.5; min-width: 200px;">
                <label for="invoiceTitle" style="${this._labelStyle()}">Invoice Document Title</label>
                <input type="text" id="invoiceTitle" class="input invoice-designer-input" value="${esc(this.config.invoiceTitle)}" placeholder="e.g. TAX INVOICE" style="${this._inputStyle()}">
              </div>

              <div class="input-group" style="flex: 0.5; min-width: 150px;">
                <label for="invoicePrimaryColor" style="${this._labelStyle()}">Brand Accent Color</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <input type="color" id="invoicePrimaryColor" class="invoice-designer-input" value="${this.config.invoicePrimaryColor || '#FF5E36'}" style="
                    border: 1px solid var(--border-glass);
                    background: none;
                    width: 42px;
                    height: 42px;
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    padding: 0;
                  ">
                  <input type="text" id="invoicePrimaryColorText" class="input invoice-designer-input" value="${this.config.invoicePrimaryColor || '#FF5E36'}" placeholder="#FF5E36" style="${this._inputStyle('max-width: 100px; text-transform: uppercase; text-align: center;')}">
                </div>
              </div>
            </div>

            <div class="input-group">
              <label for="invoiceLogoUrl" style="${this._labelStyle()}">Logo Image URL (Optional)</label>
              <input type="url" id="invoiceLogoUrl" class="input invoice-designer-input" value="${esc(this.config.invoiceLogoUrl)}" placeholder="e.g. https://yoursite.com/logo.png" style="${this._inputStyle()}">
            </div>

            <div class="input-group">
              <label for="invoiceTerms" style="${this._labelStyle()}">Terms & Conditions / Legal Footer</label>
              <textarea id="invoiceTerms" class="input invoice-designer-input" placeholder="Enter terms of sale..." style="${this._inputStyle('min-height: 80px; font-family: Inter, sans-serif; resize: vertical;')}">${esc(this.config.invoiceTerms)}</textarea>
            </div>

            <div class="input-group" style="max-width: 320px;">
              <label for="invoiceSignatureText" style="${this._labelStyle()}">Signature Label Text</label>
              <input type="text" id="invoiceSignatureText" class="input invoice-designer-input" value="${esc(this.config.invoiceSignatureText)}" placeholder="e.g. Authorized Signatory" style="${this._inputStyle()}">
            </div>

            <!-- Toggles for Invoice Elements -->
            <div>
              <label style="${this._labelStyle()} margin-bottom: 12px;">Invoice Layout Elements</label>
              <div style="
                background: rgba(0,0,0,0.15);
                border-radius: var(--radius-lg);
                border: 1px solid var(--border-glass);
                padding: 6px 16px;
              ">
                ${this._buildToggleRow('invoiceShowUpiQr', 'Show Dynamic UPI Payment QR Code', this.config.invoiceShowUpiQr)}
                ${this._buildToggleRow('invoiceShowGrid', 'Show Grid Lines in Items Table', this.config.invoiceShowGrid)}
                ${this._buildToggleRow('invoiceShowSignature', 'Show Signature Block', this.config.invoiceShowSignature)}
                ${this._buildToggleRow('invoiceShowWatermark', 'Show Subtle Watermark', this.config.invoiceShowWatermark)}
              </div>
            </div>
          </div>
        </div>

        <!-- Receipt & Invoice Preview -->
        ${this._cardOpen()}
          ${this._cardHeading('preview', 'Live Document Preview')}
          <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: -8px 0 16px 0; font-weight: 500;">
            See how your receipts and invoices look before printing.
          </p>

          <!-- Preview Selector Tabs -->
          <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 14px; flex-wrap: wrap;">
            <button type="button" class="btn btn-preview-tab ${this.activePreviewTab === 'thermal' ? 'active' : ''}" id="preview-tab-thermal" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 36px;
              padding: 0 16px;
              border-radius: var(--radius-md);
              border: 1px solid ${this.activePreviewTab === 'thermal' ? 'var(--color-primary)' : 'var(--border-glass)'};
              background: ${this.activePreviewTab === 'thermal' ? 'rgba(255,94,54,0.1)' : 'rgba(0,0,0,0.2)'};
              color: ${this.activePreviewTab === 'thermal' ? 'var(--color-primary)' : 'var(--text-secondary)'};
              cursor: pointer;
              transition: all 0.2s ease;
            ">Thermal Receipt (BLE)</button>
            <button type="button" class="btn btn-preview-tab ${this.activePreviewTab === 'invoice' ? 'active' : ''}" id="preview-tab-invoice" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 36px;
              padding: 0 16px;
              border-radius: var(--radius-md);
              border: 1px solid ${this.activePreviewTab === 'invoice' ? 'var(--color-primary)' : 'var(--border-glass)'};
              background: ${this.activePreviewTab === 'invoice' ? 'rgba(255,94,54,0.1)' : 'rgba(0,0,0,0.2)'};
              color: ${this.activePreviewTab === 'invoice' ? 'var(--color-primary)' : 'var(--text-secondary)'};
              cursor: pointer;
              transition: all 0.2s ease;
            ">Standard Invoice (A4)</button>
          </div>

          <div id="receipt-preview-container" style="display: flex; justify-content: center; padding: 16px 0;"></div>
          
          <div style="display: flex; justify-content: center; margin-top: 12px;">
            <button class="btn btn-secondary" id="btn-print-sample" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 40px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              border: 1px solid var(--border-glass);
              background: rgba(255,255,255,0.02);
              padding: 0 24px;
            ">
              <span class="material-symbols-rounded" style="font-size: 18px;">print</span>
              Print Sample Receipt
            </button>
          </div>
        </div>

        <!-- Security & Admin PIN -->
        ${(() => {
          const currentStaff = authService.getCurrentStaff();
          const isOwner = currentStaff?.role === 'owner';
          return `
            ${this._cardOpen()}
              ${this._cardHeading('security', isOwner ? 'Security Credentials (Owner)' : 'Security Credentials (Manager)')}
              
              <div class="input-group" style="max-width: 320px;">
                <label for="adminPin" style="${this._labelStyle()}">${isOwner ? 'Admin Lock PIN' : 'Personal Manager PIN'} (leave blank to keep)</label>
                <input type="password" id="adminPin" class="input" value="" maxlength="4" placeholder="4 digits" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid var(--border-glass);
                  color: var(--text-primary);
                  letter-spacing: 0.5em; 
                  text-align: center; 
                  font-weight: 800; 
                  font-family: 'Plus Jakarta Sans', sans-serif;
                  font-size: 1.25rem;
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
              </div>
            </div>
          `;
        })()}

        <!-- Access & Permissions Section -->
        ${this._cardOpen()}
          ${this._cardHeading('admin_panel_settings', 'Access & Permissions')}
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="
              background: rgba(0,0,0,0.15);
              border-radius: var(--radius-lg);
              border: 1px solid var(--border-glass);
              padding: 6px 16px;
            ">
              ${this._buildToggleRow('requirePinForOrder', 'Require PIN for every order', this.config.requirePinForOrder)}
              ${this._buildToggleRow('allowManagerAdmin', 'Allow managers to access admin panel', this.config.allowManagerAdmin)}
              ${this._buildToggleRow('allowCashierVoid', 'Allow cashiers to void/refund orders', this.config.allowCashierVoid)}
              ${this._buildToggleRow('autoLockTerminal', 'Auto-lock terminal after inactivity', this.config.autoLockTerminal)}
            </div>

            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 200px;" id="auto-lock-timeout-group">
                <label for="autoLockTimeout">Auto-Lock Inactivity Timeout</label>
                <select id="autoLockTimeout" class="input">
                  <option value="5" ${this.config.autoLockTimeout === '5' ? 'selected' : ''}>5 Minutes</option>
                  <option value="10" ${this.config.autoLockTimeout === '10' ? 'selected' : ''}>10 Minutes</option>
                  <option value="15" ${this.config.autoLockTimeout === '15' ? 'selected' : ''}>15 Minutes</option>
                  <option value="30" ${this.config.autoLockTimeout === '30' ? 'selected' : ''}>30 Minutes</option>
                </select>
              </div>

              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="sessionDuration">Active Session Duration</label>
                <select id="sessionDuration" class="input">
                  <option value="4" ${this.config.sessionDuration === '4' ? 'selected' : ''}>4 Hours</option>
                  <option value="8" ${this.config.sessionDuration === '8' ? 'selected' : ''}>8 Hours (Standard)</option>
                  <option value="12" ${this.config.sessionDuration === '12' ? 'selected' : ''}>12 Hours</option>
                  <option value="24" ${this.config.sessionDuration === '24' ? 'selected' : ''}>24 Hours</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Theme Preference Section -->
        ${this._cardOpen()}
          ${this._cardHeading('palette', 'Theme Preference')}
          <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: -8px 0 16px 0; font-weight: 500;">
            Select your preferred display theme for the console terminal.
          </p>
          <div style="display: flex; gap: 12px; margin-bottom: 20px;">
            ${['dark', 'light', 'system'].map(theme => {
              const label = { dark: 'Dark Mode', light: 'Light Mode', system: 'System Theme' }[theme];
              const icon = { dark: 'dark_mode', light: 'light_mode', system: 'computer' }[theme];
              const isActive = this.config.app_theme === theme;
              return `
                <button type="button" class="btn btn-theme-option ${isActive ? 'active' : ''}" data-theme="${theme}" style="
                  flex: 1;
                  font-family: 'Plus Jakarta Sans', sans-serif;
                  font-weight: ${isActive ? '700' : '500'};
                  font-size: var(--text-xs);
                  min-height: 44px;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  gap: 8px;
                  border-radius: var(--radius-md);
                  border: 1.5px solid ${isActive ? 'var(--color-primary)' : 'var(--border-glass)'};
                  background: ${isActive ? 'rgba(255,94,54,0.12)' : 'rgba(0,0,0,0.15)'};
                  color: ${isActive ? 'var(--color-primary)' : 'var(--text-secondary)'};
                  cursor: pointer;
                  transition: all 0.25s ease;
                ">
                  <span class="material-symbols-rounded" style="font-size: 18px;">${icon}</span>
                  ${label}
                </button>
              `;
            }).join('')}
            <input type="hidden" id="app_theme" value="${esc(this.config.app_theme)}">
          </div>
          <!-- Theme Preview Colors -->
          <div style="
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            padding: 16px;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-glass);
            background: rgba(0,0,0,0.1);
          " id="settings-theme-preview-box">
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
              <span style="font-size: 0.6rem; color: var(--text-muted); font-weight: 700;">BACKGROUND</span>
              <div id="theme-preview-bg" style="width: 100%; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass); transition: background 0.3s;"></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
              <span style="font-size: 0.6rem; color: var(--text-muted); font-weight: 700;">SURFACE</span>
              <div id="theme-preview-surface" style="width: 100%; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass); transition: background 0.3s;"></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
              <span style="font-size: 0.6rem; color: var(--text-muted); font-weight: 700;">TEXT COLOR</span>
              <div id="theme-preview-text" style="width: 100%; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; transition: background 0.3s, color 0.3s;">Aa</div>
            </div>
          </div>
        </div>

        <!-- Cloud Synchronization Section -->
        ${this._cardOpen()}
          ${this._cardHeading('cloud_sync', 'Cloud Synchronization (Supabase)')}
          
          <div style="display: flex; flex-direction: column; gap: 18px;">
            <div class="input-group">
              <label for="supabaseUrl" style="${this._labelStyle()}">Supabase Project URL</label>
              <input type="url" id="supabaseUrl" class="input" value="${esc(this.config.supabaseUrl)}" placeholder="https://your-project.supabase.co" style="${this._inputStyle()}">
            </div>

            <div class="input-group">
              <label for="supabaseKey" style="${this._labelStyle()}">Supabase Anon Key</label>
              <input type="password" id="supabaseKey" class="input" value="${esc(this.config.supabaseKey)}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." style="${this._inputStyle()}">
            </div>

            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              <div class="input-group" style="flex:1;min-width:220px;">
                <label for="supabaseEmail" style="${this._labelStyle()}">Staff Cloud Email</label>
                <input type="email" id="supabaseEmail" class="input" value="${esc(this.config.supabaseEmail)}" placeholder="owner@example.com" style="${this._inputStyle()}">
              </div>
              <div class="input-group" style="flex:1;min-width:220px;">
                <label for="supabasePassword" style="${this._labelStyle()}">Staff Cloud Password (not saved)</label>
                <input type="password" id="supabasePassword" class="input" value="" placeholder="Enter only to sign in this device" autocomplete="current-password" style="${this._inputStyle()}">
              </div>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 4px; flex-wrap: wrap;">
              <button class="btn btn-secondary" id="btn-test-sync" style="
                flex: 1;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                border: 1px solid var(--border-glass);
                background: rgba(255,255,255,0.02);
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">sync</span>
                Test Cloud Connection
              </button>
              <button class="btn btn-primary" id="btn-cloud-signin" style="
                flex: 1;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">login</span>
                Staff Cloud Sign In
              </button>
              <button class="btn btn-secondary" id="btn-cloud-signout" style="
                flex: 1;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                border: 1px solid var(--border-glass);
                background: rgba(255,255,255,0.02);
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">logout</span>
                Sign Out Cloud
              </button>
            </div>
            <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin:0;">
              Staff cloud password is used only for Supabase Auth session creation and is never saved in IndexedDB or localStorage by this settings screen.
            </p>
          </div>
        </div>

        <!-- Google Drive Integration -->
        ${this._cardOpen()}
          ${this._cardHeading('cloud_upload', 'Google Drive Integration')}
          
          <div style="display: flex; flex-direction: column; gap: 18px;">
            <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: 0;">
              Automatically backup your daily, weekly, and monthly reports directly to your Google Drive in an organized folder structure.
            </p>
            <div class="input-group">
              <label for="googleClientId" style="${this._labelStyle()}">Google Client ID</label>
              <input type="text" id="googleClientId" class="input" placeholder="e.g. 1234567890-abc123xyz.apps.googleusercontent.com" value="${esc(this.config.googleClientId)}" style="${this._inputStyle()}">
            </div>
            
            <div style="
              display: flex; 
              justify-content: space-between; 
              align-items: center; 
              background: rgba(0,0,0,0.2); 
              padding: 14px 18px; 
              border-radius: var(--radius-lg); 
              border: 1px solid var(--border-glass);
            ">
              <div>
                <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">
                  Drive Connection Status
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 4px; font-weight: 500;" id="gdrive-status-info">
                  ${this.isDriveConnected() ? 'Connected to Google Drive' : 'Disconnected'}
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="gdrive-status-text" style="
                  font-family: 'Plus Jakarta Sans', sans-serif;
                  font-size: var(--text-xs); 
                  font-weight: 800; 
                  color: ${this.isDriveConnected() ? 'var(--color-success)' : 'var(--text-muted)'};
                ">
                  ${this.isDriveConnected() ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
                <span class="status-dot ${this.isDriveConnected() ? 'online' : 'offline'}" id="gdrive-status-dot" style="width: 8px; height: 8px;"></span>
              </div>
            </div>

            <!-- GDrive Actions -->
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <button class="btn ${this.isDriveConnected() ? 'btn-danger' : 'btn-primary'}" id="btn-toggle-gdrive" style="
                flex: 1;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">cloud_sync</span>
                <span id="btn-gdrive-text">${this.isDriveConnected() ? 'Disconnect Google Drive' : 'Connect Google Drive'}</span>
              </button>
            </div>

            <div>
              <div style="
                background: rgba(0,0,0,0.15);
                border-radius: var(--radius-lg);
                border: 1px solid var(--border-glass);
                padding: 6px 16px;
              ">
                ${this._buildToggleRow('autoUploadToDrive', 'Auto-upload Business Reports to Google Drive', this.config.autoUploadToDrive)}
              </div>
            </div>
          </div>
        </div>

        <!-- Data Backup & Export -->
        ${this._cardOpen()}
          ${this._cardHeading('backup', 'Data Backup & Export')}
          
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: 0;">
              Export all your data as a backup file. You can restore from this file on any device.
            </p>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <button class="btn btn-secondary" id="btn-export-json" style="
                flex: 1; min-width: 140px;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700; font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                border: 1px solid var(--border-glass); background: rgba(255,255,255,0.02);
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">download</span>
                Full Backup (JSON)
              </button>
              <button class="btn btn-secondary" id="btn-export-csv" style="
                flex: 1; min-width: 140px;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700; font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                border: 1px solid var(--border-glass); background: rgba(255,255,255,0.02);
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">table_view</span>
                Orders CSV (30d)
              </button>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
              <input type="file" id="import-file-input" accept=".json" style="display:none;">
              <button class="btn btn-secondary" id="btn-import-data" style="
                flex: 1;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700; font-size: var(--text-xs);
                min-height: 40px;
                display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                border: 1px solid rgba(245,158,11,0.25); background: rgba(245,158,11,0.04); color: #F59E0B;
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">upload</span>
                Restore from Backup
              </button>
            </div>
          </div>
        </div>

        <!-- Save button floating footer -->
        <div style="margin-top: 8px; display: flex; gap: 12px; margin-bottom: 30px;">
          <button class="btn btn-primary btn-block btn-lg" id="btn-save-settings" style="
            flex: 2;
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            font-size: var(--text-sm);
            height: 48px;
            box-shadow: var(--shadow-primary);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          ">
            <span class="material-symbols-rounded" style="font-size: 20px;">save</span>
            Save All Configurations
          </button>
        </div>
      </div>
    `;

    // Render initial receipt preview
    this._renderReceiptPreview();

    // Render initial theme preview
    this._updateThemePreview(this.config.app_theme || 'dark');
  }

  /** Build a single toggle row with proper CSS toggle switch */
  _buildToggleRow(id, label, value) {
    const isChecked = value === 'true' || value === true;
    return `
      <div class="settings-toggle-row">
        <span class="settings-toggle-row-label">${label}</span>
        <label class="settings-toggle-switch">
          <input type="checkbox" id="${id}" class="receipt-toggle" ${isChecked ? 'checked' : ''}>
          <span class="settings-toggle-track"></span>
          <span class="settings-toggle-thumb"></span>
        </label>
      </div>
    `;
  }

  /** Get the column width for a paper size value */
  _getColumnsForWidth(w) {
    switch(w) {
      case '58': return 32;
      case '76': return 42;
      case '80': return 48;
      case 'A4': return 72;
      default: return 32;
    }
  }

  /** Get current values from DOM for live preview */
  _getCurrentPreviewValues() {
    const getVal = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };
    const getCheck = (id) => {
      const el = document.getElementById(id);
      return el ? el.checked : false;
    };
    return {
      name: getVal('restaurantName') || 'THE TASTE',
      tagline: getVal('restaurantTagline') || 'Fast Food & Chinese',
      address: getVal('restaurantAddress') || 'Counter 4, Sector 5, Kolkata',
      phone: getVal('restaurantPhone') || '+91 98765 43210',
      gstin: getVal('gstin'),
      fssai: getVal('fssaiNumber'),
      footer: getVal('receiptFooter') || 'Thank you! Visit again!',
      paperWidth: getVal('printerWidth') || '58',
      density: getVal('printDensity') || 'normal',
      showLogo: getCheck('showLogoOnReceipt'),
      showAddress: getCheck('showAddressOnReceipt'),
      showPhone: getCheck('showPhoneOnReceipt'),
      showGstin: getCheck('showGstinOnReceipt'),
      showFssai: getCheck('showFssaiOnReceipt'),
      showNotes: getCheck('showNotesOnReceipt'),
      showFooter: getCheck('showFooterOnReceipt'),
      // New Invoice preview fields
      invoiceTemplate: getVal('invoiceTemplate') || 'minimalist',
      invoiceFontFamily: getVal('invoiceFontFamily') || 'sans-serif',
      invoiceTitle: getVal('invoiceTitle') || 'TAX INVOICE',
      invoicePrimaryColor: getVal('invoicePrimaryColor') || '#FF5E36',
      invoiceLogoUrl: getVal('invoiceLogoUrl') || '',
      invoiceTerms: getVal('invoiceTerms') || '',
      invoiceSignatureText: getVal('invoiceSignatureText') || 'Authorized Signatory',
      invoiceShowSignature: getCheck('invoiceShowSignature'),
      invoiceShowGrid: getCheck('invoiceShowGrid'),
      invoiceShowWatermark: getCheck('invoiceShowWatermark'),
      invoiceShowUpiQr: getCheck('invoiceShowUpiQr'),
      currencySymbol: getVal('currencySymbol') || '₹',
      taxLabel: getVal('taxLabel') || 'GST'
    };
  }

  /** Render the live receipt preview */
  _renderReceiptPreview() {
    const container = document.getElementById('receipt-preview-container');
    if (!container) return;

    if (this.activePreviewTab === 'invoice') {
      const v = this._getCurrentPreviewValues();
      
      // Build dummy order for preview
      const dummyOrder = {
        orderNumber: 'TT-20260527-0042',
        createdAt: new Date().toISOString(),
        type: 'dine_in',
        paymentStatus: 'paid',
        paymentMethod: 'upi',
        customerName: 'Aria Sen',
        customerPhone: '9876543210',
        tableId: '5',
        subtotal: 490.00,
        tax: 24.50,
        total: 514.50,
        items: JSON.stringify([
          { name: 'Chicken Biryani', qty: 2, price: 220 },
          { name: 'Paneer Butter Masala', qty: 1, price: 180 },
          { name: 'Cold Coffee', qty: 2, price: 90 }
        ])
      };

      // Dummy base64 QR code for preview
      const dummyQr = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><rect x="10" y="10" width="30" height="30" fill="black"/><rect x="15" y="15" width="20" height="20" fill="white"/><rect x="60" y="10" width="30" height="30" fill="black"/><rect x="65" y="15" width="20" height="20" fill="white"/><rect x="10" y="60" width="30" height="30" fill="black"/><rect x="15" y="65" width="20" height="20" fill="white"/><rect x="45" y="45" width="10" height="10" fill="black"/><rect x="60" y="60" width="10" height="10" fill="black"/><rect x="75" y="75" width="15" height="15" fill="black"/></svg>';

      const invoiceSettings = {
        restaurantName: v.name,
        restaurantTagline: v.tagline,
        restaurantAddress: v.address,
        restaurantPhone: v.phone,
        restaurantEmail: document.getElementById('restaurantEmail')?.value.trim() || 'hello@thetaste.co.in',
        restaurantWebsite: document.getElementById('restaurantWebsite')?.value.trim() || 'thetaste.co.in',
        gstin: v.gstin,
        fssaiNumber: v.fssai,
        receiptFooter: v.footer,
        showAddressOnReceipt: v.showAddress ? 'true' : 'false',
        showPhoneOnReceipt: v.showPhone ? 'true' : 'false',
        showGstinOnReceipt: v.showGstin ? 'true' : 'false',
        showFssaiOnReceipt: v.showFssai ? 'true' : 'false',
        showFooterOnReceipt: v.showFooter ? 'true' : 'false',
        gstPercent: document.getElementById('gstPercent')?.value.trim() || '5',
        invoiceTemplate: v.invoiceTemplate,
        invoicePrimaryColor: v.invoicePrimaryColor,
        invoiceFontFamily: v.invoiceFontFamily,
        invoiceLogoUrl: v.invoiceLogoUrl,
        invoiceTitle: v.invoiceTitle,
        invoiceTerms: v.invoiceTerms,
        invoiceShowSignature: v.invoiceShowSignature,
        invoiceSignatureText: v.invoiceSignatureText,
        invoiceShowGrid: v.invoiceShowGrid,
        invoiceShowWatermark: v.invoiceShowWatermark,
        invoiceShowUpiQr: v.invoiceShowUpiQr,
        upiId: 'thetaste@upi',
        currencySymbol: v.currencySymbol,
        taxLabel: v.taxLabel
      };

      import('../../services/invoiceGenerator.js').then(({ InvoiceGenerator }) => {
        const invoiceHtml = InvoiceGenerator.generateInvoiceHTML(dummyOrder, invoiceSettings, dummyQr);
        
        container.innerHTML = `
          <iframe id="invoice-preview-iframe" style="
            width: 100%;
            max-width: 580px;
            height: 720px;
            border: 1px solid var(--border-glass);
            border-radius: var(--radius-lg);
            background: #fff;
            box-shadow: 0 15px 35px rgba(0,0,0,0.4);
          "></iframe>
        `;
        const iframe = document.getElementById('invoice-preview-iframe');
        if (iframe) {
          // Prevent printing triggers in preview mode
          const previewHtml = invoiceHtml.replace('window.location.search.includes(\'preview=true\')', 'true');
          iframe.srcdoc = previewHtml;
        }
      }).catch(err => {
        console.error('Invoice preview generation failed:', err);
        container.innerHTML = `<div style="color:var(--color-danger);font-size:var(--text-sm);">Preview compilation failed: ${err.message}</div>`;
      });
      return;
    }

    const v = this._getCurrentPreviewValues();
    const cols = this._getColumnsForWidth(v.paperWidth);

    // Determine paper pixel width based on paper size
    const widthMap = { '58': 220, '76': 280, '80': 310, 'A4': 480 };
    const paperPixelWidth = widthMap[v.paperWidth] || 220;

    // Font weight for density
    const densityWeight = v.density === 'bold' ? '700' : v.density === 'light' ? '300' : '400';

    // Build receipt lines
    const divider = (ch) => `<div class="receipt-divider">${ch.repeat(cols)}</div>`;
    
    let lines = [];

    if (v.showLogo) {
      lines.push(`<div class="receipt-line receipt-line-big">${this._escHtml(v.name)}</div>`);
      if (v.tagline) lines.push(`<div class="receipt-line" style="font-size: 11px; opacity: 0.7;">${this._escHtml(v.tagline)}</div>`);
    }
    if (v.showAddress && v.address) {
      lines.push(`<div class="receipt-line" style="font-size: 11px;">${this._escHtml(v.address)}</div>`);
    }
    if (v.showPhone && v.phone) {
      lines.push(`<div class="receipt-line" style="font-size: 11px;">Ph: ${this._escHtml(v.phone)}</div>`);
    }
    if (v.showGstin && v.gstin) {
      lines.push(`<div class="receipt-line" style="font-size: 10px; opacity: 0.7;">GSTIN: ${this._escHtml(v.gstin)}</div>`);
    }
    if (v.showFssai && v.fssai) {
      lines.push(`<div class="receipt-line" style="font-size: 10px; opacity: 0.7;">FSSAI: ${this._escHtml(v.fssai)}</div>`);
    }

    lines.push(divider('='));

    // Sample order info
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    lines.push(`<div class="receipt-line-left" style="font-size: 11px;">Order: #TT-0042 &nbsp;&nbsp; Table: 5</div>`);
    lines.push(`<div class="receipt-line-left" style="font-size: 11px;">Date: ${dateStr} &nbsp; ${timeStr}</div>`);
    lines.push(divider('-'));

    // Sample items
    const sampleItems = [
      { name: 'Chicken Biryani', qty: 2, price: 220 },
      { name: 'Paneer Butter Masala', qty: 1, price: 180 },
      { name: 'Cold Coffee', qty: 2, price: 90 },
    ];

    // Header
    const itemLabel = 'Item';
    const qtyLabel = 'Qty';
    const amtLabel = 'Amt';
    const headerLine = this._padReceiptRow(itemLabel, qtyLabel, amtLabel, cols);
    lines.push(`<div class="receipt-line-left receipt-line-bold" style="font-size: 11px;">${headerLine}</div>`);
    lines.push(divider('-'));

    let subtotal = 0;
    for (const item of sampleItems) {
      const total = item.qty * item.price;
      subtotal += total;
      const row = this._padReceiptRow(item.name, `x${item.qty}`, `${v.currencySymbol}${total}`, cols);
      lines.push(`<div class="receipt-line-left" style="font-size: 11px;">${row}</div>`);
    }

    lines.push(divider('-'));

    const gst = Math.round(subtotal * 0.05);
    const grandTotal = subtotal + gst;

    lines.push(`<div class="receipt-line-left" style="font-size: 11px;">${this._padReceiptRow('Subtotal', '', `${v.currencySymbol}${subtotal}`, cols)}</div>`);
    lines.push(`<div class="receipt-line-left" style="font-size: 11px;">${this._padReceiptRow(`${v.taxLabel} (5%)`, '', `${v.currencySymbol}${gst}`, cols)}</div>`);
    lines.push(divider('='));
    lines.push(`<div class="receipt-line-left receipt-line-bold" style="font-size: 13px;">${this._padReceiptRow('TOTAL', '', `${v.currencySymbol}${grandTotal}`, cols)}</div>`);
    lines.push(divider('='));

    if (v.showNotes) {
      lines.push(`<div class="receipt-line-left" style="font-size: 10px; font-style: italic; opacity: 0.65;">Note: Extra spicy, no onion</div>`);
      lines.push(divider('-'));
    }

    if (v.showFooter && v.footer) {
      lines.push(`<div class="receipt-line" style="font-size: 11px; margin-top: 4px;">${this._escHtml(v.footer)}</div>`);
    }

    container.innerHTML = `
      <div class="receipt-preview-paper" style="
        width: ${paperPixelWidth}px;
        font-weight: ${densityWeight};
      ">
        ${lines.join('\n')}
      </div>
    `;
  }

  isDriveConnected() {
    try {
      const token = localStorage.getItem('gdrive_access_token');
      const expires = localStorage.getItem('gdrive_token_expires');
      return token && expires && Date.now() < parseInt(expires);
    } catch (e) {
      return false;
    }
  }

  _updateDriveUI(isConnected) {
    const dot = document.getElementById('gdrive-status-dot');
    const text = document.getElementById('gdrive-status-text');
    const info = document.getElementById('gdrive-status-info');
    const btn = document.getElementById('btn-toggle-gdrive');
    const btnText = document.getElementById('btn-gdrive-text');

    if (dot) dot.className = `status-dot ${isConnected ? 'online' : 'offline'}`;
    if (text) {
      text.textContent = isConnected ? 'CONNECTED' : 'DISCONNECTED';
      text.style.color = isConnected ? 'var(--color-success)' : 'var(--text-muted)';
    }
    if (info) {
      info.textContent = isConnected ? 'Connected to Google Drive' : 'Disconnected';
    }
    if (btn) {
      btn.className = `btn ${isConnected ? 'btn-danger' : 'btn-primary'}`;
    }
    if (btnText) {
      btnText.textContent = isConnected ? 'Disconnect Google Drive' : 'Connect Google Drive';
    }
  }

  /** HTML-escape helper */
  _escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  /** Pad a receipt row: left-aligned name, center-ish qty, right-aligned amount */
  _padReceiptRow(left, mid, right, cols) {
    const l = left || '';
    const m = mid || '';
    const r = right || '';
    const usedLen = l.length + m.length + r.length;
    const totalSpaces = Math.max(cols - usedLen, 2);
    const leftPad = Math.floor(totalSpaces / 2);
    const rightPad = totalSpaces - leftPad;
    // Use non-breaking spaces so monospace alignment is preserved
    return `${this._escHtml(l)}${'&nbsp;'.repeat(leftPad)}${this._escHtml(m)}${'&nbsp;'.repeat(rightPad)}${this._escHtml(r)}`;
  }

  /** Debounced preview update */
  _schedulePreviewUpdate() {
    if (this._previewDebounceTimer) clearTimeout(this._previewDebounceTimer);
    this._previewDebounceTimer = setTimeout(() => {
      this._renderReceiptPreview();
    }, 300);
  }

  bindEvents() {
    // Printer toggle (connect/disconnect)
    const toggleBtn = document.getElementById('btn-toggle-printer');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        playSound(800, 100);
        vibrateDevice([40]);

        if (printerService.isConnected) {
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
          } catch (e) {
            if (e.name !== 'NotFoundError') {
              showToast('Bluetooth error: ' + e.message, 'error');
            }
          }
        }
      });
    }

    // Print Test page
    const testBtn = document.getElementById('btn-print-test');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        playSound(800, 100);
        vibrateDevice([40]);
        await this.printTestReceipt();
      });
    }

    // Print Sample from preview card
    const sampleBtn = document.getElementById('btn-print-sample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', async () => {
        playSound(800, 100);
        vibrateDevice([40]);
        await this.printTestReceipt();
      });
    }

    // Google Drive Connect/Disconnect
    const gdriveToggleBtn = document.getElementById('btn-toggle-gdrive');
    if (gdriveToggleBtn) {
      gdriveToggleBtn.addEventListener('click', async () => {
        playSound(800, 100);
        vibrateDevice([40]);

        const { isDriveConnected, authenticateGDrive, disconnectGDrive } = await import('../../services/driveUpload.js');

        if (isDriveConnected()) {
          disconnectGDrive();
          showToast('Google Drive disconnected', 'info');
          this._updateDriveUI(false);
        } else {
          const clientId = document.getElementById('googleClientId').value.trim();
          if (!clientId) {
            showToast('Please enter your Google Client ID first.', 'warning');
            return;
          }
          
          gdriveToggleBtn.disabled = true;
          const originalText = document.getElementById('btn-gdrive-text').textContent;
          document.getElementById('btn-gdrive-text').textContent = 'Connecting...';
          
          try {
            await authenticateGDrive(clientId);
            showToast('Google Drive connected successfully! 🎉', 'success');
            this._updateDriveUI(true);
          } catch (e) {
            showToast('Connection failed: ' + e.message, 'error');
            this._updateDriveUI(false);
          } finally {
            gdriveToggleBtn.disabled = false;
            document.getElementById('btn-gdrive-text').textContent = isDriveConnected() ? 'Disconnect Google Drive' : 'Connect Google Drive';
          }
        }
      });
    }

    // Test Cloud connection
    const testSyncBtn = document.getElementById('btn-test-sync');
    if (testSyncBtn) {
      testSyncBtn.addEventListener('click', async () => {
        playSound(800, 100);
        vibrateDevice([40]);

        const url = document.getElementById('supabaseUrl').value.trim();
        const key = document.getElementById('supabaseKey').value.trim();

        if (!url || !key) {
          showToast('Please enter both Supabase URL and Anon Key to test.', 'warning');
          return;
        }

        testSyncBtn.disabled = true;
        const originalHtml = testSyncBtn.innerHTML;
        testSyncBtn.innerHTML = `
          <span class="material-symbols-rounded animate-spin">sync</span>
          Testing Connection...
        `;

        try {
          const { syncService } = await import('../../services/sync.js');
          const result = await syncService.testConnection(url, key);
          
          if (result.success) {
            showToast('Supabase connection successful! 🎉', 'success');
          } else {
            showToast('Connection failed: ' + result.message, 'error');
          }
        } catch (err) {
          showToast('Test failed: ' + err.message, 'error');
        } finally {
          testSyncBtn.disabled = false;
          testSyncBtn.innerHTML = originalHtml;
        }
      });
    }

    const signInBtn = document.getElementById('btn-cloud-signin');
    if (signInBtn) {
      signInBtn.addEventListener('click', async () => {
        const email = document.getElementById('supabaseEmail')?.value.trim() || '';
        const password = document.getElementById('supabasePassword')?.value.trim() || '';
        try {
          const { authService } = await import('../../services/auth.js');
          await authService.loginWithCloudCredentials(email, password);
          document.getElementById('supabasePassword').value = '';
          showToast('Cloud staff session active on this device', 'success');
          const { syncService } = await import('../../services/sync.js');
          await syncService.connect();
        } catch (err) {
          console.error('Cloud staff sign in failed:', err);
          showToast(err.message || 'Cloud staff sign in failed', 'error');
        }
      });
    }

    const signOutBtn = document.getElementById('btn-cloud-signout');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        const result = await signOutCloudStaff();
        if (!result.success) {
          showToast('Cloud sign out failed: ' + result.message, 'error');
          return;
        }
        showToast('Cloud staff session signed out', 'info');
      });
    }

    // Print Density selector buttons
    const densityBtns = this.container.querySelectorAll('.btn-density-option');
    densityBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const density = btn.dataset.density;
        document.getElementById('printDensity').value = density;
        
        // Update button visual state
        densityBtns.forEach(b => {
          const isActive = b.dataset.density === density;
          b.style.border = `1px solid ${isActive ? 'var(--color-primary)' : 'var(--border-glass)'}`;
          b.style.background = isActive ? 'rgba(255,94,54,0.12)' : 'rgba(0,0,0,0.2)';
          b.style.color = isActive ? 'var(--color-primary)' : 'var(--text-secondary)';
          b.style.fontWeight = isActive ? '700' : '500';
        });

        this._schedulePreviewUpdate();
      });
    });

    // Document Preview Tab Switching
    const tabThermal = document.getElementById('preview-tab-thermal');
    const tabInvoice = document.getElementById('preview-tab-invoice');
    if (tabThermal && tabInvoice) {
      const setTabActive = (activeTab, activeEl, inactiveEl) => {
        this.activePreviewTab = activeTab;
        
        activeEl.style.border = '1px solid var(--color-primary)';
        activeEl.style.background = 'rgba(255,94,54,0.1)';
        activeEl.style.color = 'var(--color-primary)';
        
        inactiveEl.style.border = '1px solid var(--border-glass)';
        inactiveEl.style.background = 'rgba(0,0,0,0.2)';
        inactiveEl.style.color = 'var(--text-secondary)';
        
        this._renderReceiptPreview();
      };
      
      tabThermal.addEventListener('click', () => {
        playSound(800, 60);
        setTabActive('thermal', tabThermal, tabInvoice);
      });
      tabInvoice.addEventListener('click', () => {
        playSound(800, 60);
        setTabActive('invoice', tabInvoice, tabThermal);
      });
    }

    // Accent Color Picker & Text input synchronization
    const colorPicker = document.getElementById('invoicePrimaryColor');
    const colorText = document.getElementById('invoicePrimaryColorText');
    if (colorPicker && colorText) {
      colorPicker.addEventListener('input', () => {
        colorText.value = colorPicker.value.toUpperCase();
        this._schedulePreviewUpdate();
      });
      colorText.addEventListener('input', () => {
        const val = colorText.value.trim();
        if (/^#[0-9A-F]{6}$/i.test(val)) {
          colorPicker.value = val;
          this._schedulePreviewUpdate();
        }
      });
    }

    // Live preview: listen to all receipt-affecting inputs and toggles
    const previewInputIds = [
      'restaurantName', 'restaurantTagline', 'restaurantAddress', 'restaurantPhone',
      'gstin', 'fssaiNumber', 'receiptFooter', 'printerWidth', 'printCopies',
      'invoiceTemplate', 'invoiceFontFamily', 'invoiceTitle', 'invoicePrimaryColor',
      'invoiceLogoUrl', 'invoiceTerms', 'invoiceSignatureText',
      'currencyCode', 'currencySymbol', 'taxType', 'taxLabel'
    ];
    for (const id of previewInputIds) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this._schedulePreviewUpdate());
        el.addEventListener('change', () => this._schedulePreviewUpdate());
      }
    }

    // Toggle switches — live preview + visual update
    const toggleEls = this.container.querySelectorAll('.receipt-toggle[type="checkbox"]');
    toggleEls.forEach(toggle => {
      toggle.addEventListener('change', () => {
        this._schedulePreviewUpdate();
      });
    });

    // Theme options in settings
    this.container.querySelectorAll('.btn-theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        playSound(700, 60);

        // Update active class
        this.container.querySelectorAll('.btn-theme-option').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === theme);
          const active = b.dataset.theme === theme;
          b.style.border = `1.5px solid ${active ? 'var(--color-primary)' : 'var(--border-glass)'}`;
          b.style.background = active ? 'rgba(255,94,54,0.12)' : 'rgba(0,0,0,0.15)';
          b.style.color = active ? 'var(--color-primary)' : 'var(--text-secondary)';
          b.style.fontWeight = active ? '700' : '500';
        });

        // Set hidden input
        const input = document.getElementById('app_theme');
        if (input) input.value = theme;

        this._updateThemePreview(theme);
      });
    });

    // Auto-lock toggle interaction
    const autoLockCheckbox = document.getElementById('autoLockTerminal');
    const autoLockTimeoutGroup = document.getElementById('auto-lock-timeout-group');
    if (autoLockCheckbox && autoLockTimeoutGroup) {
      const updateTimeoutVisibility = () => {
        autoLockTimeoutGroup.style.opacity = autoLockCheckbox.checked ? '1' : '0.4';
        const select = autoLockTimeoutGroup.querySelector('select');
        if (select) select.disabled = !autoLockCheckbox.checked;
      };
      autoLockCheckbox.addEventListener('change', updateTimeoutVisibility);
      updateTimeoutVisibility();
    }

    // Save configurations
    document.getElementById('btn-save-settings').addEventListener('click', async () => {
      playSound(800, 100);
      vibrateDevice([50, 30]);

      // Form validation
      const name = document.getElementById('restaurantName').value.trim();
      const upiId = document.getElementById('upiId').value.trim();
      const adminPin = document.getElementById('adminPin').value.trim();

      const currentStaff = authService.getCurrentStaff();
      const isOwner = currentStaff?.role === 'owner';

      if (!name) {
        showToast('Restaurant name is required', 'warning');
        return;
      }
      if (!upiId) {
        showToast('UPI ID is required for generating checkout QR codes', 'warning');
        return;
      }
      if (adminPin && (adminPin.length !== 4 || isNaN(adminPin))) {
        showToast(`${isOwner ? 'Admin' : 'Manager'} lock PIN must be exactly 4 digits when changed`, 'warning');
        return;
      }
      if (isOwner && !this.config.adminPinHash && !adminPin) {
        showToast('Set an admin lock PIN before launch', 'warning');
        return;
      }

      // Collect text/select inputs
      const fields = [
        'restaurantName',
        'restaurantTagline',
        'restaurantPhone',
        'restaurantAddress',
        'restaurantEmail',
        'restaurantWebsite',
        'operatingHours',
        'gstin',
        'fssaiNumber',
        'receiptFooter',
        'upiId',
        'upiName',
        'gstPercent',
        'printerWidth',
        'orderNumberPrefix',
        'supabaseUrl',
        'supabaseKey',
        'supabaseEmail',
        'printDensity',
        'printCopies',
        'googleClientId',
        // Premium invoice inputs
        'invoiceTemplate',
        'invoicePrimaryColor',
        'invoiceFontFamily',
        'invoiceLogoUrl',
        'invoiceTitle',
        'invoiceTerms',
        'invoiceSignatureText',
        // Currency and Tax fields
        'currencyCode',
        'currencySymbol',
        'taxType',
        'taxLabel',
        // Enterprise inputs
        'autoLockTimeout',
        'sessionDuration',
        'app_theme'
      ];

      // Collect toggle (checkbox) fields
      const toggleFields = [
        'showLogoOnReceipt',
        'showAddressOnReceipt',
        'showPhoneOnReceipt',
        'showGstinOnReceipt',
        'showFssaiOnReceipt',
        'showNotesOnReceipt',
        'showFooterOnReceipt',
        'autoPrintOnConfirm',
        'autoUploadToDrive',
        // Premium invoice toggles
        'invoiceShowSignature',
        'invoiceShowGrid',
        'invoiceShowWatermark',
        'invoiceShowUpiQr',
        // Enterprise toggles
        'requirePinForOrder',
        'allowManagerAdmin',
        'allowCashierVoid',
        'autoLockTerminal'
      ];

      try {
        for (const f of fields) {
          const el = document.getElementById(f);
          if (el) {
            const val = el.value.trim();
            await setSetting(f, val);
            this.config[f] = val; // update local config
          }
        }

        if (adminPin) {
          const adminPinHash = await hashPin(adminPin);
          if (currentStaff && currentStaff.role === 'manager') {
            await db.staff.update(currentStaff.id, { pinHash: adminPinHash, isSynced: 0 });
            localStorage.setItem(`pin_authorized_${currentStaff.id}`, 'true');
            localStorage.setItem('auth_staff_pin', adminPinHash);
          } else {
            await setSetting('adminPinHash', adminPinHash);
            await db.settings.delete('adminPin');
            this.config.adminPinHash = adminPinHash;
            this.config.adminPin = '';

            const owners = await db.staff.where('role').equals('owner').toArray();
            for (const o of owners) {
              await db.staff.update(o.id, { pinHash: adminPinHash, isSynced: 0 });
              localStorage.setItem(`pin_authorized_${o.id}`, 'true');
              if (currentStaff && o.id === currentStaff.id) {
                localStorage.setItem('auth_staff_pin', adminPinHash);
              }
            }
          }
        }

        for (const f of toggleFields) {
          const el = document.getElementById(f);
          if (el) {
            const val = el.checked ? 'true' : 'false';
            await setSetting(f, val);
            this.config[f] = val;
          }
        }
        
        // Update localStorage cached values
        localStorage.setItem('app_currency_symbol', this.config.currencySymbol || '₹');
        localStorage.setItem('app_currency_code', this.config.currencyCode || 'INR');
        localStorage.setItem('app_tax_type', this.config.taxType || 'GST');
        localStorage.setItem('app_tax_label', this.config.taxLabel || 'GST');

        // Apply theme immediately
        const savedTheme = this.config.app_theme || 'dark';
        localStorage.setItem('app_theme', savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: savedTheme } }));

        // Notify header logo text (if rendered)
        const logo = document.getElementById('app-logo')?.querySelector('span:last-child');
        if (logo) logo.textContent = this.config.restaurantName;

        showToast('Settings saved successfully!', 'success');

        // Dynamically reconnect cloud sync service to apply newly configured credentials
        try {
          const { syncService } = await import('../../services/sync.js');
          await syncService.connect();
        } catch (syncErr) {
          console.error('Failed to trigger hot reconnect of sync service:', syncErr);
        }
      } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
      }
    });

    // Data Export - Full JSON Backup
    document.getElementById('btn-export-json')?.addEventListener('click', async () => {
      playSound(800, 80);
      try {
        await exportAllData();
        await logDataExported();
        showToast('Full backup downloaded!', 'success');
      } catch (e) {
        showToast('Export failed: ' + e.message, 'error');
      }
    });

    // Data Export - Orders CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
      playSound(800, 80);
      try {
        await exportOrdersCSV(30);
        showToast('Orders CSV downloaded!', 'success');
      } catch (e) {
        showToast('CSV export failed: ' + e.message, 'error');
      }
    });

    // Data Import - Restore from Backup
    document.getElementById('btn-import-data')?.addEventListener('click', () => {
      document.getElementById('import-file-input')?.click();
    });
    document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('This will merge backup data into your current database. Continue?')) return;
      try {
        const text = await file.text();
        const result = await importData(text);
        if (result.success) {
          const counts = Object.entries(result.counts).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ');
          showToast(`Restored! ${counts}`, 'success', 5000);
        }
      } catch (e) {
        showToast('Import failed: ' + e.message, 'error');
      }
      e.target.value = '';
    });
  }

  setupPrinterStateListener() {
    // Override main printer state callback to also update local KDS settings UI
    printerService.onStatusChange = (isConnected) => {
      // Also update main header logo printer status
      const dotHeader = document.getElementById('printer-status-dot');
      const textHeader = document.getElementById('printer-status-text');
      if (dotHeader) dotHeader.className = `status-dot ${isConnected ? 'online' : 'offline'}`;
      if (textHeader) textHeader.textContent = isConnected ? 'Connected' : 'Not Connected';

      // Update KDS settings tab UI if mounted
      const dotLocal = document.getElementById('printer-state-dot');
      const textLocal = document.getElementById('printer-state-text');
      const infoLocal = document.getElementById('printer-device-info');
      const btnToggle = document.getElementById('btn-toggle-printer');
      const btnText = document.getElementById('btn-printer-text');
      const btnTest = document.getElementById('btn-print-test');

      if (dotLocal) dotLocal.className = `status-dot ${isConnected ? 'online' : 'offline'}`;
      if (textLocal) {
        textLocal.textContent = isConnected ? 'CONNECTED' : 'DISCONNECTED';
        textLocal.style.color = isConnected ? 'var(--color-success)' : 'var(--text-muted)';
      }
      if (infoLocal) {
        infoLocal.textContent = isConnected 
          ? `Printer connected (${printerService.device?.name || 'BLE Device'})` 
          : 'No printer connected';
      }
      if (btnToggle) {
        btnToggle.className = `btn ${isConnected ? 'btn-danger' : 'btn-primary'}`;
        btnToggle.style.flex = '1';
      }
      if (btnText) btnText.textContent = isConnected ? 'Disconnect Printer' : 'Connect BLE Printer';
      if (btnTest) btnTest.disabled = !isConnected;
    };
  }

  async printTestReceipt() {
    if (!printerService.isConnected) return;

    try {
      const pw = this.config.printerWidth || '58';
      const width = this._getColumnsForWidth(pw);
      const rb = new ReceiptBuilder(width);
      
      const testBytes = rb
        .initialize()
        .center()
        .big()
        .text(this.config.restaurantName || 'THE TASTE')
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
    } catch (e) {
      console.error('Test print failed:', e);
      showToast('Print error: ' + e.message, 'error');
    }
  }

  _updateThemePreview(theme) {
    const previewBox = document.getElementById('settings-theme-preview-box');
    if (!previewBox) return;

    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    const bgEl = document.getElementById('theme-preview-bg');
    const surfaceEl = document.getElementById('theme-preview-surface');
    const textEl = document.getElementById('theme-preview-text');

    if (resolved === 'light') {
      if (bgEl) bgEl.style.background = '#F8F9FC';
      if (surfaceEl) surfaceEl.style.background = '#FFFFFF';
      if (textEl) {
        textEl.style.background = '#F1F3F9';
        textEl.style.color = '#0F172A';
      }
    } else {
      if (bgEl) bgEl.style.background = '#040406';
      if (surfaceEl) surfaceEl.style.background = '#0B0B0F';
      if (textEl) {
        textEl.style.background = '#0E0E14';
        textEl.style.color = '#F9FAFB';
      }
    }
  }

  unmount() {
    if (this._previewDebounceTimer) clearTimeout(this._previewDebounceTimer);
    this.container = null;
  }
}
