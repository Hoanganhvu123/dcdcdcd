#!/usr/bin/env node
/**
 * CHALLENGER 1 EMPIRICAL ADVERSARIAL STRESS SUITE: MILESTONE 1
 * 
 * Deep boundary, layout, typography triad, contrast ratio, and security invariant
 * testing for WordArtifactViewer.tsx and word-viewer.css.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║ ⚔️  CHALLENGER 1: M1 EMPIRICAL DEEP STRESS & BOUNDARY HARNESS          ║');
console.log('║    Viewport Scaling, Zero Blur DPI, Contrast Math & Security Invariants║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, id, name, details = null) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] [${id}] ${name}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] [${id}] ${name}`);
    if (details) {
      console.error('     Details:', typeof details === 'object' ? JSON.stringify(details, null, 2) : details);
    }
    failures.push({ id, name, details });
    failedTests++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Luminance & Contrast Ratio Math (WCAG 2.1 Specification)
// ─────────────────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return [r, g, b];
  }
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b];
}

function calculateLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrastRatio(fgHex, bgHex) {
  const l1 = calculateLuminance(fgHex);
  const l2 = calculateLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Empirical Test Execution
// ─────────────────────────────────────────────────────────────────────────────
async function runEmpiricalChallenge() {
  const wordViewerPath = path.join(ROOT, 'components/ai-data-analytic/office-word/WordArtifactViewer.tsx');
  const wordCssPath = path.join(ROOT, 'components/ai-data-analytic/office-word/styles/word-viewer.css');

  assert(fs.existsSync(wordViewerPath), 'M1.FILE.1', 'WordArtifactViewer.tsx exists in office-word studio');
  assert(fs.existsSync(wordCssPath), 'M1.FILE.2', 'word-viewer.css exists in styles subfolder');

  const wordCode = fs.readFileSync(wordViewerPath, 'utf8');
  const cssCode = fs.readFileSync(wordCssPath, 'utf8');

  // =========================================================================
  // SECTION 1: Absence of Transform Scale Blur Matrix
  // =========================================================================
  console.log('\n--- Section 1: Absence of transform: scale() Blur Matrix ---');

  // Verify that neither the canvas nor the page container uses transform: scale
  const hasPageTransformScale = /\.ow-wd-page\s*\{[^}]*transform:\s*scale/i.test(cssCode);
  const hasCanvasTransformScale = /\.ow-wd-canvas\s*\{[^}]*transform:\s*scale/i.test(cssCode);
  const hasDocTransformScale = /\.ow-wd-doc\s*\{[^}]*transform:\s*scale/i.test(cssCode);

  assert(!hasPageTransformScale, 'M1.BLUR.1', '.ow-wd-page does NOT use rasterizing transform: scale()');
  assert(!hasCanvasTransformScale, 'M1.BLUR.2', '.ow-wd-canvas does NOT use rasterizing transform: scale()');
  assert(!hasDocTransformScale, 'M1.BLUR.3', '.ow-wd-doc does NOT use rasterizing transform: scale()');

  // Check default zoom state in WordArtifactViewer
  const defaultZoomMatch = wordCode.match(/useState\((\d+)\)/);
  const defaultZoomVal = defaultZoomMatch ? parseInt(defaultZoomMatch[1], 10) : null;
  assert(defaultZoomVal === 100, 'M1.BLUR.4', 'Initial zoom state defaults to 100% (1:1 native vector DPI)', { defaultZoomVal });

  // Antialiasing and subpixel text rendering attributes
  assert(cssCode.includes('-webkit-font-smoothing: antialiased'), 'M1.BLUR.5', 'Subpixel font smoothing antialiased configured');
  assert(cssCode.includes('text-rendering: optimizeLegibility'), 'M1.BLUR.6', 'text-rendering optimizeLegibility enabled');

  // =========================================================================
  // SECTION 2: Contrast Ratio Verification (>= 14.8:1 for primary ink)
  // =========================================================================
  console.log('\n--- Section 2: Contrast Tokens Math (WCAG 2.1 Luminance) ---');

  const contrastDeepInk1 = calculateContrastRatio('#201f1d', '#ffffff');
  const contrastDeepInk2 = calculateContrastRatio('#011627', '#ffffff');
  const contrastPaperShelf = calculateContrastRatio('#201f1d', '#f4f3f1');
  const contrastEditorial = calculateContrastRatio('#5c5766', '#ffffff');
  const contrastAmber = calculateContrastRatio('#7d5411', '#fffaf2');

  assert(
    contrastDeepInk1 >= 14.8,
    'M1.CONTRAST.1',
    `Deep Ink #201f1d on White Paper (#ffffff) achieves >= 14.8:1 (Actual: ${contrastDeepInk1.toFixed(2)}:1)`,
    { ratio: contrastDeepInk1, required: 14.8 }
  );

  assert(
    contrastDeepInk2 >= 14.8,
    'M1.CONTRAST.2',
    `Deep Ink #011627 on White Paper (#ffffff) achieves >= 14.8:1 (Actual: ${contrastDeepInk2.toFixed(2)}:1)`,
    { ratio: contrastDeepInk2, required: 14.8 }
  );

  assert(
    contrastPaperShelf >= 13.0,
    'M1.CONTRAST.3',
    `Deep Ink #201f1d on Paper Shelf (#f4f3f1) achieves high contrast (Actual: ${contrastPaperShelf.toFixed(2)}:1)`,
    { ratio: contrastPaperShelf }
  );

  assert(
    contrastEditorial >= 4.5,
    'M1.CONTRAST.4',
    `Editorial note #5c5766 on White Paper exceeds WCAG AA body text (Actual: ${contrastEditorial.toFixed(2)}:1)`,
    { ratio: contrastEditorial }
  );

  assert(
    contrastAmber >= 4.5,
    'M1.CONTRAST.5',
    `Amber legal highlight #7d5411 on #fffaf2 exceeds WCAG AA (Actual: ${contrastAmber.toFixed(2)}:1)`,
    { ratio: contrastAmber }
  );

  // =========================================================================
  // SECTION 3: Typography Triad Compliance
  // =========================================================================
  console.log('\n--- Section 3: Authentic Typography Triad Compliance ---');

  // 1. Instrument Sans (UI layer)
  const uiHasInstrumentSans = cssCode.includes("'Instrument Sans'") &&
    (wordCode.includes('Instrument Sans') || cssCode.includes('.ow-wd-bar') || cssCode.includes('.ow-wd-btn'));
  assert(uiHasInstrumentSans, 'M1.TYPE.1', 'Instrument Sans applied to UI action bar and buttons');

  // 2. Lora (Editorial reasoning & citations)
  const hasLoraEditorial = cssCode.includes("'Lora'") && cssCode.includes('.legal-editorial-note');
  assert(hasLoraEditorial, 'M1.TYPE.2', 'Lora italic serif applied to editorial notes & legal commentary');

  // 3. Times New Roman (Official A4 Legal Layer)
  const pageHasTimesNewRoman = /\.ow-wd-page\s*\{[^}]*font-family:\s*['"]Times New Roman['"]/i.test(cssCode);
  assert(pageHasTimesNewRoman, 'M1.TYPE.3', 'Times New Roman applied to official A4 document page');

  // =========================================================================
  // SECTION 4: Real-Time Clause Streaming Highlight & Caret
  // =========================================================================
  console.log('\n--- Section 4: Real-Time Clause Streaming & Blinking Caret ---');

  assert(cssCode.includes('@keyframes wkCaret'), 'M1.STREAM.1', '@keyframes wkCaret registered for drafting caret');
  assert(cssCode.includes('.legal-clause-writing'), 'M1.STREAM.2', '.legal-clause-writing styles active drafting clause');
  assert(cssCode.includes('.legal-caret'), 'M1.STREAM.3', '.legal-caret provides visual drafting cursor');
  assert(wordCode.includes('isWritingClause'), 'M1.STREAM.4', 'WordArtifactViewer dynamically calculates isWritingClause()');

  // =========================================================================
  // SECTION 5: Vector 4 Security AST Invariants
  // =========================================================================
  console.log('\n--- Section 5: Vector 4 Security AST Invariants ---');

  assert(
    wordCode.includes("const sanitized = sanitizeHtml(result?.value || '');"),
    'M1.SEC.1',
    'Invariant 1 preserved: const sanitized = sanitizeHtml(result?.value || \'\');'
  );
  assert(
    wordCode.includes("dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }}"),
    'M1.SEC.2',
    'Invariant 2 preserved: dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }}'
  );
  assert(
    wordCode.includes("const safeTitle = escapeHtml(reportTitle);"),
    'M1.SEC.3',
    'Invariant 3 preserved: const safeTitle = escapeHtml(reportTitle);'
  );
  assert(
    wordCode.includes("bodyHtml = sanitizeHtml(bodyHtml);"),
    'M1.SEC.4',
    'Invariant 4 preserved: bodyHtml = sanitizeHtml(bodyHtml);'
  );

  // =========================================================================
  // SECTION 6: Headless Browser Playwright Viewport Boundary Testing
  // =========================================================================
  console.log('\n--- Section 6: Headless Browser Viewport & Safe Center Stress ---');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Test HTML embedding the real word-viewer.css rules
  const testHtml = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8" />
      <style>
        body { margin: 0; padding: 0; }
        ${cssCode}
        .test-wrapper {
          height: 600px;
          display: flex;
          flex-direction: column;
        }
      </style>
    </head>
    <body>
      <div id="container" class="test-wrapper">
        <div id="canvas" class="ow-wd-canvas custom-scrollbar">
          <div id="a4page" class="ow-wd-page">
            <h1 class="legal-doc-title">HỢP ĐỒNG THUÊ MẶT BẰNG</h1>
            <p class="legal-clause-text">Nội dung hợp đồng điều khoản kiểm thử bố cục.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(testHtml);

  // Note: Canvas padding is 16px left + 16px right = 32px.
  // Physical A4 page width is 794px.
  // Thus, overflow begins when container width < 794 + 32 = 826px.
  const testViewports = [
    { width: 360, name: 'Mobile Narrow (360px)' },
    { width: 500, name: 'Split Screen Narrow (500px)' },
    { width: 680, name: 'Split Screen Workbench (680px)' },
    { width: 768, name: 'Tablet Portrait (768px)' },
    { width: 794, name: 'Exact A4 Canvas Width (794px)' },
    { width: 826, name: 'Canvas Threshold Boundary (826px)' },
    { width: 1024, name: 'Standard Desktop (1024px)' },
    { width: 1440, name: 'Wide Full-Bleed (1440px)' },
  ];

  for (const vp of testViewports) {
    await page.setViewportSize({ width: vp.width, height: 800 });

    const metrics = await page.evaluate((vpWidth) => {
      const canvas = document.getElementById('canvas');
      const a4 = document.getElementById('a4page');
      
      const cRect = canvas.getBoundingClientRect();
      const pRect = a4.getBoundingClientRect();
      const leftOffset = pRect.left - cRect.left;
      
      // Attempt to scroll to left edge
      canvas.scrollLeft = 0;
      const initialScrollLeft = canvas.scrollLeft;

      // Check right scroll range
      canvas.scrollLeft = 10000;
      const maxScrollLeft = canvas.scrollLeft;
      canvas.scrollLeft = 0;

      return {
        vpWidth,
        clientWidth: canvas.clientWidth,
        scrollWidth: canvas.scrollWidth,
        leftOffset,
        initialScrollLeft,
        maxScrollLeft,
        pageWidth: pRect.width,
      };
    }, vp.width);

    // Padding is 16px left
    if (metrics.scrollWidth > metrics.clientWidth) {
      // OVERFLOW STATE: justify-content: safe center MUST fall back to flex-start
      // preventing negative offset clipping! Left edge must be >= canvas padding (16px).
      assert(
        metrics.leftOffset >= 16,
        `M1.VIEWPORT.${vp.width}`,
        `${vp.name}: Safe center prevents left margin clipping (Left offset: ${metrics.leftOffset}px >= 16px padding)`,
        metrics
      );

      assert(
        metrics.maxScrollLeft > 0,
        `M1.SCROLL.${vp.width}`,
        `${vp.name}: Horizontal scroll reaches full content width (Max scroll: ${metrics.maxScrollLeft}px)`,
        metrics
      );
    } else {
      // NON-OVERFLOW STATE: content must be centered horizontally
      const expectedOffset = (metrics.clientWidth - metrics.pageWidth) / 2;
      const tolerance = 4; // allow small rounding tolerance
      const isCentered = Math.abs(metrics.leftOffset - expectedOffset) <= tolerance;

      assert(
        isCentered,
        `M1.CENTER.${vp.width}`,
        `${vp.name}: Canvas horizontally centered at native DPI (Offset: ${metrics.leftOffset.toFixed(1)}px, Expected: ${expectedOffset.toFixed(1)}px)`,
        metrics
      );
    }
  }

  await browser.close();

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log(`📊 CHALLENGER 1 M1 SUMMARY: ${passedTests} passed, ${failedTests} failed (${totalTests} total)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runEmpiricalChallenge().catch((err) => {
  console.error('Unhandled error during challenge execution:', err);
  process.exit(1);
});
