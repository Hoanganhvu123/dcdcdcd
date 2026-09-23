import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type {
  OpenWorkStreamPart,
  OpenWorkArtifactTab,
  DatasourceItem,
} from './types';
import type { SlashCommandDefinition } from './slash-commands/slash-commands';
import { OpenWorkReasoningBlock } from './OpenWorkReasoningBlock';
import { OpenWorkPlanCard } from './OpenWorkPlanCard';
import { OpenWorkCapabilityCallLine } from './OpenWorkCapabilityCallLine';
import { OpenWorkSubagentRunLine } from './OpenWorkSubagentRunLine';
import { OpenWorkToolAggregateGroup } from './OpenWorkToolAggregateGroup';
import { OpenWorkUserBubble } from './OpenWorkUserBubble';
import { OpenWorkComposer } from './OpenWorkComposer';
import { OpenWorkAnswerBlock } from './OpenWorkAnswerBlock';
import { OpenWorkSourceCards } from './OpenWorkSourceCards';
import {
  FlowDAGInspector,
  groupStreamPartsIntoTurns,
  type FlowDAGNodeData,
} from './flow';
import { OpenWorkTurnActionRow } from './OpenWorkTurnActionRow';
import { OpenWorkLegalCiteBlock } from './OpenWorkLegalCiteBlock';
import { OpenWorkLegalDecisionBlock } from './OpenWorkLegalDecisionBlock';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import './styles/openwork-legal.css';


