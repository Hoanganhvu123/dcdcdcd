import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('=== STARTING MILESTONE M2: 100% UNIFORM LUCIDE ICONS & 43+ SHADCN PRIMITIVES VERIFICATION ===\n');

// SUITE 1: 18 Ported Atomic Primitives Verification
console.log('--- SUITE 1: 18 Ported Atomic Primitives in components/ui & components/ui ---');

const required18Primitives = [
  'accordion.tsx',
  'autocomplete.tsx',
  'chain-of-thought.tsx',
  'checkbox.tsx',
  'context-menu.tsx',
  'dot-matrix-loader.tsx',
  'empty.tsx',
  'field.tsx',
  'hover-card.tsx',
  'image.tsx',
  'input-group.tsx',
  'message.tsx',
  'radio-group.tsx',
  'sonner.tsx',
  'source.tsx',
  'toggle-group.tsx',
  'toggle.tsx',
  'tool.tsx',
];

const rootDir = process.cwd();
const componentsUiDir = path.join(rootDir, 'components/ui');
const newComponentsUiDir = path.join(rootDir, 'components/ui');

let suite1Pass = 0;
for (const primitive of required18Primitives) {
  const file1 = path.join(componentsUiDir, primitive);
  const file2 = path.join(newComponentsUiDir, primitive);
  assert(fs.existsSync(file1), `Missing ${primitive} in components/ui/`);
  assert(fs.existsSync(file2), `Missing ${primitive} in components/ui/`);
  suite1Pass++;
}
console.log(`  [PASS] 1.1: All 18 newly ported primitives verified present in both components/ui/ and components/ui/ (${suite1Pass}/${required18Primitives.length})`);

// Check total count of primitives >= 43
const allComponentsUi = fs.readdirSync(componentsUiDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
const allNewComponentsUi = fs.readdirSync(newComponentsUiDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
assert(allComponentsUi.length >= 43, `Expected >= 43 primitives in components/ui, got ${allComponentsUi.length}`);
assert(allNewComponentsUi.length >= 43, `Expected >= 43 primitives in components/ui, got ${allNewComponentsUi.length}`);
console.log(`  [PASS] 1.2: Complete primitive inventory satisfies 43+ threshold (components/ui: ${allComponentsUi.length}, components/ui: ${allNewComponentsUi.length})`);

// SUITE 2: Zero Legacy Icon Imports Verification
console.log('\n--- SUITE 2: Zero Legacy Icon Imports (@ant-design/icons & @mui/icons-material) ---');

function scanSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.agents' || entry.name === '.next') continue;
      files.push(...scanSourceFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const sourceDirs = [
  path.join(rootDir, 'components'),
  path.join(rootDir, 'components'),
  path.join(rootDir, 'pages'),
  path.join(rootDir, 'app'),
  path.join(rootDir, 'hooks'),
  path.join(rootDir, 'shims'),
  path.join(rootDir, 'client'),
  path.join(rootDir, 'utils'),
];

const allSourceFiles = sourceDirs.flatMap(scanSourceFiles);
let antdIconViolations: string[] = [];
let muiIconViolations: string[] = [];

for (const file of allSourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes("from '@ant-design/icons'") || content.includes('from "@ant-design/icons"')) {
    antdIconViolations.push(file);
  }
  if (content.includes("from '@mui/icons-material'") || content.includes('from "@mui/icons-material"')) {
    muiIconViolations.push(file);
  }
}

assert.strictEqual(antdIconViolations.length, 0, `Found @ant-design/icons in: ${antdIconViolations.join(', ')}`);
console.log(`  [PASS] 2.1: 0 @ant-design/icons imports found across all ${allSourceFiles.length} source files`);

assert.strictEqual(muiIconViolations.length, 0, `Found @mui/icons-material in: ${muiIconViolations.join(', ')}`);
console.log(`  [PASS] 2.2: 0 @mui/icons-material imports found across all ${allSourceFiles.length} source files`);

// SUITE 3: Custom SVGs Standardized to Lucide 1.5px
console.log('\n--- SUITE 3: Custom SVG Components Standardized in components/icons/ ---');

const customIconsDir = path.join(rootDir, 'components/icons');
const customIconFiles = fs.readdirSync(customIconsDir).filter(f => f.endsWith('.tsx') && f !== 'index.tsx');

let customIconPass = 0;
for (const iconFile of customIconFiles) {
  const content = fs.readFileSync(path.join(customIconsDir, iconFile), 'utf8');
  assert(content.includes("from 'lucide-react'"), `${iconFile} does not import from lucide-react`);
  assert(content.includes('strokeWidth={1.5}'), `${iconFile} does not use strokeWidth={1.5}`);
  customIconPass++;
}
console.log(`  [PASS] 3.1: All ${customIconPass} custom icon components in components/icons/ render Lucide 1.5px icons`);

console.log('\n=== ALL MILESTONE M2 ICON & PRIMITIVE CHECKS PASSED SUCCESSFULLY ===\n');
