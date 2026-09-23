import { test, expect, Page } from '@playwright/test';

/**
 * 17 - New session must clear the previous turn list.
 *
 * Regression guard for commit 65352aec: clicking "Phiên làm việc mới" while a
 * conversation already has turns must reset streamParts/artifacts, mint a fresh
 * UUIDv7 and swap ?conversationId. Spec 16 only ever clicks the button on an
 * already-empty surface, so the actual reset path had no coverage.
 */

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function stubBackend(page: Page) {
  await page.route(/\/api\/v1\/analyst\//, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = req.postDataJSON() || {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { conversation_id: body.conversation_id, title: body.title || 'Phiên làm việc mới', messages: [] },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route(/\/chat\/completions(\?|$)/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const chunks = [
      `data: {"id":"c1","choices":[{"index":0,"delta":{"role":"assistant","content":"Đã phân tích xong yêu cầu."}}]}\n\n`,
      `data: [DONE]\n\n`,
    ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: chunks.join(''),
    });
  });

  await page.route('**/api/v1/user/info*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { user_no: '001', nick_name: 'e2e-tester' } }),
    });
  });
}

test.describe('17 - OpenWork new session resets the turn list', () => {
  test('17.1 - clicking "Phiên làm việc mới" on a non-empty session clears turns and mints a fresh UUIDv7', async ({ page }) => {
    await stubBackend(page);

    await page.goto('/openwork');
    await page.waitForLoadState('domcontentloaded');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });

    const userLines = page.locator('[data-line="user"]');
    const seededTurns = await userLines.count();

    // Seed one more turn so the surface is genuinely non-empty when we reset.
    await textarea.fill('Phân tích doanh thu quý 3 theo chi nhánh');
    await textarea.press('Enter');

    await expect(userLines).toHaveCount(seededTurns + 1, { timeout: 15000 });
    await expect(page.locator('button.chat-input-submit')).toHaveAttribute(
      'aria-label',
      'Gửi tin nhắn (Enter)',
      { timeout: 20000 },
    );

    const beforeId = new URL(page.url()).searchParams.get('conversationId');
    expect(beforeId).toBeTruthy();
    expect(UUID_V7_REGEX.test(beforeId!)).toBe(true);

    // Act: start a new session from a surface that already holds a turn.
    const newSessionBtn = page.getByRole('button', { name: 'Phiên làm việc mới' });
    await expect(newSessionBtn).toBeVisible({ timeout: 10000 });
    await newSessionBtn.click();

    // Assert: turn list emptied.
    await expect(userLines).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('[data-line="reasoning"]')).toHaveCount(0);

    // Assert: fresh, valid conversation id swapped into the URL.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('conversationId'), { timeout: 10000 })
      .not.toBe(beforeId);
    const afterId = new URL(page.url()).searchParams.get('conversationId');
    expect(afterId).toBeTruthy();
    expect(UUID_V7_REGEX.test(afterId!)).toBe(true);

    // Assert: composer cleared.
    await expect(textarea).toHaveValue('');
  });
});
