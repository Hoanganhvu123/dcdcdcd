import React, { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkTurnActionRowProps {
  contentToCopy?: string;
  durationSeconds?: number;
  modelName?: string;
  onRegenerate?: () => void;
  onCopy?: () => void;
  onExportReport?: () => void;
  className?: string;
}

/**
 * OpenWorkTurnActionRow
 * High-fidelity action row matching Chat DeepThink.dc.html:216-222:
 * - 27px height buttons (height: 27px, 7px radius, 11.5px font-size)
 * - "Sao chép", "Chạy lại", "Xuất báo cáo" triggers
 * - Right-aligned Geist Mono tabular metadata
 */
export const OpenWorkTurnActionRow: React.FC<OpenWorkTurnActionRowProps> = ({
  contentToCopy = '',
  durationSeconds,
  modelName,
  onRegenerate,
  onCopy,
  onExportReport,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const meta = [
    modelName,
    durationSeconds !== undefined ? durationSeconds.toString().replace('.', ',') + 's' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleCopy = () => {
    if (contentToCopy) {
      navigator.clipboard.writeText(contentToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    onCopy?.();
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 pt-1 select-none flex-wrap not-prose',
        'opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-150',
        className
      )}
    >
      {/* Copy Button */}
      <button
        type="button"
        aria-label="Sao chép câu trả lời"
        onClick={handleCopy}
        className="ow-action-btn h-[27px] px-[10px] inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] font-medium hover:bg-[var(--muted)] hover:text-[var(--fg)] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
      >
        {copied ? (
          <>
            <Check size={12.5} strokeWidth={1.8} className="text-[var(--ok)]" />
            <span>Đã sao chép</span>
          </>
        ) : (
          <>
            <Copy size={12.5} strokeWidth={1.8} />
            <span>Sao chép</span>
          </>
        )}
      </button>

      {/* Replay / Regenerate Button */}
      {onRegenerate && (
        <button
          type="button"
          aria-label="Tạo lại câu trả lời"
          onClick={onRegenerate}
          className="ow-action-btn h-[27px] px-[10px] inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] font-medium hover:bg-[var(--muted)] hover:text-[var(--fg)] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
        >
          <RefreshCw size={12.5} strokeWidth={1.8} />
          <span>Chạy lại</span>
        </button>
      )}

      {/* Export Report Button */}
      {onExportReport && (
        <button
          type="button"
          aria-label="Xuất báo cáo"
          onClick={onExportReport}
          className="ow-action-btn h-[27px] px-[10px] inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] font-medium hover:bg-[var(--muted)] hover:text-[var(--fg)] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
        >
          <span>Xuất báo cáo</span>
        </button>
      )}

      {/* Right-aligned Monospace Tabular Metadata */}
      {meta && (
        <span className="ml-auto font-mono text-[0.65625rem] text-[var(--muted-fg)] tabular-nums whitespace-nowrap pl-2">
          {meta}
        </span>
      )}
    </div>
  );
};

export default OpenWorkTurnActionRow;
