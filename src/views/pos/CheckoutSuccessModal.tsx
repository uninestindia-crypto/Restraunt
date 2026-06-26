// @ts-nocheck
/**
 * CheckoutSuccessModal — Visual Monospaced Receipt + Print Fallbacks + WhatsApp Bill Share
 */

import { formatCurrency, showToast, playSound, vibrateDevice, escapeHtml } from '../../utils/helpers';
import { sendBillOnWhatsApp } from '../../services/whatsapp';
import { printerService } from '../../services/printer';
import { ReceiptBuilder } from '../../services/receipt';
import { getSetting } from '../../db/database';

export class CheckoutSuccessModal {
  constructor({ order, onClose }) {
    this.order = order;
    this.onClose = onClose;
    this.overlay = null;
    this.customerPhone = order.customerPhone || '';
  }

  async show() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'checkout-success-overlay';
    this.overlay.style.cssText = `
      background: rgba(4, 4, 8, 0.7);
      backdrop-filter: blur(16px);
      z-index: 9999;
      animation: modalFadeIn 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;
    
    this.overlay.innerHTML = await this.renderModal();
    document.body.appendChild(this.overlay);

    this.bindEvents();
    
    // Play sounds & haptics for feedback
    playSound(800, 100);
    setTimeout(() => playSound(1100, 120), 100);
    vibrateDevice([50, 30, 50]);
  }

  async renderModal() {
    const items = typeof this.order.items === 'string' ? JSON.parse(this.order.items) : (this.order.items || []);
    const subtotal = this.order.subtotal || 0;
    const tax = this.order.tax || 0;
    const total = this.order.total || 0;
    const orderNum = this.order.orderNumber.split('-').pop();
    const currencySymbol = localStorage.getItem('app_currency_symbol') || '₹';
    const taxLabel = localStorage.getItem('app_tax_label') || 'GST';

    const itemsHtml = items.map(item => {
      const name = item.itemName || item.name || 'Item';
      const qty = item.quantity || item.qty || 1;
      const price = item.price || 0;
      const rowText = `${name} x${qty}`;
      const priceText = `${currencySymbol}${(price * qty).toFixed(2)}`;
      
      // Pad to standard 32 character receipt layout
      const spaces = 32 - rowText.substring(0, 20).length - priceText.length;
      const padSpaces = spaces > 0 ? ' '.repeat(spaces) : ' ';
      return `<div style="text-align: left; white-space: pre;">${escapeHtml(rowText.substring(0, 20))}${padSpaces}${escapeHtml(priceText)}</div>`;
    }).join('\n');

    const restName = await getSetting('restaurantName') || 'The Taste';
    const restTag = await getSetting('restaurantTagline') || 'Fast Food & Chinese';
    const restAddr = await getSetting('restaurantAddress') || '';
    const restPhone = await getSetting('restaurantPhone') || '';
    const gstin = await getSetting('gstin') || '';

    // Style the Monospaced monocolor receipt beautifully
    const receiptHtml = `
      <div class="receipt-preview-paper" style="max-width: 290px;">
        <div class="receipt-line receipt-line-big">${escapeHtml(restName)}</div>
        <div class="receipt-line receipt-line-bold" style="font-size:10px; opacity:0.85; margin-bottom: 4px;">${escapeHtml(restTag)}</div>
        ${restAddr ? `<div class="receipt-line" style="font-size:9px;">${escapeHtml(restAddr)}</div>` : ''}
        ${restPhone ? `<div class="receipt-line" style="font-size:9px;">Phone: ${escapeHtml(restPhone)}</div>` : ''}
        ${gstin ? `<div class="receipt-line" style="font-size:9px;">GSTIN: ${escapeHtml(gstin)}</div>` : ''}
        <div class="receipt-divider">--------------------------------</div>
        <div class="flex-row-between">
          <span>ORDER #${escapeHtml(this.order.orderNumber.split('-').pop())}</span>
          <span class="txt-bold">${(this.order.type || 'takeaway').toUpperCase()}</span>
        </div>
        <div style="font-size:9px; opacity:0.8; margin-top:2px;">Date: ${new Date(this.order.createdAt).toLocaleString('en-IN')}</div>
        <div class="receipt-divider">--------------------------------</div>
        <div class="flex-row-between txt-bold">
          <span>ITEM</span>
          <span>AMOUNT</span>
        </div>
        <div class="receipt-divider">--------------------------------</div>
        <div style="font-size: 10px;">${itemsHtml}</div>
        <div class="receipt-divider">--------------------------------</div>
        <div class="flex-row-between">
          <span>Subtotal</span>
          <span>${currencySymbol}${subtotal.toFixed(2)}</span>
        </div>
        ${tax > 0 ? `
        <div class="flex-row-between" style="margin-top:2px;">
          <span>${taxLabel}</span>
          <span>${currencySymbol}${tax.toFixed(2)}</span>
        </div>
        ` : ''}
        <div class="receipt-divider">================================</div>
        <div class="flex-row-between txt-bold" style="font-size:13px;">
          <span>TOTAL</span>
          <span>${currencySymbol}${total.toFixed(2)}</span>
        </div>
        <div class="receipt-divider">================================</div>
        <div class="receipt-line receipt-line-bold" style="font-size:10px;">
          PAYMENT: ${(this.order.paymentMethod || 'cash').toUpperCase()} (${(this.order.paymentStatus || 'paid').toUpperCase()})
        </div>
        ${this.order.customerPhone ? `<div class="receipt-line-left txt-bold" style="font-size:9px; margin-top:8px;">Cust: ${escapeHtml(this.order.customerName || 'Walk-in')} (${escapeHtml(this.order.customerPhone)})</div>` : ''}
        <div class="receipt-line" style="margin-top:12px; font-style:italic;">Thank you! Visit again! 🙏</div>
      </div>
    `;

    return `
      <div class="modal" tabindex="-1" role="dialog" style="max-width: 440px;">
        <div class="modal-header">
          <h3 class="txt-primary txt-bold flex-row-between" style="gap: 10px; margin: 0;">
            <span class="material-symbols-rounded txt-success" style="font-size: 24px; filter: drop-shadow(0 0 6px rgba(16,185,129,0.3));">check_circle</span>
            Order Placed Successfully!
          </h3>
        </div>

