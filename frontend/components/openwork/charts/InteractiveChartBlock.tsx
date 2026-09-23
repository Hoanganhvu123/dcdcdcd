/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  AreaChart as AreaChartIcon,
  Copy,
  Check,
  TrendingUp,
  Download,
  SlidersHorizontal,
  Sparkles,
  RotateCcw,
  BookmarkPlus,
  Layers,
} from 'lucide-react';
import copy from 'copy-to-clipboard';
import {
  formatCompactNumber,
  formatPercent,
  simulateWhatIfScenario,
  WHAT_IF_PRESETS,
  type WhatIfLevers,
  type WhatIfPresetType,
  type WhatIfSimulationResult,
} from '@/lib/revenue/revenueEngine';
import { addGlobalMemory } from '@/lib/memory/globalMemoryStore';

export type ChartType = 'bar' | 'line' | 'area' | 'pie';

export interface InteractiveChartBlockProps {
  /** Chart title */
  title?: string;
  /** Primary chart type: 'bar' | 'line' | 'area' | 'pie' */
  chartType?: ChartType;
  /** Raw dataset (Array of objects, or normalized chart data) */
  data?: any[];
  /** Optional categories for multi-series */
  categories?: string[];
  /** Optional series definitions [{ name: 'Revenue', values: [1, 2, 3] }] */
  series?: Array<{ name: string; values: number[]; color?: string }>;
  /** Optional key for X Axis (defaults to first non-numeric key or 'name'/'category'/'period'/'label') */
  xAxisKey?: string;
  /** Description or takeaway text */
  description?: string;
  /** Class name overrides */
  className?: string;
  /** Hide type switcher toolbar */
  hideToolbar?: boolean;
}

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#14b8a6', // teal
];

const PIE_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#e11d48',
  '#84cc16',
];

/**
 * Clean & Format custom tooltip value
 */
const renderTooltipValue = (value: any): string => {
  if (typeof value !== 'number') return String(value);
  if (Math.abs(value) >= 1000) {
    return formatCompactNumber(value);
  }
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
};

