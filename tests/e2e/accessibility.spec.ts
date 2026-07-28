// @ts-nocheck
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Gate on `serious` as well as `critical`. `serious` covers the failures that
 * actually block people — insufficient contrast, unlabelled controls, broken
 * heading order — and letting them pass silently is how they accumulate.
 */
function blocking(violations) {
  return violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

function describeViolations(violations) {
  return violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 120)).join('\n    ')}`)
    .join('\n');
}

test('public ordering page has no critical or serious accessibility violations', async ({ page }) => {
  await page.goto('/#/self-order');
  await expect(page.getByRole('heading', { name: 'The Taste', level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const found = blocking(results.violations);
  expect(found, describeViolations(found)).toEqual([]);
});

test('staff sign in has no critical or serious accessibility violations', async ({ page }) => {
  await page.goto('/#/pos');
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const found = blocking(results.violations);
  expect(found, describeViolations(found)).toEqual([]);
});

test('staff sign in fields are styled, not browser defaults', async ({ page }) => {
  // Regression guard: these inputs previously referenced a `.form-input` class
  // that existed in no stylesheet, so they rendered as unstyled native boxes.
  await page.goto('/#/pos');
  const email = page.locator('#login-email');
  await expect(email).toBeVisible();

  const radius = await email.evaluate((el) => window.getComputedStyle(el).borderRadius);
  expect(radius, 'login email field should pick up design-system input styling').not.toBe('0px');
});

test('interactive controls meet the 44px touch target minimum on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/self-order');
  await expect(page.getByRole('heading', { name: 'The Taste', level: 1 })).toBeVisible();

  const undersized = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a[href], input, select, [role="button"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // Inline links inside prose are exempt under SC 2.5.5.
      if (el.tagName === 'A' && el.closest('p, small, li')) return;
      if (r.height < 44) {
        out.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || '').trim().slice(0, 24)}"`);
      }
    });
    return out;
  });

  expect(undersized, `undersized touch targets:\n${undersized.join('\n')}`).toEqual([]);
});

test('storefront does not scroll horizontally on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/#/self-order');
  await expect(page.getByRole('heading', { name: 'The Taste', level: 1 })).toBeVisible();

  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW).toBeLessThanOrEqual(clientW);
});
