import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

test.describe('01 - Routes & Navigation Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page);
    await setupApiInterception(page);
  });

  test('01.1 - should mount root Workbench UI (/) and render header/sidebar', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/');

    // Verify URL
    await expect(page).toHaveURL(/\/$/);

    // Verify main app container is mounted
    const rootEl = page.locator('#root');
    await expect(rootEl).toBeVisible();

    // Verify Sidebar exists
    const sidebar = page.locator('nav, aside, div:has(> button, > a)').first();
    await expect(sidebar).toBeAttached();

    consoleListener.assertNoErrors();
  });

  test('01.2 - should navigate to AI Slides Studio (/slides) and verify page elements', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/slides');

    // Verify URL
    await expect(page).toHaveURL(/\/slides/);

    // Verify page content or header
    const slidesHeader = page.getByRole('heading', { name: /AI Slides Studio|Slides/i }).or(page.locator('text=AI Slides Studio')).first();
    await expect(slidesHeader).toBeVisible();

    consoleListener.assertNoErrors();
  });

  test('01.3 - should navigate to AI Word Docs Studio (/docs) and verify page elements', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/docs');

    // Verify URL
    await expect(page).toHaveURL(/\/docs/);

    // Verify page header or content
    const docsHeading = page.getByRole('heading', { name: /AI Word Docs|Word Docs/i }).or(page.locator('text=AI Word Docs')).first();
    await expect(docsHeading).toBeVisible();

    consoleListener.assertNoErrors();
  });

  test('01.4 - should navigate to AI Sheets Studio (/sheets) and verify page elements', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/sheets');

    // Verify URL
    await expect(page).toHaveURL(/\/sheets/);

    // Verify page header or content
    const sheetsHeading = page.getByRole('heading', { name: /AI Sheets|Sheets/i }).or(page.locator('text=AI Sheets')).first();
    await expect(sheetsHeading).toBeVisible();

    consoleListener.assertNoErrors();
  });

  test('01.5 - should navigate to Autonomous Deep Research (/deep-research) and verify page elements', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/deep-research');

    // Verify URL
    await expect(page).toHaveURL(/\/deep-research/);

    // Verify page header
    const researchHeading = page.getByRole('heading', { name: /Deep Research/i }).or(page.locator('text=Deep Research Studio')).first();
    await expect(researchHeading).toBeVisible();

    consoleListener.assertNoErrors();
  });

  test('01.6 - should navigate seamlessly via Sidebar click events', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/');

    // Find sidebar buttons/links for navigation
    // 1. Click AI Slides in sidebar
    const slidesNavItem = page.locator('button, a, div[role="button"]').filter({ hasText: /AI Slides|Slides/i }).first();
    if (await slidesNavItem.isVisible()) {
      await slidesNavItem.click();
      await expect(page).toHaveURL(/\/slides/);
    }

    // 2. Click AI Word Docs in sidebar
    const docsNavItem = page.locator('button, a, div[role="button"]').filter({ hasText: /AI Word Docs|Word Docs|Docs/i }).first();
    if (await docsNavItem.isVisible()) {
      await docsNavItem.click();
      await expect(page).toHaveURL(/\/docs/);
    }

    // 3. Click AI Sheets in sidebar
    const sheetsNavItem = page.locator('button, a, div[role="button"]').filter({ hasText: /AI Sheets|Sheets/i }).first();
    if (await sheetsNavItem.isVisible()) {
      await sheetsNavItem.click();
      await expect(page).toHaveURL(/\/sheets/);
    }

    // 4. Click Deep Research in sidebar
    const researchNavItem = page.locator('button, a, div[role="button"]').filter({ hasText: /Deep Research/i }).first();
    if (await researchNavItem.isVisible()) {
      await researchNavItem.click();
      await expect(page).toHaveURL(/\/deep-research/);
    }

    // 5. Return to Explore / Home
    const exploreNavItem = page.locator('button, a, div[role="button"]').filter({ hasText: /Khám phá|Explore|Agent Swarm/i }).first();
    if (await exploreNavItem.isVisible()) {
      await exploreNavItem.click();
      await expect(page).toHaveURL(/\/$/);
    }

    consoleListener.assertNoErrors();
  });

  test('01.7 - should reflect active highlight styling on current active route', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/slides');

    // Check if the slides nav item contains active classes (bg-zinc-200, font-semibold, or active indicator)
    const activeItem = page.locator('button, a, div').filter({ hasText: /AI Slides/i }).first();
    if (await activeItem.isVisible()) {
      const className = (await activeItem.getAttribute('class')) || '';
      const parentClass = (await activeItem.locator('..').getAttribute('class')) || '';
      // Either activeItem or parent should have active indicator classes
      const hasActiveTrait =
        className.includes('bg-zinc') ||
        className.includes('font-semibold') ||
        parentClass.includes('bg-zinc') ||
        parentClass.includes('font-semibold');
      expect(hasActiveTrait).toBeTruthy();
    }

    consoleListener.assertNoErrors();
  });

  test('01.8 - should handle Replay route (/replay/[id]) or timeline session route without uncaught exceptions', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    
    // Visit replay route with mock session ID
    await page.goto('/replay/replay_strategy_deck_169');
    
    // Ensure page loaded without fatal crash
    const rootEl = page.locator('#root');
    await expect(rootEl).toBeAttached();

    consoleListener.assertNoErrors();
  });
});
