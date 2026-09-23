import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSafeUrl,
  sanitizeHtml,
  sanitizeCssValue,
  sanitizeCssColor,
  escapeHtml,
} from '../lib/security/sanitizer';
import {
  evaluateFormula,
  evaluateSafeArithmetic,
} from '../components/ai-data-analytic/office-excel/utils/formula-evaluator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MOCK_ROOT = path.resolve(ROOT, '../frontend_mock');

console.log('================================================================');
console.log(' 🛡️ M2: XSS, MARKDOWN, KATEX & ARTIFACT SECURITY TEST SUITE');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedTests++;
  }
}

// =============================================================================
// 1. URL SANITIZATION & PROTOCOL WHITELISTING (isSafeUrl)
// =============================================================================
console.log('\n--- 1. Testing isSafeUrl Protocol Guardrails ---');

// Legitimate URLs
assert(isSafeUrl('https://example.com/api/v1') === true, 'Permits https: URLs');
assert(isSafeUrl('http://localhost:3000/dashboard?view=1') === true, 'Permits http: URLs');
assert(isSafeUrl('mailto:security@dbgpt.ai') === true, 'Permits mailto: URLs');
assert(isSafeUrl('tel:+84987654321') === true, 'Permits tel: URLs');
assert(isSafeUrl('/openwork/workspace/chat') === true, 'Permits absolute relative URLs (/)');
assert(isSafeUrl('./reports/q2-pnl.docx') === true, 'Permits relative URLs (./)');
assert(isSafeUrl('../shared/schema.sql') === true, 'Permits parent relative URLs (../)');
assert(isSafeUrl('#key-findings') === true, 'Permits anchor hash URLs (#)');
assert(isSafeUrl('?tab=excel&sort=asc') === true, 'Permits query string URLs (?)');

// Malicious & Dangerous Protocols
assert(isSafeUrl('javascript:alert(document.domain)') === false, 'Rejects javascript: scheme');
assert(isSafeUrl('JavaScript:alert(1)') === false, 'Rejects mixed-case JavaScript: scheme');
assert(isSafeUrl('  javascript:alert(1)') === false, 'Rejects leading-whitespace javascript: scheme');
assert(isSafeUrl('javascript :alert(1)') === false, 'Rejects space-before-colon javascript: scheme');
assert(isSafeUrl('java\0script:alert(1)') === false, 'Rejects null-byte in javascript: scheme');
assert(isSafeUrl('java\tscript:alert(1)') === false, 'Rejects tab in javascript: scheme');
assert(isSafeUrl('java\nscript:alert(1)') === false, 'Rejects newline in javascript: scheme');
assert(isSafeUrl('vbscript:msgbox("XSS")') === false, 'Rejects vbscript: scheme');
assert(isSafeUrl('data:text/html,<script>alert(1)</script>') === false, 'Rejects data: scheme');
assert(isSafeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==') === false, 'Rejects base64 data: scheme');
assert(isSafeUrl('file:///C:/Windows/System32/calc.exe') === false, 'Rejects file: scheme');
assert(isSafeUrl('blob:http://localhost:3000/123-456') === false, 'Rejects blob: scheme');
assert(isSafeUrl('custom-eval:payload') === false, 'Rejects unauthorized custom schemes');
assert(isSafeUrl('') === false, 'Rejects empty string');
assert(isSafeUrl(null as any) === false, 'Rejects null input');
assert(isSafeUrl(undefined as any) === false, 'Rejects undefined input');

// =============================================================================
// 2. HTML SANITIZATION & DOM PURIFICATION (sanitizeHtml & escapeHtml)
// =============================================================================
console.log('\n--- 2. Testing sanitizeHtml & escapeHtml ---');

const xssPayloads = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror="alert(1)">',
  '<svg onload="alert(1)">',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<body onload="alert(1)">',
  '<a href="javascript:alert(1)">Click Me</a>',
  '<div onmouseover="alert(1)">Hover</div>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)"></embed>',
];

for (const payload of xssPayloads) {
  const sanitized = sanitizeHtml(payload);
  assert(!sanitized.includes('alert(1)') && !sanitized.includes('alert("XSS")'), `Neutralizes payload: ${payload}`, { sanitized });
  assert(!sanitized.includes('<script'), `Strips script tags in: ${payload}`);
  assert(!sanitized.includes('onerror='), `Strips onerror in: ${payload}`);
  assert(!sanitized.includes('onload='), `Strips onload in: ${payload}`);
  assert(!sanitized.includes('onmouseover='), `Strips onmouseover in: ${payload}`);
}

