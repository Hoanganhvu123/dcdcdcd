/**
 * Chart geometry.
 *
 * Turns a ChartModel into pixel coordinates plus the derived text the viewer
 * shows beside it (axis labels, footer stats, an equivalent matplotlib script).
 * Kept out of the component so it is assertable without a DOM.
 */
import type { ChartModel } from './normalizeChart';

export interface Bar {
  categoryIndex: number;
  seriesIndex: number;
  category: string;
  series: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartGeometry {
  width: number;
  height: number;
  plot: { x: number; y: number; width: number; height: number };
  max: number;
  bars: Bar[];
  gridlines: { y: number; value: number; label: string }[];
  ticks: { x: number; label: string }[];
  stats: { label: string; value: string }[];
}

const WIDTH = 700;
const HEIGHT = 320;
const PAD = { left: 76, right: 12, top: 16, bottom: 44 };
const TICK_COUNT = 4;

/** 1.2M / 340K / 1.234 — short enough for an axis, exact enough to trust. */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Round the axis top up to 1/2/5 x 10^k so the gridlines land on readable
 * numbers instead of `301397792`.
 */
export function niceMax(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function buildChartGeometry(model: ChartModel): ChartGeometry {
  const plot = {
    x: PAD.left,
    y: PAD.top,
    width: WIDTH - PAD.left - PAD.right,
    height: HEIGHT - PAD.top - PAD.bottom,
  };

  const flat = model.series.flatMap((s) => s.values);
  // Negative values would render below the baseline; this chart is a
  // zero-based bar chart, so the axis only ever grows upward.
  // ponytail: no negative axis. Upgrade = signed baseline at y(0).
  const max = niceMax(Math.max(0, ...flat));

  const slot = plot.width / Math.max(1, model.categories.length);
  const inner = slot * 0.72;
  const barWidth = Math.max(2, inner / Math.max(1, model.series.length));
  const yOf = (v: number) => plot.y + plot.height - (Math.max(0, v) / max) * plot.height;

  const bars: Bar[] = [];
  model.categories.forEach((category, c) => {
    const groupLeft = plot.x + slot * c + (slot - inner) / 2;
    model.series.forEach((s, si) => {
      const value = s.values[c] ?? 0;
      const y = yOf(value);
      bars.push({
        categoryIndex: c,
        seriesIndex: si,
        category,
        series: s.name,
        value,
        x: groupLeft + barWidth * si,
        y,
        height: Math.max(0, plot.y + plot.height - y),
        width: Math.max(1, barWidth - 2),
      });
    });
  });

  const gridlines = Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const value = (max / TICK_COUNT) * i;
    return { y: yOf(value), value, label: formatCompact(value) };
  });

  // Past ~12 categories the labels collide; thin them rather than overlap.
  const every = Math.ceil(model.categories.length / 12);
  const ticks = model.categories
    .map((label, i) => ({ x: plot.x + slot * i + slot / 2, label, i }))
    .filter((t) => t.i % every === 0)
    .map(({ x, label }) => ({ x, label }));

  const primary = model.series[0];
  const total = primary.values.reduce((a, b) => a + b, 0);
  const peakIdx = primary.values.indexOf(Math.max(...primary.values));
  const stats = [
    { label: `Tổng ${primary.name}`, value: formatCompact(total) },
    { label: 'Trung bình', value: formatCompact(total / Math.max(1, primary.values.length)) },
    { label: `Cao nhất (${model.categoryLabel})`, value: `${model.categories[peakIdx] ?? '—'}` },
  ];

  return { width: WIDTH, height: HEIGHT, plot, max, bars, gridlines, ticks, stats };
}

/** Tab-separated, so a paste into Excel or Sheets lands in cells. */
export function toTsv(model: ChartModel): string {
  const head = [model.categoryLabel, ...model.series.map((s) => s.name)].join('\t');
  const rows = model.categories.map((c, i) =>
    [c, ...model.series.map((s) => s.values[i] ?? 0)].join('\t'),
  );
  return [head, ...rows].join('\n');
}

const py = (v: unknown) => JSON.stringify(v);

/** The same chart, reproducible outside the app. Built from the real values. */
export function toPythonScript(model: ChartModel): string {
  const lines = [
    'import matplotlib.pyplot as plt',
    'import numpy as np',
    '',
    `categories = ${py(model.categories)}`,
    'series = {',
    ...model.series.map((s) => `    ${py(s.name)}: ${py(s.values)},`),
    '}',
    '',
    'x = np.arange(len(categories))',
    'width = 0.8 / len(series)',
    '',
    'fig, ax = plt.subplots(figsize=(10, 4.5))',
    'for i, (name, values) in enumerate(series.items()):',
    '    ax.bar(x + i * width, values, width, label=name)',
    '',
    `ax.set_title(${py(model.title)})`,
    `ax.set_xlabel(${py(model.categoryLabel)})`,
    'ax.set_xticks(x + (len(series) - 1) * width / 2)',
    'ax.set_xticklabels(categories, rotation=45, ha="right")',
    'ax.legend()',
    'ax.spines[["top", "right"]].set_visible(False)',
    'fig.tight_layout()',
    'plt.show()',
  ];
  return lines.join('\n');
}
