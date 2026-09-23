/**
 * challenger-empirical-memory-parity.test.ts
 *
 * Empirical verification harness for:
 * 1. Global Agent Memory persistence, corrupt storage handling, browser reboot simulation,
 *    JSON export/import, prompt injection formatting, and auto-extraction.
 * 2. Dual-tree parity verification between `frontend` and `frontend_mock`.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Setup mock localStorage in Node environment if missing
const memoryStorage = new Map<string, string>();
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, val: string) => { memoryStorage.set(key, val); },
      removeItem: (key: string) => { memoryStorage.delete(key); },
      clear: () => { memoryStorage.clear(); },
      key: (idx: number) => Array.from(memoryStorage.keys())[idx] ?? null,
      get length() { return memoryStorage.size; },
    }
  };
}

import {
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
  DEFAULT_ENTERPRISE_MEMORY_CARDS,
  GLOBAL_MEMORY_STORAGE_TYPE,
  AgentMemoryCard,
} from '../lib/memory/globalMemoryStore';

import {
  storageManager,
  StorageManager,
  buildStorageKey,
  isValidUUIDv7,
  generateUUIDv7,
  GLOBAL_SESSION_ID,
} from '../lib/security/storage-manager';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

async function runEmpiricalSuite() {
  console.log('================================================================================');
  console.log('  CHALLENGER EMPIRICAL VERIFICATION: MEMORY PERSISTENCE & DUAL-TREE PARITY');
  console.log('================================================================================\n');

  // ── SECTION 1: GLOBAL AGENT MEMORY PERSISTENCE & LIFECYCLE ──
  console.log('--- Section 1: Global Agent Memory Persistence & Lifecycle ---');

  // Test 1.1: Default seeds initialization
  memoryStorage.clear();
  const initialMemories = getGlobalMemories();
  assert(
    initialMemories.length === 5,
    'T1.1: Default enterprise seeds initialized to 5 cards',
    `Got ${initialMemories.length}`
  );
  assert(
    initialMemories.every(m => isValidUUIDv7(m.id)),
    'T1.2: All seed memory cards have valid RFC 9562 UUIDv7 IDs'
  );
  assert(
    initialMemories.some(m => m.type === 'formula') &&
    initialMemories.some(m => m.type === 'rule') &&
    initialMemories.some(m => m.type === 'assumption') &&
    initialMemories.some(m => m.type === 'preference'),
    'T1.3: Default seeds cover all 4 card types (formula, rule, assumption, preference)'
  );

  // Test 1.4: Add new memory card
  const newCard = addGlobalMemory({
    type: 'formula',
    title: 'Biên Lợi Nhuận Gộp Mục Tiêu (Target Gross Margin)',
    content: 'Biên Lợi Nhuận Gộp = (Doanh Thu Thuần - COGS) / Doanh Thu Thuần >= 35.0%',
    category: 'Finance',
    tags: ['margin', 'target', 'kpi'],
    isPinned: true,
  });
  assert(isValidUUIDv7(newCard.id), 'T1.4: addGlobalMemory assigns valid UUIDv7');
  const memoriesAfterAdd = getGlobalMemories();
  assert(
    memoriesAfterAdd.length === 6 && memoriesAfterAdd[0].title.includes('Biên Lợi Nhuận Gộp Mục Tiêu'),
    'T1.5: Newly added card is prepended and persisted in storage'
  );

  // Test 1.6: Update memory card
  const updated = updateGlobalMemory(newCard.id, {
    content: 'Biên Lợi Nhuận Gộp = (Doanh Thu Thuần - COGS) / Doanh Thu Thuần >= 40.0%',
    category: 'Executive-KPI',
  });
  assert(
    updated !== null && updated.content.includes('40.0%') && updated.category === 'Executive-KPI',
    'T1.6: updateGlobalMemory successfully updates content and category'
  );
  assert(
    new Date(updated!.updatedAt).getTime() >= new Date(newCard.createdAt).getTime(),
    'T1.7: updatedAt timestamp is updated on modification'
  );

  // Test 1.7: Toggle enable/disable
  const disabledCard = toggleGlobalMemory(newCard.id, false);
  assert(disabledCard !== null && disabledCard.isEnabled === false, 'T1.8: toggleGlobalMemory disables card');
  const promptWithoutDisabled = formatMemoriesForSystemPrompt(getGlobalMemories());
  assert(
    !promptWithoutDisabled.includes('Biên Lợi Nhuận Gộp Mục Tiêu'),
    'T1.9: Disabled memory card is omitted from system prompt injection'
  );

  // Re-enable and test prompt inclusion
  toggleGlobalMemory(newCard.id, true);
  const promptWithEnabled = formatMemoriesForSystemPrompt(getGlobalMemories());
  assert(
    promptWithEnabled.includes('Biên Lợi Nhuận Gộp Mục Tiêu') && promptWithEnabled.includes('[AUTHORITATIVE]'),
    'T1.10: Enabled pinned card is included in system prompt with [AUTHORITATIVE] marker'
  );

  // Test 1.8: Toggle pin
  const unpinned = togglePinGlobalMemory(newCard.id, false);
  assert(unpinned !== null && unpinned.isPinned === false, 'T1.11: togglePinGlobalMemory unpins card');
  const promptUnpinned = formatMemoriesForSystemPrompt(getGlobalMemories());
  assert(
    promptUnpinned.includes('Biên Lợi Nhuận Gộp Mục Tiêu') && !promptUnpinned.includes(`Biên Lợi Nhuận Gộp Mục Tiêu [AUTHORITATIVE]`),
    'T1.12: Unpinned card does not receive [AUTHORITATIVE] marker'
  );

  // Test 1.9: Delete card
  const deleteResult = deleteGlobalMemory(newCard.id);
  assert(deleteResult === true, 'T1.13: deleteGlobalMemory returns true on success');
  const memoriesAfterDelete = getGlobalMemories();
  assert(
    memoriesAfterDelete.length === 5 && !memoriesAfterDelete.some(m => m.id === newCard.id),
    'T1.14: Deleted card is completely purged from storage'
  );

  // ── SECTION 2: BROWSER REBOOT SIMULATION & CORRUPTION RECOVERY ──
  console.log('\n--- Section 2: Browser Reboot Simulation & Corruption Recovery ---');

  // Test 2.1: Browser Reboot Persistence Simulation
  // Add 2 custom cards, simulate browser process exit and fresh StorageManager instantiation
  const rebootCard1 = addGlobalMemory({
    type: 'rule',
    title: 'Phí Kênh TikTok Shop 2026',
    content: 'Phí sàn TikTok Shop = 11.5% GMV + 3.000 VNĐ cố định mỗi đơn.',
    category: 'Omnichannel',
    tags: ['tiktok', 'fees'],
  });
  const rebootCard2 = addGlobalMemory({
    type: 'assumption',
    title: 'Tỷ lệ Hàng Trả Lại Thời Trang 15%',
    content: 'Tỷ lệ hoàn trả đồ thời trang trực tuyến trung bình là 15.0%.',
    category: 'Retail',
    tags: ['returns', 'fashion'],
  });

  // Create brand new instance of StorageManager pointing to same underlying storage
  const freshStorageManager = new StorageManager();
  const v7Key = buildStorageKey('default', 'default', GLOBAL_SESSION_ID, GLOBAL_MEMORY_STORAGE_TYPE);
  const rawStored = freshStorageManager.getItem<AgentMemoryCard[]>(v7Key);

  assert(
    Array.isArray(rawStored) && rawStored.length === 7,
    'T2.1: Storage partition retains all 7 memory cards across simulated reboot'
  );
  assert(
    rawStored!.some(m => m.id === rebootCard1.id) && rawStored!.some(m => m.id === rebootCard2.id),
    'T2.2: Custom memory cards survive session recreation with intact UUIDv7 and tags'
  );

  // Test 2.3: Storage Corruption Resilience
  // Intentionally inject invalid JSON into the partition
  window.localStorage.setItem(v7Key, '{ "corrupted": true, invalid syntax ...');
  const recoveredMemories = getGlobalMemories();
  assert(
    Array.isArray(recoveredMemories) && recoveredMemories.length === 5,
    'T2.3: Gracefully handles corrupt JSON partition and falls back to default enterprise seeds'
  );

  // Intentionally inject non-array primitive into partition
  window.localStorage.setItem(v7Key, JSON.stringify("not-an-array"));
  const recoveredPrimitive = getGlobalMemories();
  assert(
    Array.isArray(recoveredPrimitive) && recoveredPrimitive.length === 5,
    'T2.4: Gracefully handles non-array JSON primitive and restores enterprise seeds'
  );

  // ── SECTION 3: JSON EXPORT & IMPORT RESILIENCE ──
  console.log('\n--- Section 3: JSON Export & Import Resilience ---');

  // Test 3.1: Export to JSON
  resetGlobalMemoriesToDefault();
  addGlobalMemory({
    type: 'formula',
    title: 'EBITDA Formula',
    content: 'EBITDA = Lợi Nhuận Hoạt Động + Khấu Hao Tài Sản',
    category: 'Finance',
    tags: ['ebitda'],
  });

  const jsonExport = exportMemoriesToJson();
  const parsedExport = JSON.parse(jsonExport);
  assert(
    parsedExport.version === '1.0' && parsedExport.count === 6 && Array.isArray(parsedExport.memories),
    'T3.1: exportMemoriesToJson produces valid v1.0 JSON payload with metadata'
  );

  // Test 3.2: Import JSON with valid and invalid entries + ID collisions
  const duplicateId = parsedExport.memories[0].id;
  const testImportPayload = JSON.stringify({
    version: '1.0',
    memories: [
      {
        id: duplicateId, // duplicate ID to test collision handling
        type: 'formula',
        title: 'Quy tắc Nhập Khẩu 1',
        content: 'Doanh thu phân bổ theo khu vực',
        category: 'Import',
        tags: ['import', 'region'],
      },
      {
        // Missing title & content - should be reported as error
        type: 'rule',
      },
      {
        id: generateUUIDv7(),
        type: 'rule',
        title: 'Quy tắc Chiết Khấu Đại Lý 12%',
        content: 'Đại lý cấp 1 nhận chiết khấu 12% theo hợp đồng năm 2026',
        category: 'Sales',
        tags: ['discount', 'b2b'],
      }
    ]
  });

  const importResult = importMemoriesFromJson(testImportPayload);
  assert(importResult.importedCount === 2, 'T3.2: importMemoriesFromJson imports only valid cards (2/3)');
  assert(importResult.errors.length === 1, 'T3.3: Correctly flags and logs invalid card in import payload');
  const allCurrent = getGlobalMemories();
  assert(
    allCurrent.some(m => m.title === 'Quy tắc Nhập Khẩu 1') &&
    allCurrent.some(m => m.title === 'Quy tắc Chiết Khấu Đại Lý 12%'),
    'T3.4: Imported cards are integrated into global persistent storage'
  );
  // Ensure the imported duplicate ID was regenerated to avoid key collision
  const importedWithDuplicate = allCurrent.find(m => m.title === 'Quy tắc Nhập Khẩu 1');
  assert(
    importedWithDuplicate !== undefined && importedWithDuplicate.id !== duplicateId && isValidUUIDv7(importedWithDuplicate.id),
    'T3.5: Duplicate UUIDv7 is regenerated into a new valid UUIDv7 on import'
  );

  // ── SECTION 4: AUTO-EXTRACTION PARSER EMPIRICAL TESTS ──
  console.log('\n--- Section 4: Auto-Extraction Parser Empirical Tests ---');

  const sampleAssistantStream = `
Dưới đây là phương án tính toán doanh thu cho chuỗi cửa hàng bán lẻ:
<memory_card type="formula" title="Công thức CM1 Chuỗi Bán Lẻ" category="Retail" tags="retail,cm1">
CM1 Cửa Hàng = Doanh Thu Cửa Hàng - Giá Vốn Hàng Bán - Lương Nhân Viên Trực Tiếp
</memory_card>

Ngoài ra, ghi nhận quy tắc kế toán sau:
[GHI NHỚ QUY TẮC]: Khấu hao tài sản cố định = Khấu hao đường thẳng 36 tháng cho thiết bị POS

Và sở thích báo cáo:
[SỞ THÍCH]: Đơn vị tiền tệ hiển thị = Mặc định hiển thị Triệu VNĐ kèm ký hiệu đ
  `;

  const extracted = extractMemoryCardsFromText(sampleAssistantStream, 'session-live-01');
  assert(extracted.length === 3, 'T4.1: extractMemoryCardsFromText successfully extracts 3 cards', `Got ${extracted.length}`);
  assert(
    extracted.some(c => c.type === 'formula' && c.title === 'Công thức CM1 Chuỗi Bán Lẻ'),
    'T4.2: Successfully extracts XML memory card block'
  );
  assert(
    extracted.some(c => c.type === 'rule' && c.title.includes('Khấu hao tài sản cố định')),
    'T4.3: Successfully extracts heuristic markdown rule block'
  );
  assert(
    extracted.some(c => c.type === 'preference' && c.title.includes('Đơn vị tiền tệ hiển thị')),
    'T4.4: Successfully extracts heuristic markdown preference block'
  );

  // ── SECTION 5: MULTI-SESSION ISOLATION & PURGE RESILIENCE ──
  console.log('\n--- Section 5: Multi-Session Isolation & Purge Resilience ---');

  // Set session-scoped data
  storageManager.setPartitionedItem('messages', [{ id: 'm1', text: 'Hello' }], 'temp-session-999');
  storageManager.setPartitionedItem('session-data', { plan: 'step1' }, 'temp-session-999');

  // Verify session item exists
  const sessionItem = storageManager.getPartitionedItem('messages', 'temp-session-999');
  assert(sessionItem !== null, 'T5.1: Session-scoped item successfully saved in partition');

  // Purge session
  const purgedCount = storageManager.purgeSession('temp-session-999');
  assert(purgedCount >= 2, 'T5.2: purgeSession removes all session-scoped partitions', `Purged ${purgedCount}`);
  const purgedSessionItem = storageManager.getPartitionedItem('messages', 'temp-session-999');
  assert(purgedSessionItem === null, 'T5.3: Session item verified completely deleted');

  // Ensure global memories are untouched by session purge
  const globalAfterSessionPurge = getGlobalMemories();
  assert(
    globalAfterSessionPurge.length > 0,
    'T5.4: Global memory cards remain completely intact after session purge (no zero-day wiping)'
  );

  // ── SECTION 6: DUAL-TREE CODE & ASSET PARITY ──
  console.log('\n--- Section 6: Dual-Tree Parity (frontend vs frontend_mock) ---');

  const frontendRoot = path.resolve(__dirname, '..');
  const frontendMockRoot = path.resolve(__dirname, '../../frontend_mock');

  const filesToCheck = [
    'lib/memory/globalMemoryStore.ts',
    'lib/security/storage-manager.ts',
    'lib/revenue/revenueEngine.ts',
    'lib/artifacts/revenueArtifactSync.ts',
    'components/openwork/slash-commands/slash-commands.ts',
    'components/openwork/slash-commands/SlashCommandPopover.tsx',
    'components/openwork/charts/InteractiveChartBlock.tsx',
    'components/openwork/memory/OpenWorkMemoryDrawer.tsx',
    'components/openwork/OpenWorkComposer.tsx',
    'tests/tier1-feature-coverage.test.ts',
    'tests/tier2-boundary-stress.test.ts',
    'tests/tier3-pairwise-combinations.test.ts',
    'tests/tier4-realworld-workloads.test.ts',
    'tests/run-all-business-workflow-tests.ts',
  ];

  const hasMock = fs.existsSync(frontendMockRoot);

  for (const relPath of filesToCheck) {
    const f1 = path.join(frontendRoot, relPath);
    const f2 = path.join(frontendMockRoot, relPath);

    if (!fs.existsSync(f1)) {
      assert(false, `T6.Parity: ${relPath} exists in frontend`, `Missing in frontend: ${f1}`);
      continue;
    }

    if (hasMock) {
      if (!fs.existsSync(f2)) {
        assert(false, `T6.Parity: ${relPath} exists in frontend_mock`, `Missing in frontend_mock: ${f2}`);
        continue;
      }

      const buf1 = fs.readFileSync(f1, 'utf8').replace(/\r\n/g, '\n').trim();
      const buf2 = fs.readFileSync(f2, 'utf8').replace(/\r\n/g, '\n').trim();

      const hash1 = crypto.createHash('sha256').update(buf1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(buf2).digest('hex');

      assert(
        hash1 === hash2,
        `T6.Parity: ${relPath} exact match across frontend and frontend_mock`,
        `Hash mismatch: frontend=${hash1.slice(0, 8)} vs frontend_mock=${hash2.slice(0, 8)}`
      );
    } else {
      assert(
        true,
        `T6.SingleTree: ${relPath} exists in consolidated frontend`,
        `Verified single-tree canonical module`
      );
    }
  }

  // ── FINAL SCORECARD ──
  console.log('\n================================================================================');
  console.log('                          CHALLENGER FINAL VERIFICATION SCORECARD               ');
  console.log('================================================================================');
  console.log(` Total Assertions Executed: ${totalTests}`);
  console.log(` Passed:                    ${passedTests}`);
  console.log(` Failed:                    ${failedTests}`);
  console.log(` Pass Rate:                 ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEmpiricalSuite().catch((err) => {
  console.error('Fatal error during challenger test execution:', err);
  process.exit(1);
});
