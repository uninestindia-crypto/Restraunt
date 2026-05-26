/**
 * SettingsView — Admin panel settings, including restaurant profile, GST, security PIN, and BLE printer connect
 */

import { db, getSetting, setSetting } from '../../db/database.js';
import { showToast, playSound, vibrateDevice } from '../../utils/helpers.js';
import { printerService } from '../../services/printer.js';
import { ReceiptBuilder } from '../../services/receipt.js';
import { exportAllData, exportOrdersCSV, importData } from '../../utils/dataExport.js';
import { logDataExported } from '../../utils/activityLogger.js';

export class SettingsView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.config = {};
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
        'orderNumberPrefix',
        'supabaseUrl',
        'supabaseKey'
      ];

      for (const key of keys) {
        this.config[key] = await getSetting(key) || '';
      }
    } catch (e) {
      console.error('Failed to load system settings:', e);
    }
  }

  render() {
    const isPrinterSupported = printerService.isSupported();
    const isPrinterConnected = printerService.isConnected;

    this.container.innerHTML = `
      <div style="padding: 0 24px 24px 24px; max-width: 800px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Bluetooth Printer Section -->
        <div class="card card-glass" style="
          padding: 24px;
          background: rgba(255,255,255,0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-xl);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        ">
          <h3 style="
            font-family: 'Plus Jakarta Sans', sans-serif; 
            font-size: var(--text-base); 
            font-weight: 800; 
            color: var(--text-primary); 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            margin-top: 0;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
          ">
            <span class="material-symbols-rounded" style="color: var(--color-primary); filter: drop-shadow(0 0 4px rgba(255,94,54,0.3));">print</span>
            Bluetooth Thermal Printer Setup
          </h3>
          
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
            <div style="display: flex; gap: 12px; margin-top: 4px;">
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

            <div class="input-group" style="margin-top: 4px;">
              <label for="printerWidth" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Paper Roll Width</label>
              <select id="printerWidth" class="input" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
                <option value="58" ${this.config.printerWidth === '58' ? 'selected' : ''}>58mm (32 characters per line - Standard)</option>
                <option value="80" ${this.config.printerWidth === '80' ? 'selected' : ''}>80mm (48 characters per line - Wide)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Restaurant Profile Section -->
        <div class="card card-glass" style="
          padding: 24px;
          background: rgba(255,255,255,0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-xl);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        ">
          <h3 style="
            font-family: 'Plus Jakarta Sans', sans-serif; 
            font-size: var(--text-base); 
            font-weight: 800; 
            color: var(--text-primary); 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            margin-top: 0;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
          ">
            <span class="material-symbols-rounded" style="color: var(--color-primary); filter: drop-shadow(0 0 4px rgba(255,94,54,0.3));">storefront</span>
            Restaurant Profile & Branding
          </h3>
          
          <div style="display: flex; flex-direction: column; gap: 18px;">
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 240px;">
                <label for="restaurantName" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Restaurant Name</label>
                <input type="text" id="restaurantName" class="input" value="${this.config.restaurantName}" placeholder="e.g. The Taste" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid var(--border-glass);
                  color: var(--text-primary);
                  font-family: 'Inter', sans-serif;
                  font-size: var(--text-sm);
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
              </div>
              <div class="input-group" style="flex: 1; min-width: 240px;">
                <label for="restaurantTagline" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Tagline / Subtitle</label>
                <input type="text" id="restaurantTagline" class="input" value="${this.config.restaurantTagline}" placeholder="e.g. Fast Food & Chinese" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid var(--border-glass);
                  color: var(--text-primary);
                  font-family: 'Inter', sans-serif;
                  font-size: var(--text-sm);
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
              </div>
            </div>

            <div class="input-group">
              <label for="restaurantAddress" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Store Address (printed on receipt)</label>
              <input type="text" id="restaurantAddress" class="input" value="${this.config.restaurantAddress}" placeholder="e.g. Counter 4, Sector 5, Kolkata" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>

            <div class="input-group">
              <label for="restaurantPhone" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Contact Phone Number</label>
              <input type="tel" id="restaurantPhone" class="input" value="${this.config.restaurantPhone}" placeholder="e.g. +91 98765 43210" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>
          </div>
        </div>

        <!-- Payments & Tax Configuration -->
        <div class="card card-glass" style="
          padding: 24px;
          background: rgba(255,255,255,0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-xl);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        ">
          <h3 style="
            font-family: 'Plus Jakarta Sans', sans-serif; 
            font-size: var(--text-base); 
            font-weight: 800; 
            color: var(--text-primary); 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            margin-top: 0;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
          ">
            <span class="material-symbols-rounded" style="color: var(--color-primary); filter: drop-shadow(0 0 4px rgba(255,94,54,0.3));">account_balance_wallet</span>
            Payments & Tax Setup
          </h3>
          
          <div style="display: flex; flex-direction: column; gap: 18px;">
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1.5; min-width: 240px;">
                <label for="upiId" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">UPI ID / Virtual Payment Address (VPA)</label>
                <input type="text" id="upiId" class="input" value="${this.config.upiId}" placeholder="e.g. thetaste@upi" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid rgba(255, 94, 54, 0.25);
                  color: var(--text-primary);
                  font-family: 'Inter', sans-serif;
                  font-size: var(--text-sm);
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="upiName" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Merchant Name</label>
                <input type="text" id="upiName" class="input" value="${this.config.upiName}" placeholder="e.g. The Taste Store" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid var(--border-glass);
                  color: var(--text-primary);
                  font-family: 'Inter', sans-serif;
                  font-size: var(--text-sm);
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
              </div>
            </div>
            
            <p style="font-size: var(--text-xs); color: #FF8960; margin-top: -6px; line-height: 1.5; font-weight: 500;">
              * Critical: Make sure the UPI VPA is correct. Scanning customers will pay directly to this account.
            </p>

            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="gstPercent" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">GST Tax rate (%)</label>
                <input type="number" id="gstPercent" class="input" value="${this.config.gstPercent}" placeholder="5" min="0" step="0.5" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid var(--border-glass);
                  color: var(--text-primary);
                  font-family: 'Inter', sans-serif;
                  font-size: var(--text-sm);
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
              </div>
              <div class="input-group" style="flex: 1; min-width: 200px;">
                <label for="orderNumberPrefix" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Order Prefix</label>
                <input type="text" id="orderNumberPrefix" class="input" value="${this.config.orderNumberPrefix}" placeholder="TT" maxlength="4" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid var(--border-glass);
                  color: var(--text-primary);
                  font-family: 'Inter', sans-serif;
                  font-size: var(--text-sm);
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
              </div>
            </div>
          </div>
        </div>

        <!-- Security & Admin PIN -->
        <div class="card card-glass" style="
          padding: 24px;
          background: rgba(255,255,255,0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-xl);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        ">
          <h3 style="
            font-family: 'Plus Jakarta Sans', sans-serif; 
            font-size: var(--text-base); 
            font-weight: 800; 
            color: var(--text-primary); 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            margin-top: 0;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
          ">
            <span class="material-symbols-rounded" style="color: var(--color-primary); filter: drop-shadow(0 0 4px rgba(255,94,54,0.3));">security</span>
            Security Credentials
          </h3>
          
          <div class="input-group" style="max-width: 320px;">
            <label for="adminPin" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Admin Lock PIN (4 digits)</label>
            <input type="password" id="adminPin" class="input" value="${this.config.adminPin}" maxlength="4" style="
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

        <!-- Cloud Synchronization Section -->
        <div class="card card-glass" style="
          padding: 24px;
          background: rgba(255,255,255,0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-xl);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        ">
          <h3 style="
            font-family: 'Plus Jakarta Sans', sans-serif; 
            font-size: var(--text-base); 
            font-weight: 800; 
            color: var(--text-primary); 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            margin-top: 0;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
          ">
            <span class="material-symbols-rounded" style="color: var(--color-primary); filter: drop-shadow(0 0 4px rgba(255,94,54,0.3));">cloud_sync</span>
            Cloud Synchronization (Supabase)
          </h3>
          
          <div style="display: flex; flex-direction: column; gap: 18px;">
            <div class="input-group">
              <label for="supabaseUrl" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Supabase Project URL</label>
              <input type="url" id="supabaseUrl" class="input" value="${this.config.supabaseUrl || ''}" placeholder="https://your-project.supabase.co" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>

            <div class="input-group">
              <label for="supabaseKey" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Supabase Anon Key</label>
              <input type="password" id="supabaseKey" class="input" value="${this.config.supabaseKey || ''}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>

            <div style="display: flex; gap: 12px; margin-top: 4px;">
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
                <span class="material-symbols-rounded" style="font-size: 18px;">sync_saved_locally</span>
                Test Cloud Connection
              </button>
            </div>
          </div>
        </div>

        <!-- Data Backup & Export -->
        <div class="card card-glass" style="
          padding: 24px;
          background: rgba(255,255,255,0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-xl);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        ">
          <h3 style="
            font-family: 'Plus Jakarta Sans', sans-serif; 
            font-size: var(--text-base); 
            font-weight: 800; 
            color: var(--text-primary); 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            margin-top: 0;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
          ">
            <span class="material-symbols-rounded" style="color: var(--color-primary); filter: drop-shadow(0 0 4px rgba(255,94,54,0.3));">backup</span>
            Data Backup & Export
          </h3>
          
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

    // Add focus listeners for input controls border glows
    const inputs = this.container.querySelectorAll('.input');
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        input.style.borderColor = 'var(--color-primary)';
        input.style.boxShadow = '0 0 10px rgba(255, 94, 54, 0.25)';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = 'var(--border-glass)';
        input.style.boxShadow = 'none';
      });
    });
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

    // Save configurations
    document.getElementById('btn-save-settings').addEventListener('click', async () => {
      playSound(800, 100);
      vibrateDevice([50, 30]);

      // Form validation
      const name = document.getElementById('restaurantName').value.trim();
      const upiId = document.getElementById('upiId').value.trim();
      const adminPin = document.getElementById('adminPin').value.trim();

      if (!name) {
        showToast('Restaurant name is required', 'warning');
        return;
      }
      if (!upiId) {
        showToast('UPI ID is required for generating checkout QR codes', 'warning');
        return;
      }
      if (adminPin.length !== 4 || isNaN(adminPin)) {
        showToast('Admin lock PIN must be exactly 4 digits', 'warning');
        return;
      }

      // Collect inputs
      const fields = [
        'restaurantName',
        'restaurantTagline',
        'restaurantPhone',
        'restaurantAddress',
        'upiId',
        'upiName',
        'gstPercent',
        'printerWidth',
        'adminPin',
        'orderNumberPrefix',
        'supabaseUrl',
        'supabaseKey'
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
      const width = this.config.printerWidth === '80' ? 48 : 32;
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
        .text(`Paper width format: ${this.config.printerWidth}mm (${width} columns)`)
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

  unmount() {
    this.container = null;
  }
}
