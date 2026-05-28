/**
 * ExpressView — Combined POS + Kitchen operations panel
 * Designed for maximum speed and ease of use for all staff members.
 */

import { db, createOrder, getOrders, updateOrderStatus, getNextOrderNumber, getSetting, getCategories, getAllItems } from '../../db/database.js';
import { printerService } from '../../services/printer.js';
import { ReceiptBuilder } from '../../services/receipt.js';
import { authService } from '../../services/auth.js';
import { deductInventoryForOrder } from '../../services/inventoryHook.js';
import { tableService } from '../../services/tables.js';
import { logOrderPlaced, logActivity } from '../../utils/activityLogger.js';
import { showToast, formatCurrencyShort, formatCurrency, playSound, vibrateDevice, escapeHtml, formatTime, parseOrderItems } from '../../utils/helpers.js';
import { CheckoutSuccessModal } from '../pos/CheckoutSuccessModal.js';
import { generateUPIQR } from '../../services/upi.js';

export class ExpressView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.categories = [];
    this.items = [];
    this.filteredItems = [];
    this.selectedCategory = null;
    
    // POS Cart State
    this.cart = [];
    this.orderType = 'takeaway'; // takeaway | dinein | delivery
    this.customerPhone = '';
    this.selectedTableId = null;
    this.tables = [];

    // KDS State
    this.activeOrders = [];
    this.kdsFilter = 'all'; // all | new | preparing | ready
    this.refreshInterval = null;

    // Layout Mode (for smaller devices)
    // 'split' on desktop, 'pos' or 'kitchen' on mobile
    this.activeTab = 'pos';
  }

  async mount(container) {
    this.container = container;
    
    // Load static data from Dexie
    this.categories = await getCategories();
    this.items = await getAllItems();
    await this.loadTables();

    if (this.categories.length > 0) {
      this.selectedCategory = this.categories[0].id;
    }
    this.filterMenuItems();

    // Initial render
    this.render();
    this.bindEvents();
    
    // Load kitchen orders
    await this.loadKitchenOrders();

    // Start auto-refresh for KDS columns every 5 seconds
    this.refreshInterval = setInterval(() => this.loadKitchenOrders(), 5000);
  }

  async loadTables() {
    try {
      const allTables = await tableService.getAllTables();
      this.tables = allTables.filter(t => t.status === 'available');
    } catch (e) {
      console.error('[ExpressView] Failed to load tables:', e);
    }
  }

  async loadKitchenOrders() {
    try {
      const allOrders = await getOrders();
      
      // Filter out completed ones, keep only confirmed, preparing, and ready
      const nextActiveOrders = allOrders.filter(o => 
        o.status === 'confirmed' || o.status === 'preparing' || o.status === 'ready'
      );

      // Play alert if new order arrives
      const previousConfirmedCount = this.activeOrders.filter(o => o.status === 'confirmed').length;
      const currentConfirmedCount = nextActiveOrders.filter(o => o.status === 'confirmed').length;

      if (currentConfirmedCount > previousConfirmedCount) {
        playSound(440, 150, 'sawtooth');
        setTimeout(() => playSound(554, 150, 'sawtooth'), 150);
        setTimeout(() => playSound(659, 250, 'sawtooth'), 300);
        vibrateDevice([100, 50, 100]);
        showToast('New Order Received in Kitchen!', 'warning');
      }

      this.activeOrders = nextActiveOrders;
      this.renderKdsList();
    } catch (error) {
      console.error('[ExpressView] KDS load failed:', error);
    }
  }

  filterMenuItems(query = '') {
    const cleanQuery = query.toLowerCase().trim();
    if (cleanQuery) {
      this.filteredItems = this.items.filter(item => 
        item.name.toLowerCase().includes(cleanQuery)
      );
    } else if (this.selectedCategory) {
      this.filteredItems = this.items.filter(item => 
        item.categoryId === this.selectedCategory
      );
    } else {
      this.filteredItems = this.items;
    }
  }

  getCategoryIcon(categoryId) {
    const cat = this.categories.find(c => c.id === categoryId);
    return cat ? cat.icon : '🍽️';
  }

  render() {
    const gstPercent = parseFloat(localStorage.getItem('app_gst_percent') || '5');
    const currencySymbol = localStorage.getItem('app_currency_symbol') || '₹';

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal * (1 + gstPercent / 100);
    const totalItems = this.cart.reduce((s, i) => s + i.quantity, 0);

    const mobileCartHtml = this.cart.length > 0 ? `
      <div class="express-mobile-cart-bar" id="express-mobile-cart-bar">
        <div class="mobile-cart-info">
          <span class="mobile-cart-badge">${totalItems}</span>
          <span>View Order</span>
        </div>
        <div class="mobile-cart-action">
          <span>${formatCurrency(total)}</span>
          <span class="material-symbols-rounded" style="font-size: 16px;">arrow_forward_ios</span>
        </div>
      </div>
    ` : '';

    this.container.innerHTML = `
      <div class="express-layout">
        <!-- Top Toolbar / Mode Switcher (Visible on Mobile/Tablet) -->
        <div class="express-mobile-tabs">
          <button class="mobile-tab-btn ${this.activeTab === 'pos' ? 'active' : ''}" id="tab-btn-pos">
            <span class="material-symbols-rounded">shopping_cart</span>
            Take Orders
          </button>
          <button class="mobile-tab-btn ${this.activeTab === 'kitchen' ? 'active' : ''}" id="tab-btn-kitchen">
            <span class="material-symbols-rounded">restaurant</span>
            Kitchen Display
            <span class="badge badge-danger kds-badge" id="mobile-kds-badge" style="display:none;">0</span>
          </button>
        </div>

        <div class="express-main-grid ${this.activeTab === 'pos' ? 'show-pos' : 'show-kitchen'}">
          
          <!-- LEFT PANEL: POS ORDER-TAKING -->
          <div class="express-panel pos-panel">
            <div class="panel-header">
              <div class="title-with-icon">
                <span class="material-symbols-rounded icon-orange">point_of_sale</span>
                <h3>Express Register</h3>
              </div>
              <!-- Compact Search -->
              <div class="compact-search">
                <span class="material-symbols-rounded search-glass">search</span>
                <input type="text" id="express-item-search" placeholder="Type to search..." autocomplete="off">
              </div>
            </div>

            <!-- Horizontal Categories list -->
            <div class="express-categories-scroller scrollbar-none">
              ${this.renderCategories()}
            </div>

            <!-- Grid of Products -->
            <div class="express-products-grid scrollbar-none" id="express-products-grid">
              ${this.renderProducts()}
            </div>

            <!-- Cart Section (slides up on mobile) -->
            <div class="express-cart-section" id="express-cart-section">
              <div class="express-cart-header">
                <!-- Close drawer button visible ONLY on mobile -->
                <button class="close-cart-btn" id="express-close-cart" type="button">
                  <span class="material-symbols-rounded">arrow_back</span>
                  Menu
                </button>
                <span class="cart-title">Order Items (${this.cart.reduce((s, i) => s + i.quantity, 0)}):</span>
                <button class="clear-btn" id="express-clear-cart" type="button">
                  <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
                  Clear Order
                </button>
              </div>

              <!-- Cart List -->
              <div class="express-cart-list scrollbar-none" id="express-cart-list">
                ${this.renderCartItems()}
              </div>

              <!-- Cart Meta Selector -->
              <div class="express-cart-meta">
                <div class="meta-row">
                  <!-- Order type selector -->
                  <div class="express-type-selector">
                    <button class="type-btn ${this.orderType === 'takeaway' ? 'active' : ''}" data-type="takeaway">
                      <span class="material-symbols-rounded">shopping_bag</span> Takeaway
                    </button>
                    <button class="type-btn ${this.orderType === 'dinein' ? 'active' : ''}" data-type="dinein">
                      <span class="material-symbols-rounded">restaurant</span> Dine-In
                    </button>
                    <button class="type-btn ${this.orderType === 'delivery' ? 'active' : ''}" data-type="delivery">
                      <span class="material-symbols-rounded">delivery_dining</span> Delivery
                    </button>
                  </div>
                  
                  <!-- Dyn Table Selection -->
                  <select id="express-table-select" class="meta-dropdown" style="display: ${this.orderType === 'dinein' ? 'block' : 'none'};">
                    <option value="">🪑 Select Table</option>
                    ${this.tables.map(t => `<option value="${t.id}">Table T${t.number} (${t.capacity} pax)</option>`).join('')}
                  </select>

                  <!-- Customer Phone -->
                  <input type="tel" id="express-cust-phone" class="meta-input" placeholder="📱 Phone number (Optional)" value="${escapeHtml(this.customerPhone)}">
                </div>
              </div>

              <!-- Total & Checkout buttons -->
              <div class="express-checkout-bar" id="express-checkout-bar">
                ${this.renderCheckoutBar()}
              </div>
            </div>

            <!-- Mobile Cart Bar Placeholder wrapper -->
            <div id="mobile-cart-bar-wrapper">
              ${mobileCartHtml}
            </div>
          </div>

          <!-- RIGHT PANEL: KITCHEN DISPLAY SYSTEM (KDS) -->
          <div class="express-panel kds-panel">
            <div class="panel-header">
              <div class="title-with-icon">
                <span class="material-symbols-rounded icon-purple">restaurant</span>
                <h3>Kitchen Coordinator</h3>
              </div>
              <div class="kds-filter-tabs">
                <button class="kds-filter-btn ${this.kdsFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
                <button class="kds-filter-btn ${this.kdsFilter === 'new' ? 'active' : ''}" data-filter="new">New</button>
                <button class="kds-filter-btn ${this.kdsFilter === 'preparing' ? 'active' : ''}" data-filter="preparing">Cooking</button>
                <button class="kds-filter-btn ${this.kdsFilter === 'ready' ? 'active' : ''}" data-filter="ready">Ready</button>
              </div>
            </div>

            <!-- Orders scroll feed -->
            <div class="express-kds-feed scrollbar-none" id="express-kds-feed">
              <!-- Rendered via loadKitchenOrders() -->
            </div>
          </div>

        </div>
      </div>

      <!-- UPI QR Code Modal Overlay -->
      <div id="express-upi-modal" class="modal-overlay" style="display:none;">
        <div class="modal upi-modal-card">
          <h3 style="font-family:var(--font-display); font-weight:700; color:var(--text-primary); margin-bottom:12px;">Scan UPI QR</h3>
          <p style="font-size:var(--text-sm); color:var(--text-secondary); margin-bottom:16px;">Scan to collect <strong id="upi-modal-amount" style="color:var(--color-primary);">₹0.00</strong></p>
          <div style="display:flex; justify-content:center; background:#ffffff; padding:16px; border-radius:12px; margin-bottom:20px; width:220px; margin-left:auto; margin-right:auto;">
            <canvas id="express-upi-canvas" style="width:200px; height:200px;"></canvas>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <button class="btn btn-primary btn-block" id="express-upi-confirm" style="height:44px; font-weight:700;">
              Confirm Payment Received
            </button>
            <button class="btn btn-ghost btn-block btn-sm" id="express-upi-cancel" style="color:var(--text-muted);">
              Cancel
            </button>
          </div>
        </div>
      </div>

      <style>
        /* CSS styling for the redesigned Express Panel with Apple Aesthetic */
        
        .express-layout {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 64px); /* Subtract header height */
          background: var(--bg-primary);
          overflow: hidden;
          padding: 16px;
          gap: 16px;
          box-sizing: border-box;
          transition: background var(--transition-normal);
        }

        .express-mobile-tabs {
          display: none;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-glass);
          padding: 8px 16px;
          gap: 12px;
        }

        .mobile-tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-family: var(--font-display);
          font-weight: 700;
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .mobile-tab-btn.active {
          background: rgba(var(--color-primary-rgb), 0.08);
          border-color: var(--color-primary);
          color: var(--text-primary);
          box-shadow: 0 0 12px rgba(var(--color-primary-rgb), 0.15);
        }

        .express-main-grid {
          display: grid;
          grid-template-columns: 58% 42%;
          gap: 16px;
          flex: 1;
          overflow: hidden;
        }

        .express-panel {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-surface);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          transition: all var(--transition-normal);
        }

        .pos-panel {
          background: var(--bg-surface);
        }

        .kds-panel {
          background: var(--bg-surface);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: transparent;
          border-bottom: 1px solid var(--border-glass);
          min-height: 64px;
        }

        .title-with-icon {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .title-with-icon h3 {
          font-family: var(--font-display);
          font-size: var(--text-base);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .icon-orange {
          color: var(--color-primary);
          filter: drop-shadow(0 0 4px var(--color-primary-glow));
        }

        .icon-purple {
          color: var(--nextgenos-purple);
          filter: drop-shadow(0 0 4px var(--nextgenos-purple-glow));
        }

        /* Category chips - Apple Segmented/Tab Style */
        .express-categories-scroller {
          display: flex;
          gap: 8px;
          padding: 12px 20px;
          overflow-x: auto;
          background: transparent;
          border-bottom: 1px solid var(--border-glass);
          white-space: nowrap;
        }

        .category-chip {
          display: inline-flex;
          align-items: center;
          padding: 8px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-full);
          color: var(--text-secondary);
          font-family: var(--font-display);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .category-chip:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
          transform: translateY(-1px);
        }

        .category-chip:active {
          transform: scale(0.96);
        }

        .category-chip.active {
          background: var(--color-primary);
          color: #ffffff;
          border-color: var(--color-primary);
          box-shadow: 0 4px 12px rgba(var(--color-primary-rgb), 0.25);
        }

        /* Products Grid */
        .express-products-grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 12px;
          padding: 16px 20px;
          overflow-y: auto;
          background: transparent;
        }

        .express-product-card {
          position: relative;
          background: var(--bg-card);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          cursor: pointer;
          user-select: none;
          transition: all var(--transition-normal);
          box-shadow: var(--shadow-sm);
        }

        .express-product-card:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-active);
          transform: translateY(-3px);
          box-shadow: var(--shadow-md);
        }

        .express-product-card:active {
          transform: scale(0.96);
        }

        .prod-image {
          width: 100%;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          background: var(--bg-secondary);
          border-radius: var(--radius-sm);
          overflow: hidden;
          border-bottom: 1px solid var(--border-color);
        }

        .prod-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform var(--transition-normal);
        }

        .express-product-card:hover .prod-image img {
          transform: scale(1.06);
        }

        .prod-name {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.3;
          height: 32px;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .prod-bottom {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: auto;
          padding-top: 4px;
        }

        .prod-price {
          font-weight: 700;
          color: var(--color-primary);
          font-size: var(--text-xs);
        }

        /* Cart Section */
        .express-cart-section {
          background: var(--bg-surface);
          border-top: 1px solid var(--border-glass);
          display: flex;
          flex-direction: column;
          padding: 16px 20px;
          max-height: 320px;
          gap: 10px;
        }

        .close-cart-btn {
          display: none;
        }

        .express-cart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .cart-title {
          font-family: var(--font-display);
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-secondary);
        }

        .clear-btn {
          background: transparent;
          border: none;
          color: var(--color-danger);
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: var(--radius-full);
          transition: background var(--transition-fast);
        }

        .clear-btn:hover {
          background: rgba(var(--color-danger-rgb), 0.08);
        }

        .express-cart-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 120px;
          margin-bottom: 4px;
        }

        .express-cart-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
        }

        .express-cart-row:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-active);
        }

        .row-details {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }

        .row-name {
          color: var(--text-primary);
          font-weight: 600;
          font-size: var(--text-xs);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .row-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* Apple Stepper */
        .circle-stepper {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-primary);
          padding: 3px;
          border-radius: var(--radius-full);
          border: 1px solid var(--border-glass);
        }

        .step-circle {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--bg-surface);
          border: 1px solid var(--border-glass);
          color: var(--text-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-weight: 700;
          font-size: var(--text-sm);
          transition: all var(--transition-fast);
          box-shadow: var(--shadow-sm);
        }

        .step-circle:hover {
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: #ffffff;
        }

        .step-circle:active {
          transform: scale(0.9);
        }

        .step-val {
          font-size: 11px;
          font-weight: 700;
          min-width: 14px;
          text-align: center;
          color: var(--text-primary);
        }

        .row-total {
          font-weight: 700;
          color: var(--text-primary);
          font-size: var(--text-xs);
          min-width: 50px;
          text-align: right;
        }

        .cart-empty-text {
          text-align: center;
          color: var(--text-muted);
          font-size: var(--text-xs);
          padding: 24px;
        }

        /* Cart Meta Row & iOS style Segmented Control */
        .express-cart-meta {
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border-glass);
          margin-bottom: 8px;
        }

        .meta-row {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .express-type-selector {
          display: flex;
          background: var(--bg-secondary);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-full);
          padding: 3px;
          flex: 1.5;
          min-width: 240px;
        }

        .type-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 12px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          border-radius: var(--radius-full);
          transition: all var(--transition-normal);
        }

        .type-btn:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.03);
        }

        :root[data-theme="light"] .type-btn:hover {
          background: rgba(0, 0, 0, 0.03);
        }

        .type-btn.active {
          background: var(--color-primary);
          color: #ffffff;
          box-shadow: var(--shadow-sm);
        }

        .meta-dropdown, .meta-input {
          flex: 1;
          min-width: 140px;
          height: 32px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: 11px;
          padding: 0 10px;
          transition: all var(--transition-fast);
        }

        .meta-dropdown {
          cursor: pointer;
        }

        .meta-input::placeholder {
          color: var(--text-muted);
        }

        .meta-dropdown:focus, .meta-input:focus {
          background: var(--bg-input);
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.15);
          outline: none;
        }

        /* Checkout Bar */
        .express-checkout-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .express-total-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .total-lbl {
          font-size: 9px;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .total-val {
          font-family: var(--font-display);
          font-size: 20px;
          font-weight: 800;
          color: var(--color-primary);
        }

        .checkout-buttons-group {
          display: flex;
          gap: 8px;
          flex: 1;
          justify-content: flex-end;
        }

        .quick-pay-btn {
          height: 44px;
          padding: 0 18px;
          border-radius: var(--radius-md);
          border: none;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: var(--text-xs);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: #ffffff;
          cursor: pointer;
          transition: all var(--transition-fast);
          box-shadow: var(--shadow-sm);
        }

        .quick-pay-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .quick-pay-btn:active:not(:disabled) {
          transform: scale(0.97);
        }

        .quick-pay-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .btn-cash {
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }

        .btn-cash:hover:not(:disabled) {
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
        }

        .btn-upi {
          background: linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
        }

        .btn-upi:hover:not(:disabled) {
          box-shadow: 0 6px 16px rgba(139, 92, 246, 0.35);
        }

        /* Search input style - Apple Spotlight */
        .compact-search {
          position: relative;
          width: 170px;
          transition: width var(--transition-normal);
        }

        .compact-search:focus-within {
          width: 220px;
        }

        .compact-search input {
          width: 100%;
          height: 32px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-full);
          color: var(--text-primary);
          font-size: 11px;
          padding: 0 10px 0 32px;
          font-weight: 500;
          transition: all var(--transition-fast);
        }

        .compact-search input:focus {
          background: var(--bg-input);
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.15);
          outline: none;
        }

        .search-glass {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 16px;
          color: var(--text-muted);
          pointer-events: none;
          transition: color var(--transition-fast);
        }

        .compact-search:focus-within .search-glass {
          color: var(--color-primary);
        }

        /* KDS Filter Tabs - iOS Segmented Control style */
        .kds-filter-tabs {
          display: flex;
          background: var(--bg-secondary);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-full);
          padding: 3px;
        }

        .kds-filter-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: var(--text-xs);
          font-weight: 600;
          padding: 6px 12px;
          cursor: pointer;
          border-radius: var(--radius-full);
          transition: all var(--transition-fast);
        }

        .kds-filter-btn:hover {
          color: var(--text-primary);
        }

        .kds-filter-btn.active {
          background: var(--bg-surface);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }

        /* KDS Feed Grid Layout */
        .express-kds-feed {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 12px;
          align-content: start;
          background: transparent;
        }

        /* KDS Order Cards */
        .express-order-card {
          background: var(--bg-card);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all var(--transition-normal);
          box-shadow: var(--shadow-sm);
        }

        .express-order-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
          border-color: var(--border-active);
        }

        .express-order-card.status-confirmed {
          border-left: 5px solid var(--color-danger);
        }

        .express-order-card.status-preparing {
          border-left: 5px solid var(--color-warning);
          background: rgba(var(--color-warning-rgb), 0.02);
        }

        .express-order-card.status-ready {
          border-left: 5px solid var(--color-success);
          background: rgba(var(--color-success-rgb), 0.02);
        }

        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 8px;
        }

        .card-num {
          font-family: var(--font-display);
          font-size: var(--text-base);
          font-weight: 700;
          color: var(--text-primary);
        }

        .card-type {
          font-size: 10px;
          font-weight: 700;
          color: var(--color-primary);
          background: rgba(var(--color-primary-rgb), 0.1);
          padding: 2px 8px;
          border-radius: var(--radius-full);
          text-transform: uppercase;
        }

        .card-timer {
          font-size: 10px;
          padding: 3px 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-full);
          font-weight: 600;
          color: var(--text-secondary);
        }

        .card-timer.overdue {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.2);
          color: var(--color-danger);
          animation: pulseRed 2s infinite ease-in-out;
        }

        .card-items-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .card-item-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: var(--text-sm);
          color: var(--text-primary);
          font-weight: 500;
          padding: 2px 0;
        }

        .item-qty {
          color: var(--color-primary);
          font-weight: 700;
          margin-right: 6px;
        }

        /* Custom iOS circular checkbox for kitchen checklists */
        .item-chk {
          width: 18px;
          height: 18px;
          appearance: none;
          -webkit-appearance: none;
          border: 2px solid var(--border-active);
          border-radius: 50%;
          cursor: pointer;
          position: relative;
          transition: all var(--transition-fast);
          outline: none;
          background: transparent;
        }

        .item-chk:checked {
          background: var(--color-success);
          border-color: var(--color-success);
        }

        .item-chk:checked::after {
          content: '✓';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
        }

        .kds-action-btn {
          width: 100%;
          height: 38px;
          border-radius: var(--radius-md);
          border: none;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: var(--text-xs);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .kds-btn-prepare {
          background: linear-gradient(135deg, #FF5E36 0%, #FF8960 100%);
          box-shadow: 0 4px 10px rgba(255, 94, 54, 0.2);
        }

        .kds-btn-ready {
          background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
          box-shadow: 0 4px 10px rgba(245, 158, 11, 0.2);
        }

        .kds-btn-complete {
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
        }

        .kds-empty-feed {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          padding: 40px 0;
          gap: 8px;
        }

        /* Item Added Indicator for POS */
        .express-item-indicator {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(var(--color-primary-rgb), 0.08);
          border: 2px solid var(--color-primary);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
        }

        .express-item-indicator.show {
          opacity: 1;
        }

        .express-item-indicator span {
          font-size: 28px;
          color: var(--color-primary);
        }

        /* Animation */
        @keyframes pulseRed {
          0% { border-color: rgba(239, 68, 68, 0.4); box-shadow: 0 0 4px rgba(239, 68, 68, 0.2); }
          50% { border-color: rgba(239, 68, 68, 0.9); box-shadow: 0 0 14px rgba(239, 68, 68, 0.5); }
          100% { border-color: rgba(239, 68, 68, 0.4); box-shadow: 0 0 4px rgba(239, 68, 68, 0.2); }
        }

        /* Responsive Layout Breaks */
        @media (max-width: 1023px) {
          .express-layout {
            padding: 0;
            gap: 0;
            height: auto;
            min-height: calc(100vh - 64px);
            overflow-y: auto;
          }

          .express-mobile-tabs {
            display: flex;
          }

          .express-main-grid {
            grid-template-columns: 1fr;
            height: auto;
            overflow: visible;
            gap: 0;
          }

          .express-main-grid.show-pos .kds-panel {
            display: none !important;
          }

          .express-main-grid.show-kitchen .pos-panel {
            display: none !important;
          }

          .express-panel.pos-panel {
            height: auto;
            overflow: visible;
            padding-bottom: 90px; /* Room for floating cart bar */
          }

          .express-products-grid {
            height: auto;
            overflow: visible;
            flex: none;
          }

          /* Mobile Cart Bar */
          #mobile-cart-bar-wrapper {
            display: block;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 12px 16px;
            background: linear-gradient(to top, var(--bg-primary) 80%, transparent);
            z-index: 99;
            pointer-events: none;
          }

          .express-mobile-cart-bar {
            pointer-events: auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(135deg, var(--color-primary) 0%, #ff8960 100%);
            color: #ffffff;
            padding: 14px 20px;
            border-radius: var(--radius-lg);
            box-shadow: 0 8px 24px rgba(var(--color-primary-rgb), 0.35);
            cursor: pointer;
            animation: slideUp 0.3s ease-out;
          }

          .mobile-cart-info {
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: var(--font-display);
            font-weight: 800;
            font-size: var(--text-sm);
          }

          .mobile-cart-badge {
            background: #ffffff;
            color: var(--color-primary);
            width: 22px;
            height: 22px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--text-xs);
            font-weight: 800;
          }

          .mobile-cart-action {
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: var(--font-display);
            font-weight: 800;
            font-size: var(--text-sm);
          }

          /* Sliding drawer for Cart on mobile */
          .express-cart-section {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            background: var(--glass-bg);
            backdrop-filter: var(--glass-backdrop-filter);
            -webkit-backdrop-filter: var(--glass-backdrop-filter);
            border: 1px solid var(--border-active);
            border-bottom: none;
            border-radius: 20px 20px 0 0;
            max-height: 85vh !important;
            height: auto;
            transform: translateY(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
            padding: 20px;
          }

          .express-cart-section.cart-open {
            transform: translateY(0);
          }

          .close-cart-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-glass);
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            font-size: var(--text-xs);
            font-weight: 700;
            padding: 6px 12px;
            cursor: pointer;
          }

          .express-cart-list {
            max-height: 40vh;
            margin-bottom: 16px;
          }

          .express-cart-meta {
            margin-bottom: 16px;
          }

          /* Smartphone screens layout fixes (resolves horizontal overflow) */
          @media (max-width: 560px) {
            .panel-header {
              flex-direction: column;
              align-items: stretch;
              gap: 12px;
              height: auto;
              padding: 12px 16px;
            }
            .compact-search {
              width: 100% !important;
            }
            .kds-filter-tabs {
              width: 100%;
              display: flex;
              justify-content: space-between;
              gap: 4px;
            }
            .kds-filter-btn {
              flex: 1;
              text-align: center;
              font-size: 10px;
              padding: 6px 4px;
            }
            .meta-row {
              flex-direction: column;
              align-items: stretch;
              gap: 8px;
            }
            .express-type-selector {
              min-width: 100% !important;
            }
            .meta-dropdown, .meta-input {
              width: 100% !important;
              min-width: 100% !important;
              height: 36px;
            }
            .express-checkout-bar {
              flex-direction: column;
              align-items: stretch;
              gap: 12px;
            }
            .checkout-buttons-group {
              width: 100%;
              display: flex;
              gap: 8px;
            }
            .quick-pay-btn {
              flex: 1;
              padding: 0 10px;
              font-size: 10px;
            }
          }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      </style>
    `;
  }

  renderCategories() {
    if (this.categories.length === 0) return '';
    return this.categories.map(cat => `
      <button 
        class="category-chip ${cat.id === this.selectedCategory ? 'active' : ''}" 
        data-cat-id="${cat.id}"
      >
        <span style="margin-right: 4px;">${cat.icon || '🍽️'}</span>${cat.name}
      </button>
    `).join('');
  }

  renderProducts() {
    if (this.filteredItems.length === 0) {
      return `<div class="cart-empty-text">No items found.</div>`;
    }

    return this.filteredItems.map(item => {
      const vegTag = item.isVeg 
        ? '<span class="badge-veg" style="transform:scale(0.85);"></span>'
        : '<span class="badge-nonveg" style="transform:scale(0.85);"></span>';

      const fallbackEmoji = item.icon || this.getCategoryIcon(item.categoryId) || '🍽️';
      const imageContent = item.imageUrl
        ? `<img src="${item.imageUrl}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="fallback-emoji" style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">${fallbackEmoji}</span>`
        : `<span class="fallback-emoji" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">${fallbackEmoji}</span>`;

      return `
        <div class="express-product-card" data-item-id="${item.id}">
          <div class="prod-image">${imageContent}</div>
          <div class="prod-name">${escapeHtml(item.name)}</div>
          <div class="prod-bottom">
            <span class="prod-price">${formatCurrencyShort(item.price)}</span>
            ${vegTag}
          </div>
          <div class="express-item-indicator" id="exp-indicator-${item.id}">
            <span class="material-symbols-rounded">check_circle</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderCartItems() {
    if (this.cart.length === 0) {
      return `<div class="cart-empty-text">Cart is empty. Tap items above.</div>`;
    }

    return this.cart.map((item, index) => `
      <div class="express-cart-row" data-index="${index}">
        <div class="row-details">
          ${item.isVeg ? '<span class="badge-veg" style="transform:scale(0.7);"></span>' : '<span class="badge-nonveg" style="transform:scale(0.7);"></span>'}
          <span class="row-name" title="${escapeHtml(item.itemName)}">${escapeHtml(item.itemName)}</span>
        </div>
        <div class="row-actions">
          <div class="circle-stepper">
            <button class="step-circle step-dec" data-index="${index}">-</button>
            <span class="step-val">${item.quantity}</span>
            <button class="step-circle step-inc" data-index="${index}">+</button>
          </div>
          <div class="row-total">${formatCurrencyShort(item.price * item.quantity)}</div>
        </div>
      </div>
    `).join('');
  }

  renderCheckoutBar() {
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const gstPercent = parseFloat(localStorage.getItem('app_gst_percent') || '5');
    const total = subtotal * (1 + gstPercent / 100);

    return `
      <div class="express-total-info">
        <span class="total-lbl">Total (${this.cart.reduce((s, i) => s + i.quantity, 0)} items)</span>
        <span class="total-val">${formatCurrency(total)}</span>
      </div>
      <div class="checkout-buttons-group">
        <button class="quick-pay-btn btn-cash" id="express-pay-cash" ${this.cart.length === 0 ? 'disabled' : ''}>
          <span class="material-symbols-rounded">payments</span>
          💵 CASH
        </button>
        <button class="quick-pay-btn btn-upi" id="express-pay-upi" ${this.cart.length === 0 ? 'disabled' : ''}>
          <span class="material-symbols-rounded">qr_code_2</span>
          📱 UPI QR
        </button>
      </div>
    `;
  }

  renderKdsList() {
    const kdsFeed = document.getElementById('express-kds-feed');
    const mobileBadge = document.getElementById('mobile-kds-badge');
    if (!kdsFeed) return;

    let filtered = [...this.activeOrders].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    if (this.kdsFilter !== 'all') {
      const matchStatus = this.kdsFilter === 'new' ? 'confirmed' : this.kdsFilter;
      filtered = filtered.filter(o => o.status === matchStatus);
    }

    if (mobileBadge) {
      const activeCount = this.activeOrders.length;
      if (activeCount > 0) {
        mobileBadge.textContent = activeCount;
        mobileBadge.style.display = 'inline-flex';
      } else {
        mobileBadge.style.display = 'none';
      }
    }

    if (filtered.length === 0) {
      kdsFeed.innerHTML = `
        <div class="kds-empty-feed">
          <span class="material-symbols-rounded" style="font-size:32px;">inbox</span>
          <span>No active orders.</span>
        </div>
      `;
      return;
    }

    kdsFeed.innerHTML = filtered.map(order => {
      const items = parseOrderItems(order.items);
      const elapsedMins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
      
      let timerClass = 'card-timer';
      if (order.status !== 'ready') {
        if (elapsedMins >= 15) timerClass += ' overdue';
        else if (elapsedMins >= 8) timerClass += ' warning';
      }

      // Large Action Button on Card
      let actionBtn = '';
      if (order.status === 'confirmed') {
        actionBtn = `<button class="kds-action-btn kds-btn-prepare" data-action="prepare" data-order-id="${order.id}">🔥 Start Cooking</button>`;
      } else if (order.status === 'preparing') {
        actionBtn = `<button class="kds-action-btn kds-btn-ready" data-action="ready" data-order-id="${order.id}">✅ Food Ready</button>`;
      } else if (order.status === 'ready') {
        actionBtn = `<button class="kds-action-btn kds-btn-complete" data-action="complete" data-order-id="${order.id}">📦 Serve & Close</button>`;
      }

      const itemsHtml = items.map(item => `
        <div class="card-item-row">
          <div><span class="item-qty">${item.quantity}x</span>${escapeHtml(item.itemName || item.name)}</div>
          <input type="checkbox" class="item-chk">
        </div>
      `).join('');

      return `
        <div class="express-order-card status-${order.status}" id="kds-card-${order.id}">
          <div class="card-top">
            <div>
              <span class="card-num">#${order.orderNumber.split('-').pop()}</span>
              <span class="card-type" style="margin-left:8px;">${order.type}</span>
            </div>
            <span class="${timerClass}">${elapsedMins === 0 ? 'Just now' : `${elapsedMins}m ago`}</span>
          </div>

          <div class="card-items-list">
            ${itemsHtml}
          </div>

          ${order.notes ? `<div style="font-size:10px; color:var(--color-warning); font-style:italic;">Notes: ${escapeHtml(order.notes)}</div>` : ''}

          <div style="margin-top:4px;">
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');

    // Bind click events on KDS card action buttons
    kdsFeed.querySelectorAll('.kds-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = btn.dataset.action;
        const orderId = parseInt(btn.dataset.orderId);

        playSound(900, 80);
        vibrateDevice([40]);

        if (action === 'prepare') {
          const prepStartTime = new Date().toISOString();
          // Use a fixed default estimated prep time of 15 mins for Express mode to avoid blocking dialogs
          await db.orders.update(orderId, { status: 'preparing', estimatedPrepTime: 15, prepStartTime, isSynced: 0 });
          
          import('../../services/sync.js').then(({ syncService }) => {
            db.orders.get(orderId).then(order => {
              if (order) syncService.syncUpOrder(order).catch(err => console.error(err));
            });
          }).catch(err => console.warn(err));

          showToast('Cooking started', 'success');
        } else if (action === 'ready') {
          await updateOrderStatus(orderId, 'ready');
          showToast('Food is ready!', 'success');
        } else if (action === 'complete') {
          await updateOrderStatus(orderId, 'completed');
          showToast('Order served and closed!', 'success');
        }

        await this.loadKitchenOrders();
      });
    });
  }

  // --- Cart Actions ---
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

    // Show indicator
    const indicator = document.getElementById(`exp-indicator-${item.id}`);
    if (indicator) {
      indicator.classList.add('show');
      setTimeout(() => indicator.classList.remove('show'), 600);
    }

    this.updateCartUI();
  }

  updateQuantity(index, delta) {
    if (index < 0 || index >= this.cart.length) return;
    this.cart[index].quantity += delta;
    if (this.cart[index].quantity <= 0) {
      this.cart.splice(index, 1);
    }
    this.updateCartUI();
  }

  updateCartUI() {
    const cartList = document.getElementById('express-cart-list');
    const checkoutBar = document.getElementById('express-checkout-bar');
    if (cartList) cartList.innerHTML = this.renderCartItems();
    if (checkoutBar) checkoutBar.innerHTML = this.renderCheckoutBar();

    // Update Mobile Cart Bar
    const mobileCartWrapper = document.getElementById('mobile-cart-bar-wrapper');
    if (mobileCartWrapper) {
      const gstPercent = parseFloat(localStorage.getItem('app_gst_percent') || '5');
      const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const total = subtotal * (1 + gstPercent / 100);
      const totalItems = this.cart.reduce((s, i) => s + i.quantity, 0);

      if (this.cart.length > 0) {
        mobileCartWrapper.innerHTML = `
          <div class="express-mobile-cart-bar" id="express-mobile-cart-bar">
            <div class="mobile-cart-info">
              <span class="mobile-cart-badge">${totalItems}</span>
              <span>View Order</span>
            </div>
            <div class="mobile-cart-action">
              <span>${formatCurrency(total)}</span>
              <span class="material-symbols-rounded" style="font-size: 16px;">arrow_forward_ios</span>
            </div>
          </div>
        `;
        
        // Bind click event on mobile cart bar
        const mobileCartBar = document.getElementById('express-mobile-cart-bar');
        if (mobileCartBar) {
          mobileCartBar.onclick = () => {
            const cartSection = document.getElementById('express-cart-section');
            if (cartSection) {
              cartSection.classList.add('cart-open');
            }
          };
        }
      } else {
        mobileCartWrapper.innerHTML = '';
        // If cart is empty, close the drawer
        const cartSection = document.getElementById('express-cart-section');
        if (cartSection) {
          cartSection.classList.remove('cart-open');
        }
      }
    }

    this.bindCartEvents();
  }

  // --- Order Placement Finalization ---
  async handleCheckout(paymentMethod) {
    if (this.cart.length === 0) {
      showToast('Add items to order first!', 'warning');
      return;
    }

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const gstPercent = parseFloat(await getSetting('gstPercent') || '5');
    const tax = subtotal * (gstPercent / 100);
    const total = subtotal + tax;
    const orderNumber = await getNextOrderNumber();

    // Read phone
    const phoneInput = document.getElementById('express-cust-phone');
    if (phoneInput) {
      this.customerPhone = phoneInput.value.trim();
    }

    // Read table
    const tableSelect = document.getElementById('express-table-select');
    if (tableSelect && tableSelect.value) {
      this.selectedTableId = parseInt(tableSelect.value);
    }

    const orderData = {
      orderNumber,
      type: this.orderType,
      channel: 'pos',
      status: 'pending',
      items: JSON.stringify(this.cart),
      subtotal,
      tax,
      taxPercent: gstPercent,
      total,
      paymentMethod: paymentMethod,
      paymentStatus: 'paid', // Instant checkout means fully paid
      customerName: this.customerPhone ? 'Walk-in' : '',
      customerPhone: this.customerPhone,
      staffId: authService.getCurrentStaff()?.id || null,
      staffName: authService.getCurrentStaff()?.name || '',
      tableId: this.selectedTableId,
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    if (paymentMethod === 'upi') {
      // Open UPI Modal QR
      const upiModal = document.getElementById('express-upi-modal');
      const amountLabel = document.getElementById('upi-modal-amount');
      const canvas = document.getElementById('express-upi-canvas');
      
      if (upiModal && amountLabel && canvas) {
        amountLabel.textContent = formatCurrency(total);
        upiModal.style.display = 'flex';
        
        try {
          await generateUPIQR(canvas, { amount: total, orderId: orderNumber });
        } catch (e) {
          console.error('[ExpressView] UPI QR generation failed:', e);
          showToast('Failed to load UPI QR Code. Check setup.', 'error');
        }

        // Bind UPI Confirm/Cancel
        const confirmBtn = document.getElementById('express-upi-confirm');
        const cancelBtn = document.getElementById('express-upi-cancel');

        confirmBtn.onclick = async () => {
          upiModal.style.display = 'none';
          await this.saveAndFinalizeOrder(orderData);
        };

        cancelBtn.onclick = () => {
          upiModal.style.display = 'none';
        };
      }
    } else {
      // Cash checkout - direct finalize
      await this.saveAndFinalizeOrder(orderData);
    }
  }

  async saveAndFinalizeOrder(orderData) {
    try {
      orderData.status = 'confirmed';
      orderData.completedAt = new Date().toISOString();

      // Save to IndexedDB
      const createdOrder = await createOrder(orderData);
      orderData.id = createdOrder.id;

      // Deduct inventory
      try {
        const items = typeof orderData.items === 'string' ? JSON.parse(orderData.items) : orderData.items;
        await deductInventoryForOrder(items);
      } catch (e) { console.error(e); }

      // Set table occupied
      try {
        if (orderData.tableId && orderData.type === 'dinein') {
          await tableService.updateTableStatus(orderData.tableId, 'occupied');
        }
      } catch (e) { console.error(e); }

      // Log activity
      try {
        await logOrderPlaced(orderData.orderNumber, orderData.total);
      } catch (e) { console.error(e); }

      // Attempt to print receipt automatically
      await this.printReceipt(orderData);

      // Reset cart
      this.cart = [];
      this.selectedTableId = null;
      this.customerPhone = '';
      this.updateCartUI();

      // Clear input fields
      const phoneInput = document.getElementById('express-cust-phone');
      if (phoneInput) phoneInput.value = '';
      const tableSelect = document.getElementById('express-table-select');
      if (tableSelect) tableSelect.value = '';

      // Reload KDS & Tables
      await this.loadKitchenOrders();
      await this.loadTables();

      // Play success feedback
      playSound(800, 100);
      playSound(1200, 150);
      vibrateDevice([50, 30, 50]);

      // Open Success Bill Modal
      const successModal = new CheckoutSuccessModal({
        order: orderData,
        onClose: () => {}
      });
      await successModal.show();

    } catch (err) {
      console.error('[ExpressView] Finalize order failed:', err);
      showToast('Failed to save order: ' + err.message, 'error');
    }
  }

  async printReceipt(order) {
    if (!printerService.isConnected) return;
    try {
      const settings = {
        restaurantName: await getSetting('restaurantName') || 'The Taste',
        restaurantTagline: await getSetting('restaurantTagline') || 'Fast Food & Chinese',
        restaurantPhone: await getSetting('restaurantPhone') || '',
        restaurantAddress: await getSetting('restaurantAddress') || '',
        printerWidth: await getSetting('printerWidth') || '58',
      };
      const receiptData = ReceiptBuilder.orderReceipt(order, settings);
      await printerService.print(receiptData);
    } catch (e) {
      console.error('[ExpressView] Auto print receipt failed:', e);
    }
  }

  bindEvents() {
    // Horizontal scroll categories
    const categoriesContainer = this.container.querySelector('.express-categories-scroller');
    if (categoriesContainer) {
      categoriesContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.category-chip');
        if (!chip) return;

        this.selectedCategory = parseInt(chip.dataset.catId);
        categoriesContainer.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        // Clear search
        const searchInput = document.getElementById('express-item-search');
        if (searchInput) searchInput.value = '';

        this.filterMenuItems();
        this.updateProductsGrid();
      });
    }

    // Search bar
    const searchInput = document.getElementById('express-item-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        this.filterMenuItems(query);
        this.updateProductsGrid();
      });
    }

    // Products Click delegation
    const prodGrid = document.getElementById('express-products-grid');
    if (prodGrid) {
      prodGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.express-product-card');
        if (!card) return;

        const itemId = parseInt(card.dataset.itemId);
        const item = this.items.find(i => i.id === itemId);
        if (item) {
          this.addToCart(item);
        }
      });
    }

    // Clear cart button
    const clearBtn = document.getElementById('express-clear-cart');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (this.cart.length === 0) return;
        if (confirm('Clear current order items?')) {
          this.cart = [];
          this.updateCartUI();
          showToast('Cart cleared', 'info');
        }
      });
    }

    // Order type selectors
    const typeSelector = this.container.querySelector('.express-type-selector');
    if (typeSelector) {
      typeSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.type-btn');
        if (!btn) return;

        this.orderType = btn.dataset.type;
        typeSelector.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Show/hide table select
        const tableSelect = document.getElementById('express-table-select');
        if (tableSelect) {
          tableSelect.style.display = this.orderType === 'dinein' ? 'block' : 'none';
        }
      });
    }

    // KDS Filter Tab delegation
    const kdsTabs = this.container.querySelector('.kds-filter-tabs');
    if (kdsTabs) {
      kdsTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.kds-filter-btn');
        if (!btn) return;

        this.kdsFilter = btn.dataset.filter;
        kdsTabs.querySelectorAll('.kds-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.renderKdsList();
      });
    }

    // Mobile View Tab Switchers
    const btnTabPos = document.getElementById('tab-btn-pos');
    const btnTabKitchen = document.getElementById('tab-btn-kitchen');
    const mainGrid = this.container.querySelector('.express-main-grid');

    if (btnTabPos && btnTabKitchen && mainGrid) {
      btnTabPos.addEventListener('click', () => {
        this.activeTab = 'pos';
        btnTabPos.classList.add('active');
        btnTabKitchen.classList.remove('active');
        mainGrid.className = 'express-main-grid show-pos';
      });

      btnTabKitchen.addEventListener('click', () => {
        this.activeTab = 'kitchen';
        btnTabKitchen.classList.add('active');
        btnTabPos.classList.remove('active');
        mainGrid.className = 'express-main-grid show-kitchen';
      });
    }

    // Mobile Cart Drawer Toggles
    const mobileCartBar = document.getElementById('express-mobile-cart-bar');
    if (mobileCartBar) {
      mobileCartBar.onclick = () => {
        const cartSection = document.getElementById('express-cart-section');
        if (cartSection) {
          cartSection.classList.add('cart-open');
        }
      };
    }

    const closeCartBtn = document.getElementById('express-close-cart');
    if (closeCartBtn) {
      closeCartBtn.onclick = () => {
        const cartSection = document.getElementById('express-cart-section');
        if (cartSection) {
          cartSection.classList.remove('cart-open');
        }
      };
    }

    this.bindCartEvents();
  }

  bindCartEvents() {
    const cartList = document.getElementById('express-cart-list');
    if (cartList) {
      // Steppers (+ and -) click
      cartList.querySelectorAll('.step-circle').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const index = parseInt(btn.dataset.index);
          if (btn.classList.contains('step-inc')) {
            this.updateQuantity(index, 1);
          } else {
            this.updateQuantity(index, -1);
          }
        };
      });
    }

    // Checkout buttons
    const payCashBtn = document.getElementById('express-pay-cash');
    const payUpiBtn = document.getElementById('express-pay-upi');

    if (payCashBtn) {
      payCashBtn.onclick = () => this.handleCheckout('cash');
    }
    if (payUpiBtn) {
      payUpiBtn.onclick = () => this.handleCheckout('upi');
    }
  }

  updateProductsGrid() {
    const prodGrid = document.getElementById('express-products-grid');
    if (prodGrid) {
      prodGrid.innerHTML = this.renderProducts();
    }
  }

  unmount() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.container = null;
  }
}
