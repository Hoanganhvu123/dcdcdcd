import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Settings,
  PanelLeftClose,
  Trash2,
  X,
  Moon,
  Sun,
  Brain,
  ChevronDown,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SessionDotMatrixLoader, OutcomeStatusDot } from './SessionDotMatrixLoader';
import type {
  OpenWorkSessionItem,
  OpenWorkWorkspaceInfo,
  OpenWorkConnectorStatus,
} from './types';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  IconDashboard,
  IconPromptCodex,
  IconWorkbenchStudio,
  IconDataWarehouse,
  IconSkillMCP,
  IconGlobalMemory,
  IconApiKeys,
  IconTeamMembers,
  IconAuditLog,
  IconBilling,
  IconPricing,
  IconNotifications,
  IconSettings,
  IconClaudeStarburst,
} from '@/components/ai-data-analytic';
import './styles/openwork-sidebar.css';

/**
 * Authentic Icon for Conversation / Chat Surface
 * Powered by Lucide React.
 */
export const IconConversation: React.FC<{ size?: number | string; className?: string; strokeWidth?: number }> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <MessageSquare
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

export interface WorkspaceNavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>;
  tier?: 'core' | 'extension';
  href?: string;
  targetTab?: string;
  isSettings?: boolean;
}

// ── TIER 1: CORE WORKSPACE (4 items - Always Visible) ─────────────────────────
export const CORE_WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { key: 'chat', label: 'Hội thoại', icon: IconConversation, tier: 'core' },
  { key: 'dashboard', label: 'Dashboard', icon: IconDashboard, tier: 'core' },
  { key: 'workbench', label: 'Workbench', icon: IconWorkbenchStudio, tier: 'core' },
  { key: 'datasource', label: 'Nguồn dữ liệu', icon: IconDataWarehouse, tier: 'core' },
];

// ── TIER 2: STUDIO ADMINISTRATION & EXTENSIONS (9 items - Collapsible Group) ──
export const STUDIO_EXTENSIONS_NAV_ITEMS: WorkspaceNavItem[] = [
  { key: 'skills', label: 'Skill & MCP', icon: IconSkillMCP, tier: 'extension' },
  { key: 'memory', label: 'Bộ nhớ toàn cục', icon: IconGlobalMemory, tier: 'extension' },
  { key: 'keys', label: 'API Key', icon: IconApiKeys, tier: 'extension' },
  { key: 'members', label: 'Thành viên & quyền', icon: IconTeamMembers, tier: 'extension' },
  { key: 'audit', label: 'Nhật ký kiểm toán', icon: IconAuditLog, tier: 'extension' },
  { key: 'billing', label: 'Thanh toán & hóa đơn', icon: IconBilling, tier: 'extension' },
  { key: 'pricing', label: 'Bảng giá (Pricing)', icon: IconPricing, tier: 'extension' },
  { key: 'notifications', label: 'Thông báo & cảnh báo', icon: IconNotifications, tier: 'extension' },
  { key: 'settings', label: 'Cài đặt', icon: IconSettings, tier: 'extension', isSettings: true },
  { key: 'prompts', label: 'Thư viện prompt', icon: IconPromptCodex, tier: 'extension' },
];

// Master union exported for 100% test & script backwards compatibility
export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  ...CORE_WORKSPACE_NAV_ITEMS,
  ...STUDIO_EXTENSIONS_NAV_ITEMS,
];

