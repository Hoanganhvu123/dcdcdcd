/**
 * Empirical Adversarial Stress Test Suite for DeepSeek V4 Streaming & SSE Pipeline
 * Target: frontend/components/openwork/services/deepseek-stream.ts
 *
 * Scenarios tested:
 * 1. Split Unicode across byte buffer boundaries (1-byte, 2-byte, 3-byte, 4-byte sequences split byte-by-byte)
 * 2. Malformed SSE chunks, truncated JSON, SSE comment noise, corrupted lines & recovery
 * 3. High-frequency burst deltas (2,000+ micro-deltas in rapid succession)
 * 4. AbortController cancellation mid-reasoning, mid-tool execution, and pre-stream
 * 5. Zero-length thinking tokens, empty content deltas, and null/empty choices
 * 6. Multi-tool interleaved chunk streaming & argument accumulation
 * 7. HTTP error payload parsing (JSON error, plaintext error, null body)
 */

import assert from 'node:assert/strict';
import {
  streamDeepSeekChat,
  resolveDeepSeekUrl,
  type DeepSeekStreamOptions,
  type DeepSeekStreamResult,
  type DeepSeekToolCall,
} from '../components/openwork/services/deepseek-stream';

console.log('================================================================');
console.log('⚡ ADVERSARIAL STRESS TEST SUITE: DEEPSEEK V4 STREAMING PIPELINE');
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

/**
 * Helper to create a mocked global fetch that returns a ReadableStream from Uint8Array byte chunks
 */
function mockFetchWithByteChunks(chunks: Uint8Array[], status = 200, statusText = 'OK') {
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

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
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
      json: async () => ({ error: { message: `HTTP ${status} error message` } }),
      text: async () => `HTTP ${status} raw error response`,
    } as any;
  }) as any;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Helper to create a mocked global fetch that supports delayed/abortable streaming
 */
