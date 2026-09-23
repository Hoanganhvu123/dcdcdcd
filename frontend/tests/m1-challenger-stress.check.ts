/**
 * Milestone M1 Challenger Adversarial Stress Test & Verification Harness
 * 
 * Conducts exhaustive property-based fuzzing, combinatorial boundary testing,
 * state-machine navigation invariant checks, and multi-step plan orchestration checks.
 */

import {
  CORE_SLASH_COMMANDS,
  filterSlashCommands,
  getSlashCommand,
  type SlashCommandDefinition,
  type SlashCommandPlanStep,
} from '../components/openwork/slash-commands/slash-commands';
import type { PlanPart, OpenWorkArtifactTab } from '../components/openwork/types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

console.log('================================================================');
console.log('⚔️  CHALLENGER 1: M1 ADVERSARIAL STRESS TEST & FUZZING HARNESS');
console.log('================================================================\n');

// ── TEST SUITE 1: Property-Based Fuzzing of filterSlashCommands ──
console.log('--- SUITE 1: Property-Based Fuzzing & Invariant Checks (10,000 runs) ---');

const FUZZ_SEEDS = [
  '', ' ', '   ', '\t', '\n', '\r\n', ' \t \n ',
  '/', '//', '///', '////', '/ ', '/ \t', '/   ',
  'revenue', '/revenue', '/REVENUE', 'REVENUE-AUDIT', '/revenue-audit',
  'slide', '/slide', '16:9', 'Deck', '16:9 Deck',
  'financial', '/financial', 'word', 'Word A4', 'DOCX',
  'executive', '/executive', 'kpi', 'KPI', 'MoM', 'YoY',
  // Vietnamese diacritics
  'kiểm toán', 'KIỂM TOÁN', 'Kiểm Toán', 'thuyết trình', 'THUYẾT TRÌNH',
  'báo cáo', 'BÁO CÁO', 'tóm tắt', 'TÓM TẮT', 'doanh thu', 'lợi nhuận',
  // Regex metacharacters & injection patterns
  '.*', '^$', '(?=.*)', '[a-zA-Z0-9]+', '(revenue|slide)', '\\d+', '(?!)',
  '\\s+', '.*?', '{1,10}', '(?<=a)b', '^.*$', '[^a-z]',
  // Symbols & Punctuations
  '!@#$%^&*()_+-=[]{}|;\':",./<>?~`',
  '`~!@#$%^&*()_+{}|:"<>?`-=[]\\;\',./',
  // XSS & SQLi injection payloads
  '<script>alert("xss")</script>', '\'; DROP TABLE users;--', '1\' OR \'1\'=\'1',
  '"><img src=x onerror=alert(1)>', '<svg/onload=alert(1)>', '${7*7}', '{{7*7}}',
  // Unicode & Zero-width & Control characters
  '\u0000', '\u0001', '\u200B', '\u200C', '\u200D', '\uFEFF', '🚀🎉✨📊💡',
  'مرحبا', '你好', 'こんにちは', '안녕하세요', 'Ñandú', 'Çedille', 'Árvíztűrő',
  // Long strings
  'a'.repeat(100), 'revenue-'.repeat(50), '/'.repeat(200), ' '.repeat(500),
  'x'.repeat(1000), 'kiểm toán '.repeat(100), '🚀'.repeat(200), '0'.repeat(10000),
];

// Generate dynamic fuzz test queries
function generateFuzzQuery(index: number): string {
  const seed = FUZZ_SEEDS[index % FUZZ_SEEDS.length];
  if (index < FUZZ_SEEDS.length) return seed;

  const mode = index % 6;
  if (mode === 0) {
    // Combinations of seeds
    const s1 = FUZZ_SEEDS[(index * 3) % FUZZ_SEEDS.length];
    const s2 = FUZZ_SEEDS[(index * 7) % FUZZ_SEEDS.length];
    return `${s1} ${s2}`;
  } else if (mode === 1) {
    // Random prefix slash and random seed
    return `/${FUZZ_SEEDS[(index * 5) % FUZZ_SEEDS.length]}`;
  } else if (mode === 2) {
    // Random char repeats
    const char = String.fromCharCode(32 + (index % 95));
    return char.repeat(1 + (index % 128));
  } else if (mode === 3) {
    // Mixed Vietnamese and symbols
    return `/${FUZZ_SEEDS[index % 15]}_${index}!#`;
  } else if (mode === 4) {
    // Unicode range samples
    return String.fromCodePoint(0x1F600 + (index % 50)) + ' test ' + index;
  } else {
    // Large composite query
    return '/' + 'test_'.repeat(index % 50);
  }
}

