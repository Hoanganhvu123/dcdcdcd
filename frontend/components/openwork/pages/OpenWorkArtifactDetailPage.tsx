import React, { useState } from 'react';
import { FileSpreadsheet, Download, Share2, History, Plus, BarChart3, Code2, GitCompare, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkArtifactDetailPageProps {
  artifactId?: string;
  onDownload?: () => void;
  onShare?: () => void;
  onBack?: () => void;
}

type TabKey = 'sheet' | 'chart' | 'diff' | 'code';

const SPREADSHEET_DATA = [
  { row: 1, a: 'BÁO CÁO KẾT QUẢ KINH DOANH (P&L)', b: '', c: '', d: '', e: '', f: '' },
  { row: 2, a: 'Chỉ tiêu tài chính', b: 'Q1/2025', c: 'Q2/2025', d: 'Q3/2025', e: 'Q4/2025 (Dự kiến)', f: 'Cả năm 2025' },
  { row: 3, a: '1. Doanh thu thuần', b: '28.450.000', c: '32.120.000', d: '38.640.000', e: '42.800.000', f: '142.010.000' },
  { row: 4, a: '  - Kênh Cửa hàng bán lẻ', b: '16.200.000', c: '18.400.000', d: '22.100.000', e: '24.500.000', f: '81.200.000' },
  { row: 5, a: '  - Kênh Sàn TMĐT (Shopee/TikTok)', b: '9.800.000', c: '10.920.000', d: '13.440.000', e: '15.100.000', f: '49.260.000' },
  { row: 6, a: '  - Kênh B2B & Đại lý', b: '2.450.000', c: '2.800.000', d: '3.100.000', e: '3.200.000', f: '11.550.000' },
  { row: 7, a: '2. Giá vốn hàng bán (COGS)', b: '14.225.000', c: '15.738.000', d: '18.547.000', e: '20.544.000', f: '69.054.000' },
  { row: 8, a: '3. Lợi nhuận gộp (Gross Profit)', b: '14.225.000', c: '16.382.000', d: '20.093.000', e: '22.256.000', f: '72.956.000' },
  { row: 9, a: '  Tỷ suất LN gộp (%)', b: '50,0%', c: '51,0%', d: '52,0%', e: '52,0%', f: '51,4%' },
  { row: 10, a: '4. Chi phí Marketing (CAC)', b: '4.267.000', c: '4.818.000', d: '5.409.000', e: '5.992.000', f: '20.486.000' },
  { row: 11, a: '5. Chi phí Vận hành & Lương', b: '5.120.000', c: '5.460.000', d: '6.180.000', e: '6.840.000', f: '23.600.000' },
  { row: 12, a: '6. Lợi nhuận thuần (EBITDA)', b: '4.838.000', c: '6.104.000', d: '8.504.000', e: '9.424.000', f: '28.870.000' },
  { row: 13, a: '  Tỷ suất EBITDA (%)', b: '17,0%', c: '19,0%', d: '22,0%', e: '22,0%', f: '20,3%' },
];

const SHEETS = ['PnL Tổng hợp', 'Kênh Bán lẻ', 'Chi phí Marketing', 'Dòng tiền Dự kiến'];

const DIFF_RECORDS = [
  { cell: 'D3', oldVal: '36.800.000', newVal: '38.640.000', user: 'AI Agent (SQL sync)', time: '09:38' },
  { cell: 'D8', oldVal: '18.400.000', newVal: '20.093.000', user: 'Formula recalc', time: '09:38' },
  { cell: 'D12', oldVal: '7.820.000', newVal: '8.504.000', user: 'Formula recalc', time: '09:38' },
];

const PYTHON_SCRIPT = `import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "PnL Tổng hợp"

# Set headers and data
headers = ["Chỉ tiêu tài chính", "Q1/2025", "Q2/2025", "Q3/2025", "Q4/2025 (Dự kiến)", "Cả năm 2025"]
ws.append(headers)

# Apply Accounting Formatting & Pivot Tables
for col_idx in range(2, 7):
    ws.cell(row=2, column=col_idx).number_format = '#,##0'

wb.save("PnL_Consolidated_Q3.xlsx")
`;

export const OpenWorkArtifactDetailPage: React.FC<OpenWorkArtifactDetailPageProps> = ({
  artifactId = 'art-pnl-q3',
  onDownload,
  onShare,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('sheet');
  const [selectedSheet, setSelectedSheet] = useState<string>('PnL Tổng hợp');
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string }>({ row: 8, col: 'D' });
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const handleCopyCode = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(PYTHON_SCRIPT);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <FileSpreadsheet size={13} />
          </div>
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] truncate">
            PnL_Consolidated_Q3.xlsx
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap hidden sm:inline">
            4 sheets · 184 dòng
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-lg text-[0.71875rem] whitespace-nowrap transition-colors"
          >
            <Share2 size={12} />
            <span>Chia sẻ</span>
          </button>

          <button
            type="button"
            onClick={onDownload}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-opacity shadow-xs"
          >
            <Download size={12} />
            <span>Tải file XLSX</span>
          </button>
        </div>
      </header>

      {/* ── 2. Sub-Header Tabs (36px) ── */}
      <div className="h-[36px] flex-none flex items-center justify-between px-3.5 border-b border-[var(--hair)] bg-[var(--panel)]">
        <div className="flex items-center gap-1">
          {[
            { key: 'sheet', label: 'Bảng tính (Spreadsheet)', icon: <FileSpreadsheet size={12} /> },
            { key: 'chart', label: 'Biểu đồ trực quan', icon: <BarChart3 size={12} /> },
            { key: 'diff', label: 'Lịch sử phiên bản (Diff)', icon: <GitCompare size={12} /> },
            { key: 'code', label: 'Mã nguồn Python', icon: <Code2 size={12} /> },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key as TabKey)}
              className={cn(
                'h-6 px-2.5 rounded-md text-[0.71875rem] flex items-center gap-1.5 transition-colors',
                activeTab === t.key
                  ? 'bg-[var(--card)] text-[var(--fg)] font-medium shadow-xs border border-[var(--border)]'
                  : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
              )}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <span className="text-[0.6875rem] text-[var(--muted-fg)] font-mono hidden md:inline">
          Phiên bản v3 (Làm mới 09:38)
        </span>
      </div>

      {/* ── 3. Tab Content Area ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--bg)]">
        {/* Tab 1: Spreadsheet View */}
        {activeTab === 'sheet' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Formula Bar */}
            <div className="h-[30px] flex-none flex items-center gap-2 px-3 border-b border-[var(--hair)] bg-[var(--panel)]/40 text-[0.71875rem]">
              <span className="font-mono font-semibold text-[var(--muted-fg)] px-1.5 py-0.5 bg-[var(--bg)] border border-[var(--border)] rounded">
                {selectedCell.col}{selectedCell.row}
              </span>
              <span className="text-[var(--muted-fg)] font-mono italic">fx</span>
              <input
                type="text"
                readOnly
                value="=D3-D7"
                className="flex-1 bg-transparent font-mono text-[0.71875rem] text-[var(--fg)] outline-none border-0"
              />
            </div>

            {/* Grid Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left text-[0.75rem] border-collapse min-w-[720px] font-mono">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--panel)] text-[0.65625rem] text-[var(--muted-fg)]">
                    <th className="w-10 py-1.5 px-2 text-center border-r border-[var(--border)] font-normal">#</th>
                    <th className="py-1.5 px-3 border-r border-[var(--border)] font-normal min-w-[240px]">A</th>
                    <th className="py-1.5 px-3 border-r border-[var(--border)] font-normal text-right min-w-[100px]">B</th>
                    <th className="py-1.5 px-3 border-r border-[var(--border)] font-normal text-right min-w-[100px]">C</th>
                    <th className="py-1.5 px-3 border-r border-[var(--border)] font-normal text-right min-w-[100px]">D</th>
                    <th className="py-1.5 px-3 border-r border-[var(--border)] font-normal text-right min-w-[120px]">E</th>
                    <th className="py-1.5 px-3 font-normal text-right min-w-[120px]">F</th>
                  </tr>
                </thead>
                <tbody>
                  {SPREADSHEET_DATA.map((row) => {
                    const isHeaderRow = row.row === 1 || row.row === 2;
                    const isBoldRow = row.row === 3 || row.row === 8 || row.row === 12;
                    return (
                      <tr
                        key={row.row}
                        className={cn(
                          'border-b border-[var(--hair)] hover:bg-[var(--muted)]/30 transition-colors',
                          isHeaderRow && 'bg-[var(--panel)]/30 font-semibold',
                          isBoldRow && 'font-semibold text-[var(--fg)] bg-[var(--panel)]/10'
                        )}
                      >
                        <td className="py-1 px-2 text-center border-r border-[var(--hair)] text-[0.65625rem] text-[var(--muted-fg)] bg-[var(--panel)]/20 select-none">
                          {row.row}
                        </td>
                        <td
                          onClick={() => setSelectedCell({ row: row.row, col: 'A' })}
                          className={cn(
                            'py-1 px-3 border-r border-[var(--hair)] truncate font-sans cursor-pointer',
                            selectedCell.row === row.row && selectedCell.col === 'A' && 'ring-2 ring-[var(--accent)] ring-inset'
                          )}
                        >
                          {row.a}
                        </td>
                        <td
                          onClick={() => setSelectedCell({ row: row.row, col: 'B' })}
                          className={cn(
                            'py-1 px-3 border-r border-[var(--hair)] text-right tabular-nums cursor-pointer',
                            selectedCell.row === row.row && selectedCell.col === 'B' && 'ring-2 ring-[var(--accent)] ring-inset'
                          )}
                        >
                          {row.b}
                        </td>
                        <td
                          onClick={() => setSelectedCell({ row: row.row, col: 'C' })}
                          className={cn(
                            'py-1 px-3 border-r border-[var(--hair)] text-right tabular-nums cursor-pointer',
                            selectedCell.row === row.row && selectedCell.col === 'C' && 'ring-2 ring-[var(--accent)] ring-inset'
                          )}
                        >
                          {row.c}
                        </td>
                        <td
                          onClick={() => setSelectedCell({ row: row.row, col: 'D' })}
                          className={cn(
                            'py-1 px-3 border-r border-[var(--hair)] text-right tabular-nums cursor-pointer',
                            selectedCell.row === row.row && selectedCell.col === 'D' && 'ring-2 ring-[var(--accent)] ring-inset bg-[var(--accent-soft)]/10'
                          )}
                        >
                          {row.d}
                        </td>
                        <td
                          onClick={() => setSelectedCell({ row: row.row, col: 'E' })}
                          className={cn(
                            'py-1 px-3 border-r border-[var(--hair)] text-right tabular-nums cursor-pointer',
                            selectedCell.row === row.row && selectedCell.col === 'E' && 'ring-2 ring-[var(--accent)] ring-inset'
                          )}
                        >
                          {row.e}
                        </td>
                        <td
                          onClick={() => setSelectedCell({ row: row.row, col: 'F' })}
                          className={cn(
                            'py-1 px-3 text-right tabular-nums cursor-pointer',
                            selectedCell.row === row.row && selectedCell.col === 'F' && 'ring-2 ring-[var(--accent)] ring-inset'
                          )}
                        >
                          {row.f}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Sheet Switcher Bar */}
            <div className="h-[32px] flex-none flex items-center justify-between px-3 border-t border-[var(--border)] bg-[var(--panel)]">
              <div className="flex items-center gap-1">
                {SHEETS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedSheet(s)}
                    className={cn(
                      'h-5.5 px-2.5 rounded text-[0.6875rem] font-medium transition-colors',
                      selectedSheet === s
                        ? 'bg-[var(--card)] text-[var(--fg)] border border-[var(--border)] shadow-xs'
                        : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                    )}
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  title="Thêm sheet mới"
                  className="p-1 rounded text-[var(--muted-fg)] hover:text-[var(--fg)]"
                >
                  <Plus size={12} />
                </button>
              </div>

              <span className="text-[0.625rem] text-[var(--muted-fg)] font-mono">
                Tổng cộng: 142.010.000 đ
              </span>
            </div>
          </div>
        )}

        {/* Tab 2: Visual Chart */}
        {activeTab === 'chart' && (
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            <div className="max-w-[900px] mx-auto flex flex-col gap-4">
              <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-5 shadow-[var(--shadow)]">
                <div className="flex items-center justify-between border-b border-[var(--hair)] pb-3">
                  <h3 className="text-[0.84375rem] font-medium text-[var(--fg)]">
                    Doanh thu & Lợi nhuận gộp 4 Quý năm 2025
                  </h3>
                  <div className="flex items-center gap-3 text-[0.6875rem] text-[var(--muted-fg)]">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-[2px] bg-[var(--c1)]" /> Doanh thu thuần
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-[2px] bg-[var(--c2)]" /> Lợi nhuận gộp
                    </span>
                  </div>
                </div>

                <div className="pt-4">
                  <svg viewBox="0 0 500 160" className="w-full h-auto block">
                    <g stroke="var(--hair)" strokeWidth="1">
                      <line x1="20" y1="30" x2="480" y2="30" />
                      <line x1="20" y1="70" x2="480" y2="70" />
                      <line x1="20" y1="110" x2="480" y2="110" />
                      <line x1="20" y1="140" x2="480" y2="140" />
                    </g>
                    {[
                      { q: 'Q1/2025', rev: 28.4, gross: 14.2 },
                      { q: 'Q2/2025', rev: 32.1, gross: 16.3 },
                      { q: 'Q3/2025', rev: 38.6, gross: 20.0 },
                      { q: 'Q4/2025', rev: 42.8, gross: 22.2 },
                    ].map((item, idx) => {
                      const x = 50 + idx * 110;
                      const revH = item.rev * 2.6;
                      const grossH = item.gross * 2.6;
                      return (
                        <g key={item.q}>
                          <rect x={x} y={140 - revH} width="22" height={revH} rx="2" fill="var(--c1)" />
                          <rect x={x + 26} y={140 - grossH} width="22" height={grossH} rx="2" fill="var(--c2)" />
                          <text x={x + 24} y="154" fontSize="10" fontFamily="Geist Mono, monospace" fill="var(--muted-fg)" textAnchor="middle">
                            {item.q}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Version Diff */}
        {activeTab === 'diff' && (
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            <div className="max-w-[800px] mx-auto border border-[var(--border)] bg-[var(--card)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
              <div className="p-4 border-b border-[var(--hair)] flex items-center justify-between">
                <span className="text-[0.8125rem] font-medium text-[var(--fg)]">
                  Lịch sử thay đổi ô dữ liệu (Diff v2 → v3)
                </span>
                <span className="text-[0.6875rem] text-[var(--muted-fg)]">3 ô được cập nhật</span>
              </div>

              <table className="w-full text-left text-[0.75rem] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--hair)] text-[0.65625rem] uppercase tracking-wider text-[var(--muted-fg)] bg-[var(--panel)]/40">
                    <th className="py-2 px-4 font-medium">Ô dữ liệu</th>
                    <th className="py-2 px-3 font-medium">Giá trị cũ (v2)</th>
                    <th className="py-2 px-3 font-medium text-emerald-600">Giá trị mới (v3)</th>
                    <th className="py-2 px-3 font-medium">Tác nhân</th>
                    <th className="py-2 px-3 text-right font-medium">Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {DIFF_RECORDS.map((d, i) => (
                    <tr key={i} className="border-b border-[var(--hair)] hover:bg-[var(--muted)]/30">
                      <td className="py-2.5 px-4 font-mono font-semibold text-[var(--fg)]">{d.cell}</td>
                      <td className="py-2.5 px-3 font-mono text-[var(--muted-fg)] line-through">{d.oldVal}</td>
                      <td className="py-2.5 px-3 font-mono text-emerald-600 dark:text-emerald-400 font-medium">{d.newVal}</td>
                      <td className="py-2.5 px-3 text-[var(--fg2)]">{d.user}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-[var(--muted-fg)]">{d.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Python Code */}
        {activeTab === 'code' && (
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            <div className="max-w-[800px] mx-auto border border-[var(--border)] bg-[var(--card)] rounded-2xl shadow-[var(--shadow)] overflow-hidden flex flex-col">
              <div className="p-3 border-b border-[var(--hair)] flex items-center justify-between bg-[var(--panel)]/50">
                <span className="text-[0.75rem] font-medium text-[var(--fg)]">Mã Python tạo bảng tính (openpyxl)</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="h-6 px-2 flex items-center gap-1 rounded border border-[var(--border)] text-[0.6875rem] hover:bg-[var(--muted)] text-[var(--fg2)]"
                >
                  {copiedCode ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                  <span>{copiedCode ? 'Đã sao chép' : 'Sao chép mã'}</span>
                </button>
              </div>
              <div className="p-4 bg-[#0b0b0e] text-[#fafafa] font-mono text-[0.71875rem] overflow-x-auto leading-relaxed">
                <pre className="m-0">{PYTHON_SCRIPT}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OpenWorkArtifactDetailPage;
