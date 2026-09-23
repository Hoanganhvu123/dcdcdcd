/**
 * Live Artifact Build Bar
 * Multi-stage construction progress tracking for Excel (4 stages), Slide (5 stages), Word (3 stages), Code
 * OpenWork Coworker Platform - Milestone 2
 */

import React, { useMemo } from 'react';
import {
  FileSpreadsheet,
  Layers,
  FileText,
  Code2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { OpenWorkArtifactTab } from '../types';
import type { LiveArtifactBuildBarProps, ArtifactBuildStage } from './types';
import { getArtifactStages } from './entity-extractor';
import './styles/live-boxes.css';

export const LiveArtifactBuildBar: React.FC<LiveArtifactBuildBarProps> = ({
  artifactType = 'excel',
  title,
  status = 'generating',
  currentStageIndex = 0,
  stageLabel,
  percentage,
  artifactId,
  onOpenWorkbench,
  className = '',
}) => {
  const stages = useMemo(() => getArtifactStages(artifactType), [artifactType]);
  const total = stages.length;
  const activeIndex = Math.min(Math.max(currentStageIndex, 0), total - 1);
  const activeStage = stages[activeIndex];

  const computedPercent =
    percentage !== undefined
      ? percentage
      : status === 'ready'
      ? 100
      : Math.round(((activeIndex + 1) / total) * 100);

  const isGenerating = status === 'generating' || status === 'drafting';
  const isReady = status === 'ready';
  const isError = status === 'error';

  const Icon =
    artifactType === 'excel'
      ? FileSpreadsheet
      : artifactType === 'slide'
      ? Layers
      : artifactType === 'docx'
      ? FileText
      : Code2;

  const currentLabel =
    stageLabel || activeStage?.label || `Stage ${activeIndex + 1}/${total}`;

  return (
    <div
      data-testid="live-artifact-build-bar"
      className={`rounded-xl border border-border/80 bg-card/80 p-3.5 space-y-2.5 shadow-xs transition-all ${className}`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-foreground truncate">
              {title || `Tạo tài liệu ${artifactType.toUpperCase()}`}
            </h4>
            <div className="text-[0.6875rem] text-muted-foreground flex items-center gap-1.5 font-mono">
              {isGenerating ? (
                <>
                  <Loader2 size={11} className="animate-spin text-primary shrink-0" />
                  <span className="text-foreground font-medium">
                    [{activeIndex + 1}/{total}] {currentLabel}
                  </span>
                </>
              ) : isReady ? (
                <>
                  <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Đã hoàn thành 100%
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={11} className="text-destructive shrink-0" />
                  <span className="text-destructive font-medium">Lỗi tạo tài liệu</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right CTA Button */}
        {onOpenWorkbench && (
          <button
            type="button"
            onClick={() => onOpenWorkbench(artifactType, artifactId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0 cursor-pointer shadow-xs"
          >
            <span>Mở Workbench</span>
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {/* Progress Bar Track */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[0.6875rem] font-mono text-muted-foreground">
          <span>Tiến độ xây dựng {artifactType.toUpperCase()}</span>
          <span className="font-semibold text-foreground tabular-nums">{computedPercent}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            style={{ width: `${computedPercent}%` }}
            className={`h-full transition-all duration-300 rounded-full ${
              isReady
                ? 'bg-emerald-500'
                : isError
                ? 'bg-destructive'
                : 'bg-primary live-build-shimmer'
            }`}
          />
        </div>
      </div>

      {/* Stage Stepper Pills */}
      <div className="flex gap-1.5 pt-1 overflow-x-auto custom-scrollbar">
        {stages.map((stg, idx) => {
          const isPassed = isReady || idx < activeIndex;
          const isCurrent = isGenerating && idx === activeIndex;
          return (
            <div
              key={`stage-${artifactType}-${stg.step}`}
              title={stg.description}
              className={`flex-1 min-w-[5.5rem] px-2 py-1 rounded text-[0.625rem] text-center font-mono truncate transition-all ${
                isPassed
                  ? 'bg-primary/15 text-primary font-medium border border-primary/30'
                  : isCurrent
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'bg-muted/40 text-muted-foreground border border-border/40'
              }`}
            >
              {stg.step}. {stg.label}
            </div>
          );
        })}
      </div>
    </div>
  );
};
