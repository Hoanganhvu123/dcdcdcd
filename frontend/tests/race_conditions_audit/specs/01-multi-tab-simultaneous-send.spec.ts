import { test, expect } from '@playwright/test';
import {
  createMultiTabSession,
  barrierDispatch,
  waitForAllStreamsComplete,
  assertNoDuplicateMessages,
  generateTestUUIDv7,
} from '../helpers/concurrency-harness';
import { globalChatStore } from '../helpers/mock-chat-server';

/**
 * 01 - Multi-Tab Simultaneous Send Concurrency Suite
 *
 * Requirements:
 * - Spawn >= 3 isolated browser contexts attaching simultaneously to the identical session URL.
 * - Dispatch distinct messages (M1, M2, M3) at exact microsecond timestamp T0 via Promise.all.
 * - Assert all tabs initiate network requests, receive SSE stream responses, and render assistant answers.
 * - Assert zero duplicate message keys/IDs, no infinite loaders, no UI crash.
 */
test.describe('01 - Multi-Tab Simultaneous Message Send Concurrency Suite', () => {
  test.beforeEach(() => {
    globalChatStore.reset();
  });

  test('01.1 - 3 Tabs simultaneous dispatch at T0 to shared session: all tabs complete streaming without deadlock', async ({ browser }) => {
    const sessionId = generateTestUUIDv7();
    const session = await createMultiTabSession(browser, 3, `/?conversationId=${sessionId}`, {
      customSessionId: sessionId,
    });

    try {
      expect(session.pages.length).toBe(3);

      // Verify all 3 pages are mounted and showing composer
      for (const page of session.pages) {
        await expect(page.locator('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea')).toBeVisible();
      }

      // Barrier dispatch distinct messages across Tab 0, Tab 1, Tab 2
      const messages = [
        'Tab 1: Phân tích doanh thu và sản lượng bán lẻ kênh thương mại điện tử Q1.',
        'Tab 2: Tính toán biên lợi nhuận ròng và chi phí vận hành logistics Q2.',
        'Tab 3: Đánh giá tỷ lệ giữ chân khách hàng (Cohort Retention) theo tháng Q3.',
      ];

      const dispatchResult = await barrierDispatch(session.pages, (i) => messages[i]);

      // Verify barrier dispatch execution
      expect(dispatchResult.t0Microseconds).toBeGreaterThan(0);
      expect(dispatchResult.messages.length).toBe(3);

      // Wait for all 3 streaming sessions to complete
      await waitForAllStreamsComplete(session.pages, 25000);

      // Assert each tab has rendered its messages without infinite loader or crash
      for (let i = 0; i < session.pages.length; i++) {
        const page = session.pages[i];

        // Ensure no error alert banner is active
        const errorAlert = page.locator('[data-alert-error]');
        await expect(errorAlert).toHaveCount(0);

        // Assert user bubble is rendered on the page
        const userBubbles = page.locator('[data-line="user"], .user-bubble');
        await expect(userBubbles.first()).toBeVisible();

        // Assert assistant answer block is rendered on the page
        const assistantBlocks = page.locator('[data-line="assistant"], .ow-answer-block');
        await expect(assistantBlocks.first()).toBeVisible();

        // Assert no duplicate IDs or keys
        const stats = await assertNoDuplicateMessages(page);
        expect(stats.userCount).toBeGreaterThanOrEqual(1);
        expect(stats.assistantCount).toBeGreaterThanOrEqual(1);
      }

      // Verify that backend mock received completion requests from concurrent tabs
      expect(globalChatStore.completionRequests.length).toBeGreaterThanOrEqual(3);
    } finally {
      await session.closeAll();
    }
  });

  test('01.2 - 4 Tabs simultaneous dispatch with large analytical prompts', async ({ browser }) => {
    const sessionId = generateTestUUIDv7();
    const session = await createMultiTabSession(browser, 4, `/?conversationId=${sessionId}`, {
      customSessionId: sessionId,
    });

    try {
      expect(session.pages.length).toBe(4);

      const promptPrefixes = [
        '[Tab A] Truy vấn tổng hợp doanh thu 14 bảng SQL:',
        '[Tab B] Trích xuất nhật ký hành vi ClickHouse người dùng:',
        '[Tab C] Đối chiếu bảng tính PnL Financial_Reports_Q3.xlsx:',
        '[Tab D] Xuất báo cáo DOCX và slide trình chiếu 16:9:',
      ];

      await barrierDispatch(session.pages, (i) => `${promptPrefixes[i]} Đánh giá hiệu suất kinh doanh năm 2026.`);

      // Wait for all streams to finish
      await waitForAllStreamsComplete(session.pages, 25000);

      // Verify integrity across all 4 pages
      for (const page of session.pages) {
        const stats = await assertNoDuplicateMessages(page);
        expect(stats.userCount).toBeGreaterThanOrEqual(1);
        expect(stats.assistantCount).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await session.closeAll();
    }
  });
});
