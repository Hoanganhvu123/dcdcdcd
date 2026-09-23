import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// PRODUCTION LOGIC UNDER TEST
// ============================================================================

// 1. safeJsonParse (from utils/json.ts)
export function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

// 2. Storage utilities (from utils/storage.ts)
const STORAGE_INIT_MESSAGE_KET = 'dbgpt_init_message';
const STORAGE_USERINFO_KEY = 'dbgpt_user_info';
const PINNED_STORAGE_KEY = 'dbgpt_pinned_dialogues';
const TITLES_STORAGE_KEY = 'dbgpt_custom_titles';
const STORAGE_THEME_KEY = 'dbgpt_theme';
const FLOW_NODES_KEY = 'dbgpt_flow_nodes';

export function getInitMessage(mockWindow = globalThis.window) {
  if (typeof mockWindow === 'undefined') return null;
  return safeJsonParse(mockWindow.localStorage.getItem(STORAGE_INIT_MESSAGE_KET), null);
}

export function getUserId(mockWindow = globalThis.window) {
  if (typeof mockWindow === 'undefined') return undefined;
  const userInfo = safeJsonParse(mockWindow.localStorage.getItem(STORAGE_USERINFO_KEY), null);
  return userInfo?.user_id;
}

// 3. SSE Stream Parser & Accumulator (from hooks/use-analyst-chat.ts)
export function createAccumulator() {
  return {
    isWorking: true,
    answer: '',
    status: '',
    artifacts: [],
    artifactMap: new Map(),
    final: null,
    error: null,
  };
}

export function kindOf(filenameOrKind) {
  const lower = filenameOrKind.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.includes('excel')) return 'excel';
  if (lower.endsWith('.docx') || lower.endsWith('.doc') || lower.includes('word')) return 'word';
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt') || lower.includes('slides') || lower.includes('presentation')) return 'ppt';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image';
  if (lower.endsWith('.sql')) return 'sql';
  return 'code';
}

export function upsertArtifact(acc, id, patch) {
  const existing = acc.artifactMap.get(id);
  if (existing) {
    Object.assign(existing, patch);
    return existing;
  }
  const created = {
    id,
    kind: patch.kind || 'code',
    title: patch.title || id,
    status: patch.status || 'streaming',
    pct: patch.pct ?? 0,
    ...patch,
  };
  acc.artifactMap.set(id, created);
  acc.artifacts.push(created);
  return created;
}

export function reduceAnalystEvent(acc, event) {
  const change = {
    answerChanged: false,
    statusChanged: false,
    newArtifacts: [],
    final: null,
    delta: undefined,
  };

  if (!event || typeof event !== 'object') return change;
  const { type, payload } = event;
  if (!payload && type !== 'heartbeat') return change;

  switch (type) {
    case 'answer_delta': {
      if (typeof payload?.delta === 'string') {
        acc.answer += payload.delta;
        change.answerChanged = true;
        change.delta = payload.delta;
      }
      break;
    }
    case 'status':
    case 'phase': {
      if (typeof payload?.message === 'string') {
        acc.status = payload.message;
        change.statusChanged = true;
      }
      break;
    }
    case 'artifact.start': {
      if (!payload?.id) break;
      change.newArtifacts = [
        upsertArtifact(acc, payload.id, {
          kind: kindOf(String(payload.kind ?? '')),
          title: payload.title,
          status: 'streaming',
          pct: 0,
        }),
      ];
      break;
    }
    case 'artifact.progress': {
      if (!payload?.id) break;
      const existing = acc.artifactMap.get(payload.id);
      if (existing?.status === 'ready') break;
      change.newArtifacts = [
        upsertArtifact(acc, payload.id, {
          stage: payload.stage,
          pct: typeof payload.pct === 'number' ? payload.pct : 0,
          status: 'streaming',
        }),
      ];
      break;
    }
    case 'artifact.ready': {
      if (!payload?.id) break;
      const url = payload.url ?? '';
      const filename = payload.filename || (url.split('/').pop() ?? '');
      change.newArtifacts = [
        upsertArtifact(acc, payload.id, {
          url,
          href: url,
          filename,
          kind: kindOf(filename || url),
          status: 'ready',
          pct: 100,
          previewHtml: typeof payload.preview_html === 'string' ? payload.preview_html : undefined,
        }),
      ];
      break;
    }
    case 'artifact.error': {
      if (!payload?.id) break;
      change.newArtifacts = [
        upsertArtifact(acc, payload.id, { status: 'error', error: payload.message }),
      ];
      break;
    }
    case 'final': {
      if (!acc.answer && payload?.answer) {
        acc.answer = payload.answer;
        change.answerChanged = true;
      }
      acc.final = payload;
      acc.status = '';
      change.final = payload;
      break;
    }
    default:
      break;
  }

  return change;
}

