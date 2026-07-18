import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // The app performs IndexedDB and browser-engine initialization on every fresh
  // context. One worker keeps the release matrix deterministic on constrained
  // CI and avoids OS-level browser teardown failures after otherwise green runs.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run preview',
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
