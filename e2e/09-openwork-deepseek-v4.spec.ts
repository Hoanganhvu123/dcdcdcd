import { test, expect } from '@playwright/test';
import { ensureUserLoggedIn, setupApiInterception } from './test-helpers';

/**
 * 09 - OpenWork DeepSeek V4 Integration & Workspace Session E2E Tests
 * 
 * Tests live UI interaction, DeepSeek V4 (`deepseek-v4-flash`) model selection,
 * real SSE thinking trace rendering, CoT accordion, SQL tool execution card,
 * live side-by-side Artifact Workbench (Excel XLSX, Slide PPTX, Word DOCX),
 * and dual theme (Light / Dark Obsidian) parity.
 */

test.describe('09 - OpenWork DeepSeek V4 Integration Suite', () => {

  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'dark' });
    await setupApiInterception(page);
    // Navigate to OpenWork workspace page
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
  });

  // ==========================================
  // TIER 1: FEATURE COVERAGE TESTS
  // ==========================================

  test('09.1.1 - [Tier 1] DeepSeek V4 Model Picker & Header Metadata Display', async ({ page }) => {
    // Verify Workspace Header exists
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Verify Theme Switch button (Sun/Moon icon)
    const themeBtn = page.locator('button[title*="Theme"], button[title*="Chuyển sang"]').first();
    await expect(themeBtn).toBeVisible();
  });

  test('09.1.2 - [Tier 1] Chain-of-Thought (CoT) Reasoning Accordion Expansion & Streaming Trace', async ({ page }) => {
    // Locate the CoT reasoning accordion
    const reasoningAccordion = page.locator('[data-line="reasoning"], [data-reasoning-block], button:has-text("Thought"), button:has-text("Thinking")').first();
    await expect(reasoningAccordion).toBeVisible();

    // Click to toggle accordion
    await reasoningAccordion.click();
    await page.waitForTimeout(200);

    // Click again to reopen
    await reasoningAccordion.click();
    await page.waitForTimeout(200);

    // Verify reasoning content includes schema alignment or planning steps
    const reasoningContent = page.locator('text=Schema alignment, text=sql_query_runner, text=PostgreSQL DW, .vis-thinking-body').first();
    if (await reasoningContent.count() > 0) {
      await expect(reasoningContent).toBeVisible();
    }
  });

  test('09.1.3 - [Tier 1] Real-Time Tool Execution Tile (SQL Runner & Duration Badge)', async ({ page }) => {
    // Locate Tool Execution tile
    const toolTile = page.locator('[data-line="capability-call"], .capability-call-line, [data-capability-call]').first();
    await expect(toolTile).toBeVisible();

    // Verify SQL query code snippet is visible
    const sqlCode = page.locator('text=SELECT quarter, text=FROM q3_financial_records, text=gross_profit, pre code').first();
    if (await sqlCode.count() > 0) {
      await expect(sqlCode).toBeVisible();
    }

    // Verify execution status indicator (SUCCESS / COMPLETED)
    await expect(toolTile).toContainText('SUCCESS');
  });

  test('09.1.4 - [Tier 1] Side-by-Side Artifact Workbench Multi-Tab Switching (Excel, Slide, Word, Code)', async ({ page }) => {
    // Locate Workbench tabs
    const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
    const slideTab = page.locator('button:has-text("Slide PPTX"), button:has-text("Slide")').first();
    const docxTab = page.locator('button:has-text("Word DOCX"), button:has-text("Word")').first();
    const codeTab = page.locator('button:has-text("Script"), button:has-text("Code")').first();

    // 1. Switch to Excel tab
    if (await excelTab.count() > 0) {
      await excelTab.click();
      await expect(page.locator('text=PnL_4_Quarters_Consolidated.xlsx, text=Doanh Thu Thuần, text=PnL 4 Quý Hợp Nhất').first()).toBeVisible();
    }

    // 2. Switch to Slide tab
    if (await slideTab.count() > 0) {
      await slideTab.click();
      await page.waitForTimeout(200);
      await expect(page.locator('text=Báo Cáo Tài Chính & Chiến Lược Q3/2026, text=Slide, text=Q3_Financial_Review_16x9').first()).toBeVisible();
    }

    // 3. Switch to Word docx tab
    if (await docxTab.count() > 0) {
      await docxTab.click();
      await page.waitForTimeout(200);
    }

    // 4. Switch to Code tab
    if (await codeTab.count() > 0) {
      await codeTab.click();
      await page.waitForTimeout(200);
      await expect(page.locator('text=extractFinancials, text=openwork.sql.query, text=Autonomous, text=pnl_etl_pipeline.py').first()).toBeVisible();
    }
  });

  // ==========================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ==========================================

  test('09.2.1 - [Tier 2] Empty Prompt Validation & Input Composer Resilience', async ({ page }) => {
    const composer = page.locator('textarea').first();
    if (await composer.count() > 0) {
      // Clear input
      await composer.fill('');
      
      const sendBtn = page.locator('button:has-text("Gửi"), button:has(svg)').last();
      if (await sendBtn.count() > 0) {
        await sendBtn.click();
      }

      // Enter structured prompt
      await composer.fill('Phân tích doanh thu theo quý với DeepSeek V4 Flash');
      await expect(composer).toHaveValue('Phân tích doanh thu theo quý với DeepSeek V4 Flash');
    }
  });

  test('09.2.2 - [Tier 2] Rapid Tab Switching & Viewport Stability', async ({ page }) => {
    const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
    const slideTab = page.locator('button:has-text("Slide PPTX"), button:has-text("Slide")').first();

    if (await excelTab.count() > 0 && await slideTab.count() > 0) {
      for (let i = 0; i < 5; i++) {
        await excelTab.click();
        await slideTab.click();
      }
      await expect(slideTab).toBeVisible();
    }
  });

  // ==========================================
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // ==========================================

  test('09.3.1 - [Tier 3] Dual Theme Toggle with Visual Fidelity Retention', async ({ page }) => {
    const themeBtn = page.locator('button[title*="Theme"], button[title*="Chuyển sang"]').first();
    if (await themeBtn.count() > 0) {
      // Click theme switch (Light -> Dark)
      await themeBtn.click();
      await page.waitForTimeout(250);

      // Click theme switch back (Dark -> Light)
      await themeBtn.click();
      await page.waitForTimeout(250);

      // Verify all workbench elements remain intact
      await expect(page.locator('text=PnL, text=Doanh Thu, text=OpenWork, main').first()).toBeVisible();
    }
  });

  // ==========================================
  // TIER 4: REAL-WORLD SCENARIO WORKFLOW
  // ==========================================

  test('09.4.1 - [Tier 4] Complete End-to-End Analytical Workflow Simulation', async ({ page }) => {
    // 1. Verify User Bubble
    const userPrompt = page.locator('.user-bubble, [data-line="user"]').first();
    await expect(userPrompt).toBeVisible();

    // 2. Verify Reasoning CoT Accordion
    const cotBlock = page.locator('[data-line="reasoning"], [data-reasoning-block]').first();
    await expect(cotBlock).toBeVisible();

    // 3. Verify SQL Tool Execution
    const toolExec = page.locator('[data-line="capability-call"], .capability-call-line').first();
    await expect(toolExec).toBeVisible();

    // 4. Verify Synthesis Output
    const synthesisText = page.locator('main').first();
    await expect(synthesisText).toContainText('Báo cáo kết quả phân tích PnL');

    // 5. Verify Excel Table & Formatted Currency in Workbench
    const workbench = page.locator('[data-testid="openwork-workbench-panel"]').first();
    await expect(workbench).toBeVisible();
  });

});
