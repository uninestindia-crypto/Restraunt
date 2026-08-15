// Phase 4/12 — POS cart behaviour and money arithmetic.
// Nothing is submitted: this builds carts, reads what the screen claims, and checks the sums.
// No production order is created by this script.
import { session, settle, shot, staffLogin, serveDist, OWNER } from './drive.mjs';

const srv = await serveDist(3000);
const { browser, page, log } = await session();
const r = await staffLogin(page, 'http://localhost:3000', OWNER);
if (!r.ok) { console.log('login failed', r); await browser.close(); srv.close(); process.exit(1); }

await page.evaluate(() => { window.location.hash = '#/pos'; });
await settle(page, 4000);

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS  ' : 'FAIL  '} ${name}${detail ? '  — ' + detail : ''}`);
};

/** The cart panel, read the way a cashier reads it. */
const readCart = () => page.evaluate(() => {
  const cart = document.querySelector('.pos-cart');
  if (!cart) return null;
  const t = (cart.innerText || '').replace(/\s+/g, ' ');
  const num = (re) => { const m = t.match(re); return m ? parseFloat(m[1].replace(/,/g, '')) : NaN; };
  return {
    text: t,
    itemCount: num(/Subtotal \((\d+) items?\)/i),
    subtotal: num(/Subtotal \(\d+ items?\) ₹([\d,]+\.\d{2})/i),
    taxRate: num(/GST \(([\d.]+)%\)/i),
    tax: num(/GST \([\d.]+%\) ₹([\d,]+\.\d{2})/i),
    total: num(/Total ₹([\d,]+\.\d{2})/i),
    payButton: (t.match(/Pay ₹([\d,]+(?:\.\d+)?)/i) || [])[1],
    lines: [...cart.querySelectorAll('.cart-item')].map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim())
  };
});

/** What the store is actually configured to charge. */
const configuredGst = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('TheTastePOS');
  req.onsuccess = () => {
    try {
      const store = req.result.transaction('settings', 'readonly').objectStore('settings');
      const g = store.get('gstPercent');
      g.onsuccess = () => res(g.result?.value ?? null);
      g.onerror = () => res(null);
    } catch { res(null); }
  };
  req.onerror = () => res(null);
}));
console.log(`store setting gstPercent = ${JSON.stringify(configuredGst)}\n`);

const tiles = page.locator('.menu-item, [class*=pos-item], [class*=product-card]');
const n = await tiles.count();
console.log(`menu tiles: ${n}`);

// ── One item ───────────────────────────────────────────────────────
await tiles.first().click();
await settle(page, 1200);
let c = await readCart();
console.log('one item:', JSON.stringify({ n: c.itemCount, sub: c.subtotal, rate: c.taxRate, tax: c.tax, total: c.total, pay: c.payButton }));

check('adding an item populates the cart', c.lines.length === 1 && c.itemCount === 1);
check('subtotal + tax = total', Math.abs(c.subtotal + c.tax - c.total) < 0.005,
  `${c.subtotal} + ${c.tax} = ${(c.subtotal + c.tax).toFixed(2)} vs ${c.total}`);
check('tax equals the advertised rate applied to the subtotal',
  Math.abs(c.subtotal * (c.taxRate / 100) - c.tax) < 0.005,
  `${c.subtotal} × ${c.taxRate}% = ${(c.subtotal * c.taxRate / 100).toFixed(2)} vs ${c.tax}`);
check('the rate shown is the store\'s configured rate',
  configuredGst == null || Math.abs(c.taxRate - parseFloat(configuredGst)) < 0.001,
  `configured ${configuredGst}, cart shows ${c.taxRate}%`);
check('the pay button matches the total',
  Math.abs(parseFloat(c.payButton) - c.total) < 0.51,
  `button "Pay ₹${c.payButton}" vs total ₹${c.total}`);

const sub1 = c.subtotal;

// ── Quantity ───────────────────────────────────────────────────────
await tiles.first().click();
await settle(page, 1200);
c = await readCart();
check('same item again becomes quantity 2, not a second line',
  c.lines.length === 1 && c.itemCount === 2, `${c.lines.length} line(s), count ${c.itemCount}`);
check('subtotal doubles', Math.abs(c.subtotal - sub1 * 2) < 0.005, `${sub1} → ${c.subtotal}`);
check('tax still tracks the subtotal', Math.abs(c.subtotal * (c.taxRate / 100) - c.tax) < 0.005,
  `${c.subtotal} × ${c.taxRate}% vs ${c.tax}`);

// Decrement back to 1.
const minus = page.locator('.cart-item button, .cart-item [class*=remove]').filter({ hasText: /remove/ }).first();
if (await minus.count()) {
  await minus.click(); await settle(page, 1000);
  const back = await readCart();
  check('decrementing returns to the single-item subtotal',
    Math.abs(back.subtotal - sub1) < 0.005, `${c.subtotal} → ${back.subtotal}`);
}

// ── A second item, and higher quantities ───────────────────────────
await tiles.nth(1).click(); await settle(page, 1000);
await tiles.nth(1).click(); await settle(page, 1000);
await tiles.nth(1).click(); await settle(page, 1200);
c = await readCart();
console.log('mixed cart:', JSON.stringify({ n: c.itemCount, sub: c.subtotal, tax: c.tax, total: c.total }));
check('two products give two cart lines', c.lines.length === 2, `${c.lines.length} lines`);
check('mixed cart: subtotal + tax = total', Math.abs(c.subtotal + c.tax - c.total) < 0.005,
  `${c.subtotal} + ${c.tax} vs ${c.total}`);
check('mixed cart: tax = rate × subtotal', Math.abs(c.subtotal * (c.taxRate / 100) - c.tax) < 0.005,
  `${(c.subtotal * c.taxRate / 100).toFixed(2)} vs ${c.tax}`);

// Line prices must add up to the subtotal.
const lineSum = await page.evaluate(() =>
  [...document.querySelectorAll('.pos-cart .cart-item')].reduce((acc, el) => {
    const t = (el.innerText || '').replace(/\s+/g, ' ');
    const all = [...t.matchAll(/₹([\d,]+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1].replace(/,/g, '')));
    return acc + (all.length ? all[all.length - 1] : 0);
  }, 0)
);
check('the line totals add up to the subtotal', Math.abs(lineSum - c.subtotal) < 0.011,
  `lines ₹${lineSum.toFixed(2)} vs subtotal ₹${c.subtotal}`);

check('no money is shown with more than two decimals',
  !/₹[\d,]+\.\d{3,}/.test(c.text), c.text.match(/₹[\d,]+\.\d{3,}/)?.[0] || '');

await shot(page, 'p4-cart-built');

// ── Clearing ───────────────────────────────────────────────────────
page.on('dialog', (d) => d.accept().catch(() => {}));
const clear = page.getByRole('button', { name: /clear order/i }).first();
if (await clear.count()) {
  await clear.click(); await settle(page, 1500);
  const after = await readCart();
  check('Clear Order empties the cart',
    !after || after.lines.length === 0 || !after.itemCount, `${after?.lines.length ?? 0} lines left`);
  await shot(page, 'p4-cart-cleared');
} else {
  console.log('NOTE  no "Clear Order" control found');
}

console.log(`\n${results.filter((x) => x.ok).length}/${results.length} checks passed`);
if (log.pageErrors.length) console.log('pageErrors:', JSON.stringify(log.pageErrors.slice(0, 3)));
await browser.close(); srv.close(); process.exit(0);
