import { getCategories, getItemsByCategory, createOrder, getNextOrderNumber, getSetting, db, generateLocalUuid } from '../../db/database.js';
import { escapeHtml, formatCurrency, parseOrderItems, playSound, showToast, vibrateDevice } from '../../utils/helpers.js';

const PHONE_RE = /^[6-9]\d{9}$/;

const CATEGORY_IMAGE_MAP = {
  momos: '/assets/dish-momos.jpg',
  starters: '/assets/dish-starters.jpg',
  noodles: '/assets/dish-noodles.jpg',
  rice: '/assets/dish-rice.jpg',
  'main course': '/assets/dish-main.jpg',
  burgers: '/assets/dish-burgers.jpg',
  sides: '/assets/dish-sides.jpg',
  beverages: '/assets/dish-beverages.jpg',
  desserts: '/assets/dish-desserts.jpg'
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
    this.loggedInCustomer = null;
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

    // Load active customer login info
    try {
      const { authService } = await import('../../services/auth.js');
      const current = authService.getCurrentStaff();
      if (current && current.role === 'customer') {
        this.loggedInCustomer = current;
        const profile = await db.customers.where('authUserId').equals(current.cloudUserId).first();
        if (profile) {
          this.customerName = profile.name;
          this.customerPhone = profile.phone || '';
        } else {
          this.customerName = current.name;
          this.customerPhone = '';
        }
      } else {
        this.loggedInCustomer = null;
        this.customerName = '';
        this.customerPhone = '';
      }
    } catch (e) {
      console.warn('[CustomerView] Failed to retrieve customer auth state:', e);
      this.loggedInCustomer = null;
      this.customerName = '';
      this.customerPhone = '';
    }

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
    if (this.handleSyncChanged) {
      window.removeEventListener('sync-data-changed', this.handleSyncChanged);
      this.handleSyncChanged = null;
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

    const authLinksHtml = this.loggedInCustomer 
      ? `
        <a href="#loyalty" id="nav-loyalty-btn" style="color:#D4AF37;font-weight:700;display:inline-flex;align-items:center;gap:4px;">
          <span class="material-symbols-rounded" style="font-size:16px;">account_circle</span>
          Hi, ${escapeHtml(this.loggedInCustomer.name.split(' ')[0])}
        </a>
        <button id="btn-customer-logout" class="store-logout-btn" type="button" title="Sign Out" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;display:inline-flex;align-items:center;vertical-align:middle;margin-left:-4px;">
          <span class="material-symbols-rounded" style="font-size:18px;">logout</span>
        </button>
      ` 
      : `
        <a href="#loyalty" id="nav-loyalty-btn" style="color:#D4AF37;font-weight:700;display:inline-flex;align-items:center;gap:4px;">
          <span class="material-symbols-rounded" style="font-size:16px;">star</span>
          Rewards
        </a>
        <button id="btn-customer-login" class="store-login-btn" type="button" style="background:rgba(212,175,55,0.15);border:1px solid #D4AF37;color:#D4AF37;cursor:pointer;padding:4px 10px;border-radius:var(--radius-sm);font-weight:700;font-size:0.7rem;display:inline-flex;align-items:center;gap:4px;margin-left:4px;">
          <span class="material-symbols-rounded" style="font-size:14px;">login</span>
          Sign In
        </button>
      `;

    this.container.innerHTML = `
      <div class="storefront-shell">
        <section class="store-hero" aria-label="The Taste storefront">
          <div class="store-hero-bg" aria-hidden="true"></div>
          <header class="store-nav">
            <a class="store-brand" href="#/self-order">
              <img src="/assets/the-taste-logo.png" class="store-brand-mark" alt="The Taste Logo" style="object-fit:contain;padding:2px;background:#fff;" />
              <div>THE TASTE</div>
            </a>
            <nav class="store-nav-links" aria-label="Public navigation" style="display:flex;align-items:center;gap:12px;">
              <a href="#menu">Menu</a>
              ${authLinksHtml}
              <a href="/TheTaste.apk" download style="display:inline-flex;align-items:center;gap:4px;color:#FF6B35;font-weight:700;" title="Download Android App APK"><span class="material-symbols-rounded" style="font-size:16px;">android</span>Get App</a>
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
      <article class="store-menu-item ${qty ? 'is-selected' : ''}" data-id="${item.id}">
        <img class="store-menu-item-image" src="${this.getItemImage(item)}" alt="${escapeHtml(item.name)}" width="640" height="420" loading="lazy" decoding="async">
        <div class="store-menu-item-body">
          <div class="store-menu-item-title">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(this.getItemDescription(item))}</p>
            </div>
            <span class="${item.isVeg ? 'store-food-mark veg' : 'store-food-mark nonveg'}" aria-hidden="true"></span>
            <span class="sr-only">${item.isVeg ? 'Vegetarian' : 'Non vegetarian'}</span>
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
      <button class="store-featured-item" data-id="${item.id}" type="button">
        <img src="${this.getItemImage(item)}" alt="" width="640" height="420" loading="lazy" decoding="async">
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

    // Card click opens the premium detail drawer
    this.container.querySelectorAll('.store-menu-item').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.stepper') || e.target.closest('.btn-step')) {
          return;
        }
        const id = parseInt(card.dataset.id, 10);
        const item = this.findItemById(id);
        if (item) {
          this.openItemDetailsDrawer(item);
        }
      });
    });

    this.container.querySelectorAll('.store-featured-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const item = this.findItemById(id);
        if (item) {
          this.openItemDetailsDrawer(item);
        }
      });
    });

    this.container.querySelectorAll('.store-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const item = this.findItemById(id);
        if (item) {
          this.addToCart(item);
        }
      });
    });

    this.container.querySelectorAll('.btn-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.adjustCart(parseInt(btn.dataset.id, 10), btn.dataset.action === 'plus' ? 1 : -1);
      });
    });

    this.container.querySelector('#btn-view-cart')?.addEventListener('click', () => {
      this.state = 'cart';
      playSound(800, 80);
      this.render();
    });

    this.container.querySelector('#nav-loyalty-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openLoyaltyDrawer();
    });

    this.container.querySelector('#btn-customer-login')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      playSound(700, 80);
      const appEl = document.getElementById('app');
      const { LoginScreen } = await import('../../components/LoginScreen.js');
      const login = new LoginScreen(async (staff) => {
        await this.loadData();
        this.render();
      });
      login.render(appEl);
    });

    this.container.querySelector('#btn-customer-logout')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm('Are you sure you want to sign out?')) {
        playSound(600, 80);
        const { authService } = await import('../../services/auth.js');
        authService.logout();
        this.loggedInCustomer = null;
        this.customerName = '';
        this.customerPhone = '';
        await this.loadData();
        this.render();
      }
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

    const loginPromptHtml = !this.loggedInCustomer ? `
      <div style="font-size:0.75rem; color:var(--text-secondary); background:rgba(212,175,55,0.04); border:1px solid rgba(212,175,55,0.12); padding:10px 14px; border-radius:var(--radius-md); margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <span>🔒 Sign in to autofill details and earn points!</span>
        <button class="btn btn-secondary btn-sm" id="checkout-login-btn" type="button" style="padding:4px 10px; font-size:0.7rem; border-color:#D4AF37; color:#D4AF37; font-weight:700; flex-shrink:0;">Sign In</button>
      </div>
    ` : '';

    this.container.innerHTML = `
      <div class="store-checkout-shell">
        ${this.renderTopBar('Checkout', 'btn-back-cart')}
        <main class="store-checkout-page">
          <div class="store-checkout-head">
            <p>${escapeHtml(this.getOrderTypeLabel())}</p>
            <h1>Almost there</h1>
          </div>

          ${this.renderPanel('Contact details', `
            ${loginPromptHtml}
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
    this.container.querySelector('#checkout-login-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      playSound(700, 80);
      const appEl = document.getElementById('app');
      const { LoginScreen } = await import('../../components/LoginScreen.js');
      const login = new LoginScreen(async (staff) => {
        await this.loadData();
        this.renderCheckout();
      });
      login.render(appEl);
    });
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
    // Request push notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(err => console.warn('Notification permission request failed:', err));
    }

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
        <div class="store-success-panel animate-fade-in">
          <div class="aether-telemetry-ring-wrapper">
            <svg class="aether-telemetry-svg" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" class="aether-track" />
              <circle cx="50" cy="50" r="40" class="aether-fill" id="telemetry-ring-fill" />
            </svg>
            <div class="aether-telemetry-ring-label">
              <span class="material-symbols-rounded" id="telemetry-ring-icon">receipt</span>
              <strong id="telemetry-ring-percentage">15%</strong>
              <small id="telemetry-ring-step">Received</small>
            </div>
          </div>
          <p class="store-kicker">Live Order Telemetry</p>
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
              <div style="margin-top: 12px; width: 100%;">
                <a href="#" id="customer-upi-deeplink" class="btn btn-primary btn-block" style="text-decoration:none; display:none; align-items:center; justify-content:center; gap:8px; height:44px; font-weight:700; background:linear-gradient(135deg, #10B981 0%, #059669 100%); border:none; box-shadow:0 4px 15px rgba(16, 185, 129, 0.35);">
                  <span class="material-symbols-rounded">open_in_new</span>
                  Pay via UPI App
                </a>
              </div>
              <p style="margin-top: 12px;">After paying, staff will verify UPI before marking this order as paid.</p>
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
    const deeplink = this.container.querySelector('#customer-upi-deeplink');
    if (!canvas || !this.placedOrder) return;
    const upiId = await getSetting('upiId') || 'paytmqr6zfcsx@ptys';
    if (upiLabel) upiLabel.textContent = upiId;
    const { generateUPIQR } = await import('../../services/upi.js');
    const upiLink = await generateUPIQR(canvas, {
      amount: this.placedOrder.total,
      orderId: this.placedOrder.orderNumber
    });
    if (deeplink) {
      deeplink.href = upiLink;
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        deeplink.style.display = 'flex';
      } else {
        deeplink.style.display = 'none';
      }
    }
  }

  triggerOrderNotification(latest, statusChanged, deliveryChanged) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    let title = 'Order Update';
    let body = '';

    if (statusChanged) {
      const status = (latest.status || '').toLowerCase();
      if (status === 'confirmed') {
        body = `Your order ${latest.orderNumber} has been confirmed.`;
      } else if (status === 'preparing' || status === 'cooking') {
        body = `Chef is now preparing your order ${latest.orderNumber}!`;
      } else if (status === 'ready' || status === 'plated') {
        body = `Your order ${latest.orderNumber} is ready!`;
      } else if (status === 'completed' || status === 'served') {
        body = `Your order ${latest.orderNumber} has been served. Enjoy your meal!`;
      }
    }

    if (deliveryChanged && latest.type === 'delivery') {
      const delStatus = (latest.deliveryStatus || '').toLowerCase();
      if (delStatus === 'dispatched' || delStatus === 'out_for_delivery') {
        body = `Your order ${latest.orderNumber} is out for delivery!`;
      } else if (delStatus === 'delivered') {
        body = `Your order ${latest.orderNumber} has been delivered. Thank you!`;
      }
    }

    if (body) {
      try {
        const notification = new Notification(title, {
          body,
          icon: '/assets/the-taste-logo.png',
          silent: false
        });
        playSound(880, 150);
        vibrateDevice([100, 50, 100]);
        notification.onclick = () => {
          window.focus();
        };
      } catch (err) {
        console.warn('Failed to display browser notification:', err);
      }
    }
  }

  startOrderPoll() {
    if (!this.placedOrder) return;

    let lastStatus = this.placedOrder.status;
    let lastDeliveryStatus = this.placedOrder.deliveryStatus;

    const updateTelemetry = (latest) => {
      const fillEl = this.container?.querySelector('#telemetry-ring-fill');
      const percentageEl = this.container?.querySelector('#telemetry-ring-percentage');
      const stepEl = this.container?.querySelector('#telemetry-ring-step');
      const iconEl = this.container?.querySelector('#telemetry-ring-icon');

      let percentage = 15;
      let label = 'Received';
      let icon = 'receipt';

      const orderStatus = (latest.status || 'pending').toLowerCase();
      const delivStatus = (latest.deliveryStatus || 'pending').toLowerCase();

      if (orderStatus === 'confirmed') {
        percentage = 30;
        label = 'Confirmed';
        icon = 'thumb_up';
      } else if (orderStatus === 'preparing' || orderStatus === 'cooking') {
        percentage = 60;
        label = 'Cooking';
        icon = 'skillet';
      } else if (orderStatus === 'plated' || orderStatus === 'ready') {
        percentage = 85;
        label = 'Plated';
        icon = 'room_service';
      } else if (orderStatus === 'dispatched' || delivStatus === 'dispatched' || delivStatus === 'out_for_delivery') {
        percentage = 92;
        label = 'En Route';
        icon = 'local_shipping';
      } else if (orderStatus === 'completed' || orderStatus === 'served' || delivStatus === 'delivered') {
        percentage = 100;
        label = 'Served';
        icon = 'check_circle';
      }

      if (fillEl) {
        const offset = 251.2 - (percentage / 100) * 251.2;
        fillEl.style.strokeDashoffset = offset;
      }
      if (percentageEl) percentageEl.textContent = `${percentage}%`;
      if (stepEl) stepEl.textContent = label;
      if (iconEl && iconEl.textContent !== icon) iconEl.textContent = icon;

      const status = this.container?.querySelector('#prep-status');
      if (status) {
        const parts = [];
        if (latest.estimatedPrepTime) parts.push(`Prep time: ${latest.estimatedPrepTime} min`);
        parts.push(`Kitchen: ${latest.status}`);
        if (latest.type === 'delivery') parts.push(`Delivery: ${latest.deliveryStatus || 'pending'}`);
        if (latest.paymentStatus === 'paid') parts.push('Payment verified');
        status.textContent = parts.join(' | ');
      }
    };

    db.orders.get(this.placedOrder.id).then(latest => {
      if (latest) {
        lastStatus = latest.status;
        lastDeliveryStatus = latest.deliveryStatus;
        updateTelemetry(latest);
      }
    });

    const checkAndUpdate = (latest) => {
      const statusChanged = latest.status !== lastStatus;
      const deliveryChanged = latest.deliveryStatus !== lastDeliveryStatus;

      if (statusChanged || deliveryChanged) {
        this.triggerOrderNotification(latest, statusChanged, deliveryChanged);
        lastStatus = latest.status;
        lastDeliveryStatus = latest.deliveryStatus;
      }

      this.placedOrder = latest;
      updateTelemetry(latest);
    };

    this.pollInterval = setInterval(async () => {
      const latest = await db.orders.get(this.placedOrder.id);
      if (!latest) return;
      checkAndUpdate(latest);
    }, 3000);

    // Listen to sync events for real-time updates as well
    this.handleSyncChanged = async (event) => {
      const { storeName, newObj } = event.detail;
      if (storeName === 'orders' && this.placedOrder) {
        if (newObj && (newObj.clientOrderId === this.placedOrder.clientOrderId || newObj.id === this.placedOrder.id)) {
          const latest = await db.orders.get(this.placedOrder.id);
          if (latest) {
            checkAndUpdate(latest);
          }
        }
      }
    };
    window.addEventListener('sync-data-changed', this.handleSyncChanged);
  }

  renderTopBar(title, backId) {
    return `
      <header class="store-subheader">
        <button class="btn-icon btn-secondary" id="${backId}" type="button" aria-label="Go back">
          <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>
        </button>
        <a href="#/self-order" class="store-subheader-brand">
          <img src="/assets/the-taste-logo.png" class="store-brand-mark" style="width:24px;height:24px;border-radius:4px;object-fit:contain;background:#fff;margin-right:4px;" alt="Logo" />
          THE TASTE
        </a>
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
    if (item.imageUrl) return item.imageUrl;
    const category = this.getCategoryForItem(item);
    const key = (category?.name || '').toLowerCase();
    return CATEGORY_IMAGE_MAP[key] || '/assets/dish-starters.jpg';
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

      const { submitPublicOrder } = await import('../../services/publicOrders.js');
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
      const { deductInventoryForOrder } = await import('../../services/inventoryHook.js');
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

  openItemDetailsDrawer(item) {
    playSound(600, 70);
    vibrateDevice([15]);

    const overlay = document.createElement('div');
    overlay.className = 'aether-drawer-overlay';
    overlay.id = 'item-detail-drawer';

    const isVeg = item.isVeg ? 'veg' : 'nonveg';

    overlay.innerHTML = `
      <div class="aether-drawer-sheet">
        <div class="aether-drawer-handle"></div>
        <button class="aether-drawer-close-btn" type="button" aria-label="Close">
          <span class="material-symbols-rounded">close</span>
        </button>

        <div class="aether-drawer-scroll-content">
          <div class="aether-drawer-hero-wrapper">
            <img class="aether-drawer-hero-img" src="${this.getItemImage(item)}" alt="${escapeHtml(item.name)}" />
            <span class="store-food-mark ${isVeg}" style="position:absolute;top:16px;right:16px;z-index:2;box-shadow:0 4px 10px rgba(0,0,0,0.3);"></span>
          </div>

          <div class="aether-drawer-body">
            <div class="aether-drawer-header">
              <h2>${escapeHtml(item.name)}</h2>
              <span class="aether-drawer-price">${formatCurrency(item.price)}</span>
            </div>
            <p class="aether-drawer-desc">${escapeHtml(this.getItemDescription(item))}</p>

            <div class="aether-drawer-section">
              <h3>Spicy Level</h3>
              <div class="aether-spicy-grid">
                <label class="aether-spicy-option">
                  <input type="radio" name="spicy-level" value="Mild" checked />
                  <span class="aether-spicy-card">
                    <span class="material-symbols-rounded" style="color:#10B981;">nature</span>
                    <strong>Mild</strong>
                    <small>Default prep</small>
                  </span>
                </label>
                <label class="aether-spicy-option">
                  <input type="radio" name="spicy-level" value="Hot" />
                  <span class="aether-spicy-card">
                    <span class="material-symbols-rounded" style="color:#F59E0B;">local_fire_department</span>
                    <strong>Hot</strong>
                    <small>Chef spicy</small>
                  </span>
                </label>
                <label class="aether-spicy-option">
                  <input type="radio" name="spicy-level" value="Volcanic" />
                  <span class="aether-spicy-card">
                    <span class="material-symbols-rounded" style="color:#EF4444;">volcano</span>
                    <strong>Volcanic</strong>
                    <small>Extra high heat</small>
                  </span>
                </label>
              </div>
            </div>

            <div class="aether-drawer-section">
              <h3>Culinary Modifiers</h3>
              <div class="aether-modifiers-list">
                <label class="aether-modifier-item">
                  <input type="checkbox" name="modifier" value="Extra Cheese" />
                  <span class="aether-checkbox-visual"></span>
                  <div class="aether-modifier-label">
                    <strong>Extra Melted Cheese</strong>
                    <small>Rich visual pull (+${formatCurrency(30)})</small>
                  </div>
                </label>
                <label class="aether-modifier-item">
                  <input type="checkbox" name="modifier" value="Gluten Free" />
                  <span class="aether-checkbox-visual"></span>
                  <div class="aether-modifier-label">
                    <strong>Gluten Free Preparation</strong>
                    <small>Organic substitute ingredients</small>
                  </div>
                </label>
                <label class="aether-modifier-item">
                  <input type="checkbox" name="modifier" value="No Onions" />
                  <span class="aether-checkbox-visual"></span>
                  <div class="aether-modifier-label">
                    <strong>No Onions or Garlic</strong>
                    <small>Classic customization</small>
                  </div>
                </label>
              </div>
            </div>

            <div class="aether-drawer-section">
              <h3>Special Kitchen Notes</h3>
              <textarea id="drawer-kitchen-instructions" class="aether-textarea" rows="2" placeholder="E.g. Make it extra crispy, packing sauce separately..."></textarea>
            </div>
          </div>
        </div>

        <div class="aether-drawer-action-bar">
          <div class="aether-drawer-quantity-stepper">
            <button class="aether-qty-btn minus" type="button">-</button>
            <span class="aether-qty-count">1</span>
            <button class="aether-qty-btn plus" type="button">+</button>
          </div>
          <button class="btn btn-primary" id="drawer-add-to-cart-btn" type="button" style="flex:1;height:48px;font-weight:800;border-radius:var(--radius-md);">
            Add to Cart — ${formatCurrency(item.price)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
    });

    let qty = 1;
    const qtyCountEl = overlay.querySelector('.aether-qty-count');
    const addToCartBtn = overlay.querySelector('#drawer-add-to-cart-btn');

    const updateDrawerButton = () => {
      qtyCountEl.textContent = qty;
      let modCost = 0;
      const extraCheeseChecked = overlay.querySelector('input[value="Extra Cheese"]').checked;
      if (extraCheeseChecked) modCost += 30;

      const totalPrice = (item.price + modCost) * qty;
      addToCartBtn.textContent = `Add to Cart — ${formatCurrency(totalPrice)}`;
    };

    overlay.querySelector('.aether-qty-btn.minus').addEventListener('click', () => {
      if (qty > 1) {
        qty--;
        playSound(600, 60);
        updateDrawerButton();
      }
    });

    overlay.querySelector('.aether-qty-btn.plus').addEventListener('click', () => {
      qty++;
      playSound(650, 70);
      updateDrawerButton();
    });

    overlay.querySelectorAll('input[name="modifier"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        playSound(620, 60);
        updateDrawerButton();
      });
    });

    const closeDrawer = () => {
      overlay.classList.remove('is-open');
      playSound(550, 60);
      setTimeout(() => {
        overlay.remove();
      }, 300);
    };

    overlay.querySelector('.aether-drawer-close-btn').addEventListener('click', closeDrawer);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDrawer();
    });

    addToCartBtn.addEventListener('click', () => {
      const spicyLevel = overlay.querySelector('input[name="spicy-level"]:checked').value;
      const modifiers = Array.from(overlay.querySelectorAll('input[name="modifier"]:checked')).map(cb => cb.value);
      const customNotes = overlay.querySelector('#drawer-kitchen-instructions').value.trim();

      let modCost = 0;
      if (modifiers.includes('Extra Cheese')) modCost += 30;
      const finalPrice = item.price + modCost;

      let consolidatedNotes = `Spicy: ${spicyLevel}`;
      if (modifiers.length > 0) consolidatedNotes += ` | Mods: ${modifiers.join(', ')}`;
      if (customNotes) consolidatedNotes += ` | Note: ${customNotes}`;

      const existingIndex = this.cart.findIndex(ci => ci.itemId === item.id && ci.notes === consolidatedNotes);
      if (existingIndex !== -1) {
        this.cart[existingIndex].quantity += qty;
      } else {
        this.cart.push({
          itemId: item.id,
          itemName: item.name,
          price: finalPrice,
          quantity: qty,
          isVeg: item.isVeg,
          notes: consolidatedNotes
        });
      }

      playSound(900, 100);
      vibrateDevice([40, 20, 40]);
      showToast(`${item.name} added to cart!`, 'success');

      closeDrawer();
      this.render();
    });
  }

  async openLoyaltyDrawer() {
    playSound(600, 70);
    vibrateDevice([15]);

    // Request push notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(err => console.warn('Notification permission request failed:', err));
    }

    const overlay = document.createElement('div');
    overlay.className = 'aether-drawer-overlay';
    overlay.id = 'crm-loyalty-drawer';

    overlay.innerHTML = `
      <div class="aether-drawer-sheet crm-drawer">
        <div class="aether-drawer-handle"></div>
        <button class="aether-drawer-close-btn" type="button" aria-label="Close">
          <span class="material-symbols-rounded">close</span>
        </button>

        <div class="aether-drawer-scroll-content">
          <div class="crm-hero-section">
            <span class="material-symbols-rounded crm-hero-icon" style="color:var(--color-primary);font-size:2.5rem;filter:drop-shadow(0 2px 8px var(--color-primary-glow));">reward</span>
            <h2>TasteRewards Club</h2>
            <p>Earn 1 point for every ${formatCurrency(10)} spent. Unlock silver, gold, and platinum culinary tiers.</p>
          </div>

          <div class="crm-body-content" id="crm-drawer-inner">
            <div class="crm-auth-view">
              <div class="input-group store-input-group">
                <label class="store-field-label" for="crm-phone-input">Enter Phone Number</label>
                <input type="tel" id="crm-phone-input" class="input store-input" placeholder="10-digit mobile number" maxlength="10" />
              </div>
              <button class="btn btn-primary btn-block" id="crm-lookup-btn" type="button" style="height:46px;margin-top:12px;font-weight:700;">
                Access Account
              </button>
              <div style="text-align:center;margin-top:16px;">
                <span style="font-size:0.75rem;color:var(--text-secondary);opacity:0.8;">Or secure your account with a password:</span>
                <button class="btn btn-secondary btn-block btn-sm" id="crm-signin-link" type="button" style="margin-top:8px;font-weight:700;height:38px;">
                  Sign In / Sign Up
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
    });

    const closeDrawer = () => {
      overlay.classList.remove('is-open');
      playSound(550, 60);
      setTimeout(() => {
        overlay.remove();
      }, 300);
    };

    overlay.querySelector('.aether-drawer-close-btn').addEventListener('click', closeDrawer);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDrawer();
    });

    const innerContainer = overlay.querySelector('#crm-drawer-inner');
    const lookupBtn = overlay.querySelector('#crm-lookup-btn');
    const phoneInput = overlay.querySelector('#crm-phone-input');

    const handleLookup = async () => {
      const phone = phoneInput.value.trim();
      if (!/^[6-9]\d{9}$/.test(phone)) {
        showToast('Please enter a valid 10-digit mobile number', 'warning');
        return;
      }

      playSound(700, 80);
      vibrateDevice([20]);

      innerContainer.innerHTML = `<div style="text-align:center;padding:32px;"><div class="spinner store-spinner" style="margin:0 auto 12px;"></div>Loading rewards profile...</div>`;

      try {
        const customer = await db.customers.where('phone').equals(phone).first();
        const orders = await db.orders.where('customerPhone').equals(phone).reverse().toArray();

        if (customer) {
          renderProfileView(customer, orders);
        } else {
          renderRegisterView(phone);
        }
      } catch (err) {
        console.error('CRM lookup error:', err);
        showToast('Failed to load profile', 'error');
        closeDrawer();
      }
    };

    if (lookupBtn) {
      lookupBtn.addEventListener('click', handleLookup);
    }
    if (phoneInput) {
      phoneInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLookup();
      });
    }

    overlay.querySelector('#crm-signin-link')?.addEventListener('click', () => {
      closeDrawer();
      playSound(700, 80);
      const appEl = document.getElementById('app');
      import('../../components/LoginScreen.js').then(({ LoginScreen }) => {
        const login = new LoginScreen(async (staff) => {
          await this.loadData();
          this.render();
          this.openLoyaltyDrawer();
        });
        login.render(appEl);
      });
    });

    const renderProfileView = (cust, orders) => {
      const tierGradients = {
        bronze: 'linear-gradient(135deg, #8C7853 0%, #4E3E28 100%)',
        silver: 'linear-gradient(135deg, #BDC3C7 0%, #2C3E50 100%)',
        gold: 'linear-gradient(135deg, #F39C12 0%, #F1C40F 100%)',
        platinum: 'linear-gradient(135deg, #34495E 0%, #2C3E50 100%)'
      };

      const tierBadge = cust.tier || 'bronze';
      const bgStyle = tierGradients[tierBadge.toLowerCase()] || tierGradients.bronze;

      let nextTier = 'Silver';
      let nextPointsNeeded = 50 - (cust.loyaltyPoints || 0);
      let percentage = Math.min(((cust.loyaltyPoints || 0) / 50) * 100, 100);

      if (tierBadge === 'silver') {
        nextTier = 'Gold';
        nextPointsNeeded = 200 - (cust.loyaltyPoints || 0);
        percentage = Math.min(((cust.loyaltyPoints || 0) / 200) * 100, 100);
      } else if (tierBadge === 'gold') {
        nextTier = 'Platinum';
        nextPointsNeeded = 500 - (cust.loyaltyPoints || 0);
        percentage = Math.min(((cust.loyaltyPoints || 0) / 500) * 100, 100);
      } else if (tierBadge === 'platinum') {
        nextTier = 'Maximum Status';
        nextPointsNeeded = 0;
        percentage = 100;
      }

      let ordersHtml = `<p class="crm-no-orders">No past order history found.</p>`;
      if (orders.length > 0) {
        ordersHtml = orders.map(order => {
          const itemsDesc = order.items.map(i => `${i.quantity}x ${escapeHtml(i.itemName)}`).join(', ');
          const dateStr = new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return `
            <div class="crm-order-card">
              <div class="crm-order-card-header">
                <strong>Order on ${dateStr}</strong>
                <span class="crm-order-price">${formatCurrency(order.total)}</span>
              </div>
              <p class="crm-order-items">${itemsDesc}</p>
              <button class="btn btn-secondary btn-sm btn-reorder" data-order-id="${order.id}" type="button" style="margin-top:8px;font-size:0.65rem;padding:4px 8px;border-radius:var(--radius-sm);font-weight:700;">
                <span class="material-symbols-rounded" style="font-size:12px;vertical-align:middle;margin-right:2px;">replay</span>
                1-Click Reorder
              </button>
            </div>
          `;
        }).join('');
      }

      innerContainer.innerHTML = `
        <div class="crm-profile-view">
          <div class="crm-loyalty-card" style="background:${bgStyle};">
            <div class="crm-card-top">
              <div class="crm-brand-name">THE TASTE</div>
              <span class="crm-tier-tag">${tierBadge.toUpperCase()} TIER</span>
            </div>
            <div class="crm-card-middle">
              <h3 class="crm-cust-name">${escapeHtml(cust.name)}</h3>
              <p class="crm-cust-phone">${cust.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}</p>
            </div>
            <div class="crm-card-bottom">
              <div>
                <small>LOYALTY POINTS</small>
                <strong>${cust.loyaltyPoints || 0} pts</strong>
              </div>
              <div>
                <small>VISITS</small>
                <strong>${cust.visitCount || 0}</strong>
              </div>
            </div>
          </div>

          <div class="crm-tier-meter-box">
            <div class="crm-meter-labels">
              <span>Progress to ${nextTier}</span>
              <span>${cust.loyaltyPoints || 0} pts</span>
            </div>
            <div class="crm-meter-track">
              <div class="crm-meter-fill" style="width:${percentage}%;"></div>
            </div>
            ${nextPointsNeeded > 0 ? `<p class="crm-meter-hint">Earn ${nextPointsNeeded} more points for ${nextTier} status.</p>` : `<p class="crm-meter-hint">You are at maximum elite status!</p>`}
          </div>

          <div class="crm-history-section">
            <h3>Order History</h3>
            <div class="crm-orders-scroll-list">
              ${ordersHtml}
            </div>
          </div>
        </div>
      `;

      innerContainer.querySelectorAll('.btn-reorder').forEach(btn => {
        btn.addEventListener('click', async () => {
          const orderId = parseInt(btn.dataset.orderId, 10);
          const matchedOrder = orders.find(o => o.id === orderId);
          if (matchedOrder) {
            this.cart = matchedOrder.items.map(item => ({
              itemId: item.itemId,
              itemName: item.itemName,
              price: item.price,
              quantity: item.quantity,
              isVeg: item.isVeg,
              notes: item.notes || ''
            }));

            playSound(900, 100);
            vibrateDevice([40, 20, 40]);
            showToast('Cart loaded with past items!', 'success');

            closeDrawer();
            this.state = 'cart';
            this.render();
          }
        });
      });
    };

    const renderRegisterView = (phone, isCloud = false) => {
      innerContainer.innerHTML = `
        <div class="crm-register-view" style="text-align:center;padding:16px 8px;">
          <span class="material-symbols-rounded" style="font-size:48px;color:var(--color-primary);margin-bottom:8px;">app_registration</span>
          <h3>Join TasteRewards</h3>
          <p style="color:var(--text-secondary);font-size:0.75rem;margin-bottom:18px;">You don't have a rewards profile yet. Register your details to start earning points on every dish!</p>

          <div class="input-group store-input-group" style="text-align:left;">
            <label class="store-field-label" for="crm-reg-name">Your Full Name</label>
            <input type="text" id="crm-reg-name" class="input store-input" value="${isCloud && this.loggedInCustomer ? escapeHtml(this.loggedInCustomer.name) : ''}" placeholder="E.g. Alexander Mercer" />
          </div>

          ${isCloud ? `
            <div class="input-group store-input-group" style="text-align:left;margin-top:12px;">
              <label class="store-field-label" for="crm-reg-phone">Mobile Number</label>
              <input type="tel" id="crm-reg-phone" class="input store-input" placeholder="10-digit mobile number" maxlength="10" />
            </div>
          ` : ''}

          <button class="btn btn-primary btn-block" id="crm-reg-submit" type="button" style="height:46px;margin-top:16px;font-weight:700;">
            Activate Account
          </button>
        </div>
      `;

      overlay.querySelector('#crm-reg-submit').addEventListener('click', async () => {
        const name = overlay.querySelector('#crm-reg-name').value.trim();
        const phoneToUse = isCloud ? overlay.querySelector('#crm-reg-phone').value.trim() : phone;
        if (!name) {
          showToast('Please enter your name', 'warning');
          return;
        }
        if (isCloud && !/^[6-9]\d{9}$/.test(phoneToUse)) {
          showToast('Please enter a valid 10-digit mobile number', 'warning');
          return;
        }

        playSound(900, 80);
        vibrateDevice([30]);

        try {
          const authUserId = isCloud && this.loggedInCustomer ? this.loggedInCustomer.cloudUserId : null;
          const newProfile = {
            id: Date.now(),
            phone: phoneToUse,
            name,
            authUserId,
            totalSpent: 0,
            visitCount: 0,
            loyaltyPoints: 0,
            tier: 'bronze',
            lastVisit: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            isSynced: 0,
            _platform: 'nextgenos'
          };
          
          if (isCloud) {
            const existing = await db.customers.where('phone').equals(phoneToUse).first();
            if (existing) {
              existing.authUserId = authUserId;
              existing.name = name;
              existing.isSynced = 0;
              await db.customers.put(existing);
              showToast('Account activated & synced with existing profile!', 'success');
              renderProfileView(existing, []);
              return;
            }
          }

          await db.customers.add(newProfile);
          showToast('Welcome to TasteRewards!', 'success');
          this.customerPhone = phoneToUse;
          this.customerName = name;
          renderProfileView(newProfile, []);
        } catch (err) {
          console.error('Registration failed:', err);
          showToast('Failed to register profile', 'error');
        }
      });
    };

    const renderLinkPhoneView = (customer) => {
      innerContainer.innerHTML = `
        <div class="crm-register-view" style="text-align:center;padding:16px 8px;">
          <span class="material-symbols-rounded" style="font-size:48px;color:var(--color-primary);margin-bottom:8px;">phone_android</span>
          <h3>Link Phone Number</h3>
          <p style="color:var(--text-secondary);font-size:0.75rem;margin-bottom:18px;">To track your orders and accumulate TasteRewards points, please link your 10-digit mobile number.</p>

          <div class="input-group store-input-group" style="text-align:left;">
            <label class="store-field-label" for="crm-link-phone">Mobile Number</label>
            <input type="tel" id="crm-link-phone" class="input store-input" placeholder="10-digit mobile number" maxlength="10" />
          </div>

          <button class="btn btn-primary btn-block" id="crm-link-submit" type="button" style="height:46px;margin-top:16px;font-weight:700;">
            Link Number
          </button>
        </div>
      `;

      overlay.querySelector('#crm-link-submit').addEventListener('click', async () => {
        const phone = overlay.querySelector('#crm-link-phone').value.trim();
        if (!/^[6-9]\d{9}$/.test(phone)) {
          showToast('Please enter a valid 10-digit mobile number', 'warning');
          return;
        }

        playSound(900, 80);
        vibrateDevice([30]);

        try {
          const existingPhone = await db.customers.where('phone').equals(phone).first();
          if (existingPhone && existingPhone.authUserId && existingPhone.authUserId !== customer.authUserId) {
            showToast('This phone number is already linked to another account.', 'error');
            return;
          }

          if (existingPhone) {
            const mergedPoints = (existingPhone.loyaltyPoints || 0) + (customer.loyaltyPoints || 0);
            const mergedSpent = (existingPhone.totalSpent || 0) + (customer.totalSpent || 0);
            const mergedVisits = (existingPhone.visitCount || 0) + (customer.visitCount || 0);

            await db.customers.delete(customer.id);
            customer.id = existingPhone.id;
            customer.phone = phone;
            customer.loyaltyPoints = mergedPoints;
            customer.totalSpent = mergedSpent;
            customer.visitCount = mergedVisits;
            customer.tier = mergedSpent >= 5000 ? 'platinum' : mergedSpent >= 2000 ? 'gold' : mergedSpent >= 500 ? 'silver' : 'bronze';

            await db.customers.put({
              ...existingPhone,
              authUserId: customer.authUserId,
              name: customer.name || existingPhone.name,
              loyaltyPoints: mergedPoints,
              totalSpent: mergedSpent,
              visitCount: mergedVisits,
              tier: customer.tier,
              isSynced: 0
            });
          } else {
            customer.phone = phone;
            await db.customers.update(customer.id, { phone, isSynced: 0 });
          }

          this.customerPhone = phone;
          showToast('Phone number linked successfully!', 'success');

          innerContainer.innerHTML = `<div style="text-align:center;padding:32px;"><div class="spinner store-spinner" style="margin:0 auto 12px;"></div>Loading rewards profile...</div>`;
          let orders = [];
          if (navigator.onLine) {
            const { getSupabaseClient } = await import('../../services/supabaseClient.js');
            const supabase = await getSupabaseClient();
            if (supabase) {
              const { data: ordersData } = await supabase
                .from('orders')
                .select('*')
                .eq('customer_phone', phone)
                .order('created_at', { ascending: false });
              if (ordersData) {
                const { mapOrderToLocal } = await import('../../services/sync.js');
                orders = ordersData.map(mapOrderToLocal);
              }
            }
          }
          if (!orders.length) {
            orders = await db.orders.where('customerPhone').equals(phone).reverse().toArray();
          }
          renderProfileView(customer, orders);
        } catch (err) {
          console.error('Phone link failed:', err);
          showToast('Failed to link phone number', 'error');
        }
      });
    };

    // Auto-fetch if customer logged in
    if (this.loggedInCustomer) {
      innerContainer.innerHTML = `<div style="text-align:center;padding:32px;"><div class="spinner store-spinner" style="margin:0 auto 12px;"></div>Loading rewards profile...</div>`;
      (async () => {
        try {
          let customer = await db.customers.where('authUserId').equals(this.loggedInCustomer.cloudUserId).first();
          let orders = [];

          if (navigator.onLine) {
            const { getSupabaseClient } = await import('../../services/supabaseClient.js');
            const supabase = await getSupabaseClient();
            if (supabase) {
              const { data: custData, error: custErr } = await supabase
                .from('customers')
                .select('*')
                .eq('auth_user_id', this.loggedInCustomer.cloudUserId)
                .maybeSingle();

              if (!custErr && custData) {
                const { mapCustomerToLocal } = await import('../../services/sync.js');
                const localCust = mapCustomerToLocal(custData);
                const existingLocal = await db.customers.where('phone').equals(localCust.phone).first();
                if (existingLocal) {
                  localCust.id = existingLocal.id;
                }
                await db.customers.put(localCust);
                customer = localCust;
              }

              const phoneToUse = customer?.phone || this.customerPhone;
              if (phoneToUse) {
                const { data: ordersData, error: ordersErr } = await supabase
                  .from('orders')
                  .select('*')
                  .eq('customer_phone', phoneToUse)
                  .order('created_at', { ascending: false });

                if (!ordersErr && ordersData) {
                  const { mapOrderToLocal } = await import('../../services/sync.js');
                  orders = ordersData.map(mapOrderToLocal);
                  await db.transaction('rw', db.orders, async () => {
                    for (const order of orders) {
                      const existing = await db.orders.where('clientOrderId').equals(order.clientOrderId).first();
                      if (existing) order.id = existing.id;
                      await db.orders.put(order);
                    }
                  });
                }
              }
            }
          }

          if (!orders.length && customer?.phone) {
            orders = await db.orders.where('customerPhone').equals(customer.phone).reverse().toArray();
          }

          if (customer) {
            if (!customer.phone) {
              renderLinkPhoneView(customer);
            } else {
              renderProfileView(customer, orders);
            }
          } else {
            renderRegisterView('', true);
          }
        } catch (err) {
          console.error('CRM lookup error:', err);
          innerContainer.innerHTML = `<p style="text-align:center;color:var(--color-danger);padding:16px;">Failed to load profile details.</p>`;
        }
      })();
    }
  }

  unmount() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.handleSyncChanged) {
      window.removeEventListener('sync-data-changed', this.handleSyncChanged);
      this.handleSyncChanged = null;
    }
    this.container = null;
  }
}
