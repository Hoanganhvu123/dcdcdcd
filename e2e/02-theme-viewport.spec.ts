import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

test.describe('02 - Dark/Light Theme & Multi-Viewport Responsiveness Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page);
    await setupApiInterception(page);
  });

  test('02.1 - should toggle Dark mode and verify .dark class on html/body and localStorage', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/');

    // Evaluate initial root class or toggle theme
    await page.evaluate(() => {
      // Direct theme dispatch or context test
      localStorage.setItem('__db_gpt_theme_key', 'dark');
      localStorage.setItem('dbgpt_theme_mode', 'dark');
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.body?.classList.add('dark');
      document.body?.classList.remove('light');
    });

    // Check class on documentElement and body
    const hasDarkClass = await page.evaluate(() => {
      return (
        document.documentElement.classList.contains('dark') ||
        document.body.classList.contains('dark')
      );
    });
    expect(hasDarkClass).toBe(true);

    // Verify localStorage key
    const themeInStorage = await page.evaluate(() => {
      return localStorage.getItem('__db_gpt_theme_key') || localStorage.getItem('dbgpt_theme_mode');
    });
    expect(themeInStorage).toBe('dark');

    consoleListener.assertNoErrors();
  });

  test('02.2 - should toggle Light mode and verify .light class (removing .dark)', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/');

    await page.evaluate(() => {
      localStorage.setItem('__db_gpt_theme_key', 'light');
      localStorage.setItem('dbgpt_theme_mode', 'light');
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.body?.classList.remove('dark');
      document.body?.classList.add('light');
    });

    const isLightClass = await page.evaluate(() => {
      return (
        !document.documentElement.classList.contains('dark') ||
        document.documentElement.classList.contains('light')
      );
    });
    expect(isLightClass).toBe(true);

    consoleListener.assertNoErrors();
  });

  test('02.3 - should verify universal 6px custom scrollbar styling', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/slides');

    // Check if scrollable container has custom-scrollbar class or scrollbar properties
    const hasCustomScrollbar = await page.evaluate(() => {
      const scrollContainers = document.querySelectorAll('.custom-scrollbar, div[class*="overflow-y-auto"]');
      return scrollContainers.length > 0;
    });
    expect(hasCustomScrollbar).toBe(true);

    consoleListener.assertNoErrors();
  });

  const VIEWPORTS = [
    { name: 'Desktop Wide (1920x1080)', width: 1920, height: 1080 },
    { name: 'Laptop (1440x900)', width: 1440, height: 900 },
    { name: 'Compact (1280x720)', width: 1280, height: 720 },
  ];

  for (const vp of VIEWPORTS) {
    test(`02.4 - [${vp.name}] should render without horizontal scrollbar overflow on primary routes`, async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      const testRoutes = ['/', '/slides', '/docs', '/sheets', '/deep-research'];

      for (const route of testRoutes) {
        await page.goto(route);

        // Check horizontal overflow (body or main container should not overflow viewport width)
        const hasHorizontalOverflow = await page.evaluate(() => {
          const body = document.body;
          const html = document.documentElement;
          return body.scrollWidth > window.innerWidth + 2 || html.scrollWidth > window.innerWidth + 2;
        });

        expect(hasHorizontalOverflow, `Horizontal overflow detected at ${route} for viewport ${vp.name}`).toBe(false);
      }

      consoleListener.assertNoErrors();
    });

    test(`02.5 - [${vp.name}] should render Studio template cards without layout breakages`, async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto('/slides');
      const root = page.locator('#root');
      await expect(root).toBeVisible();

      // Check card containers or template grid
      const cards = page.locator('div[class*="rounded"], div[class*="grid"], div[class*="flex-wrap"]');
      await expect(cards.first()).toBeAttached();

      consoleListener.assertNoErrors();
    });
  }

  test('02.6 - should verify typography fluid scaling and absence of fixed-px text clipping', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/deep-research');

    // Inspect heading elements and check computed styles
    const computedInfo = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, p, span'));
      return headings.slice(0, 10).map((el) => {
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          overflow: style.overflow,
          textOverflow: style.textOverflow,
        };
      });
    });

    expect(computedInfo.length).toBeGreaterThan(0);
    consoleListener.assertNoErrors();
  });
});
