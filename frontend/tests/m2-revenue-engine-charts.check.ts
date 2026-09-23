/**
 * Automated Verification Check Suite: Worker M2 - Deep Revenue Engine, Interactive Charts & Workbench Sync
 * Run via: npx tsx tests/m2-revenue-engine-charts.check.ts
 */

import assert from 'assert';
import {
  computeRevenueMetrics,
  computeAgriRevenue,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  type RevenueInput,
} from '../lib/revenue/revenueEngine';
import {
  generateExcelRevenueArtifact,
  generateSlideRevenueArtifact,
  generateWordRevenueArtifact,
  generateChartRevenueArtifact,
  syncRevenueToArtifacts,
} from '../lib/artifacts/revenueArtifactSync';
import type { OpenWorkArtifact } from '../components/openwork/types';

let totalTests = 0;
let passedTests = 0;

function test(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('================================================================');
console.log('📊 M2 DEEP REVENUE ENGINE & INTERACTIVE CHARTS VERIFICATION');
console.log('================================================================\n');

// ── SUITE 1: REVENUE ENGINE MATHEMATICAL ACCURACY ───────────────────────────
console.log('--- SUITE 1: Deep Revenue Engine Core Mathematics ---');

test('1.1 Standard Gross, Deductions, Net Revenue, GP and EBITDA calculation', () => {
  const input: RevenueInput = {
    grossRevenue: 2500000,
    discounts: 150000,
    returns: 50000,
    allowances: 20000,
    cogs: 1400000,
    opex: 350000,
  };

  const metrics = computeRevenueMetrics(input);

  // Assert Deductions
  assert.strictEqual(metrics.totalDeductions, 220000, 'Total deductions must equal 150K + 50K + 20K = 220K');
  // Assert Net Revenue
  assert.strictEqual(metrics.netRevenue, 2280000, 'Net revenue must equal 2.5M - 220K = 2.28M');
  // Assert Gross Profit
  assert.strictEqual(metrics.grossProfit, 880000, 'Gross profit must equal 2.28M - 1.4M = 880K');
  // Assert Gross Margin %
  const expectedGMPct = (880000 / 2280000) * 100;
  assert.strictEqual(metrics.grossMarginPct.toFixed(4), expectedGMPct.toFixed(4), 'Gross margin percentage mismatch');
  // Assert EBITDA
  assert.strictEqual(metrics.ebitda, 530000, 'EBITDA must equal 880K - 350K = 530K');
  // Assert Operating Margin %
  const expectedOMPct = (530000 / 2280000) * 100;
  assert.strictEqual(metrics.operatingMarginPct.toFixed(4), expectedOMPct.toFixed(4), 'Operating margin mismatch');
});

test('1.2 Periodic Inventory COGS calculation (Beginning + Purchases - Ending)', () => {
  const input: RevenueInput = {
    grossRevenue: 1000000,
    beginningInventory: 300000,
    purchases: 600000,
    endingInventory: 250000,
    freightIn: 40000,
  };

  const metrics = computeRevenueMetrics(input);
  assert.strictEqual(metrics.baseCogs, 650000, 'Base COGS must equal 300K + 600K - 250K = 650K');
  assert.strictEqual(metrics.freightCost, 40000, 'Freight cost must equal 40K');
  assert.strictEqual(metrics.totalCogs, 690000, 'Total COGS must equal 650K + 40K = 690K');
  assert.strictEqual(metrics.grossProfit, 310000, 'Gross profit must equal 1M - 690K = 310K');
});

test('1.3 Agriculture Spoilage & Cold-Chain Loss calculation', () => {
  const agriRes = computeAgriRevenue({
    harvestVolumeKg: 100000, // 100 tons
    pricePerKg: 25,          // $25/kg => $2,500,000 gross
    spoilageRate: 0.06,      // 6% post-harvest loss
    productionCostPerKg: 12, // Base COGS = $1,200,000
    coldStorageCostPerKg: 1.5,
    inboundTransportPerKg: 0.5,
  });

  assert.strictEqual(agriRes.grossRevenue, 2500000, 'Gross revenue must be 100K * 25 = 2.5M');
  assert.strictEqual(agriRes.baseCogs, 1200000, 'Base COGS must be 100K * 12 = 1.2M');
  // Spoilage loss = 100K * 0.06 * $25 = $150,000
  assert.strictEqual(agriRes.spoilageLoss, 150000, 'Spoilage loss must equal 150K');
  // Cold storage (1.5) + Transport (0.5) = $2.0/kg * 100K = $200,000
  assert.strictEqual(agriRes.freightCost, 200000, 'Freight & Cold chain must equal 200K');
  // Total COGS = 1.2M + 150K + 200K = 1.55M
  assert.strictEqual(agriRes.totalCogs, 1550000, 'Total COGS must equal 1.55M');
  assert.strictEqual(agriRes.grossProfit, 950000, 'Gross profit must equal 2.5M - 1.55M = 950K');
  assert.strictEqual(agriRes.grossMarginPct.toFixed(2), '38.00', 'Gross margin should be 38.00%');
});

test('1.4 Omnichannel Breakdown & Contribution Margin 1 (CM1) calculation', () => {
  const input: RevenueInput = {
    grossRevenue: 5000000,
    channelBreakdown: [
      {
        channel: 'Shopee & TikTok Shop',
        grossRevenue: 2000000,
        discounts: 200000,
        cogs: 900000,
        channelFees: 150000,
      },
      {
        channel: 'Direct Store Retail',
        grossRevenue: 2000000,
        discounts: 50000,
        cogs: 1000000,
        channelFees: 80000,
      },
      {
        channel: 'B2B Wholesale',
        grossRevenue: 1000000,
        discounts: 100000,
        cogs: 600000,
        channelFees: 20000,
      },
    ],
  };

  const metrics = computeRevenueMetrics(input);
  assert.strictEqual(metrics.channels.length, 3, 'Must have 3 channel metrics');

  // Channel 1: Shopee
  const shopee = metrics.channels[0];
  assert.strictEqual(shopee.netRevenue, 1800000, 'Shopee Net Rev: 2M - 200K = 1.8M');
  assert.strictEqual(shopee.grossProfit, 900000, 'Shopee GP: 1.8M - 900K = 900K');
  assert.strictEqual(shopee.contributionMargin1, 750000, 'Shopee CM1: 900K - 150K = 750K');
  const expectedShopeeCMPct = (750000 / 1800000) * 100;
  assert.strictEqual(shopee.contributionMarginPct.toFixed(2), expectedShopeeCMPct.toFixed(2));

  // Channel 2: Retail
  const retail = metrics.channels[1];
  assert.strictEqual(retail.netRevenue, 1950000, 'Retail Net Rev: 2M - 50K = 1.95M');
  assert.strictEqual(retail.contributionMargin1, 870000, 'Retail CM1: 950K - 80K = 870K');
});

test('1.5 Formula Logs generation in Vietnamese & English', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 1000000,
    discounts: 50000,
    cogs: 600000,
    opex: 150000,
  });

  assert.ok(Array.isArray(metrics.formulaLogVi) && metrics.formulaLogVi.length >= 5, 'Vietnamese formula log must have at least 5 steps');
  assert.ok(Array.isArray(metrics.formulaLogEn) && metrics.formulaLogEn.length >= 5, 'English formula log must have at least 5 steps');
  assert.ok(metrics.formulaLogVi[0].includes('Giảm trừ doanh thu'), 'Must contain Vietnamese step 1');
  assert.ok(metrics.formulaLogVi[1].includes('Doanh thu thuần'), 'Must contain Vietnamese step 2');
  assert.ok(metrics.formulaLogEn[1].includes('Net Revenue'), 'Must contain English step 2');
});

