import { test } from '@playwright/test';
import fs from 'fs';

test('capture screenshots of storefront and staff login', async ({ page }) => {
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

  try {
    // Go to customer self-order storefront
    await page.goto('/#/self-order');
    await page.waitForTimeout(5000); // Wait longer to see if it loads or stays stuck
    await page.screenshot({
      path: `${outputDir}/storefront.png`,
      fullPage: true
    });

    // Go to staff POS (will trigger PIN login screen)
    await page.goto('/#/pos');
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: `${outputDir}/login.png`,
      fullPage: true
    });
  } finally {
    fs.writeFileSync(
      `${outputDir}/browser_errors.txt`,
      logs.join('\n')
    );
  }
});
