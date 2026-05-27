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

  render() {
    const gstPercent = parseFloat(localStorage.getItem('app_gst_percent') || '5');
    const currencySymbol = localStorage.getItem('app_currency_symbol') || '₹';

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

            <!-- Cart Section -->
            <div class="express-cart-section">
              <div class="express-cart-header">
                <span class="cart-title">Current items:</span>
                <button class="clear-btn" id="express-clear-cart">
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
      <div id="express-upi-modal" class="modal-overlay" style="display:none; z-index:99999; background:rgba(4,4,8,0.85); backdrop-filter:blur(12px);">
        <div class="modal upi-modal-card" style="max-width:380px; padding:24px; text-align:center; background:#0B0B0F; border:1px solid var(--border-active); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
          <h3 style="font-family:var(--font-display); font-weight:800; color:var(--text-primary); margin-bottom:12px;">Scan UPI QR</h3>
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
        /* CSS styling for the combined Express Panel */
        .express-layout {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 64px); /* Subtract header height */
          background: var(--bg-primary);
          overflow: hidden;
        }

        .express-mobile-tabs {
          display: none;
          background: rgba(9, 9, 14, 0.9);
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
          background: rgba(255, 255, 255, 0.02);
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
          background: rgba(255, 94, 54, 0.08);
          border-color: var(--color-primary);
          color: var(--text-primary);
          box-shadow: 0 0 12px rgba(255, 94, 54, 0.15);
        }

        .express-main-grid {
          display: grid;
          grid-template-columns: 58% 42%;
          flex: 1;
          overflow: hidden;
        }

        .express-panel {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-surface);
          border-right: 1px solid var(--border-glass);
        }

        .kds-panel {
          border-right: none;
          background: #060609;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: rgba(9, 9, 14, 0.5);
          border-bottom: 1px solid var(--border-glass);
          min-height: 58px;
        }

        .title-with-icon {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .title-with-icon h3 {
          font-family: var(--font-display);
          font-size: var(--text-base);
          font-weight: 800;
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

        /* Category chips */
        .express-categories-scroller {
          display: flex;
          gap: 8px;
          padding: 10px 20px;
          overflow-x: auto;
          background: rgba(255, 255, 255, 0.005);
          border-bottom: 1px solid var(--border-glass);
          white-space: nowrap;
        }

        .category-chip {
          display: inline-flex;
          align-items: center;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-family: var(--font-display);
          font-size: var(--text-xs);
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .category-chip.active {
          background: var(--text-primary);
          color: var(--bg-primary);
          border-color: var(--text-primary);
          box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
        }

        /* Products Grid */
        .express-products-grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 12px;
          padding: 16px 20px;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.1);
        }

        .express-product-card {
          position: relative;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          cursor: pointer;
          user-select: none;
          transition: all var(--transition-fast);
        }

        .express-product-card:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--border-active);
          transform: translateY(-2px);
        }

        .express-product-card:active {
          transform: scale(0.97);
        }

        .prod-icon {
          font-size: 20px;
          text-align: center;
          margin-bottom: 2px;
        }

        .prod-name {
          font-size: var(--text-xs);
          font-weight: 700;
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
        }

        .prod-price {
          font-weight: 800;
          color: var(--color-primary);
          font-size: var(--text-xs);
        }

        /* Cart Section */
        .express-cart-section {
          background: rgba(9, 9, 14, 0.7);
          border-top: 1px solid var(--border-active);
          display: flex;
          flex-direction: column;
          padding: 12px 20px;
          max-height: 290px;
        }

        .express-cart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
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
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }

        .express-cart-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 110px;
          margin-bottom: 8px;
        }

        .express-cart-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
        }

        .row-details {
          display: flex;
          align-items: center;
          gap: 6px;
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
          gap: 8px;
        }

        .circle-stepper {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.3);
          padding: 2px;
          border-radius: var(--radius-full);
          border: 1px solid var(--border-glass);
        }

        .step-circle {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          border: none;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .step-circle:hover {
          background: var(--color-primary);
        }

        .step-val {
          font-size: 11px;
          font-weight: 800;
          min-width: 14px;
          text-align: center;
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
          padding: 20px;
        }

        /* Cart Meta dropdown & inputs */
        .express-cart-meta {
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border-glass);
          margin-bottom: 10px;
        }

        .meta-row {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .express-type-selector {
          display: flex;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          padding: 2px;
        }

        .type-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          border-radius: 4px;
        }

        .type-btn.active {
          background: var(--color-primary);
          color: #ffffff;
        }

        .meta-dropdown, .meta-input {
          flex: 1;
          height: 30px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          padding: 0 8px;
        }

        .meta-input:focus {
          border-color: var(--color-primary);
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
        }

        .total-lbl {
          font-size: 9px;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .total-val {
          font-family: var(--font-display);
          font-size: 20px;
          font-weight: 900;
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
          padding: 0 16px;
          border-radius: var(--radius-md);
          border: none;
          font-family: var(--font-display);
          font-weight: 800;
          font-size: var(--text-xs);
          display: flex;
          align-items: center;
          gap: 6px;
          color: #ffffff;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .btn-cash {
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
        }

        .btn-cash:hover {
          box-shadow: 0 4px 18px rgba(16, 185, 129, 0.45);
        }

        .btn-upi {
          background: linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25);
        }

        .btn-upi:hover {
          box-shadow: 0 4px 18px rgba(139, 92, 246, 0.45);
        }

        /* Search input style */
        .compact-search {
          position: relative;
          width: 160px;
        }

        .compact-search input {
          width: 100%;
          height: 32px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 11px;
          padding: 0 8px 0 28px;
        }

        .compact-search input:focus {
          border-color: var(--color-primary);
          outline: none;
        }

        .search-glass {
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 14px;
          color: var(--text-muted);
        }

        /* KDS Filter Tabs */
        .kds-filter-tabs {
          display: flex;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          padding: 2px;
        }

        .kds-filter-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 700;
          padding: 6px 10px;
          cursor: pointer;
          border-radius: 4px;
        }

        .kds-filter-btn.active {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-primary);
        }

        /* KDS Feed */
        .express-kds-feed {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* KDS Order Cards */
        .express-order-card {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all var(--transition-normal);
        }

        .express-order-card.status-confirmed {
          border-left: 4px solid var(--color-danger);
        }

        .express-order-card.status-preparing {
          border-left: 4px solid var(--color-warning);
          background: rgba(245, 158, 11, 0.01);
        }

        .express-order-card.status-ready {
          border-left: 4px solid var(--color-success);
          background: rgba(16, 185, 129, 0.01);
        }

        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed var(--border-glass);
          padding-bottom: 8px;
        }

        .card-num {
          font-family: var(--font-display);
          font-size: var(--text-base);
          font-weight: 800;
          color: var(--text-primary);
        }

        .card-type {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        .card-timer {
          font-size: 10px;
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-full);
          font-weight: 600;
        }

        .card-timer.overdue {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.3);
          color: #ff6b6b;
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
          font-size: var(--text-sm);
          color: var(--text-primary);
          font-weight: 500;
        }

        .item-qty {
          color: var(--color-primary);
          font-weight: 800;
          margin-right: 6px;
        }

        .item-chk {
          margin-left: 10px;
          cursor: pointer;
        }

        .kds-action-btn {
          width: 100%;
          height: 38px;
          border-radius: var(--radius-sm);
          border: none;
          font-family: var(--font-display);
          font-weight: 800;
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
          background: rgba(255, 94, 54, 0.12);
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
          .express-mobile-tabs {
            display: flex;
          }

          .express-main-grid {
            grid-template-columns: 1fr;
          }

          .express-main-grid.show-pos .kds-panel {
            display: none !important;
          }

          .express-main-grid.show-kitchen .pos-panel {
            display: none !important;
          }
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

      return `
        <div class="express-product-card" data-item-id="${item.id}">
          <div class="prod-icon">${item.icon || '🍽️'}</div>
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
        <button class="quick-pay-btn btn-cash" id="express-pay-cash" ${this.cart.length === 0 ? 'disabled' : ''} style="opacity:${this.cart.length === 0 ? 0.4 : 1};">
          <span class="material-symbols-rounded">payments</span>
          💵 CASH
        </button>
        <button class="quick-pay-btn btn-upi" id="express-pay-upi" ${this.cart.length === 0 ? 'disabled' : ''} style="opacity:${this.cart.length === 0 ? 0.4 : 1};">
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
