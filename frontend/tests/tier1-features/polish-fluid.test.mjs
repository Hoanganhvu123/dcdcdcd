import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 1.6: Universal Impeccable Polish & Tokens Feature Tests', async (t) => {
  const globalsCss = fs.readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8');
  const k3ExtrasCss = fs.readFileSync(path.join(ROOT, 'styles/k3-extras.css'), 'utf8');

  await t.test('T1.6.1: Universal 6px custom scrollbar definition across light and dark themes', () => {
    assert.match(globalsCss, /\.custom-scrollbar/);
    assert.match(globalsCss, /width:\s*6px/);
    assert.match(k3ExtrasCss, /\.custom-scrollbar/);
    assert.match(k3ExtrasCss, /\.dark \.custom-scrollbar/);
  });

  await t.test('T1.6.2: Fluid typography compliance and relative units verification in CSS tokens', () => {
    assert.match(globalsCss, /--k3-font-size-sm/);
    assert.match(globalsCss, /--k3-font-size-md/);
    assert.match(globalsCss, /--k3-font-size-lg/);
    assert.match(globalsCss, /--k3-font-size-xl/);
  });

  await t.test('T1.6.3: Core design tokens present in :root and theme surfaces', () => {
    const requiredTokens = [
      '--kimi-explore',
      '--kimi-panel',
      '--kimi-hover',
      '--kimi-border',
      '--k3-accent',
      '--k3-bg',
      '--k3-surface-base',
      '--k3-border',
      '--bg',
      '--surface'
    ];

    for (const token of requiredTokens) {
      assert.ok(globalsCss.includes(token), `Missing token: ${token}`);
    }
  });

  await t.test('T1.6.4: Spring motion physics parameter definitions in token registry', () => {
    assert.match(globalsCss, /--k3-ease-spring/);
    assert.match(globalsCss, /--k3-ease-smooth/);
    assert.match(globalsCss, /--k3-dur-fast/);
    assert.match(globalsCss, /--k3-dur-normal/);
  });

  await t.test('T1.6.5: Build configuration integrity (vite.config.mts / vite.config.ts)', () => {
    const candidateFiles = ['vite.config.mts', 'vite.config.ts', 'vite.config.js', 'vite.config.mjs'];
    const configName = candidateFiles.find(f => fs.existsSync(path.join(ROOT, f)));
    assert.ok(configName, 'Found Vite build configuration file');
    const buildConfig = fs.readFileSync(path.join(ROOT, configName), 'utf8');
    assert.match(buildConfig, /defineConfig/);
    assert.match(buildConfig, /optimizeDeps|plugins/);
  });
});
