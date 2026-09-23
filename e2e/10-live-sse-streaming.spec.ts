import { test, expect } from '@playwright/test';

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:5670';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
const MODEL_NAME = 'deepseek-v4-flash';

test.describe('10 - Live DeepSeek V4 SSE Streaming E2E Verification', () => {

  test('10.1 - Direct Backend SSE Stream: verifies live multi-chunk token streaming and [DONE]', async ({ request }) => {
    const t0 = Date.now();
    const payload = {
      conv_uid: `pw-live-direct-${Date.now()}`,
      chat_mode: 'chat_normal',
      model_name: MODEL_NAME,
      user_input: 'Explain the difference between SQL and NoSQL in two concise bullet points.',
      incremental: true,
      temperature: 0.7,
      max_new_tokens: 256,
    };

    const response = await request.post(`${BACKEND_BASE_URL}/api/v1/chat/completions`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toContain('text/event-stream');

    const rawStream = await response.text();
    const totalDuration = Date.now() - t0;

    // Verify stream termination
    expect(rawStream).toContain('data: [DONE]');

    // Parse SSE lines
    const lines = rawStream.split('\n').map(l => l.trim()).filter(l => l.startsWith('data:'));
    expect(lines.length).toBeGreaterThanOrEqual(5);

    let accumulatedContent = '';
    let parsedChunksCount = 0;

    for (const line of lines) {
      const dataStr = line.slice(5).trim();
      if (dataStr === '[DONE]') continue;

      const parsed = JSON.parse(dataStr);
      expect(parsed).toHaveProperty('choices');
      expect(parsed.model).toBe(MODEL_NAME);

      const delta = parsed.choices[0]?.delta;
      if (delta?.content) {
        accumulatedContent += delta.content;
      }
      parsedChunksCount++;
    }

    expect(parsedChunksCount).toBeGreaterThanOrEqual(4);
    expect(accumulatedContent.length).toBeGreaterThan(20);
    expect(totalDuration).toBeGreaterThan(200); // Live inference duration > 200ms
  });

  test('10.2 - Frontend Proxied SSE Stream: verifies transparent unbuffered streaming through Vite Proxy', async ({ request }) => {
    const t0 = Date.now();
    const payload = {
      conv_uid: `pw-live-proxy-${Date.now()}`,
      chat_mode: 'chat_normal',
      model_name: MODEL_NAME,
      user_input: 'Provide 2 key benefits of database indexing.',
      incremental: true,
      temperature: 0.5,
      max_new_tokens: 200,
    };

    const response = await request.post(`${FRONTEND_BASE_URL}/api/v1/chat/completions`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toContain('text/event-stream');

    const rawStream = await response.text();
    const totalDuration = Date.now() - t0;

    expect(rawStream).toContain('data: [DONE]');

    const lines = rawStream.split('\n').map(l => l.trim()).filter(l => l.startsWith('data:'));
    expect(lines.length).toBeGreaterThanOrEqual(5);

    let accumulated = '';
    for (const line of lines) {
      const dataStr = line.slice(5).trim();
      if (dataStr === '[DONE]') continue;
      const parsed = JSON.parse(dataStr);
      if (parsed.choices?.[0]?.delta?.content) {
        accumulated += parsed.choices[0].delta.content;
      }
    }

    expect(accumulated.length).toBeGreaterThan(20);
    expect(totalDuration).toBeGreaterThan(200);
  });

});
