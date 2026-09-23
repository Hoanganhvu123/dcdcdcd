import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ExternalLink, RefreshCw, AlertTriangle, Check, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CapabilityCallPart, OpenWorkArtifactTab } from './types';
import { cn } from '@/lib/utils';

export interface OpenWorkCapabilityCallLineProps {
  part: CapabilityCallPart;
  onReconnect?: () => void;
  onSelectTab?: (tab: OpenWorkArtifactTab) => void;
  className?: string;
}

/**
 * Formats milliseconds into clean stopwatch durations (e.g. 240ms, 1,2s, 1m 14s)
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1).replace('.', ',')}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const mins = Math.floor(s / 60);
  const remSecs = Math.round(s % 60);
  return `${mins}m ${remSecs}s`;
}

export function resolveToolBadgeAndLabel(toolName: string, customDisplayName?: string) {
  const lower = (toolName || '').toLowerCase();

  if (lower.includes('sql') || lower.includes('database') || lower.includes('query')) {
    return {
      badge: 'SQL',
      codeLabel: 'TRUY VẤN SQL',
      language: 'sql',
      artifactTab: 'excel' as OpenWorkArtifactTab,
      category: 'Database Query',
      presentVerb: 'Querying database',
      pastVerb: 'Queried database',
      defaultSentence: 'Truy vấn cơ sở dữ liệu',
    };
  }
  if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('xlsx')) {
    return {
      badge: 'XLSX',
      codeLabel: 'DỰNG BẢNG TÍNH',
      language: 'json',
      artifactTab: 'excel' as OpenWorkArtifactTab,
      category: 'Financial Modeling',
      presentVerb: 'Generating spreadsheet',
      pastVerb: 'Generated spreadsheet',
      defaultSentence: 'Dựng bảng tính Excel',
    };
  }
  if (lower.includes('presentation') || lower.includes('slide') || lower.includes('pptx')) {
    return {
      badge: 'PPTX',
      codeLabel: 'DỰNG SLIDE 16:9',
      language: 'json',
      artifactTab: 'slide' as OpenWorkArtifactTab,
      category: '16:9 Presentation',
      presentVerb: 'Building presentation deck',
      pastVerb: 'Built presentation deck',
      defaultSentence: 'Tạo slide trình chiếu 16:9',
    };
  }
  if (lower.includes('doc') || lower.includes('word') || lower.includes('report')) {
    return {
      badge: 'DOCX',
      codeLabel: 'TÀI LIỆU A4',
      language: 'markdown',
      artifactTab: 'docx' as OpenWorkArtifactTab,
      category: 'A4 Document',
      presentVerb: 'Creating document',
      pastVerb: 'Created document',
      defaultSentence: 'Biên soạn tài liệu văn bản A4',
    };
  }
  if (lower.includes('python') || lower.includes('sandbox') || lower.includes('script') || lower.includes('code')) {
    return {
      badge: 'PYTHON',
      codeLabel: 'MÃ PYTHON',
      language: 'python',
      artifactTab: 'code' as OpenWorkArtifactTab,
      category: 'Code Execution',
      presentVerb: 'Running Python script',
      pastVerb: 'Ran Python script',
      defaultSentence: 'Thực thi mã Python Sandbox',
    };
  }
  if (lower.includes('schema') || lower.includes('introspect')) {
    return {
      badge: 'SCHEMA',
      codeLabel: 'LƯỢC ĐỒ DỮ LIỆU',
      language: 'sql',
      artifactTab: 'code' as OpenWorkArtifactTab,
      category: 'Schema Exploration',
      presentVerb: 'Exploring database schema',
      pastVerb: 'Explored database schema',
      defaultSentence: 'Khảo sát lược đồ cơ sở dữ liệu',
    };
  }

  return {
    badge: (toolName || 'TOOL').slice(0, 6).toUpperCase(),
    codeLabel: 'CÔNG CỤ THỰC THI',
    language: 'bash',
    artifactTab: 'code' as OpenWorkArtifactTab,
    category: 'Capability Bridge',
    presentVerb: 'Executing capability',
    pastVerb: 'Executed capability',
    defaultSentence: customDisplayName || toolName || 'Thực thi công cụ tự hành',
  };
}

const resolveToolMeta = resolveToolBadgeAndLabel;

export const OpenWorkCapabilityCallLine: React.FC<OpenWorkCapabilityCallLineProps> = ({
  part,
  onReconnect,
  onSelectTab,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isOpen = isExpanded;
  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);
  const [elapsedMs, setElapsedMs] = useState<number>(part.durationMs || 0);
  const [copied, setCopied] = useState(false);

  const isSuccess = part.status === 'success';
  const isFailed = part.status === 'failed';
  const isRunning = part.status === 'running';

  const meta = useMemo(
    () => resolveToolBadgeAndLabel(part.toolName, part.displayName),
    [part.toolName, part.displayName]
  );

  useEffect(() => {
    if (!isRunning) {
      if (part.durationMs !== undefined) {
        setElapsedMs(part.durationMs);
      }
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 90);
    return () => clearInterval(timer);
  }, [isRunning, part.durationMs]);

  const inputString = useMemo(() => {
    if (part.codeSnippet) return part.codeSnippet;
    if (!part.input) return null;
    if (typeof part.input === 'string') return part.input;
    try {
      return JSON.stringify(part.input, null, 2);
    } catch {
      return String(part.input);
    }
  }, [part.input, part.codeSnippet]);

  const outputString = useMemo(() => {
    if (!part.output) return null;
    if (typeof part.output === 'string') return part.output;
    try {
      return JSON.stringify(part.output, null, 2);
    } catch {
      return String(part.output);
    }
  }, [part.output]);

  const handleCopyPayload = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);

  const sentence = useMemo(() => {
    if (part.displayName) return part.displayName;
    if (part.input?.sentence) return part.input.sentence;
    if (part.input?.title) return `“${part.input.title}”`;
    if (part.input?.sql) {
      const s = String(part.input.sql).trim();
      return s.length > 55 ? `${s.slice(0, 52)}…` : s;
    }
    if (part.input?.query) {
      const q = String(part.input.query);
      return q.length > 40 ? `“${q.slice(0, 37)}…”` : `“${q}”`;
    }
    return meta.defaultSentence;
  }, [part.displayName, part.input, meta.defaultSentence]);

  return (
    <div
      data-line="capability-call"
      data-capability-call={part.toolName}
      className={cn(
        "ow-tool-card w-full my-2 rounded-[10px] border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow)] animate-ow-in not-prose",
        className
      )}
    >
      {/* ── Clickable Header Bar (Chat SQL Tool.dc.html:172-195) ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        className="ow-tool-header flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none hover:bg-[var(--muted)] transition-colors"
      >
        {/* Status Indicator Icon */}
        {isRunning ? (
          <span
            className="w-3 h-3 flex-none rounded-full border-[1.5px] border-[var(--border)] border-t-[var(--accent)] animate-ow-spin"
          />
        ) : isSuccess ? (
          <span className="w-3.5 h-3.5 flex-none rounded-full border border-[var(--border)] bg-[var(--muted)] text-[var(--fg)] flex items-center justify-center text-[0.5rem] font-bold select-none">
            ✓
          </span>
        ) : (
          <AlertTriangle size={13} className="text-[var(--err)] flex-none" />
        )}

        {/* Monospace Uppercase Badge */}
        <span className="ow-tool-badge flex-none font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-[5px] px-1.5 py-0.5 leading-none uppercase">
          {meta.badge}
        </span>

        {/* Sentence Summary */}
        <span className="text-[0.78125rem] text-[var(--fg2)] truncate min-w-0 flex-1 font-sans">
          {sentence}
        </span>

        {/* Execution Duration */}
        <span className="ml-auto flex-none font-mono text-[0.65625rem] text-[var(--muted-fg)] tabular-nums pl-1">
          {formatDuration(elapsedMs)}
        </span>

        {/* Rotating Chevron */}
        <ChevronRight
          size={13}
          strokeWidth={1.8}
          className="text-[var(--muted-fg)] flex-none transition-transform duration-200"
          style={{ transform: `rotate(${isExpanded ? 90 : 0}deg)` }}
        />
      </div>

      {/* ── Expandable Themed Code Drawer ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="overflow-hidden"
          >
            <div className="ow-tool-code border-t border-[var(--border)] bg-[var(--card)] dark:bg-[var(--code)] p-3 flex flex-col gap-2.5 font-mono text-[0.71875rem]">
              {/* Input / Code Section */}
              {inputString && (
                <div className="flex flex-col gap-1.5">
                  <div className="ow-tool-label flex items-center justify-between text-[0.625rem] font-semibold tracking-[0.08em] uppercase text-[var(--muted-fg)] font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                      {meta.codeLabel}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPayload(inputString);
                      }}
                      className="hover:text-[var(--fg)] hover:bg-[var(--muted)] text-[var(--muted-fg)] transition-colors rounded px-1.5 py-0.5 border border-[var(--border)] cursor-pointer flex items-center gap-1 text-[0.65625rem]"
                    >
                      {copied ? <Check size={11} className="text-[var(--fg)]" /> : null}
                      <span>{copied ? 'Đã sao chép' : 'Sao chép mã'}</span>
                    </button>
                  </div>
                  <pre className="m-0 p-3 rounded-lg font-mono text-[0.71875rem] leading-[1.65] bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--fg)] whitespace-pre-wrap overflow-x-auto custom-scrollbar">
                    {inputString}
                  </pre>
                </div>
              )}

              {/* Output Results Section */}
              {outputString && (
                <div className="flex flex-col gap-1.5">
                  <div className="ow-tool-label flex items-center justify-between text-[0.625rem] font-semibold tracking-[0.08em] uppercase text-[var(--muted-fg)] font-mono">
                    <span>KẾT QUẢ TRẢ VỀ</span>
                    {onSelectTab && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTab(meta.artifactTab);
                        }}
                        className="flex items-center gap-1 text-[var(--accent)] hover:underline normal-case text-[0.65625rem] cursor-pointer"
                      >
                        <span>Mở trong Workbench</span>
                        <ExternalLink size={10} />
                      </button>
                    )}
                  </div>
                  <pre className="m-0 p-3 rounded-lg font-mono text-[0.71875rem] leading-[1.65] bg-[var(--muted)]/40 border border-[var(--border)] text-[var(--muted-fg)] whitespace-pre-wrap overflow-x-auto custom-scrollbar">
                    {outputString}
                  </pre>
                </div>
              )}

              {/* Failed Error Banner */}
              {isFailed && (
                <div className="p-2.5 rounded-[7px] border border-[var(--err)]/40 bg-[var(--err)]/10 text-[var(--err)] text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={13} className="shrink-0" />
                    <span>{part.error || 'Thao tác thực thi thất bại'}</span>
                  </div>
                  {onReconnect && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReconnect();
                      }}
                      className="px-2 py-0.5 rounded-[5px] bg-[var(--err)] text-white text-[0.71875rem] font-sans font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={10} />
                      <span>Thử lại</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OpenWorkCapabilityCallLine;
