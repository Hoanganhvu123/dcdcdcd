/**
 * Master Unified Test Runner for Autonomous Business Agent Workflows
 *
 * Runs all 4 test tiers:
 * - Tier 1: Comprehensive Feature Coverage (15 Features, >=75 assertions)
 * - Tier 2: Boundary, Stress & Corner-Case Coverage (15 Features, >=75 assertions)
 * - Tier 3: Pairwise Cross-Feature Combinations (15 Pairs, >=15 assertions)
 * - Tier 4: Real-World Business Workloads (5 Workloads, >=10 assertions)
 *
 * Generates an institutional scorecard report and exits 0 on 100% pass.
 */

import { spawnSync } from "child_process";
import path from "path";

interface TierRunResult {
  tierNumber: number;
  tierName: string;
  file: string;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  success: boolean;
  rawOutput: string;
}

const TIERS = [
  { tierNumber: 1, tierName: "Comprehensive Feature Coverage (15 Features)", file: "tier1-feature-coverage.test.ts" },
  { tierNumber: 2, tierName: "Boundary, Stress & Corner-Case Matrix (15 Groups)", file: "tier2-boundary-stress.test.ts" },
  { tierNumber: 3, tierName: "Pairwise Cross-Feature Combinations (15 Pairs)", file: "tier3-pairwise-combinations.test.ts" },
  { tierNumber: 4, tierName: "Real-World Business End-to-End Workloads (5 Scenarios)", file: "tier4-realworld-workloads.test.ts" },
];

console.log("================================================================================");
console.log("  AUTONOMOUS BUSINESS AGENT WORKFLOW - UNIFIED 4-TIER MASTER TEST RUNNER");
console.log(`  Started at: ${new Date().toISOString()}`);
console.log("================================================================================\n");

const startTime = Date.now();
const results: TierRunResult[] = [];

for (const tier of TIERS) {
  const filePath = path.resolve(__dirname, tier.file);
  console.log(`▶ Executing Tier ${tier.tierNumber}: ${tier.tierName}...`);
  const tierStart = Date.now();

  const proc = spawnSync("npx", ["tsx", filePath], {
    shell: true,
    encoding: "utf8",
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env },
  });

  const durationMs = Date.now() - tierStart;
  const output = (proc.stdout || "") + (proc.stderr || "");

  // Parse pass/fail counts from stdout
  const passMatches = output.match(/\[PASS\]/g) || [];
  const failMatches = output.match(/\[FAIL\]/g) || [];

  const passedCount = passMatches.length;
  const failedCount = failMatches.length;
  const success = proc.status === 0 && failedCount === 0 && passedCount > 0;

  results.push({
    tierNumber: tier.tierNumber,
    tierName: tier.tierName,
    file: tier.file,
    passedCount,
    failedCount,
    durationMs,
    success,
    rawOutput: output,
  });

  if (success) {
    console.log(`  ✔ Tier ${tier.tierNumber} PASSED: ${passedCount} assertions in ${(durationMs / 1000).toFixed(2)}s\n`);
  } else {
    console.error(`  ✖ Tier ${tier.tierNumber} FAILED: ${passedCount} passed, ${failedCount} failed in ${(durationMs / 1000).toFixed(2)}s\n`);
    console.error(output);
  }
}

const totalDurationMs = Date.now() - startTime;
const totalPassed = results.reduce((a, b) => a + b.passedCount, 0);
const totalFailed = results.reduce((a, b) => a + b.failedCount, 0);
const allSucceeded = results.every((r) => r.success);

// Render Final Institutional Scorecard
console.log("================================================================================");
console.log("                     FINAL TEST EXECUTION SCORECARD REPORT                     ");
console.log("================================================================================");
console.log(" Tier  | Test Suite Description                               | Pass | Fail | Time  | Status ");
console.log("-------+------------------------------------------------------+------+------+-------+--------");

results.forEach((r) => {
  const tNum = `T${r.tierNumber}`.padEnd(5, " ");
  const desc = r.tierName.padEnd(52, " ");
  const pCount = r.passedCount.toString().padStart(4, " ");
  const fCount = r.failedCount.toString().padStart(4, " ");
  const tSec = `${(r.durationMs / 1000).toFixed(2)}s`.padStart(5, " ");
  const status = r.success ? " PASS   " : " FAIL   ";
  console.log(` ${tNum} | ${desc} | ${pCount} | ${fCount} | ${tSec} | ${status}`);
});

console.log("-------+------------------------------------------------------+------+------+-------+--------");
console.log(
  ` TOTAL | 4 Verification Tiers / Complete Feature Inventory   | ${totalPassed
    .toString()
    .padStart(4, " ")} | ${totalFailed.toString().padStart(4, " ")} | ${(totalDurationMs / 1000)
    .toFixed(2)
    .padStart(5, " ")}s | ${allSucceeded ? " 100%   " : " FAILED "}`
);
console.log("================================================================================\n");

if (allSucceeded) {
  console.log(`🎉 ALL 4 TEST TIERS PASSED WITH 100% SUCCESS RATE (${totalPassed} TOTAL ASSERTIONS PASSED)!`);
  console.log(`✔ Single-tree OpenWork Studio verified for frontend.`);
  process.exit(0);
} else {
  console.error(`❌ TEST SUITE FAILED: ${totalFailed} assertions failed across ${results.filter((r) => !r.success).length} tiers.`);
  process.exit(1);
}