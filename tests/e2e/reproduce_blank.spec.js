import { test } from '@playwright/test';
import fs from 'fs';

test('reproduce blank page issue', async ({ page }) => {
  const logs = [];

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
      path: 'C:/Users/user/.gemini/antigravity-ide/brain/6a0d3255-a81b-4d01-987c-233d725d0104/reproduce_blank.png',
      fullPage: true
    });
  } finally {
    fs.writeFileSync(
      'C:/Users/user/.gemini/antigravity-ide/brain/6a0d3255-a81b-4d01-987c-233d725d0104/browser_reproduce_errors.txt',
      logs.join('\n')
    );
  }
});
