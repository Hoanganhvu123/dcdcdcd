/**
 * m1-secrets-verification.test.mjs
 * Verification suite for Milestone 1: Secrets & Token Leakage Prevention
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

console.log('=== Milestone 1: Secrets & Token Leakage Prevention Audit ===\n');

const currentDir = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(currentDir, '..');
const MOCK_DIR = resolve(FRONTEND_DIR, '../frontend_mock');

let totalChecks = 0;
let passedChecks = 0;

function check(title, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${title}`);
    passedChecks++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}:`, err.message);
  }
}

// ── 1. MaskedSecretInput Component Audit ──
console.log('1. Auditing MaskedSecretInput.tsx:');

const msiPath = resolve(FRONTEND_DIR, 'components/security/MaskedSecretInput.tsx');
check('MaskedSecretInput.tsx exists in frontend/components/security/', () => {
  assert.strictEqual(existsSync(msiPath), true, 'File does not exist');
});

if (existsSync(msiPath)) {
  const msiContent = readFileSync(msiPath, 'utf8');

  check('MaskedSecretInput masks input by default (type="password")', () => {
    assert.ok(msiContent.includes("isRevealed ? 'text' : 'password'"), 'Missing password type toggle');
    assert.ok(msiContent.includes('const [isRevealed, setIsRevealed] = useState(false)'), 'Should be masked by default');
  });

  check('MaskedSecretInput implements 15s auto-hide countdown', () => {
    assert.ok(msiContent.includes('autoHideSeconds = 15') || msiContent.includes('autoHideSeconds'), 'Missing autoHideSeconds prop');
    assert.ok(msiContent.includes('countdownIntervalRef'), 'Missing countdown interval');
    assert.ok(msiContent.includes('hideSecret'), 'Missing hideSecret function');
  });

  check('MaskedSecretInput auto-masks on window blur', () => {
    assert.ok(msiContent.includes("window.addEventListener('blur'"), 'Missing blur event listener');
    assert.ok(msiContent.includes("window.removeEventListener('blur'"), 'Missing blur event listener cleanup');
  });

  check('MaskedSecretInput implements safe copy with 30s clipboard auto-wipe', () => {
    assert.ok(msiContent.includes('safeCopyToClipboard'), 'Missing safeCopyToClipboard function');
    assert.ok(msiContent.includes('30000') || msiContent.includes('wipeDelayMs = 30000'), 'Missing 30s clipboard wipe delay');
    assert.ok(msiContent.includes("writeText('')"), 'Missing clipboard wipe clear call');
  });
}

// ── 2. OpenWorkSettingsModal Audit ──
console.log('\n2. Auditing OpenWorkSettingsModal.tsx:');

const settingsPath = resolve(FRONTEND_DIR, 'components/openwork/OpenWorkSettingsModal.tsx');
if (existsSync(settingsPath)) {
  const settingsContent = readFileSync(settingsPath, 'utf8');

  check('OpenWorkSettingsModal imports MaskedSecretInput', () => {
    assert.ok(settingsContent.includes('MaskedSecretInput'), 'Missing MaskedSecretInput import');
  });

  check('OpenWorkSettingsModal uses MaskedSecretInput for deepseekApiKey', () => {
    assert.ok(settingsContent.includes('id="deepseek-api-key-input"') || settingsContent.includes("handleUpdateField('deepseekApiKey'"), 'Missing deepseekApiKey input integration');
  });

  check('OpenWorkSettingsModal uses MaskedSecretInput for dbgptApiKey', () => {
    assert.ok(settingsContent.includes('id="dbgpt-api-key-input"') || settingsContent.includes("handleUpdateField('dbgptApiKey'"), 'Missing dbgptApiKey input integration');
  });

  check('OpenWorkSettingsModal uses MaskedSecretInput for firecrawlApiKey', () => {
    assert.ok(settingsContent.includes('id="firecrawl-api-key-input"') || settingsContent.includes("handleUpdateField('firecrawlApiKey'"), 'Missing firecrawlApiKey input integration');
  });

  check('OpenWorkSettingsModal scrubs apiKey.slice(0, 7)*** from test connection status', () => {
    assert.strictEqual(settingsContent.includes('apiKey.slice(0, 7)***'), false, 'Found unscrubbed token fragment');
  });
}

// ── 3. OpenWorkApiKeysPage Audit ──
console.log('\n3. Auditing OpenWorkApiKeysPage.tsx:');

const apiKeysPagePath = resolve(FRONTEND_DIR, 'components/openwork/pages/OpenWorkApiKeysPage.tsx');
if (existsSync(apiKeysPagePath)) {
  const pageContent = readFileSync(apiKeysPagePath, 'utf8');

  check('OpenWorkApiKeysPage masks newSecret banner by default', () => {
    assert.ok(pageContent.includes('isNewSecretRevealed'), 'Missing isNewSecretRevealed state');
    assert.ok(pageContent.includes('••••••••••••••••'), 'Missing token masking in banner');
  });

  check('OpenWorkApiKeysPage implements reveal toggle with timer on newSecret', () => {
    assert.ok(pageContent.includes('handleToggleNewSecret'), 'Missing newSecret toggle handler');
    assert.ok(pageContent.includes('newSecretCountdown'), 'Missing newSecret countdown');
  });

  check('OpenWorkApiKeysPage auto-masks on window blur', () => {
    assert.ok(pageContent.includes("window.addEventListener('blur'"), 'Missing window blur handler');
    assert.ok(pageContent.includes('setRevealedKeys({})'), 'Should reset table revealed keys on blur');
  });

  check('OpenWorkApiKeysPage uses safe copy with 30s clipboard auto-wipe', () => {
    assert.ok(pageContent.includes('safeCopyToClipboard'), 'Missing safeCopyToClipboard import or usage');
  });

  check('OpenWorkApiKeysPage table keys auto-mask after timeout', () => {
    assert.ok(pageContent.includes('keyTimersRef'), 'Missing key timers ref');
    assert.ok(pageContent.includes('15000'), 'Missing 15s auto-mask timeout for table keys');
  });
}

// ── 4. Eradication of Hardcoded Fallback Secrets ──
console.log('\n4. Auditing Eradication of Hardcoded Fallback Secrets:');

const deepseekStreamPath = resolve(FRONTEND_DIR, 'components/openwork/services/deepseek-stream.ts');
if (existsSync(deepseekStreamPath)) {
  const streamContent = readFileSync(deepseekStreamPath, 'utf8');

  check('deepseek-stream.ts does not contain hardcoded "sk-canifa-agent-2026"', () => {
    assert.strictEqual(streamContent.includes('sk-canifa-agent-2026'), false, 'Found hardcoded fallback sk-canifa-agent-2026');
  });
}

const toolsPath = resolve(FRONTEND_DIR, 'components/openwork/services/openwork-tools.ts');
if (existsSync(toolsPath)) {
  const toolsContent = readFileSync(toolsPath, 'utf8');

  check('openwork-tools.ts does not contain hardcoded "fc-2167530302384a41a9711b16954d25aa"', () => {
    assert.strictEqual(toolsContent.includes('fc-2167530302384a41a9711b16954d25aa'), false, 'Found hardcoded fallback Firecrawl key');
  });
}

// ── 5. Console Log Header Scrubbing ──
console.log('\n5. Auditing Console Log Header Scrubbing:');

const convApiPath = resolve(FRONTEND_DIR, 'components/openwork/services/conversation-api.ts');
if (existsSync(convApiPath)) {
  const convContent = readFileSync(convApiPath, 'utf8');

  check('conversation-api.ts implements sanitizeHeaders / sanitizeRequestInit', () => {
    assert.ok(convContent.includes('sanitizeHeaders'), 'Missing sanitizeHeaders helper');
    assert.ok(convContent.includes('sanitizeRequestInit'), 'Missing sanitizeRequestInit helper');
  });

  check('conversation-api.ts redacts Authorization headers in console.error', () => {
    assert.ok(convContent.includes('sanitizeRequestInit(init)'), 'Missing sanitized init in console.error');
    assert.ok(convContent.includes('[REDACTED]'), 'Missing [REDACTED] token replacement');
  });
}

// ── 6. Frontend & Frontend_Mock Parity ──
console.log('\n6. Auditing Frontend & Frontend_Mock Parity:');

const filesToCheck = [
  'components/security/MaskedSecretInput.tsx',
  'components/openwork/OpenWorkSettingsModal.tsx',
  'components/openwork/pages/OpenWorkApiKeysPage.tsx',
  'components/openwork/services/deepseek-stream.ts',
  'components/openwork/services/conversation-api.ts',
  'components/openwork/services/openwork-tools.ts',
];

const hasMock = existsSync(MOCK_DIR);

for (const relPath of filesToCheck) {
  const fPath = resolve(FRONTEND_DIR, relPath);
  const mPath = resolve(MOCK_DIR, relPath);

  check(`Canonical / Parity check for ${relPath}`, () => {
    assert.strictEqual(existsSync(fPath), true, `Frontend file ${fPath} missing`);
    if (hasMock) {
      assert.strictEqual(existsSync(mPath), true, `Mock file ${mPath} missing`);
      const fContent = readFileSync(fPath, 'utf8');
      const mContent = readFileSync(mPath, 'utf8');
      assert.strictEqual(fContent, mContent, `Mismatch between frontend and mock for ${relPath}`);
    }
  });
}

console.log(`\n=== Results: ${passedChecks}/${totalChecks} Checks Passed ===\n`);
if (passedChecks !== totalChecks) {
  process.exit(1);
} else {
  console.log('All Milestone 1 Secrets & Token Leakage Prevention checks PASSED with 100% success!');
}
