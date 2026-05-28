import { test } from '@playwright/test';

test('debug sign in click', async ({ page }) => {
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.message}\nStack:\n${err.stack}`);
  });

  console.log('Navigating to /#/pos...');
  await page.goto('/#/pos');
  
  console.log('Waiting for login fields...');
  await page.waitForSelector('#login-email');
  
  console.log('Filling credentials...');
  await page.fill('#login-email', 'wrong@example.com');
  await page.fill('#login-password', 'wrongpassword');
  
  console.log('Clicking Authorize Access...');
  await page.click('#btn-cloud-login');
  
  console.log('Waiting 10 seconds to see response...');
  await page.waitForTimeout(10000);
});
