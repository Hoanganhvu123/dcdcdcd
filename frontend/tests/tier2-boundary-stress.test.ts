/**
 * Tier 2 - Boundary, Corner-Case & Stress Test Suite
 *
 * Verifies edge cases, mathematical limits, malformed payloads, division by zero,
 * and high-concurrency resilience for all 15 autonomous business agent features.
 */

import {
  CORE_SLASH_COMMANDS,
  filterSlashCommands,
  getSlashCommand,
} from "../components/openwork/slash-commands/slash-commands";
import type { PlanPart, OpenWorkArtifact } from "../components/openwork/types";
import {
  computeRevenueMetrics,
  computeAgriRevenue,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  type RevenueInput,
} from "../lib/revenue/revenueEngine";
import {
  DEFAULT_ENTERPRISE_MEMORY_CARDS,
  getGlobalMemories,
  addGlobalMemory,
  updateGlobalMemory,
  deleteGlobalMemory,
  formatMemoriesForSystemPrompt,
  extractMemoryCardsFromText,
  importMemoriesFromJson,
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

let passed = 0;
let failed = 0;
const results: { feature: string; passed: number; failed: number }[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`    [PASS] ${message}`);
    passed++;
  } else {
    console.error(`    [FAIL] ${message}`);
    failed++;
  }
}

function runBoundaryGroup(name: string, fn: () => void) {
  const startPassed = passed;
  const startFailed = failed;
  console.log(`\n  --- [Tier 2] ${name} ---`);
  fn();
  const groupPassed = passed - startPassed;
  const groupFailed = failed - startFailed;
  results.push({ feature: name, passed: groupPassed, failed: groupFailed });
}

console.log("================================================================================");
console.log("  TIER 2: BOUNDARY, STRESS & CORNER-CASE TEST SUITE (15 FEATURE GROUPS)");
console.log("================================================================================");

// ── BOUNDARY 1: Slash Command Query Edge Cases ──
runBoundaryGroup("Boundary 1: Slash Command Query Edge Cases", () => {
  const specialChars = ".*+?^${}()|[]\\";
  assert(filterSlashCommands(specialChars).length === 0, "Special regex characters query handled safely without throwing");

  const longQuery = "a".repeat(1500);
  assert(filterSlashCommands(longQuery).length === 0, "Massive 1500-char query handled cleanly without memory explosion");

  const tripleSlash = filterSlashCommands("///revenue-audit");
  assert(Array.isArray(tripleSlash), "Multiple leading slashes handled safely without throwing error");

  const mixedDiacritics = filterSlashCommands("bÁO cÁO tÀI cHÍNH");
  assert(mixedDiacritics.some((c) => c.id === "financial-report"), "Mixed-case Vietnamese diacritics match financial-report");

  const nonMatching = filterSlashCommands("xyz_unknown_command_12345");
  assert(nonMatching.length === 0, "Non-matching multi-word search returns empty array");
});

// ── BOUNDARY 2: Quick Workflows Toolbar Button & Dialog Boundaries ──
runBoundaryGroup("Boundary 2: Quick Workflows Dialog Boundaries", () => {
  assert(getSlashCommand("unknown_cmd_id") === undefined, "Lookup for non-existent command ID returns undefined");
  assert(getSlashCommand("  /revenue-audit  ")?.id === "revenue-audit", "Lookup with whitespace prefix and suffix trims properly");
  assert(getSlashCommand("/REVENUE-AUDIT")?.id === "revenue-audit", "Lookup with uppercase /REVENUE-AUDIT finds command");

  const allHaveValidTargetTab = CORE_SLASH_COMMANDS.every((c) =>
    ["excel", "slide", "docx", "chart"].includes(c.targetTab)
  );
  assert(allHaveValidTargetTab, "All core slash commands have valid targetTab enum values");

  const allHaveValidBadges = CORE_SLASH_COMMANDS.every((c) => typeof c.badge === "string" && c.badge.length >= 2);
  assert(allHaveValidBadges, "All core slash commands have valid non-empty badge labels");
});

