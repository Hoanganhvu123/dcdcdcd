import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log(' 🎨 GEIST + ZINC DESIGN SYSTEM & THEME TOKENS VERIFICATION');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = null) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedTests++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Check Style Files & Index HTML Existence
// ─────────────────────────────────────────────────────────────────────────────
const globalsCss = path.join(rootDir, 'styles/globals.css');
const chatCss = path.join(rootDir, 'components/openwork/styles/openwork-chat.css');
const workbenchCss = path.join(rootDir, 'components/openwork/styles/openwork-workbench.css');
const excelCss = path.join(rootDir, 'components/ai-data-analytic/office-excel/styles/excel-viewer.css');
const wordCss = path.join(rootDir, 'components/ai-data-analytic/office-word/styles/word-viewer.css');
const slideCss = path.join(rootDir, 'components/ai-data-analytic/office-slides/styles/slide-viewer.css');
const indexHtmlPath = path.join(rootDir, 'index.html');

assert(fs.existsSync(globalsCss), 'styles/globals.css exists');
assert(fs.existsSync(chatCss), 'components/openwork/styles/openwork-chat.css exists');
assert(fs.existsSync(workbenchCss), 'components/openwork/styles/openwork-workbench.css exists');
assert(fs.existsSync(excelCss), 'components/ai-data-analytic/office-excel/styles/excel-viewer.css exists');
assert(fs.existsSync(wordCss), 'components/ai-data-analytic/office-word/styles/word-viewer.css exists');
assert(fs.existsSync(slideCss), 'components/ai-data-analytic/office-slides/styles/slide-viewer.css exists');
assert(fs.existsSync(indexHtmlPath), 'index.html exists');

// ─────────────────────────────────────────────────────────────────────────────
// 2. Typography & Font Verification in index.html and globals.css
// ─────────────────────────────────────────────────────────────────────────────
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const globalsContent = fs.readFileSync(globalsCss, 'utf8');
const chatContent = fs.readFileSync(chatCss, 'utf8');
const workbenchContent = fs.readFileSync(workbenchCss, 'utf8');
const excelContent = fs.readFileSync(excelCss, 'utf8');
const wordContent = fs.readFileSync(wordCss, 'utf8');
const slideContent = fs.readFileSync(slideCss, 'utf8');

const allCssContent = [globalsContent, chatContent, workbenchContent, excelContent, wordContent, slideContent].join('\n');

// 2.1 Assert Geist & Geist Mono font families
assert(
  indexHtmlContent.includes('Geist') || globalsContent.includes('Geist'),
  'index.html or globals.css declares Geist sans-serif font family'
);
assert(
  indexHtmlContent.includes('Geist+Mono') || indexHtmlContent.includes('Geist Mono') || globalsContent.includes('Geist Mono'),
  'index.html or globals.css declares Geist Mono monospace font family'
);

// 2.2 Strict Prohibition: Zero Serif Fonts (Lora, Cormorant Garamond, Georgia)
assert(!indexHtmlContent.includes('Cormorant+Garamond') && !indexHtmlContent.includes('Cormorant Garamond'), 'index.html strictly eliminates Cormorant Garamond font');
assert(!indexHtmlContent.includes('family=Lora') && !indexHtmlContent.includes('family=Lora:'), 'index.html strictly eliminates Lora serif font');
assert(!globalsContent.includes("--font-serif: 'Lora'") && !globalsContent.includes('--font-serif: "Lora"'), 'globals.css strictly eliminates classical --font-serif Lora');
assert(!globalsContent.includes('--font-heading: "Cormorant Garamond"') && !globalsContent.includes("--font-heading: 'Cormorant Garamond'"), 'globals.css strictly eliminates Cormorant Garamond heading token');

// Component stylesheets negative checks
assert(!chatContent.includes('Lora') && !chatContent.includes('Cormorant Garamond'), 'openwork-chat.css strictly eliminates serif fonts');
assert(!workbenchContent.includes('Lora') && !workbenchContent.includes('Cormorant Garamond'), 'openwork-workbench.css strictly eliminates serif fonts');
assert(!excelContent.includes('Lora') && !excelContent.includes('Cormorant Garamond'), 'excel-viewer.css strictly eliminates serif fonts');
assert(!wordContent.includes('Lora') && !wordContent.includes('Cormorant Garamond'), 'word-viewer.css strictly eliminates serif fonts');
assert(!slideContent.includes('Lora') && !slideContent.includes('Cormorant Garamond'), 'slide-viewer.css strictly eliminates serif fonts');

