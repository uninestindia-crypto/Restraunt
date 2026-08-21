/**
 * POS View — Main order-taking screen
 * Split layout: Menu (left) + Cart (right)
 */

import { MenuGrid } from './MenuGrid';
import { CartPanel } from './CartPanel';
import { PaymentModal } from './PaymentModal';
import { CheckoutSuccessModal } from './CheckoutSuccessModal';
import { db, createOrder, getNextOrderNumber, getSetting } from '../../db/database';
import { printerService } from '../../services/printer';
import { ReceiptBuilder } from '../../services/receipt';
import { authService } from '../../services/auth';
import { deductInventoryForOrder } from '../../services/inventoryHook';
import { tableService } from '../../services/tables';
import { logOrderPlaced, logActivity } from '../../utils/activityLogger';
import { showToast, formatCurrencyShort, playSound, vibrateDevice } from '../../utils/helpers';

export class PosView {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare cart: any;
  declare channel: any;
  declare container: any;
  declare customerName: any;
  declare customerPhone: any;
  declare orderType: any;

  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare app: any;
  declare cartPanel: any;
  declare menuGrid: any;
  declare paymentModal: any;
  declare selectedTableId: any;

  constructor(app) {
    this.app = app;
    this.container = null;
    this.menuGrid = null;
    this.cartPanel = null;
    this.paymentModal = null;

    // Cart state
    this.cart = [];
    this.orderType = 'takeaway'; // takeaway | dinein | delivery
    this.customerName = '';
    this.customerPhone = '';
    this.selectedTableId = null;
    this.channel = 'pos';
  }

  async mount(container) {
    this.container = container;
    this.render();
    await this.initComponents();
    await this.loadTables();
    this.bindMobileEvents();
    this.updateMobileCartBar();
  }

  async loadTables() {
    try {
      const tables = await tableService.getAllTables();
      const select = document.getElementById('cart-table-select');
      if (select) {
        const available = tables.filter(t => t.status === 'available');
        select.replaceChildren(
          new Option('🪑 Table', ''),
          ...available.map(t => new Option(
            `T${String(t.number ?? '')} (${String(t.capacity ?? '')})`,
            String(t.id ?? '')
          ))
        );
      }
    } catch (e) { console.error('Failed to load tables:', e); }
  }

  render() {
    this.container.innerHTML = `
      <div class="pos-layout">
        <div class="pos-menu" id="pos-menu-area">
          <!-- MenuGrid renders here -->
        </div>
        <div class="pos-cart" id="pos-cart-area">
          <!-- CartPanel renders here -->
        </div>
        
        <!-- Mobile Cart Toggle Bar -->
        <div class="mobile-cart-toggle-bar" id="mobile-cart-toggle">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-rounded" style="color: var(--color-primary-on-surface); font-size: 22px;">shopping_cart</span>
            <div>
              <span id="mobile-cart-count" style="font-weight: 700; color: var(--text-primary);">0 items</span>
              <span style="color: var(--text-muted); margin: 0 4px;">·</span>
              <span id="mobile-cart-total" style="font-weight: 800; color: var(--color-primary-on-surface);">₹0.00</span>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-mobile-view-cart" style="padding: 8px 16px; font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 4px;">
            View Cart
            <span class="material-symbols-rounded" style="font-size: 16px;">arrow_forward</span>
          </button>
        </div>
      </div>
    `;
  }

  async initComponents() {
    // Initialize menu grid
    this.menuGrid = new MenuGrid({
      container: document.getElementById('pos-menu-area'),
      onAddItem: (item) => this.addToCart(item),
    });
    await this.menuGrid.init();

    // Initialize cart panel
    this.cartPanel = new CartPanel({
      container: document.getElementById('pos-cart-area'),
      cart: this.cart,
      orderType: this.orderType,
      onUpdateQuantity: (index, delta) => this.updateQuantity(index, delta),
      onRemoveItem: (index) => this.removeFromCart(index),
      onClearCart: () => this.clearCart(),
      onPlaceOrder: () => this.handlePlaceOrder(),
      onOrderTypeChange: (type) => this.setOrderType(type),
    });
    this.cartPanel.render();
  }

  // --- Mobile Trigger Events & UI Helpers ---

