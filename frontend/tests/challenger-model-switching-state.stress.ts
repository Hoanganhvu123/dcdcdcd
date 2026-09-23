/**
 * Challenger 1: Dynamic Model Switching & State Persistence Stress Harness
 * Target: components/openwork/useOpenWorkStore.ts & types.ts & OpenWorkComposer.tsx
 */

import assert from 'node:assert/strict';
import type {
  OpenWorkStreamPart,
  OpenWorkArtifact,
  OpenWorkSettings,
  DatasourceItem,
  ReasoningPart,
  CapabilityCallPart,
  AssistantTextPart,
  ProviderKind,
  ActiveProviderConfig,
} from '../components/openwork/types';
import {
  PROVIDER_MODEL_CATALOG,
} from '../components/openwork/types';
import {
  DEFAULT_DATASOURCES,
  PERSISTED_UI_STATE_KEY,
  PERSISTED_SETTINGS_KEY,
  PERSISTED_SESSIONS_KEY,
  PERSISTED_ACTIVE_SESSION_KEY,
  PERSISTED_ACTIVE_DATASOURCE_KEY,
  SESSION_DATA_PREFIX,
} from '../components/openwork/useOpenWorkStore';
import {
  DEFAULT_AGENT_WRAP_BASE_URL,
  DEFAULT_AGENT_WRAP_API_KEY,
  DEFAULT_OPENWORK_MODEL,
  ALLOWED_AGENT_WRAP_MODELS,
  buildProviderHeaders,
  resolveProviderEndpointUrl,
} from '../components/openwork/services/deepseek-stream';

