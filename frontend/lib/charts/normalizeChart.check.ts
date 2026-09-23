/**
 * Runnable check for the chart normalizer.
 *   node lib/charts/normalizeChart.check.ts        (from frontend/)
 *
 * The viewer used to hardcode a 2026 PnL series; these assertions are what stop
 * it drifting back — every shape the tool layer actually emits must produce real
 * numbers, and an artifact with nothing numeric must produce null, not filler.
 */
import assert from 'node:assert/strict';
import { normalizeChart, toNumber } from './normalizeChart.ts';

// --- toNumber: the formats a SQL driver / agent actually hands back ----------
assert.equal(toNumber(42), 42);
assert.equal(toNumber('1,234.5'), 1234.5);
assert.equal(toNumber('33.9%'), 33.9);
assert.equal(toNumber('$2100000'), 2100000);
assert.equal(toNumber('N/A'), null);
assert.equal(toNumber(''), null);
assert.equal(toNumber(NaN), null, 'NaN is not a value');
assert.equal(toNumber(Infinity), null, 'Infinity would blow up the axis scale');

// --- the real sql_query shape: content.sheets[0].rows = [header, ...rows] ----
const sql = normalizeChart({
  title: 'SQL Query Result: Walmart',
  content: { sheets: [{ name: 'Query_Result', rows: [['store', 'sales'], ['20', 301397792], ['4', 299543953]] }] },
});
assert.ok(sql, 'sql_query payload must chart');
assert.equal(sql.categoryLabel, 'store');
assert.deepEqual(sql.categories, ['20', '4']);
assert.equal(sql.series.length, 1);
assert.deepEqual(sql.series[0], { name: 'sales', values: [301397792, 299543953] });

// --- the other shapes ------------------------------------------------------
const raw = normalizeChart({ content: { columns: ['q', 'rev'], rows: [['Q1', 10], ['Q2', 20]] } });
assert.deepEqual(raw?.series[0].values, [10, 20], 'columns/rows shape');

const objs = normalizeChart({ content: [{ q: 'Q1', rev: 10 }, { q: 'Q2', rev: 20 }] });
assert.deepEqual(objs?.categories, ['Q1', 'Q2'], 'array of objects');

const str = normalizeChart({ content: '{"columns":["q","rev"],"rows":[["Q1",10]]}' });
assert.deepEqual(str?.series[0].values, [10], 'JSON string content');

const nested = normalizeChart({ content: { data: { columns: ['q', 'rev'], rows: [['Q1', 7]] } } });
assert.deepEqual(nested?.series[0].values, [7], 'one envelope layer deep');

// --- refusals: null beats invented data ------------------------------------
assert.equal(normalizeChart(null), null);
assert.equal(normalizeChart({ content: 'not json' }), null);
assert.equal(normalizeChart({ content: { sheets: [{ rows: [['a', 'b']] }] } }), null, 'header only');
assert.equal(normalizeChart({ content: { columns: ['name', 'city'], rows: [['a', 'b'], ['c', 'd']] } }), null,
  'no numeric column means nothing to plot');

// --- tolerance: one bad cell must not kill a column -------------------------
const gappy = normalizeChart({ content: { columns: ['q', 'rev'], rows: [['Q1', 10], ['Q2', 'N/A'], ['Q3', 30]] } });
assert.deepEqual(gappy?.series[0].values, [10, 0, 30], 'majority-numeric column survives; gap reads 0');

// --- an all-numeric grid still needs a sane x axis --------------------------
// `year, rev` and `store, sales` are numeric on both sides; the first column is
// the label, not a series. Charting an ID against itself is never the intent.
const idCol = normalizeChart({ content: { columns: ['year', 'rev'], rows: [[2024, 10], [2025, 20]] } });
assert.deepEqual(idCol?.categories, ['2024', '2025'], 'first column becomes the axis');
assert.deepEqual(idCol?.series.map((s) => s.name), ['rev'], 'and is not also plotted');

// A single numeric column has no label column to give up, so it keeps ordinals.
const lone = normalizeChart({ content: { columns: ['rev'], rows: [[10], [20]] } });
assert.deepEqual(lone?.categories, ['#1', '#2']);
assert.deepEqual(lone?.series.map((s) => s.name), ['rev']);

// --- series cap ------------------------------------------------------------
const wide = normalizeChart({
  content: { columns: ['q', 'a', 'b', 'c', 'd', 'e'], rows: [['Q1', 1, 2, 3, 4, 5], ['Q2', 1, 2, 3, 4, 5]] },
});
assert.deepEqual(wide?.series.map((s) => s.name), ['a', 'b', 'c', 'd'],
  'grouped bars stay readable: cap at 4 series');

console.log('normalizeChart.check OK - real payloads chart, empty ones refuse');
