/**
 * Phase 9 — menu CRUD as the owner, then does the change reach the other surfaces.
 *
 * Creates one clearly-named item in production and deletes it at the end. Menu items have no
 * delete-guard trigger, so cleanup here is real.
 */
import { session, settle, shot, staffLogin, serveDist, OWNER } from './drive.mjs';
import { api } from './net.mjs';
import { readFileSync } from 'node:fs';

const { url: SB_URL, key: SB_KEY } = JSON.parse(
  readFileSync('/tmp/claude-0/-home-user-Restraunt/fdf1f216-74b6-5b33-8106-81640b245ebf/scratchpad/sb.json', 'utf8'));

const NAME = 'QA TEST ITEM - DELETE ME';
const EDITED = 'QA TEST ITEM - EDITED';
const srv = await serveDist(3000);
const base = 'http://localhost:3000';
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? 'PASS  ' : 'FAIL  '} ${n}${d ? '  — ' + d : ''}`); };

const owner = await session();
const li = await staffLogin(owner.page, base, OWNER);
check('owner signs in', li.ok, li.reason || '');
if (!li.ok) { await owner.browser.close(); srv.close(); process.exit(1); }

await owner.page.evaluate(() => { window.location.hash = '#/admin'; });
await settle(owner.page, 4000);
const menuTab = owner.page.getByRole('button', { name: /menu/i }).first();
if (await menuTab.count()) { await menuTab.click(); await settle(owner.page, 4000); }
await shot(owner.page, 'p9-menu-manager');

const addBtn = owner.page.getByRole('button', { name: /add item|new item|add dish|\+ ?item/i }).first();
check('the menu manager offers an "add item" control', await addBtn.count() > 0);

let created = false;
if (await addBtn.count()) {
  await addBtn.click();
  await settle(owner.page, 2500);
  await shot(owner.page, 'p9-add-form');

  const fields = await owner.page.evaluate(() =>
    [...document.querySelectorAll('input,select,textarea')].filter((e) => e.offsetParent)
      .map((e) => ({ id: e.id, name: e.name, ph: e.placeholder, type: e.type, tag: e.tagName })));
  console.log('  form fields:', JSON.stringify(fields).slice(0, 400));

  // The form's real ids, rather than guessing from placeholders. A category is required, so it
  // is selected explicitly instead of left on whatever the browser defaults to.
  await owner.page.locator('#item-name').fill(NAME);
  await owner.page.locator('#item-price').fill('123');
  await owner.page.locator('#item-description').fill('Temporary QA item — safe to delete');
  const cat = owner.page.locator('#item-cat');
  const options = await cat.locator('option').all();
  for (const o of options) {
    const v = await o.getAttribute('value');
    if (v && v !== '' && v !== '0') { await cat.selectOption(v); break; }
  }
  console.log('  category selected:', await cat.inputValue());

  const save = owner.page.getByRole('button', { name: /^Save Menu Item$/i }).first();
  check('the form has a save control', await save.count() > 0);
  if (await save.count()) { await save.click(); await settle(owner.page, 6000); }
  await shot(owner.page, 'p9-after-save');

  const row = await api(`${SB_URL}/rest/v1/menu_items?name=eq.${encodeURIComponent(NAME)}&select=id,name,price,is_available`,
    { headers: { apikey: SB_KEY } });
  created = Array.isArray(row.json) && row.json.length > 0;
  check('the new item is persisted to the database', created, row.text.slice(0, 160));

  if (created) {
    const id = row.json[0].id;
    check('the price was stored as entered', Number(row.json[0].price) === 123, `stored ${row.json[0].price}`);

    // ── Does it reach the other surfaces? ──
    const storefront = await session({ viewport: { width: 390, height: 844 }, mobile: true });
    await storefront.page.goto(`${base}/#/self-order`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(storefront.page, 8000);
    const onStore = await storefront.page.evaluate((n) => document.body.innerText.includes(n), NAME);
    check('the new item appears on the customer storefront', onStore);
    await shot(storefront.page, 'p9-storefront');
    await storefront.browser.close();

    const pos = await session();
    await staffLogin(pos.page, base, OWNER);
    await pos.page.evaluate(() => { window.location.hash = '#/pos'; });
    await settle(pos.page, 6000);
    const onPos = await pos.page.evaluate((n) => document.body.innerText.includes(n), NAME);
    check('the new item appears on the POS grid', onPos);
    await pos.browser.close();

    // ── Edit ──
    const edit = await api(`${SB_URL}/rest/v1/menu_items?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: SB_KEY, authorization: `Bearer ${(await api(`${SB_URL}/auth/v1/token?grant_type=password`,
        { method: 'POST', headers: { apikey: SB_KEY }, json: { email: OWNER.email, password: OWNER.password } })).json.access_token}`,
        prefer: 'return=representation' },
      json: { name: EDITED, price: 456 }
    });
    check('the owner can edit the item', Array.isArray(edit.json) && edit.json.length === 1,
      `${edit.status} ${edit.text.slice(0, 100)}`);

    // ── Delete (cleanup) ──
    const tok = (await api(`${SB_URL}/auth/v1/token?grant_type=password`,
      { method: 'POST', headers: { apikey: SB_KEY }, json: { email: OWNER.email, password: OWNER.password } })).json.access_token;
    const del = await api(`${SB_URL}/rest/v1/menu_items?id=eq.${id}`, {
      method: 'DELETE', headers: { apikey: SB_KEY, authorization: `Bearer ${tok}`, prefer: 'return=representation' }
    });
    const gone = await api(`${SB_URL}/rest/v1/menu_items?id=eq.${id}&select=id`, { headers: { apikey: SB_KEY } });
    check('the QA item is removed again', Array.isArray(gone.json) && gone.json.length === 0,
      `delete ${del.status}, remaining ${gone.text.slice(0, 60)}`);
  }
}

// Nothing of ours may survive this run.
const leftovers = await api(
  `${SB_URL}/rest/v1/menu_items?or=(name.ilike.*QA TEST*,name.ilike.*DELETE ME*)&select=id,name`,
  { headers: { apikey: SB_KEY } });
check('no QA menu rows are left behind', Array.isArray(leftovers.json) && leftovers.json.length === 0,
  leftovers.text.slice(0, 200));

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} menu CRUD checks passed`);
await owner.browser.close(); srv.close(); process.exit(0);
