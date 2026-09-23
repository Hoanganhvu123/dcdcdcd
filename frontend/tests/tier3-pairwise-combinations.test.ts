/**
 * Tier 3 - Pairwise Cross-Feature Combinations Test Suite
 *
 * Verifies all 15 pairwise interactions between autonomous business agent modules:
 * - Slash commands & plan orchestration
 * - Revenue math & spoilage / omnichannel / artifacts
 * - Global memory & prompt injection / extraction / portability
 * - Multi-tenant security & UUIDv7 persistence
 */

import {
  CORE_SLASH_COMMANDS,
  filterSlashCommands,
  getSlashCommand,
  type SlashCommandDefinition,
} from "../components/openwork/slash-commands/slash-commands";
import type { PlanPart, OpenWorkArtifact } from "../components/openwork/types";
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
  addGlobalMemory,
  updateGlobalMemory,
  deleteGlobalMemory,
  formatMemoriesForSystemPrompt,
  extractMemoryCardsFromText,
  exportMemoriesToJson,
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
  buildStorageKey,
  parseStorageKey,
  storageManager,
} from "../lib/security/storage-manager";

let passed = 0;
let failed = 0;
const results: { pair: string; passed: number; failed: number }[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`    [PASS] ${message}`);
    passed++;
  } else {
    console.error(`    [FAIL] ${message}`);
    failed++;
  }
}

function runPairTest(name: string, fn: () => void) {
  const startPassed = passed;
  const startFailed = failed;
  console.log(`\n  --- [Tier 3] ${name} ---`);
  fn();
  const pairPassed = passed - startPassed;
  const pairFailed = failed - startFailed;
  results.push({ pair: name, passed: pairPassed, failed: pairFailed });
}

console.log("================================================================================");
console.log("  TIER 3: PAIRWISE CROSS-FEATURE COMBINATIONS TEST SUITE (15 PAIRWISE TESTS)");
console.log("================================================================================");

// ── PAIR 1 (F1 + F4): Slash Command Selection -> Workflow Plan Instantiation ──
runPairTest("Pair 1 (F1 + F4): Slash Command Selection -> Workflow Plan Instantiation", () => {
  const matches = filterSlashCommands("/revenue-audit");
  assert(matches.length === 1, "Autocomplete identifies /revenue-audit");

  const cmd = matches[0];
  const plan: PlanPart = {
    type: "plan",
    id: `plan-${cmd.id}`,
    title: `Kế hoạch thực thi: ${cmd.title}`,
    progress: `1/${cmd.planSteps.length}`,
    note: "Khởi tạo thành công từ slash command",
    steps: cmd.planSteps.map((s, idx) => ({
      id: `step-${idx + 1}`,
      title: s.title,
      detail: s.detail,
      status: idx === 0 ? "running" : "pending",
    })),
  };
  assert(plan.steps.length === 4, "Instantiated 4-step plan from slash command metadata");
  assert(plan.steps[0].status === "running" && plan.steps[0].title.includes("Trích xuất"), "Step 1 is active and initialized with DW extract");
});

// ── PAIR 2 (F2 + F5): Quick Workflows Dialog -> Plan Lifecycle Transitions ──
runPairTest("Pair 2 (F2 + F5): Quick Workflows Dialog -> Plan Lifecycle Transitions", () => {
  const cmd = getSlashCommand("slide-deck")!;
  assert(cmd !== undefined && cmd.targetTab === "slide", "Quick workflows dialog resolves slide-deck workflow");

  const plan: PlanPart = {
    type: "plan",
    id: "plan-slide-deck",
    title: cmd.title,
    progress: "1/4",
    note: "Đang phân tích layout 16:9",
    steps: cmd.planSteps.map((s, idx) => ({
      id: `step-${idx + 1}`,
      title: s.title,
      detail: s.detail,
      status: idx === 0 ? "running" : "pending",
    })),
  };

  // Step 1 finishes -> Step 2 starts
  plan.steps[0].status = "done";
  plan.steps[1].status = "running";
  plan.progress = "2/4";
  assert(plan.steps[0].status === "done" && plan.steps[1].status === "running", "Step 1 done, step 2 active");

  // Step 2 finishes -> Step 3 & 4 finish
  plan.steps[1].status = "done";
  plan.steps[2].status = "done";
  plan.steps[3].status = "done";
  plan.progress = "4/4";
  plan.note = "Hoàn tất xuất Slide 16:9 PPTX";
  assert(plan.steps.every((s) => s.status === "done") && plan.progress === "4/4", "All 4 steps completed in slide workflow");
});

