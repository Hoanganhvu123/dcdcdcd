#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TIERS = [
  {
    name: 'Tier 1: Core Feature Contracts (≥5 Tests per Feature)',
    dir: path.join(__dirname, 'tier1-features'),
    files: [
      'sidebar.test.mjs',
      'header.test.mjs',
      'chat-stream.test.mjs',
      'reasoning-accordion.test.mjs',
      'artifact-workspace.test.mjs',
      'polish-fluid.test.mjs',
      'universal-flow-dag.test.mjs',
    ],
  },
  {
    name: 'Tier 2: Boundary, Adversarial & Error Handling',
    dir: path.join(__dirname, 'tier2-boundary'),
    files: [
      'empty-states.test.mjs',
      'long-reasoning-traces.test.mjs',
      'markdown-latex-parsing.test.mjs',
      'rapid-tool-calls.test.mjs',
      'error-states-resilience.test.mjs',
      'theme-and-localization.test.mjs',
    ],
  },
  {
    name: 'Tier 3: Cross-Feature Interactions & Combinations',
    dir: path.join(__dirname, 'tier3-cross-feature'),
    files: [
      'split-screen-streaming-theme.test.mjs',
      'sidebar-reasoning-resize.test.mjs',
      'multi-artifact-switching.test.mjs',
      'locale-switch-during-stream.test.mjs',
    ],
  },
  {
    name: 'Tier 4: Real-World Application Workloads',
    dir: path.join(__dirname, 'tier4-workloads'),
    files: [
      'sql-analysis-chart-workload.test.mjs',
      'excel-financial-modeling-workload.test.mjs',
      'slides-studio-presentation-workload.test.mjs',
      'docx-report-generation-workload.test.mjs',
    ],
  },
  {
    name: 'Tier 5: Milestone 3 Strict Execution Spotlight & Challenger Suites',
    dir: path.join(__dirname),
    files: [
      'challenger-m3-spotlight-skeleton.test.mjs',
      'challenger-tool-artifact-sync.test.mjs',
      'challenger-m2-adversarial-empirical.test.mjs',
    ],
  },
  {
    name: 'Tier 6: Provider Lock & Source-Backed Contract Gates',
    dir: path.join(__dirname),
    files: [
      // Doc source that -> chan model la len lai. Cac suite khac chi test ban sao.
      'multi-vendor-m1.check.mjs',
      'adversarial-r2-verification.check.mjs',
    ],
  },
];

console.log('================================================================');
console.log('🧪 DB-GPT MODERN UI OVERHAUL: 4-TIER MASTER TEST RUNNER');
console.log('================================================================\n');

let totalSuites = 0;
let passedSuites = 0;
let failedSuites = 0;
const tierResults = [];

async function runTestFile(filePath, fileName) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [filePath], {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
        fileName,
      });
    });
  });
}

async function main() {
  const globalStart = performance.now();

  for (const tier of TIERS) {
    console.log(`\n📦 ${tier.name}`);
    console.log('─'.repeat(64));

    let tierPassed = 0;
    let tierFailed = 0;

    for (const file of tier.files) {
      const fullPath = path.join(tier.dir, file);
      if (!fs.existsSync(fullPath)) {
        console.error(`  ❌ MISSING: ${file}`);
        totalSuites++;
        failedSuites++;
        tierFailed++;
        continue;
      }

      totalSuites++;
      const result = await runTestFile(fullPath, file);
      if (result.code === 0) {
        console.log(`  ✅ PASS: ${file}`);
        passedSuites++;
        tierPassed++;
      } else {
        console.error(`  ❌ FAIL: ${file} (Exit code: ${result.code})`);
        if (result.stderr) console.error(`     ${result.stderr.trim()}`);
        if (result.stdout && !result.stderr) console.error(`     ${result.stdout.trim()}`);
        failedSuites++;
        tierFailed++;
      }
    }

    tierResults.push({
      tier: tier.name,
      total: tier.files.length,
      passed: tierPassed,
      failed: tierFailed,
    });
  }

  const globalDuration = (performance.now() - globalStart).toFixed(2);

  console.log('\n================================================================');
  console.log('📊 TEST EXECUTION SUMMARY & COVERAGE METRICS');
  console.log('================================================================');
  for (const tr of tierResults) {
    const status = tr.failed === 0 ? '✅ 100%' : `❌ ${tr.passed}/${tr.total}`;
    console.log(`  ${tr.tier.padEnd(52)}: ${status} (${tr.passed}/${tr.total} suites)`);
  }
  console.log('─'.repeat(64));
  console.log(`  Total Suites Run: ${totalSuites}`);
  console.log(`  Passed:           ${passedSuites}`);
  console.log(`  Failed:           ${failedSuites}`);
  console.log(`  Total Duration:   ${globalDuration}ms`);
  console.log('================================================================\n');

  if (failedSuites > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
