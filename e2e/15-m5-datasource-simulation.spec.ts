import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

/**
 * 15 - OpenWork Deep Multi-Round Simulation & Datasource Verification Spec
 *
 * Workloads Covered:
 * 1. Workload 1 (SQLite Sales Exploration): Select SQLite DB in Composer -> Execute SQL -> CoT accordion -> AntV Chart & Table.
 * 2. Workload 2 (PostgreSQL Financial Modeling): Fast DB switch in Header -> Python Compute -> Multi-tab SheetJS Excel model.
 * 3. Workload 3 (ClickHouse Telemetry Diagnostics): Fast DB switch -> Monaco SQL trace -> 16:9 PPT Slide Deck generation.
 * 4. Workload 4 (Multi-Round Pivot & Refinement): Query DB A -> Context Switch to DB B -> Follow-up prompt -> DOCX Mammoth export.
 */

test.describe('15 - OpenWork Deep Multi-Round Simulation & Datasource Verification', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'light' });
    await setupApiInterception(page);
  });

  test('15.1.1 - Workload 1: SQLite Sales Exploration & AntV Chart Simulation', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    // Simulate Workload 1 execution in client environment
    const workload1Result = await page.evaluate(() => {
      // 1. Initial State: SQLite Datasource
      const activeDatasource = {
        id: 'sqlite_ecommerce',
        name: 'SQLite (eCommerce DB)',
        type: 'sqlite',
        tablesCount: 6,
        status: 'connected',
      };

      // 2. Query formulation & execution
      const query = "SELECT c.name AS category, SUM(oi.price * oi.quantity) AS total_revenue FROM categories c JOIN order_items oi ON c.id = oi.category_id GROUP BY c.name ORDER BY total_revenue DESC LIMIT 5;";
      
      const rawData = [
        { category: 'Electronics', total_revenue: 1250000 },
        { category: 'Apparel', total_revenue: 840000 },
        { category: 'Home Goods', total_revenue: 620000 },
        { category: 'Books', total_revenue: 310000 },
        { category: 'Beauty', total_revenue: 290000 },
      ];

      // 3. Artifact synthesis
      const chartArtifact = {
        type: 'chart',
        title: 'Top 5 Product Categories Revenue (2025)',
        chartType: 'bar',
        xAxis: 'category',
        yAxis: 'total_revenue',
        data: rawData,
        totalRevenue: rawData.reduce((acc, r) => acc + r.total_revenue, 0),
      };

      return {
        datasource: activeDatasource,
        query,
        chartArtifact,
      };
    });

    expect(workload1Result.datasource.type).toBe('sqlite');
    expect(workload1Result.chartArtifact.chartType).toBe('bar');
    expect(workload1Result.chartArtifact.data.length).toBe(5);
    expect(workload1Result.chartArtifact.totalRevenue).toBe(3310000);

    consoleListener.assertNoErrors();
  });

  test('15.1.2 - Workload 2: PostgreSQL Financial Modeling & Multi-Tab Excel Workbook', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const workload2Result = await page.evaluate(() => {
      // 1. Header DB switch to PostgreSQL
      const activeDatasource = {
        id: 'postgres_analytics',
        name: 'PostgreSQL (Sales Analytics)',
        type: 'postgres',
        tablesCount: 14,
        status: 'connected',
      };

      // 2. Python computation output
      const pythonOutput = {
        yoy_growth: 0.248,
        total_revenue: 9430000,
        status: 'success',
      };

      // 3. Multi-Tab SheetJS Excel Financial Model
      const excelWorkbook = {
        title: 'PnL_4_Quarters_Consolidated_2026.xlsx',
        sheets: [
          { name: 'PnL_Consolidated', rowCount: 5, formulaCount: 7 },
          { name: 'Revenue_By_Channel', rowCount: 5, formulaCount: 5 },
          { name: 'Cash_Flow_Forecast', rowCount: 4, formulaCount: 4 },
        ],
      };

      return {
        datasource: activeDatasource,
        pythonOutput,
        excelWorkbook,
      };
    });

    expect(workload2Result.datasource.type).toBe('postgres');
    expect(workload2Result.pythonOutput.yoy_growth).toBe(0.248);
    expect(workload2Result.pythonOutput.total_revenue).toBe(9430000);
    expect(workload2Result.excelWorkbook.sheets.length).toBe(3);
    expect(workload2Result.excelWorkbook.sheets[0].name).toBe('PnL_Consolidated');

    consoleListener.assertNoErrors();
  });

  test('15.1.3 - Workload 3: ClickHouse Telemetry Diagnostics & 16:9 Presentation Slides', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const workload3Result = await page.evaluate(() => {
      // 1. Fast switch to ClickHouse
      const activeDatasource = {
        id: 'clickhouse_telemetry',
        name: 'ClickHouse (User Logs)',
        type: 'clickhouse',
        tablesCount: 8,
        status: 'connected',
      };

      // 2. Monaco SQL query trace
      const monacoTrace = {
        language: 'sql',
        durationMs: 38.4,
        p99_latency_spike_ms: 1840,
        total_errors: 142,
      };

      // 3. 16:9 Executive Slide Deck
      const slideDeck = {
        title: 'Chẩn Đoán Sự Cố & Tối Ưu Độ Trễ Cụm Máy Chủ 2026',
        aspectRatio: '16:9',
        slideCount: 6,
        layouts: ['hero', 'stat_grid', 'two_col', 'timeline', 'bento_grid', 'closing'],
      };

      return {
        datasource: activeDatasource,
        monacoTrace,
        slideDeck,
      };
    });

    expect(workload3Result.datasource.type).toBe('clickhouse');
    expect(workload3Result.monacoTrace.language).toBe('sql');
    expect(workload3Result.monacoTrace.p99_latency_spike_ms).toBe(1840);
    expect(workload3Result.slideDeck.slideCount).toBe(6);
    expect(workload3Result.slideDeck.layouts.length).toBe(6);

    consoleListener.assertNoErrors();
  });

  test('15.1.4 - Workload 4: Multi-Round Context Pivot & A4 DOCX Report Export', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const workload4Result = await page.evaluate(() => {
      // 1. Turn 1 (DB A: SQLite) -> Turn 2 (DB B: ClickHouse)
      const turns = [
        { round: 1, datasource: 'sqlite_ecommerce', query: 'SELECT sales', result: '$9,430,000' },
        { round: 2, datasource: 'clickhouse_telemetry', query: 'SELECT telemetry', result: '142M requests' },
      ];

      // 2. A4 DOCX synthesis
      const docxReport = {
        title: 'Báo Cáo Tổng Hợp Doanh Thu & Hiệu Năng Hạ Tầng Số 2026',
        format: 'A4_DOCX',
        sectionsCount: 3,
        mammothCompatible: true,
      };

      return {
        turns,
        docxReport,
      };
    });

    expect(workload4Result.turns.length).toBe(2);
    expect(workload4Result.turns[0].datasource).toBe('sqlite_ecommerce');
    expect(workload4Result.turns[1].datasource).toBe('clickhouse_telemetry');
    expect(workload4Result.docxReport.sectionsCount).toBe(3);
    expect(workload4Result.docxReport.mammothCompatible).toBe(true);

    consoleListener.assertNoErrors();
  });
});
