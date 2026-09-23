import React, { useMemo } from 'react';
import {
  FileSpreadsheet,
  Layers,
  FileText,
  Code2,
  Globe,
  File,
  ArrowUpRight,
} from 'lucide-react';
import type { OpenWorkArtifact, OpenWorkArtifactTab } from './types';

export interface OpenWorkArtifactChipProps {
  artifact: OpenWorkArtifact;
  onPreview?: (artifact: OpenWorkArtifact) => void;
  onOpenExternal?: (artifact: OpenWorkArtifact) => void;
  className?: string;
}

export function resolveArtifactIcon(type: OpenWorkArtifactTab) {
  switch (type) {
    case 'excel':
      return FileSpreadsheet;
    case 'slide':
      return Layers;
    case 'docx':
      return FileText;
    case 'code':
      return Code2;
    case 'browser':
      return Globe;
    default:
      return File;
  }
}

export const OpenWorkArtifactChip: React.FC<OpenWorkArtifactChipProps> = ({
  artifact,
  onPreview,
  onOpenExternal,
  className = '',
}) => {
  const Icon = useMemo(() => resolveArtifactIcon(artifact.type), [artifact.type]);

  const displayName = artifact.name || artifact.title || 'Untitled Artifact';

  const metadataStr = useMemo(() => {
    if (artifact.type === 'excel') {
      const rows = artifact.content?.rowCount || artifact.content?.sheets?.[0]?.rows?.length || 15;
      return `${rows} dòng`;
    }
    if (artifact.type === 'slide') {
      const slides = artifact.content?.slides?.length || 8;
      return `${slides} slides`;
    }
    if (artifact.type === 'code') {
      return 'Python';
    }
    return null;
  }, [artifact]);

  const handlePreviewClick = () => {
    onPreview?.(artifact);
  };

  const handleExternalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenExternal?.(artifact);
  };

  return (
    <span
      data-openwork-artifact-chip={artifact.id}
      data-artifact-type={artifact.type}
      className={`inline-flex shrink-0 items-stretch overflow-hidden rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] align-middle shadow-xs transition-colors hover:border-[var(--accent)] ${className}`}
    >
      {/* Left button: preview / activate artifact */}
      <button
        type="button"
        onClick={handlePreviewClick}
        title={`Xem artifact ${displayName}`}
        aria-label={`Xem artifact ${displayName}`}
        className="flex min-w-0 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--fg-secondary)]" />
        <span
          className="max-w-[10rem] truncate text-[0.75rem] font-medium leading-4 text-[var(--fg-primary)] font-mono"
          title={displayName}
        >
          {displayName}
        </span>
        {metadataStr && (
          <span className="text-[0.6875rem] font-mono text-[var(--fg-secondary)] opacity-80">
            · {metadataStr}
          </span>
        )}
        {artifact.status === 'generating' && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping shrink-0" />
        )}
      </button>

      {/* Right button: open external / switch to workbench tab */}
      {onOpenExternal && (
        <button
          type="button"
          onClick={handleExternalClick}
          title={`Mở ${displayName} trong Canvas Workbench`}
          aria-label={`Mở ${displayName} trong Canvas Workbench`}
          className="flex cursor-pointer items-center border-l border-[var(--border-subtle)] px-2 text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
};
