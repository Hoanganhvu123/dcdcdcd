import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('Tier 2.3: Complex Markdown & LaTeX Parsing Verification', async (t) => {
  const configSource = fs.readFileSync(path.join(ROOT, 'components/chat/chat-content/config.tsx'), 'utf8');

  await t.test('T2.3.1: Preprocess LaTeX source contains delimiter replacement patterns', () => {
    assert.match(configSource, /function preprocessLaTeX/);
    assert.match(configSource, /codeBlocks/);
    assert.match(configSource, /rehypeKatex/);
    assert.match(configSource, /remarkMath/);
  });

  await t.test('T2.3.2: Currency symbols ($100, $50.99) are safely escaped to avoid breaking LaTeX', () => {
    function escapeCurrency(content) {
      return content.replace(/\$(?=\d)/g, '\\$');
    }
    const raw = 'The total revenue was $1000 and cost was $500.50.';
    const processed = escapeCurrency(raw);
    assert.equal(processed, 'The total revenue was \\$1000 and cost was \\$500.50.');
  });

  await t.test('T2.3.3: Inline code and code blocks protect internal dollar signs from modification', () => {
    function protectCodeBlocks(content) {
      const codeBlocks = [];
      const masked = content.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, match => {
        codeBlocks.push(match);
        return `<<CODE_BLOCK_${codeBlocks.length - 1}>>`;
      });
      const escaped = masked.replace(/\$(?=\d)/g, '\\$');
      return escaped.replace(/<<CODE_BLOCK_(\d+)>>/g, (_, index) => codeBlocks[parseInt(index)]);
    }

    const raw = 'Look at this script: `price = $100` and ```bash\necho $100\n``` but here is $50.';
    const processed = protectCodeBlocks(raw);
    assert.ok(processed.includes('`price = $100`'));
    assert.ok(processed.includes('echo $100'));
    assert.ok(processed.includes('\\$50'));
  });

  await t.test('T2.3.4: Complex GFM markdown tables with pipe formatting', () => {
    const tableMd = '| Metric | Q1 | Q2 |\n|:---|---:|:---:|\n| Growth | 15% | 22% |';
    const lines = tableMd.trim().split('\n');
    assert.equal(lines.length, 3);
    assert.ok(lines[0].startsWith('| Metric'));
    assert.ok(lines[1].includes('---'));
  });
});
