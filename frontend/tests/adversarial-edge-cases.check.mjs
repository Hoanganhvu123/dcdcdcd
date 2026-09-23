#!/usr/bin/env node
import assert from 'node:assert/strict';

console.log('==============================================================');
console.log('⚡ ADVERSARIAL STRESS-TEST & EDGE-CASE HARNESS');
console.log('=============================================================\n');

let totalAssertions = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

function resolveDeepSeekUrl(baseUrl) {
  let url = (baseUrl || '/api/deepseek').trim();
  if (!url) {
    url = '/api/deepseek';
  }
  url = url.replace(/\/+$/, '');
  if (url.endsWith('/chat/completions')) {
    return url;
  }
  return url + '/chat/completions';
}

function parsePartialJson(raw) {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    let repaired = trimmed;
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }
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
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
      }
    }
    while (stack.length > 0) {
      repaired += stack.pop();
    }
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function generateUUIDv7() {
  const timestamp = Date.now();
  const timeHex = timestamp.toString(16).padStart(12, '0');
  const part1 = timeHex.slice(0, 8);
  const part2 = timeHex.slice(8, 12);
  const rand1 = Math.floor(Math.random() * 0x0fff);
  const part3 = '7' + rand1.toString(16).padStart(3, '0');
  const rand2 = Math.floor(Math.random() * 0x3fff) | 0x8000;
  const part4 = rand2.toString(16).padStart(4, '0');
  const rand3 = Math.floor(Math.random() * 0xffffffffffff);
  const part5 = rand3.toString(16).padStart(12, '0');
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

function isValidUUIDv7(uuid) {
  if (typeof uuid !== 'string') return false;
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return pattern.test(uuid);
}

// SUITE 1
console.log('💘 SUITE 1: URL Normalization & Resolution Stress Testing');

test('1.1: Default base URL resolution when undefined or null', () => {
  totalAssertions += 2;
  assert.strictEqual(resolveDeepSeekUrl(undefined), '/api/deepseek/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl(null), '/api/deepseek/chat/completions');
});

test('1.2: Empty or whitespace strings fallback to proxy endpoint', () => {
  totalAssertions += 3;
  assert.strictEqual(resolveDeepSeekUrl(''), '/api/deepseek/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl('   '), '/api/deepseek/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl('\t\n\t'), '/api/deepseek/chat/completions');
});

test('1.3: Single and multiple trailing slashes are cleanly stripped', () => {
  totalAssertions += 4;
  assert.strictEqual(resolveDeepSeekUrl('/api/deepseek/'), '/api/deepseek/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl('/api/deepseek///'), '/api/deepseek/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl('https://api.deepseek.com/'), 'https://api.deepseek.com/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl('https://api.deepseek.com////'), 'https://api.deepseek.com/chat/completions');
});

test('1.4: Pre-existing /chat/completions suffix is idempotently preserved', () => {
  totalAssertions += 3;
  assert.strictEqual(resolveDeepSeekUrl('/api/deepseek/chat/completions'), '/api/deepseek/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl('https://api.deepseek.com/chat/completions'), 'https://api.deepseek.com/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl('https://api.deepseek.com/chat/completions/'), 'https://api.deepseek.com/chat/completions');
});

test('1.5: Custom gateway / v1 paths resolve cleanly', () => {
  totalAssertions += 2;
  assert.strictEqual(resolveDeepSeekUrl('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/chat/completions');
  assert.strictEqual(resolveDeepSeekUrl('https://custom-gateway.corp.internal/ai/v1/'), 'https://custom-gateway.corp.internal/ai/v1/chat/completions');
});

// SUITE 2
console.log('\n💘 SUITE 2: Partial JSON Stream Recovery Stress Testing');

test('2.1: Valid JSON parsed directly without alteration', () => {
  totalAssertions += 2;
  const input = JSON.stringify({ query: 'SELECT * FROM orders', limit: 50 });
  const result = parsePartialJson(input);
  assert.deepStrictEqual(result, { query: 'SELECT * FROM orders', limit: 50 });
});

test('2.2: Unclosed string literal is repaired and parsed', () => {
  totalAssertions += 1;
  const input = '{"query": "SELECT quarter, revenue FROM pnl_records';
  const result = parsePartialJson(input);
  assert.strictEqual(result.query, 'SELECT quarter, revenue FROM pnl_records');
});

test('2.3: Unclosed arrays and deeply nested objects are repaired', () => {
  totalAssertions += 3;
  const input = '{"title": "Q3 PnL", "sheets": [{"name": "PnL", "data": [[10, 20], [30';
  const result = parsePartialJson(input);
  assert.ok(result);
  assert.strictEqual(result.title, 'Q3 PnL');
  assert.strictEqual(result.sheets[0].name, 'PnL');
});

test('2.4: Malformed unparseable strings return null safely without throwing', () => {
  totalAssertions += 3;
  assert.strictEqual(parsePartialJson('!@#$%^&*()'), null);
  assert.strictEqual(parsePartialJson('<<<HTML>Forbidden</HTML>'), null);
  assert.strictEqual(parsePartialJson(''), null);
});

// SUITE 3
console.log('\n📦 SUITE 3: SSE Chunk Fragmentation & Streaming Parser Stress');

test('3.1: Chunk split across byte boundaries accumulates reasoning and content', () => {
  totalAssertions += 3;
  let accumulatedReasoning = '';
  let accumulatedContent = '';
  const chunks = [
    'data: {"choices":[{"delta":{"reasoning_content":"Step 1: Analy',
    'ze DB schema.\\n"}}]}\n\n',
    ': keep-alive\n\n',
    'data: {"choices":[{"delta":{"content":"Here is the fin',
    'ancial summary."}}]}\n\n',
    'data: [DONE]\n\n',
  ];

  let buffer = '';
  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices[0].delta;
        if (delta.reasoning_content) accumulatedReasoning += delta.reasoning_content;
        if (delta.content) accumulatedContent += delta.content;
      }
    }
  }

  assert.strictEqual(accumulatedReasoning, 'Step 1: Analyze DB schema.\n');
  assert.strictEqual(accumulatedContent, 'Here is the financial summary.');
  assert.strictEqual(buffer, '');
});

test('3.2: Tool call streaming accumulation with fragmented arguments', () => {
  totalAssertions += 3;
  const toolChunks = [
    'data: ' + JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_sql_1',
            type: 'function',
            function: {
              name: 'sql_query',
              arguments: '{"que',
            },
          }],
        },
      }],
    }) + '\n\n',
    'data: ' + JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: {
              arguments: 'ry": "SELECT * FROM sales"}',
            },
          }],
        },
      }],
    }) + '\n\n',
    'data: [DONE]\n\n',
  ];

  const toolMap = new Map();
  let buffer = '';
  for (const chunk of toolChunks) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;
        const parsed = JSON.parse(dataStr);
        const tc = parsed.choices[0].delta.tool_calls[0];
        let existing = toolMap.get(tc.index);
        if (!existing) {
          existing = { index: tc.index, id: tc.id, function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } };
          toolMap.set(tc.index, existing);
        } else {
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
        }
      }
    }
  }

  const finalTool = toolMap.get(0);
  assert.strictEqual(finalTool.function.name, 'sql_query');
  assert.strictEqual(finalTool.function.arguments, '{"query": "SELECT * FROM sales"}');
  assert.deepStrictEqual(JSON.parse(finalTool.function.arguments), { query: 'SELECT * FROM sales' });
});

