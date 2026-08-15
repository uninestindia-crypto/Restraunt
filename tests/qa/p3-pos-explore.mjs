// Phase 3 — walk every staff/owner surface and report what is actually there.
import { session, settle, shot, staffLogin, serveDist, summarise, OWNER, STAFF } from './drive.mjs';

const who = process.argv[2] === 'staff' ? STAFF : OWNER;
const srv = await serveDist(3000);
const base = 'http://localhost:3000';

const { browser, page, log } = await session();
const r = await staffLogin(page, base, who);
console.log(`login ${who.email}: ${JSON.stringify(r)}\n`);
if (!r.ok) { await browser.close(); srv.close(); process.exit(1); }

// What the sidebar actually offers this role.
const navItems = await page.evaluate(() =>
  [...document.querySelectorAll('#app-sidebar a, #app-sidebar [data-route], #app-sidebar button')]
    .map((el) => ({
      label: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
      href: el.getAttribute('href') || el.dataset?.route || ''
    }))
    .filter((n) => n.label)
);
console.log(`sidebar (${navItems.length}):`, navItems.map((n) => `${n.label}→${n.href}`).join(', '), '\n');

const routes = [...new Set(navItems.map((n) => n.href).filter((h) => h && h.startsWith('#/')))];
const extra = ['#/pos', '#/orders', '#/admin', '#/analytics', '#/inventory', '#/customers',
  '#/staff', '#/tables', '#/kitchen', '#/express', '#/channels', '#/settings', '#/developer', '#/ai'];
for (const e of extra) if (!routes.includes(e)) routes.push(e);

const findings = [];
for (const route of routes) {
  try {
    await page.evaluate((h) => { window.location.hash = h; }, route);
    await settle(page, 3000);

    const probe = await page.evaluate(() => {
      const main = document.getElementById('main-content') || document.body;
      const text = (main.innerText || '').trim();
      return {
        len: text.length,
        head: text.slice(0, 160).replace(/\s+/g, ' '),
        empty: /no data|nothing here|not found|no items|empty|coming soon|unavailable|denied|access/i.test(text.slice(0, 500)),
        buttons: [...main.querySelectorAll('button, [role=button]')].map((b) => (b.textContent || '').trim()).filter(Boolean).length,
        inputs: main.querySelectorAll('input, select, textarea').length,
        tables: main.querySelectorAll('table, [class*=grid], [class*=list]').length,
        hOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
      };
    });

    const status = probe.len < 40 ? 'FAIL' : probe.empty ? 'PARTIAL' : 'PASS';
    findings.push({ route, status, probe });
    console.log(`${status.padEnd(7)} ${route.padEnd(14)} len=${String(probe.len).padEnd(6)} btn=${String(probe.buttons).padEnd(3)} in=${String(probe.inputs).padEnd(3)} ${probe.hOverflow ? 'H-OVERFLOW ' : ''}${probe.head.slice(0, 90)}`);
    await shot(page, `p3-${(process.argv[2] || 'owner')}-${route.replace(/\W/g, '')}`);
  } catch (e) {
    findings.push({ route, status: 'FAIL', error: String(e).slice(0, 150) });
    console.log(`FAIL    ${route} — ${String(e).split('\n')[0].slice(0, 110)}`);
  }
}

console.log('\n--- console health across the walk ---');
const s = summarise(log);
console.log(`consoleErrors=${s.consoleErrors} pageErrors=${s.pageErrors} failedRequests=${s.failedRequests}`);
for (const e of s.samplePageErrors) console.log('  PAGEERROR ' + e.slice(0, 200));
for (const e of s.sampleConsole.slice(0, 8)) console.log('  CONSOLE ' + e.slice(0, 200));
for (const f of s.sampleFailed.slice(0, 8)) console.log(`  REQ ${f.status || f.err} ${f.method} ${f.url}`);

await browser.close(); srv.close(); process.exit(0);