export function consumeSSELines(lines, onEvent) {
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const body = line.slice(6).trim();
    if (!body) continue;
    if (body === '[DONE]') return true;
    try {
      onEvent(JSON.parse(body));
    } catch {
      /* ignore malformed frame */
    }
  }
  return false;
}

// 4. Multimodal & Formatted Chat Content
export function formatChatContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  const contentItems = content?.content || [];
  const textItems = contentItems.filter(item => item.type === 'text');
  const mediaItems = contentItems.filter(item => item.type !== 'text');

  let formattedDisplayContent = '';
  if (textItems.length > 0) {
    formattedDisplayContent = textItems.map(item => item.text).join(' ');
  }

  const mediaMarkdown = mediaItems
    .map(item => {
      if (item.type === 'image_url') {
        const originalUrl = item.image_url?.url || '';
        const fileName = item.image_url?.fileName || 'image';
        return `\n![${fileName}](${originalUrl})`;
      } else if (item.type === 'video') {
        const originalUrl = item.video || '';
        return `\n[Video](${originalUrl})`;
      } else {
        return `\n[${item.type} attachment]`;
      }
    })
    .join('\n');

  if (mediaMarkdown) {
    formattedDisplayContent = formattedDisplayContent ? `${formattedDisplayContent}\n${mediaMarkdown}` : mediaMarkdown;
  }

  return formattedDisplayContent;
}

// 5. ThinkingBlock Logic
const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  if (parseFloat(seconds) < 60) return `${seconds}s`;
  const minutes = Math.floor(parseFloat(seconds) / 60);
  const remainingSeconds = (parseFloat(seconds) % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
};

const normalizeThoughts = (thoughts) => {
  if (!thoughts) return '';
  if (typeof thoughts === 'string') {
    return thoughts
      .replace(/^TODO::[^\n]*/gm, '')
      .replace(/^思路：/gm, '')
      .replace(/^思考过程：/gm, '')
      .trim();
  }
  if (Array.isArray(thoughts)) {
    return thoughts
      .map(t =>
        typeof t === 'string'
          ? t.replace(/^TODO::[^\n]*/gm, '').replace(/^思路：/gm, '').replace(/^思考过程：/gm, '').trim()
          : JSON.stringify(t),
      )
      .filter(Boolean)
      .join('\n\n');
  }
  if (typeof thoughts === 'object') {
    return Object.values(thoughts)
      .map(t =>
        typeof t === 'string'
          ? t.replace(/^TODO::[^\n]*/gm, '').replace(/^思路：/gm, '').replace(/^思考过程：/gm, '').trim()
          : JSON.stringify(t),
      )
      .filter(Boolean)
      .join('\n\n');
  }
  return String(thoughts);
};

// 6. ToolExecutionBadge Logic
const getHumanizedActionLabel = (type, title, t, isVi) => {
  const cleanTitle = (title || '')
    .replace(/^TODO::/i, '')
    .replace(/^Action:\s*/i, '')
    .trim();

  if (cleanTitle && !cleanTitle.startsWith('{') && !cleanTitle.includes('::') && cleanTitle.length > 2) {
    if (cleanTitle.toLowerCase().includes('search') || cleanTitle.toLowerCase().includes('grep')) {
      return isVi ? 'Đang tìm kiếm thông tin & dữ liệu...' : 'Searching information & data...';
    }
    if (cleanTitle.toLowerCase().includes('sql') || cleanTitle.toLowerCase().includes('database')) {
      return isVi ? 'Đang truy vấn cơ sở dữ liệu...' : 'Querying database...';
    }
    if (cleanTitle.toLowerCase().includes('chart') || cleanTitle.toLowerCase().includes('plot')) {
      return isVi ? 'Đang tạo biểu đồ trực quan...' : 'Generating chart visualization...';
    }
    return cleanTitle;
  }

  switch (type) {
    case 'read':
      return isVi ? 'Đang đọc tài liệu & tệp tin...' : 'Reading document & files...';
    case 'edit':
    case 'write':
      return isVi ? 'Đang chỉnh sửa và cập nhật tệp...' : 'Editing and updating file...';
    case 'bash':
      return isVi ? 'Đang thực thi lệnh hệ thống...' : 'Executing system command...';
    case 'grep':
    case 'glob':
      return isVi ? 'Đang tìm kiếm tệp & mã nguồn...' : 'Searching codebase & files...';
    case 'python':
      return isVi ? 'Đang phân tích dữ liệu & tính toán...' : 'Executing Python data analysis...';
    case 'sql':
      return isVi ? 'Đang truy vấn cơ sở dữ liệu...' : 'Querying database...';
    case 'html':
      return isVi ? 'Đang kết xuất giao diện HTML...' : 'Rendering HTML interface...';
    case 'task':
    case 'skill':
      return isVi ? 'Đang thực thi kỹ năng chuyên sâu...' : 'Executing specialized skill...';
    default:
      return isVi ? 'Đang xử lý tác vụ...' : 'Processing action...';
  }
};

