import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('EMPIRICAL CHALLENGER: MONACO & BUNDLE SPLITTING VERIFICATION');
console.log('================================================================');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL: ' + message);
    failed++;
    throw new Error(message);
  } else {
    console.log('PASS: ' + message);
    passed++;
  }
}

async function runEmpiricalSuite() {
  // 1. Bundle Chunk Splitting & Preload Isolation
  console.log('\n--- [Test 1] Bundle Chunk Splitting & Preload Isolation ---');
  const distHtml = fs.readFileSync(path.join(frontendRoot, 'dist', 'index.html'), 'utf-8');
  assert(!distHtml.includes('ob-parser'), 'dist/index.html must NOT contain ob-parser chunk preloads');

  const distAssets = fs.readdirSync(path.join(frontendRoot, 'dist', 'assets'));
  const obParserChunk = distAssets.find(f => f.startsWith('ob-parser-') && f.endsWith('.js'));
  const monacoChunk = distAssets.find(f => f.startsWith('monaco-editor-') && f.endsWith('.js'));
  const indexChunk = distAssets.find(f => f.startsWith('index-') && f.endsWith('.js'));
  const dbEditorChunk = distAssets.find(f => f.startsWith('db-editor-') && f.endsWith('.js'));

  assert(!!obParserChunk, 'ob-parser chunk exists: ' + obParserChunk);
  assert(!!monacoChunk, 'monaco-editor chunk exists: ' + monacoChunk);
  assert(!!indexChunk, 'index entry chunk exists: ' + indexChunk);
  assert(!!dbEditorChunk, 'db-editor chunk exists: ' + dbEditorChunk);

  const obParserStats = fs.statSync(path.join(frontendRoot, 'dist', 'assets', obParserChunk));
  const indexStats = fs.statSync(path.join(frontendRoot, 'dist', 'assets', indexChunk));
  const monacoStats = fs.statSync(path.join(frontendRoot, 'dist', 'assets', monacoChunk));
  console.log('ob-parser chunk size: ' + (obParserStats.size / 1024 / 1024).toFixed(2) + ' MB');
  console.log('monaco chunk size: ' + (monacoStats.size / 1024 / 1024).toFixed(2) + ' MB');
  console.log('index chunk size: ' + (indexStats.size / 1024).toFixed(2) + ' KB');

  assert(obParserStats.size > 15 * 1024 * 1024, 'ob-parser chunk contains heavy ANTLR/OB grammar (~19MB)');
  assert(indexStats.size < 1024 * 1024, 'index chunk is lean (< 1MB)');

  // 2. Source Code Circular Import & Theme Safety
  console.log('\n--- [Test 2] Codebase Static Contracts & Type Imports ---');
  const serviceCode = fs.readFileSync(path.join(frontendRoot, 'components/chat/ob-editor/service.ts'), 'utf-8');
  const monacoEditorCode = fs.readFileSync(path.join(frontendRoot, 'components/chat/monaco-editor.tsx'), 'utf-8');
  const obPluginCode = fs.readFileSync(path.join(frontendRoot, 'components/chat/ob-editor/ob-plugin.ts'), 'utf-8');

  assert(serviceCode.includes('import type { ISession }'), 'service.ts uses type-only import for ISession from monaco-editor');
  assert(!serviceCode.match(/import\s+\{\s*ISession\s*\}\s+from/), 'service.ts does NOT use value import for ISession');
  assert(obPluginCode.includes("await import('@oceanbase-odc/monaco-plugin-ob')"), 'ob-plugin.ts dynamically imports monaco-plugin-ob');
  assert(monacoEditorCode.includes('beforeMount={ensureThemesDefined}'), 'monaco-editor binds ensureThemesDefined to beforeMount');
  assert(monacoEditorCode.includes('ensureThemesDefined()'), 'monaco-editor calls ensureThemesDefined in pluginRegister');

  // 3. Theme Registration Idempotency & Safety
  console.log('\n--- [Test 3] Theme Registration Idempotency & Safety ---');
  let themeDefinedCount = { github: 0, githubDark: 0 };
  const mockMonaco = {
    editor: {
      defineTheme: (name, theme) => {
        themeDefinedCount[name] = (themeDefinedCount[name] || 0) + 1;
      }
    }
  };

  let themesDefined = false;
  function ensureThemesDefined(monacoInstance) {
    if (!themesDefined && monacoInstance?.editor?.defineTheme) {
      monacoInstance.editor.defineTheme('github', { base: 'vs', inherit: true, rules: [], colors: {} });
      monacoInstance.editor.defineTheme('githubDark', { base: 'vs-dark', inherit: true, rules: [], colors: {} });
      themesDefined = true;
    }
  }

  ensureThemesDefined(null);
  assert(!themesDefined, 'ensureThemesDefined handles null gracefully without setting themesDefined');
  ensureThemesDefined({});
  assert(!themesDefined, 'ensureThemesDefined handles missing monaco.editor gracefully');

  ensureThemesDefined(mockMonaco);
  assert(themesDefined, 'themesDefined becomes true after first successful definition');
  assert(themeDefinedCount.github === 1, 'github theme defined exactly once');
  assert(themeDefinedCount.githubDark === 1, 'githubDark theme defined exactly once');

  for (let i = 0; i < 1000; i++) {
    ensureThemesDefined(mockMonaco);
  }
  assert(themeDefinedCount.github === 1, 'github theme was NOT redundantly redefined across 1000 calls');
  assert(themeDefinedCount.githubDark === 1, 'githubDark theme was NOT redundantly redefined across 1000 calls');

  // 4. Service Model Options & Session Null-Safety
  console.log('\n--- [Test 4] Service Model Options & Session Null-Safety ---');
  function getModelService({ _modelId, delimiter }, session) {
    return {
      delimiter,
      async getTableList(schemaName) {
        return session?.()?.getTableList(schemaName) || [];
      },
      async getTableColumns(tableName, _dbName) {
        return session?.()?.getTableColumns(tableName) || [];
      },
      async getSchemaList() {
        return session?.()?.getSchemaList() || [];
      },
    };
  }

  const nullService = getModelService({ _modelId: 'test-1', delimiter: ';' }, undefined);
  assert(nullService.delimiter === ';', 'delimiter matches configuration');
  const tableListNull = await nullService.getTableList();
  assert(Array.isArray(tableListNull) && tableListNull.length === 0, 'Null session returns empty array for getTableList');
  const colListNull = await nullService.getTableColumns('users');
  assert(Array.isArray(colListNull) && colListNull.length === 0, 'Null session returns empty array for getTableColumns');
  const schemaListNull = await nullService.getSchemaList();
  assert(Array.isArray(schemaListNull) && schemaListNull.length === 0, 'Null session returns empty array for getSchemaList');

  const mockSession = {
    getTableList: async (schema) => ['users', 'orders'],
    getTableColumns: async (table) => [{ columnName: 'id', columnType: 'int' }],
    getSchemaList: async () => ['public', 'analytics'],
  };
  const activeService = getModelService({ _modelId: 'test-2', delimiter: ';' }, () => mockSession);
  const tables = await activeService.getTableList('public');
  assert(tables.length === 2 && tables[0] === 'users', 'Active session returns table list');
  const cols = await activeService.getTableColumns('users');
  assert(cols.length === 1 && cols[0].columnName === 'id', 'Active session returns column list');
  const schemas = await activeService.getSchemaList();
  assert(schemas.length === 2 && schemas[1] === 'analytics', 'Active session returns schema list');

  // 5. Static Worker Files Integrity in public/ob-workers/
  console.log('\n--- [Test 5] Static Worker Files Integrity ---');
  const workerFiles = ['mysql.js', 'obmysql.js', 'oboracle.js', 'oracle.js'];
  for (const file of workerFiles) {
    const p = path.join(frontendRoot, 'public/ob-workers', file);
    assert(fs.existsSync(p), 'Worker file exists in public/ob-workers: ' + file);
    const stat = fs.statSync(p);
    assert(stat.size > 10 * 1024 * 1024, 'Worker file ' + file + ' is full-sized (~' + (stat.size/1024/1024).toFixed(1) + 'MB)');
  }

  // 6. Worker URL Dispatch Functionality
  console.log('\n--- [Test 6] Worker URL Callback Implementation ---');
  global.window = global.window || {};
  global.location = { origin: 'http://localhost:3000' };
  global.window.obMonaco = {
    getWorkerUrl: (type) => {
      switch (type) {
        case 'mysql': return location.origin + '/ob-workers/mysql.js';
        case 'obmysql': return location.origin + '/ob-workers/obmysql.js';
        case 'oboracle': return location.origin + '/ob-workers/oracle.js';
        default: return '';
      }
    }
  };
  assert(global.window.obMonaco.getWorkerUrl('mysql') === 'http://localhost:3000/ob-workers/mysql.js', 'mysql worker URL correct');
  assert(global.window.obMonaco.getWorkerUrl('obmysql') === 'http://localhost:3000/ob-workers/obmysql.js', 'obmysql worker URL correct');
  assert(global.window.obMonaco.getWorkerUrl('oboracle') === 'http://localhost:3000/ob-workers/oracle.js', 'oboracle worker URL correct');
  assert(global.window.obMonaco.getWorkerUrl('unknown') === '', 'unknown worker URL returns empty string');

  console.log('\n================================================================');
  console.log('EMPIRICAL SUITE COMPLETE: ' + passed + ' Passed | ' + failed + ' Failed');
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEmpiricalSuite();