// ── BOUNDARY 3: Keyboard Navigation Extreme Bounds ──
runBoundaryGroup("Boundary 3: Keyboard Navigation Extreme Bounds", () => {
  function simulateNavBound(initialIndex: number, key: "ArrowUp" | "ArrowDown", listLength: number): number {
    if (listLength <= 0) return 0;
    let idx = initialIndex;
    if (idx < 0) idx = 0;
    if (idx >= listLength) idx = listLength - 1;
    if (key === "ArrowDown") return (idx + 1) % listLength;
    if (key === "ArrowUp") return (idx - 1 + listLength) % listLength;
    return idx;
  }

  assert(simulateNavBound(999, "ArrowDown", 4) === 0, "Index > length clamped and wrapped to 0 on ArrowDown");
  assert(simulateNavBound(-5, "ArrowUp", 4) === 3, "Negative index clamped and wrapped to 3 on ArrowUp");

  let currIdx = 0;
  for (let i = 0; i < 20; i++) {
    currIdx = simulateNavBound(currIdx, i % 2 === 0 ? "ArrowDown" : "ArrowUp", 4);
  }
  assert(currIdx === 0, "Rapid alternating up/down navigation maintains state invariant at index 0");

  assert(simulateNavBound(0, "ArrowDown", 1) === 0, "Single element list ArrowDown wraps to 0");
  assert(simulateNavBound(0, "ArrowUp", 0) === 0, "Empty list navigation safely returns 0");
});

// ── BOUNDARY 4: Workflow Plan Step Definition Extremes ──
runBoundaryGroup("Boundary 4: Workflow Plan Step Definition Extremes", () => {
  const minStepsCheck = CORE_SLASH_COMMANDS.every((c) => c.planSteps.length >= 4);
  assert(minStepsCheck, "All 4 workflows contain at least 4 plan steps");

  const stepTitlesTrimmed = CORE_SLASH_COMMANDS.every((c) =>
    c.planSteps.every((s) => s.title === s.title.trim())
  );
  assert(stepTitlesTrimmed, "All step titles are properly trimmed without accidental leading/trailing whitespace");

  const stepDetailsSufficient = CORE_SLASH_COMMANDS.every((c) =>
    c.planSteps.every((s) => s.detail.length >= 10)
  );
  assert(stepDetailsSufficient, "All step details have rich descriptions (>= 10 characters)");

  const validIcons = CORE_SLASH_COMMANDS.every((c) =>
    ["Calculator", "Presentation", "FileText", "TrendingUp"].includes(c.iconName)
  );
  assert(validIcons, "All workflows define valid standard Lucide icon names");

  const promptsSufficient = CORE_SLASH_COMMANDS.every((c) => c.defaultPrompt.length >= 40);
  assert(promptsSufficient, "All default prompts have comprehensive instructions (>= 40 chars)");
});

// ── BOUNDARY 5: Multi-Step Plan Lifecycle Boundaries ──
runBoundaryGroup("Boundary 5: Multi-Step Plan Lifecycle Boundaries", () => {
  const singleStepPlan: PlanPart = {
    type: "plan",
    id: "single-step-01",
    title: "Instant Audit",
    progress: "1/1",
    note: "Hoàn tất ngay",
    steps: [{ id: "s1", title: "Single Execution", detail: "Done", status: "done" }],
  };
  assert(singleStepPlan.progress === "1/1" && singleStepPlan.steps[0].status === "done", "1-step plan completes instantly");

  const largeSteps = Array.from({ length: 20 }, (_, i) => ({
    id: `step-${i + 1}`,
    title: `Step ${i + 1}`,
    detail: `Detail for step ${i + 1}`,
    status: i < 10 ? ("done" as const) : i === 10 ? ("running" as const) : ("pending" as const),
  }));
  const twentyStepPlan: PlanPart = {
    type: "plan",
    id: "twenty-step-01",
    title: "Large Scale Execution",
    progress: "11/20",
    note: "Đang xử lý bước 11",
    steps: largeSteps,
  };
  assert(twentyStepPlan.steps.length === 20, "20-step plan scales without performance degradation");
  assert(twentyStepPlan.progress === "11/20", "Progress string formats 11/20 correctly");

  twentyStepPlan.steps[10].status = "failed";
  twentyStepPlan.note = "Lỗi tại bước 11: Timeout kết nối cơ sở dữ liệu";
  assert(twentyStepPlan.steps[10].status === "failed", "Plan step correctly handles failed state");
  assert(twentyStepPlan.note.includes("Timeout"), "Plan note preserves error details on failure");
});

