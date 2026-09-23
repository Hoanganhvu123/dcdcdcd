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
 * 02 - Rapid Burst Race Concurrency Suite
 *
 * Requirements:
 * - Test fast-fire successive message bursts from multiple tabs simultaneously.
 * - Pressure-test React state queue, localStorage persistence serialization, and API dispatch under back-to-back load.
 * - Verify that consecutive rounds complete cleanly without dropped messages, duplicate keys, or UI freezes.
 */
test.describe('02 - Rapid Burst Message Race Concurrency Suite', () => {
  test.beforeEach(() => {
    globalChatStore.reset();
  });

  test('02.1 - Two successive rapid bursts across 3 tabs (Round 1 & Round 2)', async ({ browser }) => {
    const sessionId = generateTestUUIDv7();
    const session = await createMultiTabSession(browser, 3, `/?conversationId=${sessionId}`, {
      customSessionId: sessionId,
    });

    try {
      expect(session.pages.length).toBe(3);

      // ── Burst 1 (Round 1) ──
      const burst1Messages = [
        'Round 1 [Tab 1]: Tổng quan doanh số toàn quốc tháng 8.',
        'Round 1 [Tab 2]: Tổng quan số lượng đơn hàng hoàn hủy tháng 8.',
        'Round 1 [Tab 3]: Tổng quan chi phí marketing Ads Google/Meta tháng 8.',
      ];

      await barrierDispatch(session.pages, (i) => burst1Messages[i]);
      await waitForAllStreamsComplete(session.pages, 25000);

      // Verify Round 1 rendered
      for (const page of session.pages) {
        const stats = await assertNoDuplicateMessages(page);
        expect(stats.userCount).toBeGreaterThanOrEqual(1);
        expect(stats.assistantCount).toBeGreaterThanOrEqual(1);
      }

      // ── Burst 2 (Round 2) — Rapid Follow-up ──
      const burst2Messages = [
        'Round 2 [Tab 1]: Phân tích sâu theo từng tỉnh thành trọng điểm.',
        'Round 2 [Tab 2]: Lý do chính dẫn đến việc hoàn đơn theo khu vực.',
        'Round 2 [Tab 3]: Tính toán chỉ số ROAS và CAC chi tiết cho từng chiến dịch.',
      ];

      await barrierDispatch(session.pages, (i) => burst2Messages[i]);
      await waitForAllStreamsComplete(session.pages, 25000, 2);

      // Verify Round 2 rendered with accumulated history
      for (const page of session.pages) {
        const stats = await assertNoDuplicateMessages(page);
        // Each tab should now have at least 2 user turns and 2 assistant turns
        expect(stats.userCount).toBeGreaterThanOrEqual(2);
        expect(stats.assistantCount).toBeGreaterThanOrEqual(2);
      }

      // Total requests received on backend should be at least 6 (3 tabs x 2 rounds)
      expect(globalChatStore.completionRequests.length).toBeGreaterThanOrEqual(6);
    } finally {
      await session.closeAll();
    }
  });

  test('02.2 - Rapid burst with mixed prompt lengths and special characters', async ({ browser }) => {
    const sessionId = generateTestUUIDv7();
    const session = await createMultiTabSession(browser, 3, `/?conversationId=${sessionId}`, {
      customSessionId: sessionId,
    });

    try {
      // Test adversarial inputs: SQL symbols, quotes, XML/HTML tags, emoji, unicode
      const adversarialBurst = [
        'SELECT * FROM "orders" WHERE status=\'COMPLETED\' AND total_amount > 1000000; -- Tab 1',
        'Phân tích <dataset name="sales_2026" version="v2.1" format="json"> & kiểm tra null/NaN #Tab2',
        '🚀 Kiểm tra biểu đồ tăng trưởng doanh thu 📈: [KPI: 98.5%] & Chiết khấu đặc biệt (10%) ~ Tab 3',
      ];

      await barrierDispatch(session.pages, (i) => adversarialBurst[i]);
      await waitForAllStreamsComplete(session.pages, 25000);

      for (const page of session.pages) {
        const stats = await assertNoDuplicateMessages(page);
        expect(stats.userCount).toBeGreaterThanOrEqual(1);
        expect(stats.assistantCount).toBeGreaterThanOrEqual(1);

        // Ensure zero error banners
        await expect(page.locator('[data-alert-error]')).toHaveCount(0);
      }
    } finally {
      await session.closeAll();
    }
  });
});
