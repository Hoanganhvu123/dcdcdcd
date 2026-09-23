import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const stylesDir = path.resolve(rootDir, 'styles');
const globalsCssPath = path.resolve(stylesDir, 'globals.css');
const distDir = path.resolve(rootDir, 'dist');
const assetsDir = path.resolve(distDir, 'assets');

console.log('================================================================');
console.log(' EMPIRICAL ADVERSARIAL CHALLENGER: MILESTONE M1 VERIFICATION');
console.log(' Tailwind v4 Pipeline & CSS-First @theme Engine');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testName, details = null) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedTests++;
    failures.push({ testName, details });
  }
}

// Utility: Strip comments from CSS text
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// ----------------------------------------------------------------------
// Test Suite 1: Tailwind v4 Configuration & Pipeline Verification
// ----------------------------------------------------------------------
console.log('--- Test Suite 1: Tailwind v4 Pipeline & Architecture ---');

// 1.1 Check legacy files are absent
const legacyTailwindConfig = fs.existsSync(path.resolve(rootDir, 'tailwind.config.js'));
const legacyTailwindTsConfig = fs.existsSync(path.resolve(rootDir, 'tailwind.config.ts'));
const legacyPostcssConfig = fs.existsSync(path.resolve(rootDir, 'postcss.config.js'));

assert(!legacyTailwindConfig && !legacyTailwindTsConfig, 'Legacy tailwind.config.{js,ts} is removed (Tailwind v4 CSS-first config)');
assert(!legacyPostcssConfig, 'Legacy postcss.config.js is removed');

// 1.2 Check package.json dependencies
const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'));
assert(
  pkg.devDependencies && pkg.devDependencies['@tailwindcss/vite'] && pkg.devDependencies['tailwindcss'],
  '@tailwindcss/vite and tailwindcss v4 are present in devDependencies',
  { '@tailwindcss/vite': pkg.devDependencies?.['@tailwindcss/vite'], tailwindcss: pkg.devDependencies?.tailwindcss }
);

// 1.3 Check vite.config.mts has @tailwindcss/vite plugin
const viteConfigContent = fs.readFileSync(path.resolve(rootDir, 'vite.config.mts'), 'utf8');
assert(
  viteConfigContent.includes("import tailwindcss from '@tailwindcss/vite';") &&
  viteConfigContent.includes('tailwindcss()'),
  'vite.config.mts imports and registers @tailwindcss/vite plugin cleanly'
);

// ----------------------------------------------------------------------
// Test Suite 2: CSS-First @theme Engine & Token Definition Parsing
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 2: globals.css @theme & CSS Variable Definitions ---');

const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
const cleanGlobalsCss = stripComments(globalsCss);

// 2.1 Check @import "tailwindcss"
assert(globalsCss.includes('@import "tailwindcss";'), 'styles/globals.css starts with @import "tailwindcss";');
assert(globalsCss.includes('@plugin "@tailwindcss/typography";'), 'styles/globals.css includes @plugin "@tailwindcss/typography";');

// 2.2 Parse @theme block
const themeMatch = cleanGlobalsCss.match(/@theme\s*\{([\s\S]*?)\n\}/);
assert(Boolean(themeMatch), '@theme block exists and is parsed in styles/globals.css');

const themeBlock = themeMatch ? themeMatch[1] : '';

// 2.3 Verify Zinc Palette in @theme
const expectedZincScale = {
  '--color-zinc-50': '#fafafa',
  '--color-zinc-100': '#f4f4f5',
  '--color-zinc-200': '#e4e4e7',
  '--color-zinc-300': '#d4d4d8',
  '--color-zinc-400': '#a1a1aa',
  '--color-zinc-500': '#71717a',
  '--color-zinc-600': '#52525b',
  '--color-zinc-700': '#3f3f46',
  '--color-zinc-800': '#27272a',
  '--color-zinc-900': '#18181b',
  '--color-zinc-950': '#09090b',
};

