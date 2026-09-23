import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * DB-GPT Playwright E2E Test Configuration
 * Configured for multi-viewport rendering, snapshot storage, and live/mock integration testing.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
    ['json', { outputFile: 'e2e-results.json' }],
  ],
  snapshotDir: './e2e/snapshots',
  snapshotPathTemplate: '{testDir}/snapshots/{testFileDir}/{testFileName}/{arg}{ext}',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'Desktop Wide (1920x1080)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'Laptop (1440x900)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'Compact (1280x720)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  ...(process.env.START_WEBSERVER === '1'
    ? {
        webServer: {
          command:
            process.platform === 'win32'
              ? 'pnpm.cmd -C frontend dev --port 3000'
              : 'pnpm -C frontend dev --port 3000',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }
    : {}),
});
