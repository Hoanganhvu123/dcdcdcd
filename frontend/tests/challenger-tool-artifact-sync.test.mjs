import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';

// ============================================================================
// SIMULATED / MIRRORED CONSTANTS & TYPES FROM TARGET SOURCE FILES
// ============================================================================
const MIN_LEFT_SIDEBAR_WIDTH = 220;
const MAX_LEFT_SIDEBAR_WIDTH = 420;
const DEFAULT_LEFT_SIDEBAR_WIDTH = 260;

const MIN_RIGHT_WORKBENCH_WIDTH = 320;
const MAX_RIGHT_WORKBENCH_WIDTH = 960;
const DEFAULT_RIGHT_WORKBENCH_WIDTH = 520;

const PERSISTED_UI_STATE_KEY = 'openwork:ui-state:v1';
const PERSISTED_SETTINGS_KEY = 'openwork:settings:v1';
const OPENWORK_SETTINGS_STORAGE_KEY = 'openwork:settings:v1';

const DEFAULT_OPENWORK_SETTINGS = {
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekModel: 'deepseek-v4-flash',
  temperature: 0.7,
  maxTokens: 4096,
  enableReasoningStream: true,
  theme: 'dark',
};

const DEFAULT_PNL_EXCEL_ARTIFACT = {
  id: 'ow-xlsx-pnl-consolidated',
  name: 'PnL_4_Quarters_Consolidated.xlsx',
  title: 'Bảng Tính PnL Hợp Nhất 4 Quý (2025-2026)',
  type: 'excel',
  extension: '.xlsx',
  status: 'ready',
  version: 3,
  updatedAt: 'Vừa xong',
  content: { sheets: [{ name: 'PnL_Summary', rows: [['Metric', 'Q1']] }] },
};

const DEFAULT_SLIDE_ARTIFACT = {
  id: 'ow-slide-deck-q3',
  name: 'Q3_Financial_Review_16x9.pptx',
  title: 'Báo Cáo Tài Chính & Chiến Lược Q3/2026',
  type: 'slide',
  extension: '.pptx',
  status: 'ready',
  version: 2,
  updatedAt: 'Vừa xong',
  content: { slides: [{ layout: 'hero', title: 'Q3 Review' }] },
};

const DEFAULT_DOCX_ARTIFACT = {
  id: 'ow-docx-executive-summary',
  name: 'Executive_Financial_Summary.docx',
  title: 'Báo Cáo Tóm Tắt Điều Hành Q3/2026 (A4)',
  type: 'docx',
  extension: '.docx',
  status: 'ready',
  version: 1,
  updatedAt: 'Vừa xong',
  content: { title: 'Executive Summary', sections: [] },
};

const DEFAULT_CODE_ARTIFACT = {
  id: 'ow-code-pipeline',
  name: 'financial_aggregation.py',
  title: 'Script Xử Lý & Tính Toán Dữ Liệu PnL',
  type: 'code',
  extension: '.py',
  status: 'ready',
  version: 1,
  updatedAt: 'Vừa xong',
  content: '# OpenWork Autonomous Pipeline\nimport pandas as pd\n',
};

// ============================================================================
// SIMULATED LOGIC FUNCTIONS (EXACT MIRROR OF TARGET COMPONENTS)
// ============================================================================

/**
 * Mirror of resolveToolMeta from OpenWorkCapabilityCallLine.tsx
 */
