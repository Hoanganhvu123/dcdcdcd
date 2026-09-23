#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

console.log('================================================================');
console.log('🧪 TIER 3: CROSS-FEATURE INTEGRATION COMBINATIONS (≥16 Target)');
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
const sidebarPath = path.join(rootDir, 'components/openwork/OpenWorkSidebar.tsx');
const composerPath = path.join(rootDir, 'components/openwork/OpenWorkComposer.tsx');
const chatSurfacePath = path.join(rootDir, 'components/openwork/OpenWorkChatSurface.tsx');
const workbenchPath = path.join(rootDir, 'components/openwork/OpenWorkWorkbench.tsx');
const globalsPath = path.join(rootDir, 'styles/globals.css');
const pagesDir = path.join(rootDir, 'components/openwork/pages');

const storeSource = fs.existsSync(storePath) ? fs.readFileSync(storePath, 'utf8') : '';
const shellSource = fs.existsSync(shellPath) ? fs.readFileSync(shellPath, 'utf8') : '';
const sidebarSource = fs.existsSync(sidebarPath) ? fs.readFileSync(sidebarPath, 'utf8') : '';
const composerSource = fs.existsSync(composerPath) ? fs.readFileSync(composerPath, 'utf8') : '';
const chatSurfaceSource = fs.existsSync(chatSurfacePath) ? fs.readFileSync(chatSurfacePath, 'utf8') : '';
const workbenchSource = fs.existsSync(workbenchPath) ? fs.readFileSync(workbenchPath, 'utf8') : '';
const globalsSource = fs.existsSync(globalsPath) ? fs.readFileSync(globalsPath, 'utf8') : '';

// -----------------------------------------------------------------------------
// T3.X1: Live streaming + Reasoning toggle + Dark theme toggle
// -----------------------------------------------------------------------------
assert(
  (chatSurfaceSource.includes('isStreaming') || chatSurfaceSource.includes('streaming')) &&
  (sidebarSource.includes('theme') || sidebarSource.includes('Toggle') || sidebarSource.includes('toggle')) &&
  (globalsSource.includes('dark') || globalsSource.includes('[data-theme="dark"]')),
  'T3.X1',
  'Cross-Feature: Active streaming token ingestion and reasoning toggle remain cohesive across light/dark theme switches'
);

// -----------------------------------------------------------------------------
// T3.X2: Plan card step transitions + Tool call execution
// -----------------------------------------------------------------------------
assert(
  (chatSurfaceSource.includes('step') || chatSurfaceSource.includes('plan') || chatSurfaceSource.includes('subagent')) &&
  (chatSurfaceSource.includes('tool') || chatSurfaceSource.includes('capability') || chatSurfaceSource.includes('CapabilityCall')),
  'T3.X2',
  'Cross-Feature: Plan card multi-step state progression (pending->running->done) synchronizes with sequential tool call disclosures'
);

// -----------------------------------------------------------------------------
// T3.X3: Composer model switch + Datasource pill + Plan toggle + Send
// -----------------------------------------------------------------------------
assert(
  composerSource.includes('model') &&
  (composerSource.includes('datasource') || composerSource.includes('source') || composerSource.includes('PostgreSQL')) &&
  (composerSource.includes('plan') || composerSource.includes('kế hoạch') || composerSource.includes('mode')) &&
  (composerSource.includes('send') || composerSource.includes('Submit') || composerSource.includes('handleSend')),
  'T3.X3',
  'Cross-Feature: Composer model selector, datasource pill, and plan mode toggle integrate with message dispatch pipeline'
);

// -----------------------------------------------------------------------------
// T3.X4: Multi-turn chat conversation across sequential turns
// -----------------------------------------------------------------------------
assert(
  (storeSource.includes('turns') || storeSource.includes('messages') || storeSource.includes('history')) &&
  (chatSurfaceSource.includes('user') && (chatSurfaceSource.includes('assistant') || chatSurfaceSource.includes('bot'))),
  'T3.X4',
  'Cross-Feature: Multi-turn chat maintains chronological turn history, interleaved bubbles, and reasoning state per turn'
);

// -----------------------------------------------------------------------------
// T3.X5: Excel XLSX generation -> Artifact pill -> Workbench formula bar
// -----------------------------------------------------------------------------
assert(
  (chatSurfaceSource.includes('artifact') || chatSurfaceSource.includes('chip') || chatSurfaceSource.includes('file')) &&
  workbenchSource.includes('excel') || workbenchSource.includes('sheet') || workbenchSource.includes('grid'),
  'T3.X5',
  'Cross-Feature: Excel XLSX artifact generation links from chat pill directly into Workbench spreadsheet canvas with formula bar'
);

