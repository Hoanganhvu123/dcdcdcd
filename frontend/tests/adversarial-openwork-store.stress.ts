/**
 * Empirical Adversarial Store State Stress Test
 * Targets state management logic modeled in useOpenWorkStore.ts
 */

import assert from 'node:assert/strict';
import type {
  OpenWorkStreamPart,
  ReasoningPart,
  CapabilityCallPart,
  AssistantTextPart,
  OpenWorkSettings,
} from '../components/openwork/types';
import {
  DEFAULT_SETTINGS,
  PERSISTED_UI_STATE_KEY,
  PERSISTED_SETTINGS_KEY,
  MIN_LEFT_SIDEBAR_WIDTH,
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_RIGHT_WORKBENCH_WIDTH,
  MAX_RIGHT_WORKBENCH_WIDTH,
} from '../components/openwork/useOpenWorkStore';

console.log('================================================================');
console.log('⚡ ADVERSARIAL STRESS TEST SUITE: OPENWORK STORE LOGIC');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

// 1. Emulate Store State Machine
class OpenWorkStoreStateEmulator {
  streamParts: OpenWorkStreamPart[] = [];
  isStreaming = false;
  abortController: AbortController | null = null;
  settings: OpenWorkSettings = { ...DEFAULT_SETTINGS };
  sidebarWidth = 260;
  workbenchWidth = 520;
  sidebarOpen = true;
  workbenchOpen = true;

