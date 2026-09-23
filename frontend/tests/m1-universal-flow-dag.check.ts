/**
 * Milestone 1: Universal Interactive Process Flow DAG Verification Suite
 * Tests pure generator logic, turn grouping, coordinate calculation, and component interfaces.
 */

import {
  generateFlowDAGFromParts,
  groupStreamPartsIntoTurns,
  parsePartialJson,
  formatNodeDuration,
  formatDAGSummary,
  getNodeIconName,
} from '../components/openwork/flow/flow-generator';
import type {
  OpenWorkStreamPart,
  UserMessagePart,
  ReasoningPart,
  CapabilityCallPart,
  AssistantTextPart,
  SourceCardsPart,
  SubagentRunPart,
  OpenWorkArtifact,
} from '../components/openwork/types';
import type { FlowDAGGraph, FlowNodeStatus } from '../components/openwork/flow/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🚀 MILESTONE M1: UNIVERSAL INTERACTIVE PROCESS FLOW DAG SUITE');
console.log('================================================================\n');

// ── TEST SUITE 1: Helper Functions & Parsing Resilience ──
console.log('--- SUITE 1: Helper Functions & Partial JSON Parsing ---');

// 1.1 parsePartialJson
assert(parsePartialJson('{"query": "SELECT * FROM users"}')?.query === 'SELECT * FROM users', 'parsePartialJson parses valid complete JSON');
assert(parsePartialJson('{"query": "SELECT * FROM users", "count": 10')?.query === 'SELECT * FROM users', 'parsePartialJson repairs unclosed object JSON');
assert(parsePartialJson('{"items": [1, 2, 3')?.items?.length === 3, 'parsePartialJson repairs unclosed array JSON');
assert(parsePartialJson('') === null, 'parsePartialJson returns null for empty string');

// 1.2 formatNodeDuration
assert(formatNodeDuration(450) === '450ms', 'formatNodeDuration formats milliseconds (< 1s)');
assert(formatNodeDuration(2500) === '2.5s', 'formatNodeDuration formats seconds (< 10s)');
assert(formatNodeDuration(45000) === '45s', 'formatNodeDuration formats seconds (< 60s)');
assert(formatNodeDuration(135000) === '2m 15s', 'formatNodeDuration formats minutes and seconds');

// 1.3 getNodeIconName
assert(getNodeIconName('decompose') === 'GitFork', 'getNodeIconName returns GitFork for decompose');
assert(getNodeIconName('database') === 'Database', 'getNodeIconName returns Database for database');
assert(getNodeIconName('search') === 'Search', 'getNodeIconName returns Search for search');
assert(getNodeIconName('scrape') === 'Globe', 'getNodeIconName returns Globe for scrape');
assert(getNodeIconName('python') === 'Terminal', 'getNodeIconName returns Terminal for python');
assert(getNodeIconName('artifact', 'spreadsheet_studio') === 'FileSpreadsheet', 'getNodeIconName returns FileSpreadsheet for spreadsheet_studio');
assert(getNodeIconName('artifact', 'presentation_builder') === 'Presentation', 'getNodeIconName returns Presentation for presentation_builder');
assert(getNodeIconName('artifact', 'doc_writer') === 'FileText', 'getNodeIconName returns FileText for doc_writer');

// ── TEST SUITE 2: Turn Grouping Logic (OpenWorkChatSurface) ──
console.log('\n--- SUITE 2: Conversational Turn Grouping ---');

const mockStreamParts: OpenWorkStreamPart[] = [
  { type: 'user', id: 'u1', text: 'Phân tích doanh thu quý 3', timestamp: '10:00' },
  { type: 'reasoning', id: 'r1', thought: '1. Phân rã yêu cầu\n2. Truy vấn CSDL\n3. Tạo bảng tính Excel' },
  { type: 'capability-call', id: 'c1', toolName: 'sql_query', status: 'success', durationMs: 120, input: { query: 'SELECT * FROM revenue' } },
  { type: 'text', id: 't1', markdown: 'Doanh thu Q3 tăng trưởng 24% so với cùng kỳ.' },
  { type: 'user', id: 'u2', text: 'Tạo slide thuyết trình từ dữ liệu này', timestamp: '10:05' },
  { type: 'capability-call', id: 'c2', toolName: 'presentation_builder', status: 'running', durationMs: 80 },
];

const turnsIdle = groupStreamPartsIntoTurns(mockStreamParts, false);
assert(turnsIdle.length === 2, 'groupStreamPartsIntoTurns partitions 2 turns from user message parts');
assert(turnsIdle[0].userPart?.text === 'Phân tích doanh thu quý 3', 'Turn 1 userPart matches first prompt');
assert(turnsIdle[0].assistantParts.length === 3, 'Turn 1 contains 3 assistant stream parts (reasoning, sql, text)');
assert(turnsIdle[0].isStreaming === false, 'Turn 1 isStreaming is false when global isStreaming is false');
assert(turnsIdle[1].userPart?.text === 'Tạo slide thuyết trình từ dữ liệu này', 'Turn 2 userPart matches second prompt');
assert(turnsIdle[1].assistantParts.length === 1, 'Turn 2 contains 1 assistant stream part (presentation_builder)');

const turnsStreaming = groupStreamPartsIntoTurns(mockStreamParts, true);
assert(turnsStreaming[0].isStreaming === false, 'Historical Turn 1 remains isStreaming: false');
assert(turnsStreaming[1].isStreaming === true, 'Active last Turn 2 has isStreaming: true during generation');

// ── TEST SUITE 3: Dynamic DAG Graph Generation ──
console.log('\n--- SUITE 3: Dynamic DAG Graph Generation ---');

