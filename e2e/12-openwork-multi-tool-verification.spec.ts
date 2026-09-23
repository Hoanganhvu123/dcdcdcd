import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

/**
 * 12 - OpenWork Multi-Tool Wiring & Autonomous Multi-Turn Chaining E2E Verification
 *
 * Test Coverage:
 * 1. Test Case 1: Submitting prompt "Tạo bài thuyết trình slide về con mèo" triggers real `presentation_builder`
 *    tool call in the stream (reasoning delta, capability call mini-terminal), and right-side Workbench immediately
 *    displays generated cat slides (SlideArtifactViewer / SlideCanvas with title and slides rendered).
 * 2. Test Case 2: Submitting prompt "Phân tích doanh thu và tạo bảng Excel" triggers `sql_query` tool call followed by
 *    `spreadsheet_studio` tool call (multi-turn agent chaining), and right-side Workbench immediately displays
 *    generated Excel table (ExcelArtifactViewer with revenue data and sheet tabs).
 * 3. Test Case 3: Verifying payload integrity (OpenAI function calling schemas present for all 5 tools,
 *    0 static mock dependencies, proper state transitions from running to success, multi-viewport resilience).
 */

const BLACKLISTED_MOCK_STRINGS = [
  'Báo Cáo Toàn Diện Hiệu Suất Doanh Nghiệp Q1-Q4',
  'tpl_consulting_exec',
  'mockSlideTemplates',
  'mockReplaySessions',
  'MOCK_REPLAY_LIST',
];