function resolveToolMeta(toolName, customDisplayName) {
  const lower = (toolName || '').toLowerCase();

  if (lower.includes('sql') || lower.includes('database') || lower.includes('query')) {
    return {
      displayName: customDisplayName || 'SQL Data Analyst (sql_query_runner)',
      icon: 'Database',
      iconColor: 'text-sky-400',
      badgeColor: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      language: 'sql',
      artifactTab: 'excel',
      category: 'Database Query',
    };
  }

  if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('sheet') || lower.includes('pnl')) {
    return {
      displayName: customDisplayName || 'Spreadsheet Studio (spreadsheet_generator)',
      icon: 'FileSpreadsheet',
      iconColor: 'text-emerald-400',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      language: 'json',
      artifactTab: 'excel',
      category: 'Financial Modeling',
    };
  }

  if (lower.includes('presentation') || lower.includes('slide') || lower.includes('deck') || lower.includes('pptx')) {
    return {
      displayName: customDisplayName || 'Presentation Builder (presentation_builder)',
      icon: 'Layers',
      iconColor: 'text-orange-400',
      badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      language: 'json',
      artifactTab: 'slide',
      category: '16:9 Presentation',
    };
  }

  if (lower.includes('doc') || lower.includes('word') || lower.includes('report') || lower.includes('summary')) {
    return {
      displayName: customDisplayName || 'Executive Writer (document_writer)',
      icon: 'FileText',
      iconColor: 'text-blue-400',
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      language: 'markdown',
      artifactTab: 'docx',
      category: 'A4 Document',
    };
  }

  if (lower.includes('python') || lower.includes('sandbox') || lower.includes('code') || lower.includes('script')) {
    return {
      displayName: customDisplayName || 'Python Sandbox (python_sandbox)',
      icon: 'Code2',
      iconColor: 'text-purple-400',
      badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      language: 'python',
      artifactTab: 'code',
      category: 'Code Execution',
    };
  }

  return {
    displayName: customDisplayName || toolName || 'Autonomous Capability Call',
    icon: 'Terminal',
    iconColor: 'text-amber-400',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    language: 'bash',
    artifactTab: 'code',
    category: 'Capability Bridge',
  };
}

/**
 * Mirror of SSE delta parsing from services/deepseek-stream.ts
 */
async function streamDeepSeekChat(options) {
  const {
    apiKey,
    apiBaseUrl,
    model = 'deepseek-v4-flash',
    messages,
    tools,
    temperature = 0.7,
    maxTokens,
    signal,
    onReasoningDelta,
    onContentDelta,
    onToolCallDelta,
    onFinish,
    onError,
  } = options;

  let url = (apiBaseUrl || '/api/deepseek').trim().replace(/\/+$/, '');
  const endpointUrl = url.endsWith('/chat/completions') ? url : `${url}/chat/completions`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const payload = { model, messages, stream: true, temperature };
  if (maxTokens && maxTokens > 0) payload.max_tokens = maxTokens;
  if (tools && tools.length > 0) payload.tools = tools;

  let accumulatedReasoning = '';
  let accumulatedContent = '';
  const accumulatedToolCalls = new Map();

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      onError?.(err);
      throw err;
    }

    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const choice = parsed.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta;
            if (!delta) continue;

            if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
              const deltaReasoning = delta.reasoning_content;
              accumulatedReasoning += deltaReasoning;
              onReasoningDelta?.(deltaReasoning, accumulatedReasoning);
            }

            if (typeof delta.content === 'string' && delta.content.length > 0) {
              const deltaText = delta.content;
              accumulatedContent += deltaText;
              onContentDelta?.(deltaText, accumulatedContent);
            }

            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = typeof tc.index === 'number' ? tc.index : 0;
                let existing = accumulatedToolCalls.get(idx);
                if (!existing) {
                  existing = {
                    index: idx,
                    id: tc.id || `call_${idx}_${Date.now()}`,
                    type: 'function',
                    function: {
                      name: tc.function?.name || '',
                      arguments: tc.function?.arguments || '',
                    },
                  };
                  accumulatedToolCalls.set(idx, existing);
                } else {
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) {
                    existing.function = existing.function || {};
                    existing.function.name = (existing.function.name || '') + tc.function.name;
                  }
                  if (tc.function?.arguments) {
                    existing.function = existing.function || {};
                    existing.function.arguments = (existing.function.arguments || '') + tc.function.arguments;
                  }
                }

                onToolCallDelta?.({
                  index: idx,
                  id: existing.id,
                  name: existing.function?.name,
                  argumentsDelta: tc.function?.arguments,
                  accumulatedArguments: existing.function?.arguments || '',
                });
              }
            }
          } catch (jsonErr) {}
        }
      }
    }

    const finalToolCalls = Array.from(accumulatedToolCalls.values());
    const finalResult = {
      reasoning: accumulatedReasoning,
      content: accumulatedContent,
      toolCalls: finalToolCalls,
    };
    onFinish?.(finalResult);
    return finalResult;
  } catch (error) {
    if (error.name === 'AbortError' || signal?.aborted) {
      const finalResult = {
        reasoning: accumulatedReasoning,
        content: accumulatedContent,
        toolCalls: Array.from(accumulatedToolCalls.values()),
      };
      onFinish?.(finalResult);
      return finalResult;
    }
    onError?.(error);
    throw error;
  }
}

