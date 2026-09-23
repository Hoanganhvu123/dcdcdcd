/**
 * Adversarial Forensic Stress-Testing Suite for Milestone M2
 * Targets:
 *  - lib/revenue/revenueEngine.ts
 *  - lib/artifacts/revenueArtifactSync.ts
 *  - components/openwork/charts/InteractiveChartBlock.tsx (logic & normalization)
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

function adversarialTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [ADV-PASS] ${name}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  [ADV-FAIL] ${name}`);
    console.error(`             ${err.message}`);
  }
}

console.log('================================================================');
console.log('🔥 ADVERSARIAL INTEGRITY FORENSIC STRESS TEST (MILESTONE M2)');
console.log('================================================================\n');

// ── 1. MATHEMATICAL BOUNDARY & INVARIANT FUZZING ────────────────────────────
console.log('--- 1. Mathematical Invariant & Fuzzing Tests ---');

adversarialTest('1.1 Zero, negative, and NaN inputs do not crash or produce NaN', () => {
  const result = computeRevenueMetrics({
    grossRevenue: NaN as any,
    discounts: -50000, // Negative discounts should be clamped to 0
    returns: 'invalid' as any,
    allowances: undefined,
    cogs: null as any,
    opex: -20000,
  });

  assert.strictEqual(result.grossRevenue, 0);
  assert.strictEqual(result.discounts, 0);
  assert.strictEqual(result.returns, 0);
  assert.strictEqual(result.allowances, 0);
  assert.strictEqual(result.totalDeductions, 0);
  assert.strictEqual(result.netRevenue, 0);
  assert.strictEqual(result.cogs, 0);
  assert.strictEqual(result.grossProfit, 0);
  assert.strictEqual(result.grossMarginPct, 0, 'Zero net revenue must yield 0% gross margin, not NaN or Infinity');
  assert.strictEqual(result.ebitda, 0);
  assert.strictEqual(result.operatingMarginPct, 0, 'Zero net revenue must yield 0% operating margin, not NaN or Infinity');
  assert.ok(!Number.isNaN(result.grossMarginPct));
});

adversarialTest('1.2 Massive numbers (Trillions VND) maintain arithmetic precision', () => {
  const gross = 125000000000000; // 125 Trillion VND
  const deductions = 5000000000000; // 5 Trillion VND
  const cogs = 70000000000000; // 70 Trillion VND
  const opex = 20000000000000; // 20 Trillion VND

  const result = computeRevenueMetrics({
    grossRevenue: gross,
    discounts: deductions,
    cogs,
    opex,
    currency: 'VND',
  });

  assert.strictEqual(result.netRevenue, 120000000000000);
  assert.strictEqual(result.grossProfit, 50000000000000);
  assert.strictEqual(result.ebitda, 30000000000000);
  assert.strictEqual(result.grossMarginPct.toFixed(2), '41.67');
  assert.strictEqual(result.operatingMarginPct.toFixed(2), '25.00');

  // Verify VND formatting
  const formattedNet = formatCompactNumber(result.netRevenue, 'VND');
  assert.ok(formattedNet.includes('nghìn tỷ ₫'), `Expected nghìn tỷ ₫ in formatted string: ${formattedNet}`);
});

adversarialTest('1.3 Periodic Inventory COGS edge cases (Ending > Beg + Purchases clamped to 0)', () => {
  const result = computeRevenueMetrics({
    grossRevenue: 1000000,
    beginningInventory: 100000,
    purchases: 200000,
    endingInventory: 500000, // Ending inventory exceeds available -> COGS should not be negative
    freightIn: 20000,
  });

  assert.strictEqual(result.baseCogs, 0, 'Base COGS should be clamped to 0, not -200K');
  assert.strictEqual(result.totalCogs, 20000, 'Total COGS should be only freight (20K)');
  assert.strictEqual(result.grossProfit, 980000);
});

adversarialTest('1.4 Agricultural post-harvest spoilage loss and cold chain accounting', () => {
  const agri = computeAgriRevenue({
    harvestVolumeKg: 50000, // 50 tons
    pricePerKg: 30, // $1.5M gross
    spoilageRate: 0.08, // 8% spoilage ($120,000 loss)
    productionCostPerKg: 10, // $500,000 base cogs
    coldStorageCostPerKg: 2, // $100,000 cold storage
    inboundTransportPerKg: 1, // $50,000 transport
    channelDiscounts: 50000,
  });

  assert.strictEqual(agri.grossRevenue, 1500000);
  assert.strictEqual(agri.discounts, 50000);
  assert.strictEqual(agri.netRevenue, 1450000);
  assert.strictEqual(agri.baseCogs, 500000);
  assert.strictEqual(agri.spoilageLoss, 120000);
  assert.strictEqual(agri.freightCost, 150000);
  assert.strictEqual(agri.totalCogs, 770000);
  assert.strictEqual(agri.grossProfit, 680000);
  assert.strictEqual(agri.grossMarginPct.toFixed(2), ((680000 / 1450000) * 100).toFixed(2));
});

adversarialTest('1.5 Omnichannel CM1 with 5 realistic diverse channels', () => {
  const input: RevenueInput = {
    grossRevenue: 10000000,
    channelBreakdown: [
      { channel: 'Shopee Mall', grossRevenue: 4000000, discounts: 400000, returns: 100000, cogs: 1800000, channelFees: 350000 },
      { channel: 'TikTok Shop', grossRevenue: 2500000, discounts: 300000, returns: 150000, cogs: 1000000, channelFees: 250000 },
      { channel: 'Flagship Store', grossRevenue: 1500000, discounts: 50000, returns: 10000, cogs: 600000, channelFees: 50000 },
      { channel: 'B2B Corporate', grossRevenue: 1500000, discounts: 150000, returns: 0, cogs: 800000, channelFees: 30000 },
      { channel: 'Distributors', grossRevenue: 500000, discounts: 50000, returns: 0, cogs: 300000, channelFees: 10000 },
    ],
  };

  const metrics = computeRevenueMetrics(input);
  assert.strictEqual(metrics.channels.length, 5);

  metrics.channels.forEach((ch) => {
    assert.strictEqual(ch.totalDeductions, ch.discounts + ch.returns);
    assert.strictEqual(ch.netRevenue, ch.grossRevenue - ch.totalDeductions);
    assert.strictEqual(ch.grossProfit, ch.netRevenue - ch.cogs);
    assert.strictEqual(ch.contributionMargin1, ch.grossProfit - ch.channelFees);
    assert.strictEqual(ch.contributionMarginPct.toFixed(4), ((ch.contributionMargin1 / ch.netRevenue) * 100).toFixed(4));
  });
});

adversarialTest('1.6 Bilingual formula log step verification', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 5000000,
    discounts: 200000,
    returns: 50000,
    allowances: 50000,
    cogs: 2500000,
    opex: 800000,
    channelBreakdown: [{ channel: 'Retail', grossRevenue: 5000000, cogs: 2500000, channelFees: 200000 }],
  });

  assert.strictEqual(metrics.formulaLogVi.length, 6, 'Vietnamese log must have 6 entries including CM1');
  assert.strictEqual(metrics.formulaLogEn.length, 6, 'English log must have 6 entries including CM1');

  assert.ok(metrics.formulaLogVi[0].startsWith('1. Giảm trừ'));
  assert.ok(metrics.formulaLogVi[1].startsWith('2. Doanh thu thuần'));
  assert.ok(metrics.formulaLogVi[2].startsWith('3. Giá vốn COGS'));
  assert.ok(metrics.formulaLogVi[3].startsWith('4. Lợi nhuận gộp'));
  assert.ok(metrics.formulaLogVi[4].startsWith('5. EBITDA'));
  assert.ok(metrics.formulaLogVi[5].startsWith('6. Biên đóng góp CM1'));

  assert.ok(metrics.formulaLogEn[0].startsWith('1. Deductions'));
  assert.ok(metrics.formulaLogEn[1].startsWith('2. Net Revenue'));
  assert.ok(metrics.formulaLogEn[2].startsWith('3. COGS'));
  assert.ok(metrics.formulaLogEn[3].startsWith('4. Gross Profit'));
  assert.ok(metrics.formulaLogEn[4].startsWith('5. EBITDA'));
  assert.ok(metrics.formulaLogEn[5].startsWith('6. Channel CM1'));
});

// ── 2. ARTIFACT SYNCHRONIZATION INVARIANTS ──────────────────────────────────
console.log('\n--- 2. Artifact Synchronization Invariants ---');

adversarialTest('2.1 Excel sheet rows match strict formula specifications', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 1000000,
    discounts: 50000,
    cogs: 500000,
    opex: 200000,
  });

  const excelArt = generateExcelRevenueArtifact(metrics);
  const rows = excelArt.content.sheets[0].rows;

  const totalDeductionsRow = rows.find((r: any[]) => r[0] === 'Tổng Các Khoản Giảm Trừ');
  assert.strictEqual(totalDeductionsRow[3], '=SUM(B3:B5)');

  const netRevRow = rows.find((r: any[]) => r[0] === 'Doanh Thu Thuần (Net Revenue)');
  assert.strictEqual(netRevRow[3], '=B2-B6');

  const totalCogsRow = rows.find((r: any[]) => r[0] === 'Tổng Giá Vốn Hàng Bán (Total COGS)');
  assert.strictEqual(totalCogsRow[3], '=SUM(B8:B10)');

  const gpRow = rows.find((r: any[]) => r[0] === 'Lợi Nhuận Gộp (Gross Profit)');
  assert.strictEqual(gpRow[3], '=B7-B11');

  const ebitdaRow = rows.find((r: any[]) => r[0] === 'EBITDA');
  assert.strictEqual(ebitdaRow[3], '=B12-B14');
});

adversarialTest('2.2 Word institutional rating threshold transitions', () => {
  const highMargin = computeRevenueMetrics({ grossRevenue: 1000000, cogs: 500000 }); // 50% GP
  const midMargin = computeRevenueMetrics({ grossRevenue: 1000000, cogs: 750000 }); // 25% GP
  const lowMargin = computeRevenueMetrics({ grossRevenue: 1000000, cogs: 900000 }); // 10% GP

  const wordHigh = generateWordRevenueArtifact(highMargin);
  const wordMid = generateWordRevenueArtifact(midMargin);
  const wordLow = generateWordRevenueArtifact(lowMargin);

  assert.strictEqual(wordHigh.content.rating, 'OUTPERFORM');
  assert.strictEqual(wordMid.content.rating, 'BUY');
  assert.strictEqual(wordLow.content.rating, 'HOLD');
});

adversarialTest('2.3 Non-destructive multi-artifact sync idempotent and preserves foreign tabs', () => {
  const metrics = computeRevenueMetrics({ grossRevenue: 2000000, cogs: 1000000 });

  const foreignTabs: OpenWorkArtifact[] = [
    { id: 'tab-1', name: 'query.sql', title: 'SQL Query', type: 'sql' as any, status: 'ready', version: 1, content: {}, updatedAt: '12:00' },
    { id: 'tab-2', name: 'flow.json', title: 'Flow DAG', type: 'flow' as any, status: 'ready', version: 1, content: {}, updatedAt: '12:00' },
  ];

  const sync1 = syncRevenueToArtifacts(metrics, foreignTabs);
  assert.strictEqual(sync1.length, 6, '2 foreign tabs + 4 revenue artifacts = 6');

  // Second sync with existing artifacts should not duplicate
  const sync2 = syncRevenueToArtifacts(metrics, sync1);
  assert.strictEqual(sync2.length, 6, 'Idempotent sync must maintain 6 artifacts');
});

// ── 3. DATA NORMALIZATION & CHART FUZZING ───────────────────────────────────
console.log('\n--- 3. Chart Normalization & Formatting Edge Cases ---');

adversarialTest('3.1 Format compact numbers across edge cases', () => {
  assert.strictEqual(formatCompactNumber(0), '$0');
  assert.strictEqual(formatCompactNumber(Infinity), '0');
  assert.strictEqual(formatCompactNumber(-Infinity), '0');
  assert.strictEqual(formatCompactNumber(NaN), '0');
  assert.strictEqual(formatCompactNumber(-2500000, 'USD'), '-$2.50M');
  assert.strictEqual(formatCompactNumber(-54600000000, 'VND').includes('tỷ ₫'), true);
});

adversarialTest('3.2 Format currency locale fallback and precision', () => {
  assert.strictEqual(formatCurrency(0, 'USD'), '$0');
  assert.strictEqual(formatCurrency(1234567.89, 'USD'), '$1,234,567.89');
  assert.strictEqual(formatCurrency(100000000, 'VND'), '100.000.000 ₫');
  assert.strictEqual(formatCurrency(NaN), '0');
});

console.log('\n================================================================');
console.log(`🔥 ADVERSARIAL SUMMARY: ${passedTests}/${totalTests} PASSED | ${failedTests} FAILED`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('✨ ZERO INTEGRITY DEFECTS OR MATHEMATICAL INCONSISTENCIES FOUND.\n');
}