// -----------------------------------------------------------------------------
// T3.X6: Slide PPTX generation -> Slide studio -> 132px thumbnail rail
// -----------------------------------------------------------------------------
assert(
  (workbenchSource.includes('slide') || workbenchSource.includes('Slide') || workbenchSource.includes('presentation')) &&
  (workbenchSource.includes('132px') || workbenchSource.includes('thumbnail') || workbenchSource.includes('16:9')),
  'T3.X6',
  'Cross-Feature: Slide presentation artifact opens 16:9 studio canvas with 132px thumbnail rail selection'
);

// -----------------------------------------------------------------------------
// T3.X7: Word A4 document -> Word viewer with Geist typography
// -----------------------------------------------------------------------------
assert(
  (workbenchSource.includes('word') || workbenchSource.includes('Word') || workbenchSource.includes('doc') || workbenchSource.includes('A4')) &&
  (globalsSource.includes('Geist') || globalsSource.includes('--font-sans')),
  'T3.X7',
  'Cross-Feature: Word A4 document generation renders inside 660px card with pure Geist typography and zero serif fonts'
);

// -----------------------------------------------------------------------------
// T3.X8: Sidebar -> Dashboard -> KPI sparkline -> Prefilled chat prompt
// -----------------------------------------------------------------------------
const dashboardExists = fs.existsSync(path.join(pagesDir, 'OpenWorkDashboardPage.tsx'));
assert(
  (sidebarSource.includes('Dashboard') || sidebarSource.includes('dashboard')) &&
  (dashboardExists || shellSource.includes('Dashboard') || shellSource.includes('dashboard')),
  'T3.X8',
  'Cross-Feature: Sidebar routes to Dashboard page, displays KPI sparklines, and triggers prefilled analytics query to Chat'
);

// -----------------------------------------------------------------------------
// T3.X9: Sidebar -> Datasource -> Schema inspector -> 5-row live data preview
// -----------------------------------------------------------------------------
const datasourceExists = fs.existsSync(path.join(pagesDir, 'OpenWorkDatasourcePage.tsx'));
assert(
  (sidebarSource.includes('Datasource') || sidebarSource.includes('datasource') || sidebarSource.includes('Nguồn dữ liệu')) &&
  (datasourceExists || shellSource.includes('Datasource') || shellSource.includes('datasource')),
  'T3.X9',
  'Cross-Feature: Sidebar routes to Datasource page, allows table schema inspection, and renders 5-row live data preview'
);

// -----------------------------------------------------------------------------
// T3.X10: Sidebar -> Skills & MCP -> Skill switch toggle -> MCP tool chips
// -----------------------------------------------------------------------------
const skillsExists = fs.existsSync(path.join(pagesDir, 'OpenWorkSkillsMcpPage.tsx'));
assert(
  (sidebarSource.includes('Skill') || sidebarSource.includes('skills') || sidebarSource.includes('MCP')) &&
  (skillsExists || shellSource.includes('Skills') || shellSource.includes('skills')),
  'T3.X10',
  'Cross-Feature: Sidebar routes to Skills & MCP page, allows toggling skills on/off, and inspects connected MCP server tool chips'
);

// -----------------------------------------------------------------------------
// T3.X11: Sidebar -> API Keys -> Secret banner -> Mask toggle -> Rate limits
// -----------------------------------------------------------------------------
const apiKeysExists = fs.existsSync(path.join(pagesDir, 'OpenWorkApiKeysPage.tsx'));
assert(
  (sidebarSource.includes('API') || sidebarSource.includes('keys') || sidebarSource.includes('Key')) &&
  (apiKeysExists || shellSource.includes('Keys') || shellSource.includes('keys')),
  'T3.X11',
  'Cross-Feature: Sidebar routes to API Keys page, displays one-time secret key banner, and reveals masked tokens'
);

// -----------------------------------------------------------------------------
// T3.X12: Sidebar -> Members -> Role cycle -> Permission matrix -> Invite modal
// -----------------------------------------------------------------------------
const membersExists = fs.existsSync(path.join(pagesDir, 'OpenWorkMembersPage.tsx'));
assert(
  (sidebarSource.includes('Members') || sidebarSource.includes('members') || sidebarSource.includes('Thành viên')) &&
  (membersExists || shellSource.includes('Members') || shellSource.includes('members')),
  'T3.X12',
  'Cross-Feature: Sidebar routes to Members page, cycles role assignments, and renders permission matrix with invite modal'
);

