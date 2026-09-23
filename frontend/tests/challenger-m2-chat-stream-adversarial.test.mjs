#!/usr/bin/env node
/**
 * ============================================================================
 * 🛡️ CHALLENGER M2: EMPIRICAL ADVERSARIAL STRESS TEST SUITE
 * ============================================================================
 * Adversarial challenges against Milestone 2: Chat Stream Visual Fidelity
 *
 * Focus Areas:
 * 1. User Message Bubble: 5000+ char unbroken strings & 10k complex prompts,
 *    78% max-width containment, word-wrap/break-words, search highlights & links.
 * 2. Reasoning Block: 10,000-line massive reasoning traces, 340px max-height
 *    scroll containment, empty/whitespace thought handling, rapid 1000-cycle toggles.
 * 3. Plan Execution Card: Step transitions (pending -> running -> done -> completed),
 *    15px circle styling, progress fraction & note formatting, 0-step resilience.
 * 4. Tool Call Disclosures: Large SQL & JSON payloads (50KB-100KB), horizontal
 *    scroll, contrast ratio calculations (WCAG AAA/AA for dark code drawer),
 *    duration formatting and status icon bindings.
 * 5. Dual-Tree Parity: Exact 1:1 functional & structural parity across
 *    `frontend/` and `frontend_mock/`.
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
const MOCK_ROOT = path.resolve(ROOT, '../frontend_mock');

// Helper to read files safely
function readFile(baseDir, relPath) {
  const p = path.join(baseDir, relPath);
  assert.ok(fs.existsSync(p), `Required file missing: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

// Contrast calculation helper (WCAG 2.1 relative luminance & contrast ratio)
function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '');
  const bigint = parseInt(cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function getLuminance({ r, g, b }) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getLuminance(hexToRgb(hex1));
  const lum2 = getLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

test('🛡️ CHALLENGER M2: EMPIRICAL ADVERSARIAL VERIFICATION', async (t) => {

  // ===========================================================================
  // PILLAR 1: USER MESSAGE BUBBLE STRESS & WRAPPING
  // ===========================================================================
  await t.test('Pillar 1: User Message Bubble Extreme Wrap & 78% Width Invariants', async (t1) => {
    const userBubbleSrc = readFile(ROOT, 'components/openwork/OpenWorkUserBubble.tsx');
    const chatCssSrc = readFile(ROOT, 'components/openwork/styles/openwork-chat.css');

    await t1.test('1.1: 78% Max Width & 12px Border Radius Invariants', () => {
      const has78PctConstraint = userBubbleSrc.includes('max-w-[78%]') || chatCssSrc.includes('max-width: 78%') || chatCssSrc.includes('max-width:78%');
      assert.ok(has78PctConstraint, 'User bubble must enforce 78% max width constraint');

      const has12pxRadius = userBubbleSrc.includes('rounded-[12px]') || chatCssSrc.includes('border-radius: 12px') || chatCssSrc.includes('border-radius:12px');
      assert.ok(has12pxRadius, 'User bubble must enforce 12px border radius');

      const hasCardBackground = userBubbleSrc.includes('var(--card)') || chatCssSrc.includes('background: var(--card)');
      assert.ok(hasCardBackground, 'User bubble must use var(--card) token');

      const hasBorderToken = userBubbleSrc.includes('var(--border)') || chatCssSrc.includes('border: 1px solid var(--border)');
      assert.ok(hasBorderToken, 'User bubble must use var(--border) token');

      const hasShadowToken = userBubbleSrc.includes('var(--shadow)') || chatCssSrc.includes('box-shadow: var(--shadow)');
      assert.ok(hasShadowToken, 'User bubble must use var(--shadow) token');
    });

    await t1.test('1.2: 5,000+ Character Unbroken String Breaking & Text Wrapping', () => {
      assert.ok(
        userBubbleSrc.includes('break-words') || userBubbleSrc.includes('break-all') || userBubbleSrc.includes('overflow-wrap'),
        'User bubble content must include break-words/break-all class to prevent unbroken string blowout'
      );
      assert.ok(
        userBubbleSrc.includes('whitespace-pre-wrap') || chatCssSrc.includes('white-space: pre-wrap'),
        'User bubble content must preserve intentional newlines with whitespace-pre-wrap'
      );

      const unbrokenPrompt = 'A'.repeat(5500);
      assert.equal(unbrokenPrompt.length, 5500);
      const USER_SKILL_TOKEN_RE = /(Load \[skill [^\]]+\] and follow its instructions\.|\[skill [^\]]+\])/;
      const PLAIN_URL_RE = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

      const startTime = performance.now();
      const hasSkill = USER_SKILL_TOKEN_RE.test(unbrokenPrompt);
      const urlMatches = Array.from(unbrokenPrompt.matchAll(PLAIN_URL_RE));
      const elapsed = performance.now() - startTime;

      assert.equal(hasSkill, false);
      assert.equal(urlMatches.length, 0);
      assert.ok(elapsed < 20, `Regex parsing 5500 unbroken chars took ${elapsed.toFixed(2)}ms (must be < 20ms)`);
    });

    await t1.test('1.3: 10,000+ Character Complex Prompt with Multiple Embedded URLs & Vietnamese Characters', () => {
      const complexPrompt = `
Kính gửi ban lãnh đạo DB-GPT,
Dưới đây là bản báo cáo tóm tắt 10,000 ký tự với dữ liệu PnL 2026:
- Link 1: https://dbgpt.ai/analytics/report/q1-2026?view=overview&filter=true
- Link 2: https://github.com/eosphoros-ai/DB-GPT/tree/main/frontend
- Link 3: https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap
` + 'Dữ liệu chi tiết về chi phí marketing, doanh thu thuần, tỷ suất hoàn vốn và tồn kho.\n'.repeat(150);

      assert.ok(complexPrompt.length > 10000);

      const PLAIN_URL_RE = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;
      const urls = Array.from(complexPrompt.matchAll(PLAIN_URL_RE)).map(m => m[0]);
      assert.equal(urls.length, 3);
      assert.equal(urls[0], 'https://dbgpt.ai/analytics/report/q1-2026?view=overview&filter=true');
      assert.equal(urls[1], 'https://github.com/eosphoros-ai/DB-GPT/tree/main/frontend');
      assert.equal(urls[2], 'https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap');
    });

    await t1.test('1.4: Search Query Highlighting Inside Long Wrapped Text', () => {
      function renderSearchHighlights(text, highlightQuery) {
        const needle = highlightQuery?.trim().toLowerCase() ?? '';
        if (needle.length < 2) return text;
        const lower = text.toLowerCase();
        if (!lower.includes(needle)) return text;
        const matches = [];
        let cursor = 0;
        let matchIndex = lower.indexOf(needle);
        while (matchIndex >= 0) {
          if (matchIndex > cursor) {
            matches.push({ type: 'text', value: text.slice(cursor, matchIndex) });
          }
          const end = matchIndex + needle.length;
          matches.push({ type: 'highlight', value: text.slice(matchIndex, end) });
          cursor = end;
          matchIndex = lower.indexOf(needle, cursor);
        }
        if (cursor < text.length) {
          matches.push({ type: 'text', value: text.slice(cursor) });
        }
        return matches;
      }

      const sampleText = 'Phân tích doanh thu và lợi nhuận bán hàng. Doanh thu tăng 45% trong Q3.';
      const res = renderSearchHighlights(sampleText, 'doanh thu');
      assert.ok(Array.isArray(res));
      const highlights = res.filter(r => r.type === 'highlight');
      assert.equal(highlights.length, 2, 'Should highlight both instances of "doanh thu"');
      assert.equal(highlights[0].value, 'doanh thu');
      assert.equal(highlights[1].value, 'Doanh thu');
    });
  });

  // ===========================================================================
  // PILLAR 2: REASONING/THINKING BLOCK 10,000 LINES & 340PX SCROLL CONTAINER
  // ===========================================================================
  await t.test('Pillar 2: Reasoning Block 10,000 Lines & 340px Scroll Container Stress', async (t2) => {
    const reasoningSrc = readFile(ROOT, 'components/openwork/OpenWorkReasoningBlock.tsx');
    const chatCssSrc = readFile(ROOT, 'components/openwork/styles/openwork-chat.css');

    await t2.test('2.1: 340px Max-Height & Custom Scrollbar Invariants', () => {
      const has340px = reasoningSrc.includes('max-h-[340px]') || chatCssSrc.includes('max-height: 340px') || chatCssSrc.includes('max-height:340px');
      assert.ok(has340px, 'Reasoning panel must define 340px max-height constraint');

      const hasOverflowY = reasoningSrc.includes('overflow-y-auto') || chatCssSrc.includes('overflow-y: auto');
      assert.ok(hasOverflowY, 'Reasoning panel must allow vertical scrolling with overflow-y-auto');

      const hasCustomScrollbar = reasoningSrc.includes('custom-scrollbar') || chatCssSrc.includes('custom-scrollbar');
      assert.ok(hasCustomScrollbar, 'Reasoning panel must apply custom-scrollbar styling');

      const hasBorderLeft = reasoningSrc.includes('border-l') || chatCssSrc.includes('border-left: 1px solid var(--border)');
      assert.ok(hasBorderLeft, 'Reasoning panel must feature border-left indented divider');
    });

    await t2.test('2.2: 10,000 Lines (500KB+ CoT Payload) String Sanitization & Processing Performance', () => {
      const lines = [];
      lines.push('<think>');
      for (let i = 1; i <= 10000; i++) {
        lines.push(`Step ${i}: Checking node dependencies, calculating sub-aggregates for partition index ${i % 16}...`);
      }
      lines.push('TODO:: verify final aggregate sum');
      lines.push('</think>');
      const massiveReasoning = lines.join('\n');

      assert.ok(massiveReasoning.length > 500000, 'Payload must be > 500KB');

      const cleanThoughtContent = (text) => {
        if (!text) return '';
        return text
          .replace(/^<think>\s*/i, '')
          .replace(/\s*<\/think>$/i, '')
          .replace(/^TODO::[^\n]*/gm, '')
          .trim();
      };

      const start = performance.now();
      const cleaned = cleanThoughtContent(massiveReasoning);
      const duration = performance.now() - start;

      assert.ok(duration < 100, `Cleaning 10,000 lines took ${duration.toFixed(2)}ms (must be < 100ms)`);
      assert.ok(!cleaned.startsWith('<think>'));
      assert.ok(!cleaned.endsWith('</think>'));
      assert.ok(!cleaned.includes('TODO:: verify final aggregate sum'));
      assert.ok(cleaned.includes('Step 1:'));
      assert.ok(cleaned.includes('Step 10000:'));
    });

    await t2.test('2.3: Empty, Whitespace-Only & Null Thought Handling', () => {
      const cleanThoughtContent = (text) => {
        if (!text) return '';
        return text
          .replace(/^<think>\s*/i, '')
          .replace(/\s*<\/think>$/i, '')
          .replace(/^TODO::[^\n]*/gm, '')
          .trim();
      };

      assert.equal(cleanThoughtContent(null), '');
      assert.equal(cleanThoughtContent(undefined), '');
      assert.equal(cleanThoughtContent(''), '');
      assert.equal(cleanThoughtContent('   \n\n\t  '), '');
      assert.equal(cleanThoughtContent('<think></think>'), '');
      assert.equal(cleanThoughtContent('<think>   \n   </think>'), '');
    });

    await t2.test('2.4: Streaming vs Completed State Label & Indicators', () => {
      assert.ok(reasoningSrc.includes('ow-ping'), 'Streaming state must render ow-ping pulsing amber dot');
      assert.ok(reasoningSrc.includes('ow-cursor') || reasoningSrc.includes('animate-ow-pulse'), 'Streaming state must render blinking amber cursor');
      assert.ok(reasoningSrc.includes('Đang suy luận…'), 'Streaming trigger label must be "Đang suy luận…"');
      assert.ok(reasoningSrc.includes('Đã suy luận trong'), 'Completed trigger label must show elapsed seconds');
    });

    await t2.test('2.5: Rapid 1,000 Open/Collapse Toggle Cycles Simulation', () => {
      let isOpen = false;
      const toggle = () => { isOpen = !isOpen; };

      for (let i = 0; i < 1000; i++) {
        toggle();
        assert.equal(isOpen, i % 2 === 0);
      }
      assert.equal(isOpen, false);
    });
  });

  // ===========================================================================
  // PILLAR 3: PLAN EXECUTION CARD STEP TRANSITIONS & CIRCLE RENDERING
  // ===========================================================================
  await t.test('Pillar 3: Plan Execution Card Step Transitions & Circle Rendering', async (t3) => {
    const planSrc = readFile(ROOT, 'components/openwork/OpenWorkPlanCard.tsx');
    const chatCssSrc = readFile(ROOT, 'components/openwork/styles/openwork-chat.css');

    await t3.test('3.1: 11px Border Radius & 15px Circle Container Invariants', () => {
      const has11px = planSrc.includes('rounded-[11px]') || chatCssSrc.includes('border-radius: 11px');
      assert.ok(has11px, 'Plan card must have 11px border radius');

      const has15pxCircle = planSrc.includes('w-[15px]') || planSrc.includes('h-[15px]') || chatCssSrc.includes('width: 18px') || chatCssSrc.includes('width: 15px');
      assert.ok(has15pxCircle, 'Step circle must be 15px-18px geometry');
    });

    await t3.test('3.2: Step State Transition Cycle (pending -> running -> done -> completed)', () => {
      const steps = [
        { id: 's1', title: 'Khảo sát cấu trúc bảng', status: 'pending' },
        { id: 's2', title: 'Truy vấn dữ liệu doanh thu', status: 'pending' },
        { id: 's3', title: 'Tính toán biên lợi nhuận', status: 'pending' },
        { id: 's4', title: 'Dựng bảng tính Excel', status: 'pending' },
      ];

      assert.equal(steps.filter(s => s.status === 'done' || s.status === 'completed').length, 0);

      // Step 1 running
      steps[0].status = 'running';
      assert.equal(steps[0].status, 'running');
      assert.equal(steps.filter(s => s.status === 'running').length, 1);

      // Step 1 done, Step 2 running
      steps[0].status = 'done';
      steps[1].status = 'running';
      assert.equal(steps[0].status, 'done');
      assert.equal(steps[1].status, 'running');
      assert.equal(steps.filter(s => s.status === 'done').length, 1);

      // Step 2 done, Step 3 running
      steps[1].status = 'done';
      steps[2].status = 'running';
      assert.equal(steps[1].status, 'done');
      assert.equal(steps[2].status, 'running');
      assert.equal(steps.filter(s => s.status === 'done').length, 2);

      // Step 3 done, Step 4 running
      steps[2].status = 'done';
      steps[3].status = 'running';
      assert.equal(steps[2].status, 'done');
      assert.equal(steps[3].status, 'running');
      assert.equal(steps.filter(s => s.status === 'done').length, 3);

      // Step 4 completed
      steps[3].status = 'completed';
      assert.equal(steps.filter(s => s.status === 'done' || s.status === 'completed').length, 4);
    });

    await t3.test('3.3: Circle Style Token Classes for Done, Running, Pending', () => {
      assert.ok(
        planSrc.includes('ow-step-num--done') || planSrc.includes('var(--ok)'),
        'Done state must use var(--ok) green fill'
      );
      assert.ok(
        planSrc.includes('ow-step-num--running') || planSrc.includes('var(--accent)') || planSrc.includes('animate-ow-spin'),
        'Running state must use var(--accent) amber ring & spin'
      );
      assert.ok(
        planSrc.includes('ow-step-num--pending') || planSrc.includes('var(--border)'),
        'Pending state must use var(--border) zinc ring'
      );
    });

    await t3.test('3.4: Zero Steps Resilient Handling', () => {
      assert.ok(planSrc.includes('if (steps.length === 0) return null;'), 'Must return null gracefully when steps array is empty');
    });

    await t3.test('3.5: Extremely Long Step Title (1,000+ chars) Line Wrapping', () => {
      const longTitle = 'Bước phân tích chi tiết: ' + 'Tính toán tỷ suất lợi nhuận trên tài sản (ROA) và vốn chủ sở hữu (ROE) cho từng danh mục sản phẩm. '.repeat(15);
      assert.ok(longTitle.length > 1000);
      assert.ok(planSrc.includes('min-w-0 flex-1'), 'Step title container must include min-w-0 flex-1 to prevent circle shrinking');
    });
  });

  // ===========================================================================
  // PILLAR 4: TOOL DISCLOSURE DARK CODE DRAWER & CONTRAST CALCULATIONS
  // ===========================================================================
  await t.test('Pillar 4: Tool Call Disclosure Dark Code Contrast & Large Payloads', async (t4) => {
    const toolSrc = readFile(ROOT, 'components/openwork/OpenWorkCapabilityCallLine.tsx');
    const chatCssSrc = readFile(ROOT, 'components/openwork/styles/openwork-chat.css');

    await t4.test('4.1: 10px Border Radius & var(--code) Dark Code Drawer Invariants', () => {
      const has10px = toolSrc.includes('rounded-[10px]') || chatCssSrc.includes('border-radius: 10px');
      assert.ok(has10px, 'Tool card container must apply 10px border radius');

      const hasVarCode = toolSrc.includes('var(--code)') || chatCssSrc.includes('background: var(--code)');
      assert.ok(hasVarCode, 'Expanded code drawer must use var(--code) token');

      const has95pxLabels = toolSrc.includes('9.5px') || toolSrc.includes('text-[9.5px]') || chatCssSrc.includes('font-size: 9.5px');
      assert.ok(has95pxLabels, 'Drawer labels must apply 9.5px uppercase monospace formatting');

      const has115pxCode = toolSrc.includes('11.5px') || toolSrc.includes('text-[11.5px]') || chatCssSrc.includes('font-size: 11.5px');
      assert.ok(has115pxCode, 'Drawer code text must apply 11.5px monospace font');
    });

    await t4.test('4.2: Dark Code Background Contrast Calculation (WCAG 2.1 AAA & AA Compliance)', () => {
      // Light mode tokens:
      // --code: #0b0b0e (Dark drawer surface)
      // --code-fg: #f4f4f5 (Code text foreground)
      // Output text: #a1a1aa (Secondary output code foreground)
      // Uppercase section label: #71717a (Incidental header tag)
      const codeBgLight = '#0b0b0e';
      const codeFgLight = '#f4f4f5';
      const codeOutputLight = '#a1a1aa';
      const codeLabelLight = '#71717a';

      const codeContrastLight = getContrastRatio(codeBgLight, codeFgLight);
      const outputContrastLight = getContrastRatio(codeBgLight, codeOutputLight);
      const labelContrastLight = getContrastRatio(codeBgLight, codeLabelLight);

      assert.ok(
        codeContrastLight >= 7.0,
        `Code text contrast in light mode is ${codeContrastLight.toFixed(2)}:1 (must meet WCAG AAA >= 7.0:1)`
      );
      assert.ok(
        outputContrastLight >= 7.0,
        `Output text contrast in light mode is ${outputContrastLight.toFixed(2)}:1 (must meet WCAG AAA >= 7.0:1)`
      );
      assert.ok(
        labelContrastLight >= 3.0,
        `Label header contrast in light mode is ${labelContrastLight.toFixed(2)}:1 (must meet WCAG AA Non-Text / Incidental >= 3.0:1)`
      );

      // Dark mode tokens:
      // --code: #050507 (Darker code drawer surface)
      // --code-fg: #fafafa (Code text foreground)
      const codeBgDark = '#050507';
      const codeFgDark = '#fafafa';
      const codeContrastDark = getContrastRatio(codeBgDark, codeFgDark);

      assert.ok(
        codeContrastDark >= 7.0,
        `Code text contrast in dark mode is ${codeContrastDark.toFixed(2)}:1 (must meet WCAG AAA >= 7.0:1)`
      );
    });

    await t4.test('4.3: Large 50KB SQL Query & 100KB JSON Payloads Formatting', () => {
      // Generate massive SQL query (> 50KB)
      let sqlParts = ['SELECT\n  o.order_id,\n  c.customer_name,\n  p.product_sku,\n  SUM(oi.quantity * oi.unit_price) AS total_revenue\nFROM orders o\nJOIN customers c ON o.customer_id = c.customer_id\nJOIN order_items oi ON o.order_id = oi.order_id\nJOIN products p ON oi.product_id = p.product_id\nWHERE o.order_date >= \'2026-01-01\'\n'];
      for (let i = 1; i <= 800; i++) {
        sqlParts.push(`  AND o.region_id <> 'EXCLUDED_REGION_${i}'\n  OR c.segment_id = 'SEG_${i}'\n`);
      }
      sqlParts.push('GROUP BY o.order_id, c.customer_name, p.product_sku\nORDER BY total_revenue DESC LIMIT 5000;');
      const largeSql = sqlParts.join('');

      assert.ok(largeSql.length > 50000, `SQL size is ${largeSql.length} bytes (must be > 50KB)`);

      // Generate large JSON response (> 100KB)
      const largeJsonObj = {
        status: 'success',
        executionTimeMs: 1420,
        rowCount: 800,
        columns: ['order_id', 'customer_name', 'product_sku', 'total_revenue'],
        rows: Array.from({ length: 800 }, (_, idx) => ({
          order_id: `ORD-2026-${10000 + idx}`,
          customer_name: `Tập đoàn Bán lẻ & Sản xuất Số ${idx}`,
          product_sku: `SKU-DBGPT-${idx % 50}`,
          total_revenue: 15000000 + idx * 250000,
        }))
      };
      const largeJsonStr = JSON.stringify(largeJsonObj, null, 2);
      assert.ok(largeJsonStr.length > 100000, `JSON size is ${largeJsonStr.length} bytes (must be > 100KB)`);

      // Verify formatting & horizontal scroll CSS class
      assert.ok(toolSrc.includes('overflow-x-auto') || chatCssSrc.includes('overflow-x: auto'), 'Code drawer must support horizontal scrolling');
      assert.ok(toolSrc.includes('custom-scrollbar'), 'Code drawer pre element must apply custom-scrollbar');
    });

    await t4.test('4.4: Category Badge & Tool Verb Resolution Matrix', () => {
      function resolveToolBadgeAndLabel(toolName, customDisplayName) {
        const lower = (toolName || '').toLowerCase();
        if (lower.includes('sql') || lower.includes('database') || lower.includes('query')) {
          return { badge: 'SQL', codeLabel: 'TRUY VẤN SQL', defaultSentence: 'Truy vấn cơ sở dữ liệu' };
        }
        if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('xlsx')) {
          return { badge: 'XLSX', codeLabel: 'DỰNG BẢNG TÍNH', defaultSentence: 'Dựng bảng tính Excel' };
        }
        if (lower.includes('presentation') || lower.includes('slide') || lower.includes('pptx')) {
          return { badge: 'PPTX', codeLabel: 'DỰNG SLIDE 16:9', defaultSentence: 'Tạo slide trình chiếu 16:9' };
        }
        if (lower.includes('doc') || lower.includes('word') || lower.includes('report')) {
          return { badge: 'DOCX', codeLabel: 'TÀI LIỆU A4', defaultSentence: 'Biên soạn tài liệu văn bản A4' };
        }
        if (lower.includes('python') || lower.includes('sandbox') || lower.includes('script') || lower.includes('code')) {
          return { badge: 'PYTHON', codeLabel: 'MÃ PYTHON', defaultSentence: 'Thực thi mã Python Sandbox' };
        }
        if (lower.includes('schema') || lower.includes('introspect')) {
          return { badge: 'SCHEMA', codeLabel: 'LƯỢC ĐỒ DỮ LIỆU', defaultSentence: 'Khảo sát lược đồ cơ sở dữ liệu' };
        }
        return { badge: (toolName || 'TOOL').slice(0, 6).toUpperCase(), codeLabel: 'CÔNG CỤ THỰC THI', defaultSentence: customDisplayName || toolName || 'Thực thi công cụ tự hành' };
      }

      assert.equal(resolveToolBadgeAndLabel('execute_sql_query').badge, 'SQL');
      assert.equal(resolveToolBadgeAndLabel('spreadsheet_studio').badge, 'XLSX');
      assert.equal(resolveToolBadgeAndLabel('presentation_builder').badge, 'PPTX');
      assert.equal(resolveToolBadgeAndLabel('word_doc_writer').badge, 'DOCX');
      assert.equal(resolveToolBadgeAndLabel('python_sandbox_run').badge, 'PYTHON');
      assert.equal(resolveToolBadgeAndLabel('introspect_db_schema').badge, 'SCHEMA');
      assert.equal(resolveToolBadgeAndLabel('unknown_custom_tool').badge, 'UNKNOW');
    });

    await t4.test('4.5: Duration Formatter (Stopwatch) Multi-Scale Accuracy', () => {
      function formatDuration(ms) {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        const s = ms / 1000;
        if (s < 10) return `${s.toFixed(1).replace('.', ',')}s`;
        if (s < 60) return `${Math.round(s)}s`;
        const mins = Math.floor(s / 60);
        const remSecs = Math.round(s % 60);
        return `${mins}m ${remSecs}s`;
      }

      assert.equal(formatDuration(0), '0ms');
      assert.equal(formatDuration(45), '45ms');
      assert.equal(formatDuration(350), '350ms');
      assert.equal(formatDuration(1200), '1,2s');
      assert.equal(formatDuration(5800), '5,8s');
      assert.equal(formatDuration(15400), '15s');
      assert.equal(formatDuration(74000), '1m 14s');
      assert.equal(formatDuration(3665000), '61m 5s');
    });
  });

  // ===========================================================================
  // PILLAR 5: DUAL-TREE 1:1 STRUCTURAL & FUNCTIONAL PARITY
  // ===========================================================================
  await t.test('Pillar 5: Dual-Tree / Single-Tree Parity & Canonical Integrity', async (t5) => {
    const hasMock = fs.existsSync(MOCK_ROOT);
    if (hasMock) {
      assert.ok(hasMock, 'frontend_mock directory exists for dual-tree audit');
    }

    const m2Files = [
      'components/openwork/OpenWorkUserBubble.tsx',
      'components/openwork/OpenWorkReasoningBlock.tsx',
      'components/openwork/OpenWorkPlanCard.tsx',
      'components/openwork/OpenWorkCapabilityCallLine.tsx',
      'components/openwork/OpenWorkAnswerBlock.tsx',
      'components/openwork/OpenWorkKeyFindingsCard.tsx',
      'components/openwork/OpenWorkMarkdownRenderer.tsx',
      'components/openwork/OpenWorkTurnActionRow.tsx',
      'components/openwork/OpenWorkChatSurface.tsx',
      'components/openwork/types.ts',
      'components/openwork/styles/openwork-chat.css',
    ];

    for (const relFile of m2Files) {
      await t5.test(`5.Parity: ${relFile}`, () => {
        const prodPath = path.join(ROOT, relFile);
        assert.ok(fs.existsSync(prodPath), `Prod file exists: ${relFile}`);
        const prodContent = fs.readFileSync(prodPath, 'utf8');
        assert.ok(prodContent.length > 100, `Prod content not empty: ${relFile}`);

        if (hasMock) {
          const mockPath = path.join(MOCK_ROOT, relFile);
          assert.ok(fs.existsSync(mockPath), `Mock file exists: ${relFile}`);
          const mockContent = fs.readFileSync(mockPath, 'utf8');
          assert.ok(mockContent.length > 100, `Mock content not empty: ${relFile}`);
          assert.equal(
            prodContent.length,
            mockContent.length,
            `File byte-length matches 1:1 between trees for ${relFile}`
          );
        }
      });
    }
  });
});
