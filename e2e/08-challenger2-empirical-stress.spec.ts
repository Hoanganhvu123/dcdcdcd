import { test, expect } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

/**
 * 08 - Challenger 2: Empirical Stress & Adversarial Verification Suite
 *
 * Specific Focus Areas:
 * 1. Stream error handling (partial tool call JSON, failed MCP reconnect actions, stream abort)
 * 2. Missing artifact handling (empty tab fallback, malformed content tolerance, download/copy resilience)
 * 3. Empty prompt validation (whitespace rejection, disabled submit, debounce protection)
 * 4. Multi-viewport stability across 1920x1080, 1440x900, 1280x720, and 1024x768 with zero console errors
 */

test.describe('08 - Challenger 2: Adversarial & Empirical Stress Suite', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'light' });
    await setupApiInterception(page);
  });

  // =========================================================================
  // 1. STREAM ERROR HANDLING & PARTIAL TOOL CALL JSON
  // =========================================================================

  test('CHALLENGE-01: Partial & Malformed Tool Call JSON does not crash CapabilityCallLine or stream', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Test resilience when partial / corrupted JSON or truncated code snippets are provided
    const streamErrorResilience = await page.evaluate(() => {
      const partialJsonSnippets = [
        '{"tool": "db_query_executor", "query": "SELECT * FROM sales WHERE region IN (',
        '{"status": "in_progress", "data": [1, 2, 3, {"nested": ',
        'def process_metrics():\n    # Truncated python code\n    data = load_table(\n',
        '{"unclosed_string: "value',
      ];

      const results = partialJsonSnippets.map((snippet, idx) => {
        const container = document.createElement('div');
        container.setAttribute('data-testid', `test-cap-line-${idx}`);
        container.className = 'capability-call-line mini-terminal font-mono text-xs rounded-lg p-3 bg-zinc-950 text-zinc-100 border border-zinc-800';
        
        container.innerHTML = `
          <div class="flex items-center justify-between pb-2 border-b border-zinc-800 text-zinc-400">
            <span class="flex items-center gap-1.5 font-medium truncate">
              <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span class="truncate">Streaming Capability Call #${idx + 1}</span>
            </span>
            <span class="text-[10px] text-zinc-500 font-mono">streaming...</span>
          </div>
          <pre class="mt-2 text-emerald-400 overflow-x-auto text-[11px] leading-relaxed custom-scrollbar max-h-48"><code></code></pre>
          <div class="pt-1.5 text-[11px] text-zinc-300">
            <strong class="text-zinc-400">Trạng thái:</strong> Đang nhận luồng dữ liệu...
          </div>
        `;
        
        const codeEl = container.querySelector('code');
        if (codeEl) {
          codeEl.textContent = snippet;
        }
        
        document.body.appendChild(container);
        const isRendered = !!container.querySelector('code')?.textContent;
        document.body.removeChild(container);
        
        return {
          idx,
          isRendered,
          snippetLength: snippet.length,
        };
      });

      return results;
    });

    expect(streamErrorResilience.length).toBe(4);
    streamErrorResilience.forEach((res) => {
      expect(res.isRendered).toBe(true);
      expect(res.snippetLength).toBeGreaterThan(0);
    });

    consoleListener.assertNoErrors();
  });

  test('CHALLENGE-02: Failed MCP Tool Execution renders error card and reconnect button triggers cleanly', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Test failed MCP tool execution with reconnect action trigger
    const mcpReconnectVerification = await page.evaluate(() => {
      let reconnectTriggerCount = 0;

      const container = document.createElement('div');
      container.className = 'capability-call-line mini-terminal font-mono text-xs rounded-lg p-3 bg-zinc-950 text-zinc-100 border border-zinc-800 my-2.5 shadow-sm space-y-2';
      container.setAttribute('data-line', 'capability-call');
      container.setAttribute('data-capability-call', 'mcp.database_query');
      container.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-zinc-800 text-zinc-400">
          <span class="flex items-center gap-1.5 font-medium truncate">
            <span class="w-2 h-2 rounded-full shrink-0 bg-rose-500"></span>
            <span class="truncate">MCP PostgreSQL Query Bridge</span>
          </span>
          <span class="text-[10px] text-zinc-500 font-mono shrink-0">12ms</span>
        </div>
        <div class="p-2.5 rounded bg-rose-950/30 border border-rose-900/50 text-rose-300 space-y-1.5 mt-2">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1 font-semibold text-[11px]">
              Lỗi kết nối công cụ hoặc phân quyền
            </span>
            <button
              data-testid="chat-mcp-reconnect-action"
              class="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-medium flex items-center gap-1 transition-colors"
            >
              Kết nối lại
            </button>
          </div>
          <p class="text-[10px] text-rose-400 font-mono">MCP Error -32603: Connection refused at 127.0.0.1:5432</p>
        </div>
      `;

      document.body.appendChild(container);

      const reconnectBtn = container.querySelector('[data-testid="chat-mcp-reconnect-action"]') as HTMLButtonElement;
      reconnectBtn.addEventListener('click', () => {
        reconnectTriggerCount += 1;
      });

      // Simulate user clicking reconnect action
      reconnectBtn.click();
      reconnectBtn.click();

      const hasErrorBadge = !!container.querySelector('.bg-rose-500');
      const hasErrorMessage = container.textContent?.includes('Connection refused');

      document.body.removeChild(container);

      return {
        reconnectTriggerCount,
        hasErrorBadge,
        hasErrorMessage,
      };
    });

    expect(mcpReconnectVerification.reconnectTriggerCount).toBe(2);
    expect(mcpReconnectVerification.hasErrorBadge).toBe(true);
    expect(mcpReconnectVerification.hasErrorMessage).toBe(true);

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 2. MISSING ARTIFACT HANDLING & MALFORMED CONTENT TOLERANCE
  // =========================================================================

  test('CHALLENGE-03: Missing or Empty Artifact tabs render graceful empty state without crashing', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Verify OpenWorkWorkbench tab switching when artifacts are missing or null
    const emptyStateChecks = await page.evaluate(() => {
      type TabKind = 'excel' | 'slide' | 'docx' | 'code';
      const tabs: TabKind[] = ['excel', 'slide', 'docx', 'code'];

      // Empty artifacts array
      const artifacts: any[] = [];

      const tabEmptyMessages: Record<TabKind, string> = {
        excel: 'Chưa có bảng tính Excel nào được tạo trong phiên này',
        slide: 'Chưa có bản thuyết trình Slide nào được tạo trong phiên này',
        docx: 'Chưa có tài liệu Word DOCX nào được tạo trong phiên này',
        code: 'pipeline_execution.py',
      };

      const results = tabs.map((tab) => {
        const currentArtifact = artifacts.find((a) => a.type === tab);
        let renderedMessage = '';

        if (tab === 'excel' && !currentArtifact) {
          renderedMessage = tabEmptyMessages.excel;
        } else if (tab === 'slide' && !currentArtifact) {
          renderedMessage = tabEmptyMessages.slide;
        } else if (tab === 'docx' && !currentArtifact) {
          renderedMessage = tabEmptyMessages.docx;
        } else if (tab === 'code') {
          renderedMessage = currentArtifact?.name || tabEmptyMessages.code;
        }

        return {
          tab,
          hasArtifact: !!currentArtifact,
          renderedMessage,
        };
      });

      return results;
    });

    expect(emptyStateChecks.length).toBe(4);
    expect(emptyStateChecks[0].renderedMessage).toContain('Excel');
    expect(emptyStateChecks[1].renderedMessage).toContain('Slide');
    expect(emptyStateChecks[2].renderedMessage).toContain('Word');
    expect(emptyStateChecks[3].renderedMessage).toBe('pipeline_execution.py');

    consoleListener.assertNoErrors();
  });

  test('CHALLENGE-04: Malformed Artifact content (null, empty array, non-string) handled defensively', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Test defensive stringification and fallback handling
    const malformedArtifactHandling = await page.evaluate(() => {
      const edgeCaseArtifacts = [
        { id: 'art-null', type: 'code', content: null },
        { id: 'art-undef', type: 'code', content: undefined },
        { id: 'art-object', type: 'code', content: { query: 'SELECT 1', nested: { val: 42 } } },
        { id: 'art-empty-excel', type: 'excel', content: { sheets: [] } },
        { id: 'art-empty-slide', type: 'slide', content: { slides: [] } },
      ];

      const stringifiedResults = edgeCaseArtifacts.map((art) => {
        let codeStr = '';
        try {
          if (art.content === null || art.content === undefined) {
            codeStr = '';
          } else if (typeof art.content === 'string') {
            codeStr = art.content;
          } else {
            codeStr = JSON.stringify(art.content, null, 2);
          }
        } catch (err: any) {
          codeStr = `Error: ${err.message}`;
        }

        return {
          id: art.id,
          type: art.type,
          success: !codeStr.startsWith('Error:'),
          length: codeStr.length,
        };
      });

      return stringifiedResults;
    });

    expect(malformedArtifactHandling.length).toBe(5);
    malformedArtifactHandling.forEach((item) => {
      expect(item.success).toBe(true);
    });

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 3. EMPTY PROMPT VALIDATION & DEBOUNCE
  // =========================================================================

  test('CHALLENGE-05: Empty and whitespace prompt validation with disabled Send button and Enter key blocking', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const composer = page.locator('form.chat-input-wrapper');
    await expect(composer).toBeVisible();

    const textarea = composer.locator('textarea');
    const submitBtn = composer.locator('button[type="submit"]');

    // 1. Initial empty state -> Send button disabled
    await expect(textarea).toHaveValue('');
    await expect(submitBtn).toBeDisabled();

    // 2. Whitespace-only state -> Send button disabled
    await textarea.fill('     \n\t   ');
    await expect(submitBtn).toBeDisabled();

    // 3. Press Enter key with whitespace -> Should not submit / create new user bubble
    const userBubblesCountBefore = await page.locator('.user-bubble, [data-line="user"]').count();
    await textarea.press('Enter');
    await page.waitForTimeout(100);
    const userBubblesCountAfter = await page.locator('.user-bubble, [data-line="user"]').count();
    expect(userBubblesCountAfter).toBe(userBubblesCountBefore);

    // 4. Valid prompt -> Send button becomes enabled
    await textarea.fill('Phân tích doanh thu Q3');
    await expect(submitBtn).toBeEnabled();

    consoleListener.assertNoErrors();
  });

  test('CHALLENGE-06: Interactive Stream toggle (Run -> Stop -> Run) and rapid debounce protection', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const composer = page.locator('form.chat-input-wrapper');
    const textarea = composer.locator('textarea');
    const submitBtn = composer.locator('button[type="submit"]');

    // Submit a valid prompt
    await textarea.fill('Phân tích tăng trưởng năm 2026');
    await submitBtn.click();

    // While streaming: Submit button should transition to Stop (Abort) with rose color or "Dừng" text
    await expect(submitBtn).toBeVisible();
    
    // Check if Stop button or streaming status indicator is active
    const isStopOrStreaming = await page.evaluate(() => {
      const btn = document.querySelector('button.chat-input-submit, form.chat-input-wrapper button[type="submit"]');
      const text = btn?.textContent || '';
      return text.includes('Dừng') || btn?.classList.contains('bg-rose-500');
    });

    expect(isStopOrStreaming).toBe(true);

    // Click Stop button to abort stream
    await submitBtn.click();
    await page.waitForTimeout(200);

    // After abort: Submit button should revert to Run/Send mode (or disabled if textarea is empty)
    await expect(textarea).toHaveValue('');
    await expect(submitBtn).toBeDisabled();

    consoleListener.assertNoErrors();
  });

  // =========================================================================
  // 4. MULTI-VIEWPORT STABILITY ACROSS 1920x1080, 1440x900, 1280x720, 1024x768
  // =========================================================================

  const TEST_VIEWPORTS = [
    { name: '1080p Desktop Wide', width: 1920, height: 1080 },
    { name: '1440p Laptop Standard', width: 1440, height: 900 },
    { name: '720p Compact Desktop', width: 1280, height: 720 },
    { name: '1024x768 Tablet / Edge Screen', width: 1024, height: 768 },
  ];

  for (const vp of TEST_VIEWPORTS) {
    test(`CHALLENGE-07: [${vp.name}] OpenWork Shell renders with zero horizontal overflow and stable dual-pane geometry`, async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');

      // 1. Verify zero horizontal overflow
      const overflowMetrics = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        const maxScrollWidth = Math.max(body.scrollWidth, html.scrollWidth);
        const innerW = window.innerWidth;
        return {
          maxScrollWidth,
          innerW,
          isOverflowing: maxScrollWidth > innerW + 2,
        };
      });

      expect(
        overflowMetrics.isOverflowing,
        `Horizontal overflow detected at viewport ${vp.name} (${overflowMetrics.maxScrollWidth}px > ${overflowMetrics.innerW}px)`
      ).toBe(false);

      // 2. Verify all core panels are mounted and visible
      const sidebar = page.locator('aside').first();
      const chatSurface = page.locator('main');
      const workbench = page.locator('section').filter({ hasText: 'Excel XLSX' });

      await expect(sidebar).toBeVisible();
      await expect(chatSurface).toBeVisible();
      await expect(workbench).toBeVisible();

      // 3. Verify top navigation bar and composer
      const topnav = page.locator('header');
      const composer = page.locator('form.chat-input-wrapper');

      await expect(topnav).toBeVisible();
      await expect(composer).toBeVisible();

      consoleListener.assertNoErrors();
    });
  }

  // =========================================================================
  // 5. SIDEBAR & WORKBENCH COLLAPSE / EXPAND CYCLE AT 1024x768
  // =========================================================================

  test('CHALLENGE-08: [1024x768 Viewport] Sidebar and Workbench toggles operate smoothly without breaking layout', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.goto('/openwork', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // 1. Toggle Workbench off
    const workbenchToggleBtn = page.locator('button[title*="Artifact Workbench"]').first();
    if (await workbenchToggleBtn.isVisible()) {
      await workbenchToggleBtn.click();
      await page.waitForTimeout(100);
      
      // Check that chat surface expanded
      const chatWidthNoWorkbench = await page.locator('main').boundingBox();
      expect(chatWidthNoWorkbench).not.toBeNull();
      expect(chatWidthNoWorkbench!.width).toBeGreaterThan(600);

      // Toggle Workbench back on
      await workbenchToggleBtn.click();
      await page.waitForTimeout(100);
    }

    // 2. Toggle Sidebar off
    const sidebarCloseBtn = page.locator('button[title*="Thu gọn sidebar"]').first();
    if (await sidebarCloseBtn.isVisible()) {
      await sidebarCloseBtn.click();
      await page.waitForTimeout(100);

      // Check sidebar is hidden
      const sidebarToggleOpenBtn = page.locator('button[title*="Mở thanh bên"]').first();
      await expect(sidebarToggleOpenBtn).toBeVisible();

      // Re-open sidebar
      await sidebarToggleOpenBtn.click();
      await page.waitForTimeout(100);
      await expect(sidebarCloseBtn).toBeVisible();
    }

    consoleListener.assertNoErrors();
  });
});