// Safe HTML preserved
const safeHtml = '<p>Báo cáo doanh thu <strong>Q3 2026</strong> với <em>tăng trưởng 45%</em>.</p><table><thead><tr><th>Mục</th></tr></thead><tbody><tr><td>Dữ liệu</td></tr></tbody></table>';
const sanitizedSafe = sanitizeHtml(safeHtml);
assert(sanitizedSafe.includes('<strong>Q3 2026</strong>'), 'Preserves safe strong tag');
assert(sanitizedSafe.includes('<em>tăng trưởng 45%</em>'), 'Preserves safe em tag');
assert(sanitizedSafe.includes('<table>'), 'Preserves safe table structure');

// escapeHtml tests
assert(escapeHtml('<script>') === '&lt;script&gt;', 'escapeHtml escapes < and >');
assert(escapeHtml('"hello" & \'world\'') === '&quot;hello&quot; &amp; &#039;world&#039;', 'escapeHtml escapes quotes and ampersands');
assert(escapeHtml(null) === '', 'escapeHtml handles null gracefully');

// =============================================================================
// 3. CSS & COLOR SANITIZATION (sanitizeCssValue & sanitizeCssColor)
// =============================================================================
console.log('\n--- 3. Testing CSS and Color Sanitization ---');

assert(sanitizeCssColor('#ff5500') === '#ff5500', 'Allows valid 6-char hex color');
assert(sanitizeCssColor('#fff') === '#fff', 'Allows valid 3-char hex color');
assert(sanitizeCssColor('#12345680') === '#12345680', 'Allows valid 8-char hex color');
assert(sanitizeCssColor('rgb(255, 0, 128)') === 'rgb(255, 0, 128)', 'Allows valid rgb color');
assert(sanitizeCssColor('rgba(255, 0, 128, 0.5)') === 'rgba(255, 0, 128, 0.5)', 'Allows valid rgba color');
assert(sanitizeCssColor('hsl(200, 50%, 50%)') === 'hsl(200, 50%, 50%)', 'Allows valid hsl color');
assert(sanitizeCssColor('var(--chart-primary)') === 'var(--chart-primary)', 'Allows valid CSS var');
assert(sanitizeCssColor('emerald') === 'emerald', 'Allows valid named color');

// CSS Injection attacks
assert(sanitizeCssColor('red; } </style><script>alert(1)</script>') === '', 'Rejects style tag breakout payload');
assert(sanitizeCssColor('expression(alert(1))') === '', 'Rejects CSS expression injection');
assert(sanitizeCssColor('url(javascript:alert(1))') === '', 'Rejects javascript url CSS injection');
assert(sanitizeCssColor('blue; background-image: url("evil.com")') === '', 'Rejects multi-statement CSS injection');

assert(sanitizeCssValue('test-class_123') === 'test-class_123', 'Allows valid CSS identifier');
assert(sanitizeCssValue('evil; } body { display:none }') === '', 'Rejects CSS injection in sanitizeCssValue');

// =============================================================================
// 4. FORMULA EVALUATOR SAFE ARITHMETIC AST PARSER
// =============================================================================
console.log('\n--- 4. Testing Formula Evaluator Safe AST Parser ---');

// Arithmetic expressions
assert(evaluateSafeArithmetic('10 + 20') === 30, 'Evaluates basic addition');
assert(evaluateSafeArithmetic('50 - 18') === 32, 'Evaluates basic subtraction');
assert(evaluateSafeArithmetic('6 * 7') === 42, 'Evaluates basic multiplication');
assert(evaluateSafeArithmetic('100 / 4') === 25, 'Evaluates basic division');
assert(evaluateSafeArithmetic('(10 + 20) * 3') === 90, 'Evaluates parentheses with operator precedence');
assert(evaluateSafeArithmetic('2 + 3 * 4') === 14, 'Evaluates operator precedence (* before +)');
assert(evaluateSafeArithmetic('2 ^ 3') === 8, 'Evaluates exponentiation');
assert(evaluateSafeArithmetic('2 ^ 3 ^ 2') === 512, 'Evaluates right-associative exponentiation (2^(3^2))');
assert(evaluateSafeArithmetic('50% * 200') === 100, 'Evaluates percentage operator');
assert(evaluateSafeArithmetic('(10 + 2)%') === 0.12, 'Evaluates parenthesized percentage');
assert(evaluateSafeArithmetic('-5 + 15') === 10, 'Evaluates unary negation');
assert(evaluateSafeArithmetic('-(5 * 4)') === -20, 'Evaluates parenthesized unary negation');
assert(evaluateSafeArithmetic('+25') === 25, 'Evaluates unary plus');
assert(evaluateSafeArithmetic('1.5e2 + 10') === 160, 'Evaluates scientific notation');

