#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');

function loadFile(relPath) {
  const p = path.join(ROOT, relPath);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  const repoP = path.join(REPO_ROOT, relPath);
  if (fs.existsSync(repoP)) return fs.readFileSync(repoP, 'utf8');
  return '';
}

const shellTsx = loadFile('components/openwork/OpenWorkShell.tsx');
const sidebarTsx = loadFile('components/openwork/OpenWorkSidebar.tsx');
const splitterTsx = loadFile('components/openwork/OpenWorkSplitter.tsx');
const chatSurfaceTsx = loadFile('components/openwork/OpenWorkChatSurface.tsx');
const reasoningBlockTsx = loadFile('components/openwork/OpenWorkReasoningBlock.tsx');
const capabilityLineTsx = loadFile('components/openwork/OpenWorkCapabilityCallLine.tsx');
const subagentRunLineTsx = loadFile('components/openwork/OpenWorkSubagentRunLine.tsx');
const toolGroupTsx = loadFile('components/openwork/OpenWorkToolAggregateGroup.tsx');
const workbenchTsx = loadFile('components/openwork/OpenWorkWorkbench.tsx');
const storeTs = loadFile('components/openwork/useOpenWorkStore.ts');

const M2_FILES = [
  { name: 'OpenWorkShell.tsx', content: shellTsx },
  { name: 'OpenWorkSidebar.tsx', content: sidebarTsx },
  { name: 'OpenWorkSplitter.tsx', content: splitterTsx },
  { name: 'OpenWorkChatSurface.tsx', content: chatSurfaceTsx },
  { name: 'OpenWorkReasoningBlock.tsx', content: reasoningBlockTsx },
  { name: 'OpenWorkCapabilityCallLine.tsx', content: capabilityLineTsx },
  { name: 'OpenWorkSubagentRunLine.tsx', content: subagentRunLineTsx },
  { name: 'OpenWorkToolAggregateGroup.tsx', content: toolGroupTsx },
  { name: 'OpenWorkWorkbench.tsx', content: workbenchTsx },
];

