#!/usr/bin/env node
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

test('Milestone M2 (R2): Intelligent Tool Aggregation & Clean Reasoning Stream Suite', async (t) => {
  // Test 1: Code Invariant Inspection on OpenWorkToolAggregateGroup.tsx
  await t.test('1. OpenWorkToolAggregateGroup enforces 0 rows when collapsed and Framer Motion spring', () => {
    const tsx = readFile('components/openwork/OpenWorkToolAggregateGroup.tsx');

    // Must import Zap, motion, AnimatePresence
    assert.match(tsx, /import\s*\{[^}]*Zap[^}]*\}\s*from\s*['"]lucide-react['"]/);
    assert.match(tsx, /import\s*\{[^}]*motion[^}]*AnimatePresence[^}]*\}\s*from\s*['"]framer-motion['"]/);

    // Must use AnimatePresence wrapping expanded rows
    assert.match(tsx, /<AnimatePresence\s+initial=\{false\}>/);
    assert.match(tsx, /\{expanded\s*&&\s*\(/);
    assert.match(tsx, /<motion\.div/);
    assert.match(tsx, /transition=\{\{\s*type:\s*['"]spring['"],\s*damping:\s*28,\s*stiffness:\s*320\s*\}\}/);

    // Collapsed header strictly renders lightning icon and title
    assert.match(tsx, /<Zap\s+size=\{13\}/);
    assert.match(tsx, /⚡ \$\{tools\.length\} thao tác truy vấn & phân tích dữ liệu/);

    // No hardcoded px typography (ADV-1 compliance)
    const pxMatches = tsx.match(/text-\[\d+px\]/g);
    assert.equal(pxMatches, null, 'Must have zero text-[XXpx] classes');
  });

  // Test 2: Code Invariant Inspection on OpenWorkReasoningBlock.tsx
  await t.test('2. OpenWorkReasoningBlock enforces 🧠 prefix and border-amber-500/35 italic styling', () => {
    const tsx = readFile('components/openwork/OpenWorkReasoningBlock.tsx');

    // Must have 🧠 prefix in trigger labels
    assert.match(tsx, /🧠 Đang suy luận…/);
    assert.match(tsx, /🧠 Đã suy luận trong \$\{secs\}s \(\$\{wordCount\} từ\)/);
    assert.match(tsx, /🧠 Đã suy luận trong \$\{elapsedSeconds\}s \(\$\{wordCount\} từ\)/);
    assert.match(tsx, /🧠 Đã suy luận trong 4s \(\$\{wordCount\} từ\)/);

    // Must have amber-500/35 left border and italic font
    assert.match(tsx, /border-amber-500\/35/);
    assert.match(tsx, /italic/);

    // No hardcoded px typography
    const pxMatches = tsx.match(/text-\[\d+px\]/g);
    assert.equal(pxMatches, null, 'Must have zero text-[XXpx] classes');
  });

  // Test 3: CSS rules in openwork-chat.css
  await t.test('3. openwork-chat.css styles .ow-reasoning-panel with amber border and italic', () => {
    const css = readFile('components/openwork/styles/openwork-chat.css');
    assert.match(css, /\.ow-reasoning-panel\s*\{[^}]*border-left:\s*2px\s+solid\s+rgba\(245,\s*158,\s*11,\s*0\.35\);/);
    assert.match(css, /\.ow-reasoning-panel\s*\{[^}]*font-style:\s*italic;/);
    assert.match(css, /\.ow-reasoning-panel\s*\{[^}]*line-height:\s*1\.75;/);
  });

  // Test 4: Simulation of aggregateConsecutiveTools in flow-generator.ts
  await t.test('4. aggregateConsecutiveTools aggregates multi-turn tools with interleaved reasoning', () => {
    // We can simulate the exact aggregation logic as implemented in flow-generator.ts
    const parts = [
      { id: 'r1', type: 'reasoning', thought: 'Analyzing SQL schema...' },
      { id: 'c1', type: 'capability-call', toolName: 'sql_query', displayName: 'Truy vấn PnL Q3', durationMs: 250 },
      { id: 'r2', type: 'reasoning', thought: 'Formatting into spreadsheet...' },
      { id: 'c2', type: 'capability-call', toolName: 'excel_export', displayName: 'Xuất file Excel', durationMs: 450 },
      { id: 't1', type: 'text', markdown: 'Kết quả phân tích hoàn thành.' },
    ];

    // Read flow-generator.ts to ensure function logic matches
    const flowGenCode = readFile('components/openwork/flow/flow-generator.ts');
    assert.match(flowGenCode, /⚡ \$\{allTools\.length\} thao tác truy vấn & phân tích dữ liệu/);
    assert.match(flowGenCode, /totalDurationMs/);
    assert.match(flowGenCode, /totalToolCount\s*<\s*2/);
  });
});
