/**
 * Runnable check for the chart geometry.
 *   node lib/charts/chartGeometry.check.ts        (from frontend/)
 *
 * The viewer used to hardcode `maxVal = 3000000`, a fixed y axis and a fixed
 * trend polyline. These assertions are what stop it drifting back: every
 * coordinate must fall out of the real values.
 */
import assert from 'node:assert/strict';
import { normalizeChart } from './normalizeChart.ts';
import { buildChartGeometry, formatCompact, niceMax, toPythonScript, toTsv } from './chartGeometry.ts';

// --- formatCompact ---------------------------------------------------------
assert.equal(formatCompact(0), '0');
assert.equal(formatCompact(950), '950');
assert.equal(formatCompact(1500), '1.5K');
assert.equal(formatCompact(45000), '45K', 'past 10K the decimal is noise');
assert.equal(formatCompact(2_100_000), '2.1M');
assert.equal(formatCompact(301_397_792), '301M');
assert.equal(formatCompact(-1500), '-1.5K', 'sign survives');

// --- niceMax: gridlines must land on readable numbers ----------------------
assert.equal(niceMax(0), 1, 'an all-zero series still needs a scale');
assert.equal(niceMax(301_397_792), 500_000_000);
assert.equal(niceMax(1), 1);
assert.equal(niceMax(1.4), 2);
assert.equal(niceMax(23), 50);
assert.ok(niceMax(9.9e9) >= 9.9e9, 'the axis top never clips the data');

// --- geometry from the real Walmart payload --------------------------------
const model = normalizeChart({
  title: 'SQL Query Result: Walmart',
  content: {
    sheets: [{
      name: 'Query_Result',
      rows: [['store', 'sales'], ['20', 301397792], ['4', 299543953], ['14', 288999911]],
    }],
  },
})!;
assert.ok(model, 'fixture must normalize');

const geo = buildChartGeometry(model);
assert.equal(geo.bars.length, 3, 'one bar per row, one series');
assert.equal(geo.max, 500_000_000, 'scale comes from the data, not a constant');

// Bars grow downward from the axis top; the tallest value owns the tallest bar.
const heights = geo.bars.map((b) => b.height);
assert.ok(heights[0] > heights[1] && heights[1] > heights[2], 'bar height tracks value order');
for (const b of geo.bars) {
  assert.ok(b.y >= geo.plot.y - 0.001, `bar ${b.category} escapes the top of the plot`);
  assert.ok(
    b.y + b.height <= geo.plot.y + geo.plot.height + 0.001,
    `bar ${b.category} escapes the baseline`,
  );
  assert.ok(b.width > 0 && b.height >= 0);
}

// Every category gets a tick while the count is small.
assert.deepEqual(geo.ticks.map((t) => t.label), ['20', '4', '14']);
assert.equal(geo.gridlines.length, 5, '4 intervals means 5 lines');
assert.equal(geo.gridlines[0].value, 0, 'the axis is zero-based');
assert.equal(geo.gridlines[4].value, geo.max);

// Footer stats are computed, not written down.
assert.equal(geo.stats.length, 3);
assert.equal(geo.stats[0].value, formatCompact(301397792 + 299543953 + 288999911));
assert.equal(geo.stats[2].value, '20', 'peak row is the real argmax');

// --- many categories: labels thin out instead of overlapping ---------------
const wide = normalizeChart({
  content: {
    columns: ['d', 'v'],
    rows: Array.from({ length: 30 }, (_, i) => [`d${i}`, i + 1]),
  },
})!;
const wideGeo = buildChartGeometry(wide);
assert.equal(wideGeo.bars.length, 30, 'every row still draws');
assert.ok(wideGeo.ticks.length <= 12, `30 categories must not print 30 labels (got ${wideGeo.ticks.length})`);

// --- multi-series bars share a slot without overlapping --------------------
const two = normalizeChart({ content: { columns: ['q', 'a', 'b'], rows: [['Q1', 1, 2], ['Q2', 3, 4]] } })!;
const twoGeo = buildChartGeometry(two);
assert.equal(twoGeo.bars.length, 4);
const [a0, b0] = twoGeo.bars;
assert.ok(a0.x + a0.width <= b0.x + 0.001, 'grouped bars must not overlap');

// --- exports carry the real numbers ---------------------------------------
const tsv = toTsv(model);
assert.equal(tsv.split('\n')[0], 'store\tsales');
assert.ok(tsv.includes('20\t301397792'), 'TSV holds exact values, not the compact form');

const script = toPythonScript(model);
assert.ok(script.includes('301397792'), 'python script plots the real values');
assert.ok(script.includes('"store"') || script.includes("'store'"), 'axis label carried through');
assert.ok(!script.includes('Q1/2026'), 'no trace of the old hardcoded quarters');

console.log('chartGeometry.check OK - axis, bars and stats all derived from the data');
