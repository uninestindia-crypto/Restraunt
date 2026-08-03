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

/**
 * Wait for the page to stop moving before auditing it.
 *
 * Contrast is computed from whatever colour an element happens to have at the
 * instant of the scan. The app fades its view in and transitions its chips and
 * buttons, so auditing mid-animation measures a blend that exists for 250ms and
 * reports it as a violation — a chip that is white-on-terracotta at rest was
 * being failed as grey-on-salmon.
 */
async function settle(page) {
  await page.waitForFunction(
    () => document.getAnimations().every((animation) => animation.playState !== 'running'),
    null,
    { timeout: 5000 }
  ).catch(() => {});
}

test('public ordering page has no critical or serious accessibility violations', async ({ page }) => {
  await page.goto('/#/self-order');

  // The pre-rendered shell carries the same <h1>, so waiting on the heading
  // alone would audit the static markup instead of the running app. The shell
  // is detached once the SPA owns the page (see hideLoadingScreen).
  await expect(page.locator('#storefront-seo-shell')).toHaveCount(0);
  await expect(page.locator('.storefront-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Taste', level: 1 })).toBeVisible();
  await settle(page);

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const found = blocking(results.violations);
  expect(found, describeViolations(found)).toEqual([]);
});

test('staff sign in has no critical or serious accessibility violations', async ({ page }) => {
  await page.goto('/#/pos');
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await settle(page);

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

test('item details are reachable by keyboard and the dialog manages focus', async ({ page }) => {
  await page.goto('/#/self-order');
  await expect(page.getByRole('heading', { name: 'The Taste', level: 1 })).toBeVisible();

  // The menu hydrates from IndexedDB after first paint, so wait for a card
  // rather than sampling the count immediately.
  const trigger = page.locator('.store-menu-item-open').first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });

  // The card is click-to-open for a mouse; this asserts the keyboard path.
  await trigger.focus();
  const triggerLabel = await trigger.getAttribute('aria-label');
  await page.keyboard.press('Enter');

  const surface = page.locator('.aether-drawer-sheet, .modal-overlay .modal').first();
  await expect(surface).toBeVisible();

  await expect(surface).toHaveAttribute('role', 'dialog');
  await expect(surface).toHaveAttribute('aria-modal', 'true');

  expect(
    await page.evaluate(() => {
      const s = document.querySelector('.aether-drawer-sheet, .modal-overlay .modal');
      return !!s && s.contains(document.activeElement);
    }),
    'focus should move into the dialog on open'
  ).toBe(true);

  // Tabbing must cycle inside the dialog rather than reaching the page behind.
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    const escaped = await page.evaluate(() => {
      const s = document.querySelector('.aether-drawer-sheet, .modal-overlay .modal');
      return !!s && !s.contains(document.activeElement);
    });
    expect(escaped, `focus escaped the dialog after ${i + 1} Tab presses`).toBe(false);
  }

  await page.keyboard.press('Escape');
  await expect(surface).toBeHidden();

  // Focus must land back on the triggering control, or — if a re-render
  // replaced it — on the main landmark. What it must never do is collapse to
  // <body>, which strands keyboard users at the top of the document.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return 'body';
          return el.getAttribute('aria-label') || el.id || el.tagName;
        }),
      { message: 'focus must not be dropped on <body> when a dialog closes', timeout: 5_000 }
    )
    .not.toBe('body');

  const landed = await page.evaluate(() => {
    const el = document.activeElement;
    return { label: el?.getAttribute('aria-label'), id: el?.id };
  });
  expect(
    landed.label === triggerLabel || landed.id === 'main-content',
    `focus landed on ${JSON.stringify(landed)}; expected the trigger or the main landmark`
  ).toBe(true);
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

  // The menu renders after the heading, and it carries the full-bleed sticky
  // toolbar and the carousels — the parts most able to push the page sideways.
  // Measuring on the heading alone passed while the page really did overflow.
  await expect(page.locator('.store-menu-item').first()).toBeVisible();
  await settle(page);

  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW).toBeLessThanOrEqual(clientW);
});

test('the customer navigation bar stays on screen instead of sinking to the page foot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/self-order');
  await expect(page.locator('.store-menu-item').first()).toBeVisible();
  await settle(page);

  // `position: fixed` is only relative to the viewport while no ancestor has a
  // transform, filter or clip — an identity matrix left behind by a finished
  // animation is enough to re-anchor it to the page, which put the bar below
  // the fold at the very bottom of the menu.
  const onScreen = async () => page.evaluate(() => {
    const nav = document.querySelector('.customer-bottom-nav');
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    return rect.bottom <= window.innerHeight + 1 && rect.top >= 0;
  });

  expect(await onScreen()).toBe(true);

  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(400);
  expect(await onScreen()).toBe(true);
});
