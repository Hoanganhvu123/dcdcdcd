import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureUserLoggedIn, setupConsoleErrorListener } from './test-helpers';

/**
 * 05 - Kimi visual parity.
 *
 * Locks the numbers measured off kimi.com on 2026-08-23 (see the composer and
 * sidebar rules in new-components/chat/input/styles/ and components/layout/
 * side-bar.tsx). These are computed-style assertions, not screenshots: the
 * browser pane in this environment never composites, and a pixel diff would
 * also fail on unrelated content churn. What matters is the geometry and the
 * token wiring, and those are exactly what computed style reports.
 *
 * Kimi's reference values:
 *   composer   768px cap, 24px radius, 0.8px hairline, two-part shadow
 *   send       36x36 round, ink fill + inverted glyph, --Fills-F3 when disabled
 *   sidebar    240px, rows h36/r10, new-chat h46/r12 with a 0.8px hairline
 *   accent     KMBlue #1783ff -- emerald appears nowhere in Kimi's palette
 */

const KIMI_SHADOW = 'rgba(0, 0, 0, 0.03) 0px 4px 12px 0px, rgba(0, 0, 0, 0.07) 0px 5px 16px -4px';

/** Read a computed-style bag for one selector, in a single round-trip. */
async function styleOf(page: import('@playwright/test').Page, selector: string, props: string[]) {
  return page.evaluate(
    ({ selector, props }) => {
      const el = document.querySelector(selector);
      if (!el) {
        return null;
      }
      const cs = getComputedStyle(el);
      const out: Record<string, string> = {};
      for (const p of props) {
        out[p] = cs.getPropertyValue(p);
      }
      out.__width = String(Math.round(el.getBoundingClientRect().width));
      out.__height = String(Math.round(el.getBoundingClientRect().height));
      return out;
    },
    { selector, props },
  );
}

/** True when some loaded rule authors a 0.8px border for `selector`. */
async function authoredHairline(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate(sel => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = (sheet as CSSStyleSheet).cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        const r = rule as CSSStyleRule;
        if (r.selectorText === sel && /(^|\s)0\.8px(\s|$)/.test(r.style.border || r.style.borderWidth || '')) {
          return true;
        }
      }
    }
    return false;
  }, selector);
}

