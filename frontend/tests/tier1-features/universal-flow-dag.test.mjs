import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Dynamic import of the TypeScript module via tsx / esm shim or testing the compiled / transpiled pure functions
import {
  generateFlowDAGFromParts,
  parsePartialJson,
  formatNodeDuration,
  formatDAGSummary,
  getNodeIconName,
  NODE_WIDTH,
  NODE_HEIGHT,
  STAGE_GAP_X,
  NODE_GAP_Y,
} from './fixtures/flow-generator-esm.mjs';

test('Tier 1.7: Universal Interactive Process Flow DAG Engine & Generator', async (t) => {
  const flowTypesSource = fs.readFileSync(path.join(ROOT, 'components/openwork/flow/types.ts'), 'utf8');
  const flowGeneratorSource = fs.readFileSync(path.join(ROOT, 'components/openwork/flow/flow-generator.ts'), 'utf8');
  const flowNodeSource = fs.readFileSync(path.join(ROOT, 'components/openwork/flow/FlowDAGNode.tsx'), 'utf8');
  const flowEdgeSource = fs.readFileSync(path.join(ROOT, 'components/openwork/flow/FlowDAGEdge.tsx'), 'utf8');
  const flowCssSource = fs.readFileSync(path.join(ROOT, 'components/openwork/flow/styles/universal-flow-dag.css'), 'utf8');

  await t.test('T1.7.1: Flow DAG Type Definitions and Architecture Contracts', () => {
    assert.match(flowTypesSource, /export type FlowNodeType/);
    assert.match(flowTypesSource, /'decompose'/);
    assert.match(flowTypesSource, /'search'/);
    assert.match(flowTypesSource, /'database'/);
    assert.match(flowTypesSource, /'scrape'/);
    assert.match(flowTypesSource, /'python'/);
    assert.match(flowTypesSource, /'reasoning'/);
    assert.match(flowTypesSource, /'artifact'/);
    assert.match(flowTypesSource, /'synthesis'/);
    assert.match(flowTypesSource, /export interface FlowDAGNodeData/);
    assert.match(flowTypesSource, /export interface FlowDAGEdgeData/);
    assert.match(flowTypesSource, /export interface FlowDAGGraph/);
    assert.match(flowTypesSource, /export interface UniversalFlowDAGProps/);
  });

  await t.test('T1.7.2: Pure Utility parsePartialJson handles malformed and stream chunks', () => {
    assert.equal(parsePartialJson(''), null);
    assert.equal(parsePartialJson('   '), null);
    assert.deepEqual(parsePartialJson('{"key": "value"}'), { key: 'value' });
    assert.deepEqual(parsePartialJson('{"key": "incomplete'), { key: 'incomplete' });
    assert.deepEqual(parsePartialJson('{"nested": {"items": [1, 2'), { nested: { items: [1, 2] } });
    assert.deepEqual(parsePartialJson('{"query": "SELECT * FROM sales WHERE year = 2026'), {
      query: 'SELECT * FROM sales WHERE year = 2026',
    });
  });

  await t.test('T1.7.3: formatNodeDuration and formatDAGSummary formatting logic', () => {
    assert.equal(formatNodeDuration(0), '0ms');
    assert.equal(formatNodeDuration(450), '450ms');
    assert.equal(formatNodeDuration(2400), '2.4s');
    assert.equal(formatNodeDuration(15000), '15s');
    assert.equal(formatNodeDuration(75000), '1m 15s');

    const emptyGraph = {
      nodes: [],
      edges: [],
      totalDurationMs: 3200,
      status: 'completed',
      stages: [],
      metrics: { totalSteps: 4, completedSteps: 4, failedSteps: 0, parallelBranches: 2, hasArtifacts: true },
      bounds: { width: 600, height: 200, minX: 0, minY: 0, maxX: 600, maxY: 200 },
    };

    const runningSummary = formatDAGSummary(emptyGraph, true);
    assert.ok(runningSummary.includes('Đang thực thi'));
    assert.ok(runningSummary.includes('4/4'));

    const completedSummary = formatDAGSummary(emptyGraph, false);
    assert.ok(completedSummary.includes('4 bước hoàn tất'));
    assert.ok(completedSummary.includes('3.2s'));

    const failedGraph = { ...emptyGraph, status: 'failed', metrics: { ...emptyGraph.metrics, failedSteps: 1 } };
    const failedSummary = formatDAGSummary(failedGraph, false);
    assert.ok(failedSummary.includes('gặp lỗi'));
  });

  await t.test('T1.7.4: getNodeIconName mapping for all Flow Node types', () => {
    assert.equal(getNodeIconName('decompose'), 'GitFork');
    assert.equal(getNodeIconName('search'), 'Search');
    assert.equal(getNodeIconName('database'), 'Database');
    assert.equal(getNodeIconName('scrape'), 'Globe');
    assert.equal(getNodeIconName('python'), 'Terminal');
    assert.equal(getNodeIconName('reasoning'), 'Brain');
    assert.equal(getNodeIconName('synthesis'), 'Sparkles');
    assert.equal(getNodeIconName('artifact', 'spreadsheet_studio'), 'FileSpreadsheet');
    assert.equal(getNodeIconName('artifact', 'presentation_builder'), 'Presentation');
    assert.equal(getNodeIconName('artifact', 'doc_writer'), 'FileText');
    assert.equal(getNodeIconName('artifact', 'chart_generator'), 'BarChart3');
  });

  await t.test('T1.7.5: Empty stream parts generate safe idle graph with zero dimensions', () => {
    const graph = generateFlowDAGFromParts([]);
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.edges.length, 0);
    assert.equal(graph.status, 'idle');
    assert.equal(graph.totalDurationMs, 0);
    assert.equal(graph.metrics.totalSteps, 0);
  });

  await t.test('T1.7.6: Multi-Stage Execution Pipeline generation (Decompose -> SQL DB -> Artifact)', () => {
    const streamParts = [
      {
        type: 'user',
        id: 'msg-u1',
        text: 'Phân tích doanh thu theo ngành hàng và xuất bảng tính Excel',
      },
      {
        type: 'reasoning',
        id: 'msg-r1',
        thought: '1. Phân rã câu hỏi.\n2. Truy vấn dữ liệu SQLite eCommerce.\n3. Tổng hợp bảng tính XLSX.',
      },
      {
        type: 'capability-call',
        id: 'msg-c1',
        toolName: 'tools.sql_query_runner',
        displayName: 'SQL Execution Terminal',
        status: 'success',
        durationMs: 180,
        language: 'sql',
        codeSnippet: 'SELECT category, SUM(revenue) FROM sales GROUP BY category;',
      },
      {
        type: 'text',
        id: 'msg-t1',
        markdown: 'Đã hoàn tất phân tích số liệu kinh doanh.',
      },
    ];

    const artifacts = [
      {
        id: 'art-1',
        type: 'excel',
        name: 'revenue_analysis.xlsx',
        title: 'Bảng Doanh Thu Ngành Hàng',
        status: 'ready',
      },
    ];

    const graph = generateFlowDAGFromParts(streamParts, { isStreaming: false, artifacts });

    assert.ok(graph.nodes.length >= 3, 'Graph must generate at least decompose, database, and artifact/synthesis nodes');
    assert.ok(graph.edges.length >= 2, 'Graph must connect sequential execution stages');

    const decomposeNode = graph.nodes.find((n) => n.type === 'decompose');
    assert.ok(decomposeNode, 'Must contain decompose node');
    assert.equal(decomposeNode.status, 'success');

    const dbNode = graph.nodes.find((n) => n.type === 'database');
    assert.ok(dbNode, 'Must contain database node');
    assert.equal(dbNode.status, 'success');
    assert.equal(dbNode.durationMs, 180);
    assert.equal(dbNode.payload?.sql, 'SELECT category, SUM(revenue) FROM sales GROUP BY category;');

    const artifactNode = graph.nodes.find((n) => n.type === 'artifact');
    assert.ok(artifactNode, 'Must contain artifact node for excel workbook');
    assert.equal(artifactNode.payload?.artifactTab, 'excel');

    assert.equal(graph.status, 'completed');
    assert.ok(graph.bounds.width > 0);
    assert.ok(graph.bounds.height > 0);
  });

  await t.test('T1.7.7: Parallel Multi-Query Search Nodes Generation and Edge Fan-Out', () => {
    const streamParts = [
      { type: 'user', id: 'u1', text: 'Tìm kiếm thị trường Cloud AI 2026' },
      {
        type: 'capability-call',
        id: 'cap-s1',
        toolName: 'web_search',
        displayName: 'Web Search',
        status: 'success',
        durationMs: 210,
        arguments: { query: 'Cloud AI Market trends 2026' },
      },
      {
        type: 'capability-call',
        id: 'cap-s2',
        toolName: 'web_search',
        displayName: 'Web Search',
        status: 'success',
        durationMs: 195,
        arguments: { query: 'Enterprise AI infrastructure adoption' },
      },
      { type: 'text', id: 't1', markdown: 'Tổng quan thị trường Cloud AI 2026.' },
    ];

    const graph = generateFlowDAGFromParts(streamParts, { isStreaming: false });
    const searchNodes = graph.nodes.filter((n) => n.type === 'search');
    assert.equal(searchNodes.length, 2, 'Must generate 2 parallel search nodes');
    assert.ok(graph.metrics.parallelBranches >= 2, 'Metrics must indicate parallel branch execution');

    // Verify stage geometry separation
    assert.equal(searchNodes[0].x, searchNodes[1].x, 'Parallel nodes in same stage share same X column');
    assert.notEqual(searchNodes[0].y, searchNodes[1].y, 'Parallel nodes are vertically separated by NODE_GAP_Y');
  });

  await t.test('T1.7.8: Live Streaming State & Active Node Tracking Invariants', () => {
    const streamParts = [
      { type: 'user', id: 'u1', text: 'Chạy phân tích tài chính' },
      {
        type: 'capability-call',
        id: 'cap-run',
        toolName: 'python_interpreter',
        displayName: 'Python Sandbox',
        status: 'running',
        arguments: { code: 'import pandas as pd' },
      },
    ];

    const graph = generateFlowDAGFromParts(streamParts, { isStreaming: true });
    assert.equal(graph.status, 'running');
    const runningNode = graph.nodes.find((n) => n.status === 'running');
    assert.ok(runningNode, 'Must identify active running node during stream');
    assert.equal(runningNode.type, 'python');
  });

  await t.test('T1.7.9: FlowDAGNode & FlowDAGEdge React Component and CSS Token Contracts', () => {
    // FlowDAGNode verification
    assert.match(flowNodeSource, /renderStatusIndicator/);
    assert.match(flowNodeSource, /renderIcon/);
    assert.match(flowNodeSource, /FlowDAGNodeProps/);

    // FlowDAGEdge verification
    assert.match(flowEdgeSource, /flow-dag-edge-active-path/);
    assert.match(flowEdgeSource, /strokeDasharray/);
    assert.match(flowEdgeSource, /animateMotion/);
    assert.match(flowEdgeSource, /FlowDAGEdgeProps/);

    // CSS animations verification
    assert.match(flowCssSource, /@keyframes flowEdgeDash/);
    assert.match(flowCssSource, /\.flow-dag-edge-active-path/);
    assert.match(flowCssSource, /\.custom-scrollbar/);
  });
});
