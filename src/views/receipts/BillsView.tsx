/**
 * Today's bills — one screen, one job: find a bill from today and print it again.
 *
 * A customer comes back to the counter and asks for their receipt, or the printer ate one, or a
 * cook pressed the wrong button. Before this, only developer, owner, manager, cashier and delivery
 * could reach a screen that reprints, because reprinting lived inside the full Orders console —
 * which also carries customer names, phone numbers, delivery addresses, staff assignment and
 * payment editing. Handing a cook all of that so they can hand back a slip of paper is the wrong
 * trade, so this is its own screen instead.
 *
 * Two deliberate limits, and they are the same limit seen from two sides:
 *
 *   - **Today only.** It answers the question actually being asked. It also means the amount of
 *     customer data on screen for a role that does not otherwise see any is one service's worth.
 *   - **Read and print. Nothing else.** No status changes, no payment edits, no cancellation. Every
 *     one of those already has a screen, gated to the people who should be doing it.
 *
 * The server is not the boundary here — `staff read orders` already admits every role, because the
 * kitchen board needs it. This screen is about giving the capability a door rather than widening
 * what the database allows.
 */

import { getOrders, getOrder, getSetting } from '../../db/database';
import { InvoiceGenerator } from '../../services/invoiceGenerator';
import { printerService } from '../../services/printer';
import { ReceiptBuilder } from '../../services/receipt';
import {
  escapeHtml,
  formatCurrency,
  formatTime,
  parseOrderItems,
  playSound,
  showToast,
  vibrateDevice
} from '../../utils/helpers';

/**
 * The service day, not the calendar day.
 *
 * An order rung up at 00:30 belongs to the evening that has not finished yet. Cutting at midnight
 * would empty this screen in the middle of a late service, which is exactly when someone is most
 * likely to ask for a duplicate.
 */
const SERVICE_DAY_STARTS_AT_HOUR = 4;

export function serviceDayStart(now = new Date()) {
  const start = new Date(now);
  start.setHours(SERVICE_DAY_STARTS_AT_HOUR, 0, 0, 0);
  if (now.getTime() < start.getTime()) start.setDate(start.getDate() - 1);
  return start;
}

/** Status words come from one list so a cook and a cashier read the same ticket the same way. */
const STATUS_WORD = {
  pending: 'New',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Served',
  cancelled: 'Cancelled'
};

const PAYMENT_WORD = {
  paid: 'Paid',
  partial: 'Part paid',
  refunded: 'Refunded',
  failed: 'Payment failed',
  unpaid: 'Unpaid',
  pending: 'Unpaid'
};

export class BillsView {
  declare app: any;
  declare container: any;
  declare orders: any[];
  declare query: string;
  declare state: 'loading' | 'ready' | 'error';
  declare error: string;
  declare refreshInterval: any;
  declare onSyncDataChanged: any;

  constructor(app?: any) {
    this.app = app;
    this.container = null;
    this.orders = [];
    this.query = '';
    this.state = 'loading';
    this.error = '';
    this.refreshInterval = null;
    this.onSyncDataChanged = null;
  }

  async mount(container: HTMLElement) {
    this.container = container;
    this.render();
    await this.load(true);

    this.onSyncDataChanged = (event: any) => {
      if (event.detail?.storeName !== 'orders') return;
      this.load();
    };
    window.addEventListener('sync-data-changed', this.onSyncDataChanged);
    this.refreshInterval = setInterval(() => this.load(true), 30000);
  }

  async load(forceRefresh = false) {
    try {
      const all = await getOrders(undefined, forceRefresh);
      const since = serviceDayStart().getTime();
      this.orders = all.filter((order: any) => {
        const at = new Date(order.createdAt).getTime();
        return Number.isFinite(at) && at >= since;
      });
      this.state = 'ready';
      this.error = '';
    } catch (error: any) {
      // Offline is not an error state here: getOrders falls back to this device's cache, so the
      // bills from this service are still printable. Only a real failure gets the error panel.
      console.error('[Bills] Could not load today\'s orders:', error);
      this.state = 'error';
      this.error = error?.message || String(error);
    }
    this.renderList();
  }

  get visible() {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.orders;
    return this.orders.filter((order: any) =>
      String(order.orderNumber || '').toLowerCase().includes(q)
      || String(order.customerPhone || '').includes(q)
      || String(order.customerName || '').toLowerCase().includes(q)
    );
  }