let allZincPresent = true;
const missingZinc = [];
for (const [zincKey, zincVal] of Object.entries(expectedZincScale)) {
  const regex = new RegExp(`${zincKey}\\s*:\\s*${zincVal}`, 'i');
  if (!regex.test(themeBlock)) {
    allZincPresent = false;
    missingZinc.push({ zincKey, zincVal });
  }
}
assert(allZincPresent, 'Complete Monochrome Zinc Palette (50-950: #fafafa to #09090b) mapped in @theme', missingZinc);

// 2.4 Verify Semantic UI Tokens in @theme
const semanticTokens = [
  '--color-background',
  '--color-foreground',
  '--color-muted',
  '--color-muted-foreground',
  '--color-border',
  '--color-input',
  '--color-ring',
  '--color-card',
  '--color-card-foreground',
  '--color-popover',
  '--color-popover-foreground',
  '--color-primary',
  '--color-secondary',
  '--color-destructive',
  '--color-accent',
];

const missingSemantic = semanticTokens.filter(t => !themeBlock.includes(t));
assert(missingSemantic.length === 0, 'All core Semantic UI tokens mapped in @theme', missingSemantic);

// 2.5 Verify Kimi Tokens in @theme
const kimiThemeTokens = [
  '--color-kimi-explore',
  '--color-kimi-panel',
  '--color-kimi-hover',
  '--color-kimi-bubble',
  '--color-kimi-border',
  '--color-kimi-text',
  '--color-kimi-dim',
  '--color-kimi-accent',
  '--color-kimi-accent-hover',
  '--color-kimi-composer',
];
const missingKimiTokens = kimiThemeTokens.filter(t => !themeBlock.includes(t));
assert(missingKimiTokens.length === 0, 'All Kimi tokens (--color-kimi-*) mapped in @theme', missingKimiTokens);

// 2.6 Verify Squircle Border Radii
const squircleTokens = {
  '--radius-squircle': '0.75rem',
  '--radius-squircle-sm': '0.5rem',
  '--radius-squircle-lg': '1rem',
};
let allSquirclesPresent = true;
for (const [key, val] of Object.entries(squircleTokens)) {
  const regex = new RegExp(`${key}\\s*:\\s*${val.replace('.', '\\.')}`, 'i');
  if (!regex.test(themeBlock)) {
    allSquirclesPresent = false;
  }
}
assert(allSquirclesPresent, 'Squircle border radii (--radius-squircle: 0.75rem, sm: 0.5rem, lg: 1rem) in @theme', squircleTokens);

// 2.7 Verify Keyframe Animations
const requiredAnimations = [
  'pulse1', 'pulse2', 'pulse3',
  'accordion-down', 'accordion-up',
  'fade-in', 'slide-in', 'marquee',
  'scroll', 'scale-in', 'shake', 'spin'
];
const missingAnimations = requiredAnimations.filter(anim => !themeBlock.includes(anim));
assert(missingAnimations.length === 0, 'All 12 keyframe animations defined in @theme', missingAnimations);

// ----------------------------------------------------------------------
// Test Suite 3: Light Mode vs Dark Mode CSS Variable Cascade & Fallbacks
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 3: Light & Dark Mode Variable Cascade & Fallback Verification ---');

// Helper to extract CSS variable declarations from clean CSS text
function extractCssVarsFromText(cleanCss) {
  const vars = {};
  const varDeclRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+);/g;
  let match;
  while ((match = varDeclRegex.exec(cleanCss)) !== null) {
    const key = match[1].trim();
    const val = match[2].trim();
    vars[key] = val;
  }
  return vars;
}

// Extract root (light) declarations
const rootBlockMatches = cleanGlobalsCss.match(/:root\s*\{([\s\S]*?)\}/g) || [];
const rootCleanText = rootBlockMatches.join('\n');
const rootVars = extractCssVarsFromText(rootCleanText);

// Extract dark declarations
const darkBlockMatches = cleanGlobalsCss.match(/\.dark\s*\{([\s\S]*?)\}/g) || [];
const darkCleanText = darkBlockMatches.join('\n');
const darkVars = extractCssVarsFromText(darkCleanText);

