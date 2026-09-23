import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { UniversalFlowDAGProps, FlowDAGGraph, FlowDAGNodeData } from './types';
import type { OpenWorkArtifactTab } from '../types';
import { FlowDAGCanvas } from './FlowDAGCanvas';
import { generateFlowDAGFromParts } from './flow-generator';
import './styles/universal-flow-dag.css';

const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 28,
  mass: 0.8,
};

export const UniversalFlowDAG: React.FC<UniversalFlowDAGProps> = ({
  graph: explicitGraph,
  streamParts = [],
  isStreaming = false,
  turnId,
  activeNodeId,
  onSelectNode,
  onOpenArtifact,
  className = '',
  defaultExpanded = true,
}) => {
  // Generate reactive graph if not explicitly provided
  const derivedGraph = useMemo(() => {
    if (explicitGraph) return explicitGraph;
    return generateFlowDAGFromParts(streamParts, { isStreaming });
  }, [explicitGraph, streamParts, isStreaming]);

  const graph: FlowDAGGraph = derivedGraph;

  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [userToggled, setUserToggled] = useState<boolean>(false);

  // Auto-expand during streaming; auto-collapse upon completion if user didn't manually toggle
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
      setUserToggled(false);
    } else if (!isStreaming && graph.status === 'completed' && !userToggled) {
      const timer = setTimeout(() => {
        setIsExpanded(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, graph.status, userToggled]);

  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return null;
  }

  const completedCount = graph.nodes.filter((n) => n.status === 'success').length;
  const totalCount = graph.nodes.length;
  const runningNode = graph.nodes.find((n) => n.status === 'running');
  const failedNode = graph.nodes.find((n) => n.status === 'failed');
  const durationSec = (graph.totalDurationMs / 1000).toFixed(1);

  const handleToggle = () => {
    setUserToggled(true);
    setIsExpanded((prev) => !prev);
  };

  const handleSelectNodeInternal = (node: FlowDAGNodeData) => {
    onSelectNode?.(node, graph.nodes);
  };

  return (
    <div className={`w-full my-2 rounded-2xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-200 ${className}`}>
      {/* Collapsed / Header Summary Bar */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={handleToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleToggle()}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--color-card,#ffffff)] hover:bg-[var(--color-muted,#f5f3f0)] transition-colors cursor-pointer select-none border-b border-[var(--color-border2,#f0eeea)] text-[0.75rem] font-sans"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-[var(--color-fg,#1f1e1c)] truncate">
            {graph.title || 'Luồng dữ liệu phân tích'}
          </span>
          <span className="text-[0.65625rem] text-[var(--color-muted-fg,#8a837c)] font-mono tabular-nums">
            {completedCount}/{totalCount} bước · {durationSec}s
          </span>
          {runningNode && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[0.6875rem] text-[var(--color-clay,#3f3c38)] font-sans bg-[var(--color-clay-soft,#efedea)] px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-clay,#3f3c38)] animate-pulse" />
              {runningNode.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label={isExpanded ? 'Thu gọn sơ đồ' : 'Mở rộng sơ đồ'}
            className="p-1 rounded-md text-[var(--color-muted-fg,#8a837c)] hover:text-[var(--color-fg,#1f1e1c)] hover:bg-[var(--color-muted,#f5f3f0)] transition-colors cursor-pointer"
          >
            {isExpanded ? <ChevronUp size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Expandable DAG Canvas Surface */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springConfig}
            className="overflow-hidden"
          >
            <div className="p-2 bg-[var(--color-canvas,#faf9f7)]">
              <FlowDAGCanvas
                graph={graph}
                activeNodeId={activeNodeId}
                onSelectNode={handleSelectNodeInternal}
                onOpenArtifact={onOpenArtifact}
              />
            </div>
            <div className="px-3 py-2 border-t border-[var(--color-border2,#f0eeea)] bg-[var(--color-card,#ffffff)] text-[0.71875rem] leading-relaxed text-[var(--color-muted-fg,#8a837c)] font-sans">
              Bấm một node để mở Inspector — input, output và đoạn mã đã chạy của bước đó. Node viền đậm là bước đang chạy; cạnh nét đứt có hạt chạy là luồng đang truyền.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
