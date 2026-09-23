import React, { useState, useMemo } from 'react';
import { Zap, CheckCircle2, ChevronDown, Loader2, AlertCircle, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ToolAggregatePart } from './types';
import { cn } from '@/lib/utils';

interface AggregatedRow {
  id: string;
  name: string;
  count: number;
  status: 'running' | 'completed' | 'failed';
  durationMs?: number;
  resultSummary?: string;
  error?: string;
}

export interface OpenWorkToolAggregateGroupProps {
  part: ToolAggregatePart;
  className?: string;
}

export const OpenWorkToolAggregateGroup: React.FC<OpenWorkToolAggregateGroupProps> = ({
  part,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(part.isExpanded || false);

  const tools = part.tools || [];

  // Deduplicate consecutive identical tool items with ×N badge
  const aggregatedRows: AggregatedRow[] = useMemo(() => {
    const rows: AggregatedRow[] = [];
    for (const tool of tools) {
      const last = rows[rows.length - 1];
      if (last && last.name === tool.name && last.status === tool.status) {
        last.count += 1;
        if (tool.durationMs !== undefined) {
          last.durationMs = (last.durationMs || 0) + tool.durationMs;
        }
      } else {
        rows.push({
          id: tool.id,
          name: tool.name,
          count: 1,
          status: tool.status,
          durationMs: tool.durationMs,
          resultSummary: tool.resultSummary,
          error: tool.error,
        });
      }
    }
    return rows;
  }, [tools]);

  const hasRunning = tools.some((t) => t.status === 'running');

  // Sum total execution duration
  const totalDurationMs = useMemo(() => {
    if ((part as any).totalDurationMs !== undefined) return (part as any).totalDurationMs;
    return tools.reduce((sum, t) => sum + (t.durationMs || 0), 0);
  }, [part, tools]);

  const formattedDuration = useMemo(() => {
    if (!totalDurationMs || totalDurationMs <= 0) return null;
    return totalDurationMs < 1000 ? `${totalDurationMs}ms` : `${(totalDurationMs / 1000).toFixed(1)}s`;
  }, [totalDurationMs]);

  // Standardized Claude Canvas title format
  const capsuleTitle = useMemo(() => {
    if (part.title) return part.title;
    return `⚡ ${tools.length} thao tác truy vấn & phân tích dữ liệu`;
  }, [part.title, tools.length]);

  return (
    <div
      data-line="tool-aggregate"
      data-tool-aggregate={part.id}
      className={cn(
        "tool-aggregate-group flex flex-col rounded-[10px] border border-[var(--border)] bg-[var(--card)] my-2 shadow-[var(--shadow)] overflow-hidden not-prose transition-all",
        className
      )}
    >
      {/* ── Single-line Collapsible Progress Capsule Header ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        aria-expanded={expanded}
        className={cn(
          "flex items-center justify-between px-3 py-2 cursor-pointer select-none group/hdr transition-colors hover:bg-[var(--muted)]/40",
          expanded && "border-b border-[var(--border)]"
        )}
      >
        <span className="flex items-center gap-2 truncate min-w-0 pr-2">
          {hasRunning ? (
            <Loader2 size={13} className="animate-ow-spin text-[var(--fg)] shrink-0" />
          ) : (
            <Zap size={13} className="text-[var(--fg)] shrink-0" />
          )}
          <span
            className={cn(
              "truncate font-sans text-xs font-medium text-[var(--fg)]",
              hasRunning && "animate-pulse"
            )}
          >
            {capsuleTitle.replace(/^⚡\s*/, '')}
          </span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {formattedDuration && (
            <span className="text-[0.65625rem] font-mono text-[var(--muted-fg)] bg-[var(--muted)] px-1.5 py-0.5 rounded-[4px] border border-[var(--border)] tabular-nums">
              {formattedDuration}
            </span>
          )}
          <span className="text-[0.65625rem] font-mono text-[var(--muted-fg)] bg-[var(--muted)] px-1.5 py-0.5 rounded-[4px] border border-[var(--border)] tabular-nums">
            {tools.length} hành động
          </span>
          <ChevronDown
            size={13}
            className={cn(
              "text-[var(--muted-fg)] transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* ── Collapsible Inner Tool Rows (ZERO rows rendered when collapsed) ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 p-2.5 bg-[var(--card)]">
              {aggregatedRows.map((row) => {
                const isCompleted = row.status === 'completed';
                const isRunning = row.status === 'running';
                const isFailed = row.status === 'failed';

                return (
                  <div
                    key={row.id}
                    className="tool-item flex items-center justify-between text-xs py-1.5 px-2.5 rounded-[6px] bg-[var(--muted)]/50 border border-[var(--border)] hover:border-[var(--fg)] transition-colors font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isRunning ? (
                        <Loader2 size={12} className="animate-ow-spin text-[var(--fg)] shrink-0" />
                      ) : isCompleted ? (
                        <span className="w-3.5 h-3.5 flex-none rounded-full border border-[var(--border)] bg-[var(--muted)] text-[var(--fg)] flex items-center justify-center text-[7.5px] font-bold select-none">✓</span>
                      ) : isFailed ? (
                        <AlertCircle size={12} className="text-[var(--err)] shrink-0" />
                      ) : (
                        <Wrench size={12} className="text-[var(--muted-fg)] shrink-0" />
                      )}

                      <span
                        className={cn(
                          "truncate font-sans text-xs",
                          isRunning ? "text-[var(--fg)] font-medium animate-pulse" : "text-[var(--fg)]"
                        )}
                      >
                        {row.name}
                      </span>

                      {row.count > 1 && (
                        <span className="px-1.5 py-0.5 rounded-[4px] bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] text-[0.65625rem] font-bold shrink-0 tabular-nums">
                          ×{row.count}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[0.65625rem] text-[var(--muted-fg)] font-mono shrink-0 tabular-nums">
                      {row.durationMs !== undefined && (
                        <span>
                          {row.durationMs < 1000 ? `${row.durationMs}ms` : `${(row.durationMs / 1000).toFixed(1)}s`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OpenWorkToolAggregateGroup;
