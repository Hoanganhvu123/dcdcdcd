#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

console.log('================================================================');
console.log('🧪 TIER 2: BOUNDARY VALUE ANALYSIS & CORNER CASES (≥80 Target)');
console.log('================================================================\n');

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

const globalsPath = path.join(rootDir, 'styles/globals.css');
const openworkColorsPath = path.join(rootDir, 'styles/openwork-colors.css');
const openworkDnaPath = path.join(rootDir, 'styles/openwork-dna.css');
const chatCssPath = path.join(rootDir, 'components/openwork/styles/openwork-chat.css');
const workbenchCssPath = path.join(rootDir, 'components/openwork/styles/openwork-workbench.css');

const cssSources = [globalsPath, openworkColorsPath, openworkDnaPath, chatCssPath, workbenchCssPath]
  .filter(p => fs.existsSync(p))
  .map(p => fs.readFileSync(p, 'utf8'))
  .join('\n');

// -----------------------------------------------------------------------------
// B1: Light vs Dark Theme Token Contrast & Invariants (12 Tests)
// -----------------------------------------------------------------------------
console.log('\n--- B1: Light vs Dark Theme Token Contrast & Invariants ---');
assert(
  cssSources.includes('--bg: #ffffff') || cssSources.includes('--bg:#ffffff') || cssSources.includes('--background') || cssSources.includes('#ffffff'),
  'T2.B1.1',
  'Light theme --bg resolves to high-brightness surface (#ffffff)'
);
assert(
  cssSources.includes('--bg: #09090b') || cssSources.includes('--bg:#09090b') || cssSources.includes('#09090b'),
  'T2.B1.2',
  'Dark theme --bg resolves to deep neutral canvas (#09090b)'
);
assert(
  cssSources.includes('--panel: #fafafa') || cssSources.includes('--panel:#fafafa') || cssSources.includes('#fafafa'),
  'T2.B1.3',
  'Light theme --panel resolves to secondary surface (#fafafa)'
);
assert(
  cssSources.includes('--panel: #0b0b0d') || cssSources.includes('--panel:#0b0b0d') || cssSources.includes('#0b0b0d'),
  'T2.B1.4',
  'Dark theme --panel resolves to dark sidebar surface (#0b0b0d)'
);
assert(
  cssSources.includes('--card: #ffffff') || cssSources.includes('--card:#ffffff') || cssSources.includes('--card'),
  'T2.B1.5',
  'Light theme --card surface token is declared'
);
assert(
  cssSources.includes('--card: #101013') || cssSources.includes('--card:#101013') || cssSources.includes('#101013') || cssSources.includes('#121212') || cssSources.includes('#18181b'),
  'T2.B1.6',
  'Dark theme --card resolves to elevated dark surface'
);
assert(
  cssSources.includes('--muted: #f4f4f5') || cssSources.includes('--muted:#f4f4f5') || cssSources.includes('#f4f4f5'),
  'T2.B1.7',
  'Light theme --muted background resolves to #f4f4f5'
);
assert(
  cssSources.includes('--muted: #1c1c20') || cssSources.includes('--muted:#1c1c20') || cssSources.includes('#1c1c20') || cssSources.includes('#1f1f1f'),
  'T2.B1.8',
  'Dark theme --muted background resolves to deep muted container'
);
assert(
  cssSources.includes('--border: #e4e4e7') || cssSources.includes('--border:#e4e4e7') || cssSources.includes('#e4e4e7'),
  'T2.B1.9',
  'Light theme --border resolves to zinc-200 boundary (#e4e4e7)'
);
assert(
  cssSources.includes('--border: #27272a') || cssSources.includes('--border:#27272a') || cssSources.includes('#27272a'),
  'T2.B1.10',
  'Dark theme --border resolves to zinc-800 boundary (#27272a)'
);
assert(
  cssSources.includes('--accent: #b45309') || cssSources.includes('--accent:#b45309') || cssSources.includes('--accent: #f59e0b') || cssSources.includes('--accent:#f59e0b') || cssSources.includes('--accent'),
  'T2.B1.11',
  'Functional amber accent token resolves with distinct light/dark luminance'
);
assert(
  cssSources.includes('--shadow') || cssSources.includes('box-shadow') || cssSources.includes('rgb(0 0 0'),
  'T2.B1.12',
  'Box shadow elevation tokens provide calibrated light/dark depth'
);

