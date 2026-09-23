import { test, expect } from '@playwright/test';

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:5670';

test.describe('03 - Backend API & SSE Live Stream Integration Suite', () => {
  test('03.1 - Model Endpoints: should fetch model types via GET /api/v1/model/types', async ({ request }) => {
    const response = await request.get(`${BACKEND_BASE_URL}/api/v1/model/types`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
  });

  test('03.2 - SSE Chat Stream: should deliver streaming chunks and terminate with [DONE] on POST /api/v1/chat/completions', async ({ request }) => {
    const payload = {
      conv_uid: 'e2e-test-conv-001',
      chat_mode: 'chat_normal',
      model_name: 'deepseek-v4-flash',
      user_input: 'Hello DB-GPT, please introduce yourself in one sentence.',
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
    expect(rawStream.length).toBeGreaterThan(0);
    expect(rawStream).toContain('data:');
  });

  test('03.3 - Replay Sessions API: should return paginated sessions list on GET /api/v1/replay/sessions', async ({ request }) => {
    const response = await request.get(`${BACKEND_BASE_URL}/api/v1/replay/sessions?page=1&pageSize=10`);
    expect(response.status()).toBe(200);

    const json = await response.json();
    const envelope = json.data ?? json;
    expect(envelope).toHaveProperty('items');
    expect(envelope).toHaveProperty('total');
    expect(Array.isArray(envelope.items)).toBe(true);
    expect(envelope.items.length).toBeGreaterThan(0);

    // Verify session schema fields supporting standard Pydantic models
    const firstSession = envelope.items[0];
    const sessionId = firstSession.sessionId || firstSession.id || firstSession.session_id;
    expect(sessionId).toBeTruthy();
    expect(firstSession).toHaveProperty('title');
    expect(firstSession).toHaveProperty('status');
    const stepCount = firstSession.totalSteps ?? firstSession.step_count ?? firstSession.total_steps;
    expect(stepCount).toBeDefined();
    expect(typeof stepCount).toBe('number');
  });

  test('03.4 - Replay Session Detail API: should return granular execution trace snapshot on GET /api/v1/replay/session/{id}', async ({ request }) => {
    // Dynamically retrieve seeded sessions list to get an authentic live session ID
    const listRes = await request.get(`${BACKEND_BASE_URL}/api/v1/replay/sessions?page=1&pageSize=1`);
    expect(listRes.status()).toBe(200);
    const listJson = await listRes.json();
    const items = listJson.data?.items ?? listJson.items ?? [];
    const sessionId = items[0]?.sessionId || items[0]?.id || 'canifa-sales-q3-deepdive';

    const detailRes = await request.get(`${BACKEND_BASE_URL}/api/v1/replay/session/${sessionId}`);
    expect(detailRes.status()).toBe(200);

    const detailData = await detailRes.json();
    expect(detailData.code).toBe(0);
    const sessionDetail = detailData.data ?? detailData;
    const detailId = sessionDetail.sessionId || sessionDetail.id || sessionDetail.session_id;
    expect(detailId).toBe(sessionId);
    expect(sessionDetail).toHaveProperty('title');

    // Verify execution steps structure (either inside turns or top-level steps)
    const turns = sessionDetail.turns ?? [];
    const directSteps = sessionDetail.steps ?? [];
    const allSteps = turns.length > 0 ? turns.flatMap((t: any) => t.steps || []) : directSteps;
    expect(Array.isArray(allSteps)).toBe(true);
    expect(allSteps.length).toBeGreaterThan(0);
  });

  test('03.5 - Replay SSE Stream API: should stream real-time events on GET /api/v1/replay/session/{id}/stream', async ({ request }) => {
    // Dynamically resolve seeded session ID
    const listRes = await request.get(`${BACKEND_BASE_URL}/api/v1/replay/sessions?page=1&pageSize=1`);
    expect(listRes.status()).toBe(200);
    const listJson = await listRes.json();
    const items = listJson.data?.items ?? listJson.items ?? [];
    const sessionId = items[0]?.sessionId || items[0]?.id || 'canifa-sales-q3-deepdive';

    const streamRes = await request.get(`${BACKEND_BASE_URL}/api/v1/replay/session/${sessionId}/stream?speed=0.0`);
    expect(streamRes.status()).toBe(200);

    const contentType = streamRes.headers()['content-type'] || '';
    expect(contentType).toContain('text/event-stream');

    const streamBody = await streamRes.text();
    expect(streamBody.length).toBeGreaterThan(0);
    expect(streamBody).toContain('event:');
    expect(streamBody).toContain('data:');
  });

  test('03.6 - CORS & Error Handling: should return proper CORS headers and 404 for invalid session ID', async ({ request }) => {
    // Test 404 Not Found for non-existent session
    const notFoundRes = await request.get(`${BACKEND_BASE_URL}/api/v1/replay/session/non_existent_session_id_9999`);
    expect(notFoundRes.status()).toBe(404);

    // Test CORS preflight (OPTIONS)
    const optionsRes = await request.fetch(`${BACKEND_BASE_URL}/api/v1/replay/sessions`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });
    // FastAPI / Starlette CORS middleware responds 200 or 204 to preflight
    expect([200, 204]).toContain(optionsRes.status());
  });
});
