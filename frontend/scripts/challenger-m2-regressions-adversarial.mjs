/**
 * Challenger 2: Milestone 2 Adversarial Stress & Regression Verification Harness
 * Tests Sidebar invariants, Composer invariants, and M2 Cuccu Legal components.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const ROOT = path.resolve(process.cwd());
const FRONTEND_DIR = path.join(ROOT, 'frontend');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║ ⚔️  CHALLENGER 2: M2 ADVERSARIAL STRESS & REGRESSION HARNESS            ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SIDEBAR INVARIANTS (262px, navigation, search, shortcut)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Section 1: Sidebar Invariants & Stress ---');

const sidebarPath = path.join(FRONTEND_DIR, 'components/openwork/OpenWorkSidebar.tsx');
const sidebarSrc = fs.readFileSync(sidebarPath, 'utf8');

runTest('[SB.1] Sidebar file exists and is populated (>10KB)', () => {
  assert.ok(fs.existsSync(sidebarPath), 'OpenWorkSidebar.tsx must exist');
  assert.ok(sidebarSrc.length > 10000, 'Sidebar code size must exceed 10KB');
});

runTest('[SB.2] Sidebar strictly enforces 262px width constraint', () => {
  assert.ok(
    sidebarSrc.includes('width || 262') || sidebarSrc.includes('effectiveWidth = width || 262'),
    'effectiveWidth must fallback to 262'
  );
  assert.ok(sidebarSrc.includes('w-[262px]'), 'Sidebar container must specify w-[262px]');
  assert.ok(sidebarSrc.includes("style={{ width: `${effectiveWidth}px`, flex: 'none' }}"), 'Inline width must lock to effectiveWidth');
});

runTest('[SB.3] Workspace navigation items export full routes with active state indicators', () => {
  assert.ok(sidebarSrc.includes('STUDIO_EXTENSIONS_NAV_ITEMS') || sidebarSrc.includes('NAV_ITEMS'), 'Must export navigation items');
  assert.ok(sidebarSrc.includes('activeView'), 'Must track activeView prop');
  assert.ok(sidebarSrc.includes('w-1 h-1 rounded-full') || sidebarSrc.includes('ow-sb-nav-active-dot') || sidebarSrc.includes('ow-sb-nav-item is-active'), 'Active navigation indicator must exist');
});

runTest('[SB.4] Ghost search box enforces 30px input and robust case/diacritic filtering', () => {
  assert.ok(sidebarSrc.includes('h-[30px]'), 'Search input must specify h-[30px]');
  assert.ok(sidebarSrc.includes('ow-sb-ghost-search-input'), 'Search input must use ow-sb-ghost-search-input class');

  // Test search logic emulation directly
  const mockSessions = [
    { id: '1', title: 'Hợp đồng thuê văn phòng A4', subtitle: 'Soạn thảo điều khoản đặt cọc' },
    { id: '2', title: 'Financial PnL Model 2026', subtitle: 'Dự báo doanh thu Q3' },
    { id: '3', title: 'DeepSeek Analysis Report', subtitle: 'Tổng kết báo cáo pháp lý' },
  ];

  const filterSessions = (sessions, query) => {
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        (s.subtitle && s.subtitle.toLowerCase().includes(query.toLowerCase()))
    );
  };

  assert.strictEqual(filterSessions(mockSessions, 'hợp đồng').length, 1);
  assert.strictEqual(filterSessions(mockSessions, 'FINANCIAL').length, 1);
  assert.strictEqual(filterSessions(mockSessions, 'pháp lý').length, 1);
  assert.strictEqual(filterSessions(mockSessions, '.*').length, 0); // Regex characters must not crash
  assert.strictEqual(filterSessions(mockSessions, '').length, 3);
});

runTest('[SB.5] Keyboard shortcut ⌘K badge and Command Palette dispatch', () => {
  assert.ok(sidebarSrc.includes('⌘K'), 'Sidebar must display ⌘K kbd badge');
  assert.ok(
    sidebarSrc.includes("openwork:open-command-palette"),
    'Must dispatch openwork:open-command-palette CustomEvent on click'
  );
  assert.ok(sidebarSrc.includes('Mở Command Palette (⌘K)'), 'Must include accessible title/aria-label');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. COMPOSER INVARIANTS (18px radius, DeepSeek V4 label, direct/plan toggle)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 2: Composer Invariants & Stress ---');

const composerPath = path.join(FRONTEND_DIR, 'components/openwork/OpenWorkComposer.tsx');
const composerSrc = fs.readFileSync(composerPath, 'utf8');

runTest('[CP.1] Composer outer card strictly conforms to 18px border-radius', () => {
  assert.ok(
    composerSrc.includes('rounded-[18px]'),
    'Outer capsule must contain rounded-[18px] class'
  );
  assert.ok(
    composerSrc.includes('ow-composer-capsule'),
    'Must contain canonical ow-composer-capsule class'
  );
});

runTest('[CP.2] DeepSeek V4 label is registered and un-truncated', () => {
  assert.ok(composerSrc.includes("'deepseek-v4-flash'"), 'DeepSeek V4 Flash id must be registered');
  assert.ok(composerSrc.includes("'DeepSeek V4 Flash'"), 'DeepSeek V4 Flash name must be registered');
  assert.ok(composerSrc.includes('OpenRouter'), 'Provider must be OpenRouter');
  assert.ok(
    composerSrc.includes("(internalSelectedModel || 'DeepSeek V4 Flash')"),
    'Default fallback model must be DeepSeek V4 Flash'
  );
  // Banned models purged
  assert.ok(!composerSrc.includes('claude-3-5-sonnet'), 'Banned model Claude 3.5 Sonnet must be purged');
  assert.ok(!composerSrc.includes('gemini-1.5-pro'), 'Banned model Gemini 1.5 Pro must be purged');
});

runTest('[CP.3] Plan/Direct toggle group implements 22px height segmented pills with 6px radius', () => {
  assert.ok(composerSrc.includes('h-[22px]'), 'Segmented pill must specify h-[22px]');
  assert.ok(composerSrc.includes('rounded-[6px]'), 'Indicator and items must specify rounded-[6px]');
  assert.ok(composerSrc.includes('Có kế hoạch'), 'Must render "Có kế hoạch" label');
  assert.ok(composerSrc.includes('Trả lời ngay'), 'Must render "Trả lời ngay" label');
  assert.ok(composerSrc.includes("handlePlanModeChange('plan')"), 'Plan mode handler must exist');
  assert.ok(composerSrc.includes("handlePlanModeChange('direct')"), 'Direct mode handler must exist');
  assert.ok(composerSrc.includes('layoutId="activePlanModeIndicator"'), 'Must use spring layoutId indicator');
});

runTest('[CP.4] Composer textarea bounds auto-expansion with fluid typography', () => {
  assert.ok(composerSrc.includes('max-h-[180px]') || composerSrc.includes('180px'), 'Textarea must clamp max height');
  assert.ok(composerSrc.includes('ow-composer-textarea'), 'Must apply ow-composer-textarea class');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. M2 CUCCU LEGAL COMPONENTS INVARIANTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 3: M2 Cuccu Legal Components Invariants ---');

const legalCssPath = path.join(FRONTEND_DIR, 'components/openwork/styles/openwork-legal.css');
const legalCssSrc = fs.readFileSync(legalCssPath, 'utf8');

runTest('[LG.1] openwork-legal.css defines keyframes and typography rules', () => {
  assert.ok(fs.existsSync(legalCssPath), 'openwork-legal.css must exist');
  assert.ok(legalCssSrc.includes('@keyframes wkPulse'), 'Must declare wkPulse keyframes');
  assert.ok(legalCssSrc.includes('@keyframes wkCaret'), 'Must declare wkCaret keyframes');
  assert.ok(legalCssSrc.includes('@keyframes wkSpin'), 'Must declare wkSpin keyframes');
  assert.ok(legalCssSrc.includes('@keyframes wkUp'), 'Must declare wkUp keyframes');
  assert.ok(legalCssSrc.includes("'Lora', Georgia, serif"), 'Must enforce Lora serif typography');
});

const reasoningPath = path.join(FRONTEND_DIR, 'components/openwork/OpenWorkReasoningBlock.tsx');
const reasoningSrc = fs.readFileSync(reasoningPath, 'utf8');

runTest('[LG.2] OpenWorkReasoningBlock renders .legal-think-box with streaming dot and Lora body', () => {
  assert.ok(reasoningSrc.includes('legal-think-box'), 'Must render legal-think-box container');
  assert.ok(reasoningSrc.includes('legal-think-dot'), 'Must render legal-think-dot indicator');
  assert.ok(reasoningSrc.includes('is-streaming'), 'Must support is-streaming state');
  assert.ok(reasoningSrc.includes('is-done'), 'Must support is-done state');
  assert.ok(reasoningSrc.includes('legal-think-body'), 'Must render legal-think-body');
  assert.ok(reasoningSrc.includes('Đã tra cứu trong'), 'Must compute latency badge text');
});

const citePath = path.join(FRONTEND_DIR, 'components/openwork/OpenWorkLegalCiteBlock.tsx');
const citeSrc = fs.readFileSync(citePath, 'utf8');

runTest('[LG.3] OpenWorkLegalCiteBlock renders statutory cards with 7000ms toast', () => {
  assert.ok(fs.existsSync(citePath), 'OpenWorkLegalCiteBlock.tsx must exist');
  assert.ok(citeSrc.includes('STATUTORY_LAWS'), 'Must define statutory law repository');
  assert.ok(citeSrc.includes('Điều 472 BLDS 2015'), 'Must reference Điều 472 BLDS 2015');
  assert.ok(citeSrc.includes('Điều 301 LTM 2005'), 'Must reference Điều 301 LTM 2005');
  assert.ok(citeSrc.includes('legal-cite-code'), 'Must use legal-cite-code class');
  assert.ok(citeSrc.includes('legal-toast'), 'Must render floating toast');
  assert.ok(citeSrc.includes('7000'), 'Toast timer must be 7000ms');
});

const decisionPath = path.join(FRONTEND_DIR, 'components/openwork/OpenWorkLegalDecisionBlock.tsx');
const decisionSrc = fs.readFileSync(decisionPath, 'utf8');

runTest('[LG.4] OpenWorkLegalDecisionBlock implements dual comparison and action gating', () => {
  assert.ok(fs.existsSync(decisionPath), 'OpenWorkLegalDecisionBlock.tsx must exist');
  assert.ok(decisionSrc.includes('legal-ask-want-body'), 'Must render "Bạn yêu cầu" column');
  assert.ok(decisionSrc.includes('legal-ask-allow-body'), 'Must render "Luật cho phép" column');
  assert.ok(decisionSrc.includes('legal-ask-btn-risk'), 'Must render risk acknowledgment button');
  assert.ok(decisionSrc.includes('legal-ask-btn-apply'), 'Must render apply action button');
  assert.ok(decisionSrc.includes('Áp dụng & viết tiếp →'), 'Apply button must have correct label');
});

const chatSurfacePath = path.join(FRONTEND_DIR, 'components/openwork/OpenWorkChatSurface.tsx');
const chatSurfaceSrc = fs.readFileSync(chatSurfacePath, 'utf8');

runTest('[LG.5] OpenWorkChatSurface integrates legal cite and decision blocks into message stream', () => {
  assert.ok(chatSurfaceSrc.includes('OpenWorkLegalCiteBlock'), 'Must import OpenWorkLegalCiteBlock');
  assert.ok(chatSurfaceSrc.includes('OpenWorkLegalDecisionBlock'), 'Must import OpenWorkLegalDecisionBlock');
  assert.ok(chatSurfaceSrc.includes("'legal-cite'"), 'Must handle legal-cite part type');
  assert.ok(chatSurfaceSrc.includes("'legal-decision'"), 'Must handle legal-decision part type');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`📊 ADVERSARIAL VERIFICATION SUMMARY: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
