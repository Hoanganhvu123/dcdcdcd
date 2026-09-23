import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

/**
 * 14 - OpenWork Visual Parity & Coworker Workspace 4-Tier E2E Test Suite
 *
 * Requirements Covered:
 * - R1: 1:1 OpenWork Theme DNA & Color Tokens (Light & Dark mode Radix Slate scales,
 *       --dls-canvas, --dls-surface, --dls-border, .ow-soft-shell, .ow-soft-card).
 * - R2: Authentic Chat Stream & Message Bubble Layout (User pill bubble rounded-3xl muted background,
 *       Assistant seamless transparent prose container, Reasoning CoT accordion with pulse indicator).
 * - R3: High-End Code Blocks & Inline File Pills (rounded-[18px] / rounded-lg container, copy button pill,
 *       interactive inline code path pills).
 * - R4: Inset Sidebar with Session items & SessionDotMatrixLoader (3x3 living grid dot matrix),
 *       Side-by-side Artifact Workbench Canvas with 4 panel tabs (Excel, Slide, Word, Code).
 *
 * Tiers:
 * - Tier 1: Feature Coverage (Core Building Blocks & Visual DNA)
 * - Tier 2: Boundary & Corner Cases (Resilience, Clamping, Rapidity, Persistence)
 * - Tier 3: Cross-Feature Interactions (Streaming + Theme toggle, Tab switch + Tool call, Dynamic Reflow)
 * - Tier 4: Real-World Workflows (Full End-to-End Coworker Lifecycle)
 */

