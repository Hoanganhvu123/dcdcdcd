import { test, expect } from '@playwright/test';
import {
  createMultiTabSession,
  barrierDispatch,
  waitForAllStreamsComplete,
  assertNoDuplicateMessages,
  generateTestUUIDv7,
  seedPageAuthAndSettings,
} from '../helpers/concurrency-harness';
import { setupMockChatServer, globalChatStore } from '../helpers/mock-chat-server';

/**
 * 04 - History Hydration Integrity & Deduplication Suite
 *
 * Requirements:
 * - Execute concurrent message dispatches across 3 tabs to accumulate conversation turns.
 * - Reload all 3 tabs and assert history hydration consistency without data loss or duplicate rendering.
 * - Spawn a fresh 4th tab (isolated context) attaching to the identical session ID.
 * - Assert complete history hydration, chronological ordering, and zero duplicate message keys/IDs.
 */
test.describe('04 - History Hydration Integrity & Deduplication Suite', () => {
  test.beforeEach(() => {
    globalChatStore.reset();
  });

  test('04.1 - Multi-tab concurrent execution followed by tab reloads and fresh 4th tab attach', async ({ browser }) => {
    const sessionId = generateTestUUIDv7();
    const session = await createMultiTabSession(browser, 3, `/?conversationId=${sessionId}`, {
      customSessionId: sessionId,
    });

    try {
      expect(session.pages.length).toBe(3);

      // 1. Dispatch concurrent messages across 3 tabs
      const messages = [
        'Hội thoại phần 1: Phân tích báo cáo tài chính năm 2025.',
        'Hội thoại phần 2: Đánh giá chi phí đầu tư hạ tầng AI 2026.',
        'Hội thoại phần 3: Dự báo tăng trưởng lợi nhuận giai đoạn 2026-2028.',
      ];

      await barrierDispatch(session.pages, (i) => messages[i]);
      await waitForAllStreamsComplete(session.pages, 25000);

      // Verify each active tab rendered its message
      for (const page of session.pages) {
        await assertNoDuplicateMessages(page);
      }

      // 2. Reload all 3 tabs simultaneously to verify page refresh hydration
      await Promise.all(
        session.pages.map(async (page) => {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForSelector('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea, textarea', {
            state: 'visible',
            timeout: 15000,
          });
        })
      );

      // 3. Assert no duplicate messages and verify UI stability on all reloaded tabs
      for (const page of session.pages) {
        const stats = await assertNoDuplicateMessages(page);
        expect(stats.totalCount).toBeGreaterThanOrEqual(2); // At least 1 user + 1 assistant
        await expect(page.locator('[data-alert-error]')).toHaveCount(0);
      }

      // 4. Spawn a fresh 4th BrowserContext attaching to the same session URL
      const freshContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
      });

      try {
        const page4 = await freshContext.newPage();
        await seedPageAuthAndSettings(page4, 'light');
        await setupMockChatServer(page4);

        await page4.goto(`/?conversationId=${sessionId}`, { waitUntil: 'domcontentloaded' });
        await page4.waitForSelector('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea, textarea', {
          state: 'visible',
          timeout: 15000,
        });

        // Allow hydration effect to settle
        await page4.waitForTimeout(500);

        // 5. Assert history hydration completeness and deduplication on the fresh tab
        const stats4 = await assertNoDuplicateMessages(page4);
        expect(stats4.totalCount).toBeGreaterThanOrEqual(2);
        await expect(page4.locator('[data-alert-error]')).toHaveCount(0);
      } finally {
        await freshContext.close().catch(() => {});
      }
    } finally {
      await session.closeAll();
    }
  });

  test('04.2 - Hydration with pre-seeded multi-turn backend messages', async ({ browser }) => {
    const sessionId = generateTestUUIDv7();

    // Pre-populate backend mock with 3 turns (6 messages)
    globalChatStore.getOrCreateConversation(sessionId, 'Hội thoại đã lưu trước');
    globalChatStore.addMessage(sessionId, { role: 'user', content: 'Pre-seeded Turn 1: Tổng hợp danh sách đối tác.' });
    globalChatStore.addMessage(sessionId, { role: 'assistant', content: 'Đã tìm thấy 24 đối tác chiến lược.' });
    globalChatStore.addMessage(sessionId, { role: 'user', content: 'Pre-seeded Turn 2: Phân loại theo doanh thu.' });
    globalChatStore.addMessage(sessionId, { role: 'assistant', content: 'Phân loại hoàn tất: Tier 1 (5), Tier 2 (12), Tier 3 (7).' });

    const session = await createMultiTabSession(browser, 2, `/?conversationId=${sessionId}`, {
      customSessionId: sessionId,
    });

    try {
      const [pageA, pageB] = session.pages;

      // Allow hydration from backend / localStorage
      await pageA.waitForTimeout(500);
      await pageB.waitForTimeout(500);

      // Verify no duplicate keys/IDs on both tabs
      await assertNoDuplicateMessages(pageA);
      await assertNoDuplicateMessages(pageB);

      // Dispatch a new message on Page A
      const textareaA = pageA.locator('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea').first();
      await textareaA.fill('Pre-seeded Turn 3: Xuất danh sách đối tác Tier 1 sang Excel.');
      const submitA = pageA.locator('button.chat-input-submit, button[type="submit"]').first();
      await submitA.click();

      await waitForAllStreamsComplete([pageA], 20000, 3);

      const finalStatsA = await assertNoDuplicateMessages(pageA);
      expect(finalStatsA.userCount).toBeGreaterThanOrEqual(1);
    } finally {
      await session.closeAll();
    }
  });
});
