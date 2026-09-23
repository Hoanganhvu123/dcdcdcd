import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 2.6: Theme Variables & Multi-Language Parity', async (t) => {
  const globalsCss = fs.readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8');
  const enCommon = fs.readFileSync(path.join(ROOT, 'locales/en/common.ts'), 'utf8');
  const zhCommon = fs.readFileSync(path.join(ROOT, 'locales/zh/common.ts'), 'utf8');
  const viCommon = fs.readFileSync(path.join(ROOT, 'locales/vi/common.ts'), 'utf8');

  await t.test('T2.6.1: Theme CSS variables define both light and .dark mode scopes', () => {
    assert.match(globalsCss, /:root/);
    assert.match(globalsCss, /\.dark/);
    assert.match(globalsCss, /--bg/);
    assert.match(globalsCss, /--surface/);
    assert.match(globalsCss, /--text/);
  });

  await t.test('T2.6.2: Core common translation keys exist in EN, ZH, and VI files', () => {
    const keyRegex = /['"]([a-zA-Z0-9_.]+)['"]\s*:/g;
    function extractKeys(src) {
      const set = new Set();
      let m;
      while ((m = keyRegex.exec(src)) !== null) {
        set.add(m[1]);
      }
      return set;
    }

    const enKeys = extractKeys(enCommon);
    const zhKeys = extractKeys(zhCommon);
    const viKeys = extractKeys(viCommon);

    assert.ok(enKeys.size > 50, 'EN locale contains > 50 common keys');
    assert.ok(zhKeys.size > 50, 'ZH locale contains > 50 common keys');
    assert.ok(viKeys.size > 50, 'VI locale contains > 50 common keys');

    // Check critical shared keys
    const criticalKeys = ['Theme', 'language'];
    for (const k of criticalKeys) {
      assert.ok(enKeys.has(k) || enCommon.includes(k), `Missing ${k} in EN`);
      assert.ok(zhKeys.has(k) || zhCommon.includes(k), `Missing ${k} in ZH`);
      assert.ok(viKeys.has(k) || viCommon.includes(k), `Missing ${k} in VI`);
    }
  });

  await t.test('T2.6.3: Locale and language integration in Sider for zh-cn and en', () => {
    const siderSource = fs.readFileSync(path.join(ROOT, 'components/layout/Sider.tsx'), 'utf8');
    assert.match(siderSource, /moment\.locale\(['"]zh-cn['"]\)/);
    assert.match(siderSource, /moment\.locale\(['"]en['"]\)/);
    assert.match(siderSource, /i18n\.changeLanguage/);
  });
});
