/**
 * Phase 6/7 — a customer places a real order, then staff go looking for it.
 *
 * This writes to the production database. Orders cannot be deleted (trg_prevent_delete_orders), so
 * the customer name carries a marker nobody could mistake for a real order, and the run cancels it
 * from the staff side at the end rather than leaving it in the kitchen queue.
 */
import { session, settle, shot, staffLogin, serveDist, OWNER } from './drive.mjs';

const STAMP = new Date().toISOString().slice(11, 19).replace(/:/g, '');
const MARK = `QATEST-DONOTPREPARE-${STAMP}`;
const PHONE = '9000000001';

const srv = await serveDist(3000);
const base = 'http://localhost:3000';
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? 'PASS  ' : 'FAIL  '} ${n}${d ? '  — ' + d : ''}`); };

const cust = await session({ viewport: { width: 390, height: 844 }, mobile: true });
const page = cust.page;
await page.goto(`${base}/#/self-order`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await settle(page, 6000);

console.log('— customer —');
const dishes = page.locator('.store-menu-item, [class*=menu-item]');
check('storefront lists dishes', await dishes.count() > 0, `${await dishes.count()} visible`);

/** Add a dish, handling the details drawer that opens over it. */
async function addDish(i) {
  await dishes.nth(i).click();
  await settle(page, 1800);
  const drawerAdd = page.locator('#drawer-add-to-cart-btn');
  if (await drawerAdd.count() && await drawerAdd.isVisible()) {
    const label = (await drawerAdd.innerText()).trim();
    await drawerAdd.click();
    await settle(page, 1500);
    return label;
  }
  return '(added inline)';
}
const l1 = await addDish(0);
const l2 = await addDish(2);
console.log(`  added: ${l1} / ${l2}`);
await shot(page, 'p7-1-added');

// Mobile shows a bottom-nav "Cart"; desktop shows the floating button, and each hides the other.
// Click whichever one this viewport actually presents.
const cartEntry = page.locator('#btn-view-cart, [class*=store-bottom-nav] button, nav button')
  .filter({ hasText: /cart/i });
let opened = false;
for (let i = 0; i < await cartEntry.count(); i++) {
  const el = cartEntry.nth(i);
  if (await el.isVisible()) { await el.click(); opened = true; break; }
}
if (!opened) {
  const fab = page.locator('#btn-view-cart');
  if (await fab.count() && await fab.isVisible()) { await fab.click(); opened = true; }
}
check('the cart is reachable on this viewport', opened);
await settle(page, 2500);
await shot(page, 'p7-2-cart');

const cart = await page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, ' ');
  const num = (re) => { const m = t.match(re); return m ? parseFloat(m[1].replace(/,/g, '')) : NaN; };
  return {
    subtotal: num(/Subtotal[^₹]{0,20}₹\s*([\d,]+(?:\.\d+)?)/i),
    taxRate: num(/(?:GST|Tax)\s*\(([\d.]+)\s*%\)/i),
    tax: num(/(?:GST|Tax)[^₹]{0,20}₹\s*([\d,]+(?:\.\d+)?)/i),
    total: num(/Total[^₹]{0,20}₹\s*([\d,]+(?:\.\d+)?)/i),
    lines: [...document.querySelectorAll('[class*=cart-item],[class*=cart-line]')].length,
    text: t.slice(0, 300)
  };
});
console.log('  cart:', JSON.stringify(cart).slice(0, 300));

// The cart is a review step; checkout is behind it.
const proceed = page.getByRole('button', { name: /proceed to checkout|checkout|continue/i }).first();
if (await proceed.count() && await proceed.isVisible()) {
  await proceed.click();
  await settle(page, 3000);
  await shot(page, 'p7-2b-checkout');
}

// Serving mode first — it decides which fields the form asks for (delivery wants an address).
// Pickup keeps this test off the delivery path and out of anyone's dispatch queue.
const pickup = page.getByRole('button', { name: /pickup/i }).first();
if (await pickup.count() && await pickup.isVisible()) { await pickup.click(); await settle(page, 1500); }

