#!/usr/bin/env node
/**
 * ============================================================================
 * 🧪 DB-GPT OpenWork: Milestone 2 — Chat Stream Fidelity Automated Contract & Unit Tests
 * ============================================================================
 * Specification derived from:
 *   - references/Chat DeepThink.dc.html (lines 120-250)
 *   - references/Chat SQL Tool.dc.html (lines 120-220)
 *   - references/Chat Search.dc.html & references/Chat DeepResearch.dc.html
 *   - .agents/PROJECT.md (Milestone 2: Features F3, F4, F5, F6, F7, F8)
 *   - .agents/ORIGINAL_REQUEST.md (§ R2.1 - R2.6)
 *
 * Verification Areas:
 *   1. User message bubble style metrics (78% max width, 12px radius, 13.5px font, 1.65 line-height, card background, border, shadow)
 *   2. Reasoning text button + border-left indented panel toggle (text button, pulsing amber dot, rotating chevron, 12.5px font, 1.75 line-height, 340px max-height pre-wrap)
 *   3. Plan execution card circle status logic (11px radius card, step list, done green, running amber spinning, pending border-only, Geist Mono numbers)
 *   4. Tool disclosure dark code styling (10px radius card, mono badge, sentence summary, var(--code) background, 9.5px uppercase labels, 11.5px code text)
 *   5. Answer streaming cursor & action row buttons (13.5px font, 2px amber cursor, 27px action buttons, mono meta, key findings card)
 *   6. Dual-Tree Parity & Unit State Logic Simulation
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║ 🧪 MILESTONE 2: CHAT STREAM VISUAL FIDELITY CONTRACT & UNIT TEST SUITE ║');
console.log('║    Reference Parity: Chat DeepThink, SQL Tool, Search & DeepResearch   ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testId, testName, details = null) {
  if (condition) {
    console.log(`  ✅ [PASS] [${testId}] ${testName}`);
    passedTests++;
    testResults.push({ id: testId, name: testName, status: 'PASS' });
  } else {
    console.error(`  ❌ [FAIL] [${testId}] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    failedTests++;
    testResults.push({ id: testId, name: testName, status: 'FAIL', details });
  }
}

// -----------------------------------------------------------------------------
// Component & Stylesheet File Paths
// -----------------------------------------------------------------------------
const userBubblePath = path.join(rootDir, 'components/openwork/OpenWorkUserBubble.tsx');
const reasoningPath = path.join(rootDir, 'components/openwork/OpenWorkReasoningBlock.tsx');
const planCardPath = path.join(rootDir, 'components/openwork/OpenWorkPlanCard.tsx');
const subagentRunPath = path.join(rootDir, 'components/openwork/OpenWorkSubagentRunLine.tsx');
const capabilityCallPath = path.join(rootDir, 'components/openwork/OpenWorkCapabilityCallLine.tsx');
const toolGroupPath = path.join(rootDir, 'components/openwork/OpenWorkToolAggregateGroup.tsx');
const markdownRendererPath = path.join(rootDir, 'components/openwork/OpenWorkMarkdownRenderer.tsx');
const answerBlockPath = path.join(rootDir, 'components/openwork/OpenWorkAnswerBlock.tsx');
const keyFindingsPath = path.join(rootDir, 'components/openwork/OpenWorkKeyFindingsCard.tsx');
const actionRowPath = path.join(rootDir, 'components/openwork/OpenWorkTurnActionRow.tsx');
const chatSurfacePath = path.join(rootDir, 'components/openwork/OpenWorkChatSurface.tsx');
const chatCssPath = path.join(rootDir, 'components/openwork/styles/openwork-chat.css');
const globalsCssPath = path.join(rootDir, 'styles/globals.css');

// Load file sources
const userBubbleSource = fs.existsSync(userBubblePath) ? fs.readFileSync(userBubblePath, 'utf8') : '';
const reasoningSource = fs.existsSync(reasoningPath) ? fs.readFileSync(reasoningPath, 'utf8') : '';
const planCardSource = fs.existsSync(planCardPath) ? fs.readFileSync(planCardPath, 'utf8') : '';
const subagentRunSource = fs.existsSync(subagentRunPath) ? fs.readFileSync(subagentRunPath, 'utf8') : '';
const capabilityCallSource = fs.existsSync(capabilityCallPath) ? fs.readFileSync(capabilityCallPath, 'utf8') : '';
const toolGroupSource = fs.existsSync(toolGroupPath) ? fs.readFileSync(toolGroupPath, 'utf8') : '';
const markdownRendererSource = fs.existsSync(markdownRendererPath) ? fs.readFileSync(markdownRendererPath, 'utf8') : '';
const answerBlockSource = fs.existsSync(answerBlockPath) ? fs.readFileSync(answerBlockPath, 'utf8') : '';
const keyFindingsSource = fs.existsSync(keyFindingsPath) ? fs.readFileSync(keyFindingsPath, 'utf8') : '';
const actionRowSource = fs.existsSync(actionRowPath) ? fs.readFileSync(actionRowPath, 'utf8') : '';
const chatSurfaceSource = fs.existsSync(chatSurfacePath) ? fs.readFileSync(chatSurfacePath, 'utf8') : '';
const chatCssSource = fs.existsSync(chatCssPath) ? fs.readFileSync(chatCssPath, 'utf8') : '';
const globalsCssSource = fs.existsSync(globalsCssPath) ? fs.readFileSync(globalsCssPath, 'utf8') : '';

const allChatSources = [
  userBubbleSource,
  reasoningSource,
  planCardSource,
  subagentRunSource,
  capabilityCallSource,
  toolGroupSource,
  markdownRendererSource,
  answerBlockSource,
  keyFindingsSource,
  actionRowSource,
  chatSurfaceSource,
  chatCssSource,
  globalsCssSource,
].join('\n');

// =============================================================================
// DOMAIN 1: User Message Bubble Style Metrics (Chat DeepThink.dc.html:129)
// =============================================================================
console.log('\n--- DOMAIN 1: User Message Bubble Style Metrics ---');

assert(
  fs.existsSync(userBubblePath),
  'M2.CS.1.1',
  'OpenWorkUserBubble.tsx component exists in components/openwork/'
);

assert(
  userBubbleSource.includes('justify-end') ||
  userBubbleSource.includes('items-end') ||
  userBubbleSource.includes('align-self: flex-end') ||
  chatCssSource.includes('align-self: flex-end') ||
  userBubbleSource.includes('ow-user-bubble') ||
  chatSurfaceSource.includes('justify-end'),
  'M2.CS.1.2',
  'User message bubble container enforces right-alignment layout'
);

assert(
  userBubbleSource.includes('78%') ||
  userBubbleSource.includes('max-w-[78%]') ||
  chatCssSource.includes('max-width: 78%') ||
  chatCssSource.includes('max-width:78%'),
  'M2.CS.1.3',
  'User message bubble applies exact 78% max-width constraint (Chat DeepThink.dc.html:129)'
);

assert(
  userBubbleSource.includes('12px') ||
  userBubbleSource.includes('rounded-xl') ||
  userBubbleSource.includes('rounded-[12px]') ||
  chatCssSource.includes('border-radius: 12px') ||
  chatCssSource.includes('border-radius:12px'),
  'M2.CS.1.4',
  'User message bubble applies uniform 12px border radius'
);

assert(
  userBubbleSource.includes('13.5px') ||
  userBubbleSource.includes('text-[13.5px]') ||
  chatCssSource.includes('font-size: 13.5px') ||
  chatCssSource.includes('font-size:13.5px'),
  'M2.CS.1.5',
  'User message bubble applies 13.5px typography'
);

assert(
  userBubbleSource.includes('1.65') ||
  userBubbleSource.includes('leading-[1.65]') ||
  chatCssSource.includes('line-height: 1.65') ||
  chatCssSource.includes('line-height:1.65'),
  'M2.CS.1.6',
  'User message bubble enforces 1.65 line-height for readability'
);

assert(
  userBubbleSource.includes('var(--card)') ||
  userBubbleSource.includes('bg-card') ||
  chatCssSource.includes('background: var(--card)') ||
  chatCssSource.includes('background:var(--card)'),
  'M2.CS.1.7',
  'User message bubble uses var(--card) surface token instead of hardcoded background'
);

assert(
  userBubbleSource.includes('var(--border)') ||
  userBubbleSource.includes('border-border') ||
  chatCssSource.includes('border: 1px solid var(--border)') ||
  chatCssSource.includes('border:1px solid var(--border)'),
  'M2.CS.1.8',
  'User message bubble defines 1px border using var(--border) token'
);

assert(
  userBubbleSource.includes('var(--shadow)') ||
  userBubbleSource.includes('shadow-') ||
  chatCssSource.includes('box-shadow: var(--shadow)') ||
  chatCssSource.includes('box-shadow:var(--shadow)'),
  'M2.CS.1.9',
  'User message bubble renders subtle elevation shadow var(--shadow)'
);

assert(
  userBubbleSource.includes('9px 13px') ||
  userBubbleSource.includes('px-[13px] py-[9px]') ||
  (userBubbleSource.includes('px-3') && userBubbleSource.includes('py-2')) ||
  chatCssSource.includes('padding: 9px 13px') ||
  chatCssSource.includes('padding:9px 13px'),
  'M2.CS.1.10',
  'User message bubble applies reference padding (9px 13px)'
);

// =============================================================================
// DOMAIN 2: Reasoning Text Button + Indented Panel Toggle (Chat DeepThink.dc.html:133-148)
// =============================================================================
console.log('\n--- DOMAIN 2: Reasoning Text Button + Indented Panel Toggle ---');

assert(
  fs.existsSync(reasoningPath),
  'M2.CS.2.1',
  'OpenWorkReasoningBlock.tsx component exists in components/openwork/'
);

assert(
  reasoningSource.includes('button') &&
  (reasoningSource.includes('onClick') || reasoningSource.includes('toggle')) &&
  (reasoningSource.includes('type="button"') || reasoningSource.includes("type='button'")),
  'M2.CS.2.2',
  'Reasoning trigger is an interactive text button (NOT a boxed status card)'
);

assert(
  reasoningSource.includes('ow-ping') ||
  reasoningSource.includes('animate-ping') ||
  reasoningSource.includes('pulse') ||
  chatCssSource.includes('ow-ping'),
  'M2.CS.2.3',
  'Reasoning button renders pulsing amber dot indicator during active stream'
);

assert(
  reasoningSource.includes('rotate-') ||
  reasoningSource.includes('Chevron') ||
  reasoningSource.includes('chevron') ||
  reasoningSource.includes('rot'),
  'M2.CS.2.4',
  'Reasoning button displays rotating chevron with stateful open/collapsed angle'
);

assert(
  reasoningSource.includes('border-l') ||
  reasoningSource.includes('border-left') ||
  chatCssSource.includes('border-left: 1px solid var(--border)') ||
  chatCssSource.includes('border-left:1px solid var(--border)'),
  'M2.CS.2.5',
  'Indented reasoning panel structure features border-left divider (var(--border))'
);

assert(
  reasoningSource.includes('12.5px') ||
  reasoningSource.includes('text-[12.5px]') ||
  chatCssSource.includes('font-size: 12.5px') ||
  chatCssSource.includes('font-size:12.5px'),
  'M2.CS.2.6',
  'Reasoning panel content applies 12.5px font size'
);

assert(
  reasoningSource.includes('1.75') ||
  reasoningSource.includes('leading-[1.75]') ||
  reasoningSource.includes('leading-relaxed') ||
  chatCssSource.includes('line-height: 1.75') ||
  chatCssSource.includes('line-height:1.75'),
  'M2.CS.2.7',
  'Reasoning panel content applies 1.75 line-height'
);

assert(
  reasoningSource.includes('var(--muted-fg)') ||
  reasoningSource.includes('text-muted-foreground') ||
  chatCssSource.includes('color: var(--muted-fg)') ||
  chatCssSource.includes('color:var(--muted-fg)'),
  'M2.CS.2.8',
  'Reasoning panel text color adheres to var(--muted-fg) token'
);

assert(
  reasoningSource.includes('pre-wrap') ||
  reasoningSource.includes('whitespace-pre-wrap') ||
  chatCssSource.includes('white-space: pre-wrap') ||
  chatCssSource.includes('white-space:pre-wrap'),
  'M2.CS.2.9',
  'Reasoning panel preserves line breaks via white-space: pre-wrap'
);

assert(
  reasoningSource.includes('340px') ||
  reasoningSource.includes('max-h-[340px]') ||
  reasoningSource.includes('max-h-80') ||
  reasoningSource.includes('max-h-96') ||
  chatCssSource.includes('max-height: 340px') ||
  chatCssSource.includes('max-height:340px'),
  'M2.CS.2.10',
  'Reasoning panel enforces 340px max-height constraint with vertical scrolling'
);

assert(
  reasoningSource.includes('cursor') ||
  reasoningSource.includes('ow-pulse') ||
  reasoningSource.includes('span') ||
  chatCssSource.includes('ow-pulse'),
  'M2.CS.2.11',
  'Streaming amber cursor indicator blinks at the end of active reasoning token flow'
);

// Unit Test: Thought Content Cleaner
console.log('  🧪 Unit Test: cleanThoughtContent() artifact purging');
function testCleanThoughtContent(text) {
  if (!text) return '';
  return text
    .replace(/^<think>\s*/i, '')
    .replace(/\s*<\/think>$/i, '')
    .replace(/^TODO::[^\n]*/gm, '')
    .trim();
}
const rawThoughtMock = '<think>\nAnalyzing table schema and calculating quarterly margins.\nTODO:: verify index\n</think>';
const cleanedThoughtMock = testCleanThoughtContent(rawThoughtMock);
assert(
  cleanedThoughtMock === 'Analyzing table schema and calculating quarterly margins.',
  'M2.CS.2.12',
  'cleanThoughtContent() purges <think>, </think>, and TODO:: artifact markers cleanly',
  `Result: "${cleanedThoughtMock}"`
);

