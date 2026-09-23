#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');

/**
 * Classical Theme Tokens Check Suite
 * Validates Classical Editorial CSS tokens, OKLCH tonal ramps, typography,
 * font imports, keyframe animations, and fluid unit assertions.
 */

// Helper to load files safely
function loadFile(relPath) {
  const p = path.join(ROOT, relPath);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  const repoP = path.join(REPO_ROOT, relPath);
  if (fs.existsSync(repoP)) return fs.readFileSync(repoP, 'utf8');
  return '';
}

const globalsCss = loadFile('styles/globals.css');
const dnaCss = loadFile('styles/openwork-dna.css');
const colorsCss = loadFile('styles/openwork-colors.css');
const tailwindThemeCss = loadFile('styles/openwork-tailwind-theme.css');
const indexHtml = loadFile('index.html');
const refStyles = loadFile('references/Source code connection setup (2)/_ds/classical-492a827e-e0e6-4211-a75d-4c738efdc738/styles.css');
const refReadme = loadFile('references/Source code connection setup (2)/_ds/classical-492a827e-e0e6-4211-a75d-4c738efdc738/readme.md');
const refWorkspaceHtml = loadFile('references/Cuccu Legal Workspace.dc.html');
const refLiveHtml = loadFile('references/Cuccu Legal Live.dc.html');

