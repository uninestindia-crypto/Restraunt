/**
 * PaymentModal — UPI QR code + Cash payment
 */

import { formatCurrency, formatCurrencyShort, showToast } from '../../utils/helpers.js';
import { generateUPIQR, buildUPILink } from '../../services/upi.js';
import { getSetting } from '../../db/database.js';

export class PaymentModal {
  constructor({ order, onConfirmPayment, onClose }) {
    this.order = order;
    this.onConfirmPayment = onConfirmPayment;
    this.onClose = onClose;

    this.selectedMethod = 'upi'; // 'upi' | 'cash'
    this.cashReceived = '';
    this.overlay = null;
    this.isProcessing = false;
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
      <div class="modal card-glass" tabindex="-1" role="dialog" aria-label="Payment" style="
        background: rgba(17, 17, 30, 0.9);
        backdrop-filter: blur(24px);
        border: 1px solid var(--border-glass);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), var(--shadow-primary);
        max-width: 460px;
        width: calc(100% - 32px);
        border-radius: var(--radius-xl);
        overflow: hidden;
      ">
        <div class="modal-header" style="
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-glass);
          background: rgba(255, 255, 255, 0.01);
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <h3 style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: var(--text-lg);
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--text-primary);
            margin: 0;
            letter-spacing: -0.02em;
          ">
            <span class="material-symbols-rounded" style="color: var(--color-primary); font-size: 24px; filter: drop-shadow(0 0 8px rgba(255, 94, 54, 0.4));">payments</span>
            Secure Checkout
          </h3>
          <button class="btn-icon btn-secondary" id="payment-close-btn" aria-label="Close" style="
            border-radius: 50%; 
            border: 1px solid var(--border-glass); 
            background: rgba(255,255,255,0.03);
            width: 32px;
            height: 32px;
          ">
            <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
          </button>
        </div>

        <div class="modal-body" style="padding: 24px;">
          <!-- Order Total -->
          <div style="
            text-align: center; 
            margin-bottom: 24px; 
            background: rgba(255,255,255,0.01);
            border: 1px solid var(--border-glass);
            border-radius: var(--radius-xl);
            padding: 20px;
            backdrop-filter: blur(8px);
          ">
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px;">AMOUNT PAYABLE</div>
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 2.6rem; font-weight: 800; color: var(--color-primary); line-height: 1; letter-spacing: -0.03em; filter: drop-shadow(0 0 12px rgba(255, 94, 54, 0.35));">
              ${formatCurrency(this.order.total)}
            </div>
            <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 10px; font-weight: 600; background: rgba(0,0,0,0.2); padding: 4px 12px; border-radius: var(--radius-full); display: inline-block;">
              Order #${this.order.orderNumber.split('-').pop()} · ${this.order.type === 'takeaway' ? 'Takeaway' : this.order.type === 'dinein' ? 'Dine In' : 'Delivery'}
            </div>
          </div>

          <!-- Payment Method Tabs -->
          <div class="payment-methods" id="payment-methods" style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 24px;
          ">
            <button class="payment-method-btn ${this.selectedMethod === 'upi' ? 'active' : ''}" data-method="upi" style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 16px;
              border-radius: var(--radius-lg);
              border: 1.5px solid ${this.selectedMethod === 'upi' ? 'rgba(255, 94, 54, 0.4)' : 'var(--border-glass)'};
              background: ${this.selectedMethod === 'upi' ? 'rgba(255, 94, 54, 0.06)' : 'rgba(255, 255, 255, 0.01)'};
              color: ${this.selectedMethod === 'upi' ? 'var(--text-primary)' : 'var(--text-secondary)'};
              box-shadow: ${this.selectedMethod === 'upi' ? '0 8px 20px rgba(255, 94, 54, 0.15)' : 'none'};
              transition: all var(--transition-normal);
              cursor: pointer;
            ">
              <span class="method-icon" style="font-size: 24px; margin-bottom: 6px;">📱</span>
              <span class="method-label" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); font-weight: 700; letter-spacing: -0.01em;">UPI QR Code</span>
            </button>
            <button class="payment-method-btn ${this.selectedMethod === 'cash' ? 'active' : ''}" data-method="cash" style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 16px;
              border-radius: var(--radius-lg);
              border: 1.5px solid ${this.selectedMethod === 'cash' ? 'rgba(255, 94, 54, 0.4)' : 'var(--border-glass)'};
              background: ${this.selectedMethod === 'cash' ? 'rgba(255, 94, 54, 0.06)' : 'rgba(255, 255, 255, 0.01)'};
              color: ${this.selectedMethod === 'cash' ? 'var(--text-primary)' : 'var(--text-secondary)'};
              box-shadow: ${this.selectedMethod === 'cash' ? '0 8px 20px rgba(255, 94, 54, 0.15)' : 'none'};
              transition: all var(--transition-normal);
              cursor: pointer;
            ">
              <span class="method-icon" style="font-size: 24px; margin-bottom: 6px;">💵</span>
              <span class="method-label" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); font-weight: 700; letter-spacing: -0.01em;">Cash Payment</span>
            </button>
          </div>

          <!-- UPI Payment View -->
          <div id="payment-upi-view" style="${this.selectedMethod !== 'upi' ? 'display:none;' : ''}">
            <div class="qr-display" style="
              background: rgba(255, 255, 255, 0.01);
              border: 1px solid var(--border-glass);
              border-radius: var(--radius-xl);
              padding: 24px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
            ">
              <div style="
                background: #FFFFFF;
                padding: 12px;
                border-radius: var(--radius-md);
                box-shadow: 0 10px 30px rgba(0,0,0,0.25);
                margin-bottom: 16px;
                display: inline-block;
              ">
                <canvas id="upi-qr-canvas" style="display: block;"></canvas>
              </div>
              <div class="qr-amount" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.5rem; font-weight: 800; color: var(--color-primary); margin-bottom: 4px;">
                ${formatCurrency(this.order.total)}
              </div>
              <div class="qr-upi-id" id="qr-upi-id" style="
                font-size: var(--text-xs); 
                color: var(--text-secondary); 
                font-weight: 600; 
                background: rgba(255, 255, 255, 0.05); 
                padding: 4px 12px; 
                border-radius: var(--radius-full);
                margin-bottom: 12px;
              ">Loading UPI ID...</div>
              <div class="qr-instruction" style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 500; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-rounded" style="font-size: 16px;">qr_code_scanner</span>
                Ask customer to scan with any UPI App
              </div>
            </div>
            <a href="#" id="upi-deeplink" target="_blank" 
               class="btn btn-secondary btn-block btn-lg" 
               style="margin-top: 14px; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--border-glass); font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700;">
              <span class="material-symbols-rounded" style="font-size: 18px;">open_in_new</span>
              Open in UPI App
            </a>
          </div>

          <!-- Cash Payment View -->
          <div id="payment-cash-view" style="${this.selectedMethod !== 'cash' ? 'display:none;' : ''}">
            <div class="cash-form">
              <div class="input-group">
                <label for="cash-received-input" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">CASH RECEIVED (₹)</label>
                <input 
                  type="number" 
                  id="cash-received-input" 
                  class="input" 
                  placeholder="Enter amount received"
                  inputmode="numeric"
                  min="0"
                  step="10"
                  value="${this.cashReceived}"
                  style="
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 1.5rem; 
                    font-weight: 800; 
                    text-align: center;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid var(--border-glass);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                  "
                >
              </div>

              <!-- Quick amount buttons -->
              <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
                ${this.renderQuickAmounts()}
              </div>

              <!-- Change display -->
              <div class="change-display" id="change-display" style="
                display: none;
                margin-top: 20px;
                padding: 16px;
                border-radius: var(--radius-lg);
                border: 1px solid var(--border-glass);
                background: rgba(255,255,255,0.01);
                text-align: center;
              ">
                <div class="change-label" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">CHANGE TO RETURN</div>
                <div class="change-amount" id="change-amount" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.8rem; font-weight: 800; margin-top: 4px;">₹0</div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="padding: 20px 24px; border-top: 1px solid var(--border-glass); background: rgba(255, 255, 255, 0.01);">
          <button class="btn btn-primary btn-block btn-lg" id="btn-confirm-payment" ${this.isProcessing ? 'disabled' : ''} style="
            font-family: 'Plus Jakarta Sans', sans-serif; 
            font-weight: 700;
            box-shadow: var(--shadow-primary);
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          ">
            <span class="material-symbols-rounded" style="font-size: 20px;">check_circle</span>
            <span id="confirm-btn-text">Confirm Payment</span>
          </button>
        </div>
      </div>
    `;
  }

  renderQuickAmounts() {
    const total = this.order.total;
    // Generate smart quick amounts
    const amounts = new Set();

    // Exact amount
    amounts.add(Math.ceil(total));

    // Round to nearest 10, 50, 100, 500
    amounts.add(Math.ceil(total / 10) * 10);
    amounts.add(Math.ceil(total / 50) * 50);
    amounts.add(Math.ceil(total / 100) * 100);
    if (total > 200) amounts.add(Math.ceil(total / 500) * 500);
    amounts.add(500);
    amounts.add(1000);
    if (total > 500) amounts.add(2000);

    // Filter and sort
    const sortedAmounts = [...amounts]
      .filter(a => a >= Math.ceil(total) && a <= 5000)
      .sort((a, b) => a - b)
      .slice(0, 5);

    return sortedAmounts.map(amount => `
      <button class="btn btn-secondary btn-sm quick-amount-btn" data-amount="${amount}" style="
        flex: 1; 
        min-width: 68px;
        padding: 8px 12px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-glass);
        background: rgba(255, 255, 255, 0.02);
        color: var(--text-primary);
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-weight: 700;
        transition: all var(--transition-fast);
        cursor: pointer;
      ">
        ₹${amount}
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
        amount: this.order.total,
        orderId: this.order.orderNumber,
      });

      // Show UPI ID
      const upiId = await getSetting('upiId') || 'thetaste@upi';
      if (upiIdDisplay) upiIdDisplay.textContent = upiId;

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
        const btn = e.target.closest('.payment-method-btn');
        if (!btn) return;

        const method = btn.dataset.method;
        this.selectedMethod = method;

        // Update active state
        methodsContainer.querySelectorAll('.payment-method-btn').forEach(b => {
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

    this.isProcessing = true;

    const confirmBtn = document.getElementById('btn-confirm-payment');
    const btnText = document.getElementById('confirm-btn-text');
    if (confirmBtn) confirmBtn.disabled = true;
    if (btnText) btnText.textContent = 'Processing...';

    try {
      if (this.onConfirmPayment) {
        await this.onConfirmPayment(this.selectedMethod);
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
