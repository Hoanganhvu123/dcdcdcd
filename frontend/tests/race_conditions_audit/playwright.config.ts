import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * DB-GPT Chat History Race Conditions & Concurrency E2E Test Configuration
 * Dedicated configuration for multi-tab simultaneous dispatch, rapid burst race,
 * interleaved stream concurrency, and history hydration integrity verification.
 */
export default defineConfig({
  testDir: './specs',
  timeout: 90 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'race-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'Chromium Concurrency Rig',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command:
      process.platform === 'win32'
        ? 'pnpm.cmd -C frontend dev --port 3000'
        : 'pnpm -C frontend dev --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    cwd: path.resolve(__dirname, '../../../'),
  },
});
