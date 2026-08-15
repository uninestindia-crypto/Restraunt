// Chasing the P0: signed in, then "Failed to load staff console".
import { session, settle, shot, staffLogin, serveDist, LIVE_POS, STAFF, OWNER } from './drive.mjs';

const target = process.argv[2] || 'live';
let srv = null;
let base = LIVE_POS;
if (target === 'local') {
  srv = await serveDist(3000);
  base = 'http://localhost:3000';
}
const who = process.argv[3] === 'owner' ? OWNER : STAFF;

const { browser, page, log } = await session();

const errors = [];
page.on('pageerror', (e) => errors.push({ msg: e.message, stack: e.stack }));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push({ msg: m.text() });
});

console.log(`target=${target}  base=${base}  user=${who.email}`);
const r = await staffLogin(page, base, who, { timeout: 25000 });
console.log('login:', JSON.stringify(r));
await settle(page, 6000);

console.log('\n=== visible ===');
console.log((await page.evaluate(() => document.body.innerText.trim())).slice(0, 400));

console.log('\n=== errors with stacks ===');
for (const e of errors.slice(0, 10)) {
  console.log('— ' + e.msg.slice(0, 300));
  if (e.stack) console.log(String(e.stack).split('\n').slice(0, 8).join('\n'));
}

console.log('\n=== which mount points exist ===');
console.log(await page.evaluate(() => {
  const ids = ['app', 'root', 'main-content', 'app-container', 'staff-root', 'pos-root', 'view-container', 'content'];
  const found = {};
  for (const id of ids) found[id] = !!document.getElementById(id);
  return {
    byId: found,
    topLevel: [...document.body.children].map((c) => `${c.tagName}#${c.id || ''}.${(c.className || '').toString().split(' ')[0]}`).slice(0, 12)
  };
}));

console.log('\n=== supabase calls ===');
for (const c of log.net.filter((n) => n.url.includes('supabase.co')).slice(0, 25)) {
  console.log(`  ${c.status} ${c.method} ${c.url.replace(/^https:\/\/[^/]+/, '').slice(0, 130)}`);
}
console.log('failed:', JSON.stringify(log.failed.slice(0, 6), null, 1));

await shot(page, `p0-staff-console-${target}-${process.argv[3] || 'staff'}`);
await browser.close();
if (srv) srv.close();
process.exit(0);
