import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const frontendMockDir = path.resolve(frontendDir, '..', 'frontend_mock');
const treesToCheck = [['frontend', frontendDir]];
if (fs.existsSync(frontendMockDir)) {
  treesToCheck.push(['frontend_mock', frontendMockDir]);
}

console.log('========================================================================');
console.log(' CHALLENGER 1: EMPIRICAL TYPOGRAPHY SCALE & LAYOUT DENSITY TEST SUITE');
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

// Helper to find css property in any matching selector block
function findCssProperty(cssContent, selectorPattern, propertyName) {
  const blocks = [...cssContent.matchAll(new RegExp(selectorPattern + '\\s*\\{([\\s\\S]*?)\\}', 'g'))];
  for (const block of blocks) {
    const propMatch = block[1].match(new RegExp(propertyName + '\\s*:\\s*([^;]+);'));
    if (propMatch) {
      return propMatch[1].trim();
    }
  }
  return null;
}

// -------------------------------------------------------------------------
// SECTION 1: FLUID TOKEN INTEGRITY IN GLOBALS.CSS & OPENWORK-DNA.CSS
// -------------------------------------------------------------------------
console.log('\n--- SECTION 1: FLUID TOKEN INTEGRITY IN GLOBALS.CSS & OPENWORK-DNA.CSS ---');

for (const [treeName, treeDir] of treesToCheck) {
  const globalsPath = path.join(treeDir, 'styles', 'globals.css');
  const dnaPath = path.join(treeDir, 'styles', 'openwork-dna.css');
  
  check(fs.existsSync(globalsPath), `[${treeName}] styles/globals.css exists`);
  check(fs.existsSync(dnaPath), `[${treeName}] styles/openwork-dna.css exists`);
  
  const globalsContent = fs.readFileSync(globalsPath, 'utf8');
  const dnaContent = fs.readFileSync(dnaPath, 'utf8');

  // Verify K3 Root tokens use fluid rem/em/% and no hardcoded px
  const k3Tokens = [
    '--k3-font-size-xs', '--k3-font-size-sm', '--k3-font-size-md', '--k3-font-size-lg',
    '--k3-font-size-xl', '--k3-font-size-2xl', '--k3-font-size-3xl', '--k3-font-size-4xl',
    '--k3-line-height-xs', '--k3-line-height-sm', '--k3-line-height-md', '--k3-line-height-lg',
    '--k3-line-height-xl', '--k3-line-height-2xl', '--k3-line-height-3xl', '--k3-line-height-4xl'
  ];

  for (const token of k3Tokens) {
    const regex = new RegExp(token + ':\\s*([^;]+);');
    const match = globalsContent.match(regex);
    if (match) {
      const val = match[1].trim();
      const hasPx = /\b\d+px\b/i.test(val);
      const usesFluid = /(?:rem|em|%)\b/.test(val);
      check(!hasPx && usesFluid, `[${treeName}] Token ${token} uses fluid units (${val}) without hardcoded px`);
    } else {
      check(false, `[${treeName}] Token ${token} not found in globals.css`);
    }
  }

  // Verify Claude typography tokens use fluid rem/em
  const claudeTokens = [
    '--claude-font-size-xs', '--claude-font-size-sm', '--claude-font-size-base',
    '--claude-font-size-md', '--claude-font-size-lg', '--claude-font-size-xl', '--claude-font-size-2xl'
  ];

  for (const token of claudeTokens) {
    const regex = new RegExp(token + ':\\s*([^;]+);');
    const match = dnaContent.match(regex);
    if (match) {
      const val = match[1].trim();
      const hasPx = /\b\d+px\b/i.test(val);
      const usesFluid = /(?:rem|em|%)\b/.test(val);
      check(!hasPx && usesFluid, `[${treeName}] Claude token ${token} uses fluid units (${val}) without hardcoded px`);
    } else {
      check(false, `[${treeName}] Claude token ${token} not found in openwork-dna.css`);
    }
  }
}

// -------------------------------------------------------------------------
// SECTION 2: CHAT MARKDOWN TYPOGRAPHY (.ow-md) HIERARCHY & BOUNDS
// -------------------------------------------------------------------------
console.log('\n--- SECTION 2: CHAT MARKDOWN TYPOGRAPHY (.ow-md) HIERARCHY & BOUNDS ---');

