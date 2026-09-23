import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const assetsDir = path.resolve(distDir, 'assets');
const htmlPath = path.resolve(distDir, 'index.html');

console.log('=== Milestone 1 Empirical Bundle Verification & Adversarial Stress Test ===\n');

if (!fs.existsSync(distDir)) {
  console.error('FAIL: dist directory does not exist! Run npm run build first.');
  process.exit(1);
}

let passedChecks = 0;
let failedChecks = 0;

function assert(condition, message, details = null) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedChecks++;
  } else {
    console.error(`[FAIL] ${message}`);
    if (details) console.error('       Details:', details);
    failedChecks++;
  }
}

// 1. Check index.html preloads
console.log('--- Check 1: dist/index.html Preload Analysis ---');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const scriptSrcMatches = [...htmlContent.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
const preloadMatches = [...htmlContent.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/g)].map(m => m[1]);

console.log(`Scripts in index.html (${scriptSrcMatches.length}):`, scriptSrcMatches);
console.log(`Modulepreloads in index.html (${preloadMatches.length}):`, preloadMatches);

const obParserInPreload = preloadMatches.some(href => href.includes('ob-parser') || href.includes('monaco-plugin-ob'));
const obParserInScript = scriptSrcMatches.some(src => src.includes('ob-parser') || src.includes('monaco-plugin-ob'));

assert(!obParserInPreload, 'dist/index.html does NOT contain <link rel="modulepreload"> for ob-parser or monaco-plugin-ob');
assert(!obParserInScript, 'dist/index.html does NOT contain <script> tag for ob-parser or monaco-plugin-ob');

// 2. Asset files inventory & ob-parser isolation
console.log('\n--- Check 2: dist/assets/ Chunk Analysis ---');
const assetFiles = fs.readdirSync(assetsDir);
const jsFiles = assetFiles.filter(f => f.endsWith('.js'));
console.log(`Total JS chunks found: ${jsFiles.length}`);

const obParserChunks = jsFiles.filter(f => f.startsWith('ob-parser-'));
assert(obParserChunks.length === 1, `Expected exactly 1 ob-parser chunk, found ${obParserChunks.length}: ${obParserChunks.join(', ')}`);

let obParserFile = null;
if (obParserChunks.length > 0) {
  obParserFile = obParserChunks[0];
  const obParserStat = fs.statSync(path.join(assetsDir, obParserFile));
  const sizeMB = (obParserStat.size / (1024 * 1024)).toFixed(2);
  console.log(`ob-parser chunk: ${obParserFile} (${sizeMB} MB / ${obParserStat.size} bytes)`);
  assert(obParserStat.size > 10 * 1024 * 1024, `ob-parser contains the isolated large parser bundle (>10MB, actual: ${sizeMB}MB)`);
}

// 3. Scan all OTHER chunks for duplicate ANTLR4 / OceanBase symbols
console.log('\n--- Check 3: Duplicate / Leakage Scan Across All Non-ob-parser Chunks ---');

const parserSignatures = [
  'OBParser',
  'OBMySqlLexer',
  'OBOldOracleLexer',
  'PredictionContextCache',
  'ATNDeserializer',
  'CommonTokenStream',
  'ParserRuleContext',
];

const leakages = [];

for (const jsFile of jsFiles) {
  if (jsFile.startsWith('ob-parser-')) continue;
  const filePath = path.join(assetsDir, jsFile);
  const content = fs.readFileSync(filePath, 'utf8');

  for (const sig of parserSignatures) {
    if (content.includes(sig)) {
      leakages.push({ file: jsFile, signature: sig });
    }
  }
}

if (leakages.length === 0) {
  assert(true, 'Zero ANTLR4 / OceanBase parser signatures found in non-ob-parser chunks (No leakage or duplicate bundling)');
} else {
  assert(false, `Found ${leakages.length} signature leaks in non-ob-parser chunks`, leakages);
}

// 4. Adversarial Check: Static Import of ob-parser by Non-OB Components
console.log('\n--- Check 4: Adversarial Static Import & Cross-Chunk Contamination Check ---');
const staticImportViolations = [];

if (obParserFile) {
  for (const jsFile of jsFiles) {
    if (jsFile.startsWith('ob-parser-')) continue;
    const filePath = path.join(assetsDir, jsFile);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Look for static ESM imports from ob-parser
    const regex = new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*["']\\./${obParserFile.replace('.', '\\.')}["']`);
    const match = content.match(regex);
    if (match) {
      staticImportViolations.push({
        file: jsFile,
        importStatement: match[0],
      });
    }
  }
}

if (staticImportViolations.length === 0) {
  assert(true, 'No non-ob chunk statically imports from ob-parser chunk');
} else {
  assert(
    false,
    `Found ${staticImportViolations.length} chunks statically importing from ob-parser chunk! This forces browsers to eagerly download the 19MB ob-parser whenever these chunks are loaded.`,
    staticImportViolations
  );
}

// 5. Check index entry chunk size
console.log('\n--- Check 5: Main Entry Chunk Size ---');
const indexChunks = jsFiles.filter(f => f.startsWith('index-'));
if (indexChunks.length > 0) {
  const indexFile = indexChunks[0];
  const indexStat = fs.statSync(path.join(assetsDir, indexFile));
  const sizeKB = (indexStat.size / 1024).toFixed(2);
  console.log(`Main entry chunk: ${indexFile} (${sizeKB} KB)`);
  assert(indexStat.size < 1024 * 1024, `Main entry chunk is under 1MB (actual: ${sizeKB} KB)`);
}

// 6. Check worker dist files
console.log('\n--- Check 6: Static ob-workers Mirror in dist/ob-workers ---');
const workersDir = path.resolve(distDir, 'ob-workers');
const workersExist = fs.existsSync(workersDir);
assert(workersExist, 'dist/ob-workers directory exists');
if (workersExist) {
  const workerFiles = fs.readdirSync(workersDir);
  console.log(`Worker files in dist/ob-workers (${workerFiles.length}):`, workerFiles);
  const expectedWorkers = ['mysql.js', 'obmysql.js', 'oboracle.js', 'oracle.js'];
  const allPresent = expectedWorkers.every(w => workerFiles.includes(w));
  assert(allPresent, `All 4 OceanBase SQL workers present in dist/ob-workers: ${expectedWorkers.join(', ')}`);
}

console.log('\n==================================================');
console.log(`SUMMARY: ${passedChecks} Passed, ${failedChecks} Failed`);
console.log('==================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
