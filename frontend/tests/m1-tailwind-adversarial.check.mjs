import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== STARTING M1 TAILWIND V4 ADVERSARIAL EMPIRICAL TEST SUITE ===\n');

// SUITE 1: Configuration & File Integrity
console.log('--- SUITE 1: Configuration & File Integrity ---');
const tailwindConfigPath = path.join(rootDir, 'tailwind.config.js');
const postcssConfigPath = path.join(rootDir, 'postcss.config.js');
assert.strictEqual(fs.existsSync(tailwindConfigPath), false, 'tailwind.config.js must NOT exist');
assert.strictEqual(fs.existsSync(postcssConfigPath), false, 'postcss.config.js must NOT exist');
console.log('  [PASS] 1.1: Legacy tailwind.config.js and postcss.config.js are absent');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
assert.ok(pkg.devDependencies['@tailwindcss/vite'], '@tailwindcss/vite must exist');
assert.ok(pkg.devDependencies['tailwindcss'] || pkg.dependencies['tailwindcss'], 'tailwindcss must exist');
console.log('  [PASS] 1.2: package.json has @tailwindcss/vite and tailwindcss v4');

const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.mts'), 'utf8');
assert.ok(viteConfig.includes('@tailwindcss/vite'), 'vite.config.mts must import @tailwindcss/vite');
assert.ok(viteConfig.includes('tailwindcss()'), 'vite.config.mts must call tailwindcss() in plugins');
console.log('  [PASS] 1.3: vite.config.mts cleanly registers @tailwindcss/vite plugin');

const globalsCssPath = path.join(rootDir, 'styles/globals.css');
assert.ok(fs.existsSync(globalsCssPath), 'styles/globals.css must exist');
const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
assert.ok(globalsCss.includes('@import "tailwindcss";') || globalsCss.includes("@import 'tailwindcss';"), 'globals.css must have @import tailwindcss');
assert.ok(globalsCss.includes('@custom-variant dark'), 'globals.css must define dark custom-variant');
assert.ok(globalsCss.includes('@custom-variant data-open'), 'globals.css must define data-open custom-variant');
assert.ok(globalsCss.includes('@custom-variant data-closed'), 'globals.css must define data-closed custom-variant');
assert.ok(globalsCss.includes('@theme'), 'globals.css must have @theme block');
assert.ok(globalsCss.includes('--color-zinc-900: #18181b'), 'globals.css must define zinc-900');
assert.ok(globalsCss.includes('--color-zinc-100: #f4f4f5'), 'globals.css must define zinc-100');
assert.ok(globalsCss.includes('--radius-squircle: 0.75rem'), 'globals.css must define radius-squircle');
assert.ok(globalsCss.includes('--color-kimi-bubble: var(--kimi-bubble)'), 'globals.css must define kimi-bubble token');
assert.ok(globalsCss.includes('--color-kimi-accent: var(--kimi-accent)'), 'globals.css must define kimi-accent token');
console.log('  [PASS] 1.4: styles/globals.css correctly defines CSS-first @theme, custom variants, and tokens');

const importRegex = /@import\s+['"]([^'"]+)['"];/g;
let match;
const importedFiles = [];
while ((match = importRegex.exec(globalsCss)) !== null) {
  const imp = match[1];
  if (imp === 'tailwindcss' || imp.startsWith('@')) continue;
  const targetPath = path.resolve(path.dirname(globalsCssPath), imp);
  assert.ok(fs.existsSync(targetPath), 'Imported CSS file must exist: ' + imp);
  importedFiles.push(imp);
}
console.log('  [PASS] 1.5: All ' + importedFiles.length + ' sub-imported CSS files exist on disk: ' + importedFiles.join(', '));

console.log('\n--- SUITE 2: Isolated CSS @reference & @apply Integrity ---');

function findCssFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.agents' || entry.name === '.git') continue;
      results = results.concat(findCssFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      results.push(fullPath);
    }
  }
  return results;
}

const allCssFiles = findCssFiles(rootDir,);
const filesWithApply = [];

for (const file of allCssFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('@apply')) {
    filesWithApply.push(file);
    const relFile = path.relative(rootDir, file);
    if (relFile !== 'styles\\globals.css' && relFile !== 'styles/globals.css') {
      const refMatch = content.match(/@reference\s+['"]([^'"]+)['"];/);
      assert.ok(refMatch, 'File ' + relFile + ' uses @apply but is missing @reference directive');
      const targetRef = path.resolve(path.dirname(file), refMatch[1]);
      assert.strictEqual(targetRef, path.resolve(globalsCssPath), '@reference in ' + relFile + ' must resolve to styles/globals.css');
      console.log('  [PASS] 2.x: Valid @reference in ' + relFile + ' -> ' + refMatch[1]);
    }
  }
}
console.log('  [PASS] 2.1: Scanned ' + allCssFiles.length + ' CSS files; verified ' + filesWithApply.length + ' files with @apply have valid @reference');

console.log('\n--- SUITE 3: Live Vite Compilation & Adversarial Utilities ---');

