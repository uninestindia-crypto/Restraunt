import { getCategories, getItemsByCategory, createOrder, getNextOrderNumber, getSetting, db, generateLocalUuid } from '../../db/database.js';
import { deductInventoryForOrder } from '../../services/inventoryHook.js';
import { submitPublicOrder } from '../../services/publicOrders.js';
import { generateUPIQR } from '../../services/upi.js';
import { escapeHtml, formatCurrency, parseOrderItems, playSound, showToast, vibrateDevice } from '../../utils/helpers.js';

const PHONE_RE = /^[6-9]\d{9}$/;

const CATEGORY_IMAGE_MAP = {
  momos: '/assets/dish-momos.png',
  starters: '/assets/dish-starters.png',
  noodles: '/assets/dish-noodles.png',
  rice: '/assets/dish-rice.png',
  'main course': '/assets/dish-main.png',
  burgers: '/assets/dish-burgers.png',
  sides: '/assets/dish-sides.png',
  beverages: '/assets/dish-beverages.png',
  desserts: '/assets/dish-desserts.png'
};

const CATEGORY_COPY = {
  momos: 'Hand-folded, steamed or tossed hot.',
  starters: 'Crisp, saucy plates made for sharing.',
  noodles: 'Wok-tossed and packed for travel.',
  rice: 'Comfort bowls with bold Indo-Chinese flavor.',
  'main course': 'Gravy, soups, and full-meal favorites.',
  burgers: 'Fast, filling, and freshly assembled.',
  sides: 'Fries, breads, and quick add-ons.',
  beverages: 'Cold sips, shakes, and chai.',
  desserts: 'Sweet finishes for the table.'
};

