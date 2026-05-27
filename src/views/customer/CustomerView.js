import { getCategories, getItemsByCategory, createOrder, getNextOrderNumber, getSetting, db } from '../../db/database.js';
import { deductInventoryForOrder } from '../../services/inventoryHook.js';
import { generateUPIQR } from '../../services/upi.js';
import { escapeHtml, formatCurrency, parseOrderItems, playSound, showToast, vibrateDevice } from '../../utils/helpers.js';

const PHONE_RE = /^[6-9]\d{9}$/;

export class CustomerView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.categories = [];
    this.items = [];
    this.tables = [];
    this.activeCategoryId = null;
    this.detectedTable = null;
    this.selectedTableId = '';
    this.orderType = 'delivery';
    this.selectedPaymentMethod = 'upi';
    this.cart = [];
    this.state = 'menu';
    this.placedOrder = null;
    this.customerName = '';
    this.customerPhone = '';
    this.deliveryAddress = '';
    this.deliveryLandmark = '';
    this.pollInterval = null;
  }

  async mount(container) {
    this.container = container;
    this.cart = [];
    this.state = 'menu';
    this.selectedPaymentMethod = 'upi';
    this.customerName = '';
    this.customerPhone = '';
    this.deliveryAddress = '';
    this.deliveryLandmark = '';
    this.orderType = 'delivery';
    await this.loadData();
    this.render();
  }

  async loadData() {
    this.categories = await getCategories();
    this.tables = await db.tables.toArray();
    this.detectedTable = await this.getDetectedTable();
    if (this.detectedTable) {
      this.orderType = 'dinein';
      this.selectedTableId = String(this.detectedTable.id);
    }
    if (this.categories.length) {
      this.activeCategoryId = this.categories[0].id;
      await this.loadItems();
    }
  }

  async getDetectedTable() {
    const [, queryString = ''] = (window.location.hash || '').split('?');
    const tableParam = new URLSearchParams(queryString).get('table');
    if (!tableParam) return null;
    const numeric = parseInt(tableParam, 10);
    if (!Number.isNaN(numeric)) {
      const byNumber = await db.tables.where('number').equals(numeric).first();
      if (byNumber) return byNumber;
    }
    return db.tables.where('number').equals(tableParam).first();
  }

  async loadItems() {
    this.items = this.activeCategoryId ? await getItemsByCategory(this.activeCategoryId) : [];
  }

  render() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.state === 'cart') this.renderCart();
    else if (this.state === 'checkout') this.renderCheckout();
    else if (this.state === 'success') this.renderSuccess();
    else this.renderMenu();
  }

  renderMenu() {
    const categories = this.categories.map(cat => {
      const active = cat.id === this.activeCategoryId;
      return `
        <button class="category-tab" data-id="${cat.id}" style="padding:8px 14px;border-radius:999px;border:1px solid ${active ? 'rgba(255,94,54,0.45)' : 'var(--border-glass)'};background:${active ? 'var(--gradient-primary)' : 'rgba(255,255,255,0.02)'};color:${active ? '#fff' : 'var(--text-secondary)'};font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-xs);font-weight:800;white-space:nowrap;cursor:pointer;">
          ${escapeHtml(cat.name)}
        </button>
      `;
    }).join('');

    const items = this.items.map(item => {
      const cartItem = this.cart.find(ci => ci.itemId === item.id);
      const qty = cartItem?.quantity || 0;
      return `
        <div class="card card-glass" style="display:flex;flex-direction:column;gap:12px;padding:14px;background:rgba(255,255,255,0.02);border:1px solid ${qty ? 'rgba(255,94,54,0.45)' : 'var(--border-glass)'};border-radius:8px;min-height:156px;">
          <div style="height:52px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,0.03);">
            <span class="material-symbols-rounded" style="font-size:30px;color:var(--color-primary);">ramen_dining</span>
          </div>
          <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:800;color:var(--text-primary);line-height:1.35;min-height:38px;">${escapeHtml(item.name)}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;">
            <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:900;color:var(--color-primary);">${formatCurrency(item.price)}</span>
            ${qty ? `
              <div class="stepper">
                <button class="btn-step" data-action="minus" data-id="${item.id}">-</button>
                <div class="stepper-count">${qty}</div>
                <button class="btn-step" data-action="plus" data-id="${item.id}">+</button>
              </div>
            ` : `
              <button class="btn btn-primary btn-add" data-id="${item.id}" style="min-height:32px;padding:4px 14px;border-radius:999px;font-size:var(--text-xs);font-weight:800;">ADD</button>
            `}
          </div>
        </div>
      `;
    }).join('');

    const cartCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartTotal = this.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const mode = this.detectedTable ? `Table ${this.detectedTable.number}` : 'Order online from home';

    this.container.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);">
        <header style="padding:18px 16px 14px;text-align:center;background:rgba(9,9,14,0.9);border-bottom:1px solid var(--border-glass);">
          <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:1.7rem;font-weight:900;color:var(--color-primary);letter-spacing:0;">THE TASTE</div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(mode)}</div>
        </header>
        <div style="padding:12px 16px;display:flex;gap:8px;overflow-x:auto;border-bottom:1px solid var(--border-glass);background:rgba(9,9,14,0.72);" class="scrollbar-none">${categories}</div>
        <main style="flex:1;overflow-y:auto;padding:16px 16px 104px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;">
            ${items || '<div class="empty-state" style="grid-column:1/-1;height:45vh;"><span class="material-symbols-rounded">restaurant_menu</span><p>No items available</p></div>'}
          </div>
        </main>
        ${cartCount ? `
          <button id="btn-view-cart" style="position:fixed;left:50%;bottom:20px;transform:translateX(-50%);width:calc(100% - 32px);max-width:460px;border:0;border-radius:8px;background:var(--gradient-primary);color:white;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;font-family:'Plus Jakarta Sans',sans-serif;font-weight:900;box-shadow:var(--shadow-primary);cursor:pointer;">
            <span>${cartCount} item${cartCount === 1 ? '' : 's'} in cart</span>
            <span>${formatCurrency(cartTotal)}</span>
          </button>
        ` : ''}
      </div>
    `;

    this.bindMenuEvents();
  }

  bindMenuEvents() {
    this.container.querySelectorAll('.category-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.activeCategoryId = parseInt(btn.dataset.id, 10);
        await this.loadItems();
        playSound(650, 70);
        this.renderMenu();
      });
    });
    this.container.querySelectorAll('.btn-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = this.items.find(i => i.id === parseInt(btn.dataset.id, 10));
        if (item) this.addToCart(item);
      });
    });
    this.container.querySelectorAll('.btn-step').forEach(btn => {
      btn.addEventListener('click', () => this.adjustCart(parseInt(btn.dataset.id, 10), btn.dataset.action === 'plus' ? 1 : -1));
    });
    this.container.querySelector('#btn-view-cart')?.addEventListener('click', () => {
      this.state = 'cart';
      playSound(800, 80);
      this.render();
    });
  }

  renderCart() {
    const total = this.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const rows = this.cart.map((item, index) => `
      <div class="card card-glass" style="padding:14px;border:1px solid var(--border-glass);border-radius:8px;background:rgba(255,255,255,0.02);display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:800;color:var(--text-primary);">${escapeHtml(item.itemName)}</div>
          <div style="font-weight:900;color:var(--color-primary);">${formatCurrency(item.price * item.quantity)}</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input class="input note-input" data-index="${index}" value="${escapeHtml(item.notes || '')}" placeholder="Special instructions" style="flex:1;min-height:34px;padding:8px 10px;background:rgba(0,0,0,0.2);border:1px solid var(--border-glass);border-radius:8px;">
          <div class="stepper">
            <button class="btn-step" data-action="minus" data-id="${item.itemId}">-</button>
            <div class="stepper-count">${item.quantity}</div>
            <button class="btn-step" data-action="plus" data-id="${item.itemId}">+</button>
          </div>
        </div>
      </div>
    `).join('');

    this.container.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;background:var(--bg-primary);">
        ${this.renderTopBar('Your Cart', 'btn-back-menu')}
        <main style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;">${rows}</main>
        <footer style="padding:18px 20px;background:rgba(17,17,30,0.96);border-top:1px solid var(--border-glass);">
          <div style="display:flex;justify-content:space-between;font-family:'Plus Jakarta Sans',sans-serif;font-size:1.3rem;font-weight:900;margin-bottom:14px;">
            <span>Total</span><span style="color:var(--color-primary);">${formatCurrency(total)}</span>
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="btn-checkout">Proceed to Checkout</button>
        </footer>
      </div>
    `;

    this.container.querySelector('#btn-back-menu')?.addEventListener('click', () => { this.state = 'menu'; this.render(); });
    this.container.querySelector('#btn-checkout')?.addEventListener('click', () => { this.state = 'checkout'; this.render(); });
    this.container.querySelectorAll('.btn-step').forEach(btn => {
      btn.addEventListener('click', () => {
        this.adjustCart(parseInt(btn.dataset.id, 10), btn.dataset.action === 'plus' ? 1 : -1);
        this.renderCart();
      });
    });
    this.container.querySelectorAll('.note-input').forEach(input => {
      input.addEventListener('input', () => {
        const index = parseInt(input.dataset.index, 10);
        if (this.cart[index]) this.cart[index].notes = input.value;
      });
    });
  }

  renderCheckout() {
    const total = this.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tableOptions = this.tables.map(table => `
      <option value="${table.id}" ${String(this.selectedTableId) === String(table.id) ? 'selected' : ''}>Table ${escapeHtml(table.number)} (${escapeHtml(table.floorSection || 'Main')})</option>
    `).join('');

    this.container.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;background:var(--bg-primary);">
        ${this.renderTopBar('Checkout', 'btn-back-cart')}
        <main style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;">
          ${this.renderPanel('Contact Details', `
            ${this.renderInput('self-name', 'YOUR NAME', this.customerName, 'Enter your name')}
            ${this.renderInput('self-phone', 'PHONE NUMBER', this.customerPhone, '10-digit mobile number', 'tel')}
          `)}

          ${this.detectedTable ? '' : this.renderPanel('How should we serve this order?', `
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
              ${this.renderTypeButton('delivery', 'local_shipping', 'Delivery')}
              ${this.renderTypeButton('takeaway', 'shopping_bag', 'Pickup')}
              ${this.renderTypeButton('dinein', 'table_restaurant', 'Dine-In')}
            </div>
            <div id="delivery-fields" style="display:${this.orderType === 'delivery' ? 'block' : 'none'};margin-top:12px;">
              <label style="${this.labelStyle()}">DELIVERY ADDRESS</label>
              <textarea id="self-delivery-address" class="input" rows="3" placeholder="House/flat, street, area" style="${this.inputStyle('min-height:82px;resize:vertical;')}">${escapeHtml(this.deliveryAddress)}</textarea>
              ${this.renderInput('self-delivery-landmark', 'LANDMARK / DELIVERY NOTES', this.deliveryLandmark, 'Nearby landmark, gate code, etc.')}
            </div>
            <div id="table-fields" style="display:${this.orderType === 'dinein' ? 'block' : 'none'};margin-top:12px;">
              <label style="${this.labelStyle()}">TABLE NUMBER</label>
              <select id="self-table-select" class="input" style="${this.inputStyle()}">
                <option value="">Select a table</option>
                ${tableOptions}
              </select>
            </div>
          `)}

          ${this.renderPanel('Payment', `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              ${this.renderPaymentButton('upi', 'qr_code_2', 'UPI QR', 'Staff verifies')}
              ${this.renderPaymentButton('cash', 'payments', 'Cash/COD', 'Collected later')}
            </div>
          `)}

          ${this.renderPanel('Total Payable', `
            <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:2rem;font-weight:900;color:var(--color-primary);">${formatCurrency(total)}</div>
            <div id="checkout-summary" style="font-size:var(--text-xs);color:var(--text-muted);font-weight:700;">${escapeHtml(this.getOrderTypeLabel())}</div>
          `)}
        </main>
        <footer style="padding:18px 20px;background:rgba(17,17,30,0.96);border-top:1px solid var(--border-glass);">
          <button class="btn btn-primary btn-block btn-lg" id="btn-submit-self-order">
            <span class="material-symbols-rounded">send_and_archive</span>
            Place Order
          </button>
        </footer>
      </div>
    `;

    this.bindCheckoutEvents();
  }

  bindCheckoutEvents() {
    this.container.querySelector('#btn-back-cart')?.addEventListener('click', () => { this.state = 'cart'; this.render(); });
    this.container.querySelector('#self-name')?.addEventListener('input', e => { this.customerName = e.target.value.trim(); });
    this.container.querySelector('#self-phone')?.addEventListener('input', e => { this.customerPhone = e.target.value.trim(); });
    this.container.querySelector('#self-delivery-address')?.addEventListener('input', e => { this.deliveryAddress = e.target.value.trim(); });
    this.container.querySelector('#self-delivery-landmark')?.addEventListener('input', e => { this.deliveryLandmark = e.target.value.trim(); });
    this.container.querySelector('#self-table-select')?.addEventListener('change', e => {
      this.selectedTableId = e.target.value;
      this.updateCheckoutVisibility();
    });
    this.container.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.orderType = btn.dataset.type;
        this.updateCheckoutVisibility(true);
      });
    });
    this.container.querySelectorAll('.pay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPaymentMethod = btn.dataset.method;
        this.renderCheckout();
      });
    });
    this.container.querySelector('#btn-submit-self-order')?.addEventListener('click', () => this.validateAndPlaceOrder());
  }

  updateCheckoutVisibility(rerender = false) {
    if (rerender) {
      this.renderCheckout();
      return;
    }
    const summary = this.container.querySelector('#checkout-summary');
    if (summary) summary.textContent = this.getOrderTypeLabel();
  }

  renderSuccess() {
    const order = this.placedOrder;
    const token = order.orderNumber.split('-').pop();
    const isUpi = order.paymentMethod === 'upi';
    const deliveryText = order.type === 'delivery'
      ? 'Your order will be prepared and assigned to our delivery staff.'
      : order.type === 'takeaway'
        ? 'Please keep this token ready for pickup.'
        : 'Your table order has been sent to the kitchen.';

    this.container.innerHTML = `
      <div style="height:100%;overflow-y:auto;background:var(--bg-primary);padding:36px 20px;display:flex;flex-direction:column;align-items:center;text-align:center;">
        <div style="width:74px;height:74px;border-radius:50%;background:rgba(16,185,129,0.09);border:1px solid rgba(16,185,129,0.28);display:flex;align-items:center;justify-content:center;margin-bottom:18px;">
          <span class="material-symbols-rounded" style="font-size:42px;color:var(--color-success);">check_circle</span>
        </div>
        <h1 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-2xl);font-weight:900;color:var(--text-primary);margin:0 0 8px;">Order Confirmed</h1>
        <p style="max-width:340px;color:var(--text-secondary);font-size:var(--text-sm);line-height:1.55;margin:0;">${escapeHtml(deliveryText)}</p>
        <div style="margin-top:24px;padding:22px 42px;border:1px solid var(--border-glass);border-radius:8px;background:rgba(255,255,255,0.02);">
          <div style="font-size:var(--text-xs);color:var(--text-muted);font-weight:800;letter-spacing:0.08em;">TOKEN</div>
          <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:3.2rem;font-weight:900;color:var(--color-primary);line-height:1;">${escapeHtml(token)}</div>
        </div>

        ${isUpi ? `
          <div style="margin-top:22px;padding:20px;border:1px solid var(--border-glass);border-radius:8px;background:rgba(255,255,255,0.02);max-width:360px;width:100%;">
            <div style="background:white;padding:14px;border-radius:8px;display:inline-block;margin-bottom:12px;"><canvas id="upi-qr"></canvas></div>
            <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:1.4rem;font-weight:900;color:var(--color-primary);">${formatCurrency(order.total)}</div>
            <div id="upi-id-label" style="font-size:var(--text-xs);color:var(--text-secondary);font-weight:700;margin-top:4px;">Loading UPI ID...</div>
            <p style="font-size:var(--text-xs);color:var(--text-muted);line-height:1.45;margin:10px 0 0;">After paying, staff will verify UPI before marking this order as paid.</p>
          </div>
        ` : `
          <div style="margin-top:22px;padding:18px;border:1px solid rgba(245,158,11,0.28);border-radius:8px;background:rgba(245,158,11,0.04);max-width:360px;">
            <span class="material-symbols-rounded" style="color:var(--color-warning);font-size:34px;">payments</span>
            <div style="font-weight:900;color:var(--text-primary);margin-top:6px;">Cash on ${order.type === 'delivery' ? 'Delivery' : 'Pickup'}</div>
            <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.45;margin:8px 0 0;">Payment will be collected and marked paid by staff.</p>
          </div>
        `}

        <div id="prep-status" style="margin-top:18px;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;">Waiting for kitchen prep time...</div>
        <button class="btn btn-secondary btn-block btn-lg" id="btn-order-again" style="margin-top:22px;max-width:360px;">Order Something Else</button>
      </div>
    `;

    this.container.querySelector('#btn-order-again')?.addEventListener('click', () => {
      this.cart = [];
      this.placedOrder = null;
      this.state = 'menu';
      this.render();
    });

    if (isUpi) this.renderUpiQr();
    this.startOrderPoll();
  }

  async renderUpiQr() {
    const canvas = this.container.querySelector('#upi-qr');
    const upiLabel = this.container.querySelector('#upi-id-label');
    if (!canvas || !this.placedOrder) return;
    const upiId = await getSetting('upiId') || 'paytmqr6zfcsx@ptys';
    if (upiLabel) upiLabel.textContent = upiId;
    await generateUPIQR(canvas, {
      amount: this.placedOrder.total,
      orderId: this.placedOrder.orderNumber
    });
  }

  startOrderPoll() {
    if (!this.placedOrder) return;
    this.pollInterval = setInterval(async () => {
      const latest = await db.orders.get(this.placedOrder.id);
      if (!latest) return;
      this.placedOrder = latest;
      const status = this.container?.querySelector('#prep-status');
      if (status) {
        const parts = [];
        if (latest.estimatedPrepTime) parts.push(`Prep time: ${latest.estimatedPrepTime} min`);
        parts.push(`Kitchen: ${latest.status}`);
        if (latest.type === 'delivery') parts.push(`Delivery: ${latest.deliveryStatus || 'pending'}`);
        if (latest.paymentStatus === 'paid') parts.push('Payment verified');
        status.textContent = parts.join(' | ');
      }
    }, 3000);
  }

  renderTopBar(title, backId) {
    return `
      <header style="padding:14px 16px;border-bottom:1px solid var(--border-glass);display:flex;align-items:center;gap:12px;background:rgba(9,9,14,0.86);">
        <button class="btn-icon btn-secondary" id="${backId}" style="border-radius:50%;border:1px solid var(--border-glass);background:rgba(255,255,255,0.03);">
          <span class="material-symbols-rounded">arrow_back</span>
        </button>
        <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:900;color:var(--text-primary);margin:0;">${escapeHtml(title)}</h2>
      </header>
    `;
  }

  renderPanel(title, body) {
    return `
      <section class="card card-glass" style="padding:18px;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:8px;">
        <h3 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-sm);font-weight:900;color:var(--text-primary);margin:0 0 14px;">${escapeHtml(title)}</h3>
        ${body}
      </section>
    `;
  }

  renderInput(id, label, value, placeholder, type = 'text') {
    return `
      <div class="input-group" style="margin-bottom:12px;">
        <label style="${this.labelStyle()}">${escapeHtml(label)}</label>
        <input type="${type}" id="${id}" class="input" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}" style="${this.inputStyle()}">
      </div>
    `;
  }

  renderTypeButton(type, icon, label) {
    const active = this.orderType === type;
    return `
      <button class="type-btn" data-type="${type}" style="${this.optionButtonStyle(active)}">
        <span class="material-symbols-rounded" style="font-size:22px;">${icon}</span>
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }

  renderPaymentButton(method, icon, label, sublabel) {
    const active = this.selectedPaymentMethod === method;
    return `
      <button class="pay-btn" data-method="${method}" style="${this.optionButtonStyle(active)}">
        <span class="material-symbols-rounded" style="font-size:22px;">${icon}</span>
        <span>${escapeHtml(label)}</span>
        <small style="font-size:10px;color:var(--text-muted);font-weight:700;">${escapeHtml(sublabel)}</small>
      </button>
    `;
  }

  optionButtonStyle(active) {
    return `
      min-height:82px;padding:12px 8px;border-radius:8px;
      border:1.5px solid ${active ? 'rgba(255,94,54,0.45)' : 'var(--border-glass)'};
      background:${active ? 'rgba(255,94,54,0.08)' : 'rgba(255,255,255,0.01)'};
      color:${active ? 'var(--text-primary)' : 'var(--text-secondary)'};
      box-shadow:${active ? '0 8px 20px rgba(255,94,54,0.14)' : 'none'};
      display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;
      font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-xs);font-weight:900;cursor:pointer;
    `;
  }

  labelStyle() {
    return "display:block;margin-bottom:7px;font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-xs);color:var(--text-secondary);font-weight:800;";
  }

  inputStyle(extra = '') {
    return `padding:12px 14px;background:rgba(0,0,0,0.22);border:1px solid var(--border-glass);border-radius:8px;color:var(--text-primary);outline:none;width:100%;box-sizing:border-box;${extra}`;
  }

  getOrderTypeLabel() {
    if (this.detectedTable) return `Dine-In Table ${this.detectedTable.number}`;
    if (this.orderType === 'delivery') return 'Home Delivery Order';
    if (this.orderType === 'takeaway') return 'Pickup Order';
    const table = this.tables.find(t => String(t.id) === String(this.selectedTableId));
    return `Dine-In Order${table ? ` Table ${table.number}` : ''}`;
  }

  validateAndPlaceOrder() {
    if (!this.customerName) {
      showToast('Please enter your name', 'warning');
      return;
    }
    if (!PHONE_RE.test(this.customerPhone)) {
      showToast('Please enter a valid 10-digit mobile number', 'warning');
      return;
    }
    if (this.orderType === 'delivery' && !this.deliveryAddress) {
      showToast('Please enter your delivery address', 'warning');
      return;
    }
    if (this.orderType === 'dinein' && !this.detectedTable && !this.selectedTableId) {
      showToast('Please select your table number', 'warning');
      return;
    }
    this.placeOrder();
  }

  addToCart(item) {
    const existing = this.cart.find(ci => ci.itemId === item.id);
    if (existing) existing.quantity += 1;
    else {
      this.cart.push({
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        quantity: 1,
        isVeg: item.isVeg,
        notes: ''
      });
    }
    playSound(650, 70);
    vibrateDevice([30]);
    this.render();
  }

  adjustCart(itemId, delta) {
    const index = this.cart.findIndex(ci => ci.itemId === itemId);
    if (index === -1) return;
    this.cart[index].quantity += delta;
    if (this.cart[index].quantity <= 0) this.cart.splice(index, 1);
    playSound(600, 60);
    vibrateDevice([20]);
    if (this.state === 'menu') this.render();
  }

  async placeOrder() {
    try {
      const subtotal = this.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const gstPercent = parseFloat(await getSetting('gstPercent') || '5');
      const tax = subtotal * (gstPercent / 100);
      const deliveryFee = 0;
      const total = subtotal + tax + deliveryFee;
      const type = this.detectedTable ? 'dinein' : this.orderType;
      const tableId = this.detectedTable ? this.detectedTable.id : (type === 'dinein' ? parseInt(this.selectedTableId, 10) : null);
      const now = new Date().toISOString();

      const orderData = {
        orderNumber: await getNextOrderNumber(),
        type,
        channel: type === 'dinein' && this.detectedTable ? 'qr' : 'online',
        source: type === 'dinein' && this.detectedTable ? 'qr' : 'online',
        status: 'confirmed',
        items: this.cart,
        subtotal,
        tax,
        taxPercent: gstPercent,
        deliveryFee,
        total,
        paymentMethod: this.selectedPaymentMethod,
        paymentStatus: this.selectedPaymentMethod === 'upi' ? 'pending' : 'unpaid',
        customerName: this.customerName,
        customerPhone: this.customerPhone,
        deliveryAddress: type === 'delivery' ? this.deliveryAddress : '',
        deliveryLandmark: type === 'delivery' ? this.deliveryLandmark : '',
        deliveryNotes: type === 'delivery' ? this.deliveryLandmark : '',
        deliveryStatus: type === 'delivery' ? 'pending' : 'none',
        tableId,
        createdAt: now,
        updatedAt: now
      };

      const order = await createOrder(orderData);
      this.placedOrder = order;

      if (tableId && type === 'dinein') {
        await db.tables.update(tableId, { status: 'occupied', isSynced: 0 });
      }

      this.afterOrderCreated(order);
      this.state = 'success';
      playSound(900, 90);
      vibrateDevice([50, 30, 50]);
      this.render();
    } catch (error) {
      console.error('Failed to submit self-order:', error);
      showToast('Order placement failed: ' + error.message, 'error');
    }
  }

  async afterOrderCreated(order) {
    try {
      await deductInventoryForOrder(parseOrderItems(order.items));
    } catch (error) {
      console.error('Inventory deduction failed:', error);
    }

    try {
      const existing = await db.customers.where('phone').equals(order.customerPhone).first();
      const points = Math.floor(order.total / 10);
      if (existing) {
        const totalSpent = (existing.totalSpent || 0) + order.total;
        await db.customers.update(existing.id, {
          name: order.customerName,
          totalSpent,
          visitCount: (existing.visitCount || 0) + 1,
          loyaltyPoints: (existing.loyaltyPoints || 0) + points,
          tier: totalSpent >= 5000 ? 'platinum' : totalSpent >= 2000 ? 'gold' : totalSpent >= 500 ? 'silver' : 'bronze',
          lastVisit: new Date().toISOString(),
          isSynced: 0
        });
      } else {
        await db.customers.add({
          phone: order.customerPhone,
          name: order.customerName,
          totalSpent: order.total,
          visitCount: 1,
          loyaltyPoints: points,
          tier: order.total >= 500 ? 'silver' : 'bronze',
          lastVisit: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          isSynced: 0,
          _platform: 'nextgenos'
        });
      }
    } catch (error) {
      console.error('Loyalty update failed:', error);
    }
  }

  unmount() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.container = null;
  }
}