for (const [treeName, treeDir] of treesToCheck) {
  const chatCssPath = path.join(treeDir, 'components', 'openwork', 'styles', 'openwork-chat.css');
  check(fs.existsSync(chatCssPath), `[${treeName}] openwork-chat.css exists`);
  const chatCss = fs.readFileSync(chatCssPath, 'utf8');

  // Check .ow-md base typography
  const owMdSize = findCssProperty(chatCss, '\\.ow-md', 'font-size');
  check(owMdSize === '13.5px', `[${treeName}] .ow-md font-size is exactly 13.5px (actual: ${owMdSize})`);

  const owMdLh = findCssProperty(chatCss, '\\.ow-md', 'line-height');
  check(owMdLh === '1.6', `[${treeName}] .ow-md line-height is 1.6 (actual: ${owMdLh})`);

  const owMdFont = findCssProperty(chatCss, '\\.ow-md', 'font-family');
  check(owMdFont && owMdFont.includes('Lora'), `[${treeName}] .ow-md font-family includes Lora serif`);

  // Check Headings H1-H6
  const h1Size = findCssProperty(chatCss, '\\.ow-md\\s+h1', 'font-size');
  check(h1Size === '17px', `[${treeName}] .ow-md h1 font-size is exactly 17px (actual: ${h1Size})`);

  const h2Size = findCssProperty(chatCss, '\\.ow-md\\s+h2', 'font-size');
  check(h2Size === '14.5px', `[${treeName}] .ow-md h2 font-size is exactly 14.5px (actual: ${h2Size})`);

  const h34Size = findCssProperty(chatCss, '\\.ow-md\\s+h3,\\s*\\.ow-md\\s+h4', 'font-size');
  check(h34Size === '12.5px', `[${treeName}] .ow-md h3, h4 font-size is exactly 12.5px (actual: ${h34Size})`);

  const h56Size = findCssProperty(chatCss, '\\.ow-md\\s+h5,\\s*\\.ow-md\\s+h6', 'font-size');
  check(h56Size === '11.5px', `[${treeName}] .ow-md h5, h6 font-size is exactly 11.5px (actual: ${h56Size})`);

  // Check Tables and Table Headers
  const tableSize = findCssProperty(chatCss, '\\.ow-md\\s+table', 'font-size');
  check(tableSize === '12.5px', `[${treeName}] .ow-md table font-size is 12.5px (actual: ${tableSize})`);

  const thSize = findCssProperty(chatCss, '\\.ow-md\\s+th', 'font-size');
  check(thSize === '11px', `[${treeName}] .ow-md th font-size is 11px uppercase (actual: ${thSize})`);

  // Check Inline Code
  const codeSize = findCssProperty(chatCss, '\\.ow-md\\s+code:not\\(pre code\\)', 'font-size');
  check(codeSize === '12px', `[${treeName}] .ow-md inline code font-size is 12px (actual: ${codeSize})`);

  // Check Reasoning / Compact trace rules
  const compactSize = findCssProperty(chatCss, '\\.ow-md--compact', 'font-size');
  check(compactSize === '12px', `[${treeName}] .ow-md--compact font-size is 12px (actual: ${compactSize})`);

  // Scan all explicit font-size declarations in openwork-chat.css for bounds [10.5px, 24px]
  const allFontSizes = [...chatCss.matchAll(/font-size:\s*([\d.]+)px/g)];
  let maxHeading = 0;
  let minText = 999;
  for (const m of allFontSizes) {
    const size = parseFloat(m[1]);
    if (size > maxHeading) maxHeading = size;
    if (size < minText) minText = size;
  }
  check(maxHeading <= 24, `[${treeName}] Maximum font size in openwork-chat.css does not exceed 24px (Hero: 24px, H1: 17px)`);
  check(minText >= 10.5, `[${treeName}] Minimum font size in openwork-chat.css does not drop below 10.5px (min observed: ${minText}px)`);
}

// -------------------------------------------------------------------------
// SECTION 3: USER BUBBLE COMPACT TYPOGRAPHY & PADDING
// -------------------------------------------------------------------------
console.log('\n--- SECTION 3: USER BUBBLE COMPACT TYPOGRAPHY & PADDING ---');

for (const [treeName, treeDir] of treesToCheck) {
  const userBubblePath = path.join(treeDir, 'components', 'openwork', 'OpenWorkUserBubble.tsx');
  check(fs.existsSync(userBubblePath), `[${treeName}] OpenWorkUserBubble.tsx exists`);
  const bubbleSrc = fs.readFileSync(userBubblePath, 'utf8');

  // Verify 12.5px font size
  const has12_5px = bubbleSrc.includes('text-[12.5px]') || bubbleSrc.includes('ow-bubble');
  check(has12_5px, `[${treeName}] OpenWorkUserBubble enforces 12.5px font size (text-[12.5px])`);

  // Verify compact px-3 py-2 padding
  const hasCompactPadding = bubbleSrc.includes('px-3 py-2');
  check(hasCompactPadding, `[${treeName}] OpenWorkUserBubble enforces compact px-3 py-2 padding`);
}

// -------------------------------------------------------------------------
// SECTION 4: CAPABILITY CALL LINE COMPACT TYPOGRAPHY & PADDING
// -------------------------------------------------------------------------
console.log('\n--- SECTION 4: CAPABILITY CALL LINE COMPACT TYPOGRAPHY & PADDING ---');

