import React from 'react';
import { cn } from '@/lib/utils';

export interface KeyFindingPoint {
  n?: number | string;
  title: string;
  body?: string;
  value?: string;
  tone?: 'ok' | 'err' | 'accent' | 'neutral' | string;
}

export interface OpenWorkKeyFindingsCardProps {
  title?: string;
  points: (string | KeyFindingPoint)[];
  className?: string;
}

export function parseFindingPoint(point: string | KeyFindingPoint, idx: number): KeyFindingPoint {
  if (typeof point === 'object' && point !== null) {
    return {
      n: point.n ?? (idx + 1),
      title: point.title,
      body: point.body,
      value: point.value,
      tone: point.tone,
    };
  }

  // Parse formatted string: "Title — Body: +34%" or "Title: +34%"
  const text = String(point);
  const colonIdx = text.lastIndexOf(':');
  if (colonIdx > 0 && colonIdx > text.length - 25) {
    const valuePart = text.slice(colonIdx + 1).trim();
    const mainPart = text.slice(0, colonIdx).trim();
    const dashIdx = mainPart.indexOf('—') !== -1 ? mainPart.indexOf('—') : mainPart.indexOf('-');
    
    if (dashIdx > 0) {
      const title = mainPart.slice(0, dashIdx).trim();
      const body = mainPart.slice(dashIdx + 1).trim();
      return {
        n: idx + 1,
        title,
        body,
        value: valuePart,
        tone: valuePart.includes('-') ? 'err' : valuePart.includes('+') ? 'ok' : 'neutral',
      };
    }

    return {
      n: idx + 1,
      title: mainPart,
      value: valuePart,
      tone: valuePart.includes('-') ? 'err' : valuePart.includes('+') ? 'ok' : 'neutral',
    };
  }

  return {
    n: idx + 1,
    title: text,
  };
}

export function resolveToneColor(tone?: string): string {
  switch (tone) {
    case 'ok':
      return 'var(--ok)';
    case 'err':
      return 'var(--err)';
    case 'accent':
      return 'var(--accent)';
    case 'c1':
    case 'amber':
      return 'var(--c1, #b45309)';
    case 'c2':
    case 'sky':
      return 'var(--c2, #0284c7)';
    case 'c3':
    case 'emerald':
      return 'var(--c3, #059669)';
    default:
      return 'var(--fg)';
  }
}

/**
 * OpenWorkKeyFindingsCard
 * Key findings card matching Chat DeepThink.dc.html:201-214:
 * - Numbered rows with Geist Mono step indices
 * - Title and body description
 * - Right-aligned semantic tone values (+28%, -4.2%, etc.)
 */
export const OpenWorkKeyFindingsCard: React.FC<OpenWorkKeyFindingsCardProps> = ({
  title = 'Kết luận chính',
  points,
  className = '',
}) => {
  if (!points || points.length === 0) return null;

  return (
    <div
      className={cn(
        "ow-findings-card border border-[var(--border)] bg-[var(--card)] rounded-[11px] shadow-[var(--shadow)] overflow-hidden animate-ow-in my-2.5 not-prose",
        className
      )}
    >
      <div className="px-[13px] py-[9px] border-b border-[var(--hair)] font-sans text-[0.78125rem] font-medium text-[var(--fg)]">
        {title}
      </div>
      <div className="flex flex-col">
        {points.map((rawPoint, idx) => {
          const pt = parseFindingPoint(rawPoint, idx);
          return (
            <div
              key={`finding-${idx}-${pt.title.slice(0, 15)}`}
              className="ow-findings-row flex flex-wrap sm:flex-nowrap items-start gap-2 px-[13px] py-[9px] border-t border-[var(--hair)] first:border-t-0"
            >
              <span className="shrink-0 font-mono text-[0.65625rem] text-[var(--muted-fg)] pt-0.5 tabular-nums">
                {pt.n}
              </span>
              <div className="min-w-0 flex-1 basis-[160px]">
                <div className="font-sans text-[0.78125rem] font-medium leading-[1.6] text-[var(--fg)]">
                  {pt.title}
                </div>
                {pt.body && (
                  <div className="font-sans text-[0.71875rem] leading-[1.6] text-[var(--muted-fg)] mt-0.5">
                    {pt.body}
                  </div>
                )}
              </div>
              {pt.value && (
                <span
                  className="shrink-0 font-mono text-[0.75rem] font-medium tabular-nums whitespace-nowrap self-start sm:self-auto sm:ml-auto"
                  style={{ color: resolveToneColor(pt.tone) }}
                >
                  {pt.value}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OpenWorkKeyFindingsCard;
