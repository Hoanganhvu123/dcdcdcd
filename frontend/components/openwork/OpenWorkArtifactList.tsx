import React from 'react';
import type { OpenWorkArtifact, OpenWorkArtifactTab } from './types';
import { OpenWorkArtifactChip } from './OpenWorkArtifactChip';
import { Files } from 'lucide-react';

export interface OpenWorkArtifactListProps {
  artifacts: OpenWorkArtifact[];
  onSelectArtifact?: (id: string) => void;
  onSelectArtifactTab?: (tab: OpenWorkArtifactTab) => void;
  onOpenExternal?: (artifact: OpenWorkArtifact) => void;
  className?: string;
}

export const OpenWorkArtifactList: React.FC<OpenWorkArtifactListProps> = ({
  artifacts,
  onSelectArtifact,
  onSelectArtifactTab,
  onOpenExternal,
  className = '',
}) => {
  if (!artifacts || artifacts.length === 0) {
    return null;
  }

  return (
    <div
      data-openwork-artifact-list="true"
      className={`my-3 flex flex-col gap-2 ${className}`}
    >
      <div className="flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <Files size={12} className="text-muted-foreground" />
        <span>Artifacts ({artifacts.length})</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
        {artifacts.map((artifact) => (
          <OpenWorkArtifactChip
            key={artifact.id}
            artifact={artifact}
            onPreview={() => {
              onSelectArtifact?.(artifact.id);
              onSelectArtifactTab?.(artifact.type);
            }}
            onOpenExternal={
              onOpenExternal
                ? onOpenExternal
                : () => {
                    onSelectArtifact?.(artifact.id);
                    onSelectArtifactTab?.(artifact.type);
                  }
            }
          />
        ))}
      </div>
    </div>
  );
};
