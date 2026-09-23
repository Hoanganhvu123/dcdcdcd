import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('========================================================================');
console.log(' CHALLENGER 2 EMPIRICAL ADVERSARIAL SCAN & ANIMATION TIMING VERIFIER');
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

const globalsPath = path.join(rootDir, 'styles', 'globals.css');
const openworkDnaPath = path.join(rootDir, 'styles', 'openwork-dna.css');
const indexHtmlPath = path.join(rootDir, 'index.html');

check(fs.existsSync(globalsPath), 'globals.css exists');
check(fs.existsSync(openworkDnaPath), 'openwork-dna.css exists');
check(fs.existsSync(indexHtmlPath), 'index.html exists');

const globalsContent = fs.readFileSync(globalsPath, 'utf8');
const openworkContent = fs.readFileSync(openworkDnaPath, 'utf8');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

// =========================================================================
// 1. ADVERSARIAL TYPOGRAPHY SCAN: Hardcoded px in Typography
// =========================================================================
console.log('\n--- SECTION 1: ADVERSARIAL SCAN FOR HARDCODED PX IN TYPOGRAPHY ---');

const classicalRootTokens = [
  '--k3-font-size-xs', '--k3-font-size-sm', '--k3-font-size-md', '--k3-font-size-lg',
  '--k3-font-size-xl', '--k3-font-size-2xl', '--k3-font-size-3xl', '--k3-font-size-4xl',
  '--k3-line-height-xs', '--k3-line-height-sm', '--k3-line-height-md', '--k3-line-height-lg',
  '--k3-line-height-xl', '--k3-line-height-2xl', '--k3-line-height-3xl', '--k3-line-height-4xl'
];

for (const token of classicalRootTokens) {
  const regex = new RegExp(token + ':\\s*([^;]+);');
  const match = globalsContent.match(regex);
  if (match) {
    const val = match[1].trim();
    const hasPx = /\b\d+px\b/i.test(val);
    const usesRemOrEm = /(?:rem|em|%)\b/.test(val);
    check(!hasPx && usesRemOrEm, `Token ${token} uses fluid units (${val}) without hardcoded px`, { token, value: val });
  } else {
    check(false, `Token ${token} not found in globals.css`);
  }
}

const claudeFontTokens = [
  '--claude-font-size-xs', '--claude-font-size-sm', '--claude-font-size-base',
  '--claude-font-size-md', '--claude-font-size-lg', '--claude-font-size-xl', '--claude-font-size-2xl'
];

for (const token of claudeFontTokens) {
  const regex = new RegExp(token + ':\\s*([^;]+);');
  const match = openworkContent.match(regex);
  if (match) {
    const val = match[1].trim();
    const hasPx = /\b\d+px\b/i.test(val);
    const usesRemOrEm = /(?:rem|em|%)\b/.test(val);
    check(!hasPx && usesRemOrEm, `Claude token ${token} uses fluid units (${val}) without hardcoded px`, { token, value: val });
  } else {
    check(false, `Claude token ${token} not found in openwork-dna.css`);
  }
}

const classicalComponentRegexes = [
  { name: '.btn-classical font-size', pattern: /\.btn-classical[\s\S]*?font-size:\s*([^;]+);/ },
  { name: '.card-kicker font-size', pattern: /\.card-kicker[\s\S]*?font-size:\s*([^;]+);/ },
  { name: '.card-title font-size', pattern: /\.card-title[\s\S]*?font-size:\s*([^;]+);/ },
  { name: '.card-body font-size', pattern: /\.card-body[\s\S]*?font-size:\s*([^;]+);/ },
  { name: '.card-meta font-size', pattern: /\.card-meta[\s\S]*?font-size:\s*([^;]+);/ },
  { name: '.tag-classical font-size', pattern: /\.tag-classical[\s\S]*?font-size:\s*([^;]+);/ },
  { name: '.table-classical font-size', pattern: /\.table-classical[\s\S]*?font-size:\s*([^;]+);/ },
  { name: '.table-classical th font-size', pattern: /\.table-classical th[\s\S]*?font-size:\s*([^;]+);/ }
];

for (const item of classicalComponentRegexes) {
  const match = openworkContent.match(item.pattern);
  if (match) {
    const val = match[1].trim();
    const hasPx = /\b\d+px\b/i.test(val);
    const usesFluid = /(?:rem|em|%)\b/.test(val);
    check(!hasPx && usesFluid, `${item.name} uses fluid units (${val})`, { value: val });
  } else {
    check(false, `${item.name} pattern not found in openwork-dna.css`);
  }
}

// =========================================================================
// 2. FONT FALLBACK INTEGRITY SCAN
// =========================================================================
console.log('\n--- SECTION 2: FONT FALLBACK INTEGRITY SCAN ---');

const headingFontMatch = globalsContent.match(/--font-heading:\s*([^;]+);/);
check(
  headingFontMatch &&
  headingFontMatch[1].includes('Cormorant Garamond') &&
  (headingFontMatch[1].includes('Georgia') || headingFontMatch[1].includes('serif')),
  '--font-heading defines Cormorant Garamond with Georgia/serif fallback',
  { value: headingFontMatch ? headingFontMatch[1] : null }
);

