/**
 * Pure ESM Mirror of flow-generator.ts for Node test runner
 */

export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 68;
export const STAGE_GAP_X = 64;
export const NODE_GAP_Y = 20;
export const PADDING_X = 24;
export const PADDING_Y = 24;

export function parsePartialJson(raw) {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    let repaired = trimmed;
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) repaired += '"';
    const stack = [];
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

export function formatNodeDuration(ms) {
  if (ms === undefined || ms === null || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const mins = Math.floor(s / 60);
  const remSecs = Math.round(s % 60);
  return `${mins}m ${remSecs}s`;
}

export function formatDAGSummary(graph, isStreaming) {
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

export function getNodeIconName(type, toolName) {
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

function extractSubtasks(thought, userPrompt) {
  if (!thought && !userPrompt) return [];
  const source = thought || userPrompt || '';
  const lines = source.split('\n');
  const subtasks = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:[0-9]+[.)]|[-*•])\s*(.+)$/);
    if (match && match[1].trim().length > 4 && match[1].trim().length < 120) {
      subtasks.push(match[1].trim());
    }
  }
  return subtasks.slice(0, 5);
}

export function generateFlowDAGFromParts(parts, options = {}) {
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

  let turnParts = parts;
  const lastUserIdx = parts.map((p) => p.type).lastIndexOf('user');
  if (lastUserIdx >= 0) {
    turnParts = parts.slice(lastUserIdx);
  }

  const userPart = turnParts.find((p) => p.type === 'user');
  const reasoningPart = turnParts.find((p) => p.type === 'reasoning');
  const toolParts = turnParts.filter((p) => p.type === 'capability-call');
  const subagentParts = turnParts.filter((p) => p.type === 'subagent-run');
  const toolAggregateParts = turnParts.filter((p) => p.type === 'tool-aggregate');
  const sourceParts = turnParts.filter((p) => p.type === 'source-cards');
  const textPart = turnParts.find((p) => p.type === 'text');

  const stage0Nodes = [];
  const stage1Nodes = [];
  const stage2Nodes = [];
  const stage3Nodes = [];

  let totalDurationMs = 0;
  let hasFailed = false;
  let activeNodeId;

  // Stage 0: Planning & Decompose
  const subtasks = extractSubtasks(reasoningPart?.thought, userPart?.text);
  const isDecomposeRunning = isStreaming && !reasoningPart && toolParts.length === 0 && !textPart;
  const decomposeStatus = isDecomposeRunning ? 'running' : 'success';
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

  // Stage 1: Evidence Gathering & Tools
  if (reasoningPart && (reasoningPart.thought?.length > 10 || reasoningPart.isStreaming)) {
    const isReasoningRunning = isStreaming && Boolean(reasoningPart.isStreaming);
    const rStatus = isReasoningRunning ? 'running' : 'success';
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

  toolParts.forEach((tool, idx) => {
    const toolName = tool.toolName || '';
    const lower = toolName.toLowerCase();
    let nodeType = 'database';
    let title = tool.displayName || 'Tool Execution';
    let subtitle = '';

    const parsedInput = tool.input || parsePartialJson(tool.codeSnippet || '');

    if (lower.includes('sql') || lower.includes('database') || lower.includes('query')) {
      nodeType = 'database';
      title = 'Truy vấn CSDL SQL';
      subtitle = parsedInput?.database || 'SQL Data Engine';
    } else if (lower.includes('search')) {
      nodeType = 'search';
      title = 'Tìm kiếm Web';
      subtitle = parsedInput?.query || 'Live Search';
    } else if (lower.includes('scrape') || lower.includes('fetch')) {
      nodeType = 'scrape';
      title = 'Trích xuất Web';
      try {
        subtitle = parsedInput?.url ? new URL(parsedInput.url).hostname : 'Web Extractor';
      } catch {
        subtitle = 'Web Extractor';
      }
    } else if (lower.includes('python')) {
      nodeType = 'python';
      title = 'Python Sandbox';
      subtitle = 'Tính toán số liệu';
    } else if (lower.includes('presentation') || lower.includes('spreadsheet') || lower.includes('doc_writer')) {
      return;
    }

    const duration = tool.durationMs || 0;
    totalDurationMs += duration;
    const isRunning = tool.status === 'running' || (isStreaming && !tool.status && !textPart);
    const nodeStatus = tool.status === 'failed' ? 'failed' : isRunning ? 'running' : 'success';

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
        input: tool.input,
        output: tool.output,
        query: parsedInput?.query,
        sql: tool.language === 'sql' || lower.includes('sql') ? tool.codeSnippet || (typeof tool.input === 'object' ? tool.input?.query : undefined) : undefined,
        code: tool.language === 'python' || lower.includes('python') ? tool.codeSnippet : undefined,
        url: parsedInput?.url,
        error: tool.error,
        durationMs: duration,
      },
    });
  });

  toolAggregateParts.forEach((agg, idx) => {
    agg.tools?.forEach((item, itemIdx) => {
      const duration = item.durationMs || 0;
      totalDurationMs += duration;
      const isRunning = item.status === 'running';
      const nodeStatus = item.status === 'failed' ? 'failed' : isRunning ? 'running' : 'success';
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

  subagentParts.forEach((sub, idx) => {
    const duration = sub.durationMs || 0;
    totalDurationMs += duration;
    const isRunning = sub.status === 'running';
    const subStatus = sub.status === 'failed' ? 'failed' : isRunning ? 'running' : 'success';
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

  // Stage 2: Synthesis & Decision
  if (textPart || isStreaming) {
    const isTextStreaming = isStreaming && Boolean(textPart && !hasFailed);
    const synthStatus = isTextStreaming ? 'running' : textPart ? 'success' : 'pending';
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

  // Stage 3: Artifacts & Outputs
  const artifactTools = toolParts.filter((t) => {
    const lower = (t.toolName || '').toLowerCase();
    return lower.includes('presentation') || lower.includes('spreadsheet') || lower.includes('doc_writer');
  });

  artifactTools.forEach((artTool, idx) => {
    const toolName = artTool.toolName || '';
    const lower = toolName.toLowerCase();
    let tab = 'excel';
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
    const artStatus = artTool.status === 'failed' ? 'failed' : isRunning ? 'running' : 'success';
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

  artifacts.forEach((art, idx) => {
    const exists = stage3Nodes.some((n) => n.payload?.artifactTab === art.type || n.title === art.title);
    if (!exists) {
      stage3Nodes.push({
        id: art.id || `node-store-art-${idx}`,
        type: 'artifact',
        title: art.title || art.name,
        subtitle: `Tab ${art.type?.toUpperCase()}`,
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

  const activeStages = [stage0Nodes, stage1Nodes, stage2Nodes, stage3Nodes].filter((s) => s.length > 0);

  let maxStageHeight = 0;
  activeStages.forEach((stageNodes) => {
    const stageHeight = stageNodes.length * NODE_HEIGHT + (stageNodes.length - 1) * NODE_GAP_Y;
    if (stageHeight > maxStageHeight) maxStageHeight = stageHeight;
  });
  maxStageHeight = Math.max(maxStageHeight, NODE_HEIGHT);

  const allNodes = [];

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

  const edges = [];

  for (let s = 0; s < activeStages.length - 1; s++) {
    const currStage = activeStages[s];
    const nextStage = activeStages[s + 1];

    currStage.forEach((srcNode) => {
      nextStage.forEach((tgtNode) => {
        const isRunningEdge = srcNode.status === 'running' || tgtNode.status === 'running';
        const isSuccessEdge = srcNode.status === 'success' && (tgtNode.status === 'success' || tgtNode.status === 'running');
        const edgeStatus = tgtNode.status === 'failed' ? 'failed' : isRunningEdge ? 'running' : isSuccessEdge ? 'success' : 'pending';

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

  const totalWidth = PADDING_X * 2 + activeStages.length * NODE_WIDTH + Math.max(0, activeStages.length - 1) * STAGE_GAP_X;
  const totalHeight = PADDING_Y * 2 + maxStageHeight;

  const bounds = {
    width: totalWidth,
    height: totalHeight,
    minX: 0,
    minY: 0,
    maxX: totalWidth,
    maxY: totalHeight,
  };

  const completedSteps = allNodes.filter((n) => n.status === 'success').length;
  const failedSteps = allNodes.filter((n) => n.status === 'failed').length;
  const parallelBranches = activeStages.length > 0 ? Math.max(...activeStages.map((s) => s.length)) : 0;

  const stagesSummary = activeStages.map((nodes, idx) => ({
    stageIndex: idx,
    name: idx === 0 ? 'Planning' : idx === 1 ? 'Evidence & Tools' : idx === 2 ? 'Synthesis' : 'Artifacts',
    nodeCount: nodes.length,
    status: nodes.some((n) => n.status === 'failed')
      ? 'failed'
      : nodes.some((n) => n.status === 'running')
      ? 'running'
      : 'success',
  }));

  const overallStatus = hasFailed
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