        <div class="modal-body scrollbar-none" style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Visual monospaced receipt -->
          <div style="display: flex; justify-content: center; background: rgba(0,0,0,0.22); padding: 16px; border-radius: var(--radius-lg); border: 1px solid var(--border-glass);">
            ${receiptHtml}
          </div>

          <!-- WhatsApp message panel -->
          <div class="whatsapp-share-card">
            <label class="settings-label">Share Bill on WhatsApp</label>
            <div style="display: flex; gap: 8px;">
              <input type="tel" id="success-whatsapp-phone" class="input" placeholder="Customer Mobile (10 digits)" value="${escapeHtml(this.customerPhone)}">
              <button class="btn btn-whatsapp" id="btn-success-whatsapp" style="padding: 0 16px; min-height: 44px; display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-rounded" style="font-size: 18px;">chat</span>
                Send VPA Bill
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="flex-direction: column; align-items: stretch; gap: 12px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <button class="btn btn-secondary" id="btn-success-thermal-print">
              <span class="material-symbols-rounded txt-brand" style="font-size: 18px;">print</span>
              Print (Thermal)
            </button>
            <button class="btn btn-secondary" id="btn-success-browser-print">
              <span class="material-symbols-rounded" style="font-size: 18px; color:#60A5FA;">local_print_shop</span>
              Standard (A4)
            </button>
          </div>
          
          <button class="btn btn-primary btn-block btn-lg" id="btn-success-done">DONE / NEW ORDER</button>
        </div>
      </div>
      </div>

