/**
 * Independent Forensic Auditor Stress Test Suite for Milestone M1
 * Tests edge cases, adversarial inputs, schema invariants, store lifecycle, and UI contract compliance.
 */

import {
  CORE_SLASH_COMMANDS,
  filterSlashCommands,
  getSlashCommand,
  type SlashCommandDefinition,
} from '../components/openwork/slash-commands/slash-commands';
import type { PlanPart, OpenWorkArtifactTab } from '../components/openwork/types';

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function check(assertion: boolean, name: string, details?: string) {
  if (assertion) {
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${name} ${details ? `(${details})` : ''}`);
    failCount++;
    failures.push(`${name} ${details ? `(${details})` : ''}`);
  }
}

console.log('======================================================================');
console.log('🔬 FORENSIC AUDITOR INDEPENDENT ADVERSARIAL STRESS SUITE (M1)');
console.log('======================================================================\n');

// ── TEST 1: Schema Invariant & Anti-Facade Deep Analysis ──
console.log('--- 1. Schema Invariants & Deep Content Authenticity ---');
check(Array.isArray(CORE_SLASH_COMMANDS), 'CORE_SLASH_COMMANDS is valid array');
check(CORE_SLASH_COMMANDS.length === 4, 'Contains exactly 4 core business workflows');

const ids = new Set<string>();
const commands = new Set<string>();
const validTabs: OpenWorkArtifactTab[] = ['files', 'excel', 'slide', 'docx', 'code', 'chart', 'browser'];

for (const cmd of CORE_SLASH_COMMANDS) {
  check(!ids.has(cmd.id), `Workflow ID "${cmd.id}" is unique`);
  ids.add(cmd.id);

  check(!commands.has(cmd.command), `Workflow command "${cmd.command}" is unique`);
  commands.add(cmd.command);

  check(cmd.command.startsWith('/'), `Workflow "${cmd.id}" command starts with "/"`);
  check(validTabs.includes(cmd.targetTab), `Workflow "${cmd.id}" has valid targetTab "${cmd.targetTab}"`);
  check(cmd.title.trim().length > 5, `Workflow "${cmd.id}" title is authentic ("${cmd.title}")`);
  check(cmd.description.trim().length > 15, `Workflow "${cmd.id}" description is authentic`);
  check(cmd.badge.trim().length > 0, `Workflow "${cmd.id}" badge is present`);
  check(cmd.defaultPrompt.trim().length > 30, `Workflow "${cmd.id}" defaultPrompt is rich (>30 chars)`);
  check(Array.isArray(cmd.planSteps) && cmd.planSteps.length === 4, `Workflow "${cmd.id}" defines exactly 4 plan steps`);

  for (let i = 0; i < cmd.planSteps.length; i++) {
    const step = cmd.planSteps[i];
    check(typeof step.title === 'string' && step.title.length > 5, `Workflow "${cmd.id}" step ${i + 1} has authentic title`);
    check(typeof step.detail === 'string' && step.detail.length > 10, `Workflow "${cmd.id}" step ${i + 1} has authentic detail`);
  }
}

// ── TEST 2: Adversarial Autocomplete & Query Filtering ──
console.log('\n--- 2. Adversarial Autocomplete & Query Filtering ---');

// Null, undefined, empty, whitespace
check(filterSlashCommands('').length === 4, 'Empty string returns all 4 commands');
check(filterSlashCommands('   \t\n  ').length === 4, 'Whitespace tabs and newlines returns all 4 commands');
check(filterSlashCommands('/').length === 4, 'Single slash returns all 4 commands');
check(filterSlashCommands('   /   ').length === 4, 'Slash with spaces returns all 4 commands');

// Vietnamese with Upper/Lower diacritics
check(filterSlashCommands('KIỂM TOÁN').some((c) => c.id === 'revenue-audit'), 'Uppercase Vietnamese "KIỂM TOÁN" matches revenue-audit');
check(filterSlashCommands('thuyết trình').some((c) => c.id === 'slide-deck'), 'Lowercase Vietnamese "thuyết trình" matches slide-deck');
check(filterSlashCommands('BÁO CÁO').some((c) => c.id === 'financial-report'), 'Uppercase Vietnamese "BÁO CÁO" matches financial-report');
check(filterSlashCommands('TÓM TẮT').some((c) => c.id === 'executive-summary'), 'Uppercase Vietnamese "TÓM TẮT" matches executive-summary');
check(filterSlashCommands('chiến lược').some((c) => c.id === 'slide-deck'), 'Vietnamese keyword "chiến lược" matches slide-deck');
check(filterSlashCommands('tài chính').some((c) => c.id === 'financial-report'), 'Vietnamese keyword "tài chính" matches financial-report');

// Badge and category matching
check(filterSlashCommands('Excel').some((c) => c.id === 'revenue-audit'), 'Badge query "Excel" matches revenue-audit');
check(filterSlashCommands('16:9').some((c) => c.id === 'slide-deck'), 'Badge query "16:9" matches slide-deck');
check(filterSlashCommands('Word A4').some((c) => c.id === 'financial-report'), 'Badge query "Word A4" matches financial-report');
check(filterSlashCommands('Executive').some((c) => c.id === 'executive-summary'), 'Badge query "Executive" matches executive-summary');

// Target tab matching
check(filterSlashCommands('excel').some((c) => c.id === 'revenue-audit'), 'Tab query "excel" matches');
check(filterSlashCommands('slide').some((c) => c.id === 'slide-deck'), 'Tab query "slide" matches');
check(filterSlashCommands('docx').some((c) => c.id === 'financial-report'), 'Tab query "docx" matches');
check(filterSlashCommands('chart').some((c) => c.id === 'executive-summary'), 'Tab query "chart" matches');

// Special characters, emojis, non-matching
check(filterSlashCommands('@@##$$%%').length === 0, 'Special characters without match returns empty array');
check(filterSlashCommands('🚀🔥💡').length === 0, 'Emojis without match returns empty array');
check(filterSlashCommands('very_long_nonexistent_query_string_12345').length === 0, 'Non-existent string returns empty array');

// ── TEST 3: Direct Lookup (getSlashCommand) Robustness ──
console.log('\n--- 3. Direct Lookup (getSlashCommand) Robustness ---');

check(getSlashCommand('revenue-audit')?.id === 'revenue-audit', 'Lookup by ID "revenue-audit"');
check(getSlashCommand('/revenue-audit')?.id === 'revenue-audit', 'Lookup by "/revenue-audit"');
check(getSlashCommand('   /revenue-audit   ')?.id === 'revenue-audit', 'Lookup with surrounding whitespace');
check(getSlashCommand('/REVENUE-AUDIT')?.id === 'revenue-audit', 'Lookup uppercase with slash');
check(getSlashCommand('SLIDE-DECK')?.id === 'slide-deck', 'Lookup uppercase without slash');
check(getSlashCommand(' financial-report ')?.id === 'financial-report', 'Lookup financial-report with spaces');
check(getSlashCommand('/executive-summary')?.id === 'executive-summary', 'Lookup /executive-summary');
check(getSlashCommand('invalid-cmd') === undefined, 'Lookup invalid returns undefined');
check(getSlashCommand('') === undefined, 'Lookup empty string returns undefined');

// ── TEST 4: Keyboard Navigation Cyclic Wraparound ──
console.log('\n--- 4. Keyboard Navigation Cyclic Wraparound ---');

function navIndex(current: number, direction: 'up' | 'down', total: number): number {
  if (total <= 0) return 0;
  if (direction === 'down') return (current + 1) % total;
  if (direction === 'up') return (current - 1 + total) % total;
  return current;
}

// 4-item list traversal
let idx = 0;
idx = navIndex(idx, 'down', 4); check(idx === 1, 'Index 0 -> Down -> 1');
idx = navIndex(idx, 'down', 4); check(idx === 2, 'Index 1 -> Down -> 2');
idx = navIndex(idx, 'down', 4); check(idx === 3, 'Index 2 -> Down -> 3');
idx = navIndex(idx, 'down', 4); check(idx === 0, 'Index 3 -> Down -> 0 (Wraps)');
idx = navIndex(idx, 'up', 4);   check(idx === 3, 'Index 0 -> Up -> 3 (Wraps)');
idx = navIndex(idx, 'up', 4);   check(idx === 2, 'Index 3 -> Up -> 2');

// 1-item list traversal
check(navIndex(0, 'down', 1) === 0, 'Single item list on Down stays 0');
check(navIndex(0, 'up', 1) === 0, 'Single item list on Up stays 0');

// 0-item list traversal
check(navIndex(0, 'down', 0) === 0, 'Zero item list on Down returns 0');
check(navIndex(0, 'up', 0) === 0, 'Zero item list on Up returns 0');

// ── TEST 5: PlanPart Lifecycle & Immutability Simulation ──
console.log('\n--- 5. PlanPart Lifecycle & Immutability Simulation ---');

for (const cmd of CORE_SLASH_COMMANDS) {
  // Step 1: Initial PlanPart
  const initialPlan: PlanPart = {
    type: 'plan',
    id: `plan-${cmd.id}`,
    title: `Kế hoạch: ${cmd.title}`,
    progress: `1/${cmd.planSteps.length}`,
    note: 'Đang thực thi',
    steps: cmd.planSteps.map((step, sIdx) => ({
      id: `step-${sIdx + 1}`,
      title: step.title,
      detail: step.detail,
      status: sIdx === 0 ? 'running' : 'pending',
    })),
  };

  check(initialPlan.steps.length === 4, `${cmd.id} initial plan has 4 steps`);
  check(initialPlan.steps[0].status === 'running', `${cmd.id} initial step 1 is running`);
  check(initialPlan.steps[1].status === 'pending', `${cmd.id} initial step 2 is pending`);
  check(initialPlan.steps[2].status === 'pending', `${cmd.id} initial step 3 is pending`);
  check(initialPlan.steps[3].status === 'pending', `${cmd.id} initial step 4 is pending`);
  check(initialPlan.progress === '1/4', `${cmd.id} initial progress is "1/4"`);

  // Step 2: Final completion simulation (as done in finally block)
  const allDoneSteps = initialPlan.steps.map((s) => ({
    ...s,
    status: (s.status === 'pending' || s.status === 'running' ? 'done' : s.status) as any,
  }));
  const completedPlan: PlanPart = {
    ...initialPlan,
    progress: `${allDoneSteps.length}/${allDoneSteps.length}`,
    note: 'Hoàn tất',
    steps: allDoneSteps,
  };

  check(completedPlan.progress === '4/4', `${cmd.id} completed progress is "4/4"`);
  check(completedPlan.note === 'Hoàn tất', `${cmd.id} completed note is "Hoàn tất"`);
  check(completedPlan.steps.every((s) => s.status === 'done'), `${cmd.id} all steps status is "done"`);
}

// ── TEST 6: Composer & Slash Detection Logic ──
console.log('\n--- 6. Composer & Slash Detection Logic ---');

function extractSlashQuery(val: string): { isOpen: boolean; query: string } {
  if (val.startsWith('/')) {
    const match = val.match(/^\/([^\s]*)/);
    return { isOpen: true, query: match ? match[1] : val.slice(1) };
  }
  return { isOpen: false, query: '' };
}

check(extractSlashQuery('/revenue').isOpen === true && extractSlashQuery('/revenue').query === 'revenue', 'Detects "/revenue"');
check(extractSlashQuery('/slide-deck some custom prompt').isOpen === true && extractSlashQuery('/slide-deck some custom prompt').query === 'slide-deck', 'Detects "/slide-deck" with following text');
check(extractSlashQuery('/').isOpen === true && extractSlashQuery('/').query === '', 'Detects standalone "/"');
check(extractSlashQuery('hello world /test').isOpen === false, 'Ignores "/" not at start of line');
check(extractSlashQuery('').isOpen === false, 'Empty input does not open slash menu');

// ── FINAL REPORT ──
console.log('\n======================================================================');
console.log(`📊 AUDITOR RESULT: ${passCount} PASSED | ${failCount} FAILED`);
console.log('======================================================================');

if (failCount > 0) {
  console.error(`\n🚨 FAILURES DETECTED (${failCount}):`);
  failures.forEach((f, i) => console.error(`  ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log('\n🏆 ALL FORENSIC AUDITOR CHECKS PASSED WITH ZERO VIOLATIONS!\n');
  process.exit(0);
}