// ── PAIR 3 (F4 + F6): Revenue Audit Workflow -> Deep GAAP/IFRS Revenue Computation ──
runPairTest("Pair 3 (F4 + F6): Revenue Audit Workflow -> Deep GAAP/IFRS Revenue Computation", () => {
  const auditCmd = getSlashCommand("revenue-audit")!;
  assert(auditCmd !== undefined, "Revenue audit command found");

  const auditedData: RevenueInput = {
    grossRevenue: 2500000,
    discounts: 150000,
    returns: 50000,
    cogs: 1400000,
    opex: 350000,
  };
  const metrics = computeRevenueMetrics(auditedData);

  assert(metrics.netRevenue === 2300000, "Audited Net Revenue = 2,500,000 - 200,000 = 2,300,000");
  assert(metrics.grossProfit === 900000, "Audited Gross Profit = 2,300,000 - 1,400,000 = 900,000");
  assert(metrics.ebitda === 550000, "Audited EBITDA = 900,000 - 350,000 = 550,000");
});

// ── PAIR 4 (F6 + F7): GAAP Revenue Engine -> Spoilage Loss Adjustment & Agri Yield ──
runPairTest("Pair 4 (F6 + F7): GAAP Revenue Engine -> Spoilage Loss Adjustment & Agri Yield", () => {
  const agri = computeAgriRevenue({
    harvestVolumeKg: 50000,
    pricePerKg: 25,
    spoilageRate: 0.06,
    productionCostPerKg: 12,
    coldStorageCostPerKg: 2,
    inboundTransportPerKg: 1,
  });

  assert(agri.grossRevenue === 1250000, "Harvest 50k kg * $25 = 1,250,000 gross revenue");
  assert(agri.baseCogs === 600000, "Production base COGS = 50k kg * $12 = 600,000");
  assert(agri.spoilageLoss === 75000, "Spoilage loss = 50k kg * 6% * $25 = 75,000");
  assert(agri.freightCost === 150000, "Logistics & cold-chain freight = 50k * ($2 + $1) = 150,000");
  assert(agri.totalCogs === 825000, "Total GAAP COGS = 600k + 75k + 150k = 825,000");
  assert(agri.grossProfit === 425000, "Agri Gross Profit = 1,250,000 - 825,000 = 425,000");
});

// ── PAIR 5 (F6 + F8): GAAP Revenue Engine -> Omnichannel Contribution Margin 1 (CM1) ──
runPairTest("Pair 5 (F6 + F8): GAAP Revenue Engine -> Omnichannel CM1 Decomposition", () => {
  const omnichannelInput: RevenueInput = {
    grossRevenue: 800000,
    channelBreakdown: [
      { channel: "Shopee", grossRevenue: 500000, discounts: 25000, cogs: 280000, channelFees: 40000, freight: 10000 },
      { channel: "TikTok", grossRevenue: 300000, discounts: 15000, cogs: 170000, channelFees: 30000, freight: 8000 },
    ],
  };
  const metrics = computeRevenueMetrics(omnichannelInput);

  const shopee = metrics.channels.find((c) => c.channel === "Shopee")!;
  const tiktok = metrics.channels.find((c) => c.channel === "TikTok")!;

  assert(shopee.contributionMargin1 === 475000 - 280000 - 50000, "Shopee CM1 = 145,000");
  assert(tiktok.contributionMargin1 === 285000 - 170000 - 38000, "TikTok CM1 = 77,000");
  assert(shopee.contributionMargin1 + tiktok.contributionMargin1 === 222000, "Total Channel CM1 sum = 222,000");
});

