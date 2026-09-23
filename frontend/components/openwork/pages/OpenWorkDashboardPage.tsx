import React, { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Database, MessageSquare, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkDashboardPageProps {
  onAskData?: (query?: string) => void;
  onSelectDatasource?: () => void;
}

interface ProductItem {
  id: string;
  name: string;
  rev: number;
  growth: number;
  margin: number;
}

const MONTHS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
const Y25 = [6.1, 5.8, 7.2, 7.9, 8.4, 8.0, 9.1, 9.6, 10.4, 9.8, 10.9, 11.6];
const Y24 = [5.2, 5.0, 6.1, 6.4, 7.0, 6.8, 7.4, 7.9, 8.2, 8.4, 9.0, 9.4];

const PRODUCTS: ProductItem[] = [
  { id: '1', name: 'Điện tử tiêu dùng', rev: 8.42, growth: 12.4, margin: 22.1 },
  { id: '2', name: 'Gia dụng', rev: 6.18, growth: 4.8, margin: 28.7 },
  { id: '3', name: 'Thời trang', rev: 4.96, growth: -6.2, margin: 34.2 },
  { id: '4', name: 'Mỹ phẩm', rev: 3.41, growth: 18.9, margin: 41.5 },
  { id: '5', name: 'Thực phẩm khô', rev: 2.28, growth: 2.1, margin: 19.4 },
  { id: '6', name: 'Đồ chơi', rev: 1.14, growth: -1.8, margin: 26.0 },
  { id: '7', name: 'Sách và văn phòng phẩm', rev: 0.87, growth: 7.3, margin: 31.8 },
];

function generateSparklinePoints(vals: number[]): string {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  return vals
    .map((v, i) => {
      const x = (i * (120 / (vals.length - 1))).toFixed(1);
      const y = (26 - ((v - min) / range) * 24).toFixed(1);
      return `${x},${y}`;
    })
    .join(' ');
}

export const OpenWorkDashboardPage: React.FC<OpenWorkDashboardPageProps> = ({
  onAskData,
  onSelectDatasource,
}) => {
  const [selectedRange, setSelectedRange] = useState<string>('12 tháng');
  const [sortKey, setSortKey] = useState<keyof ProductItem>('rev');
  const [sortDir, setSortDir] = useState<number>(-1);
  const [filterText, setFilterText] = useState<string>('');
  const [lastUpdated] = useState<string>('09:41');

  const ranges = ['7 ngày', '30 ngày', 'Quý này', '12 tháng'];

  const kpis = [
    {
      label: 'Doanh thu 12 tháng',
      value: '104,8 tỷ',
      delta: '+12,4%',
      tone: 'var(--ok)',
      line: 'var(--c1)',
      spark: generateSparklinePoints(Y25),
      positive: true,
    },
    {
      label: 'Biên đóng góp',
      value: '26,8%',
      delta: '−4,6đ',
      tone: 'var(--err)',
      line: 'var(--c5)',
      spark: generateSparklinePoints([31.4, 31.0, 30.2, 29.4, 28.6, 27.9, 27.2, 26.8]),
      positive: false,
    },
    {
      label: 'Đơn hoàn tất',
      value: '184.502',
      delta: '+8,1%',
      tone: 'var(--ok)',
      line: 'var(--c2)',
      spark: generateSparklinePoints([12, 13, 12.4, 14, 15.2, 14.8, 16.1, 17.4]),
      positive: true,
    },
    {
      label: 'Giá trị đơn trung bình',
      value: '568.200 đ',
      delta: '+3,9%',
      tone: 'var(--ok)',
      line: 'var(--c3)',
      spark: generateSparklinePoints([520, 528, 534, 530, 545, 552, 560, 568]),
      positive: true,
    },
  ];

  const channelParts = [
    { label: 'Marketplace', v: 43.6, c: 'var(--c1)' },
    { label: 'Website', v: 23.3, c: 'var(--c2)' },
    { label: 'B2B', v: 18.5, c: 'var(--c3)' },
    { label: 'Đại lý', v: 7.5, c: 'var(--c4)' },
    { label: 'Cửa hàng', v: 7.1, c: 'var(--c5)' },
  ];

  const circumference = 2 * Math.PI * 44;
  let accumulatedOffset = 0;
  const donutSegments = channelParts.map((p) => {
    const len = (circumference * p.v) / 100;
    const seg = {
      color: p.c,
      dash: `${len.toFixed(1)} ${(circumference - len).toFixed(1)}`,
      offset: (-accumulatedOffset).toFixed(1),
    };
    accumulatedOffset += len;
    return seg;
  });

  const scatterPoints = [
    [62, 96, 4, 'var(--c2)'],
    [88, 88, 3, 'var(--c2)'],
    [104, 72, 5, 'var(--c3)'],
    [126, 84, 3, 'var(--c2)'],
    [142, 60, 6, 'var(--c3)'],
    [158, 100, 3, 'var(--c5)'],
    [176, 54, 4, 'var(--c3)'],
    [190, 78, 3, 'var(--c2)'],
    [204, 44, 5, 'var(--c3)'],
    [216, 92, 3, 'var(--c5)'],
    [232, 66, 4, 'var(--c2)'],
    [246, 38, 6, 'var(--c1)'],
    [258, 82, 3, 'var(--c5)'],
    [268, 58, 4, 'var(--c2)'],
    [278, 30, 5, 'var(--c1)'],
    [288, 70, 3, 'var(--c2)'],
    [296, 48, 4, 'var(--c1)'],
    [304, 96, 3, 'var(--c5)'],
  ];

  const funnelStages = [
    { label: 'Lượt xem', value: '5,42 tr', pct: '100%', color: 'var(--c2)' },
    { label: 'Xem sản phẩm', value: '1,88 tr', pct: '35%', color: 'var(--c2)' },
    { label: 'Thêm giỏ', value: '612 ng', pct: '18%', color: 'var(--c3)' },
    { label: 'Thanh toán', value: '241 ng', pct: '9%', color: 'var(--c1)' },
    { label: 'Hoàn tất', value: '184 ng', pct: '5%', color: 'var(--c1)' },
  ];

  const days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const hours = ['0h', '2h', '4h', '6h', '8h', '10h', '12h', '14h', '16h', '18h', '20h', '22h'];

  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter((p) =>
      p.name.toLowerCase().includes(filterText.toLowerCase())
    ).sort((a, b) => {
      if (sortKey === 'name') {
        return a.name.localeCompare(b.name) * sortDir;
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * sortDir;
    });
  }, [filterText, sortKey, sortDir]);

  const handleSort = (key: keyof ProductItem) => {
    if (sortKey === key) {
      setSortDir((prev) => -prev);
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="sticky top-0 z-10 min-h-[44px] flex-none flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 border-b border-[var(--border)]/60 bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Dashboard doanh thu
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap">
            cập nhật {lastUpdated}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Range Selector */}
          <div className="flex items-center gap-0.5 border border-[var(--border)] rounded-lg p-0.5 bg-[var(--card)]">
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRange(r)}
                className={cn(
                  'h-5.5 px-2 rounded-md text-[0.71875rem] transition-colors whitespace-nowrap',
                  selectedRange === r
                    ? 'bg-[var(--primary)] text-[var(--primary-fg)] font-medium shadow-xs'
                    : 'text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)]'
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onSelectDatasource}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-lg text-[0.71875rem] whitespace-nowrap transition-colors"
          >
            <Database size={12} className="text-[var(--accent)]" />
            <span>PostgreSQL · 14 bảng</span>
          </button>

          <button
            type="button"
            onClick={() => onAskData?.('Phân tích doanh thu và cơ cấu sản phẩm tổng hợp')}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:bg-[var(--muted)] rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-colors group"
          >
            <MessageSquare size={12} className="text-[var(--accent)] group-hover:scale-110 transition-transform" />
            <span>Hỏi về dữ liệu này</span>
          </button>
        </div>
      </header>

      {/* ── 2. Scrollable Canvas Content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--panel)] p-3.5 custom-scrollbar">
        <div className="max-w-[1320px] mx-auto flex flex-col gap-3">
          {/* ── Row 1: KPI Sparkline Grid (4 Cards) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map((k, idx) => (
              <div
                key={idx}
                className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 shadow-[var(--shadow)] flex flex-col justify-between hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className="text-[0.71875rem] text-[var(--muted-fg)] truncate">{k.label}</div>
                <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                  <div className="font-mono text-[1.375rem] font-medium tracking-tight tabular-nums text-[var(--fg)]">
                    {k.value}
                  </div>
                  <div
                    style={{ color: k.tone }}
                    className="font-mono text-[0.71875rem] font-medium flex items-center gap-0.5"
                  >
                    {k.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {k.delta}
                  </div>
                </div>
                <div className="mt-2 w-full h-7">
                  <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="w-full h-full block">
                    <polyline
                      fill="none"
                      stroke={k.line}
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={k.spark}
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {/* ── Row 2: Monthly Revenue Dual-Bar + Channel Donut ── */}
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Monthly Bar Chart */}
            <div className="flex-[3] border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--hair)]">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Doanh thu theo tháng</span>
                <div className="flex items-center gap-3 text-[0.65625rem] text-[var(--muted-fg)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-[2px] bg-[var(--c1)]" /> 2025
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-[2px] bg-[var(--border)]" /> 2024
                  </span>
                </div>
              </div>

              <div className="p-3.5 pt-2">
                <svg viewBox="0 0 640 200" className="w-full h-auto block">
                  <g stroke="var(--hair)" strokeWidth="1">
                    <line x1="30" y1="16" x2="630" y2="16" />
                    <line x1="30" y1="60" x2="630" y2="60" />
                    <line x1="30" y1="104" x2="630" y2="104" />
                    <line x1="30" y1="148" x2="630" y2="148" />
                    <line x1="30" y1="170" x2="630" y2="170" />
                  </g>

                  {MONTHS.map((m, i) => {
                    const h1 = Y25[i] * 12.8;
                    const h0 = Y24[i] * 12.8;
                    const x = 40 + i * 49;
                    return (
                      <g key={m}>
                        <rect x={x} y={170 - h0} width="14" height={h0} rx="2" fill="var(--border)" />
                        <rect
                          x={x + 16}
                          y={170 - h1}
                          width="14"
                          height={h1}
                          rx="2"
                          fill="var(--c1)"
                          style={{
                            animation: 'ow-grow 0.5s ease both',
                            transformOrigin: '0 170px',
                          }}
                        />
                        <text
                          x={x + 15}
                          y="188"
                          fill="var(--muted-fg)"
                          fontFamily="Geist Mono, monospace"
                          textAnchor="middle"
                          className="text-[0.625rem] font-mono fill-[var(--muted-fg)]"
                        >
                          {m}
                        </text>
                      </g>
                    );
                  })}

                  <g fill="var(--muted-fg)" fontFamily="Geist Mono, monospace" textAnchor="end" className="text-[0.625rem] font-mono fill-[var(--muted-fg)]">
                    <text x="24" y="19">12</text>
                    <text x="24" y="63">9</text>
                    <text x="24" y="107">6</text>
                    <text x="24" y="151">3</text>
                  </g>
                </svg>
              </div>
            </div>

            {/* Channel Donut */}
            <div className="flex-[1] min-w-[264px] border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden flex flex-col hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="px-3.5 py-2.5 border-b border-[var(--hair)]">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Cơ cấu theo kênh</span>
              </div>
              <div className="p-3.5 flex-1 flex flex-row items-center gap-3.5 justify-around flex-wrap">
                <svg viewBox="0 0 120 120" className="w-[104px] h-[104px] shrink-0">
                  {donutSegments.map((d, i) => (
                    <circle
                      key={i}
                      cx="60"
                      cy="60"
                      r="44"
                      fill="none"
                      stroke={d.color}
                      strokeWidth="16"
                      strokeDasharray={d.dash}
                      strokeDashoffset={d.offset}
                      transform="rotate(-90 60 60)"
                    />
                  ))}
                  <text
                    x="60"
                    y="57"
                    textAnchor="middle"
                    fontFamily="Geist Mono, monospace"
                    fill="var(--fg)"
                    fontWeight="500"
                    className="text-[1.0625rem] font-mono font-medium fill-[var(--fg)]"
                  >
                    26,6
                  </text>
                  <text
                    x="60"
                    y="71"
                    textAnchor="middle"
                    fontFamily="Geist, sans-serif"
                    fill="var(--muted-fg)"
                    className="text-[0.53125rem] font-sans fill-[var(--muted-fg)]"
                  >
                    nghìn tỷ
                  </text>
                </svg>

                <div className="flex flex-col gap-1.5 min-w-[110px] flex-1">
                  {channelParts.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-[0.71875rem]">
                      <span style={{ background: l.c }} className="w-2 h-2 rounded-[2px] shrink-0" />
                      <span className="text-[var(--fg2)] truncate flex-1">{l.label}</span>
                      <span className="font-mono text-[0.6875rem] text-[var(--muted-fg)] tabular-nums">
                        {l.v.toFixed(1).replace('.', ',')}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 3: Margin Area + CAC/LTV Scatter + Conversion Funnel ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Margin Area Chart */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--hair)]">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Biên đóng góp theo quý</span>
                <span className="font-mono text-[0.65625rem] text-[var(--err)]">−4,6đ</span>
              </div>
              <div className="p-3.5 pt-2">
                <svg viewBox="0 0 320 150" className="w-full h-auto block">
                  <defs>
                    <linearGradient id="ow-margin-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--c2)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="var(--c2)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <g stroke="var(--hair)" strokeWidth="1">
                    <line x1="26" y1="14" x2="310" y2="14" />
                    <line x1="26" y1="54" x2="310" y2="54" />
                    <line x1="26" y1="94" x2="310" y2="94" />
                    <line x1="26" y1="122" x2="310" y2="122" />
                  </g>
                  <path
                    d="M40,34 L108,52 L176,74 L244,92 L296,104 L296,122 L40,122 Z"
                    fill="url(#ow-margin-area)"
                  />
                  <polyline
                    fill="none"
                    stroke="var(--c2)"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    points="40,34 108,52 176,74 244,92 296,104"
                    strokeDasharray="900"
                    style={{ animation: 'ow-draw 1s ease both' }}
                  />
                  <g fill="var(--c2)">
                    <circle cx="40" cy="34" r="2.6" />
                    <circle cx="108" cy="52" r="2.6" />
                    <circle cx="176" cy="74" r="2.6" />
                    <circle cx="244" cy="92" r="2.6" />
                    <circle cx="296" cy="104" r="2.6" />
                  </g>
                  <g fill="var(--muted-fg)" fontFamily="Geist Mono, monospace" textAnchor="middle" className="text-[0.59375rem] font-mono fill-[var(--muted-fg)]">
                    <text x="40" y="140">Q3/24</text>
                    <text x="108" y="140">Q4/24</text>
                    <text x="176" y="140">Q1/25</text>
                    <text x="244" y="140">Q2/25</text>
                    <text x="296" y="140">Q3/25</text>
                  </g>
                  <g fill="var(--muted-fg)" fontFamily="Geist Mono, monospace" textAnchor="end" className="text-[0.59375rem] font-mono fill-[var(--muted-fg)]">
                    <text x="20" y="17">34%</text>
                    <text x="20" y="57">30%</text>
                    <text x="20" y="97">26%</text>
                  </g>
                </svg>
              </div>
            </div>

            {/* CAC vs LTV Scatter Plot */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--hair)]">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)] truncate">CAC và giá trị vòng đời</span>
                <span className="text-[0.65625rem] text-[var(--muted-fg)] shrink-0">nhóm khách</span>
              </div>
              <div className="p-3.5 pt-2">
                <svg viewBox="0 0 320 150" className="w-full h-auto block">
                  <g stroke="var(--hair)" strokeWidth="1">
                    <line x1="30" y1="14" x2="310" y2="14" />
                    <line x1="30" y1="54" x2="310" y2="54" />
                    <line x1="30" y1="94" x2="310" y2="94" />
                    <line x1="30" y1="122" x2="310" y2="122" />
                    <line x1="30" y1="14" x2="30" y2="122" />
                  </g>
                  <line x1="30" y1="122" x2="310" y2="18" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
                  {scatterPoints.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={p[2]} fill={p[3] as string} fillOpacity={0.7} />
                  ))}
                  <g fill="var(--muted-fg)" fontFamily="Geist Mono, monospace" className="text-[0.59375rem] font-mono fill-[var(--muted-fg)]">
                    <text x="30" y="140">CAC thấp</text>
                    <text x="310" y="140" textAnchor="end">CAC cao</text>
                  </g>
                </svg>
              </div>
            </div>

            {/* Conversion Funnel */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--hair)]">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Phễu chuyển đổi</span>
                <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)]">3,4%</span>
              </div>
              <div className="p-3.5 flex flex-col gap-2">
                {funnelStages.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[0.6875rem]">
                    <span className="w-20 shrink-0 text-[var(--muted-fg)] truncate">{f.label}</span>
                    <span className="flex-1 h-5 bg-[var(--muted)] rounded overflow-hidden block">
                      <span
                        style={{ width: f.pct, background: f.color }}
                        className="block h-full rounded transition-all duration-300"
                      />
                    </span>
                    <span className="w-14 text-right font-mono text-[var(--fg2)] tabular-nums shrink-0">
                      {f.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Row 4: Heatmap & Product Table ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Orders Heatmap */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--hair)]">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Đơn hàng theo giờ và thứ</span>
                <div className="flex items-center gap-1.5 text-[0.65625rem] text-[var(--muted-fg)]">
                  <span>thấp</span>
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[var(--c2)] opacity-15" />
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[var(--c2)] opacity-45" />
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[var(--c2)] opacity-75" />
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[var(--c2)]" />
                  <span>cao</span>
                </div>
              </div>

              <div className="p-3.5">
                <div className="grid grid-cols-[24px_repeat(12,minmax(0,1fr))] gap-1">
                  {/* Top hour headers */}
                  <div className="h-4" />
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="h-4 flex items-center justify-center font-mono text-[0.5625rem] text-[var(--muted-fg)]"
                    >
                      {h}
                    </div>
                  ))}

                  {/* Days and cells */}
                  {days.map((d, r) => (
                    <React.Fragment key={d}>
                      <div className="h-4 flex items-center font-mono text-[0.59375rem] text-[var(--muted-fg)]">
                        {d}
                      </div>
                      {hours.map((_, c) => {
                        const base = Math.sin((c - 3) / 3.2) * 0.5 + 0.5;
                        const weekend = r >= 5 ? 0.22 : 0;
                        const opacity = Math.max(
                          0.08,
                          Math.min(1, base * (0.75 + weekend) + (c === 9 ? 0.2 : 0) + (r === 2 ? 0.08 : 0))
                        );
                        return (
                          <div
                            key={c}
                            style={{ opacity }}
                            className="h-4 rounded-[2px] bg-[var(--c2)] transition-opacity"
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Product Table */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden flex flex-col hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--hair)] gap-2">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Nhóm sản phẩm</span>
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1.5 text-[var(--muted-fg)]" />
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Lọc theo tên…"
                    className="w-36 h-6.5 pl-6 pr-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--muted-fg)] rounded-md text-[0.71875rem] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-[0.75rem] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--hair)] text-[0.65625rem] uppercase tracking-wider text-[var(--muted-fg)]">
                      <th
                        onClick={() => handleSort('name')}
                        className="py-1.5 px-3 font-medium cursor-pointer hover:text-[var(--fg)]"
                      >
                        Nhóm sản phẩm {sortKey === 'name' ? (sortDir === -1 ? '↓' : '↑') : ''}
                      </th>
                      <th
                        onClick={() => handleSort('rev')}
                        className="py-1.5 px-3 text-right font-medium cursor-pointer hover:text-[var(--fg)]"
                      >
                        Doanh thu {sortKey === 'rev' ? (sortDir === -1 ? '↓' : '↑') : ''}
                      </th>
                      <th
                        onClick={() => handleSort('growth')}
                        className="py-1.5 px-3 text-right font-medium cursor-pointer hover:text-[var(--fg)]"
                      >
                        Tăng trưởng {sortKey === 'growth' ? (sortDir === -1 ? '↓' : '↑') : ''}
                      </th>
                      <th
                        onClick={() => handleSort('margin')}
                        className="py-1.5 px-3 text-right font-medium cursor-pointer hover:text-[var(--fg)]"
                      >
                        Biên {sortKey === 'margin' ? (sortDir === -1 ? '↓' : '↑') : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-[var(--muted-fg)] text-[0.75rem]">
                          0 nhóm phù hợp với bộ lọc
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-[var(--hair)] hover:bg-[var(--muted)]/50 transition-colors"
                        >
                          <td className="py-2 px-3 text-[var(--fg)] font-medium truncate max-w-[140px]">
                            {p.name}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--fg2)]">
                            {p.rev.toFixed(2).replace('.', ',')} tỷ
                          </td>
                          <td
                            style={{ color: p.growth > 0 ? 'var(--ok)' : 'var(--err)' }}
                            className="py-2 px-3 text-right font-mono tabular-nums font-medium"
                          >
                            {p.growth > 0 ? '+' : ''}
                            {p.growth.toFixed(1).replace('.', ',')}%
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--muted-fg)]">
                            {p.margin.toFixed(1).replace('.', ',')}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-auto px-3.5 py-2 flex items-center justify-between border-t border-[var(--hair)] text-[0.6875rem] text-[var(--muted-fg)]">
                <span>
                  {filteredProducts.length} / {PRODUCTS.length} nhóm
                </span>
                <span className="font-mono text-[0.65625rem]">nguồn: fact_orders</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkDashboardPage;
