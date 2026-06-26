// @ts-nocheck
/**
 * PaymentModal — UPI QR code + Cash payment
 */

import { formatCurrency, formatCurrencyShort, showToast } from '../../utils/helpers';
import { generateUPIQR, buildUPILink } from '../../services/upi';
import { getSetting } from '../../db/database';

export class PaymentModal {
  constructor({ order, onConfirmPayment, onClose }) {
    this.order = order;
    this.onConfirmPayment = onConfirmPayment;
    this.onClose = onClose;

    this.selectedMethod = 'upi'; // 'upi' | 'cash'
    this.cashReceived = '';
    this.overlay = null;
    this.isProcessing = false;

    // Split payment state
    this.splitMode = 'full'; // 'full' | 'half' | 'custom'
    this.customAmount = '';
    this.qrAmount = this.order.total; // amount encoded in QR
    this.currencySymbol = localStorage.getItem('app_currency_symbol') || '₹';
  }

  show() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'payment-modal-overlay';
    this.overlay.innerHTML = this.renderModal();

    document.body.appendChild(this.overlay);

    // Close on backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Bind events
    this.bindEvents();

    // Generate UPI QR
    this.generateQR();

    // Trap focus inside modal
    const modal = this.overlay.querySelector('.modal');
    if (modal) modal.focus();
  }

  renderModal() {
    return `
      <div class="modal" tabindex="-1" role="dialog" aria-label="Payment" style="max-width: 460px;">
        <div class="modal-header">
          <h3 class="txt-primary txt-bold flex-row-between" style="gap: 8px; margin: 0;">
            <span class="material-symbols-rounded txt-brand" style="font-size: 24px; filter: drop-shadow(0 0 8px rgba(255, 94, 54, 0.4));">payments</span>
            Secure Checkout
          </h3>
          <button class="btn-icon btn-secondary" id="payment-close-btn" aria-label="Close" style="width: 32px; height: 32px;">
            <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
          </button>
        </div>

        <div class="modal-body scrollbar-none">
          <!-- Order Total -->
          <div class="payment-payable-card">
            <div class="payment-payable-label">Amount Payable</div>
            <div class="payment-payable-value">
              ${formatCurrency(this.order.total)}
            </div>
            <div class="payment-payable-badge">
              Order #${this.order.orderNumber.split('-').pop()} · ${this.order.type === 'takeaway' ? 'Takeaway' : this.order.type === 'dinein' ? 'Dine In' : 'Delivery'}
            </div>
          </div>

          <!-- Payment Method Tabs -->
          <div class="payment-tab-grid" id="payment-methods">
            <button class="payment-tab-btn ${this.selectedMethod === 'upi' ? 'active' : ''}" data-method="upi">
              <span class="method-icon">📱</span>
              <span class="method-label">UPI QR Code</span>
            </button>
            <button class="payment-tab-btn ${this.selectedMethod === 'cash' ? 'active' : ''}" data-method="cash">
              <span class="method-icon">💵</span>
              <span class="method-label">Cash Payment</span>
            </button>
          </div>

          <!-- UPI Payment View -->
          <div id="payment-upi-view" style="${this.selectedMethod !== 'upi' ? 'display:none;' : ''}">
            <!-- Split Payment Selector -->
            <div style="margin-bottom: 16px;">
              <div class="payment-payable-label" style="margin-bottom: 10px;">Payment Split</div>
              <div id="split-selector" class="split-tab-grid">
                <button class="split-tab-btn ${this.splitMode === 'full' ? 'active' : ''}" data-split="full">
                  <span style="font-size: 18px; margin-bottom: 4px;">💰</span>
                  <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.02em;">FULL BILL</span>
                  <span class="txt-primary txt-bold" style="font-size: var(--text-xs); margin-top: 2px;">${formatCurrencyShort(this.order.total)}</span>
                </button>
                <button class="split-tab-btn ${this.splitMode === 'half' ? 'active' : ''}" data-split="half">
                  <span style="font-size: 18px; margin-bottom: 4px;">✂️</span>
                  <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.02em;">HALF BILL</span>
                  <span class="txt-primary txt-bold" style="font-size: var(--text-xs); margin-top: 2px;">${formatCurrencyShort(Math.ceil(this.order.total / 2))}</span>
                </button>
                <button class="split-tab-btn ${this.splitMode === 'custom' ? 'active' : ''}" data-split="custom">
                  <span style="font-size: 18px; margin-bottom: 4px;">✏️</span>
                  <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.02em;">CUSTOM</span>
                  <span class="txt-primary txt-bold" style="font-size: var(--text-xs); margin-top: 2px;">${this.customAmount ? formatCurrencyShort(parseFloat(this.customAmount)) : '—'}</span>
                </button>
              </div>
            </div>

            <!-- Custom Amount Input -->
            <div id="custom-amount-container" style="${this.splitMode !== 'custom' ? 'display:none;' : ''} margin-bottom: 16px;">
              <div class="input-group">
                <label for="custom-qr-amount" class="payment-payable-label">Enter QR Amount (${this.currencySymbol})</label>
                <input 
                  type="number" 
                  id="custom-qr-amount" 
                  class="input" 
                  placeholder="Enter amount for QR"
                  inputmode="numeric"
                  min="1"
                  max="${this.order.total}"
                  step="1"
                  value="${this.customAmount}"
                  style="font-size: 1.3rem; font-weight: 800; text-align: center; background: rgba(0, 0, 0, 0.2); border-color: rgba(245, 158, 11, 0.3);"
                >
              </div>
              <div id="custom-remaining-display" class="txt-center txt-muted" style="font-size: var(--text-xs); margin-top: 8px; font-weight: 600;">
                ${this.customAmount ? `Remaining ${this.currencySymbol}${(this.order.total - parseFloat(this.customAmount)).toFixed(2)} to be paid separately` : `Bill total: ${formatCurrency(this.order.total)}`}
              </div>
            </div>

            <div class="payment-qr-card">
              <div class="payment-qr-canvas-wrapper">
                <canvas id="upi-qr-canvas" style="display: block;"></canvas>
              </div>
              <div class="payment-qr-amount" id="qr-display-amount">
                ${formatCurrency(this.qrAmount)}
              </div>
              ${this.splitMode !== 'full' ? `<div class="txt-muted txt-medium" style="font-size: var(--text-xs); margin-bottom: 4px;">of ${formatCurrency(this.order.total)} total bill</div>` : ''}
              <div class="payment-qr-upi-badge" id="qr-upi-id">Loading UPI ID...</div>
              <div class="txt-muted txt-medium" style="font-size: var(--text-xs); display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-rounded" style="font-size: 16px;">qr_code_scanner</span>
                Ask customer to scan with any UPI App
              </div>
            </div>
            <a href="#" id="upi-deeplink" target="_blank" class="btn btn-secondary btn-block btn-lg" style="margin-top: 14px; text-decoration: none;">
              <span class="material-symbols-rounded" style="font-size: 18px;">open_in_new</span>
              Open in UPI App
            </a>
          </div>

          <!-- Cash Payment View -->
          <div id="payment-cash-view" style="${this.selectedMethod !== 'cash' ? 'display:none;' : ''}">
            <div class="cash-form">
              <div class="input-group">
                <label for="cash-received-input" class="payment-payable-label">Cash Received (${this.currencySymbol})</label>
                <input 
                  type="number" 
                  id="cash-received-input" 
                  class="input" 
                  placeholder="Enter amount received"
                  inputmode="numeric"
                  min="0"
                  step="10"
                  value="${this.cashReceived}"
                  style="font-size: 1.5rem; font-weight: 800; text-align: center; background: rgba(0, 0, 0, 0.2);"
                >
              </div>

              <!-- Quick amount buttons -->
              <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
                ${this.renderQuickAmounts()}
              </div>

              <!-- Change display -->
              <div class="payment-change-card" id="change-display" style="display: none;">
                <div class="payment-payable-label">Change to Return</div>
                <div class="payment-payable-value" id="change-amount" style="font-size: 1.8rem; margin-top: 4px;">${this.currencySymbol}0</div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-primary btn-block btn-lg" id="btn-confirm-payment" ${this.isProcessing ? 'disabled' : ''}>
            <span class="material-symbols-rounded" style="font-size: 20px;">check_circle</span>
            <span id="confirm-btn-text">Confirm Payment</span>
          </button>
        </div>
      </div>
    `;
  }

  renderQuickAmounts() {
    const total = this.order.total;
    const amounts = new Set();
    amounts.add(Math.ceil(total));
    amounts.add(Math.ceil(total / 10) * 10);
    amounts.add(Math.ceil(total / 50) * 50);
    amounts.add(Math.ceil(total / 100) * 100);
    if (total > 200) amounts.add(Math.ceil(total / 500) * 500);
    amounts.add(500);
    amounts.add(1000);
    if (total > 500) amounts.add(2000);

    const sortedAmounts = [...amounts]
      .filter(a => a >= Math.ceil(total) && a <= 5000)
      .sort((a, b) => a - b)
      .slice(0, 5);

    return sortedAmounts.map(amount => `
      <button class="btn btn-secondary btn-sm quick-amount-btn" data-amount="${amount}" style="flex: 1; min-width: 68px;">
        ${this.currencySymbol}${amount}
      </button>
    `).join('');
  }

  async generateQR() {
    const canvas = document.getElementById('upi-qr-canvas');
    const upiIdDisplay = document.getElementById('qr-upi-id');
    const deeplink = document.getElementById('upi-deeplink');

    if (!canvas) return;

    try {
      const upiLink = await generateUPIQR(canvas, {
        amount: this.qrAmount,
        orderId: this.order.orderNumber,
      });

      // Show UPI ID
      const upiId = await getSetting('upiId') || 'paytmqr6zfcsx@ptys';
      if (upiIdDisplay) upiIdDisplay.textContent = upiId;

      // Update displayed amount
      const amountDisplay = document.getElementById('qr-display-amount');
      if (amountDisplay) amountDisplay.textContent = formatCurrency(this.qrAmount);

      // Set deep link
      if (deeplink) {
        deeplink.href = upiLink;
      }
    } catch (error) {
      console.error('QR generation failed:', error);
      if (canvas.parentElement) {
        canvas.parentElement.innerHTML = `
          <div style="padding: 20px; text-align: center; color: var(--text-muted);">
            <span class="material-symbols-rounded" style="font-size: 40px; display: block; margin-bottom: 8px;">qr_code</span>
            <p class="text-sm">Failed to generate QR code</p>
            <p class="text-xs text-muted">${error.message}</p>
          </div>
        `;
      }
    }
  }

  /**
   * Recalculate QR amount based on split mode and regenerate the QR code.
   */
  async updateSplitAndRegenerate() {
    switch (this.splitMode) {
      case 'full':
        this.qrAmount = this.order.total;
        break;
      case 'half':
        this.qrAmount = Math.ceil(this.order.total / 2);
        break;
      case 'custom':
        const parsed = parseFloat(this.customAmount);
        this.qrAmount = (parsed > 0 && parsed <= this.order.total) ? parsed : this.order.total;
        break;
      default:
        this.qrAmount = this.order.total;
    }

    await this.generateQR();
  }

  bindEvents() {
    // Close button
    const closeBtn = document.getElementById('payment-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Escape key
    this._escHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escHandler);

    // Payment method tabs
    const methodsContainer = document.getElementById('payment-methods');
    if (methodsContainer) {
      methodsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-tab-btn');
        if (!btn) return;

        const method = btn.dataset.method;
        this.selectedMethod = method;

        // Update active state
        methodsContainer.querySelectorAll('.payment-tab-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.method === method);
        });

        // Show/hide views
        const upiView = document.getElementById('payment-upi-view');
        const cashView = document.getElementById('payment-cash-view');
        if (upiView) upiView.style.display = method === 'upi' ? '' : 'none';
        if (cashView) cashView.style.display = method === 'cash' ? '' : 'none';

        // Focus cash input
        if (method === 'cash') {
          setTimeout(() => {
            const input = document.getElementById('cash-received-input');
            if (input) input.focus();
          }, 100);
        }
      });
    }

    // Cash amount input
    const cashInput = document.getElementById('cash-received-input');
    if (cashInput) {
      cashInput.addEventListener('input', (e) => {
        this.cashReceived = e.target.value;
        this.updateChangeDisplay();
      });
    }

    // Quick amount buttons
    const quickButtons = this.overlay?.querySelectorAll('.quick-amount-btn');
    if (quickButtons) {
      quickButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const amount = btn.dataset.amount;
          const input = document.getElementById('cash-received-input');
          if (input) {
            input.value = amount;
            this.cashReceived = amount;
            this.updateChangeDisplay();
          }
        });
      });
    }

    // Split payment selector
    const splitSelector = this.overlay?.querySelector('#split-selector');
    if (splitSelector) {
      splitSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.split-tab-btn');
        if (!btn) return;

        const split = btn.dataset.split;
        this.splitMode = split;

        // Update button styles via CSS classes
        splitSelector.querySelectorAll('.split-tab-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.split === split);
        });

        // Show/hide custom input
        const customContainer = document.getElementById('custom-amount-container');
        if (customContainer) customContainer.style.display = split === 'custom' ? '' : 'none';

        // Focus custom input
        if (split === 'custom') {
          setTimeout(() => {
            const inp = document.getElementById('custom-qr-amount');
            if (inp) inp.focus();
          }, 100);
        }

        // Recalculate and regenerate
        this.updateSplitAndRegenerate();
      });
    }

    // Custom amount input
    const customQrInput = document.getElementById('custom-qr-amount');
    if (customQrInput) {
      let debounceTimer = null;
      customQrInput.addEventListener('input', (e) => {
        this.customAmount = e.target.value;

        // Update remaining display
        const remainingDisplay = document.getElementById('custom-remaining-display');
        const parsed = parseFloat(this.customAmount) || 0;
        if (remainingDisplay) {
          if (parsed > 0 && parsed <= this.order.total) {
            const remaining = this.order.total - parsed;
            remainingDisplay.textContent = remaining > 0
              ? `Remaining ${this.currencySymbol}${remaining.toFixed(2)} to be paid separately`
              : 'Full amount covered';
            remainingDisplay.style.color = 'var(--text-muted)';
          } else if (parsed > this.order.total) {
            remainingDisplay.textContent = 'Amount exceeds bill total';
            remainingDisplay.style.color = 'var(--color-danger)';
          } else {
            remainingDisplay.textContent = `Bill total: ${formatCurrency(this.order.total)}`;
            remainingDisplay.style.color = 'var(--text-muted)';
          }
        }

        // Debounce QR regeneration (500ms)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (parsed > 0 && parsed <= this.order.total) {
            this.updateSplitAndRegenerate();
          }
        }, 500);
      });
    }

    // Confirm payment
    const confirmBtn = document.getElementById('btn-confirm-payment');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmPayment());
    }
  }

  updateChangeDisplay() {
    const display = document.getElementById('change-display');
    const amountEl = document.getElementById('change-amount');

    if (!display || !amountEl) return;

    const received = parseFloat(this.cashReceived) || 0;
    const total = this.order.total;

    if (received > 0) {
      display.style.display = '';
      const change = received - total;

      if (change >= 0) {
        amountEl.textContent = formatCurrency(change);
        amountEl.style.color = 'var(--color-success)';
      } else {
        amountEl.textContent = `${formatCurrency(Math.abs(change))} short`;
        amountEl.style.color = 'var(--color-danger)';
      }
    } else {
      display.style.display = 'none';
    }
  }

  async confirmPayment() {
    if (this.isProcessing) return;

    // Validate cash payment
    if (this.selectedMethod === 'cash') {
      const received = parseFloat(this.cashReceived) || 0;
      if (received < this.order.total) {
        showToast('Cash received is less than the total amount', 'warning');
        return;
      }
    }

    // Validate custom split amount
    if (this.selectedMethod === 'upi' && this.splitMode === 'custom') {
      const parsed = parseFloat(this.customAmount) || 0;
      if (parsed <= 0 || parsed > this.order.total) {
        showToast(`Please enter a valid custom amount between ${this.currencySymbol}1 and the bill total`, 'warning');
        return;
      }
    }

    this.isProcessing = true;

    const confirmBtn = document.getElementById('btn-confirm-payment');
    const btnText = document.getElementById('confirm-btn-text');
    if (confirmBtn) confirmBtn.disabled = true;
    if (btnText) btnText.textContent = 'Processing...';

    try {
      if (this.onConfirmPayment) {
        // Pass split payment details along with the method
        await this.onConfirmPayment(this.selectedMethod, {
          splitMode: this.splitMode,
          paidAmount: this.selectedMethod === 'upi' ? this.qrAmount : this.order.total,
          totalAmount: this.order.total,
          remainingAmount: this.selectedMethod === 'upi' ? Math.max(0, this.order.total - this.qrAmount) : 0
        });
      }
    } catch (error) {
      console.error('Payment confirmation failed:', error);
      showToast('Payment failed: ' + error.message, 'error');
      this.isProcessing = false;
      if (confirmBtn) confirmBtn.disabled = false;
      if (btnText) btnText.textContent = 'Confirm Payment';
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

    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
    }

    if (this.onClose) this.onClose();
  }
}