export const InteractiveChartBlock: React.FC<InteractiveChartBlockProps> = ({
  title,
  chartType: initialType = 'bar',
  data: rawData,
  categories,
  series: rawSeries,
  xAxisKey: explicitXKey,
  description,
  className = '',
  hideToolbar = false,
}) => {
  const [activeType, setActiveType] = useState<ChartType>(() => {
    const norm = (initialType || 'bar').toLowerCase();
    if (['line', 'trend', 'timeseries'].includes(norm)) return 'line';
    if (['area', 'flow'].includes(norm)) return 'area';
    if (['pie', 'donut', 'breakdown', 'share'].includes(norm)) return 'pie';
    return 'bar';
  });

  const [copied, setCopied] = useState(false);

  // ── 1. TRANSFORM & NORMALIZE DATA ─────────────────────────────────────────
  const { chartData, seriesKeys, xKey, totalValue, avgValue, peakItem } = useMemo(() => {
    let rows: Array<Record<string, any>> = [];
    let sKeys: string[] = [];
    let xk = explicitXKey || '';

    // Case A: categories + series format
    if (Array.isArray(categories) && Array.isArray(rawSeries) && categories.length > 0) {
      xk = explicitXKey || 'category';
      sKeys = rawSeries.map((s) => s.name || 'Value');
      rows = categories.map((cat, idx) => {
        const row: Record<string, any> = { [xk]: cat };
        rawSeries.forEach((s) => {
          row[s.name || 'Value'] = s.values?.[idx] ?? 0;
        });
        return row;
      });
    }
    // Case B: Array of objects format
    else if (Array.isArray(rawData) && rawData.length > 0) {
      rows = rawData.map((item) => ({ ...item }));
      const first = rows[0] || {};
      const allKeys = Object.keys(first);

      // Find xKey
      if (!xk) {
        xk =
          allKeys.find((k) =>
            ['period', 'month', 'quarter', 'year', 'date', 'name', 'category', 'channel', 'label', 'title'].includes(
              k.toLowerCase(),
            ),
          ) ||
          allKeys.find((k) => typeof first[k] === 'string') ||
          allKeys[0] ||
          'name';
      }

      // Find series keys (numeric fields)
      sKeys = allKeys.filter(
        (k) => k !== xk && rows.some((r) => typeof r[k] === 'number' || !isNaN(Number(r[k]))),
      );

      // Coerce numeric values
      rows.forEach((r) => {
        sKeys.forEach((k) => {
          if (r[k] !== undefined) r[k] = Number(r[k]) || 0;
        });
      });
    }

    // Calculate Summary Stats
    const primaryKey = sKeys[0];
    let total = 0;
    let max = -Infinity;
    let peak = '—';

    if (primaryKey && rows.length > 0) {
      rows.forEach((r) => {
        const val = Number(r[primaryKey]) || 0;
        total += val;
        if (val > max) {
          max = val;
          peak = String(r[xk] || '—');
        }
      });
    }

    const avg = rows.length > 0 ? total / rows.length : 0;

    return {
      chartData: rows,
      seriesKeys: sKeys,
      xKey: xk,
      totalValue: total,
      avgValue: avg,
      peakItem: peak,
    };
  }, [rawData, categories, rawSeries, explicitXKey]);

  // ── 2. WHAT-IF SCENARIO REACTIVE STATE & LOGIC ─────────────────────────────
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [activePreset, setActivePreset] = useState<WhatIfPresetType>('base');
  const [levers, setLevers] = useState<Required<WhatIfLevers>>({
    discountPercent: 0,
    volumeGrowthPercent: 0,
    cacAdjustmentPercent: 0,
    spoilagePercent: 0,
  });
  const [isSavedToMemory, setIsSavedToMemory] = useState(false);
  const [isSyncedToWorkbench, setIsSyncedToWorkbench] = useState(false);

  // Dynamic Chart Data reactive to What-If sliders
  const displayedChartData = useMemo(() => {
    if (!showWhatIf || (levers.volumeGrowthPercent === 0 && levers.discountPercent === 0)) {
      return chartData;
    }
    const volFactor = 1 + levers.volumeGrowthPercent / 100;
    const discFactor = 1 - levers.discountPercent / 100;
    const combinedFactor = Math.max(0, volFactor * discFactor);

    return chartData.map((row) => {
      const newRow = { ...row };
      seriesKeys.forEach((key) => {
        const val = Number(row[key]);
        if (!isNaN(val)) {
          newRow[key] = Math.round(val * combinedFactor * 100) / 100;
        }
      });
      return newRow;
    });
  }, [chartData, showWhatIf, levers, seriesKeys]);

  // Reactive What-If Simulation Result
  const whatIfSimulation = useMemo<WhatIfSimulationResult>(() => {
    const estimatedGross = totalValue > 0 ? totalValue : 1000000;
    const baseInput = {
      grossRevenue: estimatedGross,
      discounts: estimatedGross * 0.05,
      returns: estimatedGross * 0.02,
      allowances: estimatedGross * 0.01,
      cogs: estimatedGross * 0.52,
      opex: estimatedGross * 0.18,
    };
    return simulateWhatIfScenario(baseInput, levers, activePreset);
  }, [totalValue, levers, activePreset]);

  // Preset Handlers
  const handleApplyPreset = useCallback((preset: 'optimistic' | 'base' | 'conservative') => {
    setActivePreset(preset);
    setLevers(WHAT_IF_PRESETS[preset]);
  }, []);

  const handleLeverChange = useCallback((field: keyof WhatIfLevers, val: number) => {
    setActivePreset('custom');
    setLevers((prev) => ({
      ...prev,
      [field]: val,
    }));
  }, []);

  const handleResetLevers = useCallback(() => {
    setActivePreset('base');
    setLevers(WHAT_IF_PRESETS.base);
  }, []);

  // Save scenario to Global Agent Memory
  const handleSaveToMemory = useCallback(() => {
    const scenarioTitle = `Kịch bản What-If: ${activePreset.toUpperCase()} (${title || 'Doanh Thu'})`;
    const scenarioContent = `Giả lập ${activePreset}: Sản lượng (${levers.volumeGrowthPercent >= 0 ? '+' : ''}${levers.volumeGrowthPercent}%), Chiết khấu (${levers.discountPercent}%), CAC (${levers.cacAdjustmentPercent >= 0 ? '+' : ''}${levers.cacAdjustmentPercent}%), Hao hụt (${levers.spoilagePercent}%). Doanh thu thuần: ${formatCompactNumber(whatIfSimulation.simulatedMetrics.netRevenue)}, Lợi nhuận gộp: ${formatCompactNumber(whatIfSimulation.simulatedMetrics.grossProfit)} (Biên: ${whatIfSimulation.simulatedMetrics.grossMarginPct.toFixed(1)}%).`;
    try {
      addGlobalMemory({
        type: 'assumption',
        title: scenarioTitle,
        content: scenarioContent,
        category: 'Finance',
        tags: ['what-if', 'scenario', activePreset, 'simulation'],
        isPinned: false,
        isEnabled: true,
      });
      setIsSavedToMemory(true);
      setTimeout(() => setIsSavedToMemory(false), 2500);
    } catch (err) {
      console.error('[InteractiveChartBlock] Failed to save memory:', err);
    }
  }, [activePreset, title, levers, whatIfSimulation]);

  // Sync scenario to Workbench
  const handleSyncToWorkbench = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('openwork:sync-artifact', {
            detail: {
              type: 'what-if-scenario',
              preset: activePreset,
              levers,
              metrics: whatIfSimulation.simulatedMetrics,
              deltas: whatIfSimulation.deltas,
            },
          }),
        );
      }
      setIsSyncedToWorkbench(true);
      setTimeout(() => setIsSyncedToWorkbench(false), 2500);
    } catch (err) {
      console.error('[InteractiveChartBlock] Failed to sync to workbench:', err);
    }
  }, [activePreset, levers, whatIfSimulation]);

  // Handle Copy TSV / Data
  const handleCopy = useCallback(() => {
    if (chartData.length === 0) return;
    const headers = [xKey, ...seriesKeys].join('\t');
    const content = chartData
      .map((r) => [r[xKey], ...seriesKeys.map((k) => r[k] ?? '')].join('\t'))
      .join('\n');
    const full = `${headers}\n${content}`;
    try {
      copy(full);
    } catch {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(full);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [chartData, xKey, seriesKeys]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="my-4 rounded-xl border border-dashed border-border/80 p-6 text-center text-xs font-mono text-muted-foreground bg-muted/20">
        Không có dữ liệu số để hiển thị biểu đồ
      </div>
    );
  }

  // Pie chart transformation (takes first numeric series)
  const pieData = useMemo(() => {
    const primaryKey = seriesKeys[0] || 'value';
    return displayedChartData.map((r, i) => ({
      name: String(r[xKey] || `Mục ${i + 1}`),
      value: Math.max(0, Number(r[primaryKey]) || 0),
    }));
  }, [displayedChartData, seriesKeys, xKey]);

  return (
    <div
      data-openwork-interactive-chart="true"
      className={`my-4 flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm transition-all ${className}`}
    >
      {/* ── HEADER & TOOLBAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {activeType === 'bar' && <BarChart3 size={15} />}
            {activeType === 'line' && <LineChartIcon size={15} />}
            {activeType === 'area' && <AreaChartIcon size={15} />}
            {activeType === 'pie' && <PieChartIcon size={15} />}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground leading-tight">
              {title || 'Biểu Đồ Phân Tích Doanh Thu'}
            </h4>
            {description && (
              <p className="text-[0.6875rem] text-muted-foreground leading-tight">{description}</p>
            )}
          </div>
        </div>

        {/* Toolbar Pills: Type Selector & Copy Button & What-If Button */}
        {!hideToolbar && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-border/60 bg-background/80 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveType('bar')}
                title="Biểu đồ cột (Bar)"
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  activeType === 'bar'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <BarChart3 size={13} />
              </button>
              <button
                type="button"
                onClick={() => setActiveType('line')}
                title="Biểu đồ đường (Line)"
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  activeType === 'line'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <LineChartIcon size={13} />
              </button>
              <button
                type="button"
                onClick={() => setActiveType('area')}
                title="Biểu đồ miền (Area)"
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  activeType === 'area'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <AreaChartIcon size={13} />
              </button>
              <button
                type="button"
                onClick={() => setActiveType('pie')}
                title="Biểu đồ tròn (Pie)"
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  activeType === 'pie'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <PieChartIcon size={13} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              title={copied ? 'Đã sao chép' : 'Sao chép dữ liệu TSV'}
              className="flex h-7 items-center gap-1 rounded-lg border border-border/60 bg-background/80 px-2 text-[0.6875rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              <span>{copied ? 'Đã chép' : 'Data'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowWhatIf((prev) => !prev)}
              title="Mô phỏng doanh thu tương tác What-If"
              className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[0.6875rem] font-medium transition-colors ${
                showWhatIf
                  ? 'border-primary/60 bg-primary/10 text-primary font-semibold shadow-2xs'
                  : 'border-border/60 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <SlidersHorizontal size={12} />
              <span>What-If</span>
            </button>
          </div>
        )}
      </div>

      {/* ── CHART CANVAS ── */}
      <div className="w-full px-2 py-4 h-[17.5rem]">
        <ResponsiveContainer width="100%" height="100%">
          {activeType === 'bar' ? (
            <BarChart data={displayedChartData} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border) / 0.8)' }}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => formatCompactNumber(val)}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                formatter={(val: any, name: any) => [renderTooltipValue(val), name]}
              />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '4px' }} />}
              {seriesKeys.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={key}
                  fill={PALETTE[idx % PALETTE.length]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              ))}
            </BarChart>
          ) : activeType === 'line' ? (
            <LineChart data={displayedChartData} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border) / 0.8)' }}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => formatCompactNumber(val)}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                formatter={(val: any, name: any) => [renderTooltipValue(val), name]}
              />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '4px' }} />}
              {seriesKeys.map((key, idx) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  stroke={PALETTE[idx % PALETTE.length]}
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 1.5, fill: '#fff' }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          ) : activeType === 'area' ? (
            <AreaChart data={displayedChartData} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <defs>
                {seriesKeys.map((key, idx) => {
                  const color = PALETTE[idx % PALETTE.length];
                  return (
                    <linearGradient key={`grad-${key}`} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border) / 0.8)' }}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => formatCompactNumber(val)}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                formatter={(val: any, name: any) => [renderTooltipValue(val), name]}
              />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '4px' }} />}
              {seriesKeys.map((key, idx) => {
                const color = PALETTE[idx % PALETTE.length];
                return (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key}
                    stroke={color}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill={`url(#grad-${key})`}
                  />
                );
              })}
            </AreaChart>
          ) : (
            <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                formatter={(val: any, name: any) => [renderTooltipValue(val), name]}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_PALETTE[index % PIE_PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* ── WHAT-IF SCENARIO SIMULATOR PANEL ── */}
      {showWhatIf && (
        <div className="border-t border-border/70 bg-muted/20 p-3.5 space-y-3 transition-all duration-200">
          {/* Panel Header & Presets */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-500 animate-pulse" />
              <span className="text-xs font-semibold text-foreground">Giả Lập Kịch Bản Doanh Thu (What-If)</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleApplyPreset('optimistic')}
                className={`px-2 py-0.5 rounded-md text-[0.6875rem] font-medium transition-colors ${
                  activePreset === 'optimistic'
                    ? 'bg-emerald-500 text-white shadow-2xs font-semibold'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                🌟 Lạc quan
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('base')}
                className={`px-2 py-0.5 rounded-md text-[0.6875rem] font-medium transition-colors ${
                  activePreset === 'base'
                    ? 'bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900 shadow-2xs font-semibold'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                ⚖️ Cơ sở
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('conservative')}
                className={`px-2 py-0.5 rounded-md text-[0.6875rem] font-medium transition-colors ${
                  activePreset === 'conservative'
                    ? 'bg-rose-500 text-white shadow-2xs font-semibold'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                🛡️ Thận trọng
              </button>
              <button
                type="button"
                onClick={handleResetLevers}
                title="Đặt lại về mặc định"
                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>

          {/* 4 Interactive Levers Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Lever 1: Discount % */}
            <div className="rounded-lg border border-border/50 bg-background/60 p-2.5 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[0.6875rem]">
                <span className="font-medium text-foreground">Chiết khấu & Khuyến mãi</span>
                <span className="font-mono font-semibold text-primary">{levers.discountPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={levers.discountPercent}
                onChange={(e) => handleLeverChange('discountPercent', Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[0.625rem] text-muted-foreground">
                <span>0%</span>
                <span>15%</span>
                <span>30%</span>
              </div>
            </div>

            {/* Lever 2: Volume Growth % */}
            <div className="rounded-lg border border-border/50 bg-background/60 p-2.5 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[0.6875rem]">
                <span className="font-medium text-foreground">Tăng trưởng sản lượng</span>
                <span className={`font-mono font-semibold ${levers.volumeGrowthPercent > 0 ? 'text-emerald-500' : levers.volumeGrowthPercent < 0 ? 'text-rose-500' : 'text-primary'}`}>
                  {levers.volumeGrowthPercent >= 0 ? `+${levers.volumeGrowthPercent}%` : `${levers.volumeGrowthPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min={-30}
                max={50}
                step={1}
                value={levers.volumeGrowthPercent}
                onChange={(e) => handleLeverChange('volumeGrowthPercent', Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[0.625rem] text-muted-foreground">
                <span>-30%</span>
                <span>0%</span>
                <span>+50%</span>
              </div>
            </div>

            {/* Lever 3: Marketing CAC % */}
            <div className="rounded-lg border border-border/50 bg-background/60 p-2.5 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[0.6875rem]">
                <span className="font-medium text-foreground">Chi phí Marketing / CAC</span>
                <span className={`font-mono font-semibold ${levers.cacAdjustmentPercent > 0 ? 'text-rose-500' : levers.cacAdjustmentPercent < 0 ? 'text-emerald-500' : 'text-primary'}`}>
                  {levers.cacAdjustmentPercent >= 0 ? `+${levers.cacAdjustmentPercent}%` : `${levers.cacAdjustmentPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={levers.cacAdjustmentPercent}
                onChange={(e) => handleLeverChange('cacAdjustmentPercent', Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[0.625rem] text-muted-foreground">
                <span>-40% (Tối ưu)</span>
                <span>0%</span>
                <span>+40% (Mở rộng)</span>
              </div>
            </div>

            {/* Lever 4: Spoilage / Cancellation % */}
            <div className="rounded-lg border border-border/50 bg-background/60 p-2.5 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between text-[0.6875rem]">
                <span className="font-medium text-foreground">Hao hụt & Hủy hoàn đơn</span>
                <span className={`font-mono font-semibold ${levers.spoilagePercent > 5 ? 'text-rose-500' : 'text-primary'}`}>
                  {levers.spoilagePercent}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={levers.spoilagePercent}
                onChange={(e) => handleLeverChange('spoilagePercent', Number(e.target.value))}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[0.625rem] text-muted-foreground">
                <span>0%</span>
                <span>10%</span>
                <span>20%</span>
              </div>
            </div>
          </div>

          {/* Real-time KPI Delta Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="rounded-lg border border-border/40 bg-card p-2 text-center shadow-2xs">
              <div className="text-[0.625rem] text-muted-foreground">Doanh Thu Thuần</div>
              <div className="text-xs font-bold text-foreground">{formatCompactNumber(whatIfSimulation.simulatedMetrics.netRevenue)}</div>
              <div className={`text-[0.625rem] font-medium ${whatIfSimulation.deltas.netRevenueDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {whatIfSimulation.deltas.netRevenueDelta >= 0 ? '+' : ''}{formatCompactNumber(whatIfSimulation.deltas.netRevenueDelta)} ({whatIfSimulation.deltas.netRevenueDeltaPct >= 0 ? '+' : ''}{whatIfSimulation.deltas.netRevenueDeltaPct.toFixed(1)}%)
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-card p-2 text-center shadow-2xs">
              <div className="text-[0.625rem] text-muted-foreground">Tổng Giá Vốn COGS</div>
              <div className="text-xs font-bold text-foreground">{formatCompactNumber(whatIfSimulation.simulatedMetrics.totalCogs)}</div>
              <div className={`text-[0.625rem] font-medium ${whatIfSimulation.deltas.totalCogsDelta <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                {whatIfSimulation.deltas.totalCogsDelta >= 0 ? '+' : ''}{formatCompactNumber(whatIfSimulation.deltas.totalCogsDelta)}
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-card p-2 text-center shadow-2xs">
              <div className="text-[0.625rem] text-muted-foreground">Lợi Nhuận Gộp</div>
              <div className="text-xs font-bold text-foreground">{formatCompactNumber(whatIfSimulation.simulatedMetrics.grossProfit)}</div>
              <div className={`text-[0.625rem] font-medium ${whatIfSimulation.deltas.grossProfitDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {whatIfSimulation.deltas.grossProfitDelta >= 0 ? '+' : ''}{formatCompactNumber(whatIfSimulation.deltas.grossProfitDelta)} ({whatIfSimulation.deltas.grossProfitDeltaPct >= 0 ? '+' : ''}{whatIfSimulation.deltas.grossProfitDeltaPct.toFixed(1)}%)
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-card p-2 text-center shadow-2xs">
              <div className="text-[0.625rem] text-muted-foreground">Biên Lợi Nhuận Gộp</div>
              <div className="text-xs font-bold text-foreground">{whatIfSimulation.simulatedMetrics.grossMarginPct.toFixed(1)}%</div>
              <div className={`text-[0.625rem] font-medium ${whatIfSimulation.deltas.grossMarginDeltaPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {whatIfSimulation.deltas.grossMarginDeltaPct >= 0 ? '+' : ''}{whatIfSimulation.deltas.grossMarginDeltaPct.toFixed(1)}% pts
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
            <span className="text-[0.6875rem] text-muted-foreground italic truncate max-w-xs">
              {whatIfSimulation.summarySentenceVi}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSaveToMemory}
                className={`flex h-6 items-center gap-1 rounded-md px-2 text-[0.6875rem] font-medium transition-colors ${
                  isSavedToMemory
                    ? 'bg-emerald-500 text-white'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                {isSavedToMemory ? <Check size={11} /> : <BookmarkPlus size={11} />}
                <span>{isSavedToMemory ? 'Đã lưu Memory' : 'Lưu vào Memory'}</span>
              </button>
              <button
                type="button"
                onClick={handleSyncToWorkbench}
                className={`flex h-6 items-center gap-1 rounded-md px-2 text-[0.6875rem] font-medium transition-colors ${
                  isSyncedToWorkbench
                    ? 'bg-emerald-500 text-white'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {isSyncedToWorkbench ? <Check size={11} /> : <Layers size={11} />}
                <span>{isSyncedToWorkbench ? 'Đã đồng bộ' : 'Đồng bộ Workbench'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER STATS SUMMARY ── */}
      {seriesKeys.length > 0 && totalValue > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-4 py-2 text-[0.6875rem] text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <TrendingUp size={13} className="text-primary" />
            <span>Tổng: {formatCompactNumber(totalValue)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>TB: {formatCompactNumber(avgValue)}</span>
            <span>Đỉnh: {peakItem}</span>
          </div>
        </div>
      )}
    </div>
  );
};
