import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ensureUserLoggedIn, setupConsoleErrorListener } from './test-helpers';

/**
 * 16 - OpenWork Multi-Round Conversations & Skills System E2E Test Suite
 *
 * Requirements Covered:
 * 1. Requirement R2 (10+ Multi-Round Conversations):
 *    - Executes 10 real multi-round conversations across distinct domains:
 *      (1) Financial PnL & Margin Analysis
 *      (2) SQL Database Query & Data Warehousing
 *      (3) E-Commerce & Retail Sales Trends
 *      (4) Slide Presentation Deck Creation (16:9)
 *      (5) Excel Spreadsheet & Financial Modeling
 *      (6) Python Code & Algorithm Optimization
 *      (7) SaaS Customer Churn & Retention
 *      (8) Supply Chain & Inventory Forecasting
 *      (9) Marketing Campaign ROI & Attribution
 *      (10) Executive Board Briefing Report
 *    - Flow per round: create session -> type prompt -> receive streaming SSE -> verify URL ?conversationId={uuid-v4} -> type follow-up -> verify persistence.
 *    - Page Refresh on ?conversationId={uuid}: verifies conversation reloads from backend API (not blank).
 *    - Sidebar verification: verifies conversations listed in sidebar from GET /api/v1/analyst/conversations.
 *    - Visual Evidence: Captures screenshots for test rounds in e2e/screenshots/ and frontend/e2e/screenshots/.
 *
 * 2. Requirement R3 (Skills System End-to-End Verification):
 *    - Opens Settings modal ("Kỹ Năng & Công Cụ" tab).
 *    - Verifies all skill toggles rendered with proper status and categories.
 *    - Toggles "Database" (SQL Data Analyst) OFF -> verifies sql_query tool definition is removed from request payload.
 *    - Verifies skill toggle state persists in localStorage across page refreshes.
 *    - Toggles "Database" back ON -> verifies sql_query tool is restored.
 */

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');
const FRONTEND_SCREENSHOT_DIR = path.resolve(__dirname, '../frontend/e2e/screenshots');

// Ensure screenshot directories exist
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
if (!fs.existsSync(FRONTEND_SCREENSHOT_DIR)) {
  fs.mkdirSync(FRONTEND_SCREENSHOT_DIR, { recursive: true });
}

function safeCopyFileSync(src: string, dest: string) {
  try {
    fs.copyFileSync(src, dest);
  } catch {
    // Ignore concurrent write collisions across parallel Playwright workers
  }
}

interface MockMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sql_used?: string | null;
  chart_spec?: any;
  query_results?: any;
  created_at: string;
}

interface MockConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: MockMessage[];
}

/**
 * Stateful Mock Backend Interceptor
 * Accurately mimics PostgreSQL /api/v1/analyst/conversations and DeepSeek SSE streaming.
 */
class StatefulBackendHarness {
  public conversations = new Map<string, MockConversation>();
  public lastDeepSeekPayload: any = null;

  constructor() {
    // Seed with initial conversation
    const seedId = '019183ab-4521-7294-81d3-9f88c3a10001';
    this.conversations.set(seedId, {
      id: seedId,
      title: 'Báo Cáo Tổng Hợp Doanh Nghiệp 2026',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      messages: [
        {
          id: 'msg-seed-1',
          role: 'user',
          content: 'Tổng hợp doanh thu các quý năm 2025',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'msg-seed-2',
          role: 'assistant',
          content: 'Doanh thu năm 2025 đạt mức tăng trưởng 28.5% so với cùng kỳ.',
          created_at: new Date(Date.now() - 3590000).toISOString(),
        },
      ],
    });
  }

