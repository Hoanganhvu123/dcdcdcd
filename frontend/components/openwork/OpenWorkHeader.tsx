import React, { useState, useEffect, useCallback } from 'react';
import {
  PanelLeft,
  PanelRight,
  Share2,
  Square,
  Radio,
  Brain,
  Settings as SettingsIcon,
  Plus,
} from 'lucide-react';
import { SvgSqlDatabase, SvgPythonSandbox, SvgExcelMatrix } from '../ai-data-analytic/icons/AnalyticsSvgIcons';
import type { DatasourceItem } from './types';
import { cn } from '@/lib/utils';
import './styles/openwork-header.css';

export type DatasourceHeaderItem = DatasourceItem;

export interface OpenWorkHeaderProps {
  workspaceName?: string;
  sessionTitle?: string;
  selectedModel?: string;
  availableModels?: string[];
  onSelectModel?: (model: string) => void;
  selectedDatasource?: DatasourceItem | string | null;
  selectedDatasourceId?: string | null;
  availableDatasources?: DatasourceItem[];
  onSelectDatasource?: (ds: DatasourceItem) => void;
  agentStatus?: 'idle' | 'thinking' | 'executing' | string;
  isStreaming?: boolean;
  onStop?: () => void;
  onShare?: () => void;
  spotlightActive?: boolean;
  onToggleSpotlight?: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  workbenchOpen: boolean;
  onToggleWorkbench: () => void;
  onOpenSettings?: () => void;
  onOpenMemory?: () => void;
  memoryCount?: number;
  artifactCount?: number;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  systemPrompt?: string;
  onSystemPromptChange?: (prompt: string) => void;
  onResetSystemPrompt?: () => void;
  onClearChat?: () => void;
  onNewSession?: () => void;
}

