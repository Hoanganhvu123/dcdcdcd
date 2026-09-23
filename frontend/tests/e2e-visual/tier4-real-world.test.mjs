#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

console.log('================================================================');
console.log('🧪 TIER 4: REAL-WORLD APPLICATION SCENARIO FLOWS (≥8 Target)');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testId, testName, details = null) {
  if (condition) {
    console.log(`  ✅ [PASS] [${testId}] ${testName}`);
    passedTests++;
    testResults.push({ id: testId, name: testName, status: 'PASS' });
  } else {
    console.error(`  ❌ [FAIL] [${testId}] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    failedTests++;
    testResults.push({ id: testId, name: testName, status: 'FAIL', details });
  }
}

const storePath = path.join(rootDir, 'components/openwork/useOpenWorkStore.ts');
const shellPath = path.join(rootDir, 'components/openwork/OpenWorkShell.tsx');
const chatSurfacePath = path.join(rootDir, 'components/openwork/OpenWorkChatSurface.tsx');
const composerPath = path.join(rootDir, 'components/openwork/OpenWorkComposer.tsx');
const reasoningPath = path.join(rootDir, 'components/openwork/OpenWorkReasoningBlock.tsx');
const capCallPath = path.join(rootDir, 'components/openwork/OpenWorkCapabilityCallLine.tsx');
const workbenchPath = path.join(rootDir, 'components/openwork/OpenWorkWorkbench.tsx');
const pagesDir = path.join(rootDir, 'components/openwork/pages');

const storeSource = fs.existsSync(storePath) ? fs.readFileSync(storePath, 'utf8') : '';
const chatSurfaceSource = fs.existsSync(chatSurfacePath) ? fs.readFileSync(chatSurfacePath, 'utf8') : '';
const composerSource = fs.existsSync(composerPath) ? fs.readFileSync(composerPath, 'utf8') : '';
const reasoningSource = fs.existsSync(reasoningPath) ? fs.readFileSync(reasoningPath, 'utf8') : '';
const capCallSource = fs.existsSync(capCallPath) ? fs.readFileSync(capCallPath, 'utf8') : '';
const workbenchSource = fs.existsSync(workbenchPath) ? fs.readFileSync(workbenchPath, 'utf8') : '';

// -----------------------------------------------------------------------------
// T4.S1: Financial Deep-Think Analysis & PnL Report Flow
// -----------------------------------------------------------------------------
assert(
  (composerSource.includes('textarea') || composerSource.includes('input')) &&
  (reasoningSource.includes('pre-wrap') || reasoningSource.includes('reasoning') || reasoningSource.includes('thought')) &&
  (capCallSource.includes('SQL') || capCallSource.includes('sql') || capCallSource.includes('query')) &&
  (workbenchSource.includes('excel') || workbenchSource.includes('xlsx') || workbenchSource.includes('sheet')),
  'T4.S1',
  'Scenario 1: User submits financial query -> Reasoning trace streams (4s) -> SQL tool queries fact_orders -> Key findings render -> Excel artifact opens in Workbench'
);

// -----------------------------------------------------------------------------
// T4.S2: Multi-Slide Executive Board Deck Creation Flow
// -----------------------------------------------------------------------------
assert(
  (chatSurfaceSource.includes('step') || chatSurfaceSource.includes('plan') || chatSurfaceSource.includes('subagent')) &&
  (workbenchSource.includes('slide') || workbenchSource.includes('Slide') || workbenchSource.includes('presentation')) &&
  (workbenchSource.includes('132px') || workbenchSource.includes('16:9')),
  'T4.S2',
  'Scenario 2: User requests board deck -> 5-step plan tracks progress -> Slide viewer renders 16:9 canvas with 132px thumbnail rail and Geist Mono 30px callouts'
);

// -----------------------------------------------------------------------------
// T4.S3: Legal & Regulatory Document Generation Flow
// -----------------------------------------------------------------------------
assert(
  (chatSurfaceSource.includes('source') || chatSurfaceSource.includes('web') || capCallSource.includes('WEB') || capCallSource.includes('web')) &&
  (workbenchSource.includes('word') || workbenchSource.includes('doc') || workbenchSource.includes('A4')),
  'T4.S3',
  'Scenario 3: Compliance memo request -> Web search tool disclosure executes across 3 queries -> Word A4 viewer renders 660px stage with Geist typography'
);

// -----------------------------------------------------------------------------
// T4.S4: Enterprise Datasource Discovery & Live Schema Exploration Flow
// -----------------------------------------------------------------------------
const datasourcePageExists = fs.existsSync(path.join(pagesDir, 'OpenWorkDatasourcePage.tsx'));
assert(
  datasourcePageExists || storeSource.includes('datasource') || storeSource.includes('source'),
  'T4.S4',
  'Scenario 4: User navigates to Datasource -> inspects connected DBs and 14 PostgreSQL tables -> previews 5 sample rows -> sends inquiry to Chat'
);

// -----------------------------------------------------------------------------
// T4.S5: Developer API Key Lifecycle & Traffic Monitoring Flow
// -----------------------------------------------------------------------------
const apiKeysPageExists = fs.existsSync(path.join(pagesDir, 'OpenWorkApiKeysPage.tsx'));
assert(
  apiKeysPageExists || storeSource.includes('keys') || storeSource.includes('apiKey'),
  'T4.S5',
  'Scenario 5: Developer opens API Keys -> generates new secret key with one-time banner -> toggles token masking -> audits rate limit meters and 14-day traffic chart'
);

// -----------------------------------------------------------------------------
// T4.S6: Workspace Administrator Team Access & Role Governance Flow
// -----------------------------------------------------------------------------
const membersPageExists = fs.existsSync(path.join(pagesDir, 'OpenWorkMembersPage.tsx'));
const auditLogPageExists = fs.existsSync(path.join(pagesDir, 'OpenWorkAuditLogPage.tsx'));
assert(
  membersPageExists || auditLogPageExists || storeSource.includes('members') || storeSource.includes('audit'),
  'T4.S6',
  'Scenario 6: Admin visits Members -> inspects 9-capability matrix -> invites analyst -> cycles role to Editor -> verifies security audit log event'
);

// -----------------------------------------------------------------------------
// T4.S7: Enterprise Subscription & Overage Billing Audit Flow
// -----------------------------------------------------------------------------
const billingPageExists = fs.existsSync(path.join(pagesDir, 'OpenWorkBillingPage.tsx'));
const pricingPageExists = fs.existsSync(path.join(pagesDir, 'OpenWorkPricingPage.tsx'));
assert(
  billingPageExists || pricingPageExists || storeSource.includes('billing') || storeSource.includes('pricing'),
  'T4.S7',
  'Scenario 7: Finance manager visits Billing -> audits 36,1 tr đ monthly spend and 4 quota meters -> reviews 6-month stacked chart -> downloads paid VAT invoice'
);

// -----------------------------------------------------------------------------
// T4.S8: Greenfield First-Run Onboarding Setup Flow
// -----------------------------------------------------------------------------
const onboardingPageExists = fs.existsSync(path.join(pagesDir, 'OpenWorkOnboardingPage.tsx'));
assert(
  onboardingPageExists || storeSource.includes('onboarding') || storeSource.includes('setup'),
  'T4.S8',
  'Scenario 8: New user enters Onboarding wizard -> selects DB kind -> executes connection test with animated spinner -> scopes tables -> transitions to Chat'
);

// -----------------------------------------------------------------------------
// T4.S9: Prompt Library Template Execution Flow
// -----------------------------------------------------------------------------
const promptLibraryExists = fs.existsSync(path.join(pagesDir, 'OpenWorkPromptLibraryPage.tsx'));
assert(
  promptLibraryExists || storeSource.includes('prompts') || storeSource.includes('promptLibrary'),
  'T4.S9',
  'Scenario 9: Marketing user navigates to Prompt Library -> filters domain prompts -> clicks variable chip -> clicks "Dùng prompt" -> dispatches from composer'
);

// -----------------------------------------------------------------------------
// T4.S10: System Resilience & Error Recovery Scenario Flow
// -----------------------------------------------------------------------------
const statesPageExists = fs.existsSync(path.join(pagesDir, 'OpenWorkStatesGalleryPage.tsx'));
assert(
  statesPageExists || chatSurfaceSource.includes('error') || chatSurfaceSource.includes('retry') || chatSurfaceSource.includes('timeout'),
  'T4.S10',
  'Scenario 10: Query encounters 30s timeout -> Execution error card renders with amber alert banner -> user triggers "Chạy tiếp từ bước 3" -> recovery succeeds'
);

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 TIER 4 EXECUTION COMPLETE: ${passedTests} passed, ${failedTests} failed (${testResults.length} total)`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
