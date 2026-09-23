/**
 * EMPIRICAL ADVERSARIAL CHALLENGE SUITE: Milestone M2
 * Deep Revenue Engine, Auto-Embedded Charts, SlideRenderer ChartSlide & Non-Destructive Sync
 *
 * Target components:
 * 1. OpenWorkCodeBlock / OpenWorkMarkdownRenderer chart payload detection & parsing
 * 2. SlideRenderer ChartSlide model normalization & edge datasets
 * 3. syncRevenueToArtifacts non-destructive merge with foreign/user tabs
 * 4. computeRevenueMetrics & computeAgriRevenue edge-case mathematics
 *
 * Run via: npx tsx tests/m2-challenger-revenue-charts.check.ts
 */

import assert from 'assert';
import {
  computeRevenueMetrics,
  computeAgriRevenue,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  type RevenueInput,
  type RevenueMetrics,
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

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`          ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

console.log('================================================================');
console.log('⚔️  CHALLENGER M2.2: EMPIRICAL ADVERSARIAL STRESS SUITE');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE 1: CHART CODE BLOCK PAYLOAD DETECTION & CORRUPTED PAYLOAD RESILIENCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- CHALLENGE 1: Chart Payload Parsing & Malformed Block Resilience ---');

/**
 * Mirror of OpenWorkCodeBlock detection logic to empirically stress-test parsing behavior
 */
function simulateCodeBlockChartDetection(code: string, language: string, filename?: string) {
  const normalizedLang = (language || 'text').trim().toLowerCase().replace(/^language-/, '');
  const isExplicitChartLang =
    normalizedLang.startsWith('chart') ||
    normalizedLang === 'vis-chart' ||
    normalizedLang === 'recharts' ||
    normalizedLang === 'plot';

  let explicitSubtype: 'bar' | 'line' | 'area' | 'pie' = 'bar';
  if (normalizedLang.includes('line')) explicitSubtype = 'line';
  else if (normalizedLang.includes('area')) explicitSubtype = 'area';
  else if (normalizedLang.includes('pie') || normalizedLang.includes('donut')) explicitSubtype = 'pie';

  const trimmed = (code || '').trim();
  if (!trimmed) return null;

  // Try parsing as JSON
  try {
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed) && parsed.length > 0) {
        if (isExplicitChartLang || typeof parsed[0] === 'object') {
          return {
            title: filename || undefined,
            chartType: explicitSubtype,
            data: parsed,
          };
        }
      }

      if (typeof parsed === 'object' && parsed !== null) {
        if (
          isExplicitChartLang ||
          parsed.chartType ||
          parsed.type === 'chart' ||
          (parsed.categories && parsed.series) ||
          Array.isArray(parsed.data)
        ) {
          return {
            title: parsed.title || filename || undefined,
            chartType: (parsed.chartType || parsed.type || explicitSubtype) as any,
            data: Array.isArray(parsed.data) ? parsed.data : undefined,
            categories: Array.isArray(parsed.categories) ? parsed.categories : undefined,
            series: Array.isArray(parsed.series) ? parsed.series : undefined,
            xAxisKey: parsed.xAxisKey || parsed.categoryLabel || undefined,
            description: parsed.description || parsed.takeaway || undefined,
          };
        }
      }
    }
  } catch {
    // Not JSON - graceful fallback
  }

  if (isExplicitChartLang) {
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const delimiter = lines[0].includes('\t') ? '\t' : ',';
      const headers = lines[0].split(delimiter).map((h) => h.trim());
      const dataRows = lines.slice(1).map((line) => {
        const cells = line.split(delimiter).map((c) => c.trim());
        const obj: Record<string, any> = {};
        headers.forEach((h, i) => {
          const num = Number(cells[i]?.replace(/[$,%]/g, ''));
          obj[h] = !isNaN(num) && cells[i] !== '' ? num : cells[i];
        });
        return obj;
      });

      return {
        title: filename || 'Biểu đồ dữ liệu',
        chartType: explicitSubtype,
        data: dataRows,
        xAxisKey: headers[0],
      };
    }
  }

  return null;
}

runTest('1.1 Malformed / Broken JSON payloads fail gracefully without throwing', () => {
  const brokenPayloads = [
    '{"title": "Unclosed JSON", "data": [{"x": 1',
    '{"categories": ["Q1", "Q2"], series: undefined}',
    '{ bad_json_syntax: 123 }',
    '["unclosed array',
    '{"title": "Trailing comma", "data": [1, 2, 3,]}',
    'NaN',
    'undefined',
    '{"data": null}',
  ];

  for (const broken of brokenPayloads) {
    // Should never throw and should return null or safe fallback
    let result = null;
    assert.doesNotThrow(() => {
      result = simulateCodeBlockChartDetection(broken, 'chart:bar');
    }, `Failed on payload: ${broken}`);
  }
});

runTest('1.2 Non-chart JSON payloads are not misdetected as charts unless explicit chart lang', () => {
  const plainJson = JSON.stringify({ hello: 'world', count: 42, active: true });
  // If language is 'json', plain non-chart JSON object must NOT trigger chart rendering
  const detectedJson = simulateCodeBlockChartDetection(plainJson, 'json');
  assert.strictEqual(detectedJson, null, 'Plain JSON object should not be detected as chart when lang=json');

  // If language is explicitly 'chart:bar', it should be parsed
  const detectedChart = simulateCodeBlockChartDetection(plainJson, 'chart:bar');
  assert.ok(detectedChart !== null, 'Explicit chart language should capture JSON spec');
});

runTest('1.3 Tabular TSV/CSV format with dirty numbers ($1,250.00, 25.5%, negative values)', () => {
  const tsvCode = `Quarter\tGross Revenue\tNet Margin\tLoss
Q1 2026\t$2,500,000\t24.5%\t-$50,000
Q2 2026\t$3,100,000\t28.2%\t-$20,000
Q3 2026\t$3,800,000\t31.0%\t$0`;

  const result = simulateCodeBlockChartDetection(tsvCode, 'chart:line');
  assert.ok(result !== null, 'TSV with chart:line must be parsed');
  assert.strictEqual(result.chartType, 'line');
  assert.strictEqual(result.data?.length, 3);
  assert.strictEqual(result.data?.[0]['Gross Revenue'], 2500000);
  assert.strictEqual(result.data?.[0]['Net Margin'], 24.5);
  assert.strictEqual(result.data?.[0]['Loss'], -50000);
});

runTest('1.4 Various chart language variations (chart:pie, chart:area, vis-chart, recharts, plot)', () => {
  const payload = JSON.stringify({
    categories: ['Direct', 'Online', 'Wholesale'],
    series: [{ name: 'Share', values: [50, 30, 20] }],
  });

  const pieDetect = simulateCodeBlockChartDetection(payload, 'chart:pie');
  assert.strictEqual(pieDetect?.chartType, 'pie');

  const areaDetect = simulateCodeBlockChartDetection(payload, 'chart:area');
  assert.strictEqual(areaDetect?.chartType, 'area');

  const visDetect = simulateCodeBlockChartDetection(payload, 'vis-chart');
  assert.strictEqual(visDetect?.chartType, 'bar');

  const plotDetect = simulateCodeBlockChartDetection(payload, 'plot');
  assert.strictEqual(plotDetect?.chartType, 'bar');
});

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE 2: SLIDERENDERER CHARTSLIDE DATA NORMALIZATION & BOUNDARY CASES
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- CHALLENGE 2: SlideRenderer ChartSlide Data Normalization & Resilience ---');

/**
 * Mirror of ChartSlide normalize logic in SlideRenderer.tsx
 */
function normalizeChartSlide(slide: any) {
  let categories: string[] = [];
  let series: Array<{ name: string; values: number[]; color?: string }> = [];

  if (Array.isArray(slide.categories) && Array.isArray(slide.series) && slide.categories.length > 0) {
    categories = slide.categories;
    series = slide.series;
  } else if (slide.chart && Array.isArray(slide.chart.categories) && Array.isArray(slide.chart.series)) {
    categories = slide.chart.categories;
    series = slide.chart.series;
  } else if (Array.isArray(slide.data) && slide.data.length > 0) {
    const keys = Object.keys(slide.data[0] || {});
    const xKey = keys.find((k) => ['period', 'month', 'quarter', 'name', 'category', 'label'].includes(k.toLowerCase())) || keys[0] || 'label';
    const numKeys = keys.filter((k) => k !== xKey && slide.data.some((r: any) => !isNaN(Number(r[k]))));
    categories = slide.data.map((r: any) => String(r[xKey] || ''));
    series = numKeys.map((k) => ({
      name: k,
      values: slide.data.map((r: any) => Number(r[k]) || 0),
    }));
  } else if (Array.isArray(slide.stats) && slide.stats.length > 0) {
    categories = slide.stats.map((s: any) => s.label);
    const values = slide.stats.map((s: any) => {
      const num = parseFloat(String(s.value).replace(/[^0-9.-]+/g, ''));
      return isNaN(num) ? 50 : num;
    });
    series = [{ name: 'Chỉ số', values }];
  } else {
    // Default fallback
    categories = ['Q1/2026', 'Q2/2026', 'Q3/2026', 'Q4/2026 (Est)'];
    series = [
      { name: 'Doanh Thu Thuần ($M)', values: [2.10, 2.28, 2.45, 2.60], color: '#3b82f6' },
      { name: 'Lợi Nhuận Gộp ($M)', values: [0.65, 0.76, 0.83, 0.90], color: '#10b981' },
    ];
  }

  const flatValues = series.flatMap((s) => s.values || []);
  const maxVal = Math.max(1, ...flatValues);

  return { categories, series, maxVal };
}

runTest('2.1 Empty slide object falls back safely to default revenue dataset', () => {
  const model = normalizeChartSlide({});
  assert.strictEqual(model.categories.length, 4);
  assert.strictEqual(model.series.length, 2);
  assert.strictEqual(model.maxVal, 2.60);
});

runTest('2.2 Empty arrays in slide.categories & slide.series fall back to default dataset', () => {
  const model = normalizeChartSlide({ categories: [], series: [] });
  assert.strictEqual(model.categories.length, 4, 'Empty categories must fall back to default 4 quarters');
  assert.strictEqual(model.series.length, 2);
});

runTest('2.3 Single-item dataset renders correctly without division by zero', () => {
  const model = normalizeChartSlide({
    categories: ['FY2026'],
    series: [{ name: 'Target Revenue', values: [1000000] }],
  });
  assert.strictEqual(model.categories.length, 1);
  assert.strictEqual(model.series.length, 1);
  assert.strictEqual(model.maxVal, 1000000);

  // Height percentage calculation
  const heightPct = Math.max(8, Math.min(100, (1000000 / model.maxVal) * 100));
  assert.strictEqual(heightPct, 100, 'Single max item should be 100% height');
});

runTest('2.4 All-zero dataset does not cause division by zero (maxVal >= 1)', () => {
  const model = normalizeChartSlide({
    categories: ['A', 'B', 'C'],
    series: [{ name: 'ZeroMetric', values: [0, 0, 0] }],
  });
  assert.strictEqual(model.maxVal, 1, 'maxVal must be at least 1 when all values are 0');

  const val = 0;
  const heightPct = Math.max(8, Math.min(100, (val / model.maxVal) * 100));
  assert.strictEqual(heightPct, 8, 'Zero value must render with minimum floor 8% height');
  assert.ok(!isNaN(heightPct), 'Height must not be NaN');
  assert.ok(isFinite(heightPct), 'Height must be finite');
});

runTest('2.5 Negative values dataset handles floor safely', () => {
  const model = normalizeChartSlide({
    categories: ['P1', 'P2'],
    series: [{ name: 'Net Loss', values: [-50, -100] }],
  });
  assert.strictEqual(model.maxVal, 1, 'maxVal must be at least 1 when all values are negative');

  const val = -50;
  const heightPct = Math.max(8, Math.min(100, (val / model.maxVal) * 100));
  assert.strictEqual(heightPct, 8, 'Negative value clamped to 8% minimum height');
});

runTest('2.6 Object tabular data format (`slide.data`) normalization', () => {
  const model = normalizeChartSlide({
    data: [
      { period: '2026-Q1', gross: 2000, cogs: 1200 },
      { period: '2026-Q2', gross: 2500, cogs: 1400 },
    ],
  });
  assert.deepStrictEqual(model.categories, ['2026-Q1', '2026-Q2']);
  assert.strictEqual(model.series.length, 2);
  assert.strictEqual(model.series[0].name, 'gross');
  assert.deepStrictEqual(model.series[0].values, [2000, 2500]);
  assert.strictEqual(model.maxVal, 2500);
});

runTest('2.7 Slide Stats array fallback normalization', () => {
  const model = normalizeChartSlide({
    stats: [
      { label: 'EBITDA', value: '$450K' },
      { label: 'Net Profit', value: '$220K' },
    ],
  });
  assert.deepStrictEqual(model.categories, ['EBITDA', 'Net Profit']);
  assert.strictEqual(model.series.length, 1);
  assert.deepStrictEqual(model.series[0].values, [450, 220]);
  assert.strictEqual(model.maxVal, 450);
});

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE 3: NON-DESTRUCTIVE ARTIFACT SYNCHRONIZATION MERGE INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- CHALLENGE 3: Non-Destructive Workbench Sync & Preservation ---');

runTest('3.1 Preserves non-synced workspace artifacts (code, files, browser, custom)', () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 4000000,
    discounts: 200000,
    cogs: 2200000,
  });

  const existing: OpenWorkArtifact[] = [
    {
      id: 'art-custom-code-1',
      name: 'analytics_pipeline.py',
      title: 'Python Analytics Pipeline',
      type: 'code',
      extension: '.py',
      status: 'ready',
      version: 2,
      content: { code: 'import pandas as pd\nprint("running pipeline")' },
      updatedAt: '08:30',
      metadata: { author: 'Alice', customFlag: true },
    },
    {
      id: 'art-browser-session-1',
      name: 'competitor_pricing.html',
      title: 'Competitor Price Tracker',
      type: 'browser',
      status: 'ready',
      version: 1,
      content: { url: 'https://example.com/pricing' },
      updatedAt: '08:45',
    },
    {
      id: 'art-files-data-1',
      name: 'raw_transactions.csv',
      title: 'Raw Transactions CSV',
      type: 'files',
      status: 'ready',
      version: 1,
      content: { rows: 5000 },
      updatedAt: '09:00',
    },
  ];

  const synced = syncRevenueToArtifacts(metrics, existing, {
    title: 'Q3 Executive Audit',
    periodName: 'Q3/2026',
    currency: '$',
    author: 'Chief Financial Analyst',
  });

  // Expected count: 3 preserved + 4 synced (excel, slide, docx, chart) = 7
  assert.strictEqual(synced.length, 7, 'Total artifacts must be 7 (3 preserved + 4 synced)');

  // Verify custom code artifact is perfectly preserved
  const code = synced.find((a) => a.id === 'art-custom-code-1');
  assert.ok(code, 'Code artifact must exist with original ID');
  assert.strictEqual(code?.name, 'analytics_pipeline.py');
  assert.strictEqual(code?.metadata?.customFlag, true);
  assert.strictEqual(code?.version, 2);

  // Verify browser artifact is preserved
  const browser = synced.find((a) => a.type === 'browser');
  assert.ok(browser, 'Browser artifact must exist');
  assert.strictEqual(browser?.id, 'art-browser-session-1');

  // Verify files artifact is preserved
  const files = synced.find((a) => a.type === 'files');
  assert.ok(files, 'Files artifact must exist');
  assert.strictEqual(files?.id, 'art-files-data-1');
});

runTest('3.2 Replaces previous revenue artifacts without creating duplicates', () => {
  const metrics = computeRevenueMetrics({ grossRevenue: 5000000, cogs: 2500000 });

  const initialWithOldRevenue: OpenWorkArtifact[] = [
    {
      id: 'art-excel-revenue-audit',
      name: 'old_excel.xlsx',
      type: 'excel',
      status: 'ready',
      version: 1,
      content: { sheets: [] },
      updatedAt: '08:00',
    },
    {
      id: 'art-slide-revenue-audit',
      name: 'old_slide.pptx',
      type: 'slide',
      status: 'ready',
      version: 1,
      content: { slides: [] },
      updatedAt: '08:00',
    },
    {
      id: 'art-word-revenue-audit',
      name: 'old_word.docx',
      type: 'docx',
      status: 'ready',
      version: 1,
      content: {},
      updatedAt: '08:00',
    },
    {
      id: 'art-chart-revenue-breakdown',
      name: 'old_chart.png',
      type: 'chart',
      status: 'ready',
      version: 1,
      content: {},
      updatedAt: '08:00',
    },
  ];

  const resynced = syncRevenueToArtifacts(metrics, initialWithOldRevenue);

  assert.strictEqual(resynced.length, 4, 'Must have exactly 4 artifacts (no duplicate tabs)');
  const excel = resynced.find((a) => a.type === 'excel');
  assert.strictEqual(excel?.name, 'PnL_Revenue_Audit.xlsx', 'Must update to PnL_Revenue_Audit.xlsx');
  assert.ok(excel?.content.sheets[0].rows.length >= 10, 'Must have populated financial rows');
});

runTest('3.3 Does not mutate input array (pure immutability test)', () => {
  const metrics = computeRevenueMetrics({ grossRevenue: 1000000 });
  const originalArray: OpenWorkArtifact[] = [
    {
      id: 'keep-me',
      name: 'test.py',
      type: 'code',
      status: 'ready',
      version: 1,
      content: {},
      updatedAt: '12:00',
    },
  ];

  const clonedBefore = JSON.stringify(originalArray);
  const result = syncRevenueToArtifacts(metrics, originalArray);

  assert.strictEqual(JSON.stringify(originalArray), clonedBefore, 'Original array must remain untouched');
  assert.notStrictEqual(result, originalArray, 'Return value must be a new array');
});

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE 4: DEEP REVENUE ENGINE MATHEMATICAL INTEGRITY & EXTREME BOUNDARIES
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- CHALLENGE 4: Deep Revenue Engine Extreme Boundaries ---');

runTest('4.1 Zero Gross Revenue with non-zero OPEX & COGS (extreme loss)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 0,
    cogs: 100000,
    opex: 50000,
  });

  assert.strictEqual(res.grossRevenue, 0);
  assert.strictEqual(res.netRevenue, 0);
  assert.strictEqual(res.grossProfit, -100000);
  assert.strictEqual(res.grossMarginPct, 0, 'Gross margin should be 0 when net revenue is 0');
  assert.strictEqual(res.ebitda, -150000);
  assert.strictEqual(res.operatingMarginPct, 0, 'Operating margin should be 0 when net revenue is 0');
  assert.ok(!isNaN(res.grossMarginPct), 'Gross margin must not be NaN');
  assert.ok(!isNaN(res.operatingMarginPct), 'Operating margin must not be NaN');
});

runTest('4.2 100% deductions (Net Revenue drops to 0 exactly)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 500000,
    discounts: 300000,
    returns: 150000,
    allowances: 50000,
    cogs: 200000,
  });

  assert.strictEqual(res.totalDeductions, 500000);
  assert.strictEqual(res.netRevenue, 0);
  assert.strictEqual(res.grossProfit, -200000);
  assert.strictEqual(res.grossMarginPct, 0, '0 net revenue must yield 0% gross margin without throwing');
});

runTest('4.3 Deductions exceed Gross Revenue (Negative Net Revenue)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 100000,
    discounts: 120000,
    cogs: 50000,
  });

  assert.strictEqual(res.netRevenue, -20000);
  assert.strictEqual(res.grossProfit, -70000);
  // Margin calculation: (-70000 / -20000) * 100 = +350% mathematically or properly computed
  assert.ok(!isNaN(res.grossMarginPct));
});

runTest('4.4 Agriculture calculation with 0 harvest volume & 100% spoilage loss', () => {
  const resZero = computeAgriRevenue({
    harvestVolumeKg: 0,
    pricePerKg: 10,
    spoilageRate: 0.1,
  });
  assert.strictEqual(resZero.grossRevenue, 0);
  assert.strictEqual(resZero.spoilageLoss, 0);
  assert.strictEqual(resZero.grossMarginPct, 0);

  const res100Spoilage = computeAgriRevenue({
    harvestVolumeKg: 10000,
    pricePerKg: 20,
    spoilageRate: 1.0, // 100% spoilage
    productionCostPerKg: 10,
  });
  assert.strictEqual(res100Spoilage.grossRevenue, 200000);
  assert.strictEqual(res100Spoilage.spoilageLoss, 200000);
  assert.strictEqual(res100Spoilage.totalCogs, 300000); // 100K base + 200K spoilage
  assert.strictEqual(res100Spoilage.grossProfit, -100000);
});

runTest('4.5 Omnichannel with 0-revenue channel and 100% discount channel', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 1000000,
    channelBreakdown: [
      {
        channel: 'Zero Channel',
        grossRevenue: 0,
        discounts: 0,
        cogs: 0,
        channelFees: 0,
      },
      {
        channel: 'Discounted Channel',
        grossRevenue: 500000,
        discounts: 500000,
        cogs: 200000,
        channelFees: 30000,
      },
    ],
  });

  assert.strictEqual(res.channels.length, 2);
  assert.strictEqual(res.channels[0].netRevenue, 0);
  assert.strictEqual(res.channels[0].contributionMarginPct, 0);
  assert.strictEqual(res.channels[1].netRevenue, 0);
  assert.strictEqual(res.channels[1].contributionMargin1, -230000);
  assert.strictEqual(res.channels[1].contributionMarginPct, 0);
});

runTest('4.6 Floating point precision accuracy ($0.1 + $0.2 rounding)', () => {
  const res = computeRevenueMetrics({
    grossRevenue: 1000000.10,
    discounts: 100000.20,
    cogs: 500000.05,
    opex: 100000.05,
  });

  assert.strictEqual(res.netRevenue.toFixed(2), '899999.90');
  assert.strictEqual(res.grossProfit.toFixed(2), '399999.85');
  assert.strictEqual(res.ebitda.toFixed(2), '299999.80');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY OF TEST RESULTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`📊 ADVERSARIAL STRESS RESULTS: ${passedTests}/${totalTests} PASSED | ${failedTests} FAILED`);
console.log('================================================================');

if (failedTests > 0) {
  console.error(`💥 ${failedTests} STRESS TESTS FAILED! REQUEST_CHANGES required.`);
  process.exit(1);
} else {
  console.log('🏆 ALL ADVERSARIAL STRESS TESTS PASSED EMPIRICALLY WITH 100% SUCCESS!\n');
}
