import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Bot,
  ArrowUpRight,
} from 'lucide-react';
import type { SubagentRunPart } from './types';
import { cn } from '@/lib/utils';

export interface OpenWorkSubagentRunLineProps {
  part: SubagentRunPart;
  onNavigateSession?: (sessionId: string) => void;
  className?: string;
}

export const OpenWorkSubagentRunLine: React.FC<OpenWorkSubagentRunLineProps> = ({
  part,
  onNavigateSession,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number>(part.durationMs || 0);

  const isCompleted = part.status === 'completed';
  const isRunning = part.status === 'running';
  const isFailed = part.status === 'failed';

  // Live stopwatch while subagent is running
  useEffect(() => {
    if (!isRunning) {
      if (part.durationMs !== undefined) {
        setElapsedMs(part.durationMs);
      }
      return;
    }

    const startTimestamp = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTimestamp);
    }, 100);

    return () => clearInterval(interval);
  }, [isRunning, part.durationMs]);

  const formatDuration = useCallback((ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 10) return `${s.toFixed(1).replace('.', ',')}s`;
    if (s < 60) return `${Math.round(s)}s`;
    const mins = Math.floor(s / 60);
    const remSecs = Math.round(s % 60);
    return `${mins}m ${remSecs}s`;
  }, []);

  return (
    <div
      data-line="subagent-run"
      data-subagent-run={part.id}
      className={cn(
        "subagent-run-line rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3 my-2 shadow-[var(--shadow)] space-y-2 transition-all not-prose",
        className
      )}
    >
      {/* 2-line header presentation */}
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
        className="cursor-pointer space-y-1.5 select-none"
      >
        {/* Line 1: Agent Badge + Task Title */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-[0.65625rem] font-mono font-medium bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] shrink-0">
              <Bot size={11} className="text-[var(--muted-fg)]" />
              <span>{part.agentName}</span>
            </span>

            <span
              className={cn(
                "text-[0.78125rem] font-medium truncate font-sans",
                isRunning ? "text-[var(--accent)] animate-pulse" : "text-[var(--fg)]"
              )}
            >
              {part.taskTitle}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[var(--muted-fg)] shrink-0">
            <span className="tabular-nums text-[0.65625rem] font-mono text-[var(--muted-fg)] bg-[var(--muted)] px-1.5 py-0.5 rounded-[5px] border border-[var(--border)]">
              {formatDuration(elapsedMs)}
            </span>
            {isExpanded ? (
              <ChevronDown size={13} className="text-[var(--accent)]" />
            ) : (
              <ChevronRight size={13} />
            )}
          </div>
        </div>

        {/* Line 2: Status verb + Live indicator */}
        <div className="flex items-center gap-2 text-[0.71875rem] text-[var(--muted-fg)] font-sans">
          {isRunning ? (
            <div className="flex items-center gap-1.5 text-[var(--accent)]">
              <Loader2 size={12} className="animate-ow-spin shrink-0" />
              <span className="font-medium animate-pulse">
                {part.statusVerb || `Working ${formatDuration(elapsedMs)}…`}
              </span>
            </div>
          ) : isCompleted ? (
            <div className="flex items-center gap-1.5 text-[var(--ok)]">
              <CheckCircle2 size={12} className="shrink-0 text-[var(--ok)]" />
              <span className="font-medium text-[var(--fg)]">
                {part.statusVerb || 'Hoàn tất nhiệm vụ'} · {formatDuration(elapsedMs)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[var(--err)]">
              <AlertCircle size={12} className="shrink-0" />
              <span className="font-medium">
                {part.statusVerb || 'Thực thi nhiệm vụ thất bại'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Expandable inspector */}
      {isExpanded && (
        <div className="pt-2.5 border-t border-[var(--hair)] text-[0.71875rem] space-y-2 font-mono">
          {part.taskPrompt && (
            <div className="p-2.5 rounded-[7px] bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--fg2)] text-[0.71875rem] leading-relaxed">
              <span className="text-[var(--fg)] font-semibold block mb-1">Prompt giao phó:</span>
              <p className="whitespace-pre-wrap">{part.taskPrompt}</p>
            </div>
          )}

          {part.outputSummary && (
            <div className="p-2.5 rounded-[7px] bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--fg)] text-[0.71875rem] leading-relaxed">
              <span className="text-[var(--fg)] font-semibold block mb-1">Kết quả hoàn tất:</span>
              <p className="whitespace-pre-wrap">{part.outputSummary}</p>
            </div>
          )}

          {part.agentSlug && onNavigateSession && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateSession(part.agentSlug!);
                }}
                className="inline-flex items-center gap-1 text-[0.71875rem] text-[var(--accent)] hover:underline font-sans font-medium cursor-pointer"
              >
                <span>Mở phiên làm việc riêng của Subagent</span>
                <ArrowUpRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OpenWorkSubagentRunLine;
