/**
 * Universal Flow DAG Generator
 * Pure function converting OpenWorkStreamPart[] into a dynamic DAG graph layout.
 */

import type {
  OpenWorkStreamPart,
  ReasoningPart,
  CapabilityCallPart,
  SubagentRunPart,
  SourceCardsPart,
  ToolAggregatePart,
  AssistantTextPart,
  UserMessagePart,
  OpenWorkArtifact,
  OpenWorkArtifactTab,
} from '../types';
import type {
  FlowNodeType,
  FlowNodeStatus,
  FlowDAGNodeData,
  FlowDAGEdgeData,
  FlowDAGGraph,
  FlowDAGStageSummary,
  FlowDAGMetrics,
  FlowDAGBounds,
  ChatTurn,
} from './types';

export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 68;
export const STAGE_GAP_X = 64;
export const NODE_GAP_Y = 20;
export const PADDING_X = 24;
export const PADDING_Y = 24;

/**
 * Pure helper function to partition stream parts into distinct conversational turns.
 */
export function aggregateConsecutiveTools(parts: OpenWorkStreamPart[]): OpenWorkStreamPart[] {
  if (!parts || parts.length === 0) return parts;

  // Handle case where parts contain user turns (cross-turn boundary protection)
  const hasUserPart = parts.some((p) => p.type === 'user');
  if (hasUserPart) {
    const chunked: OpenWorkStreamPart[] = [];
    let currentChunk: OpenWorkStreamPart[] = [];
    for (const p of parts) {
      if (p.type === 'user') {
        if (currentChunk.length > 0) {
          chunked.push(...aggregateConsecutiveTools(currentChunk));
          currentChunk = [];
        }
        chunked.push(p);
      } else {
        currentChunk.push(p);
      }
    }
    if (currentChunk.length > 0) {
      chunked.push(...aggregateConsecutiveTools(currentChunk));
    }
    return chunked;
  }

  // Count total tool actions in this assistant turn
  const capabilityCalls: CapabilityCallPart[] = [];
  const existingAggs: ToolAggregatePart[] = [];

  for (const p of parts) {
    if (p.type === 'capability-call') {
      capabilityCalls.push(p as CapabilityCallPart);
    } else if (p.type === 'tool-aggregate') {
      existingAggs.push(p as ToolAggregatePart);
    }
  }

  const existingToolsCount = existingAggs.reduce((sum, a) => sum + (a.tools?.length || 0), 0);
  const totalToolCount = capabilityCalls.length + existingToolsCount;

  // If there are fewer than 2 total tool calls, no aggregation is necessary
  if (totalToolCount < 2) {
    return parts;
  }

  // Gather all tool items preserving order
  const allTools: Array<{
    id: string;
    name: string;
    status: 'running' | 'completed' | 'failed';
    durationMs?: number;
    resultSummary?: string;
    error?: string;
  }> = [];

  for (const p of parts) {
    if (p.type === 'capability-call') {
      const c = p as CapabilityCallPart;
      allTools.push({
        id: c.id,
        name: c.displayName || c.toolName,
        status: (c.status === 'running' ? 'running' : c.status === 'failed' ? 'failed' : 'completed') as any,
        durationMs: c.durationMs,
        resultSummary: c.output
          ? typeof c.output === 'string'
            ? `${c.output.slice(0, 100)}...`
            : `${JSON.stringify(c.output).slice(0, 100)}...`
          : undefined,
        error: c.error,
      });
    } else if (p.type === 'tool-aggregate') {
      const agg = p as ToolAggregatePart;
      if (agg.tools && agg.tools.length > 0) {
        allTools.push(...agg.tools);
      }
    }
  }

  const totalDurationMs = allTools.reduce((sum, t) => sum + (t.durationMs || 0), 0);
  const firstToolId = allTools[0]?.id || 'agg-main';
  const aggregatePart: ToolAggregatePart & { totalDurationMs?: number } = {
    type: 'tool-aggregate',
    id: `agg-${firstToolId}`,
    title: `⚡ ${allTools.length} thao tác truy vấn & phân tích dữ liệu`,
    totalDurationMs,
    tools: allTools,
    isExpanded: false,
  };

  // Reassemble parts: replace the first tool position with aggregatePart,
  // and omit subsequent capability-call or tool-aggregate parts.
  const aggregated: OpenWorkStreamPart[] = [];
  let toolAggregateInserted = false;

  for (const p of parts) {
    if (p.type === 'capability-call' || p.type === 'tool-aggregate') {
      if (!toolAggregateInserted) {
        aggregated.push(aggregatePart as ToolAggregatePart);
        toolAggregateInserted = true;
      }
      // Drop subsequent tool parts since they are already bundled
    } else {
      aggregated.push(p);
    }
  }

  return aggregated;
}