// 3.1 Direct Turn DAG Generation
const directParts: OpenWorkStreamPart[] = [
  { type: 'user', id: 'u-direct', text: 'Xin chào DB-GPT' },
  { type: 'text', id: 't-direct', markdown: 'Xin chào! Tôi có thể giúp gì cho bạn hôm nay?' },
];
const directDAG = generateFlowDAGFromParts(directParts, { isStreaming: false });
assert(directDAG.nodes.length === 2, 'Direct answer produces 2 nodes (Decompose + Synthesis)');
assert(directDAG.nodes[0].type === 'decompose', 'First node is decompose');
assert(directDAG.nodes[1].type === 'synthesis', 'Second node is synthesis');
assert(directDAG.edges.length === 1, '1 edge connects decompose to synthesis');
assert(directDAG.status === 'completed', 'Graph status is completed');

// 3.2 Complex Deep-Think DAG with Multi-Tools
const deepThinkParts: OpenWorkStreamPart[] = [
  { type: 'user', id: 'u-deep', text: 'Phân tích hiệu năng hệ thống và xuất báo cáo' },
  {
    type: 'reasoning',
    id: 'r-deep',
    thought: '1. Kiểm tra tải CPU\n2. Truy vấn latency CSDL\n3. Trích xuất web metrics\n4. Tính toán phân phối số liệu',
    isStreaming: false,
  },
  {
    type: 'capability-call',
    id: 'c-sql',
    toolName: 'sql_query',
    displayName: 'Truy vấn CSDL Latency',
    status: 'success',
    durationMs: 145,
    language: 'sql',
    codeSnippet: 'SELECT avg(latency) FROM request_logs WHERE date = TODAY();',
    input: { database: 'ClickHouse' },
  },
  {
    type: 'capability-call',
    id: 'c-search',
    toolName: 'web_search',
    displayName: 'Tìm kiếm Benchmark',
    status: 'success',
    durationMs: 320,
    input: { query: 'Postgres vs ClickHouse OLAP benchmark 2026' },
  },
  {
    type: 'capability-call',
    id: 'c-py',
    toolName: 'python_interpreter',
    displayName: 'Python Sandbox',
    status: 'success',
    durationMs: 85,
    language: 'python',
    codeSnippet: 'import numpy as np; print(np.mean([12, 14, 15]))',
  },
  {
    type: 'text',
    id: 't-deep',
    markdown: 'Báo cáo hiệu năng đã hoàn tất.',
    keyPoints: ['Latency trung bình 12.4ms', 'Throughput đạt 45,000 QPS'],
    suggestedArtifactTab: 'excel',
  },
  {
    type: 'capability-call',
    id: 'c-excel',
    toolName: 'spreadsheet_studio',
    displayName: 'Bảng tính Excel',
    status: 'success',
    durationMs: 210,
    input: { filename: 'Latency_Report.xlsx' },
  },
];

const deepDAG = generateFlowDAGFromParts(deepThinkParts, { isStreaming: false });
assert(deepDAG.nodes.length >= 6, 'Complex turn produces all expected stage nodes');
assert(deepDAG.stages.length === 4, 'Graph contains 4 active stages (Stage 0 Planning, Stage 1 Evidence, Stage 2 Synthesis, Stage 3 Artifacts)');
assert(deepDAG.stages[0].name === 'Planning', 'Stage 0 is Planning');
assert(deepDAG.stages[1].name === 'Evidence & Tools', 'Stage 1 is Evidence & Tools');
assert(deepDAG.stages[2].name === 'Synthesis', 'Stage 2 is Synthesis');
assert(deepDAG.stages[3].name === 'Artifacts', 'Stage 3 is Artifacts');
assert(deepDAG.metrics.parallelBranches >= 3, 'Stage 1 identifies parallel branches (Reasoning + SQL + Search + Python)');
assert(deepDAG.metrics.hasArtifacts === true, 'Metrics detects generated artifacts');
assert(deepDAG.bounds.width > 0 && deepDAG.bounds.height > 0, 'Bounding box calculated accurately');

// 3.3 Active Streaming DAG
const liveStreamParts: OpenWorkStreamPart[] = [
  { type: 'user', id: 'u-live', text: 'Tìm kiếm thông tin thị trường AI 2026' },
  { type: 'reasoning', id: 'r-live', thought: 'Đang tìm kiếm...', isStreaming: true },
  { type: 'capability-call', id: 'c-live', toolName: 'web_search', status: 'running', input: { query: 'AI trends 2026' } },
];
const liveDAG = generateFlowDAGFromParts(liveStreamParts, { isStreaming: true });
assert(liveDAG.status === 'running', 'Active streaming returns graph status: running');
assert(liveDAG.activeNodeId !== undefined, 'Active node ID is identified');
assert(liveDAG.edges.some((e) => e.animated === true), 'Edges in active stage have animated: true');

// 3.4 Error Resilience DAG
const errorParts: OpenWorkStreamPart[] = [
  { type: 'user', id: 'u-err', text: 'Truy vấn dữ liệu bảng không tồn tại' },
  { type: 'capability-call', id: 'c-err', toolName: 'sql_query', status: 'failed', error: 'Table missing_table does not exist' },
];
const errDAG = generateFlowDAGFromParts(errorParts, { isStreaming: false });
assert(errDAG.status === 'failed', 'Graph with failed tool step flags overall status as failed');
assert(errDAG.metrics.failedSteps === 1, 'Failed step count recorded in metrics');
assert(errDAG.nodes.some((n) => n.status === 'failed' && n.payload?.error?.includes('missing_table')), 'Node payload captures error trace');

console.log('\n================================================================');
console.log(`M1 Verification Results: ${passed} passed, ${failed} failed.`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
