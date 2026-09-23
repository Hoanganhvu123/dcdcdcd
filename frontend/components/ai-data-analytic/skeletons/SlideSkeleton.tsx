import React from 'react';
import { Sparkles, Presentation, Layers, Radio } from 'lucide-react';

export interface SlideSkeletonProps {
  toolName?: string;
  layout?: string;
  title?: string;
  progressHint?: string;
  className?: string;
}

export const SlideSkeleton: React.FC<SlideSkeletonProps> = ({
  toolName = 'presentation_builder',
  layout = 'hero',
  title,
  progressHint = 'Đang nhận luồng dữ liệu slide từ OpenWork Engine...',
  className = '',
}) => {
  const normalizedLayout = (layout || 'hero').toLowerCase();

  return (
    <div
      data-testid="spotlight-loading-skeleton"
      className={`flex flex-col items-center justify-center h-full w-full p-4 sm:p-6 bg-[var(--bg)] text-[var(--fg)] select-none overflow-hidden relative ${className}`}
    >
      {/* 16:9 Aspect-Ratio Wireframe Stage */}
      <div className="w-full max-w-5xl aspect-video rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-[var(--shadow)] p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden backdrop-blur-md">
        
        {/* Animated Shimmer Gradient Wave */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[var(--border)]/30 to-transparent pointer-events-none" />

        {/* Top Header Row: Tool Badge, Layout Tag & Live Pulse */}
        <div className="flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] text-xs font-mono flex items-center gap-1.5 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
              <span>{toolName}</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-fg)] border border-[var(--border)] text-xs font-mono uppercase tracking-wider hidden sm:inline-block">
              {normalizedLayout.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] text-xs font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
              <span className="font-semibold">STREAMING 16:9</span>
            </span>
            <span className="text-xs font-mono text-[var(--muted-fg)] hidden md:inline-block">
              1920×1080 HD
            </span>
          </div>
        </div>

        {/* Dynamic Skeleton Wireframe Body by Layout */}
        <div className="flex-1 flex flex-col justify-center my-4 z-10 space-y-4">
          {title ? (
            <h2 className="text-base sm:text-lg font-bold text-[var(--fg)] truncate tracking-tight text-center">
              {title}
            </h2>
          ) : (
            <div className="h-6 sm:h-8 w-3/4 max-w-xl mx-auto rounded-lg bg-[var(--muted)] animate-pulse" />
          )}

          {normalizedLayout === 'stat_grid' ? (
            /* 3-Card Grid Wireframe */
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-3xl mx-auto w-full pt-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-2 animate-pulse">
                  <div className="h-3 w-1/2 rounded bg-[var(--border)]" />
                  <div className="h-6 w-3/4 rounded bg-[var(--muted-fg)]/40" />
                  <div className="h-2 w-1/3 rounded bg-[var(--border)]" />
                </div>
              ))}
            </div>
          ) : normalizedLayout === 'comparison' || normalizedLayout === 'two_col' ? (
            /* Two Column Wireframe */
            <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto w-full pt-2">
              <div className="p-4 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-2.5 animate-pulse">
                <div className="h-4 w-3/4 rounded bg-[var(--border)]" />
                <div className="h-2.5 w-full rounded bg-[var(--border)]/60" />
                <div className="h-2.5 w-5/6 rounded bg-[var(--border)]/60" />
              </div>
              <div className="p-4 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-2.5 animate-pulse">
                <div className="h-4 w-3/4 rounded bg-[var(--border)]" />
                <div className="h-2.5 w-full rounded bg-[var(--border)]/60" />
                <div className="h-2.5 w-5/6 rounded bg-[var(--border)]/60" />
              </div>
            </div>
          ) : (
            /* Hero / Bullets Wireframe */
            <div className="space-y-3 max-w-lg mx-auto w-full">
              <div className="h-4 w-4/5 mx-auto rounded bg-[var(--muted)] animate-pulse" />
              <div className="h-3 w-3/5 mx-auto rounded bg-[var(--muted)]/80 animate-pulse" />
              <div className="h-2.5 w-2/5 mx-auto rounded bg-[var(--muted)]/60 animate-pulse" />
            </div>
          )}
        </div>

        {/* Bottom Status & Progress Row */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs text-[var(--muted-fg)] z-10">
          <div className="flex items-center gap-2">
            <Presentation className="w-4 h-4 text-[var(--accent)] shrink-0 animate-pulse" />
            <span className="font-mono text-xs text-[var(--fg)] truncate max-w-xs sm:max-w-md">
              {progressHint}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--muted-fg)]">
            <span className="px-2 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)]">Scale-to-Fit</span>
            <span className="px-2 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)]">16:9 Dynamic</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlideSkeleton;
