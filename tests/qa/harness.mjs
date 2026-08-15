// Shared QA harness: a real browser against the live deployments, with everything it says written down.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { intercept } from './net.mjs';

export const POS = 'https://restraunt-d646-nine.vercel.app';
export const SELF = 'https://restraunt-two.vercel.app';

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

export async function open({ viewport = VIEWPORTS.desktop, mobile = false } = {}) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    ignoreHTTPSErrors: true
  });

  const log = { console: [], pageErrors: [], failed: [], net: [] };
  await intercept(context, log);

  const page = await context.newPage();
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') log.console.push({ type: t, text: m.text().slice(0, 400) });
  });
  page.on('pageerror', (e) => log.pageErrors.push(String(e).slice(0, 400)));

  return { browser, context, page, log };
}

export async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  return path;
}

export function dump(name, data) {
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
}

export const settle = (page, ms = 3500) => page.waitForTimeout(ms);

/** Supabase calls only — the ones that decide whether this thing actually works. */
export const supabaseCalls = (log) => log.net.filter((r) => r.url.includes('supabase.co'));

export function summarise(log) {
  const errs = log.console.filter((c) => c.type === 'error');
  return {
    consoleErrors: errs.length,
    pageErrors: log.pageErrors.length,
    failedRequests: log.failed.length,
    supabase: supabaseCalls(log).length,
    sampleConsole: errs.slice(0, 10).map((e) => e.text),
    samplePageErrors: log.pageErrors.slice(0, 6),
    sampleFailed: log.failed.slice(0, 12)
  };
}

/** The connection strip, if it is saying anything. */
export const bannerText = (page) =>
  page.evaluate(() => document.querySelector('.connection-strip-text')?.textContent?.trim() || null);