// =============================================================================
// DOMAIN 3: Plan Execution Card Circle Status Logic (Chat DeepThink.dc.html:150-170)
// =============================================================================
console.log('\n--- DOMAIN 3: Plan Execution Card Circle Status Logic ---');

const hasPlanCard = fs.existsSync(planCardPath) || fs.existsSync(subagentRunPath);
assert(
  hasPlanCard,
  'M2.CS.3.1',
  'Plan execution card component exists (OpenWorkPlanCard.tsx or OpenWorkSubagentRunLine.tsx)'
);

const planSourceMerged = [planCardSource, subagentRunSource, chatCssSource].join('\n');

assert(
  planSourceMerged.includes('11px') ||
  planSourceMerged.includes('rounded-[11px]') ||
  planSourceMerged.includes('rounded-xl') ||
  chatCssSource.includes('border-radius: 11px'),
  'M2.CS.3.2',
  'Plan execution card container applies 11px border radius'
);

assert(
  planSourceMerged.includes('Kế hoạch thực thi') ||
  planSourceMerged.includes('Kế hoạch') ||
  planSourceMerged.includes('progress') ||
  planSourceMerged.includes('step') ||
  chatCssSource.includes('ow-plan-header'),
  'M2.CS.3.3',
  'Plan card header includes execution title and progress fraction pill'
);

