// @ts-nocheck
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function blocking(violations) {
  return violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

function describeViolations(violations) {
  return violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 120)).join('\n    ')}`)
    .join('\n');
}

/**
 * The storefront's discoverability rests on content that exists before the
 * bundle runs. These tests browse with JavaScript disabled, which is the
 * closest available approximation of what a crawler indexes.
 */
test.describe('pre-rendered storefront', () => {
  test.use({ javaScriptEnabled: false });

  test('the home page serves the menu without JavaScript', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'The Taste', level: 1 })).toBeVisible();

    const dishes = page.locator('.seo-shell-item-name');
    expect(await dishes.count()).toBeGreaterThan(10);
    await expect(dishes.first()).toBeVisible();

    // Prices have to be in the markup, not fetched later.
    await expect(page.locator('.seo-shell-item-price').first()).toContainText('₹');

    // The splash screen must not trap a no-JS visitor behind a spinner.
    await expect(page.locator('#loading-screen')).toBeHidden();
  });

  test('the menu page lists every dish with a price', async ({ page }) => {
    await page.goto('/menu');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Everything we cook');
    const rows = page.locator('.static-menu-section li');
    expect(await rows.count()).toBeGreaterThan(10);
    await expect(page.locator('.static-menu-price').first()).toContainText('₹');
  });

  test('marketing routes are real pages with their own titles', async ({ page }) => {
    const routes = [
      ['/offers', /Offers/i],
      ['/about', /Story/i],
      ['/catering', /Catering/i],
      ['/support', /Help|Support/i]
    ];

    for (const [path, titlePattern] of routes) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should be served statically`).toBeLessThan(400);
      await expect(page).toHaveTitle(titlePattern);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('structured data is present in the response body', async ({ page }) => {
    await page.goto('/');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length).toBeGreaterThan(0);

    const restaurant = JSON.parse(blocks[0]);
    expect(restaurant['@type']).toBe('Restaurant');
    expect(restaurant.hasMenu.hasMenuSection.length).toBeGreaterThan(0);
  });
});

test('static marketing pages have no critical or serious accessibility violations', async ({ page }) => {
  for (const path of ['/menu', '/about', '/support']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    const found = blocking(results.violations);
    expect(found, `${path}\n${describeViolations(found)}`).toEqual([]);
  }
});