test.describe('05 - Kimi visual parity', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'light' });
  });

  test('05.1 - landing composer matches Kimi geometry', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('.chat-input-wrapper', { timeout: 20000 });

    const card = await styleOf(page, '.chat-input-wrapper', [
      'max-width',
      'border-radius',
      'border-top-width',
      'border-top-style',
      'box-shadow',
      'background-color',
      'padding-top',
      'padding-bottom',
      'padding-left',
    ]);

    expect(card).not.toBeNull();
    expect(card!['max-width']).toBe('768px');
    expect(card!['border-radius']).toBe('24px');
    // Chromium snaps the *used* border width to a whole device pixel at DPR 1,
    // so computed style reports 1px for Kimi's 0.8px hairline. Assert the
    // authored declaration, which is what actually has to match.
    expect(await authoredHairline(page, '.chat-input-wrapper')).toBe(true);
    expect(Number(card!['border-top-width'].replace('px', ''))).toBeLessThanOrEqual(1);
    expect(card!['border-top-style']).toBe('solid');
    expect(card!['box-shadow']).toBe(KIMI_SHADOW);
    // Light scheme: the composer sits on --Bg-Primary, one step above the page.
    expect(card!['background-color']).toBe('rgb(255, 255, 255)');
    expect(card!['padding-top']).toBe('12px');
    expect(card!['padding-bottom']).toBe('10px');
    expect(card!['padding-left']).toBe('16px');
    // The 768 cap is the contract; whether it actually binds depends on how much
    // room the shell leaves (sidebar 240 + a 280px right panel), so only assert
    // the exact width where there is demonstrably room for it.
    const landingWidth = Number(card!.__width);
    expect(landingWidth).toBeLessThanOrEqual(768);
    if ((page.viewportSize()?.width ?? 0) >= 1440) {
      expect(landingWidth).toBe(768);
    }
  });

  test('05.2 - send button is a 36px round ink pill that inverts when enabled', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('.chat-input-submit', { timeout: 20000 });

    const idle = await styleOf(page, '.chat-input-submit', ['border-radius', 'background-color', 'color']);
    expect(idle).not.toBeNull();
    // Subpixel layout can round 36 to 37 depending on where the row lands.
    expect(Math.abs(Number(idle!.__width) - 36)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(idle!.__height) - 36)).toBeLessThanOrEqual(1);
    expect(idle!['border-radius']).toBe('9999px');
    // Empty input: --Fills-F3 with a quaternary glyph, the way Kimi greys it out.
    expect(idle!['background-color']).toBe('rgba(0, 0, 0, 0.15)');

    await page.fill('.chat-input-textarea', 'hello');
    // Enabled: ink fill, glyph in the composer's own surface colour. toHaveCSS
    // retries, which matters here -- the fill crosses a 0.15s transition.
    const submit = page.locator('.chat-input-submit');
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.9)');
    await expect(submit).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('05.3 - in-conversation composer keeps the card and puts tools under the textarea', async ({ page, request }) => {
    let convUid: string | undefined;
    try {
      const created = await request.post(
        'http://127.0.0.1:5670/api/v1/chat/dialogue/new?chat_mode=chat_normal',
        { timeout: 3000 },
      );
      if (!created.ok()) {
        test.skip(true, 'backend on :5670 is not reachable');
        return;
      }
      convUid = (await created.json())?.data?.conv_uid;
    } catch (err: any) {
      test.skip(true, `backend on :5670 is not reachable: ${err?.message || err}`);
      return;
    }
    test.skip(!convUid, 'backend returned no conv_uid');

    await page.goto(`/chat?scene=chat_normal&id=${convUid}`);
    await page.waitForSelector('.chat-input-panel-wrapper', { timeout: 20000 });

    const card = await styleOf(page, '.chat-input-panel-wrapper', [
      'border-radius',
      'border-top-width',
      'box-shadow',
      'background-color',
      'flex-direction',
      'padding-top',
      'padding-left',
      'padding-bottom',
    ]);
    expect(card).not.toBeNull();
    expect(card!['border-radius']).toBe('24px');
    expect(Number(card!['border-top-width'].replace('px', ''))).toBeLessThanOrEqual(1);
    expect(card!['box-shadow']).toBe(KIMI_SHADOW);
    expect(card!['background-color']).toBe('rgb(255, 255, 255)');
    expect(card!['flex-direction']).toBe('column');
    expect(card!['padding-top']).toBe('12px');
    expect(card!['padding-left']).toBe('16px');
    expect(card!['padding-bottom']).toBe('10px');
    const container = await styleOf(page, '.chat-input-panel-container', ['max-width']);
    expect(container!['max-width']).toBe('768px');
    // The card fills the stage minus its 2x16 padding, matching Kimi's
    // .publisher-stage. The stage itself is capped at 768 but yields to the
    // shell on narrow viewports, so compare against what the stage actually got.
    expect(Number(card!.__width)).toBe(Number(container!.__width) - 32);
    expect(Number(container!.__width)).toBeLessThanOrEqual(768);

    // Tool row below the textarea, send button last in it.
    const order = await page.evaluate(() => {
      const wrapper = document.querySelector('.chat-input-panel-wrapper');
      const textarea = wrapper?.querySelector('.chat-input-panel-textarea');
      const footer = wrapper?.querySelector('.chat-input-panel-footer');
      if (!textarea || !footer) {
        return null;
      }
      return {
        footerAfterTextarea: !!(textarea.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING),
        submitIsLastChild: footer.lastElementChild?.classList.contains('chat-input-panel-submit') ?? false,
      };
    });
    expect(order).toEqual({ footerAfterTextarea: true, submitIsLastChild: true });
  });

  test('05.4 - sidebar matches Kimi rail metrics', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('aside', { timeout: 20000 });

    const rail = await styleOf(page, 'aside', ['background-color']);
    expect(rail).not.toBeNull();
    expect(rail!.__width).toBe('240');

    const newChat = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('aside a')).find(a => a.querySelector('kbd'));
      if (!link) {
        return null;
      }
      const cs = getComputedStyle(link);
      return {
        height: Math.round(link.getBoundingClientRect().height),
        radius: cs.borderTopLeftRadius,
        borderWidth: Number(cs.borderTopWidth.replace('px', '')) <= 1,
        background: cs.backgroundColor,
      };
    });
    expect(newChat).toEqual({
      height: 46,
      radius: '12px',
      borderWidth: true,
      background: 'rgb(255, 255, 255)',
    });

    // Kimi draws no separator between the rail and the page.
    await expect(page.locator('aside')).toHaveCSS('border-right-width', '0px');

    // Nav rows, measured on kimi.com: 40px tall, 12px radius, full-strength
    // label ink. Only the background moves between idle, hover and active.
    const rows = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('aside a')).filter(
        a => getComputedStyle(a).borderTopLeftRadius === '12px' && !a.querySelector('kbd'),
      );
      return links.slice(0, 3).map(a => ({
        height: Math.round(a.getBoundingClientRect().height),
        color: getComputedStyle(a).color,
      }));
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.height).toBe(40);
      expect(row.color).toBe('rgba(0, 0, 0, 0.9)'); // --Labels-Primary
    }
  });

  // The regression the user hit: /chat mounted a second, pre-Kimi sidebar
  // ("Danh sách Cuộc thoại") next to the app rail. Kimi shows exactly one.
  test('05.9 - chat route mounts exactly one sidebar', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('aside', { timeout: 20000 });

    await expect(page.locator('aside')).toHaveCount(1);
    await expect(page.locator('.ant-layout-sider')).toHaveCount(0);
    await expect(page.getByText('Danh sách Cuộc thoại')).toHaveCount(0);
  });

  test('05.5 - palette is Kimi KMBlue with no emerald left anywhere', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('aside', { timeout: 20000 });

    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const read = (n: string) => cs.getPropertyValue(n).trim();
      return {
        composer: read('--kimi-composer'),
        accent: read('--kimi-accent'),
        text: read('--kimi-text'),
        border: read('--kimi-border'),
      };
    });
    expect(tokens.composer).toBe('#ffffff');
    expect(tokens.accent.toLowerCase()).toBe('#1783ff');
    expect(tokens.text).toBeTruthy();
    expect(tokens.border).toBeTruthy();

    // The repo used to ship a fabricated "Kimi Emerald" (#00a98f). Nothing in
    // Kimi's palette is that colour, so any reappearance is a regression.
    const emeraldHits = await page.evaluate(() => {
      const hits: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = (sheet as CSSStyleSheet).cssRules;
        } catch {
          continue; // cross-origin sheet
        }
        for (const rule of Array.from(rules)) {
          const text = rule.cssText;
          if (/#00a98f|#00c9a7|0,\s*169,\s*143/i.test(text)) {
            hits.push(text.slice(0, 160));
          }
        }
      }
      return hits;
    });
    expect(emeraldHits, `stale emerald palette found:\n${emeraldHits.join('\n')}`).toEqual([]);
  });

  // Source scan, not a page scan: antd 6.6.0 ships #1677ff throughout its own
  // stylesheets, so a runtime sweep of document.styleSheets would fire on the
  // vendor CSS. These are the files on the chat path, swept on 2026-08-23; the
  // construct/mobile screens still carry the old hexes and are a later pass.
  test('05.10 - chat path carries no pre-Kimi antd palette', () => {
    const root = join(__dirname, '..', 'frontend');
    const swept = [
      'new-components/chat/content/ChatContent.tsx',
      'new-components/chat/content/SessionTurn.tsx',
      'new-components/chat/content/OpencodeSessionTurn.tsx',
      'new-components/chat/content/Feedback.tsx',
      'new-components/chat/ChatContentContainer.tsx',
      'new-components/chat/input/ToolsBar.tsx',
      'new-components/chat/input/styles/enhanced-chat-input.css',
      'new-components/chat/input/styles/standalone-chat-input.css',
      'new-components/chat/header/styles/chat-header.css',
      'new-components/layout/styles/header.css',
      'new-components/app/styles/TabContent.css',
      'components/chat/chat-content/VisAppLink.tsx',
      'components/flow/styles/add-nodes-sider.css',
    ];
    // antd blue, antd gradient partner, and the two greys the pre-Kimi theme
    // used for primary and secondary label ink.
    // No /g: RegExp.test keeps lastIndex on a global regex and would skip
    // every other match.
    const stale = /#1677ff|#31afff|#0c75fc|#1c2533|#525964|rgba\( ?12, ?117, ?252|rgba\( ?22, ?119, ?255|rgba\( ?49, ?175, ?255/i;

    const hits = swept.flatMap(rel =>
      readFileSync(join(root, rel), 'utf8')
        .split('\n')
        .flatMap((line, i) => (stale.test(line) ? [`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`] : [])),
    );
    expect(hits, `pre-Kimi palette is back:\n${hits.join('\n')}`).toEqual([]);
  });

  test('05.7 - a vis-thinking block renders as Kimi indented trace', async ({ page, request }) => {
    let convUid: string | undefined;
    try {
      const created = await request.post(
        'http://127.0.0.1:5670/api/v1/chat/dialogue/new?chat_mode=chat_normal',
        { timeout: 3000 },
      );
      if (!created.ok()) {
        test.skip(true, 'backend on :5670 is not reachable');
        return;
      }
      convUid = (await created.json())?.data?.conv_uid;
    } catch (err: any) {
      test.skip(true, `backend on :5670 is not reachable: ${err?.message || err}`);
      return;
    }
    test.skip(!convUid, 'backend returned no conv_uid');

    // The configured deepseek-v4-flash runs with thinking_enabled = false, so a
    // real round-trip never emits a reasoning block. Serve the exact payload
    // VisThinking.sync_display() produces instead -- six-backtick fence and all
    // -- so the markdown pipeline and the component are the things under test,
    // not the model.
    const trace = ['Step one: read the schema.', 'Step two: pick the join key.'].join('\n');
    await page.route('**/api/v1/chat/dialogue/messages/history**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          err_code: null,
          err_msg: null,
          data: [
            { role: 'human', context: 'why?', order: 1, time_stamp: null, model_name: 'x', feedback: {} },
            {
              role: 'view',
              context: ['``````vis-thinking', trace, '``````', '', 'Because of the join key.'].join('\n'),
              order: 1,
              time_stamp: null,
              model_name: 'x',
              feedback: {},
            },
          ],
        }),
      });
    });

    await page.goto(`/chat?scene=chat_normal&id=${convUid}`);

    const traceBody = page.locator('.vis-thinking-body').first();
    await expect(traceBody).toBeVisible({ timeout: 20000 });
    // pre-wrap must survive: without it every reasoning step collapses into one
    // paragraph, which is the bug this render replaced.
    await expect(traceBody).toContainText('Step one');
    await expect(traceBody).toContainText('Step two');
    const boxHeight = await traceBody.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(boxHeight, 'two lines at 24px line-height should not collapse to one').toBeGreaterThan(30);

    // Measured on a live kimi.com replay: 14px/24px secondary ink, indented to
    // the 28px icon gutter, with no card, no fill and no border of any kind.
    await expect(traceBody).toHaveCSS('color', 'rgba(0, 0, 0, 0.56)');
    await expect(traceBody).toHaveCSS('white-space', 'pre-wrap');
    await expect(traceBody).toHaveCSS('font-size', '14px');
    await expect(traceBody).toHaveCSS('line-height', '24px');
    await expect(traceBody).toHaveCSS('padding-left', '28px');
    await expect(traceBody).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    for (const side of ['top', 'right', 'bottom', 'left']) {
      await expect(traceBody).toHaveCSS(`border-${side}-width`, '0px');
    }

    // The header row collapses the trace.
    const header = page.locator('button[aria-expanded="true"]').first();
    await expect(header).toBeVisible();
    await header.click();
    await expect(traceBody).toBeHidden();
  });

  test('05.6 - reasoning-trace ink token resolves to Kimi secondary label', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);
    await page.goto('/chat');
    await page.waitForSelector('aside', { timeout: 20000 });

    // Geometry is asserted against the real element in 05.7. That test needs a
    // conversation, so it skips when :5670 is down -- and styles/vis-thinking.css
    // is colocated with the component, so it is not in the bundle on a landing
    // route to probe against anyway. What is always checkable here is the token
    // the trace is painted with: it is global, and it is what dies if the token
    // layer is renamed or the cascade-layer bug comes back.
    const ink = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--kimi-text-2').trim(),
    );
    expect(ink).toBe('rgba(0, 0, 0, 0.56)'); // --Labels-Secondary

    consoleListener.assertNoErrors();
  });
});