  render() {
    const day = serviceDayStart();
    this.container.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden; background: var(--bg-primary);">
        <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:center; padding:16px 24px; background: var(--glass-bg); border-bottom:1px solid var(--border-glass);">
          <div>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif; font-size:var(--text-lg); font-weight:800; color:var(--text-primary); letter-spacing:-0.02em; margin:0;">Today's bills</h2>
            <p style="margin:2px 0 0; font-size:var(--text-sm); color:var(--text-secondary);">
              Reprint a receipt from this service &middot; since ${escapeHtml(formatTime(day))}
            </p>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <label for="bills-search" class="sr-only">Search today's bills</label>
            <input id="bills-search" class="input" type="search" inputmode="search" placeholder="Order number or phone"
              style="min-height:44px; min-width:min(260px, 60vw);" autocomplete="off" />
            <button class="btn btn-secondary" id="bills-refresh" style="min-height:44px; min-width:44px;">
              <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>
        <div id="bills-list" style="flex:1; overflow-y:auto; padding:16px 24px 32px;"></div>
      </div>
    `;

    const search = this.container.querySelector('#bills-search') as HTMLInputElement;
    search?.addEventListener('input', () => {
      this.query = search.value;
      this.renderList();
    });
    this.container.querySelector('#bills-refresh')?.addEventListener('click', () => {
      this.state = 'loading';
      this.renderList();
      this.load(true);
    });
  }

  renderList() {
    const list = this.container?.querySelector('#bills-list');
    if (!list) return;

    if (this.state === 'loading') {
      list.innerHTML = `<p style="color:var(--text-secondary); padding:24px 0;">Getting today's bills…</p>`;
      return;
    }

    if (this.state === 'error') {
      list.innerHTML = `
        <div class="card" style="padding:24px; max-width:520px;">
          <h3 style="margin:0 0 6px; font-size:var(--text-base);">Couldn't load today's bills</h3>
          <p style="margin:0 0 14px; color:var(--text-secondary); font-size:var(--text-sm);">
            ${escapeHtml(this.error)}
          </p>
          <button class="btn btn-primary" id="bills-retry" style="min-height:44px;">Try again</button>
        </div>`;
      list.querySelector('#bills-retry')?.addEventListener('click', () => {
        this.state = 'loading';
        this.renderList();
        this.load(true);
      });
      return;
    }

    const rows = this.visible;
    if (!rows.length) {
      const searching = Boolean(this.query.trim());
      list.innerHTML = `
        <div style="padding:32px 0; max-width:520px;">
          <h3 style="margin:0 0 6px; font-size:var(--text-base); color:var(--text-primary);">
            ${searching ? 'No bill matches that' : 'No bills yet today'}
          </h3>
          <p style="margin:0; color:var(--text-secondary); font-size:var(--text-sm);">
            ${searching
              ? 'Try the order number without its prefix, or the phone number the order was taken on.'
              : 'Bills appear here as orders are rung up. Only this service is shown.'}
          </p>
        </div>`;
      return;
    }

    list.innerHTML = `
      <p style="margin:0 0 12px; color:var(--text-secondary); font-size:var(--text-sm);">
        ${rows.length} bill${rows.length === 1 ? '' : 's'} this service
      </p>
      <div style="display:grid; gap:10px;">
        ${rows.map((order: any) => this.card(order)).join('')}
      </div>`;

