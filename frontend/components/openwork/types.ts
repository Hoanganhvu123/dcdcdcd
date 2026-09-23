export type OpenWorkSessionStatus = 'active' | 'completed' | 'running' | 'idle' | 'failed';

export interface OpenWorkSessionItem {
  id: string;
  title: string;
  subtitle?: string;
  status: OpenWorkSessionStatus;
  updatedAt: string;
  unread?: boolean;
}

export interface OpenWorkWorkspaceInfo {
  id: string;
  name: string;
  tier: string;
  avatarUrl?: string;
}

export interface OpenWorkConnectorStatus {
  id: string;
  name: string;
  type: 'mcp' | 'database' | 'api' | 'extension';
  status: 'connected' | 'active' | 'disconnected';
  latencyMs?: number;
}

export interface DatasourceItem {
  id: string;
  name: string;
  type: 'sqlite' | 'postgres' | 'mysql' | 'clickhouse' | 'oracle' | 'duckdb' | 'excel' | string;
  tablesCount?: number;
  status?: 'connected' | 'idle' | 'error';
  description?: string;
  isDefault?: boolean;
  host?: string;
  port?: number;
}

export interface OpenWorkSkillItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'Database' | 'Office' | 'Visualization' | 'Autonomous' | 'Search';
}

export type OpenWorkArtifactTab = 'files' | 'excel' | 'slide' | 'docx' | 'word' | 'code' | 'chart' | 'preview' | 'diff' | 'terminal' | 'browser';

export interface OpenWorkArtifact {
  id: string;
  name: string;
  title?: string;
  type: OpenWorkArtifactTab;
  extension?: string;
  status: 'drafting' | 'generating' | 'ready' | 'error';
  version: number;
  content: any;
  updatedAt: string;
  metadata?: Record<string, any>;
}

// 5 Stream Execution Line Payload Types
export interface ReasoningPart {
  type: 'reasoning';
  id: string;
  title?: string;
  thought: string;
  durationMs?: number;
  isStreaming?: boolean;
}

export interface CapabilityCallPart {
  type: 'capability-call';
  id: string;
  toolName: string;
  displayName?: string;
  durationMs?: number;
  status: 'running' | 'success' | 'failed';
  codeSnippet?: string;
  language?: string;
  input?: Record<string, any>;
  output?: any;
  error?: string;
  reconnectable?: boolean;
}

export interface SubagentRunPart {
  type: 'subagent-run';
  id: string;
  taskTitle: string;
  agentName: string;
  agentSlug?: string;
  status: 'running' | 'completed' | 'failed';
  statusVerb?: string;
  durationMs?: number;
  taskPrompt?: string;
  outputSummary?: string;
  outputDetails?: any;
}

export interface ToolAggregateItem {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  durationMs?: number;
  resultSummary?: string;
  error?: string;
}

export interface ToolAggregatePart {
  type: 'tool-aggregate';
  id: string;
  title: string;
  tools: ToolAggregateItem[];
  isExpanded?: boolean;
}

export interface PlanStepItem {
  id?: string;
  title: string;
  detail?: string;
  status: 'pending' | 'running' | 'done' | 'completed' | 'failed';
  duration?: string;
}

export interface PlanPart {
  type: 'plan';
  id: string;
  title?: string;
  progress?: string;
  note?: string;
  steps: PlanStepItem[];
}

export interface UserMessagePart {
  type: 'user';
  id: string;
  text: string;
  timestamp?: string;
}

export interface AssistantTextPart {
  type: 'text';
  id: string;
  title?: string;
  markdown: string;
  keyPoints?: any;
  suggestedArtifactTab?: OpenWorkArtifactTab;
  artifactName?: string;
  artifactMeta?: string;
}

export type OpenWorkStreamPart =
  | UserMessagePart
  | ReasoningPart
  | PlanPart
  | CapabilityCallPart
  | SubagentRunPart
  | ToolAggregatePart
  | AssistantTextPart
  | SourceCardsPart;

