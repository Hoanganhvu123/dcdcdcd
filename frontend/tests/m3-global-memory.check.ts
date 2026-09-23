/**
 * m3-global-memory.check.ts
 *
 * Comprehensive Automated Verification Suite for Milestone 3:
 * Persistent Global Agent Memory, OpenWorkMemoryDrawer UI & System Prompt Injection
 */

import fs from 'fs';
import path from 'path';
import {
  type AgentMemoryCard,
  type MemoryCardType,
  GLOBAL_MEMORY_STORAGE_TYPE,
  DEFAULT_ENTERPRISE_MEMORY_CARDS,
  getGlobalMemories,
  saveGlobalMemories,
  addGlobalMemory,
  updateGlobalMemory,
  deleteGlobalMemory,
  toggleGlobalMemory,
  togglePinGlobalMemory,
  resetGlobalMemoriesToDefault,
  formatMemoriesForSystemPrompt,
  extractMemoryCardsFromText,
  exportMemoriesToJson,
  importMemoriesFromJson,
} from '../lib/memory/globalMemoryStore';

import {
  storageManager,
  generateUUIDv7,
  isValidUUIDv7,
  GLOBAL_SESSION_ID,
} from '../lib/security/storage-manager';

console.log('================================================================');
console.log(' M3: PERSISTENT GLOBAL AGENT MEMORY & DRAWER AUTOMATED VERIFIER');
console.log('================================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assert(condition: boolean, testName: string, details?: any) {
  totalChecks++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedChecks++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedChecks++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Memory Card Schema & UUIDv7 Identifier Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 1. Memory Card Schema & UUIDv7 Identifiers ---');

const generatedId = generateUUIDv7();
assert(isValidUUIDv7(generatedId), 'generateUUIDv7() produces valid RFC 9562 UUIDv7', { id: generatedId });

const sampleCard: AgentMemoryCard = {
  id: generatedId,
  type: 'formula',
  title: 'Công thức Biên Lợi Nhuận Gộp',
  content: 'Gross Margin = (Lợi Nhuận Gộp / Doanh Thu Thuần) * 100',
  category: 'Finance',
  tags: ['revenue', 'margin', 'pnl'],
  sourceSessionId: 'manual',
  confidence: 1.0,
  isPinned: true,
  isEnabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

assert(sampleCard.type === 'formula', 'AgentMemoryCard type conforms to union MemoryCardType');
assert(Array.isArray(sampleCard.tags) && sampleCard.tags.length === 3, 'AgentMemoryCard tags array supported');
assert(sampleCard.isPinned === true, 'AgentMemoryCard isPinned flag present');
assert(sampleCard.isEnabled === true, 'AgentMemoryCard isEnabled flag present');

// ─────────────────────────────────────────────────────────────────────────────
// 2. Partitioned Persistent Storage & Isolation Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Partitioned Persistent Storage Isolation ---');

const partitionKey = storageManager.buildKey(GLOBAL_MEMORY_STORAGE_TYPE, GLOBAL_SESSION_ID);
assert(
  partitionKey.includes(':global:memory-cards'),
  'Storage partition key conforms to openwork:v7:{tenant}:{user}:global:memory-cards',
  { key: partitionKey }
);

// Reset storage to test fresh initialization
storageManager.removeItem(partitionKey);
const freshMemories = getGlobalMemories();
assert(freshMemories.length === DEFAULT_ENTERPRISE_MEMORY_CARDS.length, 'getGlobalMemories() automatically seeds default enterprise cards on empty storage', { count: freshMemories.length });

const storedFromStorage = storageManager.getPartitionedItem<AgentMemoryCard[]>(GLOBAL_MEMORY_STORAGE_TYPE, GLOBAL_SESSION_ID);
assert(Array.isArray(storedFromStorage) && storedFromStorage.length === freshMemories.length, 'storageManager.getPartitionedItem returns array matching getGlobalMemories');

// ─────────────────────────────────────────────────────────────────────────────
// 3. Default Enterprise Memory Card Seed Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Default Enterprise Memory Card Seeds ---');

const netRevCard = freshMemories.find((m) => m.title.includes('Doanh Thu Thuần'));
assert(Boolean(netRevCard), 'Default seed contains Net Revenue formula card', { title: netRevCard?.title });
assert(netRevCard?.type === 'formula', 'Net Revenue card type is formula');
assert(netRevCard?.isPinned === true, 'Net Revenue card is pinned by default');

const vatCard = freshMemories.find((m) => m.title.includes('VAT 8%'));
assert(Boolean(vatCard), 'Default seed contains 8% VAT deduction rule card', { title: vatCard?.title });
assert(vatCard?.type === 'rule', 'VAT card type is rule');
assert(vatCard?.category === 'Tax', 'VAT card category is Tax');

const spoilageCard = freshMemories.find((m) => m.title.includes('Hao hụt Nông sản'));
assert(Boolean(spoilageCard), 'Default seed contains Agri Spoilage allowance card', { title: spoilageCard?.title });
assert(spoilageCard?.type === 'assumption', 'Spoilage card type is assumption');

const omnichannelCard = freshMemories.find((m) => m.title.includes('Omnichannel CM1'));
assert(Boolean(omnichannelCard), 'Default seed contains Omnichannel CM1 contribution rule card', { title: omnichannelCard?.title });

const reportingCard = freshMemories.find((m) => m.title.includes('Định dạng Báo cáo Tài chính'));
assert(Boolean(reportingCard), 'Default seed contains Executive Reporting preference card', { title: reportingCard?.title });
assert(reportingCard?.type === 'preference', 'Reporting card type is preference');

// ─────────────────────────────────────────────────────────────────────────────
// 4. Memory Store CRUD Operations Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Memory Store CRUD Operations ---');

// 4.1 Create
const createdCard = addGlobalMemory({
  type: 'rule',
  title: 'Quy tắc Chiết khấu Khách hàng VIP',
  content: 'Khách hàng VIP Gold chiết khấu 5%, VIP Diamond chiết khấu 10% trên tổng bill.',
  category: 'Retail',
  tags: ['vip', 'discount', 'loyalty'],
  isPinned: false,
  isEnabled: true,
});

assert(isValidUUIDv7(createdCard.id), 'addGlobalMemory() generates UUIDv7 for new card', { id: createdCard.id });
assert(getGlobalMemories().some((m) => m.id === createdCard.id), 'Newly added card exists in persistent storage');

// 4.2 Update
const updatedCard = updateGlobalMemory(createdCard.id, {
  content: 'Khách hàng VIP Gold chiết khấu 7%, VIP Diamond chiết khấu 12% trên tổng bill (Cập nhật Q3/2026).',
  category: 'Retail-CRM',
});
assert(updatedCard !== null, 'updateGlobalMemory() returns updated card object');
assert(updatedCard?.content.includes('VIP Gold chiết khấu 7%'), 'updateGlobalMemory() updates content accurately');
assert(updatedCard?.category === 'Retail-CRM', 'updateGlobalMemory() updates category');

// 4.3 Toggle enable/disable
const toggledDisabled = toggleGlobalMemory(createdCard.id, false);
assert(toggledDisabled?.isEnabled === false, 'toggleGlobalMemory(id, false) disables card');

const toggledEnabled = toggleGlobalMemory(createdCard.id, true);
assert(toggledEnabled?.isEnabled === true, 'toggleGlobalMemory(id, true) enables card');

// 4.4 Toggle pin
const pinned = togglePinGlobalMemory(createdCard.id, true);
assert(pinned?.isPinned === true, 'togglePinGlobalMemory(id, true) pins card');

const unpinned = togglePinGlobalMemory(createdCard.id, false);
assert(unpinned?.isPinned === false, 'togglePinGlobalMemory(id, false) unpins card');

// 4.5 Delete
const deleted = deleteGlobalMemory(createdCard.id);
assert(deleted === true, 'deleteGlobalMemory() returns true for existing card');
assert(!getGlobalMemories().some((m) => m.id === createdCard.id), 'Deleted card is removed from storage');

// 4.6 Reset to defaults
const resetMemories = resetGlobalMemoriesToDefault();
assert(resetMemories.length === DEFAULT_ENTERPRISE_MEMORY_CARDS.length, 'resetGlobalMemoriesToDefault() restores exact default seed count');

// ─────────────────────────────────────────────────────────────────────────────
// 5. System Prompt Injection Formatter Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. System Prompt Injection Formatter ---');

const testMemoriesForPrompt: AgentMemoryCard[] = [
  {
    id: generateUUIDv7(),
    type: 'formula',
    title: 'Công thức Lãi Ròng',
    content: 'Net Profit = Gross Profit - OPEX - Tax',
    category: 'Finance',
    tags: ['profit'],
    isPinned: true,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: generateUUIDv7(),
    type: 'rule',
    title: 'Quy tắc Ghi nhận Doanh thu',
    content: 'Doanh thu chỉ ghi nhận khi đơn hàng ở trạng thái Delivered thành công.',
    category: 'Accounting',
    tags: ['revenue'],
    isPinned: false,
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: generateUUIDv7(),
    type: 'assumption',
    title: 'Tỷ lệ Lạm phát Dự phóng',
    content: 'Áp dụng lạm phát 3.5%/năm cho kế hoạch 2027.',
    category: 'Macro',
    tags: ['inflation'],
    isPinned: false,
    isEnabled: false, // DISABLED -> must be excluded!
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const formattedPrompt = formatMemoriesForSystemPrompt(testMemoriesForPrompt);

assert(formattedPrompt.includes('GLOBAL AGENT MEMORY & BUSINESS KNOWLEDGE BASE'), 'Prompt contains authoritative Global Memory header');
assert(formattedPrompt.includes('[MANDATORY FORMULAS]'), 'Prompt groups formulas under [MANDATORY FORMULAS]');
assert(formattedPrompt.includes('Công thức Lãi Ròng [AUTHORITATIVE]'), 'Pinned formula receives [AUTHORITATIVE] designation');
assert(formattedPrompt.includes('[OPERATIONAL & ACCOUNTING RULES]'), 'Prompt groups rules under [OPERATIONAL & ACCOUNTING RULES]');
assert(formattedPrompt.includes('Doanh thu chỉ ghi nhận khi đơn hàng ở trạng thái Delivered'), 'Enabled rule is included in prompt');
assert(!formattedPrompt.includes('Tỷ lệ Lạm phát Dự phóng'), 'Disabled memory card is strictly excluded from system prompt injection');

const emptyPrompt = formatMemoriesForSystemPrompt([]);
assert(emptyPrompt === '', 'formatMemoriesForSystemPrompt([]) returns empty string when no memories provided');

const allDisabledPrompt = formatMemoriesForSystemPrompt(
  testMemoriesForPrompt.map((m) => ({ ...m, isEnabled: false }))
);
assert(allDisabledPrompt === '', 'formatMemoriesForSystemPrompt returns empty string when all cards are disabled');

// ─────────────────────────────────────────────────────────────────────────────
// 6. Auto-Extraction Parser Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 6. Auto-Extraction Parser ---');

// 6.1 XML tag extraction
const sampleLLMResponseWithXml = `
Dựa trên phân tích báo cáo tài chính Q3/2026:
<memory_card type="formula" title="Công thức ROAS Chiến Dịch" category="Marketing" tags="roas,marketing,ads">
  ROAS = Doanh Thu Kênh Marketing / Tổng Chi Phí Quảng Cáo
</memory_card>

Ngoài ra, hệ thống lưu ý quy tắc chiết khấu sàn:
<memory_card type="rule" title="Trần Chiết Khấu Sàn Thương Mại" category="E-commerce">
  Tổng ngân sách Voucher và Flash Sale của sàn không được vượt quá 12% GMV.
</memory_card>
`;

const extractedXmlCards = extractMemoryCardsFromText(sampleLLMResponseWithXml, 'session-test-xml');
assert(extractedXmlCards.length === 2, 'extractMemoryCardsFromText extracts 2 cards from XML tags', { count: extractedXmlCards.length });

const roasCard = extractedXmlCards.find((c) => c.title === 'Công thức ROAS Chiến Dịch');
assert(Boolean(roasCard), 'Extracted ROAS formula card exists');
assert(roasCard?.type === 'formula', 'Extracted ROAS type is formula');
assert(roasCard?.content.includes('ROAS = Doanh Thu Kênh Marketing'), 'Extracted ROAS content matches inner text');
assert(roasCard?.tags.includes('roas') && roasCard?.tags.includes('ads'), 'Extracted ROAS tags parsed properly');
assert(roasCard?.sourceSessionId === 'session-test-xml', 'sourceSessionId preserved on extracted cards');

// 6.2 Heuristic pattern extraction
const sampleResponseWithHeuristic = `
[GHI NHỚ CÔNG THỨC]: Tỷ Suất Hoàn Vốn ROI = (Lợi Nhuận Ròng / Tổng Vốn Đầu Tư) * 100
[QUY TẮC MỚI]: Đối soát Tiền Mặt COD - Tất cả đơn COD giao thành công phải đối soát trong vòng 48h.
`;

const extractedHeuristicCards = extractMemoryCardsFromText(sampleResponseWithHeuristic, 'session-test-h');
assert(extractedHeuristicCards.length >= 2, 'extractMemoryCardsFromText extracts heuristic cards from markdown patterns', { count: extractedHeuristicCards.length });

const roiCard = extractedHeuristicCards.find((c) => c.title.includes('Tỷ Suất Hoàn Vốn ROI'));
assert(Boolean(roiCard), 'Extracted ROI card exists');
assert(roiCard?.type === 'formula', 'Heuristic recognized "CÔNG THỨC" keyword as formula type');

// ─────────────────────────────────────────────────────────────────────────────
// 7. JSON Export & Import Integrity Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 7. JSON Export & Import Integrity ---');

const exportedJson = exportMemoriesToJson(freshMemories);
assert(typeof exportedJson === 'string' && exportedJson.startsWith('{'), 'exportMemoriesToJson produces valid JSON string');

const parsedExport = JSON.parse(exportedJson);
assert(parsedExport.version === '1.0', 'Exported JSON payload has version 1.0');
assert(Array.isArray(parsedExport.memories) && parsedExport.memories.length === freshMemories.length, 'Exported JSON memories count matches source');

// Test importing valid payload
const customImportPayload = JSON.stringify({
  version: '1.0',
  memories: [
    {
      title: 'Quy tắc Kế toán Tài sản Cố định',
      content: 'Tài sản trên 30 triệu VNĐ khấu hao đường thẳng 3-5 năm.',
      type: 'rule',
      category: 'Accounting',
      tags: ['asset', 'depreciation'],
    },
  ],
});

const importResult = importMemoriesFromJson(customImportPayload);
assert(importResult.importedCount === 1, 'importMemoriesFromJson imports 1 valid card');
assert(importResult.errors.length === 0, 'importMemoriesFromJson has zero errors for valid payload');
assert(getGlobalMemories().some((m) => m.title === 'Quy tắc Kế toán Tài sản Cố định'), 'Imported card is stored in global memories');

// Test importing corrupted payload
const corruptedImportResult = importMemoriesFromJson('INVALID_JSON_STRING');
assert(corruptedImportResult.importedCount === 0, 'importMemoriesFromJson handles invalid JSON gracefully');
assert(corruptedImportResult.errors.length > 0, 'importMemoriesFromJson reports syntax errors');

// ─────────────────────────────────────────────────────────────────────────────
// 8. Frontend Component & Navigation Integration AST Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 8. Frontend Component & Navigation AST Verification ---');

const rootDir = path.resolve(__dirname, '..');

// 8.1 OpenWorkMemoryDrawer.tsx existence and AST assertions
const drawerPath = path.join(rootDir, 'components', 'openwork', 'memory', 'OpenWorkMemoryDrawer.tsx');
assert(fs.existsSync(drawerPath), 'OpenWorkMemoryDrawer.tsx exists in components/openwork/memory/');

const drawerSrc = fs.readFileSync(drawerPath, 'utf8');
assert(drawerSrc.includes('@/components/ui/sheet'), 'OpenWorkMemoryDrawer imports Radix UI Sheet component');
assert(drawerSrc.includes('Brain'), 'OpenWorkMemoryDrawer imports Brain icon from lucide-react');
assert(drawerSrc.includes('Switch'), 'OpenWorkMemoryDrawer imports Switch component for rule toggling');
assert(drawerSrc.includes('data-testid="openwork-memory-drawer"'), 'OpenWorkMemoryDrawer has data-testid="openwork-memory-drawer"');
assert(drawerSrc.includes('data-testid="memory-search-input"'), 'OpenWorkMemoryDrawer has data-testid="memory-search-input"');
assert(drawerSrc.includes('data-testid="memory-add-button"'), 'OpenWorkMemoryDrawer has data-testid="memory-add-button"');
assert(!drawerSrc.includes('from "antd"') && !drawerSrc.includes("from 'antd'"), 'OpenWorkMemoryDrawer has ZERO imports from antd');

// 8.2 OpenWorkHeader.tsx memory trigger button
const headerPath = path.join(rootDir, 'components', 'openwork', 'OpenWorkHeader.tsx');
assert(fs.existsSync(headerPath), 'OpenWorkHeader.tsx exists');

const headerSrc = fs.readFileSync(headerPath, 'utf8');
assert(headerSrc.includes('onOpenMemory'), 'OpenWorkHeader accepts onOpenMemory prop');
assert(headerSrc.includes('openwork-header-memory-trigger'), 'OpenWorkHeader contains data-testid="openwork-header-memory-trigger" button');
assert(headerSrc.includes('Brain'), 'OpenWorkHeader imports and displays Brain icon');
assert(!headerSrc.includes('from "antd"') && !headerSrc.includes("from 'antd'"), 'OpenWorkHeader has ZERO imports from antd');

// 8.3 OpenWorkSidebar.tsx memory trigger button & navigation
const sidebarPath = path.join(rootDir, 'components', 'openwork', 'OpenWorkSidebar.tsx');
assert(fs.existsSync(sidebarPath), 'OpenWorkSidebar.tsx exists');

const sidebarSrc = fs.readFileSync(sidebarPath, 'utf8');
assert(sidebarSrc.includes('onOpenMemory'), 'OpenWorkSidebar accepts onOpenMemory prop');
assert(sidebarSrc.includes('openwork-sidebar-memory'), 'OpenWorkSidebar contains data-testid="openwork-sidebar-memory" button');
assert(sidebarSrc.includes("key: 'memory'"), 'OpenWorkSidebar WORKSPACE_NAV_ITEMS includes memory navigation item');

// 8.4 useOpenWorkStore.ts memory state & prompt injection
const storePath = path.join(rootDir, 'components', 'openwork', 'useOpenWorkStore.ts');
assert(fs.existsSync(storePath), 'useOpenWorkStore.ts exists');

const storeSrc = fs.readFileSync(storePath, 'utf8');
assert(storeSrc.includes('memoryCards'), 'useOpenWorkStore manages memoryCards state');
assert(storeSrc.includes('memoryDrawerOpen'), 'useOpenWorkStore manages memoryDrawerOpen state');
assert(storeSrc.includes('formatMemoriesForSystemPrompt'), 'useOpenWorkStore imports formatMemoriesForSystemPrompt');
assert(storeSrc.includes('finalSystemPrompt = systemPrompt + modePrompt + memoryPrompt'), 'useOpenWorkStore injects memoryPrompt into finalSystemPrompt');
assert(storeSrc.includes('extractMemoryCardsFromText'), 'useOpenWorkStore runs auto-extraction on assistant response completion');

// 8.5 OpenWorkShell.tsx memory drawer mounting
const shellPath = path.join(rootDir, 'components', 'openwork', 'OpenWorkShell.tsx');
assert(fs.existsSync(shellPath), 'OpenWorkShell.tsx exists');

const shellSrc = fs.readFileSync(shellPath, 'utf8');
assert(shellSrc.includes('OpenWorkMemoryDrawer'), 'OpenWorkShell imports OpenWorkMemoryDrawer');
assert(shellSrc.includes('<OpenWorkMemoryDrawer'), 'OpenWorkShell mounts <OpenWorkMemoryDrawer />');

// ─────────────────────────────────────────────────────────────────────────────
// 9. Dual-Tree Parity Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 9. Dual-Tree Parity / Single-Tree Canonical Verification ---');

const mockRootDir = path.resolve(rootDir, '..', 'frontend_mock');
const hasMock = fs.existsSync(mockRootDir);

const filesToVerifyParity = [
  'lib/memory/globalMemoryStore.ts',
  'components/openwork/memory/OpenWorkMemoryDrawer.tsx',
  'components/openwork/OpenWorkHeader.tsx',
  'components/openwork/OpenWorkSidebar.tsx',
  'components/openwork/useOpenWorkStore.ts',
  'components/openwork/OpenWorkShell.tsx',
  'components/openwork/index.ts',
];

if (hasMock) {
  filesToVerifyParity.forEach((relPath) => {
    const prodFile = path.join(rootDir, relPath);
    const mockFile = path.join(mockRootDir, relPath);

    assert(fs.existsSync(mockFile), `frontend_mock/${relPath} exists in dual-tree layout`);

    if (fs.existsSync(prodFile) && fs.existsSync(mockFile)) {
      const prodContent = fs.readFileSync(prodFile, 'utf8');
      const mockContent = fs.readFileSync(mockFile, 'utf8');
      assert(
        prodContent.trim() === mockContent.trim(),
        `Dual-tree exact parity verified for ${relPath}`
      );
    }
  });
} else {
  filesToVerifyParity.forEach((relPath) => {
    const prodFile = path.join(rootDir, relPath);
    assert(fs.existsSync(prodFile), `Single-tree canonical file exists: ${relPath}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(` M3 CHECK SUMMARY: ${passedChecks}/${totalChecks} PASS (${failedChecks} FAIL)`);
console.log('================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
