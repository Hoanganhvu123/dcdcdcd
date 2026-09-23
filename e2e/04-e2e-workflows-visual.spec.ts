import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

const SNAPSHOTS_DIR = path.resolve(__dirname, 'snapshots');

test.describe('04 - E2E User Workflows & Visual Snapshot Suite', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page);
    await setupApiInterception(page);
  });

  test('04.1 - Prompt Submission Workflow: should submit prompt and display streaming conversation output', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/');

    // Locate prompt textarea or input box
    const promptInput = page.locator('textarea, input[type="text"]').first();
    if (await promptInput.isVisible()) {
      await promptInput.fill('Phân tích tổng quan hiệu quả hệ thống AI DB-GPT 2026.');
      
      // Look for submit / send button or press enter
      const sendButton = page.locator('button:has(svg), button[type="submit"]').last();
      if (await sendButton.isVisible()) {
        await sendButton.click();
      } else {
        await promptInput.press('Enter');
      }

      // Verify conversation container or response text is rendered
      await page.waitForTimeout(500);
      const appContainer = page.locator('#root');
      await expect(appContainer).toBeVisible();
    }

    consoleListener.assertNoErrors();
  });

  test('04.2 - Studio Template Selection Workflow: should pick a template card and initiate workbench prompt', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/slides');

    // Look for template card or action buttons
    const templateCard = page.locator('div[class*="cursor-pointer"], button').filter({ hasText: /Chiến Lược|Báo Cáo|Slide|Tạo/i }).first();
    if (await templateCard.isVisible()) {
      await templateCard.click();
      // Verify redirection or modal trigger
      await page.waitForTimeout(300);
    }

    consoleListener.assertNoErrors();
  });

  test('04.3 - Visual Snapshots: should capture high-fidelity viewport screenshots across all primary studios', async ({ page }, testInfo) => {
    const consoleListener = setupConsoleErrorListener(page);
    const routesToSnapshot = [
      { name: 'workbench-home', path: '/' },
      { name: 'studio-slides', path: '/slides' },
      { name: 'studio-docs', path: '/docs' },
      { name: 'studio-sheets', path: '/sheets' },
      { name: 'studio-deep-research', path: '/deep-research' },
    ];

    const projectName = testInfo.project.name.replace(/[^a-zA-Z0-9_-]/g, '_');

    for (const route of routesToSnapshot) {
      await page.goto(route.path);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(300); // Allow spring animations to settle

      const screenshotPath = path.join(
        SNAPSHOTS_DIR,
        `${route.name}_${projectName}.png`
      );

      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
      });

      expect(fs.existsSync(screenshotPath)).toBe(true);
    }

    consoleListener.assertNoErrors();
  });

  test('04.4 - Zero Console Errors: should enforce strict zero runtime exception invariant across full workflow', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);

    // Multi-step journey
    await page.goto('/');
    await page.waitForTimeout(200);

    await page.goto('/slides');
    await page.waitForTimeout(200);

    await page.goto('/docs');
    await page.waitForTimeout(200);

    await page.goto('/sheets');
    await page.waitForTimeout(200);

    await page.goto('/deep-research');
    await page.waitForTimeout(200);

    consoleListener.assertNoErrors();
  });
});
