/**
 * Live Boxes Container (Adaptive Contextual Stack)
 * Houses the 4 specialized live streaming telemetry views with smart auto-switching and manual override
 * OpenWork Coworker Platform - Milestone 2
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Network,
  Terminal,
  Radio,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Lock,
  Unlock,
} from 'lucide-react';
import type {
  OpenWorkStreamPart,
  OpenWorkArtifactTab,
  CapabilityCallPart,
  SourceCardsPart,
  WebSearchResult,
} from '../types';
import type {
  LiveBoxTabId,
  LiveBoxTabMeta,
  LiveBoxesContainerProps,
  TerminalExecutionMetrics,
  FireworksGraphData,
} from './types';
import { extractEntitiesFromStreamParts, determineAutoActiveTab } from './entity-extractor';
import { FireworksTechGraphCanvas } from './FireworksTechGraphCanvas';
import { LiveTerminalCapsule } from './LiveTerminalCapsule';
import { LiveSourceRadar } from './LiveSourceRadar';
import { LiveArtifactBuildBar } from './LiveArtifactBuildBar';
import './styles/live-boxes.css';

export const LiveBoxesContainer: React.FC<LiveBoxesContainerProps> = ({
  turnId,
  streamParts = [],
  isStreaming = false,
  activeTab: controlledTab,
  defaultTab = 'graph',
  onTabChange,
  onSelectArtifactTab,
  onArtifactClick,
  className = '',
  collapsible = true,
  defaultExpanded = true,
}) => {
  const [internalTab, setInternalTab] = useState<LiveBoxTabId>(defaultTab);
  const [isManualOverride, setIsManualOverride] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const activeTab = controlledTab ?? internalTab;

  // Derive Knowledge Tech Graph
  const graphData: FireworksGraphData = useMemo(() => {
    return extractEntitiesFromStreamParts(streamParts);
  }, [streamParts]);

  // Derive Latest SQL / Terminal Entry
  const terminalData = useMemo(() => {
    const capabilityParts = streamParts.filter(
      (p): p is CapabilityCallPart => p.type === 'capability-call'
    );
    if (capabilityParts.length === 0) return null;

    // Prefer running call, otherwise latest call
    const runningCall = capabilityParts.find((p) => p.status === 'running');
    const targetCall = runningCall || capabilityParts[capabilityParts.length - 1];

    let rowCount: number | undefined;
    let colCount: number | undefined;
    if (targetCall.output && typeof targetCall.output === 'object') {
      if (Array.isArray(targetCall.output.rows)) {
        rowCount = targetCall.output.rows.length;
      } else if (typeof targetCall.output.rowCount === 'number') {
        rowCount = targetCall.output.rowCount;
      }
      if (Array.isArray(targetCall.output.columns)) {
        colCount = targetCall.output.columns.length;
      }
    }

    const metrics: TerminalExecutionMetrics = {
      rowCount,
      colCount,
      executionMs: targetCall.durationMs,
      databaseName:
        targetCall.input?.database ||
        targetCall.input?.datasource ||
        (targetCall.codeSnippet?.includes('VN_Ecommerce') ? 'VN_Ecommerce' : undefined),
    };

    return {
      query: targetCall.codeSnippet || (targetCall.input?.query as string) || '',
      codeSnippet: targetCall.codeSnippet,
      language: targetCall.language || (targetCall.toolName.includes('python') ? 'python' : 'sql'),
      status: targetCall.status,
      durationMs: targetCall.durationMs || 0,
      metrics,
      error: targetCall.error,
    };
  }, [streamParts]);

  // Derive Source Radar Groups
  const radarData = useMemo(() => {
    const sourceCardParts = streamParts.filter(
      (p): p is SourceCardsPart => p.type === 'source-cards'
    );
    const searchCapabilityParts = streamParts.filter(
      (p): p is CapabilityCallPart =>
        p.type === 'capability-call' &&
        (p.toolName.toLowerCase().includes('search') ||
          p.toolName.toLowerCase().includes('web'))
    );

    const allResults: WebSearchResult[] = [];
    let query = '';

    for (const sc of sourceCardParts) {
      if (sc.query) query = sc.query;
      if (Array.isArray(sc.results)) {
        allResults.push(...sc.results);
      }
    }

    for (const sp of searchCapabilityParts) {
      if (sp.input?.query && !query) {
        query = sp.input.query;
      }
      if (sp.output && Array.isArray(sp.output.results)) {
        allResults.push(...sp.output.results);
      }
    }

    const isScanning =
      isStreaming &&
      searchCapabilityParts.some((p) => p.status === 'running');

    return {
      query: query || 'Nguồn tri thức đa nền tảng',
      results: allResults,
      isScanning,
    };
  }, [streamParts, isStreaming]);

  // Derive Artifact Build Progress
  const buildData = useMemo(() => {
    // Check capability calls
    const artifactCall = streamParts.find(
      (p): p is CapabilityCallPart =>
        p.type === 'capability-call' &&
        (p.toolName.includes('spreadsheet') ||
          p.toolName.includes('presentation') ||
          p.toolName.includes('doc_writer') ||
          p.toolName.includes('chart'))
    );

    // Check suggested artifact tab from text parts
    const textWithTab = streamParts.find(
      (p) => p.type === 'text' && p.suggestedArtifactTab
    );

    const artifactType: OpenWorkArtifactTab = artifactCall
      ? artifactCall.toolName.includes('spreadsheet')
        ? 'excel'
        : artifactCall.toolName.includes('presentation')
        ? 'slide'
        : artifactCall.toolName.includes('doc_writer')
        ? 'docx'
        : 'code'
      : textWithTab && textWithTab.type === 'text' && textWithTab.suggestedArtifactTab
      ? textWithTab.suggestedArtifactTab
      : 'excel';

    const status =
      artifactCall && artifactCall.status === 'running'
        ? 'generating'
        : artifactCall && artifactCall.status === 'failed'
        ? 'error'
        : textWithTab || (artifactCall && artifactCall.status === 'success')
        ? 'ready'
        : isStreaming
        ? 'drafting'
        : 'ready';

    return {
      artifactType,
      title:
        (artifactCall?.input?.title as string) ||
        (artifactCall?.input?.filename as string) ||
        `Tài liệu ${artifactType.toUpperCase()} phân tích`,
      status,
      percentage: status === 'ready' ? 100 : status === 'generating' ? 65 : 30,
    };
  }, [streamParts, isStreaming]);

  // Smart Auto-Switching Effect
  useEffect(() => {
    if (!isManualOverride && isStreaming) {
      const target = determineAutoActiveTab(streamParts, isStreaming);
      if (target !== internalTab) {
        setInternalTab(target);
        onTabChange?.(target);
      }
    }
  }, [streamParts, isStreaming, isManualOverride, internalTab, onTabChange]);

  const handleTabClick = useCallback(
    (tabId: LiveBoxTabId) => {
      setIsManualOverride(true);
      setInternalTab(tabId);
      onTabChange?.(tabId);
    },
    [onTabChange]
  );

  const handleResetAuto = useCallback(() => {
    setIsManualOverride(false);
    const target = determineAutoActiveTab(streamParts, isStreaming);
    setInternalTab(target);
    onTabChange?.(target);
  }, [streamParts, isStreaming, onTabChange]);

  // Tab definitions & active badges
  const tabs: LiveBoxTabMeta[] = useMemo(
    () => [
      {
        id: 'graph',
        label: 'Tech Graph',
        iconName: 'Network',
        count: graphData.nodes.length,
        isActive: activeTab === 'graph',
        isRunning: false,
        hasError: false,
      },
      {
        id: 'terminal',
        label: 'SQL Console',
        iconName: 'Terminal',
        count: terminalData?.metrics?.rowCount ?? (terminalData ? 1 : 0),
        isActive: activeTab === 'terminal',
        isRunning: terminalData?.status === 'running',
        hasError: terminalData?.status === 'failed',
      },
      {
        id: 'radar',
        label: 'Source Radar',
        iconName: 'Radar',
        count: radarData.results.length,
        isActive: activeTab === 'radar',
        isRunning: radarData.isScanning,
        hasError: false,
      },
      {
        id: 'build',
        label: 'Build Bar',
        iconName: 'Layers',
        count: buildData.percentage,
        isActive: activeTab === 'build',
        isRunning: buildData.status === 'generating' || buildData.status === 'drafting',
        hasError: buildData.status === 'error',
      },
    ],
    [activeTab, graphData, terminalData, radarData, buildData]
  );

  // If there are no stream parts and not streaming, do not clutter
  if (streamParts.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <section
      data-testid="live-boxes-container"
      aria-label="Live Streaming Telemetry Boxes"
      className={`w-full rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md overflow-hidden shadow-sm transition-all ${className}`}
    >
      {/* Mini Tab Navigation Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/60 select-none">
        {/* Left: Tab Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
          {tabs.map((tab) => {
            const isCurrent = tab.isActive;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-background text-foreground shadow-xs border border-border font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                {tab.id === 'graph' && <Network size={12} className={isCurrent ? 'text-primary' : ''} />}
                {tab.id === 'terminal' && (
                  <Terminal size={12} className={tab.isRunning ? 'text-emerald-500 animate-pulse' : ''} />
                )}
                {tab.id === 'radar' && (
                  <Radio size={12} className={tab.isRunning ? 'text-primary animate-spin' : ''} />
                )}
                {tab.id === 'build' && (
                  <Layers size={12} className={tab.isRunning ? 'text-primary animate-bounce' : ''} />
                )}

                <span>{tab.label}</span>

                {/* Badge Count or Status Indicator */}
                {tab.id === 'graph' && tab.count > 0 && (
                  <span className="px-1.5 py-px rounded-full bg-primary/10 text-primary text-[0.625rem] font-mono">
                    {tab.count}
                  </span>
                )}
                {tab.id === 'terminal' && tab.isRunning && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                )}
                {tab.id === 'radar' && tab.count > 0 && (
                  <span className="px-1.5 py-px rounded-full bg-primary/10 text-primary text-[0.625rem] font-mono">
                    {tab.count}
                  </span>
                )}
                {tab.id === 'build' && (
                  <span className="px-1.5 py-px rounded-full bg-primary/10 text-primary text-[0.625rem] font-mono">
                    {tab.count}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Auto/Manual Lock & Expand/Collapse Toggle */}
        <div className="flex items-center gap-1.5 shrink-0 pl-2">
          {isManualOverride ? (
            <button
              type="button"
              onClick={handleResetAuto}
              title="Bật lại chế độ tự động chuyển tab"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[0.625rem] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <Lock size={10} />
              <span>Manual</span>
            </button>
          ) : (
            <div
              title="Tự động theo dõi tiến trình của AI"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[0.625rem] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              <Zap size={10} />
              <span>Auto</span>
            </div>
          )}

          {collapsible && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Active Tab Content Body */}
      {isExpanded && (
        <div className="p-3 transition-all">
          {activeTab === 'graph' && (
            <FireworksTechGraphCanvas
              data={graphData}
              height="15rem"
              onSelectNode={(node) => {
                if (node.category === 'artifact' && onSelectArtifactTab) {
                  onSelectArtifactTab('excel');
                }
              }}
            />
          )}

          {activeTab === 'terminal' && (
            <LiveTerminalCapsule
              query={terminalData?.query || '-- Sẵn sàng thực thi lệnh'}
              codeSnippet={terminalData?.codeSnippet}
              language={terminalData?.language || 'sql'}
              status={terminalData?.status || 'idle'}
              durationMs={terminalData?.durationMs || 0}
              metrics={terminalData?.metrics}
              error={terminalData?.error}
              onSelectWorkbenchTab={onSelectArtifactTab}
            />
          )}

          {activeTab === 'radar' && (
            <LiveSourceRadar
              query={radarData.query}
              results={radarData.results}
              isScanning={radarData.isScanning}
              onSelectSource={(source) => {
                if (onArtifactClick) onArtifactClick(source.url);
              }}
            />
          )}

          {activeTab === 'build' && (
            <LiveArtifactBuildBar
              artifactType={buildData.artifactType}
              title={buildData.title}
              status={buildData.status as any}
              percentage={buildData.percentage}
              onOpenWorkbench={(tab, artId) => {
                onSelectArtifactTab?.(tab);
                if (artId && onArtifactClick) onArtifactClick(artId);
              }}
            />
          )}
        </div>
      )}
    </section>
  );
};
