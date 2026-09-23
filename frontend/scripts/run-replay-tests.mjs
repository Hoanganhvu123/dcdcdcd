#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.resolve(ROOT, '__tests__/replay');

const TIERS = [
  {
    tier: 'Tier 1',
    name: 'Tier 1: Feature Coverage (Schema, Clock, Steps, Speeds, Artifact Sync, Fork Context)',
    file: 'tier1-feature-coverage.test.mjs',
    minExpected: 50,
  },
  {
    tier: 'Tier 2',
    name: 'Tier 2: Boundary & Corner Cases (Overflows, Extreme Steps, Empty Traces, Rapid Toggles, Instant Mode)',
    file: 'tier2-boundary-corner-cases.test.mjs',
    minExpected: 50,
  },
  {
    tier: 'Tier 3',
    name: 'Tier 3: Cross-Feature Combinations (Scrub + Speed, Manual Interruption, Mode Switching, Fork After Seek)',
    file: 'tier3-cross-feature-combinations.test.mjs',
    minExpected: 15,
  },
  {
    tier: 'Tier 4',
    name: 'Tier 4: Real-World Workload Scenarios (3 Complete Showcase Replays & Multi-Speed Simulations)',
    file: 'tier4-real-world-workloads.test.mjs',
    minExpected: 5,
  },
];

console.log('================================================================================');
console.log('🎬 DB-GPT KIMI-STYLE AGENT REPLAY & PLAYBACK SYSTEM: 4-TIER E2E TEST RUNNER');
console.log('================================================================================\n');

async function runTestFile(filePath, fileName) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', filePath], {
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
      // Parse passed tests count from stdout
      let passCount = 0;
      const cleanStdout = stdout.replace(/\u001b\[[0-9;]*m/g, '');
      const passMatch = cleanStdout.match(/pass\s+(\d+)/i);
      if (passMatch) {
        passCount = parseInt(passMatch[1], 10);
      } else {
        const checkMatches = cleanStdout.match(/✔/g);
        passCount = checkMatches ? checkMatches.length : 0;
      }

      resolve({
        code,
        stdout,
        stderr,
        fileName,
        passCount,
      });
    });
  });
}

async function main() {
  const globalStart = performance.now();
  let totalSuites = 0;
  let passedSuites = 0;
  let failedSuites = 0;
  let totalTestsPassed = 0;
  const tierResults = [];

  for (const tierDef of TIERS) {
    const fullPath = path.join(TEST_DIR, tierDef.file);
    console.log(`📦 [${tierDef.tier}] ${tierDef.name}`);
    console.log('─'.repeat(80));

    if (!fs.existsSync(fullPath)) {
      console.error(`  ❌ MISSING TEST SUITE: ${tierDef.file}`);
      totalSuites++;
      failedSuites++;
      tierResults.push({
        tier: tierDef.tier,
        name: tierDef.name,
        passed: false,
        testCount: 0,
        minExpected: tierDef.minExpected,
      });
      continue;
    }

    totalSuites++;
    const result = await runTestFile(fullPath, tierDef.file);

    if (result.code === 0) {
      console.log(`  ✅ PASSED: ${tierDef.file} (${result.passCount} assertions passed)`);
      passedSuites++;
      totalTestsPassed += result.passCount;
      tierResults.push({
        tier: tierDef.tier,
        name: tierDef.name,
        passed: true,
        testCount: result.passCount,
        minExpected: tierDef.minExpected,
      });
    } else {
      console.error(`  ❌ FAILED: ${tierDef.file} (Exit code: ${result.code})`);
      if (result.stderr) console.error(`     ${result.stderr.trim()}`);
      if (result.stdout && !result.stderr) console.error(`     ${result.stdout.trim()}`);
      failedSuites++;
      tierResults.push({
        tier: tierDef.tier,
        name: tierDef.name,
        passed: false,
        testCount: result.passCount,
        minExpected: tierDef.minExpected,
      });
    }
    console.log('');
  }

  const globalDuration = (performance.now() - globalStart).toFixed(2);

  console.log('================================================================================');
  console.log('📊 TEST EXECUTION SUMMARY & COVERAGE SCORECARD');
  console.log('================================================================================');
  for (const tr of tierResults) {
    const statusIcon = tr.passed && tr.testCount >= tr.minExpected ? '✅ PASS' : '❌ FAIL';
    const countBadge = `${tr.testCount}/${tr.minExpected} req`.padStart(12);
    console.log(`  ${statusIcon} | ${tr.tier.padEnd(8)} | ${countBadge} | ${tr.name}`);
  }
  console.log('─'.repeat(80));
  console.log(`  Total Test Suites:     ${passedSuites} / ${totalSuites} passed`);
  console.log(`  Total Tests Executed:  ${totalTestsPassed} rigorous test assertions`);
  console.log(`  Execution Time:        ${globalDuration}ms`);
  console.log(`  Final Status:          ${failedSuites === 0 ? '🎉 100% SUITE PASS' : '⚠️ FAILURES ENCOUNTERED'}`);
  console.log('================================================================================\n');

  if (failedSuites > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running replay test suite:', err);
  process.exit(1);
});
