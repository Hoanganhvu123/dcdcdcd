/**
 * Automated Verification Check Suite: What-If Financial Scenario Simulator
 * Run via: npx tsx tests/whatif-simulation.check.ts
 */

import assert from 'assert';
import {
  computeRevenueMetrics,
  simulateWhatIfScenario,
  WHAT_IF_PRESETS,
  type RevenueInput,
} from '../lib/revenue/revenueEngine';

let totalTests = 0;
let passedTests = 0;

function test(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log('  [PASS] ' + name);
  } catch (err: any) {
    console.error('  [FAIL] ' + name);
    console.error('         ' + err.message);
    process.exitCode = 1;
  }
}

console.log('================================================================');
console.log('🎲 WHAT-IF FINANCIAL SCENARIO SIMULATOR VERIFICATION');
console.log('================================================================\n');

const sampleInput: RevenueInput = {
  grossRevenue: 10000000,
  discounts: 500000,
  returns: 200000,
  allowances: 100000,
  cogs: 4000000,
  opex: 1500000,
  channelBreakdown: [
    { channel: 'Online Store', grossRevenue: 6000000, discounts: 300000, returns: 120000, cogs: 2400000, channelFees: 600000 },
    { channel: 'Retail POS', grossRevenue: 4000000, discounts: 200000, returns: 80000, cogs: 1600000, channelFees: 200000 },
  ],
};

const baseMetrics = computeRevenueMetrics(sampleInput);

// ── SUITE 1: BASE PRESET (IDENTITY / ZERO DELTA) ───────────────────────────
console.log('--- SUITE 1: Base Preset Identity & Deltas ---');

test('1.1 Base preset produces zero deltas against base metrics', () => {
  const result = simulateWhatIfScenario(baseMetrics, undefined, 'base');
  assert.strictEqual(result.preset, 'base');
  assert.strictEqual(result.deltas.grossRevenueDelta, 0);
  assert.strictEqual(result.deltas.netRevenueDelta, 0);
  assert.strictEqual(result.deltas.totalCogsDelta, 0);
  assert.strictEqual(result.deltas.grossProfitDelta, 0);
  assert.strictEqual(result.deltas.ebitdaDelta, 0);
  assert.strictEqual(result.simulatedMetrics.grossRevenue, baseMetrics.grossRevenue);
  assert.strictEqual(result.simulatedMetrics.netRevenue, baseMetrics.netRevenue);
});

// ── SUITE 2: PRESET MATH ACCURACY (OPTIMISTIC & CONSERVATIVE) ──────────────
console.log('\n--- SUITE 2: Optimistic & Conservative Presets ---');

test('2.1 Optimistic preset scales volume +20%, CAC -5%, Discount 5%, Spoilage 2%', () => {
  const result = simulateWhatIfScenario(baseMetrics, undefined, 'optimistic');
  assert.strictEqual(result.preset, 'optimistic');
  assert.strictEqual(result.levers.volumeGrowthPercent, 20);
  assert.strictEqual(result.levers.discountPercent, 5);
  assert.strictEqual(result.levers.cacAdjustmentPercent, -5);
  assert.strictEqual(result.levers.spoilagePercent, 2);

  // Volume scales gross revenue by 1.2
  const expectedGross = 10000000 * 1.2;
  assert.strictEqual(result.simulatedMetrics.grossRevenue, expectedGross);
  assert.strictEqual(result.deltas.grossRevenueDelta, expectedGross - 10000000);

  // Extra discount = 12M * 5% = 600K; base discount * 1.2 = 600K -> total = 1.2M
  assert.strictEqual(result.simulatedMetrics.discounts, 600000 + 600000);
});

test('2.2 Conservative preset scales volume -15%, CAC +15%, Discount 15%, Spoilage 8%', () => {
  const result = simulateWhatIfScenario(baseMetrics, undefined, 'conservative');
  assert.strictEqual(result.preset, 'conservative');
  assert.strictEqual(result.levers.volumeGrowthPercent, -15);
  assert.strictEqual(result.levers.discountPercent, 15);
  assert.strictEqual(result.levers.cacAdjustmentPercent, 15);
  assert.strictEqual(result.levers.spoilagePercent, 8);

  const expectedGross = 10000000 * 0.85;
  assert.strictEqual(result.simulatedMetrics.grossRevenue, expectedGross);
  assert.ok(result.deltas.netRevenueDelta < 0, 'Net revenue delta must be negative in conservative case');
  assert.ok(result.deltas.grossProfitDelta < 0, 'Gross profit delta must be negative in conservative case');
});

// ── SUITE 3: BOUNDARY CLAMPING & EXTREMES ──────────────────────────────────
console.log('\n--- SUITE 3: Boundary Clamping & Safety Rails ---');

test('3.1 Out-of-bounds levers are safely clamped to min/max ceilings', () => {
  const extremeResult = simulateWhatIfScenario(baseMetrics, {
    discountPercent: 999, // Max is 30
    volumeGrowthPercent: -999, // Min is -30
    cacAdjustmentPercent: 500, // Max is 40
    spoilagePercent: -50, // Min is 0
  });

  assert.strictEqual(extremeResult.levers.discountPercent, 30);
  assert.strictEqual(extremeResult.levers.volumeGrowthPercent, -30);
  assert.strictEqual(extremeResult.levers.cacAdjustmentPercent, 40);
  assert.strictEqual(extremeResult.levers.spoilagePercent, 0);
});

// ── SUITE 4: CHANNEL CM1 RECALIBRATION ────────────────────────────────────
console.log('\n--- SUITE 4: Multi-Channel CM1 Recalibration ---');

test('4.1 Channel CM1 values adjust dynamically based on CAC and Volume factors', () => {
  const result = simulateWhatIfScenario(baseMetrics, {
    volumeGrowthPercent: 10,
    cacAdjustmentPercent: -10,
    discountPercent: 0,
    spoilagePercent: 0,
  });

  assert.strictEqual(result.simulatedMetrics.channels?.length, 2);
  const onlineCh = result.simulatedMetrics.channels![0];
  // CAC reduced by 10%: 600K * 0.9 = 540K
  assert.strictEqual(Math.round(onlineCh.channelFees), 540000);
  // Volume scaled by 1.1: gross = 6.6M
  assert.strictEqual(Math.round(onlineCh.grossRevenue), 6600000);
  assert.ok(onlineCh.contributionMargin1 > 0, 'CM1 must remain positive');
});

// ── SUITE 5: LOCALIZED SUMMARY SENTENCES ───────────────────────────────────
console.log('\n--- SUITE 5: Localized Summary Sentences ---');

test('5.1 Summary sentences in Vietnamese and English are populated', () => {
  const result = simulateWhatIfScenario(baseMetrics, undefined, 'optimistic');
  assert.ok(result.summarySentenceVi.length > 0, 'summarySentenceVi must not be empty');
  assert.ok(result.summarySentenceVi.includes('Kịch bản optimistic'), 'Must mention preset name in VN');
  assert.ok(result.summarySentenceEn.includes('Scenario optimistic'), 'Must mention preset name in EN');
});

console.log('\n================================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} check suites PASSED (100%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
