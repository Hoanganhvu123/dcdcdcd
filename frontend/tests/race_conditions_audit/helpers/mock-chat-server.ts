import { Page, Route } from '@playwright/test';

/**
 * In-Memory Conversation and Message State Store for Race Condition Audit
 */
export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  order?: number;
}

export interface StoredConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: StoredMessage[];
}

export class MockChatStore {
  private static instance: MockChatStore;
  public conversations: Map<string, StoredConversation> = new Map();
  public completionRequests: Array<{
    timestamp: number;
    conversationId?: string;
    model?: string;
    userPrompt: string;
    headers: Record<string, string>;
  }> = [];

  public static getInstance(): MockChatStore {
    if (!MockChatStore.instance) {
      MockChatStore.instance = new MockChatStore();
    }
    return MockChatStore.instance;
  }

  public reset(): void {
    this.conversations.clear();
    this.completionRequests = [];
  }

  public getOrCreateConversation(id: string, initialTitle = 'Cuộc hội thoại phân tích'): StoredConversation {
    if (!this.conversations.has(id)) {
      this.conversations.set(id, {
        id,
        title: initialTitle,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
      });
    }
    return this.conversations.get(id)!;
  }

  public addMessage(conversationId: string, message: { role: 'user' | 'assistant' | 'system'; content: string }): StoredMessage {
    const conv = this.getOrCreateConversation(conversationId);
    const newMsg: StoredMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: message.role,
      content: message.content,
      created_at: new Date().toISOString(),
      order: conv.messages.length + 1,
    };
    conv.messages.push(newMsg);
    conv.updated_at = new Date().toISOString();
    return newMsg;
  }

  public getMessages(conversationId: string): StoredMessage[] {
    return this.conversations.get(conversationId)?.messages || [];
  }
}

export const globalChatStore = MockChatStore.getInstance();

export interface MockServerOptions {
  chunkDelayMs?: number;
  customAnswerGenerator?: (prompt: string, index: number) => string;
  interleavedDelayMap?: Record<string, number>;
  onStreamRequest?: (payload: any) => void;
}

export const MOCK_MODELS_LIST = [
  'deepseek-v4-flash',
  'chatgpt_proxyllm',
  'qwen2.5-72b-instruct',
];

/**
 * Configure high-fidelity route handlers on a Playwright Page instance
 */
