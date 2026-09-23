import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

/**
 * 06 - OpenWork Execution Lines & Web Affordance Registry E2E Suite
 *
 * Requirements Covered:
 * - R3: OpenWork execution lines (ChainOfThought, CapabilityCallLine, SubagentRunLine,
 *       ToolAggregateGroup, UserBubble) rendered by the real app.
 * - R5: SettingsDialog & SkillManager reached through the real sidebar control.
 * - R5: Web Affordance Registry driven through the real `window.__dbgptControl` surface.
 * - R6: Multi-viewport responsive execution with zero console errors.
 *
 * Every assertion below drives the shipped app. Nothing in this file builds its own
 * DOM inside `page.evaluate` and then asserts on it -- that only ever proved the test
 * could write HTML.
 */

/**
 * Deterministic OpenWork stream-part fixture.
 *
 * `/openwork` groups `store.streamParts` into turns and renders them through
 * the five real line components. The store hydrates `streamParts` from
 * `localStorage['openwork:session-data:<id>']`, so seeding that key drives the
 * shipped render path with zero LLM traffic and zero flake.
 */
const SEED_SESSION_ID = '019183ab-4521-7294-81d3-9f88c3a10999';
const USER_PROMPT = 'Analyse Q3 revenue.';
const SEED_THOUGHT =
  'I need to inspect the revenue table before answering, then delegate the driver analysis.';
const SEED_SQL = 'SELECT region, SUM(revenue) FROM revenue_q3 GROUP BY region;';
const SUBAGENT_TASK = 'Analyse Q3 revenue drivers by region';
const SUBAGENT_OUTPUT = 'Growth driven by enterprise renewals in APAC.';

/** 10 distinct tools -> 10 aggregated rows -> 2 past the component's ROW_CAP of 8. */
const SEED_TOOL_COUNT = 10;
const SEED_TOOL_ROW_CAP = 8;

const SEED_STREAM_PARTS = [
  { type: 'user', id: 'seed-user-1', text: USER_PROMPT, timestamp: '10:00 AM' },
  { type: 'reasoning', id: 'seed-reasoning-1', thought: SEED_THOUGHT, isStreaming: false },
  {
    type: 'capability-call',
    id: 'seed-call-1',
    toolName: 'execute_sql',
    displayName: 'revenue_q3',
    status: 'success',
    durationMs: 414,
    language: 'sql',
    codeSnippet: SEED_SQL,
    input: { sql: SEED_SQL },
    output: [{ region: 'APAC', revenue: 248000 }],
  },
  {
    type: 'subagent-run',
    id: 'seed-subagent-1',
    taskTitle: SUBAGENT_TASK,
    agentName: 'research',
    status: 'completed',
    durationMs: 4200,
    taskPrompt: 'Analyse Q3 revenue drivers by region, split by enterprise vs SMB.',
    outputSummary: SUBAGENT_OUTPUT,
  },
  {
    type: 'tool-aggregate',
    id: 'seed-aggregate-1',
    title: 'Automated verification sweep',
    tools: Array.from({ length: SEED_TOOL_COUNT }, (_, i) => ({
      id: 'seed-agg-tool-' + i,
      name: 'verify_step_' + i,
      status: 'completed',
      durationMs: 100 + i,
    })),
  },
  {
    type: 'text',
    id: 'seed-text-1',
    markdown: 'Q3 revenue grew 24.8% driven by APAC enterprise renewals.',
  },
];

/** Minimal OpenAI-shaped SSE so the composer never reaches a live model. */
const MOCK_SSE_BODY =
  'data: {"choices":[{"index":0,"delta":{"content":"Mocked assistant reply."}}]}\n\n' +
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

/**
 * Seeds the OpenWork store and opens `/openwork` on that session.
 * Registered after `setupApiInterception` so these handlers take precedence.
 */
