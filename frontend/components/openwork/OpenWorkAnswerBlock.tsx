import React, { useState, useCallback } from 'react';
import {
  Copy,
  Check,
  RefreshCw,
  LayoutDashboard,
  ExternalLink,
  ArrowUpRight,
  FileSpreadsheet,
  Layers,
  FileText,
  Code2,
  BarChart3,
  Globe,
} from 'lucide-react';
import type { AssistantTextPart, OpenWorkArtifactTab } from './types';
import { OpenWorkMarkdownRenderer } from './OpenWorkMarkdownRenderer';
import { OpenWorkKeyFindingsCard } from './OpenWorkKeyFindingsCard';
import { cn } from '@/lib/utils';

export interface OpenWorkAnswerBlockProps {
  part: AssistantTextPart;
  isStreaming?: boolean;
  onArtifactClick?: (path: string) => void;
  onSelectArtifactTab?: (tab: OpenWorkArtifactTab) => void;
  onRegenerate?: () => void;
  onCopy?: () => void;
  onPinToDashboard?: () => void;
  onExportReport?: () => void;
  modelName?: string;
  durationSeconds?: number;
  toolsCount?: number;
  tokenCount?: number;
  className?: string;
}

function resolveArtifactCardInfo(tab: OpenWorkArtifactTab, part: any) {
  switch (tab) {
    case 'excel':
      return {
        Icon: FileSpreadsheet,
        fileName: part.artifactName || 'PnL_4_Quarters_Consolidated.xlsx',
        meta: part.artifactMeta || '15 dòng · 5 cột · 18.4 KB',
        iconColor: 'text-[var(--fg)]',
        badgeBg: 'bg-[var(--muted)] border-[var(--border)]',
      };
    case 'slide':
      return {
        Icon: Layers,
        fileName: part.artifactName || 'Q3_Financial_Review_16x9.pptx',
        meta: part.artifactMeta || '8 slides · 16:9 · 2.4 MB',
        iconColor: 'text-[var(--fg)]',
        badgeBg: 'bg-[var(--muted)] border-[var(--border)]',
      };
    case 'docx':
      return {
        Icon: FileText,
        fileName: part.artifactName || 'Bao_Cao_Tai_Chinh_Q3.docx',
        meta: part.artifactMeta || '4 trang · 1,420 từ · 142 KB',
        iconColor: 'text-[var(--fg)]',
        badgeBg: 'bg-[var(--muted)] border-[var(--border)]',
      };
    case 'code':
      return {
        Icon: Code2,
        fileName: part.artifactName || 'pnl_etl_pipeline.py',
        meta: part.artifactMeta || '48 dòng · Python 3.11 · 3.8 KB',
        iconColor: 'text-[var(--fg)]',
        badgeBg: 'bg-[var(--muted)] border-[var(--border)]',
      };
    case 'chart':
      return {
        Icon: BarChart3,
        fileName: part.artifactName || 'pnl_quarterly_revenue.png',
        meta: part.artifactMeta || '1920x1080 · PNG · 340 KB',
        iconColor: 'text-[var(--fg)]',
        badgeBg: 'bg-[var(--muted)] border-[var(--border)]',
      };
    default:
      return {
        Icon: Globe,
        fileName: part.artifactName || 'workspace_artifact',
        meta: part.artifactMeta || 'Trực quan hóa tương tác',
        iconColor: 'text-[var(--fg)]',
        badgeBg: 'bg-[var(--muted)] border-[var(--border)]',
      };
  }
}

/**
 * OpenWorkAnswerBlock
 * Complete assistant answer block matching Chat DeepThink.dc.html:197-224:
 * - 13.5px font-size, 1.75 line-height text rendering
 * - 2px x 13px amber streaming cursor with ow-pulse animation
 * - Numbered Key Findings Card (Kết luận chính)
 * - 27px action buttons (Sao chép, Chạy lại, Mở trong Workbench, Ghim vào Dashboard, Xuất báo cáo)
 * - Right-aligned Geist Mono tabular metadata
 */