const serifFontMatch = globalsContent.match(/--font-serif:\s*([^;]+);/);
check(
  serifFontMatch &&
  serifFontMatch[1].includes('Lora') &&
  (serifFontMatch[1].includes('Georgia') || serifFontMatch[1].includes('serif')),
  '--font-serif defines Lora with Georgia/serif fallback',
  { value: serifFontMatch ? serifFontMatch[1] : null }
);

const sansFontMatch = globalsContent.match(/--font-sans:\s*([^;]+);/);
check(
  sansFontMatch &&
  sansFontMatch[1].includes('Instrument Sans') &&
  sansFontMatch[1].includes('system-ui') &&
  sansFontMatch[1].includes('sans-serif'),
  '--font-sans defines Instrument Sans with system-ui and sans-serif fallbacks',
  { value: sansFontMatch ? sansFontMatch[1] : null }
);

const monoFontMatch = globalsContent.match(/--font-mono:\s*([^;]+);/);
check(
  monoFontMatch &&
  monoFontMatch[1].includes('JetBrains Mono') &&
  monoFontMatch[1].includes('monospace'),
  '--font-mono defines JetBrains Mono with monospace fallbacks',
  { value: monoFontMatch ? monoFontMatch[1] : null }
);

check(indexHtmlContent.includes('rel="preconnect" href="https://fonts.googleapis.com"'), 'index.html has preconnect to fonts.googleapis.com');
check(indexHtmlContent.includes('rel="preconnect" href="https://fonts.gstatic.com" crossorigin'), 'index.html has preconnect to fonts.gstatic.com with crossorigin');
check(indexHtmlContent.includes('family=Cormorant+Garamond:ital,wght@0,400..700;1,400..700'), 'index.html imports full Cormorant Garamond variable weight axis (400-700)');
check(indexHtmlContent.includes('family=Lora:ital,wght@0,400..700;1,400..700'), 'index.html imports full Lora variable weight axis (400-700)');
check(indexHtmlContent.includes('family=Instrument+Sans:ital,wght@0,400..700;1,400..700'), 'index.html imports full Instrument Sans variable weight axis (400-700)');
check(indexHtmlContent.includes('family=JetBrains+Mono:wght@400;500;600'), 'index.html imports JetBrains Mono (400, 500, 600)');
check(indexHtmlContent.includes('display=swap'), 'index.html specifies display=swap for seamless font rendering');

// =========================================================================
// 3. KEYFRAME ANIMATIONS & TIMING JANK VERIFICATION
// =========================================================================
console.log('\n--- SECTION 3: KEYFRAME ANIMATION TIMINGS & JANK SCAN ---');

const cuccuPulseKeyframes = openworkContent.match(/@keyframes cuccuPulse\s*\{([\s\S]*?)\n\}/);
check(!!cuccuPulseKeyframes, '@keyframes cuccuPulse is declared');
if (cuccuPulseKeyframes) {
  const kfBody = cuccuPulseKeyframes[1];
  check(kfBody.includes('transform: scale(') && kfBody.includes('opacity:') && kfBody.includes('box-shadow:'), 'cuccuPulse animates transform/opacity/box-shadow safely');
  check(!kfBody.includes('width:') && !kfBody.includes('height:') && !kfBody.includes('margin:'), 'cuccuPulse does not animate layout dimensions (zero reflow jank)');
}

const cuccuPulseUtility = openworkContent.match(/\.animate-cuccu-pulse\s*\{([\s\S]*?)\}/);
check(!!cuccuPulseUtility, '.animate-cuccu-pulse utility class declared');
if (cuccuPulseUtility) {
  check(/animation:\s*cuccuPulse\s+1\.4s\s+ease-in-out\s+infinite/.test(cuccuPulseUtility[1]), '.animate-cuccu-pulse timing is 1.4s ease-in-out infinite');
}

const cuccuUpKeyframes = openworkContent.match(/@keyframes cuccuUp\s*\{([\s\S]*?)\n\}/);
check(!!cuccuUpKeyframes, '@keyframes cuccuUp is declared');
if (cuccuUpKeyframes) {
  const kfBody = cuccuUpKeyframes[1];
  check(kfBody.includes('translateY(6px)') && kfBody.includes('opacity: 0') && kfBody.includes('translateY(0)') && kfBody.includes('opacity: 1'), 'cuccuUp provides smooth 6px upward glide with opacity reveal');
  check(!kfBody.includes('top:') && !kfBody.includes('bottom:'), 'cuccuUp uses compositor translateY instead of top/bottom positioning (compositor-only)');
}

const cuccuUpUtility = openworkContent.match(/\.animate-cuccu-up\s*\{([\s\S]*?)\}/);
check(!!cuccuUpUtility, '.animate-cuccu-up utility class declared');
if (cuccuUpUtility) {
  check(/animation:\s*cuccuUp\s+0\.3s\s+cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)\s+forwards/.test(cuccuUpUtility[1]), '.animate-cuccu-up timing is 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards');
}

