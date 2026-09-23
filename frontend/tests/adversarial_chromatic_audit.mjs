import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log(' ADVERSARIAL AUDIT: CHROMATIC COLOR & MONOCHROME THEME PURGE');
console.log(' Static Analysis & Regex Challenger (challenger_theme_2)');
console.log('================================================================\n');

// ----------------------------------------------------------------------
// Configuration & Target File Extensions
// ----------------------------------------------------------------------
const TARGET_EXTENSIONS = new Set(['.css', '.tsx', '.ts', '.html']);
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.agents', '.next', 'out']);

// Forbidden chromatic color regex patterns
const FORBIDDEN_HEX_PATTERNS = [
  { name: 'Blue #1783ff', regex: /#1783ff\b/gi },
  { name: 'Blue #1a88ff', regex: /#1a88ff\b/gi },
  { name: 'Blue #0C75FC', regex: /#0C75FC\b/gi },
  { name: 'Blue #2563eb', regex: /#2563eb\b/gi },
  { name: 'Blue #3b82f6', regex: /#3b82f6\b/gi },
  { name: 'Sky #0ea5e9', regex: /#0ea5e9\b/gi },
  { name: 'Emerald #10b981', regex: /#10b981\b/gi },
  { name: 'Teal #14b8a6', regex: /#14b8a6\b/gi },
  { name: 'Indigo #6366f1', regex: /#6366f1\b/gi },
  { name: 'Purple #a855f7', regex: /#a855f7\b/gi },
  { name: 'Violet #8b5cf6', regex: /#8b5cf6\b/gi },
  { name: 'Rose #f43f5e', regex: /#f43f5e\b/gi },
  { name: 'Red #ef4444', regex: /#ef4444\b/gi },
  { name: 'Orange #f97316', regex: /#f97316\b/gi },
  { name: 'Amber #f59e0b', regex: /#f59e0b\b/gi },
  { name: 'Yellow #eab308', regex: /#eab308\b/gi },
];

const FORBIDDEN_HSL_PATTERNS = [
  { name: 'Legacy Blue Primary HSL 212 100% 55%', regex: /212(?:\.0)?\s+100%\s+55%/g },
  { name: 'Tailwind Blue HSL 221.2 83.2% 53.3%', regex: /221\.2\s+83\.2%\s+53\.3%/g },
  { name: 'Emerald HSL 160 84% 39%', regex: /160\s+84%\s+39%/g },
  { name: 'Sky HSL 199 89% 48%', regex: /199\s+89%\s+48%/g },
  { name: 'Indigo HSL 238\.7 83\.5% 66\.7%', regex: /238\.7\s+83\.5%\s+66\.7%/g },
];

const FORBIDDEN_TAILWIND_RINGS = [
  { name: 'Chromatic Ring Blue', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-blue-\d+(?:\/\d+)?\b/g },
  { name: 'Chromatic Ring Emerald', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-emerald-\d+(?:\/\d+)?\b/g },
  { name: 'Chromatic Ring Sky', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-sky-\d+(?:\/\d+)?\b/g },
  { name: 'Chromatic Ring Indigo', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-indigo-\d+(?:\/\d+)?\b/g },
  { name: 'Chromatic Ring Teal', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-teal-\d+(?:\/\d+)?\b/g },
  { name: 'Chromatic Ring Orange', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-orange-\d+(?:\/\d+)?\b/g },
  { name: 'Chromatic Ring Amber', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-amber-\d+(?:\/\d+)?\b/g },
  { name: 'Chromatic Ring Purple/Violet', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-(?:purple|violet)-\d+(?:\/\d+)?\b/g },
  { name: 'Chromatic Ring Rose/Red', regex: /(?:focus:|focus-visible:|focus-within:|active:|hover:)?ring-(?:rose|red)-\d+(?:\/\d+)?\b/g },
];

const FORBIDDEN_TAILWIND_CLASSES = [
  { name: 'Tailwind bg-blue', regex: /(?:hover:|active:|focus:|dark:)?bg-blue-\d+(?:\/\d+)?\b/g },
  { name: 'Tailwind text-blue', regex: /(?:hover:|active:|focus:|dark:)?text-blue-\d+(?:\/\d+)?\b/g },
  { name: 'Tailwind border-blue', regex: /(?:hover:|active:|focus:|dark:)?border-blue-\d+(?:\/\d+)?\b/g },
  { name: 'Tailwind bg-emerald', regex: /(?:hover:|active:|focus:|dark:)?bg-emerald-\d+(?:\/\d+)?\b/g },
  { name: 'Tailwind text-emerald', regex: /(?:hover:|active:|focus:|dark:)?text-emerald-\d+(?:\/\d+)?\b/g },
  { name: 'Tailwind bg-sky', regex: /(?:hover:|active:|focus:|dark:)?bg-sky-\d+(?:\/\d+)?\b/g },
  { name: 'Tailwind text-sky', regex: /(?:hover:|active:|focus:|dark:)?text-sky-\d+(?:\/\d+)?\b/g },
];

// ----------------------------------------------------------------------
// File Crawler
// ----------------------------------------------------------------------
function crawlDirectory(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        results.push(...crawlDirectory(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TARGET_EXTENSIONS.has(ext)) {
        results.push({ fullPath, relPath, ext });
      }
    }
  }
  return results;
}

const allFiles = crawlDirectory(rootDir);
console.log(`Auditing ${allFiles.length} source files across repository...\n`);

const findings = {
  themeHex: [],
  themeHsl: [],
  chromaticRings: [],
  chromaticClasses: [],
  interactiveViolations: [],
};

const fileMap = {};

// ----------------------------------------------------------------------
// Audit Execution
// ----------------------------------------------------------------------
for (const fileObj of allFiles) {
  const { fullPath, relPath } = fileObj;
  // Skip test suites
  if (relPath.startsWith('tests/') || relPath.startsWith('__tests__/')) continue;

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      if (!trimmed.includes('=') && !trimmed.includes(':')) return;
    }

    // 1. Theme HSL Audit
    for (const pattern of FORBIDDEN_HSL_PATTERNS) {
      if (pattern.regex.test(lineText)) {
        const item = {
          file: relPath,
          line: lineNum,
          category: 'HSL',
          rule: pattern.name,
          snippet: trimmed,
        };
        findings.themeHsl.push(item);
        if (!fileMap[relPath]) fileMap[relPath] = [];
        fileMap[relPath].push(item);
      }
    }

    // 2. Theme & Component Hex Audit
    for (const pattern of FORBIDDEN_HEX_PATTERNS) {
      if (pattern.regex.test(lineText)) {
        const item = {
          file: relPath,
          line: lineNum,
          category: 'HEX',
          rule: pattern.name,
          snippet: trimmed,
        };
        findings.themeHex.push(item);
        if (!fileMap[relPath]) fileMap[relPath] = [];
        fileMap[relPath].push(item);
      }
    }

    // 3. Chromatic Rings Audit
    for (const pattern of FORBIDDEN_TAILWIND_RINGS) {
      if (pattern.regex.test(lineText)) {
        const item = {
          file: relPath,
          line: lineNum,
          category: 'RING',
          rule: pattern.name,
          snippet: trimmed,
        };
        findings.chromaticRings.push(item);
        if (!fileMap[relPath]) fileMap[relPath] = [];
        fileMap[relPath].push(item);
      }
    }

    // 4. Chromatic Classes Audit
    for (const pattern of FORBIDDEN_TAILWIND_CLASSES) {
      if (pattern.regex.test(lineText)) {
        const item = {
          file: relPath,
          line: lineNum,
          category: 'CLASS',
          rule: pattern.name,
          snippet: trimmed,
        };
        findings.chromaticClasses.push(item);
        if (!fileMap[relPath]) fileMap[relPath] = [];
        fileMap[relPath].push(item);
      }
    }
  });
}

// ----------------------------------------------------------------------
// Specific Interactive Base Component Audit
// ----------------------------------------------------------------------
console.log('--- Checking Base Component Interactive States ---');
const baseComponents = [
  'components/ui/button.tsx',
  'components/ui/button.tsx',
  'components/ui/badge.tsx',
  'components/ui/badge.tsx',
  'components/common/StatusBadge.tsx',
  'components/ui/input.tsx',
  'components/ui/input.tsx',
  'components/ui/slider.tsx',
  'components/ui/slider.tsx',
  'components/ui/dropdown-menu.tsx',
  'components/layout/Header.tsx',
  'components/theme-provider.tsx',
  'components/mode-toggle.tsx',
];

for (const compRel of baseComponents) {
  const compPath = path.resolve(rootDir, compRel);
  if (!fs.existsSync(compPath)) {
    findings.interactiveViolations.push({
      file: compRel,
      line: 0,
      rule: 'Base Component Missing',
      snippet: `File ${compRel} not found`,
    });
    continue;
  }
  const code = fs.readFileSync(compPath, 'utf8');

  // Check for blue/emerald/sky focus rings in base interactive elements
  const ringMatch = code.match(/ring-(?:blue|emerald|sky|indigo|purple|rose)-\d+/g);
  if (ringMatch) {
    findings.interactiveViolations.push({
      file: compRel,
      line: 1,
      rule: 'Chromatic ring in base component',
      snippet: `Matches: ${ringMatch.join(', ')}`,
    });
  }
}

// ----------------------------------------------------------------------
// Findings Report
// ----------------------------------------------------------------------
console.log('\n================================================================');
console.log(' AUDIT FINDINGS SUMMARY');
console.log('================================================================\n');

console.log(`1. Forbidden Theme HSL Definitions: ${findings.themeHsl.length}`);
console.log(`2. Forbidden Hex Codes in Source Files: ${findings.themeHex.length}`);
console.log(`3. Chromatic Tailwind Rings in UI Components: ${findings.chromaticRings.length}`);
console.log(`4. Chromatic Tailwind Utility Classes: ${findings.chromaticClasses.length}`);
console.log(`5. Interactive Base Component Ring Violations: ${findings.interactiveViolations.length}`);

const totalViolations =
  findings.themeHsl.length +
  findings.themeHex.length +
  findings.chromaticRings.length +
  findings.chromaticClasses.length +
  findings.interactiveViolations.length;

console.log(`\nAffected Files: ${Object.keys(fileMap).length}`);
for (const file of Object.keys(fileMap).sort()) {
  const items = fileMap[file];
  console.log(`\n📄 ${file} (${items.length} violations)`);
  items.slice(0, 5).forEach((v) => {
    console.log(`   - Line ${v.line} [${v.category}] (${v.rule}): ${v.snippet.substring(0, 100)}`);
  });
  if (items.length > 5) {
    console.log(`   ... and ${items.length - 5} more`);
  }
}

console.log('\n================================================================');
console.log(`TOTAL DETECTED VIOLATIONS: ${totalViolations}`);
console.log('================================================================\n');

if (totalViolations > 0) {
  console.error(`VERDICT: REQUEST_CHANGES (${totalViolations} chromatic violations detected across ${Object.keys(fileMap).length} files)`);
  process.exit(1);
} else {
  console.log('VERDICT: APPROVE (Zero chromatic color violations detected)');
  process.exit(0);
}