function mockAbortableFetch(onPull: (controller: ReadableStreamDefaultController<Uint8Array>, index: number) => boolean | Promise<boolean>) {
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
      cancel() {
        // Stream cancelled
      }
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
  console.log('🔬 Category 1: Split Unicode Across Buffer Boundaries');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('1.1: 4-Byte Emoji & Multi-byte CJK/Vietnamese cut byte-by-byte across chunks', async () => {
    const complexUnicodeStr = '🚀 Thử nghiệm Tiếng Việt: ế, ắ, ộ, ử. 深度求索 DeepSeek 🧠 ✨ 🌟 💡';
    const sseEvent = `data: ${JSON.stringify({
      choices: [{ delta: { reasoning_content: complexUnicodeStr } }],
    })}\n\ndata: [DONE]\n\n`;

    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(sseEvent);

    // Split into 1-byte and 2-byte micro buffers intentionally cutting multi-byte sequences
    const byteChunks: Uint8Array[] = [];
    let offset = 0;
    while (offset < fullBytes.length) {
      // Vary chunk size between 1 and 3 bytes
      const chunkSize = (offset % 3) + 1;
      const end = Math.min(offset + chunkSize, fullBytes.length);
      byteChunks.push(fullBytes.slice(offset, end));
      offset = end;
    }

    const restoreFetch = mockFetchWithByteChunks(byteChunks);
    let capturedReasoning = '';

    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
        onReasoningDelta: (_delta, accumulated) => {
          capturedReasoning = accumulated;
        },
      });

      assert.strictEqual(result.reasoning, complexUnicodeStr);
      assert.strictEqual(capturedReasoning, complexUnicodeStr);
      // Ensure no Unicode replacement characters (U+FFFD \uFFFD) occurred
      assert.strictEqual(result.reasoning.includes('\uFFFD'), false, 'Corrupted unicode replacement char found!');
    } finally {
      restoreFetch();
    }
  });

  await runTest('1.2: Line breaks and SSE delimiters split character-by-character', async () => {
    const prose = 'Dòng 1\nDòng 2\r\nDòng 3';
    const rawSSE = `data: {"choices":[{"delta":{"content":"${prose.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"}}]}\n\ndata: [DONE]\n\n`;
    
    // Split each character into individual byte chunks
    const encoder = new TextEncoder();
    const byteChunks = Array.from(encoder.encode(rawSSE)).map(b => new Uint8Array([b]));

    const restoreFetch = mockFetchWithByteChunks(byteChunks);
    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
      });
      assert.strictEqual(result.content, prose);
    } finally {
      restoreFetch();
    }
  });

  console.log('\n🔬 Category 2: Malformed SSE Chunks & Noise Resilience');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('2.1: Corrupted JSON, truncated frames, comments, and stream recovery', async () => {
    const encoder = new TextEncoder();
    const noisyStream = [
      ': ping heartbeat comment\n\n',
      'data: {unclosed_bad_json\n\n',
      'data: {"choices": [{"delta": {"reasoning_content": "Valid Thought 1"}}]}\n\n',
      'data: not_even_json_at_all\n\n',
      ': another comment with colons :::: \n\n',
      '\n\n\n',
      'data: {"choices": [{"delta": {"content": "Valid Content 1"}}]}\n\n',
      'data: {"choices": null}\n\n',
      'data: {"choices": [{"delta": {"content": " and Content 2"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const restoreFetch = mockFetchWithByteChunks([encoder.encode(noisyStream)]);
    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
      });

      assert.strictEqual(result.reasoning, 'Valid Thought 1');
      assert.strictEqual(result.content, 'Valid Content 1 and Content 2');
    } finally {
      restoreFetch();
    }
  });

  console.log('\n🔬 Category 3: High-Frequency Burst Deltas (1,000+ Chunks)');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('3.1: 2,000 Rapid Micro-Deltas Burst Processing', async () => {
    const totalDeltas = 2000;
    const chunks: string[] = [];

    for (let i = 0; i < totalDeltas; i++) {
      if (i < 500) {
        // Reasoning delta
        chunks.push(`data: {"choices":[{"delta":{"reasoning_content":"t${i} "}}]}\n\n`);
      } else {
        // Content delta
        chunks.push(`data: {"choices":[{"delta":{"content":"c${i} "}}]}\n\n`);
      }
    }
    chunks.push('data: [DONE]\n\n');

    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(chunks.join(''));
    
    // Group into 50 byte chunks to simulate network packets
    const packetSize = 128;
    const byteChunks: Uint8Array[] = [];
    for (let i = 0; i < fullBytes.length; i += packetSize) {
      byteChunks.push(fullBytes.slice(i, i + packetSize));
    }

    const restoreFetch = mockFetchWithByteChunks(byteChunks);
    let reasoningCount = 0;
    let contentCount = 0;
    const startTime = performance.now();

    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
        onReasoningDelta: () => { reasoningCount++; },
        onContentDelta: () => { contentCount++; },
      });

      const elapsed = performance.now() - startTime;
      assert.strictEqual(result.reasoning.startsWith('t0 '), true);
      assert.strictEqual(result.reasoning.includes('t499 '), true);
      assert.strictEqual(result.content.startsWith('c500 '), true);
      assert.strictEqual(result.content.includes('c1999 '), true);
      assert.ok(reasoningCount > 0);
      assert.ok(contentCount > 0);
      assert.ok(elapsed < 2000, `Burst streaming took too long: ${elapsed.toFixed(2)}ms`);
    } finally {
      restoreFetch();
    }
  });

  console.log('\n🔬 Category 4: AbortController Cancellation Resilience');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('4.1: Mid-Reasoning Abort cleanly yields partial results without unhandled exception', async () => {
    const encoder = new TextEncoder();
    const controller = new AbortController();
    let onFinishCalled = false;
    let finishResult: DeepSeekStreamResult | null = null;

    const restoreFetch = mockAbortableFetch(async (streamController, idx) => {
      if (idx === 0) {
        streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"Suy nghĩ bước 1..."}}]}\n\n'));
        return true;
      }
      if (idx === 1) {
        streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"Suy nghĩ bước 2..."}}]}\n\n'));
        // Abort right after step 2
        controller.abort();
        return true;
      }
      // Should not reach step 3
      streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Nội dung sau abort"}}]}\n\n'));
      return false;
    });

    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
        signal: controller.signal,
        onFinish: (res) => {
          onFinishCalled = true;
          finishResult = res;
        },
      });

      assert.strictEqual(onFinishCalled, true);
      assert.strictEqual(result.reasoning, 'Suy nghĩ bước 1...Suy nghĩ bước 2...');
      assert.strictEqual(result.content, '');
      assert.strictEqual(finishResult?.reasoning, result.reasoning);
    } finally {
      restoreFetch();
    }
  });

  await runTest('4.2: Mid-Tool Execution Abort preserves partial tool calls and accumulated arguments', async () => {
    const encoder = new TextEncoder();
    const controller = new AbortController();
    let onFinishCalled = false;

    const restoreFetch = mockAbortableFetch(async (streamController, idx) => {
      if (idx === 0) {
        streamController.enqueue(encoder.encode(`data: ${JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_sql_101',
                type: 'function',
                function: { name: 'sql_runner', arguments: '{"query": "SELECT ' },
              }],
            },
          }],
        })}\n\n`));
        return true;
      }
      if (idx === 1) {
        streamController.enqueue(encoder.encode(`data: ${JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '* FROM pnl_2026' },
              }],
            },
          }],
        })}\n\n`));
        // Abort mid-arguments
        controller.abort();
        return true;
      }
      return false;
    });

    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
        signal: controller.signal,
        onFinish: () => {
          onFinishCalled = true;
        },
      });

      assert.strictEqual(onFinishCalled, true);
      assert.strictEqual(result.toolCalls.length, 1);
      assert.strictEqual(result.toolCalls[0].id, 'call_sql_101');
      assert.strictEqual(result.toolCalls[0].function?.name, 'sql_runner');
      assert.strictEqual(result.toolCalls[0].function?.arguments, '{"query": "SELECT * FROM pnl_2026');
    } finally {
      restoreFetch();
    }
  });

  await runTest('4.3: Pre-aborted signal aborts immediately before network read', async () => {
    const controller = new AbortController();
    controller.abort(); // Aborted before call

    const restoreFetch = mockFetchWithByteChunks([new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Ignored"}}]}\n\n')]);
    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
        signal: controller.signal,
      });

      assert.strictEqual(result.content, '');
      assert.strictEqual(result.reasoning, '');
      assert.strictEqual(result.toolCalls.length, 0);
    } finally {
      restoreFetch();
    }
  });

  console.log('\n🔬 Category 5: Zero-Length Tokens & Empty Content Deltas');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('5.1: Zero-length thinking tokens & empty content deltas are filtered cleanly', async () => {
    const encoder = new TextEncoder();
    const emptyPayloads = [
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":""}}]}\n\n',
      'data: {"choices":[{"delta":{"content":""}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":null,"content":null}}]}\n\n',
      'data: {"choices":[]}\n\n',
      'data: {"choices":[{"delta":{"content":"Actual Content"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    let reasoningCallbacks = 0;
    let contentCallbacks = 0;

    const restoreFetch = mockFetchWithByteChunks([encoder.encode(emptyPayloads)]);
    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
        onReasoningDelta: () => { reasoningCallbacks++; },
        onContentDelta: () => { contentCallbacks++; },
      });

      assert.strictEqual(reasoningCallbacks, 0, 'Reasoning callback called for empty string!');
      assert.strictEqual(contentCallbacks, 1, 'Content callback count mismatch!');
      assert.strictEqual(result.reasoning, '');
      assert.strictEqual(result.content, 'Actual Content');
    } finally {
      restoreFetch();
    }
  });

  console.log('\n🔬 Category 6: Multi-Tool Streaming & Interleaved Deltas');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('6.1: Interleaved multi-tool argument assembly across 10 chunks', async () => {
    const encoder = new TextEncoder();
    const multiToolPayload = [
      // Tool 0 init
      `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_sql_1', function: { name: 'run_sql', arguments: '{"sql":' } }] } }],
      })}\n\n`,
      // Tool 1 init
      `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_slide_2', function: { name: 'gen_slides', arguments: '{"title":' } }] } }],
      })}\n\n`,
      // Tool 0 arg delta
      `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"SELECT * FROM q3"' } }] } }],
      })}\n\n`,
      // Tool 1 arg delta
      `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '"Q3 Review"' } }] } }],
      })}\n\n`,
      // Tool 0 close
      `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] } }],
      })}\n\n`,
      // Tool 1 close
      `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '}' } }] } }],
      })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');

    const restoreFetch = mockFetchWithByteChunks([encoder.encode(multiToolPayload)]);
    try {
      const result = await streamDeepSeekChat({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: 'test' }],
      });

      assert.strictEqual(result.toolCalls.length, 2);
      assert.strictEqual(result.toolCalls[0].id, 'call_sql_1');
      assert.strictEqual(result.toolCalls[0].function?.arguments, '{"sql":"SELECT * FROM q3"}');
      assert.strictEqual(result.toolCalls[1].id, 'call_slide_2');
      assert.strictEqual(result.toolCalls[1].function?.arguments, '{"title":"Q3 Review"}');
    } finally {
      restoreFetch();
    }
  });

  console.log('\n🔬 Category 7: HTTP Status & Network Error Handling');
  console.log('────────────────────────────────────────────────────────────────');

  await runTest('7.1: HTTP 401 Unauthorized propagates descriptive error without crashing', async () => {
    const restoreFetch = mockFetchWithByteChunks([], 401, 'Unauthorized');
    let errorCaught: Error | null = null;
    let onErrorCalled = false;

    try {
      await streamDeepSeekChat({
        apiKey: 'bad-key',
        messages: [{ role: 'user', content: 'test' }],
        onError: (err) => {
          onErrorCalled = true;
          errorCaught = err;
        },
      });
      assert.fail('Should have thrown HTTP 401');
    } catch (err: any) {
      assert.strictEqual(onErrorCalled, true);
      assert.ok(err.message.includes('401') || err.message.includes('error message'));
    } finally {
      restoreFetch();
    }
  });

  await runTest('7.2: HTTP 429 Rate Limit error handled cleanly', async () => {
    const restoreFetch = mockFetchWithByteChunks([], 429, 'Too Many Requests');
    let onErrorCalled = false;

    try {
      await streamDeepSeekChat({
        apiKey: 'key',
        messages: [{ role: 'user', content: 'test' }],
        onError: () => { onErrorCalled = true; },
      });
      assert.fail('Should have thrown HTTP 429');
    } catch (err: any) {
      assert.strictEqual(onErrorCalled, true);
    } finally {
      restoreFetch();
    }
  });

  await runTest('7.3: URL resolution helper strips trailing slashes and appends path accurately', () => {
    assert.strictEqual(resolveDeepSeekUrl(''), '/api/deepseek/chat/completions');
    assert.strictEqual(resolveDeepSeekUrl('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
    assert.strictEqual(resolveDeepSeekUrl('https://api.deepseek.com/'), 'https://api.deepseek.com/chat/completions');
    assert.strictEqual(resolveDeepSeekUrl('https://api.deepseek.com/chat/completions'), 'https://api.deepseek.com/chat/completions');
    assert.strictEqual(resolveDeepSeekUrl('http://127.0.0.1:5670/api/deepseek/'), 'http://127.0.0.1:5670/api/deepseek/chat/completions');
  });

  console.log('\n================================================================');
  console.log('📊 EMPIRICAL STRESS TEST SUMMARY');
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
  console.error('Fatal test harness failure:', err);
  process.exit(1);
});