  hydrateFromStorage(storage: Record<string, string>) {
    try {
      const savedUi = storage[PERSISTED_UI_STATE_KEY];
      if (savedUi) {
        const parsed = JSON.parse(savedUi);
        if (typeof parsed.sidebarWidth === 'number') {
          this.sidebarWidth = Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.min(MAX_LEFT_SIDEBAR_WIDTH, parsed.sidebarWidth));
        }
        if (typeof parsed.workbenchWidth === 'number') {
          this.workbenchWidth = Math.max(MIN_RIGHT_WORKBENCH_WIDTH, Math.min(MAX_RIGHT_WORKBENCH_WIDTH, parsed.workbenchWidth));
        }
        if (typeof parsed.sidebarOpen === 'boolean') {
          this.sidebarOpen = parsed.sidebarOpen;
        }
        if (typeof parsed.workbenchOpen === 'boolean') {
          this.workbenchOpen = parsed.workbenchOpen;
        }
      }

      const savedSettings = storage[PERSISTED_SETTINGS_KEY];
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        this.settings = { ...this.settings, ...parsedSettings };
      }
    } catch {
      // safe fallback
    }
  }

  onReasoningDelta(reasoningId: string, delta: string, accumulated: string) {
    const idx = this.streamParts.findIndex((p) => p.id === reasoningId);
    if (idx >= 0) {
      const copy = [...this.streamParts];
      copy[idx] = {
        ...copy[idx],
        thought: accumulated,
        isStreaming: true,
      } as ReasoningPart;
      this.streamParts = copy;
    } else {
      const newReasoning: ReasoningPart = {
        type: 'reasoning',
        id: reasoningId,
        title: 'Thinking…',
        thought: accumulated,
        isStreaming: true,
      };
      this.streamParts = [...this.streamParts, newReasoning];
    }
  }

  onContentDelta(reasoningId: string, textId: string, _delta: string, accumulated: string) {
    let list = this.streamParts;
    if (list.some((p) => p.id === reasoningId && (p as ReasoningPart).isStreaming)) {
      list = list.map((p) =>
        p.id === reasoningId ? { ...p, title: 'Thought', isStreaming: false } : p
      );
    }
    const textIdx = list.findIndex((p) => p.id === textId);
    if (textIdx >= 0) {
      const copy = [...list];
      copy[textIdx] = {
        ...copy[textIdx],
        markdown: accumulated,
      } as AssistantTextPart;
      this.streamParts = copy;
    } else {
      const newText: AssistantTextPart = {
        type: 'text',
        id: textId,
        title: 'Kết Quả Trả Lời',
        markdown: accumulated,
      };
      this.streamParts = [...list, newText];
    }
  }

  onToolCallDelta(toolCall: { id?: string; index: number; name?: string; accumulatedArguments: string }) {
    const capId = `cap-${toolCall.id || toolCall.index}`;
    let codeSnippet = toolCall.accumulatedArguments;
    let language = 'json';
    try {
      const parsed = JSON.parse(toolCall.accumulatedArguments);
      if (parsed.sql || parsed.query) {
        codeSnippet = parsed.sql || parsed.query;
        language = 'sql';
      } else if (parsed.code || parsed.python) {
        codeSnippet = parsed.code || parsed.python;
        language = 'python';
      }
    } catch {
      // argument JSON stream still in progress
    }
    const idx = this.streamParts.findIndex((p) => p.id === capId);
    if (idx >= 0) {
      const copy = [...this.streamParts];
      copy[idx] = {
        ...copy[idx],
        toolName: toolCall.name || (copy[idx] as CapabilityCallPart).toolName,
        displayName: toolCall.name || (copy[idx] as CapabilityCallPart).displayName,
        codeSnippet,
        language,
        status: 'running',
      } as CapabilityCallPart;
      this.streamParts = copy;
    } else {
      const newCap: CapabilityCallPart = {
        type: 'capability-call',
        id: capId,
        toolName: toolCall.name || 'tool_execution',
        displayName: toolCall.name || 'Tool Execution',
        status: 'running',
        language,
        codeSnippet,
      };
      this.streamParts = [...this.streamParts, newCap];
    }
  }

  onFinish() {
    this.streamParts = this.streamParts.map((p) => {
      if (p.type === 'reasoning' && p.isStreaming) {
        return { ...p, isStreaming: false, title: 'Thought' };
      }
      if (p.type === 'capability-call' && p.status === 'running') {
        return { ...p, status: 'success' };
      }
      return p;
    });
    this.isStreaming = false;
    this.abortController = null;
  }

  abortStream() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isStreaming = false;
    this.streamParts = this.streamParts.map((p) =>
      p.type === 'reasoning' && p.isStreaming ? { ...p, isStreaming: false, title: 'Thought' } : p
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

runTest('Store 1.1: LocalStorage Corrupted JSON & Boundary Resizing Resilience', () => {
  const store = new OpenWorkStoreStateEmulator();
  // Feed corrupt json
  store.hydrateFromStorage({
    [PERSISTED_UI_STATE_KEY]: '{"sidebarWidth": 999999, "workbenchWidth": -500, "broken',
    [PERSISTED_SETTINGS_KEY]: 'null_undefined_garbage',
  });
  // Must fallback gracefully to defaults
  assert.strictEqual(store.sidebarWidth, 260);
  assert.strictEqual(store.workbenchWidth, 520);
  assert.strictEqual(store.settings.model, 'deepseek-v4-flash');

  // Feed valid but out-of-bounds numbers
  store.hydrateFromStorage({
    [PERSISTED_UI_STATE_KEY]: JSON.stringify({
      sidebarWidth: 999999, // Should clamp to MAX_LEFT_SIDEBAR_WIDTH (420)
      workbenchWidth: -500, // Should clamp to MIN_RIGHT_WORKBENCH_WIDTH (320)
    }),
  });
  assert.strictEqual(store.sidebarWidth, MAX_LEFT_SIDEBAR_WIDTH);
  assert.strictEqual(store.workbenchWidth, MIN_RIGHT_WORKBENCH_WIDTH);
});

runTest('Store 1.2: Streaming Lifecycle (Reasoning -> Content Transition)', () => {
  const store = new OpenWorkStoreStateEmulator();
  store.isStreaming = true;

  const reasoningId = 'reasoning-1';
  const textId = 'text-1';

  // Step 1: Reasoning stream
  store.onReasoningDelta(reasoningId, 'Suy nghĩ 1...', 'Suy nghĩ 1...');
  assert.strictEqual(store.streamParts.length, 1);
  assert.strictEqual(store.streamParts[0].type, 'reasoning');
  assert.strictEqual((store.streamParts[0] as ReasoningPart).isStreaming, true);
  assert.strictEqual((store.streamParts[0] as ReasoningPart).title, 'Thinking…');

  // Step 2: Content starts streaming -> Reasoning should flip isStreaming to false and title to 'Thought'
  store.onContentDelta(reasoningId, textId, 'Xin chào', 'Xin chào');
  assert.strictEqual(store.streamParts.length, 2);
  const reasoningPart = store.streamParts[0] as ReasoningPart;
  const textPart = store.streamParts[1] as AssistantTextPart;
  assert.strictEqual(reasoningPart.isStreaming, false);
  assert.strictEqual(reasoningPart.title, 'Thought');
  assert.strictEqual(textPart.markdown, 'Xin chào');

  // Step 3: Finish stream
  store.onFinish();
  assert.strictEqual(store.isStreaming, false);
});

runTest('Store 1.3: Capability Call JSON Streaming & Language Detection (SQL vs Python)', () => {
  const store = new OpenWorkStoreStateEmulator();

  // Partial JSON chunk 1
  store.onToolCallDelta({
    id: 'call_1',
    index: 0,
    name: 'sql_agent',
    accumulatedArguments: '{"query": "SELECT *',
  });
  let cap = store.streamParts[0] as CapabilityCallPart;
  assert.strictEqual(cap.language, 'json');
  assert.strictEqual(cap.codeSnippet, '{"query": "SELECT *');
  assert.strictEqual(cap.status, 'running');

  // Partial JSON chunk 2 (completed JSON)
  store.onToolCallDelta({
    id: 'call_1',
    index: 0,
    name: 'sql_agent',
    accumulatedArguments: '{"query": "SELECT * FROM sales_2026"}',
  });
  cap = store.streamParts[0] as CapabilityCallPart;
  assert.strictEqual(cap.language, 'sql');
  assert.strictEqual(cap.codeSnippet, 'SELECT * FROM sales_2026');

  // Finish -> status becomes 'success'
  store.onFinish();
  cap = store.streamParts[0] as CapabilityCallPart;
  assert.strictEqual(cap.status, 'success');
});

runTest('Store 1.4: Abort Action Mid-Stream Closes Active Parts and Clears Controller', () => {
  const store = new OpenWorkStoreStateEmulator();
  store.isStreaming = true;
  store.abortController = new AbortController();

  store.onReasoningDelta('r-1', 'Thinking...', 'Thinking...');
  assert.strictEqual((store.streamParts[0] as ReasoningPart).isStreaming, true);

  store.abortStream();
  assert.strictEqual(store.isStreaming, false);
  assert.strictEqual(store.abortController, null);
  assert.strictEqual((store.streamParts[0] as ReasoningPart).isStreaming, false);
  assert.strictEqual((store.streamParts[0] as ReasoningPart).title, 'Thought');
});

runTest('Store 1.5: High-Frequency Store Mutations (1,000 rapid state updates)', () => {
  const store = new OpenWorkStoreStateEmulator();
  const reasoningId = 'r-bench';

  for (let i = 0; i < 1000; i++) {
    store.onReasoningDelta(reasoningId, `t${i}`, `accum_${i}`);
  }

  assert.strictEqual(store.streamParts.length, 1);
  assert.strictEqual((store.streamParts[0] as ReasoningPart).thought, 'accum_999');
});

console.log('\n================================================================');
console.log('📊 STORE ADVERSARIAL STRESS SUMMARY');
console.log('================================================================');
console.log(`  Total Tests Run : ${totalTests}`);
console.log(`  Passed          : ${passedTests}`);
console.log(`  Failed          : ${failedTests}`);
console.log(`  Pass Rate       : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