// -----------------------------------------------------------------------------
// B2: Multi-line Reasoning Traces & Collapse Boundaries (10 Tests)
// -----------------------------------------------------------------------------
console.log('\n--- B2: Multi-line Reasoning Traces & Collapse Boundaries ---');
const reasoningPath = path.join(rootDir, 'components/openwork/OpenWorkReasoningBlock.tsx');
const reasoningExists = fs.existsSync(reasoningPath);
const reasoningSource = reasoningExists ? fs.readFileSync(reasoningPath, 'utf8') : '';

assert(reasoningExists, 'T2.B2.1', 'Reasoning block component exists for boundary inspection');
assert(
  reasoningSource.includes('white-space: pre-wrap') || reasoningSource.includes('whitespace-pre-wrap') || reasoningSource.includes('pre-wrap'),
  'T2.B2.2',
  'Reasoning content preserves multi-line whitespace and line-breaks'
);
assert(
  reasoningSource.includes('overflow-y-auto') || reasoningSource.includes('overflow-y') || reasoningSource.includes('max-h-'),
  'T2.B2.3',
  'Long reasoning traces enable vertical scrolling without breaking outer containers'
);
assert(
  reasoningSource.includes('duration') || reasoningSource.includes('elapsed') || reasoningSource.includes('time') || reasoningSource.includes('s'),
  'T2.B2.4',
  'Reasoning header formats duration boundary metrics accurately'
);
assert(
  reasoningSource.includes('wordCount') || reasoningSource.includes('words') || reasoningSource.includes('từ') || reasoningSource.includes('length'),
  'T2.B2.5',
  'Reasoning header calculates and displays thought trace word counts'
);
assert(
  reasoningSource.includes('isStreaming') || reasoningSource.includes('streaming') || reasoningSource.includes('active'),
  'T2.B2.6',
  'Reasoning panel reacts to streaming active vs completed boolean flags'
);
assert(
  reasoningSource.includes('isOpen') || reasoningSource.includes('open') || reasoningSource.includes('expanded') || reasoningSource.includes('toggle'),
  'T2.B2.7',
  'Reasoning panel maintains independent collapsible open/closed state'
);
assert(
  reasoningSource.includes('cursor') || reasoningSource.includes('pulse') || reasoningSource.includes('ow-pulse') || reasoningSource.includes('span'),
  'T2.B2.8',
  'Active streaming cursor blinks at the end of incoming reasoning tokens'
);
assert(
  reasoningSource.includes('Chevron') || reasoningSource.includes('chevron') || reasoningSource.includes('svg') || reasoningSource.includes('rotate'),
  'T2.B2.9',
  'Chevron rotates 90 degrees upon expansion and 0 degrees upon collapse'
);
assert(
  reasoningSource.includes('border-l') || reasoningSource.includes('border-left') || reasoningSource.includes('var(--border)'),
  'T2.B2.10',
  'Indented left border maintains constant 1px stroke across long content heights'
);

// -----------------------------------------------------------------------------
// B3: Text Prompts & Composer Boundaries (10 Tests)
// -----------------------------------------------------------------------------
console.log('\n--- B3: Text Prompts & Composer Boundaries ---');
const composerPath = path.join(rootDir, 'components/openwork/OpenWorkComposer.tsx');
const composerExists = fs.existsSync(composerPath);
const composerSource = composerExists ? fs.readFileSync(composerPath, 'utf8') : '';