export function groupStreamPartsIntoTurns(
  parts: OpenWorkStreamPart[],
  isGlobalStreaming: boolean
): ChatTurn[] {
  if (!parts || parts.length === 0) return [];
  const turns: ChatTurn[] = [];
  let currentTurn: ChatTurn | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === 'user') {
      if (currentTurn) {
        turns.push(currentTurn);
      }
      currentTurn = {
        id: `turn-${part.id || i}`,
        userPart: part,
        assistantParts: [],
        isStreaming: false,
        timestamp: part.timestamp,
      };
    } else {
      if (!currentTurn) {
        currentTurn = {
          id: `turn-init-${i}`,
          assistantParts: [],
          isStreaming: false,
        };
      }
      currentTurn.assistantParts.push(part);
    }
  }

  if (currentTurn) {
    if (isGlobalStreaming) {
      currentTurn.isStreaming = true;
    }
    turns.push(currentTurn);
  }

  return turns.map((t) => ({
    ...t,
    assistantParts: aggregateConsecutiveTools(t.assistantParts),
  }));
}

/**
 * Robust partial JSON parser
 */
export function parsePartialJson(raw: string): any {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    let repaired = trimmed;
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) repaired += '"';
    const stack: string[] = [];
    let inString = false;
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
        inString = !inString;
      } else if (!inString) {
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
        }
      }
    }
    while (stack.length > 0) repaired += stack.pop();
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

/**
 * Format duration helper
 */
export function formatNodeDuration(ms?: number): string {
  if (ms === undefined || ms === null || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const mins = Math.floor(s / 60);
  const remSecs = Math.round(s % 60);
  return `${mins}m ${remSecs}s`;
}

/**
 * Format DAG summary status bar text
 */
export function formatDAGSummary(graph: FlowDAGGraph, isStreaming?: boolean): string {
  const { metrics, totalDurationMs } = graph;
  const timeStr = totalDurationMs > 0 ? ` • ${formatNodeDuration(totalDurationMs)}` : '';

  if (isStreaming || graph.status === 'running') {
    return `⚡ Đang thực thi: ${metrics.completedSteps}/${metrics.totalSteps} bước hoàn tất${timeStr}`;
  }
  if (graph.status === 'failed' || metrics.failedSteps > 0) {
    return `⚠️ Quy trình thực thi: ${metrics.failedSteps} bước gặp lỗi${timeStr}`;
  }
  return `✨ Quy trình thực thi: ${metrics.completedSteps} bước hoàn tất${timeStr}`;
}

/**
 * Map tool/node to Lucide icon identifier
 */
export function getNodeIconName(type: FlowNodeType, toolName?: string): string {
  if (type === 'decompose') return 'GitFork';
  if (type === 'search') return 'Search';
  if (type === 'database') return 'Database';
  if (type === 'scrape') return 'Globe';
  if (type === 'python') return 'Terminal';
  if (type === 'reasoning') return 'Brain';
  if (type === 'synthesis') return 'Sparkles';
  if (type === 'artifact') {
    const lower = (toolName || '').toLowerCase();
    if (lower.includes('excel') || lower.includes('sheet') || lower.includes('spreadsheet')) return 'FileSpreadsheet';
    if (lower.includes('slide') || lower.includes('presentation')) return 'Presentation';
    if (lower.includes('doc') || lower.includes('word')) return 'FileText';
    if (lower.includes('chart')) return 'BarChart3';
    return 'FileCode';
  }
  return 'Cpu';
}

/**
 * Extracts subtasks list from CoT reasoning or prompt
 */
function extractSubtasks(thought?: string, userPrompt?: string): string[] {
  if (!thought && !userPrompt) return [];
  const source = thought || userPrompt || '';
  const lines = source.split('\n');
  const subtasks: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:[0-9]+[.)]|[-*•])\s*(.+)$/);
    if (match && match[1].trim().length > 4 && match[1].trim().length < 120) {
      subtasks.push(match[1].trim());
    }
  }
  return subtasks.slice(0, 5);
}