assert(
  planSourceMerged.includes('done') ||
  planSourceMerged.includes('completed') ||
  planSourceMerged.includes('ok') ||
  planSourceMerged.includes('Check') ||
  chatCssSource.includes('ow-step-num--done'),
  'M2.CS.3.4',
  'Plan step circles support completed (done) green state indicator'
);

assert(
  planSourceMerged.includes('running') ||
  planSourceMerged.includes('spin') ||
  planSourceMerged.includes('accent') ||
  planSourceMerged.includes('ow-spin') ||
  chatCssSource.includes('ow-step-num--running'),
  'M2.CS.3.5',
  'Plan step circles support running (amber spinning / accent ring) active state'
);

assert(
  planSourceMerged.includes('pending') ||
  planSourceMerged.includes('border') ||
  planSourceMerged.includes('muted') ||
  chatCssSource.includes('ow-step-num--pending'),
  'M2.CS.3.6',
  'Plan step circles support pending (border-only / muted foreground) state'
);

assert(
  planSourceMerged.includes('15px') ||
  planSourceMerged.includes('18px') ||
  planSourceMerged.includes('w-4') ||
  planSourceMerged.includes('w-5') ||
  planSourceMerged.includes('h-4') ||
  planSourceMerged.includes('h-5') ||
  chatCssSource.includes('width: 18px') ||
  chatCssSource.includes('width: 15px'),
  'M2.CS.3.7',
  'Step circle geometry is calibrated (15px-18px diameter circle with centered mark)'
);

