// @ts-nocheck
/**
 * CartPanel — Order cart sidebar with items, totals, and actions
 */

import { formatCurrencyShort, formatCurrency } from '../../utils/helpers';
import { getSetting } from '../../db/database';

export class CartPanel {
  constructor({ container, cart, orderType, onUpdateQuantity, onRemoveItem, onClearCart, onPlaceOrder, onOrderTypeChange }) {
    this.container = container;
    this.cart = cart || [];
    this.orderType = orderType || 'takeaway';
    this.onUpdateQuantity = onUpdateQuantity;
    this.onRemoveItem = onRemoveItem;
    this.onClearCart = onClearCart;
    this.onPlaceOrder = onPlaceOrder;
    this.onOrderTypeChange = onOrderTypeChange;
    this.gstPercent = 5;
    this.taxLabel = 'GST';

    this.loadSettings();
  }

  async loadSettings() {
    const gst = await getSetting('gstPercent');
    if (gst) this.gstPercent = parseFloat(gst);
    const label = await getSetting('taxLabel');
    if (label) this.taxLabel = label.value || label;
    this.renderCartContent();
  }

  updateCart(cart) {
    this.cart = cart;
    this.renderCartContent();
  }

  render() {
    this.container.innerHTML = `
      <!-- Cart Header -->
      <div class="cart-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h2>
          <span class="material-symbols-rounded" style="font-size: 22px;">shopping_cart</span>
          Current Order
          <span class="cart-count" id="cart-count" style="${this.cart.length === 0 ? 'display:none' : ''}">${this.getTotalItemCount()}</span>
        </h2>
        <button class="btn btn-secondary btn-sm cart-mobile-back" id="cart-mobile-back" style="display: none; padding: 6px 12px; font-size: var(--text-xs); align-items: center; gap: 4px;">
          <span class="material-symbols-rounded" style="font-size: 16px;">arrow_back</span>
          Menu
        </button>
      </div>

      <!-- Order Type Selector -->
      <div class="cart-order-type">
        <div class="order-type-selector" id="order-type-selector">
          <button class="order-type-btn ${this.orderType === 'takeaway' ? 'active' : ''}" data-type="takeaway">
            <span class="material-symbols-rounded" style="font-size: 16px;">shopping_bag</span>
            Takeaway
          </button>
          <button class="order-type-btn ${this.orderType === 'dinein' ? 'active' : ''}" data-type="dinein">
            <span class="material-symbols-rounded" style="font-size: 16px;">restaurant</span>
            Dine In
          </button>
          <button class="order-type-btn ${this.orderType === 'delivery' ? 'active' : ''}" data-type="delivery">
            <span class="material-symbols-rounded" style="font-size: 16px;">delivery_dining</span>
            Delivery
          </button>
        </div>
      </div>

      <!-- Customer & Table Selectors -->
      <div class="cart-meta-selectors">
        <input type="text" id="cart-customer-phone" placeholder="📱 Customer phone" class="input cart-meta-input">
        <select id="cart-table-select" class="input cart-meta-input" style="display:${this.orderType === 'dinein' ? 'block' : 'none'}; max-width: 100px;">
          <option value="">🪑 Table</option>
        </select>
      </div>

      <!-- Cart Items / Empty State -->
      <div id="cart-items-container">
        ${this.renderCartItems()}
      </div>

      <!-- Summary + Actions -->
      <div id="cart-bottom-container">
        ${this.renderCartBottom()}
      </div>
    `;

    this.bindEvents();
  }

  renderCartContent() {
    const itemsContainer = document.getElementById('cart-items-container');
    const bottomContainer = document.getElementById('cart-bottom-container');
    const cartCount = document.getElementById('cart-count');

    if (itemsContainer) itemsContainer.innerHTML = this.renderCartItems();
    if (bottomContainer) bottomContainer.innerHTML = this.renderCartBottom();
    if (cartCount) {
      const count = this.getTotalItemCount();
      cartCount.textContent = count;
      cartCount.style.display = count > 0 ? '' : 'none';
    }

    this.bindCartItemEvents();
  }

