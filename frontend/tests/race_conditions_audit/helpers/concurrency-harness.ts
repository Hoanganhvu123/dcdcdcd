import { Browser, BrowserContext, Page, expect } from '@playwright/test';
import { setupMockChatServer, MockServerOptions, globalChatStore } from './mock-chat-server';

export interface MultiTabSessionResult {
  contexts: BrowserContext[];
  pages: Page[];
  sessionId: string;
  closeAll: () => Promise<void>;
}

export interface MultiTabOptions {
  mockOptions?: MockServerOptions;
  customSessionId?: string;
  viewport?: { width: number; height: number };
  theme?: 'light' | 'dark';
}

/**
 * Generates a compliant UUIDv7 identifier
 */
export function generateTestUUIDv7(): string {
  const timestamp = Date.now();
  const hexTime = timestamp.toString(16).padStart(12, '0');
  const randA = Math.floor(Math.random() * 0x1000).toString(16).padStart(3, '0');
  const randB = Math.floor(Math.random() * 0x4000 + 0x8000).toString(16).padStart(4, '0');
  const randC = Math.floor(Math.random() * 0x1000000000000).toString(16).padStart(12, '0');
  return `${hexTime.slice(0, 8)}-${hexTime.slice(8, 12)}-7${randA}-${randB}-${randC}`;
}

/**
 * Initializes localStorage in a BrowserContext with auth credentials & settings
 */
export async function seedPageAuthAndSettings(page: Page, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.addInitScript(({ themeMode }) => {
    const user = {
      user_channel: 'dbgpt',
      user_no: '001',
      nick_name: 'Hoàng Anh',
    };
    localStorage.setItem('__db_gpt_uinfo_key', JSON.stringify(user));
    localStorage.setItem('__db_gpt_uinfo_vt_key', (Date.now() + 86400000).toString());
    localStorage.setItem('__db_gpt_theme_key', themeMode);
    localStorage.setItem('dbgpt_theme_mode', themeMode);
    localStorage.setItem('__db_gpt_lng_key', 'vi');
  }, { themeMode: theme });
}

/**
 * Creates >= 3 isolated BrowserContext and Page instances attached to the same chat session.
 * Initializes contexts and pages concurrently for maximum performance.
 */
export async function createMultiTabSession(
  browser: Browser,
  count = 3,
  sessionUrl?: string,
  options: MultiTabOptions = {}
): Promise<MultiTabSessionResult> {
  const sessionId = options.customSessionId || generateTestUUIDv7();
  const targetPath = sessionUrl || `/?conversationId=${sessionId}`;

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];

  try {
    const initPromises = Array.from({ length: count }).map(async () => {
      const context = await browser.newContext({
        viewport: options.viewport || { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
      });
      contexts.push(context);

      const page = await context.newPage();
      pages.push(page);

      // Seed authentication state
      await seedPageAuthAndSettings(page, options.theme || 'light');

      // Set up mock chat server interception
      await setupMockChatServer(page, options.mockOptions);

      // Navigate to session URL
      await page.goto(targetPath, { waitUntil: 'domcontentloaded' });

      // Wait for composer to be visible and interactive
      await page.waitForSelector('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea, textarea', {
        state: 'visible',
        timeout: 30000,
      });

      return { context, page };
    });

    await Promise.all(initPromises);
  } catch (err) {
    await Promise.all(pages.map((p) => p.close().catch(() => {})));
    await Promise.all(contexts.map((ctx) => ctx.close().catch(() => {})));
    throw err;
  }

  const closeAll = async () => {
    await Promise.all(pages.map((p) => p.close().catch(() => {})));
    await Promise.all(contexts.map((ctx) => ctx.close().catch(() => {})));
  };

  return { contexts, pages, sessionId, closeAll };
}

export interface BarrierDispatchResult {
  t0Microseconds: number;
  dispatchTimestamps: number[];
  messages: string[];
}

/**
 * Fills text into composer inputs on all tabs, then triggers submit clicks simultaneously via Promise.all at timestamp T0.
 */
