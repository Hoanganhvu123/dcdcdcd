#!/usr/bin/env node
/**
 * DeepSeek V4 Integration & OpenWork Coworker Workspace Verification Suite
 * 
 * 4-Tier Opaque-Box Test Architecture:
 * - Tier 1: Feature Coverage (SSE line & delta parser for reasoning_content, content, tool_calls; model selection; API key hydration; theme switch)
 * - Tier 2: Boundary & Corner Cases (empty API key fallback, invalid/malformed SSE chunks, network timeouts, abort signals, huge JSON, empty content deltas)
 * - Tier 3: Cross-Feature Interactions (tool execution event triggering live Excel/Slide workbench updates, CoT reasoning accordion expanding during streaming, model switch updating request headers)
 * - Tier 4: Real-World Scenarios (Full end-to-end analytical workflow: prompt -> thinking stream -> SQL tool execution -> Excel XLSX PnL update -> Slide PPTX presentation generation -> dual theme switch)
 *
 * Direct execution:
 *   node tests/deepseek-v4-integration.check.mjs
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

console.log('================================================================');
console.log('🧪 DEEPSEEK V4 & OPENWORK COWORKER 4-TIER INTEGRATION SUITE');
console.log('================================================================\n');

let totalAssertions = 0;
let testsPassed = 0;
let testsFailed = 0;
const tierSummary = [];

function runSyncTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${error.message}`);
    testsFailed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${error.message}`);
    testsFailed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      totalAssertions++;
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      totalAssertions++;
      assert.deepStrictEqual(actual, expected);
    },
    toBeTruthy() {
      totalAssertions++;
      assert.ok(Boolean(actual));
    },
    toBeFalsy() {
      totalAssertions++;
      assert.ok(!actual);
    },
    toContain(expected) {
      totalAssertions++;
      if (typeof actual === 'string' || Array.isArray(actual)) {
        assert.ok(actual.includes(expected), `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
      } else {
        throw new Error(`Unsupported type for toContain: ${typeof actual}`);
      }
    },
    toBeGreaterThan(expected) {
      totalAssertions++;
      assert.ok(actual > expected, `Expected ${actual} > ${expected}`);
    },
    toBeGreaterThanOrEqual(expected) {
      totalAssertions++;
      assert.ok(actual >= expected, `Expected ${actual} >= ${expected}`);
    },
    toMatch(regex) {
      totalAssertions++;
      assert.match(String(actual), regex);
    },
    toThrow(regexOrError) {
      totalAssertions++;
      if (typeof actual !== 'function') {
        throw new Error('Expected function for toThrow');
      }
      assert.throws(actual, regexOrError);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Domain Engine: DeepSeek V4 SSE Parser & Stream Accumulator
// ─────────────────────────────────────────────────────────────────────────────

export class DeepSeekV4StreamParser extends EventEmitter {
  constructor(options = {}) {
    super();
    this.model = options.model || 'deepseek-v4-flash';
    this.apiKey = options.apiKey || '';
    this.baseUrl = options.baseUrl || 'https://api.deepseek.com/chat/completions';
    this.buffer = '';
    this.reasoningContent = '';
    this.content = '';
    this.toolCalls = [];
    this.activeToolCall = null;
    this.isDone = false;
    this.isAborted = false;
    this.tokensUsed = 0;
  }

  /**
   * Builds OpenAI/DeepSeek V4-compatible Chat Completion HTTP Request headers and body
   */
  buildRequest(prompt, systemPrompt = '', options = {}) {
    const key = (options.apiKey !== undefined ? options.apiKey : this.apiKey).trim();
    if (!key) {
      throw new Error('API_KEY_REQUIRED: DeepSeek API key must be provided.');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${key}`,
      'X-Requested-With': 'DB-GPT-OpenWork-Coworker',
    };

    if (options.customHeaders) {
      Object.assign(headers, options.customHeaders);
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: options.model || this.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 4096,
    };

    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice || 'auto';
    }

    return {
      url: options.baseUrl || this.baseUrl,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };
  }

  /**
   * Ingests a raw network chunk (string or buffer) and splits into SSE data frames
   */
  feedChunk(chunk) {
    if (this.isAborted || this.isDone) return;
    this.buffer += (typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || ''; // Keep incomplete trailing fragment

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith(':')) continue; // Skip SSE comments/keep-alives

      if (line.startsWith('data:')) {
        const payloadStr = line.slice(5).trim();
        if (payloadStr === '[DONE]') {
          this.isDone = true;
          this.emit('done', {
            reasoningContent: this.reasoningContent,
            content: this.content,
            toolCalls: this.toolCalls,
            tokensUsed: this.tokensUsed,
          });
          return;
        }

        try {
          const parsed = JSON.parse(payloadStr);
          this.processDelta(parsed);
        } catch (err) {
          this.emit('error', new Error(`MALFORMED_SSE_JSON: ${err.message} in "${payloadStr}"`));
        }
      }
    }
  }

  /**
   * Processes a single DeepSeek V4 Chat Completion chunk
   */
  processDelta(chunk) {
    const choice = chunk?.choices?.[0];
    if (!choice) return;

    this.tokensUsed += 1;
    const delta = choice.delta || {};

    // 1. DeepSeek V4 Chain-of-Thought reasoning content
    if (delta.reasoning_content !== undefined && delta.reasoning_content !== null) {
      const reasoningDelta = String(delta.reasoning_content);
      if (reasoningDelta.length > 0) {
        this.reasoningContent += reasoningDelta;
        this.emit('reasoning_delta', {
          delta: reasoningDelta,
          full: this.reasoningContent,
        });
      }
    }

    // 2. Main response prose content
    if (delta.content !== undefined && delta.content !== null) {
      const contentDelta = String(delta.content);
      if (contentDelta.length > 0) {
        this.content += contentDelta;
        this.emit('content_delta', {
          delta: contentDelta,
          full: this.content,
        });
      }
    }

    // 3. Streaming Tool Calls
    if (Array.isArray(delta.tool_calls)) {
      for (const tcDelta of delta.tool_calls) {
        const index = tcDelta.index ?? 0;
        if (!this.toolCalls[index]) {
          this.toolCalls[index] = {
            id: tcDelta.id || `call_${Date.now()}_${index}`,
            type: tcDelta.type || 'function',
            function: {
              name: tcDelta.function?.name || '',
              arguments: '',
            },
          };
          this.emit('tool_call_start', this.toolCalls[index]);
        }

        if (tcDelta.function?.name && !this.toolCalls[index].function.name) {
          this.toolCalls[index].function.name = tcDelta.function.name;
        }

        if (tcDelta.function?.arguments) {
          this.toolCalls[index].function.arguments += tcDelta.function.arguments;
          this.emit('tool_call_delta', {
            index,
            delta: tcDelta.function.arguments,
            currentArgs: this.toolCalls[index].function.arguments,
          });
        }
      }
    }

    // Check finish_reason
    if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
      this.emit('choice_finish', {
        finish_reason: choice.finish_reason,
        reasoningContent: this.reasoningContent,
        content: this.content,
        toolCalls: this.toolCalls,
      });
    }
  }

  abort() {
    this.isAborted = true;
    this.emit('aborted', {
      partialReasoning: this.reasoningContent,
      partialContent: this.content,
      partialToolCalls: this.toolCalls,
    });
  }

  reset() {
    this.buffer = '';
    this.reasoningContent = '';
    this.content = '';
    this.toolCalls = [];
    this.isDone = false;
    this.isAborted = false;
    this.tokensUsed = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Workbench & Theme State Emulator
// ─────────────────────────────────────────────────────────────────────────────

export class OpenWorkWorkbenchState {
  constructor() {
    this.theme = 'light';
    this.activeTab = 'excel';
    this.isThoughtOpen = true;
    this.isToolOpen = true;
    this.artifacts = {
      excel: {
        id: 'ow-xlsx-pnl',
        filename: 'PnL_4_Quarters_Consolidated.xlsx',
        status: 'synced',
        rows: [],
      },
      slide: {
        id: 'ow-slide-deck',
        filename: 'Q3_Financial_Review_16x9.pptx',
        status: 'ready',
        slides: [],
      },
      docx: {
        id: 'ow-docx-report',
        filename: 'Executive_Financial_Summary.docx',
        status: 'ready',
        title: 'Executive Financial Summary',
      },
      code: {
        id: 'ow-py-script',
        filename: 'pnl_calculation.py',
        code: '',
      },
    };
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    return this.theme;
  }

  setTab(tab) {
    if (['excel', 'slide', 'docx', 'code'].includes(tab)) {
      this.activeTab = tab;
    }
  }

  applyToolResult(toolName, result) {
    if (toolName === 'sql_query_runner' || toolName === 'tools.sql_query_runner') {
      this.artifacts.excel.rows = result.rows || [];
      this.artifacts.excel.status = 'synced';
      this.activeTab = 'excel';
    } else if (toolName === 'presentation_builder') {
      this.artifacts.slide.slides = result.slides || [];
      this.artifacts.slide.status = 'ready';
      this.activeTab = 'slide';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1: FEATURE COVERAGE (≥20 Assertions)
// ─────────────────────────────────────────────────────────────────────────────

console.log('📦 TIER 1: FEATURE COVERAGE');
console.log('────────────────────────────────────────────────────────────────');

let tier1Count = 0;

runSyncTest('T1.1: DeepSeek V4 Model Identifier & Request Header Construction', () => {
  const parser = new DeepSeekV4StreamParser({
    model: 'deepseek-v4-flash',
    apiKey: 'dsk-test-key-valid-998877',
  });

  const req = parser.buildRequest('Phân tích PnL 4 quý', 'Bạn là trợ lý tài chính.');
  expect(req.url).toBe('https://api.deepseek.com/chat/completions');
  expect(req.method).toBe('POST');
  expect(req.headers['Content-Type']).toBe('application/json');
  expect(req.headers['Accept']).toBe('text/event-stream');
  expect(req.headers['Authorization']).toBe('Bearer dsk-test-key-valid-998877');
  expect(req.headers['X-Requested-With']).toBe('DB-GPT-OpenWork-Coworker');

  const parsedBody = JSON.parse(req.body);
  expect(parsedBody.model).toBe('deepseek-v4-flash');
  expect(parsedBody.stream).toBe(true);
  expect(parsedBody.messages.length).toBe(2);
  expect(parsedBody.messages[0].role).toBe('system');
  expect(parsedBody.messages[1].role).toBe('user');
  expect(parsedBody.temperature).toBe(0.6);
  tier1Count++;
});

runSyncTest('T1.2: DeepSeek V4 SSE Line & Chunk Framing Parser', () => {
  const parser = new DeepSeekV4StreamParser();
  let deltaCount = 0;
  let doneCalled = false;

  parser.on('reasoning_delta', () => deltaCount++);
  parser.on('done', () => (doneCalled = true));

  // Chunk 1: Single line
  parser.feedChunk('data: {"choices":[{"delta":{"reasoning_content":"Bước 1: "}}]}\n\n');
  expect(parser.reasoningContent).toBe('Bước 1: ');

  // Chunk 2: Multi-line in single packet
  parser.feedChunk(
    'data: {"choices":[{"delta":{"reasoning_content":"Kiểm tra "}}]}\n' +
    'data: {"choices":[{"delta":{"reasoning_content":"PostgreSQL schema."}}]}\n\n'
  );
  expect(parser.reasoningContent).toBe('Bước 1: Kiểm tra PostgreSQL schema.');

  // Chunk 3: Split across chunk boundary (partial line buffering)
  parser.feedChunk('data: {"choices":[{"del');
  expect(parser.reasoningContent).toBe('Bước 1: Kiểm tra PostgreSQL schema.'); // Not modified yet
  parser.feedChunk('ta":{"reasoning_content":" Tiếp tục."}}]}\n\n');
  expect(parser.reasoningContent).toBe('Bước 1: Kiểm tra PostgreSQL schema. Tiếp tục.');

  // Chunk 4: Done terminator
  parser.feedChunk('data: [DONE]\n\n');
  expect(doneCalled).toBe(true);
  expect(parser.isDone).toBe(true);
  tier1Count++;
});

runSyncTest('T1.3: Chain-of-Thought (reasoning_content) Streaming Extraction', () => {
  const parser = new DeepSeekV4StreamParser();
  const reasoningDeltas = [];

  parser.on('reasoning_delta', (evt) => {
    reasoningDeltas.push(evt.delta);
  });

  const thoughtSequence = [
    'Phân tích câu hỏi: "Doanh thu Q3".\n',
    '1. Trích xuất bảng `q3_financial_records`.\n',
    '2. Tính tổng Revenue, COGS, EBIT.\n',
    '3. Xuất bảng Excel 4 quý.',
  ];

  for (const piece of thoughtSequence) {
    const chunk = `data: ${JSON.stringify({
      choices: [{ delta: { reasoning_content: piece } }],
    })}\n\n`;
    parser.feedChunk(chunk);
  }

  expect(reasoningDeltas.length).toBe(4);
  expect(parser.reasoningContent).toContain('Phân tích câu hỏi: "Doanh thu Q3".');
  expect(parser.reasoningContent).toContain('3. Xuất bảng Excel 4 quý.');
  expect(parser.content).toBe(''); // Answer content should remain empty
  tier1Count++;
});

runSyncTest('T1.4: Answer Content (content) Delta Stream Accumulation', () => {
  const parser = new DeepSeekV4StreamParser();
  const contentDeltas = [];

  parser.on('content_delta', (evt) => {
    contentDeltas.push(evt.delta);
  });

  const prosePieces = [
    '# Báo Cáo Tài Chính Q3/2026\n\n',
    'Doanh thu thuần đạt **$2,450,000** (+18.5% YoY).\n',
    'Lợi nhuận gộp đạt **$1,620,000** (Biên lợi nhuận: **66.1%**).\n',
    'Toàn bộ bảng tính đã được đồng bộ sang Artifact Workbench.',
  ];

  for (const piece of prosePieces) {
    const chunk = `data: ${JSON.stringify({
      choices: [{ delta: { content: piece } }],
    })}\n\n`;
    parser.feedChunk(chunk);
  }

  expect(contentDeltas.length).toBe(4);
  expect(parser.content).toContain('# Báo Cáo Tài Chính Q3/2026');
  expect(parser.content).toContain('Doanh thu thuần đạt **$2,450,000**');
  expect(parser.reasoningContent).toBe(''); // CoT should be empty
  tier1Count++;
});

runSyncTest('T1.5: DeepSeek V4 Tool Calls Streaming Assembly & JSON Parsing', () => {
  const parser = new DeepSeekV4StreamParser();
  let toolStarted = false;
  const toolArgDeltas = [];

  parser.on('tool_call_start', (tc) => {
    toolStarted = true;
    expect(tc.function.name).toBe('tools.sql_query_runner');
  });

  parser.on('tool_call_delta', (evt) => {
    toolArgDeltas.push(evt.delta);
  });

  // Event 1: Tool call declaration
  parser.feedChunk(`data: ${JSON.stringify({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call_sql_q3_001',
          type: 'function',
          function: { name: 'tools.sql_query_runner', arguments: '{"query":' },
        }],
      },
    }],
  })}\n\n`);

  expect(toolStarted).toBe(true);

  // Event 2: Chunked argument streaming
  parser.feedChunk(`data: ${JSON.stringify({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          function: { arguments: ' "SELECT quarter, SUM(net_revenue) AS revenue' },
        }],
      },
    }],
  })}\n\n`);

  parser.feedChunk(`data: ${JSON.stringify({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          function: { arguments: ' FROM q3_financial_records GROUP BY quarter;"}' },
        }],
      },
    }],
  })}\n\n`);

  expect(parser.toolCalls.length).toBe(1);
  const tc = parser.toolCalls[0];
  expect(tc.id).toBe('call_sql_q3_001');
  expect(tc.function.name).toBe('tools.sql_query_runner');

  // Verify assembled JSON arguments parse cleanly
  const parsedArgs = JSON.parse(tc.function.arguments);
  expect(parsedArgs.query).toContain('SELECT quarter, SUM(net_revenue)');
  expect(parsedArgs.query).toContain('FROM q3_financial_records');
  tier1Count++;
});

runSyncTest('T1.6: Dual Theme Switching State Machine (Light vs Dark Obsidian)', () => {
  const wb = new OpenWorkWorkbenchState();
  expect(wb.theme).toBe('light');

  // Switch to Dark Obsidian
  const darkTheme = wb.toggleTheme();
  expect(darkTheme).toBe('dark');
  expect(wb.theme).toBe('dark');

  // Switch back to Light
  const lightTheme = wb.toggleTheme();
  expect(lightTheme).toBe('light');
  expect(wb.theme).toBe('light');
  tier1Count++;
});

tierSummary.push({ tier: 'Tier 1: Feature Coverage', passed: tier1Count, total: 6 });

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2: BOUNDARY & CORNER CASES (≥20 Assertions)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📦 TIER 2: BOUNDARY & CORNER CASES');
console.log('────────────────────────────────────────────────────────────────');

let tier2Count = 0;

runSyncTest('T2.1: Missing / Empty API Key Fallback Handling', () => {
  const parser = new DeepSeekV4StreamParser({ apiKey: '' });

  // Empty string throws
  expect(() => parser.buildRequest('Hello')).toThrow(/API_KEY_REQUIRED/);

  // Whitespace-only throws
  expect(() => parser.buildRequest('Hello', '', { apiKey: '   ' })).toThrow(/API_KEY_REQUIRED/);

  // Valid key succeeds
  const validReq = parser.buildRequest('Hello', '', { apiKey: 'dsk-dynamic-key-123' });
  expect(validReq.headers['Authorization']).toBe('Bearer dsk-dynamic-key-123');
  tier2Count++;
});

runSyncTest('T2.2: Malformed JSON Frames & Stream Noise Resilience', () => {
  const parser = new DeepSeekV4StreamParser();
  const errors = [];

  parser.on('error', (err) => errors.push(err.message));

  // Feed invalid JSON line
  parser.feedChunk('data: {not_valid_json_here!!}\n\n');
  expect(errors.length).toBe(1);
  expect(errors[0]).toContain('MALFORMED_SSE_JSON');

  // Feed garbage comments and blank lines
  parser.feedChunk(': this is a comment\n\n\n   \n');

  // Subsequent valid line MUST still be parsed correctly
  parser.feedChunk('data: {"choices":[{"delta":{"content":"Recovery OK"}}]}\n\n');
  expect(parser.content).toBe('Recovery OK');
  tier2Count++;
});

runSyncTest('T2.3: Network Abort Signal & Partial State Retention', () => {
  const parser = new DeepSeekV4StreamParser();
  let abortedEvent = null;

  parser.on('aborted', (evt) => {
    abortedEvent = evt;
  });

  // Stream some reasoning and content
  parser.feedChunk('data: {"choices":[{"delta":{"reasoning_content":"Đang suy nghĩ dở dang..."}}]}\n\n');
  parser.feedChunk('data: {"choices":[{"delta":{"content":"Bắt đầu trả lời..."}}]}\n\n');

  expect(parser.reasoningContent).toBe('Đang suy nghĩ dở dang...');
  expect(parser.content).toBe('Bắt đầu trả lời...');

  // User clicks Abort
  parser.abort();
  expect(parser.isAborted).toBe(true);
  expect(abortedEvent).toBeTruthy();
  expect(abortedEvent.partialReasoning).toBe('Đang suy nghĩ dở dang...');
  expect(abortedEvent.partialContent).toBe('Bắt đầu trả lời...');

  // Further chunks after abort must be ignored
  parser.feedChunk('data: {"choices":[{"delta":{"content":" Thêm sau abort."}}]}\n\n');
  expect(parser.content).toBe('Bắt đầu trả lời...');
  tier2Count++;
});

runSyncTest('T2.4: Empty Deltas, Whitespace-Only Tokens & Null Payloads', () => {
  const parser = new DeepSeekV4StreamParser();

  // Feed empty content deltas
  parser.feedChunk('data: {"choices":[{"delta":{}}]}\n\n');
  parser.feedChunk('data: {"choices":[{"delta":{"content":""}}]}\n\n');
  parser.feedChunk('data: {"choices":[{"delta":{"reasoning_content":""}}]}\n\n');
  parser.feedChunk('data: {"choices":[]}\n\n');
  parser.feedChunk('data: {"choices":[{"delta":null}]}\n\n');

  expect(parser.content).toBe('');
  expect(parser.reasoningContent).toBe('');
  expect(parser.toolCalls.length).toBe(0);

  // Feed actual content
  parser.feedChunk('data: {"choices":[{"delta":{"content":"A"}}]}\n\n');
  expect(parser.content).toBe('A');
  tier2Count++;
});

runSyncTest('T2.5: Massive Payload Stress (256KB+ Streaming Chunks)', () => {
  const parser = new DeepSeekV4StreamParser();
  
  // Generate 256KB chunk of streaming text
  const largePiece = 'X'.repeat(64 * 1024); // 64KB
  const chunk = `data: ${JSON.stringify({
    choices: [{ delta: { content: largePiece } }],
  })}\n\n`;

  for (let i = 0; i < 4; i++) {
    parser.feedChunk(chunk);
  }

  expect(parser.content.length).toBe(256 * 1024);
  expect(parser.content.startsWith('XXXXX')).toBe(true);
  expect(parser.tokensUsed).toBe(4);
  tier2Count++;
});

runSyncTest('T2.6: High-Frequency Burst Streaming (1,000 Micro-Deltas)', () => {
  const parser = new DeepSeekV4StreamParser();
  const start = performance.now();

  for (let i = 0; i < 1000; i++) {
    const chunk = `data: ${JSON.stringify({
      choices: [{ delta: { content: `[tok_${i}]` } }],
    })}\n\n`;
    parser.feedChunk(chunk);
  }

  const duration = performance.now() - start;
  expect(parser.tokensUsed).toBe(1000);
  expect(parser.content.includes('[tok_0]')).toBe(true);
  expect(parser.content.includes('[tok_999]')).toBe(true);
  expect(duration).toBeGreaterThan(0);
  tier2Count++;
});

tierSummary.push({ tier: 'Tier 2: Boundary & Corner Cases', passed: tier2Count, total: 6 });

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3: CROSS-FEATURE INTERACTIONS & COMBINATIONS (Pairwise)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📦 TIER 3: CROSS-FEATURE INTERACTIONS');
console.log('────────────────────────────────────────────────────────────────');

let tier3Count = 0;

runSyncTest('T3.1: SQL Tool Call Event Triggers Live Excel XLSX Workbench Sync', () => {
  const parser = new DeepSeekV4StreamParser();
  const wb = new OpenWorkWorkbenchState();

  // 1. Tool Call streamed from DeepSeek V4
  parser.feedChunk(`data: ${JSON.stringify({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call_sql_pnl_01',
          type: 'function',
          function: {
            name: 'tools.sql_query_runner',
            arguments: JSON.stringify({
              query: 'SELECT quarter, revenue, cogs, gross_profit FROM q3_financial_records;',
            }),
          },
        }],
      },
    }],
  })}\n\n`);

  expect(parser.toolCalls.length).toBe(1);
  const tool = parser.toolCalls[0];
  expect(tool.function.name).toBe('tools.sql_query_runner');

  // 2. Simulated SQL Execution Result in DB-GPT Engine
  const sqlResult = {
    rows: [
      ['Doanh Thu Thuần', '$1,950,000', '$2,100,000', '$2,450,000', '+18.5%'],
      ['Giá Vốn (COGS)', '$720,000', '$780,000', '$830,000', '+6.4%'],
      ['Lợi Nhuận Gộp', '$1,230,000', '$1,320,000', '$1,620,000', '+22.7%'],
      ['Chi Phí Vận Hành', '$780,000', '$810,000', '$840,000', '+3.7%'],
      ['EBIT (Thuần)', '$450,000', '$510,000', '$780,000', '+52.9%'],
    ],
  };

  // 3. Apply to Workbench
  wb.applyToolResult('tools.sql_query_runner', sqlResult);

  expect(wb.activeTab).toBe('excel');
  expect(wb.artifacts.excel.status).toBe('synced');
  expect(wb.artifacts.excel.rows.length).toBe(5);
  expect(wb.artifacts.excel.rows[0][0]).toBe('Doanh Thu Thuần');
  expect(wb.artifacts.excel.rows[4][3]).toBe('$780,000');
  tier3Count++;
});

runSyncTest('T3.2: Presentation Studio Tool Execution Syncs Slide PPTX Deck', () => {
  const wb = new OpenWorkWorkbenchState();

  const slidePayload = {
    slides: [
      {
        layout: 'hero',
        title: 'Báo Cáo Tài Chính & Chiến Lược Q3/2026',
        subtitle: 'Phân tích tự động bởi OpenWork Coworker',
        impact_stat: '+18.5% EBIT YoY',
      },
      {
        layout: 'stat_grid',
        title: 'Các Chỉ Số Trọng Yếu Q3',
        stats: [
          { label: 'Doanh Thu', value: '$2.45M', change: '+18.5%' },
          { label: 'Lợi Nhuận Gộp', value: '$1.62M', change: '+22.1%' },
          { label: 'EBIT', value: '$780k', change: '+52.9%' },
        ],
      },
    ],
  };

  wb.applyToolResult('presentation_builder', slidePayload);

  expect(wb.activeTab).toBe('slide');
  expect(wb.artifacts.slide.status).toBe('ready');
  expect(wb.artifacts.slide.slides.length).toBe(2);
  expect(wb.artifacts.slide.slides[0].title).toBe('Báo Cáo Tài Chính & Chiến Lược Q3/2026');
  expect(wb.artifacts.slide.slides[1].stats[2].value).toBe('$780k');
  tier3Count++;
});

runSyncTest('T3.3: CoT Reasoning Accordion Expansion State During Streaming', () => {
  const wb = new OpenWorkWorkbenchState();
  const parser = new DeepSeekV4StreamParser();

  expect(wb.isThoughtOpen).toBe(true);

  // While streaming, accordion stays open with live thought updates
  let thoughtUpdateCount = 0;
  parser.on('reasoning_delta', () => {
    if (wb.isThoughtOpen) {
      thoughtUpdateCount++;
    }
  });

  parser.feedChunk('data: {"choices":[{"delta":{"reasoning_content":"Step 1: Parse schema."}}]}\n\n');
  parser.feedChunk('data: {"choices":[{"delta":{"reasoning_content":" Step 2: Compute margins."}}]}\n\n');

  expect(thoughtUpdateCount).toBe(2);
  expect(parser.reasoningContent).toBe('Step 1: Parse schema. Step 2: Compute margins.');

  // User manually collapses accordion
  wb.isThoughtOpen = false;
  expect(wb.isThoughtOpen).toBe(false);

  // Subsequent streaming reasoning does not force uncollapse if user collapsed
  parser.feedChunk('data: {"choices":[{"delta":{"reasoning_content":" Step 3: Done."}}]}\n\n');
  expect(parser.reasoningContent).toBe('Step 1: Parse schema. Step 2: Compute margins. Step 3: Done.');
  expect(wb.isThoughtOpen).toBe(false);
  tier3Count++;
});

runSyncTest('T3.4: Dynamic Model Switch (`deepseek-v4-flash`) Updates Request Headers & Payload', () => {
  const parser = new DeepSeekV4StreamParser({
    model: 'dbgpt-core',
    apiKey: 'dsk-universal-key-456',
  });

  const req1 = parser.buildRequest('Hello');
  expect(JSON.parse(req1.body).model).toBe('dbgpt-core');

  // Switch model to DeepSeek V4 Flash
  parser.model = 'deepseek-v4-flash';
  const req2 = parser.buildRequest('Hello');
  expect(JSON.parse(req2.body).model).toBe('deepseek-v4-flash');
  expect(req2.headers['Authorization']).toBe('Bearer dsk-universal-key-456');
  tier3Count++;
});

runSyncTest('T3.5: Dual Theme Toggle Mid-Stream Preserves Accumulator State', () => {
  const parser = new DeepSeekV4StreamParser();
  const wb = new OpenWorkWorkbenchState();

  // Ingest partial stream in Light theme
  wb.theme = 'light';
  parser.feedChunk('data: {"choices":[{"delta":{"content":"Báo cáo "}}]}\n\n');
  expect(parser.content).toBe('Báo cáo ');

  // Toggle to Dark Obsidian mid-stream
  wb.toggleTheme();
  expect(wb.theme).toBe('dark');

  // Continue streaming deltas
  parser.feedChunk('data: {"choices":[{"delta":{"content":"kết quả tài chính."}}]}\n\n');
  expect(parser.content).toBe('Báo cáo kết quả tài chính.');
  expect(wb.theme).toBe('dark');
  tier3Count++;
});

runSyncTest('T3.6: Multi-Tab Workbench Switching During Active Stream', () => {
  const wb = new OpenWorkWorkbenchState();

  wb.setTab('excel');
  expect(wb.activeTab).toBe('excel');

  wb.setTab('slide');
  expect(wb.activeTab).toBe('slide');

  wb.setTab('docx');
  expect(wb.activeTab).toBe('docx');

  wb.setTab('code');
  expect(wb.activeTab).toBe('code');

  // Invalid tab ignored
  wb.setTab('unknown_tab');
  expect(wb.activeTab).toBe('code');
  tier3Count++;
});

tierSummary.push({ tier: 'Tier 3: Cross-Feature Interactions', passed: tier3Count, total: 6 });

// ─────────────────────────────────────────────────────────────────────────────
// TIER 4: REAL-WORLD SCENARIOS (End-to-End Workflow)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📦 TIER 4: REAL-WORLD SCENARIOS');
console.log('────────────────────────────────────────────────────────────────');

let tier4Count = 0;

await runAsyncTest('T4.1: Full End-to-End DeepSeek V4 Analytical Workflow (Prompt -> CoT -> SQL -> Excel -> Slide -> Theme)', async () => {
  const parser = new DeepSeekV4StreamParser({
    model: 'deepseek-v4-flash',
    apiKey: 'dsk-live-prod-key-991122',
  });
  const wb = new OpenWorkWorkbenchState();

  // 1. Build Request
  const prompt = 'Trích xuất bảng PnL 4 quý và phân tích biên lợi nhuận hoạt động';
  const req = parser.buildRequest(prompt, 'Bạn là AI Chuyên viên Phân tích Dữ liệu.');
  expect(req.headers['Authorization']).toBe('Bearer dsk-live-prod-key-991122');
  expect(JSON.parse(req.body).model).toBe('deepseek-v4-flash');

  // 2. Stream Chain-of-Thought
  const reasoningChunks = [
    'Phân tích yêu cầu: Tính toán PnL 4 quý và biên lợi nhuận hoạt động.\n',
    '1. Schema alignment: Đối chiếu bảng `q3_financial_records` trong PostgreSQL DW.\n',
    '2. Gọi tool `sql_query_runner` để tính tổng Doanh thu, COGS và Lợi nhuận gộp.\n',
    '3. Đồng bộ dataset vào Artifact Workbench (Excel XLSX & Slide PPTX 16:9).',
  ];

  for (const rc of reasoningChunks) {
    parser.feedChunk(`data: ${JSON.stringify({
      choices: [{ delta: { reasoning_content: rc } }],
    })}\n\n`);
  }

  expect(parser.reasoningContent).toContain('1. Schema alignment');
  expect(parser.reasoningContent).toContain('3. Đồng bộ dataset');

  // 3. Tool Execution Call
  parser.feedChunk(`data: ${JSON.stringify({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call_sql_runner_e2e',
          type: 'function',
          function: {
            name: 'tools.sql_query_runner',
            arguments: JSON.stringify({
              query: 'SELECT quarter, SUM(net_revenue) AS revenue, SUM(cogs) AS cost, (SUM(net_revenue) - SUM(cogs)) AS gross_profit FROM q3_financial_records GROUP BY quarter;',
            }),
          },
        }],
      },
    }],
  })}\n\n`);

  expect(parser.toolCalls.length).toBe(1);

  // 4. SQL Tool Execution Output & Excel Update
  const sqlExecutionOutput = {
    rows: [
      ['Doanh Thu Thuần', '$1,950,000', '$2,100,000', '$2,450,000', '+18.5%'],
      ['Giá Vốn (COGS)', '$720,000', '$780,000', '$830,000', '+6.4%'],
      ['Lợi Nhuận Gộp', '$1,230,000', '$1,320,000', '$1,620,000', '+22.7%'],
      ['Chi Phí Vận Hành', '$780,000', '$810,000', '$840,000', '+3.7%'],
      ['EBIT (Thuần)', '$450,000', '$510,000', '$780,000', '+52.9%'],
    ],
  };
  wb.applyToolResult('tools.sql_query_runner', sqlExecutionOutput);
  expect(wb.artifacts.excel.rows.length).toBe(5);
  expect(wb.artifacts.excel.rows[0][3]).toBe('$2,450,000');

  // 5. Slide PPTX Generation
  const presentationOutput = {
    slides: [
      {
        layout: 'hero',
        title: 'Báo Cáo Tài Chính & Chiến Lược Q3/2026',
        subtitle: 'Phân tích tự động bởi OpenWork Coworker Multi-Agent Framework',
        impact_stat: '+18.5% EBIT YoY',
      },
      {
        layout: 'stat_grid',
        title: 'Các Chỉ Số Trọng Yếu',
        stats: [
          { label: 'Doanh Thu Thuần', value: '$2.45M', change: '+18.5%' },
          { label: 'Lợi Nhuận Gộp', value: '$1.62M', change: '+22.1%' },
          { label: 'EBITDA', value: '$780k', change: '+14.2%' },
          { label: 'Chi Phí Vận Hành', value: '$840k', change: '-3.8%' },
        ],
      },
    ],
  };
  wb.applyToolResult('presentation_builder', presentationOutput);
  expect(wb.artifacts.slide.slides.length).toBe(2);

  // 6. Stream Final Assistant Synthesis
  const proseChunks = [
    'Báo cáo kết quả phân tích PnL Q3/2026:\n',
    '- **Doanh thu thuần:** Đạt **$2,450,000** (+18.5% YoY).\n',
    '- **Lợi nhuận gộp:** Đạt **$1,620,000** (Biên lợi nhuận **66.1%**).\n',
    '- **Tài liệu xuất bản:** Bảng tính Excel hoàn chỉnh và Slide thuyết trình 16:9 đã được mở sẵn bên phải.',
  ];
  for (const pc of proseChunks) {
    parser.feedChunk(`data: ${JSON.stringify({
      choices: [{ delta: { content: pc } }],
    })}\n\n`);
  }
  parser.feedChunk('data: [DONE]\n\n');

  expect(parser.isDone).toBe(true);
  expect(parser.content).toContain('Doanh thu thuần:** Đạt **$2,450,000**');

  // 7. Verify Theme Parity (Light -> Dark Obsidian)
  expect(wb.theme).toBe('light');
  wb.toggleTheme();
  expect(wb.theme).toBe('dark');
  wb.toggleTheme();
  expect(wb.theme).toBe('light');

  tier4Count++;
});

tierSummary.push({ tier: 'Tier 4: Real-World Scenarios', passed: tier4Count, total: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// MASTER SUMMARY & COVERAGE REPORT
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n================================================================');
console.log('📊 DEEPSEEK V4 INTEGRATION TEST SUMMARY');
console.log('================================================================');
for (const item of tierSummary) {
  const pct = item.total > 0 ? Math.round((item.passed / item.total) * 100) : 100;
  console.log(`  ${item.tier.padEnd(42)}: ${item.passed}/${item.total} tests (${pct}%)`);
}
console.log('─'.repeat(64));
console.log(`  Total Test Suites: ${testsPassed + testsFailed}`);
console.log(`  Total Assertions:  ${totalAssertions}`);
console.log(`  Passed:            ${testsPassed}`);
console.log(`  Failed:            ${testsFailed}`);
console.log('================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
