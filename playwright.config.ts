import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // `pnpm e2e` builds first, so this only starts the Worker against dist/.
  webServer: {
    command: 'pnpm wrangler dev --port 8787 --var SMARTCART_PROVIDER:mock',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
