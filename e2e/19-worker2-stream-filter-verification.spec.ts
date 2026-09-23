import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const SCREENSHOT_DIR = path.resolve("/home/vu-hoang-anh/project/db gpt/.agents/teamwork_preview_challenger_2/screenshots");

test.describe("Challenger 2 Empirical Verification: Worker 2 Streaming Parser & Auto-Workbench", () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("openwork:theme", "dark");
      window.localStorage.setItem("openwork:v7:default:default:global:settings", JSON.stringify({
        providerKind: "agent-wrap",
        apiKey: "sk-test-mock-agent-wrap-key",
        apiBaseUrl: "http://localhost:5173/api/agent-wrap/v1",
        model: "Gemini 3.7 Flash",
        deepseekApiKey: "",
        deepseekBaseUrl: "/api/agent-wrap/v1",
        deepseekModel: "Gemini 3.7 Flash",
      }));
    });
  });

  // ==========================================================================
  // SCENARIO 1: Live Model Interaction against http://localhost:5173
  // ==========================================================================
  test("TC1 - Live Interaction with Gemini 3.7 Flash via Server 160 Proxy", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const textarea = page.locator("textarea[aria-label=\"Khung soạn thảo câu lệnh và phân tích dữ liệu\"]").first();
    await expect(textarea).toBeVisible({ timeout: 15000 });

    const promptText = "Tạo bảng tính Excel PnL 4 quý 2026 với 2 sheet và bộ slide 4 trang 16:9 cho Ban Điều Hành.";
    await textarea.fill(promptText);

    const sendBtn = page.locator("button[aria-label=\"Gửi tin nhắn (Enter)\"]").first();
    await expect(sendBtn).toBeEnabled({ timeout: 5000 });
    await sendBtn.click();

    // Wait for response to begin and stream
    await page.waitForTimeout(6000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01_live_initial_stream.png"),
      fullPage: false,
    });

    // Wait until streaming stops or times out (up to 45 seconds)
    const stopBtn = page.locator("button[aria-label*=\"Dừng\"], button[aria-label*=\"Stop\"]");
    try {
      await stopBtn.waitFor({ state: "detached", timeout: 45000 });
    } catch {
      // Stream completed or settling
    }
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "02_live_completed_response.png"),
      fullPage: false,
    });

    // Verification 1: Zero raw { "tool_code" leaks in markdown prose
    const answerMarkdown = page.locator(".ow-answer-block, [data-line=\"assistant\"]").first();
    if (await answerMarkdown.isVisible()) {
      const textContent = await answerMarkdown.innerText();
      expect(textContent).not.toContain("\"tool_code\"");
      expect(textContent).not.toContain("print(spreadsheet_studio");
      expect(textContent).not.toContain("print(presentation_builder");
    }

    const workbench = page.locator("section[data-testid=\"openwork-workbench-panel\"]").first();
    const isWorkbenchVisible = await workbench.isVisible();
    console.log("Live query workbench visible:", isWorkbenchVisible);
  });

  // ==========================================================================
  // SCENARIO 2: Empirical Oracle with Exact Gemini Raw { "tool_code" } Payload
  // ==========================================================================
  test("TC2 - Intercepts Gemini { \"tool_code\": ... }, strips from prose, emits capability pills, and auto-opens Workbench", async ({ page }) => {
    test.setTimeout(45000);

    const chunk1 = "Dưới đây là kế hoạch tài chính và tài liệu trình Ban Điều Hành:\n\n";
    const chunk2 = "{ \"tool_code\": \"print(spreadsheet_studio(sheets=[{'name': 'PnL_2026', 'data': [['Chi tieu', 'Q1', 'Q2', 'Q3', 'Q4'], ['Doanh thu', 120, 140, 160, 200], ['Loi nhuan', 30, 35, 45, 60]]}, {'name': 'Chi_Phi', 'data': [['Muc chi', 'Q1', 'Q2'], ['Van hanh', 50, 55]]}]))\" }";
    const chunk3 = "\n\nĐồng thời, bộ slide thuyết trình 4 trang 16:9 đã được phác thảo:\n\n";
    const chunk4 = "```json\n{ \"tool_code\": \"print(presentation_builder(slides=[{'layout': 'hero', 'title': 'Ke Hoach PnL 2026', 'subtitle': 'Bao Cao Ban Dieu Hanh'}, {'layout': 'stat_grid', 'title': 'Chi So Kinh Doanh', 'stats': [{'label': 'Doanh Thu', 'value': '620 Ty'}, {'label': 'Loi Nhuan', 'value': '170 Ty'}]}, {'layout': 'bullets', 'title': 'Ke Hoach Trien Khai', 'bullets': ['Toi uu chi phi van hanh', 'Mo rong kenh GT va MT']}, {'layout': 'closing', 'title': 'Kien Nghi & Phe Duyet', 'cta': 'Xin y kien Ban Dieu Hanh'}]))\" }\n```";
    const chunk5 = "\n\nBảng tính và slide thuyết trình đã sẵn sàng trên thanh công cụ bên phải để anh xem và tải về.";

    const sseChunks = [
      "data: " + JSON.stringify({ choices: [{ delta: { content: chunk1 } }] }) + "\n\n",
      "data: " + JSON.stringify({ choices: [{ delta: { content: chunk2 } }] }) + "\n\n",
      "data: " + JSON.stringify({ choices: [{ delta: { content: chunk3 } }] }) + "\n\n",
      "data: " + JSON.stringify({ choices: [{ delta: { content: chunk4 } }] }) + "\n\n",
      "data: " + JSON.stringify({ choices: [{ delta: { content: chunk5 } }] }) + "\n\n",
      "data: [DONE]\n\n",
    ];

    await page.route("**/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: sseChunks.join(""),
      });
    });

    await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const textarea = page.locator("textarea[aria-label=\"Khung soạn thảo câu lệnh và phân tích dữ liệu\"]").first();
    await expect(textarea).toBeVisible({ timeout: 15000 });
    await textarea.fill("Tạo bảng tính Excel PnL 4 quý 2026 với 2 sheet và bộ slide 4 trang 16:9 cho Ban Điều Hành.");

    const sendBtn = page.locator("button[aria-label=\"Gửi tin nhắn (Enter)\"]").first();
    await sendBtn.click();

    // Wait for the stream to process and UI to update
    await page.waitForTimeout(4000);

    // 1. ASSERTION: Raw tool_code JSON is NOT in the answer markdown
    const answerContainer = page.locator(".ow-answer-block, [data-line=\"assistant\"]").last();
    await expect(answerContainer).toBeVisible({ timeout: 10000 });
    const answerText = await answerContainer.innerText();
    
    expect(answerText).not.toContain("\"tool_code\"");
    expect(answerText).not.toContain("print(spreadsheet_studio");
    expect(answerText).not.toContain("print(presentation_builder");
    expect(answerText).toContain("Dưới đây là kế hoạch tài chính");
    expect(answerText).toContain("Bảng tính và slide thuyết trình đã sẵn sàng");

    // 2. ASSERTION: Capability pills appear in the Tool track
    const capabilityPills = page.locator("button").filter({
      hasText: /GỌI CÔNG CỤ|GHI FILE|XLSX|PPTX|spreadsheet_studio|presentation_builder/i,
    });
    const pillCount = await capabilityPills.count();
    expect(pillCount).toBeGreaterThanOrEqual(1);

    // 3. ASSERTION: Workbench split-screen is automatically opened
    const workbenchPanel = page.locator("section[data-testid=\"openwork-workbench-panel\"]").first();
    await expect(workbenchPanel).toBeVisible({ timeout: 10000 });

    // 4. ASSERTION: Tab synchronization (Excel XLSX or Slide PPTX is active/present)
    const excelTab = page.locator("[role=\"tab\"]:has-text(\"Excel\"), button:has-text(\"Excel XLSX\")").first();
    const slideTab = page.locator("[role=\"tab\"]:has-text(\"Slide\"), button:has-text(\"Slide PPTX\")").first();
    await expect(excelTab).toBeVisible();
    await expect(slideTab).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03_oracle_stream_tool_code_filtered.png"),
      fullPage: false,
    });

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04_oracle_workbench_auto_opened.png"),
      fullPage: false,
    });
  });

  // ==========================================================================
  // SCENARIO 3: Micro-Chunk Fragmentation across JSON / Code Fence Boundaries
  // ==========================================================================
  test("TC3 - Micro-chunk fragmented tool_code stream does not leak partial tokens", async ({ page }) => {
    test.setTimeout(45000);

    const fullPayload = "{ \"tool_code\": \"print(spreadsheet_studio(sheets=[{'name': 'Frag_Test', 'data': [[1, 2], [3, 4]]}]))\" }";
    const fragments = [
      "data: " + JSON.stringify({ choices: [{ delta: { content: "Bắt đầu khởi tạo dữ liệu:\n\n" } }] }) + "\n\n"
    ];
    
    for (let i = 0; i < fullPayload.length; i += 2) {
      const slice = fullPayload.slice(i, i + 2);
      fragments.push("data: " + JSON.stringify({ choices: [{ delta: { content: slice } }] }) + "\n\n");
    }
    fragments.push("data: " + JSON.stringify({ choices: [{ delta: { content: "\n\nHoàn thành tạo dữ liệu." } }] }) + "\n\n");
    fragments.push("data: [DONE]\n\n");

    await page.route("**/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: fragments.join(""),
      });
    });

    await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const textarea = page.locator("textarea[aria-label=\"Khung soạn thảo câu lệnh và phân tích dữ liệu\"]").first();
    await textarea.fill("Kiểm tra stream phân mảnh micro-chunks");

    const sendBtn = page.locator("button[aria-label=\"Gửi tin nhắn (Enter)\"]").first();
    await sendBtn.click();

    await page.waitForTimeout(4000);

    const answerContainer = page.locator(".ow-answer-block, [data-line=\"assistant\"]").last();
    await expect(answerContainer).toBeVisible({ timeout: 10000 });
    const answerText = await answerContainer.innerText();

    expect(answerText).not.toContain("\"tool_code\"");
    expect(answerText).not.toContain("print(spreadsheet_studio");
    expect(answerText).toContain("Bắt đầu khởi tạo dữ liệu:");
    expect(answerText).toContain("Hoàn thành tạo dữ liệu.");

    const workbenchPanel = page.locator("section[data-testid=\"openwork-workbench-panel\"]").first();
    await expect(workbenchPanel).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "05_micro_chunk_fragmentation_success.png"),
      fullPage: false,
    });
  });
});
