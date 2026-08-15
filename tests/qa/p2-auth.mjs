// Phase 2 — authentication, against the live POS deployment.
import { session, settle, shot, staffLogin, summarise, sb, LIVE_POS, STAFF, OWNER } from './drive.mjs';

const results = [];
const record = (name, status, detail) => {
  results.push({ name, status, detail });
  console.log(`${status.padEnd(7)} ${name}${detail ? '  — ' + detail : ''}`);
};

// ── Bad credentials ────────────────────────────────────────────────
const badCases = [
  ['wrong password', { email: STAFF.email, password: 'definitely-wrong-9999' }],
  ['unknown email', { email: 'nobody-qa-test@thetaste.com', password: '123456' }],
  ['malformed email', { email: 'not-an-email', password: '123456' }],
  ['empty password', { email: STAFF.email, password: '' }],
  ['empty email', { email: '', password: '123456' }]
];

for (const [label, creds] of badCases) {
  const { browser, page, log } = await session();
  try {
    const r = await staffLogin(page, LIVE_POS, creds, { timeout: 12000 });
    if (r.ok) {
      record(`reject: ${label}`, 'FAIL', 'SIGNED IN with bad credentials');
      await shot(page, `auth-bad-${label.replace(/\s+/g, '-')}`);
    } else {
      const visible = await page.evaluate(() => {
        const t = document.body.innerText;
        const m = t.match(/(invalid|incorrect|required|missing|not authorized|failed|denied|enter)[^\n]{0,120}/i);
        return m ? m[0].trim() : null;
      });
      record(`reject: ${label}`, visible ? 'PASS' : 'PARTIAL',
        visible ? `message: "${visible.slice(0, 90)}"` : 'rejected but NO visible message to the user');
    }
  } catch (e) {
    record(`reject: ${label}`, 'FAIL', String(e).split('\n')[0].slice(0, 120));
  } finally { await browser.close(); }
}

// ── Real logins ────────────────────────────────────────────────────
for (const [label, creds] of [['staff', STAFF], ['owner', OWNER]]) {
  const { browser, page, log } = await session();
  try {
    const r = await staffLogin(page, LIVE_POS, creds);
    if (!r.ok) {
      record(`login: ${label}`, 'FAIL', r.reason);
      await shot(page, `auth-${label}-failed`);
    } else {
      const view = await page.evaluate(() => ({
        text: document.body.innerText.slice(0, 300).replace(/\s+/g, ' '),
        len: document.body.innerText.length,
        nav: [...document.querySelectorAll('nav a, [class*=nav] a, [class*=sidebar] a, [data-route]')]
          .map((a) => (a.textContent || '').trim()).filter(Boolean).slice(0, 40)
      }));
      record(`login: ${label}`, 'PASS', `landed, ${view.len} chars, ${view.nav.length} nav items`);
      await shot(page, `auth-${label}-in`);

      // Session persistence across a reload.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settle(page, 5000);
      const stillIn = await page.evaluate(() => !document.querySelector('input[type=password]'));
      record(`session survives refresh: ${label}`, stillIn ? 'PASS' : 'FAIL',
        stillIn ? '' : 'thrown back to sign-in after reload');

      results.push({ name: `nav-${label}`, status: 'INFO', detail: view.nav.join(' | ') });
      console.log(`   nav(${label}): ${view.nav.join(' | ').slice(0, 400)}`);
    }
    const s = summarise(log);
    if (s.consoleErrors || s.pageErrors) {
      console.log(`   console errors=${s.consoleErrors} pageErrors=${s.pageErrors}`);
      for (const e of s.samplePageErrors) console.log('     PAGEERROR ' + e.slice(0, 150));
      for (const e of s.sampleConsole.slice(0, 4)) console.log('     CONSOLE ' + e.slice(0, 150));
    }
  } catch (e) {
    record(`login: ${label}`, 'FAIL', String(e).split('\n')[0].slice(0, 150));
  } finally { await browser.close(); }
}

// ── Protected routes while signed out ──────────────────────────────
for (const route of ['#/admin', '#/kitchen', '#/staff', '#/reports', '#/inventory', '#/settings']) {
  const { browser, page } = await session();
  try {
    await page.goto(`${LIVE_POS}/${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 4000);
    const gated = await page.evaluate(() =>
      !!document.querySelector('input[type=password]') || /sign in|authorize/i.test(document.body.innerText)
    );
    record(`signed-out ${route} is gated`, gated ? 'PASS' : 'FAIL',
      gated ? '' : 'route rendered without authentication');
    if (!gated) await shot(page, `auth-open-${route.replace(/\W/g, '')}`);
  } catch (e) {
    record(`signed-out ${route} is gated`, 'FAIL', String(e).split('\n')[0].slice(0, 120));
  } finally { await browser.close(); }
}

console.log('\n--- Phase 2 summary ---');
for (const s of ['FAIL', 'PARTIAL', 'PASS']) {
  const n = results.filter((r) => r.status === s).length;
  if (n) console.log(`${s}: ${n}`);
}
process.exit(0);
