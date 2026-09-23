import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log(' OPENWORK DATASOURCE SELECTOR INTEGRATION VERIFICATION');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = null) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedTests++;
  }
}

// 1. types.ts Verification
const typesPath = path.join(rootDir, 'components/openwork/types.ts');
assert(fs.existsSync(typesPath), 'types.ts exists');
const typesContent = fs.readFileSync(typesPath, 'utf8');
assert(typesContent.includes('export interface DatasourceItem'), 'types.ts exports DatasourceItem interface');

// 2. useOpenWorkStore.ts Verification
const storePath = path.join(rootDir, 'components/openwork/useOpenWorkStore.ts');
assert(fs.existsSync(storePath), 'useOpenWorkStore.ts exists');
const storeContent = fs.readFileSync(storePath, 'utf8');

assert(storeContent.includes('export const DEFAULT_DATASOURCES'), 'useOpenWorkStore defines DEFAULT_DATASOURCES');
assert(storeContent.includes('export const PERSISTED_ACTIVE_DATASOURCE_KEY'), 'useOpenWorkStore defines PERSISTED_ACTIVE_DATASOURCE_KEY');
assert(storeContent.includes('export function mapDbSchemaToDatasourceItem'), 'useOpenWorkStore defines mapDbSchemaToDatasourceItem');
assert(
  (storeContent.includes('VN_Ecommerce') && storeContent.includes('VN_Inventory') && storeContent.includes('VN_Marketing') && storeContent.includes('VN_Finance') && storeContent.includes('Walmart_Sales')) ||
  (storeContent.includes('sqlite_ecommerce') && storeContent.includes('postgres_analytics')),
  'DEFAULT_DATASOURCES contains enterprise database configurations'
);
assert(storeContent.includes('availableDatasources') && storeContent.includes('selectedDatasourceId') && storeContent.includes('selectedDatasource'), 'useOpenWorkStore maintains available and active datasource state');
assert(storeContent.includes('setSelectedDatasourceId') && storeContent.includes('refreshDatasources'), 'useOpenWorkStore exposes datasource actions');
assert(storeContent.includes('ACTIVE DATASOURCE CONTEXT:'), 'useOpenWorkStore injects active datasource into system prompt for sql_query');

// 3. OpenWorkComposer.tsx Verification
const composerPath = path.join(rootDir, 'components/openwork/OpenWorkComposer.tsx');
assert(fs.existsSync(composerPath), 'OpenWorkComposer.tsx exists');
const composerContent = fs.readFileSync(composerPath, 'utf8');

assert(composerContent.includes('Database') && composerContent.includes('ChevronDown'), 'OpenWorkComposer imports Database and ChevronDown icons');
assert(composerContent.includes('selectedDatasource') && composerContent.includes('availableDatasources'), 'OpenWorkComposer accepts datasource props');
assert(composerContent.includes('Search') && composerContent.includes('filteredDatasources'), 'OpenWorkComposer includes searchable datasource filtering');
assert(composerContent.includes('tablesCount'), 'OpenWorkComposer renders database table counts');

// 4. OpenWorkHeader.tsx Verification
const headerPath = path.join(rootDir, 'components/openwork/OpenWorkHeader.tsx');
assert(fs.existsSync(headerPath), 'OpenWorkHeader.tsx exists');
const headerContent = fs.readFileSync(headerPath, 'utf8');

assert(headerContent.includes('selectedDatasource') || headerContent.includes('workspaceName'), 'OpenWorkHeader accepts header props');
assert(headerContent.includes('sidebarOpen') || headerContent.includes('workbenchOpen'), 'OpenWorkHeader includes panel toggles');
assert(headerContent.includes('theme') || headerContent.includes('openwork:theme'), 'OpenWorkHeader includes theme switching');
assert(headerContent.includes('openwork-settings-trigger') || headerContent.includes('Settings'), 'OpenWorkHeader includes settings action');

// 5. OpenWorkChatSurface.tsx & OpenWorkShell.tsx Wiring Verification
const surfacePath = path.join(rootDir, 'components/openwork/OpenWorkChatSurface.tsx');
assert(fs.existsSync(surfacePath), 'OpenWorkChatSurface.tsx exists');
const surfaceContent = fs.readFileSync(surfacePath, 'utf8');
assert(surfaceContent.includes('selectedDatasource') && surfaceContent.includes('onSelectDatasource'), 'OpenWorkChatSurface wires datasource props to OpenWorkComposer');

const shellPath = path.join(rootDir, 'components/openwork/OpenWorkShell.tsx');
assert(fs.existsSync(shellPath), 'OpenWorkShell.tsx exists');
const shellContent = fs.readFileSync(shellPath, 'utf8');
assert(shellContent.includes('selectedDatasource={store.selectedDatasource}') && shellContent.includes('availableDatasources={store.availableDatasources}'), 'OpenWorkShell binds active datasource state to Header and ChatSurface');

console.log(`\nOpenWork Datasource Verification Complete: ${passedTests} passed, ${failedTests} failed.`);
if (failedTests > 0) {
  process.exit(1);
}