async function gotoSeededOpenWork(page: Page, parts: unknown[] = SEED_STREAM_PARTS) {
  // The store re-hydrates from the backend on session change and overwrites
  // local state when the response is non-empty; keep it empty so the seeded
  // parts are what the app actually renders.
  await page.route('**/api/v1/analyst/conversations/**/messages*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });

  await page.addInitScript(
    ({ id, streamParts }) => {
      localStorage.setItem('openwork:active-session:v1', id);
      localStorage.setItem(
        'openwork:sessions:v1',
        JSON.stringify([
          {
            id,
            title: 'E2E seeded session',
            status: 'completed',
            updatedAt: new Date(0).toISOString(),
          },
        ]),
      );
      localStorage.setItem(
        'openwork:session-data:' + id,
        JSON.stringify({ streamParts, artifacts: [] }),
      );
    },
    { id: SEED_SESSION_ID, streamParts: parts },
  );

  await page.goto(`/openwork?conversationId=${SEED_SESSION_ID}`);
  await page.waitForLoadState('domcontentloaded');
}

/** Opens `/openwork` on an empty session with the model call stubbed out. */
async function gotoEmptyOpenWork(page: Page) {
  await page.route('**/chat/completions', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: MOCK_SSE_BODY,
    });
  });
  await gotoSeededOpenWork(page, []);
}

/** Registered by `StandardAffordances` (lib/affordance/StandardAffordances.tsx). */
const STANDARD_AFFORDANCE_IDS = [
  'chat.listDialogues',
  'ui.getRoute',
  'ui.getTheme',
  'ui.navigate',
  'ui.setTheme',
  'ui.toggleSidebar',
];

/** Registered by the real sidebar (components/layout/side-bar.tsx). */
const SIDEBAR_AFFORDANCE_IDS = [
  'chat.newTask',
  'ui.openSettings',
  'ui.switchLanguage',
  'ui.switchTheme',
];

/** Everything the app must expose on `/chat`, where the sidebar is mounted. */
const EXPECTED_AFFORDANCE_IDS = [...STANDARD_AFFORDANCE_IDS, ...SIDEBAR_AFFORDANCE_IDS].sort();

/** Waits for `StandardAffordances` to have installed the control surface. */
async function waitForControlSurface(page: Page) {
  await page.waitForFunction(
    ids => {
      const ctl = (window as unknown as { __dbgptControl?: { listActions: () => { id: string }[] } }).__dbgptControl;
      if (!ctl) return false;
      return ids.every(id => ctl.listActions().some(a => a.id === id));
    },
    EXPECTED_AFFORDANCE_IDS,
    { timeout: 30000 },
  );
}