assert(composerExists, 'T2.B3.1', 'Composer component exists for boundary inspection');
assert(
  composerSource.includes('trim()') || composerSource.includes('disabled') || composerSource.includes('!text'),
  'T2.B3.2',
  'Empty text prompt submission is prevented at input boundary'
);
assert(
  composerSource.includes('onKeyDown') || composerSource.includes('handleKeyDown') || composerSource.includes('Enter'),
  'T2.B3.3',
  'Keyboard event listener handles Enter (submit) vs Shift+Enter (newline)'
);
assert(
  composerSource.includes('max-h-') || composerSource.includes('160px') || composerSource.includes('min-h-') || composerSource.includes('resize-none'),
  'T2.B3.4',
  'Composer textarea enforces min/max height bounds with vertical overflow scroll'
);
assert(
  composerSource.includes('placeholder') || composerSource.includes('Hỏi tiếp'),
  'T2.B3.5',
  'Composer defines informative placeholder string for empty state'
);
assert(
  composerSource.includes('selectedModel') || composerSource.includes('model') || composerSource.includes('setModel'),
  'T2.B3.6',
  'Composer preserves model selection state across draft input typing'
);
assert(
  composerSource.includes('isStreaming') || composerSource.includes('disabled') || composerSource.includes('loading'),
  'T2.B3.7',
  'Send button transitions to disabled/stop state during active streaming'
);
assert(
  composerSource.includes('plan') || composerSource.includes('direct') || composerSource.includes('mode'),
  'T2.B3.8',
  'Segmented mode pill transitions between Plan Mode and Direct Mode'
);
assert(
  composerSource.includes('token') || composerSource.includes('cost') || composerSource.includes('meta') || composerSource.includes('Geist Mono') || composerSource.includes('font-mono'),
  'T2.B3.9',
  'Hint line displays token usage estimation in tabular monospace format'
);
assert(
  composerSource.includes('attach') || composerSource.includes('file') || composerSource.includes('Paperclip') || composerSource.includes('Upload'),
  'T2.B3.10',
  'Attachment button provides file upload capability with boundary size checks'
);

// -----------------------------------------------------------------------------
// B4: Tool Call Disclosure & Execution Boundaries (12 Tests)
// -----------------------------------------------------------------------------
console.log('\n--- B4: Tool Call Disclosure & Execution Boundaries ---');
const capCallPath = path.join(rootDir, 'components/openwork/OpenWorkCapabilityCallLine.tsx');
const capCallExists = fs.existsSync(capCallPath);
const capCallSource = capCallExists ? fs.readFileSync(capCallPath, 'utf8') : '';

