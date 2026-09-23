import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Table,
  Layers,
  FileText,
  Code2,
  BarChart3,
  FolderTree,
  Download,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  X,
  Terminal,
  Clock,
  Sparkles,
  ExternalLink,
  Eye,
  GitCompare,
} from 'lucide-react';
import {
  PanelTabList,
  PanelTabItem,
  PanelTab,
  PanelTabClose,
} from './OpenWorkPanelTabs';
import { OpenWorkChartMediaViewer } from './OpenWorkChartMediaViewer';
import { OpenWorkFilesExplorer } from './OpenWorkFilesExplorer';
import { artifactText } from '@/lib/artifacts/artifactText';
import { normalizeChart } from '@/lib/charts/normalizeChart';
import type { OpenWorkArtifactTab, OpenWorkArtifact } from './types';
import { cn } from '@/lib/utils';
import DocxArtifactViewer from '@/components/ai-data-analytic/office-word/WordArtifactViewer';
import ExcelArtifactViewer from '@/components/ai-data-analytic/office-excel/ExcelArtifactViewer';
import SlideArtifactViewer from '@/components/ai-data-analytic/office-slides/SlideArtifactViewer';
import {
  IconExcelXlsx,
  IconSlidePptx,
  IconWordDocx,
} from '@/components/ai-data-analytic';

interface TabDefinition {
  id: OpenWorkArtifactTab;
  label: string;
  icon: React.ComponentType<any>;
  dot: string;
}

const TAB_DEFINITIONS: Record<string, TabDefinition> = {
  files: { id: 'files', label: 'Tệp tin', icon: FolderTree, dot: 'var(--muted-fg, #a1a1aa)' },
  excel: { id: 'excel', label: 'Bảng tính', icon: IconExcelXlsx, dot: 'var(--c3, #34d399)' },
  slide: { id: 'slide', label: 'Slide', icon: IconSlidePptx, dot: 'var(--c1, #f59e0b)' },
  docx: { id: 'docx', label: 'Tài liệu', icon: IconWordDocx, dot: 'var(--c2, #38bdf8)' },
  code: { id: 'code', label: 'Mã nguồn', icon: Code2, dot: 'var(--muted-fg, #a1a1aa)' },
  chart: { id: 'chart', label: 'Biểu đồ', icon: BarChart3, dot: 'var(--c1, #f59e0b)' },
  preview: { id: 'preview', label: 'Xem trước', icon: Eye, dot: 'var(--c2, #38bdf8)' },
  diff: { id: 'diff', label: 'Diff', icon: GitCompare, dot: 'var(--muted-fg, #a1a1aa)' },
  terminal: { id: 'terminal', label: 'Terminal', icon: Terminal, dot: 'var(--muted-fg, #a1a1aa)' },
  browser: { id: 'browser', label: 'Browser', icon: Layers, dot: 'var(--c2, #38bdf8)' },
};

const INITIAL_TABS: OpenWorkArtifactTab[] = ['files', 'excel', 'slide', 'docx', 'code', 'chart'];

export interface OpenWorkWorkbenchProps {
  isOpen: boolean;
  width: number;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  activeTab: OpenWorkArtifactTab;
  onTabChange: (tab: OpenWorkArtifactTab) => void;
  artifacts: OpenWorkArtifact[];
  activeArtifactId?: string;
  onSelectArtifact?: (id: string) => void;
  onClose?: () => void;
  onPopout?: () => void;
  spotlightActive?: boolean;
}

