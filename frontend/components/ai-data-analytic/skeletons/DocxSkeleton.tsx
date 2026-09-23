import React from 'react';
import { Sparkles, FileText, Layers, CheckCircle2 } from 'lucide-react';

export interface DocxSkeletonProps {
  toolName?: string;
  title?: string;
  progressHint?: string;
  className?: string;
}

export const DocxSkeleton: React.FC<DocxSkeletonProps> = ({
  toolName = 'doc_writer',
  title,
  progressHint = 'Đang nhận và định dạng văn bản báo cáo điều hành A4...',
  className = '',
}) => {
  return (
    <div
      data-testid="spotlight-loading-skeleton"
      className={`flex flex-col items-center justify-center h-full w-full p-4 sm:p-6 bg-[var(--bg)] text-[var(--fg)] select-none overflow-hidden relative ${className}`}
    >
      {/* A4 Document Stage Container */}
      <div className="w-full max-w-4xl h-full max-h-[720px] rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-[var(--shadow)] p-4 sm:p-6 flex flex-col justify-between relative overflow-hidden backdrop-blur-md">
        {/* Animated Shimmer Gradient Wave */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[var(--border)]/30 to-transparent pointer-events-none" />

        {/* Top Header Row: Tool Badge, Format Tag & Live Pulse */}
        <div className="flex items-center justify-between z-10 shrink-0 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2.5 py-1 rounded-full bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] text-xs font-mono flex items-center gap-1.5 shadow-xs shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
              <span>{toolName}</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-fg)] border border-[var(--border)] text-xs font-mono uppercase tracking-wider hidden sm:inline-block">
              A4 Executive Document
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] text-xs font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
              <span className="font-semibold">STREAMING A4 DOCX</span>
            </span>
            <span className="text-xs font-mono text-[var(--muted-fg)] hidden md:inline-block">
              Mammoth Engine
            </span>
          </div>
        </div>

        {/* Centered A4 Page Mockup Stage */}
        <div className="flex-1 min-h-0 my-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] p-5 sm:p-7 overflow-hidden flex flex-col z-10 shadow-xs">
          {/* Document Title Header */}
          <div className="space-y-2 mb-4 shrink-0">
            {title ? (
              <h1 className="text-base sm:text-lg font-bold text-[var(--fg)] tracking-tight">
                {title}
              </h1>
            ) : (
              <div className="h-6 sm:h-7 w-3/4 rounded-lg bg-[var(--muted)] animate-pulse" />
            )}
            <div className="flex items-center gap-3 pt-1">
              <div className="h-3.5 w-28 rounded bg-[var(--muted)]/80 animate-pulse" />
              <div className="h-3.5 w-20 rounded bg-[var(--muted)]/60 animate-pulse" />
              <div className="h-3.5 w-32 rounded bg-[var(--muted)]/40 animate-pulse hidden sm:block" />
            </div>
          </div>

          {/* Executive Summary Box Shimmer */}
          <div className="p-3.5 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] mb-4 space-y-2 shrink-0">
            <div className="h-3 w-32 rounded bg-[var(--accent)]/30 animate-pulse" />
            <div className="h-2.5 w-full rounded bg-[var(--muted-fg)]/20 animate-pulse" />
            <div className="h-2.5 w-5/6 rounded bg-[var(--muted-fg)]/20 animate-pulse" />
          </div>

          {/* Body Section 1 Wireframe */}
          <div className="space-y-2.5 mb-4 flex-1 overflow-hidden">
            <div className="h-4 w-44 rounded bg-[var(--muted-fg)]/30 animate-pulse" />
            <div className="space-y-2 pt-1">
              <div className="h-2.5 w-full rounded bg-[var(--muted)] animate-pulse" />
              <div className="h-2.5 w-[92%] rounded bg-[var(--muted)]/80 animate-pulse" />
              <div className="h-2.5 w-[85%] rounded bg-[var(--muted)]/80 animate-pulse" />
            </div>

            {/* Bullet List Wireframe */}
            <div className="space-y-2 pl-3 pt-1">
              {[1, 2, 3].map((b) => (
                <div key={b} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]/60 shrink-0" />
                  <div
                    className="h-2.5 rounded bg-[var(--muted)] animate-pulse"
                    style={{ width: `${70 + (b * 9) % 25}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Status & Progress Row */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs text-[var(--muted-fg)] z-10 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--accent)] shrink-0 animate-pulse" />
            <span className="font-mono text-xs text-[var(--fg)] truncate max-w-xs sm:max-w-md">
              {progressHint}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--muted-fg)]">
            <span className="px-2 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)]">Khổ A4 Chuẩn</span>
            <span className="px-2 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)]">Xuất In / PDF</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocxSkeleton;
