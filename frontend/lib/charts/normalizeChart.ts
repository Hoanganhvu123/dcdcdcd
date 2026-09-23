/**
 * Chart data normalizer.
 *
 * A "chart" artifact never carries its own series: the numbers live in whatever
 * the tool actually returned. sql_query lands as `{sheets:[{rows:[header,...]}]}`,
 * raw driver output as `{columns,rows}`, a python_interpreter dump as an array of
 * objects, and any of them can arrive as a JSON string. One reader for all of it,
 * so the viewer never has to guess.
 */

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartModel {
  title: string;
  /** Header of the column used for the x axis. */
  categoryLabel: string;
  categories: string[];
  series: ChartSeries[];
}

type Cell = string | number | null | undefined;
type Grid = Cell[][];

/** Locale-tolerant number read: "1,234.5", "33.9%", "$2.1M" all count as numeric. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().replace(/[\s,$%]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const parseMaybeJson = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/** Reduce any supported payload to a header row plus body rows. */
function toGrid(payload: any): Grid | null {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    if (payload.length === 0) return null;
    // Array of arrays: first row is the header.
    if (Array.isArray(payload[0])) return payload as Grid;
    // Array of objects: keys are the header.
    if (typeof payload[0] === 'object' && payload[0] !== null) {
      const keys = Object.keys(payload[0]);
      if (keys.length === 0) return null;
      return [keys, ...payload.map((r: any) => keys.map((k) => r?.[k]))];
    }
    return null;
  }

  if (typeof payload !== 'object') return null;

  // sql_query / spreadsheet_studio: rows already include the header row.
  const sheetRows = payload.sheets?.[0]?.rows;
  if (Array.isArray(sheetRows) && sheetRows.length > 1) return sheetRows as Grid;

  // Raw driver output: header lives beside the body.
  if (Array.isArray(payload.columns) && Array.isArray(payload.rows)) {
    return [payload.columns, ...payload.rows] as Grid;
  }

  // One more envelope layer (`{data:…}`, `{result:…}`, `{content:…}`).
  for (const key of ['data', 'result', 'output', 'content']) {
    if (key in payload) {
      const inner = toGrid(parseMaybeJson(payload[key]) ?? payload[key]);
      if (inner) return inner;
    }
  }
  return null;
}

const titleOf = (artifact: any): string =>
  artifact?.content?.title || artifact?.title || artifact?.name || 'Biểu đồ';

/**
 * @returns a chartable model, or null when the artifact carries nothing numeric.
 *          Null is the honest answer — the viewer renders an empty state rather
 *          than inventing numbers.
 */
export function normalizeChart(artifact: any): ChartModel | null {
  const grid = toGrid(parseMaybeJson(artifact?.content) ?? artifact?.content) ?? toGrid(artifact);
  if (!grid || grid.length < 2) return null;

  const header = (grid[0] || []).map((h, i) => (h == null || h === '' ? `col_${i + 1}` : String(h)));
  const body = grid.slice(1).filter((r) => Array.isArray(r) && r.length > 0);
  if (body.length === 0) return null;

  // A column is numeric when most of its cells parse as numbers — one stray
  // 'N/A' in a revenue column must not disqualify the whole series.
  const numeric: boolean[] = header.map((_, c) => {
    const parsed = body.map((r) => toNumber(r[c]));
    return parsed.filter((n) => n !== null).length > body.length / 2;
  });

  // Prefer a text column for the x axis. When every column parses as a number
  // the first one is still the label in practice (`store, sales`; `year, rev`) —
  // charting an ID against itself is never what was meant.
  const textIdx = numeric.findIndex((n) => !n);
  const catIdx = textIdx >= 0 ? textIdx : header.length > 1 ? 0 : -1;
  const seriesIdx = header.map((_, i) => i).filter((i) => numeric[i] && i !== catIdx);
  if (seriesIdx.length === 0) return null;

  const categories = body.map((r, i) => {
    const v = catIdx >= 0 ? r[catIdx] : null;
    return v == null || v === '' ? `#${i + 1}` : String(v);
  });

  return {
    title: titleOf(artifact),
    categoryLabel: catIdx >= 0 ? header[catIdx] : 'Hàng',
    categories,
    // Cap at four series: past that a grouped bar chart is unreadable anyway.
    // ponytail: fixed cap, no series picker. Upgrade = let the user choose.
    series: seriesIdx.slice(0, 4).map((c) => ({
      name: header[c],
      values: body.map((r) => toNumber(r[c]) ?? 0),
    })),
  };
}
