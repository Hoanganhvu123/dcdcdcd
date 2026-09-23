#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TIERS = [
  {
    tierNumber: 1,
    name: 'Tier 1 — Feature Coverage',
    target: 85,
    file: path.join(__dirname, 'e2e-visual/tier1-feature-coverage.test.mjs'),
    description: 'Isolated verification of font stacks, zinc tokens, bubbles, reasoning, plans, tools, 262px sidebar, composer, and 15 mock pages',
  },
  {
    tierNumber: 2,
    name: 'Tier 2 — Boundary & Corner Cases',
    target: 80,
    file: path.join(__dirname, 'e2e-visual/tier2-boundary-matrix.test.mjs'),
    description: 'Light/dark theme contrast, multi-line reasoning traces, long prompts, massive payloads, application states, viewports',
  },
  {
    tierNumber: 3,
    name: 'Tier 3 — Cross-Feature Integration',
    target: 16,
    file: path.join(__dirname, 'e2e-visual/tier3-cross-feature.test.mjs'),
    description: 'Multi-turn chat, live streaming + thinking + theme switch, XLSX/PPTX/Word studio transitions, sidebar navigation flows',
  },
  {
    tierNumber: 4,
    name: 'Tier 4 — Real-World Application Scenarios',
    target: 8,
    file: path.join(__dirname, 'e2e-visual/tier4-real-world.test.mjs'),
    description: 'End-to-end user journeys: PnL deep analysis, board deck creation, compliance memos, datasource exploration, onboarding',
  },
];

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║ 🧪 DB-GPT OPENWORK: MASTER E2E VISUAL OVERHAUL TEST RUNNER             ║');
console.log('║    Authoritative Opaque-Box Specification Verification (Tiers 1 - 4)  ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

// Parse CLI flags (e.g. node e2e-visual-overhaul-runner.mjs --tier 1 or 2)
const args = process.argv.slice(2);
let selectedTier = null;
const tierArgIdx = args.findIndex(a => a === '--tier' || a === '-t');
if (tierArgIdx !== -1 && args[tierArgIdx + 1]) {
  selectedTier = parseInt(args[tierArgIdx + 1], 10);
} else if (args[0] && !isNaN(parseInt(args[0], 10))) {
  selectedTier = parseInt(args[0], 10);
}

const tiersToRun = selectedTier
  ? TIERS.filter(t => t.tierNumber === selectedTier)
  : TIERS;

if (tiersToRun.length === 0) {
  console.error(`❌ Error: Invalid tier specified (${selectedTier}). Valid options: 1, 2, 3, 4.`);
  process.exit(1);
}

async function runTier(tier) {
  const start = performance.now();
  console.log(`\n════════════════════════════════════════════════════════════════════════`);
  console.log(`📦 RUNNING ${tier.name.toUpperCase()} (Target: ≥${tier.target} Tests)`);
  console.log(`   Scope: ${tier.description}`);
  console.log(`════════════════════════════════════════════════════════════════════════\n`);

  if (!fs.existsSync(tier.file)) {
    console.error(`❌ Test file missing: ${tier.file}`);
    return {
      tier: tier.name,
      tierNumber: tier.tierNumber,
      target: tier.target,
      total: 0,
      passed: 0,
      failed: 1,
      duration: 0,
      code: 1,
    };
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tier.file], {
      cwd: rootDir,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      const duration = ((performance.now() - start) / 1000).toFixed(2);
      
      // Parse combined output for accurate counts
      const combined = stdout + '\n' + stderr;
      const passMatches = combined.match(/\[PASS\]/g) || [];
      const failMatches = combined.match(/\[FAIL\]/g) || [];
      const totalCount = passMatches.length + failMatches.length;

      resolve({
        tier: tier.name,
        tierNumber: tier.tierNumber,
        target: tier.target,
        total: totalCount,
        passed: passMatches.length,
        failed: failMatches.length,
        duration,
        code,
      });
    });
  });
}

async function main() {
  const globalStart = performance.now();
  const results = [];

  for (const tier of tiersToRun) {
    const res = await runTier(tier);
    results.push(res);
  }

  const globalDuration = ((performance.now() - globalStart) / 1000).toFixed(2);
  const totalTests = results.reduce((acc, r) => acc + r.total, 0);
  const totalPassed = results.reduce((acc, r) => acc + r.passed, 0);
  const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);
  const totalTarget = results.reduce((acc, r) => acc + r.target, 0);

  console.log('\n\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║ 📊 E2E VISUAL OVERHAUL TEST EXECUTION DASHBOARD                        ║');
  console.log('╠════════════════════════════════════════════════════════════════════════╣');

  for (const r of results) {
    const statusTag = r.failed === 0 ? '✅ PASS' : `❌ FAIL (${r.failed} err)`;
    const countTag = `${r.passed}/${r.total} passed (Min: ${r.target})`;
    console.log(`║  ${r.tier.padEnd(38)} : ${statusTag.padEnd(16)} ${countTag.padEnd(28)} ║`);
  }

  console.log('╠════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Test Assertions Executed : ${totalTests.toString().padEnd(41)} ║`);
  console.log(`║  Total Passing Assertions       : ${totalPassed.toString().padEnd(41)} ║`);
  console.log(`║  Total Failing Assertions       : ${totalFailed.toString().padEnd(41)} ║`);
  console.log(`║  Minimum Target Threshold       : ${totalTarget.toString().padEnd(41)} ║`);
  console.log(`║  Total Execution Time           : ${(globalDuration + 's').padEnd(41)} ║`);
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  if (totalFailed > 0) {
    console.error(`❌ Suite completed with ${totalFailed} failing assertions.`);
    process.exit(1);
  } else {
    console.log(`🎉 All ${totalPassed} assertions across Tiers 1-4 passed with 100% success rate!`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