export const OpenWorkHeader: React.FC<OpenWorkHeaderProps> = ({
  workspaceName = 'DB-GPT Workspace',
  sessionTitle,
  selectedModel = 'deepseek-v4-flash',
  selectedDatasource,
  selectedDatasourceId,
  availableDatasources,
  onSelectDatasource,
  agentStatus = 'idle',
  isStreaming = false,
  onStop,
  onShare,
  spotlightActive = false,
  onToggleSpotlight,
  sidebarOpen,
  onToggleSidebar,
  workbenchOpen,
  onToggleWorkbench,
  onOpenSettings,
  onOpenMemory,
  memoryCount,
  artifactCount,
  theme: externalTheme,
  onToggleTheme: externalToggleTheme,
  onClearChat,
  onNewSession,
}) => {
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>('light');

  // Initialize theme from document or localStorage (default light warm canvas)
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('openwork:theme') as 'light' | 'dark' | null;
      const currentDocTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null;
      const isDark = document.documentElement.classList.contains('dark');

      const initialTheme = savedTheme || currentDocTheme || (isDark ? 'dark' : 'light');
      setLocalTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
      document.documentElement.classList.toggle('dark', initialTheme === 'dark');
      document.documentElement.classList.toggle('light', initialTheme === 'light');
    } catch {
      // ignore
    }
  }, []);

  const activeTheme = externalTheme || localTheme;

  const handleToggleTheme = useCallback(() => {
    if (externalToggleTheme) {
      externalToggleTheme();
      return;
    }
    const nextTheme = activeTheme === 'light' ? 'dark' : 'light';
    setLocalTheme(nextTheme);
    try {
      document.documentElement.setAttribute('data-theme', nextTheme);
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
      document.documentElement.classList.toggle('light', nextTheme === 'light');
      localStorage.setItem('openwork:theme', nextTheme);
      localStorage.setItem('ow:theme', nextTheme);
    } catch {
      // ignore
    }
  }, [activeTheme, externalToggleTheme]);

  const handleShareClick = useCallback(() => {
    if (onShare) {
      onShare();
      return;
    }
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {
        // ignore
      });
    }
  }, [onShare]);

  const displayTitle = sessionTitle || 'Phiên mới';
  const isCustomSession = Boolean(sessionTitle && sessionTitle !== 'Phiên mới');

  return (
    <div className="flex flex-col w-full shrink-0 z-20 select-none">
      {/* ── Cuccu Legal Inspired Integrated Workspace Task Bar ── */}
      <header className="group/header h-[44px] min-h-[44px] px-2.5 border-b border-border/80 bg-background/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0 transition-colors duration-150 sticky top-0">
        {/* ── Left: Sidebar drawer trigger, Title with Data Analytics Monogram & Live Status ── */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarOpen ? 'Đóng thanh bên (⌘B)' : 'Mở thanh bên (⌘B)'}
            aria-label="Toggle Sidebar"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[#66645e] dark:text-[#a09e96] hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <PanelLeft size={16} />
          </button>

          {/* Integrated Analytics Task Identifier (Cuccu Legal DNA) */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-[22px] h-[22px] rounded-[5px] bg-[#181716] dark:bg-[#f4f3f0] text-[#faf9f5] dark:text-[#181716] flex items-center justify-center font-mono text-[11px] font-bold shadow-xs shrink-0">
              <span>DA</span>
            </div>

            <span
              className="font-medium text-[0.8125rem] text-foreground min-w-0 flex-1 truncate max-w-[180px] sm:max-w-[260px] md:max-w-[340px] font-sans"
              title={displayTitle}
            >
              {displayTitle}
            </span>

            {artifactCount !== undefined && artifactCount > 0 && (
              <span className="hidden xl:inline-flex font-mono text-[10.5px] text-[var(--muted-fg)] border border-[var(--border)] rounded-[5px] px-1.5 py-0.5 shrink-0 tabular-nums">
                {artifactCount} artifact
              </span>
            )}
          </div>

          {/* Live Status Badge with Pulse Dot (Cuccu Legal Style) */}
          {agentStatus === 'thinking' && (
            <span className="inline-flex items-center gap-1.5 h-[20px] px-2 rounded-full bg-[var(--accent-soft,#fdf2ee)] text-[var(--accent,#da7756)] text-[0.6875rem] font-medium font-sans border border-[var(--accent-bd,#f0c4b5)] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent,#da7756)] animate-pulse shrink-0" />
              <span>Đang lập kế hoạch</span>
            </span>
          )}

          {agentStatus === 'executing' && (
            <span className="inline-flex items-center gap-1.5 h-[20px] px-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[0.6875rem] font-medium font-sans border border-emerald-500/20 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>Bước 3/5 · đang chạy</span>
            </span>
          )}

          {agentStatus !== 'thinking' && agentStatus !== 'executing' && agentStatus !== 'idle' && (
            <span className="hidden sm:inline-flex items-center gap-1.5 h-[20px] px-2 rounded-full bg-muted text-[#66645e] dark:text-[#a09e96] text-[0.6875rem] font-medium font-sans border border-border/40 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>{typeof agentStatus === 'string' ? agentStatus : 'Sẵn sàng'}</span>
            </span>
          )}
        </div>

        {/* ── Right: Telemetry metrics, Model pill, Share & Workbench Toggle ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Active Stream Abort Button */}
          {isStreaming && onStop && (
            <button
              type="button"
              onClick={onStop}
              title="Dừng phản hồi"
              aria-label="Dừng phản hồi"
              className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-md border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[0.71875rem] font-medium transition-colors cursor-pointer"
            >
              <Square size={10} className="fill-current text-rose-500" />
              <span>Dừng</span>
            </button>
          )}

          {/* Analytical Telemetry Capsule (Cuccu Legal DNA: e.g. 2 SQL · 1 Python) */}
          {!workbenchOpen && (
            <div className="hidden 2xl:inline-flex items-center gap-2 text-[11px] text-[#8a8880] font-sans px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.06]">
              <span className="flex items-center gap-1 text-[#55534e] dark:text-[#c4c2ba]">
                <SvgSqlDatabase size={12} className="text-[var(--accent,#da7756)]" /> 2 SQL
              </span>
              <span>·</span>
              <span className="flex items-center gap-1 text-[#55534e] dark:text-[#c4c2ba]">
                <SvgPythonSandbox size={12} className="text-emerald-500" /> 1 Sandbox
              </span>
            </div>
          )}

          {/* Model Tag with LED indicator */}
          {!workbenchOpen && (
            <div className="hidden xl:inline-flex items-center gap-1.5 text-[11px] font-sans font-medium text-[#55534e] dark:text-[#c4c2ba] px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>DeepSeek V4 Flash</span>
            </div>
          )}

          {/* Secondary Actions on Hover */}
          <div
            className={cn(
              'flex items-center gap-1 transition-opacity duration-150 focus-within:opacity-100 pointer-coarse:opacity-100',
              spotlightActive ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100'
            )}
          >
            {/* Spotlight Toggle */}
            {onToggleSpotlight && (
              <button
                type="button"
                onClick={onToggleSpotlight}
                title={spotlightActive ? 'Tắt Spotlight Agent' : 'Bật Spotlight Agent'}
                aria-label={spotlightActive ? 'Tắt Spotlight Agent' : 'Bật Spotlight Agent'}
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors cursor-pointer',
                  spotlightActive
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Radio size={14} className={spotlightActive ? 'animate-pulse' : ''} />
              </button>
            )}

            {/* Share Button */}
            <button
              type="button"
              onClick={handleShareClick}
              title="Chia sẻ phiên phân tích"
              aria-label="Chia sẻ phiên phân tích"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Share2 size={14} />
            </button>
          </div>

          {/* Memory Trigger */}
          <button
            type="button"
            onClick={onOpenMemory}
            title="Bộ nhớ phân tích (Memory)"
            aria-label="Mở bộ nhớ phân tích"
            className="relative inline-flex items-center justify-center w-7 h-7 rounded-md text-[#66645e] dark:text-[#a09e96] hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Brain size={14} />
            {typeof memoryCount === 'number' && memoryCount > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--accent,#da7756)]" />
            )}
          </button>

          {/* Settings Trigger */}
          {onOpenSettings && (
            <button
              type="button"
              data-testid="openwork-settings-trigger"
              onClick={onOpenSettings}
              title="Cài đặt hệ thống"
              aria-label="Mở cài đặt"
              className={cn(
                'inline-flex items-center justify-center w-7 h-7 rounded-md text-[#66645e] dark:text-[#a09e96] hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer',
                workbenchOpen && 'hidden lg:inline-flex'
              )}
            >
              <SettingsIcon size={14} />
            </button>
          )}

          {/* Right Workbench Split-view Toggle (Ảnh 3) */}
          <button
            type="button"
            onClick={onToggleWorkbench}
            title={workbenchOpen ? 'Thu gọn Studio (Workbench)' : 'Mở Studio kết quả (Workbench)'}
            aria-label="Toggle Workbench"
            className={cn(
              'inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[11px] font-medium transition-all shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              workbenchOpen
                ? 'w-7 px-0 text-[#66645e] dark:text-[#a09e96] hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border border-border/60'
                : 'px-2 bg-[#181716] text-[#faf9f5] dark:bg-[#f4f3f0] dark:text-[#181716] shadow-xs hover:bg-[#2b2927] dark:hover:bg-white'
            )}
          >
            <PanelRight size={14} />
            {!workbenchOpen && <span className="hidden sm:inline">Studio</span>}
          </button>
        </div>
      </header>
    </div>
  );
};