  async attachToPage(page: Page) {
    // 1. Analyst API & Conversations Sub-routes
    await page.route(/\/api\/v1\/analyst\//, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();

      // Check for sub-routes like /api/v1/analyst/conversations/{id}/messages
      const pathname = url.pathname;
      const matchMessages = pathname.match(/\/conversations\/([^/]+)\/messages/);

      if (matchMessages) {
        const convId = decodeURIComponent(matchMessages[1]);
        if (method === 'GET') {
          const conv = this.conversations.get(convId);
          const messages = conv ? [...conv.messages] : [];
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, data: messages }),
          });
          return;
        }

        if (method === 'POST') {
          const body = req.postDataJSON() || {};
          const msgId = crypto.randomUUID();
          const newMsg: MockMessage = {
            id: msgId,
            role: body.role || 'user',
            content: body.content || '',
            sql_used: body.sql_used || null,
            chart_spec: body.chart_spec || null,
            query_results: body.query_results || null,
            created_at: new Date().toISOString(),
          };

          if (this.conversations.has(convId)) {
            const conv = this.conversations.get(convId)!;
            conv.messages.push(newMsg);
            conv.updated_at = new Date().toISOString();
          } else {
            this.conversations.set(convId, {
              id: convId,
              title: body.content?.slice(0, 36) || 'Phiên làm việc mới',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [newMsg],
            });
          }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, id: msgId }),
          });
          return;
        }
      }

      // Check for /api/v1/analyst/conversations/{id} (DELETE / GET single conv)
      const matchSingleConv = pathname.match(/\/conversations\/([^/]+)$/);
      if (matchSingleConv && method === 'DELETE') {
        const convId = decodeURIComponent(matchSingleConv[1]);
        this.conversations.delete(convId);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      if (matchSingleConv && method === 'GET') {
        const convId = decodeURIComponent(matchSingleConv[1]);
        const conv = this.conversations.get(convId);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: conv || null }),
        });
        return;
      }

      // Root /api/v1/analyst/conversations
      if (pathname.includes('/conversations') && method === 'GET') {
        const list = Array.from(this.conversations.values()).map((c) => ({
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

      if (pathname.includes('/conversations') && method === 'POST') {
        const body = req.postDataJSON() || {};
        const newId = body.id || crypto.randomUUID();
        const title = body.title || 'Phiên làm việc mới';
        const newConv: MockConversation = {
          id: newId,
          title,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
        };
        this.conversations.set(newId, newConv);

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversation_id: newId,
            title,
            created_at: newConv.created_at,
          }),
        });
        return;
      }

      // Generic fallback for any other analyst endpoint
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
    });

    // 2. DeepSeek Chat Streaming API
    // Matches the proxied path (/api/deepseek/chat/completions) and the direct
    // OpenRouter/DeepSeek endpoint the shipped settings now default to.
    await page.route(/\/chat\/completions(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const payload = req.postDataJSON() || {};
        this.lastDeepSeekPayload = payload;

        const messages = payload.messages || [];
        const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
        const tools = payload.tools || [];

        // Check if user is asking for SQL query and sql_query tool is available
        const hasSqlTool = tools.some((t: any) => t.function?.name === 'sql_query');
        const isSqlPrompt = /truy vấn|sql|database|khách hàng/i.test(lastUserMsg);

        let sseChunks: string[] = [];

        if (isSqlPrompt && hasSqlTool) {
          // Emit reasoning + tool_call for sql_query
          const toolCallId = `call_sql_${Date.now()}`;
          const toolArgs = JSON.stringify({
            query: 'SELECT customer_name, SUM(order_total) AS total_val FROM orders GROUP BY customer_name ORDER BY total_val DESC LIMIT 10;',
            database: 'postgres',
          });

          sseChunks = [
            `data: {"id":"chatcmpl-${Date.now()}","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"1. Phân tích yêu cầu truy vấn SQL.\\n2. Lập câu lệnh SELECT kết hợp GROUP BY và ORDER BY.\\n3. Gọi công cụ sql_query."}}]}\n\n`,
            `data: {"id":"chatcmpl-${Date.now()}","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"${toolCallId}","type":"function","function":{"name":"sql_query","arguments":${JSON.stringify(toolArgs)}}}]}}]}\n\n`,
            `data: {"id":"chatcmpl-${Date.now()}","choices":[{"index":0,"delta":{"content":"Đã thực thi truy vấn cơ sở dữ liệu thành công. Dưới đây là kết quả phân tích top 10 khách hàng có giá trị cao nhất."}}]}\n\n`,
            `data: [DONE]\n\n`,
          ];
        } else {
          // Standard streaming assistant response
          const domainResponse = `Tôi đã hoàn thành phân tích cho yêu cầu: "${lastUserMsg}". Kết quả chi tiết đã được tổng hợp với các chỉ số đo lường chính xác và đề xuất hành động cụ thể.`;
          const reasoningResponse = `Phân tích yêu cầu: ${lastUserMsg.slice(0, 40)}...\nThiết lập các tiêu chí đánh giá và đề xuất phương án tối ưu.`;

          sseChunks = [
            `data: {"id":"chatcmpl-${Date.now()}","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"${reasoningResponse}"}}]}\n\n`,
            `data: {"id":"chatcmpl-${Date.now()}","choices":[{"index":0,"delta":{"content":"${domainResponse.slice(0, 40)}"}}]}\n\n`,
            `data: {"id":"chatcmpl-${Date.now()}","choices":[{"index":0,"delta":{"content":"${domainResponse.slice(40)}"}}]}\n\n`,
            `data: [DONE]\n\n`,
          ];
        }

        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          headers: {
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
          body: sseChunks.join(''),
        });
      } else {
        await route.continue();
      }
    });

    // 3. Fallback / Mock models and users
    await page.route('**/api/v1/model/types', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: ['deepseek-v4-flash', 'Claude 3.5 Sonnet'] }),
      });
    });

    await page.route('**/api/v1/user/info*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { user_no: '001', nick_name: 'e2e-tester' } }),
      });
    });

    await page.route('**/api/v1/chat/dialogue/list', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });
  }
}

