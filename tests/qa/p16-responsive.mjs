// Phase 16/5/14 — responsive layout, table management, and how the app fails.
import { session, settle, shot, staffLogin, serveDist, VIEWPORTS, OWNER } from './drive.mjs';

const srv = await serveDist(3000);
const base = 'http://localhost:3000';
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? 'PASS  ' : 'FAIL  '} ${n}${d ? '  — ' + d : ''}`); };

// ── Responsive: storefront and POS at four sizes ───────────────────
console.log('— responsive —');
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const mobile = vp.width < 900;
  const s = await session({ viewport: vp, mobile });

  // Storefront
  await s.page.goto(`${base}/#/self-order`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(s.page, 6000);
  const store = await s.page.evaluate(() => {
    const tooSmall = [...document.querySelectorAll('button, a[href], [role=button]')]
      .filter((e) => e.offsetParent)
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32)).length;
    return {
      hOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      scrollW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      tinyTargets: tooSmall,
      cartReachable: [...document.querySelectorAll('button,a')]
        .some((e) => e.offsetParent && /cart/i.test((e.innerText || '') + (e.getAttribute('aria-label') || ''))),
      clipped: [...document.querySelectorAll('h1,h2,h3,.store-menu-item')]
        .filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 2).length
    };
  });
  check(`storefront @${name} (${vp.width}px) has no horizontal overflow`, !store.hOverflow,
    store.hOverflow ? `${store.scrollW}px in ${store.winW}px` : '');
  check(`storefront @${name} keeps the cart reachable`, store.cartReachable);
  if (store.clipped) console.log(`   note: ${store.clipped} clipped heading(s)/card(s) @${name}`);
  if (store.tinyTargets) console.log(`   note: ${store.tinyTargets} touch target(s) under 32px @${name}`);
  await shot(s.page, `p16-store-${name}`);

  // POS, signed in
  const li = await staffLogin(s.page, base, OWNER);
  if (li.ok) {
    await s.page.evaluate(() => { window.location.hash = '#/pos'; });
    await settle(s.page, 5000);
    const pos = await s.page.evaluate(() => ({
      hOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      cartVisible: !!document.querySelector('.pos-cart') &&
        getComputedStyle(document.querySelector('.pos-cart')).display !== 'none',
      tiles: document.querySelectorAll('.menu-item').length
    }));
    check(`POS @${name} has no horizontal overflow`, !pos.hOverflow);
    check(`POS @${name} shows menu tiles`, pos.tiles > 0, `${pos.tiles} tiles`);
    await shot(s.page, `p16-pos-${name}`);
  }
  await s.browser.close();
}

// ── Tables ─────────────────────────────────────────────────────────
console.log('\n— tables —');
const t = await session();
if ((await staffLogin(t.page, base, OWNER)).ok) {
  await t.page.evaluate(() => { window.location.hash = '#/tables'; });
  await settle(t.page, 5000);
  const before = await t.page.evaluate(() => {
    const txt = document.body.innerText;
    const n = (re) => { const m = txt.match(re); return m ? parseInt(m[1], 10) : NaN; };
    return { total: n(/TOTAL\s+(\d+)/), available: n(/AVAILABLE\s+(\d+)/), occupied: n(/OCCUPIED\s+(\d+)/), reserved: n(/RESERVED\s+(\d+)/) };
  });
  console.log('  counts:', JSON.stringify(before));
  check('table counts are internally consistent',
    Number.isNaN(before.total) || before.available + before.occupied + before.reserved <= before.total,
    `${before.available}+${before.occupied}+${before.reserved} vs total ${before.total}`);
  check('the tables screen lists tables', before.total > 0, `${before.total} tables`);
  await shot(t.page, 'p16-tables');
}
await t.browser.close();

// ── Error handling ─────────────────────────────────────────────────
console.log('\n— error handling —');
let e = await session();

// A route that does not exist.
await e.page.goto(`${base}/#/definitely-not-a-route-qa`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await settle(e.page, 4000);
const bad = await e.page.evaluate(() => ({ len: document.body.innerText.trim().length, crashed: /undefined is not|cannot read|TypeError/i.test(document.body.innerText) }));
check('an unknown route does not crash the app', bad.len > 40 && !bad.crashed, `${bad.len} chars`);

// Empty checkout submission. A fresh context: changing only the hash does not remount the app,
// so navigating here from the bad route above would leave the previous view on screen.
await e.browser.close();
const e2 = await session({ viewport: { width: 390, height: 844 }, mobile: true });
e.page = e2.page; e.context = e2.context; e.browser = e2.browser;
await e.page.goto(`${base}/#/self-order`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await settle(e.page, 7000);
const dishes = e.page.locator('.store-menu-item, [class*=menu-item]');
await dishes.first().click(); await settle(e.page, 1500);
await e.page.locator('#drawer-add-to-cart-btn').click(); await settle(e.page, 1800);
const nav = e.page.locator('#btn-view-cart, [class*=bottom-nav] button, nav button').filter({ hasText: /cart/i });
for (let i = 0; i < await nav.count(); i++) { const el = nav.nth(i); if (await el.isVisible()) { await el.click(); break; } }
await settle(e.page, 2000);
const proceed = e.page.getByRole('button', { name: /proceed to checkout/i }).first();
if (await proceed.count()) { await proceed.click(); await settle(e.page, 3000); }

const submit = e.page.locator('#btn-submit-self-order');
if (await submit.count()) {
  await submit.click();   // no name, no phone
  await settle(e.page, 4000);
  const state = await e.page.evaluate(() => ({
    stillOnCheckout: !!document.getElementById('btn-submit-self-order'),
    message: (document.body.innerText.match(/(required|enter|please|valid|missing)[^\n]{0,90}/i) || [])[0] || null
  }));
  check('an empty checkout is refused', state.stillOnCheckout, state.stillOnCheckout ? '' : 'it submitted anyway');
  check('the customer is told what is missing', !!state.message, state.message || 'no message shown');
  await shot(e.page, 'p16-empty-checkout');
}

// Offline behaviour.
await e.context.setOffline(true);
await e.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await settle(e.page, 6000);
const offline = await e.page.evaluate(() => ({
  len: document.body.innerText.trim().length,
  strip: document.querySelector('.connection-strip-text')?.textContent?.trim() || null
}));
check('the app still renders something offline', offline.len > 40, `${offline.len} chars`);
check('offline is stated to the user', !!offline.strip, offline.strip || 'no connection strip shown');
await shot(e.page, 'p16-offline');
await e.context.setOffline(false);
await e.browser.close();

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
srv.close(); process.exit(0);
