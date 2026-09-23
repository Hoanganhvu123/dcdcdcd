import React, { useEffect, useRef } from 'react';
import {
  Calculator,
  Presentation,
  FileText,
  TrendingUp,
  Sparkles,
  CornerDownLeft,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { SlashCommandDefinition } from './slash-commands';
import { cn } from '@/lib/utils';

export interface OpenWorkSlashMenuProps {
  isOpen: boolean;
  commands: SlashCommandDefinition[];
  selectedIndex: number;
  onSelect: (command: SlashCommandDefinition) => void;
  onClose: () => void;
  onHoverIndex?: (index: number) => void;
  query?: string;
  className?: string;
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Calculator,
  Presentation,
  FileText,
  TrendingUp,
};

const TAB_LABEL_MAP: Record<string, { label: string; colorClass: string }> = {
  excel: { label: 'Excel Studio', colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  slide: { label: 'Slide 16:9', colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  docx: { label: 'Word A4', colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  chart: { label: 'Chart Analytics', colorClass: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
};

export const OpenWorkSlashMenu: React.FC<OpenWorkSlashMenuProps> = ({
  isOpen,
  commands,
  selectedIndex,
  onSelect,
  onClose,
  onHoverIndex,
  query = '',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll active item into view
  useEffect(() => {
    if (isOpen && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Danh sách lệnh tắt quy trình tự động"
      data-openwork-slash-menu="true"
      className={cn(
        'absolute bottom-full left-0 mb-2 w-full max-w-lg bg-[var(--card)] text-[var(--fg)] rounded-2xl border border-[var(--border)] shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md',
        className
      )}
    >
      {/* ── Header ── */}
      <div className="px-3.5 py-2.5 bg-[var(--muted)]/60 border-b border-[var(--hair)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Sparkles size={12} className="shrink-0" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg)]">
            Quy trình làm việc tự động
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[0.65625rem] text-[var(--muted-fg)]">
          {query ? (
            <span className="px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--fg)]">
              /{query}
            </span>
          ) : (
            <span>Gõ lệnh hoặc chọn bên dưới</span>
          )}
        </div>
      </div>

      {/* ── Command List ── */}
      <div className="p-1.5 flex flex-col gap-1 max-h-72 overflow-y-auto custom-scrollbar">
        {commands.length === 0 ? (
          <div className="py-6 px-4 text-center text-xs text-[var(--muted-fg)] flex flex-col items-center gap-1.5">
            <Layers size={20} className="text-[var(--muted-fg)]/50" />
            <span>Không tìm thấy quy trình phù hợp với &quot;{query}&quot;</span>
            <span className="text-[0.6875rem] text-[var(--muted-fg)]/80">
              Thử tìm &apos;revenue&apos;, &apos;slide&apos;, &apos;report&apos; hoặc &apos;executive&apos;
            </span>
          </div>
        ) : (
          commands.map((cmd, idx) => {
            const isSelected = idx === selectedIndex;
            const IconComponent = ICON_MAP[cmd.iconName] || Sparkles;
            const tabMeta = TAB_LABEL_MAP[cmd.targetTab] || {
              label: cmd.targetTab,
              colorClass: 'text-[var(--fg)] bg-[var(--muted)] border-[var(--border)]',
            };

            return (
              <button
                key={cmd.id}
                ref={isSelected ? selectedItemRef : null}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => onHoverIndex?.(idx)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-xl flex items-start gap-3 transition-all cursor-pointer border group/item select-none',
                  isSelected
                    ? 'bg-[var(--muted)] border-[var(--accent)]/40 shadow-xs ring-1 ring-[var(--accent)]/20'
                    : 'border-transparent hover:bg-[var(--muted)]/60 text-[var(--muted-fg)] hover:text-[var(--fg)]'
                )}
              >
                {/* Icon Container */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors border',
                    isSelected
                      ? 'bg-[var(--card)] text-[var(--accent)] border-[var(--border)] shadow-xs'
                      : 'bg-[var(--muted)]/80 text-[var(--muted-fg)] border-transparent group-hover/item:text-[var(--fg)]'
                  )}
                >
                  <IconComponent size={16} className="shrink-0" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'text-xs font-semibold font-mono tracking-tight',
                        isSelected ? 'text-[var(--accent)]' : 'text-[var(--fg)]'
                      )}
                    >
                      {cmd.command}
                    </span>
                    <span className="text-xs font-medium text-[var(--fg)] truncate">
                      {cmd.title}
                    </span>
                    <span
                      className={cn(
                        'text-[0.625rem] px-1.5 py-0.2 rounded-full border font-mono font-medium ml-auto shrink-0',
                        tabMeta.colorClass
                      )}
                    >
                      {cmd.badge || tabMeta.label}
                    </span>
                  </div>

                  <p className="text-[0.71875rem] text-[var(--muted-fg)] line-clamp-1 mt-0.5 leading-snug">
                    {cmd.description}
                  </p>

                  {/* Plan Steps Indicator */}
                  {cmd.planSteps && cmd.planSteps.length > 0 && (
                    <div className="mt-1 flex items-center gap-1.5 text-[0.65625rem] text-[var(--muted-fg)] font-mono">
                      <span className="inline-flex items-center gap-1 text-[var(--accent)] font-medium">
                        <Layers size={10} />
                        {cmd.planSteps.length} bước
                      </span>
                      <span>·</span>
                      <span className="truncate text-[var(--muted-fg)]/80">
                        {cmd.planSteps[0].title}
                      </span>
                    </div>
                  )}
                </div>

                {/* Return Hint Icon */}
                <div
                  className={cn(
                    'shrink-0 self-center opacity-0 transition-opacity flex items-center gap-1',
                    isSelected && 'opacity-100'
                  )}
                >
                  <span className="text-[0.625rem] font-mono text-[var(--muted-fg)] hidden sm:inline">Chọn</span>
                  <div className="p-1 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--muted-fg)]">
                    <CornerDownLeft size={11} />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-3.5 py-2 bg-[var(--muted)]/40 border-t border-[var(--hair)] flex items-center justify-between text-[0.6875rem] text-[var(--muted-fg)] select-none">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 font-mono">
            <kbd className="px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[0.625rem]">↑</kbd>
            <kbd className="px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[0.625rem]">↓</kbd>
            <span className="ml-0.5">di chuyển</span>
          </span>
          <span className="inline-flex items-center gap-1 font-mono">
            <kbd className="px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[0.625rem]">↵</kbd>
            <span className="ml-0.5">chạy</span>
          </span>
          <span className="inline-flex items-center gap-1 font-mono">
            <kbd className="px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[0.625rem]">Esc</kbd>
            <span className="ml-0.5">đóng</span>
          </span>
        </div>
        <span className="text-[0.65625rem] font-medium text-[var(--accent)] hidden sm:inline">
          Autonomous Plan Dispatcher
        </span>
      </div>
    </div>
  );
};

export default OpenWorkSlashMenu;
