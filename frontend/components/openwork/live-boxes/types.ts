/**
 * Live Streaming Boxes & Fireworks Knowledge Tech Graph Type Definitions
 * OpenWork Coworker Platform - Milestone 2
 */

import type { OpenWorkArtifactTab, OpenWorkStreamPart, WebSearchResult } from '../types';

// ── Tab Identifiers ──
export type LiveBoxTabId = 'graph' | 'terminal' | 'radar' | 'build';

// ── Knowledge Graph Node & Link Contracts ──
export type GraphNodeCategory =
  | 'database'   // Blue (#3b82f6) - Database sources (VN_Ecommerce, SQLite, etc.)
  | 'table'      // Emerald (#10b981) - Tables & CTE views (orders, products, etc.)
  | 'metric'     // Amber (#f59e0b) - KPIs & Aggregations (ROAS, GMV, Margin, etc.)
  | 'concept'    // Purple (#8b5cf6) - Strategic topics (Pareto 80/20, Crisis Alert, etc.)
  | 'source'     // Cyan (#06b6d4) - Web URLs & Research citations
  | 'artifact';  // Rose (#f43f5e) - Output files (Excel XLSX, Slide PPTX, Word DOCX)

export interface GraphEntityNode {
  id: string;                                   // Unique deterministic ID (e.g. "db:vn_ecommerce")
  name: string;                                 // Display label (e.g. "VN_Ecommerce")
  category: GraphNodeCategory;                  // Semantic classification
  val: number;                                  // Importance weight (determines node radius, 4 to 12)
  color?: string;                               // Custom color override
  details?: Record<string, any>;                // Contextual metadata (row counts, formulas, URLs)
  x?: number;                                   // Simulation position X
  y?: number;                                   // Simulation position Y
  vx?: number;                                  // Velocity X
  vy?: number;                                  // Velocity Y
  fx?: number | null;                           // Fixed/pinned position X during drag
  fy?: number | null;                           // Fixed/pinned position Y during drag
  isNew?: boolean;                              // Flag indicating new discovery in current frame
  timestamp?: number;
}

export type EntityRelationType =
  | 'CONTAINS'      // DB contains Table, Artifact contains Sheet
  | 'QUERIES'       // Tool/Agent queries Table/DB
  | 'EXTRACTS'      // Table extracts Metric, Query extracts Source
  | 'CALCULATES'    // Code/Model calculates Metric
  | 'REFERENCES'    // Markdown/Source references Concept/Metric
  | 'BUILDS';       // Data builds Artifact

export interface GraphEntityLink {
  id: string;                                   // Unique link key: `${source}->${target}`
  source: string;                               // Source Node ID
  target: string;                               // Target Node ID
  relation: EntityRelationType | string;        // Edge semantic descriptor
  color?: string;                               // Stroke color override
  weight?: number;                              // Spring stiffness / distance modifier
  animated?: boolean;                           // Traveling pulse dot
}

export interface FireworksGraphData {
  nodes: GraphEntityNode[];
  links: GraphEntityLink[];
  metrics?: {
    totalEntities: number;
    databasesCount: number;
    tablesCount: number;
    metricsCount: number;
    sourcesCount: number;
    artifactsCount: number;
  };
  discoveredCount?: number;
  activeEntityId?: string | null;
}

// ── SQL & Terminal Capsule Contracts ──
export interface TerminalExecutionMetrics {
  rowCount?: number;
  colCount?: number;
  executionMs?: number;
  affectedRows?: number;
  databaseName?: string;
  tableName?: string;
}

export interface TerminalBoxEntry {
  id: string;
  toolName: string;
  displayName: string;
  language: 'sql' | 'python' | 'bash' | 'json' | string;
  codeSnippet: string;
  status: 'idle' | 'running' | 'success' | 'failed';
  durationMs?: number;
  output?: any;
  error?: string;
  metrics?: TerminalExecutionMetrics;
  timestamp?: string;
}

export interface LiveTerminalCapsuleProps {
  id?: string;
  query?: string;
  codeSnippet?: string;
  language?: 'sql' | 'python' | 'bash' | string;
  status?: 'idle' | 'running' | 'success' | 'failed';
  durationMs?: number;
  metrics?: TerminalExecutionMetrics;
  output?: any;
  error?: string;
  onSelectWorkbenchTab?: (tab: OpenWorkArtifactTab) => void;
  onReconnect?: () => void;
  className?: string;
}

// ── Live Source Radar Contracts ──
export interface RadarSourceItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  snippet?: string;
  status?: 'scanning' | 'extracted' | 'cached';
  relevanceScore?: number;
}

export interface RadarQueryGroup {
  query: string;
  sources: RadarSourceItem[];
  timestamp?: string;
}

export interface LiveSourceRadarProps {
  query?: string;
  results?: WebSearchResult[];
  isScanning?: boolean;
  activeTarget?: string;
  scannedCount?: number;
  onSelectSource?: (source: WebSearchResult) => void;
  className?: string;
}

// ── Live Artifact Build Bar Contracts ──
export type BuildArtifactFormat = 'excel' | 'slide' | 'docx' | 'code' | 'chart';

export interface ArtifactBuildStage {
  step: number;
  total: number;
  label: string;
  description?: string;
}

export interface BuildStageStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  progressPercent: number; // 0 - 100
}

export interface ArtifactBuildProgress {
  artifactId: string;
  artifactTitle: string;
  artifactType: OpenWorkArtifactTab;
  extension: string;
  currentStageIndex: number;
  totalStages: number;
  overallPercent: number; // 0 - 100
  stages: BuildStageStep[];
  status: 'drafting' | 'generating' | 'ready' | 'error';
  updatedAt?: string;
}

export interface LiveArtifactBuildBarProps {
  artifactType: OpenWorkArtifactTab;
  title?: string;
  status?: 'drafting' | 'generating' | 'ready' | 'error';
  currentStageIndex?: number;
  stageLabel?: string;
  percentage?: number;
  artifactId?: string;
  onOpenWorkbench?: (tab: OpenWorkArtifactTab, artifactId?: string) => void;
  className?: string;
}

// ── Live Boxes Container Props & Meta ──
export interface LiveBoxTabMeta {
  id: LiveBoxTabId;
  label: string;
  iconName: 'Network' | 'Terminal' | 'Radar' | 'Layers';
  count: number;
  isActive: boolean;
  isRunning: boolean;
  hasError: boolean;
}

export interface LiveBoxesContainerProps {
  turnId?: string;
  streamParts: OpenWorkStreamPart[];
  isStreaming?: boolean;
  activeTab?: LiveBoxTabId;
  defaultTab?: LiveBoxTabId;
  onTabChange?: (tab: LiveBoxTabId) => void;
  onSelectArtifactTab?: (tab: OpenWorkArtifactTab) => void;
  onArtifactClick?: (artifactIdOrPath: string) => void;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}