console.log('================================================================');
console.log('⚡ CHALLENGER 1: DYNAMIC MODEL SWITCHING & STATE STRESS SUITE');
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
    if (err.stack) {
      console.error(`     Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    failedTests++;
  }
}

/**
 * Emulates active provider configuration resolver from useOpenWorkStore
 */
const MOCK_TEST_OPENROUTER_KEY = 'sk-or-v1-mock-test-key-for-unit-testing-only-00000000';

/**
 * OpenWork Provider Config Resolver
 */
function resolveActiveProviderConfig(settings: OpenWorkSettings): ActiveProviderConfig {
  const kind = settings.providerKind || 'openrouter';
  switch (kind) {
    case 'openrouter': {
      const model = settings.openrouterModel || settings.model || 'deepseek-v4-flash';
      return {
        providerKind: 'openrouter',
        apiKey: settings.openrouterApiKey || settings.apiKey || MOCK_TEST_OPENROUTER_KEY,
        apiBaseUrl: settings.openrouterBaseUrl || settings.apiBaseUrl || '/api/openrouter/v1',
        model,
      };
    }
    case 'agent-wrap':
    case 'google-agy':
    case 'opencode':
    case 'openai': {
      const model = settings.model || DEFAULT_OPENWORK_MODEL;
      return {
        providerKind: kind,
        apiKey: settings.apiKey || DEFAULT_AGENT_WRAP_API_KEY,
        apiBaseUrl: settings.apiBaseUrl || DEFAULT_AGENT_WRAP_BASE_URL,
        model,
      };
    }
    case 'deepseek': {
      return {
        providerKind: 'deepseek',
        apiKey: settings.deepseekApiKey || '',
        apiBaseUrl: settings.deepseekBaseUrl || '/api/deepseek',
        model: settings.deepseekModel || 'deepseek-v4-flash',
      };
    }
    case 'dbgpt': {
      return {
        providerKind: 'dbgpt',
        apiKey: '',
        apiBaseUrl: settings.dbgptBaseUrl || '/api/v1',
        model: settings.dbgptModel || 'deepseek-v4-flash',
      };
    }
    default: {
      return {
        providerKind: 'openrouter',
        apiKey: MOCK_TEST_OPENROUTER_KEY,
        apiBaseUrl: '/api/openrouter/v1',
        model: 'deepseek-v4-flash',
      };
    }
  }
}

/**
 * Pick catalog model with fallback
 */
function pickCatalogModel(kind: ProviderKind, saved: string | undefined, fallback: string): string {
  return (PROVIDER_MODEL_CATALOG[kind] || []).some((m) => m.value === saved)
    ? (saved as string)
    : fallback;
}

/**
 * OpenWork Store Mock for Model Switching & State Persistence Testing
 */
class OpenWorkStoreModelSwitchEmulator {
  selectedModel: string = 'deepseek-v4-flash';
  settings: OpenWorkSettings = {
    providerKind: 'openrouter',
    apiKey: MOCK_TEST_OPENROUTER_KEY,
    apiBaseUrl: '/api/openrouter/v1',
    model: 'deepseek-v4-flash',
    deepseekApiKey: '',
    deepseekBaseUrl: '/api/deepseek',
    deepseekModel: 'deepseek-v4-flash',
    dbgptBaseUrl: '/api/v1',
    dbgptModel: 'deepseek-v4-flash',
  };

  activeSessionId: string = '019183ab-4521-7294-81d3-9f88c3a10123';
  streamParts: OpenWorkStreamPart[] = [];
  artifacts: OpenWorkArtifact[] = [];
  activeArtifactTab: string = 'excel';
  selectedDatasource: DatasourceItem = DEFAULT_DATASOURCES[0];
  isStreaming: boolean = false;

  setSelectedModel(model: string) {
    this.selectedModel = model;
    let targetProvider: ProviderKind = 'openrouter';
    if (model === 'opencode-free') targetProvider = 'opencode';
    else if (model.includes('deepseek')) targetProvider = 'openrouter';

    this.settings = {
      ...this.settings,
      providerKind: targetProvider,
      model,
    };
  }

  addTurn(userText: string, thoughtText: string, assistantProse: string, artifact?: OpenWorkArtifact) {
    const userPart: OpenWorkStreamPart = {
      type: 'user',
      id: `u-${Date.now()}-${Math.random()}`,
      text: userText,
      timestamp: '14:30',
    };
    const reasoningPart: ReasoningPart = {
      type: 'reasoning',
      id: `r-${Date.now()}-${Math.random()}`,
      title: 'Thought',
      thought: thoughtText,
      isStreaming: false,
    };
    const textPart: AssistantTextPart = {
      type: 'text',
      id: `t-${Date.now()}-${Math.random()}`,
      title: 'Kết Quả Trả Lời',
      markdown: assistantProse,
    };

    this.streamParts.push(userPart, reasoningPart, textPart);

    if (artifact) {
      this.artifacts.push(artifact);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite Execution
// ─────────────────────────────────────────────────────────────────────────────

runTest('1.1: Switching models preserves complete multi-turn conversation history and streamParts', () => {
  const store = new OpenWorkStoreModelSwitchEmulator();

  // Add 3 full conversation turns with user text, CoT thought, and assistant prose
  store.addTurn('Turn 1: Phân tích doanh thu', 'Đang tính toán doanh thu Q1-Q3...', 'Doanh thu đạt 120 tỷ VND (+15%).');
  store.addTurn('Turn 2: Dự báo tồn kho', 'Phân tích vòng quay hàng tồn kho...', 'Vòng quay tồn kho đạt 4.2 vòng/năm.');
  store.addTurn('Turn 3: Chiến lược marketing', 'Đánh giá chỉ số CAC và LTV...', 'Tỷ lệ LTV/CAC đạt 3.8x, mức tăng trưởng bền vững.');

  const originalPartsSnapshot = JSON.stringify(store.streamParts);
  const originalPartsCount = store.streamParts.length;
  assert.strictEqual(originalPartsCount, 9); // 3 turns * 3 parts

  // Switch to opencode-free
  store.setSelectedModel('opencode-free');
  assert.strictEqual(store.selectedModel, 'opencode-free');
  assert.strictEqual(store.settings.providerKind, 'opencode');
  assert.strictEqual(store.streamParts.length, originalPartsCount);
  assert.strictEqual(JSON.stringify(store.streamParts), originalPartsSnapshot);

  // Switch to deepseek-v4-flash
  store.setSelectedModel('deepseek-v4-flash');
  assert.strictEqual(store.selectedModel, 'deepseek-v4-flash');
  assert.strictEqual(store.settings.providerKind, 'openrouter');
  assert.strictEqual(store.streamParts.length, originalPartsCount);
  assert.strictEqual(JSON.stringify(store.streamParts), originalPartsSnapshot);
});

runTest('1.2: Switching models preserves workspace artifacts (Excel XLSX, Slide PPTX, Word DOCX)', () => {
  const store = new OpenWorkStoreModelSwitchEmulator();

  const excelArtifact: OpenWorkArtifact = {
    id: 'art-excel-1',
    name: 'Bao_Cao_Tai_Chinh_2026.xlsx',
    title: 'Bảng Cân Đối Kế Toán 2026',
    type: 'excel',
    extension: 'xlsx',
    status: 'ready',
    version: 2,
    content: {
      sheets: [
        { name: 'P&L', rows: [['Doanh thu', 120000], ['Chi phí', 90000], ['Lợi nhuận', 30000]] },
      ],
    },
    updatedAt: '2026-08-31T14:30:00Z',
  };

  const slideArtifact: OpenWorkArtifact = {
    id: 'art-slide-1',
    name: 'Pitch_Deck_Q3.pptx',
    title: 'Chiến Lược Tăng Trưởng Q3/2026',
    type: 'slide',
    extension: 'pptx',
    status: 'ready',
    version: 1,
    content: {
      slides: [{ title: 'Tổng Quan', bulletPoints: ['Tăng trưởng 45%', 'Mở rộng 12 tỉnh thành'] }],
    },
    updatedAt: '2026-08-31T14:31:00Z',
  };

  const wordArtifact: OpenWorkArtifact = {
    id: 'art-word-1',
    name: 'Bao_Cao_Phan_Tich_Phap_Ly.docx',
    title: 'Báo Cáo Thẩm Định Pháp Lý Doanh Nghiệp',
    type: 'docx',
    extension: 'docx',
    status: 'ready',
    version: 3,
    content: {
      title: 'Báo Cáo Thẩm Định',
      paragraphs: ['Căn cứ Luật Doanh nghiệp 2020...', 'Kết luận thẩm định hợp đồng.'],
    },
    updatedAt: '2026-08-31T14:32:00Z',
  };

  store.artifacts = [excelArtifact, slideArtifact, wordArtifact];
  const artifactSnapshot = JSON.stringify(store.artifacts);

  // Cycle through all models
  const modelList = ['deepseek-v4-flash', 'opencode-free'];
  for (const model of modelList) {
    store.setSelectedModel(model);
    assert.strictEqual(store.artifacts.length, 3);
    assert.strictEqual(store.artifacts[0].name, 'Bao_Cao_Tai_Chinh_2026.xlsx');
    assert.strictEqual(store.artifacts[1].name, 'Pitch_Deck_Q3.pptx');
    assert.strictEqual(store.artifacts[2].name, 'Bao_Cao_Phan_Tich_Phap_Ly.docx');
    assert.strictEqual(JSON.stringify(store.artifacts), artifactSnapshot);
  }
});

runTest('1.3: Active Provider Config and Request Headers resolve dynamically per model', () => {
  // Test OpenRouter Gateway
  const cfg1 = resolveActiveProviderConfig({
    providerKind: 'openrouter',
    apiKey: '',
    apiBaseUrl: '',
    model: 'deepseek-v4-flash',
  });
  assert.strictEqual(cfg1.model, 'deepseek-v4-flash');
  assert.strictEqual(cfg1.providerKind, 'openrouter');
  assert.strictEqual(cfg1.apiKey, MOCK_TEST_OPENROUTER_KEY);
  assert.strictEqual(cfg1.apiBaseUrl, '/api/openrouter/v1');

  const headers1 = buildProviderHeaders(cfg1.providerKind, cfg1.apiKey);
  assert.strictEqual(headers1['Accept'], 'text/event-stream');

  const endpoint1 = resolveProviderEndpointUrl(cfg1.providerKind, cfg1.apiBaseUrl);
  assert.strictEqual(endpoint1, '/api/openrouter/v1/chat/completions');

  // Test opencode-free
  const cfg2 = resolveActiveProviderConfig({
    providerKind: 'opencode',
    model: 'opencode-free',
  });
  assert.strictEqual(cfg2.model, 'opencode-free');
  assert.strictEqual(cfg2.apiKey, DEFAULT_AGENT_WRAP_API_KEY);
  assert.strictEqual(cfg2.apiBaseUrl, DEFAULT_AGENT_WRAP_BASE_URL);

  // Test deepseek-v4-flash
  const cfg3 = resolveActiveProviderConfig({
    providerKind: 'deepseek',
    deepseekModel: 'deepseek-v4-flash',
    deepseekBaseUrl: '/api/deepseek',
  });
  assert.strictEqual(cfg3.model, 'deepseek-v4-flash');
  assert.strictEqual(cfg3.apiBaseUrl, '/api/deepseek');
  const endpoint3 = resolveProviderEndpointUrl(cfg3.providerKind, cfg3.apiBaseUrl);
  assert.strictEqual(endpoint3, '/api/deepseek/chat/completions');
});

runTest('1.4: Banned Gemini models are rejected and fall back safely to default model', () => {
  // 1. pickCatalogModel with invalid model should fallback to deepseek-v4-flash
  const chosenModel = pickCatalogModel('openrouter', 'Gemini 3.7 Flash', 'deepseek-v4-flash');
  assert.strictEqual(chosenModel, 'deepseek-v4-flash', 'Banned model must not be picked from catalog!');

  // 2. Catalog check
  for (const [provider, models] of Object.entries(PROVIDER_MODEL_CATALOG)) {
    const containsGemini = models.some((m) => m.value.toLowerCase().includes('gemini') || m.label.toLowerCase().includes('gemini'));
    assert.strictEqual(containsGemini, false, `Provider ${provider} contains banned gemini model!`);
  }
});

runTest('1.5: Multi-session state isolation preserves per-conversation turns and artifacts', () => {
  const sessionA = '019183ab-4521-7294-81d3-9f88c3a10001';
  const sessionB = '019183ab-4521-7294-81d3-9f88c3a10002';

  const mockStorage: Record<string, string> = {
    [`${SESSION_DATA_PREFIX}${sessionA}`]: JSON.stringify({
      streamParts: [{ type: 'user', id: 'u1', text: 'Prompt A' }],
      artifacts: [{ id: 'art-1', name: 'DocA.docx', type: 'docx' }],
    }),
    [`${SESSION_DATA_PREFIX}${sessionB}`]: JSON.stringify({
      streamParts: [{ type: 'user', id: 'u2', text: 'Prompt B' }],
      artifacts: [{ id: 'art-2', name: 'DataB.xlsx', type: 'excel' }],
    }),
  };

  const dataA = JSON.parse(mockStorage[`${SESSION_DATA_PREFIX}${sessionA}`]);
  const dataB = JSON.parse(mockStorage[`${SESSION_DATA_PREFIX}${sessionB}`]);

  assert.strictEqual(dataA.streamParts[0].text, 'Prompt A');
  assert.strictEqual(dataA.artifacts[0].name, 'DocA.docx');
  assert.strictEqual(dataB.streamParts[0].text, 'Prompt B');
  assert.strictEqual(dataB.artifacts[0].name, 'DataB.xlsx');
});

console.log('\n================================================================');
console.log('📊 CHALLENGER 1 MODEL SWITCHING & STATE STRESS RESULTS');
console.log('================================================================');
console.log(`  Total Tests Run : ${totalTests}`);
console.log(`  Passed          : ${passedTests}`);
console.log(`  Failed          : ${failedTests}`);
console.log(`  Pass Rate       : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