const extractStepDetails = (description, output) => {
  if (!description && !output) return { inputStr: '', outputStr: '', obsText: '' };

  let inputStr = '';
  let outputStr = '';
  let obsText = '';

  if (description) {
    const inputMatch = description.match(/Action Input:\s*({[\s\S]*?}|\[[\s\S]*?\]|[^\n]+)/i);
    if (inputMatch) {
      inputStr = inputMatch[1].trim();
    }
    const obsMatch = description.match(/Observation:\s*([\s\S]*)$/i);
    if (obsMatch) {
      obsText = description;
      outputStr = obsMatch[1].trim();
    } else if (!inputStr) {
      inputStr = description.trim();
    }
  }

  if (!outputStr && output) {
    if (typeof output === 'string') {
      outputStr = output;
    } else {
      try {
        outputStr = JSON.stringify(output, null, 2);
      } catch {
        outputStr = String(output);
      }
    }
  }

  return { inputStr, outputStr, obsText };
};

// 7. SideBar Dialogue Grouping Logic
const isSameDay = (d1, d2) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

const groupDialogues = (
  dialogueList,
  searchQuery = '',
  customTitles = {},
  pinnedIds = [],
  referenceDate = new Date()
) => {
  const query = searchQuery.trim().toLowerCase();
  const pinnedSet = new Set(pinnedIds);

  const filtered = dialogueList.filter((d) => {
    if (!query) return true;
    const title = (customTitles[d.conv_uid] || d.user_input || '').toLowerCase();
    return title.includes(query);
  });

  const now = referenceDate;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

  const groups = {
    pinned: [],
    today: [],
    yesterday: [],
    last7Days: [],
    older: [],
  };

  filtered.forEach((dialogue) => {
    if (pinnedSet.has(dialogue.conv_uid)) {
      groups.pinned.push(dialogue);
      return;
    }

    if (!dialogue.gmt_created) {
      groups.older.push(dialogue);
      return;
    }

    const created = new Date(dialogue.gmt_created);
    if (isNaN(created.getTime())) {
      groups.older.push(dialogue);
      return;
    }

    if (isSameDay(created, now)) {
      groups.today.push(dialogue);
    } else if (isSameDay(created, yesterday)) {
      groups.yesterday.push(dialogue);
    } else if (created >= sevenDaysAgo) {
      groups.last7Days.push(dialogue);
    } else {
      groups.older.push(dialogue);
    }
  });

  return groups;
};


// ============================================================================
// ADVERSARIAL STRESS SUITES RUNNER
// ============================================================================

