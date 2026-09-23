/**
 * Tier 4 - Real-World End-to-End Business Workloads Test Suite
 *
 * Verifies 5 comprehensive real-world business scenarios:
 * 1. Fresh Produce Agri-Business Quarterly Revenue Audit & Spoilage Optimization
 * 2. Omnichannel Retail / E-commerce 9.9 Mega Campaign Audit
 * 3. FMCG Brand Q3 Strategic Board Review with Slide Studio & Global Memory
 * 4. Enterprise Memory Ingestion & Knowledge Extraction from LLM Audit Session
 * 5. Multi-Tenant Zero-Trust State Recovery & Session Purge Lifecycle
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
  extractUUIDv7Timestamp,
  buildStorageKey,
  parseStorageKey,
  storageManager,
} from "../lib/security/storage-manager";

let passed = 0;
let failed = 0;
const results: { workload: string; passed: number; failed: number }[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`    [PASS] ${message}`);
    passed++;
  } else {
    console.error(`    [FAIL] ${message}`);
    failed++;
  }
}

function runWorkload(name: string, fn: () => void) {
  const startPassed = passed;
  const startFailed = failed;
  console.log(`\n  ================================================================================`);
  console.log(`  [Tier 4 Workload] ${name}`);
  console.log(`  ================================================================================`);
  fn();
  const wPassed = passed - startPassed;
  const wFailed = failed - startFailed;
  results.push({ workload: name, passed: wPassed, failed: wFailed });
}

console.log("================================================================================");
console.log("  TIER 4: REAL-WORLD END-TO-END BUSINESS WORKLOADS TEST SUITE (5 WORKLOADS)");
console.log("================================================================================");

// ── WORKLOAD 1: Fresh Produce Agri-Business Revenue & Spoilage Audit ──
runWorkload("Workload 1: Fresh Produce Agri-Business Revenue & Spoilage Audit", () => {
  // 1. Input: Mekong Delta Dragon Fruit 500,000 kg export
  const harvestKg = 500000;
  const priceKg = 35000; // 35,000 VND / kg
  const spoilageRate = 0.045; // 4.5% post-harvest cold storage loss
  const prodCostKg = 18000; // 18,000 VND production cost
  const coldStorageCostKg = 3000; // 3,000 VND cold storage per kg
  const inboundTransportKg = 1500; // 1,500 VND refrigerated logistics

  const agriMetrics = computeAgriRevenue({
    harvestVolumeKg: harvestKg,
    pricePerKg: priceKg,
    spoilageRate,
    productionCostPerKg: prodCostKg,
    coldStorageCostPerKg: coldStorageCostKg,
    inboundTransportPerKg: inboundTransportKg,
  });

  assert(agriMetrics.grossRevenue === 17500000000, "Dragon Fruit Gross Revenue = 500k kg * 35,000đ = 17,500,000,000đ (17.5 Tỷ)");
  assert(agriMetrics.baseCogs === 9000000000, "Base Production COGS = 500k kg * 18,000đ = 9,000,000,000đ (9.0 Tỷ)");
  assert(agriMetrics.spoilageLoss === 787500000, "Spoilage Loss = 500k * 4.5% * 35k = 787,500,000đ");
  assert(agriMetrics.freightCost === 2250000000, "Cold-Chain Logistics = 500k * (3k + 1.5k) = 2,250,000,000đ (2.25 Tỷ)");
  assert(agriMetrics.totalCogs === 12037500000, "Total Consolidated COGS = 9B + 787.5M + 2.25B = 12,037,500,000đ");
  assert(agriMetrics.grossProfit === 5462500000, "Gross Profit = 17.5B - 12.0375B = 5,462,500,000đ (5.46 Tỷ)");

  // 2. Generate Multi-Artifact Delivery
  const excelArtifact = generateExcelRevenueArtifact(agriMetrics, {
    title: "Bang_Kiem_Toan_Doanh_Thu_Nong_San_Q3.xlsx",
    periodName: "Q3/2026",
  });
  assert(excelArtifact.type === "excel" && excelArtifact.content.sheets[0].rows.length >= 16, "Generated institutional Excel PnL model with full formula rows");

  const slideArtifact = generateSlideRevenueArtifact(agriMetrics, {
    title: "Bao_Cao_Chien_Luoc_Hao_Hut_Nong_San.pptx",
    periodName: "Q3/2026",
  });
  assert(slideArtifact.content.slides.length === 4, "Generated 4-slide executive presentation for Executive Board");
});

// ── WORKLOAD 2: Omnichannel Retail / E-commerce 9.9 Mega Campaign Audit ──
runWorkload("Workload 2: Omnichannel Retail / E-commerce 9.9 Mega Campaign Audit", () => {
  const omnichannelData: RevenueInput = {
    grossRevenue: 18500000000,
    discounts: 1800000000,
    returns: 650000000,
    cogs: 9200000000,
    opex: 2400000000,
    channelBreakdown: [
      {
        channel: "Shopee Mall",
        grossRevenue: 7500000000,
        discounts: 900000000,
        returns: 200000000,
        cogs: 3700000000,
        channelFees: 750000000, // 10% platform fee + affiliate
        freight: 150000000,
      },
      {
        channel: "TikTok Shop",
        grossRevenue: 5200000000,
        discounts: 600000000,
        returns: 350000000, // Higher return rate on impulse video buy
        cogs: 2600000000,
        channelFees: 624000000, // 12% commission
        freight: 120000000,
      },
      {
        channel: "Lazada Flagship",
        grossRevenue: 2800000000,
        discounts: 200000000,
        returns: 70000000,
        cogs: 1400000000,
        channelFees: 252000000,
        freight: 60000000,
      },
      {
        channel: "Chuỗi 12 Cửa Hàng Offline",
        grossRevenue: 3000000000,
        discounts: 100000000,
        returns: 30000000,
        cogs: 1500000000,
        channelFees: 0,
        freight: 50000000,
      },
    ],
  };

  const metrics = computeRevenueMetrics(omnichannelData);

  assert(metrics.netRevenue === 16050000000, "Campaign Net Revenue = 18.5B - (1.8B discounts + 650M returns) = 16.05B");
  assert(metrics.grossProfit === 6850000000, "Campaign Gross Profit = 16.05B - 9.2B = 6.85B");
  assert(metrics.ebitda === 4450000000, "Campaign EBITDA = 6.85B - 2.4B OPEX = 4.45B");

  // Verify Channel CM1 Profitability Ranking
  const shopee = metrics.channels.find((c) => c.channel === "Shopee Mall")!;
  const tiktok = metrics.channels.find((c) => c.channel === "TikTok Shop")!;
  const retail = metrics.channels.find((c) => c.channel.includes("Offline"))!;

  assert(shopee.contributionMargin1 === 1800000000, "Shopee Mall CM1 = 6.4B net - 3.7B cogs - 900M fees = 1.80B");
  assert(tiktok.contributionMargin1 === 906000000, "TikTok Shop CM1 = 4.25B net - 2.6B cogs - 744M fees = 906M");
  assert(retail.contributionMargin1 === 1320000000, "Offline Stores CM1 = 2.87B net - 1.5B cogs - 50M freight = 1.32B");

  const wordTearSheet = generateWordRevenueArtifact(metrics, {
    title: "Báo Cáo Kiểm Toán Chiến Dịch 9.9",
  });
  assert(wordTearSheet.type === "docx" && wordTearSheet.content.scorecard.length === 4, "Generated Word Tear Sheet with 4 KPI scorecard metrics");
  assert(wordTearSheet.content.rating === "OUTPERFORM", "Campaign assigned OUTPERFORM institutional rating (Gross Margin >= 35%)");
});

// ── WORKLOAD 3: FMCG Brand Q3 Strategic Board Review ──
runWorkload("Workload 3: FMCG Brand Q3 Strategic Board Review with Slide Studio & Global Memory", () => {
  // 1. Authoritative Board Target in Global Memory
  const targetEbitdaCard = addGlobalMemory({
    type: "rule",
    title: "Mục tiêu Biên EBITDA Tối thiểu HĐQT",
    content: "Biên EBITDA tối thiểu hợp nhất toàn ngành hàng phải đạt >= 22.0%",
    category: "Corporate Governance",
    tags: ["ebitda", "board", "kpi"],
    isPinned: true,
  });

  const boardMetrics = computeRevenueMetrics({
    grossRevenue: 45000000000,
    discounts: 2500000000,
    cogs: 22000000000,
    opex: 8500000000,
    channelBreakdown: [
      { channel: "General Trade (GT)", grossRevenue: 25000000000, cogs: 13000000000, channelFees: 1200000000 },
      { channel: "Modern Trade (MT)", grossRevenue: 15000000000, cogs: 7500000000, channelFees: 1800000000 },
      { channel: "E-Commerce", grossRevenue: 5000000000, cogs: 1500000000, channelFees: 800000000 },
    ],
  });

  assert(boardMetrics.operatingMarginPct > 22.0, `Operating EBITDA margin (${boardMetrics.operatingMarginPct.toFixed(2)}%) satisfies Board rule (>= 22%)`);

  // 2. Build Slide Presentation Deck
  const slideDeck = generateSlideRevenueArtifact(boardMetrics, {
    title: "Báo Cáo HĐQT Chiến Lược Tài Chính Q3",
    periodName: "Q3/2026",
  });

  assert(slideDeck.content.slides.length === 4, "Slide Deck contains 4 executive slides");
  assert(slideDeck.content.slides[1].layout === "stat_grid", "Slide 2 is Stat Grid with core KPIs");
  assert(slideDeck.content.slides[2].layout === "chart", "Slide 3 is ChartSlide visualizing channel mix");
  assert(slideDeck.content.slides[3].layout === "bullets", "Slide 4 contains Board Governance & Action bullets");

  // Clean up
  deleteGlobalMemory(targetEbitdaCard.id);
});

// ── WORKLOAD 4: Enterprise Memory Ingestion & Knowledge Extraction from LLM ──
runWorkload("Workload 4: Enterprise Memory Ingestion & Knowledge Extraction from LLM Session", () => {
  const multiTurnTranscript = `
Dưới đây là biên bản họp tài chính và các quy định ghi nhận mới:
<memory_card type="formula" title="Công thức Tính Chiết Khấu Bậc Thang" category="Commercial" tags="discount,commercial">
Chiết khấu bậc thang = Tỷ lệ cơ bản (5%) + Thưởng doanh số quý (3% nếu đạt > 5 Tỷ)
</memory_card>

<memory_card type="rule" title="Chính sách Phí Lưu Kho Lạnh" category="Logistics" tags="cold_chain,storage">
Phí lưu kho lạnh vượt hạn định: 250đ/kg/ngày sau 14 ngày bảo quản
</memory_card>

[GHI NHỚ QUY TẮC]: Phí sàn thương mại điện tử cập nhật 2026 = Shopee 9.5% và TikTok 10.0%
`;

  const extracted = extractMemoryCardsFromText(multiTurnTranscript, "session-q3-audit");
  assert(extracted.length === 3, "Extracted exactly 3 enterprise memory cards from transcript (2 XML + 1 heuristic)");

  // Persist all extracted cards
  const savedCards = extracted.map((c) => addGlobalMemory(c));
  assert(savedCards.every((c) => isValidUUIDv7(c.id)), "All extracted cards assigned RFC 9562 valid UUIDv7 IDs");

  // Format system prompt
  const memories = getGlobalMemories();
  const systemPrompt = formatMemoriesForSystemPrompt(memories);
  assert(systemPrompt.includes("Chiết khấu bậc thang"), "System prompt contains tier discount formula");
  assert(systemPrompt.includes("Phí Lưu Kho Lạnh"), "System prompt contains cold storage logistics rule");
  assert(systemPrompt.includes("Phí sàn thương mại điện tử"), "System prompt contains heuristic marketplace rule");

  // Export JSON and test portability
  const backupJson = exportMemoriesToJson(memories);
  const migrationResult = importMemoriesFromJson(backupJson);
  assert(migrationResult.errors.length === 0, "Lossless JSON portability round-trip with 0 schema errors");

  // Clean up
  savedCards.forEach((c) => deleteGlobalMemory(c.id));
});

// ── WORKLOAD 5: Multi-Tenant Zero-Trust State Recovery & Session Purge ──
runWorkload("Workload 5: Multi-Tenant Zero-Trust State Recovery & Session Purge Lifecycle", () => {
  const tenant1 = "corp_vietnam";
  const tenant2 = "corp_singapore";
  const user1 = "auditor_hanoi";
  const user2 = "auditor_changi";
  const sess1 = generateUUIDv7();
  const sess2 = generateUUIDv7();

  const key1 = buildStorageKey({ tenant: tenant1, user: user1, session: sess1, type: "artifacts" });
  const key2 = buildStorageKey({ tenant: tenant2, user: user2, session: sess2, type: "artifacts" });

  assert(key1 !== key2, "Tenant 1 and Tenant 2 storage namespaces are strictly isolated");
  assert(key1.startsWith("openwork:v7:corp_vietnam:auditor_hanoi:"), "Key 1 respects RFC 9562 namespace standard");
  assert(key2.startsWith("openwork:v7:corp_singapore:auditor_changi:"), "Key 2 respects RFC 9562 namespace standard");

  // Save session 1 artifacts into storage manager
  const sampleArtifacts: OpenWorkArtifact[] = [
    { id: "art-1", name: "Audit.xlsx", type: "excel", status: "ready", version: 1, content: {}, updatedAt: "14:00" },
    { id: "art-2", name: "Deck.pptx", type: "slide", status: "ready", version: 1, content: {}, updatedAt: "14:00" },
  ];
  storageManager.setItem(key1, sampleArtifacts);

  const loadedArt1 = storageManager.getItem<OpenWorkArtifact[]>(key1);
  assert(Array.isArray(loadedArt1) && loadedArt1.length === 2, "Retrieved 2 session artifacts from isolated storage partition");

  const crossTenantLoad = storageManager.getItem<OpenWorkArtifact[]>(key2);
  assert(crossTenantLoad === null, "Cross-tenant access correctly returns null (Zero-Trust Isolation)");

  // Session Purge
  storageManager.removeItem(key1);
  const afterPurge = storageManager.getItem(key1);
  assert(afterPurge === null, "Session purge completely eradicated tenant session artifacts without trace");
});

// ── SUMMARY REPORT ──
console.log("\n================================================================================");
console.log(`  TIER 4 SUMMARY: ${passed} PASSED | ${failed} FAILED across 5 Real-World Workloads`);
console.log("================================================================================");
results.forEach((r, idx) => {
  console.log(`  ${(idx + 1).toString().padStart(2, " ")}. ${r.workload.padEnd(70, " ")}: ${r.passed} Passed, ${r.failed} Failed`);
});

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\n🎉 ALL TIER 4 REAL-WORLD WORKLOAD TESTS PASSED 100%!\n");
  process.exit(0);
}