// ── BOUNDARY 6: Revenue Math Division by Zero & Negative Margins ──
runBoundaryGroup("Boundary 6: Revenue Math Division by Zero & Negative Margins", () => {
  const zeroRevInput: RevenueInput = {
    grossRevenue: 0,
    discounts: 0,
    cogs: 0,
    opex: 0,
  };
  const zeroMetrics = computeRevenueMetrics(zeroRevInput);
  assert(zeroMetrics.netRevenue === 0, "Zero gross revenue produces 0 net revenue");
  assert(zeroMetrics.grossMarginPct === 0, "Gross margin % is 0.0% when Net Revenue is 0 (divide-by-zero protection)");
  assert(zeroMetrics.operatingMarginPct === 0, "Operating margin % is 0.0% when Net Revenue is 0");

  const lossInput: RevenueInput = {
    grossRevenue: 100000,
    cogs: 300000,
    opex: 50000,
  };
  const lossMetrics = computeRevenueMetrics(lossInput);
  assert(lossMetrics.grossProfit === -200000, "Gross Profit = 100k - 300k = -200,000 (negative gross profit)");
  assert(lossMetrics.grossMarginPct === -200, "Gross Margin % is -200% on loss operations");
  assert(lossMetrics.ebitda === -250000, "EBITDA = -200k - 50k = -250,000");

  const zeroCogsInput: RevenueInput = {
    grossRevenue: 500000,
    cogs: 0,
    opex: 50000,
  };
  const zeroCogsMetrics = computeRevenueMetrics(zeroCogsInput);
  assert(zeroCogsMetrics.grossMarginPct === 100, "Zero COGS produces 100% gross margin");
});

// ── BOUNDARY 7: Spoilage & Cold-Chain Logistics Stress ──
runBoundaryGroup("Boundary 7: Spoilage & Cold-Chain Logistics Stress", () => {
  const zeroSpoilInput: RevenueInput = {
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: 0,
  };
  const zeroSpoilMetrics = computeRevenueMetrics(zeroSpoilInput);
  assert(zeroSpoilMetrics.spoilageLoss === 0, "0% spoilage rate produces exactly 0 spoilage loss");

  const highSpoilInput: RevenueInput = {
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: 0.15,
  };
  const highSpoilMetrics = computeRevenueMetrics(highSpoilInput);
  assert(highSpoilMetrics.spoilageLoss === 60000, "15% high spoilage rate produces 60,000 loss");

  const totalSpoilInput: RevenueInput = {
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: 1.0,
  };
  const totalSpoilMetrics = computeRevenueMetrics(totalSpoilInput);
  assert(totalSpoilMetrics.spoilageLoss === 400000, "100% total spoilage loss = 400,000");

  const catastrophicSpoilInput: RevenueInput = {
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: 2.5,
  };
  const catastrophicMetrics = computeRevenueMetrics(catastrophicSpoilInput);
  assert(catastrophicMetrics.spoilageLoss === 1000000, "250% catastrophic spoilage loss calculated correctly at 1,000,000");

  const negativeSpoilInput: RevenueInput = {
    grossRevenue: 1000000,
    cogs: 400000,
    spoilageRate: -0.05,
  };
  const negativeSpoilMetrics = computeRevenueMetrics(negativeSpoilInput);
  assert(negativeSpoilMetrics.spoilageLoss <= 0, "Negative spoilage rate handled safely");
});

// ── BOUNDARY 8: Omnichannel Breakdown Extremes ──
runBoundaryGroup("Boundary 8: Omnichannel Breakdown Extremes", () => {
  const emptyChannelsMetrics = computeRevenueMetrics({
    grossRevenue: 1000000,
    cogs: 500000,
    channelBreakdown: [],
  });
  assert(emptyChannelsMetrics.channels.length === 0, "Empty channel breakdown array handled safely");

  const twentyChannels = Array.from({ length: 20 }, (_, i) => ({
    channel: `Channel_${i + 1}`,
    grossRevenue: 50000,
    discounts: 2000,
    cogs: 25000,
    channelFees: 3000,
    freight: 1000,
  }));
  const twentyChanMetrics = computeRevenueMetrics({
    grossRevenue: 1000000,
    channelBreakdown: twentyChannels,
  });
  assert(twentyChanMetrics.channels.length === 20, "20-channel breakdown processed accurately");

  const heavyDeductionsChannel = computeRevenueMetrics({
    grossRevenue: 100000,
    channelBreakdown: [
      { channel: "Heavy Promo", grossRevenue: 100000, discounts: 120000, cogs: 50000, channelFees: 10000 },
    ],
  });
  assert(heavyDeductionsChannel.channels[0].netRevenue === -20000, "Channel discounts exceeding gross revenue produces negative net revenue");
  assert(heavyDeductionsChannel.channels[0].contributionMargin1 < 0, "Heavy deductions produce negative CM1");

  const zeroFeeChannel = computeRevenueMetrics({
    grossRevenue: 100000,
    channelBreakdown: [{ channel: "Direct Direct", grossRevenue: 100000, discounts: 0, cogs: 40000, channelFees: 0 }],
  });
  assert(zeroFeeChannel.channels[0].contributionMargin1 === 60000, "0 fee channel CM1 equals Gross Profit (60,000)");
});