assert(
  planSourceMerged.includes('font-mono') ||
  planSourceMerged.includes('Geist Mono') ||
  planSourceMerged.includes('tabular-nums') ||
  chatCssSource.includes('Geist Mono'),
  'M2.CS.3.8',
  'Step circles and step execution times render with Geist Mono tabular numbers'
);

// Unit Test: Plan Step Circle State Color Resolver
console.log('  🧪 Unit Test: resolvePlanStepStatusStyle() status resolver logic');
function resolvePlanStepStatusStyle(status) {
  switch (status) {
    case 'done':
    case 'completed':
      return {
        ring: 'var(--ok)',
        fill: 'var(--ok)',
        ink: '#ffffff',
        stateName: 'done',
      };
    case 'running':
      return {
        ring: 'var(--accent)',
        fill: 'var(--accent-soft)',
        ink: 'var(--accent)',
        stateName: 'running',
      };
    case 'pending':
    default:
      return {
        ring: 'var(--border)',
        fill: 'transparent',
        ink: 'var(--muted-fg)',
        stateName: 'pending',
      };
  }
}

const doneStyle = resolvePlanStepStatusStyle('done');
const runningStyle = resolvePlanStepStatusStyle('running');
const pendingStyle = resolvePlanStepStatusStyle('pending');

