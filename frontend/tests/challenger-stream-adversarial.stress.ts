/**
 * Challenger 1: Adversarial Universal SSE Streaming Stress Harness
 * Target: components/openwork/services/deepseek-stream.ts & openai-stream.ts
 */

import assert from 'node:assert/strict';
import {
  streamOpenAIChat,
  streamDeepSeekChat,
  normalizeSSEChunk,
  normalizeProviderUrl,
  resolveProviderEndpointUrl,
  buildProviderHeaders,
  DEFAULT_AGENT_WRAP_BASE_URL,
  DEFAULT_AGENT_WRAP_API_KEY,
  DEFAULT_OPENROUTER_API_KEY,
  DEFAULT_OPENWORK_MODEL,
  ALLOWED_AGENT_WRAP_MODELS,
  type DeepSeekStreamOptions,
  type DeepSeekStreamResult,
  type DeepSeekToolCall,
} from '../components/openwork/services/deepseek-stream';
import { PROVIDER_MODEL_CATALOG } from '../components/openwork/types';

console.log('================================================================');
console.log('⚡ CHALLENGER 1: UNIVERSAL SSE STREAMING ADVERSARIAL STRESS SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  totalTests++;
  try {
    await fn();
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

function mockFetchWithByteChunks(
  chunks: Uint8Array[],
  status = 200,
  statusText = 'OK',
  onFetchCalled?: (url: string, init?: RequestInit) => void
) {
  const originalFetch = globalThis.fetch;
  let chunkIndex = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(chunks[chunkIndex++]);
      } else {
        controller.close();
      }
    },
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    onFetchCalled?.(typeof input === 'string' ? input : input.toString(), init);
    if (init?.signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      body: stream,
      json: async () => ({ error: { message: `HTTP ${status} error payload` } }),
      text: async () => `HTTP ${status} raw error body`,
    } as any;
  }) as any;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function mockAbortableStream(
  onPull: (controller: ReadableStreamDefaultController<Uint8Array>, index: number) => boolean | Promise<boolean>
) {
  const originalFetch = globalThis.fetch;
  let chunkIdx = 0;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (signal?.aborted) {
          controller.error(new Error('AbortError'));
          return;
        }
        const hasMore = await onPull(controller, chunkIdx++);
        if (!hasMore) {
          controller.close();
        }
      },
    });

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      body: stream,
      json: async () => ({}),
      text: async () => '',
    } as any;
  }) as any;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function runSuite() {
  console.log('🔬 Category 1: Multibyte UTF-8 Character Slicing Across Byte Boundaries');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('1.1: 4-byte Emojis, 3-byte Vietnamese diacritics & CJK split across 1-byte chunks', async () => {
    const originalText = '⚡ Chiến lược AI 2026: Đổi mới sáng tạo 💡, tối ưu chi phí 🚀, tự động hóa toàn diện 🧠. 深度求索 (DeepSeek) & 智谱 (DeepSeek V4 Flash) 🌟';
    const sseEvent = `data: {"choices":[{"delta":{"content":"${originalText.replace(/\n/g, '\\n')}"}}]}\n\ndata: [DONE]\n\n`;

    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(sseEvent);

    const singleByteChunks: Uint8Array[] = Array.from(fullBytes).map((b) => new Uint8Array([b]));

    const restore = mockFetchWithByteChunks(singleByteChunks);
    let capturedContent = '';

    try {
      const res = await streamOpenAIChat({
        messages: [{ role: 'user', content: 'test' }],
        onContentDelta: (_delta, accumulated) => {
          capturedContent = accumulated;
        },
      });

      assert.strictEqual(res.content, originalText);
      assert.strictEqual(capturedContent, originalText);
      assert.strictEqual(res.content.includes('\uFFFD'), false, 'U+FFFD replacement char detected!');
    } finally {
      restore();
    }
  });

  await runTest('1.2: Reasoning CoT deltas split across prime-numbered byte chunks (2, 3, 5, 7 bytes)', async () => {
    const cotText = 'Bước 1: Phân tích yêu cầu bài toán.\nBước 2: Truy vấn cơ sở dữ liệu SQLite.\nBước 3: Tổng hợp biểu đồ doanh thu.\nKết luận: Tăng trưởng 45% so với cùng kỳ.';
    const sseEvent = `data: {"choices":[{"delta":{"reasoning_content":"${cotText.replace(/\n/g, '\\n')}"}}]}\n\ndata: [DONE]\n\n`;

    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(sseEvent);

    const primes = [2, 3, 5, 7, 11];
    let primeIdx = 0;
    const primeChunks: Uint8Array[] = [];
    let offset = 0;

    while (offset < fullBytes.length) {
      const size = primes[primeIdx % primes.length];
      primeIdx++;
      const end = Math.min(offset + size, fullBytes.length);
      primeChunks.push(fullBytes.slice(offset, end));
      offset = end;
    }

    const restore = mockFetchWithByteChunks(primeChunks);
    let capturedReasoning = '';

    try {
      const res = await streamOpenAIChat({
        messages: [{ role: 'user', content: 'test' }],
        onReasoningDelta: (_d, acc) => {
          capturedReasoning = acc;
        },
      });

      assert.strictEqual(res.reasoning, cotText);
      assert.strictEqual(capturedReasoning, cotText);
      assert.strictEqual(res.reasoning.includes('\uFFFD'), false);
    } finally {
      restore();
    }
  });

  console.log('\n🔬 Category 2: Malformed SSE Frames & Corrupted Buffer Resilience');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('2.1: Robust recovery from truncated JSON, comment noise, and partial lines', async () => {
    const rawNoisyStream = [
      ': ping heartbeat\n\n',
      'data: {broken_json\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"CoT Part 1 "}}]}\n\n',
      ': another comment with :: colons\n',
      'data: not_json\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"CoT Part 2"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Prose Part 1 "}}]}\n\n',
      'data: {"choices":null}\n\n',
      'data: {"choices":[{"delta":{"content":"Prose Part 2"}}]}\n\n',
      'data: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"Ignored After Done"}}]}\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const restore = mockFetchWithByteChunks([encoder.encode(rawNoisyStream)]);

    try {
      const res = await streamOpenAIChat({
        messages: [{ role: 'user', content: 'test' }],
      });

      assert.strictEqual(res.reasoning, 'CoT Part 1 CoT Part 2');
      assert.strictEqual(res.content, 'Prose Part 1 Prose Part 2');
    } finally {
      restore();
    }
  });

  await runTest('2.2: Mixed CRLF (\\r\\n) and LF (\\n) line endings handled consistently', async () => {
    const crlfStream = 'data: {"choices":[{"delta":{"content":"Line 1\\r\\nLine 2"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"\\r\\nLine 3"}}]}\r\n\r\ndata: [DONE]\r\n\r\n';
    const encoder = new TextEncoder();
    const restore = mockFetchWithByteChunks([encoder.encode(crlfStream)]);

    try {
      const res = await streamOpenAIChat({
        messages: [{ role: 'user', content: 'test' }],
      });
      assert.strictEqual(res.content, 'Line 1\r\nLine 2\r\nLine 3');
    } finally {
      restore();
    }
  });

  console.log('\n🔬 Category 3: AbortSignal Teardown & Mid-Stream Interruption');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('3.1: Mid-Reasoning Abort cleanly captures partial reasoning and halts stream', async () => {
    const encoder = new TextEncoder();
    const controller = new AbortController();
    let finishTriggered = false;

    const restore = mockAbortableStream(async (streamController, idx) => {
      if (idx === 0) {
        streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"Thinking step 1..."}}]}\n\n'));
        return true;
      }
      if (idx === 1) {
        streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"Thinking step 2..."}}]}\n\n'));
        controller.abort();
        return true;
      }
      streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Should not appear"}}]}\n\n'));
      return false;
    });

    try {
      const res = await streamOpenAIChat({
        messages: [{ role: 'user', content: 'test' }],
        signal: controller.signal,
        onFinish: () => {
          finishTriggered = true;
        },
      });

      assert.strictEqual(finishTriggered, true);
      assert.strictEqual(res.reasoning, 'Thinking step 1...Thinking step 2...');
      assert.strictEqual(res.content, '');
    } finally {
      restore();
    }
  });

  await runTest('3.2: Mid-Tool-Argument Abort preserves partial tool call JSON structure', async () => {
    const encoder = new TextEncoder();
    const controller = new AbortController();

    const restore = mockAbortableStream(async (streamController, idx) => {
      if (idx === 0) {
        streamController.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_word_1', function: { name: 'gen_word_doc', arguments: '{"title": "Báo cáo Q3", ' } }] } }],
          })}\n\n`)
        );
        return true;
      }
      if (idx === 1) {
        streamController.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"author": "Analyst"' } }] } }],
          })}\n\n`)
        );
        controller.abort();
        return true;
      }
      return false;
    });

    try {
      const res = await streamOpenAIChat({
        messages: [{ role: 'user', content: 'test' }],
        signal: controller.signal,
      });

      assert.strictEqual(res.toolCalls.length, 1);
      assert.strictEqual(res.toolCalls[0].id, 'call_word_1');
      assert.strictEqual(res.toolCalls[0].function?.name, 'gen_word_doc');
      assert.strictEqual(res.toolCalls[0].function?.arguments, '{"title": "Báo cáo Q3", "author": "Analyst"');
    } finally {
      restore();
    }
  });

  console.log('\n🔬 Category 4: Server 160 Wrapper & Multi-Vendor Protocol Isolation');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('4.1: OpenRouter default routing uses Bearer key and target URL', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = {};
    let capturedBody: any = {};

    const encoder = new TextEncoder();
    const restore = mockFetchWithByteChunks(
      [encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n')],
      200,
      'OK',
      (url, init) => {
        capturedUrl = url;
        capturedHeaders = init?.headers;
        capturedBody = JSON.parse(init?.body as string);
      }
    );

    try {
      await streamOpenAIChat({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'deepseek-v4-flash',
      });

      assert.strictEqual(capturedUrl, '/api/openrouter/v1/chat/completions');
      assert.strictEqual(capturedHeaders['Authorization'], `Bearer ${DEFAULT_OPENROUTER_API_KEY}`);
      assert.strictEqual(capturedHeaders['Accept'], 'text/event-stream');
      assert.strictEqual(capturedBody.model, 'deepseek-v4-flash');
      assert.strictEqual(capturedBody.stream, true);
    } finally {
      restore();
    }
  });

  await runTest('4.2: OpenCode Free routing against Server 160 wrapper', async () => {
    let capturedBody: any = {};
    const encoder = new TextEncoder();
    const restore = mockFetchWithByteChunks(
      [encoder.encode('data: {"choices":[{"delta":{"content":"Code Output"}}]}\n\ndata: [DONE]\n\n')],
      200,
      'OK',
      (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
      }
    );

    try {
      await streamOpenAIChat({
        messages: [{ role: 'user', content: 'Generate code' }],
        model: 'opencode-free',
        providerKind: 'opencode',
      });

      assert.strictEqual(capturedBody.model, 'opencode-free');
    } finally {
      restore();
    }
  });

  await runTest('4.3: Strict Ban of Gemini across catalog and allowed lists', () => {
    assert.ok(ALLOWED_AGENT_WRAP_MODELS.includes('deepseek-v4-flash'));
    assert.strictEqual((ALLOWED_AGENT_WRAP_MODELS as readonly string[]).includes('Gemini 2.5 Flash'), false, 'Gemini 2.5 Flash found in ALLOWED_AGENT_WRAP_MODELS!');
    assert.strictEqual((ALLOWED_AGENT_WRAP_MODELS as readonly string[]).includes('Gemini 3.7 Flash'), false, 'Gemini 3.7 Flash found in ALLOWED_AGENT_WRAP_MODELS!');

    for (const [provider, models] of Object.entries(PROVIDER_MODEL_CATALOG)) {
      const hasBanned = models.some((m) => m.value.toLowerCase().includes('gemini') || m.label.toLowerCase().includes('gemini'));
      assert.strictEqual(hasBanned, false, `Gemini detected in catalog provider: ${provider}`);
    }
  });

  console.log('\n================================================================');
  console.log('📊 CHALLENGER 1 STREAMING STRESS RESULTS');
  console.log('================================================================');
  console.log(`  Total Tests Run : ${totalTests}`);
  console.log(`  Passed          : ${passedTests}`);
  console.log(`  Failed          : ${failedTests}`);
  console.log(`  Pass Rate       : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal stress test runner error:', err);
  process.exit(1);
});