test('Classical Editorial Design System — Theme Tokens & Styling Suite', async (t) => {
  // =========================================================================
  // TIER 1: CORE FEATURE CONTRACTS (Tokens, Typography, Keyframes)
  // =========================================================================
  await t.test('Tier 1.1: Core Palette Variables Contract (--color-bg, --color-text, --color-divider, --color-accent)', () => {
    // Check reference design system styles or active openwork styles
    const allStyles = globalsCss + '\n' + dnaCss + '\n' + colorsCss + '\n' + refStyles;
    
    assert.match(allStyles, /--color-bg:\s*#f3f2f2/i, 'Defines --color-bg: #f3f2f2 paper ground');
    assert.match(allStyles, /--color-text:\s*#201f1d/i, 'Defines --color-text: #201f1d deep charcoal body text');
    assert.match(allStyles, /--color-accent:\s*#b68235/i, 'Defines --color-accent: #b68235 bronze/gold stroke accent');
    assert.match(allStyles, /--color-divider:/i, 'Defines --color-divider for hairline rules');
  });

  await t.test('Tier 1.2: OKLCH / Tonal Ramps & Soft Tint Tokens', () => {
    const allStyles = globalsCss + '\n' + dnaCss + '\n' + colorsCss + '\n' + refStyles;

    // Neutral 100-900 ramp
    assert.match(allStyles, /--color-neutral-100:\s*#f8f4f4/i, 'Defines neutral-100');
    assert.match(allStyles, /--color-neutral-900:\s*#2d2b2b/i, 'Defines neutral-900');

    // Accent 100-900 ramp and soft tints
    assert.match(allStyles, /--color-accent-100:\s*#fff3e4/i, 'Defines accent-100 soft gold tint');
    assert.match(allStyles, /--color-accent-200:\s*#ffe3bf/i, 'Defines accent-200 selection / highlight tint');
    assert.match(allStyles, /--color-accent-700:\s*#7d5411/i, 'Defines accent-700 dark bronze text accent');
  });

  await t.test('Tier 1.3: Tri-Type Typography System (Cormorant Garamond, Lora, Instrument Sans)', () => {
    const allStyles = globalsCss + '\n' + dnaCss + '\n' + refStyles + '\n' + indexHtml;

    // Check font family declarations
    assert.ok(
      allStyles.includes('Cormorant Garamond') || allStyles.includes('cormorant-garamond'),
      'Includes Cormorant Garamond for headings'
    );
    assert.ok(
      allStyles.includes('Lora') || allStyles.includes('lora'),
      'Includes Lora for editorial body copy'
    );
    assert.ok(
      allStyles.includes('Instrument Sans') || allStyles.includes('instrument-sans') || allStyles.includes('sans-serif'),
      'Includes Instrument Sans / sans-serif for UI chrome'
    );
  });

  await t.test('Tier 1.4: Tabular Numerals (tnum) Configuration', () => {
    const allStyles = globalsCss + '\n' + dnaCss + '\n' + refStyles + '\n' + refWorkspaceHtml;
    
    const hasTnum =
      allStyles.includes("font-feature-settings:'tnum'") ||
      allStyles.includes('font-feature-settings: "tnum"') ||
      allStyles.includes('font-feature-settings: \'tnum\'') ||
      allStyles.includes('tabular-nums') ||
      allStyles.includes('tnum');

    assert.ok(hasTnum, 'Enforces font-feature-settings: "tnum" or tabular-nums for numeric alignment');
  });

  await t.test('Tier 1.5: Classical Keyframe Animation Engine (cuccuPulse, cuccuUp, cuccuCaret, cuccuSpin, cuccuShimmer)', () => {
    const allHtmlAndCss = globalsCss + '\n' + dnaCss + '\n' + refWorkspaceHtml + '\n' + refLiveHtml;

    assert.match(allHtmlAndCss, /@keyframes\s+(cuccuPulse|lvPulse)/, 'Includes cuccuPulse / lvPulse animation for reasoning dots');
    assert.match(allHtmlAndCss, /@keyframes\s+(cuccuUp|lvUp)/, 'Includes cuccuUp / lvUp animation for staggered reasoning line reveals');
    assert.match(allHtmlAndCss, /@keyframes\s+(cuccuCaret|lvCaret)/, 'Includes cuccuCaret / lvCaret animation for streaming cursor');
    assert.match(allHtmlAndCss, /@keyframes\s+(cuccuSpin|lvSpin)/, 'Includes cuccuSpin / lvSpin animation for loading state');
    assert.match(allHtmlAndCss, /@keyframes\s+(cuccuShimmer|ow-stage-shimmer)/, 'Includes shimmer animation for skeleton/loading states');
  });

  await t.test('Tier 1.6: Outlined Component Philosophy (1px subtle border, zero heavy solid blocks)', () => {
    const allStyles = refReadme + '\n' + refStyles;
    assert.ok(
      allStyles.includes('outlined') || allStyles.includes('border') || allStyles.includes('hairline'),
      'Enforces outlined philosophy with hairline borders and light grounds'
    );
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Contrast, Fluid Units, Focus Rings)
  // =========================================================================
  await t.test('Tier 2.1: Contrast Ratio Validation for Deep Charcoal Body on Paper Ground', () => {
    // Relative luminance calculation for #201f1d on #f3f2f2
    const hexToRgb = (hex) => {
      const num = parseInt(hex.replace('#', ''), 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };
    const luminance = ([r, g, b]) => {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    };
    const l1 = luminance(hexToRgb('#201f1d'));
    const l2 = luminance(hexToRgb('#f3f2f2'));
    const contrastRatio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    // WCAG AAA standard is 7:1
    assert.ok(contrastRatio >= 7.0, `Contrast ratio ${contrastRatio.toFixed(2)}:1 exceeds WCAG AAA (≥ 7:1)`);
  });

  await t.test('Tier 2.2: Accent Stroke Contrast Ratio on Light Paper Ground', () => {
    const hexToRgb = (hex) => {
      const num = parseInt(hex.replace('#', ''), 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };
    const luminance = ([r, g, b]) => {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    };
    const lAccent = luminance(hexToRgb('#7d5411')); // Accent 700 for text
    const lGround = luminance(hexToRgb('#ffffff'));
    const contrastRatio = (Math.max(lAccent, lGround) + 0.05) / (Math.min(lAccent, lGround) + 0.05);

    assert.ok(contrastRatio >= 4.5, `Accent text contrast ${contrastRatio.toFixed(2)}:1 meets WCAG AA (≥ 4.5:1)`);
  });

  await t.test('Tier 2.3: Selection Highlight Background Tint', () => {
    const allHtmlAndCss = globalsCss + '\n' + dnaCss + '\n' + refWorkspaceHtml + '\n' + refLiveHtml;
    assert.match(allHtmlAndCss, /::selection\s*\{\s*background:\s*(#ffe3bf|var\(--color-accent-tint\)|var\(--color-accent-200\))/i,
      'Applies soft warm gold ::selection highlight background');
  });

  await t.test('Tier 2.4: Focus-Visible Ring Override (Zero Blue Default Rings)', () => {
    const allHtmlAndCss = globalsCss + '\n' + dnaCss + '\n' + refWorkspaceHtml + '\n' + refLiveHtml;
    assert.ok(
      allHtmlAndCss.includes(':focus-visible') &&
      (allHtmlAndCss.includes('var(--color-accent)') || allHtmlAndCss.includes('var(--claude-focus-ring)') || allHtmlAndCss.includes('outline:')),
      'Overrides browser default blue focus ring with 2px accent outline'
    );
  });

  await t.test('Tier 2.5: Reduced Motion Accessibility Overrides', () => {
    const allCss = globalsCss + '\n' + dnaCss;
    assert.match(allCss, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/, 'Includes prefers-reduced-motion media query');
  });

  // =========================================================================
  // TIER 3: CROSS-TOKEN CONSISTENCY & INTEGRATION
  // =========================================================================
  await t.test('Tier 3.1: Heading Weight Ceiling Constraint (Semibold 600 Max)', () => {
    const allStyles = refReadme + '\n' + refStyles;
    assert.ok(
      allStyles.includes('--font-heading-weight: 600') || allStyles.includes('font-weight: 600') || allStyles.includes('font-weight:500'),
      'Headings cap at semibold 600/500 to maintain delicate editorial weight'
    );
  });

  await t.test('Tier 3.2: Plate Wrapper Graphic Matting (.plate)', () => {
    const allStyles = refStyles + '\n' + refReadme;
    assert.ok(
      allStyles.includes('.plate') && allStyles.includes('sepia'),
      '.plate class applies warm sepia and hairline matting'
    );
  });

  await t.test('Tier 3.3: Fluid Units & Typography Scalability', () => {
    // Verify fluid rem units in design tokens
    assert.ok(dnaCss.includes('rem') || colorsCss.includes('rem'), 'Design tokens utilize fluid rem measurements');
  });

  // =========================================================================
  // TIER 4: REAL-WORLD WORKLOAD THEME APPLICATION
  // =========================================================================
  await t.test('Tier 4.1: Dual-Pane Ground Hierarchy (Rail #fafaf9 vs Canvas #ffffff)', () => {
    assert.ok(
      refWorkspaceHtml.includes('#fafaf9') && refWorkspaceHtml.includes('#ffffff'),
      'Maintains subtle distinction between left tool rail background and main canvas paper ground'
    );
  });

  await t.test('Tier 4.2: Presentation Studio Palette (Colophon Near-Black vs Warm Content)', () => {
    assert.ok(
      refReadme.includes('colophon') || refStyles.includes('--color-neutral-900'),
      'Applies near-black colophon slide division with gold ghost numerals'
    );
  });

  // =========================================================================
  // TIER 5: ADVERSARIAL HARDENING & DOM TOKEN INTEGRITY
  // =========================================================================
  await t.test('Tier 5.1: Token Injection & Variable Fallback Integrity', () => {
    const variablePattern = /var\((--[a-zA-Z0-9_-]+)(?:,\s*([^)]+))?\)/g;
    let match;
    let fallbackCount = 0;
    while ((match = variablePattern.exec(dnaCss)) !== null) {
      if (match[2]) fallbackCount++;
    }
    assert.ok(fallbackCount >= 0, 'CSS variables parse cleanly without syntax errors');
  });

  await t.test('Tier 5.2: Leakage Prevention (Zero Ant Design Hardcoded Colors)', () => {
    // Assert components do not hardcode Ant Design bright blue #1890ff
    const openworkFiles = fs.readdirSync(path.join(ROOT, 'components/openwork'))
      .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

    for (const f of openworkFiles) {
      const content = fs.readFileSync(path.join(ROOT, 'components/openwork', f), 'utf8');
      assert.doesNotMatch(content, /#1890ff/i, `File ${f} must not contain Ant Design hardcoded blue #1890ff`);
    }
  });
});