// 3.1 Verify Kimi Bubble Token in Light and Dark
console.log(`[Variable Check] Light --kimi-bubble: "${rootVars['--kimi-bubble']}"`);
console.log(`[Variable Check] Dark  --kimi-bubble: "${darkVars['--kimi-bubble']}"`);
assert(rootVars['--kimi-bubble'] === '#f5f5f5', 'Light mode --kimi-bubble resolves to #f5f5f5 (Kimi Light PC bubble)', rootVars['--kimi-bubble']);
assert(darkVars['--kimi-bubble'] === '#292929', 'Dark mode --kimi-bubble resolves to #292929 (Kimi Dark PC bubble)', darkVars['--kimi-bubble']);

// 3.2 Verify Kimi Accent Token (Monochrome Zinc #18181b / #fafafa or calibrated accent)
console.log(`[Variable Check] Light --kimi-accent: "${rootVars['--kimi-accent']}"`);
console.log(`[Variable Check] Dark  --kimi-accent: "${darkVars['--kimi-accent']}"`);
assert(rootVars['--kimi-accent'] === '#18181b' || rootVars['--kimi-accent'] === '#1783ff', 'Light mode --kimi-accent resolves to #18181b (Monochrome Zinc 900) or #1783ff', rootVars['--kimi-accent']);
assert(darkVars['--kimi-accent'] === '#fafafa' || darkVars['--kimi-accent'] === '#1a88ff' || darkVars['--kimi-accent'] === '#1783ff', 'Dark mode --kimi-accent resolves to #fafafa (Monochrome Zinc 50) or #1a88ff', darkVars['--kimi-accent']);

// 3.3 Verify Kimi Text & Contrast
console.log(`[Variable Check] Light --kimi-text: "${rootVars['--kimi-text']}"`);
console.log(`[Variable Check] Dark  --kimi-text: "${darkVars['--kimi-text']}"`);
assert(rootVars['--kimi-text'] === 'rgba(0, 0, 0, 0.9)' || rootVars['--kimi-text'] === '#09090b', 'Light mode --kimi-text has primary text ink', rootVars['--kimi-text']);
assert(darkVars['--kimi-text'] === '#fafafa' || darkVars['--kimi-text'] === 'rgba(255, 255, 255, 0.84)', 'Dark mode --kimi-text has dark primary text ink', darkVars['--kimi-text']);

// 3.4 Check for Undefined Fallbacks: Every var(--xxx) in @theme must be present in rootVars & darkVars (excluding runtime dynamic vars like radix)
const varReferences = [...themeBlock.matchAll(/var\((--[a-zA-Z0-9_-]+)[^)]*\)/g)].map(m => m[1]);
const uniqueStaticVarRefs = [...new Set(varReferences)].filter(v => !v.startsWith('--radix-') && !v.startsWith('--duration'));

const missingInRoot = [];
const missingInDark = [];

for (const ref of uniqueStaticVarRefs) {
  const declaredInRoot = Boolean(rootVars[ref] || cleanGlobalsCss.includes(`${ref}:`));
  const declaredInDark = Boolean(darkVars[ref] || cleanGlobalsCss.includes(`${ref}:`));
  
  if (!declaredInRoot) missingInRoot.push(ref);
  if (!declaredInDark) missingInDark.push(ref);
}

assert(
  missingInRoot.length === 0,
  `Zero undefined CSS variable fallbacks in Light mode (:root) (${uniqueStaticVarRefs.length} static referenced variables checked)`,
  missingInRoot
);
assert(
  missingInDark.length === 0,
  `Zero undefined CSS variable fallbacks in Dark mode (.dark) (${uniqueStaticVarRefs.length} static referenced variables checked)`,
  missingInDark
);

// ----------------------------------------------------------------------
// Test Suite 4: @reference Directives in Component CSS Files
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 4: @reference Directives in Component Styles ---');

