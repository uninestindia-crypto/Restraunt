/**
 * What a bill comes to — the client's copy of the server's arithmetic.
 *
 * `enforce_order_integrity` is the authority: it rebuilds every line from the live menu, works out
 * what the discounts are worth, and writes the money columns. This module exists so a till can show
 * the operator the same numbers *before* the order is sent, because a cashier reading one total off
 * the screen while the customer is charged another is worse than having no preview at all.
 *
 * Two copies of money arithmetic is a liability, and the only thing that makes it acceptable is
 * that both are pinned to the same worked examples: `tests/sql/discount_math.sql` runs the cases
 * against the real trigger on a real Postgres, and `tests/pricing.test.ts` runs the identical cases
 * through this file. If they ever disagree, the build fails rather than a customer being surprised.
 *
 * The order of operations is the Indian invoice convention, and it is not arbitrary — a trade
 * discount reduces the taxable value, so GST is charged on what the customer actually pays:
 *
 *     subtotal        sum of menu price x quantity
 *   - item discounts  per line, clamped to that line
 *   - bill discount   percent or amount, clamped to what is left
 *   = taxable value
 *   + GST             on the taxable value, not on the gross
 *   + delivery fee
 *   = total
 */

export type BillDiscountType = 'none' | 'percent' | 'amount';

export interface PricedLine {
  /** Everything the caller passed, so a cart line survives a round trip through here. */
  [key: string]: any;
  price: number;
  quantity: number;
  discountPercent?: number | null;
  discountAmount?: number;
  /** What the rule is worth on this line, in rupees. */
  discount: number;
  /** price x quantity, before the discount. */
  lineGross: number;
}

export interface PricedOrder {
  items: PricedLine[];
  subtotal: number;
  itemDiscountTotal: number;
  billDiscountAmount: number;
  discountTotal: number;
  taxableValue: number;
  taxPercent: number;
  tax: number;
  deliveryFee: number;
  total: number;
  /** The discount as a share of the gross bill — what a store's ceiling is measured against. */
  effectiveDiscountPercent: number;
}

/** Postgres `round(numeric, 2)` is half-away-from-zero, which is not what JS `toFixed` does. */
export function round2(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** What one line's discount rule is worth against its menu value. */
export function lineDiscount(line: { price?: number; quantity?: number; discountPercent?: number | null; discountAmount?: number }): number {
  const gross = round2((Number(line.price) || 0) * (Number(line.quantity) || 0));
  let discount = 0;

  if (line.discountPercent !== undefined && line.discountPercent !== null && String(line.discountPercent) !== '') {
    discount = round2(gross * clamp(Number(line.discountPercent) || 0, 0, 100) / 100);
  } else if (line.discountAmount !== undefined && line.discountAmount !== null && String(line.discountAmount) !== '') {
    discount = Math.max(Number(line.discountAmount) || 0, 0);
  }

  // "₹500 off a ₹80 chips" is ₹80 off, not a bill that owes the customer money.
  return Math.min(discount, gross);
}

export function priceOrder(input: {
  items: Array<{ price?: number; quantity?: number; qty?: number; discountPercent?: number | null; discountAmount?: number; [key: string]: any }>;
  billDiscountType?: BillDiscountType | string;
  billDiscountValue?: number;
  taxPercent?: number;
  deliveryFee?: number;
  type?: string;
}): PricedOrder {
  const taxPercent = Number(input.taxPercent) || 0;
  const deliveryFee = input.type === 'delivery' ? (Number(input.deliveryFee) || 0) : 0;

  let subtotal = 0;
  let itemDiscountTotal = 0;
  const items: PricedLine[] = (input.items || []).map((raw) => {
    const quantity = Number(raw.quantity ?? raw.qty) || 0;
    const price = Number(raw.price) || 0;
    const lineGross = round2(price * quantity);
    const discount = lineDiscount({ price, quantity, discountPercent: raw.discountPercent, discountAmount: raw.discountAmount });
    subtotal += lineGross;
    itemDiscountTotal += discount;
    return { ...raw, price, quantity, lineGross, discount };
  });

  subtotal = round2(subtotal);
  itemDiscountTotal = round2(Math.min(itemDiscountTotal, subtotal));
  const afterItemDiscounts = round2(subtotal - itemDiscountTotal);

  // The bill discount applies to what is left after the line discounts, so the two compose rather
  // than double-counting the same rupees.
  let billDiscountAmount = 0;
  if (input.billDiscountType === 'percent') {
    billDiscountAmount = round2(afterItemDiscounts * clamp(Number(input.billDiscountValue) || 0, 0, 100) / 100);
  } else if (input.billDiscountType === 'amount') {
    billDiscountAmount = Math.max(Number(input.billDiscountValue) || 0, 0);
  }
  billDiscountAmount = round2(Math.min(billDiscountAmount, afterItemDiscounts));

  const discountTotal = round2(itemDiscountTotal + billDiscountAmount);
  const taxableValue = round2(subtotal - discountTotal);
  const tax = round2(taxableValue * taxPercent / 100);

  return {
    items,
    subtotal,
    itemDiscountTotal,
    billDiscountAmount,
    discountTotal,
    taxableValue,
    taxPercent,
    tax,
    deliveryFee,
    total: round2(taxableValue + tax + deliveryFee),
    effectiveDiscountPercent: subtotal > 0 ? round2(discountTotal * 100 / subtotal) : 0
  };
}
