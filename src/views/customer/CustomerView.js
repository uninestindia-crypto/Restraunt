import { getCategories, getItemsByCategory, createOrder, getNextOrderNumber, getSetting, db } from '../../db/database.js';
import { formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers.js';
import { generateUPIQR } from '../../services/upi.js';
import { deductInventoryForOrder } from '../../services/inventoryHook.js';

export class CustomerView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.categories = [];
    this.items = [];
    this.activeCategoryId = null;
    
    // Self-order cart state
    this.cart = [];
    this.tables = [];
    this.detectedTable = null;
    this.orderType = 'takeaway';
    this.selectedTableId = null;
    
    // View state: 'menu' | 'cart' | 'checkout' | 'success'
    this.state = 'menu';
    this.placedOrder = null;
    this.selectedPaymentMethod = 'upi'; // 'upi' | 'cash'
  }

  async mount(container) {
    this.container = container;
    this.state = 'menu';
    this.cart = [];
    this.tables = [];
    this.detectedTable = null;
    this.orderType = 'takeaway';
    this.selectedTableId = null;
    await this.loadData();
    this.render();
    this.bindEvents();
  }

  async loadData() {
    try {
      this.categories = await getCategories();
      if (this.categories.length > 0) {
        this.activeCategoryId = this.categories[0].id;
        await this.loadItems();
      }
      
      // Fetch all tables from DB
      this.tables = (await db.tables.toArray()) || [];

      // Parse hash query parameter for table number
      const hash = window.location.hash || '';
      const queryIndex = hash.indexOf('?');
      if (queryIndex !== -1) {
        const queryString = hash.substring(queryIndex + 1);
        const urlParams = new URLSearchParams(queryString);
        const tableParam = urlParams.get('table');
        if (tableParam) {
          const num = parseInt(tableParam, 10);
          let matchTable = null;
          if (!isNaN(num)) {
            matchTable = await db.tables.where('number').equals(num).first();
          }
          if (!matchTable) {
            matchTable = await db.tables.where('number').equals(tableParam).first();
          }
          if (matchTable) {
            this.detectedTable = matchTable;
            this.orderType = 'dinein';
          }
        }
      }
    } catch (err) {
      console.error('Failed to load self-order data:', err);
    }
  }

  async loadItems() {
    if (!this.activeCategoryId) return;
    this.items = await getItemsByCategory(this.activeCategoryId);
  }

  render() {
    if (this.state === 'menu') {
      this.renderMenu();
    } else if (this.state === 'cart') {
      this.renderCart();
    } else if (this.state === 'checkout') {
      this.renderCheckout();
    } else if (this.state === 'success') {
      this.renderSuccess();
    }
  }

  renderMenu() {
    // Header brand
    let tablePillHtml = '';
    if (this.detectedTable) {
      tablePillHtml = `
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 10px;
          padding: 6px 14px;
          border-radius: var(--radius-full);
          background: rgba(255, 94, 54, 0.15);
          border: 1px solid rgba(255, 94, 54, 0.3);
          backdrop-filter: blur(10px);
          color: #FF8960;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: var(--text-xs);
          font-weight: 700;
          box-shadow: 0 4px 15px rgba(255, 94, 54, 0.1);
        ">
          <span class="material-symbols-rounded" style="font-size: 14px;">restaurant</span>
          Dine-in at Table ${this.detectedTable.number}
        </div>
      `;
    }

    const headerHtml = `
      <div style="background: rgba(9, 9, 14, 0.85); backdrop-filter: blur(20px); padding: 20px 16px 16px; border-bottom: 1px solid var(--border-glass); text-align: center; position: sticky; top: 0; z-index: var(--z-sticky);">
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.8rem; font-weight: 800; letter-spacing: -0.02em; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
          THE TASTE
        </div>
        <div style="font-family: 'Inter', sans-serif; font-size: var(--text-xs); color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 4px;">
          Premium Self-Ordering Kiosk
        </div>
        ${tablePillHtml}
      </div>
    `;

    // Category scroll bar
    const categoryTabsHtml = this.categories.map(cat => {
      const isActive = cat.id === this.activeCategoryId;
      return `
        <button class="category-tab" data-cat-id="${cat.id}" style="
          padding: 8px 18px;
          border-radius: var(--radius-full);
          font-size: var(--text-sm);
          font-weight: 600;
          font-family: 'Plus Jakarta Sans', sans-serif;
          transition: all var(--transition-normal);
          white-space: nowrap;
          border: 1px solid ${isActive ? 'rgba(255, 94, 54, 0.3)' : 'rgba(255,255,255,0.04)'};
          background: ${isActive ? 'var(--gradient-primary)' : 'rgba(255,255,255,0.02)'};
          color: ${isActive ? '#FFFFFF' : 'var(--text-secondary)'};
          box-shadow: ${isActive ? '0 4px 15px rgba(255, 94, 54, 0.25)' : 'none'};
          position: relative;
          cursor: pointer;
        ">
          ${cat.name}
          ${isActive ? `<span style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 12px; height: 3px; background: #FF8960; border-radius: var(--radius-full); box-shadow: 0 0 8px #FF8960;"></span>` : ''}
        </button>
      `;
    }).join('');

    const categoryBarHtml = `
      <div style="padding: 14px 16px; overflow-x: auto; display: flex; gap: 10px; scrollbar-width: none; background: rgba(9, 9, 14, 0.7); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border-glass);" class="scrollbar-none">
        ${categoryTabsHtml}
      </div>
    `;

    // Menu Grid
    const menuItemsHtml = this.items.map(item => {
      const isAdded = this.cart.find(ci => ci.itemId === item.id);
      const count = isAdded ? isAdded.quantity : 0;
      
      const badge = item.isVeg === 1 
        ? `<span class="badge-veg" style="position: absolute; top: 12px; left: 12px; z-index: 2;"></span>`
        : `<span class="badge-nonveg" style="position: absolute; top: 12px; left: 12px; z-index: 2;"></span>`;

      return `
        <div class="menu-item card-glass" style="
          display: flex; 
          flex-direction: column; 
          overflow: hidden; 
          position: relative; 
          border: 1px solid ${count > 0 ? 'rgba(255, 94, 54, 0.4)' : 'var(--border-glass)'};
          background: ${count > 0 ? 'rgba(255, 94, 54, 0.04)' : 'rgba(255, 255, 255, 0.02)'};
          box-shadow: ${count > 0 ? '0 8px 24px rgba(255, 94, 54, 0.15)' : 'none'};
          transition: all var(--transition-normal);
        ">
          ${badge}
          <div class="menu-item-image" style="
            height: 130px; 
            font-size: 2.5rem; 
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 1px solid var(--border-glass);
            position: relative;
          ">
            ${this.getCategoryEmoji(this.activeCategoryId)}
          </div>
          <div style="padding: 14px; display: flex; flex-direction: column; flex: 1;">
            <div class="menu-item-name" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-size: var(--text-sm); 
              font-weight: 600; 
              color: var(--text-primary); 
              margin-bottom: 12px; 
              line-height: 1.4;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              height: 38px;
            ">
              ${item.name}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: auto;">
              <span class="menu-item-price" style="
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-size: var(--text-base); 
                font-weight: 800; 
                color: var(--color-primary);
              ">
                ${formatCurrency(item.price)}
              </span>

              ${count > 0 ? `
                <div class="stepper">
                  <button class="btn-step" data-action="minus" data-id="${item.id}" style="width: 26px; height: 26px; font-size: 0.9rem;">-</button>
                  <div class="stepper-count" style="min-width: 24px; font-size: var(--text-xs);">${count}</div>
                  <button class="btn-step" data-action="plus" data-id="${item.id}" style="width: 26px; height: 26px; font-size: 0.9rem;">+</button>
                </div>
              ` : `
                <button class="btn btn-primary btn-add-self" data-id="${item.id}" style="
                  border-radius: var(--radius-full); 
                  min-height: 32px; 
                  padding: 4px 16px; 
                  font-size: var(--text-xs);
                  font-family: 'Plus Jakarta Sans', sans-serif;
                  font-weight: 700;
                  box-shadow: 0 4px 12px rgba(255, 94, 54, 0.2);
                ">
                  ADD
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const gridHtml = `
      <div style="flex: 1; overflow-y: auto; padding: 0 16px 120px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; margin-top: 16px;">
          ${menuItemsHtml.length > 0 ? menuItemsHtml : `
            <div class="empty-state" style="grid-column: 1 / -1; height: 50vh;">
              <span class="material-symbols-rounded">sentiment_dissatisfied</span>
              <p>No items available in this category</p>
            </div>
          `}
        </div>
      </div>
    `;

    // Float bar cart summary
    const cartCount = this.cart.reduce((sum, ci) => sum + ci.quantity, 0);
    const cartTotal = this.cart.reduce((sum, ci) => sum + (ci.price * ci.quantity), 0);
    const floatBarHtml = cartCount > 0 ? `
      <div style="
        position: fixed; 
        bottom: 24px; 
        left: 50%;
        transform: translateX(-50%);
        width: calc(100% - 32px);
        max-width: 440px;
        background: rgba(255, 94, 54, 0.95);
        backdrop-filter: blur(16px);
        border-radius: var(--radius-xl); 
        padding: 14px 20px; 
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        box-shadow: 0 10px 30px rgba(255, 94, 54, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1); 
        z-index: var(--z-sticky); 
        cursor: pointer; 
        animation: slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1);
        transition: transform 0.2s ease, opacity 0.2s ease;
      " id="btn-view-self-cart">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="
            background: #FFFFFF; 
            width: 26px; 
            height: 26px; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: var(--text-xs); 
            font-weight: 800; 
            color: var(--color-primary);
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
          ">
            ${cartCount}
          </span>
          <span style="color: white; font-weight: 700; font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-sm); letter-spacing: -0.01em;">
            Review Order Cart
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; color: white; font-weight: 800; font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-base);">
          ${formatCurrency(cartTotal)}
          <span class="material-symbols-rounded" style="font-size: 20px;">arrow_forward</span>
        </div>
      </div>
    ` : '';

    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100vh; height: 100dvh; background: var(--bg-primary);">
        ${headerHtml}
        ${categoryBarHtml}
        ${gridHtml}
        ${floatBarHtml}
      </div>
    `;
  }

  renderCart() {
    const itemsHtml = this.cart.map((ci, idx) => `
      <div class="cart-item card-glass" style="
        padding: 16px; 
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--border-glass);
        border-radius: var(--radius-lg); 
        display: flex; 
        flex-direction: column;
        gap: 12px;
        transition: all var(--transition-normal);
      ">
        <div style="display: flex; align-items: flex-start; justify-content: space-between;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px; line-height: 1.4;">
              ${ci.isVeg === 1 ? '<span class="badge-veg"></span>' : '<span class="badge-nonveg"></span>'}
              <span class="truncate">${ci.itemName}</span>
            </div>
            <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px; font-weight: 500;">
              ${formatCurrency(ci.price)} each
            </div>
          </div>
          <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; color: var(--text-primary); font-size: var(--text-sm); margin-left: 12px;">
            ${formatCurrency(ci.price * ci.quantity)}
          </span>
        </div>
        
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <input 
            type="text" 
            placeholder="Special instructions (e.g. less spicy)..." 
            class="input note-input" 
            data-index="${idx}" 
            value="${ci.notes || ''}" 
            style="
              flex: 1;
              font-size: var(--text-xs); 
              padding: 8px 12px; 
              background: rgba(0, 0, 0, 0.2); 
              border: 1px solid var(--border-glass);
              border-radius: var(--radius-md);
              height: 32px;
              min-height: 32px;
              transition: all var(--transition-fast);
            "
          >
          <div class="stepper">
            <button class="btn-step" data-action="minus" data-id="${ci.itemId}">-</button>
            <div class="stepper-count">${ci.quantity}</div>
            <button class="btn-step" data-action="plus" data-id="${ci.itemId}">+</button>
          </div>
        </div>
      </div>
    `).join('<div style="height: 10px;"></div>');

    const total = this.cart.reduce((sum, ci) => sum + (ci.price * ci.quantity), 0);

    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100vh; height: 100dvh; background: var(--bg-primary);">
        <div style="padding: 16px; border-bottom: 1px solid var(--border-glass); display: flex; align-items: center; gap: 12px; background: rgba(9, 9, 14, 0.8); backdrop-filter: blur(20px);">
          <button class="btn-icon btn-secondary" id="btn-back-to-menu" style="border-radius: 50%; border: 1px solid var(--border-glass); background: rgba(255,255,255,0.03);">
             <span class="material-symbols-rounded">arrow_back</span>
          </button>
          <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-lg); font-weight: 700; color: var(--text-primary);">Your Cart</h2>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 20px;" id="self-cart-items-container">
          ${itemsHtml}
        </div>

        <div class="cart-summary" style="padding: 20px 24px; background: rgba(17, 17, 30, 0.95); backdrop-filter: blur(16px); border-top: 1px solid var(--border-glass); box-shadow: 0 -10px 30px rgba(0,0,0,0.3);">
          <div class="cart-summary-row" style="margin-bottom: 12px; display: flex; justify-content: space-between; font-size: var(--text-sm); color: var(--text-secondary); font-weight: 500;">
            <span>Subtotal</span>
            <span>${formatCurrency(total)}</span>
          </div>
          <div class="cart-summary-row summary-total" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.4rem; font-weight: 800; display: flex; justify-content: space-between; color: var(--text-primary); border-top: 1px solid var(--border-glass); padding-top: 12px;">
            <span>Total Amount</span>
            <span style="color: var(--color-primary);">${formatCurrency(total)}</span>
          </div>
          
          <button class="btn btn-primary btn-block btn-lg" id="btn-checkout-self" style="margin-top: 20px; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; box-shadow: var(--shadow-primary);">
            Proceed to Checkout
            <span class="material-symbols-rounded" style="font-size: 20px; margin-left: 6px;">arrow_forward</span>
          </button>
        </div>
      </div>
    `;
  }

  renderCheckout() {
    const total = this.cart.reduce((sum, ci) => sum + (ci.price * ci.quantity), 0);

    let diningTypeHtml = '';
    if (!this.detectedTable) {
      diningTypeHtml = `
        <!-- Order Dining Type -->
        <div class="card card-glass" style="padding: 20px; margin-bottom: 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass);">
          <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-sm); font-weight: 700; margin-bottom: 16px; color: var(--text-primary); letter-spacing: -0.01em;">Order Dining Type</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 0;">
            <button class="dining-type-btn ${this.orderType === 'takeaway' ? 'active' : ''}" id="self-dine-takeaway" style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 16px;
              border-radius: var(--radius-lg);
              border: 1.5px solid ${this.orderType === 'takeaway' ? 'rgba(255, 94, 54, 0.4)' : 'var(--border-glass)'};
              background: ${this.orderType === 'takeaway' ? 'rgba(255, 94, 54, 0.06)' : 'rgba(255, 255, 255, 0.01)'};
              color: ${this.orderType === 'takeaway' ? 'var(--text-primary)' : 'var(--text-secondary)'};
              box-shadow: ${this.orderType === 'takeaway' ? '0 8px 20px rgba(255, 94, 54, 0.15)' : 'none'};
              transition: all var(--transition-normal);
              cursor: pointer;
            }">
              <span class="method-icon" style="font-size: 24px; margin-bottom: 6px;">🛍️</span>
              <span class="method-label" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); font-weight: 600;">Takeaway</span>
            </button>
            <button class="dining-type-btn ${this.orderType === 'dinein' ? 'active' : ''}" id="self-dine-dinein" style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 16px;
              border-radius: var(--radius-lg);
              border: 1.5px solid ${this.orderType === 'dinein' ? 'rgba(255, 94, 54, 0.4)' : 'var(--border-glass)'};
              background: ${this.orderType === 'dinein' ? 'rgba(255, 94, 54, 0.06)' : 'rgba(255, 255, 255, 0.01)'};
              color: ${this.orderType === 'dinein' ? 'var(--text-primary)' : 'var(--text-secondary)'};
              box-shadow: ${this.orderType === 'dinein' ? '0 8px 20px rgba(255, 94, 54, 0.15)' : 'none'};
              transition: all var(--transition-normal);
              cursor: pointer;
            }">
              <span class="method-icon" style="font-size: 24px; margin-bottom: 6px;">🍽️</span>
              <span class="method-label" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); font-weight: 600;">Dine-In</span>
            </button>
          </div>
          
          <div id="self-table-select-container" style="display: ${this.orderType === 'dinein' ? 'block' : 'none'}; margin-top: 16px;">
            <label style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 600; display: block; margin-bottom: 8px;">SELECT TABLE NUMBER</label>
            <select id="self-table-select" class="input" style="
              width: 100%;
              padding: 12px 16px; 
              background: rgba(0, 0, 0, 0.2); 
              border: 1px solid var(--border-glass);
              border-radius: var(--radius-md);
              color: var(--text-primary);
              outline: none;
              transition: all var(--transition-normal);
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 600;
            ">
              <option value="" style="background: #111; color: var(--text-secondary);">-- Select a Table --</option>
              ${this.tables.map(table => `
                <option value="${table.id}" ${parseInt(this.selectedTableId) === parseInt(table.id) ? 'selected' : ''} style="background: #111; color: var(--text-primary);">
                  Table ${table.number} (${table.floorSection || 'Main'})
                </option>
              `).join('')}
            </select>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100vh; height: 100dvh; background: var(--bg-primary);">
        <div style="padding: 16px; border-bottom: 1px solid var(--border-glass); display: flex; align-items: center; gap: 12px; background: rgba(9, 9, 14, 0.8); backdrop-filter: blur(20px);">
          <button class="btn-icon btn-secondary" id="btn-back-to-cart" style="border-radius: 50%; border: 1px solid var(--border-glass); background: rgba(255,255,255,0.03);">
            <span class="material-symbols-rounded">arrow_back</span>
          </button>
          <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-lg); font-weight: 700; color: var(--text-primary);">Checkout</h2>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 20px;">
          <!-- Contact Info -->
          <div class="card card-glass" style="padding: 20px; margin-bottom: 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass);">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-sm); font-weight: 700; margin-bottom: 16px; color: var(--text-primary); letter-spacing: -0.01em;">Contact Details</h3>
            <div class="input-group" style="margin-bottom: 14px;">
              <label style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 600;">YOUR NAME</label>
              <input type="text" id="self-name" class="input" placeholder="Enter your name" style="
                padding: 12px 16px; 
                background: rgba(0, 0, 0, 0.2); 
                border: 1px solid var(--border-glass);
                border-radius: var(--radius-md);
                outline: none;
                transition: all var(--transition-normal);
              ">
            </div>
            <div class="input-group">
              <label style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); font-weight: 600;">PHONE NUMBER (OPTIONAL)</label>
              <input type="tel" id="self-phone" class="input" placeholder="For status updates" style="
                padding: 12px 16px; 
                background: rgba(0, 0, 0, 0.2); 
                border: 1px solid var(--border-glass);
                border-radius: var(--radius-md);
                outline: none;
                transition: all var(--transition-normal);
              ">
            </div>
          </div>

          <!-- Dining Type -->
          ${diningTypeHtml}

          <!-- Payment Options -->
          <div class="card card-glass" style="padding: 20px; margin-bottom: 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass);">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-sm); font-weight: 700; margin-bottom: 16px; color: var(--text-primary); letter-spacing: -0.01em;">Select Payment Mode</h3>
            <div class="payment-methods" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 0;">
              <button class="payment-method-btn ${this.selectedPaymentMethod === 'upi' ? 'active' : ''}" id="self-pay-upi" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 16px;
                border-radius: var(--radius-lg);
                border: 1.5px solid ${this.selectedPaymentMethod === 'upi' ? 'rgba(255, 94, 54, 0.4)' : 'var(--border-glass)'};
                background: ${this.selectedPaymentMethod === 'upi' ? 'rgba(255, 94, 54, 0.06)' : 'rgba(255, 255, 255, 0.01)'};
                color: ${this.selectedPaymentMethod === 'upi' ? 'var(--text-primary)' : 'var(--text-secondary)'};
                box-shadow: ${this.selectedPaymentMethod === 'upi' ? '0 8px 20px rgba(255, 94, 54, 0.15)' : 'none'};
                transition: all var(--transition-normal);
                cursor: pointer;
              ">
                <span class="method-icon" style="font-size: 24px; margin-bottom: 6px;">📱</span>
                <span class="method-label" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); font-weight: 600;">Pay with UPI QR</span>
              </button>
              <button class="payment-method-btn ${this.selectedPaymentMethod === 'cash' ? 'active' : ''}" id="self-pay-cash" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 16px;
                border-radius: var(--radius-lg);
                border: 1.5px solid ${this.selectedPaymentMethod === 'cash' ? 'rgba(255, 94, 54, 0.4)' : 'var(--border-glass)'};
                background: ${this.selectedPaymentMethod === 'cash' ? 'rgba(255, 94, 54, 0.06)' : 'rgba(255, 255, 255, 0.01)'};
                color: ${this.selectedPaymentMethod === 'cash' ? 'var(--text-primary)' : 'var(--text-secondary)'};
                box-shadow: ${this.selectedPaymentMethod === 'cash' ? '0 8px 20px rgba(255, 94, 54, 0.15)' : 'none'};
                transition: all var(--transition-normal);
                cursor: pointer;
              ">
                <span class="method-icon" style="font-size: 24px; margin-bottom: 6px;">💵</span>
                <span class="method-label" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); font-weight: 600;">Pay at Counter (Cash/Card/UPI)</span>
              </button>
            </div>
          </div>

          <!-- Summary card -->
          <div class="card card-glass" style="padding: 20px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass);">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); font-weight: 700; margin-bottom: 8px; color: var(--text-secondary); letter-spacing: 0.05em; text-transform: uppercase;">Total Payable</h3>
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 2.2rem; font-weight: 800; color: var(--color-primary); line-height: 1.1;">
              ${formatCurrency(total)}
            </div>
            <div id="self-order-type-summary" style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 8px; font-weight: 500;">
              ${this.orderType === 'dinein'
                ? `Dine-In Order ${this.detectedTable ? `(Table ${this.detectedTable.number})` : (this.selectedTableId ? `(Table ${this.tables.find(t => t.id === parseInt(this.selectedTableId))?.number || ''})` : '')}`
                : 'Counter Takeaway Pickup Order'}
            </div>
          </div>
        </div>

        <div style="padding: 20px; background: rgba(17, 17, 30, 0.95); backdrop-filter: blur(16px); border-top: 1px solid var(--border-glass);">
          <button class="btn btn-primary btn-block btn-lg" id="btn-submit-self-order" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; box-shadow: var(--shadow-primary);">
            <span class="material-symbols-rounded">send_and_archive</span>
            Place Order & Pay
          </button>
        </div>
      </div>
    `;

    // Setup input listeners to retain value
    setTimeout(() => {
      const nameInp = document.getElementById('self-name');
      const phoneInp = document.getElementById('self-phone');
      if (nameInp) nameInp.value = this.customerName || '';
      if (phoneInp) phoneInp.value = this.customerPhone || '';
    }, 20);
  }

  renderSuccess() {
    const total = this.placedOrder.total;
    const orderNumberShort = this.placedOrder.orderNumber.split('-').pop();

    let paymentStatusSection = '';
    if (this.placedOrder.paymentMethod === 'upi') {
      paymentStatusSection = `
        <div class="qr-display" style="
          margin: 24px 0; 
          background: rgba(255, 255, 255, 0.01); 
          backdrop-filter: blur(16px);
          border-radius: var(--radius-xl); 
          padding: 24px; 
          text-align: center;
          border: 1px solid var(--border-glass);
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
        ">
          <div style="
            background: #FFFFFF; 
            padding: 16px; 
            border-radius: var(--radius-lg); 
            display: inline-block; 
            box-shadow: 0 0 25px rgba(255, 255, 255, 0.1);
            margin-bottom: 16px;
          ">
            <canvas id="self-success-qr-canvas" style="display: block;"></canvas>
          </div>
          <div class="qr-amount" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.8rem; font-weight: 800; color: var(--color-primary); margin-bottom: 4px;">
            ${formatCurrency(total)}
          </div>
          <div class="qr-upi-id" id="self-upi-id-success" style="
            font-size: var(--text-xs); 
            color: var(--text-secondary); 
            font-weight: 600; 
            background: rgba(255, 255, 255, 0.05); 
            padding: 4px 12px; 
            border-radius: var(--radius-full);
            margin-bottom: 12px;
          ">Loading UPI ID...</div>
          <div class="qr-instruction" style="font-size: var(--text-xs); color: var(--text-muted); line-height: 1.5; font-weight: 500; max-width: 280px;">
            Scan this QR code to pay instantly. Please show the payment confirmation receipt at the counter.
          </div>
        </div>
      `;
    } else {
      paymentStatusSection = `
        <div style="
          margin: 24px 0; 
          background: rgba(245, 158, 11, 0.02); 
          border: 1px solid rgba(245, 158, 11, 0.2); 
          border-radius: var(--radius-xl); 
          padding: 24px; 
          text-align: center;
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        ">
          <span class="material-symbols-rounded" style="color: var(--color-warning); font-size: 44px; margin-bottom: 10px; filter: drop-shadow(0 0 8px rgba(245,158,11,0.3));">payments</span>
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; color: var(--text-primary); font-weight: 700; font-size: var(--text-sm); letter-spacing: -0.01em;">Pay at Counter</div>
          <div style="color: var(--text-secondary); font-size: var(--text-xs); margin-top: 8px; line-height: 1.5; font-weight: 500; max-width: 280px; margin-left: auto; margin-right: auto;">
            Proceed to the cash counter, share your Token <strong>#${orderNumberShort}</strong>, pay, and collect your receipt.
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100vh; height: 100dvh; background: var(--bg-primary);">
        <div style="flex: 1; overflow-y: auto; padding: 40px 24px; display: flex; flex-direction: column; align-items: center; text-align: center;">
          
          <div class="animate-bounce" style="
            background: rgba(16, 185, 129, 0.08); 
            width: 72px; 
            height: 72px; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            margin-bottom: 24px;
            border: 1.5px solid rgba(16, 185, 129, 0.2);
            box-shadow: 0 0 30px rgba(16, 185, 129, 0.25);
          ">
            <span class="material-symbols-rounded" style="color: var(--color-success); font-size: 40px;">check_circle</span>
          </div>

          <h1 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary); margin-bottom: 8px; letter-spacing: -0.02em;">Order Confirmed!</h1>
          <p style="color: var(--text-secondary); font-size: var(--text-sm); max-width: 280px; line-height: 1.5; font-weight: 500;">
            Your order has been sent to the kitchen. View your token number below.
          </p>

          <!-- Large Token Display -->
          <div style="
            background: rgba(255, 255, 255, 0.02); 
            border-radius: var(--radius-xl); 
            padding: 24px 48px; 
            border: 1px solid var(--border-glass); 
            margin-top: 28px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            backdrop-filter: blur(10px);
          ">
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700;">
               YOUR TOKEN NUMBER
            </div>
            <div class="animate-pulse" style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 3.5rem; font-weight: 800; color: var(--color-primary); margin-top: 4px; line-height: 1; letter-spacing: -0.03em; filter: drop-shadow(0 0 12px rgba(255, 94, 54, 0.3));">
              ${orderNumberShort}
            </div>
          </div>

          ${paymentStatusSection}

          <!-- Back Button -->
          <button class="btn btn-secondary btn-block btn-lg" id="btn-self-order-again" style="
            margin-top: 24px; 
            min-height: 48px; 
            font-family: 'Plus Jakarta Sans', sans-serif; 
            font-weight: 700;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          ">
            Order Something Else
            <span class="material-symbols-rounded" style="font-size: 18px; margin-left: 6px;">restart_alt</span>
          </button>

        </div>
      </div>
    `;

    // Render success QR if UPI
    if (this.placedOrder.paymentMethod === 'upi') {
      setTimeout(async () => {
        const canvas = document.getElementById('self-success-qr-canvas');
        const upiIdDisplay = document.getElementById('self-upi-id-success');
        if (canvas) {
          try {
            const upiId = await getSetting('upiId') || 'thetaste@upi';
            if (upiIdDisplay) upiIdDisplay.textContent = upiId;
            
            // Build the QR code
            await generateUPIQR(canvas, {
              amount: total,
              orderId: this.placedOrder.orderNumber
            });
          } catch (e) {
            console.error('Failed to generate success QR:', e);
          }
        }
      }, 50);
    }
  }

  bindEvents() {
    if (this.state === 'menu') {
      // Category switching
      this.container.querySelectorAll('.category-tab').forEach(btn => {
        btn.addEventListener('click', async () => {
          this.activeCategoryId = parseInt(btn.dataset.catId);
          playSound(700, 80);
          await this.loadItems();
          this.render();
          this.bindEvents();
        });
      });

      // Add button click
      this.container.querySelectorAll('.btn-add-self').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = parseInt(btn.dataset.id);
          const item = this.items.find(i => i.id === itemId);
          if (item) {
            this.addToCart(item);
          }
        });
      });

      // Stepper adjustments
      this.container.querySelectorAll('.btn-step').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = parseInt(btn.dataset.id);
          const action = btn.dataset.action;
          const delta = action === 'plus' ? 1 : -1;
          this.adjustCart(itemId, delta);
        });
      });

      // Floating view cart button
      const btnViewCart = document.getElementById('btn-view-self-cart');
      if (btnViewCart) {
        btnViewCart.addEventListener('click', () => {
          playSound(800, 100);
          this.state = 'cart';
          this.render();
          this.bindEvents();
        });
      }
    }

    if (this.state === 'cart') {
      // Back button
      document.getElementById('btn-back-to-menu').addEventListener('click', () => {
        playSound(700, 80);
        this.state = 'menu';
        this.render();
        this.bindEvents();
      });

      // Stepper adjustments
      this.container.querySelectorAll('.btn-step').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = parseInt(btn.dataset.id);
          const action = btn.dataset.action;
          const delta = action === 'plus' ? 1 : -1;
          this.adjustCart(itemId, delta);
          this.render();
          this.bindEvents();
        });
      });

      // Notes inputs
      this.container.querySelectorAll('.note-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(inp.dataset.index);
          this.cart[idx].notes = e.target.value;
        });
      });

      // Checkout button
      document.getElementById('btn-checkout-self').addEventListener('click', () => {
        playSound(800, 100);
        this.state = 'checkout';
        this.render();
        this.bindEvents();
      });
    }

    if (this.state === 'checkout') {
      // Back button
      document.getElementById('btn-back-to-cart').addEventListener('click', () => {
        playSound(700, 80);
        this.state = 'cart';
        this.render();
        this.bindEvents();
      });

      // Payment options tabs
      const payUpi = document.getElementById('self-pay-upi');
      const payCash = document.getElementById('self-pay-cash');
      
      if (payUpi && payCash) {
        payUpi.addEventListener('click', () => {
          playSound(700, 80);
          this.selectedPaymentMethod = 'upi';
          payUpi.classList.add('active');
          payCash.classList.remove('active');

          payUpi.style.border = '1.5px solid rgba(255, 94, 54, 0.4)';
          payUpi.style.background = 'rgba(255, 94, 54, 0.06)';
          payUpi.style.color = 'var(--text-primary)';
          payUpi.style.boxShadow = '0 8px 20px rgba(255, 94, 54, 0.15)';

          payCash.style.border = 'var(--border-glass)';
          payCash.style.background = 'rgba(255, 255, 255, 0.01)';
          payCash.style.color = 'var(--text-secondary)';
          payCash.style.boxShadow = 'none';
        });
        
        payCash.addEventListener('click', () => {
          playSound(700, 80);
          this.selectedPaymentMethod = 'cash';
          payCash.classList.add('active');
          payUpi.classList.remove('active');

          payCash.style.border = '1.5px solid rgba(255, 94, 54, 0.4)';
          payCash.style.background = 'rgba(255, 94, 54, 0.06)';
          payCash.style.color = 'var(--text-primary)';
          payCash.style.boxShadow = '0 8px 20px rgba(255, 94, 54, 0.15)';

          payUpi.style.border = 'var(--border-glass)';
          payUpi.style.background = 'rgba(255, 255, 255, 0.01)';
          payUpi.style.color = 'var(--text-secondary)';
          payUpi.style.boxShadow = 'none';
        });
      }

      // Dining type options if not detected
      const btnTakeaway = document.getElementById('self-dine-takeaway');
      const btnDinein = document.getElementById('self-dine-dinein');
      const tableSelectContainer = document.getElementById('self-table-select-container');
      const tableSelect = document.getElementById('self-table-select');
      
      if (btnTakeaway && btnDinein) {
        btnTakeaway.addEventListener('click', () => {
          playSound(700, 80);
          this.orderType = 'takeaway';
          btnTakeaway.classList.add('active');
          btnDinein.classList.remove('active');
          if (tableSelectContainer) tableSelectContainer.style.display = 'none';
          
          btnTakeaway.style.border = '1.5px solid rgba(255, 94, 54, 0.4)';
          btnTakeaway.style.background = 'rgba(255, 94, 54, 0.06)';
          btnTakeaway.style.color = 'var(--text-primary)';
          btnTakeaway.style.boxShadow = '0 8px 20px rgba(255, 94, 54, 0.15)';
          
          btnDinein.style.border = 'var(--border-glass)';
          btnDinein.style.background = 'rgba(255, 255, 255, 0.01)';
          btnDinein.style.color = 'var(--text-secondary)';
          btnDinein.style.boxShadow = 'none';

          const summaryEl = document.getElementById('self-order-type-summary');
          if (summaryEl) {
            summaryEl.textContent = 'Counter Takeaway Pickup Order';
          }
        });
        
        btnDinein.addEventListener('click', () => {
          playSound(700, 80);
          this.orderType = 'dinein';
          btnDinein.classList.add('active');
          btnTakeaway.classList.remove('active');
          if (tableSelectContainer) tableSelectContainer.style.display = 'block';
          
          btnDinein.style.border = '1.5px solid rgba(255, 94, 54, 0.4)';
          btnDinein.style.background = 'rgba(255, 94, 54, 0.06)';
          btnDinein.style.color = 'var(--text-primary)';
          btnDinein.style.boxShadow = '0 8px 20px rgba(255, 94, 54, 0.15)';
          
          btnTakeaway.style.border = 'var(--border-glass)';
          btnTakeaway.style.background = 'rgba(255, 255, 255, 0.01)';
          btnTakeaway.style.color = 'var(--text-secondary)';
          btnTakeaway.style.boxShadow = 'none';

          const summaryEl = document.getElementById('self-order-type-summary');
          if (summaryEl) {
            const tableText = this.selectedTableId ? `(Table ${this.tables.find(t => t.id === parseInt(this.selectedTableId))?.number || ''})` : '';
            summaryEl.textContent = `Dine-In Order ${tableText}`;
          }
        });
      }

      if (tableSelect) {
        tableSelect.addEventListener('change', (e) => {
          this.selectedTableId = e.target.value;
          const summaryEl = document.getElementById('self-order-type-summary');
          if (summaryEl && this.orderType === 'dinein') {
            const tableText = this.selectedTableId ? `(Table ${this.tables.find(t => t.id === parseInt(this.selectedTableId))?.number || ''})` : '';
            summaryEl.textContent = `Dine-In Order ${tableText}`;
          }
        });
      }

      // Input listeners to sync state
      const nameInput = document.getElementById('self-name');
      const phoneInput = document.getElementById('self-phone');
      if (nameInput) {
        nameInput.addEventListener('input', () => {
          this.customerName = nameInput.value.trim();
        });
      }
      if (phoneInput) {
        phoneInput.addEventListener('input', () => {
          this.customerPhone = phoneInput.value.trim();
        });
      }

      // Order submit
      document.getElementById('btn-submit-self-order').addEventListener('click', async () => {
        if (!this.customerName) {
          showToast('Please enter your name', 'warning');
          return;
        }

        if (this.orderType === 'dinein' && !this.detectedTable && !this.selectedTableId) {
          showToast('Please select your table number', 'warning');
          return;
        }

        await this.placeOrder();
      });
    }

    if (this.state === 'success') {
      // Order again
      document.getElementById('btn-self-order-again').addEventListener('click', () => {
        playSound(800, 100);
        this.cart = [];
        this.placedOrder = null;
        this.state = 'menu';
        this.render();
        this.bindEvents();
      });
    }
  }

  addToCart(item) {
    const existingIndex = this.cart.findIndex(ci => ci.itemId === item.id);
    if (existingIndex >= 0) {
      this.cart[existingIndex].quantity += 1;
    } else {
      this.cart.push({
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        quantity: 1,
        isVeg: item.isVeg,
        notes: ''
      });
    }

    playSound(600, 80);
    vibrateDevice([30]);
    this.render();
    this.bindEvents();
  }

  adjustCart(itemId, delta) {
    const idx = this.cart.findIndex(ci => ci.itemId === itemId);
    if (idx >= 0) {
      this.cart[idx].quantity += delta;
      if (this.cart[idx].quantity <= 0) {
        this.cart.splice(idx, 1);
      }
    } else if (delta > 0) {
      // Re-add to cart
      const item = this.items.find(i => i.id === itemId);
      if (item) this.addToCart(item);
      return;
    }

    playSound(600, 80);
    vibrateDevice([30]);
    
    // Only render menu if in menu state
    if (this.state === 'menu') {
      this.render();
      this.bindEvents();
    }
  }

  async placeOrder() {
    try {
      const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const gstPercent = parseFloat(await getSetting('gstPercent') || '5');
      const tax = subtotal * (gstPercent / 100);
      const total = subtotal + tax;
      const orderNumber = await getNextOrderNumber();

      const type = this.detectedTable ? 'dinein' : (this.orderType || 'takeaway');
      const tableId = this.detectedTable ? this.detectedTable.id : (type === 'dinein' && this.selectedTableId ? parseInt(this.selectedTableId) : null);

      const orderData = {
        orderNumber,
        type,
        status: 'confirmed', // goes straight to cooking queues
        items: JSON.stringify(this.cart),
        subtotal,
        tax,
        taxPercent: gstPercent,
        total,
        paymentMethod: this.selectedPaymentMethod,
        paymentStatus: this.selectedPaymentMethod === 'upi' ? 'pending' : 'unpaid',
        customerName: this.customerName,
        customerPhone: this.customerPhone,
        createdAt: new Date().toISOString()
      };
      if (tableId) {
        orderData.tableId = tableId;
      }

      const order = await createOrder(orderData);
      this.placedOrder = order;

      // Update table status to occupied if dine-in
      if (tableId && type === 'dinein') {
        try {
          await db.tables.update(tableId, { status: 'occupied' });
        } catch (e) {
          console.error('Failed to update table status to occupied:', e);
        }
      }

      // --- Integration Hooks ---

      // 1. Deduct inventory
      try {
        const items = typeof orderData.items === 'string' ? JSON.parse(orderData.items) : orderData.items;
        const results = await deductInventoryForOrder(items);
        const lowItems = results.filter(r => r.belowThreshold);
        if (lowItems.length > 0) {
          showToast(`⚠️ Low stock: ${lowItems.map(i => i.itemName).join(', ')}`, 'warning', 5000);
        }
      } catch (e) { console.error('Inventory deduction failed:', e); }

      // 2. Update customer loyalty
      try {
        if (orderData.customerPhone) {
          const existing = await db.customers.where('phone').equals(orderData.customerPhone).first();
          if (existing) {
            const points = Math.floor(orderData.total / 10);
            const newSpent = (existing.totalSpent || 0) + orderData.total;
            const newVisits = (existing.visitCount || 0) + 1;
            const newPoints = (existing.loyaltyPoints || 0) + points;
            let tier = 'bronze';
            if (newSpent >= 5000) tier = 'platinum';
            else if (newSpent >= 2000) tier = 'gold';
            else if (newSpent >= 500) tier = 'silver';
            await db.customers.update(existing.id, {
              totalSpent: newSpent, visitCount: newVisits,
              loyaltyPoints: newPoints, tier, lastVisit: new Date().toISOString()
            });
          } else {
            const points = Math.floor(orderData.total / 10);
            let tier = 'bronze';
            if (orderData.total >= 5000) tier = 'platinum';
            else if (orderData.total >= 2000) tier = 'gold';
            else if (orderData.total >= 500) tier = 'silver';
            await db.customers.add({
              phone: orderData.customerPhone,
              name: orderData.customerName || 'Self Kiosk Customer',
              totalSpent: orderData.total,
              visitCount: 1,
              loyaltyPoints: points,
              tier,
              lastVisit: new Date().toISOString(),
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (e) { console.error('Loyalty update failed:', e); }

      // Transition state
      playSound(800, 100);
      setTimeout(() => playSound(1200, 150), 100);
      vibrateDevice([50, 30, 50]);

      this.state = 'success';
      this.render();
      this.bindEvents();
    } catch (e) {
      console.error('Failed to submit self-order:', e);
      showToast('Order placement failed: ' + e.message, 'error');
    }
  }

  getCategoryEmoji(catId) {
    const mapping = {
      1: '🥟', // Momos
      2: '🥢', // Starters
      3: '🍜', // Noodles
      4: '🍚', // Rice
      5: '🍛', // Main Course
      6: '🍔', // Burgers
      7: '🍟', // Sides
      8: '🥤', // Beverages
      9: '🍨'  // Desserts
    };
    return mapping[catId] || '🍔';
  }

  unmount() {
    this.container = null;
  }
}
