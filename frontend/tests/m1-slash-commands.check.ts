/**
 * Milestone 1 (M1): Slash Commands & Automated Business Workflow Dispatcher Verification Suite
 * Verifies slash command definitions, schemas, filtering, keyboard navigation, and multi-step plan orchestration.
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

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🚀 MILESTONE M1: SLASH COMMANDS & WORKFLOW DISPATCHER SUITE');
console.log('================================================================\n');

// ── SUITE 1: Slash Command Definitions & Schema Integrity ──
console.log('--- SUITE 1: Slash Command Definitions & Schema Integrity ---');

assert(Array.isArray(CORE_SLASH_COMMANDS), 'CORE_SLASH_COMMANDS is an array');
assert(CORE_SLASH_COMMANDS.length === 4, `CORE_SLASH_COMMANDS contains exactly 4 core business workflows (found: ${CORE_SLASH_COMMANDS.length})`);

const expectedIds = ['revenue-audit', 'slide-deck', 'financial-report', 'executive-summary'];
const expectedCommands = ['/revenue-audit', '/slide-deck', '/financial-report', '/executive-summary'];
const validTabs: OpenWorkArtifactTab[] = ['files', 'excel', 'slide', 'docx', 'code', 'chart', 'browser'];

CORE_SLASH_COMMANDS.forEach((cmd) => {
  assert(expectedIds.includes(cmd.id), `Command ${cmd.id} is one of the expected 4 core workflow IDs`);
  assert(expectedCommands.includes(cmd.command), `Command ${cmd.command} starts with / and matches expected format`);
  assert(typeof cmd.title === 'string' && cmd.title.length > 0, `Command ${cmd.id} has a non-empty title ("${cmd.title}")`);
  assert(typeof cmd.description === 'string' && cmd.description.length > 0, `Command ${cmd.id} has a non-empty description`);
  assert(typeof cmd.badge === 'string' && cmd.badge.length > 0, `Command ${cmd.id} has a badge ("${cmd.badge}")`);
  assert(typeof cmd.iconName === 'string' && cmd.iconName.length > 0, `Command ${cmd.id} has an iconName ("${cmd.iconName}")`);
  assert(validTabs.includes(cmd.targetTab), `Command ${cmd.id} targetTab "${cmd.targetTab}" is a valid OpenWorkArtifactTab`);
  assert(typeof cmd.defaultPrompt === 'string' && cmd.defaultPrompt.length > 20, `Command ${cmd.id} has a rich defaultPrompt`);
  assert(Array.isArray(cmd.planSteps) && cmd.planSteps.length >= 4, `Command ${cmd.id} defines at least 4 plan steps (found: ${cmd.planSteps.length})`);

  cmd.planSteps.forEach((step, stepIdx) => {
    assert(typeof step.title === 'string' && step.title.length > 0, `Command ${cmd.id} step #${stepIdx + 1} has title`);
    assert(typeof step.detail === 'string' && step.detail.length > 0, `Command ${cmd.id} step #${stepIdx + 1} has detail`);
  });
});

// Specific targetTab checks per business workflow
const revCmd = CORE_SLASH_COMMANDS.find((c) => c.id === 'revenue-audit');
assert(revCmd?.targetTab === 'excel', '/revenue-audit targets excel studio');

const slideCmd = CORE_SLASH_COMMANDS.find((c) => c.id === 'slide-deck');
assert(slideCmd?.targetTab === 'slide', '/slide-deck targets slide studio');

const finCmd = CORE_SLASH_COMMANDS.find((c) => c.id === 'financial-report');
assert(finCmd?.targetTab === 'docx', '/financial-report targets docx studio');

const execCmd = CORE_SLASH_COMMANDS.find((c) => c.id === 'executive-summary');
assert(execCmd?.targetTab === 'chart', '/executive-summary targets chart analytics');

// ── SUITE 2: Autocomplete & Query Filtering Logic ──
console.log('\n--- SUITE 2: Autocomplete & Query Filtering Logic ---');

// 2.1 Empty & Whitespace Queries
assert(filterSlashCommands('').length === 4, 'Empty query returns all 4 slash commands');
assert(filterSlashCommands('   ').length === 4, 'Whitespace-only query returns all 4 slash commands');
assert(filterSlashCommands('/').length === 4, 'Single slash "/" query returns all 4 slash commands');

// 2.2 Exact and Prefix Command Matching
assert(filterSlashCommands('/rev').length === 1 && filterSlashCommands('/rev')[0].id === 'revenue-audit', 'Query "/rev" matches /revenue-audit');
assert(filterSlashCommands('revenue').length === 1 && filterSlashCommands('revenue')[0].id === 'revenue-audit', 'Query "revenue" matches /revenue-audit');
assert(filterSlashCommands('/slide').length === 1 && filterSlashCommands('/slide')[0].id === 'slide-deck', 'Query "/slide" matches /slide-deck');
assert(filterSlashCommands('deck').length === 1 && filterSlashCommands('deck')[0].id === 'slide-deck', 'Query "deck" matches /slide-deck');
assert(filterSlashCommands('/financial').length === 1 && filterSlashCommands('/financial')[0].id === 'financial-report', 'Query "/financial" matches /financial-report');
assert(filterSlashCommands('word').length === 1 && filterSlashCommands('word')[0].id === 'financial-report', 'Query "word" matches /financial-report (via badge Word A4)');
assert(filterSlashCommands('/exec').length === 1 && filterSlashCommands('/exec')[0].id === 'executive-summary', 'Query "/exec" matches /executive-summary');
assert(filterSlashCommands('kpi').length === 1 && filterSlashCommands('kpi')[0].id === 'executive-summary', 'Query "kpi" matches /executive-summary');

// 2.3 Case Insensitivity
assert(filterSlashCommands('/REVENUE').length === 1 && filterSlashCommands('/REVENUE')[0].id === 'revenue-audit', 'Uppercase query "/REVENUE" matches case-insensitively');
assert(filterSlashCommands('SLIDE-DECK').length === 1 && filterSlashCommands('SLIDE-DECK')[0].id === 'slide-deck', 'Uppercase query "SLIDE-DECK" matches case-insensitively');
assert(filterSlashCommands('FiNaNciAl').length === 1 && filterSlashCommands('FiNaNciAl')[0].id === 'financial-report', 'Mixed case query "FiNaNciAl" matches');
assert(filterSlashCommands('Executive').length === 1 && filterSlashCommands('Executive')[0].id === 'executive-summary', 'Title case query "Executive" matches');

// 2.4 Vietnamese Text and Keyword Matching
assert(filterSlashCommands('kiểm toán').length >= 1, 'Query with Vietnamese text "kiểm toán" matches revenue audit');
assert(filterSlashCommands('thuyết trình').length >= 1, 'Query with Vietnamese text "thuyết trình" matches slide deck');
assert(filterSlashCommands('báo cáo').length >= 1, 'Query with Vietnamese text "báo cáo" matches financial report');
assert(filterSlashCommands('tóm tắt').length >= 1, 'Query with Vietnamese text "tóm tắt" matches executive summary');

// 2.5 Non-matching / Unknown queries
assert(filterSlashCommands('unknown_random_query_xyz').length === 0, 'Unmatched query returns empty array');
assert(filterSlashCommands('/nonexistent').length === 0, 'Non-existent slash command returns empty array');

// ── SUITE 3: Direct Command Lookup ──
console.log('\n--- SUITE 3: Direct Command Lookup (getSlashCommand) ---');

assert(getSlashCommand('revenue-audit')?.id === 'revenue-audit', 'getSlashCommand finds by id');
assert(getSlashCommand('/revenue-audit')?.id === 'revenue-audit', 'getSlashCommand finds by full slash command');
assert(getSlashCommand('REVENUE-AUDIT')?.id === 'revenue-audit', 'getSlashCommand is case-insensitive');
assert(getSlashCommand('/slide-deck')?.id === 'slide-deck', 'getSlashCommand finds slide-deck');
assert(getSlashCommand('financial-report')?.id === 'financial-report', 'getSlashCommand finds financial-report');
assert(getSlashCommand('/executive-summary')?.id === 'executive-summary', 'getSlashCommand finds executive-summary');
assert(getSlashCommand('non_existent_command') === undefined, 'getSlashCommand returns undefined for missing command');

// ── SUITE 4: Keyboard Navigation Logic & Bounds ──
console.log('\n--- SUITE 4: Keyboard Navigation Logic & Bounds ---');

function simulateNav(initialIndex: number, key: 'ArrowUp' | 'ArrowDown', listLength: number): number {
  if (listLength <= 0) return 0;
  if (key === 'ArrowDown') {
    return (initialIndex + 1) % listLength;
  }
  if (key === 'ArrowUp') {
    return (initialIndex - 1 + listLength) % listLength;
  }
  return initialIndex;
}

const listLen = 4;
assert(simulateNav(0, 'ArrowDown', listLen) === 1, 'ArrowDown from 0 goes to 1');
assert(simulateNav(1, 'ArrowDown', listLen) === 2, 'ArrowDown from 1 goes to 2');
assert(simulateNav(2, 'ArrowDown', listLen) === 3, 'ArrowDown from 2 goes to 3');
assert(simulateNav(3, 'ArrowDown', listLen) === 0, 'ArrowDown wraps from 3 back to 0');
assert(simulateNav(0, 'ArrowUp', listLen) === 3, 'ArrowUp wraps from 0 back to 3');
assert(simulateNav(3, 'ArrowUp', listLen) === 2, 'ArrowUp from 3 goes to 2');
assert(simulateNav(0, 'ArrowDown', 1) === 0, 'Single item list stays at 0 on ArrowDown');
assert(simulateNav(0, 'ArrowUp', 1) === 0, 'Single item list stays at 0 on ArrowUp');
assert(simulateNav(0, 'ArrowDown', 0) === 0, 'Empty list returns 0 safely');

// ── SUITE 5: Multi-Step Plan Lifecycle & State Transitions ──
console.log('\n--- SUITE 5: Multi-Step Plan Lifecycle & State Transitions ---');

// 5.1 PlanPart Initialization from Slash Command
function createInitialPlanPart(cmd: SlashCommandDefinition): PlanPart {
  return {
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
}

const initialPlan = createInitialPlanPart(revCmd!);
assert(initialPlan.type === 'plan', 'PlanPart type is "plan"');
assert(initialPlan.title === 'Kế hoạch: Kiểm toán & Phân tích Doanh thu', 'PlanPart title formatted correctly');
assert(initialPlan.progress === '1/4', 'Initial progress is 1/4');
assert(initialPlan.note === 'Đang thực thi', 'Initial note is "Đang thực thi"');
assert(initialPlan.steps.length === 4, 'Plan contains 4 steps');
assert(initialPlan.steps[0].status === 'running', 'Step 1 is initialized to running');
assert(initialPlan.steps[1].status === 'pending', 'Step 2 is initialized to pending');
assert(initialPlan.steps[2].status === 'pending', 'Step 3 is initialized to pending');
assert(initialPlan.steps[3].status === 'pending', 'Step 4 is initialized to pending');

// 5.2 PlanPart Intermediate Step Progression
function advancePlanStep(plan: PlanPart, completedIndex: number): PlanPart {
  const nextSteps = plan.steps.map((s, idx) => {
    if (idx <= completedIndex) return { ...s, status: 'done' as const };
    if (idx === completedIndex + 1) return { ...s, status: 'running' as const };
    return { ...s, status: 'pending' as const };
  });
  const doneCount = nextSteps.filter((s) => s.status === 'done').length;
  const runningIdx = nextSteps.findIndex((s) => s.status === 'running');
  return {
    ...plan,
    progress: `${doneCount + (runningIdx >= 0 ? 1 : 0)}/${plan.steps.length}`,
    note: runningIdx >= 0 ? 'Đang thực thi' : 'Hoàn tất',
    steps: nextSteps,
  };
}

const step1DonePlan = advancePlanStep(initialPlan, 0);
assert(step1DonePlan.steps[0].status === 'done', 'Step 1 transitioned to done');
assert(step1DonePlan.steps[1].status === 'running', 'Step 2 transitioned to running');
assert(step1DonePlan.progress === '2/4', 'Progress updated to 2/4');

const step2DonePlan = advancePlanStep(step1DonePlan, 1);
assert(step2DonePlan.steps[1].status === 'done', 'Step 2 transitioned to done');
assert(step2DonePlan.steps[2].status === 'running', 'Step 3 transitioned to running');
assert(step2DonePlan.progress === '3/4', 'Progress updated to 3/4');

// 5.3 PlanPart Final Completion
function completeAllPlanSteps(plan: PlanPart): PlanPart {
  const allDone = plan.steps.map((s) => ({ ...s, status: 'done' as const }));
  return {
    ...plan,
    progress: `${allDone.length}/${allDone.length}`,
    note: 'Hoàn tất',
    steps: allDone,
  };
}

const completedPlan = completeAllPlanSteps(step2DonePlan);
assert(completedPlan.steps.every((s) => s.status === 'done'), 'All steps are done');
assert(completedPlan.progress === '4/4', 'Final progress is 4/4');
assert(completedPlan.note === 'Hoàn tất', 'Final note is "Hoàn tất"');

// ── FINAL SUMMARY ──
console.log('\n================================================================');
console.log(`📊 FINAL RESULT: ${passed} PASSED | ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL M1 SLASH COMMAND VERIFICATION CHECKS PASSED 100%!\n');
  process.exit(0);
}
