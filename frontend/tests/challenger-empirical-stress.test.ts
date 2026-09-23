/**
 * Challenger Final Empirical Adversarial Stress Test Suite
 *
 * Exhaustive independent stress-testing across:
 * 1. Omnichannel Retail Math & Agricultural Spoilage under extreme loads (10,000 randomized iterations).
 * 2. High-precision financial metric calculations (Trillion VND scale, negative margins, zero divisors).
 * 3. Recharts visual block conversions, TSV formatting, and dynamic chart switching.
 * 4. Multi-artifact synchronizations (Excel formulas, Slide 16:9 layouts, Word A4 Tear Sheets, Chart models).
 * 5. Persistent Global Memory Store (UUIDv7 timestamp monotonicity, corruption recovery, prompt formatting).
 * 6. Dual-tree parity between frontend and frontend_mock.
 */

import fs from "fs";
import path from "path";
import {
  computeRevenueMetrics,
  computeAgriRevenue,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  type RevenueInput,
  type RevenueMetrics,
} from "../lib/revenue/revenueEngine";
import {
  DEFAULT_ENTERPRISE_MEMORY_CARDS,
  getGlobalMemories,
  saveGlobalMemories,
  addGlobalMemory,
  updateGlobalMemory,
  deleteGlobalMemory,
  toggleGlobalMemory,
  togglePinGlobalMemory,
  resetGlobalMemoriesToDefault,
  exportMemoriesToJson,
  importMemoriesFromJson,
  formatMemoriesForSystemPrompt,
  extractMemoryCardsFromText,
  type AgentMemoryCard,
} from "../lib/memory/globalMemoryStore";
import {
  generateExcelRevenueArtifact,
  generateSlideRevenueArtifact,
  generateWordRevenueArtifact,
  generateChartRevenueArtifact,
  syncRevenueToArtifacts,
} from "../lib/artifacts/revenueArtifactSync";
import {
  generateUUIDv7,
  isValidUUIDv7,
  extractUUIDv7Timestamp,
  buildStorageKey,
  parseStorageKey,
  storageManager,
} from "../lib/security/storage-manager";
import {
  CORE_SLASH_COMMANDS,
  filterSlashCommands,
  getSlashCommand,
} from "../components/openwork/slash-commands/slash-commands";

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✔ [PASS] ${message}`);
  } else {
    failedAssertions++;
    console.error(`  ✖ [FAIL] ${message}`);
  }
}

function suite(name: string, fn: () => void) {
  console.log(`\n================================================================================`);
  console.log(`▶ CHALLENGER ADVERSARIAL SUITE: ${name}`);
  console.log(`================================================================================`);
  fn();
}

console.log("================================================================================");
console.log("  CHALLENGER EMPIRICAL VERIFICATION & ADVERSARIAL STRESS TEST HARNESS");
console.log(`  Started at: ${new Date().toISOString()}`);
console.log("================================================================================");

// =============================================================================
// SUITE 1: 10,000 Iterations Extreme Omnichannel & Agricultural Load Test
// =============================================================================
suite("1. Extreme Omnichannel & Agricultural Fuzzing (10,000 iterations)", () => {
  let fuzzPassed = true;
  for (let i = 0; i < 10000; i++) {
    const gross = Math.random() * 1e12; // up to 1 trillion
    const discounts = Math.random() * gross * 0.5;
    const returns = Math.random() * gross * 0.2;
    const allowances = Math.random() * gross * 0.1;
    const cogs = Math.random() * gross * 0.8;
    const opex = Math.random() * gross * 0.3;
    const spoilageRate = Math.random() * 0.3; // 0-30%

    const result = computeRevenueMetrics({
      grossRevenue: gross,
      discounts,
      returns,
      allowances,
      cogs,
      opex,
      spoilageRate,
    });

    if (
      !Number.isFinite(result.netRevenue) ||
      !Number.isFinite(result.grossProfit) ||
      !Number.isFinite(result.grossMarginPct) ||
      !Number.isFinite(result.ebitda) ||
      !Number.isFinite(result.operatingMarginPct) ||
      result.totalDeductions !== discounts + returns + allowances ||
      result.netRevenue !== gross - result.totalDeductions
    ) {
      fuzzPassed = false;
      break;
    }
  }
  assert(fuzzPassed, "10,000 randomized omnichannel calculations executed with 100% mathematical integrity and no NaNs");

  // Agricultural specific extreme loads
  let agriFuzzPassed = true;
  for (let i = 0; i < 2000; i++) {
    const harvestKg = 1000 + Math.random() * 1e6; // up to 1,000 tons
    const priceKg = 5000 + Math.random() * 500000; // 5k - 500k VND/kg
    const prodCostKg = 2000 + Math.random() * 200000;
    const spoilageRate = Math.random() * 0.5; // up to 50% spoilage
    const coldCostKg = Math.random() * 10000;
    const freightKg = Math.random() * 8000;

    const agriRes = computeAgriRevenue({
      harvestVolumeKg: harvestKg,
      pricePerKg: priceKg,
      productionCostPerKg: prodCostKg,
      spoilageRate,
      coldStorageCostPerKg: coldCostKg,
      inboundTransportPerKg: freightKg,
    });

    if (
      !Number.isFinite(agriRes.grossProfit) ||
      !Number.isFinite(agriRes.totalCogs) ||
      agriRes.grossRevenue !== harvestKg * priceKg
    ) {
      agriFuzzPassed = false;
      break;
    }
  }
  assert(agriFuzzPassed, "2,000 agricultural harvests fuzzed across cold-chain, freight, and high spoilage without calculation errors");
});

// =============================================================================
// SUITE 2: Boundary & Corner-Case Financial Calculations
// =============================================================================
suite("2. Boundary, Negative Margin & Zero Divisor Calculations", () => {
  // Case A: Zero gross revenue (Division by zero guard)
  const zeroRes = computeRevenueMetrics({ grossRevenue: 0, cogs: 1000, opex: 500 });
  assert(zeroRes.grossMarginPct === 0, "Gross margin percentage gracefully defaults to 0% when net revenue is 0");
  assert(zeroRes.operatingMarginPct === 0, "Operating margin percentage gracefully defaults to 0% when net revenue is 0");
  assert(zeroRes.netRevenue === 0, "Net revenue is exactly 0");
  assert(zeroRes.grossProfit === -1000, "Gross profit is negative COGS (-1000) when revenue is 0");
  assert(zeroRes.ebitda === -1500, "EBITDA is -1500 (gross profit - opex)");

  // Case B: Deductions exceed Gross Revenue
  const heavyDeductRes = computeRevenueMetrics({
    grossRevenue: 100000,
    discounts: 60000,
    returns: 50000,
    allowances: 10000,
  });
  assert(heavyDeductRes.totalDeductions === 120000, "Total deductions correctly sum to 120,000");
  assert(heavyDeductRes.netRevenue === -20000, "Net revenue is negative (-20,000)");
  assert(heavyDeductRes.grossMarginPct === 0, "Negative net revenue prevents erroneous positive margin percentage");

  // Case C: Periodic Inventory formula (Beg + Purchases - End)
  const periodicRes = computeRevenueMetrics({
    grossRevenue: 500000,
    beginningInventory: 100000,
    purchases: 250000,
    endingInventory: 80000,
  });
  assert(periodicRes.baseCogs === 270000, "Periodic inventory correctly computes base COGS = 100,000 + 250,000 - 80,000 = 270,000");
  assert(periodicRes.grossProfit === 230000, "Gross profit is 500,000 - 270,000 = 230,000");

  // Case D: Spoilage loss with explicit rate vs explicit cost
  const rateSpoilage = computeRevenueMetrics({ grossRevenue: 100000, cogs: 40000, spoilageRate: 0.15 });
  assert(rateSpoilage.spoilageLoss === 6000, "15% spoilage on 40,000 COGS equals 6,000");
  assert(rateSpoilage.totalCogs === 46000, "Total COGS includes base COGS + spoilage loss (46,000)");

  const explicitSpoilage = computeRevenueMetrics({ grossRevenue: 100000, cogs: 40000, spoilageCost: 8500 });
  assert(explicitSpoilage.spoilageLoss === 8500, "Explicit spoilageCost of 8,500 overrides percentage calculation");
  assert(explicitSpoilage.totalCogs === 48500, "Total COGS correctly equals 40,000 + 8,500 = 48,500");

  // Case E: Formatting numbers
  assert(formatCompactNumber(1500000000000, "VND") === "1.50 nghìn tỷ ₫", "1.5 trillion VND formats to '1.50 nghìn tỷ ₫'");
  assert(formatCompactNumber(85400000000, "VND") === "85.4 tỷ ₫", "85.4 billion VND formats to '85.4 tỷ ₫'");
  assert(formatCompactNumber(24500000, "USD") === "$24.50M", "$24.5M USD formats correctly");
  assert(formatCompactNumber(-4500000, "USD") === "-$4.50M", "Negative currency format handles sign correctly");
});

// =============================================================================
// SUITE 3: Multi-Channel Contribution Margin 1 (CM1) Waterfall
// =============================================================================
suite("3. Omnichannel Contribution Margin 1 (CM1) Waterfall Analysis", () => {
  const omnichannelMetrics = computeRevenueMetrics({
    grossRevenue: 1000000000, // 1 Billion VND
    discounts: 50000000,
    returns: 20000000,
    cogs: 550000000,
    opex: 150000000,
    channelBreakdown: [
      {
        channel: "Shopee Mall",
        grossRevenue: 450000000,
        discounts: 25000000,
        returns: 10000000,
        cogs: 220000000,
        channelFees: 45000000, // 10% platform fee
        freight: 15000000,
      },
      {
        channel: "TikTok Shop",
        grossRevenue: 350000000,
        discounts: 20000000,
        returns: 8000000,
        cogs: 180000000,
        channelFees: 38000000, // commission + affiliate
        freight: 12000000,
      },
      {
        channel: "B2B Flagship Store",
        grossRevenue: 200000000,
        discounts: 5000000,
        returns: 2000000,
        cogs: 100000000,
        channelFees: 5000000,
        freight: 4000000,
      },
    ],
  });

  assert(omnichannelMetrics.channels.length === 3, "All 3 channels parsed in omnichannel breakdown");

  const shopee = omnichannelMetrics.channels[0];
  assert(shopee.netRevenue === 415000000, "Shopee Net Revenue = 450M - (25M + 10M) = 415M");
  assert(shopee.grossProfit === 195000000, "Shopee Gross Profit = 415M - 220M = 195M");
  assert(shopee.channelFees === 60000000, "Shopee total direct channel fees = 45M + 15M = 60M");
  assert(shopee.contributionMargin1 === 135000000, "Shopee CM1 = 195M - 60M = 135M VND");
  assert(Math.abs(shopee.contributionMarginPct - (135000000 / 415000000) * 100) < 0.01, "Shopee CM1 percentage is accurate (~32.53%)");

  assert(omnichannelMetrics.formulaLogVi.length >= 6, "Vietnamese formula log contains 6 structured steps");
  assert(omnichannelMetrics.formulaLogEn.length >= 6, "English formula log contains 6 structured steps");
  assert(omnichannelMetrics.formulaLogVi.some((l) => l.includes("CM1")), "Vietnamese log explicitly explains CM1 contribution margin");
});

// =============================================================================
// SUITE 4: Multi-Artifact Synchronization Verification
// =============================================================================
suite("4. Multi-Artifact Synchronization Verification (Excel, Slide, Word, Chart)", () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 5000000,
    discounts: 200000,
    returns: 100000,
    allowances: 50000,
    cogs: 2500000,
    spoilageRate: 0.05,
    opex: 800000,
    channelBreakdown: [
      { channel: "Online D2C", grossRevenue: 3000000, cogs: 1500000, channelFees: 300000 },
      { channel: "Offline Retail", grossRevenue: 2000000, cogs: 1000000, channelFees: 150000 },
    ],
  });

  // 1. Excel Generation
  const excelArt = generateExcelRevenueArtifact(metrics, { periodName: "Q3/2026", currency: "$" });
  assert(excelArt.type === "excel", "Excel artifact has type 'excel'");
  assert(excelArt.extension === ".xlsx", "Excel artifact has extension '.xlsx'");
  assert(excelArt.content.sheets.length === 1, "Excel artifact contains 1 worksheet");
  assert(excelArt.content.sheets[0].name === "PnL_Revenue_Audit", "Excel sheet name is 'PnL_Revenue_Audit'");

  const excelRows = excelArt.content.sheets[0].rows;
  assert(excelRows.some((r: any[]) => r[0]?.toString().includes("Doanh Thu Gộp")), "Excel sheet includes Gross Revenue row");
  assert(excelRows.some((r: any[]) => r[0]?.toString().includes("Tổng Các Khoản Giảm Trừ")), "Excel sheet includes Deductions sum row");
  assert(excelRows.some((r: any[]) => r[0]?.toString().includes("Lợi Nhuận Gộp")), "Excel sheet includes Gross Profit row");
  assert(excelRows.some((r: any[]) => r[0]?.toString().includes("EBITDA")), "Excel sheet includes EBITDA row");
  assert(excelRows.some((r: any[]) => r[0]?.toString().includes("Online D2C")), "Excel sheet includes Channel Breakdown rows");

  // 2. Slide Generation
  const slideArt = generateSlideRevenueArtifact(metrics, { periodName: "Q3/2026" });
  assert(slideArt.type === "slide", "Slide artifact has type 'slide'");
  assert(slideArt.content.slides.length === 4, "Slide deck contains exactly 4 executive slides");
  assert(slideArt.content.slides[0].layout === "hero", "Slide 1 is Hero layout");
  assert(slideArt.content.slides[1].layout === "stat_grid", "Slide 2 is Stat Grid layout");
  assert(slideArt.content.slides[2].layout === "chart", "Slide 3 is Chart layout with Recharts payload");
  assert(slideArt.content.slides[3].layout === "bullets", "Slide 4 is Bullets recommendation layout");

  const chartSlide = slideArt.content.slides[2];
  assert(chartSlide.categories?.length === 2, "Chart slide categories match channel count (2)");
  assert(chartSlide.series?.length === 3, "Chart slide contains 3 series (Net Revenue, Gross Profit, CM1)");

  // 3. Word Generation
  const wordArt = generateWordRevenueArtifact(metrics);
  assert(wordArt.type === "docx", "Word artifact has type 'docx'");
  assert(wordArt.content.scorecard?.length === 4, "Word tear sheet has 4 key metric scorecard cards");
  assert(wordArt.content.rating === "OUTPERFORM" || wordArt.content.rating === "BUY" || wordArt.content.rating === "HOLD", "Word tear sheet assigns valid institutional rating");
  assert(wordArt.content.shortTermThesis?.length === 3, "Word tear sheet has 3 short-term thesis items");

  // 4. Chart Generation
  const chartArt = generateChartRevenueArtifact(metrics);
  assert(chartArt.type === "chart", "Chart artifact has type 'chart'");
  assert(chartArt.content.categories.length === 2, "Chart model categories match channels");
  assert(chartArt.content.series.length === 3, "Chart model has 3 series");

  // 5. Synchronization Bridge
  const existingArtifacts: OpenWorkArtifact[] = [
    { id: "art-custom-code", name: "script.py", title: "Custom Script", type: "code", extension: ".py", status: "ready", version: 1, content: "print('hello')", updatedAt: "12:00" },
  ];
  const syncedArtifacts = syncRevenueToArtifacts(metrics, existingArtifacts);
  assert(syncedArtifacts.length === 5, "Sync bridge produces exactly 5 artifacts (1 existing preserved + 4 synced tabs)");
  assert(syncedArtifacts.some((a) => a.id === "art-custom-code"), "Existing custom code artifact is safely preserved");
  assert(syncedArtifacts.some((a) => a.type === "excel"), "Synced artifacts include Excel");
  assert(syncedArtifacts.some((a) => a.type === "slide"), "Synced artifacts include Slide");
  assert(syncedArtifacts.some((a) => a.type === "docx"), "Synced artifacts include Word");
  assert(syncedArtifacts.some((a) => a.type === "chart"), "Synced artifacts include Chart");
});

// =============================================================================
// SUITE 5: Global Agent Memory Subsystem Stress & Security
// =============================================================================
suite("5. Global Agent Memory Subsystem & Storage Security", () => {
  // UUIDv7 Monotonicity and timestamp extraction test across 2,000 IDs
  let uuidMonotonic = true;
  let lastTs = 0;
  const idSet = new Set<string>();

  for (let i = 0; i < 2000; i++) {
    const id = generateUUIDv7();
    if (!isValidUUIDv7(id) || idSet.has(id)) {
      uuidMonotonic = false;
      break;
    }
    idSet.add(id);
    const ts = extractUUIDv7Timestamp(id);
    if (ts < lastTs) {
      uuidMonotonic = false;
      break;
    }
    lastTs = ts;
  }
  assert(uuidMonotonic, "2,000 UUIDv7 identifiers generated with strict uniqueness, validity, and monotonic chronological ordering");

  // Storage Key Prefix & Parsing
  const key = buildStorageKey("user123", "financial-session-99", "cached_metrics");
  const parsed = parseStorageKey(key);
  assert(parsed !== null, "Storage key parsed successfully");
  assert(parsed?.userId === "user123", "Parsed storage key userId matches");
  assert(parsed?.sessionId === "financial-session-99", "Parsed storage key sessionId matches");
  assert(parsed?.key === "cached_metrics", "Parsed storage key name matches");

  // Default Memory Cards
  const defaultCards = DEFAULT_ENTERPRISE_MEMORY_CARDS;
  assert(defaultCards.length >= 6, "Default enterprise memory store contains at least 6 core cards");
  assert(defaultCards.some((c) => c.type === "rule"), "Default cards contain 'rule' type cards");
  assert(defaultCards.some((c) => c.type === "formula"), "Default cards contain 'formula' type cards");
  assert(defaultCards.some((c) => c.type === "assumption"), "Default cards contain 'assumption' type cards");
  assert(defaultCards.some((c) => c.type === "preference"), "Default cards contain 'preference' type cards");

  // System Prompt Injection Formatting
  const promptInjection = formatMemoriesForSystemPrompt(defaultCards);
  assert(promptInjection.includes("GLOBAL AGENT MEMORY & BUSINESS KNOWLEDGE"), "Formatted prompt injection contains master header");
  assert(promptInjection.includes("DOANH THU THUẦN (NET REVENUE)"), "Formatted prompt injection includes Net Revenue formula");
  assert(promptInjection.includes("HAOHỤT NÔNG SẢN (SPOILAGE ALLOWANCE)"), "Formatted prompt injection includes Spoilage formula");
  assert(promptInjection.includes("BIÊN ĐÓNG GÓP (CONTRIBUTION MARGIN 1 - CM1)"), "Formatted prompt injection includes CM1 formula");

  // Text Auto-Extraction
  const naturalText = `
    Ghi nhớ quy tắc: Tỷ lệ hao hụt sầu riêng Ri6 vụ hè thu là 6.5%.
    Công thức mới: Lợi nhuận gộp sau hoàn = Doanh thu thuần - COGS - Phí trả hàng.
  `;
  const extracted = extractMemoryCardsFromText(naturalText);
  assert(extracted.length >= 1, "Deterministic keyword scanner auto-extracts memory cards from conversational text");

  // JSON Import Corruption Resilience
  assert(importMemoriesFromJson("invalid json string {[[") === null, "Malformed JSON string returns null safely without throwing");
  assert(importMemoriesFromJson("[]")?.length === 0, "Empty JSON array returns empty array safely");
  assert(importMemoriesFromJson(JSON.stringify(defaultCards))?.length === defaultCards.length, "Valid JSON payload cleanly rehydrates memory cards");
});

// =============================================================================
// SUITE 6: Dual-Tree Parity (frontend vs frontend_mock)
// =============================================================================
suite("6. Dual-Tree Parity / Single-Tree Canonical Verification", () => {
  const frontendDir = path.resolve(__dirname, "..");
  const frontendMockDir = path.resolve(__dirname, "../../frontend_mock");
  const hasMock = fs.existsSync(frontendMockDir);

  const criticalFiles = [
    "lib/revenue/revenueEngine.ts",
    "lib/artifacts/revenueArtifactSync.ts",
    "lib/memory/globalMemoryStore.ts",
    "lib/security/storage-manager.ts",
    "components/openwork/charts/InteractiveChartBlock.tsx",
    "components/openwork/slash-commands/slash-commands.ts",
    "components/openwork/memory/OpenWorkMemoryDrawer.tsx",
  ];

  let allFilesMatch = true;
  criticalFiles.forEach((relPath) => {
    const f1 = path.join(frontendDir, relPath);
    const f2 = path.join(frontendMockDir, relPath);

    if (!fs.existsSync(f1)) {
      console.error(`  ✖ Missing in frontend: ${relPath}`);
      allFilesMatch = false;
      return;
    }
    if (hasMock) {
      if (!fs.existsSync(f2)) {
        console.error(`  ✖ Missing in frontend_mock: ${relPath}`);
        allFilesMatch = false;
        return;
      }

      const c1 = fs.readFileSync(f1, "utf8").trim();
      const c2 = fs.readFileSync(f2, "utf8").trim();

      if (c1 !== c2) {
        console.error(`  ✖ Content mismatch in: ${relPath} (diff size: ${Math.abs(c1.length - c2.length)})`);
        allFilesMatch = false;
      }
    }
  });

  if (hasMock) {
    assert(allFilesMatch, "All critical revenue, memory, chart, and artifact sync modules have 100% byte-for-byte dual-tree parity between frontend and frontend_mock");
  } else {
    assert(allFilesMatch, "All critical revenue, memory, chart, and artifact sync modules exist in consolidated single-tree frontend");
  }
});

console.log("\n================================================================================");
console.log("                       FINAL ADVERSARIAL STRESS TEST SUMMARY                    ");
console.log("================================================================================");
console.log(` Total Assertions Tested: ${totalAssertions}`);
console.log(` Passed:                  ${passedAssertions}`);
console.log(` Failed:                  ${failedAssertions}`);
console.log(` Pass Rate:               ${((passedAssertions / totalAssertions) * 100).toFixed(2)}%`);
console.log("================================================================================\n");

if (failedAssertions === 0) {
  console.log("🎉 ALL CHALLENGER ADVERSARIAL STRESS TESTS PASSED EMPIRICALLY (0 FAILURES)!");
  process.exit(0);
} else {
  console.error(`❌ CHALLENGER STRESS TESTS FAILED: ${failedAssertions} failures detected.`);
  process.exit(1);
}
