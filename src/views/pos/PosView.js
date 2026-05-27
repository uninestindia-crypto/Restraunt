/**
 * POS View — Main order-taking screen
 * Split layout: Menu (left) + Cart (right)
 */

import { MenuGrid } from './MenuGrid.js';
import { CartPanel } from './CartPanel.js';
import { PaymentModal } from './PaymentModal.js';
import { db, createOrder, getNextOrderNumber, getSetting } from '../../db/database.js';
import { printerService } from '../../services/printer.js';
import { ReceiptBuilder } from '../../services/receipt.js';
import { authService } from '../../services/auth.js';
import { deductInventoryForOrder } from '../../services/inventoryHook.js';
import { tableService } from '../../services/tables.js';
import { logOrderPlaced, logActivity } from '../../utils/activityLogger.js';
import { showToast, formatCurrencyShort, playSound, vibrateDevice } from '../../utils/helpers.js';

export class PosView {
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
  }

  async loadTables() {
    try {
      const tables = await tableService.getAllTables();
      const select = document.getElementById('cart-table-select');
      if (select) {
        const available = tables.filter(t => t.status === 'available');
        select.innerHTML = '<option value="">🪑 Table</option>' +
          available.map(t => `<option value="${t.id}">T${t.number} (${t.capacity})</option>`).join('');
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
  }

  updateQuantity(index, delta) {
    if (index < 0 || index >= this.cart.length) return;

    this.cart[index].quantity += delta;

    if (this.cart[index].quantity <= 0) {
      this.cart.splice(index, 1);
    }

    this.cartPanel.updateCart(this.cart);
  }

  removeFromCart(index) {
    if (index < 0 || index >= this.cart.length) return;
    this.cart.splice(index, 1);
    this.cartPanel.updateCart(this.cart);
  }

  clearCart() {
    this.cart = [];
    this.cartPanel.updateCart(this.cart);
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
      showToast('Cart is empty! Add items first.', 'warning');
      return;
    }

    // Calculate totals
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const gstPercent = parseFloat(await getSetting('gstPercent') || '5');
    const tax = subtotal * (gstPercent / 100);
    const total = subtotal + tax;
    const orderNumber = await getNextOrderNumber();

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
      staffId: authService.getCurrentStaff()?.id || null,
      staffName: authService.getCurrentStaff()?.name || '',
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

  async finalizeOrder(orderData, paymentMethod, splitDetails = {}) {
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
      if (phoneInput && phoneInput.value.trim()) {
        orderData.customerPhone = phoneInput.value.trim();
        phoneInput.value = '';
      }

      // Read table selection
      const tableSelect = document.getElementById('cart-table-select');
      if (tableSelect && tableSelect.value) {
        orderData.tableId = parseInt(tableSelect.value);
        this.selectedTableId = orderData.tableId;
      }

      // Save to database
      const orderId = await createOrder(orderData);
      orderData.id = orderId;

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

      // Reload tables
      await this.loadTables();

      // Success feedback
      playSound(800, 100);
      playSound(1200, 150);
      vibrateDevice([50, 30, 50]);

      const splitInfo = splitDetails.splitMode && splitDetails.splitMode !== 'full'
        ? ` (${splitDetails.splitMode === 'half' ? 'Half' : 'Custom'}: ₹${splitDetails.paidAmount})`
        : '';
      showToast(`Order #${orderData.orderNumber} confirmed! ${paymentMethod === 'upi' ? '(UPI)' : '(Cash)'}${splitInfo}`, 'success', 4000);

      // Close payment modal
      if (this.paymentModal) {
        this.paymentModal.close();
        this.paymentModal = null;
      }

    } catch (error) {
      console.error('Failed to finalize order:', error);
      showToast('Failed to save order: ' + error.message, 'error');
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
      showToast('Receipt printed!', 'success');
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
