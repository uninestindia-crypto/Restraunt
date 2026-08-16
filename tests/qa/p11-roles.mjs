/**
 * Phase 11 — role enforcement.
 *
 * A hidden sidebar item is not a permission. This signs in as staff1 (role: kitchen) and goes
 * straight to owner-only routes by URL, then checks whether the server would actually refuse the
 * writes those screens perform — because the UI hiding a button proves nothing about the API.
 */
import { session, settle, shot, staffLogin, serveDist, STAFF, OWNER } from './drive.mjs';
import { api } from './net.mjs';
import { readFileSync } from 'node:fs';

const { url: SB_URL, key: SB_KEY } = JSON.parse(
  readFileSync('/tmp/claude-0/-home-user-Restraunt/fdf1f216-74b6-5b33-8106-81640b245ebf/scratchpad/sb.json', 'utf8')
);

const srv = await serveDist(3000);
const base = 'http://localhost:3000';
const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log(`${ok ? 'PASS  ' : 'FAIL  '} ${n}${d ? '  — ' + d : ''}`); };

// ── What the UI lets each role see ─────────────────────────────────
const navFor = {};
for (const [label, who] of [['staff', STAFF], ['owner', OWNER]]) {
  const s = await session();
  const r = await staffLogin(s.page, base, who);
  if (!r.ok) { check(`${label} signs in`, false, r.reason); await s.browser.close(); continue; }
  navFor[label] = await s.page.evaluate(() =>
    [...document.querySelectorAll('#app-sidebar a, #app-sidebar [data-route]')]
      .map((a) => a.getAttribute('href') || a.dataset?.route).filter(Boolean));
  console.log(`${label} sidebar: ${navFor[label].join(' ')}`);

  if (label === 'staff') {
    // Straight to the routes the sidebar does not offer.
    for (const route of ['#/admin', '#/staff', '#/analytics', '#/inventory', '#/customers', '#/orders', '#/developer']) {
      await s.page.evaluate((h) => { window.location.hash = h; }, route);
      await settle(s.page, 3500);
      const view = await s.page.evaluate(() => {
        const m = document.getElementById('main-content') || document.body;
        const t = (m.innerText || '').trim();
        return {
          len: t.length,
          head: t.slice(0, 120).replace(/\s+/g, ' '),
          refused: /not authorized|no access|permission|denied|restricted|unavailable for your role/i.test(t),
          // The tell is whether the privileged screen rendered — not whether a refusal message did.
          // This app redirects a disallowed route to the role's own board, which is a legitimate
          // way to say no, and a check looking only for the word "denied" would call it a breach.
          privileged: /staff & roles|add staff|smart analytics|inventory & stock|customer crm|orders & delivery|developer console|dashboard analytics/i.test(t)
        };
      });
      const gated = !view.privileged;
      check(`kitchen staff at ${route} does not get the privileged screen`, gated,
        gated ? `redirected to: ${view.head.slice(0, 45)}` : `RENDERED: ${view.head}`);
      if (!gated) await shot(s.page, `p11-open-${route.replace(/\W/g, '')}`);
    }
    await shot(s.page, 'p11-staff-final');
  }
  await s.browser.close();
}

check('the two roles are offered different navigation',
  JSON.stringify(navFor.staff) !== JSON.stringify(navFor.owner),
  `staff ${navFor.staff?.length} items vs owner ${navFor.owner?.length}`);

// ── What the server actually allows ────────────────────────────────
// The real question: with the kitchen account's own token, will Postgres let it write?
console.log('\n— server-side enforcement, using the kitchen account\'s own token —');
const auth = await api(`${SB_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: SB_KEY },
  json: { email: STAFF.email, password: STAFF.password }
});
const token = auth.json?.access_token;
check('the kitchen account gets a token', !!token, token ? '' : JSON.stringify(auth.json).slice(0, 120));

if (token) {
  const H = { apikey: SB_KEY, authorization: `Bearer ${token}` };

  const probes = [
    ['read staff directory', 'GET', `${SB_URL}/rest/v1/staff?select=id,name,role&limit=3`, null],
    ['read customers (PII)', 'GET', `${SB_URL}/rest/v1/customers?select=id,name,phone&limit=3`, null],
    ['read orders', 'GET', `${SB_URL}/rest/v1/orders?select=id,total&limit=3`, null],
    ['edit the menu', 'PATCH', `${SB_URL}/rest/v1/menu_items?id=eq.1`, { price: 999999 }],
    ['promote self to owner', 'PATCH', `${SB_URL}/rest/v1/staff_memberships?auth_user_id=eq.${auth.json.user.id}`, { role: 'owner' }],
    ['delete an order', 'DELETE', `${SB_URL}/rest/v1/orders?id=eq.1`, null],
    ['rewrite the audit log', 'PATCH', `${SB_URL}/rest/v1/activity_log?id=eq.1`, { action: 'tampered' }]
  ];

  for (const [label, method, url, body] of probes) {
    // `return=representation` is what makes this honest. An UPDATE or DELETE that RLS filters out
    // matches zero rows, and PostgREST answers 204 — identical to a successful write with
    // `return=minimal`. Asking for the rows back distinguishes "changed it" from "changed
    // nothing": a permitted write echoes the row, a filtered one returns an empty array.
    const res = await api(url, { method, headers: { ...H, prefer: 'return=representation' }, json: body });
    const rows = Array.isArray(res.json) ? res.json.length : (res.json ? 1 : 0);
    const changed = res.status >= 200 && res.status < 300 && rows > 0;
    const isWrite = method !== 'GET';
    const mustRefuse = /promote|delete an order|rewrite|edit the menu/.test(label);

    console.log(`   ${String(res.status).padEnd(4)} ${method.padEnd(6)} ${label}` +
      (isWrite ? `  rows affected: ${rows}${changed ? '  ← REALLY CHANGED' : ''}` : `  rows: ${rows}`));

    if (mustRefuse) {
      check(`kitchen staff cannot ${label}`, !changed,
        changed ? `WROTE ${rows} row(s)` : `HTTP ${res.status}, ${rows} rows affected`);
    }
  }

  // Prove the probe can detect a real write: the owner may edit the menu, so the same call with an
  // owner token must come back with a row. A test that cannot pass is not evidence of anything.
  const ownerAuth = await api(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SB_KEY }, json: { email: OWNER.email, password: OWNER.password }
  });
  if (ownerAuth.json?.access_token) {
    const current = await api(`${SB_URL}/rest/v1/menu_items?id=eq.1&select=price`, { headers: { apikey: SB_KEY } });
    const price = current.json?.[0]?.price;
    const res = await api(`${SB_URL}/rest/v1/menu_items?id=eq.1`, {
      method: 'PATCH',
      headers: { apikey: SB_KEY, authorization: `Bearer ${ownerAuth.json.access_token}`, prefer: 'return=representation' },
      json: { price }   // its own value: a real write that changes nothing
    });
    const rows = Array.isArray(res.json) ? res.json.length : 0;
    check('the probe can see a permitted write (owner writes the same price back)', rows === 1,
      `owner PATCH affected ${rows} row(s) — if 0, the kitchen results above prove nothing`);
  }
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} role checks passed`);
srv.close(); process.exit(0);
