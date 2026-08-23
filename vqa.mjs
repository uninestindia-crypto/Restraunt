import { session, settle, shot, LIVE_SELF } from './tests/qa/drive.mjs';
const s = await session({ viewport: { width: 390, height: 844 }, mobile: true });
await s.page.goto(`${LIVE_SELF}/#/self-order`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await settle(s.page, 12000);
const menuTab = s.page.getByText('Menu', { exact: true }).last();
if (await menuTab.count()) { await menuTab.click(); await settle(s.page, 4000); }
await shot(s.page, 'customer-menu-tab');
console.log(JSON.stringify(await s.page.evaluate(() => {
  const cards = [...document.querySelectorAll('[class*=dish-card], [class*=menu-card], [class*=store-item], article')].slice(0, 60);
  const imgs = [...document.querySelectorAll('img')];
  return {
    cards: cards.length,
    withPhoto: cards.filter((c) => c.querySelector('img')).length,
    withoutPhoto: cards.filter((c) => !c.querySelector('img')).length,
    placeholders: document.querySelectorAll('[class*=placeholder]').length,
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    sampleCard: cards[0] ? cards[0].innerText.replace(/\s+/g, ' ').slice(0, 140) : null,
    anyDescription: cards.slice(0, 12).map((c) => c.innerText.replace(/\s+/g, ' ')).filter((t) => t.length > 60).length
  };
}), null, 1));
await s.browser.close();