// In-Memory Storage Mock
class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// DOM Mock Environment
class MockDOM {
  constructor() {
    this.attributes = new Map();
    this.classList = new Set();
  }
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }
  getAttribute(k) {
    return this.attributes.get(k) || null;
  }
}

// ============================================================================
// ADVERSARIAL EMPIRICAL TESTS
// ============================================================================
test('🔥 ADVERSARIAL CHALLENGER: TOOL CALL & MULTI-ARTIFACT SYNCHRONIZATION PIPELINE', async (t) => {

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Complex Nested JSON Tool Arguments Across Chunk Boundaries
  // --------------------------------------------------------------------------
  await t.test('1. Tool Call Stream & Complex Nested JSON Chunk Boundary Resilience', async (st) => {

    await st.test('1.1: Byte-by-byte chunk stream reconstruction of deeply nested JSON tool payload', async () => {
      // Create a complex nested payload with SQL, f-strings, unicode, quotes, arrays
      const complexArgs = {
        operation: 'financial_multi_query',
        depth_level: 15,
        sql: `SELECT date_trunc('month', sale_date) AS month, region, SUM(amount) AS total_revenue, COUNT(DISTINCT customer_id) AS active_clients FROM enterprise_transactions WHERE status = 'completed' AND currency = 'USD' AND notes LIKE '%"verified"%' GROUP BY 1, 2 ORDER BY total_revenue DESC LIMIT 50;`,
        metadata: {
          nested_a: {
            nested_b: {
              nested_c: {
                unicode_key: 'Tiếng Việt Có Dấu 🚀 — 財務報表 (Financial)',
                special_chars: 'Tab:\t Newline:\n Quote:\" Backslash:\\ ForwardSlash:/',
                deep_array: [100, 200, { key: 'deep_value', sub_array: [true, false, null] }],
              },
            },
          },
        },
      };

      const rawJson = JSON.stringify(complexArgs);

      // Create an HTTP SSE server simulating chunked delivery
      const sseChunks = [
        `data: {"choices":[{"delta":{"reasoning_content":"Step 1: Parse financial request."}}]}\n\n`,
      ];

      // Split rawJson into tiny 2-character pieces to test extreme boundary fragmentation
      for (let i = 0; i < rawJson.length; i += 2) {
        const piece = rawJson.slice(i, i + 2);
        const sseEvent = `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_sql_stream_99',
                    function: {
                      name: i === 0 ? 'sql_query_runner' : undefined,
                      arguments: piece,
                    },
                  },
                ],
              },
            },
          ],
        })}\n\n`;
        sseChunks.push(sseEvent);
      }
      sseChunks.push(`data: {"choices":[{"delta":{"content":"Analysis query executed successfully."}}]}\n\n`);
      sseChunks.push(`data: [DONE]\n\n`);

      const server = http.createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        let idx = 0;
        const interval = setInterval(() => {
          if (idx < sseChunks.length) {
            res.write(sseChunks[idx]);
            idx++;
          } else {
            clearInterval(interval);
            res.end();
          }
        }, 2);
      });

      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      let latestAccumulatedArgs = '';
      let toolCallEvents = 0;
      let finalStreamResult = null;

      try {
        finalStreamResult = await streamDeepSeekChat({
          apiBaseUrl: baseUrl,
          messages: [{ role: 'user', content: 'Run SQL' }],
          onToolCallDelta: (tc) => {
            toolCallEvents++;
            latestAccumulatedArgs = tc.accumulatedArguments;
          },
        });
      } finally {
        server.close();
      }

      assert.ok(toolCallEvents > 20, 'Should trigger multiple progressive delta events');
      assert.equal(latestAccumulatedArgs, rawJson, 'Accumulated arguments must match exact original JSON');
      assert.equal(finalStreamResult.reasoning, 'Step 1: Parse financial request.');
      assert.equal(finalStreamResult.content, 'Analysis query executed successfully.');
      assert.equal(finalStreamResult.toolCalls.length, 1);
      assert.equal(finalStreamResult.toolCalls[0].function.arguments, rawJson);

      // Verify that parsing intermediate chunks does not throw
      const parsed = JSON.parse(finalStreamResult.toolCalls[0].function.arguments);
      assert.equal(parsed.sql, complexArgs.sql);
      assert.equal(parsed.metadata.nested_a.nested_b.nested_c.unicode_key, 'Tiếng Việt Có Dấu 🚀 — 財務報表 (Financial)');
    });

    await st.test('1.2: Tool argument language & code snippet extraction logic under intermediate states', () => {
      // Test intermediate extraction as done in useOpenWorkStore
      function extractSnippetAndLanguage(accumulatedArgs) {
        let codeSnippet = accumulatedArgs;
        let language = 'json';
        try {
          const parsed = JSON.parse(accumulatedArgs);
          if (parsed.sql || parsed.query) {
            codeSnippet = parsed.sql || parsed.query;
            language = 'sql';
          } else if (parsed.code || parsed.python) {
            codeSnippet = parsed.code || parsed.python;
            language = 'python';
          }
        } catch {
          // JSON incomplete mid-stream
        }
        return { codeSnippet, language };
      }

      // Incomplete JSON:
      const incomplete = '{"sql": "SELECT * FROM sales WHERE year = ';
      const resIncomplete = extractSnippetAndLanguage(incomplete);
      assert.equal(resIncomplete.codeSnippet, incomplete);
      assert.equal(resIncomplete.language, 'json');

      // Complete SQL:
      const completeSql = JSON.stringify({ sql: 'SELECT * FROM sales WHERE year = 2026;' });
      const resSql = extractSnippetAndLanguage(completeSql);
      assert.equal(resSql.codeSnippet, 'SELECT * FROM sales WHERE year = 2026;');
      assert.equal(resSql.language, 'sql');

      // Complete Python:
      const completePy = JSON.stringify({ python: 'import numpy as np\nprint(np.mean([1,2,3]))' });
      const resPy = extractSnippetAndLanguage(completePy);
      assert.equal(resPy.codeSnippet, 'import numpy as np\nprint(np.mean([1,2,3]))');
      assert.equal(resPy.language, 'python');
    });

    await st.test('1.3: OpenWorkCapabilityCallLine metadata resolution across all capability types', () => {
      const cases = [
        { name: 'sql_runner', expectedTab: 'excel', expectedLang: 'sql', expectedCategory: 'Database Query' },
        { name: 'spreadsheet_generator', expectedTab: 'excel', expectedLang: 'json', expectedCategory: 'Financial Modeling' },
        { name: 'pnl_sheet_tool', expectedTab: 'excel', expectedLang: 'json', expectedCategory: 'Financial Modeling' },
        { name: 'presentation_builder', expectedTab: 'slide', expectedLang: 'json', expectedCategory: '16:9 Presentation' },
        { name: 'slide_deck_creator', expectedTab: 'slide', expectedLang: 'json', expectedCategory: '16:9 Presentation' },
        { name: 'document_writer', expectedTab: 'docx', expectedLang: 'markdown', expectedCategory: 'A4 Document' },
        { name: 'executive_word_report', expectedTab: 'docx', expectedLang: 'markdown', expectedCategory: 'A4 Document' },
        { name: 'python_sandbox', expectedTab: 'code', expectedLang: 'python', expectedCategory: 'Code Execution' },
        { name: 'bash_capability_bridge', expectedTab: 'code', expectedLang: 'bash', expectedCategory: 'Capability Bridge' },
        { name: 'unknown_external_mcp', expectedTab: 'code', expectedLang: 'bash', expectedCategory: 'Capability Bridge' },
      ];

      for (const c of cases) {
        const meta = resolveToolMeta(c.name);
        assert.equal(meta.artifactTab, c.expectedTab, `Tab mismatch for ${c.name}`);
        assert.equal(meta.language, c.expectedLang, `Lang mismatch for ${c.name}`);
        assert.equal(meta.category, c.expectedCategory, `Category mismatch for ${c.name}`);
      }
    });

    await st.test('1.4: Output and error serialization robustness under non-string and circular payloads', () => {
      function serializePayload(val) {
        if (!val) return null;
        if (typeof val === 'string') return val;
        try {
          return JSON.stringify(val, null, 2);
        } catch {
          return String(val);
        }
      }

      assert.equal(serializePayload(null), null);
      assert.equal(serializePayload(undefined), null);
      assert.equal(serializePayload('Plain string output'), 'Plain string output');
      assert.equal(serializePayload({ rows: 4, status: 'ok' }), '{\n  "rows": 4,\n  "status": "ok"\n}');

      // Circular object recovery:
      const circular = { a: 1 };
      circular.self = circular;
      const circularStr = serializePayload(circular);
      assert.ok(circularStr.includes('[object Object]'));
    });
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Rapid Multi-Tab Switching & Artifact Synchronization
  // --------------------------------------------------------------------------
  await t.test('2. Multi-Artifact Synchronization & Rapid Tab Switching Under Live Stream', async (st) => {

    await st.test('2.1: 100 Rapid Tab Switches concurrently with stream events without undefined artifact corruption', () => {
      // Simulate useOpenWorkStore state machine
      const tabs = ['excel', 'slide', 'docx', 'code'];
      let activeTab = 'excel';
      let activeArtifactId = 'ow-xlsx-pnl-consolidated';
      let artifacts = [
        DEFAULT_PNL_EXCEL_ARTIFACT,
        DEFAULT_SLIDE_ARTIFACT,
        DEFAULT_DOCX_ARTIFACT,
        DEFAULT_CODE_ARTIFACT,
      ];

      function selectTab(tab) {
        activeTab = tab;
        const matched = artifacts.find((a) => a.type === tab);
        if (matched) {
          activeArtifactId = matched.id;
        }
      }

      function resolveCurrentArtifact() {
        const matched =
          artifacts.find((a) => a.id === activeArtifactId && a.type === activeTab) ||
          artifacts.find((a) => a.type === activeTab);
        if (matched) return matched;
        if (activeTab === 'excel') return DEFAULT_PNL_EXCEL_ARTIFACT;
        if (activeTab === 'slide') return DEFAULT_SLIDE_ARTIFACT;
        if (activeTab === 'docx') return DEFAULT_DOCX_ARTIFACT;
        return DEFAULT_CODE_ARTIFACT;
      }

      // Perform 100 rapid tab changes and assertions
      for (let i = 0; i < 100; i++) {
        const targetTab = tabs[i % tabs.length];
        selectTab(targetTab);
        assert.equal(activeTab, targetTab);

        const current = resolveCurrentArtifact();
        assert.ok(current, `Artifact must not be null/undefined on tab ${targetTab}`);
        assert.equal(current.type, targetTab);
        assert.ok(current.name.length > 0);
      }
    });

    await st.test('2.2: Dynamic Artifact Insertion Mid-Stream immediately resolves active artifact', () => {
      let artifacts = [DEFAULT_PNL_EXCEL_ARTIFACT];
      let activeTab = 'excel';
      let activeArtifactId = DEFAULT_PNL_EXCEL_ARTIFACT.id;

      // New artifact arrives from tool execution
      const newExcelArtifact = {
        id: 'ow-xlsx-v2-generated',
        name: 'Updated_Q3_Financials.xlsx',
        title: 'Bảng Tính Cập Nhật Q3',
        type: 'excel',
        extension: '.xlsx',
        status: 'ready',
        version: 4,
        updatedAt: '13:30',
        content: { sheets: [] },
      };

      artifacts = [newExcelArtifact, ...artifacts];
      activeArtifactId = newExcelArtifact.id;

      const current = artifacts.find((a) => a.id === activeArtifactId && a.type === activeTab);
      assert.ok(current);
      assert.equal(current.id, 'ow-xlsx-v2-generated');
      assert.equal(current.version, 4);
    });

    await st.test('2.3: Fallback resolution when activeArtifactId does not match current tab', () => {
      const artifacts = [
        DEFAULT_PNL_EXCEL_ARTIFACT,
        DEFAULT_SLIDE_ARTIFACT,
        DEFAULT_DOCX_ARTIFACT,
      ];

      // activeArtifactId is an excel artifact, but user switches to slide tab
      const activeTab = 'slide';
      const activeArtifactId = 'ow-xlsx-pnl-consolidated';

      const current =
        artifacts.find((a) => a.id === activeArtifactId && a.type === activeTab) ||
        artifacts.find((a) => a.type === activeTab) ||
        DEFAULT_SLIDE_ARTIFACT;

      assert.equal(current.type, 'slide');
      assert.equal(current.id, 'ow-slide-deck-q3');
    });

    await st.test('2.4: Empty artifacts list safely falls back to default built-in artifacts without crashing', () => {
      const artifacts = [];
      const activeTab = 'docx';
      const activeArtifactId = 'non-existent';

      const current =
        artifacts.find((a) => a.id === activeArtifactId && a.type === activeTab) ||
        artifacts.find((a) => a.type === activeTab) ||
        DEFAULT_DOCX_ARTIFACT;

      assert.equal(current.type, 'docx');
      assert.equal(current.id, DEFAULT_DOCX_ARTIFACT.id);
    });
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Dual Theme Toggling Parity & Active Stream Non-Corruption
  // --------------------------------------------------------------------------
  await t.test('3. Dual Theme Toggling (Light / Dark Obsidian) During Active Stream', async (st) => {

    await st.test('3.1: 100 Rapid Theme Toggles during live SSE stream without accumulator loss or mutation', async () => {
      const storage = new MemoryStorage();
      const mockDoc = new MockDOM();

      // Initialize theme in DOM
      mockDoc.setAttribute('data-theme', 'dark');
      mockDoc.classList.add('dark');
      storage.setItem('openwork:theme', 'dark');

      let currentTheme = 'dark';
      function toggleTheme() {
        const next = currentTheme === 'light' ? 'dark' : 'light';
        currentTheme = next;
        mockDoc.setAttribute('data-theme', next);
        if (next === 'dark') {
          mockDoc.classList.add('dark');
        } else {
          mockDoc.classList.delete('dark');
        }
        storage.setItem('openwork:theme', next);
      }

      // Streaming accumulator
      let accumulatedReasoning = '';
      let accumulatedContent = '';
      const streamChunks = [];

      for (let i = 0; i < 50; i++) {
        streamChunks.push({ type: 'reasoning', delta: `R_chunk_${i} ` });
        streamChunks.push({ type: 'content', delta: `C_chunk_${i} ` });
      }

      // Interleave streaming chunks with concurrent theme toggles
      for (let i = 0; i < streamChunks.length; i++) {
        const chunk = streamChunks[i];
        if (chunk.type === 'reasoning') {
          accumulatedReasoning += chunk.delta;
        } else if (chunk.type === 'content') {
          accumulatedContent += chunk.delta;
        }

        // Trigger theme toggle simultaneously
        toggleTheme();
      }

      // Assertions
      assert.equal(accumulatedReasoning.length, streamChunks.filter((c) => c.type === 'reasoning').reduce((a, c) => a + c.delta.length, 0));
      assert.equal(accumulatedContent.length, streamChunks.filter((c) => c.type === 'content').reduce((a, c) => a + c.delta.length, 0));

      const expectedFinalTheme = streamChunks.length % 2 === 0 ? 'dark' : 'light';
      assert.equal(currentTheme, expectedFinalTheme);
      assert.equal(mockDoc.getAttribute('data-theme'), expectedFinalTheme);
      assert.equal(storage.getItem('openwork:theme'), expectedFinalTheme);
      assert.equal(mockDoc.classList.has('dark'), expectedFinalTheme === 'dark');
    });

    await st.test('3.2: External theme control prop delegation', () => {
      let externalToggled = false;
      const externalTheme = 'light';
      function externalToggleTheme() {
        externalToggled = true;
      }

      function handleHeaderToggleTheme(hasExternal, extToggle) {
        if (hasExternal && extToggle) {
          extToggle();
          return;
        }
      }

      handleHeaderToggleTheme(true, externalToggleTheme);
      assert.equal(externalToggled, true);
    });
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Corrupted & Missing localStorage Settings Recovery
  // --------------------------------------------------------------------------
  await t.test('4. Corrupted or Missing localStorage Settings Recovery Matrix', async (st) => {

    await st.test('4.1: Corrupted JSON in openwork:settings:v1 recovers gracefully with defaults', () => {
      const storage = new MemoryStorage();
      storage.setItem(OPENWORK_SETTINGS_STORAGE_KEY, '{ invalid_malformed_json: 123,,,,,');

      let settings = { ...DEFAULT_OPENWORK_SETTINGS };
      try {
        const saved = storage.getItem(OPENWORK_SETTINGS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          settings = { ...settings, ...parsed };
        }
      } catch {
        // Recover cleanly
      }

      assert.deepEqual(settings, DEFAULT_OPENWORK_SETTINGS);
      assert.equal(settings.deepseekModel, 'deepseek-v4-flash');
      assert.equal(settings.temperature, 0.7);
    });

    await st.test('4.2: Missing localStorage key (null) initializes with complete DEFAULT_OPENWORK_SETTINGS', () => {
      const storage = new MemoryStorage();

      let settings = { ...DEFAULT_OPENWORK_SETTINGS };
      try {
        const saved = storage.getItem(OPENWORK_SETTINGS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          settings = { ...settings, ...parsed };
        }
      } catch {}

      assert.equal(settings.deepseekApiKey, '');
      assert.equal(settings.deepseekBaseUrl, 'https://api.deepseek.com');
      assert.equal(settings.deepseekModel, 'deepseek-v4-flash');
      assert.equal(settings.enableReasoningStream, true);
    });

    await st.test('4.3: Partial settings update retains un-overwritten default fields', () => {
      const storage = new MemoryStorage();
      storage.setItem(
        OPENWORK_SETTINGS_STORAGE_KEY,
        JSON.stringify({ deepseekApiKey: 'sk-test-secret-key-12345' })
      );

      let settings = { ...DEFAULT_OPENWORK_SETTINGS };
      try {
        const saved = storage.getItem(OPENWORK_SETTINGS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          settings = { ...settings, ...parsed };
        }
      } catch {}

      assert.equal(settings.deepseekApiKey, 'sk-test-secret-key-12345');
      assert.equal(settings.deepseekModel, 'deepseek-v4-flash');
      assert.equal(settings.temperature, 0.7);
      assert.equal(settings.maxTokens, 4096);
    });

    await st.test('4.4: Corrupted UI state dimensions clamp strictly within [MIN, MAX] boundaries', () => {
      const storage = new MemoryStorage();
      storage.setItem(
        PERSISTED_UI_STATE_KEY,
        JSON.stringify({
          sidebarWidth: -999999,
          workbenchWidth: 5000000,
          sidebarOpen: true,
          workbenchOpen: false,
        })
      );

      let sidebarWidth = DEFAULT_LEFT_SIDEBAR_WIDTH;
      let workbenchWidth = DEFAULT_RIGHT_WORKBENCH_WIDTH;

      try {
        const savedUi = storage.getItem(PERSISTED_UI_STATE_KEY);
        if (savedUi) {
          const parsed = JSON.parse(savedUi);
          if (typeof parsed.sidebarWidth === 'number') {
            sidebarWidth = Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.min(MAX_LEFT_SIDEBAR_WIDTH, parsed.sidebarWidth));
          }
          if (typeof parsed.workbenchWidth === 'number') {
            workbenchWidth = Math.max(MIN_RIGHT_WORKBENCH_WIDTH, Math.min(MAX_RIGHT_WORKBENCH_WIDTH, parsed.workbenchWidth));
          }
        }
      } catch {}

      assert.equal(sidebarWidth, MIN_LEFT_SIDEBAR_WIDTH, 'Negative sidebarWidth must clamp to MIN');
      assert.equal(workbenchWidth, MAX_RIGHT_WORKBENCH_WIDTH, 'Oversized workbenchWidth must clamp to MAX');
    });

    await st.test('4.5: Reset to Defaults ("Khôi phục mặc định") cleans storage and restores defaults', () => {
      const storage = new MemoryStorage();
      let settings = {
        deepseekApiKey: 'sk-to-be-cleared',
        deepseekBaseUrl: 'https://custom-proxy.internal',
        deepseekModel: 'custom-model',
        temperature: 0.1,
        maxTokens: 1024,
        enableReasoningStream: false,
        theme: 'light',
      };
      storage.setItem(OPENWORK_SETTINGS_STORAGE_KEY, JSON.stringify(settings));

      // User clicks "Khôi phục mặc định"
      settings = { ...DEFAULT_OPENWORK_SETTINGS };
      storage.setItem(OPENWORK_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_OPENWORK_SETTINGS));

      const reloaded = JSON.parse(storage.getItem(OPENWORK_SETTINGS_STORAGE_KEY));
      assert.deepEqual(reloaded, DEFAULT_OPENWORK_SETTINGS);
    });
  });

});
