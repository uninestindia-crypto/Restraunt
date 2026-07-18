import { expect, test } from '@playwright/test';

test('legacy browser flags cannot bypass cloud staff authorization', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_staff_pin', 'attacker-controlled-value');
    localStorage.setItem('pin_authorized_9999', 'true');
    localStorage.setItem('staff_role', 'owner');
  });

  await page.goto('/#/pos');

  await expect(page.locator('.login-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await expect(page.locator('.app-sidebar, #pos-view')).toHaveCount(0);
});
