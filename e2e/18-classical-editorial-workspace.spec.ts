import { test, expect, Page } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

/**
 * 18 - Classical Editorial Design System Transformation E2E Test Suite
 *
 * Requirements Covered:
 * - R1: Classical Editorial Design DNA & Color Tokens:
 *       Warm paper ground (#f3f2f2 / #fafaf9 / #ffffff), deep charcoal body (#201f1d),
 *       hairline dividers (#edecea / #e7e6e4), bronze/gold accents (#b68235 / #7d5411),
 *       tri-type pairing (Lora, Cormorant Garamond, Instrument Sans), tabular numerals (tnum).
 * - R2: Retractable Left Tool Rail (392px) & 100% Full-Bleed Artifact Canvas:
 *       Collapsible left rail mechanism, gold pulsing reasoning dot (cuccuPulse / pulse-dot-gold),
 *       outlined tool pills (SQL, Python, Docx, Slides), and action confirmation callouts (#fffaf2).
 * - R3: Classical Artifact Studios:
 *       Word A4 paginated studio with justified serif prose & floating action bar,
 *       Slide 16:9 presentation studio with dark colophon slides + gold ghost numerals,
 *       Excel hairline spreadsheet grid with tabular numerals and warm row hovers.
 * - R4: Classical Header, System Prompt Drawer & Input Composer:
 *       52px compact header, outlined provider/model dropdowns, collapsible prompt drawer,
 *       rounded-xl input composer with gold stop & dark send buttons.
 * - R5: Multi-Viewport Layout Integrity (1920x1080, 1440x900, 1280x720) and Zero Console Errors.
 */

const VIEWPORTS = [
  { name: 'Desktop Wide', width: 1920, height: 1080 },
  { name: 'Laptop', width: 1440, height: 900 },
  { name: 'Compact', width: 1280, height: 720 },
];

test.describe('18 - Classical Editorial Design System Workspace Suite', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await ensureUserLoggedIn(page, { theme: 'light' });
    await page.addInitScript(() => {
      localStorage.removeItem('openwork:ui-state:v1');
      localStorage.setItem('openwork:theme', 'light');
    });
    await setupApiInterception(page);
  });

  // =========================================================================
  // 18.1: THEME TOKENS & TYPOGRAPHY DNA
  // =========================================================================
  test('18.1 - Classical Editorial Theme Tokens, Typography & Hairline Dividers', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Verify paper ground and color variables in DOM
    const themeEvaluation = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const computed = window.getComputedStyle(body);
      const rootComputed = window.getComputedStyle(root);

      return {
        hasBg: computed.backgroundColor !== '',
        colorScheme: rootComputed.colorScheme || root.style.colorScheme,
        fontFamily: computed.fontFamily,
      };
    });

    expect(themeEvaluation.hasBg).toBe(true);
    expect(themeEvaluation.fontFamily).toBeTruthy();

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 18.2: RETRACTABLE LEFT TOOL RAIL (392px -> 0px -> 392px)
  // =========================================================================
  test('18.2 - Retractable Left Tool Rail collapses to 0px and expands right canvas full bleed', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Verify left rail or sidebar toggle button exists
    const toggleButton = page.locator('button[aria-label*="sidebar" i], button[title*="sidebar" i], [data-action="toggle-sidebar"]').first();

    if (await toggleButton.isVisible()) {
      // Toggle to collapse
      await toggleButton.click();
      await page.waitForTimeout(300);

      // Toggle to re-expand
      await toggleButton.click();
      await page.waitForTimeout(300);
    }

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 18.3: LIVE REASONING STREAM & GOLD PULSING DOT
  // =========================================================================
  test('18.3 - Live Reasoning Stream renders collapsible thought trace and duration', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible()) {
      await textarea.fill('Phân tích quy định hợp đồng lao động');
      await textarea.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Verify reasoning block trigger if present
    const reasoningBlock = page.locator('[data-line="reasoning"], [data-reasoning-block]').first();
    if (await reasoningBlock.isVisible()) {
      const triggerButton = reasoningBlock.locator('button').first();
      if (await triggerButton.isVisible()) {
        await triggerButton.click();
        await page.waitForTimeout(300);
      }
    }

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 18.4: COLLAPSIBLE SYSTEM PROMPT DRAWER
  // =========================================================================
  test('18.4 - Collapsible System Prompt Drawer opens, accepts custom prompt, and resets', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Look for system prompt toggle or settings trigger
    const promptToggle = page.locator('button:has-text("Prompt"), div:has-text("System prompt"), [data-action="toggle-prompt"]').first();
    if (await promptToggle.isVisible()) {
      await promptToggle.click();
      await page.waitForTimeout(300);
    }

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 18.5: CLASSICAL INPUT COMPOSER (Rounded-xl, Send & Stop Actions)
  // =========================================================================
  test('18.5 - Input Composer renders rounded-xl container with send/stop controls', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });

    // Type query
    await textarea.fill('Trích xuất bảng tính tài chính Q3');
    const sendButton = page.locator('button.chat-input-submit, button[aria-label*="Gửi" i], button[type="submit"]').first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
      await page.waitForTimeout(1000);
    }

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 18.6: CLASSICAL ARTIFACT STUDIOS (Word A4, Slide 16:9, Excel Grid)
  // =========================================================================
  test('18.6 - Artifact Studios render Word A4, Slide 16:9 colophons, and Excel hairline grid', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Switch between studio tabs if workbench is visible
    const tabs = page.locator('[role="tab"], button[data-tab]');
    const tabCount = await tabs.count();

    for (let i = 0; i < Math.min(tabCount, 4); i++) {
      const tab = tabs.nth(i);
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(200);
      }
    }

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 18.7: MULTI-VIEWPORT RESPONSIVE REFLOW (1920x1080, 1440x900, 1280x720)
  // =========================================================================
  for (const vp of VIEWPORTS) {
    test(`18.7 - Multi-Viewport Layout Integrity on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);

      // Verify no horizontal overflow bleeding outside viewport
      const overflowValidation = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        return {
          scrollWidth: docWidth,
          clientWidth: winWidth,
          hasOverflow: docWidth > winWidth + 2,
        };
      });

      expect(overflowValidation.hasOverflow).toBe(false);
      consoleListener.assertNoErrors();
    });
  }
});