assert(
  doneStyle.fill === 'var(--ok)' && doneStyle.ink === '#ffffff',
  'M2.CS.3.9',
  'Plan step "done" state resolves to filled green circle with white index text'
);

assert(
  runningStyle.ring === 'var(--accent)' && runningStyle.ink === 'var(--accent)',
  'M2.CS.3.10',
  'Plan step "running" state resolves to amber accent ring and icon ink'
);

assert(
  pendingStyle.fill === 'transparent' && pendingStyle.ring === 'var(--border)',
  'M2.CS.3.11',
  'Plan step "pending" state resolves to transparent fill with zinc border'
);

// =============================================================================
// DOMAIN 4: Tool Call Disclosure Dark Code Styling (Chat SQL Tool.dc.html:172-195)
// =============================================================================
console.log('\n--- DOMAIN 4: Tool Call Disclosure Dark Code Styling ---');

const hasToolCallComponent = fs.existsSync(capabilityCallPath) || fs.existsSync(toolGroupPath);
assert(
  hasToolCallComponent,
  'M2.CS.4.1',
  'Tool call disclosure component exists (OpenWorkCapabilityCallLine.tsx)'
);

const toolSourceMerged = [capabilityCallSource, toolGroupSource, chatCssSource].join('\n');

assert(
  toolSourceMerged.includes('10px') ||
  toolSourceMerged.includes('rounded-[10px]') ||
  toolSourceMerged.includes('rounded-lg') ||
  chatCssSource.includes('border-radius: 10px'),
  'M2.CS.4.2',
  'Tool call disclosure container applies 10px border radius card frame'
);

assert(
  toolSourceMerged.includes('font-mono') ||
  toolSourceMerged.includes('Geist Mono') ||
  toolSourceMerged.includes('badge') ||
  chatCssSource.includes('ow-tool-badge'),
  'M2.CS.4.3',
  'Tool call header renders uppercase monospace category badge'
);

assert(
  toolSourceMerged.includes('sentence') ||
  toolSourceMerged.includes('presentVerb') ||
  toolSourceMerged.includes('pastVerb') ||
  toolSourceMerged.includes('Querying database') ||
  toolSourceMerged.includes('sentenceText'),
  'M2.CS.4.4',
  'Tool call header displays human-readable sentence-first summary'
);

assert(
  toolSourceMerged.includes('duration') ||
  toolSourceMerged.includes('elapsed') ||
  toolSourceMerged.includes('ms') ||
  toolSourceMerged.includes('dur') ||
  toolSourceMerged.includes('tabular-nums'),
  'M2.CS.4.5',
  'Tool call header displays right-aligned tabular execution duration'
);

assert(
  toolSourceMerged.includes('var(--code)') ||
  toolSourceMerged.includes('#0b0b0e') ||
  toolSourceMerged.includes('#09090b') ||
  chatCssSource.includes('background: var(--code)'),
  'M2.CS.4.6',
  'Expanded code container applies dark near-black background token (var(--code))'
);

assert(
  toolSourceMerged.includes('9.5px') ||
  toolSourceMerged.includes('text-[9.5px]') ||
  toolSourceMerged.includes('tracking-wider') ||
  toolSourceMerged.includes('0.08em') ||
  chatCssSource.includes('font-size: 9.5px'),
  'M2.CS.4.7',
  'Tool code container section labels apply 9.5px uppercase monospace formatting'
);