      <style>
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      </style>
    `;
  }

  bindEvents() {
    // Focus listener for input glow
    const waPhone = document.getElementById('success-whatsapp-phone');
    if (waPhone) {
      waPhone.addEventListener('focus', () => {
        waPhone.style.borderColor = 'var(--color-primary)';
        waPhone.style.boxShadow = '0 0 8px rgba(255, 94, 54, 0.2)';
      });
      waPhone.addEventListener('blur', () => {
        waPhone.style.borderColor = 'var(--border-glass)';
        waPhone.style.boxShadow = 'none';
      });
    }

    // Done button click
    document.getElementById('btn-success-done')?.addEventListener('click', () => {
      playSound(700, 80);
      this.close();
    });

    // Send WhatsApp button
    document.getElementById('btn-success-whatsapp')?.addEventListener('click', async () => {
      const phone = waPhone ? waPhone.value.trim() : '';
      if (!phone || phone.length !== 10 || isNaN(phone)) {
        showToast('Please enter a valid 10-digit customer mobile number', 'warning');
        return;
      }
      try {
        playSound(800, 100);
        vibrateDevice([40]);
        await sendBillOnWhatsApp(this.order, phone);
        showToast('Opening WhatsApp bill share...', 'success');
      } catch (err) {
        showToast('Failed to open WhatsApp: ' + err.message, 'error');
      }
    });

    // Reprint Thermal Receipt
    document.getElementById('btn-success-thermal-print')?.addEventListener('click', async () => {
      playSound(800, 100);
      vibrateDevice([40]);

      if (!printerService.isConnected) {
        showToast('Bluetooth thermal printer is not connected. Setup in settings.', 'warning', 4000);
        return;
      }

      try {
        const settings = {
          restaurantName: await getSetting('restaurantName') || 'The Taste',
          restaurantTagline: await getSetting('restaurantTagline') || 'Fast Food & Chinese',
          restaurantPhone: await getSetting('restaurantPhone') || '',
          restaurantAddress: await getSetting('restaurantAddress') || '',
          printerWidth: await getSetting('printerWidth') || '58',
        };
        const receiptData = ReceiptBuilder.orderReceipt(this.order, settings);
        await printerService.print(receiptData);
        showToast('Thermal receipt printed!', 'success');
      } catch (err) {
        console.error('Success print failed:', err);
        showToast('Print failed: ' + err.message, 'error');
      }
    });

    // Standard A4 Browser Print
    document.getElementById('btn-success-browser-print')?.addEventListener('click', () => {
      playSound(800, 100);
      vibrateDevice([40]);
      this.browserPrint();
    });
  }

  async browserPrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocker active! Please allow popups to print.', 'warning');
      return;
    }

    // Write a loading message while settings and QR codes are generated
    printWindow.document.write(`
      <html>
        <head>
          <title>Generating Invoice...</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #64748b; }
            .loader { border: 3px solid #e2e8f0; border-top: 3px solid #ff5e36; border-radius: 50%; width: 24px; height: 24px; animation: spin 0.8s linear infinite; margin-right: 12px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="loader"></div>
          <div>Preparing premium invoice print preview...</div>
        </body>
      </html>
    `);

    try {
      // Load all settings
      const settingsKeys = [
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
        'gstPercent',
        'showAddressOnReceipt',
        'showPhoneOnReceipt',
        'showGstinOnReceipt',
        'showFssaiOnReceipt',
        'showFooterOnReceipt',
        // Invoice designer settings
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
        'upiId',
        'upiName'
      ];

      const settings = {};
      for (const key of settingsKeys) {
        settings[key] = await getSetting(key);
      }

      // Generate UPI QR code if enabled
      let upiQrDataUrl = '';
      const showUpiQr = settings.invoiceShowUpiQr === 'true' || settings.invoiceShowUpiQr === true;
      if (showUpiQr && settings.upiId) {
        try {
          const { generateUPIQRDataURL } = await import('../../services/upi');
          upiQrDataUrl = await generateUPIQRDataURL({
            amount: this.order.total,
            orderId: this.order.orderNumber
          });
        } catch (err) {
          console.error('Failed to generate UPI QR code for printed bill:', err);
        }
      }

      // Generate A4 invoice HTML
      const { InvoiceGenerator } = await import('../../services/invoiceGenerator');
      const invoiceHtml = InvoiceGenerator.generateInvoiceHTML(this.order, settings, upiQrDataUrl);

      // Replace content
      printWindow.document.open();
      printWindow.document.write(invoiceHtml);
      printWindow.document.close();
    } catch (error) {
      console.error('Premium invoice print generation failed:', error);
      printWindow.document.open();
      printWindow.document.write(`
        <html>
          <body style="font-family: system-ui; text-align: center; padding: 40px; color: #ef4444;">
            <h3>Error generating invoice</h3>
            <p>${escapeHtml(error.message)}</p>
            <button onclick="window.close()">Close Window</button>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  close() {
    if (this.overlay) {
      this.overlay.style.animation = 'fadeOut 200ms ease forwards';
      const modal = this.overlay.querySelector('.modal');
      if (modal) modal.style.animation = 'slideDown 200ms ease forwards';

      setTimeout(() => {
        this.overlay.remove();
        this.overlay = null;
      }, 200);
    }
    if (this.onClose) this.onClose();
  }
}