  bindMobileEvents() {
    const viewCartBtn = document.getElementById('btn-mobile-view-cart');
    if (viewCartBtn) {
      viewCartBtn.addEventListener('click', () => {
        const layout = this.container.querySelector('.pos-layout');
        if (layout) {
          layout.classList.add('show-cart');
        }
      });
    }
  }

  async updateMobileCartBar() {
    const bar = document.getElementById('mobile-cart-toggle');
    if (!bar) return;

    // Only show the floating bar on mobile viewports where cart sidebar is hidden
    if (window.innerWidth > 768) {
      bar.classList.remove('show');
      return;
    }

    const count = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // The same source the bill uses. This read used to be
    // `localStorage.getItem('gstPercent')` — a key nothing in the codebase ever
    // writes, so it always returned null and always fell back to 5%. On a store
    // with any other rate, the floating bar showed a cashier one total while the
    // order was created with another.
    const gstPercent = parseFloat(await getSetting('gstPercent') || '5');
    const total = subtotal * (1 + gstPercent / 100);

    if (count > 0) {
      bar.classList.add('show');
      const countEl = document.getElementById('mobile-cart-count');
      const totalEl = document.getElementById('mobile-cart-total');
      if (countEl) countEl.textContent = `${count} item${count > 1 ? 's' : ''}`;
      if (totalEl) totalEl.textContent = formatCurrencyShort(total);
    } else {
      bar.classList.remove('show');
      const layout = this.container.querySelector('.pos-layout');
      if (layout) {
        layout.classList.remove('show-cart');
      }
    }
  }

  // --- Cart Operations ---

