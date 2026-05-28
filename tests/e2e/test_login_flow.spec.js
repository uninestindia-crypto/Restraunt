import { test, expect } from '@playwright/test';
import fs from 'fs';

test('manually log in with PIN and check POS view', async ({ page }) => {
  const logs = [];

  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    logs.push(`[ERROR] ${err.message}\nStack:\n${err.stack}`);
  });

  try {
    // Navigate to root to initialize database origin
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Set up mock owner staff in database
    await page.evaluate(async () => {
      const { db } = await import('/src/db/database.js');
      const { hashPin } = await import('/src/utils/crypto.js');

      const pin = '5555';
      const pinHash = await hashPin(pin);
      const mockStaff = {
        id: 9999,
        name: 'Test Owner',
        role: 'owner',
        pinHash: pinHash,
        allowExpress: 1,
        isActive: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSynced: 1
      };

      // Add mock staff
      await db.staff.put(mockStaff);
    });

    // Go directly to POS route and reload to force clean boot on POS path
    await page.goto('/#/pos');
    await page.reload();
    await page.waitForTimeout(4000);

    // Log current state
    const currentUrl = page.url();
    logs.push(`[DEBUG] Current URL after reload: ${currentUrl}`);
    const bodyHtml = await page.innerHTML('body');
    logs.push(`[DEBUG] Body HTML contains #tab-pin: ${bodyHtml.includes('id="tab-pin"') || bodyHtml.includes('tab-pin')}`);

    // Click on the Local PIN tab
    await page.click('#tab-pin');
    await page.waitForTimeout(500);

    // Type PIN 5555 using keyboard inputs
    await page.keyboard.press('5');
    await page.keyboard.press('5');
    await page.keyboard.press('5');
    await page.keyboard.press('5');

    // Wait for login transition and view mounting
    await page.waitForTimeout(6000);

    // Capture screenshot after login
    await page.screenshot({
      path: 'C:/Users/user/.gemini/antigravity-ide/brain/6a0d3255-a81b-4d01-987c-233d725d0104/test_login_flow.png',
      fullPage: true
    });
  } finally {
    fs.writeFileSync(
      'd:/Zeaul/Restraunt/browser_login_flow_errors.txt',
      logs.join('\n')
    );
  }
});
