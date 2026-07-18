// @ts-nocheck
import { expect, test } from '@playwright/test';

test.describe('public launch routing', () => {
  test('fresh public entry opens customer ordering without staff authentication', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/#\/self-order/);
    await expect(page.getByRole('heading', { name: 'The Taste', level: 1 })).toBeVisible();
    await expect(page.getByText(/Order online from home|Table \d+/)).toBeVisible();
    await expect(page.getByText('Enter Staff PIN')).toHaveCount(0);
  });

  test('staff POS route requires cloud authorization', async ({ page }) => {
    await page.goto('/#/pos');

    await expect(page.locator('.login-screen')).toBeVisible();
    const loginText = await page.locator('.login-screen').textContent();
    expect(loginText).toMatch(/Staff sign in|Authorize access/i);
  });

  test('public storefront has no horizontal overflow', async ({ page }) => {
    await page.goto('/#/self-order');
    await expect(page.getByRole('heading', { name: 'The Taste', level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => {
      const root = document.querySelector('.storefront-shell') || document.documentElement;
      return Math.ceil(root.scrollWidth - root.clientWidth);
    });

    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('public checkout validation', () => {
  test('delivery checkout requires contact and address before submitting', async ({ page }) => {
    await page.goto('/#/self-order');

    const addButton = page.getByRole('button', { name: /^Add .+ to cart$/ }).nth(0);
    await expect(addButton).toBeVisible();
    await addButton.click();

    const floatingCart = page.locator('#btn-view-cart');
    if (await floatingCart.isVisible()) {
      await floatingCart.click();
    } else {
      await page.getByRole('navigation', { name: 'Mobile customer navigation' })
        .getByRole('button', { name: /^Cart 1$/ })
        .click();
    }
    await page.getByRole('button', { name: /Proceed to Checkout/i }).click();
    await page.getByRole('button', { name: /Place Order/i }).click();

    await expect(page.getByText(/Please enter your name/i)).toBeVisible();
  });
});