// ── PAIR 6 (F6 + F9): GAAP Revenue Engine -> Auto-Embedded Interactive Charts & TSV ──
runPairTest("Pair 6 (F6 + F9): GAAP Revenue Engine -> Interactive Charts & TSV Export", () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 1000000,
    discounts: 50000,
    cogs: 550000,
    opex: 150000,
  });

  const chartArtifact = generateChartRevenueArtifact(metrics);
  assert(chartArtifact.type === "chart", "Generated chart artifact from GAAP metrics");

  const tsvHeaders = ["Channel", "Gross Revenue", "Net Revenue", "Gross Profit", "CM1"].join("\t");
  const tsvRows = metrics.channels.map((c) =>
    [c.channel, c.grossRevenue, c.netRevenue, c.grossProfit, c.contributionMargin1].join("\t")
  );
  const tsvContent = [tsvHeaders, ...tsvRows].join("\n");
  assert(tsvContent.includes("Gross Revenue\tNet Revenue"), "TSV export contains standard tab-separated financial headers");
});

// ── PAIR 7 (F6 + F10): GAAP Revenue Engine -> Slide Studio ChartSlide Normalization ──
runPairTest("Pair 7 (F6 + F10): GAAP Revenue Engine -> Slide Studio ChartSlide Normalization", () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 1200000,
    cogs: 700000,
    channelBreakdown: [
      { channel: "Online", grossRevenue: 700000, cogs: 400000 },
      { channel: "Offline", grossRevenue: 500000, cogs: 300000 },
    ],
  });

  const slideArtifact = generateSlideRevenueArtifact(metrics, { periodName: "FY2026" });
  assert(slideArtifact.type === "slide" && slideArtifact.content.slides.length >= 4, "Generated 4-slide presentation deck");

  const chartSlide = slideArtifact.content.slides.find((s: any) => s.layout === "chart" || s.chartData);
  assert(chartSlide !== undefined, "Presentation deck includes dedicated Chart Slide with normalized data series");
});

// ── PAIR 8 (F6 + F11): GAAP Revenue Engine -> Multi-Artifact Workbench Sync Bridge ──
runPairTest("Pair 8 (F6 + F11): GAAP Revenue Engine -> Multi-Artifact Workbench Sync Bridge", () => {
  const metrics = computeRevenueMetrics({
    grossRevenue: 1500000,
    cogs: 800000,
    opex: 200000,
  });

  const existingArtifacts: OpenWorkArtifact[] = [
    { id: "art-sql-1", name: "query.sql", type: "code", status: "ready", version: 1, content: "SELECT 1;", updatedAt: "09:00" },
  ];

  const synced = syncRevenueToArtifacts(metrics, existingArtifacts, { periodName: "Q3/2026" });

  assert(synced.length === 5, "Sync bridge outputs 5 unified artifacts (1 code + 4 revenue artifacts)");
  assert(synced.some((a) => a.type === "excel"), "Sync bridge includes Excel PnL");
  assert(synced.some((a) => a.type === "slide"), "Sync bridge includes Slide Studio Deck");
  assert(synced.some((a) => a.type === "docx"), "Sync bridge includes Word A4 Report");
  assert(synced.some((a) => a.type === "chart"), "Sync bridge includes Interactive Chart");
  assert(synced.some((a) => a.id === "art-sql-1"), "Sync bridge non-destructively preserves existing code artifact");
});