/**
 * Main Pure Function: Generates FlowDAGGraph from stream parts and artifacts
 */
export function generateFlowDAGFromParts(
  parts: OpenWorkStreamPart[],
  options: {
    isStreaming?: boolean;
    artifacts?: OpenWorkArtifact[];
  } = {}
): FlowDAGGraph {
  const { isStreaming = false, artifacts = [] } = options;

  if (!Array.isArray(parts) || parts.length === 0) {
    return {
      nodes: [],
      edges: [],
      totalDurationMs: 0,
      status: 'idle',
      stages: [],
      metrics: {
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        parallelBranches: 0,
        hasArtifacts: false,
      },
      bounds: { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }

  // Find latest turn starting with 'user'
  let turnParts = parts;
  const lastUserIdx = parts.map((p) => p.type).lastIndexOf('user');
  if (lastUserIdx >= 0) {
    turnParts = parts.slice(lastUserIdx);
  }

  const userPart = turnParts.find((p) => p.type === 'user') as UserMessagePart | undefined;
  const reasoningPart = turnParts.find((p) => p.type === 'reasoning') as ReasoningPart | undefined;
  const toolParts = turnParts.filter((p) => p.type === 'capability-call') as CapabilityCallPart[];
  const subagentParts = turnParts.filter((p) => p.type === 'subagent-run') as SubagentRunPart[];
  const toolAggregateParts = turnParts.filter((p) => p.type === 'tool-aggregate') as ToolAggregatePart[];
  const sourceParts = turnParts.filter((p) => p.type === 'source-cards') as SourceCardsPart[];
  const textPart = turnParts.find((p) => p.type === 'text') as AssistantTextPart | undefined;

  // Stages structure
  const stage0Nodes: FlowDAGNodeData[] = [];
  const stage1Nodes: FlowDAGNodeData[] = [];
  const stage2Nodes: FlowDAGNodeData[] = [];
  const stage3Nodes: FlowDAGNodeData[] = [];

  let totalDurationMs = 0;
  let hasFailed = false;
  let activeNodeId: string | undefined;

  // ── Stage 0: Planning & Decompose ──
  const subtasks = extractSubtasks(reasoningPart?.thought, userPart?.text);
  const isDecomposeRunning = isStreaming && !reasoningPart && toolParts.length === 0 && !textPart;
  const decomposeStatus: FlowNodeStatus = isDecomposeRunning ? 'running' : 'success';
  if (isDecomposeRunning) activeNodeId = 'node-decompose';

  stage0Nodes.push({
    id: 'node-decompose',
    type: 'decompose',
    title: 'Phân rã yêu cầu',
    subtitle: subtasks.length > 0 ? `${subtasks.length} nhánh thực thi` : 'Khởi tạo kế hoạch',
    status: decomposeStatus,
    iconName: getNodeIconName('decompose'),
    stageIndex: 0,
    orderIndex: 0,
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    payload: {
      subtasks,
      input: userPart?.text,
      thought: reasoningPart?.thought,
    },
  });

  // ── Stage 1: Evidence Gathering & Tools ──
  // 1. Reasoning Node (if prominent CoT exists)
  if (reasoningPart && (reasoningPart.thought?.length > 10 || reasoningPart.isStreaming)) {
    const isReasoningRunning = isStreaming && Boolean(reasoningPart.isStreaming);
    const rStatus: FlowNodeStatus = isReasoningRunning ? 'running' : 'success';
    if (isReasoningRunning) activeNodeId = 'node-reasoning';

    stage1Nodes.push({
      id: 'node-reasoning',
      type: 'reasoning',
      title: 'Suy luận CoT',
      subtitle: isReasoningRunning ? 'Đang phân tích...' : `${reasoningPart.thought.length} chars CoT`,
      status: rStatus,
      iconName: getNodeIconName('reasoning'),
      stageIndex: 1,
      orderIndex: stage1Nodes.length,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      payload: {
        thought: reasoningPart.thought,
      },
    });
  }

  // 2. Capability Tools (Database, Search, Scrape, Python)
  toolParts.forEach((tool, idx) => {
    const toolName = tool.toolName || '';
    const lower = toolName.toLowerCase();
    let nodeType: FlowNodeType = 'database';
    let title = tool.displayName || 'Tool Execution';
    let subtitle = '';

    const rawInput = tool.input ?? (tool as any).arguments ?? (tool as any).args ?? (tool as any).parameters;
    const parsedInput =
      typeof rawInput === 'object' && rawInput !== null
        ? rawInput
        : typeof rawInput === 'string'
        ? parsePartialJson(rawInput) || { text: rawInput }
        : parsePartialJson(tool.codeSnippet || '');

    const queryStr = parsedInput?.query ?? parsedInput?.q ?? parsedInput?.search_query ?? parsedInput?.keyword ?? (typeof tool.input === 'string' ? tool.input : undefined);
    const sqlStr =
      tool.language === 'sql' || lower.includes('sql')
        ? tool.codeSnippet || parsedInput?.sql || parsedInput?.query || parsedInput?.query_sql || parsedInput?.sql_query
        : parsedInput?.sql || parsedInput?.query_sql || parsedInput?.sql_query;
    const codeStr =
      tool.language === 'python' || lower.includes('python')
        ? tool.codeSnippet || parsedInput?.code || parsedInput?.script
        : parsedInput?.code || parsedInput?.script;
    const urlStr = parsedInput?.url || parsedInput?.link || parsedInput?.target_url || parsedInput?.uri;
    const dbStr = parsedInput?.database || parsedInput?.db || parsedInput?.db_name || parsedInput?.schema_name || 'SQL Data Engine';

    if (lower.includes('sql') || lower.includes('database') || lower.includes('query')) {
      nodeType = 'database';
      title = 'Truy vấn CSDL SQL';
      subtitle = dbStr;
    } else if (lower.includes('search')) {
      nodeType = 'search';
      title = 'Tìm kiếm Web';
      subtitle = queryStr || 'Live Search';
    } else if (lower.includes('scrape') || lower.includes('fetch')) {
      nodeType = 'scrape';
      title = 'Trích xuất Web';
      try {
        subtitle = urlStr ? new URL(urlStr).hostname : 'Web Extractor';
      } catch {
        subtitle = urlStr || 'Web Extractor';
      }
    } else if (lower.includes('python')) {
      nodeType = 'python';
      title = 'Python Sandbox';
      subtitle = 'Tính toán số liệu';
    } else if (lower.includes('presentation') || lower.includes('spreadsheet') || lower.includes('doc_writer')) {
      // Artifact tools will be placed in Stage 3, skip from Stage 1
      return;
    }

    const duration = tool.durationMs || 0;
    totalDurationMs += duration;
    const isRunning = tool.status === 'running' || (isStreaming && !tool.status && !textPart);
    const nodeStatus: FlowNodeStatus = tool.status === 'failed' ? 'failed' : isRunning ? 'running' : 'success';

    if (nodeStatus === 'failed') hasFailed = true;
    if (nodeStatus === 'running' && !activeNodeId) activeNodeId = tool.id || `node-tool-${idx}`;

    stage1Nodes.push({
      id: tool.id || `node-tool-${idx}`,
      type: nodeType,
      title,
      subtitle: subtitle || formatNodeDuration(duration),
      status: nodeStatus,
      durationMs: duration,
      iconName: getNodeIconName(nodeType, toolName),
      stageIndex: 1,
      orderIndex: stage1Nodes.length,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      payload: {
        input: tool.input ?? rawInput,
        output: tool.output,
        query: queryStr,
        sql: sqlStr,
        code: codeStr,
        url: urlStr,
        error: tool.error,
        durationMs: duration,
      },
    });
  });

  // 3. Tool Aggregates (if present)
  toolAggregateParts.forEach((agg, idx) => {
    agg.tools.forEach((item, itemIdx) => {
      const duration = item.durationMs || 0;
      totalDurationMs += duration;
      const isRunning = item.status === 'running';
      const nodeStatus: FlowNodeStatus = item.status === 'failed' ? 'failed' : isRunning ? 'running' : 'success';
      if (nodeStatus === 'failed') hasFailed = true;

      stage1Nodes.push({
        id: item.id || `node-agg-${idx}-${itemIdx}`,
        type: 'database',
        title: item.name || 'Công cụ phụ trợ',
        subtitle: item.resultSummary || formatNodeDuration(duration),
        status: nodeStatus,
        durationMs: duration,
        iconName: getNodeIconName('database'),
        stageIndex: 1,
        orderIndex: stage1Nodes.length,
        x: 0,
        y: 0,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        payload: {
          output: item.resultSummary,
          error: item.error,
          durationMs: duration,
        },
      });
    });
  });

  // 4. Source Cards (Parallel Web Searches)
  sourceParts.forEach((src, idx) => {
    const existing = stage1Nodes.find((n) => n.payload?.query === src.query);
    if (!existing) {
      stage1Nodes.push({
        id: src.id || `node-source-${idx}`,
        type: 'search',
        title: 'Nguồn tìm kiếm',
        subtitle: `${src.results?.length || 0} kết quả`,
        status: 'success',
        iconName: getNodeIconName('search'),
        stageIndex: 1,
        orderIndex: stage1Nodes.length,
        x: 0,
        y: 0,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        payload: {
          query: src.query,
          output: src.results,
        },
      });
    }
  });

  // 5. Subagent Runs
  subagentParts.forEach((sub, idx) => {
    const duration = sub.durationMs || 0;
    totalDurationMs += duration;
    const isRunning = sub.status === 'running';
    const subStatus: FlowNodeStatus = sub.status === 'failed' ? 'failed' : isRunning ? 'running' : 'success';
    if (subStatus === 'failed') hasFailed = true;
    if (subStatus === 'running' && !activeNodeId) activeNodeId = sub.id || `node-sub-${idx}`;

    stage1Nodes.push({
      id: sub.id || `node-sub-${idx}`,
      type: 'reasoning',
      title: sub.agentName || 'Subagent',
      subtitle: sub.taskTitle || formatNodeDuration(duration),
      status: subStatus,
      durationMs: duration,
      iconName: getNodeIconName('reasoning'),
      stageIndex: 1,
      orderIndex: stage1Nodes.length,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      payload: {
        input: sub.taskPrompt,
        output: sub.outputSummary || sub.outputDetails,
        durationMs: duration,
      },
    });
  });

  // ── Stage 2: Synthesis & Decision ──
  if (textPart || isStreaming) {
    const isTextStreaming = isStreaming && Boolean(textPart && !hasFailed);
    const synthStatus: FlowNodeStatus = isTextStreaming ? 'running' : textPart ? 'success' : 'pending';
    if (isTextStreaming && !activeNodeId) activeNodeId = 'node-synthesis';

    stage2Nodes.push({
      id: 'node-synthesis',
      type: 'synthesis',
      title: 'Tổng hợp kết quả',
      subtitle: textPart?.markdown ? `${textPart.markdown.length} chars` : 'Đang xử lý kết quả',
      status: synthStatus,
      iconName: getNodeIconName('synthesis'),
      stageIndex: 2,
      orderIndex: 0,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      payload: {
        output: textPart?.markdown,
        metadata: { keyPoints: textPart?.keyPoints },
      },
    });
  }

  // ── Stage 3: Artifacts & Outputs ──
  const artifactTools = toolParts.filter((t) => {
    const lower = (t.toolName || '').toLowerCase();
    return lower.includes('presentation') || lower.includes('spreadsheet') || lower.includes('doc_writer');
  });

  artifactTools.forEach((artTool, idx) => {
    const toolName = artTool.toolName || '';
    const lower = toolName.toLowerCase();
    let tab: OpenWorkArtifactTab = 'excel';
    let title = 'Bảng Tính Excel';

    if (lower.includes('presentation') || lower.includes('slide')) {
      tab = 'slide';
      title = 'Slide Thuyết Trình';
    } else if (lower.includes('doc') || lower.includes('word')) {
      tab = 'docx';
      title = 'Tài Liệu DOCX';
    }

    const duration = artTool.durationMs || 0;
    const isRunning = artTool.status === 'running';
    const artStatus: FlowNodeStatus = artTool.status === 'failed' ? 'failed' : isRunning ? 'running' : 'success';
    if (artStatus === 'running' && !activeNodeId) activeNodeId = artTool.id || `node-art-${idx}`;

    stage3Nodes.push({
      id: artTool.id || `node-art-${idx}`,
      type: 'artifact',
      title,
      subtitle: formatNodeDuration(duration) || 'Sẵn sàng',
      status: artStatus,
      durationMs: duration,
      iconName: getNodeIconName('artifact', toolName),
      stageIndex: 3,
      orderIndex: stage3Nodes.length,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      payload: {
        artifactTab: tab,
        input: artTool.input,
        output: artTool.output,
      },
    });
  });

  // If artifacts passed from store not in tool parts
  artifacts.forEach((art, idx) => {
    const exists = stage3Nodes.some((n) => n.payload?.artifactTab === art.type || n.title === art.title);
    if (!exists) {
      stage3Nodes.push({
        id: art.id || `node-store-art-${idx}`,
        type: 'artifact',
        title: art.title || art.name,
        subtitle: `Tab ${art.type.toUpperCase()}`,
        status: art.status === 'ready' ? 'success' : art.status === 'error' ? 'failed' : 'running',
        iconName: getNodeIconName('artifact', art.type),
        stageIndex: 3,
        orderIndex: stage3Nodes.length,
        x: 0,
        y: 0,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        payload: {
          artifactTab: art.type,
          artifactTitle: art.title,
          artifactId: art.id,
          output: art.content,
        },
      });
    }
  });

  // Filter non-empty stages and assign layout coordinates
  const activeStages = [stage0Nodes, stage1Nodes, stage2Nodes, stage3Nodes].filter((s) => s.length > 0);

  let maxStageHeight = 0;
  activeStages.forEach((stageNodes) => {
    const stageHeight = stageNodes.length * NODE_HEIGHT + (stageNodes.length - 1) * NODE_GAP_Y;
    if (stageHeight > maxStageHeight) maxStageHeight = stageHeight;
  });
  maxStageHeight = Math.max(maxStageHeight, NODE_HEIGHT);

  const allNodes: FlowDAGNodeData[] = [];

  activeStages.forEach((stageNodes, colIndex) => {
    const stageHeight = stageNodes.length * NODE_HEIGHT + (stageNodes.length - 1) * NODE_GAP_Y;
    const startY = PADDING_Y + (maxStageHeight - stageHeight) / 2;
    const colX = PADDING_X + colIndex * (NODE_WIDTH + STAGE_GAP_X);

    stageNodes.forEach((node, rowIndex) => {
      node.stageIndex = colIndex;
      node.orderIndex = rowIndex;
      node.x = colX;
      node.y = startY + rowIndex * (NODE_HEIGHT + NODE_GAP_Y);
      allNodes.push(node);
    });
  });

  // ── Edge Generation ──
  const edges: FlowDAGEdgeData[] = [];

  for (let s = 0; s < activeStages.length - 1; s++) {
    const currStage = activeStages[s];
    const nextStage = activeStages[s + 1];

    currStage.forEach((srcNode) => {
      nextStage.forEach((tgtNode) => {
        const isRunningEdge = srcNode.status === 'running' || tgtNode.status === 'running';
        const isSuccessEdge = srcNode.status === 'success' && (tgtNode.status === 'success' || tgtNode.status === 'running');
        const edgeStatus: FlowNodeStatus = tgtNode.status === 'failed' ? 'failed' : isRunningEdge ? 'running' : isSuccessEdge ? 'success' : 'pending';

        edges.push({
          id: `edge-${srcNode.id}-${tgtNode.id}`,
          source: srcNode.id,
          target: tgtNode.id,
          sourceX: srcNode.x + NODE_WIDTH,
          sourceY: srcNode.y + NODE_HEIGHT / 2,
          targetX: tgtNode.x,
          targetY: tgtNode.y + NODE_HEIGHT / 2,
          animated: isRunningEdge || isSuccessEdge,
          status: edgeStatus,
          pathType: 'curved',
        });
      });
    });
  }

  // Calculate bounding box
  const totalWidth = PADDING_X * 2 + activeStages.length * NODE_WIDTH + Math.max(0, activeStages.length - 1) * STAGE_GAP_X;
  const totalHeight = PADDING_Y * 2 + maxStageHeight;

  const bounds: FlowDAGBounds = {
    width: totalWidth,
    height: totalHeight,
    minX: 0,
    minY: 0,
    maxX: totalWidth,
    maxY: totalHeight,
  };

  // Metrics
  const completedSteps = allNodes.filter((n) => n.status === 'success').length;
  const failedSteps = allNodes.filter((n) => n.status === 'failed').length;
  const parallelBranches = activeStages.length > 0 ? Math.max(...activeStages.map((s) => s.length)) : 0;

  const stagesSummary: FlowDAGStageSummary[] = activeStages.map((nodes, idx) => ({
    stageIndex: idx,
    name: idx === 0 ? 'Planning' : idx === 1 ? 'Evidence & Tools' : idx === 2 ? 'Synthesis' : 'Artifacts',
    nodeCount: nodes.length,
    status: nodes.some((n) => n.status === 'failed')
      ? 'failed'
      : nodes.some((n) => n.status === 'running')
      ? 'running'
      : 'success',
  }));

  const overallStatus: 'idle' | 'running' | 'completed' | 'failed' = hasFailed
    ? 'failed'
    : isStreaming || allNodes.some((n) => n.status === 'running')
    ? 'running'
    : allNodes.length > 0
    ? 'completed'
    : 'idle';

  return {
    nodes: allNodes,
    edges,
    totalDurationMs,
    status: overallStatus,
    activeNodeId,
    stages: stagesSummary,
    metrics: {
      totalSteps: allNodes.length,
      completedSteps,
      failedSteps,
      parallelBranches,
      hasArtifacts: stage3Nodes.length > 0,
    },
    bounds,
  };
}