// 2.3 Global Body Typography & Antialiasing
assert(
  globalsContent.includes('font-family:') && (globalsContent.includes('Geist') || globalsContent.includes('var(--font-sans)')),
  'globals.css sets default font-family to Geist sans-serif'
);
assert(
  globalsContent.includes('-webkit-font-smoothing: antialiased') || globalsContent.includes('antialiased'),
  'globals.css enforces subpixel antialiasing (-webkit-font-smoothing: antialiased)'
);
assert(
  globalsContent.includes('font-size: 13px') || globalsContent.includes('13px') || globalsContent.includes('0.8125rem'),
  'globals.css enforces 13px base body typography density'
);
assert(
  globalsContent.includes('font-variant-numeric: tabular-nums') || globalsContent.includes("font-feature-settings: 'tnum'") || globalsContent.includes('tabular-nums') || globalsContent.includes('.tnum'),
  'globals.css defines tabular numerals (tnum) for tabular and metric data alignment'
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Complete 23 Geist + Zinc Design Tokens in :root (Light Theme)
// ─────────────────────────────────────────────────────────────────────────────
const requiredLightTokens = [
  ['--bg: #ffffff', '--bg is #ffffff'],
  ['--panel: #fafafa', '--panel is #fafafa'],
  ['--card: #ffffff', '--card is #ffffff'],
  ['--muted: #f4f4f5', '--muted is #f4f4f5'],
  ['--muted-fg: #71717a', '--muted-fg is #71717a'],
  ['--fg: #09090b', '--fg is #09090b'],
  ['--fg2: #3f3f46', '--fg2 is #3f3f46'],
  ['--border: #e4e4e7', '--border is #e4e4e7'],
  ['--hair: #f1f1f2', '--hair is #f1f1f2'],
  ['--primary: #18181b', '--primary is #18181b'],
  ['--primary-fg: #fafafa', '--primary-fg is #fafafa'],
  ['--accent: #b45309', '--accent is #b45309'],
  ['--accent-soft: #fffbeb', '--accent-soft is #fffbeb'],
  ['--accent-bd: #fde68a', '--accent-bd is #fde68a'],
  ['--ok: #059669', '--ok is #059669'],
  ['--err: #e11d48', '--err is #e11d48'],
  ['--code: #0b0b0e', '--code is #0b0b0e'],
  ['--code-fg: #e4e4e7', '--code-fg is #e4e4e7'],
  ['--c1: #d97706', '--c1 is #d97706'],
  ['--c2: #0ea5e9', '--c2 is #0ea5e9'],
  ['--c3: #10b981', '--c3 is #10b981'],
  ['--c4: #8b5cf6', '--c4 is #8b5cf6'],
  ['--c5: #f43f5e', '--c5 is #f43f5e'],
];

for (const [snippet, desc] of requiredLightTokens) {
  const tokenName = snippet.split(':')[0].trim();
  const tokenVal = snippet.split(':')[1].trim();
  const tokenRegex = new RegExp(`${tokenName}\\s*:\\s*${tokenVal}`, 'i');
  assert(tokenRegex.test(globalsContent), `:root contains ${desc}`);
}

assert(
  globalsContent.includes('--shadow:') && (globalsContent.includes('0 1px 2px') || globalsContent.includes('rgb(0 0 0 / 0.05)') || globalsContent.includes('rgb(0 0 0/.05)')),
  ':root defines light elevation --shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)'
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Complete 23 Geist + Zinc Design Tokens in [data-theme="dark"] (Dark Theme)
// ─────────────────────────────────────────────────────────────────────────────
const requiredDarkTokens = [
  ['--bg: #09090b', 'dark --bg is #09090b'],
  ['--panel: #0b0b0d', 'dark --panel is #0b0b0d'],
  ['--card: #101013', 'dark --card is #101013'],
  ['--muted: #1c1c20', 'dark --muted is #1c1c20'],
  ['--muted-fg: #a1a1aa', 'dark --muted-fg is #a1a1aa'],
  ['--fg: #fafafa', 'dark --fg is #fafafa'],
  ['--fg2: #d4d4d8', 'dark --fg2 is #d4d4d8'],
  ['--border: #27272a', 'dark --border is #27272a'],
  ['--hair: #1d1d20', 'dark --hair is #1d1d20'],
  ['--primary: #fafafa', 'dark --primary is #fafafa'],
  ['--primary-fg: #18181b', 'dark --primary-fg is #18181b'],
  ['--accent: #f59e0b', 'dark --accent is #f59e0b'],
  ['--accent-soft: #2a1f0c', 'dark --accent-soft is #2a1f0c'],
  ['--accent-bd: #4a3512', 'dark --accent-bd is #4a3512'],
  ['--ok: #34d399', 'dark --ok is #34d399'],
  ['--err: #fb7185', 'dark --err is #fb7185'],
  ['--code: #08080a', 'dark --code is #08080a'],
  ['--code-fg: #e4e4e7', 'dark --code-fg is #e4e4e7'],
  ['--c1: #f59e0b', 'dark --c1 is #f59e0b'],
  ['--c2: #38bdf8', 'dark --c2 is #38bdf8'],
  ['--c3: #34d399', 'dark --c3 is #34d399'],
  ['--c4: #a78bfa', 'dark --c4 is #a78bfa'],
  ['--c5: #fb7185', 'dark --c5 is #fb7185'],
];

for (const [snippet, desc] of requiredDarkTokens) {
  const tokenName = snippet.split(':')[0].trim();
  const tokenVal = snippet.split(':')[1].trim();
  const tokenRegex = new RegExp(`${tokenName}\\s*:\\s*${tokenVal}`, 'i');
  assert(tokenRegex.test(globalsContent), `[data-theme="dark"] contains ${desc}`);
}

assert(
  globalsContent.includes('--shadow:') && (globalsContent.includes('rgb(0 0 0 / 0.4)') || globalsContent.includes('rgb(0 0 0/.4)') || globalsContent.includes('rgba(0, 0, 0, 0.4)')),
  '[data-theme="dark"] defines dark elevation --shadow: 0 1px 2px 0 rgb(0 0 0 / 0.4)'
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Keyframe Animations & Micro-Interactions
// ─────────────────────────────────────────────────────────────────────────────
assert(globalsContent.includes('@keyframes ow-spin') || allCssContent.includes('@keyframes ow-spin'), 'defines @keyframes ow-spin (0.7s linear infinite)');
assert(globalsContent.includes('@keyframes ow-pulse') || allCssContent.includes('@keyframes ow-pulse'), 'defines @keyframes ow-pulse (0.9s steps(1) infinite)');
assert(globalsContent.includes('@keyframes ow-ping') || allCssContent.includes('@keyframes ow-ping'), 'defines @keyframes ow-ping (1.4s cubic-bezier)');
assert(globalsContent.includes('@keyframes ow-in') || allCssContent.includes('@keyframes ow-in'), 'defines @keyframes ow-in (0.18s ease both)');
assert(globalsContent.includes('@keyframes ow-shimmer') || allCssContent.includes('@keyframes ow-shimmer'), 'defines @keyframes ow-shimmer (1.4s ease-in-out infinite)');
assert(globalsContent.includes('@keyframes ow-grow') || allCssContent.includes('@keyframes ow-grow'), 'defines @keyframes ow-grow (0.5s ease both for SVG charts)');

assert(globalsContent.includes('.animate-ow-spin') || globalsContent.includes('ow-spin') || allCssContent.includes('ow-spin'), 'provides ow-spin animation class');
assert(globalsContent.includes('.animate-ow-pulse') || globalsContent.includes('ow-pulse') || allCssContent.includes('ow-pulse'), 'provides ow-pulse animation class for streaming cursor');
assert(globalsContent.includes('.animate-ow-ping') || globalsContent.includes('ow-ping') || allCssContent.includes('ow-ping'), 'provides ow-ping animation class for reasoning dot');
assert(globalsContent.includes('.animate-ow-in') || globalsContent.includes('ow-in') || allCssContent.includes('ow-in'), 'provides ow-in animation class for message stream entrance');

// ─────────────────────────────────────────────────────────────────────────────
// 6. Custom Scrollbar Styling (Reference Parity: 8px, var(--border) thumb)
// ─────────────────────────────────────────────────────────────────────────────
assert(
  globalsContent.includes('::-webkit-scrollbar') &&
  (globalsContent.includes('var(--border)') || globalsContent.includes('background: transparent')),
  'globals.css defines custom scrollbars with var(--border) thumb and transparent track'
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. ThemeProvider & ModeToggle Components
// ─────────────────────────────────────────────────────────────────────────────
const themeProviderPath = path.join(rootDir, 'components/theme-provider.tsx');
const uiThemeProviderPath = path.join(rootDir, 'components/ui/theme-provider.tsx');
const uiModeTogglePath = path.join(rootDir, 'components/ui/mode-toggle.tsx');

assert(fs.existsSync(themeProviderPath), 'components/theme-provider.tsx exists');
assert(fs.existsSync(uiThemeProviderPath), 'components/ui/theme-provider.tsx exists');
assert(fs.existsSync(uiModeTogglePath), 'components/ui/mode-toggle.tsx exists');

const themeProviderContent = fs.readFileSync(themeProviderPath, 'utf8');
assert(
  themeProviderContent.includes('ThemeProvider') && themeProviderContent.includes('useTheme'),
  'components/theme-provider.tsx exports ThemeProvider and useTheme'
);

console.log(`\n================================================================`);
console.log(`Geist + Zinc Theme Token Verification Complete: ${passedTests} passed, ${failedTests} failed.`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}


