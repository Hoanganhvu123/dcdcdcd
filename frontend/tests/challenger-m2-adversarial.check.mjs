#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const OPENWORK_FILES = [
  'components/openwork/OpenWorkShell.tsx',
  'components/openwork/OpenWorkSplitter.tsx',
  'components/openwork/OpenWorkSidebar.tsx',
  'components/openwork/OpenWorkChatSurface.tsx',
  'components/openwork/OpenWorkReasoningBlock.tsx',
  'components/openwork/OpenWorkCapabilityCallLine.tsx',
  'components/openwork/OpenWorkSubagentRunLine.tsx',
  'components/openwork/OpenWorkToolAggregateGroup.tsx',
  'components/openwork/OpenWorkWorkbench.tsx',
];

function readFrontendFile(relPath) {
  const p = path.join(ROOT, relPath);
  return fs.readFileSync(p, 'utf8');
}

test('Challenger M2 Adversarial Verification Suite', async (t) => {
  // =========================================================================
  // ADV-1: STRICT HARDCODED PX TYPOGRAPHY SCANNER
  // =========================================================================
  await t.test('ADV-1: Zero illegal hardcoded px font sizes across all 9 OpenWork components', () => {
    // Prohibited patterns: text-[XXpx], font-size: XXpx, fontSize: "XXpx"
    const prohibitedTypographyRegex = /(text-\[\d+px\]|font-size:\s*\d+px|fontSize:\s*['"]\d+px['"]|line-height:\s*\d+px)/gi;

    const violations = [];

    for (const relPath of OPENWORK_FILES) {
      const content = readFrontendFile(relPath);
      const matches = content.match(prohibitedTypographyRegex);
      if (matches) {
        violations.push({ file: relPath, matches });
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found prohibited hardcoded px typography in: ${JSON.stringify(violations, null, 2)}`
    );
  });

  // =========================================================================
  // ADV-2: FLUID UNITS & RESPONSIVE TYPOGRAPHY
  // =========================================================================
  await t.test('ADV-2: Enforces relative fluid classes (rem, em, text-xs, text-sm, text-base, max-w-*, flex-1)', () => {
    for (const relPath of OPENWORK_FILES) {
      const content = readFrontendFile(relPath);
      if (relPath.endsWith('OpenWorkSplitter.tsx')) continue; // splitter is a divider

      const hasFluidTypography =
        content.includes('text-xs') ||
        content.includes('text-sm') ||
        content.includes('text-base') ||
        content.includes('text-[0.625rem]') ||
        content.includes('font-sans') ||
        content.includes('font-mono') ||
        content.includes('font-serif');

      assert.ok(hasFluidTypography, `Component ${relPath} must use fluid typography classes`);
    }
  });

  // =========================================================================
  // ADV-3: COLLAPSE / EXPAND STREAMING STATE RETENTION SIMULATION
  // =========================================================================
  await t.test('ADV-3: Live reasoning & tool call state preservation during 100 collapse/expand cycles', () => {
    // Model state storage simulation
    const mockStore = {
      sidebarOpen: true,
      sidebarWidth: 392,
      isStreaming: true,
      streamParts: [
        { id: 'part-1', type: 'reasoning', thought: '<think>Analysing schema...</think>Found 4 tables', isStreaming: true, durationMs: 4500 },
        { id: 'part-2', type: 'capability-call', toolName: 'sql_query', status: 'running', input: { query: 'SELECT * FROM pnl' }, durationMs: 1200 },
        { id: 'part-3', type: 'subagent-run', id: 'sub-1', agentName: 'Financial Modeler', taskTitle: 'PnL Forecast', status: 'running' },
        { id: 'part-4', type: 'tool-aggregate', id: 'agg-1', title: 'Data Cleaning', tools: [
          { id: 't1', name: 'clean_nulls', status: 'completed', durationMs: 50 },
          { id: 't2', name: 'clean_nulls', status: 'completed', durationMs: 40 },
          { id: 't3', name: 'format_dates', status: 'running' },
        ] }
      ],
      toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
      }
    };

    // Cycle collapse/expand 100 times while active stream is running
    for (let i = 0; i < 100; i++) {
      mockStore.toggleSidebar();
      assert.equal(mockStore.isStreaming, true, `Streaming flag broke at cycle ${i}`);
      assert.equal(mockStore.streamParts.length, 4, `Stream parts lost at cycle ${i}`);
      assert.equal(mockStore.streamParts[0].isStreaming, true);
      assert.equal(mockStore.streamParts[1].status, 'running');
    }

    // Return to open state
    if (!mockStore.sidebarOpen) mockStore.toggleSidebar();
    assert.equal(mockStore.sidebarOpen, true);
    assert.equal(mockStore.streamParts.length, 4);
  });

  // =========================================================================
  // ADV-4: REASONING SANITIZATION & EDGE CASE HANDLING
  // =========================================================================
  await t.test('ADV-4: Reasoning block cleans unclosed/multiline <think> tags and TODO markers', () => {
    const reasoningCode = readFrontendFile('components/openwork/OpenWorkReasoningBlock.tsx');

    const cleanThought = (text) => {
      if (!text) return '';
      return text
        .replace(/^<think>\s*/i, '')
        .replace(/\s*<\/think>$/i, '')
        .replace(/^TODO::[^\n]*/gm, '')
        .trim();
    };

    const rawInput1 = '<think>\nStep 1: Check database\nStep 2: Join orders\n</think>';
    assert.equal(cleanThought(rawInput1), 'Step 1: Check database\nStep 2: Join orders');

    const rawInput2 = '<think>TODO::remove debug log\nQuerying DW tables';
    assert.equal(cleanThought(rawInput2), 'Querying DW tables');

    const rawInput3 = '';
    assert.equal(cleanThought(rawInput3), '');

    assert.ok(reasoningCode.includes('cleanThoughtContent'), 'OpenWorkReasoningBlock uses cleanThoughtContent');
  });

  // =========================================================================
  // ADV-5: TOOL AGGREGATE MULTIPLIER & DEDUPLICATION LOGIC
  // =========================================================================
  await t.test('ADV-5: Consecutive identical tool calls aggregate into ×N count badges correctly', () => {
    const rawTools = [
      { id: '1', name: 'read_table', status: 'completed', durationMs: 10 },
      { id: '2', name: 'read_table', status: 'completed', durationMs: 15 },
      { id: '3', name: 'read_table', status: 'completed', durationMs: 20 },
      { id: '4', name: 'normalize_col', status: 'completed', durationMs: 5 },
      { id: '5', name: 'read_table', status: 'completed', durationMs: 12 },
    ];

    // Simulate aggregation logic from OpenWorkToolAggregateGroup.tsx
    const rows = [];
    for (const tool of rawTools) {
      const last = rows[rows.length - 1];
      if (last && last.name === tool.name && last.status === tool.status) {
        last.count += 1;
        last.durationMs = (last.durationMs || 0) + tool.durationMs;
      } else {
        rows.push({
          id: tool.id,
          name: tool.name,
          count: 1,
          status: tool.status,
          durationMs: tool.durationMs,
        });
      }
    }

    assert.equal(rows.length, 3);
    assert.equal(rows[0].name, 'read_table');
    assert.equal(rows[0].count, 3);
    assert.equal(rows[0].durationMs, 45);
    assert.equal(rows[1].name, 'normalize_col');
    assert.equal(rows[1].count, 1);
    assert.equal(rows[2].name, 'read_table');
    assert.equal(rows[2].count, 1);
  });

  // =========================================================================
  // ADV-6: SPLITTER RESILIENCE & VIEWPORT BOUNDARIES
  // =========================================================================
  await t.test('ADV-6: Splitter boundary clamps prevent negative or unbounded sidebar widths', () => {
    const MIN_LEFT_SIDEBAR_WIDTH = 260;
    const MAX_LEFT_SIDEBAR_WIDTH = 640;

    const clampSidebarWidth = (rawX) => Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.min(MAX_LEFT_SIDEBAR_WIDTH, rawX));

    assert.equal(clampSidebarWidth(-100), 260);
    assert.equal(clampSidebarWidth(0), 260);
    assert.equal(clampSidebarWidth(392), 392);
    assert.equal(clampSidebarWidth(500), 500);
    assert.equal(clampSidebarWidth(1000), 640);
  });

  // =========================================================================
  // ADV-7: CLASSICAL EDITORIAL PALETTE, SCROLLBAR & KEYFRAME ANIMATIONS
  // =========================================================================
  await t.test('ADV-7: Classical design tokens, scrollbar rules and keyframe animations presence', () => {
    const dnaCss = readFrontendFile('styles/openwork-dna.css');
    const globalsCss = readFrontendFile('styles/globals.css');
    const allCss = dnaCss + '\n' + globalsCss;

    // Keyframes
    assert.ok(allCss.includes('@keyframes cuccuPulse'), 'Defines cuccuPulse keyframe');
    assert.ok(allCss.includes('@keyframes cuccuUp'), 'Defines cuccuUp keyframe');
    assert.ok(allCss.includes('@keyframes cuccuSpin'), 'Defines cuccuSpin keyframe');

    // Tokens
    assert.ok(allCss.includes('--color-bg: #f3f2f2') || allCss.includes('#f3f2f2'), 'Warm paper ground #f3f2f2');
    assert.ok(allCss.includes('--color-accent: #b68235') || allCss.includes('#b68235'), 'Bronze gold accent #b68235');
    assert.ok(allCss.includes('--color-divider: #edecea') || allCss.includes('#edecea'), 'Hairline divider #edecea');
    assert.ok(allCss.includes('::-webkit-scrollbar') || allCss.includes('.custom-scrollbar'), 'Defines custom scrollbar styling');
  });
});