test.describe('05 - Kimi visual parity (dark)', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'dark' });
  });

  // Every composer surface resolves through a --kimi-* token, so dark is only
  // correct if the whole chain flips. An earlier hand-probe read light alphas
  // here and looked like a bug; it was a mid-transition sample (border-color
  // and background both animate over 0.15s). toHaveCSS retries, so it settles.
  test('05.8 - composer inverts cleanly in dark', async ({ page }) => {
    const consoleListener = setupConsoleErrorListener(page);

    await page.goto('/chat');
    await page.waitForSelector('.chat-input-wrapper', { timeout: 20000 });

    await expect(page.locator('html')).toHaveClass(/dark/);

    const tokens = await page.evaluate(() =>
      ['--kimi-composer', '--kimi-border-input', '--kimi-fill-3', '--kimi-faint', '--kimi-text'].reduce(
        (acc: Record<string, string>, k) => {
          acc[k] = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
          return acc;
        },
        {},
      ),
    );
    expect(tokens).toEqual({
      '--kimi-composer': '#1f1f1f',
      '--kimi-border-input': 'rgba(255, 255, 255, 0.21)',
      '--kimi-fill-3': 'rgba(255, 255, 255, 0.18)',
      '--kimi-faint': 'rgba(255, 255, 255, 0.26)',
      '--kimi-text': 'rgba(255, 255, 255, 0.84)',
    });

    const card = page.locator('.chat-input-wrapper');
    await expect(card).toHaveCSS('background-color', 'rgb(31, 31, 31)');
    await expect(card).toHaveCSS('border-top-color', 'rgba(255, 255, 255, 0.21)');
    await expect(card).toHaveCSS('border-top-style', 'solid');

    const submit = page.locator('.chat-input-submit');
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.18)');
    await expect(submit).toHaveCSS('color', 'rgba(255, 255, 255, 0.26)');

    // Enabled is the same ink/inverted-glyph swap as light, read off the
    // flipped tokens: fill becomes --kimi-text, glyph becomes --kimi-composer.
    await page.fill('.chat-input-textarea', 'dark mode check');
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.84)');
    await expect(submit).toHaveCSS('color', 'rgb(31, 31, 31)');

    consoleListener.assertNoErrors();
  });
});