export class CustomerView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.categories = [];
    this.items = [];
    this.menuByCategory = new Map();
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
    this.storeSettings = {
      name: 'The Taste',
      tagline: 'Fast Food & Chinese',
      phone: '',
      address: ''
    };
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
    const [name, tagline, phone, address] = await Promise.all([
      getSetting('restaurantName'),
      getSetting('restaurantTagline'),
      getSetting('restaurantPhone'),
      getSetting('restaurantAddress')
    ]);

    this.storeSettings = {
      name: name || 'The Taste',
      tagline: tagline || 'Fast Food & Chinese',
      phone: phone || '',
      address: address || ''
    };

    this.categories = await getCategories();
    const tablesStore = db.table('tables');
    this.tables = await tablesStore.toArray();
    this.detectedTable = await this.getDetectedTable();
    if (this.detectedTable) {
      this.orderType = 'dinein';
      this.selectedTableId = String(this.detectedTable.id);
    }

    this.menuByCategory = new Map();
    for (const category of this.categories) {
      this.menuByCategory.set(category.id, await getItemsByCategory(category.id));
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
      const byNumber = await db.table('tables').where('number').equals(numeric).first();
      if (byNumber) return byNumber;
    }
    return db.table('tables').where('number').equals(tableParam).first();
  }

  async loadItems() {
    if (!this.activeCategoryId) {
      this.items = [];
      return;
    }
    this.items = this.menuByCategory.get(this.activeCategoryId) || await getItemsByCategory(this.activeCategoryId);
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
        <button class="store-category-tab ${active ? 'is-active' : ''}" data-id="${cat.id}" aria-pressed="${active}">
          <span>${escapeHtml(cat.name)}</span>
        </button>
      `;
    }).join('');

    const items = this.items.map(item => this.renderMenuItem(item)).join('');
    const featuredItems = this.getFeaturedItems().map(item => this.renderFeaturedItem(item)).join('');
    const cartCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartTotal = this.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const mode = this.detectedTable ? `Table ${this.detectedTable.number}` : 'Order online from home';
    const address = this.storeSettings.address || 'Fresh Indo-Chinese comfort food, packed hot for your table or home.';
    const phoneLink = this.storeSettings.phone ? `tel:${this.storeSettings.phone.replace(/\D/g, '')}` : '#menu';

    this.container.innerHTML = `
      <div class="storefront-shell">
        <section class="store-hero" aria-label="The Taste storefront">
          <div class="store-hero-bg" aria-hidden="true"></div>
          <header class="store-nav">
            <a class="store-brand" href="#/self-order" aria-label="The Taste home">
              <span class="store-brand-mark">TT</span>
              <div>THE TASTE</div>
            </a>
            <nav class="store-nav-links" aria-label="Public navigation">
              <a href="#menu">Menu</a>
              <a href="#order-options">Order</a>
              <a href="${phoneLink}">Call</a>
              <a href="#/pos" class="store-staff-link">Staff</a>
            </nav>
          </header>

          <div class="store-hero-content">
            <p class="store-kicker">${escapeHtml(mode)}</p>
            <h1>${escapeHtml(this.storeSettings.name)}</h1>
            <p class="store-hero-copy">${escapeHtml(this.storeSettings.tagline)} for delivery, pickup, and dine-in QR ordering. Freshly made, clearly priced, and ready for manual UPI or cash.</p>
            <div class="store-hero-actions">
              <a class="store-primary-action" href="#menu">
                <span class="material-symbols-rounded" aria-hidden="true">restaurant_menu</span>
                Order now
              </a>
              <button class="store-secondary-action" id="hero-pickup-btn" type="button">
                <span class="material-symbols-rounded" aria-hidden="true">shopping_bag</span>
                Pickup
              </button>
            </div>
            <dl class="store-proof">
              <div><dt>30 min</dt><dd>Typical prep</dd></div>
              <div><dt>UPI</dt><dd>Manual verify</dd></div>
              <div><dt>COD</dt><dd>Cash accepted</dd></div>
            </dl>
          </div>
        </section>

        <section class="store-service-band" id="order-options" aria-label="Ordering options">
          ${this.renderServiceButton('delivery', 'local_shipping', 'Home delivery', 'Delivered by restaurant staff')}
          ${this.renderServiceButton('takeaway', 'shopping_bag', 'Pickup', 'Order ahead and collect')}
          ${this.renderServiceButton('dinein', 'table_restaurant', this.detectedTable ? `Table ${this.detectedTable.number}` : 'Dine-in QR', 'Order from your table')}
        </section>

        <section class="store-section store-section-tight" aria-label="Highlights">
          <div class="store-section-head">
            <p>Popular right now</p>
            <h2>Fresh, fast, and built for home ordering</h2>
          </div>
          <div class="store-featured-grid">
            ${featuredItems || this.renderEmptyMenu('Featured items are loading.')}
          </div>
        </section>

        <section class="store-section" id="menu" aria-label="Online menu">
          <div class="store-section-head store-menu-head">
            <div>
              <p>Order online</p>
              <h2>Choose your favorites</h2>
            </div>
            <div class="store-menu-note">${escapeHtml(address)}</div>
          </div>
          <div class="store-category-strip scrollbar-none" aria-label="Menu categories">
            ${categories}
          </div>
          <div class="store-menu-grid">
            ${items || this.renderEmptyMenu('No items are available in this category right now.')}
          </div>
        </section>

        <section class="store-info-band" aria-label="Payment and ordering details">
          <div>
            <span class="material-symbols-rounded" aria-hidden="true">qr_code_2</span>
            <strong>UPI orders stay pending</strong>
            <p>Staff verifies the payment reference before marking the order paid.</p>
          </div>
          <div>
            <span class="material-symbols-rounded" aria-hidden="true">payments</span>
            <strong>Cash and COD supported</strong>
            <p>Payment is collected at pickup or delivery and reconciled by staff.</p>
          </div>
          <div>
            <span class="material-symbols-rounded" aria-hidden="true">local_shipping</span>
            <strong>Delivery tracked in-house</strong>
            <p>Orders move from kitchen prep to assignment, out-for-delivery, and delivered.</p>
          </div>
        </section>

        ${cartCount ? `
          <button id="btn-view-cart" class="store-floating-cart" type="button" aria-label="${cartCount} item${cartCount === 1 ? '' : 's'} in cart, total ${formatCurrency(cartTotal)}">
            <span>${cartCount} item${cartCount === 1 ? '' : 's'} in cart</span>
            <strong>${formatCurrency(cartTotal)}</strong>
          </button>
        ` : ''}
      </div>
    `;

    this.bindMenuEvents();
  }

  renderMenuItem(item) {
    const cartItem = this.cart.find(ci => ci.itemId === item.id);
    const qty = cartItem?.quantity || 0;
    return `
      <article class="store-menu-item ${qty ? 'is-selected' : ''}">
        <img class="store-menu-item-image" src="${this.getItemImage(item)}" alt="${escapeHtml(item.name)}">
        <div class="store-menu-item-body">
          <div class="store-menu-item-title">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(this.getItemDescription(item))}</p>
            </div>
            <span class="${item.isVeg ? 'store-food-mark veg' : 'store-food-mark nonveg'}" aria-label="${item.isVeg ? 'Vegetarian' : 'Non vegetarian'}"></span>
          </div>
          <div class="store-menu-item-footer">
            <strong>${formatCurrency(item.price)}</strong>
            ${qty ? `
              <div class="stepper store-stepper" aria-label="Quantity for ${escapeHtml(item.name)}">
                <button class="btn-step" data-action="minus" data-id="${item.id}" type="button" aria-label="Remove ${escapeHtml(item.name)}">-</button>
                <div class="stepper-count">${qty}</div>
                <button class="btn-step" data-action="plus" data-id="${item.id}" type="button" aria-label="Add another ${escapeHtml(item.name)}">+</button>
              </div>
            ` : `
              <button class="btn btn-primary btn-add store-add-btn" data-id="${item.id}" type="button">
                <span class="material-symbols-rounded" aria-hidden="true">add</span>
                Add
              </button>
            `}
          </div>
        </div>
      </article>
    `;
  }

  renderFeaturedItem(item) {
    return `
      <button class="store-featured-item btn-add" data-id="${item.id}" type="button" aria-label="Add ${escapeHtml(item.name)}">
        <img src="${this.getItemImage(item)}" alt="">
        <span>${escapeHtml(item.name)}</span>
        <strong>${formatCurrency(item.price)}</strong>
      </button>
    `;
  }

  renderServiceButton(type, icon, label, detail) {
    const active = this.orderType === type;
    return `
      <button class="store-service-option ${active ? 'is-active' : ''}" data-service-type="${type}" type="button" aria-pressed="${active}">
        <span class="material-symbols-rounded" aria-hidden="true">${icon}</span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(detail)}</small>
      </button>
    `;
  }

  renderEmptyMenu(text) {
    return `
      <div class="store-empty-state">
        <span class="material-symbols-rounded" aria-hidden="true">restaurant_menu</span>
        <p>${escapeHtml(text)}</p>
      </div>
    `;
  }

  bindMenuEvents() {
    this.container.querySelectorAll('.store-category-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.activeCategoryId = parseInt(btn.dataset.id, 10);
        await this.loadItems();
        playSound(650, 70);
        this.renderMenu();
        this.container.querySelector('#menu')?.scrollIntoView({ block: 'start' });
      });
    });

    this.container.querySelectorAll('[data-service-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.orderType = btn.dataset.serviceType;
        this.renderMenu();
        this.container.querySelector('#menu')?.scrollIntoView({ block: 'start' });
      });
    });

    this.container.querySelector('#hero-pickup-btn')?.addEventListener('click', () => {
      this.orderType = 'takeaway';
      this.renderMenu();
      this.container.querySelector('#menu')?.scrollIntoView({ block: 'start' });
    });

    this.container.querySelectorAll('.btn-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = this.findItemById(parseInt(btn.dataset.id, 10));
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
      <article class="store-cart-row">
        <div>
          <h3>${escapeHtml(item.itemName)}</h3>
          <p>${formatCurrency(item.price)} each</p>
        </div>
        <div class="store-cart-row-controls">
          <strong>${formatCurrency(item.price * item.quantity)}</strong>
          <div class="stepper store-stepper">
            <button class="btn-step" data-action="minus" data-id="${item.itemId}" type="button" aria-label="Remove one ${escapeHtml(item.itemName)}">-</button>
            <div class="stepper-count">${item.quantity}</div>
            <button class="btn-step" data-action="plus" data-id="${item.itemId}" type="button" aria-label="Add one ${escapeHtml(item.itemName)}">+</button>
          </div>
        </div>
        <input class="input note-input store-note-input" data-index="${index}" value="${escapeHtml(item.notes || '')}" placeholder="Special instructions">
      </article>
    `).join('');

    this.container.innerHTML = `
      <div class="store-checkout-shell">
        ${this.renderTopBar('Your cart', 'btn-back-menu')}
        <main class="store-cart-page">
          <div class="store-checkout-head">
            <p>${this.cart.length} selected item${this.cart.length === 1 ? '' : 's'}</p>
            <h1>Review your order</h1>
          </div>
          <div class="store-cart-list">
            ${rows || this.renderEmptyMenu('Your cart is empty.')}
          </div>
        </main>
        <footer class="store-checkout-footer">
          <div>
            <span>Total</span>
            <strong>${formatCurrency(total)}</strong>
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="btn-checkout" type="button">Proceed to Checkout</button>
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
      <div class="store-checkout-shell">
        ${this.renderTopBar('Checkout', 'btn-back-cart')}
        <main class="store-checkout-page">
          <div class="store-checkout-head">
            <p>${escapeHtml(this.getOrderTypeLabel())}</p>
            <h1>Almost there</h1>
          </div>

          ${this.renderPanel('Contact details', `
            ${this.renderInput('self-name', 'Your name', this.customerName, 'Enter your name')}
            ${this.renderInput('self-phone', 'Phone number', this.customerPhone, '10-digit mobile number', 'tel')}
          `)}

          ${this.detectedTable ? '' : this.renderPanel('How should we serve this order?', `
            <div class="store-option-grid">
              ${this.renderTypeButton('delivery', 'local_shipping', 'Delivery')}
              ${this.renderTypeButton('takeaway', 'shopping_bag', 'Pickup')}
              ${this.renderTypeButton('dinein', 'table_restaurant', 'Dine-in')}
            </div>
            <div id="delivery-fields" class="store-conditional-fields" style="display:${this.orderType === 'delivery' ? 'block' : 'none'};">
              <label class="store-field-label" for="self-delivery-address">Delivery address</label>
              <textarea id="self-delivery-address" class="input store-input" rows="3" placeholder="House/flat, street, area">${escapeHtml(this.deliveryAddress)}</textarea>
              ${this.renderInput('self-delivery-landmark', 'Landmark / delivery notes', this.deliveryLandmark, 'Nearby landmark, gate code, etc.')}
            </div>
            <div id="table-fields" class="store-conditional-fields" style="display:${this.orderType === 'dinein' ? 'block' : 'none'};">
              <label class="store-field-label" for="self-table-select">Table number</label>
              <select id="self-table-select" class="input store-input">
                <option value="">Select a table</option>
                ${tableOptions}
              </select>
            </div>
          `)}

          ${this.renderPanel('Payment', `
            <div class="store-option-grid two">
              ${this.renderPaymentButton('upi', 'qr_code_2', 'UPI QR', 'Staff verifies')}
              ${this.renderPaymentButton('cash', 'payments', 'Cash/COD', 'Collected later')}
            </div>
          `)}
        </main>
        <footer class="store-checkout-footer">
          <div>
            <span>Total payable</span>
            <strong>${formatCurrency(total)}</strong>
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="btn-submit-self-order" type="button">
            <span class="material-symbols-rounded" aria-hidden="true">send_and_archive</span>
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
    }
  }

  renderSuccess() {
    const order = this.placedOrder;
    const token = order.displayToken || order.orderNumber.split('-').pop();
    const isUpi = order.paymentMethod === 'upi';
    const deliveryText = order.type === 'delivery'
      ? 'Your order will be prepared and assigned to our delivery staff.'
      : order.type === 'takeaway'
        ? 'Please keep this token ready for pickup.'
        : 'Your table order has been sent to the kitchen.';

    this.container.innerHTML = `
      <div class="store-success-shell">
        <div class="store-success-panel">
          <div class="store-success-icon">
            <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
          </div>
          <p class="store-kicker">Order Confirmed</p>
          <h1>Thank you, ${escapeHtml(order.customerName || 'guest')}</h1>
          <p>${escapeHtml(deliveryText)}</p>
          <div class="store-token">
            <span>Token</span>
            <strong>${escapeHtml(token)}</strong>
          </div>

          ${isUpi ? `
            <div class="store-payment-box">
              <div class="store-upi-qr"><canvas id="upi-qr"></canvas></div>
              <strong>${formatCurrency(order.total)}</strong>
              <span id="upi-id-label">Loading UPI ID...</span>
              <p>After paying, staff will verify UPI before marking this order as paid.</p>
            </div>
          ` : `
            <div class="store-payment-box cash">
              <span class="material-symbols-rounded" aria-hidden="true">payments</span>
              <strong>Cash on ${order.type === 'delivery' ? 'Delivery' : 'Pickup'}</strong>
              <p>Payment will be collected and marked paid by staff.</p>
            </div>
          `}

          <div id="prep-status" class="store-prep-status">Waiting for kitchen prep time...</div>
          <button class="btn btn-secondary btn-block btn-lg" id="btn-order-again" type="button">Order Something Else</button>
        </div>
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
      <header class="store-subheader">
        <button class="btn-icon btn-secondary" id="${backId}" type="button" aria-label="Go back">
          <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>
        </button>
        <a href="#/self-order" class="store-subheader-brand">THE TASTE</a>
        <h2>${escapeHtml(title)}</h2>
      </header>
    `;
  }

  renderPanel(title, body) {
    return `
      <section class="store-checkout-panel">
        <h3>${escapeHtml(title)}</h3>
        ${body}
      </section>
    `;
  }

  renderInput(id, label, value, placeholder, type = 'text') {
    return `
      <div class="input-group store-input-group">
        <label class="store-field-label" for="${id}">${escapeHtml(label)}</label>
        <input type="${type}" id="${id}" class="input store-input" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}">
      </div>
    `;
  }

  renderTypeButton(type, icon, label) {
    const active = this.orderType === type;
    return `
      <button class="type-btn store-choice-btn ${active ? 'is-active' : ''}" data-type="${type}" type="button" aria-pressed="${active}">
        <span class="material-symbols-rounded" aria-hidden="true">${icon}</span>
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }

  renderPaymentButton(method, icon, label, sublabel) {
    const active = this.selectedPaymentMethod === method;
    return `
      <button class="pay-btn store-choice-btn ${active ? 'is-active' : ''}" data-method="${method}" type="button" aria-pressed="${active}">
        <span class="material-symbols-rounded" aria-hidden="true">${icon}</span>
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(sublabel)}</small>
      </button>
    `;
  }

  getOrderTypeLabel() {
    if (this.detectedTable) return `Dine-In Table ${this.detectedTable.number}`;
    if (this.orderType === 'delivery') return 'Home Delivery Order';
    if (this.orderType === 'takeaway') return 'Pickup Order';
    const table = this.tables.find(t => String(t.id) === String(this.selectedTableId));
    return `Dine-In Order${table ? ` Table ${table.number}` : ''}`;
  }

  getFeaturedItems() {
    const all = this.categories.flatMap(category => this.menuByCategory.get(category.id) || []);
    const names = ['Steamed Veg Momos', 'Veg Hakka Noodles', 'Chicken Hakka Noodles', 'Cold Coffee', 'Chilli Paneer Dry', 'Chocolate Lava Cake'];
    const featured = names.map(name => all.find(item => item.name === name)).filter(Boolean);
    return featured.length ? featured.slice(0, 6) : all.slice(0, 6);
  }

  findItemById(id) {
    for (const items of this.menuByCategory.values()) {
      const item = items.find(candidate => candidate.id === id);
      if (item) return item;
    }
    return this.items.find(item => item.id === id);
  }

  getCategoryForItem(item) {
    return this.categories.find(category => category.id === item.categoryId);
  }

  getItemImage(item) {
    const category = this.getCategoryForItem(item);
    const key = (category?.name || '').toLowerCase();
    return CATEGORY_IMAGE_MAP[key] || '/assets/dish-starters.png';
  }

  getItemDescription(item) {
    const category = this.getCategoryForItem(item);
    const key = (category?.name || '').toLowerCase();
    return CATEGORY_COPY[key] || 'Freshly prepared by The Taste kitchen.';
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
      const clientOrderId = generateLocalUuid();

      const orderData = {
        clientOrderId,
        idempotencyKey: clientOrderId,
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
        updatedAt: now,
        requiresServerValidation: true,
        validationStatus: 'pending',
        syncStatus: 'pending',
        isSynced: 0
      };

      const remoteSubmit = await submitPublicOrder(orderData);
      const finalOrderData = remoteSubmit.accepted ? remoteSubmit.order : {
        ...orderData,
        lastSyncError: remoteSubmit.message || '',
        validationStatus: 'pending',
        requiresServerValidation: true
      };

      const order = await createOrder(finalOrderData, { skipSync: remoteSubmit.accepted });
      this.placedOrder = order;

      if (!remoteSubmit.accepted) {
        showToast('Order saved on this device. It will sync when cloud validation is available.', 'warning', 5000);
      }

      if (tableId && type === 'dinein') {
        await db.table('tables').update(tableId, { status: 'occupied', isSynced: 0 });
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