// Division by zero & error states
assert(evaluateSafeArithmetic('10 / 0') === '#DIV/0!', 'Returns #DIV/0! on division by zero');
assert(evaluateSafeArithmetic('100 / (5 - 5)') === '#DIV/0!', 'Returns #DIV/0! on nested division by zero');
assert(evaluateSafeArithmetic('((10 + 2)') === '#ERROR!', 'Returns #ERROR! on mismatched parentheses');

// Standard Excel formula evaluation with grid simulation
const mockRows: (string | number)[][] = [
  ['Category', 'Revenue_Q1', 'Revenue_Q2', 'Cost'],
  ['Electronics', 1000, 1500, 800],
  ['Fashion', 500, 700, 400],
  ['Home', 300, 350, 200],
];

assert(evaluateFormula('=SUM(B2:B4)', mockRows) === 1800, 'Evaluates SUM range (1000+500+300 = 1800)');
assert(evaluateFormula('=AVERAGE(B2:B4)', mockRows) === 600, 'Evaluates AVERAGE range (1800/3 = 600)');
assert(evaluateFormula('=MIN(B2:B4)', mockRows) === 300, 'Evaluates MIN range');
assert(evaluateFormula('=MAX(B2:B4)', mockRows) === 1000, 'Evaluates MAX range');
assert(evaluateFormula('=COUNT(B2:B4)', mockRows) === 3, 'Evaluates COUNT range');
assert(evaluateFormula('=COUNTA(A1:A4)', mockRows) === 4, 'Evaluates COUNTA range');
assert(evaluateFormula('=ROUND(123.4567, 2)', mockRows) === 123.46, 'Evaluates ROUND formula');
assert(evaluateFormula('=IF(B2 > 500, "High", "Low")', mockRows) === 'High', 'Evaluates IF condition (true branch)');
assert(evaluateFormula('=VLOOKUP("Fashion", A2:D4, 2)', mockRows) === 500, 'Evaluates VLOOKUP exact match');
assert(evaluateFormula('=(C2 - B2) / B2', mockRows) === 0.5, 'Evaluates cell algebraic formula ((1500-1000)/1000 = 0.5)');

// Adversarial Injection attempts in formulas
assert(evaluateFormula('=process.exit(1)', mockRows) === '#ERROR!', 'Neutralizes process.exit in formula');
assert(evaluateFormula('=console.log(1)', mockRows) === '#ERROR!', 'Neutralizes console.log in formula');
assert(evaluateFormula('=Function("return 1")()', mockRows) === '#ERROR!', 'Neutralizes Function constructor invocation');
assert(evaluateFormula('=(function(){ return 1; })()', mockRows) === '#ERROR!', 'Neutralizes IIFE execution');
assert(evaluateFormula('=eval("1+1")', mockRows) === '#ERROR!', 'Neutralizes eval execution');

// Verify zero new Function / eval in formula-evaluator.ts
const formulaSrc = fs.readFileSync(path.resolve(ROOT, 'components/ai-data-analytic/office-excel/utils/formula-evaluator.ts'), 'utf8');
assert(!formulaSrc.includes('new Function'), 'formula-evaluator.ts contains 0 occurrences of new Function');
assert(!formulaSrc.includes('eval('), 'formula-evaluator.ts contains 0 occurrences of eval(');

// =============================================================================
// 5. COMPONENT SOURCE AUDITS (Markdown, Word, Chart, SourceCards, ReportGen)
// =============================================================================
console.log('\n--- 5. Static Source Audits for Hardening Controls ---');