export interface OpenWorkChatSurfaceProps {
  header: React.ReactNode;
  streamParts: OpenWorkStreamPart[];
  inputValue: string;
  onInputChange: (val: string) => void;
  onSend: (text?: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  selectedModel?: string;
  availableModels?: string[];
  onSelectModel?: (model: string) => void;
  selectedDatasource?: DatasourceItem | string | null;
  selectedDatasourceId?: string | null;
  availableDatasources?: DatasourceItem[];
  onSelectDatasource?: (ds: DatasourceItem) => void;
  onSelectArtifactTab?: (tab: OpenWorkArtifactTab) => void;
  onEditMessage?: (id: string, text: string) => void;
  onForkMessage?: (id: string) => void;
  onRevertMessage?: (id: string) => void;
  highlightQuery?: string;
  onOpenSettings?: () => void;
  onArtifactClick?: (path: string) => void;
  onSelectSlashCommand?: (command: SlashCommandDefinition) => void;
  planMode?: 'plan' | 'direct';
  onPlanModeChange?: (mode: 'plan' | 'direct') => void;
  reasoningMode?: 'Quick' | 'DeepThink' | 'DeepResearch' | string;
  onReasoningModeChange?: (mode: any) => void;
  workbenchOpen?: boolean;
}

export const OpenWorkChatSurface: React.FC<OpenWorkChatSurfaceProps> = ({
  header,
  streamParts,
  inputValue,
  onInputChange,
  onSend,
  onStop,
  isStreaming = false,
  selectedModel = 'deepseek-v4-flash',
  availableModels,
  workbenchOpen = false,
  onSelectModel,
  selectedDatasource,
  selectedDatasourceId,
  availableDatasources,
  onSelectDatasource,
  onSelectArtifactTab,
  onEditMessage,
  onForkMessage,
  onRevertMessage,
  highlightQuery,
  onOpenSettings,
  onArtifactClick,
  onSelectSlashCommand,
  planMode,
  onPlanModeChange,
  reasoningMode,
  onReasoningModeChange,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState<boolean>(false);
  const isUserScrolledUpRef = useRef<boolean>(false);

  // Inspector Drawer State
  const [inspectedNode, setInspectedNode] = useState<FlowDAGNodeData | null>(null);
  const [inspectedNodes, setInspectedNodes] = useState<FlowDAGNodeData[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);

  // Derived turns from stream parts
  const turns = useMemo(
    () => groupStreamPartsIntoTurns(streamParts, isStreaming),
    [streamParts, isStreaming]
  );

  // Live timer for streaming state
  useEffect(() => {
    if (!isStreaming) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  // Handle user scroll intent
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 60;
    setIsUserScrolledUp(isUp);
    isUserScrolledUpRef.current = isUp;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setIsUserScrolledUp(false);
      isUserScrolledUpRef.current = false;
    }
  }, []);

  // Smart Auto scroll to bottom — reset scroll lock on stream start so latest answer is always in view
  useEffect(() => {
    if (isStreaming) {
      setIsUserScrolledUp(false);
      isUserScrolledUpRef.current = false;
    }
  }, [isStreaming]);

  useEffect(() => {
    if (scrollRef.current && !isUserScrolledUpRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamParts, isStreaming]);

  const handleSelectNode = useCallback((node: FlowDAGNodeData | string, allNodes?: FlowDAGNodeData[]) => {
    if (typeof node === 'object' && node !== null) {
      setInspectedNode(node);
      if (allNodes && allNodes.length > 0) {
        setInspectedNodes(allNodes);
      }
      setInspectorOpen(true);
    }
  }, []);

  const handleOpenArtifact = useCallback(
    (tab: OpenWorkArtifactTab, artifactId?: string) => {
      onSelectArtifactTab?.(tab);
      if (artifactId && onArtifactClick) {
        onArtifactClick(artifactId);
      }
    },
    [onSelectArtifactTab, onArtifactClick]
  );

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[var(--color-bg,#f3f2f2)] h-full overflow-hidden relative select-none">
      {/* 44px Top Header */}
      {header}

      {/* Message Timeline Scroll Container */}
      <div
        id="ow-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1 overflow-x-hidden overflow-y-auto pt-3 pb-64 custom-scrollbar",
          workbenchOpen ? "px-2.5 sm:px-3" : "px-3 sm:px-6 md:px-8"
        )}
      >
        {turns.length === 0 ? (
          /* Centered OpenWork Empty State Hero View */
          <div className="h-full min-h-[75vh] flex flex-col items-center justify-center text-center max-w-[720px] mx-auto gap-6 py-8 px-4 animate-in fade-in duration-300">
            {/* Header greeting (Pure Claude Editorial Typography) */}
            <div className="flex flex-col items-center gap-2 relative w-full pt-6">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center font-bold text-xs shadow-sm mb-1">
                <span className="ow-mark">OW</span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-[-0.015em] text-[#0b0b0b] dark:text-[#f0ede6] m-0">
                Hôm nay phân tích gì, Hoàng Anh?
              </h2>
              <p className="font-sans text-xs sm:text-sm text-[#898781] dark:text-[#a09e96] max-w-md mx-auto m-0 leading-relaxed">
                Mô tả tác vụ — agent sẽ lập kế hoạch trước, hỏi lại nếu thiếu dữ kiện, rồi mới ghi file.
              </p>
            </div>

            {/* Centered Hero Composer */}
            <div className="w-full">
              <OpenWorkComposer
                value={inputValue}
                onChange={onInputChange}
                onSend={() => onSend()}
                onStop={onStop}
                isStreaming={isStreaming}
                showModelSelector={true}
                selectedModel={selectedModel}
                availableModels={availableModels}
                onSelectModel={onSelectModel}
                selectedDatasource={selectedDatasource}
                selectedDatasourceId={selectedDatasourceId}
                availableDatasources={availableDatasources}
                onSelectDatasource={onSelectDatasource}
                onOpenSettings={onOpenSettings}
                onSelectSlashCommand={onSelectSlashCommand}
                planMode={planMode}
                onPlanModeChange={onPlanModeChange}
                reasoningMode={reasoningMode}
                onReasoningModeChange={onReasoningModeChange}
                workbenchOpen={workbenchOpen}
              />
            </div>

            {/* 2x2 Starter Suggestion Cards - Pure Text Editorial (Zero Icon Clutter) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
              <button
                type="button"
                aria-label="Gợi ý: PnL 4 quý theo kênh"
                onClick={() => onSend('So sánh biên lợi nhuận theo kênh bán hàng 4 quý gần nhất, chỉ ra kênh nào đang ăn mòn lợi nhuận, rồi xuất Excel có công thức.')}
                className="flex flex-col gap-1 p-3.5 rounded-[10px] border border-black/[0.08] dark:border-white/[0.08] bg-[#ffffff] dark:bg-[#1f1e1d] hover:bg-[#fbf9f6] dark:hover:bg-[#282725] hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left transition-all duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              >
                <span className="text-sm font-medium text-[#0b0b0b] dark:text-[#f0ede6] group-hover:text-[var(--accent,#da7756)] transition-colors">
                  PnL 4 quý theo kênh
                </span>
                <span className="text-xs text-[#898781] dark:text-[#8a8880] line-clamp-1 leading-normal">
                  Truy vấn kho dữ liệu, pivot theo quý, xuất Excel có công thức.
                </span>
              </button>

              <button
                type="button"
                aria-label="Gợi ý: Slide cho ban điều hành"
                onClick={() => onSend('Tạo 9 slide 16:9 báo cáo cho ban điều hành từ dữ liệu PnL, biểu đồ dựng từ đúng bảng đã tính.')}
                className="flex flex-col gap-1 p-3.5 rounded-[10px] border border-black/[0.08] dark:border-white/[0.08] bg-[#ffffff] dark:bg-[#1f1e1d] hover:bg-[#fbf9f6] dark:hover:bg-[#282725] hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left transition-all duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              >
                <span className="text-sm font-medium text-[#0b0b0b] dark:text-[#f0ede6] group-hover:text-[var(--accent,#da7756)] transition-colors">
                  Slide cho ban điều hành
                </span>
                <span className="text-xs text-[#898781] dark:text-[#8a8880] line-clamp-1 leading-normal">
                  9 slide 16:9, biểu đồ dựng từ đúng bảng đã tính.
                </span>
              </button>

              <button
                type="button"
                aria-label="Gợi ý: Sơ đồ luồng dữ liệu"
                onClick={() => onSend('Vẽ sơ đồ luồng dữ liệu quan hệ bảng và các bước biến đổi ngay trong chat.')}
                className="flex flex-col gap-1 p-3.5 rounded-[10px] border border-black/[0.08] dark:border-white/[0.08] bg-[#ffffff] dark:bg-[#1f1e1d] hover:bg-[#fbf9f6] dark:hover:bg-[#282725] hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left transition-all duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              >
                <span className="text-sm font-medium text-[#0b0b0b] dark:text-[#f0ede6] group-hover:text-[var(--accent,#da7756)] transition-colors">
                  Sơ đồ luồng dữ liệu
                </span>
                <span className="text-xs text-[#898781] dark:text-[#8a8880] line-clamp-1 leading-normal">
                  Vẽ quan hệ bảng & các bước biến đổi ngay trong chat.
                </span>
              </button>

              <button
                type="button"
                aria-label="Gợi ý: Khám phá schema"
                onClick={() => onSend('Kiểm tra schema các bảng và trích xuất dữ liệu bán hàng mới nhất.')}
                className="flex flex-col gap-1 p-3.5 rounded-[10px] border border-black/[0.08] dark:border-white/[0.08] bg-[#ffffff] dark:bg-[#1f1e1d] hover:bg-[#fbf9f6] dark:hover:bg-[#282725] hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left transition-all duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              >
                <span className="text-sm font-medium text-[#0b0b0b] dark:text-[#f0ede6] group-hover:text-[var(--accent,#da7756)] transition-colors">
                  Khám phá schema
                </span>
                <span className="text-xs text-[#898781] dark:text-[#8a8880] line-clamp-1 leading-normal">
                  Kiểm tra danh sách bảng và trích xuất dữ liệu bán hàng mới nhất.
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* Turn-Based Messages Timeline (Chat DeepThink.dc.html:122) */
          <div className="w-full max-w-[748px] mx-auto flex flex-col gap-4.5">
            {turns.map((turn) => (
              <div key={turn.id} className="w-full flex flex-col gap-3.5 animate-ow-in">
                {/* 1. User Message */}
                {turn.userPart && (
                  <OpenWorkUserBubble
                    part={turn.userPart}
                    onEdit={onEditMessage}
                    onFork={onForkMessage}
                    onRevert={onRevertMessage}
                    isStreaming={turn.isStreaming}
                    highlightQuery={highlightQuery}
                  />
                )}

                {/* 2. Assistant Response Block */}
                {(turn.assistantParts.length > 0 || turn.isStreaming) && (
                  <div className="w-full flex flex-col gap-3 group/turn">
                    {/* Assistant execution lines, in stream order */}
                    {turn.assistantParts.map((part) => {
                      if (part.type === 'reasoning') {
                        return <OpenWorkReasoningBlock key={part.id} part={part} />;
                      }

                      if ((part as any).type === 'legal-cite') {
                        return (
                          <OpenWorkLegalCiteBlock
                            key={part.id}
                            id={part.id}
                            title={(part as any).title}
                            latencyMs={(part as any).latencyMs || (part as any).durationMs}
                            isRunning={(part as any).isRunning}
                            waitText={(part as any).waitText}
                            rows={(part as any).rows}
                            note={(part as any).note}
                            onCiteClick={(part as any).onCiteClick}
                          />
                        );
                      }

                      if ((part as any).type === 'legal-decision') {
                        return (
                          <OpenWorkLegalDecisionBlock
                            key={part.id}
                            id={part.id}
                            title={(part as any).title}
                            wantText={(part as any).wantText}
                            allowText={(part as any).allowText}
                            options={(part as any).options}
                            isDecided={(part as any).isDecided}
                            decidedId={(part as any).decidedId}
                            onApply={(optId, customText) => {
                              if ((part as any).onApply) {
                                (part as any).onApply(optId, customText);
                              }
                              if (customText) {
                                onSend?.(customText);
                              }
                            }}
                            onKeepRisk={(part as any).onKeepRisk}
                          />
                        );
                      }

                      if (part.type === 'plan') {
                        return <OpenWorkPlanCard key={part.id} part={part} />;
                      }

                      if (part.type === 'capability-call') {
                        return (
                          <OpenWorkCapabilityCallLine
                            key={part.id}
                            part={part}
                            onSelectTab={onSelectArtifactTab}
                          />
                        );
                      }

                      if (part.type === 'subagent-run') {
                        return <OpenWorkSubagentRunLine key={part.id} part={part} />;
                      }

                      if (part.type === 'tool-aggregate') {
                        return <OpenWorkToolAggregateGroup key={part.id} part={part} />;
                      }

                      if (part.type === 'source-cards') {
                        return (
                          <OpenWorkSourceCards
                            key={part.id}
                            query={part.query}
                            results={part.results}
                          />
                        );
                      }

                      if (part.type === 'text') {
                        return (
                          <OpenWorkAnswerBlock
                            key={part.id}
                            part={part}
                            isStreaming={turn.isStreaming}
                            onArtifactClick={onArtifactClick}
                            onSelectArtifactTab={onSelectArtifactTab}
                            onRegenerate={() => onForkMessage?.(turn.id)}
                            modelName={turn.modelName || selectedModel}
                          />
                        );
                      }

                      return null;
                    })}

                    {/* Turn Action Row if not handled inside AnswerBlock */}
                    {!turn.isStreaming && !turn.assistantParts.some((p) => p.type === 'text') && (
                      <OpenWorkTurnActionRow
                        contentToCopy={turn.assistantParts
                          .filter((p) => p.type === 'text')
                          .map((p) => (p as any).markdown || '')
                          .join('\n')}
                        modelName={turn.modelName || selectedModel}
                        onRegenerate={() => onForkMessage?.(turn.id)}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Live Streaming Loading Message Indicator */}
            {isStreaming && (
              <div className="w-full flex flex-col items-start gap-2 py-1">
                <div data-loading-message="working" className="text-xs text-[var(--muted-fg)] font-mono">
                  <span className="ow-text-shimmer tabular-nums">Working {elapsedSeconds}s</span>
                </div>
              </div>
            )}

            {/* Error Alert Fallback Banner — only show if latest stream part is genuinely failed and not streaming */}
            {!isStreaming && streamParts.length > 0 && ((streamParts[streamParts.length - 1] as any)?.status === 'failed' || (streamParts[streamParts.length - 1] as any)?.type === 'error') && (
              <div
                data-alert-error=""
                className="w-full rounded-[10px] border border-[var(--err)]/30 bg-[var(--err)]/5 p-3 flex items-center justify-between text-xs text-[var(--err)] animate-ow-in"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Lỗi kết nối / Truy vấn thất bại:</span>
                  <span>Đã xảy ra lỗi trong quá trình thực thi pipeline stream.</span>
                </div>
                <button
                  type="button"
                  onClick={() => onSend?.(inputValue || undefined)}
                  className="px-2.5 py-1 rounded-[6px] bg-[var(--err)] text-white hover:opacity-90 transition-opacity font-medium cursor-pointer"
                >
                  Thử lại (Retry)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Pill Composer (Only rendered when in active chat session) */}
      {turns.length > 0 && (
        <div className={cn(
          "absolute bottom-0 left-0 right-0 z-20 pointer-events-none bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/90 to-transparent pt-6",
          workbenchOpen ? "p-2.5 pb-2.5" : "p-3 sm:p-4 pb-3 sm:pb-4"
        )}>
          {/* Floating Scroll To Bottom Action Circle cleanly positioned in right corner */}
          {isUserScrolledUp && (
            <div className={cn(
              "w-full flex justify-end pb-3 pointer-events-auto select-none animate-in fade-in",
              workbenchOpen ? "max-w-full pr-3" : "max-w-[748px] mx-auto pr-4"
            )}>
              <button
                type="button"
                onClick={scrollToBottom}
                aria-label="Cuộn xuống dưới"
                title="Cuộn xuống dưới"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--card)]/90 backdrop-blur-md border border-[var(--border)] text-[var(--fg)] shadow-md hover:bg-[var(--muted)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <ArrowDown className="w-4 h-4 text-[var(--fg)]" />
              </button>
            </div>
          )}

          <div className={cn("pointer-events-auto w-full mx-auto", workbenchOpen ? "max-w-full" : "max-w-[748px]")}>
            <OpenWorkComposer
              value={inputValue}
              onChange={onInputChange}
              onSend={() => onSend()}
              onStop={onStop}
              isStreaming={isStreaming}
              selectedModel={selectedModel}
              availableModels={availableModels}
              onSelectModel={onSelectModel}
              selectedDatasource={selectedDatasource}
              selectedDatasourceId={selectedDatasourceId}
              availableDatasources={availableDatasources}
              onSelectDatasource={onSelectDatasource}
              onOpenSettings={onOpenSettings}
              onSelectSlashCommand={onSelectSlashCommand}
              planMode={planMode}
              onPlanModeChange={onPlanModeChange}
              reasoningMode={reasoningMode}
              onReasoningModeChange={onReasoningModeChange}
              workbenchOpen={workbenchOpen}
            />
          </div>
        </div>
      )}

      {/* Slide-out Flow DAG Node Inspector Drawer */}
      <FlowDAGInspector
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        node={inspectedNode}
        nodes={inspectedNodes}
        onSelectNode={(node) => setInspectedNode(node)}
        onOpenArtifact={handleOpenArtifact}
      />
    </main>
  );
};

export default OpenWorkChatSurface;
