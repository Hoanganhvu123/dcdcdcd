import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TARGET_EXTENSIONS = new Set(['.css', '.tsx', '.ts', '.html']);
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.agents', '.next', 'out', 'tests', '__tests__']);

const CHROMATIC_PALETTES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'fuchsia', 'pink', 'rose'
];

const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'ring-offset', 'from', 'to', 'via',
  'accent', 'fill', 'stroke', 'shadow', 'outline', 'decoration', 'divide'
];

const TAILWIND_CHROMATIC_REGEX = new RegExp(`(?:[a-zA-Z0-9_-]+:)*(?:${PREFIXES.join('|')})-(?:${CHROMATIC_PALETTES.join('|')})-\\d+(?:\\/\\d+)?\\b`, 'g');

function isHexChromatic(hexStr) {
  let hex = hexStr.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length === 4) hex = hex.slice(0, 3).split('').map(c => c + c).join('');
  if (hex.length !== 6 && hex.length !== 8) return false;
  
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Filter out gray/zinc/slate palettes where delta is minimal or standard dark themes (#1f2937 is tailwind gray-800)
  // Truly chromatic colors (blue #1677ff, green #52c41a, orange #fa8c16, yellow #facc15, red #f5222d, teal #00a389) have delta > 40
  if (delta > 35) {
    return { r, g, b, delta };
  }
  return false;
}

function crawl(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(rootDir, full);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) files.push(...crawl(full));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TARGET_EXTENSIONS.has(ext)) files.push({ full, rel, ext });
    }
  }
  return files;
}

const files = crawl(rootDir);

const cssViolations = [];
const twViolations = [];
const hexViolations = [];

for (const file of files) {
  const content = fs.readFileSync(file.full, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || (trimmed.startsWith('/*') && trimmed.endsWith('*/'))) return;

    // Tailwind
    const tw = line.match(TAILWIND_CHROMATIC_REGEX);
    if (tw) {
      tw.forEach(m => {
        twViolations.push({ file: file.rel, line: lineNum, match: m, snippet: trimmed.substring(0, 80) });
      });
    }

    // Hex
    const hexes = line.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hexes) {
      hexes.forEach(h => {
        const chrom = isHexChromatic(h);
        if (chrom) {
          hexViolations.push({ file: file.rel, line: lineNum, match: h, delta: chrom.delta, snippet: trimmed.substring(0, 80) });
          if (file.rel.endsWith('.css')) {
            cssViolations.push({ file: file.rel, line: lineNum, match: h, snippet: trimmed.substring(0, 80) });
          }
        }
      });
    }
  });
}

console.log(`Audited ${files.length} production files.`);
console.log(`1. Chromatic Tailwind Classes: ${twViolations.length}`);
console.log(`2. Chromatic Hex Codes (Delta > 35): ${hexViolations.length}`);
console.log(`3. Chromatic Hex Codes in CSS files: ${cssViolations.length}`);

// Group by top files
const fileCounts = {};
[...twViolations, ...hexViolations].forEach(v => {
  fileCounts[v.file] = (fileCounts[v.file] || 0) + 1;
});

const sortedFiles = Object.entries(fileCounts).sort((a, b) => b[1] - a[1]);
console.log(`\nTop 15 files with chromatic violations (Total affected files: ${sortedFiles.length}):`);
sortedFiles.slice(0, 15).forEach(([f, count]) => {
  console.log(`  ${f}: ${count} violations`);
});