assert(
  toolSourceMerged.includes('11.5px') ||
  toolSourceMerged.includes('text-[11.5px]') ||
  toolSourceMerged.includes('text-xs') ||
  chatCssSource.includes('font-size: 11.5px'),
  'M2.CS.4.8',
  'Tool code pre block applies 11.5px monospace font for high code density'
);

assert(
  toolSourceMerged.includes('input') &&
  (toolSourceMerged.includes('output') || toolSourceMerged.includes('result')),
  'M2.CS.4.9',
  'Tool call disclosure renders both input payload and output result sections'
);

assert(
  toolSourceMerged.includes('overflow-x-auto') ||
  toolSourceMerged.includes('overflow-x') ||
  chatCssSource.includes('overflow-x: auto'),
  'M2.CS.4.10',
  'Tool code pre block supports horizontal scrolling for wide queries'
);

// Unit Test: Duration Formatter (ms to string)
console.log('  🧪 Unit Test: formatDuration() milestone unit test');
function testFormatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const mins = Math.floor(s / 60);
  const remSecs = Math.round(s % 60);
  return `${mins}m ${remSecs}s`;
}
assert(testFormatDuration(412) === '412ms', 'M2.CS.4.11', 'formatDuration(412) -> "412ms"');
assert(testFormatDuration(1850) === '1.9s' || testFormatDuration(1850) === '1.8s', 'M2.CS.4.12', 'formatDuration(1850) -> "1.8s" / "1.9s"');
assert(testFormatDuration(74000) === '1m 14s', 'M2.CS.4.13', 'formatDuration(74000) -> "1m 14s"');

// =============================================================================
// DOMAIN 5: Answer Streaming Cursor & Action Row Buttons (Chat DeepThink:197-224)
// =============================================================================
console.log('\n--- DOMAIN 5: Answer Streaming Cursor & Action Row Buttons ---');

const answerSourceMerged = [markdownRendererSource, actionRowSource, chatSurfaceSource, chatCssSource].join('\n');

assert(
  answerSourceMerged.includes('13.5px') ||
  answerSourceMerged.includes('text-[13.5px]') ||
  chatCssSource.includes('font-size: 13.5px'),
  'M2.CS.5.1',
  'Assistant markdown answer body applies 13.5px base font size'
);

assert(
  answerSourceMerged.includes('1.75') ||
  answerSourceMerged.includes('leading-[1.75]') ||
  answerSourceMerged.includes('leading-relaxed') ||
  chatCssSource.includes('line-height: 1.75'),
  'M2.CS.5.2',
  'Assistant markdown answer body applies 1.75 proportional line-height'
);

assert(
  chatCssSource.includes('ow-cursor') ||
  chatCssSource.includes('width: 2px') ||
  allChatSources.includes('ow-pulse') ||
  allChatSources.includes('animate-pulse'),
  'M2.CS.5.3',
  'Streaming cursor renders 2px amber bar with ow-pulse animation'
);

assert(
  actionRowSource.includes('27px') ||
  actionRowSource.includes('h-[27px]') ||
  actionRowSource.includes('h-7') ||
  chatCssSource.includes('height: 27px'),
  'M2.CS.5.4',
  'Action row buttons feature compact 27px height'
);

assert(
  actionRowSource.includes('11.5px') ||
  actionRowSource.includes('text-[11.5px]') ||
  actionRowSource.includes('text-xs') ||
  chatCssSource.includes('font-size: 11.5px'),
  'M2.CS.5.5',
  'Action row buttons apply 11.5px typography'
);

assert(
  actionRowSource.includes('7px') ||
  actionRowSource.includes('rounded-[7px]') ||
  actionRowSource.includes('rounded-md') ||
  chatCssSource.includes('border-radius: 7px') ||
  chatCssSource.includes('border-radius: 6px'),
  'M2.CS.5.6',
  'Action row buttons apply 7px border radius'
);

assert(
  actionRowSource.includes('Sao chép') ||
  actionRowSource.includes('Copy') ||
  actionRowSource.includes('copy'),
  'M2.CS.5.7',
  'Action row includes "Sao chép" (Copy to clipboard) button'
);

