import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  Search,
  Globe,
  Code,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Presentation,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Layers,
  GitFork,
  Terminal,
} from 'lucide-react';
import copy from 'copy-to-clipboard';
import type { FlowDAGNodeData, FlowNodeType, FlowNodeStatus } from './types';
import type { OpenWorkArtifactTab } from '../types';
import { OpenWorkCodeBlock } from '../OpenWorkCodeBlock';

export interface FlowDAGInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  node: FlowDAGNodeData | null;
  nodes?: FlowDAGNodeData[];
  onSelectNode?: (node: FlowDAGNodeData) => void;
  onOpenArtifact?: (tab: OpenWorkArtifactTab, artifactId?: string) => void;
}

type InspectorTab = 'overview' | 'code' | 'payload' | 'error';

export const FlowDAGInspector: React.FC<FlowDAGInspectorProps> = ({
  isOpen,
  onClose,
  node,
  nodes = [],
  onSelectNode,
  onOpenArtifact,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);

  // Sync default tab when node changes
  useEffect(() => {
    if (node?.payload?.error) {
      setActiveTab('error');
    } else if (node?.payload?.sql || node?.payload?.code) {
      setActiveTab('code');
    } else {
      setActiveTab('overview');
    }
  }, [node]);

  // Keyboard navigation & Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Copy JSON payload helper
  const handleCopyPayload = useCallback(() => {
    if (!node?.payload) return;
    try {
      copy(JSON.stringify(node.payload, null, 2));
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch {}
  }, [node]);

  // Node navigation helpers
  const currentIndex = useMemo(() => {
    if (!node || nodes.length === 0) return -1;
    return nodes.findIndex((n) => n.id === node.id);
  }, [node, nodes]);

  const handlePrevNode = useCallback(() => {
    if (currentIndex > 0 && onSelectNode) {
      onSelectNode(nodes[currentIndex - 1]);
    }
  }, [currentIndex, nodes, onSelectNode]);

  const handleNextNode = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < nodes.length - 1 && onSelectNode) {
      onSelectNode(nodes[currentIndex + 1]);
    }
  }, [currentIndex, nodes, onSelectNode]);

  if (!node) return null;

  // Icon Resolver
  const getNodeIcon = (type: FlowNodeType) => {
    switch (type) {
      case 'decompose':
        return <GitFork size={16} strokeWidth={1.5} className="text-foreground" />;
      case 'database':
        return <Database size={16} strokeWidth={1.5} className="text-foreground" />;
      case 'search':
        return <Search size={16} strokeWidth={1.5} className="text-foreground" />;
      case 'scrape':
        return <Globe size={16} strokeWidth={1.5} className="text-foreground" />;
      case 'python':
        return <Terminal size={16} strokeWidth={1.5} className="text-foreground" />;
      case 'artifact':
        if (node.payload?.artifactTab === 'excel') return <FileSpreadsheet size={16} strokeWidth={1.5} className="text-foreground" />;
        if (node.payload?.artifactTab === 'slide') return <Presentation size={16} strokeWidth={1.5} className="text-foreground" />;
        return <FileText size={16} strokeWidth={1.5} className="text-foreground" />;
      case 'reasoning':
      case 'synthesis':
      default:
        return <Sparkles size={16} strokeWidth={1.5} className="text-foreground" />;
    }
  };

  // Status Badge Resolver
  const getStatusBadge = (status: FlowNodeStatus) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-medium bg-muted border border-border text-foreground">
            <Loader2 size={11} className="animate-spin" strokeWidth={1.5} />
            Đang thực thi
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-medium bg-muted/80 border border-border text-foreground">
            <CheckCircle2 size={11} strokeWidth={1.5} className="text-foreground" />
            Thành công
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-medium bg-destructive/10 border border-destructive/30 text-destructive">
            <AlertCircle size={11} strokeWidth={1.5} />
            Lỗi thực thi
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-medium bg-muted/50 border border-border/60 text-muted-foreground">
            <Clock size={11} strokeWidth={1.5} />
            Chờ thực thi
          </span>
        );
    }
  };

  const hasCodeOrSql = Boolean(node.payload?.sql || node.payload?.code);
  const hasError = Boolean(node.payload?.error);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="inspector-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Slide-out Drawer */}
          <motion.aside
            key="inspector-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Chi tiết bước: ${node.title}`}
            initial={{ x: '100%', opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md md:max-w-lg lg:max-w-xl bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden text-foreground select-text"
          >
            {/* ── 1. Drawer Header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                  {getNodeIcon(node.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground truncate">{node.title}</h3>
                    {getStatusBadge(node.status)}
                  </div>
                  {node.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{node.subtitle}</p>
                  )}
                </div>
              </div>

              {/* Stepper Navigation & Close */}
              <div className="flex items-center gap-1.5 shrink-0 pl-2">
                {nodes.length > 1 && (
                  <div className="flex items-center bg-muted/60 border border-border rounded-lg p-0.5">
                    <button
                      type="button"
                      disabled={currentIndex <= 0}
                      onClick={handlePrevNode}
                      aria-label="Bước trước"
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      <ChevronLeft size={14} strokeWidth={1.5} />
                    </button>
                    <span className="text-[0.6875rem] font-mono text-muted-foreground px-1">
                      {currentIndex + 1}/{nodes.length}
                    </span>
                    <button
                      type="button"
                      disabled={currentIndex >= nodes.length - 1}
                      onClick={handleNextNode}
                      aria-label="Bước tiếp theo"
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      <ChevronRight size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Đóng bảng chi tiết"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* ── 2. Metric Subheader Bar ── */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-muted/30 border-b border-border/60 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <Clock size={13} strokeWidth={1.5} />
                  <span>Thời gian:</span>
                  <strong className="text-foreground font-mono">
                    {node.durationMs !== undefined ? `${node.durationMs}ms` : 'Đang tính...'}
                  </strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Layers size={13} strokeWidth={1.5} />
                  <span>Loại node:</span>
                  <strong className="text-foreground font-mono capitalize">{node.type}</strong>
                </span>
              </div>

              {node.payload?.artifactTab && onOpenArtifact && (
                <button
                  type="button"
                  onClick={() => onOpenArtifact(node.payload!.artifactTab!, node.payload?.artifactId)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline cursor-pointer"
                >
                  <span>Mở trong Workbench</span>
                  <ExternalLink size={12} strokeWidth={1.5} />
                </button>
              )}
            </div>

            {/* ── 3. Tabs Navigation ── */}
            <div className="flex items-center px-5 border-b border-border bg-card">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'overview'
                    ? 'border-foreground text-foreground font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Tổng quan & Logs
              </button>
              {hasCodeOrSql && (
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'code'
                      ? 'border-foreground text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {node.payload?.sql ? 'SQL Query' : 'Mã nguồn Code'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('payload')}
                className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'payload'
                    ? 'border-foreground text-foreground font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                JSON Payload
              </button>
              {hasError && (
                <button
                  type="button"
                  onClick={() => setActiveTab('error')}
                  className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'error'
                      ? 'border-foreground text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Chi tiết Lỗi
                </button>
              )}
            </div>

            {/* ── 4. Tab Content Body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar text-xs leading-relaxed">
              {/* Tab 1: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Query / Input prompt */}
                  {node.payload?.query && (
                    <div className="space-y-1.5">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Truy vấn đầu vào:
                      </span>
                      <div className="p-3 rounded-xl bg-muted/50 border border-border font-mono text-xs text-foreground">
                        {node.payload.query}
                      </div>
                    </div>
                  )}

                  {/* Scrape Target URL */}
                  {node.payload?.url && (
                    <div className="space-y-1.5">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Địa chỉ URL trích xuất:
                      </span>
                      <a
                        href={node.payload.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-3 rounded-xl bg-muted/50 border border-border flex items-center justify-between text-foreground hover:bg-muted transition-colors"
                      >
                        <span className="font-mono text-xs truncate mr-2">{node.payload.url}</span>
                        <ExternalLink size={13} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
                      </a>
                    </div>
                  )}

                  {/* Subtasks / Decompose Plan */}
                  {node.payload?.subtasks && node.payload.subtasks.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Kế hoạch phân rã ({node.payload.subtasks.length} bước):
                      </span>
                      <div className="p-3 rounded-xl bg-muted/40 border border-border text-foreground space-y-1.5">
                        {node.payload.subtasks.map((task, idx) => (
                          <div key={`task-${idx}`} className="flex items-start gap-2">
                            <span className="font-mono text-muted-foreground shrink-0">{idx + 1}.</span>
                            <span>{task}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Thought / CoT excerpt */}
                  {node.payload?.thought && (
                    <div className="space-y-1.5">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Nội dung suy luận (Chain-of-Thought):
                      </span>
                      <div className="p-3 rounded-xl bg-muted/40 border border-border text-foreground max-h-56 overflow-y-auto custom-scrollbar font-mono text-[0.75rem] whitespace-pre-wrap leading-relaxed">
                        {node.payload.thought}
                      </div>
                    </div>
                  )}

                  {/* Structured Execution Summary */}
                  {node.payload?.output && (
                    <div className="space-y-1.5">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Kết quả thực thi:
                      </span>
                      <div className="p-3 rounded-xl bg-muted/40 border border-border text-foreground space-y-2">
                        {typeof node.payload.output === 'string' ? (
                          <p className="whitespace-pre-wrap font-mono text-xs">{node.payload.output}</p>
                        ) : (
                          <pre className="font-mono text-[0.75rem] overflow-x-auto custom-scrollbar">
                            {JSON.stringify(node.payload.output, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Artifact Generator Callout */}
                  {node.payload?.artifactTab && (
                    <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground text-xs">Tài liệu đã tạo:</span>
                        <span className="px-2 py-0.5 rounded-md bg-background border border-border text-[0.6875rem] font-mono uppercase">
                          {node.payload.artifactTab}
                        </span>
                      </div>
                      {node.payload.artifactName && (
                        <p className="font-mono text-xs text-muted-foreground">{node.payload.artifactName}</p>
                      )}
                      {onOpenArtifact && (
                        <button
                          type="button"
                          onClick={() => onOpenArtifact(node.payload!.artifactTab!, node.payload?.artifactId)}
                          className="w-full py-2 px-3 rounded-lg bg-foreground text-background font-medium text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                        >
                          <span>Mở trực tiếp trên Workbench</span>
                          <ChevronRight size={14} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Code / SQL */}
              {activeTab === 'code' && hasCodeOrSql && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      {node.payload?.sql ? 'SQL Statement:' : 'Code Snippet:'}
                    </span>
                  </div>
                  <OpenWorkCodeBlock
                    code={node.payload?.sql || node.payload?.code || ''}
                    language={node.payload?.sql ? 'sql' : 'python'}
                    showLineNumbers={true}
                  />
                </div>
              )}

              {/* Tab 3: JSON Payload */}
              {activeTab === 'payload' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Payload Dump:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPayload}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted hover:bg-accent border border-border text-foreground transition-colors cursor-pointer"
                    >
                      {copiedPayload ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
                      <span>{copiedPayload ? 'Đã sao chép' : 'Sao chép JSON'}</span>
                    </button>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40 border border-border font-mono text-[0.75rem] overflow-x-auto max-h-[460px] custom-scrollbar">
                    <pre>{JSON.stringify(node.payload || {}, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Tab 4: Error Details */}
              {activeTab === 'error' && hasError && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-destructive/5 border border-destructive/30 text-destructive space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-xs">
                      <AlertCircle size={14} strokeWidth={1.5} />
                      <span>Thông báo lỗi hệ thống</span>
                    </div>
                    <p className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-destructive/90">
                      {node.payload?.error}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── 5. Drawer Footer ── */}
            <div className="px-5 py-3 border-t border-border bg-card/90 backdrop-blur-md flex items-center justify-between">
              <span className="text-[0.6875rem] text-muted-foreground font-mono">
                Node ID: {node.id}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg bg-muted hover:bg-accent border border-border text-xs font-medium text-foreground transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