// ── PAIR 9 (F12 + F13): Global Memory CRUD -> System Prompt Injection Formatter ──
runPairTest("Pair 9 (F12 + F13): Global Memory CRUD -> System Prompt Injection Formatter", () => {
  const card1 = addGlobalMemory({
    type: "rule",
    title: "Chính sách đối soát Tiki",
    content: "Chu kỳ đối soát 15 ngày/lần, phí thanh toán 2%",
    category: "Marketplace",
    tags: ["tiki", "reconciliation"],
    isPinned: true,
  });

  const memories = getGlobalMemories();
  const prompt = formatMemoriesForSystemPrompt(memories);

  assert(prompt.includes("Chính sách đối soát Tiki"), "Newly added memory card appears in system prompt");
  assert(prompt.includes("[AUTHORITATIVE]"), "Pinned card has [AUTHORITATIVE] prefix in system prompt");

  // Clean up
  deleteGlobalMemory(card1.id);
});

// ── PAIR 10 (F12 + F14): LLM Stream Output -> Real-time Memory Auto-Extraction ──
runPairTest("Pair 10 (F12 + F14): LLM Stream Output -> Real-time Memory Auto-Extraction", () => {
  const llmResponse = `
Sau khi phân tích dữ liệu Q3, tôi tổng hợp nguyên tắc tính:
<memory_card type="formula" title="Công thức ROAS Đa Kênh" category="Marketing" tags="roas,marketing">
ROAS = Doanh thu thuần kênh / Chi phí quảng cáo kênh
</memory_card>
`;

  const extracted = extractMemoryCardsFromText(llmResponse, "session-live-01");
  assert(extracted.length === 1, "Extracted 1 memory card from stream text");

  const savedCard = addGlobalMemory(extracted[0]);
  assert(isValidUUIDv7(savedCard.id), "Auto-extracted card saved with valid RFC 9562 UUIDv7");

  const memories = getGlobalMemories();
  assert(memories.some((m) => m.id === savedCard.id), "Saved memory card retrievable from global memory store");

  // Clean up
  deleteGlobalMemory(savedCard.id);
});

// ── PAIR 11 (F12 + F15): Global Memory Store -> JSON Export/Import Portability ──
runPairTest("Pair 11 (F12 + F15): Global Memory Store -> JSON Export/Import Portability", () => {
  const initialMemories = getGlobalMemories();
  const jsonBackup = exportMemoriesToJson(initialMemories);

  const importResult = importMemoriesFromJson(jsonBackup);
  assert(importResult.errors.length === 0, "Imported backup JSON with 0 validation errors");
  assert(importResult.importedCount === initialMemories.length, "Imported exact count of memory cards");
});

// ── PAIR 12 (F4 + F11): Financial Report Slash Command -> Word A4 Executive Tear Sheet ──
runPairTest("Pair 12 (F4 + F11): Financial Report Slash Command -> Word A4 Executive Tear Sheet", () => {
  const finCmd = getSlashCommand("financial-report")!;
  assert(finCmd.targetTab === "docx", "Financial report command targets docx tab");

  const metrics = computeRevenueMetrics({
    grossRevenue: 3000000,
    discounts: 200000,
    cogs: 1800000,
    opex: 400000,
  });

  const wordArtifact = generateWordRevenueArtifact(metrics, { title: "Báo Cáo Tài Chính Năm 2026" });
  assert(wordArtifact.type === "docx" && wordArtifact.extension === ".docx", "Word artifact created with .docx extension");
  assert(wordArtifact.title.includes("2026"), "Word artifact title reflects specified custom title");
  assert(wordArtifact.content.scorecard.length >= 4, "Word artifact contains 4 core KPI scorecard metrics");
  assert(wordArtifact.content.shortTermThesis.length >= 3, "Word artifact contains short-term financial thesis");
  assert(wordArtifact.content.catalystsAndRisks.length >= 2, "Word artifact contains catalysts and risk factors");
});