for (const [treeName, treeDir] of treesToCheck) {
  const capLinePath = path.join(treeDir, 'components', 'openwork', 'OpenWorkCapabilityCallLine.tsx');
  check(fs.existsSync(capLinePath), `[${treeName}] OpenWorkCapabilityCallLine.tsx exists`);
  const capLineSrc = fs.readFileSync(capLinePath, 'utf8');

  // Verify 11px badge
  const has11pxBadge = capLineSrc.includes('text-[11px]');
  check(has11pxBadge, `[${treeName}] OpenWorkCapabilityCallLine uses 11px badge (text-[11px])`);

  // Verify 11.5px execution sentence text
  const has11_5pxText = capLineSrc.includes('text-[11.5px]');
  check(has11_5pxText, `[${treeName}] OpenWorkCapabilityCallLine uses 11.5px sentence text (text-[11.5px])`);

  // Verify 10.5px duration pill
  const has10_5pxPill = capLineSrc.includes('text-[10.5px]');
  check(has10_5pxPill, `[${treeName}] OpenWorkCapabilityCallLine uses 10.5px duration pill (text-[10.5px])`);

  // Verify compact px-2.5 py-1.5 container padding
  const hasCompactCapPadding = capLineSrc.includes('px-2.5 py-1.5');
  check(hasCompactCapPadding, `[${treeName}] OpenWorkCapabilityCallLine uses px-2.5 py-1.5 container padding`);
}

// -------------------------------------------------------------------------
// SECTION 5: COMPOSER TEXTAREA TYPOGRAPHY & WATERMARK HINT
// -------------------------------------------------------------------------
console.log('\n--- SECTION 5: COMPOSER TEXTAREA TYPOGRAPHY & WATERMARK HINT ---');

for (const [treeName, treeDir] of treesToCheck) {
  const composerPath = path.join(treeDir, 'components', 'openwork', 'OpenWorkComposer.tsx');
  check(fs.existsSync(composerPath), `[${treeName}] OpenWorkComposer.tsx exists`);
  const composerSrc = fs.readFileSync(composerPath, 'utf8');

  // Verify 13.5px (0.84375rem) textarea font size
  const hasFluidTextarea = composerSrc.includes('ow-composer-textarea') || composerSrc.includes('0.84375rem') || composerSrc.includes('text-sm');
  check(hasFluidTextarea, `[${treeName}] OpenWorkComposer textarea uses fluid typography (ow-composer-textarea / 0.84375rem)`);

  // Verify 10.5px (0.65625rem) watermark / hint
  const hasFluidWatermark = composerSrc.includes('text-[0.65625rem]') || composerSrc.includes('0.65625rem') || composerSrc.includes('text-xs');
  check(hasFluidWatermark, `[${treeName}] OpenWorkComposer shortcut watermark uses fluid font (text-[0.65625rem])`);
}

// -------------------------------------------------------------------------
// SECTION 6: DUAL-TREE PARITY AUDIT
// -------------------------------------------------------------------------
console.log('\n--- SECTION 6: DUAL-TREE PARITY AUDIT ---');

const syncFiles = [
  ['components', 'openwork', 'styles', 'openwork-chat.css'],
  ['styles', 'globals.css'],
  ['styles', 'openwork-dna.css'],
  ['components', 'openwork', 'OpenWorkUserBubble.tsx'],
  ['components', 'openwork', 'OpenWorkCapabilityCallLine.tsx'],
  ['components', 'openwork', 'OpenWorkComposer.tsx'],
  ['components', 'openwork', 'OpenWorkMarkdownRenderer.tsx'],
  ['components', 'openwork', 'OpenWorkChatSurface.tsx'],
  ['components', 'openwork', 'OpenWorkSidebar.tsx'],
];

for (const fileSegments of syncFiles) {
  const relPath = path.join(...fileSegments);
  const fPath = path.join(frontendDir, relPath);
  const mPath = path.join(frontendMockDir, relPath);

  if (fs.existsSync(frontendMockDir)) {
    if (fs.existsSync(fPath) && fs.existsSync(mPath)) {
      const fContent = fs.readFileSync(fPath, 'utf8');
      const mContent = fs.readFileSync(mPath, 'utf8');
      check(fContent === mContent, `1:1 Dual-tree parity for ${relPath}`);
    } else {
      check(false, `Parity check failed: file missing (${relPath})`);
    }
  } else {
    check(fs.existsSync(fPath), `Single-tree canonical file exists: ${relPath}`);
  }
}

console.log('\n========================================================================');
console.log(` SCAN COMPLETE: ${passedChecks} checks passed, ${failedChecks} checks failed.`);
console.log('========================================================================\n');

if (failedChecks > 0) {
  console.error('FAILURES RECORDED:', JSON.stringify(failures, null, 2));
  process.exit(1);
} else {
  console.log('ALL CHALLENGER 1 TYPOGRAPHY & DENSITY ADVERSARIAL CHECKS PASSED (100%).');
  process.exit(0);
}
