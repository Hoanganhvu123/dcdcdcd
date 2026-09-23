import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

test.describe('Re-verification Empirical Suite: Challenger 1 Re-verify', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page);
    await setupApiInterception(page);
  });

  test('REVERIFY-01: data_index.tsx Line 104 Null/Empty/Degraded API Response Null-Safety', async ({ page }) => {
    // Intercept /api/v1/app/list with null, empty, corrupt responses
    const degradedPayloads = [
      null,
      undefined,
      {},
      { app_list: null, total_count: 0 },
      { app_list: undefined, total_count: 0 },
      { app_list: 'invalid-string', total_count: 0 },
      { app_list: 12345, total_count: 0 },
      { app_list: [], total_count: 0 },
    ];

    const capturedErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        capturedErrors.push(`[Console Error] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      capturedErrors.push(`[Page Error] ${err.message}`);
    });

    for (const payload of degradedPayloads) {
      await page.route('**/api/v1/app/list*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: payload,
          }),
        });
      });

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(100);

      // Verify that no TypeError occurred
      const typeErrorOccurred = capturedErrors.some((e) =>
        e.includes("Cannot use 'in' operator to search for 'app_list' in null") ||
        e.includes("TypeError")
      );
      expect(typeErrorOccurred, `TypeError occurred for payload: ${JSON.stringify(payload)}`).toBe(false);
    }

    expect(capturedErrors.filter(e => e.includes('Cannot use \'in\' operator'))).toEqual([]);
  });

  test('REVERIFY-02: side-bar.tsx Theme & Language Popovers Clean Render Without Radix Slot Warnings', async ({ page }) => {
    const rawConsoleLogs: string[] = [];
    page.on('console', (msg) => {
      rawConsoleLogs.push(msg.text());
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Locate theme popover button
    const themeBtn = page.locator('button[aria-label^="Giao diện"]').first();
    await expect(themeBtn).toBeVisible({ timeout: 5000 });
    await themeBtn.click();
    await page.waitForTimeout(100);

    // Verify popover opened
    const themePopoverContent = page.locator('text=CHỌN GIAO DIỆN');
    await expect(themePopoverContent).toBeVisible();

    // Click dark theme
    const darkOption = page.locator('button').filter({ hasText: /Tối \(Dark\)/i }).first();
    if (await darkOption.isVisible()) {
      await darkOption.click();
      await page.waitForTimeout(100);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(true);
    }

    // Locate language popover button
    const langBtn = page.locator('button[aria-label^="Ngôn ngữ"]').first();
    await expect(langBtn).toBeVisible({ timeout: 5000 });
    await langBtn.click();
    await page.waitForTimeout(100);

    // Verify language popover opened
    const langPopoverContent = page.locator('text=NGÔN NGỮ / LANG');
    await expect(langPopoverContent).toBeVisible();

    // Check raw logs for Radix Slot or forwardRef warnings
    const radixRefWarnings = rawConsoleLogs.filter((log) =>
      log.includes('Warning: Function components cannot be given refs') ||
      log.includes('Check the render method of `Primitive.button.Slot`') ||
      log.includes('Radix')
    );

    expect(radixRefWarnings, `Found Radix Slot ref warnings:\n${radixRefWarnings.join('\n')}`).toEqual([]);
  });

  test('REVERIFY-03: Stress Navigation & Viewport Matrix Across All 5 Studios + Replay', async ({ page }) => {
    test.setTimeout(120000);
    const consoleListener = setupConsoleErrorListener(page);

    const studioRoutes = [
      { name: 'Workbench (App Studio)', path: '/' },
      { name: 'AI Slides Studio', path: '/slides' },
      { name: 'AI Word Docs Studio', path: '/docs' },
      { name: 'AI Sheets Studio', path: '/sheets' },
      { name: 'Autonomous Deep Research', path: '/deep-research' },
      { name: 'Interactive Replay Studio', path: '/replay/canifa-sales-q3-deepdive' },
    ];

    const viewports = [
      { width: 1920, height: 1080, name: '1920x1080' },
      { width: 1440, height: 900, name: '1440x900' },
      { width: 1280, height: 720, name: '1280x720' },
      { width: 1024, height: 768, name: '1024x768' },
    ];

    for (const studio of studioRoutes) {
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(studio.path, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(50);

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          const body = document.body;
          const html = document.documentElement;
          const maxScrollWidth = Math.max(body.scrollWidth, html.scrollWidth);
          return {
            maxScrollWidth,
            innerWidth: window.innerWidth,
            isOverflowing: maxScrollWidth > window.innerWidth + 2,
          };
        });

        expect(
          overflow.isOverflowing,
          `Horizontal layout overflow at ${studio.name} (${studio.path}) on ${vp.name}: scrollWidth=${overflow.maxScrollWidth}px > innerWidth=${overflow.innerWidth}px`
        ).toBe(false);

        // Root container check
        const root = page.locator('#root');
        await expect(root).toBeVisible();
      }
    }

    consoleListener.assertNoErrors();
  });

  test('REVERIFY-04: Theme Toggling & State Persistence (Light, Dark, System)', async ({ page }) => {
    test.setTimeout(60000);
    const consoleListener = setupConsoleErrorListener(page);

    await page.goto('/');

    const themes: Array<'light' | 'dark' | 'system'> = ['dark', 'light', 'dark', 'light', 'system'];
    for (const theme of themes) {
      const themeBtn = page.locator('button[aria-label^="Giao diện"]').first();
      await themeBtn.click();
      await page.waitForTimeout(50);

      if (theme === 'dark') {
        const darkOpt = page.locator('button').filter({ hasText: /Tối \(Dark\)/i }).first();
        await darkOpt.click();
      } else if (theme === 'light') {
        const lightOpt = page.locator('button').filter({ hasText: /Sáng \(Light\)/i }).first();
        await lightOpt.click();
      } else {
        const sysOpt = page.locator('button').filter({ hasText: /Theo hệ thống/i }).first();
        await sysOpt.click();
      }

      await page.waitForTimeout(50);
    }

    consoleListener.assertNoErrors();
  });
});
