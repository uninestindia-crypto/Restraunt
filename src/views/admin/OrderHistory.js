/**
 * OrderHistory — Admin view for browsing, searching, and reprinting receipts
 */

import { db, getOrder, getOrders, getSetting } from '../../db/database.js';
import { formatCurrency, formatDateTime, showToast, playSound, vibrateDevice } from '../../utils/helpers.js';
import { printerService } from '../../services/printer.js';
import { ReceiptBuilder } from '../../services/receipt.js';
import { sendBillOnWhatsApp } from '../../services/whatsapp.js';

export class OrderHistory {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.orders = [];
    this.filteredOrders = [];
    this.searchQuery = '';
    
    // Selected order for detailed modal view
    this.selectedOrder = null;
  }

  async mount(container) {
    this.container = container;
    await this.loadOrders();
    this.render();
    this.bindEvents();
  }

  async loadOrders() {
    try {
      this.orders = await getOrders();
      this.applyFilter();
    } catch (err) {
      console.error('Failed to load order history:', err);
    }
  }

  applyFilter() {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredOrders = [...this.orders];
    } else {
      this.filteredOrders = this.orders.filter(order => 
        order.orderNumber.toLowerCase().includes(query) ||
        (order.customerName && order.customerName.toLowerCase().includes(query)) ||
        (order.customerPhone && order.customerPhone.includes(query)) ||
        (order.paymentMethod && order.paymentMethod.toLowerCase().includes(query))
      );
    }
  }

  render() {
    const ordersRows = this.filteredOrders.map(order => {
      const typeLabel = order.type === 'dinein' ? '🍽️ Dine In' : order.type === 'takeaway' ? '🥡 Takeaway' : '🛵 Delivery';
      const statusBadge = order.status === 'completed' 
        ? '<span class="badge badge-success" style="font-family: \'Plus Jakarta Sans\', sans-serif; font-weight: 700;">Completed</span>' 
        : order.status === 'ready' 
        ? '<span class="badge badge-success" style="font-family: \'Plus Jakarta Sans\', sans-serif; font-weight: 700; background:rgba(16,185,129,0.08); color:var(--color-success); border:1px solid rgba(16,185,129,0.25);">Ready</span>'
        : order.status === 'preparing'
        ? '<span class="badge badge-warning" style="font-family: \'Plus Jakarta Sans\', sans-serif; font-weight: 700; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25);">Cooking</span>'
        : '<span class="badge badge-danger" style="font-family: \'Plus Jakarta Sans\', sans-serif; font-weight: 700; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25);">Pending</span>';

      const payMethodLabel = order.paymentMethod === 'upi' ? '📱 UPI' : order.paymentMethod === 'cash' ? '💵 Cash' : 'Unpaid';
      const payStatusClass = order.paymentStatus === 'paid' ? 'text-success' : 'text-danger';

      return `
        <tr style="border-bottom: 1px solid var(--border-glass); font-size: var(--text-sm); cursor: pointer; transition: background var(--transition-fast);" class="order-row" data-id="${order.id}">
          <td style="padding: 16px 20px; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; color: var(--text-primary);">#${order.orderNumber.split('-').pop()}</td>
          <td style="padding: 16px 20px; color: var(--text-secondary); font-weight: 500;">${formatDateTime(order.createdAt)}</td>
          <td style="padding: 16px 20px; color: var(--text-primary); font-weight: 600;">${typeLabel}</td>
          <td style="padding: 16px 20px; font-weight: 800; color: var(--color-primary);">${formatCurrency(order.total)}</td>
          <td style="padding: 16px 20px; font-weight: 600; color: var(--text-primary);">${payMethodLabel} (<span class="${payStatusClass}" style="font-weight:700;">${order.paymentStatus}</span>)</td>
          <td style="padding: 16px 20px;">${statusBadge}</td>
          <td style="padding: 16px 20px; text-align: right;">
            <button class="btn btn-secondary btn-sm reprint-direct-btn" data-id="${order.id}" style="
              min-height: 32px; 
              padding: 6px 12px; 
              gap: 4px;
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              border: 1px solid var(--border-glass);
              background: rgba(255,255,255,0.02);
            ">
              <span class="material-symbols-rounded" style="font-size: 16px;">print</span>
              Print
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.container.innerHTML = `
      <div style="padding: 0 24px 24px 24px; max-width: 1000px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
          <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">Order Logs (${this.filteredOrders.length})</h3>
          
          <!-- Search Bar -->
          <div class="search-wrapper" style="width: 100%; max-width: 320px; position: relative;">
            <span class="material-symbols-rounded search-icon" style="
              position: absolute; 
              left: 12px; 
              top: 50%; 
              transform: translateY(-50%); 
              color: var(--text-secondary);
              font-size: 20px;
            ">search</span>
            <input type="text" id="order-search" class="input" placeholder="Search order #, customer..." value="${this.searchQuery}" style="
              padding-left: 42px; 
              height: 38px;
              background: rgba(0,0,0,0.2);
              border: 1px solid var(--border-glass);
              color: var(--text-primary);
              font-family: 'Inter', sans-serif;
              border-radius: var(--radius-md);
              width: 100%;
              box-sizing: border-box;
              outline: none;
              font-size: var(--text-sm);
              transition: all var(--transition-fast);
            ">
          </div>
        </div>

        <!-- Orders Table -->
        <div style="
          overflow-x: auto; 
          border: 1px solid var(--border-glass); 
          border-radius: var(--radius-xl); 
          background: rgba(17,17,30,0.3);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        " class="scrollbar-none">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-glass); background: rgba(255, 255, 255, 0.01); font-size: var(--text-xs); text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">
                <th style="padding: 16px 20px; font-weight: 700;">Token</th>
                <th style="padding: 16px 20px; font-weight: 700;">Date & Time</th>
                <th style="padding: 16px 20px; font-weight: 700;">Type</th>
                <th style="padding: 16px 20px; font-weight: 700;">Amount</th>
                <th style="padding: 16px 20px; font-weight: 700;">Payment</th>
                <th style="padding: 16px 20px; font-weight: 700;">Kitchen Status</th>
                <th style="padding: 16px 20px; font-weight: 700; text-align: right;">Receipt</th>
              </tr>
            </thead>
            <tbody>
              ${ordersRows.length > 0 ? ordersRows : `
                <tr>
                  <td colspan="7" style="padding: 48px; text-align: center; color: var(--text-muted); font-weight: 500;">
                    No matching orders found.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Interactive custom inputs border glows
    const searchInput = this.container.querySelector('#order-search');
    if (searchInput) {
      searchInput.addEventListener('focus', () => {
        searchInput.style.borderColor = 'var(--color-primary)';
        searchInput.style.boxShadow = '0 0 10px rgba(255, 94, 54, 0.25)';
      });
      searchInput.addEventListener('blur', () => {
        searchInput.style.borderColor = 'var(--border-glass)';
        searchInput.style.boxShadow = 'none';
      });
    }

    // Visual hover style for rows
    const style = document.createElement('style');
    style.innerHTML = `
      .order-row:hover {
        background: rgba(255,255,255,0.015) !important;
      }
    `;
    this.container.appendChild(style);
  }

  bindEvents() {
    // Search input event
    const searchInp = document.getElementById('order-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.applyFilter();
        this.render();
        this.bindEvents();
        // Keep focus at the end of text
        const input = document.getElementById('order-search');
        if (input) {
          input.focus();
          const val = input.value;
          input.value = '';
          input.value = val;
        }
      });
    }

    // Row click for detail modal
    this.container.querySelectorAll('.order-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.dataset.id);
        this.selectedOrder = this.orders.find(o => o.id === id);
        playSound(800, 100);
        this.showOrderDetailModal();
      });
    });

    // Reprint button direct click
    this.container.querySelectorAll('.reprint-direct-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Stop row click modal
        const id = parseInt(btn.dataset.id);
        const order = this.orders.find(o => o.id === id);
        playSound(800, 100);
        vibrateDevice([40]);
        await this.printReceipt(order);
      });
    });
  }

  showOrderDetailModal() {
    if (!this.selectedOrder) return;
    const order = this.selectedOrder;
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

    const itemsListHtml = items.map(item => `
      <div style="display:flex; justify-content:space-between; font-size:var(--text-sm); margin-bottom:10px;">
        <span style="color:var(--text-primary); font-weight: 600;">${item.quantity}x ${item.itemName}</span>
        <span style="font-weight: 700; color:var(--text-primary);">${formatCurrency(item.price * item.quantity)}</span>
      </div>
      ${item.notes ? `<div style="font-size:var(--text-xs); color:#FF8960; font-weight: 500; font-style:italic; margin-bottom:10px; margin-top:-6px; display: flex; align-items: center; gap: 4px;">
        <span class="material-symbols-rounded" style="font-size: 12px;">notes</span>
        * Note: ${item.notes}
      </div>` : ''}
    `).join('<div style="height: 1px; background: var(--border-glass); margin: 6px 0;"></div>');

    const modalHtml = `
      <div class="modal-overlay" id="order-detail-overlay" style="background: rgba(0,0,0,0.65); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 999;">
        <div class="modal card-glass" style="
          background: rgba(17,17,30,0.85); 
          border: 1px solid var(--border-glass); 
          border-radius: var(--radius-xl); 
          width: 100%; 
          max-width: 440px; 
          box-shadow: 0 25px 50px rgba(0,0,0,0.3);
          overflow: hidden;
          animation: modalFadeIn 300ms ease-out;
        ">
          <div class="modal-header" style="border-bottom: 1px solid var(--border-glass); padding: 20px 24px; display: flex; align-items: center; justify-content: space-between;">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">Receipt Inspector</h3>
            <button class="btn-icon" id="order-detail-close" style="background: transparent; border: none; cursor: pointer;"><span class="material-symbols-rounded" style="color: var(--text-secondary);">close</span></button>
          </div>
          
          <div class="modal-body scrollbar-none" style="display:flex; flex-direction:column; gap:18px; padding: 24px; max-height: 70vh; overflow-y: auto;">
            <!-- Summary Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-glass); padding-bottom:14px;">
              <div>
                <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size:1.25rem; font-weight: 800; color:var(--text-primary); letter-spacing: -0.01em;">Order #${order.orderNumber.split('-').pop()}</div>
                <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:4px; font-weight: 500;">${formatDateTime(order.createdAt)}</div>
              </div>
              <div class="badge badge-primary" style="
                font-family: 'Plus Jakarta Sans', sans-serif;
                padding:6px 12px; 
                font-size: var(--text-xs);
                font-weight: 700;
                letter-spacing: 0.05em;
              ">${order.type.toUpperCase()}</div>
            </div>

            <!-- Items -->
            <div>
              <h4 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size:var(--text-xs); color:var(--text-secondary); text-transform:uppercase; margin-bottom:10px; font-weight: 700; letter-spacing: 0.05em;">Items Ordered</h4>
              <div style="background: rgba(0,0,0,0.25); padding:16px; border-radius:var(--radius-xl); border:1px solid var(--border-glass);">
                ${itemsListHtml}
              </div>
            </div>

            <!-- Bill Split -->
            <div style="display:flex; flex-direction:column; gap:8px; font-size:var(--text-sm); border-bottom:1px solid var(--border-glass); padding-bottom:14px;">
              <div style="display:flex; justify-content:space-between; color:var(--text-secondary); font-weight: 500;">
                <span>Subtotal</span>
                <span>${formatCurrency(order.subtotal)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; color:var(--text-secondary); font-weight: 500;">
                <span>GST (Tax)</span>
                <span>${formatCurrency(order.tax)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; color:var(--color-primary); font-weight: 800; font-size:1.2rem; margin-top:6px; font-family: 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.01em;">
                <span>Total Bill</span>
                <span>${formatCurrency(order.total)}</span>
              </div>
            </div>

            <!-- Customer / Payment -->
            <div style="display:flex; flex-direction:column; gap:8px; font-size:var(--text-sm); font-weight: 500; color: var(--text-secondary);">
              ${order.customerName ? `<div style="display: flex; gap: 6px;"><strong style="color: var(--text-primary);">Customer:</strong> ${order.customerName} ${order.customerPhone ? `(${order.customerPhone})` : ''}</div>` : ''}
              <div style="display: flex; gap: 6px;"><strong style="color: var(--text-primary);">Payment Option:</strong> ${(order.paymentMethod || 'unpaid').toUpperCase()} (${order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'})</div>
              <div style="display: flex; gap: 6px;"><strong style="color: var(--text-primary);">Kitchen Status:</strong> ${order.status.toUpperCase()}</div>
            </div>

          </div>
          
          <div class="modal-footer" style="border-top: 1px solid var(--border-glass); padding: 16px 24px; display: flex; flex-direction: column; gap:10px;">
            ${order.paymentStatus !== 'paid' ? `
              <button class="btn btn-block" id="btn-modal-pay-cash" style="
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                min-height: 38px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                background: #10B981 !important;
                color: #ffffff !important;
                border: none;
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">payments</span>
                Paid via Cash
              </button>
              <button class="btn btn-block" id="btn-modal-pay-upi" style="
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                min-height: 38px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                background: #3B82F6 !important;
                color: #ffffff !important;
                border: none;
              ">
                <span class="material-symbols-rounded" style="font-size: 18px;">qr_code_scanner</span>
                Paid via UPI
              </button>
            ` : ''}
            <button class="btn btn-primary btn-block" id="btn-modal-reprint" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 38px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              box-shadow: var(--shadow-primary);
            ">
              <span class="material-symbols-rounded" style="font-size: 18px;">print</span>
              Reprint Thermal Receipt
            </button>
            <button class="btn btn-block" id="btn-modal-whatsapp" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 38px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              background: #25D366 !important;
              color: #ffffff !important;
              border: none;
            ">
              <span class="material-symbols-rounded" style="font-size: 18px;">chat</span>
              Send on WhatsApp
            </button>
            <button class="btn btn-secondary btn-block" id="btn-modal-close-footer" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 38px;
              background: rgba(255,255,255,0.02);
              border: 1px solid var(--border-glass);
            ">Close Inspector</button>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'detail-modal-wrapper';
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper);

    // Bind modal handlers
    const close = () => {
      playSound(700, 80);
      wrapper.remove();
    };

    document.getElementById('order-detail-close').addEventListener('click', close);
    document.getElementById('btn-modal-close-footer').addEventListener('click', close);
    document.getElementById('order-detail-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('order-detail-overlay')) close();
    });

    document.getElementById('btn-modal-reprint').addEventListener('click', async () => {
      playSound(800, 100);
      vibrateDevice([40]);
      await this.printReceipt(order);
    });

    document.getElementById('btn-modal-whatsapp').addEventListener('click', async () => {
      playSound(800, 100);
      vibrateDevice([40]);
      let phone = order.customerPhone || '';
      const inputPhone = prompt('Enter customer WhatsApp number (10 digits):', phone);
      if (inputPhone === null) return; // user cancelled
      try {
        await sendBillOnWhatsApp(order, inputPhone);
        showToast('Opening WhatsApp...', 'success');
      } catch (error) {
        showToast('Failed to open WhatsApp: ' + error.message, 'error');
      }
    });

    if (order.paymentStatus !== 'paid') {
      const handlePayment = async (method) => {
        playSound(800, 100);
        vibrateDevice([40]);
        try {
          const result = await db.orders.update(order.id, {
            paymentStatus: 'paid',
            paymentMethod: method,
            status: 'confirmed',
            isSynced: 0
          });

          if (result > 0) {
            const updatedOrder = await getOrder(order.id);
            if (updatedOrder) {
              try {
                const { syncService } = await import('../../services/sync.js');
                await syncService.syncUpOrder(updatedOrder);
              } catch (err) {
                console.error('[Sync] Failed to sync updated order:', err);
              }
              
              showToast('Payment collected!', 'success');
              
              // Automatically print receipt
              await this.printReceipt(updatedOrder);
              
              // Close modal
              close();
              
              // Reload orders and re-render/re-bind
              await this.loadOrders();
              this.render();
              this.bindEvents();
            } else {
              showToast('Failed to retrieve updated order.', 'error');
            }
          } else {
            showToast('Failed to update order payment in database.', 'error');
          }
        } catch (error) {
          console.error('[Payment] Collection failed:', error);
          showToast('Payment collection failed: ' + error.message, 'error');
        }
      };

      document.getElementById('btn-modal-pay-cash').addEventListener('click', () => handlePayment('cash'));
      document.getElementById('btn-modal-pay-upi').addEventListener('click', () => handlePayment('upi'));
    }
  }

  async printReceipt(order) {
    if (!printerService.isConnected) {
      showToast('Printer is not connected! Connect printer in settings.', 'warning', 4000);
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
      showToast('Receipt printed successfully!', 'success');
    } catch (error) {
      console.error('Reprint failed:', error);
      showToast('Print failed: ' + error.message, 'error');
    }
  }

  unmount() {
    this.container = null;
    const wrapper = document.getElementById('detail-modal-wrapper');
    if (wrapper) wrapper.remove();
  }
}