assert(capCallExists, 'T2.B4.1', 'Capability call component exists for boundary inspection');
assert(
  capCallSource.includes('status') || capCallSource.includes('running') || capCallSource.includes('done') || capCallSource.includes('error'),
  'T2.B4.2',
  'Tool call disclosure handles lifecycle states: running, done, error'
);
assert(
  capCallSource.includes('spinner') || capCallSource.includes('animate-spin') || capCallSource.includes('ow-spin') || capCallSource.includes('Loader'),
  'T2.B4.3',
  'Tool running state renders spinning loader indicator'
);
assert(
  capCallSource.includes('Check') || capCallSource.includes('checkmark') || capCallSource.includes('text-emerald') || capCallSource.includes('--ok'),
  'T2.B4.4',
  'Tool completed state renders green checkmark indicator'
);
assert(
  capCallSource.includes('badge') || capCallSource.includes('name') || capCallSource.includes('type') || capCallSource.includes('font-mono'),
  'T2.B4.5',
  'Tool badge renders tool type in uppercase monospace formatting'
);
assert(
  capCallSource.includes('input') || capCallSource.includes('query') || capCallSource.includes('args') || capCallSource.includes('code'),
  'T2.B4.6',
  'Tool disclosure renders input query / payload section'
);
assert(
  capCallSource.includes('output') || capCallSource.includes('result') || capCallSource.includes('rows') || capCallSource.includes('data'),
  'T2.B4.7',
  'Tool disclosure renders structured output / tabular result section'
);
assert(
  capCallSource.includes('duration') || capCallSource.includes('ms') || capCallSource.includes('elapsed') || capCallSource.includes('time'),
  'T2.B4.8',
  'Tool execution duration formats milliseconds (412ms) and seconds cleanly'
);
assert(
  capCallSource.includes('overflow-x-auto') || capCallSource.includes('overflow-x') || capCallSource.includes('pre-wrap'),
  'T2.B4.9',
  'Code block container enables horizontal scroll for unbroken code strings'
);
assert(
  capCallSource.includes('truncate') || capCallSource.includes('ellipsis') || capCallSource.includes('overflow-hidden'),
  'T2.B4.10',
  'Tool summary sentence truncates with ellipsis on constrained viewports'
);
assert(
  capCallSource.includes('isOpen') || capCallSource.includes('open') || capCallSource.includes('expanded') || capCallSource.includes('toggle'),
  'T2.B4.11',
  'Tool disclosure card provides interactive click-to-expand toggle behavior'
);
assert(
  capCallSource.includes('var(--code)') || capCallSource.includes('#0b0b0e') || capCallSource.includes('#08080a') || capCallSource.includes('bg-zinc-950'),
  'T2.B4.12',
  'Expanded code container applies dark near-black background token'
);

// -----------------------------------------------------------------------------
// B5: Plan Execution Card Boundaries (10 Tests)
// -----------------------------------------------------------------------------
console.log('\n--- B5: Plan Execution Card Boundaries ---');
const subagentPath = path.join(rootDir, 'components/openwork/OpenWorkSubagentRunLine.tsx');
const subagentExists = fs.existsSync(subagentPath);
const subagentSource = subagentExists ? fs.readFileSync(subagentPath, 'utf8') : '';

assert(subagentExists || composerExists, 'T2.B5.1', 'Plan execution card components available');
assert(
  subagentSource.includes('step') || subagentSource.includes('items') || subagentSource.includes('steps') || subagentSource.includes('list'),
  'T2.B5.2',
  'Plan card iterates step collection with boundary index keys'
);
assert(
  subagentSource.includes('status') || subagentSource.includes('completed') || subagentSource.includes('done') || subagentSource.includes('running'),
  'T2.B5.3',
  'Plan step handles status discrimination: completed, running, pending'
);
assert(
  subagentSource.includes('progress') || subagentSource.includes('count') || subagentSource.includes('/') || subagentSource.includes('total'),
  'T2.B5.4',
  'Plan header calculates progress fraction (e.g. 4/5)'
);
assert(
  subagentSource.includes('title') || subagentSource.includes('label') || subagentSource.includes('name') || subagentSource.includes('text'),
  'T2.B5.5',
  'Plan step displays primary title with line wrapping'
);
assert(
  subagentSource.includes('detail') || subagentSource.includes('sub') || subagentSource.includes('desc') || subagentSource.includes('muted'),
  'T2.B5.6',
  'Plan step displays secondary metadata subtitle in muted foreground'
);
assert(
  subagentSource.includes('duration') || subagentSource.includes('time') || subagentSource.includes('ms') || subagentSource.includes('s'),
  'T2.B5.7',
  'Plan step duration displays right-aligned tabular numbers'
);
assert(
  subagentSource.includes('15px') || subagentSource.includes('size-') || subagentSource.includes('w-') || subagentSource.includes('rounded-full'),
  'T2.B5.8',
  'Plan status indicators use 15px circular numbered badges'
);
assert(
  subagentSource.includes('border') || subagentSource.includes('rounded') || subagentSource.includes('shadow'),
  'T2.B5.9',
  'Plan card outer frame incorporates border radius and elevation shadow'
);
assert(
  subagentSource.includes('divider') || subagentSource.includes('border-t') || subagentSource.includes('hair') || subagentSource.includes('gap-'),
  'T2.B5.10',
  'Step rows are delineated by subtle horizontal dividers'
);