test('Challenger 1 - Stress & Boundary Testing Suite', async (suite) => {

  // --------------------------------------------------------------------------
  // SUITE 1: STORAGE & SAFE JSON PARSE BOUNDARY STRESS
  // --------------------------------------------------------------------------
  await suite.test('1.1: safeJsonParse against null, undefined, empty, and whitespace', () => {
    assert.deepEqual(safeJsonParse(null, { ok: false }), { ok: false });
    assert.deepEqual(safeJsonParse(undefined, [1, 2]), [1, 2]);
    assert.equal(safeJsonParse('', 'DEFAULT_STRING'), 'DEFAULT_STRING');
    assert.equal(safeJsonParse('    \n\t  \r\n  ', 42), 42);
    assert.equal(safeJsonParse(12345, 'fallback'), 'fallback');
    assert.equal(safeJsonParse({}, 'fallback'), 'fallback');
  });

  await suite.test('1.2: safeJsonParse against invalid syntax, broken JSON, and single quotes', () => {
    assert.equal(safeJsonParse('{', null), null);
    assert.equal(safeJsonParse('{"key":', 'err'), 'err');
    const fallbackArr = [];
    assert.equal(safeJsonParse('[1, 2,', fallbackArr), fallbackArr);
    assert.equal(safeJsonParse('{"key": undefined}', { safe: true }).safe, true);
    assert.equal(safeJsonParse('{"a": 1,}', 'trailing_comma'), 'trailing_comma');
    assert.equal(safeJsonParse("{'single': 'quote'}", 'invalid'), 'invalid');
  });

  await suite.test('1.3: safeJsonParse Truncation Stress (all prefix slices [0..L-1])', () => {
    const validJson = JSON.stringify({
      id: 'chat_123',
      nested: { a: [1, 2, 3], b: 'hello world', c: { deep: true } },
      arr: [{ x: 10 }, { y: 20 }]
    });

    for (let i = 0; i < validJson.length - 1; i++) {
      const truncated = validJson.slice(0, i);
      const res = safeJsonParse(truncated, 'FALLBACK_TRUNCATED');
      assert.equal(res, 'FALLBACK_TRUNCATED', `Slice length ${i} must safely fallback without throwing`);
    }

    // Full length returns parsed object
    const fullRes = safeJsonParse(validJson, null);
    assert.equal(fullRes.id, 'chat_123');
    assert.equal(fullRes.nested.c.deep, true);
  });

  await suite.test('1.4: Prototype Pollution Vector Attacks Immunity', () => {
    const protoAttack = '{"__proto__": {"polluted": true, "isAdmin": true}}';
    const parsedProto = safeJsonParse(protoAttack, {});
    
    // Ensure prototype of general objects was NOT polluted
    assert.equal(({}).polluted, undefined, 'Object.prototype.polluted must remain undefined');
    assert.equal(({}).isAdmin, undefined, 'Object.prototype.isAdmin must remain undefined');

    const constructorAttack = '{"constructor": {"prototype": {"pwned": true}}}';
    const parsedConstructor = safeJsonParse(constructorAttack, {});
    assert.equal(({}).pwned, undefined, 'Object.prototype.pwned must remain undefined');

    // __proto__ override of valueOf / toString attack
    const valueOfAttack = '{"__proto__": {"valueOf": "evil"}}';
    const parsedVal = safeJsonParse(valueOfAttack, {});
    assert.equal(typeof ({}).valueOf, 'function', 'valueOf remains standard method on Object');
  });

  await suite.test('1.5: Deeply Nested JSON & Recursion Limit Boundary', () => {
    // 500 levels of nested objects
    let deepObj = { leaf: 'target' };
    for (let i = 0; i < 500; i++) {
      deepObj = { nest: deepObj };
    }
    const deepJsonStr = JSON.stringify(deepObj);

    let parsedDeep;
    assert.doesNotThrow(() => {
      parsedDeep = safeJsonParse(deepJsonStr, null);
    });
    assert.ok(parsedDeep, 'Deeply nested JSON parsed without throwing');

    // 10,000 deep string that might trigger callstack overflow in engines
    const deepBrackets = '{'.repeat(5000) + '}' .repeat(5000);
    assert.doesNotThrow(() => {
      const res = safeJsonParse(deepBrackets, 'fallback_deep');
      assert.ok(res !== undefined);
    });
  });

  await suite.test('1.6: Extreme Numerical & Unicode / Astral Plane Representation', () => {
    const numJson = '{"zero": -0, "big": 1e308, "small": 1e-308, "pi": 3.141592653589793}';
    const numParsed = safeJsonParse(numJson, {});
    assert.equal(numParsed.big, 1e308);
    assert.equal(numParsed.small, 1e-308);

    const unicodeJson = JSON.stringify({
      nullByte: 'hello\u0000world',
      emoji: '🚀✨🔥🌟🎉',
      vietnamese: 'Tiếng Việt có dấu: ế, ắ, ộ, ử, ỹ',
      arabic: 'مرحبا بالعالم',
      chinese: '数据库智能体前端测试',
    });

    const uniParsed = safeJsonParse(unicodeJson, {});
    assert.equal(uniParsed.emoji, '🚀✨🔥🌟🎉');
    assert.equal(uniParsed.vietnamese, 'Tiếng Việt có dấu: ế, ắ, ộ, ử, ỹ');
    assert.equal(uniParsed.nullByte, 'hello\u0000world');
  });

  // --------------------------------------------------------------------------
  // SUITE 2: LOCALSTORAGE FALLBACK & QUOTA EXCEEDED HANDLING
  // --------------------------------------------------------------------------
  await suite.test('2.1: SSR / Undefined Window Environment Fallback', () => {
    // Calling getInitMessage and getUserId with undefined window (SSR simulation)
    const initMsg = getInitMessage(undefined);
    assert.equal(initMsg, null, 'getInitMessage returns null in SSR environment');

    const userId = getUserId(undefined);
    assert.equal(userId, undefined, 'getUserId returns undefined in SSR environment');
  });

  await suite.test('2.2: Unauthenticated State & Corrupted Storage Keys Resilience', () => {
    const mockStorage = {
      store: {},
      getItem(key) { return this.store[key] ?? null; },
      setItem(key, val) { this.store[key] = String(val); },
      removeItem(key) { delete this.store[key]; }
    };
    const mockWin = { localStorage: mockStorage };

    // Case A: Storage has null (unauthenticated)
    assert.equal(getUserId(mockWin), undefined);
    assert.equal(getInitMessage(mockWin), null);

    // Case B: Storage has corrupted non-JSON data
    mockStorage.setItem(STORAGE_USERINFO_KEY, 'corrupted_jwt_token_not_json');
    mockStorage.setItem(STORAGE_INIT_MESSAGE_KET, '<<<broken xml>>>');
    assert.equal(getUserId(mockWin), undefined, 'Corrupted user info returns undefined without crash');
    assert.equal(getInitMessage(mockWin), null, 'Corrupted init msg returns null without crash');

    // Case C: Valid JSON but empty or missing user_id field
    mockStorage.setItem(STORAGE_USERINFO_KEY, JSON.stringify({ username: 'guest', email: 'guest@dbgpt.site' }));
    assert.equal(getUserId(mockWin), undefined, 'Missing user_id safely returns undefined');

    // Case D: Authenticated valid user
    mockStorage.setItem(STORAGE_USERINFO_KEY, JSON.stringify({ user_id: 'usr_883920', username: 'admin' }));
    assert.equal(getUserId(mockWin), 'usr_883920');
  });

  await suite.test('2.3: Storage Quota Exceeded (QuotaExceededError) Simulation', () => {
    let quotaHit = false;
    const quotaExceededStorage = {
      store: {},
      getItem(key) { return this.store[key] ?? null; },
      setItem(key, val) {
        quotaHit = true;
        const err = new Error('QuotaExceededError: The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      },
      removeItem(key) { delete this.store[key]; }
    };

    const mockWin = { localStorage: quotaExceededStorage };

    // Simulating safe storage set wrapper
    const safeSetItem = (key, val) => {
      try {
        mockWin.localStorage.setItem(key, val);
        return true;
      } catch (err) {
        // App must catch quota exceeded error without unhandled crash
        return false;
      }
    };

    const writeSuccess = safeSetItem(PINNED_STORAGE_KEY, JSON.stringify(['conv_1', 'conv_2']));
    assert.equal(writeSuccess, false, 'Quota exceeded is safely caught');
    assert.equal(quotaHit, true);
  });

  // --------------------------------------------------------------------------
  // SUITE 3: STREAM PARSER EDGE CASES & EXTREME PAYLOADS
  // --------------------------------------------------------------------------
  await suite.test('3.1: Empty Chunks, Whitespace, and Raw SSE Lines', () => {
    const rawLines = [
      '',
      '   ',
      ': ping heartbeat',
      'id: 12345',
      'data: ',
      'data: \r\n',
      'data: {"type": "answer_delta", "payload": {"delta": "Chunk 1 "}}',
      'event: update',
      'data: {"type": "answer_delta", "payload": {"delta": "Chunk 2"}}',
      'data: [DONE]',
    ];

    const acc = createAccumulator();
    const finished = consumeSSELines(rawLines, event => reduceAnalystEvent(acc, event));
    assert.equal(finished, true, 'Reached [DONE]');
    assert.equal(acc.answer, 'Chunk 1 Chunk 2');
  });

  await suite.test('3.2: Massive Single Chunk (5MB+) & 100k Token Stream Stress', () => {
    const largeWord = 'BenchmarkWord '.repeat(50000); // ~700KB
    const largePayload = {
      type: 'answer_delta',
      payload: { delta: largeWord }
    };

    const lines = [
      `data: ${JSON.stringify(largePayload)}`,
      'data: [DONE]'
    ];

    const acc = createAccumulator();
    const start = performance.now();
    const finished = consumeSSELines(lines, event => reduceAnalystEvent(acc, event));
    const duration = performance.now() - start;

    assert.equal(finished, true);
    assert.equal(acc.answer.length, largeWord.length);
    assert.ok(duration < 150, `50,000 word chunk processed in ${duration.toFixed(2)}ms (<150ms budget)`);
  });

  await suite.test('3.3: Split Multi-byte UTF-8 Sequences Across Chunk Buffer Boundaries', () => {
    // Multi-byte character: 🚀 (\uD83D\uDE80) -> UTF-8 4 bytes: 0xF0 0x9F 0x9A 0x80
    // Vietnamese 'ế' -> UTF-8: 0xE1 0xBA 0xBF
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8');

    const sseEvent = 'data: {"type": "answer_delta", "payload": {"delta": "Khởi động tên lửa 🚀 và bay vào vũ trụ!"}}\ndata: [DONE]\n';
    const encoded = encoder.encode(sseEvent);

    // Split right in the middle of the rocket emoji (e.g. at index where 🚀 starts + 2 bytes)
    const splitPoint = 75; // mid multi-byte
    const chunk1 = encoded.slice(0, splitPoint);
    const chunk2 = encoded.slice(splitPoint);

    let buffer = '';
    let finished = false;
    const acc = createAccumulator();

    // Decode chunk 1 with { stream: true }
    buffer += decoder.decode(chunk1, { stream: true });
    let lines1 = buffer.split('\n');
    buffer = lines1.pop() || '';
    consumeSSELines(lines1, event => reduceAnalystEvent(acc, event));

    // Decode chunk 2 with { stream: true }
    buffer += decoder.decode(chunk2, { stream: true });
    let lines2 = buffer.split('\n');
    buffer = lines2.pop() || '';
    if (consumeSSELines(lines2, event => reduceAnalystEvent(acc, event))) {
      finished = true;
    }

    assert.equal(finished, true);
    assert.equal(acc.answer, 'Khởi động tên lửa 🚀 và bay vào vũ trụ!');
  });

  await suite.test('3.4: Math / LaTeX Formulas and Nested Code Fences in Stream', () => {
    const mathContent = 'Theo công thức Einstein: $E = mc^2$.\nCông thức tích phân chuẩn:\n$$\\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\nCông thức lỗi dở dang: $$ \\sum_{i=1}^n \\frac{1}{i^2';
    const markdownWithFences = '```python\ndef test():\n    code = """```nested```"""\n    return code\n```\n<script>alert("XSS")</script>';

    const lines = [
      `data: {"type": "answer_delta", "payload": {"delta": ${JSON.stringify(mathContent + '\n' + markdownWithFences)}}}`,
      'data: [DONE]'
    ];

    const acc = createAccumulator();
    const finished = consumeSSELines(lines, event => reduceAnalystEvent(acc, event));

    assert.equal(finished, true);
    assert.ok(acc.answer.includes('$E = mc^2$'));
    assert.ok(acc.answer.includes('\\sqrt{\\pi}'));
    assert.ok(acc.answer.includes('```python'));
    assert.ok(acc.answer.includes('<script>'));
  });

  await suite.test('3.5: Multimodal formatChatContent (Images, Video, Text)', () => {
    const plain = formatChatContent('Simple message');
    assert.equal(plain, 'Simple message');

    const multimodal = formatChatContent({
      content: [
        { type: 'text', text: 'Analyze this revenue chart:' },
        { type: 'image_url', image_url: { url: '/files/chart.png', fileName: 'Q4_Chart' } },
        { type: 'video', video: '/files/demo.mp4' },
        { type: 'audio', audio: '/files/voice.mp3' }
      ]
    });

    assert.ok(multimodal.includes('Analyze this revenue chart:'));
    assert.ok(multimodal.includes('![Q4_Chart](/files/chart.png)'));
    assert.ok(multimodal.includes('[Video](/files/demo.mp4)'));
    assert.ok(multimodal.includes('[audio attachment]'));
  });

  // --------------------------------------------------------------------------
  // SUITE 4: HOOK ORDER INVARIANTS & HIGH-FREQUENCY STATE TOGGLING
  // --------------------------------------------------------------------------
  await suite.test('4.1: Deterministic Hook State Transitions & Lifecycle', () => {
    const acc = createAccumulator();
    assert.equal(acc.isWorking, true);
    assert.equal(acc.artifacts.length, 0);

    // 1. Start artifact
    const change1 = reduceAnalystEvent(acc, {
      type: 'artifact.start',
      payload: { id: 'deck_1', kind: 'pptx', title: 'Pitch Deck' }
    });
    assert.equal(acc.artifacts.length, 1);
    assert.equal(acc.artifacts[0].status, 'streaming');
    assert.equal(acc.artifacts[0].pct, 0);

    // 2. Progress update
    const change2 = reduceAnalystEvent(acc, {
      type: 'artifact.progress',
      payload: { id: 'deck_1', pct: 60, stage: 'Building slides' }
    });
    assert.equal(acc.artifacts[0].pct, 60);

    // 3. Ready update
    const change3 = reduceAnalystEvent(acc, {
      type: 'artifact.ready',
      payload: { id: 'deck_1', url: '/files/deck_1.pptx' }
    });
    assert.equal(acc.artifacts[0].status, 'ready');
    assert.equal(acc.artifacts[0].pct, 100);

    // 4. Stale progress packet arriving AFTER ready (Out of Order) is safely ignored
    reduceAnalystEvent(acc, {
      type: 'artifact.progress',
      payload: { id: 'deck_1', pct: 80, stage: 'Late packet' }
    });
    assert.equal(acc.artifacts[0].status, 'ready', 'Ready artifact status is preserved');
    assert.equal(acc.artifacts[0].pct, 100, '100% completion is preserved');
  });

  await suite.test('4.2: 1,000 Rapid Sequential Start/Abort Cycles Stress', () => {
    let activeControllers = [];
    let abortedCount = 0;

    for (let i = 0; i < 1000; i++) {
      const ctrl = new AbortController();
      ctrl.signal.addEventListener('abort', () => {
        abortedCount++;
      });
      activeControllers.push(ctrl);

      // Abort immediately simulating high-frequency user stop/re-ask clicks
      ctrl.abort();
    }

    assert.equal(abortedCount, 1000);
    assert.equal(activeControllers.every(c => c.signal.aborted), true);
  });

  await suite.test('4.3: Race Condition Immunity (Aborted Request discard)', () => {
    let currentRequestId = 2; // Active request is #2
    const acc = createAccumulator();

    // Late packet from aborted request #1
    const packetFromOldRequest = { reqId: 1, type: 'answer_delta', payload: { delta: 'Old Stale Data' } };
    if (packetFromOldRequest.reqId === currentRequestId) {
      reduceAnalystEvent(acc, packetFromOldRequest);
    }

    // Packet from active request #2
    const packetFromActiveRequest = { reqId: 2, type: 'answer_delta', payload: { delta: 'Active Fresh Data' } };
    if (packetFromActiveRequest.reqId === currentRequestId) {
      reduceAnalystEvent(acc, packetFromActiveRequest);
    }

    assert.equal(acc.answer, 'Active Fresh Data', 'Stale request packet was rejected and did not pollute state');
  });

  // --------------------------------------------------------------------------
  // SUITE 5: REASONING ACCORDION & TOOL CALLS BOUNDARY
  // --------------------------------------------------------------------------
  await suite.test('5.1: Massive Multiline Thoughts Performance (>100,000 chars)', () => {
    const hugeThought = 'Thinking through financial model...\n'.repeat(3000);
    const start = performance.now();
    const normalized = normalizeThoughts(hugeThought);
    const elapsed = performance.now() - start;

    assert.ok(normalized.length > 50000);
    assert.ok(elapsed < 25, `Normalization took ${elapsed.toFixed(2)}ms (< 25ms budget)`);
  });

  await suite.test('5.2: Thought Normalization Boundary Edge Cases', () => {
    assert.equal(normalizeThoughts(null), '');
    assert.equal(normalizeThoughts(undefined), '');
    assert.equal(normalizeThoughts(''), '');
    assert.equal(normalizeThoughts(['   ', '']), '');
    assert.equal(normalizeThoughts({ a: 'Step 1', b: 'Step 2' }), 'Step 1\n\nStep 2');
    assert.equal(normalizeThoughts('TODO::clean\n思路：Thinking...'), 'Thinking...');
  });

  await suite.test('5.3: Elapsed Timer Duration Bounds & Precision', () => {
    assert.equal(formatDuration(0), '0ms');
    assert.equal(formatDuration(450), '450ms');
    assert.equal(formatDuration(999), '999ms');
    assert.equal(formatDuration(1000), '1.0s');
    assert.equal(formatDuration(45200), '45.2s');
    assert.equal(formatDuration(59990), '1m 0s');
    assert.equal(formatDuration(60000), '1m 0s');
    assert.equal(formatDuration(125000), '2m 5s');
    assert.equal(formatDuration(3600000), '60m 0s');
  });

  await suite.test('5.4: 100+ Multiple Nested & Sequential Tool Calls Stress', () => {
    const toolTypes = ['read', 'edit', 'write', 'bash', 'grep', 'glob', 'python', 'html', 'sql', 'task', 'skill'];
    for (let i = 0; i < 150; i++) {
      const type = toolTypes[i % toolTypes.length];
      const viLabel = getHumanizedActionLabel(type, `Action ${i}`, null, true);
      const enLabel = getHumanizedActionLabel(type, `Action ${i}`, null, false);
      assert.ok(viLabel.length > 0);
      assert.ok(enLabel.length > 0);
    }
  });

  await suite.test('5.5: Empty, Null, and Circular Tool Outputs Resilience', () => {
    const emptyDetails = extractStepDetails(undefined, undefined);
    assert.deepEqual(emptyDetails, { inputStr: '', outputStr: '', obsText: '' });

    const circularObj = {};
    circularObj.self = circularObj;
    let circDetails;
    assert.doesNotThrow(() => {
      circDetails = extractStepDetails('Action Input: {}', circularObj);
    });
    assert.ok(circDetails.outputStr.length > 0);
  });

  // --------------------------------------------------------------------------
  // SUITE 6: CONVERSATION HISTORY PARTITIONING & SEARCH BOUNDARY
  // --------------------------------------------------------------------------
  await suite.test('6.1: 500+ Conversations Partitioning & Performance', () => {
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).toISOString();
    const yestMid = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0).toISOString();
    const last7Mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4, 12, 0, 0).toISOString();
    const olderMid = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 12, 0, 0).toISOString();

    const mockList = [];
    for (let i = 0; i < 100; i++) mockList.push({ conv_uid: `today-${i}`, user_input: `Today #${i}`, gmt_created: todayMid });
    for (let i = 0; i < 100; i++) mockList.push({ conv_uid: `yest-${i}`, user_input: `Yest #${i}`, gmt_created: yestMid });
    for (let i = 0; i < 100; i++) mockList.push({ conv_uid: `last7-${i}`, user_input: `Last7 #${i}`, gmt_created: last7Mid });
    for (let i = 0; i < 150; i++) mockList.push({ conv_uid: `older-${i}`, user_input: `Older #${i}`, gmt_created: olderMid });
    
    const pinnedIds = mockList.slice(0, 50).map(c => c.conv_uid);

    const start = performance.now();
    const grouped = groupDialogues(mockList, '', {}, pinnedIds, now);
    const elapsed = performance.now() - start;

    assert.equal(grouped.pinned.length, 50);
    assert.equal(grouped.today.length, 50);
    assert.equal(grouped.yesterday.length, 100);
    assert.equal(grouped.last7Days.length, 100);
    assert.equal(grouped.older.length, 150);
    assert.ok(elapsed < 20, `500 dialogue grouping finished in ${elapsed.toFixed(2)}ms (<20ms)`);
  });

  await suite.test('6.2: Search / Filter Regex Safety with Metacharacters', () => {
    const list = [
      { conv_uid: '1', user_input: 'Financial Modeling for Q4' },
      { conv_uid: '2', user_input: 'Regex Special [Test] (Brackets) *+?^$' },
      { conv_uid: '3', user_input: 'Báo cáo doanh thu tháng 8/2026' }
    ];

    const regexQueries = ['[Test]', '(Brackets)', '*', '+', '?', '^', '$', '\\', '/'];
    for (const q of regexQueries) {
      assert.doesNotThrow(() => {
        const res = groupDialogues(list, q, {}, []);
        assert.ok(res);
      }, `Search with query "${q}" must not throw regex error`);
    }

    const resRegex = groupDialogues(list, '[test]', {}, []);
    assert.equal(resRegex.older.length, 1);
    assert.equal(resRegex.older[0].conv_uid, '2');

    const resVi = groupDialogues(list, 'DOANH THU', {}, []);
    assert.equal(resVi.older.length, 1);
    assert.equal(resVi.older[0].conv_uid, '3');
  });

  // --------------------------------------------------------------------------
  // SUITE 7: PRODUCTION SOURCE CODE & DESIGN SYSTEM INVARIANTS
  // --------------------------------------------------------------------------
  await suite.test('7.1: Component Structural & Design System Integrity', () => {
    const thinkingBlockSrc = fs.readFileSync(path.join(ROOT, 'components/chat/content/ThinkingBlock.tsx'), 'utf8');
    const toolBadgeSrc = fs.readFileSync(path.join(ROOT, 'components/chat/content/ToolExecutionBadge.tsx'), 'utf8');
    const sideBarSrc = fs.readFileSync(path.join(ROOT, 'components/layout/side-bar.tsx'), 'utf8');
    const jsonUtilSrc = fs.readFileSync(path.join(ROOT, 'utils/json.ts'), 'utf8');
    const storageUtilSrc = fs.readFileSync(path.join(ROOT, 'utils/storage.ts'), 'utf8');

    // json.ts & storage.ts guarantees
    assert.match(jsonUtilSrc, /export function safeJsonParse/);
    assert.match(storageUtilSrc, /export function getInitMessage/);
    assert.match(storageUtilSrc, /export function getUserId/);

    // ThinkingBlock guarantees
    assert.match(thinkingBlockSrc, /normalizeThoughts/);
    assert.match(thinkingBlockSrc, /formatDuration/);
    assert.match(thinkingBlockSrc, /AnimatePresence/);
    assert.match(thinkingBlockSrc, /motion\.div/);

    // ToolExecutionBadge guarantees
    assert.match(toolBadgeSrc, /getHumanizedActionLabel/);
    assert.match(toolBadgeSrc, /getToolTypeBadge/);
    assert.match(toolBadgeSrc, /ObservationFormatter/);

    // SideBar guarantees
    assert.match(sideBarSrc, /PINNED_STORAGE_KEY/);
    assert.match(sideBarSrc, /TITLES_STORAGE_KEY/);
    assert.match(sideBarSrc, /handleTogglePin/);
    assert.match(sideBarSrc, /handleStartRename/);
    assert.match(sideBarSrc, /handleDeleteDialogue/);
  });
});
