#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CONTROL_TIERS = [
  {
    name: 'Tier 1: Affordance & Context Feature Coverage',
    file: 'control-tier1-features.test.mjs',
    path: path.join(__dirname, 'control-tier1-features.test.mjs'),
  },
  {
    name: 'Tier 2: Boundary, Concurrency & Mutex Resilience',
    file: 'control-tier2-boundary.test.mjs',
    path: path.join(__dirname, 'control-tier2-boundary.test.mjs'),
  },
  {
    name: 'Tier 3: Cross-Feature Dispatch & Lifecycle Hooks',
    file: 'control-tier3-dispatch.test.mjs',
    path: path.join(__dirname, 'control-tier3-dispatch.test.mjs'),
  },
  {
    name: 'Tier 4: Real-World Multi-Agent Workloads & Bridge E2E',
    file: 'control-tier4-bridge.test.mjs',
    path: path.join(__dirname, 'control-tier4-bridge.test.mjs'),
  },
  {
    name: 'Tier 5: M1/M2 Adversarial Concurrency & Mutex Challenge',
    file: 'control-adversarial-challenger.test.mjs',
    path: path.join(__dirname, 'control-adversarial-challenger.test.mjs'),
  },
  {
    name: 'Tier 6: M3/M4 WebSocket Framing, HTTP Fuzzing & Narration Stream Challenge',
    file: 'control-m3-m4-stress.test.mjs',
    path: path.join(__dirname, 'control-m3-m4-stress.test.mjs'),
  },
];

console.log('================================================================');
console.log('🎮 DB-GPT OPENWORK UI CONTROL ARCHITECTURE: 4-TIER TEST SUITE');
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

  for (const tier of CONTROL_TIERS) {
    console.log(`\n📦 ${tier.name}`);
    console.log('─'.repeat(64));

    if (!fs.existsSync(tier.path)) {
      console.error(`  ❌ MISSING: ${tier.file}`);
      totalSuites++;
      failedSuites++;
      tierResults.push({ tier: tier.name, passed: false });
      continue;
    }

    totalSuites++;
    const result = await runTestFile(tier.path, tier.file);
    if (result.code === 0) {
      console.log(`  ✅ PASS: ${tier.file}`);
      if (result.stdout) {
        const lines = result.stdout.trim().split('\n');
        for (const line of lines) {
          if (line.includes('✔') || line.includes('ℹ pass')) {
            console.log(`     ${line.trim()}`);
          }
        }
      }
      passedSuites++;
      tierResults.push({ tier: tier.name, passed: true, file: tier.file });
    } else {
      console.error(`  ❌ FAIL: ${tier.file} (Exit code: ${result.code})`);
      if (result.stderr) console.error(`     ${result.stderr.trim()}`);
      if (result.stdout && !result.stderr) console.error(`     ${result.stdout.trim()}`);
      failedSuites++;
      tierResults.push({ tier: tier.name, passed: false, file: tier.file });
    }
  }

  const globalDuration = (performance.now() - globalStart).toFixed(2);

  console.log('\n================================================================');
  console.log('📊 TEST EXECUTION SUMMARY & COVERAGE METRICS');
  console.log('================================================================');
  for (const tr of tierResults) {
    const status = tr.passed ? '✅ 100% PASS' : '❌ FAIL';
    console.log(`  ${tr.tier.padEnd(54)}: ${status}`);
  }
  console.log('─'.repeat(64));
  console.log(`  Total Suites:   ${totalSuites}`);
  console.log(`  Passed Suites:  ${passedSuites}`);
  console.log(`  Failed Suites:  ${failedSuites}`);
  console.log(`  Total Duration: ${globalDuration}ms`);
  console.log('================================================================\n');

  if (failedSuites > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Master test runner fatal error:', err);
  process.exit(1);
});