    list.querySelectorAll('[data-print-order]').forEach((button: any) => {
      button.addEventListener('click', () => this.reprint(Number(button.dataset.printOrder), button));
    });
  }

  card(order: any) {
    const items = parseOrderItems(order.items);
    const lines = items
      .slice(0, 3)
      .map((item: any) => `${escapeHtml(item.quantity || item.qty || 1)}× ${escapeHtml(item.itemName || item.name || 'Item')}`)
      .join(', ');
    const more = items.length > 3 ? ` +${items.length - 3} more` : '';

    const status = STATUS_WORD[String(order.status)] || String(order.status || '');
    const payment = PAYMENT_WORD[String(order.paymentStatus)] || String(order.paymentStatus || '');
    // Law 4: the word carries the meaning; the glyph and colour only reinforce it.
    const settled = String(order.paymentStatus) === 'paid';
    const voided = String(order.status) === 'cancelled';

    return `
      <div class="card" style="padding:14px 16px; display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;">
        <div style="min-width:min(260px, 100%); flex:1;">
          <div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;">
            <strong style="font-size:var(--text-base); color:var(--text-primary); font-variant-numeric:tabular-nums;">
              ${escapeHtml(order.orderNumber || `#${order.id}`)}
            </strong>
            <span style="font-size:var(--text-sm); color:var(--text-secondary);">${escapeHtml(formatTime(order.createdAt))}</span>
            <span style="font-size:var(--text-xs); font-weight:700; color:${voided ? 'var(--color-danger)' : 'var(--text-secondary)'};">
              <span class="material-symbols-rounded" aria-hidden="true" style="font-size:14px; vertical-align:-2px;">${voided ? 'block' : 'schedule'}</span>
              ${escapeHtml(status)}
            </span>
            <span style="font-size:var(--text-xs); font-weight:700; color:${settled ? 'var(--color-success)' : 'var(--color-warning)'};">
              <span class="material-symbols-rounded" aria-hidden="true" style="font-size:14px; vertical-align:-2px;">${settled ? 'check_circle' : 'pending'}</span>
              ${escapeHtml(payment)}
            </span>
          </div>
          <p style="margin:4px 0 0; font-size:var(--text-sm); color:var(--text-secondary);">
            ${escapeHtml(lines)}${escapeHtml(more)}
          </p>
        </div>
        <div style="display:flex; align-items:center; gap:14px;">
          <strong style="font-size:var(--text-base); font-variant-numeric:tabular-nums; color:var(--text-primary);">
            ${escapeHtml(formatCurrency(order.total))}
          </strong>
          <button class="btn btn-primary" data-print-order="${escapeHtml(order.id)}" style="min-height:44px;">
            <span class="material-symbols-rounded" aria-hidden="true">print</span>
            <span>Reprint bill</span>
          </button>
        </div>
      </div>`;
  }

  async reprint(orderId: number, button?: HTMLButtonElement) {
    const original = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span>Printing…</span>';
    }
    try {
      // Always the server's copy: a bill reprinted from a stale local row is a bill that disagrees
      // with the one the customer was originally handed.
      const order = (await getOrder(orderId)) || this.orders.find((o: any) => o.id === orderId);
      if (!order) throw new Error('That order is no longer available.');

      const settings = {
        restaurantName: (await getSetting('restaurantName')) || 'The Taste',
        restaurantTagline: (await getSetting('restaurantTagline')) || '',
        restaurantPhone: (await getSetting('restaurantPhone')) || '',
        restaurantAddress: (await getSetting('restaurantAddress')) || '',
        printerWidth: (await getSetting('printerWidth')) || '58',
        gstin: (await getSetting('gstin')) || '',
        fssaiNumber: (await getSetting('fssaiNumber')) || '',
        receiptFooter: (await getSetting('receiptFooter')) || '',
        invoiceTemplate: (await getSetting('invoiceTemplate')) || 'minimalist',
        invoiceTitle: (await getSetting('invoiceTitle')) || 'TAX INVOICE',
        invoiceTerms: (await getSetting('invoiceTerms')) || ''
      };

      if (printerService.isConnected) {
        await printerService.print(ReceiptBuilder.orderReceipt(order, settings));
        playSound(800, 80);
        vibrateDevice([30]);
        showToast(`Reprinted ${order.orderNumber}`, 'success');
        return;
      }

      // No thermal printer on this device — a tablet on the floor, a laptop in the office. The
      // customer is still standing there, so hand the bill to whatever the browser can print to
      // rather than refusing outright.
      this.printInBrowser(order, settings);
      showToast(`No thermal printer here — opened ${order.orderNumber} for printing`, 'info', 6000);
    } catch (error: any) {
      console.error('[Bills] Reprint failed:', error);
      showToast(`Couldn't reprint that bill: ${error?.message || error}`, 'error', 6000);
    } finally {
      if (button) {
        button.disabled = false;
        if (original) button.innerHTML = original;
      }
    }
  }

  printInBrowser(order: any, settings: any) {
    const html = InvoiceGenerator.generateInvoiceHTML(order, settings);
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      throw new Error('This browser would not open a print window.');
    }
    doc.open();
    doc.write(html);
    doc.close();
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      // The dialog is modal, so the frame can only go once it has been dismissed.
      setTimeout(() => frame.remove(), 60000);
    };
  }

  unmount() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.onSyncDataChanged) {
      window.removeEventListener('sync-data-changed', this.onSyncDataChanged);
      this.onSyncDataChanged = null;
    }
    this.container = null;
  }
}
