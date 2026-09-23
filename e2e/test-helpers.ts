import { Page, expect } from '@playwright/test';

/**
 * DB-GPT E2E Test Helpers & Fixtures
 */

export const MOCK_MODELS = [
  'chatgpt_proxyllm',
  'deepseek-r1',
  'qwen2.5-72b-instruct',
  'dbgpt-custom-v1',
];

export const MOCK_REPLAY_SESSIONS = {
  items: [
    {
      id: 'replay_strategy_deck_169',
      title: 'Chiến Lược Chuyển Đổi Số & Tự Động Hóa Doanh Nghiệp 2026-2028',
      prompt: 'Tạo một bài thuyết trình chuyên nghiệp 16:9 với 6 slide phân tích dữ liệu tổng quan.',
      status: 'completed',
      step_count: 6,
      current_step: 6,
      created_at: '2026-08-20T10:00:00Z',
      updated_at: '2026-08-20T10:05:00Z',
      duration_seconds: 42.5,
      model_name: 'deepseek-r1',
      tags: ['Slides', 'Executive', '16:9', 'Strategy'],
      artifact_kind: 'slide',
      summary: 'Hoàn thành tạo 6 slide thuyết trình chiến lược cấp HĐQT với biểu đồ KPI và bảng phân tích năng lực.',
    },
    {
      id: 'replay_financial_pnl_xlsx',
      title: 'Mô Hình Tài Chính & Dòng Tiền Đa Kênh 2026',
      prompt: 'Xây dựng mô hình tài chính PnL và lưu chuyển tiền tệ đa kênh với công thức tự động.',
      status: 'completed',
      step_count: 5,
      current_step: 5,
      created_at: '2026-08-21T09:15:00Z',
      updated_at: '2026-08-21T09:20:00Z',
      duration_seconds: 38.2,
      model_name: 'chatgpt_proxyllm',
      tags: ['Excel', 'Finance', 'PnL', 'Multi-Tab'],
      artifact_kind: 'sheet',
      summary: 'Tạo bảng tính Excel 3 sheets: PnL Tổng Hợp, Doanh Thu Kênh, Dòng Tiền Tự Do với biểu đồ tăng trưởng.',
    },
    {
      id: 'replay_ai_architecture_docx',
      title: 'Báo Cáo Kiến Trúc Hệ Thống AI & Multi-Agent Swarm',
      prompt: 'Viết tài liệu kiến trúc kỹ thuật hệ thống DB-GPT Multi-Agent định dạng A4 DOCX.',
      status: 'completed',
      step_count: 7,
      current_step: 7,
      created_at: '2026-08-22T14:30:00Z',
      updated_at: '2026-08-22T14:38:00Z',
      duration_seconds: 55.1,
      model_name: 'deepseek-r1',
      tags: ['Docx', 'Architecture', 'A4', 'Technical'],
      artifact_kind: 'doc',
      summary: 'Báo cáo kỹ thuật chi tiết cấu trúc microservices, pipeline AWEL, và mô hình bảo mật guardrails.',
    },
  ],
  total: 3,
  page: 1,
  page_size: 20,
};

export const MOCK_REPLAY_DETAIL = {
  code: 0,
  message: 'success',
  data: {
    ...MOCK_REPLAY_SESSIONS.items[0],
    steps: [
      {
        step_id: 'step-1',
        session_id: 'replay_strategy_deck_169',
        step_index: 0,
        title: 'Khởi tạo cấu trúc Slide Outline',
        action_type: 'plan',
        status: 'completed',
        created_at: '2026-08-20T10:00:05Z',
        duration_ms: 1200,
        thought: 'Phân tích yêu cầu bài thuyết trình chiến lược và xây dựng khung 6 slide.',
        tool_call: { tool_name: 'deck_planner', input_params: { topic: 'Digital Transformation' } },
        tool_result: { success: true, outline: ['Hero', 'KPIs', 'Pillars', 'Architecture', 'Roadmap', 'Closing'] },
      },
      {
        step_id: 'step-2',
        session_id: 'replay_strategy_deck_169',
        step_index: 1,
        title: 'Tạo Slide 1: Hero & Strategic Vision',
        action_type: 'artifact_edit',
        status: 'completed',
        created_at: '2026-08-20T10:00:15Z',
        duration_ms: 2400,
        thought: 'Thiết kế slide mở đầu với tiêu đề và thống kê tác động chính +3.4x ROI.',
        tool_call: { tool_name: 'slide_renderer', input_params: { layout: 'hero' } },
        tool_result: { success: true, slide_index: 0 },
      },
    ],
  },
};

/**
 * Setup console error listening for strict zero-console-error assertions.
 */