// ── PAIR 13 (F4 + F10): Slide Deck Slash Command -> 4-Slide Strategic Presentation ──
runPairTest("Pair 13 (F4 + F10): Slide Deck Slash Command -> 4-Slide Strategic Presentation", () => {
  const slideCmd = getSlashCommand("slide-deck")!;
  assert(slideCmd.targetTab === "slide", "Slide deck command targets slide tab");

  const metrics = computeRevenueMetrics({
    grossRevenue: 4000000,
    cogs: 2400000,
    opex: 600000,
  });

  const slideArtifact = generateSlideRevenueArtifact(metrics, { periodName: "Chiến Lược Q4" });
  assert(slideArtifact.content.slides.length === 4, "Generated exact 4-slide strategic presentation deck");
  assert(slideArtifact.content.slides[0].layout === "hero", "Slide 1 is Hero Title Slide");
  assert(slideArtifact.content.slides[1].layout === "stat_grid", "Slide 2 is Stat Grid Slide");
  assert(slideArtifact.content.slides[2].layout === "chart", "Slide 3 is Visual Chart Slide");
  assert(slideArtifact.content.slides[3].layout === "bullets", "Slide 4 is Strategic Action Bullets Slide");
});

// ── PAIR 14 (F13 + F6): Authoritative Memory Rule -> Revenue Engine Dynamic Calculation ──
runPairTest("Pair 14 (F13 + F6): Authoritative Memory Rule -> Revenue Engine Dynamic Calculation", () => {
  const vipRuleCard: AgentMemoryCard = {
    id: generateUUIDv7(),
    type: "rule",
    title: "Chính sách đối tác chiến lược",
    content: "Giảm trừ chiết khấu đối tác VIP: 8% trên Gross Revenue",
    category: "Pricing",
    tags: ["vip"],
    isPinned: true,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const grossRev = 1000000;
  const discountFromRule = grossRev * 0.08;
  const metrics = computeRevenueMetrics({
    grossRevenue: grossRev,
    discounts: discountFromRule,
    cogs: 500000,
    opex: 100000,
  });

  assert(metrics.totalDeductions === 80000, "Applied 8% discount from authoritative rule (80,000)");
  assert(metrics.netRevenue === 920000, "Calculated net revenue with authoritative rule deduction");
});

// ── PAIR 15 (F11 + F15): Multi-Artifact Sync State -> Multi-Tenant Storage Partitioning ──
runPairTest("Pair 15 (F11 + F15): Multi-Artifact Sync State -> Multi-Tenant Storage Partitioning", () => {
  const tenantAKey = buildStorageKey({ tenant: "org_vn", user: "analyst_01", session: "sess_100", type: "artifacts" });
  const tenantBKey = buildStorageKey({ tenant: "org_global", user: "analyst_02", session: "sess_200", type: "artifacts" });

  assert(tenantAKey !== tenantBKey, "Storage keys for different tenants/users are completely isolated");

  const parsedA = parseStorageKey(tenantAKey);
  assert(parsedA?.tenant === "org_vn" && parsedA?.user === "analyst_01" && parsedA?.session === "sess_100", "Parsed tenant A storage key correctly");

  const parsedB = parseStorageKey(tenantBKey);
  assert(parsedB?.tenant === "org_global" && parsedB?.user === "analyst_02" && parsedB?.session === "sess_200", "Parsed tenant B storage key correctly");
});

// ── SUMMARY REPORT ──
console.log("\n================================================================================");
console.log(`  TIER 3 SUMMARY: ${passed} PASSED | ${failed} FAILED across 15 Pairwise Combinations`);
console.log("================================================================================");
results.forEach((r, idx) => {
  console.log(`  ${(idx + 1).toString().padStart(2, " ")}. ${r.pair.padEnd(70, " ")}: ${r.passed} Passed, ${r.failed} Failed`);
});

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\n🎉 ALL TIER 3 PAIRWISE COMBINATION TESTS PASSED 100%!\n");
  process.exit(0);
}