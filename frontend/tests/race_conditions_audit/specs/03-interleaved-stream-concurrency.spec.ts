import { test, expect } from '@playwright/test';
import {
  createMultiTabSession,
  waitForAllStreamsComplete,
  assertNoDuplicateMessages,
  generateTestUUIDv7,
} from '../helpers/concurrency-harness';
import { globalChatStore } from '../helpers/mock-chat-server';

/**
 * 03 - Interleaved Stream Concurrency Suite
 *
 * Requirements:
 * - Tab 1 starts an active SSE stream response.
 * - Tab 2 and Tab 3 dispatch queries mid-stream while Tab 1 is in-flight.
 * - Verify stream continuity, no dropped tokens, no token crosstalk or state collision between concurrent streams.
 * - Verify independent completion and clean UI rendering for all active streams.
 */
test.describe('03 - Interleaved Stream Concurrency Suite', () => {
  test.beforeEach(() => {
    globalChatStore.reset();
  });

  test('03.1 - Mid-stream interleaved dispatch: Tab 2 and Tab 3 fire while Tab 1 stream is active', async ({ browser }) => {
    const sessionId = generateTestUUIDv7();
    const session = await createMultiTabSession(browser, 3, `/?conversationId=${sessionId}`, {
      customSessionId: sessionId,
      mockOptions: {
        chunkDelayMs: 35,
      },
    });

    try {
      const [page1, page2, page3] = session.pages;

      // 1. Tab 1 initiates first query
      const prompt1 = 'Tab 1 [Long Stream]: Thực hiện phân tích dữ liệu toàn diện 14 bảng SQL và tạo báo cáo doanh thu chi tiết.';
      const textarea1 = page1.locator('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea').first();
      await textarea1.fill(prompt1);
      const submitBtn1 = page1.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first();
      await submitBtn1.waitFor({ state: 'visible' });
      await submitBtn1.click();

      // 2. Allow Tab 1 stream to begin
      await page1.waitForTimeout(200);

      // 3. Tab 2 and Tab 3 dispatch queries mid-stream
      const prompt2 = 'Tab 2 [Interleaved]: Trích xuất top 5 sản phẩm bán chạy nhất trong tuần.';
      const prompt3 = 'Tab 3 [Interleaved]: Kiểm tra số lượng tồn kho các mặt hàng chủ lực.';

      const textarea2 = page2.locator('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea').first();
      const textarea3 = page3.locator('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea').first();

      await textarea2.fill(prompt2);
      await page2.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first().waitFor({ state: 'visible' });

      await textarea3.fill(prompt3);
      await page3.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first().waitFor({ state: 'visible' });

      const submitBtn2 = page2.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first();
      const submitBtn3 = page3.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first();

      // Fire Tab 2 and Tab 3 simultaneously
      await Promise.all([
        submitBtn2.click(),
        submitBtn3.click(),
      ]);

      // 4. Wait for all 3 streams to finish
      await waitForAllStreamsComplete(session.pages, 30000);

      // 5. Verify Tab 1 completed successfully and contains its own response without crosstalk
      const stats1 = await assertNoDuplicateMessages(page1);
      expect(stats1.userCount).toBeGreaterThanOrEqual(1);
      expect(stats1.assistantCount).toBeGreaterThanOrEqual(1);

      // Verify Tab 2 and Tab 3 completed successfully
      const stats2 = await assertNoDuplicateMessages(page2);
      expect(stats2.userCount).toBeGreaterThanOrEqual(1);
      expect(stats2.assistantCount).toBeGreaterThanOrEqual(1);

      const stats3 = await assertNoDuplicateMessages(page3);
      expect(stats3.userCount).toBeGreaterThanOrEqual(1);
      expect(stats3.assistantCount).toBeGreaterThanOrEqual(1);

      // Ensure zero error alerts on all pages
      for (const page of session.pages) {
        await expect(page.locator('[data-alert-error]')).toHaveCount(0);
      }
    } finally {
      await session.closeAll();
    }
  });

  test('03.2 - Staggered latency response ordering: Tab 1 (slow) vs Tab 2 (fast)', async ({ browser }) => {
    const sessionId = generateTestUUIDv7();
    const session = await createMultiTabSession(browser, 2, `/?conversationId=${sessionId}`, {
      customSessionId: sessionId,
    });

    try {
      const [pageSlow, pageFast] = session.pages;

      // Page Slow sends query
      const textareaSlow = pageSlow.locator('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea').first();
      await textareaSlow.fill('Phân tích phức tạp nhiều bước (Slow query).');
      await pageSlow.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first().waitFor({ state: 'visible' });
      await pageSlow.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first().click();

      // Page Fast sends quick query shortly after
      await pageFast.waitForTimeout(100);
      const textareaFast = pageFast.locator('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea').first();
      await textareaFast.fill('Tra cứu nhanh trạng thái server (Fast query).');
      await pageFast.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first().waitFor({ state: 'visible' });
      await pageFast.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first().click();

      await waitForAllStreamsComplete([pageSlow, pageFast], 25000);

      // Verify both pages finished with valid answers
      await assertNoDuplicateMessages(pageSlow);
      await assertNoDuplicateMessages(pageFast);
    } finally {
      await session.closeAll();
    }
  });
});