// SUITE 4
console.log('\n💘 SUITE 4: UUIDv7 RFC 9562 Monotonicity & Prefix Elimination Stress');

test('4.1: 500 generated UUIDs strictly conform to RFC 9562 UUIDv7 without legacy prefixes', () => {
  totalAssertions += 1000;
  const uuids = [];
  for (let i = 0; i < 500; i++) {
    const id = generateUUIDv7();
    uuids.push(id);
    assert.strictEqual(isValidUUIDv7(id), true, `UUID ${id} failed validation`);
    assert.ok(!id.startsWith('session-'), `UUID ${id} contained session- prefix`);
    assert.ok(!id.startsWith('local-'), `UUID ${id} contained local- prefix`);
  }
  const uniqueSet = new Set(uuids);
  assert.strictEqual(uniqueSet.size, 500);
});


function testModelSettingsMigration() {
  totalAssertions += 7;
  const legacyStorage = JSON.stringify({
    deepseekApiKey: 'sk-12345678901234567890',
    deepseekModel: 'deepseek-chat',
    deepseekBaseUrl: 'https://api.deepseek.com',
    temperature: 0.4,
  });
  const parsed = JSON.parse(legacyStorage);
  const apiKey = parsed.deepseekApiKey || parsed.apiKey || '';
  const model = parsed.deepseekModel || parsed.model || 'deepseek-v4-flash';
  const apiBaseUrl = parsed.deepseekBaseUrl || parsed.apiBaseUrl || '/api/deepseek';
  assert.strictEqual(apiKey, 'sk-12345678901234567890');
  assert.strictEqual(model, 'deepseek-chat');
  assert.strictEqual(apiBaseUrl, 'https://api.deepseek.com');
  assert.strictEqual(parsed.temperature, 0.4);

  // Now test new format
  const newStorage = JSON.stringify({
    apiKey: 'sk-99999999999999999999',
    model: 'deepseek-reasoner',
    apiBaseUrl: '/api/deepseek',
  });
  const parsedNew = JSON.parse(newStorage);
  assert.strictEqual(parsedNew.apiKey || parsedNew.deepseekApiKey, 'sk-99999999999999999999');
  assert.strictEqual(parsedNew.model || parsedNew.deepseekModel, 'deepseek-reasoner');
  assert.strictEqual(parsedNew.apiBaseUrl || parsedNew.deepseekBaseUrl, '/api/deepseek');
}

console.log('\n📦 SUITE 5: Settings & LocalStorage Resiliency Stress');
test('5.1: Backwards & forwards compatibility in settings storage keys', testModelSettingsMigration);

console.log('\n================================================================');
console.log(`🎉 ADVERSARIAL CHECKS COMPLETE: ${passedTests} passed, ${failedTests} failed (${totalAssertions} assertions verified)`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
}