  addToCart(item) {
    // Check if item already in cart
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
        notes: '',
      });
    }

    // Feedback
    playSound(600, 80);
    vibrateDevice([30]);

    // Show animation on menu item
    this.menuGrid.showAddedIndicator(item.id);

    // Update cart display
    this.cartPanel.updateCart(this.cart);
    this.updateMobileCartBar();
  }

  updateQuantity(index, delta) {
    if (index < 0 || index >= this.cart.length) return;

    this.cart[index].quantity += delta;

    if (this.cart[index].quantity <= 0) {
      this.cart.splice(index, 1);
    }

    this.cartPanel.updateCart(this.cart);
    this.updateMobileCartBar();
  }

  removeFromCart(index) {
    if (index < 0 || index >= this.cart.length) return;
    this.cart.splice(index, 1);
    this.cartPanel.updateCart(this.cart);
    this.updateMobileCartBar();
  }

  clearCart() {
    this.cart = [];
    this.cartPanel.updateCart(this.cart);
    this.updateMobileCartBar();
    showToast('Cart cleared', 'info');
  }

  setOrderType(type) {
    this.orderType = type;
    const select = document.getElementById('cart-table-select');
    if (select) {
      select.style.display = type === 'dinein' ? 'block' : 'none';
    }
  }

  // --- Order Placement ---

  async handlePlaceOrder() {
    if (this.cart.length === 0) {
      showToast('Cart is empty. Add items first.', 'warning');
      return;
    }

    // Calculate totals
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const gstPercent = parseFloat(await getSetting('gstPercent') || '5');
    const tax = subtotal * (gstPercent / 100);
    const total = subtotal + tax;
    const orderNumber = await getNextOrderNumber();

    let staffId = authService.getCurrentStaff()?.id || null;
    let staffName = authService.getCurrentStaff()?.name || '';

    const orderData = {
      orderNumber,
      type: this.orderType,
      channel: this.channel,
      status: 'pending',
      items: JSON.stringify(this.cart),
      subtotal,
      tax,
      taxPercent: gstPercent,
      total,
      paymentMethod: null,
      paymentStatus: 'pending',
      customerName: this.customerName,
      customerPhone: this.customerPhone,
      staffId,
      staffName,
      tableId: this.selectedTableId,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    // Show payment modal
    this.paymentModal = new PaymentModal({
      order: orderData,
      onConfirmPayment: async (paymentMethod, splitDetails) => {
        await this.finalizeOrder(orderData, paymentMethod, splitDetails);
      },
      onClose: () => {
        this.paymentModal = null;
      },
    });
    this.paymentModal.show();
  }

  async finalizeOrder(orderData, paymentMethod, splitDetails: Record<string, any> = {}) {
    try {
      orderData.paymentMethod = paymentMethod;
      orderData.paymentStatus = splitDetails.remainingAmount > 0 ? 'partial' : 'paid';
      orderData.status = 'confirmed';
      orderData.completedAt = new Date().toISOString();

      // Store split payment details
      if (splitDetails.splitMode && splitDetails.splitMode !== 'full') {
        orderData.splitMode = splitDetails.splitMode;
        orderData.paidAmount = splitDetails.paidAmount;
        orderData.remainingAmount = splitDetails.remainingAmount;
      }

      // Read customer phone from cart input
      const phoneInput = document.getElementById('cart-customer-phone');
      if (phoneInput && (phoneInput as HTMLInputElement).value.trim()) {
        orderData.customerPhone = (phoneInput as HTMLInputElement).value.trim();
        (phoneInput as HTMLInputElement).value = '';
      }

      // Read table selection
      const tableSelect = document.getElementById('cart-table-select');
      if (tableSelect && (tableSelect as HTMLInputElement).value) {
        orderData.tableId = parseInt((tableSelect as HTMLInputElement).value);
        this.selectedTableId = orderData.tableId;
      }

      // Save to database
      const createdOrder = await createOrder(orderData);
      orderData.id = createdOrder.id;

      // --- Integration Hooks ---

      // 1. Deduct inventory
      try {
        const items = typeof orderData.items === 'string' ? JSON.parse(orderData.items) : orderData.items;
        const results = await deductInventoryForOrder(items);
        const lowItems = results.filter(r => r.belowThreshold);
        if (lowItems.length > 0) {
          showToast(`Low stock: ${lowItems.map(i => i.itemName).join(', ')}`, 'warning', 5000);
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
            await db.customers.add({
              name: orderData.customerName || 'Walk-in', phone: orderData.customerPhone,
              totalSpent: orderData.total, visitCount: 1,
              loyaltyPoints: Math.floor(orderData.total / 10),
              tier: 'bronze', lastVisit: new Date().toISOString(),
              createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos'
            });
          }
        }
      } catch (e) { console.error('Customer update failed:', e); }

      // 3. Set table to occupied
      try {
        if (orderData.tableId && orderData.type === 'dinein') {
          await tableService.updateTableStatus(orderData.tableId, 'occupied');
        }
      } catch (e) { console.error('Table update failed:', e); }

      // 4. Log activity
      try {
        await logOrderPlaced(orderData.orderNumber, orderData.total);
      } catch (e) { console.error('Activity log failed:', e); }

      // Try to print receipt
      await this.printReceipt(orderData);

      // Clear cart
      this.cart = [];
      this.selectedTableId = null;
      this.cartPanel.updateCart(this.cart);
      this.updateMobileCartBar();

      // Reload tables
      await this.loadTables();

      // Success feedback
      playSound(800, 100);
      playSound(1200, 150);
      vibrateDevice([50, 30, 50]);

      const splitInfo = splitDetails.splitMode && splitDetails.splitMode !== 'full'
        ? ` (${splitDetails.splitMode === 'half' ? 'Half' : 'Custom'}: ₹${splitDetails.paidAmount})`
        : '';
      showToast(`Order #${orderData.orderNumber} confirmed. ${paymentMethod === 'upi' ? '(UPI)' : '(Cash)'}${splitInfo}`, 'success', 4000);

      // Close payment modal & show success bill window
      if (this.paymentModal) {
        this.paymentModal.close();
        this.paymentModal = null;
      }

      const successModal = new CheckoutSuccessModal({
        order: orderData,
        onClose: () => {}
      });
      await successModal.show();

    } catch (error) {
      console.error('Failed to finalize order:', error);
      // The message already names the cause and the next move; a prefix only pushes it off screen.
      showToast(error.message, 'error', 8000);
    }
  }

  async printReceipt(order) {
    if (!printerService.isConnected) {
      console.log('Printer not connected, skipping print');
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

      const receiptData = ReceiptBuilder.orderReceipt(order, settings);
      await printerService.print(receiptData);
      showToast('Receipt printed', 'success');
    } catch (error) {
      console.error('Print failed:', error);
      showToast('Print failed: ' + error.message, 'warning');
    }
  }

  unmount() {
    if (this.menuGrid && this.menuGrid.destroy) {
      this.menuGrid.destroy();
    }
    if (this.paymentModal) {
      this.paymentModal.close();
    }
    this.container = null;
  }
}