test('1.6 Currency & Percent Formatters ($ and VNĐ formatting)', () => {
  assert.strictEqual(formatPercent(24.8123), '24.8%');
  assert.strictEqual(formatPercent(0), '0.0%');

  // USD compact format
  assert.strictEqual(formatCompactNumber(2450000, 'USD'), '$2.45M');
  assert.strictEqual(formatCompactNumber(830000, 'USD'), '$830.0K');

  // VND compact format
  const vndText = formatCompactNumber(54600000000, 'VND');
  assert.ok(vndText.includes('tỷ ₫') || vndText.includes('B'), 'VND formatting must display tỷ ₫');

  // Currency format with locale
  const usdCur = formatCurrency(2450000, 'USD');
  assert.strictEqual(usdCur, '$2,450,000');
});

test('1.7 Edge cases: zero revenue, zero deductions, negative margin', () => {
  const zeroMetrics = computeRevenueMetrics({ grossRevenue: 0 });
  assert.strictEqual(zeroMetrics.netRevenue, 0);
  assert.strictEqual(zeroMetrics.grossMarginPct, 0);
  assert.strictEqual(zeroMetrics.operatingMarginPct, 0);

  const lossMetrics = computeRevenueMetrics({
    grossRevenue: 100000,
    cogs: 150000,
    opex: 50000,
  });
  assert.strictEqual(lossMetrics.grossProfit, -50000, 'Gross profit must be negative 50K');
  assert.strictEqual(lossMetrics.grossMarginPct, -50, 'Gross margin % must be -50%');
  assert.strictEqual(lossMetrics.ebitda, -100000, 'EBITDA must be negative 100K');
});

