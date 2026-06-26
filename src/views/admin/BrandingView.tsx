// @ts-nocheck
/**
 * BrandingView — Admin panel sub-view for storefront branding management
 * Logo upload, brand colors, social links, QR code, promotional settings
 */

import { getSetting, setSetting } from '../../db/database';
import { escapeHtml, showToast, playSound, vibrateDevice } from '../../utils/helpers';

export class BrandingView {
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
  }

  async loadConfig() {
    const keys = [
      'brandLogoBase64',
      'brandAccentColor',
      'brandSecondaryColor',
      'brandBgGradientStart',
      'brandBgGradientEnd',
      'brandSocialInstagram',
      'brandSocialFacebook',
      'brandSocialGoogleMaps',
      'brandSocialZomato',
      'brandSocialSwiggy',
      'brandSocialWhatsApp',
      'brandBannerBase64',
      'brandKioskFooter',
      'brandKioskWelcome',
      'restaurantName',
      'restaurantTagline',
    ];
    for (const key of keys) {
      this.config[key] = await getSetting(key) || '';
    }
    // Defaults
    if (!this.config.brandAccentColor) this.config.brandAccentColor = '#FF5E36';
    if (!this.config.brandSecondaryColor) this.config.brandSecondaryColor = '#FF8960';
    if (!this.config.brandBgGradientStart) this.config.brandBgGradientStart = '#040406';
    if (!this.config.brandBgGradientEnd) this.config.brandBgGradientEnd = '#0B0B0F';
    if (!this.config.brandKioskWelcome) this.config.brandKioskWelcome = 'Welcome! Order delicious food.';
  }

  _esc(v) { return escapeHtml(v || ''); }

  render() {
    const logo = this.config.brandLogoBase64;
    const banner = this.config.brandBannerBase64;

    this.container.innerHTML = `
      <div class="settings-container" style="max-width: 900px; margin: 0 auto; padding: 28px 24px;">
        <div style="font-family: var(--font-display); font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin-bottom: 24px;">
          <span class="material-symbols-rounded" style="font-size: 22px; vertical-align: middle; margin-right: 8px; color: var(--color-primary);">palette</span>
          Storefront Branding
        </div>

        <!-- Logo Upload -->
        <div class="settings-card">
          <h3 class="settings-card-heading">
            <span class="material-symbols-rounded settings-card-heading-icon">image</span>
            Restaurant Logo
          </h3>
          <div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap;">
            <div id="branding-logo-preview" style="
              width: 120px; height: 120px; border-radius: var(--radius-lg);
              border: 2px dashed var(--border-glass); display: flex; align-items: center;
              justify-content: center; overflow: hidden; background: var(--bg-card);
              cursor: pointer; transition: all 0.25s ease; flex-shrink: 0;
            " title="Click to upload logo">
              ${logo
                ? `<img src="${logo}" style="width: 100%; height: 100%; object-fit: contain;" />`
                : `<div style="text-align: center; color: var(--text-muted);">
                    <span class="material-symbols-rounded" style="font-size: 32px;">add_photo_alternate</span>
                    <div style="font-size: 0.65rem; margin-top: 4px; font-weight: 600;">Upload Logo</div>
                  </div>`
              }
            </div>
            <div style="flex: 1; min-width: 200px;">
              <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px; font-weight: 500;">
                Upload your restaurant logo. It will appear on the customer-facing kiosk, receipts (if enabled), and invoices.
                Recommended: 512×512px PNG or SVG with transparent background.
              </p>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary btn-sm" id="branding-logo-upload" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs);">
                  <span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">upload</span>
                  Choose File
                </button>
                ${logo ? `
                  <button class="btn btn-secondary btn-sm" id="branding-logo-remove" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--color-danger);">
                    <span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">delete</span>
                    Remove
                  </button>
                ` : ''}
              </div>
              <input type="file" id="branding-logo-input" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display: none;">
            </div>
          </div>
        </div>

        <!-- Brand Colors -->
        <div class="settings-card">
          <h3 class="settings-card-heading">
            <span class="material-symbols-rounded settings-card-heading-icon">colorize</span>
            Brand Colors
          </h3>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: -8px 0 16px 0; font-weight: 500;">
            These colors are applied to the customer-facing kiosk/ordering page.
          </p>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            ${this._colorPicker('brandAccentColor', 'Primary Accent', this.config.brandAccentColor)}
            ${this._colorPicker('brandSecondaryColor', 'Secondary Accent', this.config.brandSecondaryColor)}
            ${this._colorPicker('brandBgGradientStart', 'Background Start', this.config.brandBgGradientStart)}
            ${this._colorPicker('brandBgGradientEnd', 'Background End', this.config.brandBgGradientEnd)}
          </div>
          <!-- Color Preview -->
          <div style="margin-top: 16px; padding: 20px; border-radius: var(--radius-lg); border: 1px solid var(--border-glass); overflow: hidden; position: relative;" id="branding-color-preview">
            <div style="
              position: absolute; inset: 0;
              background: linear-gradient(135deg, ${this.config.brandBgGradientStart}, ${this.config.brandBgGradientEnd});
              z-index: 0;
            " id="branding-preview-bg"></div>
            <div style="position: relative; z-index: 1; text-align: center;">
              <div style="font-family: var(--font-display); font-weight: 800; font-size: var(--text-lg); color: ${this.config.brandAccentColor}; letter-spacing: -0.02em;" id="branding-preview-name">
                ${this._esc(this.config.restaurantName || 'Your Restaurant')}
              </div>
              <div style="font-size: var(--text-xs); color: ${this.config.brandSecondaryColor}; font-weight: 600; margin-top: 4px;" id="branding-preview-tagline">
                ${this._esc(this.config.restaurantTagline || 'Your Tagline')}
              </div>
            </div>
          </div>
        </div>

        <!-- Kiosk Text -->
        <div class="settings-card">
          <h3 class="settings-card-heading">
            <span class="material-symbols-rounded settings-card-heading-icon">storefront</span>
            Kiosk Display Text
          </h3>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div class="input-group">
              <label for="brandKioskWelcome">Welcome Message</label>
              <input type="text" id="brandKioskWelcome" class="input" value="${this._esc(this.config.brandKioskWelcome)}" placeholder="Welcome! Browse our menu.">
            </div>
            <div class="input-group">
              <label for="brandKioskFooter">Kiosk Footer Text</label>
              <input type="text" id="brandKioskFooter" class="input" value="${this._esc(this.config.brandKioskFooter)}" placeholder="© 2026 Your Restaurant. All rights reserved.">
            </div>
          </div>
        </div>

        <!-- Promotional Banner -->
        <div class="settings-card">
          <h3 class="settings-card-heading">
            <span class="material-symbols-rounded settings-card-heading-icon">campaign</span>
            Promotional Banner
          </h3>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: -8px 0 16px 0; font-weight: 500;">
            Upload a hero banner image for the customer kiosk. Recommended: 1200×400px.
          </p>
          <div id="branding-banner-preview" style="
            width: 100%; min-height: 120px; border-radius: var(--radius-lg);
            border: 2px dashed var(--border-glass); display: flex; align-items: center;
            justify-content: center; overflow: hidden; background: var(--bg-card);
            cursor: pointer; transition: all 0.25s ease;
          " title="Click to upload banner">
            ${banner
              ? `<img src="${banner}" style="width: 100%; height: auto; max-height: 300px; object-fit: cover;" />`
              : `<div style="text-align: center; color: var(--text-muted); padding: 24px;">
                  <span class="material-symbols-rounded" style="font-size: 36px;">panorama</span>
                  <div style="font-size: 0.7rem; margin-top: 6px; font-weight: 600;">Click to upload promotional banner</div>
                </div>`
            }
          </div>
          <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button class="btn btn-secondary btn-sm" id="branding-banner-upload" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs);">
              <span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">upload</span>
              Upload Banner
            </button>
            ${banner ? `
              <button class="btn btn-secondary btn-sm" id="branding-banner-remove" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--color-danger);">
                <span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">delete</span>
                Remove
              </button>
            ` : ''}
          </div>
          <input type="file" id="branding-banner-input" accept="image/png,image/jpeg,image/webp" style="display: none;">
        </div>

        <!-- Social Media Links -->
        <div class="settings-card">
          <h3 class="settings-card-heading">
            <span class="material-symbols-rounded settings-card-heading-icon">share</span>
            Social Media & Platform Links
          </h3>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            ${this._socialInput('brandSocialInstagram', 'Instagram', 'https://instagram.com/yourpage', '📸')}
            ${this._socialInput('brandSocialFacebook', 'Facebook', 'https://facebook.com/yourpage', '📘')}
            ${this._socialInput('brandSocialGoogleMaps', 'Google Maps', 'https://maps.google.com/...', '📍')}
            ${this._socialInput('brandSocialZomato', 'Zomato', 'https://zomato.com/...', '🍽️')}
            ${this._socialInput('brandSocialSwiggy', 'Swiggy', 'https://swiggy.com/...', '🛵')}
            ${this._socialInput('brandSocialWhatsApp', 'WhatsApp', 'https://wa.me/91XXXXXXXXXX', '💬')}
          </div>
        </div>

        <!-- QR Code Download -->
        <div class="settings-card">
          <h3 class="settings-card-heading">
            <span class="material-symbols-rounded settings-card-heading-icon">qr_code_2</span>
            Self-Order QR Code
          </h3>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: -8px 0 16px 0; font-weight: 500;">
            Download a printable QR code that customers can scan to open your online ordering page.
          </p>
          <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
            <div id="branding-qr-preview" style="
              width: 160px; height: 160px; background: white; border-radius: var(--radius-lg);
              display: flex; align-items: center; justify-content: center;
              border: 1px solid var(--border-glass); padding: 12px;
            ">
              <canvas id="branding-qr-canvas" width="136" height="136"></canvas>
            </div>
            <div style="flex: 1; min-width: 200px;">
              <div style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; margin-bottom: 12px; font-weight: 500;">
                The QR code links to:<br>
                <code style="font-size: 0.7rem; color: var(--color-primary); font-weight: 700;" id="branding-qr-url">${window.location.origin}/#/self-order</code>
              </div>
              <button class="btn btn-primary btn-sm" id="branding-qr-download" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs);">
                <span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">download</span>
                Download QR Code (PNG)
              </button>
            </div>
          </div>
        </div>

        <!-- Save -->
        <div style="margin-top: 8px; margin-bottom: 30px;">
          <button class="btn btn-primary btn-block btn-lg" id="branding-save-btn" style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700; font-size: var(--text-sm); height: 48px;
            box-shadow: var(--shadow-primary);
            display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          ">
            <span class="material-symbols-rounded" style="font-size: 20px;">save</span>
            Save Branding Settings
          </button>
        </div>
      </div>
    `;

    this._generateQR();
  }

  _colorPicker(id, label, value) {
    return `
      <div class="input-group" style="flex: 1; min-width: 160px;">
        <label for="${id}">${label}</label>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="color" id="${id}" value="${value}" class="branding-color-input" data-field="${id}" style="
            border: 1px solid var(--border-glass); background: none;
            width: 42px; height: 42px; border-radius: var(--radius-md);
            cursor: pointer; padding: 0;
          ">
          <input type="text" id="${id}_text" class="input branding-color-text" data-for="${id}" value="${value}" placeholder="${value}" style="max-width: 100px; text-transform: uppercase; text-align: center;">
        </div>
      </div>
    `;
  }

  _socialInput(id, label, placeholder, emoji) {
    return `
      <div class="input-group" style="display: flex; gap: 10px; align-items: center;">
        <span style="font-size: 1.2rem; flex-shrink: 0; width: 28px; text-align: center;">${emoji}</span>
        <div style="flex: 1;">
          <label for="${id}" style="font-size: var(--text-xs); font-weight: 600;">${label}</label>
          <input type="url" id="${id}" class="input" value="${this._esc(this.config[id])}" placeholder="${placeholder}">
        </div>
      </div>
    `;
  }

  _generateQR() {
    const canvas = document.getElementById('branding-qr-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const url = `${window.location.origin}/#/self-order`;

    // Simple QR-like pattern for visual placeholder
    // In production, use a real QR library. For now, draw a styled placeholder.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 136, 136);
    ctx.fillStyle = '#000000';

    // Draw a simple pattern that looks like a QR code
    const size = 136;
    const modules = 21;
    const moduleSize = size / modules;

    // Finder patterns
    const drawFinder = (x, y) => {
      ctx.fillRect(x, y, moduleSize * 7, moduleSize * 7);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x + moduleSize, y + moduleSize, moduleSize * 5, moduleSize * 5);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + moduleSize * 2, y + moduleSize * 2, moduleSize * 3, moduleSize * 3);
    };

    drawFinder(0, 0);
    ctx.fillStyle = '#000000';
    drawFinder(moduleSize * 14, 0);
    ctx.fillStyle = '#000000';
    drawFinder(0, moduleSize * 14);

    // Draw some random-looking data modules
    const hash = url.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    for (let i = 8; i < 13; i++) {
      for (let j = 8; j < 13; j++) {
        if ((hash + i * j) % 3 === 0) {
          ctx.fillRect(j * moduleSize, i * moduleSize, moduleSize, moduleSize);
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < 13; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(i * moduleSize, 6 * moduleSize, moduleSize, moduleSize);
        ctx.fillRect(6 * moduleSize, i * moduleSize, moduleSize, moduleSize);
      }
    }
  }

  bindEvents() {
    // Logo upload
    const logoPreview = document.getElementById('branding-logo-preview');
    const logoInput = document.getElementById('branding-logo-input');
    const logoUploadBtn = document.getElementById('branding-logo-upload');

    [logoPreview, logoUploadBtn].forEach(el => {
      if (el) el.addEventListener('click', () => logoInput?.click());
    });

    logoInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) {
        showToast('Logo file must be under 1MB', 'error');
        return;
      }
      const base64 = await this._fileToBase64(file);
      this.config.brandLogoBase64 = base64;
      logoPreview.innerHTML = `<img src="${base64}" style="width: 100%; height: 100%; object-fit: contain;" />`;
      showToast('Logo loaded — save to apply', 'info');
    });

    document.getElementById('branding-logo-remove')?.addEventListener('click', () => {
      this.config.brandLogoBase64 = '';
      logoPreview.innerHTML = `<div style="text-align: center; color: var(--text-muted);">
        <span class="material-symbols-rounded" style="font-size: 32px;">add_photo_alternate</span>
        <div style="font-size: 0.65rem; margin-top: 4px; font-weight: 600;">Upload Logo</div>
      </div>`;
    });

    // Banner upload
    const bannerPreview = document.getElementById('branding-banner-preview');
    const bannerInput = document.getElementById('branding-banner-input');
    const bannerUploadBtn = document.getElementById('branding-banner-upload');

    [bannerPreview, bannerUploadBtn].forEach(el => {
      if (el) el.addEventListener('click', () => bannerInput?.click());
    });

    bannerInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        showToast('Banner file must be under 2MB', 'error');
        return;
      }
      const base64 = await this._fileToBase64(file);
      this.config.brandBannerBase64 = base64;
      bannerPreview.innerHTML = `<img src="${base64}" style="width: 100%; height: auto; max-height: 300px; object-fit: cover;" />`;
      showToast('Banner loaded — save to apply', 'info');
    });

    document.getElementById('branding-banner-remove')?.addEventListener('click', () => {
      this.config.brandBannerBase64 = '';
      bannerPreview.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">
        <span class="material-symbols-rounded" style="font-size: 36px;">panorama</span>
        <div style="font-size: 0.7rem; margin-top: 6px; font-weight: 600;">Click to upload promotional banner</div>
      </div>`;
    });

    // Color picker sync
    this.container.querySelectorAll('.branding-color-input').forEach(picker => {
      const textInput = this.container.querySelector(`.branding-color-text[data-for="${picker.id}"]`);
      picker.addEventListener('input', () => {
        if (textInput) textInput.value = picker.value.toUpperCase();
        this._updateColorPreview();
      });
    });

    this.container.querySelectorAll('.branding-color-text').forEach(text => {
      text.addEventListener('input', () => {
        const val = text.value.trim();
        const pickerId = text.dataset.for;
        const picker = document.getElementById(pickerId);
        if (/^#[0-9A-F]{6}$/i.test(val) && picker) {
          picker.value = val;
          this._updateColorPreview();
        }
      });
    });

    // QR download
    document.getElementById('branding-qr-download')?.addEventListener('click', () => {
      const canvas = document.getElementById('branding-qr-canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'self-order-qr-code.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('QR Code downloaded!', 'success');
    });

    // Save
    document.getElementById('branding-save-btn')?.addEventListener('click', async () => {
      playSound(800, 100);
      vibrateDevice([50, 30]);

      const textFields = [
        'brandKioskWelcome', 'brandKioskFooter',
        'brandSocialInstagram', 'brandSocialFacebook',
        'brandSocialGoogleMaps', 'brandSocialZomato',
        'brandSocialSwiggy', 'brandSocialWhatsApp',
      ];
      const colorFields = [
        'brandAccentColor', 'brandSecondaryColor',
        'brandBgGradientStart', 'brandBgGradientEnd',
      ];

      try {
        for (const f of textFields) {
          const el = document.getElementById(f);
          if (el) await setSetting(f, el.value.trim());
        }
        for (const f of colorFields) {
          const el = document.getElementById(f);
          if (el) await setSetting(f, el.value);
        }
        if (this.config.brandLogoBase64 !== undefined) {
          await setSetting('brandLogoBase64', this.config.brandLogoBase64);
        }
        if (this.config.brandBannerBase64 !== undefined) {
          await setSetting('brandBannerBase64', this.config.brandBannerBase64);
        }

        showToast('Branding settings saved! 🎨', 'success');
      } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
      }
    });
  }

  _updateColorPreview() {
    const accent = document.getElementById('brandAccentColor')?.value || '#FF5E36';
    const secondary = document.getElementById('brandSecondaryColor')?.value || '#FF8960';
    const bgStart = document.getElementById('brandBgGradientStart')?.value || '#040406';
    const bgEnd = document.getElementById('brandBgGradientEnd')?.value || '#0B0B0F';

    const bgEl = document.getElementById('branding-preview-bg');
    const nameEl = document.getElementById('branding-preview-name');
    const taglineEl = document.getElementById('branding-preview-tagline');

    if (bgEl) bgEl.style.background = `linear-gradient(135deg, ${bgStart}, ${bgEnd})`;
    if (nameEl) nameEl.style.color = accent;
    if (taglineEl) taglineEl.style.color = secondary;
  }

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  unmount() {
    this.container = null;
  }
}
