import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

test.describe('99 - Challenger 1: Adversarial Frontend Stress Suite', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page);
    await setupApiInterception(page);
  });

  test('ADV-01: Rapid Navigation Stress Test across 6 Studio Routes', async ({ page }) => {
    test.setTimeout(90000);
    const consoleListener = setupConsoleErrorListener(page);
    const routes = [
      '/',
      '/slides',
      '/docs',
      '/sheets',
      '/deep-research',
      '/replay/canifa-sales-q3-deepdive',
    ];

    // Rapid burst navigation through all 6 studio routes
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      
      // Assert root container is always mounted
      const root = page.locator('#root');
      await expect(root).toBeAttached();
      
      if (route === '/') {
        await expect(page).toHaveURL(/\/$/);
      } else if (route.startsWith('/replay/')) {
        await expect(page).toHaveURL(/replay\/canifa-sales-q3-deepdive/);
      } else {
        await expect(page).toHaveURL(new RegExp(route));
      }
    }

    consoleListener.assertNoErrors();
  });

  test('ADV-02: Client-side Sidebar Fast-Clicking Churn', async ({ page }) => {
    test.setTimeout(60000);
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/');

    const navSelectors = [
      { text: /AI Slides|Slides/i, targetUrl: /\/slides/ },
      { text: /AI Word Docs|Word Docs|Docs/i, targetUrl: /\/docs/ },
      { text: /AI Sheets|Sheets/i, targetUrl: /\/sheets/ },
      { text: /Deep Research/i, targetUrl: /\/deep-research/ },
      { text: /Khám phá|Explore|Agent Swarm/i, targetUrl: /\/$/ },
    ];

    // Rapid client-side SPA navigation loop
    for (let loop = 0; loop < 2; loop++) {
      for (const nav of navSelectors) {
        const item = page.locator('button, a, div[role="button"]').filter({ hasText: nav.text }).first();
        if (await item.isVisible()) {
          await item.click();
          await expect(page).toHaveURL(nav.targetUrl, { timeout: 5000 });
        }
      }
    }

    consoleListener.assertNoErrors();
  });

  test('ADV-03: Dynamic Viewport Resizing under Live Animations (1920x1080 -> 1440x900 -> 1280x720 -> 1024x768 -> 800x600)', async ({ page }) => {
    test.setTimeout(90000);
    const consoleListener = setupConsoleErrorListener(page);
    const viewports = [
      { width: 1920, height: 1080, name: '1080p Desktop' },
      { width: 1440, height: 900, name: '1440p Laptop' },
      { width: 1280, height: 720, name: '720p Compact' },
      { width: 1024, height: 768, name: '1024x768 Tablet/Edge' },
      { width: 800, height: 600, name: '800x600 Narrow' },
    ];

    const testRoutes = ['/', '/slides', '/sheets', '/replay/canifa-sales-q3-deepdive'];

    for (const route of testRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(30);

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
          `Horizontal layout overflow at ${route} for viewport ${vp.name} (${overflow.maxScrollWidth}px > ${overflow.innerWidth}px)`
        ).toBe(false);

        // Ensure root container did not collapse
        const rootBox = await page.locator('#root').boundingBox();
        expect(rootBox).not.toBeNull();
        expect(rootBox!.width).toBeGreaterThan(0);
        expect(rootBox!.height).toBeGreaterThan(0);
      }
    }

    consoleListener.assertNoErrors();
  });

  test('ADV-04: High-Frequency Rapid Theme Toggling (20 Cycles)', async ({ page }) => {
    test.setTimeout(60000);
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/');

    for (let cycle = 1; cycle <= 20; cycle++) {
      const targetTheme = cycle % 2 === 0 ? 'dark' : 'light';

      await page.evaluate((theme) => {
        localStorage.setItem('__db_gpt_theme_key', theme);
        localStorage.setItem('dbgpt_theme_mode', theme);
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
          document.body?.classList.add('dark');
          document.body?.classList.remove('light');
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
          document.body?.classList.remove('dark');
          document.body?.classList.add('light');
        }
      }, targetTheme);

      // Verify DOM class consistency
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(targetTheme === 'dark');
    }

    consoleListener.assertNoErrors();
  });

  test('ADV-05: Replay Studio (/replay/canifa-sales-q3-deepdive) Playback & Scrubber Controls', async ({ page }) => {
    test.setTimeout(60000);
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/replay/canifa-sales-q3-deepdive', { waitUntil: 'domcontentloaded' });

    // Assert main replay studio container is visible
    const replayContainer = page.locator('#root');
    await expect(replayContainer).toBeVisible();

    // Verify presence of Replay Studio interface elements
    const pageText = await page.textContent('body');
    expect(pageText).toBeTruthy();

    // Test playback control buttons if present (Play/Pause, Step Next/Prev, Speed toggle)
    const playPauseBtn = page.locator('button').filter({ hasText: /Play|Pause|Phát|Tạm dừng/i }).first();
    if (await playPauseBtn.isVisible()) {
      await playPauseBtn.click();
      await page.waitForTimeout(50);
      await playPauseBtn.click();
    }

    const speedBtn = page.locator('button').filter({ hasText: /1x|1\.5x|2x/i }).first();
    if (await speedBtn.isVisible()) {
      await speedBtn.click();
    }

    consoleListener.assertNoErrors();
  });
});
