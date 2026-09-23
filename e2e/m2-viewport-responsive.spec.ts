import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

test.describe('Milestone 2: Mobile & Desktop Viewport Responsive Layout Constraints', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await ensureUserLoggedIn(page, { theme: 'dark' });
    await setupApiInterception(page);
  });

  const viewports = [
    { name: 'Mobile iPhone SE (375x667)', width: 375, height: 667, isMobile: true },
    { name: 'Mobile iPhone 12/14 (390x844)', width: 390, height: 844, isMobile: true },
    { name: 'Tablet iPad (768x1024)', width: 768, height: 1024, isMobile: true },
    { name: 'Desktop Laptop (1440x900)', width: 1440, height: 900, isMobile: false },
    { name: 'Desktop Wide (1920x1080)', width: 1920, height: 1080, isMobile: false },
  ];

  for (const vp of viewports) {
    test(`Responsive Layout Invariants on ${vp.name}`, async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      
      // On mobile/tablet, initialize with sidebar/workbench collapsed to give full screen to chat surface
      await page.addInitScript((mobile) => {
        if (mobile) {
          localStorage.setItem(
            'openwork:ui-state:v1',
            JSON.stringify({
              sidebarOpen: false,
              workbenchOpen: false,
            })
          );
        }
      }, vp.isMobile);

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // 1. User Bubble responsiveness & width constraints
      const userBubble = page.locator('.user-bubble, [data-message-role="user"]').first();
      await expect(userBubble).toBeVisible({ timeout: 10000 });

      const userBubbleBox = await userBubble.boundingBox();
      expect(userBubbleBox).not.toBeNull();
      if (userBubbleBox) {
        expect(userBubbleBox.width).toBeLessThanOrEqual(vp.width);
      }

      // 2. Chat Timeline must not horizontally overflow viewport
      const overflow = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return {
          scrollWidth: Math.max(body.scrollWidth, html.scrollWidth),
          innerWidth: window.innerWidth,
          hasHorizontalScrollbar: body.scrollWidth > window.innerWidth + 2,
        };
      });
      expect(overflow.hasHorizontalScrollbar).toBe(false);

      // 3. Reasoning Accordion Trigger is clickable and doesn't clip
      const reasoningBtn = page.locator('[data-line="reasoning"] button, [data-reasoning-block] button').first();
      await expect(reasoningBtn).toBeVisible();
      const reasoningBtnBox = await reasoningBtn.boundingBox();
      expect(reasoningBtnBox).not.toBeNull();
      if (reasoningBtnBox) {
        expect(reasoningBtnBox.x + reasoningBtnBox.width).toBeLessThanOrEqual(vp.width + 10);
      }

      consoleListener.assertNoErrors();
    });
  }
});