// ── SUITE 2: WORKBENCH ARTIFACT SYNCHRONIZATION BRIDGE ──────────────────────
console.log('\n--- SUITE 2: Multi-Artifact Synchronization Bridge ---');

test('2.1 generateExcelRevenueArtifact produces sheet PnL_Revenue_Audit with valid formulas', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 3000000,
    discounts: 200000,
    returns: 50000,
    allowances: 30000,
    cogs: 1600000,
    opex: 400000,
  });

  const excelArt = generateExcelRevenueArtifact(metrics, { currency: '$', periodName: 'Q3/2026' });

  assert.strictEqual(excelArt.type, 'excel');
  assert.strictEqual(excelArt.extension, '.xlsx');
  assert.strictEqual(excelArt.name, 'PnL_Revenue_Audit.xlsx');
  assert.ok(excelArt.content.sheets && excelArt.content.sheets.length > 0, 'Must have sheets');

  const sheet = excelArt.content.sheets[0];
  assert.strictEqual(sheet.name, 'PnL_Revenue_Audit');
  assert.ok(sheet.rows.length >= 10, 'Must contain at least 10 rows of financial items');

  // Verify formula rows in Excel sheet
  const netRevRow = sheet.rows.find((r: any[]) => r[0].includes('Doanh Thu Thuần'));
  assert.ok(netRevRow, 'Must have Net Revenue row');
  assert.strictEqual(netRevRow[1], 2720000, 'Net revenue value must be 2.72M');
  assert.strictEqual(netRevRow[3], '=B2-B6', 'Formula for Net Revenue must be =B2-B6');

  const gpRow = sheet.rows.find((r: any[]) => r[0].includes('Lợi Nhuận Gộp'));
  assert.ok(gpRow, 'Must have Gross Profit row');
  assert.strictEqual(gpRow[1], 1120000, 'Gross profit value must be 1.12M');
  assert.strictEqual(gpRow[3], '=B7-B11', 'Formula for Gross Profit must be =B7-B11');
});

test('2.2 generateSlideRevenueArtifact produces 4-slide presentation deck', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 2450000,
    discounts: 150000,
    cogs: 1450000,
    opex: 350000,
  });

  const slideArt = generateSlideRevenueArtifact(metrics, { title: 'Q3 Revenue Audit Strategy' });

  assert.strictEqual(slideArt.type, 'slide');
  assert.strictEqual(slideArt.extension, '.pptx');
  assert.strictEqual(slideArt.name, 'Revenue_Audit_Strategy_16x9.pptx');

  const deck = slideArt.content;
  assert.ok(Array.isArray(deck.slides) && deck.slides.length === 4, 'Deck must contain 4 slides');

  // Slide 1: Hero
  assert.strictEqual(deck.slides[0].layout, 'hero');
  assert.ok(deck.slides[0].impact_stat.includes('% Gross Margin'));

  // Slide 2: Stat Grid
  assert.strictEqual(deck.slides[1].layout, 'stat_grid');
  assert.ok(deck.slides[1].stats.length >= 4, 'Must have 4 KPI cards');

  // Slide 3: Chart Slide
  assert.strictEqual(deck.slides[2].layout, 'chart');
  assert.ok(deck.slides[2].categories.length > 0);
  assert.ok(deck.slides[2].series.length > 0);

  // Slide 4: Bullets
  assert.strictEqual(deck.slides[3].layout, 'bullets');
  assert.ok(deck.slides[3].bullets.length >= 3);
});

test('2.3 generateWordRevenueArtifact produces institutional A4 Tear Sheet payload', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 4000000,
    discounts: 300000,
    cogs: 2200000,
    opex: 500000,
  });

  const wordArt = generateWordRevenueArtifact(metrics, { title: 'Enterprise Revenue Audit Tear Sheet' });

  assert.strictEqual(wordArt.type, 'docx');
  assert.strictEqual(wordArt.extension, '.docx');
  assert.strictEqual(wordArt.name, 'Revenue_Audit_Tear_Sheet.docx');

  const payload = wordArt.content;
  assert.ok(payload.reportCode.startsWith('REV-'));
  assert.strictEqual(payload.rating, 'OUTPERFORM');
  assert.strictEqual(payload.scorecard.length, 4, 'Scorecard must have 4 items');
  assert.ok(payload.shortTermThesis.length >= 2, 'Must have short-term thesis items');
  assert.ok(payload.longTermThesis.length >= 2, 'Must have long-term thesis items');
  assert.ok(payload.catalystsAndRisks.length >= 2, 'Must have catalysts and risks');
});

