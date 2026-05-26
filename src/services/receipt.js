import { formatDate, formatTime } from '../utils/helpers.js';

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const encoder = new TextEncoder();

/**
 * ESC/POS receipt builder.
 * Builds raw byte arrays for thermal printers using chainable methods.
 */
export class ReceiptBuilder {
  /**
   * @param {number} paperWidth - Character width (32 for 58mm, 48 for 80mm)
   */
  constructor(paperWidth = 32) {
    this.paperWidth = paperWidth;
    /** @type {number[]} */
    this.buffer = [];
  }

  // ── ESC/POS Commands ────────────────────────────────────────

  /** ESC @ — Initialize / reset printer. */
  initialize() {
    this.buffer.push(ESC, 0x40);
    return this;
  }

  /** ESC a 1 — Center alignment. */
  center() {
    this.buffer.push(ESC, 0x61, 0x01);
    return this;
  }

  /** ESC a 0 — Left alignment. */
  left() {
    this.buffer.push(ESC, 0x61, 0x00);
    return this;
  }

  /** ESC a 2 — Right alignment. */
  right() {
    this.buffer.push(ESC, 0x61, 0x02);
    return this;
  }

  /**
   * ESC E n — Toggle bold.
   * @param {boolean} on
   */
  bold(on = true) {
    this.buffer.push(ESC, 0x45, on ? 0x01 : 0x00);
    return this;
  }

  /** GS ! 0x11 — Double width + double height. */
  big() {
    this.buffer.push(GS, 0x21, 0x11);
    return this;
  }

  /** GS ! 0x00 — Normal character size. */
  normal() {
    this.buffer.push(GS, 0x21, 0x00);
    return this;
  }

  /**
   * Encode a text string and append a line feed.
   * @param {string} str
   */
  text(str) {
    const bytes = encoder.encode(str);
    this.buffer.push(...bytes, LF);
    return this;
  }

  /**
   * Print a full-width line of a repeated character.
   * @param {string} char - Single character to repeat
   */
  line(char = '—') {
    // Use simple dash for ESC/POS compatibility if char is multi-byte
    const printChar = char.length > 1 || char.charCodeAt(0) > 127 ? '-' : char;
    const lineStr = printChar.repeat(this.paperWidth);
    const bytes = encoder.encode(lineStr);
    this.buffer.push(...bytes, LF);
    return this;
  }

  /**
   * ESC d n — Feed n lines.
   * @param {number} lines
   */
  feed(lines = 1) {
    this.buffer.push(ESC, 0x64, lines);
    return this;
  }

  /** GS V 66 3 — Cut paper with 3 lines of feed. */
  cut() {
    this.buffer.push(GS, 0x56, 0x42, 0x03);
    return this;
  }

  /**
   * Push raw bytes directly into the buffer.
   * @param {number[]} bytes
   */
  raw(bytes) {
    this.buffer.push(...bytes);
    return this;
  }

  // ── Convenience Methods ─────────────────────────────────────

  /**
   * Print left-aligned text on the left and right-aligned text on the right
   * on the same line, padded with spaces.
   * @param {string} leftText
   * @param {string} rightText
   */
  leftRight(leftText, rightText) {
    const leftStr = String(leftText);
    const rightStr = String(rightText);
    const spacesNeeded = this.paperWidth - leftStr.length - rightStr.length;

    let lineStr;
    if (spacesNeeded > 0) {
      lineStr = leftStr + ' '.repeat(spacesNeeded) + rightStr;
    } else {
      // Truncate left side if both strings are too long
      const maxLeft = this.paperWidth - rightStr.length - 1;
      lineStr = leftStr.substring(0, maxLeft) + ' ' + rightStr;
    }

    const bytes = encoder.encode(lineStr);
    this.buffer.push(...bytes, LF);
    return this;
  }

  // ── Build ───────────────────────────────────────────────────

  /**
   * Build the final receipt as a Uint8Array.
   * @returns {Uint8Array}
   */
  build() {
    return new Uint8Array(this.buffer);
  }

  // ── Static Helpers ──────────────────────────────────────────

  /**
   * Build a fully formatted order receipt.
   * @param {Object} order - The order object (from database)
   * @param {Object} settings - Settings object with restaurantName, restaurantTagline, etc.
   * @returns {Uint8Array} ESC/POS byte data ready for printing
   */
  static orderReceipt(order, settings) {
    const width = settings.printerWidth === '80' ? 48 : 32;
    const rb = new ReceiptBuilder(width);

    rb.initialize()
      .center()
      .big()
      .text(settings.restaurantName || 'The Taste')
      .normal()
      .text(settings.restaurantTagline || 'Fast Food & Chinese');

    if (settings.restaurantAddress) {
      rb.text(settings.restaurantAddress);
    }
    if (settings.restaurantPhone) {
      rb.text(`Tel: ${settings.restaurantPhone}`);
    }

    rb.line('=')
      .left()
      .leftRight(`Order #${order.orderNumber}`, (order.type || 'takeaway').toUpperCase())
      .leftRight(formatDate(order.createdAt), formatTime(order.createdAt))
      .line('-');

    // Print column headers
    rb.bold()
      .leftRight('Item', 'Amt')
      .bold(false)
      .line('-');

    // Print each item
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    if (items && items.length > 0) {
      for (const item of items) {
        const qty = item.quantity || item.qty || 1;
        const price = item.price || 0;
        const name = item.name || item.itemName || 'Item';
        const itemTotal = price * qty;
        const itemName = qty > 1 ? `${name} x${qty}` : name;
        const amtStr = itemTotal.toFixed(2);

        // If the item name is too long, print it on two lines
        if (itemName.length + amtStr.length + 1 > width) {
          rb.text(itemName);
          rb.right().text(amtStr).left();
        } else {
          rb.leftRight(itemName, amtStr);
        }
      }
    }

    rb.line('-');

    // Subtotal
    const subtotal = order.subtotal || 0;
    rb.leftRight('Subtotal', subtotal.toFixed(2));

    // Tax
    if (order.tax && order.tax > 0) {
      const gstLabel = settings.gstPercent ? `GST (${settings.gstPercent}%)` : 'Tax';
      rb.leftRight(gstLabel, order.tax.toFixed(2));
    }

    rb.line('=')
      .center()
      .bold()
      .big()
      .text(`TOTAL: ₹${(order.total || 0).toFixed(2)}`)
      .normal()
      .bold(false)
      .line('=');

    // Payment info
    const paymentMethod = order.paymentMethod ? order.paymentMethod.toUpperCase() : 'PENDING';
    rb.text(`Payment: ${paymentMethod}`);

    if (order.paymentStatus === 'paid') {
      rb.text('** PAID **');
    }

    // Customer info
    if (order.customerName) {
      rb.left().text(`Customer: ${order.customerName}`);
    }
    if (order.customerPhone) {
      rb.left().text(`Phone: ${order.customerPhone}`);
    }
    if (order.notes) {
      rb.left().text(`Note: ${order.notes}`);
    }

    // Footer
    rb.center()
      .feed(1)
      .text('Thank you! Visit again!')
      .feed(3)
      .cut();

    return rb.build();
  }
}