export async function setupMockChatServer(page: Page, options: MockServerOptions = {}): Promise<void> {
  const {
    chunkDelayMs = 20,
    customAnswerGenerator,
    onStreamRequest,
  } = options;

  // 1. Models & Types
  await page.route('**/api/v1/model/types', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_MODELS_LIST }),
    });
  });

  await page.route('**/api/v1/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: MOCK_MODELS_LIST.map((m) => ({
          model_name: `${m}@llm`,
          host: '127.0.0.1',
          port: 8000,
          healthy: true,
        })),
      }),
    });
  });

  await page.route('**/api/v2/serve/model/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: MOCK_MODELS_LIST.map((m) => ({ model: m, host: '127.0.0.1', port: 8000, healthy: true })),
      }),
    });
  });

  // 2. User & App Info
  await page.route('**/api/v1/user/info*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { user_channel: 'dbgpt', user_no: '001', nick_name: 'Hoàng Anh' },
      }),
    });
  });

  await page.route('**/api/v1/app/info*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { app_code: 'chat_normal', app_name: 'Chat Normal', param_need: [] },
      }),
    });
  });

  await page.route('**/api/v1/chat/mode/params/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  // 3. Dialogue endpoints (DB-GPT legacy & native)
  await page.route('**/api/v1/chat/dialogue/list', async (route) => {
    const list = Array.from(globalChatStore.conversations.values()).map((c) => ({
      conv_uid: c.id,
      user_name: 'dbgpt',
      chat_mode: 'chat_normal',
      select_param: '',
      model_name: 'deepseek-v4-flash',
      summary: c.title,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: list }),
    });
  });

  await page.route('**/api/v1/chat/dialogue/new*', async (route) => {
    const newId = `018d45e6-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    globalChatStore.getOrCreateConversation(newId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { conv_uid: newId } }),
    });
  });

  await page.route('**/api/v1/chat/dialogue/messages/history*', async (route) => {
    const url = new URL(route.request().url());
    const convId = url.searchParams.get('con_uid') || url.searchParams.get('conversationId') || '';
    const messages = globalChatStore.getMessages(convId);
    const converted = messages.map((m, idx) => ({
      role: m.role === 'user' ? 'human' : 'view',
      context: m.content,
      order: idx + 1,
      time_stamp: m.created_at,
      model_name: 'deepseek-v4-flash',
      feedback: {},
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        err_code: null,
        err_msg: null,
        data: converted,
      }),
    });
  });

  // 4. Analyst Conversations API (/api/v1/analyst/conversations)
  await page.route(/\/api\/v1\/analyst\/conversations/, async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());

    // Matches /api/v1/analyst/conversations/:id/messages
    if (url.pathname.includes('/messages')) {
      const parts = url.pathname.split('/');
      const convIndex = parts.indexOf('conversations');
      const convId = convIndex >= 0 && parts[convIndex + 1] ? decodeURIComponent(parts[convIndex + 1]) : '';

      if (method === 'GET') {
        const msgs = globalChatStore.getMessages(convId);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: msgs }),
        });
        return;
      }

      if (method === 'POST') {
        const payload = req.postDataJSON() || {};
        const saved = globalChatStore.addMessage(convId, {
          role: payload.role || 'user',
          content: payload.content || '',
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, id: saved.id, message: saved }),
        });
        return;
      }
    }

    if (method === 'GET') {
      const list = Array.from(globalChatStore.conversations.values()).map((c) => ({
        id: c.id,
        title: c.title,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: list }),
      });
      return;
    }

    if (method === 'POST') {
      const body = req.postDataJSON() || {};
      const newId = body.id || `018d45e6-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const title = body.title || 'Hội thoại phân tích dữ liệu';
      globalChatStore.getOrCreateConversation(newId, title);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, conversation_id: newId, id: newId, title }),
      });
      return;
    }

    await route.continue();
  });

  // 5. SSE Chat Completions Endpoint (/chat/completions or /api/agent-wrap/v1/chat/completions or /api/v1/chat/completions)
  await page.route(/.*\/chat\/completions/, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') {
      await route.continue();
      return;
    }

    const payload = req.postDataJSON() || {};
    onStreamRequest?.(payload);

    // Extract user prompt & conversation context
    const messages = payload.messages || [];
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    const userPrompt = lastUserMsg?.content || payload.user_input || payload.prompt || 'Yêu cầu phân tích';
    const convId = payload.conv_uid || payload.conversationId || 'default-session';

    globalChatStore.completionRequests.push({
      timestamp: Date.now(),
      conversationId: convId,
      model: payload.model,
      userPrompt,
      headers: req.headers(),
    });

    // Generate responsive answer text
    const defaultAnswer = customAnswerGenerator
      ? customAnswerGenerator(userPrompt, globalChatStore.completionRequests.length)
      : `Phân tích hoàn tất cho yêu cầu: "${userPrompt.length > 40 ? userPrompt.slice(0, 40) + '...' : userPrompt}". Dữ liệu đã được đối chiếu thành công qua 14 bảng SQL và xuất biểu đồ trực quan.`;

    // Save user message to store if not already saved
    globalChatStore.addMessage(convId, { role: 'user', content: userPrompt });

    // Stream SSE chunks
    const streamId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const words = defaultAnswer.split(' ');
    const sseChunks: string[] = [];

    // Optional reasoning chunk
    const reasoningChunk = JSON.stringify({
      id: streamId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: payload.model || 'deepseek-v4-flash',
      choices: [
        {
          index: 0,
          delta: { reasoning_content: `Đang phân tích cấu trúc truy vấn cho: ${userPrompt.slice(0, 20)}...\n` },
          finish_reason: null,
        },
      ],
    });
    sseChunks.push(`data: ${reasoningChunk}\n\n`);

    // Delta chunks of 3 words each
    for (let i = 0; i < words.length; i += 3) {
      const slice = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
      const chunkJson = JSON.stringify({
        id: streamId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: payload.model || 'deepseek-v4-flash',
        choices: [
          {
            index: 0,
            delta: { content: slice },
            finish_reason: null,
          },
        ],
      });
      sseChunks.push(`data: ${chunkJson}\n\n`);
    }

    // Final finish reason chunk and [DONE] marker
    const stopChunk = JSON.stringify({
      id: streamId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: payload.model || 'deepseek-v4-flash',
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
    });
    sseChunks.push(`data: ${stopChunk}\n\n`);
    sseChunks.push('data: [DONE]\n\n');

    // Save assistant message to store
    globalChatStore.addMessage(convId, { role: 'assistant', content: defaultAnswer });

    // Calculate realistic network latency / staggered delay
    let networkDelayMs = options.chunkDelayMs !== undefined ? options.chunkDelayMs : 20;

    if (options.interleavedDelayMap) {
      for (const [key, delay] of Object.entries(options.interleavedDelayMap)) {
        if (userPrompt.toLowerCase().includes(key.toLowerCase())) {
          networkDelayMs = delay;
          break;
        }
      }
    } else if (userPrompt.toLowerCase().includes('slow')) {
      networkDelayMs = Math.max(networkDelayMs * 6, 200);
    } else if (userPrompt.toLowerCase().includes('fast')) {
      networkDelayMs = Math.min(networkDelayMs, 20);
    }

    if (networkDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, networkDelayMs));
    }

    // Fulfill response with complete SSE stream body
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
      body: sseChunks.join(''),
    });
  });
}