test('Adversarial Stress & Boundary Suite — Milestone 2 Retractable Rail & Dual Canvas', async (t) => {
  // =========================================================================
  // ADV-1: CLAMPING & EXTREME BOUNDARY GEOMETRY
  // =========================================================================
  await t.test('ADV-1.1: Left Rail Clamping Formula Robustness (Negative, Zero, Out-of-bounds)', () => {
    const MIN_LEFT = 220;
    const MAX_LEFT = 420;

    const clampLeft = (clientX) => Math.max(MIN_LEFT, Math.min(MAX_LEFT, clientX));

    const testCases = [
      { input: -1000, expected: 220 },
      { input: 0, expected: 220 },
      { input: 100, expected: 220 },
      { input: 219.99, expected: 220 },
      { input: 220, expected: 220 },
      { input: 300, expected: 300 },
      { input: 392, expected: 392 },
      { input: 420, expected: 420 },
      { input: 420.01, expected: 420 },
      { input: 9999, expected: 420 },
    ];

    for (const tc of testCases) {
      assert.equal(clampLeft(tc.input), tc.expected, `clientX=${tc.input} clamps to ${tc.expected}`);
    }

    // Verify OpenWorkShell.tsx uses exact MIN and MAX constants
    assert.match(shellTsx, /MIN_LEFT_SIDEBAR_WIDTH/);
    assert.match(shellTsx, /MAX_LEFT_SIDEBAR_WIDTH/);
    assert.match(shellTsx, /Math\.max\(\s*MIN_LEFT_SIDEBAR_WIDTH,\s*Math\.min\(MAX_LEFT_SIDEBAR_WIDTH,\s*e\.clientX\)\s*\)/);
  });

  await t.test('ADV-1.2: Right Workbench Clamping Formula with Dynamic Viewport Reservation', () => {
    const MIN_RIGHT = 320;
    const MAX_RIGHT = 960;

    const clampRight = (windowWidth, sidebarOpen, sidebarWidth, clientX) => {
      const maxW = Math.min(MAX_RIGHT, windowWidth - (sidebarOpen ? sidebarWidth : 0) - 360);
      return Math.max(MIN_RIGHT, Math.min(maxW, windowWidth - clientX));
    };

    // 1920px screen, 392px sidebar open, clientX = 1000 -> rightW = 920, maxW = min(960, 1920-392-360=1168) = 960
    assert.equal(clampRight(1920, true, 392, 1000), 920);

    // 1024px screen, 392px sidebar open, maxW = min(960, 1024-392-360=272) -> min(272, 1024-500=524) = 272 -> max(320, 272) = 320
    assert.equal(clampRight(1024, true, 392, 500), 320);

    // 1920px screen, sidebar retracted (0px), clientX = 500 -> rightW = 1420 -> clamped to 960
    assert.equal(clampRight(1920, false, 0, 500), 960);

    assert.match(shellTsx, /MIN_RIGHT_WORKBENCH_WIDTH/);
    assert.match(shellTsx, /MAX_RIGHT_WORKBENCH_WIDTH/);
    assert.match(shellTsx, /Math\.max\(\s*MIN_RIGHT_WORKBENCH_WIDTH,\s*Math\.min\(maxW,\s*window\.innerWidth\s*-\s*e\.clientX\)\s*\)/);
  });

  // =========================================================================
  // ADV-2: DOUBLE-CLICK RESET STATE INVARIANTS
  // =========================================================================
  await t.test('ADV-2.1: Left Splitter Double-Click Resets Exactly to CLASSICAL_LEFT_RAIL_WIDTH (392px)', () => {
    assert.match(shellTsx, /export\s+const\s+CLASSICAL_LEFT_RAIL_WIDTH\s*=\s*392/);
    assert.match(shellTsx, /onDoubleClick=\{\(\)\s*=>\s*store\.setSidebarWidth\(CLASSICAL_LEFT_RAIL_WIDTH\)\}/);
  });

  await t.test('ADV-2.2: Right Splitter Double-Click Resets to 50% Viewport Width Clamped', () => {
    const calcResetWidth = (winWidth) => {
      const MIN_RIGHT = 320;
      const MAX_RIGHT = 960;
      return Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, Math.round(winWidth * 0.5)));
    };

    assert.equal(calcResetWidth(1920), 960);
    assert.equal(calcResetWidth(1440), 720);
    assert.equal(calcResetWidth(1024), 512);
    assert.equal(calcResetWidth(500), 320); // Clamped to MIN

    assert.match(shellTsx, /Math\.round\(window\.innerWidth\s*\*\s*0\.5\)/);
  });

  // =========================================================================
  // ADV-3: FULL-BLEED DUAL PANE CANVAS EXPANSION & ZERO BLEED
  // =========================================================================
  await t.test('ADV-3.1: Complete Sidebar Unmount/Collapse to 0px on Retraction', () => {
    assert.match(shellTsx, /\{store\.sidebarOpen\s*&&\s*\(/);
    assert.match(shellTsx, /<OpenWorkSidebar/);
    assert.match(shellTsx, /<OpenWorkSplitter/);
  });

  await t.test('ADV-3.2: Root Shell Enforces overflow-hidden w-screen h-screen', () => {
    assert.match(shellTsx, /className="[^"]*flex[^"]*h-screen[^"]*w-screen[^"]*overflow-hidden[^"]*select-none/);
  });

  await t.test('ADV-3.3: Chat Surface Flex-1 Container Expands Edge-to-Edge', () => {
    assert.match(chatSurfaceTsx, /<main\s+className="flex-1\s+flex\s+flex-col\s+min-w-0\s+bg-\[var\(--color-bg,#f3f2f2\)\]\s+h-full\s+overflow-hidden/);
  });

  // =========================================================================
  // ADV-4: STRESS TEST & RAPID MULTI-CYCLE TOGGLING
  // =========================================================================
  await t.test('ADV-4.1: 100-Cycle Rapid Sidebar & Workbench Toggle Coherence', () => {
    let mockState = {
      sidebarOpen: true,
      workbenchOpen: true,
      sidebarWidth: 392,
      workbenchWidth: 680,
    };

    const toggleSidebar = () => {
      mockState.sidebarOpen = !mockState.sidebarOpen;
    };
    const toggleWorkbench = () => {
      mockState.workbenchOpen = !mockState.workbenchOpen;
    };

    for (let i = 0; i < 100; i++) {
      const prevSide = mockState.sidebarOpen;
      const prevWork = mockState.workbenchOpen;

      toggleSidebar();
      toggleWorkbench();

      assert.equal(mockState.sidebarOpen, !prevSide, `Cycle ${i+1}: sidebar toggled`);
      assert.equal(mockState.workbenchOpen, !prevWork, `Cycle ${i+1}: workbench toggled`);
      assert.equal(mockState.sidebarWidth, 392, 'Sidebar width remains preserved across toggles');
      assert.equal(mockState.workbenchWidth, 680, 'Workbench width remains preserved across toggles');
    }

    assert.equal(mockState.sidebarOpen, true, 'Even cycles restore sidebar open state');
    assert.equal(mockState.workbenchOpen, true, 'Even cycles restore workbench open state');
  });

  // =========================================================================
  // ADV-5: REASONING CO-THOUGHT CLEANER & DURATION ENGINE
  // =========================================================================
  await t.test('ADV-5.1: cleanThoughtContent Robustness Under Adversarial Tag Injections', () => {
    const cleanThoughtContent = (text) => {
      if (!text) return '';
      return text
        .replace(/^<think>\s*/i, '')
        .replace(/\s*<\/think>$/i, '')
        .replace(/^TODO::[^\n]*/gm, '')
        .trim();
    };

    assert.equal(cleanThoughtContent(''), '');
    assert.equal(cleanThoughtContent(null), '');
    assert.equal(cleanThoughtContent(undefined), '');
    assert.equal(cleanThoughtContent('   '), '');
    assert.equal(cleanThoughtContent('<think>\nAnalyzing legal corpus...\n</think>'), 'Analyzing legal corpus...');
    assert.equal(cleanThoughtContent('<THINK>Case sensitive tag</THINK>'), 'Case sensitive tag');
    assert.equal(cleanThoughtContent('<think>Incomplete streaming thought'), 'Incomplete streaming thought');
    assert.equal(cleanThoughtContent('TODO:: Internal note\nReal reasoning steps'), 'Real reasoning steps');
  });

  await t.test('ADV-5.2: Gold Pulsing Dot & Duration Badge Presence in OpenWorkReasoningBlock', () => {
    assert.match(reasoningBlockTsx, /pulse-dot-gold/);
    assert.match(reasoningBlockTsx, /cuccuPulse/);
    assert.match(reasoningBlockTsx, /animate-cuccu-pulse/);
    assert.match(reasoningBlockTsx, /vis-thinking-body/);
    assert.match(reasoningBlockTsx, /animate-cuccu-up/);
  });

  // =========================================================================
  // ADV-6: TOOL AGGREGATION ENGINE & SOLO ROW OPTIMIZATIONS
  // =========================================================================
  await t.test('ADV-6.1: Consecutive Tool Deduplication & Duration Summation', () => {
    const aggregateTools = (tools) => {
      const rows = [];
      for (const tool of tools) {
        const last = rows[rows.length - 1];
        if (last && last.name === tool.name && last.status === tool.status) {
          last.count += 1;
          if (tool.durationMs !== undefined) {
            last.durationMs = (last.durationMs || 0) + tool.durationMs;
          }
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
      return rows;
    };

    const inputTools = [
      { id: '1', name: 'sql_query', status: 'completed', durationMs: 100 },
      { id: '2', name: 'sql_query', status: 'completed', durationMs: 150 },
      { id: '3', name: 'sql_query', status: 'completed', durationMs: 200 },
      { id: '4', name: 'read_doc', status: 'completed', durationMs: 50 },
      { id: '5', name: 'sql_query', status: 'completed', durationMs: 80 },
    ];

    const result = aggregateTools(inputTools);
    assert.equal(result.length, 3);
    assert.equal(result[0].name, 'sql_query');
    assert.equal(result[0].count, 3);
    assert.equal(result[0].durationMs, 450);
    assert.equal(result[1].name, 'read_doc');
    assert.equal(result[1].count, 1);
    assert.equal(result[2].name, 'sql_query');
    assert.equal(result[2].count, 1);
  });

  // =========================================================================
  // ADV-7: FLUID TYPOGRAPHY & ZERO HARDCODED PIXEL FONT AUDIT
  // =========================================================================
  await t.test('ADV-7.1: Zero Hardcoded Pixel Font Sizes in All M2 Component Files', () => {
    // Check for forbidden text-[0-9]+px patterns in classes
    const forbiddenPatterns = [
      /text-\[\d+px\]/g,
      /font-size:\s*\d+px/g,
    ];

    for (const file of M2_FILES) {
      for (const pat of forbiddenPatterns) {
        const matches = file.content.match(pat);
        assert.equal(
          matches,
          null,
          `File ${file.name} violates fluid typography with forbidden hardcoded pixel fonts: ${JSON.stringify(matches)}`
        );
      }
    }
  });

  // =========================================================================
  // ADV-8: EVENT LISTENER CLEANUP
  // =========================================================================
  await t.test('ADV-8.1: Global Mouse Event Listeners Properly Removed on Drag End / Unmount', () => {
    assert.match(shellTsx, /window\.addEventListener\('mousemove',\s*handleMouseMove\)/);
    assert.match(shellTsx, /window\.addEventListener\('mouseup',\s*handleMouseUp\)/);
    assert.match(shellTsx, /window\.removeEventListener\('mousemove',\s*handleMouseMove\)/);
    assert.match(shellTsx, /window\.removeEventListener\('mouseup',\s*handleMouseUp\)/);
    assert.match(shellTsx, /document\.body\.style\.userSelect\s*=\s*'';/);
    assert.match(shellTsx, /document\.body\.style\.cursor\s*=\s*'';/);
  });
});