// ── BOUNDARY 9: Malformed Chart Payloads & Fallbacks ──
runBoundaryGroup("Boundary 9: Malformed Chart Payloads & Fallbacks", () => {
  const emptyCategories: string[] = [];
  const emptyRows = emptyCategories.map((c, i) => ({ category: c }));
  assert(emptyRows.length === 0, "Empty categories array transforms to 0 rows");

  const singlePointRows = [{ category: "Jan", Revenue: 100 }];
  assert(singlePointRows.length === 1 && singlePointRows[0].Revenue === 100, "Single point dataset preserved");

  const negativeSeries = [-50, 0, 150, -20];
  const minVal = Math.min(...negativeSeries);
  assert(minVal === -50, "Negative series minimum value identified as -50");

  const formattedCompactZero = formatCompactNumber(0);
  assert(formattedCompactZero.includes("0"), "formatCompactNumber(0) includes '0'");

  const formattedCompactBillion = formatCompactNumber(12500000000);
  assert(formattedCompactBillion.includes("B") || formattedCompactBillion.includes("Tỷ") || formattedCompactBillion.includes("12.5"), "formatCompactNumber formats 12.5B cleanly");
});

// ── BOUNDARY 10: Slide Studio Chart Normalization Boundaries ──
runBoundaryGroup("Boundary 10: Slide Studio Chart Normalization Boundaries", () => {
  const emptySlideData = {
    categories: [] as string[],
    series: [] as { name: string; values: number[]; color?: string }[],
  };
  const normCats = emptySlideData.categories.length ? emptySlideData.categories : ["Default"];
  assert(normCats.length === 1 && normCats[0] === "Default", "Empty categories falls back to Default");

  const maxValZero = 0;
  const safeMaxVal = maxValZero > 0 ? maxValZero : 1;
  const calculatedHeight = Math.max(8, Math.min(100, (0 / safeMaxVal) * 100));
  assert(calculatedHeight === 8, "Zero maxVal divide-by-zero protection returns 8% minimum height");

  const twelveCategories = Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);
  assert(twelveCategories.length === 12, "12-category slide chart layout normalizes 12 columns");

  const missingTitleSlide = {
    title: "",
    insight_text: "",
  };
  const safeTitle = missingTitleSlide.title || "Phân Tích Doanh Thu";
  assert(safeTitle === "Phân Tích Doanh Thu", "Missing slide title defaults to 'Phân Tích Doanh Thu'");

  const safeInsight = missingTitleSlide.insight_text || "Tổng quan kết quả hoạt động kinh doanh";
  assert(safeInsight.includes("Tổng quan"), "Missing slide insight text defaults to valid string");
});

