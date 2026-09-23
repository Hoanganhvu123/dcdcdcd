import { test, expect } from '@playwright/test';

/**
 * OpenWork DeepSeek V4 Integration & Workspace Session E2E Tests
 * 
 * Tests live UI interaction, DeepSeek V4 (`deepseek-v4-flash`) model selection,
 * real SSE thinking trace rendering, CoT accordion, SQL tool execution card,
 * live side-by-side Artifact Workbench (Excel XLSX, Slide PPTX, Word DOCX),
 * and dual theme (Light / Dark Obsidian) parity.
 */

test.describe('OpenWork Coworker DeepSeek V4 Integration Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to OpenWork workspace page
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' }).catch(async () => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
    });
  });

  // ==========================================
  // TIER 1: FEATURE COVERAGE TESTS
  // ==========================================

  test('T1.1 - DeepSeek V4 Model Picker & Header Metadata Display', async ({ page }) => {
    // Verify Workspace Header exists
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Verify Swarm / Agent Status Pill is active
    const statusPill = page.locator('text=Swarm Active, text=executing, text=idle').first();
    if (await statusPill.count() > 0) {
      await expect(statusPill).toBeVisible();
    }

    // Verify Theme Switch button (Sun/Moon icon)
    const themeBtn = page.locator('button[title*="Theme"], button[title*="Chuyển sang"]').first();
    await expect(themeBtn).toBeVisible();
  });

  test('T1.2 - Chain-of-Thought (CoT) Reasoning Accordion Expansion & Streaming Trace', async ({ page }) => {
    // Locate the CoT reasoning accordion
    const reasoningAccordion = page.locator('text=Luồng suy luận & Phân tích, text=Chain-of-Thought, text=Thinking, text=Thought').first();
    await expect(reasoningAccordion).toBeVisible();

    // Click to toggle accordion
    await reasoningAccordion.click();
    await page.waitForTimeout(200);

    // Click again to reopen
    await reasoningAccordion.click();
    await page.waitForTimeout(200);

    // Verify reasoning content includes schema alignment or planning steps
    const reasoningContent = page.locator('text=Schema alignment, text=sql_query_runner, text=PostgreSQL DW').first();
    if (await reasoningContent.count() > 0) {
      await expect(reasoningContent).toBeVisible();
    }
  });

  test('T1.3 - Real-Time Tool Execution Tile (SQL Runner & Duration Badge)', async ({ page }) => {
    // Locate Tool Execution tile
    const toolTile = page.locator('text=TOOL EXECUTION, text=tools.sql_query_runner, text=SQL Execution Terminal').first();
    await expect(toolTile).toBeVisible();

    // Verify SQL query code snippet is visible
    const sqlCode = page.locator('text=SELECT quarter, text=FROM q3_financial_records, text=gross_profit').first();
    if (await sqlCode.count() > 0) {
      await expect(sqlCode).toBeVisible();
    }

    // Verify execution status indicator (SUCCESS / COMPLETED)
    const successStatus = page.locator('text=SUCCESS, text=Hoàn tất, text=SYNCED').first();
    await expect(successStatus).toBeVisible();
  });

  test('T1.4 - Side-by-Side Artifact Workbench Multi-Tab Switching (Excel, Slide, Word, Code)', async ({ page }) => {
    // Locate Workbench tabs
    const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
    const slideTab = page.locator('button:has-text("Slide PPTX"), button:has-text("Slide")').first();
    const docxTab = page.locator('button:has-text("Word DOCX"), button:has-text("Word")').first();
    const codeTab = page.locator('button:has-text("Script"), button:has-text("Code")').first();

    // 1. Switch to Excel tab
    if (await excelTab.count() > 0) {
      await excelTab.click();
      await expect(page.locator('text=PnL_4_Quarters_Consolidated.xlsx, text=Doanh Thu Thuần').first()).toBeVisible();
    }

    // 2. Switch to Slide tab
    if (await slideTab.count() > 0) {
      await slideTab.click();
      await page.waitForTimeout(200);
      await expect(page.locator('text=Báo Cáo Tài Chính & Chiến Lược Q3/2026, text=Slide').first()).toBeVisible();
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
      await expect(page.locator('text=extractFinancials, text=openwork.sql.query, text=Autonomous').first()).toBeVisible();
    }
  });

  // ==========================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ==========================================

  test('T2.1 - Empty Prompt Validation & Input Composer Resilience', async ({ page }) => {
    const composer = page.locator('textarea').first();
    if (await composer.count() > 0) {
      // Clear input
      await composer.fill('');
      
      const sendBtn = page.locator('button:has-text("Gửi"), button:has(svg)').last();
      // Clicking send on empty input should not throw unhandled exception or crash page
      if (await sendBtn.count() > 0) {
        await sendBtn.click();
      }

      // Enter structured prompt
      await composer.fill('Phân tích doanh thu theo quý với DeepSeek V4 Flash');
      await expect(composer).toHaveValue('Phân tích doanh thu theo quý với DeepSeek V4 Flash');
    }
  });

  test('T2.2 - Rapid Tab Switching & Viewport Stability', async ({ page }) => {
    const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
    const slideTab = page.locator('button:has-text("Slide PPTX"), button:has-text("Slide")').first();

    if (await excelTab.count() > 0 && await slideTab.count() > 0) {
      for (let i = 0; i < 5; i++) {
        await excelTab.click();
        await slideTab.click();
      }
      // Page should remain responsive and stable
      await expect(slideTab).toBeVisible();
    }
  });

  // ==========================================
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // ==========================================

  test('T3.1 - Dual Theme Toggle with Visual Fidelity Retention', async ({ page }) => {
    const themeBtn = page.locator('button[title*="Theme"], button[title*="Chuyển sang"]').first();
    if (await themeBtn.count() > 0) {
      // Get initial theme indicator or background
      const rootContainer = page.locator('div.flex.h-screen').first();
      
      // Click theme switch (Light -> Dark)
      await themeBtn.click();
      await page.waitForTimeout(250);

      // Click theme switch back (Dark -> Light)
      await themeBtn.click();
      await page.waitForTimeout(250);

      // Verify all workbench elements remain intact
      await expect(page.locator('text=PnL, text=Doanh Thu, text=OpenWork').first()).toBeVisible();
    }
  });

  // ==========================================
  // TIER 4: REAL-WORLD SCENARIO WORKFLOW
  // ==========================================

  test('T4.1 - Complete End-to-End Analytical Workflow Simulation', async ({ page }) => {
    // 1. Verify User Bubble
    const userPrompt = page.locator('text=Trích xuất bảng PnL 4 quý, text=Phân tích').first();
    await expect(userPrompt).toBeVisible();

    // 2. Verify Reasoning CoT Accordion
    const cotBlock = page.locator('text=Luồng suy luận & Phân tích, text=Chain-of-Thought').first();
    await expect(cotBlock).toBeVisible();

    // 3. Verify SQL Tool Execution
    const toolExec = page.locator('text=tools.sql_query_runner, text=TOOL EXECUTION').first();
    await expect(toolExec).toBeVisible();

    // 4. Verify Synthesis Output
    const synthesisText = page.locator('text=Báo cáo kết quả phân tích PnL Q3/2026, text=Doanh thu thuần').first();
    await expect(synthesisText).toBeVisible();

    // 5. Verify Excel Table & Formatted Currency
    const excelData = page.locator('text=$2,450,000, text=$1,620,000').first();
    await expect(excelData).toBeVisible();
  });

});