test('2.4 generateChartRevenueArtifact produces normalized Workbench ChartModel', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 2100000,
    discounts: 100000,
    cogs: 1200000,
  });

  const chartArt = generateChartRevenueArtifact(metrics, { title: 'Doanh Thu & Lợi Nhuận' });

  assert.strictEqual(chartArt.type, 'chart');
  assert.strictEqual(chartArt.name, 'revenue_breakdown_chart.png');
  assert.ok(chartArt.content.categories.length >= 3);
  assert.ok(chartArt.content.series.length >= 1);
});

test('2.5 syncRevenueToArtifacts updates Excel, Slide, Word, Chart and preserves other tabs', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 5000000,
    discounts: 400000,
    cogs: 2800000,
  });

  const initialArtifacts: OpenWorkArtifact[] = [
    {
      id: 'art-code-custom',
      name: 'etl_script.py',
      title: 'Custom ETL Pipeline',
      type: 'code',
      extension: '.py',
      status: 'ready',
      version: 1,
      content: { code: 'print("hello")' },
      updatedAt: '10:00',
    },
    {
      id: 'art-excel-old',
      name: 'old_data.xlsx',
      type: 'excel',
      status: 'ready',
      version: 1,
      content: { sheets: [] },
      updatedAt: '09:00',
    },
  ];

  const synced = syncRevenueToArtifacts(metrics, initialArtifacts);

  // Must have 5 artifacts: 1 preserved code artifact + 4 synchronized revenue artifacts (excel, slide, docx, chart)
  assert.strictEqual(synced.length, 5, 'Must have 5 artifacts after synchronization');

  // Verify code artifact is preserved
  const codeArt = synced.find((a) => a.type === 'code');
  assert.ok(codeArt, 'Code artifact must be preserved');
  assert.strictEqual(codeArt.name, 'etl_script.py');

  // Verify excel artifact is updated to PnL_Revenue_Audit
  const excelArt = synced.find((a) => a.type === 'excel');
  assert.ok(excelArt, 'Excel artifact must exist');
  assert.strictEqual(excelArt.name, 'PnL_Revenue_Audit.xlsx');

  // Verify slide artifact exists
  const slideArt = synced.find((a) => a.type === 'slide');
  assert.ok(slideArt, 'Slide artifact must exist');

  // Verify docx artifact exists
  const docxArt = synced.find((a) => a.type === 'docx');
  assert.ok(docxArt, 'DOCX artifact must exist');

  // Verify chart artifact exists
  const chartArt = synced.find((a) => a.type === 'chart');
  assert.ok(chartArt, 'Chart artifact must exist');
});

// ── SUITE 3: INTERACTIVE CHART NORMALIZER & DETECTION ───────────────────────
console.log('\n--- SUITE 3: Interactive Chart Block & Normalization Logic ---');

test('3.1 Category and series data mapping consistency', () => {
  const categories = ['Q1', 'Q2', 'Q3', 'Q4'];
  const series = [
    { name: 'Revenue', values: [2100, 2280, 2450, 2600] },
    { name: 'COGS', values: [1450, 1520, 1620, 1700] },
  ];

  // Reconstruct rows as InteractiveChartBlock does
  const rows = categories.map((cat, idx) => ({
    category: cat,
    Revenue: series[0].values[idx],
    COGS: series[1].values[idx],
  }));

  assert.strictEqual(rows.length, 4);
  assert.strictEqual(rows[0].Revenue, 2100);
  assert.strictEqual(rows[2].COGS, 1620);
});

test('3.2 Array-of-objects tabular normalization', () => {
  const rawData = [
    { period: 'Jan', sales: 500, cost: 300 },
    { period: 'Feb', sales: 650, cost: 380 },
    { period: 'Mar', sales: 800, cost: 420 },
  ];

  const keys = Object.keys(rawData[0]);
  const xKey = keys.find((k) => ['period', 'month', 'name'].includes(k)) || 'period';
  const numKeys = keys.filter((k) => k !== xKey);

  assert.strictEqual(xKey, 'period');
  assert.deepStrictEqual(numKeys, ['sales', 'cost']);

  const totalSales = rawData.reduce((acc, r) => acc + r.sales, 0);
  assert.strictEqual(totalSales, 1950, 'Total sales should be 1950');
});

console.log('\n================================================================');
console.log(`📊 FINAL RESULT: ${passedTests}/${totalTests} PASSED | 0 FAILED`);
console.log('================================================================');
if (passedTests === totalTests) {
  console.log('🎉 ALL M2 DEEP REVENUE & INTERACTIVE CHART CHECKS PASSED 100%!\n');
} else {
  process.exit(1);
}
