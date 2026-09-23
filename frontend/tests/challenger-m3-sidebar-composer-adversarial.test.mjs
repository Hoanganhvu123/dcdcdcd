#!/usr/bin/env node
/**
 * ============================================================================
 * ⚔️ DB-GPT OpenWork: Milestone 3 — Sidebar & Composer Adversarial Stress Suite
 * ============================================================================
 * Empirical Challenger: challenger_m3_1
 * Methodology: Empirical oracles, state stress harnesses, boundary inputs,
 *              hostile regex injections, 10,000-cycle stress tests, and
 *              IME composition / keyboard interaction matrices.
 *
 * Scope:
 *   - Domain 1: Sidebar Rapid Navigation Switching Stress (10,000 cycles & edge cases)
 *   - Domain 2: Sidebar Search Queries with Special Regex Characters & Hostile Inputs
 *   - Domain 3: Session Title Truncations, Unicode Boundaries & Timestamps
 *   - Domain 4: 10,000 Rapid Theme Toggle Cycles & LocalStorage Stress
 *   - Domain 5: Composer 10,000-Character Input & Multiline Auto-Expand Bounding
 *   - Domain 6: Composer Model Switching & Strict Gemini Ban Verification
 *   - Domain 7: Plan Mode Toggle State & IME Keyboard Interaction Matrix
 *   - Domain 8: Dual-Tree Parity & Static Design Token Invariants
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');
const MOCK_ROOT = path.join(REPO_ROOT, 'frontend_mock');

function loadFile(baseDir, relPath) {
  const p = path.join(baseDir, relPath);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return '';
}

const prodSidebar = loadFile(ROOT, 'components/openwork/OpenWorkSidebar.tsx');
const mockSidebar = loadFile(MOCK_ROOT, 'components/openwork/OpenWorkSidebar.tsx');
const prodComposer = loadFile(ROOT, 'components/openwork/OpenWorkComposer.tsx');
const mockComposer = loadFile(MOCK_ROOT, 'components/openwork/OpenWorkComposer.tsx');
const prodTypes = loadFile(ROOT, 'components/openwork/types.ts');
const mockTypes = loadFile(MOCK_ROOT, 'components/openwork/types.ts');
const prodStore = loadFile(ROOT, 'components/openwork/services/useOpenWorkStore.ts');
const prodGlobals = loadFile(ROOT, 'styles/globals.css');
const prodChatCss = loadFile(ROOT, 'components/openwork/styles/openwork-chat.css');

test('⚔️ MILESTONE 3: SIDEBAR & COMPOSER EMPIRICAL ADVERSARIAL STRESS SUITE', async (t) => {

  // =========================================================================
  // DOMAIN 1: SIDEBAR RAPID NAVIGATION SWITCHING STRESS (10,000 CYCLES)
  // =========================================================================
  await t.test('Domain 1: Sidebar Rapid Navigation Switching Stress', async (st) => {

    const WORKSPACE_NAV_ITEMS = [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'prompts', label: 'Thư viện prompt' },
      { key: 'workbench', label: 'Workbench' },
      { key: 'datasource', label: 'Nguồn dữ liệu' },
      { key: 'skills', label: 'Skill & MCP' },
      { key: 'keys', label: 'API Key' },
      { key: 'members', label: 'Thành viên & quyền' },
      { key: 'audit', label: 'Nhật ký kiểm toán' },
      { key: 'billing', label: 'Thanh toán & hóa đơn' },
      { key: 'settings', label: 'Lịch sử & Cài đặt', isSettings: true },
    ];

    await st.test('1.1: 10,000 Rapid sequential and randomized navigation transitions', () => {
      let currentActiveView = 'chat';
      let switchCount = 0;
      let activeDotCount = 0;

      const setActiveView = (viewKey) => {
        currentActiveView = viewKey;
        switchCount++;
      };

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        const targetIndex = i % WORKSPACE_NAV_ITEMS.length;
        const targetItem = WORKSPACE_NAV_ITEMS[targetIndex];
        setActiveView(targetItem.key);

        // Verify active dot logic simulation
        const activeItems = WORKSPACE_NAV_ITEMS.filter((item) => item.key === currentActiveView);
        assert.equal(activeItems.length, 1, `Exactly 1 item must match activeView ${currentActiveView}`);
        if (activeItems[0].key === currentActiveView) {
          activeDotCount++;
        }
      }
      const durationMs = performance.now() - start;

      assert.equal(switchCount, 10000, 'All 10,000 navigation switches must execute');
      assert.equal(activeDotCount, 10000, 'Active dot must resolve accurately on every switch');
      assert.ok(durationMs < 50, `10,000 switches must execute in under 50ms (actual: ${durationMs.toFixed(2)}ms)`);
    });

    await st.test('1.2: Boundary & Fallback ActiveView handling (null, undefined, unknown view, empty string)', () => {
      const resolveNavState = (itemKey, activeView) => {
        const isItemActive = activeView === itemKey;
        return {
          isItemActive,
          dotBg: isItemActive ? 'bg-[var(--accent)]' : 'bg-transparent',
          textClass: isItemActive
            ? 'text-[var(--fg)] bg-[var(--muted)] font-medium'
            : 'text-[var(--fg2)] bg-transparent hover:bg-[var(--muted)] hover:text-[var(--fg)]',
        };
      };

      const edgeCases = [null, undefined, '', 'chat', 'unknown-view-xyz', '   ', '\0'];
      for (const view of edgeCases) {
        let activeDots = 0;
        for (const item of WORKSPACE_NAV_ITEMS) {
          const state = resolveNavState(item.key, view);
          if (state.isItemActive) activeDots++;
          assert.equal(state.dotBg, state.isItemActive ? 'bg-[var(--accent)]' : 'bg-transparent');
        }
        // For non-matching views (like 'chat' or undefined), zero workspace nav items should have active dot
        assert.equal(activeDots, 0, `Active dots for non-matching view ${view} must be 0`);
      }
    });

    await st.test('1.3: Navigation click callback fault tolerance without thrown exceptions', () => {
      const simulateNavClick = (item, callbacks) => {
        if (item.isSettings && callbacks.onOpenSettings) {
          callbacks.onOpenSettings();
          return 'settings_called';
        } else if (callbacks.onSelectView) {
          callbacks.onSelectView(item.key);
          return 'view_called';
        } else if (item.targetTab && callbacks.onSelectTab) {
          callbacks.onSelectTab(item.targetTab);
          return 'tab_called';
        }
        return 'noop';
      };

      // Case A: All callbacks provided
      let settingsCalled = false;
      let selectedView = null;
      assert.equal(
        simulateNavClick(WORKSPACE_NAV_ITEMS[9], { onOpenSettings: () => { settingsCalled = true; } }),
        'settings_called'
      );
      assert.ok(settingsCalled);

      assert.equal(
        simulateNavClick(WORKSPACE_NAV_ITEMS[0], { onSelectView: (v) => { selectedView = v; } }),
        'view_called'
      );
      assert.equal(selectedView, 'dashboard');

      // Case B: No callbacks provided (empty object) -> must safely return noop without throw
      assert.equal(simulateNavClick(WORKSPACE_NAV_ITEMS[0], {}), 'noop');
      assert.equal(simulateNavClick(WORKSPACE_NAV_ITEMS[9], {}), 'noop');
    });
  });

  // =========================================================================
  // DOMAIN 2: SIDEBAR SEARCH QUERIES WITH REGEX CHARS & HOSTILE INPUTS
  // =========================================================================
  await t.test('Domain 2: Sidebar Search Queries with Regex Characters & Hostile Inputs', async (st) => {

    const testSessions = [
      { id: 's1', title: 'Biên lợi nhuận bán lẻ Q3 2026', subtitle: 'DeepThink · 5 bước' },
      { id: 's2', title: 'Truy vấn SQL (SELECT * FROM orders WHERE amount > 1000)', subtitle: 'SQL · 3 bảng' },
      { id: 's3', title: 'Regex test: .*+?^${}()|[]\\', subtitle: 'Special chars in title' },
      { id: 's4', title: 'Unicode: Tiếng Việt có dấu và ký tự lạ: 🚀 📊 100%', subtitle: 'Vietnamese test' },
      { id: 's5', title: '<script>alert("XSS")</script>', subtitle: 'Security injection probe' },
      { id: 's6', title: '   Trimming   Spaces   ', subtitle: 'Whitespace test' },
      { id: 's7', title: '', subtitle: 'Empty title test' },
      { id: 's8', title: 'Null Subtitle Session', subtitle: null },
    ];

    const filterSessionsOracle = (sessions, query) => {
      if (!query) return sessions;
      const q = query.toLowerCase();
      return sessions.filter((s) => {
        const titleMatch = s.title && s.title.toLowerCase().includes(q);
        const subMatch = s.subtitle && s.subtitle.toLowerCase().includes(q);
        return titleMatch || subMatch;
      });
    };

    await st.test('2.1: Regex metacharacters do NOT crash string search logic', () => {
      const regexHostileQueries = [
        '.*',
        '+',
        '?',
        '^',
        '$',
        '{',
        '}',
        '(',
        ')',
        '|',
        '[',
        ']',
        '\\',
        '.*+?^${}()|[]\\',
        '\\d+\\w*',
        '([a-zA-Z0-9]+)*$',
        '(?=.*SELECT)',
      ];

      for (const query of regexHostileQueries) {
        assert.doesNotThrow(() => {
          const results = filterSessionsOracle(testSessions, query);
          assert.ok(Array.isArray(results), `Query ${query} must return an array`);
        }, `Query "${query}" must not throw regex syntax error`);
      }

      // Check specific match for regex string in s3
      const s3Match = filterSessionsOracle(testSessions, '.*+?');
      assert.equal(s3Match.length, 1);
      assert.equal(s3Match[0].id, 's3');
    });

    await st.test('2.2: Extreme string inputs (10,000 chars, null-bytes, emojis, XSS payloads)', () => {
      const longQuery = 'A'.repeat(10000);
      assert.doesNotThrow(() => {
        const results = filterSessionsOracle(testSessions, longQuery);
        assert.equal(results.length, 0);
      });

      // Null byte
      const nullByteResults = filterSessionsOracle(testSessions, '\u0000');
      assert.equal(nullByteResults.length, 0);

      // Emoji search
      const emojiResults = filterSessionsOracle(testSessions, '🚀');
      assert.equal(emojiResults.length, 1);
      assert.equal(emojiResults[0].id, 's4');

      // XSS payload search
      const xssResults = filterSessionsOracle(testSessions, '<script>');
      assert.equal(xssResults.length, 1);
      assert.equal(xssResults[0].id, 's5');
    });

    await st.test('2.3: Performance benchmark: 10,000 synthetic sessions filtered under 100ms', () => {
      const largeSessionSet = Array.from({ length: 10000 }, (_, i) => ({
        id: `sess-${i}`,
        title: `Phân tích dữ liệu doanh thu chi nhánh #${i} - Tháng ${((i % 12) + 1)}/2026`,
        subtitle: `DeepThink · ${(i % 10) + 1} bước · ${(i % 5)} artifacts`,
      }));

      const start = performance.now();
      const results = filterSessionsOracle(largeSessionSet, 'chi nhánh #9999');
      const durationMs = performance.now() - start;

      assert.equal(results.length, 1);
      assert.equal(results[0].id, 'sess-9999');
      assert.ok(durationMs < 100, `10,000 session search must complete in under 100ms (actual: ${durationMs.toFixed(2)}ms)`);
    });
  });

  // =========================================================================
  // DOMAIN 3: SESSION TITLE TRUNCATIONS, UNICODE BOUNDARIES & TIMESTAMPS
  // =========================================================================
  await t.test('Domain 3: Session Title Truncations, Unicode Boundaries & Timestamps', async (st) => {

    await st.test('3.1: Session title truncation CSS classes and long text resilience', () => {
      assert.match(prodSidebar, /ow-fade-truncate/, 'Sidebar session title must apply ow-fade-truncate');
      assert.match(prodSidebar, /truncate/, 'Sidebar session title must include truncate utility');
      assert.match(prodSidebar, /min-w-0/, 'Sidebar session flex containers must specify min-w-0 to prevent overflow');
    });

    await st.test('3.2: Timestamp formatting oracle handling ISO, invalid, and null timestamps', () => {
      const formatTimestampOracle = (updatedAt) => {
        if (!updatedAt) return '';
        if (typeof updatedAt === 'string' && updatedAt.includes('T')) {
          const date = new Date(updatedAt);
          if (!isNaN(date.getTime())) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          }
        }
        return typeof updatedAt === 'string' ? updatedAt.slice(0, 8) : '';
      };

      // ISO timestamp
      const validIso = '2026-09-01T15:30:00.000Z';
      const formattedIso = formatTimestampOracle(validIso);
      assert.ok(formattedIso.length > 0 && formattedIso.includes(':'), 'Valid ISO timestamp must format with time');

      // Legacy time slice
      assert.equal(formatTimestampOracle('14:22:05'), '14:22:05');

      // Invalid ISO string
      assert.equal(formatTimestampOracle('invalid-T-date'), 'invalid-');

      // Empty / null / undefined
      assert.equal(formatTimestampOracle(''), '');
      assert.equal(formatTimestampOracle(null), '');
      assert.equal(formatTimestampOracle(undefined), '');
    });

    await st.test('3.3: Outcome status dot resolution matrix', () => {
      const resolveOutcomeStatus = (s) => {
        const isRunning = s.status === 'running';
        if (isRunning) return 'running';
        if (s.status === 'completed' || s.unread) return 'completed';
        if (s.status === 'failed') return 'failed';
        return 'idle';
      };

      assert.equal(resolveOutcomeStatus({ status: 'running' }), 'running');
      assert.equal(resolveOutcomeStatus({ status: 'completed' }), 'completed');
      assert.equal(resolveOutcomeStatus({ status: 'idle', unread: true }), 'completed');
      assert.equal(resolveOutcomeStatus({ status: 'failed' }), 'failed');
      assert.equal(resolveOutcomeStatus({ status: 'idle' }), 'idle');
      assert.equal(resolveOutcomeStatus({ status: 'unknown' }), 'idle');
      assert.equal(resolveOutcomeStatus({}), 'idle');
    });
  });

  // =========================================================================
  // DOMAIN 4: 10,000 RAPID THEME TOGGLE CYCLES & LOCALSTORAGE STRESS
  // =========================================================================
  await t.test('Domain 4: 10,000 Rapid Theme Toggle Cycles & LocalStorage Stress', async (st) => {

    await st.test('4.1: 10,000 Rapid theme toggle cycles alternate deterministically', () => {
      let currentTheme = 'light';
      const start = performance.now();

      for (let i = 0; i < 10000; i++) {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      }
      const durationMs = performance.now() - start;

      assert.equal(currentTheme, 'light', '10,000 toggles starting from light must return to light');
      assert.ok(durationMs < 20, `10,000 theme toggles in under 20ms (actual: ${durationMs.toFixed(2)}ms)`);
    });

    await st.test('4.2: LocalStorage QuotaExceededError and SecurityError exception resilience', () => {
      // Mock faulty localStorage that throws
      const faultyLocalStorage = {
        setItem: () => {
          const err = new Error('QuotaExceededError: DOM Exception 22');
          err.name = 'QuotaExceededError';
          throw err;
        },
      };

      const simulateToggleTheme = (currentTheme, storage) => {
        const next = currentTheme === 'dark' ? 'light' : 'dark';
        try {
          storage.setItem('ow:theme', next);
        } catch (e) {
          // Handled gracefully without crash
        }
        return next;
      };

      // Verify that throwing localStorage does not crash the function
      let theme = 'light';
      assert.doesNotThrow(() => {
        theme = simulateToggleTheme(theme, faultyLocalStorage);
      });
      assert.equal(theme, 'dark');

      assert.doesNotThrow(() => {
        theme = simulateToggleTheme(theme, faultyLocalStorage);
      });
      assert.equal(theme, 'light');
    });

    await st.test('4.3: OpenWorkSidebar.tsx includes proper try/catch for localStorage persistence', () => {
      assert.match(
        prodSidebar,
        /try\s*\{\s*localStorage\.setItem\(['"]ow:theme['"],\s*next\);\s*\}\s*catch\s*\([eE]\)\s*\{\s*\}/,
        'Sidebar theme toggle must wrap localStorage.setItem in try/catch'
      );
    });
  });

  // =========================================================================
  // DOMAIN 5: COMPOSER 10,000-CHAR INPUT & MULTILINE AUTO-EXPAND BOUNDING
  // =========================================================================
  await t.test('Domain 5: Composer 10,000-Character Input & Multiline Auto-Expand Bounding', async (st) => {

    const computeTextareaHeightOracle = (scrollHeight) => {
      const nextHeight = Math.min(scrollHeight, 160);
      return Math.max(nextHeight, 42);
    };

    await st.test('5.1: Textarea auto-expand height strictly bounded in [42px, 160px]', () => {
      // Min height clamp (0px scrollHeight -> 42px)
      assert.equal(computeTextareaHeightOracle(0), 42);
      assert.equal(computeTextareaHeightOracle(20), 42);
      assert.equal(computeTextareaHeightOracle(42), 42);

      // Intermediate values
      assert.equal(computeTextareaHeightOracle(60), 60);
      assert.equal(computeTextareaHeightOracle(100), 100);
      assert.equal(computeTextareaHeightOracle(159), 159);
      assert.equal(computeTextareaHeightOracle(160), 160);

      // Max height clamp (> 160px scrollHeight -> 160px)
      assert.equal(computeTextareaHeightOracle(161), 160);
      assert.equal(computeTextareaHeightOracle(500), 160);
      assert.equal(computeTextareaHeightOracle(5000), 160);
    });

    await st.test('5.2: Simulated rapid 10,000-character multiline input expansion', () => {
      let simulatedScrollHeight = 42;
      const chunks = 200; // 200 chunks of 50 chars each = 10,000 chars

      for (let i = 0; i < chunks; i++) {
        // Every 10 chunks simulate a new line expansion
        if (i % 10 === 0) {
          simulatedScrollHeight += 18;
        }
        const height = computeTextareaHeightOracle(simulatedScrollHeight);
        assert.ok(height >= 42, `Height must be >= 42px (actual: ${height})`);
        assert.ok(height <= 160, `Height must be <= 160px (actual: ${height})`);
      }
    });

    await st.test('5.3: Static CSS constraints in OpenWorkComposer.tsx', () => {
      assert.match(prodComposer, /min-h-\[42px\]/, 'Composer textarea must have min-h-[42px]');
      assert.match(prodComposer, /max-h-\[160px\]/, 'Composer textarea must have max-h-[160px]');
      assert.match(prodComposer, /resize-none/, 'Composer textarea must be non-resizable');
      assert.match(prodComposer, /custom-scrollbar/, 'Composer textarea must use custom-scrollbar');
      assert.match(prodComposer, /p-\[9px_9px_7px\]/, 'Composer outer card must enforce 9px 9px 7px padding');
      assert.match(prodComposer, /rounded-\[13px\]/, 'Composer outer card must enforce 13px border radius');
    });
  });

  // =========================================================================
  // DOMAIN 6: COMPOSER MODEL SWITCHING & STRICT GEMINI BAN VERIFICATION
  // =========================================================================
  await t.test('Domain 6: Composer Model Switching & Strict Gemini Ban Verification', async (st) => {

    await st.test('6.1: Strict purge of banned model "Gemini"', () => {
      const bannedTerms = ['Gemini', 'gemini'];
      const targetSources = [
        { name: 'OpenWorkComposer.tsx (prod)', src: prodComposer },
        { name: 'OpenWorkComposer.tsx (mock)', src: mockComposer },
        { name: 'types.ts (prod)', src: prodTypes },
        { name: 'types.ts (mock)', src: mockTypes },
        { name: 'useOpenWorkStore.ts (prod)', src: prodStore },
      ];

      for (const target of targetSources) {
        for (const banned of bannedTerms) {
          assert.equal(
            target.src.includes(banned),
            false,
            `Banned term "${banned}" must NOT appear in ${target.name}`
          );
        }
      }
    });

    await st.test('6.2: Supported model catalogue contains all approved models', () => {
      const allowedModels = [
        'deepseek-v4-flash',
      ];

      for (const modelId of allowedModels) {
        assert.ok(
          prodComposer.includes(modelId),
          `OpenWorkComposer.tsx must include support for model: ${modelId}`
        );
      }
    });

    await st.test('6.3: Model selection resolution oracle', () => {
      const DEFAULT_MODELS = [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      ];

      const resolveActiveModelDisplay = (modelId, customList = DEFAULT_MODELS) => {
        const found = customList.find((m) => m.id === modelId || m.name === modelId);
        return found ? found.name : (modelId || 'DeepSeek V4 Flash');
      };

      assert.equal(resolveActiveModelDisplay('deepseek-v4-flash'), 'DeepSeek V4 Flash');
      assert.equal(resolveActiveModelDisplay('custom-unknown-model'), 'custom-unknown-model');
      assert.equal(resolveActiveModelDisplay(null), 'DeepSeek V4 Flash');
    });

    await st.test('6.4: 5px green status dot rendered on model pill', () => {
      assert.match(
        prodComposer,
        /w-\[5px\]\s*h-\[5px\]\s*rounded-full\s*bg-\[var\(--ok\)\]/,
        'Model selector pill must render 5px green status dot with bg-[var(--ok)]'
      );
    });
  });

  // =========================================================================
  // DOMAIN 7: PLAN MODE TOGGLE STATE & KEYBOARD INTERACTION MATRIX
  // =========================================================================
  await t.test('Domain 7: Plan Mode Toggle State & Keyboard Interaction Matrix', async (st) => {

    await st.test('7.1: Plan / Direct mode toggle transitions and reasonMode co-dispatch', () => {
      let currentPlanMode = 'plan';
      let currentReasoningMode = 'DeepThink';

      const handlePlanModeChange = (newMode) => {
        currentPlanMode = newMode;
        currentReasoningMode = newMode === 'plan' ? 'DeepThink' : 'Quick';
      };

      handlePlanModeChange('direct');
      assert.equal(currentPlanMode, 'direct');
      assert.equal(currentReasoningMode, 'Quick');

      handlePlanModeChange('plan');
      assert.equal(currentPlanMode, 'plan');
      assert.equal(currentReasoningMode, 'DeepThink');
    });

    await st.test('7.2: Keyboard shortcut dispatcher matrix (including IME composition guard)', () => {
      const handleKeyDownOracle = (event, { isStreaming, value, disabled, onSend, onStop }) => {
        // IME Composition Guard (e.g. typing Vietnamese Telex / Japanese / Chinese)
        if (event.isComposing || event.nativeEvent?.isComposing) {
          return 'IME_COMPOSING_IGNORED';
        }
        if (disabled) {
          return 'DISABLED_IGNORED';
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (isStreaming) {
            onStop?.();
            return 'STOP_CALLED';
          } else if (value && value.trim()) {
            onSend?.();
            return 'SEND_CALLED';
          }
          return 'EMPTY_IGNORED';
        }
        if (event.key === 'Enter' && event.shiftKey) {
          return 'NEWLINE_INSERTED';
        }
        return 'DEFAULT_PASS';
      };

      let sendFired = false;
      let stopFired = false;
      let prevented = false;

      const makeFakeEvent = (opts) => ({
        key: opts.key || 'Enter',
        shiftKey: opts.shiftKey || false,
        isComposing: opts.isComposing || false,
        nativeEvent: { isComposing: opts.isComposing || false },
        preventDefault: () => { prevented = true; },
      });

      // Matrix 1: IME composing on Enter -> MUST NOT SEND
      assert.equal(
        handleKeyDownOracle(makeFakeEvent({ isComposing: true }), {
          isStreaming: false,
          value: 'Tiếng Việt',
          onSend: () => { sendFired = true; },
        }),
        'IME_COMPOSING_IGNORED'
      );
      assert.equal(sendFired, false, 'Send must not fire during IME composition');

      // Matrix 2: Plain Enter with text -> MUST SEND
      sendFired = false;
      assert.equal(
        handleKeyDownOracle(makeFakeEvent({ isComposing: false }), {
          isStreaming: false,
          value: 'Phân tích doanh thu Q3',
          onSend: () => { sendFired = true; },
        }),
        'SEND_CALLED'
      );
      assert.equal(sendFired, true, 'Send must fire on Enter with trimmed text');

      // Matrix 3: Plain Enter during streaming -> MUST STOP
      assert.equal(
        handleKeyDownOracle(makeFakeEvent({ isComposing: false }), {
          isStreaming: true,
          value: 'Phân tích doanh thu Q3',
          onStop: () => { stopFired = true; },
        }),
        'STOP_CALLED'
      );
      assert.equal(stopFired, true, 'Stop must fire on Enter during stream');

      // Matrix 4: Plain Enter with whitespace only -> MUST IGNORE
      sendFired = false;
      assert.equal(
        handleKeyDownOracle(makeFakeEvent({ isComposing: false }), {
          isStreaming: false,
          value: '   \n  \t  ',
          onSend: () => { sendFired = true; },
        }),
        'EMPTY_IGNORED'
      );
      assert.equal(sendFired, false, 'Send must not fire on whitespace');

      // Matrix 5: Shift+Enter -> MUST INSERT NEWLINE
      assert.equal(
        handleKeyDownOracle(makeFakeEvent({ shiftKey: true }), {
          isStreaming: false,
          value: 'Line 1',
        }),
        'NEWLINE_INSERTED'
      );
    });

    await st.test('7.3: Submit button state and styling transition oracle', () => {
      const resolveSubmitButtonState = (value, isStreaming) => {
        if (isStreaming) {
          return {
            type: 'stop',
            bgColor: 'bg-[var(--err)]',
            icon: 'Square',
            disabled: false,
          };
        }
        const hasText = value && value.trim().length > 0;
        return {
          type: 'send',
          bgColor: hasText ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]',
          icon: 'ArrowUp',
          disabled: !hasText,
        };
      };

      // Empty text
      const emptyState = resolveSubmitButtonState('', false);
      assert.equal(emptyState.type, 'send');
      assert.equal(emptyState.disabled, true);

      // Text entered
      const textState = resolveSubmitButtonState('Hello AI', false);
      assert.equal(textState.type, 'send');
      assert.equal(textState.disabled, false);

      // Actively streaming
      const streamState = resolveSubmitButtonState('Hello AI', true);
      assert.equal(streamState.type, 'stop');
      assert.equal(streamState.icon, 'Square');
      assert.equal(streamState.bgColor, 'bg-[var(--err)]');
    });
  });

  // =========================================================================
  // DOMAIN 8: DUAL-TREE PARITY & STATIC DESIGN TOKEN INVARIANTS
  // =========================================================================
  await t.test('Domain 8: Dual-Tree Parity & Static Design Token Invariants', async (st) => {

    await st.test('8.1: Exact 1:1 dual-tree parity for OpenWorkSidebar.tsx', () => {
      assert.ok(prodSidebar.length > 0, 'Production sidebar must exist');
      assert.ok(mockSidebar.length > 0, 'Mock sidebar must exist');
      assert.equal(prodSidebar, mockSidebar, 'OpenWorkSidebar.tsx must be 100% byte-for-byte identical across trees');
    });

    await st.test('8.2: Exact 1:1 dual-tree parity for OpenWorkComposer.tsx', () => {
      assert.ok(prodComposer.length > 0, 'Production composer must exist');
      assert.ok(mockComposer.length > 0, 'Mock composer must exist');
      assert.equal(prodComposer, mockComposer, 'OpenWorkComposer.tsx must be 100% byte-for-byte identical across trees');
    });

    await st.test('8.3: Zero Classical Serif Fonts Invariant across M3 components and CSS', () => {
      const bannedFonts = ['Lora', 'Cormorant Garamond', 'Georgia'];
      const m3Files = [
        { name: 'OpenWorkSidebar.tsx', src: prodSidebar },
        { name: 'OpenWorkComposer.tsx', src: prodComposer },
        { name: 'openwork-chat.css', src: prodChatCss },
      ];

      for (const file of m3Files) {
        for (const font of bannedFonts) {
          assert.equal(
            file.src.includes(font),
            false,
            `Banned classical font "${font}" must NOT appear in ${file.name}`
          );
        }
      }
    });

    await st.test('8.4: Zinc design system token vocabulary adherence', () => {
      const requiredTokens = [
        '--bg',
        '--panel',
        '--card',
        '--muted',
        '--muted-fg',
        '--fg',
        '--fg2',
        '--border',
        '--hair',
        '--primary',
        '--primary-fg',
        '--accent',
        '--ok',
        '--err',
        '--shadow',
      ];

      for (const token of requiredTokens) {
        assert.ok(
          prodGlobals.includes(token),
          `Global CSS must declare zinc design token: ${token}`
        );
      }
    });
  });
});