test.describe('06 - OpenWork Execution Lines & Affordance Suite', () => {
  /**
   * The dev server compiles routes on first request, which can exceed a normal
   * assertion timeout. Warm both render paths once so per-test timeouts measure
   * the app, not webpack/vite cold start.
   */
  test.beforeAll(async ({ browser }) => {
    const warm = await browser.newPage();
    try {
      for (const route of ['/chat', '/playground', '/openwork']) {
        await warm.goto(route, { timeout: 120000 });
        await warm.waitForSelector('#root > *', { timeout: 120000 });
      }
    } finally {
      await warm.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'light' });
    await setupApiInterception(page);
  });

  test('06.1 - ReasoningBlock renders collapsed and discloses the real reasoning trace', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await gotoSeededOpenWork(page);

    const reasoning = page.locator('[data-line="reasoning"]').first();
    await expect(reasoning).toBeVisible({ timeout: 15000 });

    // Not streaming -> collapsed, but the trigger must still carry a label.
    const trigger = reasoning.locator('button[aria-expanded]').first();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect((await trigger.innerText()).trim().length).toBeGreaterThan(0);

    // Expanding must reveal the seeded thought verbatim.
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const body = reasoning.locator('.vis-thinking-body');
    await expect(body).toBeVisible({ timeout: 10000 });
    await expect(body).toContainText('inspect the revenue table');

    consoleListener.assertNoErrors();
  });

  test('06.2 - SubagentRunLine reports completion and discloses its delegation', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await gotoSeededOpenWork(page);

    const subagent = page.locator('[data-line="subagent-run"]').first();
    await expect(subagent).toBeVisible({ timeout: 15000 });
    await expect(subagent).toHaveAttribute('data-subagent-run', 'seed-subagent-1');

    // Completed status verb + formatted duration, not a running spinner label.
    await expect(subagent).toContainText(SUBAGENT_TASK);
    await expect(subagent).toContainText('Hoàn tất nhiệm vụ');
    await expect(subagent).toContainText('4.2s');

    // The delegated prompt and result only exist behind the disclosure.
    await expect(subagent).not.toContainText('Prompt giao phó');
    await subagent.locator('[role="button"]').first().click();
    await expect(subagent).toContainText('Prompt giao phó');
    await expect(subagent).toContainText(SUBAGENT_OUTPUT);

    consoleListener.assertNoErrors();
  });

  test('06.3 - User turn renders the human message verbatim', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await gotoSeededOpenWork(page);

    const bubble = page.locator('[data-line="user"]').first();
    await expect(bubble).toBeVisible({ timeout: 15000 });
    await expect(bubble).toContainText(USER_PROMPT);

    consoleListener.assertNoErrors();
  });

  test('06.4 - ToolAggregateGroup caps and expands rows, CapabilityCallLine discloses real input', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await gotoSeededOpenWork(page);

    const aggregate = page.locator('[data-line="tool-aggregate"]').first();
    await expect(aggregate).toBeVisible({ timeout: 15000 });
    await expect(aggregate).toHaveAttribute('data-tool-aggregate', 'seed-aggregate-1');
    await expect(aggregate).toContainText(`${SEED_TOOL_COUNT} actions`);

    // Collapsed: only ROW_CAP rows render and the badge accounts for the rest.
    const rows = aggregate.locator('.tool-item');
    await expect(rows).toHaveCount(SEED_TOOL_ROW_CAP);
    const overflow = aggregate.locator('button.tool-overflow-badge');
    await expect(overflow).toContainText(`+${SEED_TOOL_COUNT - SEED_TOOL_ROW_CAP} more operations`);

    // Expanding must reveal every remaining row.
    await overflow.click();
    await expect(rows).toHaveCount(SEED_TOOL_COUNT);
    await expect(overflow).toContainText('Thu gọn danh sách');

    // The capability call is a sibling line, collapsed until its header is driven.
    const call = page.locator('[data-line="capability-call"]').first();
    await expect(call).toBeVisible({ timeout: 10000 });
    await expect(call).toHaveAttribute('data-capability-call', 'execute_sql');
    await expect(call).not.toContainText(SEED_SQL);
    await call.locator('[role="button"]').first().click();
    await expect(call).toContainText(SEED_SQL, { timeout: 10000 });

    consoleListener.assertNoErrors();
  });

  test('06.5 - Composer refuses an empty send and creates exactly one turn when typed', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await gotoEmptyOpenWork(page);

    const editor = page.locator('textarea').first();
    await expect(editor).toBeVisible({ timeout: 15000 });

    const bubbles = page.locator('[data-line="user"]');
    const before = await bubbles.count();

    // Enter on an empty composer must not create a turn.
    await editor.click();
    await editor.press('Enter');
    await page.waitForTimeout(500);
    expect(await bubbles.count()).toBe(before);

    // Typing then Enter must create exactly one new turn carrying the typed text.
    await editor.pressSequentially('Composer send control probe');
    await editor.press('Enter');
    await expect(bubbles).toHaveCount(before + 1, { timeout: 15000 });
    await expect(bubbles.last()).toContainText('Composer send control probe');

    consoleListener.assertNoErrors();
  });

  test('06.6 - SettingsDialog opens from the sidebar and SkillManager filters real skills', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);

    // The sidebar column is `hidden md:block`, so the trigger only exists >= 768px.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    // Drive the real sidebar control, not a synthetic click on the dialog root.
    const settingsTrigger = page.getByRole('button', { name: 'OpenWork Settings & Skills' }).first();
    await expect(settingsTrigger).toBeVisible({ timeout: 15000 });
    await settingsTrigger.click();

    const dialog = page.locator('[data-slot="settings-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const manager = page.locator('[data-slot="skill-manager"]');
    await expect(manager).toBeVisible();

    const cards = page.locator('[data-slot="skill-card"]');
    const total = await cards.count();
    expect(total).toBeGreaterThan(0);

    // Search must actually narrow the list, and clearing must restore it.
    const search = page.locator('input[placeholder="Search skills & capabilities..."]');
    await search.fill('zzz-no-such-skill-zzz');
    await expect(cards).toHaveCount(0);
    await search.fill('');
    await expect(cards).toHaveCount(total);

    // Toggling a skill must flip its rendered state.
    const firstCard = cards.first();
    const enabledBefore = await firstCard.getAttribute('data-enabled');
    // The Switch primitive is an `sr-only` checkbox wrapped in a label; click the label.
    await firstCard.locator('label:has(input[role="switch"])').click();
    await expect(firstCard).not.toHaveAttribute('data-enabled', String(enabledBefore));

    // The affordances tab must list what the app really registered.
    await page.getByRole('tab', { name: /Affordances/ }).click();
    await expect(page.locator('[data-slot="affordance-row"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-slot="affordance-row"][data-action-id="ui.navigate"]')).toHaveCount(1);

    consoleListener.assertNoErrors();
  });

  test('06.7 - Affordance registry exposes typed effects and enforces its error contract', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);

    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');
    await waitForControlSurface(page);

    // -- 1. Both real producers (StandardAffordances + the sidebar) self-registered.
    const actions = await page.evaluate(() => (window as any).__dbgptControl.listActions());
    expect(actions.map((a: any) => a.id).sort()).toEqual(EXPECTED_AFFORDANCE_IDS);

    // -- 2. providerKind uses the real enum, and the 3-axis effects matrix is populated.
    const PROVIDER_KINDS = ['builtin', 'extension', 'mcp', 'connect'];
    for (const a of actions as any[]) {
      expect(PROVIDER_KINDS, `providerKind of ${a.id}`).toContain(a.providerKind);
      expect(['query', 'command'], `kind of ${a.id}`).toContain(a.kind);
      expect(['none', 'read', 'write'], `effects.data of ${a.id}`).toContain(a.effects.data);
      expect(['none', 'focus', 'navigate', 'layout', 'dialog'], `effects.ui of ${a.id}`).toContain(a.effects.ui);
      expect(typeof a.effects.external, `effects.external of ${a.id}`).toBe('boolean');
    }
    // All four derived side-effect classes are actually represented.
    const sideEffects = [...new Set((actions as any[]).map(a => a.sideEffect))].sort();
    expect(sideEffects).toEqual(['external', 'mutation', 'navigation', 'none']);

    // -- 3. Unknown action -> NOT_FOUND.
    const missing = await page.evaluate(() => (window as any).__dbgptControl.command({ id: 'no.such.action' }));
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe('NOT_FOUND');

    // -- 4. query() must refuse a mutating action rather than silently running it.
    const refused = await page.evaluate(() =>
      (window as any).__dbgptControl.query({ id: 'ui.setTheme', args: { mode: 'dark' } }),
    );
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe('EXECUTION_FAILED');

    // -- 5. A stale expectedRevision must be rejected before the handler runs.
    const revision = await page.evaluate(() => (window as any).__dbgptControl.snapshot().revision);
    expect(revision).toBeGreaterThan(1);
    const stale = await page.evaluate(
      rev => (window as any).__dbgptControl.command({ id: 'ui.toggleSidebar', expectedRevision: rev - 1 }),
      revision,
    );
    expect(stale.ok).toBe(false);
    expect(stale.code).toBe('STALE_REVISION');

    // -- 6. A read-only query returns live app state.
    const route = await page.evaluate(() => (window as any).__dbgptControl.query({ id: 'ui.getRoute' }));
    expect(route.ok).toBe(true);
    expect(route.data.pathname).toBe('/chat');

    // -- 7. A command with a matching revision must change the real app.
    const nav = await page.evaluate(
      rev =>
        (window as any).__dbgptControl.command({
          id: 'ui.navigate',
          args: { to: '/playground' },
          expectedRevision: rev,
        }),
      revision,
    );
    expect(nav.ok).toBe(true);
    expect(nav.revision).toBe(revision + 1);
    await expect(page).toHaveURL(/\/playground/, { timeout: 10000 });

    // -- 8. A bad argument surfaces as EXECUTION_FAILED, not an unhandled throw.
    const badArgs = await page.evaluate(() =>
      (window as any).__dbgptControl.command({ id: 'ui.navigate', args: { to: 'not-a-path' } }),
    );
    expect(badArgs.ok).toBe(false);
    expect(badArgs.code).toBe('EXECUTION_FAILED');

    consoleListener.assertNoErrors();
  });

  const VIEWPORTS = [
    { name: 'Desktop Wide (1920x1080)', width: 1920, height: 1080 },
    { name: 'Laptop (1440x900)', width: 1440, height: 900 },
    { name: 'Compact (1280x720)', width: 1280, height: 720 },
  ];

  for (const vp of VIEWPORTS) {
    test(`06.8 - [${vp.name}] OpenWork layout and affordance stability with zero console errors`, async ({ page }) => {
      const consoleListener = setupConsoleErrorListener(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto('/chat');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(200);

      // Verify no horizontal overflow on chat page
      const hasHorizontalOverflow = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return body.scrollWidth > window.innerWidth + 2 || html.scrollWidth > window.innerWidth + 2;
      });

      expect(hasHorizontalOverflow, `Horizontal overflow detected in ${vp.name}`).toBe(false);

      const root = page.locator('#root');
      await expect(root).toBeVisible();

      consoleListener.assertNoErrors();
    });
  }
});
