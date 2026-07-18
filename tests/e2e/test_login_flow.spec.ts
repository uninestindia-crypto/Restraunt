import { expect, test } from '@playwright/test';

test('staff route exposes cloud sign-in and no local credential controls', async ({ page }) => {
  await page.goto('/#/pos');

  const login = page.locator('.login-screen');
  await expect(login).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await expect(page.getByLabel('Account email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: /Authorize access/i })).toBeVisible();
  await expect(login.getByText(/PIN/i)).toHaveCount(1); // explanatory disabled-production copy only
  await expect(page.locator('#tab-pin, #login-numpad, #staff-pin')).toHaveCount(0);
});
