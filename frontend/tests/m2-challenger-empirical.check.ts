/**
 * Adversarial Empirical Stress-Testing Suite: Milestone M2 - Deep Revenue Engine & Edge Cases
 * Author: Challenger Agent M2 (`challenger_m2_1`)
 * Run via: npx tsx tests/m2-challenger-empirical.check.ts
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
let failedTests = 0;

function stressTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [STRESS-PASS] ${name}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  [STRESS-FAIL] ${name}`);
    console.error(`                ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('========================================================================');
console.log('🔥 EMPIRICAL ADVERSARIAL STRESS HARNESS: REVENUE ENGINE & EDGE CASES');
console.log('========================================================================\n');

// ── TEST GROUP 1: BOUNDARY, EXTREME NUMERICAL & TYPE FUZZING ────────────────
console.log('--- GROUP 1: Extreme Boundary, Fuzzing & Numerical Robustness ---');

stressTest('1.1 Empty input object {} produces zeroed metrics without crashing or NaN', () => {
  const res = computeRevenueMetrics({} as any);
  assert.strictEqual(res.grossRevenue, 0);
  assert.strictEqual(res.totalDeductions, 0);
  assert.strictEqual(res.netRevenue, 0);
  assert.strictEqual(res.baseCogs, 0);
  assert.strictEqual(res.totalCogs, 0);
  assert.strictEqual(res.grossProfit, 0);
  assert.strictEqual(res.grossMarginPct, 0);
  assert.strictEqual(res.ebitda, 0);
  assert.strictEqual(res.operatingMarginPct, 0);
  assert.ok(Array.isArray(res.channels) && res.channels.length === 0);
  assert.ok(Array.isArray(res.formulaLogVi) && res.formulaLogVi.length >= 5);
  assert.ok(Array.isArray(res.formulaLogEn) && res.formulaLogEn.length >= 5);
});

stressTest('1.2 Negative input sanitization (discounts, returns, allowances, cogs, opex)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 100000,
    discounts: -5000,   // Negative should be clamped to 0
    returns: -2000,     // Negative should be clamped to 0
    allowances: -1000,  // Negative should be clamped to 0
    cogs: -50000,       // Negative should be clamped to 0
    opex: -20000,       // Negative should be clamped to 0
  });

  assert.strictEqual(res.discounts, 0, 'Negative discounts must be clamped to 0');
  assert.strictEqual(res.returns, 0, 'Negative returns must be clamped to 0');
  assert.strictEqual(res.allowances, 0, 'Negative allowances must be clamped to 0');
  assert.strictEqual(res.totalDeductions, 0);
  assert.strictEqual(res.netRevenue, 100000);
  assert.strictEqual(res.baseCogs, 0, 'Negative base COGS must be clamped to 0');
  assert.strictEqual(res.totalCogs, 0);
  assert.strictEqual(res.grossProfit, 100000);
  assert.strictEqual(res.opex, 0, 'Negative opex must be clamped to 0');
  assert.strictEqual(res.ebitda, 100000);
});

stressTest('1.3 Non-numeric / NaN / String coercion handling', () => {
  const res = computeRevenueMetrics({
    grossRevenue: '500000' as any,
    discounts: '25000' as any,
    returns: NaN,
    allowances: null as any,
    cogs: '200000' as any,
    opex: undefined,
  });

  assert.strictEqual(res.grossRevenue, 500000);
  assert.strictEqual(res.discounts, 25000);
  assert.strictEqual(res.returns, 0, 'NaN returns must safely default to 0');
  assert.strictEqual(res.allowances, 0, 'null allowances must safely default to 0');
  assert.strictEqual(res.totalDeductions, 25000);
  assert.strictEqual(res.netRevenue, 475000);
  assert.strictEqual(res.baseCogs, 200000);
  assert.strictEqual(res.grossProfit, 275000);
  assert.strictEqual(res.opex, 0);
  assert.strictEqual(res.ebitda, 275000);
});

stressTest('1.4 Massive scale numbers (trillions / quadrillions 1e15)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 10_000_000_000_000_000, // 10 Quadrillion
    discounts: 500_000_000_000_000,      // 500 Trillion
    cogs: 4_000_000_000_000_000,         // 4 Quadrillion
    opex: 1_000_000_000_000_000,         // 1 Quadrillion
  });

  assert.strictEqual(res.netRevenue, 9_500_000_000_000_000);
  assert.strictEqual(res.grossProfit, 5_500_000_000_000_000);
  assert.strictEqual(res.ebitda, 4_500_000_000_000_000);
  const expectedGMPct = (5500000000000000 / 9500000000000000) * 100;
  assert.strictEqual(res.grossMarginPct.toFixed(4), expectedGMPct.toFixed(4));
  assert.ok(!isNaN(res.grossMarginPct));
});

stressTest('1.5 Sub-cent micro-decimal precision (e.g. 0.123456)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 100.555,
    discounts: 10.222,
    cogs: 40.111,
    opex: 15.055,
  });

  assert.strictEqual(Number(res.netRevenue.toFixed(3)), 90.333);
  assert.strictEqual(Number(res.grossProfit.toFixed(3)), 50.222);
  assert.strictEqual(Number(res.ebitda.toFixed(3)), 35.167);
});

stressTest('1.6 Deductions exceeding Gross Revenue (Negative Net Revenue safety)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 100000,
    discounts: 80000,
    returns: 30000,
    allowances: 10000,
    cogs: 20000,
    opex: 10000,
  });

  // Total deductions = 120,000 > Gross 100,000 => Net Revenue = -20,000
  assert.strictEqual(res.totalDeductions, 120000);
  assert.strictEqual(res.netRevenue, -20000);
  assert.strictEqual(res.grossProfit, -40000);
  // When netRevenue <= 0, grossMarginPct and operatingMarginPct must be 0 (no divide-by-zero or negative-divisor anomaly)
  assert.strictEqual(res.grossMarginPct, 0, 'Margin % must safely be 0 when netRevenue <= 0');
  assert.strictEqual(res.operatingMarginPct, 0, 'Operating margin % must safely be 0 when netRevenue <= 0');
  assert.strictEqual(res.ebitda, -50000);
});

// ── TEST GROUP 2: PERIODIC INVENTORY VS EXPLICIT COGS MATRIX ────────────────
console.log('\n--- GROUP 2: Periodic Inventory vs Direct COGS Stress Matrix ---');

stressTest('2.1 Periodic inventory precedence when all 3 inventory fields provided', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 2000000,
    cogs: 9999999, // Should be superseded by periodic inventory calculation
    beginningInventory: 400000,
    purchases: 800000,
    endingInventory: 300000,
  });

  // Base COGS = 400K + 800K - 300K = 900K
  assert.strictEqual(res.baseCogs, 900000, 'Periodic inventory calculation must override explicit cogs');
  assert.strictEqual(res.totalCogs, 900000);
});

stressTest('2.2 Partial periodic inventory fallback to explicit cogs', () => {
  const resMissingEnding = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 450000,
    beginningInventory: 300000,
    purchases: 500000,
    // endingInventory missing!
  });
  assert.strictEqual(resMissingEnding.baseCogs, 450000, 'Must fallback to explicit cogs when ending inventory is undefined');

  const resMissingBeg = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 500000,
    purchases: 500000,
    endingInventory: 200000,
    // beginningInventory missing!
  });
  assert.strictEqual(resMissingBeg.baseCogs, 500000, 'Must fallback to explicit cogs when beginning inventory is undefined');
});

stressTest('2.3 Ending inventory exceeding Beginning + Purchases clamps to 0', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 1000000,
    beginningInventory: 100000,
    purchases: 200000,
    endingInventory: 500000, // 100K + 200K - 500K = -200K -> clamped to 0
  });

  assert.strictEqual(res.baseCogs, 0, 'Periodic COGS cannot be negative; must clamp to 0');
  assert.strictEqual(res.totalCogs, 0);
  assert.strictEqual(res.grossProfit, 1000000);
});

stressTest('2.4 Inbound Freight and Cold Chain addition to Base COGS', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 400000,
    freightIn: 50000,
    coldChainCost: 30000,
  });

  assert.strictEqual(res.baseCogs, 400000);
  assert.strictEqual(res.freightCost, 80000, 'Freight cost must sum freightIn + coldChainCost');
  assert.strictEqual(res.totalCogs, 480000);
  assert.strictEqual(res.grossProfit, 520000);
});

// ── TEST GROUP 3: AGRICULTURE & SPOILAGE LOSS EDGE CASES ─────────────────────
console.log('\n--- GROUP 3: Agriculture & Spoilage Loss Stress Scenarios ---');

stressTest('3.1 Spoilage Rate = 0 (0% loss)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 500000,
    spoilageRate: 0,
  });

  assert.strictEqual(res.spoilageLoss, 0);
  assert.strictEqual(res.totalCogs, 500000);
});

stressTest('3.2 Spoilage Rate = 0.5 (50% loss) and 1.0 (100% loss)', () => {
  const res50 = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: 0.5,
  });
  assert.strictEqual(res50.spoilageLoss, 200000, '50% spoilage on 400K cogs = 200K');
  assert.strictEqual(res50.totalCogs, 600000);

  const res100 = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: 1.0,
  });
  assert.strictEqual(res100.spoilageLoss, 400000, '100% spoilage on 400K cogs = 400K');
  assert.strictEqual(res100.totalCogs, 800000);
});

stressTest('3.3 Spoilage Rate > 1.0 (Severe disaster loss scenario e.g. 2.0x)', () => {
  const resSevere = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 300000,
    spoilageRate: 2.0,
  });
  assert.strictEqual(resSevere.spoilageLoss, 600000, '200% spoilage loss = 600K');
  assert.strictEqual(resSevere.totalCogs, 900000);
});

stressTest('3.4 Explicit spoilageCost takes precedence over spoilageRate', () => {
  const resExplicit = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: 0.5, // Would be 200K
    spoilageCost: 75000, // Explicit cost
  });

  assert.strictEqual(resExplicit.spoilageLoss, 75000, 'Explicit spoilageCost must override spoilageRate');
  assert.strictEqual(resExplicit.totalCogs, 475000);
});

stressTest('3.5 Explicit spoilageCost = 0 takes precedence and yields 0 loss', () => {
  const resZeroExplicit = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: 0.25, // 100K
    spoilageCost: 0,
  });

  assert.strictEqual(resZeroExplicit.spoilageLoss, 0, 'Explicit 0 spoilage cost must take precedence');
  assert.strictEqual(resZeroExplicit.totalCogs, 400000);
});

stressTest('3.6 computeAgriRevenue with zero volume or zero prices', () => {
  const resZeroVol = computeAgriRevenue({
    harvestVolumeKg: 0,
    pricePerKg: 50,
    spoilageRate: 0.05,
    productionCostPerKg: 20,
  });

  assert.strictEqual(resZeroVol.grossRevenue, 0);
  assert.strictEqual(resZeroVol.netRevenue, 0);
  assert.strictEqual(resZeroVol.totalCogs, 0);
  assert.strictEqual(resZeroVol.grossProfit, 0);
  assert.strictEqual(resZeroVol.grossMarginPct, 0);
});

// ── TEST GROUP 4: OMNICHANNEL CONTRIBUTION MARGIN 1 (CM1) STRESS ─────────────
console.log('\n--- GROUP 4: Omnichannel CM1 Edge Cases & Negative Margins ---');

stressTest('4.1 Channel with zero revenue and positive channel fees', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 1000000,
    channelBreakdown: [
      {
        channel: 'Dead Marketplace Channel',
        grossRevenue: 0,
        discounts: 0,
        cogs: 0,
        channelFees: 50000,
        freight: 10000,
      },
    ],
  });

  const ch = res.channels[0];
  assert.strictEqual(ch.netRevenue, 0);
  assert.strictEqual(ch.grossProfit, 0);
  assert.strictEqual(ch.grossMarginPct, 0);
  assert.strictEqual(ch.channelFees, 60000);
  assert.strictEqual(ch.contributionMargin1, -60000, 'CM1 must be -60K');
  assert.strictEqual(ch.contributionMarginPct, 0, 'CM% must safely be 0% on 0 revenue');
});

stressTest('4.2 Channel with heavy discounting & negative contribution margin', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 500000,
    channelBreakdown: [
      {
        channel: 'Flash Sale Promo Channel',
        grossRevenue: 500000,
        discounts: 150000,
        returns: 50000,
        cogs: 250000,
        channelFees: 80000,
      },
    ],
  });

  const ch = res.channels[0];
  assert.strictEqual(ch.netRevenue, 300000);
  assert.strictEqual(ch.grossProfit, 50000); // 300K - 250K = 50K
  assert.strictEqual(ch.contributionMargin1, -30000); // 50K - 80K = -30K
  const expectedCMPct = (-30000 / 300000) * 100;
  assert.strictEqual(ch.contributionMarginPct.toFixed(2), expectedCMPct.toFixed(2));
});

stressTest('4.3 Channel missing optional fields (no discounts, returns, cogs, fees, freight)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 200000,
    channelBreakdown: [
      {
        channel: 'Direct Cash Sales',
        grossRevenue: 200000,
      },
    ],
  });

  const ch = res.channels[0];
  assert.strictEqual(ch.grossRevenue, 200000);
  assert.strictEqual(ch.discounts, 0);
  assert.strictEqual(ch.returns, 0);
  assert.strictEqual(ch.netRevenue, 200000);
  assert.strictEqual(ch.cogs, 0);
  assert.strictEqual(ch.grossProfit, 200000);
  assert.strictEqual(ch.grossMarginPct, 100);
  assert.strictEqual(ch.channelFees, 0);
  assert.strictEqual(ch.contributionMargin1, 200000);
  assert.strictEqual(ch.contributionMarginPct, 100);
});

stressTest('4.4 High channel cardinality combinatorial test (50 distinct channels)', () => {
  const channels = Array.from({ length: 50 }, (_, i) => ({
    channel: `Channel_${i + 1}`,
    grossRevenue: 100000 * (i + 1),
    discounts: 5000 * (i + 1),
    cogs: 40000 * (i + 1),
    channelFees: 10000 * (i + 1),
  }));

  const res = computeRevenueMetrics({
    grossRevenue: channels.reduce((sum, c) => sum + c.grossRevenue, 0),
    channelBreakdown: channels,
  });

  assert.strictEqual(res.channels.length, 50);
  assert.strictEqual(res.channels[0].netRevenue, 95000);
  assert.strictEqual(res.channels[49].netRevenue, 95000 * 50);
  assert.ok(res.formulaLogVi.some(l => l.includes('Biên đóng góp CM1')));
});

stressTest('4.5 12-Month period breakdown calculation', () => {
  const periods = Array.from({ length: 12 }, (_, i) => ({
    period: `2026-M${(i + 1).toString().padStart(2, '0')}`,
    grossRevenue: 1000000 + i * 50000,
    discounts: 50000,
    cogs: 600000,
    opex: 150000,
  }));

  const res = computeRevenueMetrics({
    grossRevenue: 15000000,
    periodBreakdown: periods,
  });

  assert.ok(res.periods && res.periods.length === 12);
  assert.strictEqual(res.periods[0].netRevenue, 950000);
  assert.strictEqual(res.periods[0].grossProfit, 350000);
  assert.strictEqual(res.periods[0].ebitda, 200000);
});

// ── TEST GROUP 5: FORMATTING STABILITY & BILINGUAL FORMULA LOGS ──────────────
console.log('\n--- GROUP 5: Formatting Stability & Bilingual Logs ---');

stressTest('5.1 formatCompactNumber extreme inputs, finite checks & currency modes', () => {
  assert.strictEqual(formatCompactNumber(NaN), '0');
  assert.strictEqual(formatCompactNumber(Infinity), '0');
  assert.strictEqual(formatCompactNumber(-Infinity), '0');
  assert.strictEqual(formatCompactNumber(0), '$0');
  assert.strictEqual(formatCompactNumber(-5000, 'USD'), '-$5.0K');
  assert.strictEqual(formatCompactNumber(-2500000, 'USD'), '-$2.50M');
  assert.strictEqual(formatCompactNumber(-15000000000, 'USD'), '-$15.0B');

  // VND format tests
  assert.strictEqual(formatCompactNumber(5000000000000, 'VND'), '5.00 nghìn tỷ ₫');
  assert.strictEqual(formatCompactNumber(25000000000, 'VND'), '25.0 tỷ ₫');
  assert.strictEqual(formatCompactNumber(15000000, 'VND'), '15.0 tr ₫');
  assert.strictEqual(formatCompactNumber(-25000000000, 'VND'), '-25.0 tỷ ₫');

  // AUTO format tests (>= 1e8 triggers VND formatting)
  assert.strictEqual(formatCompactNumber(500000000, 'AUTO'), '500.0 tr ₫');
  assert.strictEqual(formatCompactNumber(50000, 'AUTO'), '$50.0K');
});

stressTest('5.2 formatCurrency & formatPercent finite checks', () => {
  assert.strictEqual(formatCurrency(NaN), '0');
  assert.strictEqual(formatCurrency(Infinity), '0');
  assert.strictEqual(formatCurrency(0, 'USD'), '$0');
  assert.strictEqual(formatPercent(NaN), '0.0%');
  assert.strictEqual(formatPercent(Infinity), '0.0%');
  assert.strictEqual(formatPercent(-15.678, 2), '-15.68%');
});

// ── TEST GROUP 6: WORKBENCH ARTIFACT SYNCHRONIZATION WITH ADVERSARIAL METRICS ─
console.log('\n--- GROUP 6: Artifact Generators with Adversarial Metrics ---');

stressTest('6.1 Excel artifact generator handles zero and negative metrics safely', () => {
  const negMetrics = computeRevenueMetrics({
    grossRevenue: 100000,
    discounts: 150000,
    cogs: 200000,
    opex: 50000,
  });

  const excelArt = generateExcelRevenueArtifact(negMetrics, { currency: '$', periodName: 'Q4/2026' });
  assert.strictEqual(excelArt.type, 'excel');
  const sheet = excelArt.content.sheets[0];
  assert.ok(sheet.rows.length >= 10);

  // Validate formula placeholders
  const netRow = sheet.rows.find((r: any[]) => r[0].includes('Doanh Thu Thuần'));
  assert.strictEqual(netRow[3], '=B2-B6');
  const gpRow = sheet.rows.find((r: any[]) => r[0].includes('Lợi Nhuận Gộp'));
  assert.strictEqual(gpRow[3], '=B7-B11');
});

stressTest('6.2 Slide artifact generator handles empty channel list and zero revenue', () => {
  const zeroMetrics = computeRevenueMetrics({ grossRevenue: 0 });
  const slideArt = generateSlideRevenueArtifact(zeroMetrics);
  assert.strictEqual(slideArt.type, 'slide');
  assert.strictEqual(slideArt.content.slides.length, 4);

  // Check Slide 3 (chart slide fallback categories)
  const chartSlide = slideArt.content.slides[2];
  assert.strictEqual(chartSlide.layout, 'chart');
  assert.deepStrictEqual(chartSlide.categories, [
    'Doanh Thu Gộp',
    'Doanh Thu Thuần',
    'Giá Vốn COGS',
    'Lợi Nhuận Gộp',
    'EBITDA',
  ]);
});

stressTest('6.3 Word artifact generator produces valid payload with negative margin', () => {
  const negMetrics = computeRevenueMetrics({
    grossRevenue: 50000,
    cogs: 100000,
  });

  const wordArt = generateWordRevenueArtifact(negMetrics);
  assert.strictEqual(wordArt.type, 'docx');
  assert.strictEqual(wordArt.content.rating, 'HOLD', 'Negative margin should produce HOLD rating');
  assert.strictEqual(wordArt.content.scorecard.length, 4);
});

stressTest('6.4 syncRevenueToArtifacts handles initial empty array or pre-populated tabs', () => {
  const metrics = computeRevenueMetrics({ grossRevenue: 1000000 });
  const syncedFromEmpty = syncRevenueToArtifacts(metrics, []);
  assert.strictEqual(syncedFromEmpty.length, 4, 'Must create 4 artifacts: excel, slide, docx, chart');

  const initialWithCustom: OpenWorkArtifact[] = [
    {
      id: 'custom-browser',
      name: 'browser_session',
      type: 'browser',
      status: 'ready',
      version: 1,
      content: {},
      updatedAt: '12:00',
    },
  ];

  const syncedWithPreserve = syncRevenueToArtifacts(metrics, initialWithCustom);
  assert.strictEqual(syncedWithPreserve.length, 5, 'Must preserve custom browser artifact + 4 synced artifacts');
  assert.ok(syncedWithPreserve.some((a) => a.type === 'browser'));
});

stressTest('6.5 syncRevenueToArtifacts idempotency check (multiple runs do not duplicate)', () => {
  const metrics = computeRevenueMetrics({ grossRevenue: 2500000 });
  const run1 = syncRevenueToArtifacts(metrics, []);
  assert.strictEqual(run1.length, 4);

  const run2 = syncRevenueToArtifacts(metrics, run1);
  assert.strictEqual(run2.length, 4, 'Repeated synchronization must maintain exactly 4 artifacts (no duplicate tabs)');
});

console.log('\n========================================================================');
console.log(`📊 ADVERSARIAL STRESS TEST SUMMARY: ${passedTests}/${totalTests} PASSED | ${failedTests} FAILED`);
console.log('========================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