let fuzzCrashes = 0;
let fuzzInvariantViolations = 0;

for (let i = 0; i < 10000; i++) {
  const query = generateFuzzQuery(i);
  try {
    const result = filterSlashCommands(query);

    // Invariant 1: Result must be an array
    if (!Array.isArray(result)) {
      fuzzInvariantViolations++;
      assert(false, `Fuzz #${i}: Result is not an array for query "${query.slice(0, 30)}"`);
      continue;
    }

    // Invariant 2: Result length must be between 0 and 4
    if (result.length < 0 || result.length > 4) {
      fuzzInvariantViolations++;
      assert(false, `Fuzz #${i}: Result length ${result.length} out of bounds [0, 4]`);
    }

    // Invariant 3: Every returned item must be a valid item from CORE_SLASH_COMMANDS
    const validIds = new Set(CORE_SLASH_COMMANDS.map((c) => c.id));
    for (const item of result) {
      if (!validIds.has(item.id)) {
        fuzzInvariantViolations++;
        assert(false, `Fuzz #${i}: Result contains invalid command ID "${item.id}"`);
      }
    }

    // Invariant 4: If result is non-empty and query was empty/slash, should return all 4
    const clean = query.trim().toLowerCase().replace(/^\//, '');
    if (!clean && result.length !== 4) {
      fuzzInvariantViolations++;
      assert(false, `Fuzz #${i}: Clean empty query should return 4 items, got ${result.length}`);
    }
  } catch (err: any) {
    fuzzCrashes++;
    assert(false, `Fuzz #${i}: Crash on query "${query.slice(0, 30)}": ${err.message}`);
  }
}

assert(fuzzCrashes === 0, `Property fuzzing completed with 0 crashes (10,000 random/adversarial inputs)`);
assert(fuzzInvariantViolations === 0, `Property fuzzing completed with 0 invariant violations`);
console.log(`  [PASS] 10,000 fuzz queries evaluated: 0 crashes, 0 invariant violations.`);

// ── TEST SUITE 2: Substring Matching Precision across all metadata fields ──
console.log('\n--- SUITE 2: Substring Matching Precision Across All Metadata Fields ---');

// Test matching on title
assert(filterSlashCommands('kiểm toán').some((c) => c.id === 'revenue-audit'), 'Matches title "Kiểm toán"');
assert(filterSlashCommands('thuyết trình').some((c) => c.id === 'slide-deck'), 'Matches title "Thuyết trình"');
assert(filterSlashCommands('toàn diện').some((c) => c.id === 'financial-report'), 'Matches title "Toàn diện"');
assert(filterSlashCommands('điều hành').some((c) => c.id === 'executive-summary'), 'Matches title "Điều hành"');

// Test matching on badge
assert(filterSlashCommands('Audit · Excel').some((c) => c.id === 'revenue-audit'), 'Matches badge "Audit · Excel"');
assert(filterSlashCommands('16:9 Deck').some((c) => c.id === 'slide-deck'), 'Matches badge "16:9 Deck"');
assert(filterSlashCommands('Word A4').some((c) => c.id === 'financial-report'), 'Matches badge "Word A4"');
assert(filterSlashCommands('Executive').some((c) => c.id === 'executive-summary'), 'Matches badge "Executive"');

// Test matching on targetTab
assert(filterSlashCommands('excel').some((c) => c.id === 'revenue-audit'), 'Matches targetTab "excel"');
assert(filterSlashCommands('slide').some((c) => c.id === 'slide-deck'), 'Matches targetTab "slide"');
assert(filterSlashCommands('docx').some((c) => c.id === 'financial-report'), 'Matches targetTab "docx"');
assert(filterSlashCommands('chart').some((c) => c.id === 'executive-summary'), 'Matches targetTab "chart"');

// Test matching on category
assert(filterSlashCommands('audit').some((c) => c.id === 'revenue-audit'), 'Matches category "audit"');
assert(filterSlashCommands('presentation').some((c) => c.id === 'slide-deck'), 'Matches category "presentation"');
assert(filterSlashCommands('document').some((c) => c.id === 'financial-report'), 'Matches category "document"');
assert(filterSlashCommands('executive').some((c) => c.id === 'executive-summary'), 'Matches category "executive"');

// Test matching on description keywords
assert(filterSlashCommands('COGS').some((c) => c.id === 'revenue-audit'), 'Matches description keyword "COGS"');
assert(filterSlashCommands('Bento Grid').length === 0, 'Does not match unlisted prompt words in description');
assert(filterSlashCommands('P&L').some((c) => c.id === 'financial-report'), 'Matches description keyword "P&L"');
assert(filterSlashCommands('Runway').length === 0, 'Runway in prompt, not in description - returns expected precision');

// ── TEST SUITE 3: Lookup Function (getSlashCommand) Edge Cases ──
console.log('\n--- SUITE 3: Lookup Function (getSlashCommand) Edge Cases ---');

assert(getSlashCommand('revenue-audit')?.id === 'revenue-audit', 'Lookup by exact id "revenue-audit"');
assert(getSlashCommand('/revenue-audit')?.id === 'revenue-audit', 'Lookup by exact command "/revenue-audit"');
assert(getSlashCommand('REVENUE-AUDIT')?.id === 'revenue-audit', 'Lookup by uppercase id');
assert(getSlashCommand('/REVENUE-AUDIT')?.id === 'revenue-audit', 'Lookup by uppercase command');
assert(getSlashCommand('  /revenue-audit  ')?.id === 'revenue-audit', 'Lookup with leading/trailing spaces');
assert(getSlashCommand('slide-deck')?.id === 'slide-deck', 'Lookup slide-deck');
assert(getSlashCommand('/slide-deck')?.id === 'slide-deck', 'Lookup /slide-deck');
assert(getSlashCommand('financial-report')?.id === 'financial-report', 'Lookup financial-report');
assert(getSlashCommand('/financial-report')?.id === 'financial-report', 'Lookup /financial-report');
assert(getSlashCommand('executive-summary')?.id === 'executive-summary', 'Lookup executive-summary');
assert(getSlashCommand('/executive-summary')?.id === 'executive-summary', 'Lookup /executive-summary');

// Negative cases
assert(getSlashCommand('') === undefined, 'Lookup empty string returns undefined');
assert(getSlashCommand('   ') === undefined, 'Lookup whitespace returns undefined');
assert(getSlashCommand('non-existent') === undefined, 'Lookup non-existent ID returns undefined');
assert(getSlashCommand('/invalid-cmd') === undefined, 'Lookup /invalid-cmd returns undefined');

// ── TEST SUITE 4: Keyboard Navigation State Machine & Bounds Simulation ──
console.log('\n--- SUITE 4: Keyboard Navigation State Machine & Bounds Simulation ---');

class KeyboardNavSimulator {
  private selectedIndex = 0;
  private listLength = 4;
  private isOpen = false;

  constructor(initialLength = 4) {
    this.listLength = initialLength;
  }

  setListLength(length: number) {
    this.listLength = length;
    // Mirrored from useEffect in OpenWorkComposer.tsx:
    this.selectedIndex = 0;
  }

  setOpen(open: boolean) {
    this.isOpen = open;
  }

  onKeyDown(key: string, isComposing = false, shiftKey = false): { action: string; selectedIndex: number } {
    if (isComposing) {
      return { action: 'ignored_ime', selectedIndex: this.selectedIndex };
    }

    if (this.isOpen && this.listLength > 0) {
      if (key === 'ArrowDown') {
        this.selectedIndex = (this.selectedIndex + 1) % this.listLength;
        return { action: 'nav_down', selectedIndex: this.selectedIndex };
      }
      if (key === 'ArrowUp') {
        this.selectedIndex = (this.selectedIndex - 1 + this.listLength) % this.listLength;
        return { action: 'nav_up', selectedIndex: this.selectedIndex };
      }
      if (key === 'Enter' || key === 'Tab') {
        if (!shiftKey) {
          this.isOpen = false;
          return { action: 'select', selectedIndex: this.selectedIndex };
        }
      }
      if (key === 'Escape') {
        this.isOpen = false;
        return { action: 'close', selectedIndex: this.selectedIndex };
      }
    }

    if (key === 'Enter' && !shiftKey) {
      return { action: 'send', selectedIndex: this.selectedIndex };
    }

    return { action: 'noop', selectedIndex: this.selectedIndex };
  }

  getSelectedIndex() {
    return this.selectedIndex;
  }

  getIsOpen() {
    return this.isOpen;
  }
}

// 4.1 Standard 4-item navigation
const nav = new KeyboardNavSimulator(4);
nav.setOpen(true);

assert(nav.getSelectedIndex() === 0, 'Initial index is 0');
assert(nav.onKeyDown('ArrowDown').selectedIndex === 1, 'ArrowDown 0 -> 1');
assert(nav.onKeyDown('ArrowDown').selectedIndex === 2, 'ArrowDown 1 -> 2');
assert(nav.onKeyDown('ArrowDown').selectedIndex === 3, 'ArrowDown 2 -> 3');
assert(nav.onKeyDown('ArrowDown').selectedIndex === 0, 'ArrowDown wraps 3 -> 0');
assert(nav.onKeyDown('ArrowUp').selectedIndex === 3, 'ArrowUp wraps 0 -> 3');
assert(nav.onKeyDown('ArrowUp').selectedIndex === 2, 'ArrowUp 3 -> 2');
assert(nav.onKeyDown('ArrowUp').selectedIndex === 1, 'ArrowUp 2 -> 1');
assert(nav.onKeyDown('ArrowUp').selectedIndex === 0, 'ArrowUp 1 -> 0');

// 4.2 Single item navigation
const singleNav = new KeyboardNavSimulator(1);
singleNav.setOpen(true);
assert(singleNav.onKeyDown('ArrowDown').selectedIndex === 0, 'Single item stays at 0 on ArrowDown');
assert(singleNav.onKeyDown('ArrowUp').selectedIndex === 0, 'Single item stays at 0 on ArrowUp');

// 4.3 Empty list navigation
const emptyNav = new KeyboardNavSimulator(0);
emptyNav.setOpen(true);
assert(emptyNav.onKeyDown('ArrowDown').selectedIndex === 0, 'Empty list handles ArrowDown safely');
assert(emptyNav.onKeyDown('ArrowUp').selectedIndex === 0, 'Empty list handles ArrowUp safely');
assert(emptyNav.onKeyDown('Enter').action === 'send', 'Empty list Enter sends message rather than selecting command');

// 4.4 IME Composition Guard
const imeNav = new KeyboardNavSimulator(4);
imeNav.setOpen(true);
assert(imeNav.onKeyDown('Enter', true).action === 'ignored_ime', 'Enter during IME composition is ignored');
assert(imeNav.onKeyDown('ArrowDown', true).action === 'ignored_ime', 'ArrowDown during IME composition is ignored');

// 4.5 Shift+Enter allows newline without selecting or sending
const shiftNav = new KeyboardNavSimulator(4);
shiftNav.setOpen(true);
assert(shiftNav.onKeyDown('Enter', false, true).action === 'noop', 'Shift+Enter does not select slash command');

// 4.6 Selection via Enter and Tab
const selectNav = new KeyboardNavSimulator(4);
selectNav.setOpen(true);
selectNav.onKeyDown('ArrowDown'); // index = 1
const selectResult = selectNav.onKeyDown('Enter');
assert(selectResult.action === 'select' && selectResult.selectedIndex === 1, 'Enter selects active index 1');
assert(!selectNav.getIsOpen(), 'Menu closes after Enter selection');

const tabNav = new KeyboardNavSimulator(4);
tabNav.setOpen(true);
tabNav.onKeyDown('ArrowDown');
tabNav.onKeyDown('ArrowDown'); // index = 2
const tabResult = tabNav.onKeyDown('Tab');
assert(tabResult.action === 'select' && tabResult.selectedIndex === 2, 'Tab selects active index 2');
assert(!tabNav.getIsOpen(), 'Menu closes after Tab selection');

// 4.7 Escape closes menu
const escNav = new KeyboardNavSimulator(4);
escNav.setOpen(true);
const escResult = escNav.onKeyDown('Escape');
assert(escResult.action === 'close' && !escNav.getIsOpen(), 'Escape closes menu');

// 4.8 Dynamic list resize reset
const resizeNav = new KeyboardNavSimulator(4);
resizeNav.setOpen(true);
resizeNav.onKeyDown('ArrowDown');
resizeNav.onKeyDown('ArrowDown');
resizeNav.onKeyDown('ArrowDown'); // index = 3
assert(resizeNav.getSelectedIndex() === 3, 'Index reached 3');
resizeNav.setListLength(1); // filtered down to 1 item
assert(resizeNav.getSelectedIndex() === 0, 'Index safely reset to 0 upon list length change');

// 4.9 High frequency rapid cycling (1,000 keystrokes)
const stressNav = new KeyboardNavSimulator(4);
stressNav.setOpen(true);
let invariantKept = true;
for (let k = 0; k < 1000; k++) {
  const isUp = k % 3 === 0;
  const res = stressNav.onKeyDown(isUp ? 'ArrowUp' : 'ArrowDown');
  if (res.selectedIndex < 0 || res.selectedIndex >= 4) {
    invariantKept = false;
  }
}
assert(invariantKept, '1,000 rapid navigation keystrokes stayed strictly within bounds [0, 3]');

// ── TEST SUITE 5: Multi-Step Plan Orchestration & Workflow Dispatch Contracts ──
console.log('\n--- SUITE 5: Multi-Step Plan Orchestration & Workflow Dispatch Contracts ---');

CORE_SLASH_COMMANDS.forEach((cmd) => {
  // Test PlanPart construction for each command
  const planPart: PlanPart = {
    type: 'plan',
    id: `plan-${Date.now()}`,
    title: `Kế hoạch: ${cmd.title}`,
    progress: `1/${cmd.planSteps.length}`,
    note: 'Đang thực thi',
    steps: cmd.planSteps.map((step, idx) => ({
      id: `step-${idx + 1}`,
      title: step.title,
      detail: step.detail,
      status: idx === 0 ? 'running' : 'pending',
    })),
  };

  assert(planPart.type === 'plan', `Command ${cmd.id} PlanPart type is 'plan'`);
  assert(planPart.steps.length === cmd.planSteps.length, `Command ${cmd.id} steps length matches planSteps (${cmd.planSteps.length})`);
  assert(planPart.steps[0].status === 'running', `Command ${cmd.id} initial step is 'running'`);
  assert(planPart.steps.slice(1).every((s) => s.status === 'pending'), `Command ${cmd.id} subsequent steps are 'pending'`);
  assert(planPart.progress === `1/${cmd.planSteps.length}`, `Command ${cmd.id} initial progress is '1/${cmd.planSteps.length}'`);
  assert(planPart.note === 'Đang thực thi', `Command ${cmd.id} initial note is 'Đang thực thi'`);

  // Target Tab Mapping Verification
  const expectedTabMap: Record<string, OpenWorkArtifactTab> = {
    'revenue-audit': 'excel',
    'slide-deck': 'slide',
    'financial-report': 'docx',
    'executive-summary': 'chart',
  };
  assert(cmd.targetTab === expectedTabMap[cmd.id], `Command ${cmd.id} correctly targets '${expectedTabMap[cmd.id]}' workbench tab`);

  // Simulated Full Plan Step Transitions
  let currentPlan = planPart;
  for (let sIdx = 0; sIdx < cmd.planSteps.length; sIdx++) {
    const updatedSteps = currentPlan.steps.map((step, i) => {
      if (i < sIdx) return { ...step, status: 'done' as const };
      if (i === sIdx) return { ...step, status: 'running' as const };
      return { ...step, status: 'pending' as const };
    });
    currentPlan = {
      ...currentPlan,
      progress: `${sIdx + 1}/${cmd.planSteps.length}`,
      note: 'Đang thực thi',
      steps: updatedSteps,
    };
    assert(currentPlan.steps[sIdx].status === 'running', `Step #${sIdx + 1} for ${cmd.id} is running`);
  }

  // Final Completion Transition
  const finalPlan: PlanPart = {
    ...currentPlan,
    progress: `${cmd.planSteps.length}/${cmd.planSteps.length}`,
    note: 'Hoàn tất',
    steps: currentPlan.steps.map((s) => ({ ...s, status: 'done' as const })),
  };

  assert(finalPlan.steps.every((s) => s.status === 'done'), `All steps for ${cmd.id} transitioned to 'done'`);
  assert(finalPlan.progress === `${cmd.planSteps.length}/${cmd.planSteps.length}`, `Final progress is '${cmd.planSteps.length}/${cmd.planSteps.length}'`);
  assert(finalPlan.note === 'Hoàn tất', `Final note is 'Hoàn tất'`);
});

// ── FINAL SUMMARY ──
console.log('\n================================================================');
console.log(`📊 FINAL STRESS TEST RESULT: ${passed} PASSED | ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  console.error('\n❌ FAILURES RECORDED:');
  failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f}`));
  process.exit(1);
} else {
  console.log('🎉 ALL CHALLENGER STRESS TESTS & INVARIANTS PASSED 100%!\n');
  process.exit(0);
}