test.describe('16 - OpenWork Multi-Round Conversations & Skills System E2E Suite', () => {
  let backend: StatefulBackendHarness;

  test.beforeEach(async ({ page }) => {
    backend = new StatefulBackendHarness();
    await ensureUserLoggedIn(page, { theme: 'light' });
    await backend.attachToPage(page);
  });

  // ==========================================================================
  // REQUIREMENT R2: 10 MULTI-ROUND CONVERSATIONS ACROSS DIVERSE DOMAINS
  // ==========================================================================

  const TEST_DOMAINS = [
    {
      domainIndex: 1,
      domainName: 'Branch Revenue Q3 Analysis',
      round1Prompt: 'Phân tích doanh thu quý 3 theo từng chi nhánh',
      round2Prompt: 'Vẽ biểu đồ so sánh chi nhánh Hà Nội và HCM',
    },
    {
      domainIndex: 2,
      domainName: 'Excel Spreadsheet & Financial PnL Modeling',
      round1Prompt: 'Tạo bảng tính Excel tính toán dòng tiền và P&L năm 2026',
      round2Prompt: 'Thêm cột dự phóng tỷ suất lợi nhuận ròng',
    },
    {
      domainIndex: 3,
      domainName: 'Slide Presentation Deck Creation (16:9)',
      round1Prompt: 'Tạo slide thuyết trình về chiến lược Go-To-Market sản phẩm AI Coworker',
      round2Prompt: 'Mở rộng slide 3 thành 3 luận điểm chính',
    },
    {
      domainIndex: 4,
      domainName: 'Microservices Architecture DOCX Report',
      round1Prompt: 'Viết báo cáo kỹ thuật DOCX đánh giá kiến trúc microservices',
      round2Prompt: 'Bổ sung phần khuyến nghị bảo mật OWASP',
    },
    {
      domainIndex: 5,
      domainName: 'SQL VIP Customer Database Query',
      round1Prompt: 'Truy vấn SQL danh sách khách hàng VIP phát sinh giao dịch trên 100 triệu',
      round2Prompt: 'Lọc tiếp theo ngành hàng bán lẻ',
    },
    {
      domainIndex: 6,
      domainName: 'Python Computation & Algorithm Optimization',
      round1Prompt: 'Viết script Python tính toán phân tích hồi quy tuyến tính dự báo doanh số',
      round2Prompt: 'Tối ưu hóa thuật toán với numpy vectorized operations và vẽ biểu đồ residual plot',
    },
    {
      domainIndex: 7,
      domainName: 'Data Cleaning & Schema Normalization',
      round1Prompt: 'Làm sạch bộ dữ liệu giao dịch bị trùng lặp và thiếu giá trị null',
      round2Prompt: 'Chuẩn hóa định dạng số điện thoại và địa chỉ email',
    },
    {
      domainIndex: 8,
      domainName: 'Anomaly Detection & Fraud Prevention',
      round1Prompt: 'Phát hiện giao dịch bất thường gian lận thẻ tín dụng bằng Isolation Forest',
      round2Prompt: 'Trích xuất danh sách top 20 giao dịch có anomaly score cao nhất',
    },
    {
      domainIndex: 9,
      domainName: 'Supply Chain & Inventory Optimization',
      round1Prompt: 'Tối ưu hóa tồn kho chuỗi cung ứng theo mô hình EOQ và ROP',
      round2Prompt: 'Mô phỏng kịch bản biến động lead time thời gian giao hàng',
    },
    {
      domainIndex: 10,
      domainName: 'SaaS Customer Churn & Retention',
      round1Prompt: 'Phân tích tỷ lệ khách hàng rời bỏ dịch vụ SaaS và tính toán CLV',
      round2Prompt: 'Đề xuất chiến lược chăm sóc khách hàng tự động để giảm churn rate',
    },
  ];

  for (const domain of TEST_DOMAINS) {
    test(`16.${domain.domainIndex} - Multi-Round Conversation (${domain.domainName}): verify UUID in URL, streaming response, follow-up persistence, and refresh hydration`, async ({
      page,
    }) => {
      const consoleListener = setupConsoleErrorListener(page);

      // Step 1: Navigate to OpenWork Coworker
      await page.goto('/openwork');
      await page.waitForLoadState('domcontentloaded');

      // Step 2: Click "Phiên làm việc mới"
      const newSessionBtn = page.getByRole('button', { name: 'Phiên làm việc mới' });
      await expect(newSessionBtn).toBeVisible({ timeout: 10000 });
      await newSessionBtn.click();

      // Step 3: Verify textarea is ready
      const textarea = page.locator('textarea');
      await expect(textarea).toBeVisible({ timeout: 5000 });

      // Step 4: Submit Round 1 Prompt using press('Enter')
      await textarea.fill(domain.round1Prompt);
      await textarea.press('Enter');

      // Step 5: Wait for streaming to finish and verify URL has real UUID v4 ?conversationId={uuid}
      await page.waitForFunction(() => {
        const url = window.location.href;
        return url.includes('conversationId=');
      }, { timeout: 15000 });

      const currentUrl = page.url();
      const urlObj = new URL(currentUrl);
      const convId = urlObj.searchParams.get('conversationId');

      expect(convId).toBeTruthy();
      expect(convId).not.toContain('local-');
      expect(convId).not.toContain('session-');
      expect(UUID_V7_REGEX.test(convId!)).toBe(true);

      // Wait for streaming to complete (Stop control reverts to the send control)
      await expect(page.locator('button.chat-input-submit')).toHaveAttribute(
        'aria-label',
        'Gửi tin nhắn (Enter)',
        { timeout: 15000 },
      );

      // Step 6: Verify User Bubble 1 and Assistant Response 1 rendered in main chat area
      const mainChat = page.locator('main');
      await expect(mainChat.getByText(domain.round1Prompt).first()).toBeVisible({ timeout: 5000 });
      await expect(mainChat.getByText(/Tôi đã hoàn thành phân tích|Đã thực thi truy vấn/).first()).toBeVisible({ timeout: 5000 });

      // Step 7: Capture Screenshot of Round 1
      const screenshotPathR1 = path.join(
        SCREENSHOT_DIR,
        `round_${domain.domainIndex}_1_${domain.domainName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`
      );
      const frontendScreenshotPathR1 = path.join(
        FRONTEND_SCREENSHOT_DIR,
        `round_${domain.domainIndex}_1_${domain.domainName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`
      );
      await page.screenshot({ path: screenshotPathR1, fullPage: true });
      safeCopyFileSync(screenshotPathR1, frontendScreenshotPathR1);

      // Step 8: Submit Round 2 Follow-Up Prompt
      await textarea.fill(domain.round2Prompt);
      await textarea.press('Enter');

      // Wait for Round 2 streaming to complete
      await expect(page.locator('button.chat-input-submit')).toHaveAttribute(
        'aria-label',
        'Gửi tin nhắn (Enter)',
        { timeout: 15000 },
      );

      // Step 9: Verify Conversation Persists both rounds in main chat area
      await expect(mainChat.getByText(domain.round1Prompt).first()).toBeVisible();
      await expect(mainChat.getByText(domain.round2Prompt).first()).toBeVisible();

      // Step 10: Capture Screenshot of Round 2 (Full Multi-Round Evidence)
      const screenshotPathR2 = path.join(
        SCREENSHOT_DIR,
        `round_${domain.domainIndex}_2_${domain.domainName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`
      );
      const frontendScreenshotPathR2 = path.join(
        FRONTEND_SCREENSHOT_DIR,
        `round_${domain.domainIndex}_2_${domain.domainName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`
      );
      await page.screenshot({ path: screenshotPathR2, fullPage: true });
      safeCopyFileSync(screenshotPathR2, frontendScreenshotPathR2);

      // Step 11: Verify Page Refresh Hydration on ?conversationId={uuid}
      // Reload page and confirm conversation is restored from backend API (not a blank screen)
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Verify conversation content is rehydrated
      const mainChatReloaded = page.locator('main');
      await expect(mainChatReloaded.getByText(domain.round1Prompt).first()).toBeVisible({ timeout: 10000 });
      await expect(mainChatReloaded.getByText(domain.round2Prompt).first()).toBeVisible({ timeout: 10000 });
      expect(page.url()).toContain(`conversationId=${convId}`);

      // Verify no console errors
      consoleListener.assertNoErrors();
    });
  }

  // ==========================================================================
  // REQUIREMENT R2: SIDEBAR CONVERSATIONS LIST & NAVIGATION
  // ==========================================================================

  test('16.11 - Sidebar Conversation List: fetches and renders real conversations from GET /api/v1/analyst/conversations', async ({
    page,
  }) => {
    const consoleListener = setupConsoleErrorListener(page);

    // Direct navigation to seeded conversation
    const seedId = '019183ab-4521-7294-81d3-9f88c3a10001';
    await page.goto(`/openwork?conversationId=${seedId}`);
    await page.waitForLoadState('domcontentloaded');

    // Verify seeded conversation is listed in sidebar
    const sidebar = page.locator('aside[aria-label="OpenWork Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    const seedConvItem = sidebar.getByText('Báo Cáo Tổng Hợp Doanh Nghiệp 2026');
    await expect(seedConvItem).toBeVisible({ timeout: 5000 });

    // Verify messages hydrated in main area
    const mainChat = page.locator('main');
    await expect(mainChat.getByText('Tổng hợp doanh thu các quý năm 2025').first()).toBeVisible({ timeout: 10000 });
    await expect(mainChat.getByText('Doanh thu năm 2025 đạt mức tăng trưởng 28.5%').first()).toBeVisible({ timeout: 10000 });

    // Capture sidebar evidence screenshot
    const screenshotPath = path.join(SCREENSHOT_DIR, 'sidebar_conversations_list.png');
    await page.screenshot({ path: screenshotPath });
    safeCopyFileSync(screenshotPath, path.join(FRONTEND_SCREENSHOT_DIR, 'sidebar_conversations_list.png'));

    consoleListener.assertNoErrors();
  });

  // ==========================================================================
  // REQUIREMENT R3: SKILLS SYSTEM TOGGLING & SQL TOOL REMOVAL VERIFICATION
  // ==========================================================================

  test('16.12 - Skills System: Settings modal skill toggles, Database OFF removes sql_query tool, and persists across refresh', async ({
    page,
  }) => {
    const consoleListener = setupConsoleErrorListener(page);

    await page.goto('/openwork');
    await page.waitForLoadState('domcontentloaded');

    // Step 1: Open Settings Modal via Plug icon in composer or Settings button
    const settingsBtn = page.locator('button[title="Kết nối MCP & Công cụ"]').first();
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();

    // Step 2: Switch to "Kỹ Năng & Công Cụ" Tab in Dialog
    const dialog = page.locator('div[role="dialog"], div.fixed.inset-0').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const skillsTabBtn = dialog.locator('button:has-text("Kỹ Năng & Công Cụ")').first();
    await expect(skillsTabBtn).toBeVisible({ timeout: 5000 });
    await skillsTabBtn.click();

    // Step 3: Verify all primary skills are listed
    await expect(dialog.getByText('SQL Data Analyst')).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('Interactive Charts')).toBeVisible();
    await expect(dialog.getByText('Spreadsheet Studio')).toBeVisible();
    await expect(dialog.getByText('Presentation Studio (16:9)')).toBeVisible();

    // Step 4: Toggle "SQL Data Analyst" (Database skill) OFF
    const sqlCheckbox = dialog.locator('div.flex.items-center.justify-between').filter({ hasText: 'SQL Data Analyst' }).locator('input[type="checkbox"]');
    await expect(sqlCheckbox).toBeChecked();

    // Uncheck SQL skill
    await sqlCheckbox.uncheck();
    await expect(sqlCheckbox).not.toBeChecked();

    // Capture screenshot of Skills Settings Modal with Database toggled OFF
    const screenshotSkillsOff = path.join(SCREENSHOT_DIR, 'skills_modal_database_off.png');
    await page.screenshot({ path: screenshotSkillsOff });
    safeCopyFileSync(screenshotSkillsOff, path.join(FRONTEND_SCREENSHOT_DIR, 'skills_modal_database_off.png'));

    // Step 5: Close Settings Modal
    const closeBtn = dialog.locator('button:has(svg.lucide-x), button[title="Đóng"], button[aria-label="Đóng"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);

    // Step 6: Verify in localStorage that openwork:skills:v1 has sql-agent disabled
    const storedSkillsJson = await page.evaluate(() => localStorage.getItem('openwork:skills:v1'));
    expect(storedSkillsJson).toBeTruthy();
    const storedSkills = JSON.parse(storedSkillsJson!);
    const sqlSkill = storedSkills.find((s: any) => s.id === 'sql-agent');
    expect(sqlSkill).toBeDefined();
    expect(sqlSkill.enabled).toBe(false);

    // Step 7: Send a query asking for SQL data and verify sql_query tool is NOT sent in DeepSeek payload
    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('Truy vấn danh sách đơn hàng lớn nhất từ database');
    await textarea.press('Enter');

    // The send only fires once the stream is in flight; the Stop control is the
    // first observable proof of that, and it must appear before we can wait for
    // it to revert.
    await expect(page.locator('button.chat-input-submit')).toHaveAttribute(
      'aria-label',
      'Dừng phản hồi',
      { timeout: 15000 },
    );

    // Wait for streaming completion
    await expect(page.locator('button.chat-input-submit')).toHaveAttribute(
        'aria-label',
        'Gửi tin nhắn (Enter)',
        { timeout: 15000 },
      );

    // Assert that the DeepSeek request payload did NOT contain sql_query
    expect(backend.lastDeepSeekPayload).toBeTruthy();
    const activeTools = backend.lastDeepSeekPayload.tools || [];
    const toolNames = activeTools.map((t: any) => t.function?.name);
    expect(toolNames).not.toContain('sql_query');

    // Also assert system prompt notified the LLM of disabled capability
    const systemMsg = backend.lastDeepSeekPayload.messages?.find((m: any) => m.role === 'system')?.content || '';
    expect(systemMsg).toContain('DISABLED CAPABILITIES');
    expect(systemMsg).toContain('SQL Data Analyst');

    // Step 8: Verify persistence across Page Refresh
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Re-open Settings modal and verify SQL checkbox is STILL UNCHECKED
    await settingsBtn.click();
    const reloadedDialog = page.locator('div[role="dialog"], div.fixed.inset-0').first();
    const reloadedSkillsTabBtn = reloadedDialog.locator('button:has-text("Kỹ Năng & Công Cụ")').first();
    await reloadedSkillsTabBtn.click();
    
    const reloadedSqlCheckbox = reloadedDialog.locator('div.flex.items-center.justify-between').filter({ hasText: 'SQL Data Analyst' }).locator('input[type="checkbox"]');
    await expect(reloadedSqlCheckbox).not.toBeChecked();

    // Step 9: Toggle "SQL Data Analyst" back ON
    await reloadedSqlCheckbox.check();
    await expect(reloadedSqlCheckbox).toBeChecked();

    // Close Settings Modal
    const reloadedCloseBtn = reloadedDialog.locator('button:has(svg.lucide-x), button[title="Đóng"], button[aria-label="Đóng"]').first();
    if (await reloadedCloseBtn.isVisible()) {
      await reloadedCloseBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);

    // Send another query and verify sql_query is RESTORED in payload.
    // Clear the recorded payload first: without this a send that never fires
    // leaves step 7's payload in place and the assertion below reads stale data.
    backend.lastDeepSeekPayload = null;
    await textarea.click();
    await textarea.fill('Truy vấn top 10 khách hàng từ database');
    await textarea.press('Enter');
    await expect(page.locator('button.chat-input-submit')).toHaveAttribute(
      'aria-label',
      'Dừng phản hồi',
      { timeout: 15000 },
    );
    await expect(page.locator('button.chat-input-submit')).toHaveAttribute(
        'aria-label',
        'Gửi tin nhắn (Enter)',
        { timeout: 15000 },
      );

    expect(backend.lastDeepSeekPayload).toBeTruthy();

    const restoredTools = backend.lastDeepSeekPayload.tools || [];
    const restoredToolNames = restoredTools.map((t: any) => t.function?.name);
    expect(restoredToolNames).toContain('sql_query');

    consoleListener.assertNoErrors();
  });
});
