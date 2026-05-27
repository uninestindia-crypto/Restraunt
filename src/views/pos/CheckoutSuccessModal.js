/**
 * CheckoutSuccessModal — Visual Monospaced Receipt + Print Fallbacks + WhatsApp Bill Share
 */

import { formatCurrency, showToast, playSound, vibrateDevice, escapeHtml } from '../../utils/helpers.js';
import { sendBillOnWhatsApp } from '../../services/whatsapp.js';
import { printerService } from '../../services/printer.js';
import { ReceiptBuilder } from '../../services/receipt.js';
import { getSetting } from '../../db/database.js';

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
      position: fixed;
      inset: 0;
      background: rgba(4, 4, 8, 0.7);
      backdrop-filter: blur(16px);
      display: flex;
      align-items: center;
      justify-content: center;
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

    const itemsHtml = items.map(item => {
      const name = item.itemName || item.name || 'Item';
      const qty = item.quantity || item.qty || 1;
      const price = item.price || 0;
      const rowText = `${name} x${qty}`;
      const priceText = `₹${(price * qty).toFixed(2)}`;
      
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
      <div style="
        background: #FDFDFB;
        color: #1a1a1a;
        font-family: 'Courier New', 'Consolas', monospace;
        padding: 24px 16px;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3), inset 0 0 25px rgba(0,0,0,0.03);
        border: 1px solid rgba(0,0,0,0.12);
        width: 100%;
        max-width: 290px;
        box-sizing: border-box;
        line-height: 1.4;
        font-size: 11px;
      ">
        <div style="text-align:center; font-weight:900; font-size:13px; text-transform: uppercase; margin-bottom: 2px;">${escapeHtml(restName)}</div>
        <div style="text-align:center; font-size:10px; font-weight:bold; margin-bottom: 4px; opacity:0.85;">${escapeHtml(restTag)}</div>
        ${restAddr ? `<div style="text-align:center; font-size:9px; margin-bottom: 2px;">${escapeHtml(restAddr)}</div>` : ''}
        ${restPhone ? `<div style="text-align:center; font-size:9px; margin-bottom: 2px;">Phone: ${escapeHtml(restPhone)}</div>` : ''}
        ${gstin ? `<div style="text-align:center; font-size:9px; margin-bottom: 2px;">GSTIN: ${escapeHtml(gstin)}</div>` : ''}
        <div style="text-align:center; margin: 4px 0; font-weight:bold;">--------------------------------</div>
        <div style="display:flex; justify-content:space-between;">
          <span>ORDER #${escapeHtml(this.order.orderNumber.split('-').pop())}</span>
          <span style="font-weight:bold;">${(this.order.type || 'takeaway').toUpperCase()}</span>
        </div>
        <div style="font-size:9px; opacity:0.8; margin-top:2px;">Date: ${new Date(this.order.createdAt).toLocaleString('en-IN')}</div>
        <div style="text-align:center; margin: 4px 0; font-weight:bold;">--------------------------------</div>
        <div style="font-weight:bold; text-align:left; display:flex; justify-content:space-between;">
          <span>ITEM</span>
          <span>AMOUNT</span>
        </div>
        <div style="text-align:center; margin: 2px 0;">--------------------------------</div>
        <div style="font-size: 10px;">${itemsHtml}</div>
        <div style="text-align:center; margin: 4px 0; font-weight:bold;">--------------------------------</div>
        <div style="display:flex; justify-content:space-between;">
          <span>Subtotal</span>
          <span>₹${subtotal.toFixed(2)}</span>
        </div>
        ${tax > 0 ? `
        <div style="display:flex; justify-content:space-between; margin-top:2px;">
          <span>GST / Tax</span>
          <span>₹${tax.toFixed(2)}</span>
        </div>
        ` : ''}
        <div style="text-align:center; margin: 4px 0; font-weight:bold;">================================</div>
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:13px;">
          <span>TOTAL</span>
          <span>₹${total.toFixed(2)}</span>
        </div>
        <div style="text-align:center; margin: 4px 0; font-weight:bold;">================================</div>
        <div style="text-align:center; font-weight:bold; font-size:10px;">
          PAYMENT: ${(this.order.paymentMethod || 'cash').toUpperCase()} (${(this.order.paymentStatus || 'paid').toUpperCase()})
        </div>
        ${this.order.customerPhone ? `<div style="text-align:left; font-size:9px; margin-top:8px; font-weight:bold;">Cust: ${escapeHtml(this.order.customerName || 'Walk-in')} (${escapeHtml(this.order.customerPhone)})</div>` : ''}
        <div style="text-align:center; margin-top:12px; font-style:italic;">Thank you! Visit again! 🙏</div>
      </div>
    `;

    return `
      <div class="modal card-glass" tabindex="-1" role="dialog" style="
        background: rgba(18, 18, 30, 0.95);
        backdrop-filter: blur(24px);
        border: 1px solid var(--border-glass);
        box-shadow: 0 30px 60px rgba(0,0,0,0.6), var(--shadow-primary);
        max-width: 440px;
        width: calc(100% - 32px);
        border-radius: var(--radius-xl);
        overflow: hidden;
        animation: modalSlideUp 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      ">
        <div class="modal-header" style="
          padding: 18px 24px;
          border-bottom: 1px solid var(--border-glass);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255,255,255,0.01);
        ">
          <h3 style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: var(--text-base);
            font-weight: 800;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 0;
            letter-spacing: -0.02em;
          ">
            <span class="material-symbols-rounded" style="color: var(--color-success); font-size: 24px; filter: drop-shadow(0 0 6px rgba(16,185,129,0.3));">check_circle</span>
            Order Placed Successfully!
          </h3>
        </div>

        <div class="modal-body scrollbar-none" style="padding: 24px; display: flex; flex-direction: column; gap: 20px; max-height:75vh; overflow-y:auto;">
          <!-- Visual monospaced receipt -->
          <div style="display: flex; justify-content: center; background: rgba(0,0,0,0.22); padding: 16px; border-radius: var(--radius-lg); border: 1px solid var(--border-glass);">
            ${receiptHtml}
          </div>

          <!-- WhatsApp message panel -->
          <div style="
            background: rgba(255, 255, 255, 0.01); 
            border: 1px solid var(--border-glass); 
            padding: 16px; 
            border-radius: var(--radius-lg);
          ">
            <label style="display:block; font-family:'Plus Jakarta Sans', sans-serif; font-size:10px; font-weight:800; color:var(--text-secondary); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Share Bill on WhatsApp</label>
            <div style="display: flex; gap: 8px;">
              <input type="tel" id="success-whatsapp-phone" class="input" placeholder="Customer Mobile (10 digits)" value="${escapeHtml(this.customerPhone)}" style="
                flex: 1;
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 10px 12px;
                border-radius: var(--radius-md);
                outline: none;
                transition: border var(--transition-fast);
              ">
              <button class="btn" id="btn-success-whatsapp" style="
                background: #25D366 !important;
                color: white !important;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                padding: 0 16px;
                min-height: 38px;
                border-radius: var(--radius-md);
                display: flex;
                align-items: center;
                gap: 6px;
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(37,211,102,0.25);
                transition: transform 0.2s ease;
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">chat</span>
                Send VPA Bill
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="
          border-top: 1px solid var(--border-glass);
          padding: 18px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: rgba(255,255,255,0.01);
        ">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <button class="btn btn-secondary" id="btn-success-thermal-print" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 40px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              border: 1px solid var(--border-glass);
              background: rgba(255,255,255,0.02);
            ">
              <span class="material-symbols-rounded" style="font-size: 18px; color:var(--color-primary);">print</span>
              Print (Thermal)
            </button>
            <button class="btn btn-secondary" id="btn-success-browser-print" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 40px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              border: 1px solid var(--border-glass);
              background: rgba(255,255,255,0.02);
            ">
              <span class="material-symbols-rounded" style="font-size: 18px; color:#60A5FA;">local_print_shop</span>
              Standard (A4)
            </button>
          </div>
          
          <button class="btn btn-primary btn-block btn-lg" id="btn-success-done" style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 800;
            font-size: var(--text-sm);
            height: 44px;
            box-shadow: var(--shadow-primary);
            letter-spacing: 0.02em;
          ">DONE / NEW ORDER</button>
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
          const { generateUPIQRDataURL } = await import('../../services/upi.js');
          upiQrDataUrl = await generateUPIQRDataURL({
            amount: this.order.total,
            orderId: this.order.orderNumber
          });
        } catch (err) {
          console.error('Failed to generate UPI QR code for printed bill:', err);
        }
      }

      // Generate A4 invoice HTML
      const { InvoiceGenerator } = await import('../../services/invoiceGenerator.js');
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
