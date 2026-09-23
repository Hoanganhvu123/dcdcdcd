import React from 'react';
import type { PlanPart, PlanStepItem } from './types';
import { cn } from '@/lib/utils';

export interface OpenWorkPlanCardProps {
  part?: PlanPart;
  title?: string;
  progress?: string;
  note?: string;
  steps?: PlanStepItem[];
  className?: string;
}

export const OpenWorkPlanCard: React.FC<OpenWorkPlanCardProps> = ({
  part,
  title = 'Kế hoạch thực thi',
  progress: explicitProgress,
  note: explicitNote,
  steps: explicitSteps,
  className = '',
}) => {
  const steps = part?.steps || explicitSteps || [];
  const total = steps.length;
  const doneCount = steps.filter((s) => s.status === 'done' || s.status === 'completed').length;
  const runningIndex = steps.findIndex((s) => s.status === 'running');

  const progress = explicitProgress || part?.progress || `${doneCount}/${total}`;
  const note = explicitNote || part?.note || (doneCount === total && total > 0 ? 'Hoàn tất' : runningIndex >= 0 ? 'Đang thực thi' : 'Tự động');

  if (steps.length === 0) return null;

  return (
    <div
      data-line="plan-card"
      data-plan-card=""
      className={cn(
        "ow-plan-card w-full my-2.5 rounded-[11px] border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow)] animate-ow-in not-prose",
        className
      )}
    >
      {/* ── Header Row (Chat DeepThink.dc.html:150-170) ── */}
      <div className="ow-plan-header flex items-center gap-2 px-3 py-2.5 border-b border-[var(--hair)] bg-[var(--card)]">
        <span className="text-[0.78125rem] font-medium text-[var(--fg)] whitespace-nowrap font-sans">
          {part?.title || title}
        </span>
        <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-[5px] px-1.5 py-0.5 leading-none tabular-nums">
          {progress}
        </span>
        <span className="ml-auto text-[0.6875rem] text-[var(--muted-fg)] whitespace-nowrap font-sans">
          {note}
        </span>
      </div>

      {/* ── Step List with 15px Status Circles ── */}
      <div className="flex flex-col">
        {steps.map((step, idx) => {
          const isDone = step.status === 'done' || step.status === 'completed';
          const isRunning = step.status === 'running';

          return (
            <div
              key={step.id || `plan-step-${idx}`}
              className="ow-plan-step flex items-start gap-2.5 px-3 py-2 border-t border-[var(--hair)] first:border-t-0"
            >
              {/* 15px Numbered Circle Status Indicator */}
              <span
                className={cn(
                  "ow-step-num flex-none mt-0.5 w-[15px] h-[15px] rounded-full flex items-center justify-center text-[0.5625rem] font-mono leading-none transition-colors",
                  isDone && "ow-step-num--done border border-[var(--ok)] bg-[var(--ok)] text-[var(--bg)] font-bold",
                  isRunning && "ow-step-num--running border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-bold animate-pulse",
                  !isDone && !isRunning && "ow-step-num--pending border border-[var(--border)] bg-transparent text-[var(--muted-fg)]"
                )}
              >
                {isDone ? '✓' : isRunning ? (
                  <span
                    className="inline-block w-2 h-2 rounded-full border-[1.5px] border-t-transparent border-[var(--accent)] animate-ow-spin"
                  />
                ) : (
                  idx + 1
                )}
              </span>

              {/* Step Title & Details */}
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[0.78125rem] font-sans leading-snug",
                    isRunning ? "text-[var(--fg)] font-medium" : isDone ? "text-[var(--fg)]" : "text-[var(--muted-fg)]"
                  )}
                >
                  {step.title}
                </div>
                {step.detail && (
                  <div className="text-[0.6875rem] text-[var(--muted-fg)] mt-0.5 font-sans leading-tight">
                    {step.detail}
                  </div>
                )}
              </div>

              {/* Step Duration / Tabular Meta */}
              {step.duration && (
                <span className="flex-none font-mono text-[0.65625rem] text-[var(--muted-fg)] tabular-nums ml-auto pl-2">
                  {step.duration}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OpenWorkPlanCard;