export function setupConsoleErrorListener(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      // Filter out React DEV warnings and known benign noises
      if (
        !text.startsWith('Warning: ') &&
        !text.includes('Warning: Function components cannot be given refs') &&
        !text.includes('favicon.ico') &&
        !text.includes('ResizeObserver loop limit exceeded') &&
        !text.includes('Failed to load resource:') &&
        !text.includes('createRoot()') &&
        !text.includes('Outdated Optimize Dep') &&
        !text.includes('AbortError') &&
        !text.includes('The user aborted a request') &&
        !text.includes('signal is aborted') &&
        !text.includes('Failed to fetch') &&
        !text.includes('[ConversationAPI] Network/Fetch Error') &&
        !text.includes('Failed to save user message') &&
        !text.includes('Failed to save assistant message')
      ) {
        errors.push(`[Console Error] ${text}`);
      }
    } else if (msg.type() === 'warning') {
      warnings.push(`[Console Warning] ${text}`);
    }
  });

  page.on('pageerror', (exception) => {
    errors.push(`[Page Error] ${exception.message}\n${exception.stack || ''}`);
  });

  return {
    errors,
    warnings,
    assertNoErrors: () => {
      expect(errors, `Expected 0 console/page errors, but got:\n${errors.join('\n')}`).toEqual([]);
    },
  };
}

/**
 * Pre-seed localStorage with authentication and default settings.
 */
export async function ensureUserLoggedIn(page: Page, options: { theme?: 'light' | 'dark' } = {}) {
  await page.addInitScript(({ theme }) => {
    const user = {
      user_channel: 'dbgpt',
      user_no: '001',
      nick_name: 'dbgpt',
    };
    localStorage.setItem('__db_gpt_uinfo_key', JSON.stringify(user));
    localStorage.setItem('__db_gpt_uinfo_vt_key', (Date.now() + 86400000).toString());
    localStorage.setItem('__db_gpt_theme_key', theme || 'light');
    localStorage.setItem('dbgpt_theme_mode', theme || 'light');
    localStorage.setItem('__db_gpt_lng_key', 'vi');
  }, options);
}

export async function setupApiInterception(page: Page) {
  // Model endpoints
  await page.route('**/api/v1/model/types', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: MOCK_MODELS,
      }),
    });
  });

  await page.route('**/api/v1/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: MOCK_MODELS.map((m) => ({ model_name: `${m}@llm`, host: '127.0.0.1', port: 8000, healthy: true })),
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
        data: MOCK_MODELS.map((m) => ({ model: m, host: '127.0.0.1', port: 8000, healthy: true })),
      }),
    });
  });

  // Dialogue / Chat List
  await page.route('**/api/v1/chat/dialogue/list', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            conv_uid: 'conv-sample-001',
            user_name: 'dbgpt',
            chat_mode: 'chat_normal',
            select_param: '',
            model_name: 'deepseek-r1',
            summary: 'Hội thảo kiến trúc DB-GPT 2026',
          },
        ],
      }),
    });
  });

  // Dialogue History
  await page.route('**/api/v1/chat/dialogue/messages/history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        err_code: null,
        err_msg: null,
        data: [
          {
            role: 'human',
            context: 'Phân tích dữ liệu doanh thu Q3 và đề xuất chiến lược tối ưu.',
            order: 1,
            time_stamp: null,
            model_name: 'deepseek-r1',
            feedback: {},
          },
          {
            role: 'view',
            context: 'Báo cáo phân tích doanh thu Q3 đã hoàn tất với kết quả tăng trưởng 24.8%.',
            order: 2,
            time_stamp: null,
            model_name: 'deepseek-r1',
            feedback: {},
          },
        ],
      }),
    });
  });

  // Dialogue New
  await page.route('**/api/v1/chat/dialogue/new*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          conv_uid: 'conv-sample-001',
        },
      }),
    });
  });

  // Chat mode params
  await page.route('**/api/v1/chat/mode/params/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [],
      }),
    });
  });

  // App info
  await page.route('**/api/v1/app/info*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          app_code: 'chat_normal',
          app_name: 'Chat Normal',
          param_need: [],
        },
      }),
    });
  });

  // User info
  await page.route('**/api/v1/user/info*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          user_channel: 'dbgpt',
          user_no: '001',
          nick_name: 'dbgpt',
        },
      }),
    });
  });

  // Replay endpoints
  await page.route('**/api/v1/replay/sessions*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_REPLAY_SESSIONS),
    });
  });

  await page.route('**/api/v1/replay/session/replay_strategy_deck_169', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_REPLAY_DETAIL),
    });
  });

  await page.route('**/api/v1/replay/session/*/stream*', async (route) => {
    const sseBody = [
      'event: session_start\ndata: {"session_id":"replay_strategy_deck_169","total_steps":2}\n\n',
      'event: step_progress\ndata: {"step_index":0,"title":"Khởi tạo cấu trúc Slide Outline","status":"completed"}\n\n',
      'event: step_progress\ndata: {"step_index":1,"title":"Tạo Slide 1: Hero & Strategic Vision","status":"completed"}\n\n',
      'event: session_end\ndata: {"session_id":"replay_strategy_deck_169","status":"completed"}\n\n',
    ].join('');

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body: sseBody,
    });
  });

  // Analyst Conversations API
  await page.route(/\/api\/v1\/analyst\/conversations/, async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());

    if (url.pathname.includes('/messages')) {
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: [] }),
        });
        return;
      }
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, id: 'msg-' + Date.now() }),
        });
        return;
      }
    }

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
      return;
    }

    if (method === 'POST') {
      const body = req.postDataJSON() || {};
      const newId = body.id || 'conv-' + Date.now();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, conversation_id: newId, id: newId }),
      });
      return;
    }


    await route.continue();
  });
}