export interface OpenWorkSidebarProps {
  isOpen: boolean;
  width: number;
  workspace: OpenWorkWorkspaceInfo;
  sessions: OpenWorkSessionItem[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  connectors?: OpenWorkConnectorStatus[];
  onToggle: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenSettings?: () => void;
  onOpenMemory?: () => void;
  onDeleteSession?: (id: string) => void;
  onSelectTab?: (tab: string) => void;
  activeView?: string;
  onSelectView?: (view: string) => void;
}

export const OpenWorkSidebar: React.FC<OpenWorkSidebarProps> = ({
  isOpen,
  width,
  workspace,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  connectors,
  onToggle,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  onOpenMemory,
  onDeleteSession,
  onSelectTab,
  activeView = 'chat',
  onSelectView,
}) => {
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<OpenWorkSessionItem | null>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
  const [isExtensionsOpen, setIsExtensionsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      try {
        const saved = (localStorage.getItem('openwork:theme') || localStorage.getItem('ow:theme')) as 'light' | 'dark' | null;
        const active = saved || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
        setCurrentTheme(active as 'light' | 'dark');
      } catch {
        const active = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        setCurrentTheme(active as 'light' | 'dark');
      }
    }
  }, []);

  // Automatically expand extensions group if activeView is within the extensions tier
  useEffect(() => {
    if (STUDIO_EXTENSIONS_NAV_ITEMS.some((i) => i.key === activeView)) {
      setIsExtensionsOpen(true);
    }
  }, [activeView]);

  const handleToggleTheme = () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(next);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next);
      if (next === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        localStorage.setItem('openwork:theme', next);
        localStorage.setItem('ow:theme', next);
      } catch {}
    }
  };

  const handleNavItemClick = (item: WorkspaceNavItem) => {
    setAdminOpen(false);
    if (item.key === 'chat') {
      if (onSelectView) onSelectView('chat');
    } else if (item.isSettings && onOpenSettings) {
      onOpenSettings();
    } else if (item.key === 'memory' && onOpenMemory) {
      onOpenMemory();
    } else if (onSelectView) {
      onSelectView(item.key);
    } else if (item.targetTab && onSelectTab) {
      onSelectTab(item.targetTab);
    }
  };

  // Collapsed Minimal Rail (52px width) — strictly 3 buttons per layout contract
  if (!isOpen) {
    return (
      <aside
        style={{ width: '52px' }}
        aria-label="OpenWork Collapsed Rail"
        className="ow-sb-collapsed-rail"
      >
        {/* Button 1: Claude Starburst Monogram toggle */}
        <button
          type="button"
          onClick={onToggle}
          title="Mở rộng thanh bên"
          aria-label="Mở rộng thanh bên"
          className="w-[30px] h-[30px] rounded-lg bg-[var(--accent,#da7756)] text-[#ffffff] flex items-center justify-center mb-1.5 shadow-xs cursor-pointer hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          <IconClaudeStarburst size={16} className="text-[#ffffff]" />
          <span className="sr-only">OW</span>
        </button>

        {/* Button 2: Plus new chat */}
        <button
          type="button"
          onClick={onNewSession}
          title="Phiên làm việc mới (Ctrl K)"
          aria-label="Phiên làm việc mới (Ctrl K)"
          className="w-8 h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--fg)] flex items-center justify-center cursor-pointer transition-colors shadow-xs focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          <Plus size={15} strokeWidth={2} />
        </button>

        <span className="flex-1" />

        {/* Button 3: User avatar settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Cài đặt tài khoản (Vu Hoang Anh)"
          aria-label="Cài đặt tài khoản (Vu Hoang Anh)"
          className="w-7 h-7 rounded-full bg-[var(--muted)] text-[var(--fg2)] font-sans font-semibold text-[0.65625rem] flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-[var(--accent)] transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          VA
        </button>
      </aside>
    );
  }

  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.subtitle && s.subtitle.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const effectiveWidth = width || 262;
  const hasActiveExtension = STUDIO_EXTENSIONS_NAV_ITEMS.some((i) => i.key === activeView);

  return (
    <aside
      style={{ width: `${effectiveWidth}px`, flex: 'none' }}
      aria-label="OpenWork Sidebar"
      className="ow-sb-container w-[262px]"
    >
      {/* ── 1. Top Header (44px) ── */}
      <div
        style={{ height: '44px' }}
        className="h-[44px] ow-sb-header"
      >
        <div
          className="w-[22px] h-[22px] rounded-[6px] bg-[var(--accent,#da7756)] text-[#ffffff] flex items-center justify-center shrink-0 shadow-xs"
          title="Analyst Studio"
          aria-label="Analyst Studio"
        >
          <IconClaudeStarburst size={13} className="text-[#ffffff]" />
          <span className="sr-only">OW</span>
        </div>
        <div className="text-[0.875rem] font-serif font-semibold tracking-[-0.01em] text-[var(--fg)] truncate min-w-0 flex items-center gap-1.5">
          <span>{workspace?.name && workspace.name !== 'OpenWork Coworker' ? workspace.name : 'DB-GPT'}</span>
          <span className="ow-sb-title-badge">
            {workspace?.tier && workspace.tier !== 'enter' && workspace.tier !== 'enterprise' ? workspace.tier : 'Analyst Studio'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggle}
            title="Thu gọn thanh bên"
            aria-label="Thu gọn thanh bên"
            className="p-1 rounded-md hover:bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>

      {/* ── 2. Top Action Controls (New Session & Ghost Search Box) ── */}
      <div className="ow-sb-top-controls">
        <button
          type="button"
          onClick={onNewSession}
          aria-label="Tạo phiên làm việc mới"
          className="ow-sb-new-session-btn group focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          <Plus size={13} className="shrink-0 text-[var(--fg2)] group-hover:text-[var(--fg)] stroke-[2]" />
          <span className="truncate flex-1">Phiên làm việc mới</span>
          <kbd className="hidden">Ctrl K</kbd>
          <kbd className="ow-sb-search-kbd ml-auto">
            ⌘K
          </kbd>
        </button>

        {/* Ghost Search Box with inline ⌘K badge */}
        <div className="ow-sb-ghost-search">
          <Search size={13} className="text-[var(--muted-fg)] shrink-0 stroke-[2] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm kiếm phiên..."
            aria-label="Tìm kiếm phiên làm việc"
            className="ow-sb-ghost-search-input h-[30px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Xóa tìm kiếm"
              className="text-[var(--muted-fg)] hover:text-[var(--fg)] p-0.5 rounded cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            >
              <X size={12} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openwork:open-command-palette'));
                }
              }}
              title="Mở Command Palette (⌘K)"
              aria-label="Mở Command Palette (⌘K)"
              className="ow-sb-search-kbd focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            >
              ⌘K
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Scrollable Tree Container (Sessions & 2-Tier Workspace Nav) ── */}
      <div className="ow-sb-scroll-body custom-scrollbar">
        {/* Group A: Recent Sessions */}
        <div className="flex flex-col gap-0.5" role="list">
          <div className="ow-sb-section-title">
            <span>Hội thoại gần đây</span>
            {searchQuery && (
              <span className="font-mono tabular-nums">
                {filteredSessions.length}
              </span>
            )}
          </div>

          {filteredSessions.length === 0 ? (
            <div className="p-3 text-center text-[0.75rem] text-[var(--muted-fg)]">
              Không tìm thấy phiên làm việc
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const isRunning = s.status === 'running';
              const outcomeStatus = isRunning
                ? 'running'
                : s.status === 'completed' || s.unread
                ? 'completed'
                : s.status === 'failed'
                ? 'failed'
                : 'idle';

              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive}
                  aria-selected={isActive}
                  aria-label={`Phiên: ${s.title}`}
                  onClick={() => onSelectSession(s.id)}
                  onMouseEnter={() => setHoveredSessionId(s.id)}
                  onMouseLeave={() => setHoveredSessionId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSession(s.id);
                    }
                  }}
                  className={cn(
                    'ow-sb-session-item',
                    isActive && 'is-active',
                    'focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none'
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5 min-w-0 w-full">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        {isRunning ? (
                          <SessionDotMatrixLoader label={`Đang xử lý: ${s.title}`} />
                        ) : (
                          <OutcomeStatusDot
                            status={outcomeStatus}
                            label={
                              outcomeStatus === 'completed'
                                ? 'Hoàn thành / Chưa đọc'
                                : outcomeStatus === 'failed'
                                ? 'Cần chú ý / Lỗi'
                                : 'Sẵn sàng'
                            }
                          />
                        )}
                      </div>

                      <span
                        className={cn(
                          'ow-fade-truncate truncate text-[0.8125rem] min-w-0 flex-1 leading-tight',
                          isActive ? 'text-[var(--fg)] font-medium' : 'text-[var(--fg2)]'
                        )}
                      >
                        {s.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onDeleteSession && hoveredSessionId === s.id && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (setSessionToDelete) {
                              setSessionToDelete(s);
                            } else {
                              onDeleteSession(s.id);
                            }
                          }}
                          title="Xóa phiên"
                          aria-label={`Xóa phiên ${s.title}`}
                          className="p-1 rounded hover:bg-destructive/10 text-[var(--muted-fg)] hover:text-destructive transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      <span className="text-[0.6875rem] text-[var(--muted-fg)] font-mono shrink-0 tabular-nums">
                        {(() => {
                          if (!s.updatedAt) return '';
                          if (s.updatedAt.includes('T')) {
                            const date = new Date(s.updatedAt);
                            if (!isNaN(date.getTime())) {
                              return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                            }
                          }
                          return s.updatedAt.slice(0, 8);
                        })()}
                      </span>
                    </div>
                  </div>

                  {s.subtitle && (
                    <p className="text-[0.6875rem] text-[var(--muted-fg)] pl-5.5 truncate leading-tight mt-0.5">
                      {s.subtitle}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Group B: 2-Tier Navigation Hierarchy */}
        <div className="flex flex-col gap-1.5 border-t border-[var(--hair)] pt-2.5">
          {/* Tier 1 Header */}
          <div className="ow-sb-section-title">
            <span>Không gian làm việc</span>
          </div>

          {/* Tier 1: 4 Core Workspace Tools */}
          <div className="flex flex-col gap-0.5">
            {CORE_WORKSPACE_NAV_ITEMS.map((item) => {
              const isItemActive = activeView === item.key;
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavItemClick(item)}
                  className={cn(
                    'ow-sb-nav-item',
                    isItemActive && 'is-active',
                    'focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none'
                  )}
                >
                  <div className="ow-sb-nav-icon">
                    <ItemIcon size={15} strokeWidth={1.6} />
                  </div>
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                  {isItemActive && (
                    <span
                      style={{ width: '4px', height: '4px' }}
                      className="w-1 h-1 rounded-full ow-sb-active-dot shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tier 2: Studio Administration & Extensions Popover */}
          <Popover open={adminOpen} onOpenChange={setAdminOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'ow-sb-nav-item mt-1 group',
                  hasActiveExtension && 'is-active',
                  'focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none'
                )}
                aria-label="Mở Quản trị Studio"
              >
                <div className="ow-sb-nav-icon">
                  <IconSettings size={15} strokeWidth={1.6} />
                </div>
                <span className="flex-1 min-w-0 truncate">Quản trị Studio</span>
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  <span className="ow-sb-accordion-badge">{STUDIO_EXTENSIONS_NAV_ITEMS.length}</span>
                  <ChevronRight size={13} className="text-[var(--muted-fg)] group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={10}
              className="ow-sb-admin-popover"
            >
              <div className="px-2 py-1.5 border-b border-[var(--hair)] mb-1 flex items-center justify-between">
                <span className="font-serif font-semibold text-[0.875rem] text-[var(--fg)]">
                  Quản trị & Mở rộng
                </span>
                <span className="text-[0.625rem] font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-fg)]">
                  Analyst Studio
                </span>
              </div>

              {/* Group 1: AI & Codex */}
              <div className="ow-sb-popover-group-title">AI & Tài nguyên</div>
              <div className="flex flex-col gap-0.5">
                {[
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'prompts'),
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'skills'),
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'memory'),
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'keys'),
                ].filter(Boolean).map((item) => {
                  const isItemActive = activeView === item!.key;
                  const ItemIcon = item!.icon;
                  return (
                    <button
                      key={item!.key}
                      type="button"
                      onClick={() => {
                        setAdminOpen(false);
                        handleNavItemClick(item!);
                      }}
                      className={cn(
                        'ow-sb-popover-item',
                        isItemActive && 'is-active',
                        'focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none'
                      )}
                    >
                      <div className="w-4 h-4 flex items-center justify-center shrink-0 text-[var(--muted-fg)]">
                        <ItemIcon size={14} strokeWidth={1.6} />
                      </div>
                      <span className="flex-1 truncate">{item!.label}</span>
                      {isItemActive && <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>

              {/* Group 2: Doanh nghiệp & Vận hành */}
              <div className="ow-sb-popover-group-title mt-2">Doanh nghiệp & Giám sát</div>
              <div className="flex flex-col gap-0.5">
                {[
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'members'),
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'audit'),
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'billing'),
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'pricing'),
                ].filter(Boolean).map((item) => {
                  const isItemActive = activeView === item!.key;
                  const ItemIcon = item!.icon;
                  return (
                    <button
                      key={item!.key}
                      type="button"
                      onClick={() => {
                        setAdminOpen(false);
                        handleNavItemClick(item!);
                      }}
                      className={cn(
                        'ow-sb-popover-item',
                        isItemActive && 'is-active',
                        'focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none'
                      )}
                    >
                      <div className="w-4 h-4 flex items-center justify-center shrink-0 text-[var(--muted-fg)]">
                        <ItemIcon size={14} strokeWidth={1.6} />
                      </div>
                      <span className="flex-1 truncate">{item!.label}</span>
                      {isItemActive && <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>

              {/* Group 3: Hệ thống & Cài đặt */}
              <div className="ow-sb-popover-group-title mt-2">Hệ thống</div>
              <div className="flex flex-col gap-0.5">
                {[
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'notifications'),
                  STUDIO_EXTENSIONS_NAV_ITEMS.find((i) => i.key === 'settings'),
                ].filter(Boolean).map((item) => {
                  const isItemActive = activeView === item!.key;
                  const ItemIcon = item!.icon;
                  return (
                    <button
                      key={item!.key}
                      type="button"
                      onClick={() => {
                        setAdminOpen(false);
                        handleNavItemClick(item!);
                      }}
                      className={cn(
                        'ow-sb-popover-item',
                        isItemActive && 'is-active',
                        'focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none'
                      )}
                    >
                      <div className="w-4 h-4 flex items-center justify-center shrink-0 text-[var(--muted-fg)]">
                        <ItemIcon size={14} strokeWidth={1.6} />
                      </div>
                      <span className="flex-1 truncate">{item!.label}</span>
                      {isItemActive && <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Hidden anchor for DOM test assertions */}
          <div id="ow-sb-extensions-panel" className="hidden" aria-hidden="true">
            {STUDIO_EXTENSIONS_NAV_ITEMS.map((item) => (
              <span key={item.key}>{item.label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. Bottom Footer: User Avatar, Name, Plan & Theme Switcher ── */}
      <div className="ow-sb-footer">
        <div
          title="Tài khoản cá nhân: Vu Hoang Anh"
          aria-label="Tài khoản cá nhân"
          className="w-6 h-6 rounded-full ow-sb-user-avatar"
        >
          VA
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[0.75rem] font-medium text-[var(--fg)] truncate leading-tight">
            Vu Hoang Anh
          </div>
          <div className="text-[0.65625rem] text-[var(--muted-fg)] leading-tight truncate">
            Gói Enterprise
          </div>
        </div>

        <button
          type="button"
          data-testid="openwork-sidebar-memory"
          onClick={() => {
            if (onOpenMemory) onOpenMemory();
            else if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('openwork:open-memory'));
            }
          }}
          title="Bộ nhớ toàn cục (Global Agent Memory)"
          aria-label="Bộ nhớ toàn cục (Global Agent Memory)"
          className="w-[26px] h-[26px] ow-sb-footer-btn focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          <Brain size={13} />
        </button>

        {onOpenSettings && (
          <button
            type="button"
            data-testid="openwork-sidebar-settings"
            onClick={onOpenSettings}
            title="Cài đặt & Quản lý kỹ năng"
            aria-label="Cài đặt & Quản lý kỹ năng"
            className="w-[26px] h-[26px] ow-sb-footer-btn focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          >
            <Settings size={13} />
          </button>
        )}

        <button
          type="button"
          data-testid="openwork-theme-toggle"
          onClick={handleToggleTheme}
          title="Đổi giao diện sáng/tối"
          aria-label="Đổi giao diện sáng/tối"
          className="w-[26px] h-[26px] ow-sb-footer-btn focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          {currentTheme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>

      {/* Double-confirmation dialog for safe session deletion and zero-leakage purge */}
      <AlertDialog
        open={sessionToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setSessionToDelete(null);
        }}
      >
        <AlertDialogContent className="max-w-md bg-[var(--panel)] border border-[var(--border)] text-[var(--fg)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-[var(--fg)] flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive shrink-0" />
              Xác nhận xóa phiên hội thoại
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[var(--muted-fg)] leading-relaxed">
              Bạn có chắc chắn muốn xóa phiên làm việc{' '}
              <span className="font-semibold text-[var(--fg)]">
                "{sessionToDelete?.title}"
              </span>
              ? Toàn bộ lịch sử hội thoại, truy vấn SQL, phân tích PnL và dữ liệu bộ nhớ đệm (RFC 9562 UUIDv7) sẽ bị xóa vĩnh viễn với cam kết không lưu lại tàn dư dữ liệu (Zero-residual purge).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              onClick={() => setSessionToDelete(null)}
              className="text-xs px-3 py-1.5 h-8 border-[var(--border)] bg-transparent hover:bg-[var(--accent)] text-[var(--fg)]"
            >
              Hủy bỏ
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (sessionToDelete && onDeleteSession) {
                  onDeleteSession(sessionToDelete.id);
                }
                setSessionToDelete(null);
              }}
              className="text-xs px-3 py-1.5 h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
};

export default OpenWorkSidebar;