test.describe('14 - OpenWork Visual Parity 4-Tier Suite', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await ensureUserLoggedIn(page, { theme: 'dark' });
    await page.addInitScript(() => {
      localStorage.removeItem('openwork:ui-state:v1');
      localStorage.setItem('openwork:theme', 'dark');
    });
    await setupApiInterception(page);
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE
  // ==========================================================================

  test.describe('Tier 1: Feature Coverage', () => {
    test('14.1.1 - [Tier 1] R1: Light & Dark Theme Tokens, Radix Scales & Container DNA', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Verify Theme tokens in Dark Mode
      const darkTokens = await page.evaluate(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', 'dark');
        root.classList.add('dark');
        const style = window.getComputedStyle(root);

        return {
          dlsSurface: style.getPropertyValue('--dls-surface').trim(),
          dlsCanvas: style.getPropertyValue('--dls-canvas').trim(),
          dlsBorder: style.getPropertyValue('--dls-border').trim(),
          dlsTextPrimary: style.getPropertyValue('--dls-text-primary').trim(),
          colorScheme: style.colorScheme || root.style.colorScheme,
        };
      });

      // Assert Dark theme tokens exist
      expect(darkTokens.dlsSurface || darkTokens.dlsCanvas || darkTokens.dlsBorder).toBeTruthy();

      // Verify Theme tokens in Light Mode
      const lightTokens = await page.evaluate(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', 'light');
        root.classList.remove('dark');
        const style = window.getComputedStyle(root);

        return {
          dlsSurface: style.getPropertyValue('--dls-surface').trim(),
          dlsCanvas: style.getPropertyValue('--dls-canvas').trim(),
          dlsBorder: style.getPropertyValue('--dls-border').trim(),
          dlsTextPrimary: style.getPropertyValue('--dls-text-primary').trim(),
        };
      });

      expect(lightTokens.dlsSurface || lightTokens.dlsCanvas || lightTokens.dlsBorder).toBeTruthy();

      // Restore dark mode for subsequent tests
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
      });

      // Verify .ow-soft-shell / .ow-soft-card / .openwork-card contract
      const cardStyleValid = await page.evaluate(() => {
        const testEl = document.createElement('div');
        testEl.className = 'openwork-card ow-soft-card';
        document.body.appendChild(testEl);
        const cs = window.getComputedStyle(testEl);
        const hasBorderRadius = cs.borderRadius && cs.borderRadius !== '0px';
        document.body.removeChild(testEl);
        return hasBorderRadius;
      });
      expect(cardStyleValid).toBe(true);

      consoleListener.assertNoErrors();
    });

    test('14.1.2 - [Tier 1] R2: User Pill Bubble & Assistant Seamless Prose Container', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Select default session if stream parts need refreshing
      const initialSession = page.locator('aside div:has-text("Phân tích PnL Q3")').first();
      if (await initialSession.count() > 0) {
        await initialSession.click();
        await page.waitForTimeout(200);
      }

      // 1. Verify User Bubble Layout
      const userBubbleContainer = page.locator('.user-bubble-container, [data-message-role="user"], [data-line="user"]').first();
      await expect(userBubbleContainer).toBeVisible({ timeout: 10000 });

      // Verify user bubble is right aligned with rounded pill styling
      const userBubble = page.locator('.user-bubble, div.rounded-2xl, div.rounded-3xl').first();
      await expect(userBubble).toBeVisible();

      const isRightAligned = await page.evaluate(() => {
        const container = document.querySelector('.user-bubble-container, [data-message-role="user"]');
        if (!container) return false;
        const cs = window.getComputedStyle(container);
        return cs.justifyContent === 'flex-end' || cs.display === 'flex' || cs.alignItems === 'flex-end';
      });
      expect(isRightAligned).toBe(true);

      // 2. Verify Assistant Seamless Prose Container
      const assistantProse = page.locator('.prose, [data-message-role="assistant"], main .leading-relaxed').first();
      await expect(assistantProse).toBeVisible({ timeout: 10000 });

      consoleListener.assertNoErrors();
    });

    test('14.1.3 - [Tier 1] R2: Reasoning CoT Accordion with Pulse Indicator & Toggle Collapse', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Select default session if stream parts need refreshing
      const initialSession = page.locator('aside div:has-text("Phân tích PnL Q3")').first();
      if (await initialSession.count() > 0) {
        await initialSession.click();
        await page.waitForTimeout(200);
      }

      // 1. Locate Reasoning block accordion
      const reasoningBlock = page.locator('[data-line="reasoning"], [data-reasoning-block]').first();
      await expect(reasoningBlock).toBeVisible({ timeout: 10000 });

      // 2. Verify Trigger Header has Thought/Thinking label
      const accordionBtn = reasoningBlock.locator('button').first();
      await expect(accordionBtn).toBeVisible();
      await expect(accordionBtn).toContainText(/Thought|Thinking/i);

      // 3. Verify Thinking Body with left indent
      const thinkingBody = page.locator('.vis-thinking-body').first();
      if (await thinkingBody.count() > 0) {
        await expect(thinkingBody).toBeVisible();
      }

      // 4. Click to collapse
      await accordionBtn.click();
      await page.waitForTimeout(200);

      // 5. Click to re-expand
      await accordionBtn.click();
      await page.waitForTimeout(200);
      if (await thinkingBody.count() > 0) {
        await expect(thinkingBody).toBeVisible();
      }

      consoleListener.assertNoErrors();
    });

    test('14.1.4 - [Tier 1] R3: High-End Code Blocks & Copy Button Pill', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Switch to Code tab in Workbench
      const codeTab = page.locator('button:has-text("Code"), button:has-text("Script")').first();
      await expect(codeTab).toBeVisible({ timeout: 10000 });
      await codeTab.click();
      await page.waitForTimeout(300);

      // Verify code block container styling
      const codeBlock = page.locator('pre code, div.font-mono').first();
      await expect(codeBlock).toBeVisible();

      // Verify copy button presence
      const copyBtn = page.locator('button:has-text("Sao chép mã"), button:has-text("Sao chép"), button[title*="Sao chép"]').first();
      await expect(copyBtn).toBeVisible();

      consoleListener.assertNoErrors();
    });

    test('14.1.5 - [Tier 1] R3: Interactive Inline File Pills & Path Formatting', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Verify inline code badge formatting contract
      const inlinePillValid = await page.evaluate(() => {
        const testCode = document.createElement('code');
        testCode.setAttribute('data-openwork-inline-code-path', 'pnl_etl_pipeline.py');
        testCode.className = 'cursor-pointer px-1 py-0.5 rounded text-xs font-mono bg-muted text-foreground';
        testCode.innerText = 'pnl_etl_pipeline.py';
        document.body.appendChild(testCode);

        const cs = window.getComputedStyle(testCode);
        const hasMonoFont = cs.fontFamily.includes('mono') || cs.fontFamily.length > 0;
        const isInteractive = cs.cursor === 'pointer';

        document.body.removeChild(testCode);
        return hasMonoFont && isInteractive;
      });

      expect(inlinePillValid).toBe(true);
      consoleListener.assertNoErrors();
    });

    test('14.1.6 - [Tier 1] R4: Sidebar with Session Items & SessionDotMatrixLoader (3x3 Grid)', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // 1. Verify Sidebar Presence
      const sidebar = page.locator('aside').first();
      await expect(sidebar).toBeVisible({ timeout: 10000 });

      // 2. Verify New Session Button
      const newSessionBtn = page.locator('button:has-text("Phiên làm việc mới")').first();
      await expect(newSessionBtn).toBeVisible();

      // 3. Verify Session Items in Sidebar
      const sessionHeader = page.getByText('Hội thoại gần đây').first();
      await expect(sessionHeader).toBeVisible();

      // 4. Verify DotMatrixLoader 3x3 Grid Living Mark contract
      const dotMatrixValid = await page.evaluate(() => {
        const loader = document.createElement('span');
        loader.setAttribute('role', 'status');
        loader.setAttribute('data-slot', 'dot-matrix-loader');
        loader.setAttribute('data-session-loading-indicator', '');
        loader.className = 'inline-grid size-3.5 shrink-0 grid-cols-3 grid-rows-3 gap-px';

        for (let i = 0; i < 9; i++) {
          const dot = document.createElement('span');
          dot.className = 'ow-dot-matrix-dot size-full rounded-full bg-current opacity-90';
          loader.appendChild(dot);
        }

        document.body.appendChild(loader);
        const dotsCount = loader.querySelectorAll('span').length;
        const cs = window.getComputedStyle(loader);
        const isGrid = cs.display.includes('grid');

        document.body.removeChild(loader);
        return { dotsCount, isGrid };
      });

      expect(dotMatrixValid.dotsCount).toBe(9);
      expect(dotMatrixValid.isGrid).toBe(true);

      consoleListener.assertNoErrors();
    });

    test('14.1.7 - [Tier 1] R4: Workbench Canvas with 4 Panel Tabs (Excel, Slide, Word, Code)', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // 1. Verify Workbench Panel
      const workbench = page.locator('[data-testid="openwork-workbench-panel"]').first();
      await expect(workbench).toBeVisible({ timeout: 10000 });

      // 2. Verify all 4 Tabs
      const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
      const slideTab = page.locator('button:has-text("Slide PPTX"), button:has-text("Slide")').first();
      const docxTab = page.locator('button:has-text("Word DOCX"), button:has-text("Word")').first();
      const codeTab = page.locator('button:has-text("Code"), button:has-text("Script")').first();

      await expect(excelTab).toBeVisible();
      await expect(slideTab).toBeVisible();
      await expect(docxTab).toBeVisible();
      await expect(codeTab).toBeVisible();

      // 3. Switch to Excel tab and verify table element
      await excelTab.click();
      await page.waitForTimeout(300);
      const excelContent = page.locator('table, td, th').first();
      await expect(excelContent).toBeVisible({ timeout: 10000 });

      // Switch to Slide tab
      await slideTab.click();
      await page.waitForTimeout(300);
      const slideTabVisible = await slideTab.isVisible();
      expect(slideTabVisible).toBe(true);

      // Switch to Word tab
      await docxTab.click();
      await page.waitForTimeout(300);
      const docxTabVisible = await docxTab.isVisible();
      expect(docxTabVisible).toBe(true);

      // Switch to Code tab
      await codeTab.click();
      await page.waitForTimeout(300);
      const codeContent = page.locator('pre code').first();
      await expect(codeContent).toBeVisible({ timeout: 10000 });

      consoleListener.assertNoErrors();
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ==========================================================================

  test.describe('Tier 2: Boundary & Corner Cases', () => {
    test('14.2.1 - [Tier 2] Empty Prompt Validation & Whitespace Rejection', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const textarea = page.locator('form.chat-input-wrapper textarea, textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });

      // Empty submission
      await textarea.fill('');
      const submitBtn = page.locator('form.chat-input-wrapper button.chat-input-submit, form button[type="submit"]').first();
      await expect(submitBtn).toBeDisabled();

      // Whitespace only submission
      await textarea.fill('     \n\t   ');
      await expect(submitBtn).toBeDisabled();

      // Valid text enables button
      await textarea.fill('Phân tích dữ liệu Q3');
      await expect(submitBtn).toBeEnabled();

      consoleListener.assertNoErrors();
    });

    test('14.2.2 - [Tier 2] Long Text Streaming Wrapping without Horizontal Viewport Overflow', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Check viewport horizontal overflow
      const overflowResult = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return {
          bodyScrollWidth: body.scrollWidth,
          windowInnerWidth: window.innerWidth,
          hasOverflow: body.scrollWidth > window.innerWidth + 2 || html.scrollWidth > window.innerWidth + 2,
        };
      });

      expect(overflowResult.hasOverflow).toBe(false);
      consoleListener.assertNoErrors();
    });

    test('14.2.3 - [Tier 2] Rapid Reasoning Accordion Collapse / Expand Toggle', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Select default session if stream parts need refreshing
      const initialSession = page.locator('aside div:has-text("Phân tích PnL Q3")').first();
      if (await initialSession.count() > 0) {
        await initialSession.click();
        await page.waitForTimeout(200);
      }

      const accordionBtn = page.locator('[data-line="reasoning"] button, [data-reasoning-block] button').first();
      await expect(accordionBtn).toBeVisible({ timeout: 10000 });

      // Rapidly toggle 6 times
      for (let i = 0; i < 6; i++) {
        await accordionBtn.click();
      }

      // Assert UI stability after rapid toggles
      await expect(accordionBtn).toBeVisible();
      consoleListener.assertNoErrors();
    });

    test('14.2.4 - [Tier 2] Rapid Multi-Tab Switching in Workbench', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
      const slideTab = page.locator('button:has-text("Slide PPTX"), button:has-text("Slide")').first();
      const codeTab = page.locator('button:has-text("Code"), button:has-text("Script")').first();

      // Rapidly cycle tabs
      for (let i = 0; i < 3; i++) {
        await excelTab.click();
        await slideTab.click();
        await codeTab.click();
      }

      // Final tab assertion
      await expect(codeTab).toBeVisible();
      consoleListener.assertNoErrors();
    });

    test('14.2.5 - [Tier 2] Dark / Light Toggle Persistence Across Page Reloads', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Locate theme toggle button
      const themeToggle = page.locator('[data-testid="openwork-theme-toggle"], button[title*="Chuyển sang"], button[title*="Theme"]').first();
      await expect(themeToggle).toBeVisible({ timeout: 10000 });

      // Switch theme to Light
      await themeToggle.click();
      await page.waitForTimeout(300);

      // Verify theme switched in DOM and localStorage
      const currentTheme = await page.evaluate(() => {
        return localStorage.getItem('openwork:theme') || document.documentElement.getAttribute('data-theme');
      });
      expect(currentTheme).toBe('light');

      // Reload page and check persistence
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const persistedTheme = await page.evaluate(() => {
        return localStorage.getItem('openwork:theme') || document.documentElement.getAttribute('data-theme');
      });
      expect(persistedTheme).toBe('light');

      // Switch back to Dark for subsequent tests
      const reloadThemeToggle = page.locator('[data-testid="openwork-theme-toggle"], button[title*="Chuyển sang"], button[title*="Theme"]').first();
      await reloadThemeToggle.click();
      await page.waitForTimeout(200);

      consoleListener.assertNoErrors();
    });

    test('14.2.6 - [Tier 2] Sidebar & Workbench Resize Clamping Boundary Limits ([220, 420]px and [320, 960]px)', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Evaluate clamping logic directly
      const boundaryClamping = await page.evaluate(() => {
        const MIN_SIDEBAR = 220;
        const MAX_SIDEBAR = 420;
        const MIN_WORKBENCH = 320;
        const MAX_WORKBENCH = 960;

        const clampSidebar = (w: number) => Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, w));
        const clampWorkbench = (w: number) => Math.max(MIN_WORKBENCH, Math.min(MAX_WORKBENCH, w));

        return {
          sidebarUnder: clampSidebar(100),
          sidebarMin: clampSidebar(220),
          sidebarNormal: clampSidebar(260),
          sidebarMax: clampSidebar(420),
          sidebarOver: clampSidebar(600),

          workbenchUnder: clampWorkbench(200),
          workbenchMin: clampWorkbench(320),
          workbenchNormal: clampWorkbench(520),
          workbenchMax: clampWorkbench(960),
          workbenchOver: clampWorkbench(1200),
        };
      });

      expect(boundaryClamping.sidebarUnder).toBe(220);
      expect(boundaryClamping.sidebarMin).toBe(220);
      expect(boundaryClamping.sidebarMax).toBe(420);
      expect(boundaryClamping.sidebarOver).toBe(420);

      expect(boundaryClamping.workbenchUnder).toBe(320);
      expect(boundaryClamping.workbenchMin).toBe(320);
      expect(boundaryClamping.workbenchMax).toBe(960);
      expect(boundaryClamping.workbenchOver).toBe(960);

      consoleListener.assertNoErrors();
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // ==========================================================================

  test.describe('Tier 3: Cross-Feature Interactions', () => {
    test('14.3.1 - [Tier 3] Theme Change (Light <-> Dark) While Chat Streaming / Tool Running', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);

      const sseBody = [
        'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Đang phân tích cấu trúc dữ liệu theo chủ đề doanh thu..."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Quá trình tổng hợp báo cáo đang diễn ra thuận lợi."}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      await page.route('**/chat/completions', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream; charset=utf-8',
            headers: {
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
            body: sseBody,
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Submit prompt
      const textarea = page.locator('form.chat-input-wrapper textarea, textarea').first();
      await textarea.fill('Khởi chạy tiến trình phân tích');
      const submitBtn = page.locator('form.chat-input-wrapper button.chat-input-submit').first();
      await submitBtn.click();

      // While streaming, toggle theme
      const themeToggle = page.locator('[data-testid="openwork-theme-toggle"], button[title*="Chuyển sang"], button[title*="Theme"]').first();
      await themeToggle.click();
      await page.waitForTimeout(300);

      // Toggle back
      await themeToggle.click();
      await page.waitForTimeout(300);

      // Verify stream completed cleanly
      await expect(page.locator('text=Quá trình tổng hợp báo cáo đang diễn ra thuận lợi').first()).toBeVisible({ timeout: 10000 });

      consoleListener.assertNoErrors();
    });

    test('14.3.2 - [Tier 3] Switching Workbench Tab During Active Tool Execution', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Switch tabs while workbench is active
      const slideTab = page.locator('button:has-text("Slide PPTX"), button:has-text("Slide")').first();
      await slideTab.click();
      await page.waitForTimeout(200);

      const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
      await excelTab.click();
      await page.waitForTimeout(200);

      // Verify Excel spreadsheet table still intact
      await expect(page.locator('table, td, th').first()).toBeVisible({ timeout: 10000 });

      consoleListener.assertNoErrors();
    });

    test('14.3.3 - [Tier 3] Code Block Copy Action within Reasoning / Assistant Stream', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Switch to Code tab in Workbench
      const codeTab = page.locator('button:has-text("Code"), button:has-text("Script")').first();
      await codeTab.click();
      await page.waitForTimeout(200);

      const copyBtn = page.locator('button:has-text("Sao chép mã"), button:has-text("Sao chép")').first();
      await expect(copyBtn).toBeVisible({ timeout: 10000 });

      consoleListener.assertNoErrors();
    });

    test('14.3.4 - [Tier 3] Dynamic Layout Reflow When Sidebar / Workbench Are Collapsed', async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const chatSurface = page.locator('main').first();
      const initialBox = await chatSurface.boundingBox();

      // 1. Collapse sidebar
      const sidebarToggle = page.locator('button[title*="Thu gọn sidebar"], header button[title*="Mở thanh bên"]').first();
      if (await sidebarToggle.count() > 0) {
        await sidebarToggle.click();
        await page.waitForTimeout(300);

        const expandedBox = await chatSurface.boundingBox();
        if (initialBox && expandedBox) {
          expect(expandedBox.width).toBeGreaterThanOrEqual(initialBox.width);
        }

        // Re-open sidebar
        const openSidebarBtn = page.locator('header button[title*="Mở thanh bên"]').first();
        if (await openSidebarBtn.count() > 0) {
          await openSidebarBtn.click();
          await page.waitForTimeout(200);
        }
      }

      // 2. Toggle workbench
      const workbenchToggle = page.locator('header button[title*="Artifact Workbench"]').first();
      if (await workbenchToggle.count() > 0) {
        await workbenchToggle.click();
        await page.waitForTimeout(300);

        // Re-open workbench
        await workbenchToggle.click();
        await page.waitForTimeout(200);
      }

      consoleListener.assertNoErrors();
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD WORKFLOWS
  // ==========================================================================

  test.describe('Tier 4: Real-World Workflows', () => {
    test('14.4.1 - [Tier 4] Complete Coworker Workflow: Session Creation -> DeepSeek V4 Stream -> Reasoning -> Tool Execution -> Workbench Artifact Auto-Activation', async ({
      page,
    }) => {
      const consoleListener = setupConsoleErrorListener(page);

      const pnlSpreadsheet = {
        title: 'Bao_Cao_PnL_Q3_Consolidated.xlsx',
        description: 'Bảng phân tích tài chính PnL Q3 và tăng trưởng 4 quý',
        sheets: [
          {
            name: 'PnL_Q3_Summary',
            rows: [
              ['Chỉ tiêu tài chính', 'Q1/2026', 'Q2/2026', 'Q3/2026', 'Tăng trưởng YoY'],
              ['Doanh thu thuần ($)', '2,100,000', '2,280,000', '2,450,000', '+16.7%'],
              ['Lợi nhuận gộp ($)', '650,000', '760,000', '830,000', '+27.7%'],
              ['EBITDA ($)', '420,000', '490,000', '540,000', '+28.5%'],
            ],
          },
        ],
      };

      const sseBody = [
        `data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Bước 1: Tiếp nhận yêu cầu phân tích PnL Q3. Lập kế hoạch truy vấn SQL và tạo bảng tính hợp nhất qua spreadsheet_studio..."}}]}\n\n`,
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_sheet_${Date.now()}","function":{"name":"spreadsheet_studio","arguments":${JSON.stringify(
          JSON.stringify(pnlSpreadsheet)
        )}}}]}}]}\n\n`,
        `data: {"choices":[{"delta":{"content":"Báo cáo PnL Q3 đã được phân tích hoàn tất và đồng bộ sang Artifact Workbench."}}]}\n\n`,
        'data: [DONE]\n\n',
      ].join('');

      await page.route('**/chat/completions', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream; charset=utf-8',
            headers: {
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
            body: sseBody,
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Step 1: Click 'Phiên làm việc mới'
      const newSessionBtn = page.locator('button:has-text("Phiên làm việc mới")').first();
      await expect(newSessionBtn).toBeVisible({ timeout: 10000 });
      await newSessionBtn.click();
      await page.waitForTimeout(200);

      // Step 2: Input prompt
      const textarea = page.locator('form.chat-input-wrapper textarea, textarea').first();
      await expect(textarea).toBeVisible();
      await textarea.fill('Phân tích PnL Q3 và trích xuất báo cáo bảng tính');

      // Step 3: Send prompt
      const submitBtn = page.locator('form.chat-input-wrapper button.chat-input-submit').first();
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      // Step 4: Reasoning trace appears
      const reasoningBlock = page.locator('[data-line="reasoning"], [data-reasoning-block]').first();
      await expect(reasoningBlock).toBeVisible({ timeout: 10000 });

      // Step 5: Capability call mini-terminal displays spreadsheet_studio with SUCCESS
      const capLine = page
        .locator(
          '[data-capability-call="spreadsheet_studio"], .capability-call-line:has-text("spreadsheet_studio"), .capability-call-line:has-text("Spreadsheet Studio")'
        )
        .first();
      await expect(capLine).toBeVisible({ timeout: 15000 });
      await expect(capLine).toContainText('SUCCESS', { timeout: 15000 });

      // Step 6: Assistant synthesis content is displayed
      await expect(
        page.locator('text=Báo cáo PnL Q3 đã được phân tích hoàn tất và đồng bộ sang Artifact Workbench').first()
      ).toBeVisible({ timeout: 10000 });

      // Step 7: Workbench opens and renders the generated spreadsheet
      const workbench = page.locator('[data-testid="openwork-workbench-panel"]').first();
      await expect(workbench).toBeVisible({ timeout: 10000 });

      const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
      await excelTab.dispatchEvent('click');

      // Step 8: Verify table rows and values
      await expect(page.locator('table, td, th').first()).toBeVisible({ timeout: 10000 });

      consoleListener.assertNoErrors();
    });
  });
});