async function runViteTransformationTests() {
  const server = await createServer({
    root: rootDir,
    server: { port: 0 },
    logLevel: 'silent'
  });

  try {
    const globalsResult = await server.transformRequest('/styles/globals.css');
    assert.ok(globalsResult && globalsResult.code, 'globals.css must compile successfully');
    assert.ok(globalsResult.code.length > 5000, 'globals.css output must be substantial');
    console.log('  [PASS] 3.1: styles/globals.css compiled via Vite (output length: ' + globalsResult.code.length + ' chars)');

    let failedIsolatedFiles = [];
    for (const file of filesWithApply) {
      const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
      if (relPath === 'styles/globals.css') continue;
      try {
        const res = await server.transformRequest('/' + relPath);
        assert.ok(res && res.code, 'Failed to compile isolated CSS: ' + relPath);
        console.log('  [PASS] 3.2: Compiled ' + relPath + ' without unresolved utility errors');
      } catch (err) {
        console.error('  [FAIL] 3.2: Compilation error in ' + relPath + ': ' + (err.message || String(err)));
        failedIsolatedFiles.push({ file: relPath, error: err.message || String(err) });
      }
    }

    const adversarialCss = '@reference "../styles/globals.css";\n.test-adversarial-card { @apply rounded-squircle bg-kimi-bubble text-kimi-accent hover:bg-kimi-accent-hover; }\n.test-adversarial-variants { @apply dark:bg-zinc-900 data-open:opacity-100 data-closed:opacity-0; }\n.test-adversarial-sizes { @apply rounded-squircle-sm rounded-squircle-lg; }\n.test-adversarial-zinc { @apply bg-zinc-50 bg-zinc-100 bg-zinc-200 bg-zinc-800 bg-zinc-900 bg-zinc-950; }\n.test-adversarial-semantic { @apply bg-card text-muted-foreground border-border text-primary; }\n.test-adversarial-animation { @apply animate-pulse1 animate-accordion-down animate-marquee; }\n';
    const tempTestFile = path.join(rootDir, 'tests/fixtures-temp-adversarial.css');
    fs.writeFileSync(tempTestFile, adversarialCss, 'utf8');

    try {
      const advResult = await server.transformRequest('/tests/fixtures-temp-adversarial.css');
      assert.ok(advResult && advResult.code, 'Adversarial CSS must compile cleanly');
      const compiled = advResult.code;

      assert.ok(compiled.includes('0.75rem') || compiled.includes('--radius-squircle'), 'Squircle 0.75rem radius must be in compiled CSS');
      assert.ok(compiled.includes('0.5rem') || compiled.includes('--radius-squircle-sm'), 'Squircle-sm 0.5rem radius must be in compiled CSS');
      assert.ok(compiled.includes('1rem') || compiled.includes('--radius-squircle-lg'), 'Squircle-lg 1rem radius must be in compiled CSS');

      assert.ok(compiled.includes('.dark') || compiled.includes(':where(.dark'), 'dark: variant must generate dark selector');
      assert.ok(compiled.includes('data-state="open"') || compiled.includes('data-open'), 'data-open: variant must generate data-open selector');
      assert.ok(compiled.includes('data-state="closed"') || compiled.includes('data-closed'), 'data-closed: variant must generate data-closed selector');

      assert.ok(compiled.includes('var(--kimi-bubble)') || compiled.includes('kimi-bubble'), 'kimi-bubble must resolve');
      assert.ok(compiled.includes('var(--kimi-accent)') || compiled.includes('kimi-accent'), 'kimi-accent must resolve');
      assert.ok(compiled.includes('#18181b') || compiled.includes('--color-zinc-900') || compiled.includes('var(--color-zinc-900)'), 'zinc-900 (#18181b) must resolve');

      console.log('  [PASS] 3.3: Adversarial test suite passed (squircles, custom variants, tokens, and animations verified)');
    } finally {
      if (fs.existsSync(tempTestFile)) fs.unlinkSync(tempTestFile);
    }

    console.log('\n--- SUITE 4: Negative Utility Stress Test ---');
    const invalidCss = '@reference "../styles/globals.css";\n.broken-rule { @apply this-is-a-completely-fake-and-nonexistent-tailwind-class-xyz987; }\n';
    const invalidTempFile = path.join(rootDir, 'tests/fixtures-temp-invalid.css');
    fs.writeFileSync(invalidTempFile, invalidCss, 'utf8');

    let threwExpectedError = false;
    try {
      await server.transformRequest('/tests/fixtures-temp-invalid.css');
    } catch (err) {
      threwExpectedError = true;
      console.log('  [PASS] 4.1: Vite correctly rejected non-existent utility in @apply:', (err.message || String(err)).slice(0, 80));
    } finally {
      if (fs.existsSync(invalidTempFile)) fs.unlinkSync(invalidTempFile);
    }
    assert.ok(threwExpectedError, 'Compiler MUST fail when an unknown utility is @apply-ed');

    return failedIsolatedFiles;
  } finally {
    await server.close();
  }
}

const failedFiles = await runViteTransformationTests();
if (failedFiles.length > 0) {
  console.log('\n=== M1 TAILWIND V4 ADVERSARIAL TEST FOUND ' + failedFiles.length + ' DEFECT(S) ===');
  for (const f of failedFiles) {
    console.log(' - ' + f.file + ': ' + f.error);
  }
} else {
  console.log('\n=== ALL M1 TAILWIND V4 ADVERSARIAL TESTS PASSED (0 FAILURES) ===\n');
}