  renderCartItems() {
    if (this.cart.length === 0) {
      return `
        <div class="cart-empty">
          <span class="material-symbols-rounded">receipt_long</span>
          <p>Tap menu items to add them to the order</p>
        </div>
      `;
    }

    return `
      <div class="cart-items">
        ${this.cart.map((item, index) => `
          <div class="cart-item" data-index="${index}">
            <div class="cart-item-details">
              <div class="cart-item-name">
                ${item.isVeg ? '<span class="badge-veg" style="transform: scale(0.8);"></span>' : '<span class="badge-nonveg" style="transform: scale(0.8);"></span>'}
                ${item.itemName}
              </div>
              <div class="cart-item-price">${formatCurrencyShort(item.price)} each</div>
              ${item.notes ? `<div class="cart-item-notes">${item.notes}</div>` : ''}
            </div>
            <div class="cart-item-actions">
              <div class="stepper">
                <button class="stepper-minus" data-index="${index}" aria-label="Decrease quantity">
                  <span class="material-symbols-rounded" style="font-size: 18px;">remove</span>
                </button>
                <span class="stepper-count">${item.quantity}</span>
                <button class="stepper-plus" data-index="${index}" aria-label="Increase quantity">
                  <span class="material-symbols-rounded" style="font-size: 18px;">add</span>
                </button>
              </div>
            </div>
            <div class="cart-item-total">${formatCurrencyShort(item.price * item.quantity)}</div>
            <button class="cart-item-delete" data-index="${index}" aria-label="Remove item">
              <span class="material-symbols-rounded" style="font-size: 18px;">close</span>
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderCartBottom() {
    if (this.cart.length === 0) return '';

    const subtotal = this.getSubtotal();
    const tax = subtotal * (this.gstPercent / 100);
    const total = subtotal + tax;

    return `
      <div class="cart-summary">
        <div class="cart-summary-row">
          <span>Subtotal (${this.getTotalItemCount()} items)</span>
          <span>${formatCurrency(subtotal)}</span>
        </div>
        <div class="cart-summary-row">
          <span>${this.taxLabel} (${this.gstPercent}%)</span>
          <span>${formatCurrency(tax)}</span>
        </div>
        <div class="cart-summary-row summary-total">
          <span>Total</span>
          <span>${formatCurrency(total)}</span>
        </div>
      </div>
      <div class="cart-actions">
        <button class="btn btn-primary btn-block btn-lg" id="btn-place-order">
          <span class="material-symbols-rounded">payments</span>
          Pay ${formatCurrencyShort(total)}
        </button>
        <button class="btn btn-ghost btn-block btn-sm" id="btn-clear-cart">
          <span class="material-symbols-rounded" style="font-size: 18px;">delete_sweep</span>
          Clear Order
        </button>
      </div>
    `;
  }

  // --- Calculations ---

  getSubtotal() {
    return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getTotalItemCount() {
    return this.cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  // --- Event Binding ---

  bindEvents() {
    // Mobile back button
    const backBtn = document.getElementById('cart-mobile-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const layout = document.querySelector('.pos-layout');
        if (layout) {
          layout.classList.remove('show-cart');
        }
      });
    }

    // Order type selector
    const typeSelector = document.getElementById('order-type-selector');
    if (typeSelector) {
      typeSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.order-type-btn');
        if (!btn) return;

        const type = btn.dataset.type;
        this.orderType = type;

        // Update active state
        typeSelector.querySelectorAll('.order-type-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.type === type);
        });

        if (this.onOrderTypeChange) this.onOrderTypeChange(type);
      });
    }

    this.bindCartItemEvents();
  }

  bindCartItemEvents() {
    const container = document.getElementById('cart-items-container');
    if (!container) return;

    // Remove old listeners by cloning (simpler than tracking)
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
    newContainer.id = 'cart-items-container';

    // Quantity steppers
    newContainer.addEventListener('click', (e) => {
      const minusBtn = e.target.closest('.stepper-minus');
      const plusBtn = e.target.closest('.stepper-plus');
      const deleteBtn = e.target.closest('.cart-item-delete');

      if (minusBtn) {
        const index = parseInt(minusBtn.dataset.index, 10);
        if (this.onUpdateQuantity) this.onUpdateQuantity(index, -1);
      } else if (plusBtn) {
        const index = parseInt(plusBtn.dataset.index, 10);
        if (this.onUpdateQuantity) this.onUpdateQuantity(index, 1);
      } else if (deleteBtn) {
        const index = parseInt(deleteBtn.dataset.index, 10);
        if (this.onRemoveItem) this.onRemoveItem(index);
      }
    });

    // Place order and clear cart buttons
    const bottomContainer = document.getElementById('cart-bottom-container');
    if (bottomContainer) {
      const newBottom = bottomContainer.cloneNode(true);
      bottomContainer.parentNode.replaceChild(newBottom, bottomContainer);
      newBottom.id = 'cart-bottom-container';

      const placeOrderBtn = newBottom.querySelector('#btn-place-order');
      const clearCartBtn = newBottom.querySelector('#btn-clear-cart');

      if (placeOrderBtn) {
        placeOrderBtn.addEventListener('click', () => {
          if (this.onPlaceOrder) this.onPlaceOrder();
        });
      }

      if (clearCartBtn) {
        clearCartBtn.addEventListener('click', () => {
          if (this.onClearCart) this.onClearCart();
        });
      }
    }
  }
}
