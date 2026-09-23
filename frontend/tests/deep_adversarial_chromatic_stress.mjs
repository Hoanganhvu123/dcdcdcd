import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log(' DEEP EMPIRICAL ADVERSARIAL CHROMATIC STRESS HARNESS');
console.log(' Challenger: challenger_theme_iter2_2');
console.log('================================================================\n');

const TARGET_EXTENSIONS = new Set(['.css', '.tsx', '.ts', '.html', '.jsx', '.js']);
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.agents', '.next', 'out']);

// All Tailwind Chromatic Color Names
const CHROMATIC_PALETTES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'fuchsia', 'pink', 'rose'
];

const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'ring-offset', 'from', 'to', 'via',
  'accent', 'fill', 'stroke', 'shadow', 'outline', 'decoration', 'divide'
];

// Build comprehensive regex for Tailwind utility classes
const tailwindPatternStr = `(?:[a-zA-Z0-9_-]+:)*(?:${PREFIXES.join('|')})-(?:${CHROMATIC_PALETTES.join('|')})-\\d+(?:\\/\\d+)?\\b`;
const TAILWIND_CHROMATIC_REGEX = new RegExp(tailwindPatternStr, 'g');

// File Crawler
function crawl(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(rootDir, full);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        files.push(...crawl(full));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TARGET_EXTENSIONS.has(ext)) {
        files.push({ full, rel, ext });
      }
    }
  }
  return files;
}

const files = crawl(rootDir).filter(f => !f.rel.startsWith('tests/') && !f.rel.startsWith('__tests__/'));
console.log(`Auditing ${files.length} production source files across the entire repo...\n`);

const results = {
  tailwindChromaticClasses: [],
  chromaticHexValues: [],
  chromaticHslFunctions: [],
  chromaticRgbFunctions: [],
};

// Helper: check if hex is chromatic
function isHexChromatic(hexStr) {
  let hex = hexStr.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length === 4) {
    hex = hex.slice(0, 3).split('').map(c => c + c).join('');
  }
  if (hex.length !== 6 && hex.length !== 8) return false;
  
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Grayscale or Zinc neutral tolerance (zinc max delta is ~11 for zinc-400 #a1a1aa, zinc-500 #71717a, etc.)
  if (delta > 15) {
    return { r, g, b, delta };
  }
  return false;
}

for (const file of files) {
  const content = fs.readFileSync(file.full, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || (trimmed.startsWith('/*') && trimmed.endsWith('*/'))) {
      if (!trimmed.includes(':') && !trimmed.includes('=')) return;
    }

    // 1. Tailwind Chromatic Utility Check
    const twMatches = line.match(TAILWIND_CHROMATIC_REGEX);
    if (twMatches) {
      twMatches.forEach(m => {
        results.tailwindChromaticClasses.push({
          file: file.rel,
          line: lineNum,
          match: m,
          snippet: trimmed.substring(0, 100)
        });
      });
    }

    // 2. Hex Code Check
    const hexMatches = line.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hexMatches) {
      hexMatches.forEach(h => {
        const chrom = isHexChromatic(h);
        if (chrom) {
          results.chromaticHexValues.push({
            file: file.rel,
            line: lineNum,
            match: h,
            delta: chrom.delta,
            snippet: trimmed.substring(0, 100)
          });
        }
      });
    }

    // 3. HSL Function Check
    const hslMatches = line.match(/hsla?\(\s*([0-9.]+)(?:deg)?\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%/g);
    if (hslMatches) {
      hslMatches.forEach(h => {
        const satMatch = h.match(/,\s*([0-9.]+)%/);
        if (satMatch && parseFloat(satMatch[1]) > 10) {
          results.chromaticHslFunctions.push({
            file: file.rel,
            line: lineNum,
            match: h,
            snippet: trimmed.substring(0, 100)
          });
        }
      });
    }

    // 4. RGB/RGBA Function Check (Chromatic Delta > 30)
    const RGBA_REGEX = /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/g;
    let rgbMatch;
    while ((rgbMatch = RGBA_REGEX.exec(line)) !== null) {
      const r = parseFloat(rgbMatch[1]);
      const g = parseFloat(rgbMatch[2]);
      const b = parseFloat(rgbMatch[3]);
      const delta = Math.max(r, g, b) - Math.min(r, g, b);
      if (delta > 30) {
        results.chromaticRgbFunctions.push({
          file: file.rel,
          line: lineNum,
          match: rgbMatch[0],
          delta,
          snippet: trimmed.substring(0, 100)
        });
      }
    }
  });
}

console.log('--- Adversarial Scan Results ---');
console.log(`Tailwind Chromatic Utility Violations: ${results.tailwindChromaticClasses.length}`);
console.log(`Chromatic Hex Violations (Delta > 15): ${results.chromaticHexValues.length}`);
console.log(`Chromatic HSL Violations (Sat > 10%):  ${results.chromaticHslFunctions.length}`);
console.log(`Chromatic RGB/RGBA Violations (Delta > 30): ${results.chromaticRgbFunctions.length}`);

const totalViolations = 
  results.tailwindChromaticClasses.length +
  results.chromaticHexValues.length +
  results.chromaticHslFunctions.length +
  results.chromaticRgbFunctions.length;

console.log(`\nTOTAL DEEP ADVERSARIAL VIOLATIONS: ${totalViolations}`);

if (results.tailwindChromaticClasses.length > 0) {
  console.log('\n--- Tailwind Class Violations ---');
  results.tailwindChromaticClasses.slice(0, 10).forEach(v => {
    console.log(`  ${v.file}:${v.line} -> ${v.match} (Snippet: ${v.snippet})`);
  });
}

if (results.chromaticHexValues.length > 0) {
  console.log('\n--- Chromatic Hex Violations ---');
  results.chromaticHexValues.slice(0, 10).forEach(v => {
    console.log(`  ${v.file}:${v.line} -> ${v.match} (Delta: ${v.delta}, Snippet: ${v.snippet})`);
  });
}

if (results.chromaticRgbFunctions.length > 0) {
  console.log('\n--- Chromatic RGB/RGBA Violations ---');
  results.chromaticRgbFunctions.slice(0, 10).forEach(v => {
    console.log(`  ${v.file}:${v.line} -> ${v.match} (Delta: ${v.delta}, Snippet: ${v.snippet})`);
  });
}

if (totalViolations === 0) {
  console.log('\nVERDICT: APPROVE (Zero chromatic violations detected across all deep stress dimensions)');
  process.exit(0);
} else {
  console.log(`\nVERDICT: REQUEST_CHANGES (${totalViolations} violations detected)`);
  process.exit(1);
}