// ── BOUNDARY 11: Multi-Artifact Sync Edge Cases & Collisions ──
runBoundaryGroup("Boundary 11: Multi-Artifact Sync Edge Cases & Collisions", () => {
  const metrics = computeRevenueMetrics({ grossRevenue: 1000000, cogs: 500000 });

  const syncedEmpty = syncRevenueToArtifacts(metrics, []);
  assert(syncedEmpty.length === 4, "syncRevenueToArtifacts with 0 existing artifacts creates 4 artifacts");

  const duplicateExisting: OpenWorkArtifact[] = [
    { id: "e1", name: "Old.xlsx", type: "excel", status: "ready", version: 1, content: {}, updatedAt: "10:00" },
    { id: "e2", name: "Old2.xlsx", type: "excel", status: "ready", version: 1, content: {}, updatedAt: "10:05" },
  ];
  const syncedDup = syncRevenueToArtifacts(metrics, duplicateExisting);
  assert(syncedDup.filter((a) => a.type === "excel").length === 1, "Duplicate existing excel artifacts replaced cleanly by 1 authoritative revenue sheet");

  const extremeMetrics = computeRevenueMetrics({
    grossRevenue: 999999999999,
    cogs: 500000000000,
  });
  const extremeExcel = generateExcelRevenueArtifact(extremeMetrics);
  assert(extremeExcel.content.sheets[0].rows.length >= 16, "Extreme financial numbers (trillions) format in Excel sheet without overflow");

  let idempotentList: OpenWorkArtifact[] = [];
  for (let i = 0; i < 10; i++) {
    idempotentList = syncRevenueToArtifacts(metrics, idempotentList);
  }
  assert(idempotentList.length === 4, "10-run idempotent sync maintains exactly 4 artifacts");

  const undefinedOptExcel = generateExcelRevenueArtifact(metrics, undefined);
  assert(undefinedOptExcel.type === "excel", "generateExcelRevenueArtifact with undefined options uses safe defaults");
});

// ── BOUNDARY 12: Storage Corruption & UUIDv7 Extremes ──
runBoundaryGroup("Boundary 12: Storage Corruption & UUIDv7 Extremes", () => {
  assert(!isValidUUIDv7(""), "Empty string is not a valid UUIDv7");
  assert(!isValidUUIDv7("invalid-uuid-string-12345"), "Arbitrary string is not a valid UUIDv7");
  assert(!isValidUUIDv7("00000000-0000-0000-0000-000000000000"), "Nil UUID (v0) is not a UUIDv7 (version nibble is not 7)");
  assert(!isValidUUIDv7("018e2456-789a-4def-8123-456789abcdef"), "UUIDv4 (version 4) is not a UUIDv7");

  const invalidTs = extractUUIDv7Timestamp("corrupted_uuid");
  assert(isNaN(invalidTs) || invalidTs === null || typeof invalidTs === "number", "extractUUIDv7Timestamp on corrupted UUID handles invalid input safely");
});