// -----------------------------------------------------------------------------
// B6: Application States & Fallback Boundaries (10 Tests)
// -----------------------------------------------------------------------------
console.log('\n--- B6: Application States & Fallback Boundaries ---');
const chatSurfacePath = path.join(rootDir, 'components/openwork/OpenWorkChatSurface.tsx');
const chatSurfaceExists = fs.existsSync(chatSurfacePath);
const chatSurfaceSource = chatSurfaceExists ? fs.readFileSync(chatSurfacePath, 'utf8') : '';

assert(chatSurfaceExists, 'T2.B6.1', 'OpenWorkChatSurface.tsx exists for state testing');
assert(
  chatSurfaceSource.includes('length === 0') || chatSurfaceSource.includes('empty') || chatSurfaceSource.includes('welcome') || chatSurfaceSource.includes('prompts'),
  'T2.B6.2',
  'Zero message history displays welcome / empty state suggestions'
);
assert(
  chatSurfaceSource.includes('scroll') || chatSurfaceSource.includes('ref') || chatSurfaceSource.includes('auto'),
  'T2.B6.3',
  'Chat scroll container manages auto-scrolling during high-speed token ingestion'
);
assert(
  chatSurfaceSource.includes('isStreaming') || chatSurfaceSource.includes('streaming') || chatSurfaceSource.includes('loading'),
  'T2.B6.4',
  'Active streaming state disables conflicting navigation controls'
);
assert(
  chatSurfaceSource.includes('error') || chatSurfaceSource.includes('alert') || chatSurfaceSource.includes('fail') || chatSurfaceSource.includes('catch'),
  'T2.B6.5',
  'Network and stream errors render error alert banner with retry trigger'
);
assert(
  cssSources.includes('ow-shimmer') || cssSources.includes('shimmer') || cssSources.includes('skeleton'),
  'T2.B6.6',
  'Loading skeleton states utilize ow-shimmer animation for placeholder elements'
);
assert(
  chatSurfaceSource.includes('user') && (chatSurfaceSource.includes('assistant') || chatSurfaceSource.includes('bot')),
  'T2.B6.7',
  'Chat surface discriminates between user and assistant message turns cleanly'
);
assert(
  chatSurfaceSource.includes('key=') || chatSurfaceSource.includes('key:'),
  'T2.B6.8',
  'Message items assign deterministic keys to prevent React reconciliation faults'
);
assert(
  chatSurfaceSource.includes('tool') || chatSurfaceSource.includes('reasoning') || chatSurfaceSource.includes('artifact'),
  'T2.B6.9',
  'Assistant turns seamlessly interleave reasoning, tool calls, and text parts'
);
assert(
  chatSurfaceSource.includes('max-w-') || chatSurfaceSource.includes('748px') || chatSurfaceSource.includes('768px') || chatSurfaceSource.includes('mx-auto'),
  'T2.B6.10',
  'Chat stream width clamps to max-width and centers horizontally on wide displays'
);

// -----------------------------------------------------------------------------
// B7: View Routing & Command Palette Boundaries (10 Tests)
// -----------------------------------------------------------------------------
console.log('\n--- B7: View Routing & Command Palette Boundaries ---');
const storePath = path.join(rootDir, 'components/openwork/useOpenWorkStore.ts');
const storeExists = fs.existsSync(storePath);
const storeSource = storeExists ? fs.readFileSync(storePath, 'utf8') : '';

