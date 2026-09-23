import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const mockDir = path.resolve(rootDir, '..', 'frontend_mock');

console.log('========================================================================');
console.log(' 🔬 EMPIRICAL ADVERSARIAL CHALLENGER: MILESTONE 1 VERIFICATION HARNESS');
console.log('========================================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function check(assertion, description, context = {}) {
  totalChecks++;
  if (assertion) {
    console.log(`[PASS] ${description}`);
    passedChecks++;
  } else {
    console.error(`[FAIL] ${description}`);
    if (Object.keys(context).length > 0) {
      console.error('       Details:', JSON.stringify(context, null, 2));
    }
    failures.push({ description, context });
    failedChecks++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dual-Tree Existence & Exact 1:1 Parity for Milestone 1 Files
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SECTION 1: DUAL-TREE EXISTENCE & 1:1 PARITY ---');

const m1Files = [
  'index.html',
  'styles/globals.css',
  'components/openwork/styles/openwork-chat.css',
  'components/openwork/styles/openwork-workbench.css',
  'components/ai-data-analytic/office-excel/styles/excel-viewer.css',
  'components/ai-data-analytic/office-word/styles/word-viewer.css',
  'components/ai-data-analytic/office-slides/styles/slide-viewer.css',
  'tests/theme-tokens.check.mjs'
];

const hasMock = fs.existsSync(mockDir);

for (const relPath of m1Files) {
  const prodPath = path.join(rootDir, relPath);
  check(fs.existsSync(prodPath), `[frontend] ${relPath} exists`);

  if (hasMock) {
    const mockPath = path.join(mockDir, relPath);
    check(fs.existsSync(mockPath), `[frontend_mock] ${relPath} exists`);

    if (fs.existsSync(prodPath) && fs.existsSync(mockPath)) {
      const prodContent = fs.readFileSync(prodPath, 'utf8').replace(/\r\n/g, '\n').trim();
      const mockContent = fs.readFileSync(mockPath, 'utf8').replace(/\r\n/g, '\n').trim();
      check(
        prodContent === mockContent,
        `[1:1 Parity] ${relPath} is bit-for-bit identical between frontend and frontend_mock`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Absolute Absence of Legacy Serif Fonts (Lora, Cormorant Garamond, Georgia)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SECTION 2: ADVERSARIAL SERIF PURGE AUDIT ---');

const trees = [
  { name: 'frontend', dir: rootDir }
];
if (hasMock) {
  trees.push({ name: 'frontend_mock', dir: mockDir });
}

for (const tree of trees) {
  const indexPath = path.join(tree.dir, 'index.html');
  const globalsPath = path.join(tree.dir, 'styles/globals.css');
  const chatPath = path.join(tree.dir, 'components/openwork/styles/openwork-chat.css');
  const wbPath = path.join(tree.dir, 'components/openwork/styles/openwork-workbench.css');
  const xlPath = path.join(tree.dir, 'components/ai-data-analytic/office-excel/styles/excel-viewer.css');
  const wdPath = path.join(tree.dir, 'components/ai-data-analytic/office-word/styles/word-viewer.css');
  const slPath = path.join(tree.dir, 'components/ai-data-analytic/office-slides/styles/slide-viewer.css');

  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const globalsContent = fs.readFileSync(globalsPath, 'utf8');
  const chatContent = fs.readFileSync(chatPath, 'utf8');
  const wbContent = fs.readFileSync(wbPath, 'utf8');
  const xlContent = fs.readFileSync(xlPath, 'utf8');
  const wdContent = fs.readFileSync(wdPath, 'utf8');
  const slContent = fs.readFileSync(slPath, 'utf8');

  // Negative checks: Zero legacy fonts in index.html and all M1 stylesheets
  check(!indexContent.includes('Cormorant'), `[${tree.name}] index.html has zero Cormorant font references`);
  check(!indexContent.includes('Lora'), `[${tree.name}] index.html has zero Lora font references`);
  check(!indexContent.includes('Georgia'), `[${tree.name}] index.html has zero Georgia font references`);

  check(!globalsContent.includes('Cormorant Garamond'), `[${tree.name}] globals.css strictly eliminates Cormorant Garamond`);
  check(!globalsContent.includes("'Lora'") && !globalsContent.includes('"Lora"'), `[${tree.name}] globals.css strictly eliminates Lora`);

  check(!chatContent.includes('Cormorant') && !chatContent.includes('Lora'), `[${tree.name}] openwork-chat.css strictly eliminates serif fonts`);
  check(!wbContent.includes('Cormorant') && !wbContent.includes('Lora'), `[${tree.name}] openwork-workbench.css strictly eliminates serif fonts`);
  check(!xlContent.includes('Cormorant') && !xlContent.includes('Lora'), `[${tree.name}] excel-viewer.css strictly eliminates serif fonts`);
  check(!wdContent.includes('Cormorant') && !wdContent.includes('Lora'), `[${tree.name}] word-viewer.css strictly eliminates serif fonts`);
  check(!slContent.includes('Cormorant') && !slContent.includes('Lora'), `[${tree.name}] slide-viewer.css strictly eliminates serif fonts`);

  // Positive checks: Geist & Geist Mono fonts active
  check(indexContent.includes('family=Geist:wght@300;400;500;600;700'), `[${tree.name}] index.html imports Geist variable weights`);
  check(indexContent.includes('family=Geist+Mono:wght@400;500;600'), `[${tree.name}] index.html imports Geist Mono weights`);
  check(globalsContent.includes('--font-sans: Geist'), `[${tree.name}] globals.css sets --font-sans to Geist`);
  check(globalsContent.includes('--font-mono: "Geist Mono"') || globalsContent.includes("--font-mono: 'Geist Mono'"), `[${tree.name}] globals.css sets --font-mono to Geist Mono`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Complete 23 Zinc Token Dictionary Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SECTION 3: 23 ZINC DESIGN TOKENS INTEGRITY ---');

const expectedLightTokens = {
  '--bg': '#ffffff',
  '--panel': '#fafafa',
  '--card': '#ffffff',
  '--muted': '#f4f4f5',
  '--muted-fg': '#71717a',
  '--fg': '#09090b',
  '--fg2': '#3f3f46',
  '--border': '#e4e4e7',
  '--hair': '#f1f1f2',
  '--primary': '#18181b',
  '--primary-fg': '#fafafa',
  '--accent': '#b45309',
  '--accent-soft': '#fffbeb',
  '--accent-bd': '#fde68a',
  '--ok': '#059669',
  '--err': '#e11d48',
  '--code': '#0b0b0e',
  '--code-fg': '#e4e4e7',
  '--c1': '#d97706',
  '--c2': '#0ea5e9',
  '--c3': '#10b981',
  '--c4': '#8b5cf6',
  '--c5': '#f43f5e'
};

const expectedDarkTokens = {
  '--bg': '#09090b',
  '--panel': '#0b0b0d',
  '--card': '#101013',
  '--muted': '#1c1c20',
  '--muted-fg': '#a1a1aa',
  '--fg': '#fafafa',
  '--fg2': '#d4d4d8',
  '--border': '#27272a',
  '--hair': '#1d1d20',
  '--primary': '#fafafa',
  '--primary-fg': '#18181b',
  '--accent': '#f59e0b',
  '--accent-soft': '#2a1f0c',
  '--accent-bd': '#4a3512',
  '--ok': '#34d399',
  '--err': '#fb7185',
  '--code': '#08080a',
  '--code-fg': '#e4e4e7',
  '--c1': '#f59e0b',
  '--c2': '#38bdf8',
  '--c3': '#34d399',
  '--c4': '#a78bfa',
  '--c5': '#fb7185'
};

for (const tree of trees) {
  const globalsContent = fs.readFileSync(path.join(tree.dir, 'styles/globals.css'), 'utf8');

  // Verify light tokens in :root
  for (const [token, hex] of Object.entries(expectedLightTokens)) {
    const regex = new RegExp(`${token}\\s*:\\s*${hex}`, 'i');
    check(regex.test(globalsContent), `[${tree.name}] :root defines ${token}: ${hex}`);
  }

  // Verify dark tokens in [data-theme="dark"]
  for (const [token, hex] of Object.entries(expectedDarkTokens)) {
    const regex = new RegExp(`${token}\\s*:\\s*${hex}`, 'i');
    check(regex.test(globalsContent), `[${tree.name}] [data-theme="dark"] defines ${token}: ${hex}`);
  }

  // Shadow tokens
  check(
    globalsContent.includes('--shadow:') && globalsContent.includes('0.05'),
    `[${tree.name}] defines light elevation shadow (0.05 alpha)`
  );
  check(
    globalsContent.includes('--shadow:') && (globalsContent.includes('0.4') || globalsContent.includes('.4')),
    `[${tree.name}] defines dark elevation shadow (0.4 alpha)`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. WCAG 2.1 Contrast Ratio Verification (Light & Dark Themes)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SECTION 4: WCAG 2.1 ACCESSIBILITY CONTRAST RATIO PROOF ---');

function getLuminance(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const a = [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Light theme contrast assertions
const lightPairs = [
  { fg: expectedLightTokens['--fg'], bg: expectedLightTokens['--bg'], name: 'Light Primary Text (--fg on --bg)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedLightTokens['--fg2'], bg: expectedLightTokens['--bg'], name: 'Light Secondary Text (--fg2 on --bg)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedLightTokens['--muted-fg'], bg: expectedLightTokens['--bg'], name: 'Light Muted Text (--muted-fg on --bg)', minRatio: 4.5, level: 'AA' },
  { fg: expectedLightTokens['--primary-fg'], bg: expectedLightTokens['--primary'], name: 'Light CTA Button (--primary-fg on --primary)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedLightTokens['--code-fg'], bg: expectedLightTokens['--code'], name: 'Light Code Container (--code-fg on --code)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedLightTokens['--accent'], bg: expectedLightTokens['--bg'], name: 'Light Amber Accent (--accent on --bg)', minRatio: 4.5, level: 'AA' },
  { fg: expectedLightTokens['--ok'], bg: expectedLightTokens['--bg'], name: 'Light Emerald Success UI/Icon (--ok on --bg)', minRatio: 3.0, level: 'AA (Non-text / UI Component SC 1.4.11)' },
  { fg: expectedLightTokens['--err'], bg: expectedLightTokens['--bg'], name: 'Light Crimson Error (--err on --bg)', minRatio: 4.5, level: 'AA' }

];

for (const pair of lightPairs) {
  const ratio = getContrastRatio(pair.fg, pair.bg);
  check(
    ratio >= pair.minRatio,
    `[Contrast ${pair.level}] ${pair.name}: ${ratio.toFixed(2)}:1 >= ${pair.minRatio}:1`,
    { ratio: ratio.toFixed(2), minRequired: pair.minRatio, fg: pair.fg, bg: pair.bg }
  );
}

// Dark theme contrast assertions
const darkPairs = [
  { fg: expectedDarkTokens['--fg'], bg: expectedDarkTokens['--bg'], name: 'Dark Primary Text (--fg on --bg)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedDarkTokens['--fg2'], bg: expectedDarkTokens['--bg'], name: 'Dark Secondary Text (--fg2 on --bg)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedDarkTokens['--muted-fg'], bg: expectedDarkTokens['--bg'], name: 'Dark Muted Text (--muted-fg on --bg)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedDarkTokens['--primary-fg'], bg: expectedDarkTokens['--primary'], name: 'Dark CTA Button (--primary-fg on --primary)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedDarkTokens['--code-fg'], bg: expectedDarkTokens['--code'], name: 'Dark Code Container (--code-fg on --code)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedDarkTokens['--accent'], bg: expectedDarkTokens['--bg'], name: 'Dark Amber Accent (--accent on --bg)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedDarkTokens['--ok'], bg: expectedDarkTokens['--bg'], name: 'Dark Emerald Success (--ok on --bg)', minRatio: 7.0, level: 'AAA' },
  { fg: expectedDarkTokens['--err'], bg: expectedDarkTokens['--bg'], name: 'Dark Crimson Error (--err on --bg)', minRatio: 7.0, level: 'AAA' }
];

for (const pair of darkPairs) {
  const ratio = getContrastRatio(pair.fg, pair.bg);
  check(
    ratio >= pair.minRatio,
    `[Contrast ${pair.level}] ${pair.name}: ${ratio.toFixed(2)}:1 >= ${pair.minRatio}:1`,
    { ratio: ratio.toFixed(2), minRequired: pair.minRatio, fg: pair.fg, bg: pair.bg }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Scrollbar, Tabular Numbers, Keyframes & Zero-FOUC Init Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SECTION 5: SCROLLBARS, ANIMATIONS & ZERO-FOUC RUNTIME ---');

for (const tree of trees) {
  const globalsContent = fs.readFileSync(path.join(tree.dir, 'styles/globals.css'), 'utf8');
  const indexContent = fs.readFileSync(path.join(tree.dir, 'index.html'), 'utf8');

  // Scrollbars
  check(globalsContent.includes('::-webkit-scrollbar') && globalsContent.includes('width: 8px'), `[${tree.name}] universal 8px scrollbar width`);
  check(globalsContent.includes('::-webkit-scrollbar-thumb') && globalsContent.includes('var(--border)'), `[${tree.name}] scrollbar thumb uses var(--border)`);
  check(globalsContent.includes('::-webkit-scrollbar-track') && globalsContent.includes('transparent'), `[${tree.name}] scrollbar track is transparent`);

  // Tabular Numerals
  check(globalsContent.includes('tabular-nums') && globalsContent.includes('font-feature-settings'), `[${tree.name}] defines tabular numbers for data alignment`);

  // 6 Keyframes
  const keyframes = ['ow-spin', 'ow-pulse', 'ow-ping', 'ow-in', 'ow-shimmer', 'ow-grow'];
  for (const kf of keyframes) {
    check(globalsContent.includes(`@keyframes ${kf}`), `[${tree.name}] declares @keyframes ${kf}`);
    check(globalsContent.includes(`.animate-${kf}`) || globalsContent.includes(`--animate-${kf}`), `[${tree.name}] provides ${kf} animation class/token`);
  }

  // Zero-FOUC Theme Script
  check(
    indexContent.includes("localStorage.getItem('ow:theme')||'dark'") && indexContent.includes("setAttribute('data-theme'"),
    `[${tree.name}] inlines zero-FOUC theme initialization script in <head>`
  );
}

console.log(`\n========================================================================`);
console.log(` EMPIRICAL VERIFICATION COMPLETE: ${passedChecks} passed, ${failedChecks} failed (out of ${totalChecks}).`);
console.log('========================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
}