export const OpenWorkWorkbench: React.FC<OpenWorkWorkbenchProps> = ({
  isOpen,
  width,
  isMaximized,
  onToggleMaximize,
  activeTab,
  onTabChange,
  artifacts,
  activeArtifactId,
  onSelectArtifact,
  onClose,
  onPopout,
  spotlightActive = false,
}) => {
  const [localFullscreen, setLocalFullscreen] = useState(false);
  const isMaximizedActive = isMaximized !== undefined ? isMaximized : localFullscreen;
  const [copied, setCopied] = useState(false);
  const [tabsOrder, setTabsOrder] = useState<OpenWorkArtifactTab[]>(INITIAL_TABS);

  // Track visited tabs to keep them mounted in DOM, preserving scroll offsets and internal states
  const [visitedTabs, setVisitedTabs] = useState<Set<OpenWorkArtifactTab>>(() => new Set([activeTab]));
  const scrollPositionsRef = useRef<Record<string, { top: number; left: number }>>({});
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const handleStudioScroll = useCallback((tab: OpenWorkArtifactTab, el: HTMLDivElement | null) => {
    if (el) {
      scrollPositionsRef.current[tab] = { top: el.scrollTop, left: el.scrollLeft };
    }
  }, []);

  // Restore scroll positions across tab switches and maximize/minimize transitions
  useEffect(() => {
    const saved = scrollPositionsRef.current[activeTab];
    const el = containerRefs.current[activeTab];
    if (el && saved) {
      el.scrollTop = saved.top;
      el.scrollLeft = saved.left;
    }
  }, [activeTab, isMaximizedActive]);

  // Synchronized Artifact Selection
  const excelArtifact = useMemo(
    () => artifacts.find((a) => a.type === 'excel'),
    [artifacts]
  );
  const slideArtifact = useMemo(
    () => artifacts.find((a) => a.type === 'slide'),
    [artifacts]
  );
  const docxArtifact = useMemo(
    () => artifacts.find((a) => a.type === 'docx' || a.type === 'word'),
    [artifacts]
  );
  const codeArtifact = useMemo(
    () => artifacts.find((a) => a.type === 'code'),
    [artifacts]
  );
  const chartArtifact = useMemo(
    () => artifacts.find((a) => a.type === 'chart'),
    [artifacts]
  );

  // A chart artifact carries a filename, never a series: the numbers live in
  // whatever the query actually returned. Chart the first artifact that holds
  // real numbers, but keep the chart artifact's own title/name on the header.
  const chartSource = useMemo(() => {
    const fallback = chartArtifact || excelArtifact;
    if (chartArtifact && normalizeChart(chartArtifact)) return chartArtifact;
    const withData = [excelArtifact, ...artifacts].find((a) => a && normalizeChart(a));
    if (!withData) return fallback;
    return chartArtifact ? { ...chartArtifact, content: withData.content } : withData;
  }, [artifacts, chartArtifact, excelArtifact]);

  const codeLanguage = useMemo(() => {
    const content = codeArtifact?.content as { language?: string } | string | undefined;
    const raw =
      (typeof content === 'object' && content?.language) ||
      codeArtifact?.name?.split('.').pop() ||
      '';
    return String(raw).toUpperCase();
  }, [codeArtifact]);

  const currentArtifact = useMemo(() => {
    const matched =
      artifacts.find((a) => a.id === activeArtifactId && a.type === activeTab) ||
      artifacts.find((a) => a.type === activeTab);

    if (matched) return matched;

    if (activeTab === 'excel') return excelArtifact;
    if (activeTab === 'slide') return slideArtifact;
    if (activeTab === 'docx') return docxArtifact;
    if (activeTab === 'chart') return chartArtifact;
    return codeArtifact;
  }, [artifacts, activeArtifactId, activeTab, excelArtifact, slideArtifact, docxArtifact, codeArtifact, chartArtifact]);

  // Quick Copy Handler for active artifact or code
  const handleQuickCopy = useCallback(() => {
    if (!currentArtifact && !codeArtifact) return;

    const target = currentArtifact || codeArtifact;
    const contentToCopy =
      artifactText(target?.content) || target?.title || target?.name || '';

    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentArtifact, codeArtifact]);

  // Download Handler with format-specific extensions
  const handleDownload = useCallback(async () => {
    if (!currentArtifact) return;

    // A slide deck is structured data, not text: blobbing it out under a
    // .pptx name produces a file PowerPoint refuses to open. Build real OOXML.
    if (currentArtifact.type === 'slide') {
      try {
        const [{ exportDeckToPptx }, { normalizeDeck, deckTitleOf }] = await Promise.all([
          import('@/lib/slides/exportPptx'),
          import('@/lib/slides/normalizeDeck'),
        ]);
        const slides = normalizeDeck(currentArtifact as any);
        if (slides.length === 0) return;
        await exportDeckToPptx(deckTitleOf(currentArtifact as any, slides), slides);
      } catch (err) {
        console.error('[OpenWorkWorkbench] PPTX export failed', err);
      }
      return;
    }

    let contentStr = '';
    let mimeType = 'text/plain;charset=utf-8';
    const ext = currentArtifact.type === 'excel'
      ? '.xlsx'
      : currentArtifact.type === 'docx'
      ? '.docx'
      : currentArtifact.type === 'code'
      ? '.py'
      : currentArtifact.type === 'chart'
      ? '.svg'
      : '.txt';

    contentStr = artifactText(currentArtifact.content);
    if (typeof currentArtifact.content !== 'string' && contentStr.startsWith('{')) {
      mimeType = 'application/json;charset=utf-8';
    }

    const blob = new Blob([contentStr], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentArtifact.name || `artifact-${currentArtifact.id}${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [currentArtifact]);

  // Popout Handler: Open in new tab or trigger popout delegate
  const handlePopout = useCallback(() => {
    if (onPopout) {
      onPopout();
      return;
    }
    if (!currentArtifact) return;
    try {
      let contentStr = '';
      let mimeType = 'text/plain';
      if (typeof currentArtifact.content === 'string') {
        contentStr = currentArtifact.content;
      } else if (currentArtifact.content) {
        contentStr = JSON.stringify(currentArtifact.content, null, 2);
        mimeType = 'application/json';
      }
      const blob = new Blob([contentStr], { type: mimeType });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      // ignore
    }
  }, [currentArtifact, onPopout]);

  const handleToggleMaximize = useCallback(() => {
    if (onToggleMaximize) {
      onToggleMaximize();
    } else {
      setLocalFullscreen((prev) => !prev);
    }
  }, [onToggleMaximize]);

  const handleCloseTab = useCallback(
    (tabId: OpenWorkArtifactTab) => {
      const nextTabs = tabsOrder.filter((t) => t !== tabId);
      if (nextTabs.length === 0) {
        setTabsOrder(INITIAL_TABS);
        onClose?.();
        return;
      }
      setTabsOrder(nextTabs);
      if (activeTab === tabId && nextTabs.length > 0) {
        onTabChange(nextTabs[0]);
      }
    },
    [tabsOrder, activeTab, onClose, onTabChange]
  );

  if (!isOpen) return null;

  return (
    <section
      data-testid="openwork-workbench-panel"
      aria-label="OpenWork Artifact Workbench"
      className={cn(
        'w-full h-full bg-[var(--color-bg,#f3f2f2)] flex flex-col flex-1 min-w-0 select-none overflow-hidden font-sans text-xs transition-all duration-75',
        !onToggleMaximize && isMaximizedActive && 'fixed inset-0 z-50',
        spotlightActive && 'ring-1 ring-[var(--color-accent,#b68235)]/40'
      )}
    >
      {/* ── 1. Tab header — 44px, reference geometry ── */}
      <div className="ow-wb-head h-[44px] min-h-[44px]">
        {/* One pill group of tabs, not a row of bordered chips */}
        <div className="flex min-w-0 items-center" role="tablist">
          <PanelTabList
            values={tabsOrder}
            onReorder={setTabsOrder}
            className="ow-wb-tabgroup"
          >
            {tabsOrder.map((tabId) => {
              const tabDef = TAB_DEFINITIONS[tabId];
              if (!tabDef) return null;
              const Icon = tabDef.icon;
              const isActive = activeTab === tabDef.id;

              return (
                <PanelTabItem key={tabDef.id} value={tabDef.id}>
                  <PanelTab
                    active={isActive}
                    onClick={() => onTabChange(tabDef.id)}
                    className={cn(
                      'ow-wb-tab',
                      // the close button is absolute; without the gutter it lands
                      // on the label of whichever tab is widest.
                      tabsOrder.length > 1 && 'ow-wb-tab--closable',
                      isActive && 'is-active'
                    )}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-none transition-colors"
                      style={{ backgroundColor: tabDef.dot }}
                    />
                    <Icon size={12} className="ow-wb-tab-icon" />
                    <span className="truncate">{tabDef.label}</span>
                  </PanelTab>
                  {tabsOrder.length > 1 && (
                    <PanelTabClose
                      active={isActive}
                      className="ow-wb-tabclose"
                      label={tabDef.label}
                      onClose={() => handleCloseTab(tabDef.id)}
                    />
                  )}
                </PanelTabItem>
              );
            })}
          </PanelTabList>
        </div>

        {/* Top Studio Action Toolbar (Meta, Copy, Download, Popout, Maximize, Close) */}
        <div className="ow-wb-actions flex items-center gap-1.5">
          {/* Active Artifact Meta text in Geist Mono matching Workbench.dc.html */}
          <span className="hidden xl:inline-flex font-mono text-[10.5px] text-[var(--muted-fg)] truncate max-w-[240px] select-none pr-1">
            {currentArtifact?.name || currentArtifact?.title || (activeTab === 'excel' ? 'bao_cao_pnl_q3.xlsx · v3 · đã đồng bộ' : 'đã đồng bộ')}
          </span>

          {/* Quick Copy Button */}
          <button
            type="button"
            onClick={handleQuickCopy}
            title={copied ? 'Đã sao chép nội dung' : 'Sao chép nhanh nội dung'}
            aria-label={copied ? 'Đã sao chép nội dung' : 'Sao chép nhanh nội dung'}
            className="ow-wb-iconbtn h-[26px] px-2 gap-1.5 inline-flex items-center text-[11.5px] border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-[7px] cursor-pointer whitespace-nowrap"
          >
            {copied ? <Check size={12} className="ow-wb-ok" /> : <Copy size={12} />}
            <span className="hidden 2xl:inline">{copied ? 'Đã sao chép' : 'Sao chép'}</span>
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            title="Tải xuống tệp artifact này"
            aria-label="Tải xuống tệp artifact này"
            className="ow-wb-iconbtn h-[26px] px-2.5 gap-1.5 inline-flex items-center text-[11.5px] font-medium border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:bg-[var(--muted)] rounded-[7px] cursor-pointer whitespace-nowrap"
          >
            <Download size={12} />
            <span className="hidden 2xl:inline">Tải xuống</span>
          </button>

          {/* Popout Button */}
          <button
            type="button"
            onClick={handlePopout}
            title="Mở artifact trong cửa sổ mới"
            aria-label="Mở artifact trong cửa sổ mới"
            className="ow-wb-iconbtn hidden xl:inline-flex"
          >
            <ExternalLink size={14} />
          </button>

          {/* Fullscreen / Full-Bleed Maximization Toggle with Fluid Spring Icon Transition */}
          <button
            type="button"
            onClick={handleToggleMaximize}
            title={isMaximizedActive ? 'Thu nhỏ (Khôi phục kích thước)' : 'Toàn màn hình (100% full-bleed)'}
            aria-label={isMaximizedActive ? 'Thu nhỏ (Khôi phục kích thước)' : 'Toàn màn hình (100% full-bleed)'}
            className="ow-wb-iconbtn"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isMaximizedActive ? (
                <motion.span
                  key="minimize-icon"
                  initial={{ scale: 0.6, rotate: -45, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0.6, rotate: 45, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                  className="inline-flex items-center justify-center"
                >
                  <Minimize2 size={14} />
                </motion.span>
              ) : (
                <motion.span
                  key="maximize-icon"
                  initial={{ scale: 0.6, rotate: 45, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0.6, rotate: -45, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                  className="inline-flex items-center justify-center"
                >
                  <Maximize2 size={14} />
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Close Drawer Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Đóng bảng workbench"
              aria-label="Đóng bảng workbench"
              className="ow-wb-iconbtn ml-0.5"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Artifact meta strip — name · version · sync · time ── */}
      {activeTab !== 'files' && currentArtifact && (
        <div className="ow-wb-meta">
          <div className="ow-wb-meta-left">
            <span className="ow-wb-meta-name">
              {currentArtifact.title || currentArtifact.name}
            </span>
            <span className="ow-wb-badge">v{currentArtifact.version || 1}.0</span>
            {activeTab === 'excel' && (
              <span className="ow-wb-badge ow-wb-badge--accent">fx Bảo toàn công thức</span>
            )}
          </div>

          <div className="ow-wb-meta-right hidden md:flex">
            <span className="ow-wb-sync">
              <span className="ow-wb-dot" />
              ĐÃ ĐỒNG BỘ · v{currentArtifact.version || 1}.0
            </span>
            <span>{currentArtifact.updatedAt || 'Vừa xong'}</span>
          </div>
        </div>
      )}

      {/* ── 3. Main Artifact Studio Canvas Viewport ── */}
      <div className="ow-wb-body custom-scrollbar">
        <div className="ow-wb-card select-text custom-scrollbar">
          {/* Tab 0: Workspace Files Explorer */}
          {visitedTabs.has('files') && (
            <div
              key="tab-files"
              ref={(el) => { containerRefs.current['files'] = el; }}
              onScroll={(e) => handleStudioScroll('files', e.currentTarget)}
              className={cn("h-full w-full overflow-hidden", activeTab === 'files' ? "flex flex-col min-h-0" : "hidden")}
              style={{ display: activeTab === 'files' ? undefined : 'none' }}
            >
              <OpenWorkFilesExplorer
                artifacts={artifacts}
                activeArtifactId={currentArtifact?.id}
                onSelectTab={(tab, id) => {
                  onTabChange(tab);
                  if (id && onSelectArtifact) onSelectArtifact(id);
                }}
              />
            </div>
          )}

          {/* Tab 1: Excel XLSX 4-Quarter PnL Viewer */}
          {visitedTabs.has('excel') && (
            <div
              key="tab-excel"
              ref={(el) => { containerRefs.current['excel'] = el; }}
              onScroll={(e) => handleStudioScroll('excel', e.currentTarget)}
              className={cn("h-full w-full overflow-hidden", activeTab === 'excel' ? "flex flex-col min-h-0" : "hidden")}
              style={{ display: activeTab === 'excel' ? undefined : 'none' }}
            >
              <ExcelArtifactViewer artifact={excelArtifact} spotlightActive={spotlightActive} />
            </div>
          )}

          {/* Tab 2: Slide 16:9 Presentation Studio */}
          {visitedTabs.has('slide') && (
            <div
              key="tab-slide"
              ref={(el) => { containerRefs.current['slide'] = el; }}
              onScroll={(e) => handleStudioScroll('slide', e.currentTarget)}
              className={cn("h-full w-full overflow-auto custom-scrollbar", activeTab === 'slide' ? "block" : "hidden")}
              style={{ display: activeTab === 'slide' ? undefined : 'none' }}
            >
              <SlideArtifactViewer artifact={slideArtifact} spotlightActive={spotlightActive} />
            </div>
          )}

          {/* Tab 3: Word DOCX Executive Document */}
          {visitedTabs.has('docx') && (
            <div
              key="tab-docx"
              ref={(el) => { containerRefs.current['docx'] = el; }}
              onScroll={(e) => handleStudioScroll('docx', e.currentTarget)}
              className={cn("h-full w-full overflow-hidden", activeTab === 'docx' ? "flex flex-col min-h-0" : "hidden")}
              style={{ display: activeTab === 'docx' ? undefined : 'none' }}
            >
              <DocxArtifactViewer artifact={docxArtifact} spotlightActive={spotlightActive} />
            </div>
          )}

          {/* Tab 4: Code viewer, language read off the artifact (Classical Charcoal Warm Ink) */}
          {visitedTabs.has('code') && (
            <div
              key="tab-code"
              ref={(el) => { containerRefs.current['code'] = el; }}
              onScroll={(e) => handleStudioScroll('code', e.currentTarget)}
              className={cn("ow-wb-pane ow-wb-pane--dark", activeTab === 'code' ? "flex flex-col min-h-0" : "hidden")}
              style={{ display: activeTab === 'code' ? undefined : 'none' }}
            >
              <div className="ow-wb-pane-head">
                <span className="ow-wb-pane-title">
                  <Terminal size={13} className="ow-wb-pane-icon" />
                  <span>{codeArtifact?.name || 'Chưa có tệp'}</span>
                  {codeLanguage && <span className="ow-wb-chip">{codeLanguage}</span>}
                </span>

                <button
                  type="button"
                  onClick={handleQuickCopy}
                  disabled={!codeArtifact?.content}
                  aria-label={copied ? 'Đã sao chép mã nguồn' : 'Sao chép mã nguồn'}
                  className="ow-wb-copy"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? 'Đã sao chép' : 'Sao chép mã'}</span>
                </button>
              </div>

              {codeArtifact?.content ? (
                <div className="ow-wb-pane-body custom-scrollbar">
                  <pre className="ow-wb-code">
                    <code>{artifactText(codeArtifact.content)}</code>
                  </pre>
                </div>
              ) : (
                <div className="ow-wb-pane-empty">
                  <span className="ow-wb-pane-empty-icon">
                    <Terminal size={20} />
                  </span>
                  <h4 className="ow-wb-pane-empty-title">Chưa có mã nguồn thực thi</h4>
                  <p className="ow-wb-pane-empty-text">
                    Các đoạn mã Python Sandbox hoặc SQL query được tạo trong quá trình AI phân tích sẽ hiển thị tại đây.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Interactive Chart & Media Visualizer */}
          {visitedTabs.has('chart') && (
            <div
              key="tab-chart"
              ref={(el) => { containerRefs.current['chart'] = el; }}
              onScroll={(e) => handleStudioScroll('chart', e.currentTarget)}
              className={cn("h-full w-full overflow-hidden", activeTab === 'chart' ? "flex flex-col min-h-0" : "hidden")}
              style={{ display: activeTab === 'chart' ? undefined : 'none' }}
            >
              <OpenWorkChartMediaViewer artifact={chartSource || currentArtifact} />
            </div>
          )}

          {/* Tab 6: Live Interactive Sandbox Preview */}
          {visitedTabs.has('preview') && (
            <div
              key="tab-preview"
              ref={(el) => { containerRefs.current['preview'] = el; }}
              onScroll={(e) => handleStudioScroll('preview', e.currentTarget)}
              className={cn("ow-wb-pane", activeTab === 'preview' ? "flex flex-col min-h-0" : "hidden")}
              style={{ display: activeTab === 'preview' ? undefined : 'none' }}
            >
              <div className="ow-wb-pane-head">
                <span className="ow-wb-pane-title">
                  <Sparkles size={13} className="ow-wb-pane-icon" />
                  <span>Xem Trước Trực Tiếp (Interactive Sandbox Preview)</span>
                </span>
                <span className="ow-wb-chip ow-wb-chip--live">
                  <span className="ow-wb-dot" />
                  Live Active
                </span>
              </div>
              <div className="ow-wb-preview-body custom-scrollbar">
                {currentArtifact ? (
                  <div className="ow-wb-preview-card">
                    <h3 className="ow-wb-preview-title">{currentArtifact.title || currentArtifact.name}</h3>
                    <p className="ow-wb-preview-sub">
                      Đang hiển thị bản xem trước định dạng {currentArtifact.type.toUpperCase()}.
                    </p>
                    <pre className="ow-wb-preview-pre">
                      {typeof currentArtifact.content === 'string' ? currentArtifact.content : JSON.stringify(currentArtifact.content, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="ow-wb-preview-empty">Chưa có dữ liệu xem trước</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 7: Version Diff Comparison Viewer */}
          {visitedTabs.has('diff') && (
            <div
              key="tab-diff"
              ref={(el) => { containerRefs.current['diff'] = el; }}
              onScroll={(e) => handleStudioScroll('diff', e.currentTarget)}
              className={cn("ow-wb-pane ow-wb-pane--dark", activeTab === 'diff' ? "flex flex-col min-h-0" : "hidden")}
              style={{ display: activeTab === 'diff' ? undefined : 'none' }}
            >
              <div className="ow-wb-pane-head">
                <span className="ow-wb-pane-title">
                  <GitCompare size={13} className="ow-wb-pane-icon" />
                  <span>
                    So Sánh Thay Đổi (Diff · v{(currentArtifact?.version || 1) - 1}.0 ➔ v{currentArtifact?.version || 1}.0)
                  </span>
                </span>
              </div>
              <div className="ow-wb-pane-body custom-scrollbar">
                <p className="ow-wb-diff-add">
                  + Đã đồng bộ các cột dữ liệu và tính toán chỉ số tài chính mới nhất
                </p>
                <pre className="ow-wb-code">
                  <code>{typeof currentArtifact?.content === 'string' ? currentArtifact.content : JSON.stringify(currentArtifact?.content || {}, null, 2)}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Tab 8: Execution Logs & Output Terminal */}
          {visitedTabs.has('terminal') && (
            <div
              key="tab-terminal"
              ref={(el) => { containerRefs.current['terminal'] = el; }}
              onScroll={(e) => handleStudioScroll('terminal', e.currentTarget)}
              className={cn("ow-wb-pane ow-wb-pane--dark", activeTab === 'terminal' ? "flex flex-col min-h-0" : "hidden")}
              style={{ display: activeTab === 'terminal' ? undefined : 'none' }}
            >
              <div className="ow-wb-pane-head">
                <span className="ow-wb-pane-title">
                  <Terminal size={13} className="ow-wb-pane-icon" />
                  <span>Live Execution Logs</span>
                </span>
                <span className="ow-wb-chip ow-wb-chip--live">
                  <span className="ow-wb-dot" />
                  Connected
                </span>
              </div>
              <div className="ow-wb-pane-body custom-scrollbar">
                <div className="ow-wb-log">
                  <p className="is-dim">[System] Initialized sandbox execution environment</p>
                  <p>[Runtime] DeepSeek V4 Flash streaming engine active</p>
                  <p className="is-good">[Artifact] Synchronized {currentArtifact?.name || 'workspace'} (v{currentArtifact?.version || 1}.0)</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default OpenWorkWorkbench;


