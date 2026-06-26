// @ts-nocheck
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('public ordering page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/#/self-order');
  await expect(page.locator('header div').filter({ hasText: /^THE TASTE$/ }).last()).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const critical = results.violations.filter((violation) => violation.impact === 'critical');
  expect(critical).toEqual([]);
});