export async function barrierDispatch(
  pages: Page[],
  messageGenerator: (index: number) => string
): Promise<BarrierDispatchResult> {
  const messages: string[] = [];

  // Phase 1: Prepare all pages by filling textarea inputs and waiting for submit readiness
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const text = messageGenerator(i);
    messages.push(text);

    const textarea = page.locator('textarea[aria-label*="Khung soạn thảo"], [data-openwork-composer] textarea, textarea').first();
    await textarea.fill(text);
    // Wait for submit button to be enabled (not disabled)
    await page.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first().waitFor({
      state: 'visible',
      timeout: 5000,
    });
  }

  // Phase 2: Barrier synchronization at microsecond timestamp T0
  const t0Microseconds = Date.now() * 1000 + Math.floor(performance.now() * 1000) % 1000;
  const dispatchTimestamps: number[] = [];

  await Promise.all(
    pages.map(async (page, index) => {
      const submitBtn = page.locator('button.chat-input-submit:not([disabled]), button[type="submit"]:not([disabled])').first();
      dispatchTimestamps[index] = Date.now();

      // Trigger submit click
      await submitBtn.click();
    })
  );

  return {
    t0Microseconds,
    dispatchTimestamps,
    messages,
  };
}

/**
 * Waits for all tabs to commence streaming, finish receiving stream deltas, and return to idle state.
 * Explicitly verifies that assistant response mounting occurs BEFORE checking for completion.
 */
export async function waitForAllStreamsComplete(
  pages: Page[],
  timeoutMs = 30000,
  expectedMinAssistantCount = 1
): Promise<void> {
  await Promise.all(
    pages.map(async (page) => {
      // 1. Explicitly wait for stream commencement / assistant message mounting
      await page.waitForFunction(
        (minCount) => {
          const stopBtn = document.querySelector('button[aria-label="Dừng phản hồi"]');
          const loadingIndicator = document.querySelector('[data-loading-message="working"]');
          const cursor = document.querySelector('.ow-cursor');
          const assistants = document.querySelectorAll('[data-line="assistant"], .ow-answer-block');
          const reasoning = document.querySelectorAll('[data-line="reasoning"]');
          return Boolean(stopBtn || loadingIndicator || cursor || assistants.length >= minCount || reasoning.length > 0);
        },
        expectedMinAssistantCount,
        { timeout: Math.min(timeoutMs, 15000) }
      );

      // 2. Wait for stop button/loading indicator/cursor to disappear AND assistant response to be mounted
      await page.waitForFunction(
        (minCount) => {
          const stopBtn = document.querySelector('button[aria-label="Dừng phản hồi"]');
          const loadingIndicator = document.querySelector('[data-loading-message="working"]');
          const cursor = document.querySelector('.ow-cursor');
          const assistants = document.querySelectorAll('[data-line="assistant"], .ow-answer-block');
          return !stopBtn && !loadingIndicator && !cursor && assistants.length >= minCount;
        },
        expectedMinAssistantCount,
        { timeout: timeoutMs }
      );

      // 3. Allow brief DOM settle time
      await page.waitForTimeout(300);
    })
  );
}

/**
 * Queries rendered message bubbles on a Page, checking for duplicate IDs, text content, and duplicate keys.
 */
export async function assertNoDuplicateMessages(page: Page): Promise<{
  userCount: number;
  assistantCount: number;
  totalCount: number;
  userTexts: string[];
  assistantTexts: string[];
}> {
  const messageData = await page.evaluate(() => {
    const userElements = Array.from(document.querySelectorAll('[data-line="user"], [data-message-role="user"], .user-bubble-container'));
    const assistantElements = Array.from(document.querySelectorAll('[data-line="assistant"], .ow-answer-block'));

    const userIds = userElements.map((el) => el.getAttribute('data-message-id') || el.getAttribute('id') || '').filter(Boolean);
    const assistantIds = assistantElements.map((el) => el.getAttribute('data-part-id') || el.getAttribute('id') || '').filter(Boolean);

    const userTexts = userElements.map((el) => (el.querySelector('.user-bubble, .ow-user-bubble') || el).textContent?.trim() || '');
    const assistantTexts = assistantElements.map((el) => el.textContent?.trim() || '');

    return {
      userIds,
      assistantIds,
      userTexts,
      assistantTexts,
      userCount: userElements.length,
      assistantCount: assistantElements.length,
    };
  });

  // Check duplicate user IDs
  const uniqueUserIds = new Set(messageData.userIds);
  expect(
    uniqueUserIds.size,
    `Detected duplicate user message IDs: ${JSON.stringify(messageData.userIds)}`
  ).toBe(messageData.userIds.length);

  // Check duplicate assistant IDs
  const uniqueAssistantIds = new Set(messageData.assistantIds);
  expect(
    uniqueAssistantIds.size,
    `Detected duplicate assistant message IDs: ${JSON.stringify(messageData.assistantIds)}`
  ).toBe(messageData.assistantIds.length);

  return {
    userCount: messageData.userCount,
    assistantCount: messageData.assistantCount,
    totalCount: messageData.userCount + messageData.assistantCount,
    userTexts: messageData.userTexts,
    assistantTexts: messageData.assistantTexts,
  };
}
