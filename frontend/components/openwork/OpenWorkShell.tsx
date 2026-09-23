import React, { useEffect, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { OpenWorkSidebar } from './OpenWorkSidebar';
import { OpenWorkHeader } from './OpenWorkHeader';
import { OpenWorkChatSurface } from './OpenWorkChatSurface';
import { OpenWorkWorkbench } from './OpenWorkWorkbench';
import { OpenWorkSplitter } from './OpenWorkSplitter';
import { OpenWorkSettingsModal } from './OpenWorkSettingsModal';
import { OpenWorkMemoryDrawer } from './memory/OpenWorkMemoryDrawer';
import './styles/openwork-shell.css';
import {
  useOpenWorkStore,
  DEMO_SESSION_ID,
  MIN_LEFT_SIDEBAR_WIDTH,
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_RIGHT_WORKBENCH_WIDTH,
  MAX_RIGHT_WORKBENCH_WIDTH,
  DEFAULT_RIGHT_WORKBENCH_WIDTH,
  type OpenWorkView,
} from './useOpenWorkStore';
import {
  OpenWorkDashboardPage,
  OpenWorkDatasourcePage,
  OpenWorkSkillsMcpPage,
  OpenWorkApiKeysPage,
  OpenWorkMembersPage,
  OpenWorkAuditLogPage,
  OpenWorkBillingPage,
  OpenWorkPricingPage,
  OpenWorkPromptLibraryPage,
  OpenWorkNotificationsPage,
  OpenWorkCommandPalette,
  OpenWorkOnboardingPage,
  OpenWorkAuthPage,
  OpenWorkArtifactDetailPage,
  OpenWorkStatesGalleryPage,
} from './pages';
import { useControlActions } from '@/shell/control/control-provider';
import { cn } from '@/lib/utils';

export const CLASSICAL_LEFT_RAIL_WIDTH = 392;

export const OpenWorkShell: React.FC = () => {
  const store = useOpenWorkStore();

  // Viewport tracking & responsive drawer state
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // When workbench is open and screen width is < 960px (e.g. split-screen on small laptop),
  // showing 3 in-flow panels crushes the middle chat column.
  // In this mode, sidebar transitions to an overlay drawer on demand.
  const isDrawerMode = isMobile || (store.workbenchOpen && windowWidth < 960);

  // Sync viewport changes & auto-close drawer on desktop threshold
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setWindowWidth(w);
      const mobile = w < 768;
      setIsMobile(mobile);
      if (!mobile && !(store.workbenchOpen && w < 960)) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [store.workbenchOpen]);

  // Auto-close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileDrawerOpen]);

  // Global mousemove and mouseup drag handlers for resizers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (store.isDraggingSidebar) {
        const clamped = Math.max(
          MIN_LEFT_SIDEBAR_WIDTH,
          Math.min(MAX_LEFT_SIDEBAR_WIDTH, e.clientX)
        );
        store.setSidebarWidth(clamped);
      }

      if (store.isDraggingWorkbench) {
        const maxW = Math.min(
          MAX_RIGHT_WORKBENCH_WIDTH,
          window.innerWidth - (store.sidebarOpen ? store.sidebarWidth : 0) - 360
        );
        const clamped = Math.max(
          MIN_RIGHT_WORKBENCH_WIDTH,
          Math.min(maxW, window.innerWidth - e.clientX)
        );
        store.setWorkbenchWidth(clamped);
      }
    };

    const handleMouseUp = () => {
      store.setIsDraggingSidebar(false);
      store.setIsDraggingWorkbench(false);
    };

    if (store.isDraggingSidebar || store.isDraggingWorkbench) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [
    store.isDraggingSidebar,
    store.isDraggingWorkbench,
    store.sidebarOpen,
    store.sidebarWidth,
    store.setSidebarWidth,
    store.setWorkbenchWidth,
    store.setIsDraggingSidebar,
    store.setIsDraggingWorkbench,
  ]);

  // Global Ctrl+K / Cmd+K keyboard shortcut to trigger command palette (unlocked for composer textarea per R4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const activeEl = document.activeElement;
        // activeEl instanceof HTMLInputElement
        // activeEl instanceof HTMLTextAreaElement
        // activeEl?.getAttribute('contenteditable') === 'true'
        // Unlocked for composer textarea per R4
        e.preventDefault();
        store.toggleCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.toggleCommandPalette]);

  // Listen for openwork:open-command-palette custom event (from sidebar search badge / external triggers)
  useEffect(() => {
    const handleOpenCommandPalette = () => {
      store.setCommandPaletteOpen(true);
    };

    window.addEventListener('openwork:open-command-palette', handleOpenCommandPalette);
    return () => window.removeEventListener('openwork:open-command-palette', handleOpenCommandPalette);
  }, [store.setCommandPaletteOpen]);

  // Register Web Affordance Actions with Control Bridge
  useControlActions([
    {
      id: 'openwork.toggle_sidebar',
      label: 'Toggle Session Sidebar',
      description: 'Open or close the left session navigation panel.',
      kind: 'command',
      effects: { data: 'none', ui: 'layout', external: false },
      sideEffect: 'none',
      execute: () => store.toggleSidebar(),
    },
    {
      id: 'openwork.toggle_workbench',
      label: 'Toggle Artifact Workbench',
      description: 'Open or collapse the right-hand multi-artifact studio.',
      kind: 'command',
      effects: { data: 'none', ui: 'layout', external: false },
      sideEffect: 'none',
      execute: () => store.toggleWorkbench(),
    },
    {
      id: 'openwork.toggle_maximize',
      label: 'Toggle Fullscreen Maximization',
      description: 'Expand artifact workbench to 100% full-bleed view or restore split view.',
      kind: 'command',
      effects: { data: 'none', ui: 'layout', external: false },
      sideEffect: 'none',
      execute: () => store.toggleMaximized(),
    },
    {
      id: 'openwork.toggle_spotlight',
      label: 'Toggle Spotlight Pulse',
      description: 'Enable or disable the real-time agent action spotlight.',
      kind: 'command',
      effects: { data: 'none', ui: 'spotlight' as any, external: false },
      sideEffect: 'none',
      execute: () => store.toggleSpotlight(),
    },
    {
      id: 'openwork.select_tab',
      label: 'Select Artifact Tab',
      description: 'Switch active studio tab to excel, slide, docx, or code.',
      kind: 'command',
      effects: { data: 'none', ui: 'focus', external: false },
      sideEffect: 'none',
      execute: (args: any) => {
        if (args?.tab) {
          store.setActiveTab(args.tab);
        }
      },
    },
    {
      id: 'openwork.new_session',
      label: 'Create New Session',
      description: 'Start a fresh coworker chat session.',
      kind: 'command',
      effects: { data: 'write', ui: 'navigate', external: false },
      sideEffect: 'mutation',
      execute: () => {
        store.createNewSession();
        store.setActiveView('chat');
      },
    },
    {
      id: 'openwork.open_settings',
      label: 'Open Skill Manager',
      description: 'View and toggle autonomous agent skills and plugins.',
      kind: 'command',
      effects: { data: 'none', ui: 'dialog', external: false },
      sideEffect: 'none',
      execute: () => store.setSettingsOpen(true),
    },
    {
      id: 'openwork.navigate_view',
      label: 'Navigate View',
      description: 'Switch active view to a page (dashboard, datasource, skills, billing, etc.)',
      kind: 'command',
      effects: { data: 'none', ui: 'navigate', external: false },
      sideEffect: 'none',
      execute: (args: any) => {
        if (args?.view) {
          store.setActiveView(args.view as OpenWorkView);
        }
      },
    },
    {
      id: 'openwork.toggle_palette',
      label: 'Toggle Command Palette',
      description: 'Open or close the ⌘K command palette modal.',
      kind: 'command',
      effects: { data: 'none', ui: 'dialog', external: false },
      sideEffect: 'none',
      execute: () => store.toggleCommandPalette(),
    },
  ]);

  const activeSession =
    store.sessions.find((s) => s.id === store.activeSessionId) ||
    (store.activeSessionId === DEMO_SESSION_ID
      ? {
          id: DEMO_SESSION_ID,
          title: 'Phân tích PnL Q3 & Trích xuất Báo Cáo',
          subtitle: 'Đã hoàn tất trích xuất dữ liệu DW và tạo Artifacts',
          status: 'completed' as const,
          updatedAt: '10:30',
        }
      : {
          id: store.activeSessionId,
          title: 'Phiên làm việc mới',
          subtitle: 'Sẵn sàng nhận lệnh phân tích',
          status: 'idle' as const,
          updatedAt: 'Vừa xong',
        });

  const isThinking = store.streamParts.some((p) => p.type === 'reasoning' && p.isStreaming);
  const agentStatus: 'idle' | 'thinking' | 'executing' = !store.isStreaming
    ? 'idle'
    : isThinking
    ? 'thinking'
    : 'executing';

  const actualWorkbenchWidth = useMemo(() => {
    if (typeof window === 'undefined') return store.workbenchWidth;
    const sidebarFlexWidth = (!isDrawerMode && store.sidebarOpen)
      ? (store.sidebarWidth || CLASSICAL_LEFT_RAIL_WIDTH)
      : 0;
    const avail = windowWidth - sidebarFlexWidth;
    if (avail < 960) {
      return Math.round(avail * 0.5);
    }
    const maxAllowed = Math.max(MIN_RIGHT_WORKBENCH_WIDTH, avail - 520);
    return Math.min(store.workbenchWidth, maxAllowed);
  }, [store.workbenchWidth, store.sidebarOpen, store.sidebarWidth, isDrawerMode, windowWidth]);

  // Render main page content based on store.activeView
  const renderViewContent = () => {
    switch (store.activeView) {
      case 'dashboard':
        return <OpenWorkDashboardPage onAskData={() => store.setActiveView('chat')} />;
      case 'datasource':
        return <OpenWorkDatasourcePage />;
      case 'skills':
        return <OpenWorkSkillsMcpPage />;
      case 'keys':
        return <OpenWorkApiKeysPage />;
      case 'members':
        return <OpenWorkMembersPage />;
      case 'audit':
        return <OpenWorkAuditLogPage />;
      case 'billing':
        return (
          <OpenWorkBillingPage
            onViewPricing={() => store.setActiveView('pricing')}
          />
        );
      case 'pricing':
        return (
          <OpenWorkPricingPage
            onSelectPlan={() => store.setActiveView('billing')}
            onBack={() => store.setActiveView('chat')}
          />
        );
      case 'prompts':
        return (
          <OpenWorkPromptLibraryPage
            onUsePrompt={(p) => {
              store.setInputValue(p.promptText);
              store.setActiveView('chat');
            }}
          />
        );
      case 'notifications':
        return (
          <OpenWorkNotificationsPage
            onNavigateAction={(target) => store.setActiveView(target as OpenWorkView)}
          />
        );
      case 'onboarding':
        return (
          <OpenWorkOnboardingPage
            onComplete={() => store.setActiveView('chat')}
            onSkip={() => store.setActiveView('chat')}
          />
        );
      case 'auth':
        return (
          <OpenWorkAuthPage
            onLoginSuccess={() => store.setActiveView('chat')}
            onRegisterSuccess={() => store.setActiveView('chat')}
          />
        );
      case 'artifact-detail':
        return (
          <OpenWorkArtifactDetailPage
            onBack={() => store.setActiveView('chat')}
          />
        );
      case 'states':
        return (
          <OpenWorkStatesGalleryPage
            onNavigateHome={() => store.setActiveView('chat')}
          />
        );
      case 'chat':
      default:
        return (
          <div className="flex h-full w-full overflow-hidden">
            {/* ── Center Chat Surface ── */}
            <motion.div
              layout
              transition={
                store.isDraggingWorkbench
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 350, damping: 28 }
              }
              className={cn(
                "flex flex-col h-full overflow-hidden min-w-0",
                store.workbenchOpen
                  ? (isMobile ? "hidden w-0" : "w-[340px] flex-none border-r border-[var(--border,#27272a)]")
                  : "flex-1",
                store.isMaximized && "hidden w-0"
              )}
            >
              <OpenWorkChatSurface
                header={
                  <OpenWorkHeader
                    workspaceName={store.workspace.name}
                    sessionTitle={activeSession?.title || 'Autonomous Coworker'}
                    selectedModel={store.selectedModel}
                    availableModels={store.availableModels}
                    onSelectModel={store.setSelectedModel}
                    selectedDatasource={store.selectedDatasource}
                    selectedDatasourceId={store.selectedDatasourceId}
                    availableDatasources={store.availableDatasources}
                    onSelectDatasource={(ds) => store.setSelectedDatasourceId(ds.id)}
                    agentStatus={agentStatus}
                    spotlightActive={store.spotlightActive}
                    onToggleSpotlight={store.toggleSpotlight}
                    sidebarOpen={isDrawerMode ? mobileDrawerOpen : store.sidebarOpen}
                    onToggleSidebar={isDrawerMode ? () => setMobileDrawerOpen((prev) => !prev) : store.toggleSidebar}
                    workbenchOpen={store.workbenchOpen}
                    onToggleWorkbench={store.toggleWorkbench}
                    onOpenSettings={() => store.setSettingsOpen(true)}
                    onOpenMemory={() => store.setMemoryDrawerOpen(true)}
                    memoryCount={store.memoryCards.filter((m) => m.isEnabled !== false).length}
                    artifactCount={store.artifacts.length}
                  />
                }
                streamParts={store.streamParts}
                inputValue={store.inputValue}
                onInputChange={store.setInputValue}
                onSend={store.sendMessage}
                onStop={store.abortStream}
                isStreaming={store.isStreaming}
                selectedModel={store.selectedModel}
                availableModels={store.availableModels}
                onSelectModel={store.setSelectedModel}
                selectedDatasource={store.selectedDatasource}
                selectedDatasourceId={store.selectedDatasourceId}
                availableDatasources={store.availableDatasources}
                onSelectDatasource={(ds) => store.setSelectedDatasourceId(ds.id)}
                onSelectArtifactTab={(tab) => {
                  store.setActiveTab(tab);
                  if (!store.workbenchOpen) {
                    store.setWorkbenchOpen(true);
                  }
                }}
                onOpenSettings={() => store.setSettingsOpen(true)}
                onArtifactClick={store.openArtifactByPath}
                onSelectSlashCommand={store.dispatchSlashWorkflow}
                planMode={store.planMode}
                onPlanModeChange={store.setPlanMode}
                reasoningMode={store.reasoningMode}
                onReasoningModeChange={store.setReasoningMode}
                onForkMessage={store.forkSessionFromMessage}
                onRevertMessage={store.revertSessionToMessage}
                onEditMessage={store.editMessage}
                workbenchOpen={store.workbenchOpen}
              />
            </motion.div>

            {/* Right Splitter between Chat and Workbench */}
            {store.workbenchOpen && !store.isMaximized && !isMobile && (
              <OpenWorkSplitter
                direction="right"
                isDragging={store.isDraggingWorkbench}
                onMouseDown={(e) => {
                  e.preventDefault();
                  store.setIsDraggingWorkbench(true);
                }}
                onDoubleClick={() => {
                  const targetW =
                    typeof window !== 'undefined'
                      ? Math.max(
                          MIN_RIGHT_WORKBENCH_WIDTH,
                          Math.min(MAX_RIGHT_WORKBENCH_WIDTH, Math.round(window.innerWidth * 0.5))
                        )
                      : DEFAULT_RIGHT_WORKBENCH_WIDTH;
                  store.setWorkbenchWidth(targetW);
                }}
              />
            )}

            {/* ── Right Artifact Workbench ── */}
            <AnimatePresence initial={false}>
              {store.workbenchOpen && (
                <motion.div
                  layout
                  key="openwork-workbench-container"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    width: store.isMaximized
                      ? '100%'
                      : isMobile
                      ? '100%'
                      : `${actualWorkbenchWidth}px`,
                    transition: store.isDraggingWorkbench
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 350, damping: 28 },
                  }}
                  exit={{
                    opacity: 0,
                    x: 40,
                    transition: { type: 'spring', stiffness: 350, damping: 28 },
                  }}
                  className={cn(
                    "h-full shrink-0 flex flex-col overflow-hidden relative",
                    store.isMaximized ? "w-full flex-1" : "flex-1 min-w-0",
                    isMobile && "w-full min-w-full"
                  )}
                  style={{
                    width: store.isMaximized
                      ? '100%'
                      : isMobile
                      ? '100%'
                      : undefined,
                  }}
                >
                  <OpenWorkWorkbench
                    isOpen={store.workbenchOpen}
                    width={actualWorkbenchWidth}
                    isMaximized={store.isMaximized}
                    onToggleMaximize={store.toggleMaximized}
                    activeTab={store.activeTab}
                    onTabChange={store.setActiveTab}
                    artifacts={store.artifacts}
                    activeArtifactId={store.activeArtifactId}
                    onSelectArtifact={store.setActiveArtifactId}
                    onClose={store.toggleWorkbench}
                    spotlightActive={store.spotlightActive}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
    }
  };

  return (
    <div className="ow-shell-container flex h-screen w-screen max-w-full bg-[var(--color-bg,#f3f2f2)] text-[var(--color-text,#201f1d)] font-sans antialiased overflow-hidden select-none">
      {/* ── 1. Desktop In-Flow Left Session Sidebar & Tool Rail (>= 768px in-flow) ── */}
      {!store.isMaximized && !isDrawerMode && (
        <div className="ow-shell-sidebar-desktop hidden md:flex h-full shrink-0">
          <OpenWorkSidebar
            isOpen={store.sidebarOpen}
            width={store.sidebarOpen ? (store.sidebarWidth || CLASSICAL_LEFT_RAIL_WIDTH) : 52}
            workspace={store.workspace}
            sessions={store.sessions}
            activeSessionId={store.activeSessionId}
            onSelectSession={(id) => {
              store.selectSession(id);
              store.setActiveView('chat');
            }}
            onNewSession={() => {
              store.createNewSession();
              store.setActiveView('chat');
            }}
            connectors={store.connectors}
            onToggle={store.toggleSidebar}
            searchQuery={store.sessionSearch}
            onSearchChange={store.setSessionSearch}
            onOpenSettings={() => store.setSettingsOpen(true)}
            onOpenMemory={() => store.setMemoryDrawerOpen(true)}
            onDeleteSession={store.deleteSession}
            activeView={store.activeView}
            onSelectView={(v) => store.setActiveView(v as any)}
            onSelectTab={(tab) => {
              store.setActiveTab(tab as any);
              store.setActiveView('chat');
            }}
          />

          {/* Left Splitter shown only on desktop when expanded */}
          {store.sidebarOpen && (
            <OpenWorkSplitter
              direction="left"
              isDragging={store.isDraggingSidebar}
              onMouseDown={(e) => {
                e.preventDefault();
                store.setIsDraggingSidebar(true);
              }}
              onDoubleClick={() => store.setSidebarWidth(CLASSICAL_LEFT_RAIL_WIDTH)}
            />
          )}
        </div>
      )}

      {/* ── 2. Mobile or Constrained Split Screen Overlay Drawer ── */}
      <AnimatePresence>
        {isDrawerMode && mobileDrawerOpen && !store.isMaximized && (
          <>
            {/* Backdrop */}
            <motion.div
              key="ow-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMobileDrawerOpen(false)}
              className="ow-drawer-backdrop"
              aria-hidden="true"
            />

            {/* Drawer Panel */}
            <motion.div
              key="ow-drawer-panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="ow-drawer-panel"
            >
              <OpenWorkSidebar
                isOpen={true}
                width={280}
                workspace={store.workspace}
                sessions={store.sessions}
                activeSessionId={store.activeSessionId}
                onSelectSession={(id) => {
                  store.selectSession(id);
                  store.setActiveView('chat');
                  setMobileDrawerOpen(false);
                }}
                onNewSession={() => {
                  store.createNewSession();
                  store.setActiveView('chat');
                  setMobileDrawerOpen(false);
                }}
                connectors={store.connectors}
                onToggle={() => setMobileDrawerOpen(false)}
                searchQuery={store.sessionSearch}
                onSearchChange={store.setSessionSearch}
                onOpenSettings={() => {
                  setMobileDrawerOpen(false);
                  store.setSettingsOpen(true);
                }}
                onOpenMemory={() => {
                  setMobileDrawerOpen(false);
                  store.setMemoryDrawerOpen(true);
                }}
                onDeleteSession={store.deleteSession}
                activeView={store.activeView}
                onSelectView={(v) => {
                  store.setActiveView(v as any);
                  setMobileDrawerOpen(false);
                }}
                onSelectTab={(tab) => {
                  store.setActiveTab(tab as any);
                  store.setActiveView('chat');
                  setMobileDrawerOpen(false);
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── 3. Main View Canvas ── */}
      <div className="ow-shell-main flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        {/* Mobile Fallback Navigation Bar for Non-Chat Views */}
        {isMobile && store.activeView !== 'chat' && (
          <div className="ow-shell-mobile-nav">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Mở menu điều hướng"
              title="Mở menu điều hướng"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Menu size={16} />
            </button>
            <span className="text-xs font-medium text-foreground capitalize truncate">
              {store.activeView}
            </span>
            <button
              type="button"
              onClick={() => store.setActiveView('chat')}
              className="ml-auto text-xs text-[var(--accent)] hover:underline cursor-pointer"
            >
              ← Quay lại chat
            </button>
          </div>
        )}
        {renderViewContent()}
      </div>

      {/* Settings & Skill Manager Modal */}
      <OpenWorkSettingsModal
        isOpen={store.settingsOpen}
        onClose={() => store.setSettingsOpen(false)}
        skills={store.skills}
        onToggleSkill={store.toggleSkill}
      />

      {/* ── Global Agent Memory Drawer (Radix Sheet) ── */}
      <OpenWorkMemoryDrawer
        isOpen={store.memoryDrawerOpen}
        onClose={() => store.setMemoryDrawerOpen(false)}
        memories={store.memoryCards}
        onAddMemory={store.addMemoryCard}
        onUpdateMemory={store.updateMemoryCard}
        onDeleteMemory={store.deleteMemoryCard}
        onToggleMemory={store.toggleMemoryCard}
        onTogglePin={store.togglePinMemoryCard}
        onImportMemories={store.importMemoryCards}
        onExportMemories={store.exportMemoryCards}
        onResetToDefaults={store.resetMemoryCards}
      />

      {/* ── Command Palette (⌘K) Modal Overlay ── */}
      <OpenWorkCommandPalette
        open={store.commandPaletteOpen}
        onClose={() => store.setCommandPaletteOpen(false)}
        onNavigate={(view) => {
          store.setActiveView(view);
          store.setCommandPaletteOpen(false);
        }}
        onNewChat={() => {
          store.createNewSession();
          store.setActiveView('chat');
        }}
      />
    </div>
  );
};

export default OpenWorkShell;