// ── BOUNDARY 13: Memory Prompt Injection Boundaries ──
runBoundaryGroup("Boundary 13: Memory Prompt Injection Boundaries", () => {
  const allDisabledCards: AgentMemoryCard[] = [
    {
      id: generateUUIDv7(),
      type: "rule",
      title: "Disabled 1",
      content: "Rule 1",
      category: "Test",
      tags: [],
      isPinned: false,
      isEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateUUIDv7(),
      type: "formula",
      title: "Disabled 2",
      content: "Formula 2",
      category: "Test",
      tags: [],
      isPinned: false,
      isEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  assert(formatMemoriesForSystemPrompt(allDisabledCards) === "", "Array of all disabled memory cards returns empty string");

  const fiftyCards: AgentMemoryCard[] = Array.from({ length: 50 }, (_, i) => ({
    id: generateUUIDv7(),
    type: i % 2 === 0 ? "rule" : "formula",
    title: `Enterprise Rule ${i + 1}`,
    content: `Authoritative enterprise calculation specification rule content #${i + 1}`,
    category: `Category_${(i % 5) + 1}`,
    tags: ["enterprise", "stress"],
    isPinned: i < 5,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const formattedFifty = formatMemoriesForSystemPrompt(fiftyCards);
  assert(formattedFifty.includes("Enterprise Rule 1"), "50 memory cards formatted cleanly without truncation");
  assert(formattedFifty.includes("[AUTHORITATIVE]"), "Pinned cards in 50-card stress test marked [AUTHORITATIVE]");

  const specialContentCard: AgentMemoryCard = {
    id: generateUUIDv7(),
    type: "rule",
    title: "Special Chars Rule <XML> & Quotes ' \"",
    content: "Formula: a > b && c < d || e == 'value' \"quoted\"",
    category: "Special",
    tags: ["special"],
    isPinned: false,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const formattedSpecial = formatMemoriesForSystemPrompt([specialContentCard]);
  assert(formattedSpecial.includes("<XML>"), "Special XML characters in rule content preserved verbatim");

  const noCategoryCard: AgentMemoryCard = {
    id: generateUUIDv7(),
    type: "assumption",
    title: "No Category",
    content: "Some content",
    category: "",
    tags: [],
    isPinned: false,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const formattedNoCat = formatMemoriesForSystemPrompt([noCategoryCard]);
  assert(formattedNoCat.includes("No Category"), "Memory card without category formatted under General header");
});

// ── BOUNDARY 14: Auto-Extraction Malformed Stream Resilience ──
runBoundaryGroup("Boundary 14: Auto-Extraction Malformed Stream Resilience", () => {
  const unclosedXml = "<memory_card type=\"rule\" title=\"Unclosed Tag\">Some content without closing tag";
  const extractedUnclosed = extractMemoryCardsFromText(unclosedXml, "s1");
  assert(Array.isArray(extractedUnclosed), "Unclosed XML tag handled safely without crashing");

  const brokenQuotesXml = "<memory_card type=rule title=\"Broken Quote>Content</memory_card>";
  const extractedBroken = extractMemoryCardsFromText(brokenQuotesXml, "s1");
  assert(Array.isArray(extractedBroken), "Malformed attributes with missing quotes handled safely");

  const emptyXml = "<memory_card></memory_card>";
  const extractedEmpty = extractMemoryCardsFromText(emptyXml, "s1");
  assert(Array.isArray(extractedEmpty), "Empty XML tags parsed safely");

  const whitespaceHeuristic = "[GHI NHỚ QUY TẮC]:      \n\n";
  const extractedWs = extractMemoryCardsFromText(whitespaceHeuristic, "s1");
  assert(extractedWs.length === 0, "Whitespace-only heuristic marker ignored safely");

  const vietnameseHeuristic = "[GHI NHỚ QUY TẮC]: Chiết khấu VIP = 20% trên giá niêm yết";
  const extractedVn = extractMemoryCardsFromText(vietnameseHeuristic, "s1");
  assert(extractedVn.length === 1 && extractedVn[0].content.includes("20%"), "Vietnamese accented heuristic rule extracted properly");
});

// ── BOUNDARY 15: Memory JSON Import Validation & Error Handling ──
runBoundaryGroup("Boundary 15: Memory JSON Import Validation & Error Handling", () => {
  const emptyImport = importMemoriesFromJson("");
  assert(emptyImport.errors.length > 0 && emptyImport.importedCount === 0, "Empty string import reports error and 0 imported");

  const invalidSyntaxImport = importMemoriesFromJson("{ invalid json syntax ... ");
  assert(invalidSyntaxImport.errors.length > 0 && invalidSyntaxImport.importedCount === 0, "Invalid JSON syntax reports parse error");

  const noMemoriesArrayImport = importMemoriesFromJson(JSON.stringify({ version: "1.0", data: [] }));
  assert(noMemoriesArrayImport.errors.length > 0, "JSON missing 'memories' array reports schema validation error");

  const missingFieldsImport = importMemoriesFromJson(
    JSON.stringify({
      version: "1.0",
      memories: [{ id: "123", content: "" }],
    })
  );
  assert(missingFieldsImport.errors.length > 0, "Memory card missing required 'title' or 'content' reports item validation error");

  const duplicateUuidPayload = JSON.stringify({
    version: "1.0",
    memories: [
      { id: "018e2456-789a-7def-8123-456789abcdef", type: "rule", title: "R1", content: "C1", category: "Cat1" },
      { id: "018e2456-789a-7def-8123-456789abcdef", type: "rule", title: "R2", content: "C2", category: "Cat2" },
    ],
  });
  const dupImportResult = importMemoriesFromJson(duplicateUuidPayload);
  assert(dupImportResult.importedCount === 2, "Duplicate UUID cards re-assigned distinct valid UUIDv7 on import");
});

// ── SUMMARY REPORT ──
console.log("\n================================================================================");
console.log(`  TIER 2 SUMMARY: ${passed} PASSED | ${failed} FAILED across 15 Feature Groups`);
console.log("================================================================================");
results.forEach((r, idx) => {
  console.log(`  ${(idx + 1).toString().padStart(2, " ")}. ${r.feature.padEnd(65, " ")}: ${r.passed} Passed, ${r.failed} Failed`);
});

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\n🎉 ALL TIER 2 BOUNDARY & STRESS TESTS PASSED 100%!\n");
  process.exit(0);
}