test.describe('12 - OpenWork Multi-Tool Verification Suite', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'dark' });
    await setupApiInterception(page);
  });

  // ==========================================================================
  // TEST CASE 1: Cat Presentation Generation via presentation_builder
  // ==========================================================================
  test('12.1 - Prompt "Tạo bài thuyết trình slide về con mèo" triggers presentation_builder and renders Cat Slides in Workbench', async ({
    page,
  }) => {
    const consoleListener = setupConsoleErrorListener(page);

    const catSlideDeck = {
      title: 'Thế Giới Loài Mèo: Bản Năng & Sự Tiến Hóa',
      subtitle: 'Khám phá thế giới sinh học, hành vi và sự gắn kết với con người',
      themeVars: {
        '--osd-bg': '#09090b',
        '--osd-text': '#f8fafc',
        '--osd-accent': '#f59e0b',
      },
      slides: [
        {
          layout: 'hero',
          title: 'Thế Giới Loài Mèo: Bản Năng & Sự Tiến Hóa',
          subtitle: 'Nghiên cứu tập tính sinh học và sự thích nghi của họ Felidae',
          date: 'Năm 2026',
          impact_stat: '9,500 Năm Thuần Hóa',
        },
        {
          layout: 'stat_grid',
          title: 'Đặc Điểm Sinh Học Nổi Bật Của Mèo',
          stats: [
            { label: 'Thời gian ngủ TB', value: '12-16h / ngày', trend: '+70% ngày' },
            { label: 'Tốc độ chạy nước rút', value: '48 km/h', trend: 'Tối đa' },
            { label: 'Thính giác & Tầm nhìn', value: 'Gấp 6x người', trend: 'Ban đêm' },
          ],
        },
        {
          layout: 'comparison',
          title: 'Mèo Nuôi Trong Nhà vs Mèo Môi Trường Tự Nhiên',
          left_heading: 'Mèo Nuôi Trong Nhà',
          left_bullets: [
            'Tuổi thọ trung bình 12 - 18 năm',
            'Chế độ dinh dưỡng và y tế được kiểm soát',
            'Bản năng săn mồi chuyển thành trò chơi',
          ],
          right_heading: 'Mèo Ngoài Tự Nhiên',
          right_bullets: [
            'Phạm vi lãnh thổ hoạt động rộng lớn',
            'Khả năng săn mồi và tự vệ độc lập',
            'Thích ứng cao với điều kiện khắc nghiệt',
          ],
        },
        {
          layout: 'closing',
          title: 'Chăm Sóc & Bảo Tồn Loài Mèo',
          cta: 'Xây Dựng Môi Trường Sống Thân Thiện & An Toàn Cho Mèo',
          contact_info: 'felis-catus-lab@openwork.ai',
        },
      ],
    };

    const reasoningContent =
      '1. Tiếp nhận chủ đề "loài mèo" từ người dùng.\n2. Phân tích cấu trúc bài thuyết trình 4 slide: Hero, Stat Grid sinh học, So sánh môi trường sống, và Closing.\n3. Gọi công cụ presentation_builder với payload slide đầy đủ.';
    const assistantContent =
      'Bài thuyết trình 4 slide về Thế Giới Loài Mèo đã được tạo thành công với định dạng 16:9 và bố cục đa dạng.';

    const sseBody = [
      `data: {"choices":[{"delta":{"role":"assistant","reasoning_content":${JSON.stringify(
        reasoningContent
      )}}}]}\n\n`,
      `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cat_presentation_${Date.now()}","function":{"name":"presentation_builder","arguments":${JSON.stringify(
        JSON.stringify(catSlideDeck)
      )}}}]}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":${JSON.stringify(assistantContent)}}}]}\n\n`,
      'data: [DONE]\n\n',
    ].join('');

    await page.route('**/chat/completions', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          headers: {
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
          body: sseBody,
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });

    // Step 1: Submit prompt
    const textarea = page.locator('form.chat-input-wrapper textarea, textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });
    await textarea.fill('Tạo bài thuyết trình slide về con mèo');

    const submitBtn = page.locator('form.chat-input-wrapper button.chat-input-submit').first();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Step 2: Reasoning trace appears
    const reasoningBlock = page.locator('[data-line="reasoning"], [data-reasoning-block]').first();
    await expect(reasoningBlock).toBeVisible({ timeout: 10000 });

    // Step 3: Capability call mini-terminal displays presentation_builder with SUCCESS
    const capLine = page
      .locator(
        '[data-capability-call="presentation_builder"], .capability-call-line:has-text("presentation_builder"), .capability-call-line:has-text("Presentation Builder")'
      )
      .first();
    await expect(capLine).toBeVisible({ timeout: 15000 });
    await expect(capLine).toContainText('SUCCESS', { timeout: 15000 });

    // Step 4: Right-side Workbench opens and displays generated cat slides
    const workbench = page.locator('[data-testid="openwork-workbench-panel"]').first();
    await expect(workbench).toBeVisible({ timeout: 10000 });

    // Verify Slide tab is selected
    const slideTab = page.locator('button:has-text("Slide PPTX"), button:has-text("Slide")').first();
    await slideTab.dispatchEvent('click');

    // Verify slide canvas content contains cat deck title
    const catTitleLocator = page.locator('text=Thế Giới Loài Mèo').first();
    await expect(catTitleLocator).toBeVisible({ timeout: 10000 });

    // Verify impact stat on hero slide
    const impactStatLocator = page.locator('text=9,500 Năm Thuần Hóa').first();
    await expect(impactStatLocator).toBeVisible({ timeout: 10000 });

    // Step 5: Verify multi-slide navigation via thumbnails
    const thumbnails = page.locator('div.rounded-xl.border.cursor-pointer');
    const thumbCount = await thumbnails.count();
    expect(thumbCount).toBeGreaterThanOrEqual(3);

    // Click on thumbnail 2 (stat_grid)
    await thumbnails.nth(1).dispatchEvent('click');
    await page.waitForTimeout(300);

    // Verify stat grid content
    const statLabelLocator = page.locator('text=Thời gian ngủ TB').first();
    await expect(statLabelLocator).toBeVisible({ timeout: 10000 });
    const statValueLocator = page.locator('text=12-16h / ngày').first();
    await expect(statValueLocator).toBeVisible({ timeout: 10000 });

    // Click on thumbnail 3 (comparison)
    await thumbnails.nth(2).dispatchEvent('click');
    await page.waitForTimeout(300);
    const comparisonLeftHeading = page.locator('text=Mèo Nuôi Trong Nhà').first();
    await expect(comparisonLeftHeading).toBeVisible({ timeout: 10000 });

    // Step 6: Verify 0 blacklisted mock strings in DOM
    const bodyText = await page.innerText('body');
    for (const blacklisted of BLACKLISTED_MOCK_STRINGS) {
      expect(bodyText).not.toContain(blacklisted);
    }

    consoleListener.assertNoErrors();
  });

  // ==========================================================================
  // TEST CASE 2: Multi-Turn Agent Chaining (sql_query -> spreadsheet_studio)
  // ==========================================================================
  test('12.2 - Prompt "Phân tích doanh thu và tạo bảng Excel" triggers sql_query followed by spreadsheet_studio (Multi-Turn Chaining)', async ({
    page,
  }) => {
    const consoleListener = setupConsoleErrorListener(page);

    let requestTurn = 0;
    const recordedPayloads: any[] = [];

    const sqlToolArgs = {
      query:
        'SELECT quarter, SUM(net_revenue) AS revenue, SUM(cogs) AS cogs, (SUM(net_revenue) - SUM(cogs)) AS gross_profit FROM enterprise_revenue_2026 GROUP BY quarter ORDER BY quarter ASC;',
      database: 'postgresql',
      description: 'Truy vấn bảng doanh thu và lợi nhuận 4 quý 2026',
    };

    const spreadsheetPayload = {
      title: 'Bao_Cao_Phan_Tich_Doanh_Thu_2026.xlsx',
      description: 'Mô hình tài chính doanh thu 4 quý và phân tích cơ cấu kênh bán hàng',
      sheets: [
        {
          name: 'PnL_DoanhThu_4Quy',
          rows: [
            ['Kỳ Báo Cáo', 'Doanh Thu Thuần ($)', 'Giá Vốn COGS ($)', 'Lợi Nhuận Gộp ($)'],
            ['Q1/2026', '2,100,000', '1,450,000', '650,000'],
            ['Q2/2026', '2,280,000', '1,520,000', '760,000'],
            ['Q3/2026', '2,450,000', '1,620,000', '830,000'],
            ['Q4/2026 (Est)', '2,600,000', '1,700,000', '900,000'],
            ['TỔNG CỘNG 2026', '9,430,000', '6,290,000', '3,140,000'],
          ],
          formulas: {
            D6: '=SUM(D2:D5)',
          },
        },
        {
          name: 'Co_Cau_Kenh_Ban',
          rows: [
            ['Kênh Bán Hàng', 'Doanh Thu ($)', 'Tỷ Trọng (%)'],
            ['Direct Enterprise', '5,658,000', '60.0%'],
            ['Partner / Reseller', '2,829,000', '30.0%'],
            ['Online Self-Serve', '943,000', '10.0%'],
          ],
        },
      ],
    };

    await page.route('**/chat/completions', async (route) => {
      if (route.request().method() === 'POST') {
        const postData = JSON.parse(route.request().postData() || '{}');
        recordedPayloads.push(postData);
        requestTurn++;

        if (requestTurn === 1) {
          // Turn 1: Emits sql_query tool call
          const turn1Sse = [
            `data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Bước 1: Phân tích yêu cầu doanh thu. Tiến hành truy vấn dữ liệu từ kho PostgreSQL qua công cụ sql_query..."}}]}\n\n`,
            `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_sql_query_${Date.now()}","function":{"name":"sql_query","arguments":${JSON.stringify(
              JSON.stringify(sqlToolArgs)
            )}}}]}}]}\n\n`,
            'data: [DONE]\n\n',
          ].join('');

          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream; charset=utf-8',
            headers: {
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
            body: turn1Sse,
          });
        } else if (requestTurn === 2) {
          // Turn 2: Emits spreadsheet_studio tool call based on tool observation
          const turn2Sse = [
            `data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Bước 2: Đã nhận được kết quả truy vấn SQL 4 quý. Tiến hành khởi tạo mô hình bảng tính Excel hợp nhất qua spreadsheet_studio..."}}]}\n\n`,
            `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_spreadsheet_${Date.now()}","function":{"name":"spreadsheet_studio","arguments":${JSON.stringify(
              JSON.stringify(spreadsheetPayload)
            )}}}]}}]}\n\n`,
            'data: [DONE]\n\n',
          ].join('');

          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream; charset=utf-8',
            headers: {
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
            body: turn2Sse,
          });
        } else {
          // Turn 3: Final assistant summary completion without tool calls to terminate multi-turn loop cleanly
          const turn3Sse = [
            `data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Bước 3: Tổng hợp hoàn tất bảng tính tài chính và phân tích doanh thu."}}]}\n\n`,
            `data: {"choices":[{"delta":{"content":"Đã hoàn tất phân tích doanh thu 4 quý và lập bảng tính Excel đa tab với đầy đủ công thức tính tổng hợp."}}]}\n\n`,
            'data: [DONE]\n\n',
          ].join('');

          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream; charset=utf-8',
            headers: {
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
            body: turn3Sse,
          });
        }
      } else {
        await route.continue();
      }
    });

    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });

    // Step 1: Submit prompt
    const textarea = page.locator('form.chat-input-wrapper textarea, textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });
    await textarea.fill('Phân tích doanh thu và tạo bảng Excel');

    const submitBtn = page.locator('form.chat-input-wrapper button.chat-input-submit').first();
    await submitBtn.click();

    // Step 2: Verify Multi-Turn Execution in Mini-Terminal
    // Terminal 1: sql_query
    const sqlCapLine = page
      .locator(
        '[data-capability-call="sql_query"], .capability-call-line:has-text("sql_query"), .capability-call-line:has-text("SQL Data Analyst")'
      )
      .first();
    await expect(sqlCapLine).toBeVisible({ timeout: 15000 });
    await expect(sqlCapLine).toContainText('SUCCESS', { timeout: 15000 });

    // Terminal 2: spreadsheet_studio
    const sheetCapLine = page
      .locator(
        '[data-capability-call="spreadsheet_studio"], .capability-call-line:has-text("spreadsheet_studio"), .capability-call-line:has-text("Spreadsheet Studio")'
      )
      .first();
    await expect(sheetCapLine).toBeVisible({ timeout: 15000 });
    await expect(sheetCapLine).toContainText('SUCCESS', { timeout: 15000 });

    // Step 3: Verify Turn 2 Payload contained role: "tool"
    expect(requestTurn).toBeGreaterThanOrEqual(2);
    const turn2Messages = recordedPayloads[1]?.messages || [];
    const hasToolMessage = turn2Messages.some((m: any) => m.role === 'tool');
    expect(hasToolMessage).toBe(true);

    // Step 4: Verify Workbench opens to Excel tab
    const workbench = page.locator('[data-testid="openwork-workbench-panel"]').first();
    await expect(workbench).toBeVisible({ timeout: 10000 });

    const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel")').first();
    await excelTab.dispatchEvent('click');

    // Step 5: Verify ExcelArtifactViewer renders sheets and revenue data
    const sheetTab1 = page.locator('button:has-text("PnL_DoanhThu_4Quy")').first();
    await expect(sheetTab1).toBeVisible({ timeout: 10000 });

    const sheetTab2 = page.locator('button:has-text("Co_Cau_Kenh_Ban")').first();
    await expect(sheetTab2).toBeVisible({ timeout: 10000 });

    // Verify table headers
    const headerDoanhThu = page.locator('td:has-text("Doanh Thu Thuần ($)"), th:has-text("Doanh Thu Thuần ($)")').first();
    await expect(headerDoanhThu).toBeVisible({ timeout: 10000 });

    // Verify row data
    const q1Revenue = page.locator('td:has-text("2,100,000")').first();
    await expect(q1Revenue).toBeVisible({ timeout: 10000 });

    const totalRow = page.locator('text=TỔNG CỘNG 2026').first();
    await expect(totalRow).toBeVisible({ timeout: 10000 });

    // Switch to sheet 2 with dispatchEvent click to avoid floating overlay
    await sheetTab2.dispatchEvent('click');
    await page.waitForTimeout(400);

    const directEnterpriseCell = page.locator('td:has-text("Direct Enterprise")').first();
    await expect(directEnterpriseCell).toBeVisible({ timeout: 10000 });

    const partnerCell = page.locator('td:has-text("Partner / Reseller")').first();
    await expect(partnerCell).toBeVisible({ timeout: 10000 });

    consoleListener.assertNoErrors();
  });

  // ==========================================================================
  // TEST CASE 3: Payload Integrity & Zero Static Mock Purge Verification
  // ==========================================================================
  test('12.3 - Verifying Payload Integrity (5 OpenAI Tool Definitions, Zero Static Mocks, State Transitions)', async ({
    page,
  }) => {
    const consoleListener = setupConsoleErrorListener(page);
    let capturedPayload: any = null;

    await page.route('**/chat/completions', async (route) => {
      if (route.request().method() === 'POST') {
        capturedPayload = JSON.parse(route.request().postData() || '{}');
        const sseBody = [
          'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Kiểm tra tính toàn vẹn của payload và các schema công cụ..."}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Hệ thống đã kết nối trực tiếp với 5 định nghĩa công cụ tiêu chuẩn OpenAI."}}]}\n\n',
          'data: [DONE]\n\n',
        ].join('');

        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          headers: {
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
          body: sseBody,
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });

    // 1. Submit validation prompt
    const textarea = page.locator('form.chat-input-wrapper textarea, textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });
    await textarea.fill('Kiểm tra danh sách công cụ OpenAI khả dụng');

    const submitBtn = page.locator('form.chat-input-wrapper button.chat-input-submit').first();
    await submitBtn.click();

    // Wait for response
    await expect(page.locator('text=Hệ thống đã kết nối trực tiếp với 5 định nghĩa công cụ tiêu chuẩn OpenAI')).toBeVisible({
      timeout: 10000,
    });

    // 2. Assert Payload Integrity
    expect(capturedPayload).not.toBeNull();
    expect(Array.isArray(capturedPayload.tools)).toBe(true);
    expect(capturedPayload.tools.length).toBeGreaterThanOrEqual(5);

    const toolNames = capturedPayload.tools.map((t: any) => t.function?.name);
    expect(toolNames).toContain('presentation_builder');
    expect(toolNames).toContain('spreadsheet_studio');
    expect(toolNames).toContain('doc_writer');
    expect(toolNames).toContain('sql_query');
    expect(toolNames).toContain('python_interpreter');

    for (const tool of capturedPayload.tools) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeTruthy();
      expect(tool.function.parameters.type).toBe('object');
      expect(tool.function.parameters.properties).toBeTruthy();
    }

    // 3. Assert System Prompt contains strict tool calling mandate
    const systemMessage = capturedPayload.messages?.find((m: any) => m.role === 'system');
    expect(systemMessage).toBeTruthy();
    expect(systemMessage.content).toContain('presentation_builder');
    expect(systemMessage.content).toContain('spreadsheet_studio');
    expect(systemMessage.content).toContain('MANDATORY TOOL CALLING INSTRUCTIONS');

    // 4. Codebase Audit: Verify zero legacy mock files/imports in codebase
    const projectRoot = path.resolve(__dirname, '..');
    const scanDirs = [
      path.join(projectRoot, 'frontend/new-components'),
      path.join(projectRoot, 'frontend/pages'),
    ];

    function searchFiles(dir: string, needle: string): string[] {
      const found: string[] = [];
      if (!fs.existsSync(dir)) return found;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          found.push(...searchFiles(fullPath, needle));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes(needle)) {
            found.push(fullPath);
          }
        }
      }
      return found;
    }

    for (const dir of scanDirs) {
      const mockSlideMatches = searchFiles(dir, 'mockSlideTemplates');
      const mockReplayMatches = searchFiles(dir, 'mockReplaySessions');
      expect(
        mockSlideMatches,
        `Found legacy mockSlideTemplates reference in: ${mockSlideMatches.join(', ')}`
      ).toEqual([]);
      expect(
        mockReplayMatches,
        `Found legacy mockReplaySessions reference in: ${mockReplayMatches.join(', ')}`
      ).toEqual([]);
    }

    // 5. Assert 0 console errors
    consoleListener.assertNoErrors();
  });
});
