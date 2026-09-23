/**
 * Universal Flow DAG Type Definitions
 * DB-GPT OpenWork Coworker Framework
 */

import type { OpenWorkArtifactTab, OpenWorkStreamPart, UserMessagePart } from '../types';

export type FlowNodeType =
  | 'query'        // User initial request / prompt
  | 'decompose'    // Question decomposition & plan formulation
  | 'search'       // Web search query execution (single or parallel)
  | 'database'     // SQL database query execution
  | 'scrape'       // Web scraping / document extraction
  | 'python'       // Python code sandbox execution
  | 'reasoning'    // Deep thinking / Chain-of-Thought
  | 'artifact'     // Output artifact (Excel, Slide, Word, Chart, Code)
  | 'synthesis';   // Final answer aggregation & synthesis

export type FlowNodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface FlowNodePayload {
  input?: Record<string, any> | string;
  output?: Record<string, any> | string;
  query?: string;
  sql?: string;
  code?: string;
  url?: string;
  error?: string;
  artifactTab?: OpenWorkArtifactTab;
  artifactTitle?: string;
  artifactName?: string;
  artifactId?: string;
  artifactPath?: string;
  thought?: string;
  subtasks?: string[];
  durationMs?: number;
  metadata?: Record<string, any>;
}

export interface FlowDAGNodeData {
  id: string;
  type: FlowNodeType;
  title: string;
  subtitle?: string;
  status: FlowNodeStatus;
  durationMs?: number;
  iconName?: string;
  stageIndex: number;
  orderIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  payload?: FlowNodePayload;
}

export interface FlowDAGEdgeData {
  id: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  animated?: boolean;
  status: FlowNodeStatus;
  label?: string;
  pathType?: 'curved' | 'smoothstep' | 'straight';
}

export interface FlowDAGStageSummary {
  stageIndex: number;
  name: string;
  nodeCount: number;
  status: FlowNodeStatus;
}

export interface FlowDAGMetrics {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  parallelBranches: number;
  hasArtifacts: boolean;
}

export interface FlowDAGBounds {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FlowDAGGraph {
  title?: string;
  nodes: FlowDAGNodeData[];
  edges: FlowDAGEdgeData[];
  totalDurationMs: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  activeNodeId?: string;
  stages: FlowDAGStageSummary[];
  metrics: FlowDAGMetrics;
  bounds: FlowDAGBounds;
}

export interface ChatTurn {
  id: string;
  userPart?: UserMessagePart;
  assistantParts: OpenWorkStreamPart[];
  isStreaming: boolean;
  timestamp?: string;
  modelName?: string;
}

export interface UniversalFlowDAGProps {
  graph?: FlowDAGGraph;
  streamParts?: OpenWorkStreamPart[];
  isStreaming?: boolean;
  turnId?: string;
  initialExpanded?: boolean;
  defaultExpanded?: boolean;
  activeNodeId?: string | null;
  className?: string;
  onSelectNode?: (node: FlowDAGNodeData | string, allNodes?: FlowDAGNodeData[]) => void;
  onOpenArtifact?: (tab: OpenWorkArtifactTab, artifactId?: string) => void;
}