const cuccuCaretKeyframes = openworkContent.match(/@keyframes cuccuCaret\s*\{([\s\S]*?)\n\}/);
check(!!cuccuCaretKeyframes, '@keyframes cuccuCaret is declared');
if (cuccuCaretKeyframes) {
  const kfBody = cuccuCaretKeyframes[1];
  check(kfBody.includes('0%, 100%') && kfBody.includes('opacity: 1') && kfBody.includes('50%') && kfBody.includes('opacity: 0'), 'cuccuCaret has 50% opacity step toggle');
}

const cuccuCaretUtility = openworkContent.match(/\.animate-cuccu-caret\s*\{([\s\S]*?)\}/);
check(!!cuccuCaretUtility, '.animate-cuccu-caret utility class declared');
if (cuccuCaretUtility) {
  check(/animation:\s*cuccuCaret\s+0\.9s\s+steps\(1\)\s+infinite/.test(cuccuCaretUtility[1]), '.animate-cuccu-caret timing is 0.9s steps(1) infinite');
}

const cuccuSpinKeyframes = openworkContent.match(/@keyframes cuccuSpin\s*\{([\s\S]*?)\n\}/);
check(!!cuccuSpinKeyframes, '@keyframes cuccuSpin is declared');
if (cuccuSpinKeyframes) {
  const kfBody = cuccuSpinKeyframes[1];
  check(kfBody.includes('transform: rotate(360deg)'), 'cuccuSpin performs 360deg rotation');
}

const cuccuSpinUtility = openworkContent.match(/\.animate-cuccu-spin\s*\{([\s\S]*?)\}/);
check(!!cuccuSpinUtility, '.animate-cuccu-spin utility class declared');
if (cuccuSpinUtility) {
  check(/animation:\s*cuccuSpin\s+0\.7s\s+linear\s+infinite/.test(cuccuSpinUtility[1]), '.animate-cuccu-spin timing is 0.7s linear infinite');
}

const cuccuShimmerKeyframes = openworkContent.match(/@keyframes cuccuShimmer\s*\{([\s\S]*?)\n\}/);
check(!!cuccuShimmerKeyframes, '@keyframes cuccuShimmer is declared');
if (cuccuShimmerKeyframes) {
  const kfBody = cuccuShimmerKeyframes[1];
  check(kfBody.includes('background-position: -200% 0') && kfBody.includes('background-position: 200% 0'), 'cuccuShimmer provides seamless background translation');
}

const cuccuShimmerUtility = openworkContent.match(/\.animate-cuccu-shimmer\s*\{([\s\S]*?)\}/);
check(!!cuccuShimmerUtility, '.animate-cuccu-shimmer utility class declared');
if (cuccuShimmerUtility) {
  check(/animation:\s*cuccuShimmer\s+1\.4s\s+linear\s+infinite/.test(cuccuShimmerUtility[1]), '.animate-cuccu-shimmer timing is 1.4s linear infinite');
}

const panelTransition = openworkContent.match(/\.retractable-panel-transition\s*\{([\s\S]*?)\}/);
check(!!panelTransition, '.retractable-panel-transition utility class declared');
if (panelTransition) {
  check(panelTransition[1].includes('cubic-bezier(0.16, 1, 0.3, 1)'), '.retractable-panel-transition uses smooth spring easing cubic-bezier(0.16, 1, 0.3, 1)');
}

// =========================================================================
// 4. CSS SYNTAX & BRACE INTEGRITY SCAN
// =========================================================================
console.log('\n--- SECTION 4: CSS SYNTAX & BRACE INTEGRITY SCAN ---');

function checkBraceBalance(content, filename) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let lineNumber = 1;
  const errors = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '\n') {
      lineNumber++;
    }

    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inComment = true;
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth < 0) {
        errors.push(`Unmatched closing brace at line ${lineNumber}`);
      }
    }
  }

  if (depth !== 0) {
    errors.push(`Unmatched opening braces (depth remaining: ${depth})`);
  }

  return { isBalanced: depth === 0 && errors.length === 0, errors };
}

const globalsBraces = checkBraceBalance(globalsContent, 'globals.css');
check(globalsBraces.isBalanced, 'globals.css has 100% balanced braces and valid block nesting', { errors: globalsBraces.errors });

const openworkBraces = checkBraceBalance(openworkContent, 'openwork-dna.css');
check(openworkBraces.isBalanced, 'openwork-dna.css has 100% balanced braces and valid block nesting', { errors: openworkBraces.errors });

console.log('\n========================================================================');
console.log(` SCAN COMPLETE: ${passedChecks} checks passed, ${failedChecks} checks failed.`);
console.log('========================================================================\n');

if (failedChecks > 0) {
  console.error('FAILURES RECORDED:', JSON.stringify(failures, null, 2));
  process.exit(1);
} else {
  console.log('ALL ADVERSARIAL SCAN CHECKS PASSED WITH ZERO ERRORS.');
  process.exit(0);
}
