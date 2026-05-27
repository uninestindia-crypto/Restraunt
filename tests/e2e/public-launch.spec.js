import { expect, test } from '@playwright/test';

test.describe('public launch routing', () => {
  test('fresh public entry opens customer ordering without staff PIN', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/#\/self-order/);
    await expect(page.locator('header div').filter({ hasText: /^THE TASTE$/ }).last()).toBeVisible();
    await expect(page.getByText(/Order online from home|Table \d+/)).toBeVisible();
    await expect(page.getByText('Enter Staff PIN')).toHaveCount(0);
  });

  test('staff POS route remains protected by staff PIN or owner setup', async ({ page }) => {
    await page.goto('/#/pos');

    await expect(
      page.getByText('Enter Staff PIN').or(page.getByText('Owner setup required'))
    ).toBeVisible();
  });
});

test.describe('public checkout validation', () => {
  test('delivery checkout requires contact and address before submitting', async ({ page }) => {
    await page.goto('/#/self-order');

    const addButton = page.locator('.btn-add').first();
    await expect(addButton).toBeVisible();
    await addButton.click();
    await page.getByRole('button', { name: /item.*cart|items.*cart/i }).click();
    await page.getByRole('button', { name: /Proceed to Checkout/i }).click();
    await page.getByRole('button', { name: /Place Order/i }).click();

    await expect(page.getByText(/Please enter your name/i)).toBeVisible();
  });
});