export const OpenWorkAnswerBlock: React.FC<OpenWorkAnswerBlockProps> = ({
  part,
  isStreaming = false,
  onArtifactClick,
  onSelectArtifactTab,
  onRegenerate,
  onCopy,
  onPinToDashboard,
  onExportReport,
  modelName,
  durationSeconds,
  toolsCount,
  tokenCount,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const textToCopy = part.markdown || '';
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch {
      // ignore clipboard error
    }
  }, [part.markdown, onCopy]);

  // Format right-aligned metadata string
  const metaString = [
    toolsCount ? `${toolsCount} công cụ` : null,
    durationSeconds !== undefined ? `${durationSeconds.toString().replace('.', ',')}s` : null,
    tokenCount ? `${tokenCount.toLocaleString('vi-VN')} token` : null,
    !toolsCount && durationSeconds === undefined && modelName ? modelName : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className={cn("ow-answer-block group/turn flex flex-col gap-3 w-full min-w-0 animate-ow-in text-[var(--fg)] not-prose", className)}
      data-line="assistant"
      data-part-id={part.id}
    >
      {/* ── Optional Part Title Header (suppressed if markdown already provides heading) ── */}
      {part.title && part.title !== 'Kết Quả Trả Lời' && !part.markdown?.trim().startsWith('#') && (
        <h4 className="ow-part-title pt-0.5">
          {part.title}
        </h4>
      )}

      {/* ── Main Markdown Content with Streaming Cursor ── */}
      <div className="relative font-sans text-[0.84375rem] leading-[1.75] text-[var(--fg)]">
        <OpenWorkMarkdownRenderer
          content={part.markdown || ''}
          onArtifactClick={onArtifactClick}
        />
        {isStreaming && (
          <span
            className="ow-cursor inline-block w-[2px] h-[13px] bg-[var(--accent)] align-[-2px] ml-0.5 animate-ow-pulse"
            aria-hidden="true"
          />
        )}
      </div>

      {/* ── Key Findings Card removed per user preference for pure Claude Markdown prose ── */}

      {/* ── Claude Canvas Artifact Link Card (Pure Monochrome Design) ── */}
      {part.suggestedArtifactTab && onSelectArtifactTab && (() => {
        const { Icon, fileName, meta, iconColor, badgeBg } = resolveArtifactCardInfo(part.suggestedArtifactTab, part);
        return (
          <div className="pt-1 animate-ow-in">
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelectArtifactTab(part.suggestedArtifactTab!)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectArtifactTab(part.suggestedArtifactTab!);
                }
              }}
              className="ow-artifact-canvas-anchor group/artifact flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 w-full max-w-md border border-[var(--border)] bg-[var(--card)] hover:border-[var(--fg)] hover:shadow-sm rounded-[12px] p-2.5 sm:px-3 sm:py-2.5 transition-all duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] select-none"
              aria-label={`Mở artifact ${fileName} trong Canvas`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover/artifact:scale-105", badgeBg, iconColor)}>
                  <Icon size={17} strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex flex-col">
                  <span className="font-mono text-xs font-medium text-[var(--fg)] truncate max-w-[170px] sm:max-w-[210px]" title={fileName}>
                    {fileName}
                  </span>
                  <span className="font-mono text-[0.6875rem] text-[var(--muted-fg)] tracking-tight">
                    {meta}
                  </span>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[var(--muted)] border border-[var(--border)] text-[var(--fg)] text-xs font-medium transition-all duration-150 group-hover/artifact:bg-[var(--fg)] group-hover/artifact:text-[var(--bg)] shrink-0 ml-auto sm:ml-0">
                <span>Mở trong Canvas</span>
                <ArrowUpRight size={13} strokeWidth={2} className="shrink-0" />
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── Action Row & Monospace Metadata ── */}
      {!isStreaming && (
        <div className="flex items-center gap-1.5 pt-1 select-none flex-wrap opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-150">
          {/* Copy Button */}
          <button
            type="button"
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
              onClick={onRegenerate}
              className="ow-action-btn h-[27px] px-[10px] inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] font-medium hover:bg-[var(--muted)] hover:text-[var(--fg)] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
            >
              <RefreshCw size={12.5} strokeWidth={1.8} />
              <span>Chạy lại</span>
            </button>
          )}

          {/* Open Workbench Action */}
          {part.suggestedArtifactTab && onSelectArtifactTab && (
            <button
              type="button"
              onClick={() => onSelectArtifactTab(part.suggestedArtifactTab!)}
              className="ow-action-btn h-[27px] px-[10px] inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] font-medium hover:bg-[var(--muted)] hover:text-[var(--fg)] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
            >
              <span>Mở trong Workbench</span>
            </button>
          )}

          {/* Pin to Dashboard Action */}
          {onPinToDashboard && (
            <button
              type="button"
              onClick={onPinToDashboard}
              className="ow-action-btn h-[27px] px-[10px] inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] font-medium hover:bg-[var(--muted)] hover:text-[var(--fg)] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
            >
              <LayoutDashboard size={12.5} strokeWidth={1.8} />
              <span>Ghim vào Dashboard</span>
            </button>
          )}

          {/* Export Report Action */}
          {onExportReport && (
            <button
              type="button"
              onClick={onExportReport}
              className="ow-action-btn h-[27px] px-[10px] inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] font-medium hover:bg-[var(--muted)] hover:text-[var(--fg)] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)]"
            >
              <span>Xuất báo cáo</span>
            </button>
          )}

          {/* Right Monospace Metadata */}
          {metaString && (
            <span className="ml-auto font-mono text-[0.65625rem] text-[var(--muted-fg)] tabular-nums whitespace-nowrap pl-2">
              {metaString}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default OpenWorkAnswerBlock;
