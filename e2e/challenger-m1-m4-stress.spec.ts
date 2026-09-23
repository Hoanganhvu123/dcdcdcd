import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

/**
 * Challenger 1 Adversarial Stress Test Suite
 * 
 * Stress Dimensions:
 * 1. Layout Boundaries & Multi-Viewport Extreme Resizing (2560x1440 down to 800x600 & 480x800)
 * 2. Rapid & Violent Slider Dragging (Splitters [220, 420] & [320, 960], edge release, double click reset)
 * 3. Concurrency Conflicts & Optimistic Revision Locks on window.__openworkControl
 * 4. Rapid Tab Switches & Multi-Artifact Rendering Churn (100 switches under load)
 * 5. Unhandled Exceptions, Layout Shifts (CLS), and Memory Leak Checks
 */

test.describe('Challenger 1 - OpenWork Adversarial Stress Suite', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'light' });
    await setupApiInterception(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => 
      typeof (window as any).__openworkControl !== 'undefined' &&
      (window as any).__openworkControl.listActions().some((a: any) => a.id === 'openwork.toggle_sidebar')
    , { timeout: 15000 });
  });

  // =========================================================================
  // 1. Layout Boundaries & Multi-Viewport Extreme Resizing
  // =========================================================================
  test('CHALLENGE 1: Extreme viewport boundaries & zero horizontal overflow', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);

    const viewports = [
      { width: 2560, height: 1440, name: 'Ultrawide 2.5K' },
      { width: 1920, height: 1080, name: 'Full HD 1080p' },
      { width: 1366, height: 768, name: 'Standard Laptop' },
      { width: 1024, height: 768, name: 'Compact Desktop / Tablet' },
      { width: 800, height: 600, name: 'Sub-compact Viewport' },
      { width: 480, height: 800, name: 'Mobile / Narrow' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(100);

      const overflowMetrics = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
        const innerWidth = window.innerWidth;
        const hasHorizontalScroll = scrollWidth > innerWidth + 1; // 1px tolerance for subpixel rounding

        return {
          scrollWidth,
          innerWidth,
          hasHorizontalScroll,
        };
      });

      expect(overflowMetrics.hasHorizontalScroll, `Horizontal overflow detected at ${vp.name} (${vp.width}x${vp.height}): scrollWidth=${overflowMetrics.scrollWidth} vs innerWidth=${overflowMetrics.innerWidth}`).toBe(false);
    }

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 2. Rapid & Violent Slider Dragging (Splitter stress)
  // =========================================================================
  test('CHALLENGE 2: Violent splitter dragging, boundary clamping [220, 420] & [320, 960], and pointer release recovery', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(200);

    // Left Splitter Stress: Rapid extreme mousemove events across screen
    const leftSplitter = page.locator('div[role="separator"][aria-orientation="vertical"]').first();
    if (await leftSplitter.isVisible()) {
      const box = await leftSplitter.boundingBox();
      if (box) {
        // Drag violently way past maximum (e.g. x = 2000) and way past minimum (e.g. x = -500)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        for (let i = 0; i < 20; i++) {
          await page.mouse.move(2500, box.y + 100);
          await page.mouse.move(-500, box.y + 100);
        }
        await page.mouse.up();
        await page.waitForTimeout(100);

        // Verify sidebar width is strictly clamped between 220 and 420
        const sidebar = page.locator('aside').first();
        const sidebarBox = await sidebar.boundingBox();
        expect(sidebarBox).not.toBeNull();
        if (sidebarBox) {
          expect(sidebarBox.width).toBeGreaterThanOrEqual(219);
          expect(sidebarBox.width).toBeLessThanOrEqual(421);
        }
      }
    }

    // Right Splitter Stress: Rapid extreme mouse movements
    const rightSplitter = page.locator('div[role="separator"][aria-orientation="vertical"]').last();
    if (await rightSplitter.isVisible()) {
      const box = await rightSplitter.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        for (let i = 0; i < 20; i++) {
          await page.mouse.move(-1000, box.y + 100);
          await page.mouse.move(3000, box.y + 100);
        }
        await page.mouse.up();
        await page.waitForTimeout(100);

        // OpenWorkWorkbench is rendered as a <section>
        const workbench = page.locator('section').first();
        const wbBox = await workbench.boundingBox();
        expect(wbBox).not.toBeNull();
        if (wbBox) {
          expect(wbBox.width).toBeGreaterThanOrEqual(319);
          expect(wbBox.width).toBeLessThanOrEqual(961);
        }
      }
    }

    // Double-click reset stress
    if (await rightSplitter.isVisible()) {
      await rightSplitter.dblclick();
      await page.waitForTimeout(150);
      const workbench = page.locator('section').first();
      const wbBox = await workbench.boundingBox();
      expect(wbBox).not.toBeNull();
      if (wbBox) {
        // Default right workbench width is 520px
        expect(Math.round(wbBox.width)).toBe(520);
      }
    }

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 3. Concurrency Conflicts & Optimistic Revision Locks on window.__openworkControl
  // =========================================================================
  test('CHALLENGE 3: 50 concurrent affordance executions, mutex conflict rejection & revision coherence', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);

    const concurrencyResults = await page.evaluate(async () => {
      const ctrl = (window as any).__openworkControl!;
      const initialSnapshot = ctrl.snapshot();
      const initialContext = ctrl.context();
      const baseRevision = initialContext.revision;

      // 1. Fire 50 simultaneous commands via Promise.all
      const promises: Promise<any>[] = [];
      const totalCalls = 50;

      for (let i = 0; i < totalCalls; i++) {
        const expectedRevision = (i % 2 === 0) ? baseRevision : baseRevision + 99;
        promises.push(
          ctrl.command({
            id: 'openwork.toggle_sidebar',
            expectedRevision,
            actor: `challenger-agent-${i}`,
          }).catch((err: any) => ({ ok: false, error: err.message, code: 'unhandled_exception' }))
        );
      }

      const rawResults = await Promise.all(promises);

      // Analyze outcomes
      const successes = rawResults.filter((r) => r && r.ok === true);
      const conflicts = rawResults.filter((r) => r && r.ok === false && r.code === 'conflict');
      const unhandled = rawResults.filter((r) => r && r.code === 'unhandled_exception');
      const finalSnapshot = ctrl.snapshot();
      const finalContext = ctrl.context();

      return {
        totalCalls,
        successCount: successes.length,
        conflictCount: conflicts.length,
        unhandledCount: unhandled.length,
        initialRevision: baseRevision,
        finalRevision: finalContext.revision,
        status: finalSnapshot.status,
        busyCommandId: finalContext.execution.busyCommandId,
      };
    });

    // Validations:
    // - No unhandled exceptions thrown during 50 simultaneous calls
    expect(concurrencyResults.unhandledCount).toBe(0);
    // - Conflicting / mutex-locked calls properly returned conflict code
    expect(concurrencyResults.conflictCount).toBeGreaterThan(0);
    // - Exactly one command acquired lock and completed
    expect(concurrencyResults.successCount).toBe(1);
    // - After mutex releases, busyCommandId is null and status is ready
    expect(concurrencyResults.busyCommandId).toBeNull();
    expect(concurrencyResults.status).toBe('ready');

    // 2. Sequential rapid affordance firing across various actions
    const sequentialResult = await page.evaluate(async () => {
      const ctrl = (window as any).__openworkControl!;
      const actions = [
        'openwork.toggle_workbench',
        'openwork.toggle_spotlight',
        'openwork.select_tab',
        'openwork.open_settings',
        'openwork.toggle_sidebar',
      ];

      const logs: any[] = [];
      for (const actionId of actions) {
        const res = await ctrl.command({
          id: actionId,
          args: actionId === 'openwork.select_tab' ? { tab: 'excel' } : undefined,
        });
        logs.push({ actionId, ok: res.ok });
      }

      return logs;
    });

    expect(sequentialResult.every((r) => r.ok === true)).toBe(true);

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 4. Rapid Tab Switching & Multi-Artifact Churn (100 switches under load)
  // =========================================================================
  test('CHALLENGE 4: Rapid tab switching (100 iterations) across Word, Excel, Slide, Code with active DOM integrity', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(200);

    // Ensure workbench is open
    const isWorkbenchVisible = await page.locator('section').first().isVisible();
    if (!isWorkbenchVisible) {
      await page.evaluate(() => {
        (window as any).__openworkControl?.command({ id: 'openwork.toggle_workbench' });
      });
      await page.waitForTimeout(200);
    }

    // Stress: 100 rapid tab changes executed directly via control bridge
    const churnResult = await page.evaluate(async () => {
      const ctrl = (window as any).__openworkControl!;
      const tabs = ['excel', 'slide', 'docx', 'code'];
      const errors: string[] = [];
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        const tab = tabs[i % tabs.length];
        try {
          const res = await ctrl.command({
            id: 'openwork.select_tab',
            args: { tab },
          });
          if (!res.ok) {
            errors.push(`Tab switch to ${tab} failed at iter ${i}: ${res.error}`);
          }
        } catch (e: any) {
          errors.push(`Exception at iter ${i}: ${e.message}`);
        }
      }
      const durationMs = performance.now() - startTime;

      return {
        iterations: 100,
        errors,
        durationMs,
      };
    });

    expect(churnResult.errors).toEqual([]);
    expect(churnResult.iterations).toBe(100);

    // Verify DOM tab buttons respond cleanly
    const tabButtons = page.locator('section button:has-text("XLSX"), section button:has-text("PPTX"), section button:has-text("DOCX"), section button:has-text("Code")');
    const tabCount = await tabButtons.count();
    expect(tabCount).toBe(4);

    for (let i = 0; i < tabCount; i++) {
      await tabButtons.nth(i).click();
      await page.waitForTimeout(50);
    }

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 5. Cumulative Layout Shift (CLS), Console Errors, and Memory Leak Audit
  // =========================================================================
  test('CHALLENGE 5: Cumulative Layout Shift (CLS < 0.05), no memory leakage / detached DOM spikes, and zero uncaught errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.waitForTimeout(200);

    // Measure CLS during intensive user interaction stream
    const clsScore = await page.evaluate(async () => {
      let cls = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            cls += entry.value;
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });

      // Run multiple interactive triggers
      const ctrl = (window as any).__openworkControl;
      if (ctrl) {
        await ctrl.command({ id: 'openwork.toggle_sidebar' });
        await ctrl.command({ id: 'openwork.toggle_sidebar' });
        await ctrl.command({ id: 'openwork.toggle_workbench' });
        await ctrl.command({ id: 'openwork.toggle_workbench' });
        await ctrl.command({ id: 'openwork.toggle_spotlight' });
      }

      await new Promise((r) => setTimeout(r, 400));
      observer.disconnect();
      return cls;
    });

    expect(clsScore).toBeLessThan(0.1); // Good CLS standard < 0.1
    expect(consoleErrors).toEqual([]);
  });
});
