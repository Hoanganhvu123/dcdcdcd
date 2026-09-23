import React from 'react';
import {
  Search,
  Database,
  FileCode,
  Globe,
  BrainCircuit,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Presentation,
  CheckCircle2,
  AlertCircle,
  Clock,
  GitFork,
  Terminal,
} from 'lucide-react';
import type { FlowDAGNodeData } from './types';
import type { OpenWorkArtifactTab } from '../types';

export interface FlowDAGNodeProps {
  node: FlowDAGNodeData;
  isActive?: boolean;
  onClick?: () => void;
  onOpenArtifact?: (tab: OpenWorkArtifactTab, artifactId?: string) => void;
}

export const FlowDAGNode: React.FC<FlowDAGNodeProps> = ({
  node,
  isActive = false,
  onClick,
  onOpenArtifact,
}) => {
  // Map node type to 1.5px stroke icon
  const renderIcon = () => {
    switch (node.type) {
      case 'decompose':
        return <GitFork size={13} strokeWidth={1.5} />;
      case 'search':
        return <Search size={13} strokeWidth={1.5} />;
      case 'database':
        return <Database size={13} strokeWidth={1.5} />;
      case 'scrape':
        return <Globe size={13} strokeWidth={1.5} />;
      case 'python':
        return <Terminal size={13} strokeWidth={1.5} />;
      case 'reasoning':
        return <BrainCircuit size={13} strokeWidth={1.5} />;
      case 'artifact':
        if (node.payload?.artifactTab === 'excel') return <FileSpreadsheet size={13} strokeWidth={1.5} />;
        if (node.payload?.artifactTab === 'slide') return <Presentation size={13} strokeWidth={1.5} />;
        return <FileText size={13} strokeWidth={1.5} />;
      case 'synthesis':
        return <Sparkles size={13} strokeWidth={1.5} />;
      default:
        return <BrainCircuit size={13} strokeWidth={1.5} />;
    }
  };

  const renderStatusIndicator = () => {
    if (node.status === 'running') {
      return (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-foreground opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-foreground" />
        </span>
      );
    }
    if (node.status === 'success') {
      return <CheckCircle2 size={12} className="text-foreground" strokeWidth={1.5} />;
    }
    if (node.status === 'failed') {
      return <AlertCircle size={12} className="text-destructive" strokeWidth={1.5} />;
    }
    return <Clock size={12} className="text-muted-foreground/60" strokeWidth={1.5} />;
  };

  const durationLabel = node.durationMs ? `${node.durationMs}ms` : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
      className={`group w-full h-full rounded-xl border p-2 flex flex-col justify-between cursor-pointer select-none transition-all duration-200 ${
        isActive
          ? 'ring-2 ring-foreground bg-card shadow-md border-foreground'
          : node.status === 'running'
          ? 'bg-card border-foreground/50 shadow-sm ring-1 ring-foreground/20'
          : node.status === 'failed'
          ? 'bg-destructive/5 border-destructive/40 text-destructive'
          : 'bg-card hover:bg-muted/40 border-border hover:border-foreground/30 hover:shadow-xs'
      }`}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center text-foreground shrink-0 border border-border/60">
            {renderIcon()}
          </div>
          <span className="text-xs font-semibold text-foreground truncate">
            {node.title}
          </span>
        </div>
        <div className="shrink-0 flex items-center">{renderStatusIndicator()}</div>
      </div>

      {/* Subtitle / Command Snippet */}
      <div className="text-[0.6875rem] font-mono text-muted-foreground truncate px-0.5">
        {node.subtitle || node.payload?.query || node.payload?.sql || node.type.toUpperCase()}
      </div>

      {/* Bottom Metadata & Duration Pill */}
      <div className="flex items-center justify-between text-[0.625rem] text-muted-foreground font-mono pt-0.5 border-t border-border/40">
        <span className="uppercase tracking-wider opacity-80">{node.type}</span>
        {durationLabel && (
          <span className="bg-muted px-1.5 py-px rounded border border-border/50 text-foreground">
            {durationLabel}
          </span>
        )}
      </div>
    </div>
  );
};
