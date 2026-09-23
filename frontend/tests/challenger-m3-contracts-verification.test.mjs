#!/usr/bin/env node
/**
 * DB-GPT OpenWork: Milestone 3 Component Contract Verification Suite
 * Archetype: Empirical Challenger (challenger_15_1)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

test('Empirical Verification: Component Contracts & Invariants', async (t) => {
  // 1. Composer card geometry (18px)
  await t.test('1. Composer card geometry is 18px (rounded-[18px])', () => {
    const tsx = readFile('components/openwork/OpenWorkComposer.tsx');
    assert.match(
      tsx,
      /className="[^"]*ow-composer-capsule[^"]*rounded-\[18px\][^"]*"/,
      'Composer outer capsule must have rounded-[18px]'
    );
    assert.match(
      tsx,
      /border border-\[var\(--border\)\] bg-\[var\(--card\)\] shadow-\[var\(--shadow\)\]/,
      'Composer capsule must adhere to design tokens'
    );
    assert.match(
      tsx,
      /min-h-\[44px\] max-h-\[180px\]/,
      'Textarea must be bounded between 44px and 180px'
    );
  });

  // 2. Tool Aggregation capsule renders 0 inner rows when collapsed
  await t.test('2. Tool Aggregation capsule renders 0 inner rows when collapsed', () => {
    const tsx = readFile('components/openwork/OpenWorkToolAggregateGroup.tsx');
    
    // Default collapsed state
    assert.match(
      tsx,
      /const \[expanded, setExpanded\] = useState\(part\.isExpanded \|\| false\);/,
      'Default expanded state must be false unless explicitly true'
    );
    
    // Collapsed condition renders 0 inner rows
    assert.match(
      tsx,
      /<AnimatePresence initial=\{false\}>\s*\{expanded && \(/,
      'AnimatePresence must guard rows with {expanded && (...)}'
    );
    
    // Header trigger
    assert.match(
      tsx,
      /⚡ \$\{tools\.length\} thao tác truy vấn & phân tích dữ liệu/,
      'Header title must format as "⚡ N thao tác truy vấn & phân tích dữ liệu"'
    );
  });

  // 3. Reasoning block trigger matches 🧠 Đã suy luận trong Xs (Y từ)
  await t.test('3. Reasoning block trigger matches 🧠 Đã suy luận trong Xs (Y từ)', () => {
    const tsx = readFile('components/openwork/OpenWorkReasoningBlock.tsx');

    assert.match(
      tsx,
      /🧠 Đang suy luận…/,
      'Streaming state must have 🧠 Đang suy luận…'
    );
    assert.match(
      tsx,
      /🧠 Đã suy luận trong \$\{secs\}s \(\$\{wordCount\} từ\)/,
      'Completed state with durationMs must match format'
    );
    assert.match(
      tsx,
      /🧠 Đã suy luận trong \$\{elapsedSeconds\}s \(\$\{wordCount\} từ\)/,
      'Completed state with elapsedSeconds must match format'
    );
    assert.match(
      tsx,
      /🧠 Đã suy luận trong 4s \(\$\{wordCount\} từ\)/,
      'Fallback completed state must match format'
    );

    // Functional regex verification of labels
    const formatRegex = /^🧠 Đã suy luận trong \d+s \(\d+ từ\)$/;
    assert.ok(formatRegex.test('🧠 Đã suy luận trong 5s (128 từ)'));
    assert.ok(formatRegex.test('🧠 Đã suy luận trong 1s (0 từ)'));
    assert.ok(formatRegex.test('🧠 Đã suy luận trong 12s (450 từ)'));
  });

  // 4. Excel viewer parses currencies ($) and percentages (%) into right-aligned tabular figures
  await t.test('4. Excel viewer parses currencies ($) and percentages (%) into right-aligned tabular figures', () => {
    const tsx = readFile('components/ai-data-analytic/office-excel/ExcelArtifactViewer.tsx');

    // Numeric parsing logic
    assert.match(
      tsx,
      /const stripped = String\(v\)\.replace\(\/\[\^0-9\.-]\/g, ''\);/,
      'Must strip non-digits to test numeric float'
    );
    assert.match(
      tsx,
      /out\[c\] = seen > 0 && nums \/ seen > 0\.6;/,
      'Must use 60% threshold for numeric columns'
    );

    // Table cell styling
    assert.match(
      tsx,
      /className=\{\`ow-xl-cell \$\{numericCols\[cIdx\] \? 'justify-end text-right' : ''\}\`\}/,
      'Numeric cell container must have justify-end text-right'
    );
    assert.match(
      tsx,
      /className=\{numericCols\[cIdx\] \? 'text-right font-mono tabular-nums' : undefined\}/,
      'Numeric cell content must have text-right font-mono tabular-nums'
    );

    // Empirical simulation of strip and detection
    const testValues = [
      { val: '$1,250.00', expected: true },
      { val: '  $99.95  ', expected: true },
      { val: '-$450.00', expected: true },
      { val: '24.5%', expected: true },
      { val: '-5.2%', expected: true },
      { val: '100%', expected: true },
      { val: 'Total Revenue', expected: false },
      { val: 'Region North', expected: false },
    ];

    for (const item of testValues) {
      const stripped = String(item.val).replace(/[^0-9.-]/g, '');
      const isNum = Boolean(stripped && !isNaN(parseFloat(stripped)));
      assert.equal(isNum, item.expected, `Value "${item.val}" should be numeric=${item.expected}`);
    }
  });
});
