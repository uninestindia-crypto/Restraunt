import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
    { name: 'iPhone SE', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
    { name: 'iPhone 15', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
    { name: 'Pixel 5', use: { ...devices['Pixel 5'], browserName: 'chromium' } },
    { name: 'iPad', use: { ...devices['iPad Pro 11'], browserName: 'chromium' } }
  ]
});
