import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('======================================================================');
console.log('CHALLENGER 1: ADVERSARIAL STRESS TEST SUITE (INVARIANTS & INTEGRITY)');
console.log('======================================================================\n');

const TARGET_FILES = [
  {
    name: 'OpenWorkDashboardPage.tsx',
    path: path.join(projectRoot, 'frontend/components/openwork/pages/OpenWorkDashboardPage.tsx'),
    expectedScrollContainers: 2,
  },
  {
    name: 'OpenWorkPromptLibraryPage.tsx',
    path: path.join(projectRoot, 'frontend/components/openwork/pages/OpenWorkPromptLibraryPage.tsx'),
    expectedScrollContainers: 2,
  },
  {
    name: 'OpenWorkDatasourcePage.tsx',
    path: path.join(projectRoot, 'frontend/components/openwork/pages/OpenWorkDatasourcePage.tsx'),
    expectedScrollContainers: 5,
  },
  {
    name: 'OpenWorkSkillsMcpPage.tsx',
    path: path.join(projectRoot, 'frontend/components/openwork/pages/OpenWorkSkillsMcpPage.tsx'),
    expectedScrollContainers: 3,
  },
];

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function assertTest(name, condition, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${name}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] ${name} ${details ? `-> ${details}` : ''}`);
    failures.push({ name, details });
  }
}

// -----------------------------------------------------------------------------
// TASK 1 & 2: Fluid Typography & SVG Font Size Audit
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Fluid Typography & Zero Hardcoded Font Size Invariants ---');

for (const target of TARGET_FILES) {
  assertTest(`File exists: ${target.name}`, fs.existsSync(target.path), `Path: ${target.path}`);
  const content = fs.readFileSync(target.path, 'utf8');

  // Check 1: 0 occurrences of text-[...px]
  const fixedPxRegex = /text-\[\s*\d+(\.\d+)?px\s*\]/gi;
  const fixedPxMatches = content.match(fixedPxRegex) || [];
  assertTest(
    `[${target.name}] Zero fixed-pixel text classes (text-[...px])`,
    fixedPxMatches.length === 0,
    `Found ${fixedPxMatches.length} occurrences: ${JSON.stringify(fixedPxMatches)}`
  );

  // Check 2: 0 occurrences of hardcoded font-size / fontSize inline styles
  const inlineFontSizeRegex = /font-?size\s*:\s*['"]?\d+(px|pt|em|rem)?['"]?/gi;
  const inlineMatches = content.match(inlineFontSizeRegex) || [];
  assertTest(
    `[${target.name}] Zero inline style font-size declarations`,
    inlineMatches.length === 0,
    `Found ${inlineMatches.length} occurrences: ${JSON.stringify(inlineMatches)}`
  );

  // Check 3: 0 occurrences of SVG fontSize attributes (fontSize="..." or fontSize={...})
  const svgFontSizeRegex = /fontSize\s*=\s*["'{][^"'}]+["'}]/gi;
  const svgFontSizeMatches = content.match(svgFontSizeRegex) || [];
  assertTest(
    `[${target.name}] Zero SVG fixed fontSize attributes (fontSize=...)`,
    svgFontSizeMatches.length === 0,
    `Found ${svgFontSizeMatches.length} occurrences: ${JSON.stringify(svgFontSizeMatches)}`
  );

  // Check 4: Fluid text units verification (ensure rem/standard classes used)
  const remTextMatches = content.match(/text-\[\d+(\.\d+)?rem\]/g) || [];
  const standardTextMatches = content.match(/text-(xs|sm|base|lg|xl|2xl|3xl|4xl)/g) || [];
  assertTest(
    `[${target.name}] Responsive fluid text scaling present`,
    (remTextMatches.length + standardTextMatches.length) > 0,
    `Found ${remTextMatches.length} rem and ${standardTextMatches.length} standard Tailwind text classes`
  );
}

// -----------------------------------------------------------------------------
// TASK 3: Scrollbar Invariant Check (.custom-scrollbar on all scroll containers)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Scrollbar Invariant Check (.custom-scrollbar) ---');

for (const target of TARGET_FILES) {
  const content = fs.readFileSync(target.path, 'utf8');
  const lines = content.split('\n');
  const scrollContainers = [];

  // Match elements with className containing overflow-x-auto, overflow-y-auto, overflow-auto
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (/(overflow-(x|y)?-auto|overflow-(x|y)?-scroll)/.test(line)) {
      const hasCustomScrollbar = line.includes('custom-scrollbar');
      scrollContainers.push({ lineNum, line: line.trim(), hasCustomScrollbar });
    }
  });

  assertTest(
    `[${target.name}] Identified all scrollable containers (count >= ${target.expectedScrollContainers})`,
    scrollContainers.length >= target.expectedScrollContainers,
    `Found ${scrollContainers.length} scrollable containers, expected at least ${target.expectedScrollContainers}`
  );

  const missingCustomScrollbar = scrollContainers.filter(sc => !sc.hasCustomScrollbar);
  assertTest(
    `[${target.name}] All scrollable containers enforce .custom-scrollbar`,
    missingCustomScrollbar.length === 0,
    `Lines missing custom-scrollbar: ${JSON.stringify(missingCustomScrollbar.map(m => m.lineNum))}`
  );
}

// -----------------------------------------------------------------------------
// TASK 4: Sticky Page Header with Backdrop Blur Check
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Sticky Page Header with Frosted Glass Backdrop Check ---');

for (const target of TARGET_FILES) {
  const content = fs.readFileSync(target.path, 'utf8');

  // Match <header ...> tag
  const headerMatch = content.match(/<header\s+className=["'`]([^"'`]+)["'`]/);
  assertTest(
    `[${target.name}] Header element exists`,
    headerMatch !== null,
    'No <header className="..."> found'
  );

  if (headerMatch) {
    const headerClasses = headerMatch[1];

    assertTest(
      `[${target.name}] Header has 'sticky top-0'`,
      headerClasses.includes('sticky') && headerClasses.includes('top-0'),
      `Header classes: ${headerClasses}`
    );

    assertTest(
      `[${target.name}] Header has 'z-10' elevation`,
      headerClasses.includes('z-10') || headerClasses.includes('z-[10]'),
      `Header classes: ${headerClasses}`
    );

    assertTest(
      `[${target.name}] Header has 'backdrop-blur-md'`,
      headerClasses.includes('backdrop-blur-md'),
      `Header classes: ${headerClasses}`
    );

    assertTest(
      `[${target.name}] Header has translucent background for blur effect`,
      /bg-\[var\(--bg\)\]\/90/.test(headerClasses) || /bg-.*\/[0-9]+/.test(headerClasses),
      `Header classes: ${headerClasses}`
    );
  }
}

// -----------------------------------------------------------------------------
// TASK 5: Zero Live Network Calls & Offline Verification Check
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Zero Live Network Calls & Offline Invariant ---');

const FORBIDDEN_NETWORK_PATTERNS = [
  { name: 'fetch API call', regex: /\bfetch\s*\(/g },
  { name: 'axios client call', regex: /\baxios(\.[a-z]+)?\s*\(/gi },
  { name: 'WebSocket constructor', regex: /new\s+WebSocket\s*\(/g },
  { name: 'EventSource constructor', regex: /new\s+EventSource\s*\(/g },
  { name: 'XMLHttpRequest constructor', regex: /new\s+XMLHttpRequest\s*\(/g },
  { name: 'sendBeacon API call', regex: /navigator\.sendBeacon\s*\(/g },
  { name: 'Live chatbot query endpoint', regex: /['"`](\/api\/chat|\/v1\/chat|\/chat\/completions)/gi },
];

for (const target of TARGET_FILES) {
  const content = fs.readFileSync(target.path, 'utf8');

  for (const pattern of FORBIDDEN_NETWORK_PATTERNS) {
    const matches = content.match(pattern.regex) || [];
    assertTest(
      `[${target.name}] Zero ${pattern.name}`,
      matches.length === 0,
      `Found ${matches.length} occurrences: ${JSON.stringify(matches)}`
    );
  }
}

// -----------------------------------------------------------------------------
// Summary & Exit
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`CHALLENGER 1 SUITE SUMMARY: ${passedChecks}/${totalChecks} Checks Passed (${((passedChecks / totalChecks) * 100).toFixed(1)}%)`);
if (failures.length > 0) {
  console.log(`FAILURES ENCOUNTERED (${failures.length}):`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} -> ${f.details}`));
  console.log('VERDICT: REJECT');
  process.exit(1);
} else {
  console.log('ALL INVARIANTS RIGOROUSLY SATISFIED.');
  console.log('VERDICT: APPROVE');
  process.exit(0);
}