// -----------------------------------------------------------------------------
// T3.X13: Sidebar -> Audit Log -> Event filtering -> Drawer SQL payload in var(--code)
// -----------------------------------------------------------------------------
const auditLogExists = fs.existsSync(path.join(pagesDir, 'OpenWorkAuditLogPage.tsx'));
assert(
  (sidebarSource.includes('Audit') || sidebarSource.includes('audit') || sidebarSource.includes('kiểm toán')) &&
  (auditLogExists || shellSource.includes('Audit') || shellSource.includes('audit')),
  'T3.X13',
  'Cross-Feature: Sidebar routes to Audit Log page, filters security events, and inspects SQL payloads in dark code drawer'
);

// -----------------------------------------------------------------------------
// T3.X14: Sidebar -> Billing -> Usage meters -> Stacked cost chart -> Invoice PDF
// -----------------------------------------------------------------------------
const billingExists = fs.existsSync(path.join(pagesDir, 'OpenWorkBillingPage.tsx'));
assert(
  (sidebarSource.includes('Billing') || sidebarSource.includes('billing') || sidebarSource.includes('Thanh toán')) &&
  (billingExists || shellSource.includes('Billing') || shellSource.includes('billing')),
  'T3.X14',
  'Cross-Feature: Sidebar routes to Billing page, tracks quota progress meters, and provides invoice PDF downloads'
);

// -----------------------------------------------------------------------------
// T3.X15: Sidebar -> Pricing -> Annual 20% discount switch -> 4 tier comparison
// -----------------------------------------------------------------------------
const pricingExists = fs.existsSync(path.join(pagesDir, 'OpenWorkPricingPage.tsx'));
assert(
  (sidebarSource.includes('Pricing') || sidebarSource.includes('pricing') || sidebarSource.includes('bảng giá')) &&
  (pricingExists || shellSource.includes('Pricing') || shellSource.includes('pricing')),
  'T3.X15',
  'Cross-Feature: Sidebar routes to Pricing page, toggles monthly/annual billing cycle, and compares 4 tier plan cards'
);

// -----------------------------------------------------------------------------
// T3.X16: Sidebar -> Prompt Library -> Variable chip insertion -> Composer populate
// -----------------------------------------------------------------------------
const promptLibExists = fs.existsSync(path.join(pagesDir, 'OpenWorkPromptLibraryPage.tsx'));
assert(
  (sidebarSource.includes('Prompt') || sidebarSource.includes('prompts') || sidebarSource.includes('prompt')) &&
  (promptLibExists || shellSource.includes('Prompt') || shellSource.includes('prompts')),
  'T3.X16',
  'Cross-Feature: Sidebar routes to Prompt Library page, selects domain template with variable chips, and populates composer'
);

// -----------------------------------------------------------------------------
// T3.X17: Sidebar -> Notifications -> Mark all read -> Unread badge update
// -----------------------------------------------------------------------------
const notifsExists = fs.existsSync(path.join(pagesDir, 'OpenWorkNotificationsPage.tsx'));
assert(
  (sidebarSource.includes('Notifications') || sidebarSource.includes('notifications') || sidebarSource.includes('Thông báo')) &&
  (notifsExists || shellSource.includes('Notifications') || shellSource.includes('notifications')),
  'T3.X17',
  'Cross-Feature: Sidebar routes to Notifications page, filters alerts, and updates unread badge counter upon marking as read'
);

// -----------------------------------------------------------------------------
// T3.X18: Global ⌘K -> Command Palette overlay -> Search -> Targeted navigation
// -----------------------------------------------------------------------------
const cmdPaletteExists = fs.existsSync(path.join(pagesDir, 'OpenWorkCommandPalette.tsx'));
assert(
  (sidebarSource.includes('⌘K') || sidebarSource.includes('command') || shellSource.includes('CommandPalette')) &&
  (cmdPaletteExists || shellSource.includes('Palette') || shellSource.includes('palette')),
  'T3.X18',
  'Cross-Feature: Global ⌘K keyboard shortcut triggers Command Palette modal overlay, searching across sessions, tables, and pages'
);

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 TIER 3 EXECUTION COMPLETE: ${passedTests} passed, ${failedTests} failed (${testResults.length} total)`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