// OpenWorkMarkdownRenderer
const mdRendererSrc = fs.readFileSync(path.resolve(ROOT, 'components/openwork/OpenWorkMarkdownRenderer.tsx'), 'utf8');
assert(mdRendererSrc.includes('rehypeSecuritySanitize'), 'Markdown renderer includes rehypeSecuritySanitize in pipeline');
assert(mdRendererSrc.includes('trust: false'), 'Markdown renderer KaTeX config enforces trust: false');
assert(mdRendererSrc.includes('maxSize: 500'), 'Markdown renderer KaTeX config enforces maxSize: 500');
assert(mdRendererSrc.includes('maxExpand: 1000'), 'Markdown renderer KaTeX config enforces maxExpand: 1000');
assert(mdRendererSrc.includes('isSafeUrl(href)'), 'Markdown renderer link component validates isSafeUrl(href)');

// WordArtifactViewer
const wordViewerSrc = fs.readFileSync(path.resolve(ROOT, 'components/ai-data-analytic/office-word/WordArtifactViewer.tsx'), 'utf8');
assert(wordViewerSrc.includes('sanitizeHtml(result?.value'), 'Word viewer sanitizes Mammoth convertToHtml output');
assert(wordViewerSrc.includes('escapeHtml(reportTitle)'), 'Word viewer print handler escapes reportTitle');
assert(wordViewerSrc.includes('sanitizeHtml(bodyHtml)'), 'Word viewer print handler sanitizes bodyHtml');
assert(wordViewerSrc.includes('dangerouslySetInnerHTML={{ __html: sanitizeHtml('), 'Word viewer dangerouslySetInnerHTML wraps in sanitizeHtml');

// chart.tsx
const chartSrc = fs.readFileSync(path.resolve(ROOT, 'components/ui/chart.tsx'), 'utf8');
assert(chartSrc.includes('sanitizeCssColor(rawColor)'), 'chart.tsx sanitizes color values with sanitizeCssColor');
assert(chartSrc.includes('sanitizeCssValue('), 'chart.tsx sanitizes CSS keys/id with sanitizeCssValue');

// OpenWorkSourceCards.tsx
const sourceCardsSrc = fs.readFileSync(path.resolve(ROOT, 'components/openwork/OpenWorkSourceCards.tsx'), 'utf8');
assert(sourceCardsSrc.includes('isSafeUrl(result.url)'), 'OpenWorkSourceCards validates result.url with isSafeUrl');

// report-generator.ts
const reportGenSrc = fs.readFileSync(path.resolve(ROOT, 'components/openwork/services/report-generator.ts'), 'utf8');
assert(reportGenSrc.includes('isSafeUrl(s.url)'), 'report-generator validates source references with isSafeUrl');
assert(reportGenSrc.includes('escapeHtml('), 'report-generator escapes titles and metadata with escapeHtml');

// =============================================================================
// 6. DUAL-TREE 100% PARITY AUDIT
// =============================================================================
console.log('\n--- 6. Dual-Tree Parity Verification ---');

const hardenedFiles = [
  'lib/security/sanitizer.ts',
  'components/openwork/OpenWorkMarkdownRenderer.tsx',
  'components/openwork/OpenWorkSourceCards.tsx',
  'components/openwork/services/report-generator.ts',
  'components/ai-data-analytic/office-word/WordArtifactViewer.tsx',
  'components/ui/chart.tsx',
  'components/ai-data-analytic/office-excel/utils/formula-evaluator.ts',
  'package.json',
];

const hasMockTree = fs.existsSync(MOCK_ROOT);

for (const relFile of hardenedFiles) {
  const prodPath = path.join(ROOT, relFile);
  assert(fs.existsSync(prodPath), `Frontend file exists: ${relFile}`);

  if (hasMockTree) {
    const mockPath = path.join(MOCK_ROOT, relFile);
    assert(fs.existsSync(mockPath), `Frontend_mock file exists: ${relFile}`);

    const prodContent = fs.readFileSync(prodPath, 'utf8').replace(/\r\n/g, '\n').trim();
    const mockContent = fs.readFileSync(mockPath, 'utf8').replace(/\r\n/g, '\n').trim();

    assert(
      prodContent === mockContent,
      `1:1 Parity verified for ${relFile}`
    );
  }
}

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n================================================================');
console.log(` 🛡️ M2 Security Test Results: ${passedTests} passed, ${failedTests} failed.`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
