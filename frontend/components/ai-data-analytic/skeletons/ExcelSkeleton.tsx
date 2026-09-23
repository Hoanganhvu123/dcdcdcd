import React from 'react';
import { Sparkles, FileSpreadsheet, Layers, Table } from 'lucide-react';

export interface ExcelSkeletonProps {
  toolName?: string;
  sheetName?: string;
  title?: string;
  progressHint?: string;
  className?: string;
}

export const ExcelSkeleton: React.FC<ExcelSkeletonProps> = ({
  toolName = 'spreadsheet_studio',
  sheetName = 'Query_Result',
  title,
  progressHint = 'Đang nhận và kết xuất cấu trúc bảng tính đa trang...',
  className = '',
}) => {
  return (
    <div
      data-testid="spotlight-loading-skeleton"
      className={`flex flex-col items-center justify-center h-full w-full p-4 sm:p-6 bg-[var(--bg)] text-[var(--fg)] select-none overflow-hidden relative ${className}`}
    >
      {/* Spreadsheet Stage Container */}
      <div className="w-full max-w-5xl h-full max-h-[700px] rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-[var(--shadow)] p-4 sm:p-6 flex flex-col justify-between relative overflow-hidden backdrop-blur-md">
        {/* Animated Shimmer Gradient Wave */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[var(--border)]/30 to-transparent pointer-events-none" />

        {/* Top Header Row: Tool Badge, Sheet Tag & Live Pulse */}
        <div className="flex items-center justify-between z-10 shrink-0 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2.5 py-1 rounded-full bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] text-xs font-mono flex items-center gap-1.5 shadow-xs shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
              <span>{toolName}</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-fg)] border border-[var(--border)] text-xs font-mono uppercase tracking-wider hidden sm:inline-block truncate">
              {sheetName}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] text-xs font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
              <span className="font-semibold">STREAMING SPREADSHEET</span>
            </span>
            <span className="text-xs font-mono text-[var(--muted-fg)] hidden md:inline-block">
              XLSX Engine
            </span>
          </div>
        </div>

        {/* Title Bar Wireframe */}
        <div className="py-2.5 z-10 shrink-0">
          {title ? (
            <h2 className="text-sm sm:text-base font-bold text-[var(--fg)] truncate tracking-tight">
              {title}
            </h2>
          ) : (
            <div className="h-5 sm:h-6 w-1/3 max-w-sm rounded-lg bg-[var(--muted)] animate-pulse" />
          )}
        </div>

        {/* Formula Bar Wireframe */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--muted)]/60 border border-[var(--border)] z-10 mb-3 shrink-0">
          <span className="text-xs font-mono font-bold text-[var(--muted-fg)]">fx</span>
          <div className="h-4 w-8 rounded bg-[var(--card)] border border-[var(--border)] font-mono text-xs text-[var(--muted-fg)] flex items-center justify-center">
            A1
          </div>
          <div className="h-3 flex-1 rounded bg-[var(--border)] animate-pulse" />
        </div>

        {/* Spreadsheet Table Grid Wireframe */}
        <div className="flex-1 min-h-0 rounded-xl bg-[var(--bg)] border border-[var(--border)] overflow-hidden flex flex-col z-10">
          {/* Header Row */}
          <div className="grid grid-cols-6 bg-[var(--muted)] border-b border-[var(--border)] text-xs font-mono text-[var(--muted-fg)] shrink-0">
            <div className="p-2 text-center border-r border-[var(--border)] w-10 shrink-0">#</div>
            <div className="p-2 border-r border-[var(--border)] font-semibold flex items-center justify-center">
              <div className="h-3 w-8 rounded bg-[var(--border)] animate-pulse" />
            </div>
            <div className="p-2 border-r border-[var(--border)] font-semibold flex items-center justify-center">
              <div className="h-3 w-12 rounded bg-[var(--border)] animate-pulse" />
            </div>
            <div className="p-2 border-r border-[var(--border)] font-semibold flex items-center justify-center">
              <div className="h-3 w-14 rounded bg-[var(--border)] animate-pulse" />
            </div>
            <div className="p-2 border-r border-[var(--border)] font-semibold flex items-center justify-center">
              <div className="h-3 w-10 rounded bg-[var(--border)] animate-pulse" />
            </div>
            <div className="p-2 font-semibold flex items-center justify-center">
              <div className="h-3 w-12 rounded bg-[var(--border)] animate-pulse" />
            </div>
          </div>

          {/* Grid Rows Wireframe */}
          <div className="flex-1 overflow-hidden divide-y divide-[var(--border)]/70">
            {[1, 2, 3, 4, 5, 6, 7].map((rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-6 text-xs font-mono items-center h-8 hover:bg-[var(--muted)]/40 transition-colors">
                <div className="text-center text-[var(--muted-fg)] border-r border-[var(--border)]/70 py-1.5 w-10 shrink-0">
                  {rowIdx}
                </div>
                <div className="px-3 border-r border-[var(--border)]/70 py-1.5">
                  <div
                    className="h-2.5 rounded bg-[var(--muted)] animate-pulse"
                    style={{ width: `${60 + (rowIdx * 7) % 35}%` }}
                  />
                </div>
                <div className="px-3 border-r border-[var(--border)]/70 py-1.5">
                  <div
                    className="h-2.5 rounded bg-[var(--muted)] animate-pulse"
                    style={{ width: `${45 + (rowIdx * 11) % 40}%` }}
                  />
                </div>
                <div className="px-3 border-r border-[var(--border)]/70 py-1.5">
                  <div
                    className="h-2.5 rounded bg-[var(--muted)] animate-pulse"
                    style={{ width: `${70 + (rowIdx * 5) % 25}%` }}
                  />
                </div>
                <div className="px-3 border-r border-[var(--border)]/70 py-1.5">
                  <div
                    className="h-2.5 rounded bg-[var(--muted)] animate-pulse"
                    style={{ width: `${50 + (rowIdx * 9) % 35}%` }}
                  />
                </div>
                <div className="px-3 py-1.5">
                  <div
                    className="h-2.5 rounded bg-[var(--muted)] animate-pulse"
                    style={{ width: `${65 + (rowIdx * 13) % 30}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Sheet Tab Bar */}
          <div className="flex items-center px-3 py-1.5 bg-[var(--muted)] border-t border-[var(--border)] text-xs font-mono text-[var(--muted-fg)] gap-2 shrink-0">
            <span className="px-2.5 py-0.5 rounded bg-[var(--card)] text-[var(--fg)] border border-[var(--border)] font-medium flex items-center gap-1.5">
              <Table className="w-3 h-3 text-[var(--accent)]" />
              {sheetName}
            </span>
            <span className="text-[var(--muted-fg)] px-1">+</span>
          </div>
        </div>

        {/* Bottom Status & Progress Row */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs text-[var(--muted-fg)] z-10 shrink-0 mt-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[var(--accent)] shrink-0 animate-pulse" />
            <span className="font-mono text-xs text-[var(--fg)] truncate max-w-xs sm:max-w-md">
              {progressHint}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--muted-fg)]">
            <span className="px-2 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)]">Multi-Sheet XLSX</span>
            <span className="px-2 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)]">Auto Formula</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExcelSkeleton;
