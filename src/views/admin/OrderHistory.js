import { db, getOrder, getOrders, getSetting, updateOrderFields, updatePayment } from '../../db/database.js';
import { ReceiptBuilder } from '../../services/receipt.js';
import { printerService } from '../../services/printer.js';
import { sendBillOnWhatsApp } from '../../services/whatsapp.js';
import { authService } from '../../services/auth.js';
import { escapeHtml, formatCurrency, formatDateTime, parseOrderItems, playSound, showToast, vibrateDevice } from '../../utils/helpers.js';

export class OrderHistory {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.orders = [];
    this.filteredOrders = [];
    this.deliveryStaff = [];
    this.searchQuery = '';
  }

  async mount(container) {
    this.container = container;
    await this.loadData();
    this.render();
  }

  async loadData() {
    this.orders = await getOrders();
    this.deliveryStaff = (await db.staff.toArray())
      .filter(staff => staff.role === 'delivery' && (staff.isActive === 1 || staff.isActive === true));
    this.applyFilter();
  }

  applyFilter() {
    const query = this.searchQuery.toLowerCase().trim();
    this.filteredOrders = !query ? [...this.orders] : this.orders.filter(order => {
      return [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        order.type,
        order.paymentMethod,
        order.paymentStatus,
        order.deliveryStatus,
        order.deliveryStaffName
      ].some(value => String(value || '').toLowerCase().includes(query));
    });
  }

  render() {
    const rows = this.filteredOrders.map(order => `
      <tr class="order-row" data-id="${order.id}" style="border-bottom:1px solid var(--border-glass);cursor:pointer;">
        <td style="${this.tdStyle('font-weight:900;color:var(--text-primary);')}">#${escapeHtml(order.orderNumber.split('-').pop())}</td>
        <td style="${this.tdStyle()}">${escapeHtml(formatDateTime(order.createdAt))}</td>
        <td style="${this.tdStyle('font-weight:800;color:var(--text-primary);')}">${this.typeBadge(order)}</td>
        <td style="${this.tdStyle('font-weight:900;color:var(--color-primary);')}">${formatCurrency(order.total)}</td>
        <td style="${this.tdStyle()}">${this.paymentBadge(order)}</td>
        <td style="${this.tdStyle()}">${this.statusBadge(order.status)}</td>
        <td style="${this.tdStyle()}">${this.deliveryBadge(order)}</td>
        <td style="${this.tdStyle('text-align:right;')}">
          <button class="btn btn-secondary btn-sm print-btn" data-id="${order.id}" style="min-height:32px;padding:6px 10px;border:1px solid var(--border-glass);background:rgba(255,255,255,0.02);">
            <span class="material-symbols-rounded" style="font-size:16px;">print</span>
          </button>
        </td>
      </tr>
    `).join('');

    this.container.innerHTML = `
      <div style="padding:0 24px 24px;max-width:1180px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
          <h3 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:1.15rem;font-weight:900;color:var(--text-primary);margin:0;">Orders & Delivery (${this.filteredOrders.length})</h3>
          <div style="position:relative;width:100%;max-width:360px;">
            <span class="material-symbols-rounded" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:20px;color:var(--text-secondary);">search</span>
            <input id="order-search" class="input" value="${escapeHtml(this.searchQuery)}" placeholder="Search order, customer, driver..." style="padding-left:42px;height:38px;background:rgba(0,0,0,0.2);border:1px solid var(--border-glass);border-radius:8px;width:100%;box-sizing:border-box;color:var(--text-primary);">
          </div>
        </div>

        <div style="overflow-x:auto;border:1px solid var(--border-glass);border-radius:8px;background:rgba(17,17,30,0.28);" class="scrollbar-none">
          <table style="width:100%;border-collapse:collapse;text-align:left;min-width:920px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-glass);background:rgba(255,255,255,0.02);font-size:var(--text-xs);color:var(--text-secondary);text-transform:uppercase;">
                <th style="${this.thStyle()}">Token</th>
                <th style="${this.thStyle()}">Date</th>
                <th style="${this.thStyle()}">Type</th>
                <th style="${this.thStyle()}">Amount</th>
                <th style="${this.thStyle()}">Payment</th>
                <th style="${this.thStyle()}">Kitchen</th>
                <th style="${this.thStyle()}">Delivery</th>
                <th style="${this.thStyle('text-align:right;')}">Receipt</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="8" style="padding:44px;text-align:center;color:var(--text-muted);">No matching orders found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelector('#order-search')?.addEventListener('input', event => {
      this.searchQuery = event.target.value;
      this.applyFilter();
      this.render();
      this.container.querySelector('#order-search')?.focus();
    });

    this.container.querySelectorAll('.order-row').forEach(row => {
      row.addEventListener('click', () => {
        const order = this.orders.find(o => o.id === parseInt(row.dataset.id, 10));
        if (order) this.showOrderDetailModal(order);
      });
    });

    this.container.querySelectorAll('.print-btn').forEach(btn => {
      btn.addEventListener('click', async event => {
        event.stopPropagation();
        const order = this.orders.find(o => o.id === parseInt(btn.dataset.id, 10));
        if (order) await this.printReceipt(order);
      });
    });
  }

  showOrderDetailModal(order) {
    const items = parseOrderItems(order.items);
    const staffOptions = this.deliveryStaff.map(staff => `
      <option value="${staff.id}" ${String(order.deliveryStaffId || '') === String(staff.id) ? 'selected' : ''}>${escapeHtml(staff.name)}${staff.phone ? ` (${escapeHtml(staff.phone)})` : ''}</option>
    `).join('');

    const wrapper = document.createElement('div');
    wrapper.id = 'detail-modal-wrapper';
    wrapper.innerHTML = `
      <div id="order-detail-overlay" class="modal-overlay" style="background:rgba(0,0,0,0.65);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;z-index:999;">
        <div class="modal card-glass" style="width:100%;max-width:560px;max-height:88vh;overflow:hidden;background:rgba(17,17,30,0.92);border:1px solid var(--border-glass);border-radius:8px;box-shadow:var(--shadow-modal);">
          <header style="padding:18px 22px;border-bottom:1px solid var(--border-glass);display:flex;align-items:center;justify-content:space-between;">
            <div>
              <h3 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:1.1rem;font-weight:900;color:var(--text-primary);margin:0;">Order #${escapeHtml(order.orderNumber.split('-').pop())}</h3>
              <div style="font-size:var(--text-xs);color:var(--text-muted);font-weight:700;margin-top:4px;">${escapeHtml(formatDateTime(order.createdAt))}</div>
            </div>
            <button class="btn-icon" id="order-detail-close" style="background:transparent;border:0;"><span class="material-symbols-rounded">close</span></button>
          </header>

          <main style="padding:20px 22px;overflow-y:auto;max-height:calc(88vh - 190px);display:flex;flex-direction:column;gap:16px;" class="scrollbar-none">
            ${this.detailSection('Items', items.map(item => `
              <div style="display:flex;justify-content:space-between;gap:12px;font-size:var(--text-sm);padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                <div><strong>${item.quantity || 1}x</strong> ${escapeHtml(item.itemName || item.name || 'Item')}${item.notes ? `<div style="font-size:var(--text-xs);color:var(--color-warning);margin-top:2px;">${escapeHtml(item.notes)}</div>` : ''}</div>
                <strong>${formatCurrency((item.price || 0) * (item.quantity || 1))}</strong>
              </div>
            `).join(''))}

            ${this.detailSection('Bill', `
              <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong>${formatCurrency(order.subtotal)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span>Tax</span><strong>${formatCurrency(order.tax)}</strong></div>
              ${order.deliveryFee ? `<div style="display:flex;justify-content:space-between;"><span>Delivery fee</span><strong>${formatCurrency(order.deliveryFee)}</strong></div>` : ''}
              <div style="display:flex;justify-content:space-between;font-size:1.1rem;color:var(--color-primary);font-weight:900;border-top:1px solid var(--border-glass);padding-top:8px;"><span>Total</span><span>${formatCurrency(order.total)}</span></div>
            `)}

            ${this.detailSection('Customer', `
              <div><strong>Name:</strong> ${escapeHtml(order.customerName || 'Not provided')}</div>
              <div><strong>Phone:</strong> ${escapeHtml(order.customerPhone || 'Not provided')}</div>
              ${order.type === 'delivery' ? `
                <div><strong>Address:</strong> ${escapeHtml(order.deliveryAddress || 'Missing')}</div>
                ${order.deliveryLandmark ? `<div><strong>Landmark:</strong> ${escapeHtml(order.deliveryLandmark)}</div>` : ''}
              ` : ''}
            `)}

            ${this.detailSection('Payment', `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                ${this.paymentBadge(order)}
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  ${order.paymentStatus !== 'paid' ? `
                    <button class="btn btn-secondary btn-sm" id="btn-verify-upi">Verify UPI</button>
                    <button class="btn btn-secondary btn-sm" id="btn-collect-cash">Collect Cash</button>
                  ` : `<span class="badge badge-success">Verified ${escapeHtml(order.paymentVerifiedAt ? formatDateTime(order.paymentVerifiedAt) : '')}</span>`}
                </div>
              </div>
            `)}

            ${order.type === 'delivery' ? this.detailSection('Delivery Dispatch', `
              <div style="display:flex;flex-direction:column;gap:10px;">
                <div>${this.deliveryBadge(order)}</div>
                <select id="delivery-staff-select" class="input" style="padding:10px 12px;background:rgba(0,0,0,0.22);border:1px solid var(--border-glass);border-radius:8px;color:var(--text-primary);">
                  <option value="">Select delivery staff</option>
                  ${staffOptions}
                </select>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px;">
                  <button class="btn btn-secondary btn-sm" id="btn-assign-delivery">Assign</button>
                  <button class="btn btn-secondary btn-sm" id="btn-out-delivery">Out for Delivery</button>
                  <button class="btn btn-primary btn-sm" id="btn-delivered">Delivered</button>
                  <button class="btn btn-danger btn-sm" id="btn-delivery-failed">Failed</button>
                </div>
              </div>
            `) : ''}
          </main>

          <footer style="padding:16px 22px;border-top:1px solid var(--border-glass);display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">
            <button class="btn btn-primary btn-sm" id="btn-modal-reprint">Print Receipt</button>
            <button class="btn btn-secondary btn-sm" id="btn-modal-whatsapp">WhatsApp Bill</button>
            <button class="btn btn-secondary btn-sm" id="btn-modal-close-footer">Close</button>
          </footer>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const close = () => wrapper.remove();
    wrapper.querySelector('#order-detail-close')?.addEventListener('click', close);
    wrapper.querySelector('#btn-modal-close-footer')?.addEventListener('click', close);
    wrapper.querySelector('#order-detail-overlay')?.addEventListener('click', event => {
      if (event.target.id === 'order-detail-overlay') close();
    });
    wrapper.querySelector('#btn-modal-reprint')?.addEventListener('click', () => this.printReceipt(order));
    wrapper.querySelector('#btn-modal-whatsapp')?.addEventListener('click', () => this.sendWhatsApp(order));
    wrapper.querySelector('#btn-verify-upi')?.addEventListener('click', () => this.markPaid(order, 'upi', close));
    wrapper.querySelector('#btn-collect-cash')?.addEventListener('click', () => this.markPaid(order, 'cash', close));
    wrapper.querySelector('#btn-assign-delivery')?.addEventListener('click', () => this.assignDelivery(order, wrapper, close));
    wrapper.querySelector('#btn-out-delivery')?.addEventListener('click', () => this.markOutForDelivery(order, close));
    wrapper.querySelector('#btn-delivered')?.addEventListener('click', () => this.markDelivered(order, close));
    wrapper.querySelector('#btn-delivery-failed')?.addEventListener('click', () => this.markDeliveryFailed(order, close));
  }

  async markPaid(order, method, close) {
    const reference = method === 'upi' ? (prompt('Enter UPI reference/UTR (optional):', order.paymentReference || '') || '') : '';
    const staff = authService.getCurrentStaff();
    await updatePayment(order.id, method, 'paid', {
      paymentReference: reference,
      paymentVerifiedAt: new Date().toISOString(),
      paymentVerifiedBy: staff?.name || 'Staff',
      paymentCollectedAt: new Date().toISOString()
    });
    showToast('Payment marked paid', 'success');
    close();
    await this.reload();
  }

  async assignDelivery(order, wrapper, close) {
    const staffId = wrapper.querySelector('#delivery-staff-select')?.value;
    if (!staffId) {
      showToast('Select delivery staff first', 'warning');
      return;
    }
    const staff = this.deliveryStaff.find(s => String(s.id) === String(staffId));
    await updateOrderFields(order.id, {
      deliveryStaffId: staff.id,
      deliveryStaffName: staff.name,
      deliveryStatus: 'assigned',
      deliveryAssignedAt: new Date().toISOString()
    });
    showToast(`Assigned to ${staff.name}`, 'success');
    close();
    await this.reload();
  }

  async markOutForDelivery(order, close) {
    if (!order.deliveryStaffId) {
      showToast('Assign delivery staff before dispatch', 'warning');
      return;
    }
    await updateOrderFields(order.id, {
      deliveryStatus: 'out_for_delivery',
      deliveryOutAt: new Date().toISOString()
    });
    showToast('Order marked out for delivery', 'success');
    close();
    await this.reload();
  }

  async markDelivered(order, close) {
    const updates = {
      deliveryStatus: 'delivered',
      deliveredAt: new Date().toISOString(),
      status: 'completed',
      completedAt: new Date().toISOString()
    };
    if (order.paymentStatus !== 'paid' && order.paymentMethod === 'cash') {
      Object.assign(updates, {
        paymentStatus: 'paid',
        paymentCollectedAt: new Date().toISOString(),
        paymentVerifiedAt: new Date().toISOString(),
        paymentVerifiedBy: authService.getCurrentStaff()?.name || 'Delivery'
      });
    }
    await updateOrderFields(order.id, updates);
    showToast('Delivery completed', 'success');
    close();
    await this.reload();
  }

  async markDeliveryFailed(order, close) {
    const reason = prompt('Reason for failed delivery:', order.deliveryNotes || '') || '';
    await updateOrderFields(order.id, {
      deliveryStatus: 'failed',
      deliveryNotes: reason
    });
    showToast('Delivery marked failed', 'warning');
    close();
    await this.reload();
  }

  async reload() {
    await this.loadData();
    this.render();
  }

  async printReceipt(order) {
    if (!printerService.isConnected) {
      showToast('Printer is not connected', 'warning', 4000);
      return;
    }
    const settings = {
      restaurantName: await getSetting('restaurantName') || 'The Taste',
      restaurantTagline: await getSetting('restaurantTagline') || 'Fast Food & Chinese',
      restaurantPhone: await getSetting('restaurantPhone') || '',
      restaurantAddress: await getSetting('restaurantAddress') || '',
      printerWidth: await getSetting('printerWidth') || '58',
    };
    const latest = await getOrder(order.id) || order;
    await printerService.print(ReceiptBuilder.orderReceipt(latest, settings));
    playSound(800, 80);
    vibrateDevice([30]);
    showToast('Receipt printed', 'success');
  }

  async sendWhatsApp(order) {
    const inputPhone = prompt('Enter customer WhatsApp number:', order.customerPhone || '');
    if (inputPhone === null) return;
    await sendBillOnWhatsApp(order, inputPhone);
    showToast('Opening WhatsApp...', 'success');
  }

  detailSection(title, body) {
    return `
      <section style="padding:14px;border:1px solid var(--border-glass);border-radius:8px;background:rgba(255,255,255,0.02);font-size:var(--text-sm);color:var(--text-secondary);display:flex;flex-direction:column;gap:8px;">
        <h4 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-xs);font-weight:900;color:var(--text-primary);text-transform:uppercase;letter-spacing:0.06em;margin:0;">${escapeHtml(title)}</h4>
        ${body}
      </section>
    `;
  }

  typeBadge(order) {
    const labels = { dinein: 'Dine-In', takeaway: 'Pickup', delivery: 'Delivery' };
    return `<span class="badge badge-primary">${labels[order.type] || escapeHtml(order.type || 'Order')}</span>`;
  }

  paymentBadge(order) {
    const paid = order.paymentStatus === 'paid';
    const pending = order.paymentStatus === 'pending';
    const label = `${(order.paymentMethod || 'unpaid').toUpperCase()} / ${(order.paymentStatus || 'unpaid').toUpperCase()}`;
    const cls = paid ? 'badge-success' : pending ? 'badge-warning' : 'badge-danger';
    return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
  }

  statusBadge(status) {
    const cls = status === 'completed' || status === 'ready' ? 'badge-success' : status === 'preparing' ? 'badge-warning' : 'badge-danger';
    return `<span class="badge ${cls}">${escapeHtml(status || 'pending')}</span>`;
  }

  deliveryBadge(order) {
    if (order.type !== 'delivery') return '<span style="color:var(--text-muted);font-size:var(--text-xs);">Not delivery</span>';
    const status = order.deliveryStatus || 'pending';
    const cls = status === 'delivered' ? 'badge-success' : status === 'failed' ? 'badge-danger' : 'badge-warning';
    const driver = order.deliveryStaffName ? ` - ${order.deliveryStaffName}` : '';
    return `<span class="badge ${cls}">${escapeHtml(status.replace(/_/g, ' ') + driver)}</span>`;
  }

  thStyle(extra = '') {
    return `padding:14px 16px;font-weight:900;${extra}`;
  }

  tdStyle(extra = '') {
    return `padding:14px 16px;font-size:var(--text-sm);color:var(--text-secondary);${extra}`;
  }

  unmount() {
    this.container = null;
    document.getElementById('detail-modal-wrapper')?.remove();
  }
}
