// Phase 1 — health check across the routes a real person reaches, on both deployments.
import { open, shot, dump, settle, summarise, supabaseCalls, bannerText, POS, SELF } from './harness.mjs';

const routes = [
  [POS, '/#/pos', 'pos-root'],
  [POS, '/#/', 'pos-home'],
  [POS, '/#/kitchen', 'pos-kitchen'],
  [POS, '/#/admin', 'pos-admin'],
  [POS, '/#/qa-nonsense-route', 'pos-badroute'],
  [SELF, '/#/self-order', 'self-order'],
  [SELF, '/#/', 'self-home'],
  [SELF, '/menu', 'self-menu-static'],
  [SELF, '/#/track', 'self-track']
];

const results = [];

for (const [base, path, name] of routes) {
  const { browser, page, log } = await open();
  const notes = [];
  let status = 'PASS';
  try {
    const resp = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 5000);

    const http = resp?.status();
    if (http >= 400) { status = 'FAIL'; notes.push(`HTTP ${http}`); }

    const probe = await page.evaluate(() => ({
      title: document.title,
      textLen: (document.body.innerText || '').trim().length,
      head: (document.body.innerText || '').trim().slice(0, 220).replace(/\s+/g, ' '),
      stuckLoader:
        (document.body.innerText || '').trim().length < 60 &&
        !!document.querySelector('[class*=load],[class*=spin],[class*=skeleton]'),
      hOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
      imgCount: document.images.length
    }));

    if (probe.textLen < 30) { status = 'FAIL'; notes.push('blank page'); }
    if (probe.stuckLoader) { status = 'FAIL'; notes.push('stuck on loader'); }
    if (probe.hOverflow) { status = status === 'PASS' ? 'PARTIAL' : status; notes.push('horizontal overflow'); }
    if (probe.brokenImgs) { status = status === 'PASS' ? 'PARTIAL' : status; notes.push(`${probe.brokenImgs} broken images`); }

    const banner = await bannerText(page);
    const sb = supabaseCalls(log);

    await shot(page, name);
    results.push({ name, url: base + path, http, status, notes, probe, banner,
      supabase: { count: sb.length, sample: sb.slice(0, 6) }, log: summarise(log) });
  } catch (e) {
    results.push({ name, url: base + path, status: 'FAIL', notes: [String(e).split('\n')[0].slice(0, 200)], log: summarise(log) });
  } finally {
    await browser.close();
  }
}

dump('p1-health', results);
for (const r of results) {
  console.log(`\n${r.status.padEnd(7)} ${r.name}  ${r.url}`);
  if (r.notes.length) console.log('   notes: ' + r.notes.join(' | '));
  if (r.probe) console.log(`   title="${r.probe.title.slice(0, 60)}" textLen=${r.probe.textLen} imgs=${r.probe.imgCount}`);
  if (r.banner) console.log(`   ⚠ BANNER: "${r.banner}"`);
  console.log(`   supabase calls=${r.supabase?.count ?? 0}  consoleErr=${r.log.consoleErrors} pageErr=${r.log.pageErrors} failedReq=${r.log.failedRequests}`);
  for (const s of (r.supabase?.sample || [])) console.log(`     SB ${s.status} ${s.method} ${s.url.replace(/^https:\/\/[^/]+/, '').slice(0, 120)}`);
  for (const e of r.log.samplePageErrors) console.log('     PAGEERROR: ' + e.slice(0, 160));
  for (const e of r.log.sampleConsole.slice(0, 5)) console.log('     CONSOLE: ' + e.slice(0, 160));
  for (const f of r.log.sampleFailed.slice(0, 6)) console.log(`     REQFAIL ${f.status || f.err} ${f.url}`);
}
process.exit(0);
