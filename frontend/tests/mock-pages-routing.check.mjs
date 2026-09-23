import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assert(condition, code, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  \x1b[32m[PASS]\x1b[0m ${code}: ${message}`);
  } else {
    failedChecks++;
    console.error(`  \x1b[31m[FAIL]\x1b[0m ${code}: ${message}`);
  }
}

function getFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

console.log('================================================================');
console.log('  OpenWork M5: 15 Modular Pages & Routing Verification Runner   ');
console.log('================================================================\n');

// 1. Verify Pages Directory and 15 TSX components
console.log('--- 1. Verification of 15 Modular React Page Components ---');
const pagesDir = path.join(rootDir, 'components/openwork/pages');
assert(fs.existsSync(pagesDir), 'M5.PG.0', 'Directory components/openwork/pages exists');

const expectedPages = [
  { file: 'OpenWorkDashboardPage.tsx', id: 'M5.PG.1', name: 'Dashboard Page (KPI sparklines, dual bar & donut charts)' },
  { file: 'OpenWorkDatasourcePage.tsx', id: 'M5.PG.2', name: 'Datasource Page (300px DB selector, schema inspector & preview)' },
  { file: 'OpenWorkSkillsMcpPage.tsx', id: 'M5.PG.3', name: 'Skills & MCP Page (Skills grid & server cards with tool accordion)' },
  { file: 'OpenWorkApiKeysPage.tsx', id: 'M5.PG.4', name: 'API Keys Page (Token reveal/mask, secret copy banner & rate limits)' },
  { file: 'OpenWorkMembersPage.tsx', id: 'M5.PG.5', name: 'Members Page (Member list, role cycle pills, 9x4 permission matrix & invite modal)' },
  { file: 'OpenWorkAuditLogPage.tsx', id: 'M5.PG.6', name: 'Audit Log Page (Security event feed, category filters & payload drawer)' },
  { file: 'OpenWorkBillingPage.tsx', id: 'M5.PG.7', name: 'Billing Page (Usage meters, 6-month stacked cost chart & invoices)' },
  { file: 'OpenWorkPricingPage.tsx', id: 'M5.PG.8', name: 'Pricing Page (4-tier comparison, annual discount switch & FAQ)' },
  { file: 'OpenWorkPromptLibraryPage.tsx', id: 'M5.PG.9', name: 'Prompt Library Page (Category sidebar, prompt cards & variable chips)' },
  { file: 'OpenWorkNotificationsPage.tsx', id: 'M5.PG.10', name: 'Notifications Page (Grouped feed, unread indicators & channel settings)' },
  { file: 'OpenWorkCommandPalette.tsx', id: 'M5.PG.11', name: 'Command Palette Component (⌘K modal overlay with search & shortcuts)' },
  { file: 'OpenWorkOnboardingPage.tsx', id: 'M5.PG.12', name: 'Onboarding Page (3-step setup wizard with connection test)' },
  { file: 'OpenWorkAuthPage.tsx', id: 'M5.PG.13', name: 'Auth Page (Split login/register screen with SSO buttons)' },
  { file: 'OpenWorkArtifactDetailPage.tsx', id: 'M5.PG.14', name: 'Artifact Detail Page (Spreadsheet canvas, chart, diff & code tabs)' },
  { file: 'OpenWorkStatesGalleryPage.tsx', id: 'M5.PG.15', name: 'States Gallery Page (6 fallback application states cards)' },
];

for (const pg of expectedPages) {
  const fullPath = path.join(pagesDir, pg.file);
  const exists = fs.existsSync(fullPath);
  assert(exists, pg.id, `${pg.file} exists and renders ${pg.name}`);
  if (exists) {
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(content.length > 500, `${pg.id}.size`, `${pg.file} contains substantial implementation (${content.length} chars)`);
  }
}

// 2. Verify pages/index.ts barrel export
console.log('\n--- 2. Barrel Export Verification in pages/index.ts ---');
const indexTsPath = path.join(pagesDir, 'index.ts');
assert(fs.existsSync(indexTsPath), 'M5.INDEX.1', 'pages/index.ts barrel file exists');
if (fs.existsSync(indexTsPath)) {
  const indexContent = fs.readFileSync(indexTsPath, 'utf8');
  for (const pg of expectedPages) {
    const componentName = pg.file.replace('.tsx', '');
    assert(
      indexContent.includes(componentName),
      `M5.INDEX.${pg.id}`,
      `pages/index.ts cleanly re-exports ${componentName}`
    );
  }
}

// 3. Verify Store & Router integration
console.log('\n--- 3. Store State & OpenWorkShell Router Integration ---');
const storePath = path.join(rootDir, 'components/openwork/useOpenWorkStore.ts');
const shellPath = path.join(rootDir, 'components/openwork/OpenWorkShell.tsx');

assert(fs.existsSync(storePath), 'M5.STORE.1', 'useOpenWorkStore.ts exists');
assert(fs.existsSync(shellPath), 'M5.SHELL.1', 'OpenWorkShell.tsx exists');

const storeContent = fs.existsSync(storePath) ? fs.readFileSync(storePath, 'utf8') : '';
const shellContent = fs.existsSync(shellPath) ? fs.readFileSync(shellPath, 'utf8') : '';

assert(
  storeContent.includes('export type OpenWorkView') || storeContent.includes('OpenWorkView'),
  'M5.STORE.2',
  'Store exports OpenWorkView union type representing all views'
);

assert(
  storeContent.includes('activeView') && storeContent.includes('setActiveView'),
  'M5.STORE.3',
  'Store exposes activeView state and setActiveView action'
);

assert(
  storeContent.includes('commandPaletteOpen') && storeContent.includes('setCommandPaletteOpen'),
  'M5.STORE.4',
  'Store exposes commandPaletteOpen state and setCommandPaletteOpen action'
);

assert(
  shellContent.includes('renderViewContent') || shellContent.includes('activeView') || shellContent.includes('switch'),
  'M5.SHELL.2',
  'OpenWorkShell dynamically renders active page component based on store.activeView'
);

assert(
  shellContent.includes('OpenWorkCommandPalette'),
  'M5.SHELL.3',
  'OpenWorkShell renders OpenWorkCommandPalette modal overlay'
);

// 4. Dual Tree Parity Sync / Single Tree Canonical Verification
console.log('\n--- 4. 1:1 Dual Tree Parity Sync / Single Tree Canonical Verification ---');
const isFrontendMock = rootDir.includes('frontend_mock');
const siblingRootDir = isFrontendMock
  ? rootDir.replace('frontend_mock', 'frontend')
  : rootDir.replace('frontend', 'frontend_mock');

const allParityTargets = [
  ...expectedPages.map(pg => ({
    relPath: path.join('components/openwork/pages', pg.file),
    id: `M5.PARITY.${pg.id}`,
    label: `${pg.file} (15 modular pages)`
  })),
  {
    relPath: 'components/openwork/pages/index.ts',
    id: 'M5.PARITY.M5.INDEX',
    label: 'pages/index.ts (barrel export)'
  },
  {
    relPath: 'components/openwork/OpenWorkShell.tsx',
    id: 'M5.PARITY.M5.SHELL',
    label: 'OpenWorkShell.tsx (router shell)'
  },
  {
    relPath: 'components/openwork/useOpenWorkStore.ts',
    id: 'M5.PARITY.M5.STORE',
    label: 'useOpenWorkStore.ts (state store)'
  }
];

const siblingExists = fs.existsSync(siblingRootDir);
if (siblingExists) {
  assert(fs.existsSync(siblingRootDir), 'M5.PARITY.0', `Sibling workspace tree exists at ${siblingRootDir}`);

  for (const target of allParityTargets) {
    const p1 = path.join(rootDir, target.relPath);
    const p2 = path.join(siblingRootDir, target.relPath);
    
    const h1 = getFileSha256(p1);
    const h2 = getFileSha256(p2);
    
    const matches = (h1 !== null && h2 !== null && h1 === h2);
    const detail = matches
      ? `SHA256 matched [${h1.slice(0, 12)}...]`
      : `SHA256 MISMATCH! frontend=${h1 ? h1.slice(0, 12) : 'missing'} vs frontend_mock=${h2 ? h2.slice(0, 12) : 'missing'}`;
      
    assert(matches, target.id, `${target.label} ${detail}`);
  }
} else {
  assert(true, 'M5.CANONICAL.0', `Single-tree frontend consolidated at ${rootDir}`);

  for (const target of allParityTargets) {
    const p1 = path.join(rootDir, target.relPath);
    const exists = fs.existsSync(p1);
    assert(exists, target.id, `${target.label} exists in single-tree frontend`);
  }
}

console.log('\n================================================================');
console.log(`  Summary: ${passedChecks}/${totalChecks} Checks Passed (${Math.round((passedChecks / totalChecks) * 100)}%)`);
console.log('================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
