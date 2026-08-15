/**
 * The QA driver.
 *
 * `target: 'live'` drives the deployed Vercel apps — that is the build the launch decision is
 * about. `target: 'local'` serves ./dist instead, to check whether a fix made in this session
 * actually changes the behaviour. Findings must always say which one they came from.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { intercept } from './net.mjs';

export const LIVE_POS = 'https://restraunt-d646-nine.vercel.app';
export const LIVE_SELF = 'https://restraunt-two.vercel.app';

export const STAFF = { email: 'staff1@thetaste.com', password: '123456' };
export const OWNER = { email: 'mohammadjalaluddin1010@gmail.com', password: '123456' };

export const OUT = '/tmp/claude-0/-home-user-Restraunt/fdf1f216-74b6-5b33-8106-81640b245ebf/scratchpad/qa';
mkdirSync(OUT, { recursive: true });

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1366, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 }
};

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json'
};

export function serveDist(port = 3000) {
  const srv = createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let f = join('dist', p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) {
      const asHtml = join('dist', p + '.html');
      f = existsSync(asHtml) ? asHtml : join('dist', 'index.html');
    }
    if (!existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}

export async function session({ viewport = VIEWPORTS.desktop, mobile = false } = {}) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport, isMobile: mobile, hasTouch: mobile, ignoreHTTPSErrors: true
  });
  const log = { console: [], pageErrors: [], failed: [], net: [], all: [] };
  await intercept(context, log);

  const page = await context.newPage();
  page.on('console', (m) => {
    log.all.push(m.text().slice(0, 300));
    const t = m.type();
    if (t === 'error' || t === 'warning') log.console.push({ type: t, text: m.text().slice(0, 400) });
  });
  page.on('pageerror', (e) => log.pageErrors.push(String(e).slice(0, 400)));
  return { browser, context, page, log };
}

export const settle = (page, ms = 4000) => page.waitForTimeout(ms);
export const sb = (log) => log.net.filter((r) => r.url.includes('supabase.co'));
export const bannerText = (page) =>
  page.evaluate(() => document.querySelector('.connection-strip-text')?.textContent?.trim() || null);
export const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` }).then(() => `${OUT}/${name}.png`);

/** Sign in on the staff surface. Returns what actually happened, not what was hoped. */
export async function staffLogin(page, base, { email, password }, { timeout = 25000 } = {}) {
  await page.goto(`${base}/#/pos`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page, 3500);

  const emailBox = page.locator('input[type=email], input[name*=email i], input[placeholder*=email i]').first();
  const passBox = page.locator('input[type=password]').first();
  if (!(await emailBox.count()) || !(await passBox.count())) {
    return { ok: false, reason: 'no sign-in form found' };
  }
  await emailBox.fill(email);
  await passBox.fill(password);

  const btn = page.getByRole('button', { name: /authorize|sign in|log ?in/i }).first();
  await btn.click();

  try {
    await page.waitForFunction(
      () => !document.querySelector('input[type=password]'),
      { timeout }
    );
    await settle(page, 4000);
    return { ok: true };
  } catch {
    const err = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/(invalid|incorrect|not authorized|failed|error|denied|no active|disabled)[^\n]{0,140}/i);
      return m ? m[0] : null;
    });
    return { ok: false, reason: err || 'still on the sign-in form after timeout' };
  }
}

export function summarise(log) {
  const errs = log.console.filter((c) => c.type === 'error');
  return {
    consoleErrors: errs.length,
    pageErrors: log.pageErrors.length,
    failedRequests: log.failed.length,
    sampleConsole: errs.slice(0, 8).map((e) => e.text),
    samplePageErrors: log.pageErrors.slice(0, 5),
    sampleFailed: log.failed.slice(0, 10)
  };
}
