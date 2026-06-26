// @ts-nocheck
import { test, expect } from '@playwright/test';
import fs from 'fs';

test('reproduce staff logged-in blank page', async ({ page }) => {
  const logs = [];
  const outputDir = './test-results';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    logs.push(`[ERROR] ${err.message}\nStack:\n${err.stack}`);
  });

  // Navigate to root to initialize database
  await page.goto('/');
  await page.waitForTimeout(2000);

  // Mock staff in Dexie database and set localStorage session keys
  await page.evaluate(async () => {
    // Import database
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

    // Add to staff table
    await db.staff.put(mockStaff);

    // Set localStorage session items
    localStorage.setItem('auth_staff_pin', pinHash);
    localStorage.setItem('pin_authorized_9999', 'true');
    localStorage.setItem('app_theme', 'dark'); // Force dark theme for consistency
  });

  // Reload page to restore session
  await page.goto('/#/pos');
  await page.reload();
  await page.waitForTimeout(6000); // Wait for views to mount

  // Capture screenshot of the logged-in state
  await page.screenshot({
    path: `${outputDir}/test_logged_in.png`,
    fullPage: true
  });

  // Log DOM contents of app
  const appHtml = await page.innerHTML('#app');
  logs.push(`[DOM CONTENT OF #app] ${appHtml}`);

  fs.writeFileSync(
    `${outputDir}/browser_logged_in_errors.txt`,
    logs.join('\n')
  );
});