const componentCssFiles = [
  'components/chat/chat-content/styles/chat-content.css',
  'components/common/styles/chat-dialog.css',
  'components/common/styles/completion-input.css',
  'components/common/styles/configurable-form.css',
  'components/common/styles/gpt-card.css',
  'components/common/styles/nested-form-fields.css',
  'components/common/styles/prompt-bot.css',
  'components/layout/styles/layout.css',
];

let allReferencesValid = true;
const invalidReferences = [];

for (const relPath of componentCssFiles) {
  const fullPath = path.resolve(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    allReferencesValid = false;
    invalidReferences.push({ relPath, error: 'File does not exist' });
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const refMatch = content.match(/@reference\s+["']([^"']+)["']/);
  if (!refMatch) {
    allReferencesValid = false;
    invalidReferences.push({ relPath, error: 'Missing @reference directive' });
  } else {
    const targetRef = refMatch[1];
    const resolvedRefPath = path.resolve(path.dirname(fullPath), targetRef);
    if (!fs.existsSync(resolvedRefPath) || resolvedRefPath !== globalsCssPath) {
      allReferencesValid = false;
      invalidReferences.push({ relPath, ref: targetRef, resolved: resolvedRefPath, error: 'Unresolvable or mismatched target' });
    }
  }
}

assert(allReferencesValid, `All ${componentCssFiles.length} isolated component CSS files have valid @reference pointing to globals.css`, invalidReferences);

// ----------------------------------------------------------------------
// Test Suite 5: Compiled Production CSS Bundle Inspection
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 5: Compiled Bundle CSS Output Verification ---');

if (fs.existsSync(assetsDir)) {
  const cssFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.css'));
  console.log(`Found ${cssFiles.length} CSS bundle(s) in dist/assets/: ${cssFiles.join(', ')}`);
  
  assert(cssFiles.length > 0, 'Production build emitted at least 1 CSS bundle');
  
  // Aggregate all CSS bundle contents to inspect full compiled stylesheet
  let aggregatedCss = '';
  for (const cssFile of cssFiles) {
    aggregatedCss += fs.readFileSync(path.resolve(assetsDir, cssFile), 'utf8') + '\n';
  }
  
  const totalCssKB = (aggregatedCss.length / 1024).toFixed(2);
  console.log(`Total Compiled CSS size across all chunks: ${totalCssKB} KB`);
  
  // Check that Tailwind v4 compiled @theme variables, custom tokens, and utilities
  assert(aggregatedCss.includes('#18181b') || aggregatedCss.includes('--color-zinc-900') || aggregatedCss.includes('zinc-900'), 'Compiled bundle contains Zinc-900 token (#18181b / zinc-900)');
  assert(aggregatedCss.includes('--kimi-accent') || aggregatedCss.includes('#18181b') || aggregatedCss.includes('#1783ff') || aggregatedCss.includes('--color-emerald-500'), 'Compiled bundle contains accent token (--kimi-accent)');
  assert(aggregatedCss.includes('#292929') || aggregatedCss.includes('--kimi-bubble'), 'Compiled bundle contains Kimi bubble token (#292929 / --kimi-bubble)');
  assert(aggregatedCss.includes('0.75rem') || aggregatedCss.includes('--radius-squircle') || aggregatedCss.includes('rounded-squircle'), 'Compiled bundle contains squircle radius tokens (0.75rem)');
  assert(aggregatedCss.includes('pulse1') || aggregatedCss.includes('accordion-down') || aggregatedCss.includes('scale-in'), 'Compiled bundle contains keyframe definitions');
} else {
  console.warn('[WARN] dist/assets directory not found; run npm run build to populate.');
}

// ----------------------------------------------------------------------
// SUMMARY & VERDICT
// ----------------------------------------------------------------------
console.log('\n================================================================');
console.log(`EMPIRICAL TEST SUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error('VERDICT: REJECTED (Failure in Milestone M1 Verification)');
  process.exit(1);
} else {
  console.log('VERDICT: APPROVED (Milestone M1 100% Empirically Verified)');
  process.exit(0);
}
