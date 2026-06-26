import { test } from '@playwright/test';
import fs from 'fs';

test('reproduce blank page issue', async ({ page }) => {
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
    // Go to root
    await page.goto('/');
    await page.waitForTimeout(6000); // Wait for initialization to complete

    // Capture screenshot
    await page.screenshot({
      path: `${outputDir}/reproduce_blank.png`,
      fullPage: true
    });
  } finally {
    fs.writeFileSync(
      `${outputDir}/browser_reproduce_errors.txt`,
      logs.join('\n')
    );
  }
});