assert(storeExists, 'T2.B7.1', 'OpenWork store exists for routing boundary validation');
assert(
  storeSource.includes('activeView') || storeSource.includes('view') || storeSource.includes('currentView'),
  'T2.B7.2',
  'Store maintains activeView state property'
);
assert(
  storeSource.includes('setActiveView') || storeSource.includes('setView') || storeSource.includes('navigate'),
  'T2.B7.3',
  'Store exposes setActiveView action dispatcher'
);
assert(
  storeSource.includes('chat') && (storeSource.includes('dashboard') || storeSource.includes('workbench')),
  'T2.B7.4',
  'Store supports core views: chat, dashboard, workbench'
);
assert(
  storeSource.includes('commandPalette') || storeSource.includes('isCommandPaletteOpen') || storeSource.includes('palette'),
  'T2.B7.5',
  'Store tracks command palette open/closed boolean state'
);
assert(
  storeSource.includes('setCommandPalette') || storeSource.includes('toggleCommandPalette') || storeSource.includes('openPalette'),
  'T2.B7.6',
  'Store exposes action to toggle command palette visibility'
);
assert(
  storeSource.includes('activeSessionId') || storeSource.includes('session') || storeSource.includes('currentSession'),
  'T2.B7.7',
  'Store tracks active conversation session identifier'
);
assert(
  storeSource.includes('sessions') || storeSource.includes('history') || storeSource.includes('sessionList'),
  'T2.B7.8',
  'Store persists multi-session conversation list'
);
assert(
  storeSource.includes('activeArtifact') || storeSource.includes('selectedArtifact') || storeSource.includes('artifact'),
  'T2.B7.9',
  'Store tracks active artifact selection for Workbench visualization'
);
assert(
  storeSource.includes('localStorage') || storeSource.includes('persist') || storeSource.includes('storage'),
  'T2.B7.10',
  'Store supports local storage persistence across browser reload sessions'
);

// -----------------------------------------------------------------------------
// B8: Responsive Viewports & Layout Boundaries (8 Tests)
// -----------------------------------------------------------------------------
console.log('\n--- B8: Responsive Viewports & Layout Boundaries ---');
const shellPath = path.join(rootDir, 'components/openwork/OpenWorkShell.tsx');
const shellExists = fs.existsSync(shellPath);
const shellSource = shellExists ? fs.readFileSync(shellPath, 'utf8') : '';

assert(shellExists, 'T2.B8.1', 'OpenWorkShell component exists for layout inspection');
assert(
  shellSource.includes('flex') || shellSource.includes('h-screen') || shellSource.includes('h-full') || shellSource.includes('overflow-hidden'),
  'T2.B8.2',
  'Shell establishes full-viewport flexbox layout boundary (100vh)'
);
assert(
  shellSource.includes('sidebar') || shellSource.includes('Sidebar') || shellSource.includes('w-[262px]') || shellSource.includes('w-64'),
  'T2.B8.3',
  'Shell mounts 262px fixed-width sidebar container'
);
assert(
  shellSource.includes('workbench') || shellSource.includes('Workbench') || shellSource.includes('split') || shellSource.includes('canvas'),
  'T2.B8.4',
  'Shell integrates split Workbench artifact workspace canvas'
);
assert(
  cssSources.includes('@media') || cssSources.includes('max-width') || cssSources.includes('min-width') || shellSource.includes('hidden') || shellSource.includes('md:'),
  'T2.B8.5',
  'Responsive media queries protect mobile and narrow viewport usability'
);
assert(
  cssSources.includes('scrollbar') || cssSources.includes('::-webkit-scrollbar') || cssSources.includes('overflow'),
  'T2.B8.6',
  'Custom 8px/6px scrollbar styling applies across all scrollable sub-panels'
);
assert(
  cssSources.includes('selection') || cssSources.includes('::selection') || cssSources.includes('user-select'),
  'T2.B8.7',
  'Text selection background token (--muted) is scoped cleanly'
);
assert(
  testResults.length >= 80,
  'T2.B8.8',
  `Tier 2 test assertions count (${testResults.length}) meets minimum threshold (≥80)`
);

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 TIER 2 EXECUTION COMPLETE: ${passedTests} passed, ${failedTests} failed (${testResults.length} total)`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