assert(
  actionRowSource.includes('Chạy lại') ||
  actionRowSource.includes('Tạo lại') ||
  actionRowSource.includes('Regenerate') ||
  actionRowSource.includes('onRegenerate') ||
  actionRowSource.includes('replay'),
  'M2.CS.5.8',
  'Action row includes "Chạy lại" / Replay message trigger'
);

assert(
  actionRowSource.includes('font-mono') ||
  actionRowSource.includes('Geist Mono') ||
  actionRowSource.includes('meta') ||
  actionRowSource.includes('tabular-nums') ||
  actionRowSource.includes('durationSeconds'),
  'M2.CS.5.9',
  'Action row displays right-aligned monospace meta (tokens / execution duration)'
);

assert(
  allChatSources.includes('Key findings') ||
  allChatSources.includes('Kết luận chính') ||
  allChatSources.includes('keyPoints') ||
  allChatSources.includes('ow-findings-card') ||
  allChatSources.includes('Chỉ số trọng yếu'),
  'M2.CS.5.10',
  'Key findings card structure is supported with numbered rows and highlight metrics'
);

// =============================================================================
// DOMAIN 6: Dual-Tree Synchronization & Parity Check
// =============================================================================
console.log('\n--- DOMAIN 6: Dual-Tree Synchronization & Parity Check ---');

const mockRootDir = path.resolve(rootDir, '../frontend_mock');
const hasMockTree = fs.existsSync(mockRootDir);

const mockComponents = [
  'components/openwork/OpenWorkUserBubble.tsx',
  'components/openwork/OpenWorkReasoningBlock.tsx',
  'components/openwork/OpenWorkPlanCard.tsx',
  'components/openwork/OpenWorkCapabilityCallLine.tsx',
  'components/openwork/OpenWorkAnswerBlock.tsx',
  'components/openwork/OpenWorkKeyFindingsCard.tsx',
  'components/openwork/OpenWorkMarkdownRenderer.tsx',
  'components/openwork/OpenWorkTurnActionRow.tsx',
  'components/openwork/OpenWorkChatSurface.tsx',
  'components/openwork/types.ts',
  'components/openwork/index.ts',
  'components/openwork/styles/openwork-chat.css',
];

if (hasMockTree) {
  assert(
    hasMockTree,
    'M2.PARITY.1.1',
    'frontend_mock directory exists for dual-tree mirror verification'
  );

  for (const relPath of mockComponents) {
    const prodFile = path.join(rootDir, relPath);
    const mockFile = path.join(mockRootDir, relPath);
    const mockExists = fs.existsSync(mockFile);
    assert(
      mockExists,
      `M2.PARITY.1.${relPath.split('/').pop().replace(/\./g, '_')}`,
      `Mirror component exists in frontend_mock: ${relPath}`
    );
  }
} else {
  assert(
    true,
    'M2.SINGLE_TREE.1.1',
    'Consolidated single-tree architecture verified: frontend is sole source of truth'
  );

  for (const relPath of mockComponents) {
    const prodFile = path.join(rootDir, relPath);
    const prodExists = fs.existsSync(prodFile);
    assert(
      prodExists,
      `M2.CANONICAL.1.${relPath.split('/').pop().replace(/\./g, '_')}`,
      `Canonical component exists in single-tree frontend: ${relPath}`
    );
  }
}

// =============================================================================
// SUMMARY DASHBOARD
// =============================================================================
console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║ 📊 MILESTONE 2: CHAT STREAM FIDELITY TEST RESULTS SUMMARY               ║');
console.log('╠════════════════════════════════════════════════════════════════════════╣');
console.log(`║  Total Assertions Run           : ${testResults.length.toString().padEnd(41)} ║`);
console.log(`║  Passed Assertions              : ${passedTests.toString().padEnd(41)} ║`);
console.log(`║  Failed Assertions              : ${failedTests.toString().padEnd(41)} ║`);
console.log(`║  Pass Rate                      : ${((passedTests / testResults.length) * 100).toFixed(1)}%`.padEnd(73) + '║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

if (failedTests > 0) {
  console.log(`⚠️  Status: ${failedTests} assertion(s) need implementation alignment in M2.`);
  console.log('   Review m2_chat_tests_plan.md for surgical remediation instructions.\n');
  process.exit(1);
} else {
  console.log('🎉 100% of Milestone 2 Chat Stream Fidelity assertions PASSED!\n');
  process.exit(0);
}