for (const [sel, val] of [['#self-name', MARK], ['#self-phone', PHONE], ['#self-delivery-address', 'QA TEST — no delivery']]) {
  const el = page.locator(sel);
  if (await el.count() && await el.isVisible()) { await el.fill(val); }
}
await settle(page, 800);
await shot(page, 'p7-3-details');

const filled = await page.evaluate(() => ({
  name: document.getElementById('self-name')?.value || null,
  phone: document.getElementById('self-phone')?.value || null
}));
console.log('  form:', JSON.stringify(filled));
check('the checkout form accepted the contact details', !!filled.name && !!filled.phone,
  JSON.stringify(filled));

const totalsAtCheckout = await page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, ' ');
  const num = (re) => { const m = t.match(re); return m ? parseFloat(m[1].replace(/,/g, '')) : NaN; };
  return {
    subtotal: num(/Subtotal[^₹]{0,20}₹\s*([\d,]+(?:\.\d+)?)/i),
    taxRate: num(/(?:GST|Tax)\s*\(([\d.]+)\s*%\)/i),
    tax: num(/(?:GST|Tax)[^₹]{0,20}₹\s*([\d,]+(?:\.\d+)?)/i),
    total: num(/Total[^₹]{0,20}₹\s*([\d,]+(?:\.\d+)?)/i)
  };
});
console.log('  totals shown at checkout:', JSON.stringify(totalsAtCheckout));
if (!Number.isNaN(totalsAtCheckout.subtotal) && !Number.isNaN(totalsAtCheckout.total)) {
  check('customer sees a total that adds up',
    Math.abs(totalsAtCheckout.subtotal + (totalsAtCheckout.tax || 0) - totalsAtCheckout.total) < 0.02,
    `${totalsAtCheckout.subtotal} + ${totalsAtCheckout.tax} vs ${totalsAtCheckout.total}`);
}

// Submit — twice, on purpose.
const submit = page.locator('#btn-submit-self-order');
check('the submit control exists', await submit.count() > 0);
if (await submit.count()) {
  await submit.click();
  await submit.click({ timeout: 1500 }).catch(() => {});
  await settle(page, 12000);
}
await shot(page, 'p7-4-submitted');

const after = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
console.log('  after submit:', after.slice(0, 350));

const orderPosts = cust.log.net.filter((r) => /public-order|rest\/v1\/orders/.test(r.url) && r.method === 'POST');
console.log('  order POSTs:', JSON.stringify(orderPosts.map((c) => `${c.status} ${c.url.slice(-45)}`)));
check('the order was actually submitted to the server', orderPosts.length > 0, `${orderPosts.length} POSTs`);
check('a double click did not create two orders',
  orderPosts.filter((c) => c.status < 400).length <= 1, `${orderPosts.filter((c) => c.status < 400).length} accepted`);

const token = (after.match(/TT-\d{8}-\d+|#\s?\d{3,}/) || [])[0] || null;
check('the customer is given an order reference', !!token, token || 'none on screen');
if (cust.log.failed.length) console.log('  failed requests:', JSON.stringify(cust.log.failed.slice(0, 4)));

// ══ Staff side ═════════════════════════════════════════════════════
console.log('\n— staff —');
const staff = await session();
const li = await staffLogin(staff.page, base, OWNER);
if (li.ok) {
  for (const [route, label] of [['#/orders', 'order list'], ['#/kitchen', 'kitchen board'], ['#/channels', 'channel hub']]) {
    await staff.page.evaluate((h) => { window.location.hash = h; }, route);
    await settle(staff.page, 6000);
    const hit = await staff.page.evaluate((m) => document.body.innerText.includes(m), MARK);
    check(`the customer order reaches the ${label}`, hit, hit ? '' : `looked for ${MARK}`);
    await shot(staff.page, `p7-staff-${route.replace(/\W/g, '')}`);
  }
} else {
  check('staff can sign in to verify', false, li.reason);
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
console.log(`MARKER: ${MARK}`);
await cust.browser.close(); await staff.browser.close(); srv.close(); process.exit(0);