// ── AI Provider Architecture & Model Catalog ──
export type ProviderKind = 'openrouter' | 'deepseek' | 'dbgpt' | 'agent-wrap';

export interface ModelOption {
  value: string;
  label: string;
  description: string;
  provider: ProviderKind;
  tag?: string;
  isDefault?: boolean;
  supportsCoT?: boolean;
  supportsTools?: boolean;
  isRecommended?: boolean;
  id?: string;
  name?: string;
}

export const PROVIDER_MODEL_CATALOG: Record<ProviderKind, ModelOption[]> = {
  openrouter: [
    {
      value: 'deepseek-v4-flash',
      id: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash (OpenRouter)',
      name: 'DeepSeek V4 Flash',
      provider: 'openrouter',
      tag: 'Chính Thức',
      description: 'Mô hình DeepSeek V4 Flash tối ưu hóa phân tích dữ liệu qua OpenRouter Gateway.',
      supportsCoT: true,
      supportsTools: true,
      isDefault: true,
      isRecommended: true,
    },
  ],

  deepseek: [
    {
      value: 'deepseek-v4-flash',
      id: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      name: 'DeepSeek V4 Flash',
      provider: 'deepseek',
      tag: 'Official',
      description: 'Mô hình DeepSeek V4 Flash chính thức tối ưu hóa tốc độ, streaming CoT và gọi tool.',
      supportsCoT: true,
      supportsTools: true,
      isDefault: true,
      isRecommended: true,
    },
  ],

  dbgpt: [
    {
      value: 'deepseek-v4-flash',
      id: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash (Local)',
      name: 'DeepSeek V4 Flash',
      provider: 'dbgpt',
      tag: 'Local Backend',
      description: 'Mô hình DeepSeek V4 Flash chạy qua backend nội bộ DB-GPT.',
      supportsCoT: true,
      supportsTools: true,
      isDefault: true,
    },
  ],

  'agent-wrap': [
    {
      value: 'deepseek-v4-flash',
      id: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      name: 'DeepSeek V4 Flash',
      provider: 'agent-wrap',
      tag: 'Chính Thức',
      description: 'Mô hình DeepSeek V4 Flash qua agent wrapper.',
      supportsCoT: true,
      supportsTools: true,
      isDefault: true,
    },
  ],
};

export interface ActiveProviderConfig {
  providerKind: ProviderKind;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  headers: Record<string, string>;
}

export interface OpenWorkSettings {
  // Active Provider Selection
  providerKind?: ProviderKind;

  // Active Resolved Credentials (Backwards-Compatible)
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;

  // Dedicated OpenRouter Config
  openrouterApiKey?: string;
  openrouterBaseUrl?: string;
  openrouterModel?: string;

  // Dedicated DeepSeek Config
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;

  // Dedicated Local DB-GPT Config
  dbgptBaseUrl?: string;
  dbgptModel?: string;
  dbgptApiKey?: string;

  // Shared Parameters
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  enableCoT?: boolean;
  enableReasoningStream?: boolean;
  firecrawlApiKey?: string;
  theme?: 'light' | 'dark' | 'system';
}

export interface OpenWorkShellState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  workbenchOpen: boolean;
  workbenchWidth: number;
  activeSessionId: string;
  activeTab: OpenWorkArtifactTab;
  spotlightActive: boolean;
  selectedModel: string;
  isStreaming: boolean;
  settingsOpen: boolean;
  settings: OpenWorkSettings;
  reasoningMode?: ReasoningMode;
}

// ── Reasoning Mode ──
export type ReasoningMode = 'Quick' | 'DeepThink' | 'DeepResearch';

// ── Web Search Result ──
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  markdown?: string;
  favicon?: string;
}

// ── Source Cards Part (rendered inline in chat) ──
export interface SourceCardsPart {
  type: 'source-cards';
  id: string;
  query: string;
  results: WebSearchResult[];
}
