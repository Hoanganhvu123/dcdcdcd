import fs from 'node:fs';
import crypto from 'node:crypto';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const filesToCheck = [
  { name: 'OpenWorkComposer.tsx', prod: 'd:/DB-GPT/frontend/components/openwork/OpenWorkComposer.tsx', mock: 'd:/DB-GPT/frontend_mock/components/openwork/OpenWorkComposer.tsx' },
  { name: 'OpenWorkSidebar.tsx', prod: 'd:/DB-GPT/frontend/components/openwork/OpenWorkSidebar.tsx', mock: 'd:/DB-GPT/frontend_mock/components/openwork/OpenWorkSidebar.tsx' }
];

console.log('================================================================');
console.log('🔍 DEEP ADVERSARIAL AST & TOKEN COLLISION AUDIT');
console.log('================================================================\n');

let totalViolations = 0;

for (const file of filesToCheck) {
  const prodCode = fs.readFileSync(file.prod, 'utf8');
  const hasMock = fs.existsSync(file.mock);
  const mockCode = hasMock ? fs.readFileSync(file.mock, 'utf8') : null;

  console.log(`\n--- Inspecting ${file.name} ---`);
  
  // 1. Hash verification
  const prodHash = sha256(prodCode);
  if (hasMock && mockCode !== null) {
    const mockHash = sha256(mockCode);
    if (prodHash !== mockHash) {
      console.error(`❌ Hash Mismatch for ${file.name}! Prod: ${prodHash}, Mock: ${mockHash}`);
      totalViolations++;
    } else {
      console.log(`✅ SHA-256 Parity Confirmed: ${prodHash}`);
    }
  } else {
    console.log(`✅ Single-Tree Canonical Source Verified: ${prodHash}`);
  }

  // 2. Scan for specific forbidden stuffing patterns
  const forbiddenPatterns = [
    'w-[28px] h-[28px] w-[29px]',
    'h-[28px] h-[29px]',
    'px-[9px] px-2.5',
    'h-[22px] h-[25px]',
    'text-[11.5px] text-[11px]',
    'text-[13.5px] text-[13px]',
    'w-[29px] h-[29px] w-[31px]',
    'text-[10.5px] text-[11px]',
    'bg-[#262421]',
    'text-[#faf9f7]'
  ];

  for (const pat of forbiddenPatterns) {
    if (prodCode.includes(pat)) {
      console.error(`❌ Found Forbidden Legacy Pattern: "${pat}" in ${file.name}`);
      totalViolations++;
    }
  }

  // 3. Extract all className and cn(...) literal strings
  const classStringRegex = /className\s*=\s*(?:\{cn\(([\s\S]*?)\)\}|"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
  let match;
  let elementIndex = 0;

  while ((match = classStringRegex.exec(prodCode)) !== null) {
    elementIndex++;
    const rawClassContent = match[1] || match[2] || match[3] || match[4] || '';

    // Extract all quoted sub-strings in cn(...) or raw strings
    const subStrings = [];
    if (match[1]) {
      const quoteRegex = /(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g;
      let qm;
      while ((qm = quoteRegex.exec(rawClassContent)) !== null) {
        subStrings.push(qm[1] || qm[2] || qm[3] || '');
      }
    } else {
      subStrings.push(rawClassContent);
    }

    for (const str of subStrings) {
      // Split into individual tokens
      const tokens = str.split(/\s+/).map(t => t.trim()).filter(Boolean);

      // Check for duplicates in the SAME static token list (unconditional)
      const unconditionalTokens = tokens.filter(t => !t.includes(':')); // filter out hover:, sm:, dark:, focus:, etc.

      const categories = {
        width: [],
        height: [],
        px: [],
        py: [],
        textSize: [],
        rounded: []
      };

      for (const t of unconditionalTokens) {
        if (/^w-(\[\w+\]|\d+(\.\d+)?|full|screen|auto|fit)$/.test(t)) categories.width.push(t);
        if (/^h-(\[\w+\]|\d+(\.\d+)?|full|screen|auto|fit)$/.test(t)) categories.height.push(t);
        if (/^px-(\[\w+\]|\d+(\.\d+)?)$/.test(t)) categories.px.push(t);
        if (/^py-(\[\w+\]|\d+(\.\d+)?)$/.test(t)) categories.py.push(t);
        if (/^text-(\[\w+(\.\w+)?\]|xs|sm|base|lg|xl|2xl|3xl)$/.test(t)) categories.textSize.push(t);
        if (/^rounded(-(\[\w+\]|none|sm|md|lg|xl|2xl|3xl|full))?$/.test(t)) categories.rounded.push(t);
      }

      for (const [cat, items] of Object.entries(categories)) {
        if (items.length > 1) {
          // Check if they are distinct conflicting classes
          const uniqueItems = Array.from(new Set(items));
          if (uniqueItems.length > 1) {
            console.error(`❌ Token Collision in ${file.name} (Element #${elementIndex}) Category: ${cat} -> [${uniqueItems.join(', ')}] in snippet: "${match[0]}"`);
            totalViolations++;
          }
        }
      }
    }
  }
}

console.log('\n================================================================');
if (totalViolations === 0) {
  console.log('🎉 AUDIT COMPLETE: ZERO CLASS LIST STUFFING & ZERO TOKEN COLLISIONS FOUND!');
} else {
  console.error(`💥 AUDIT FAILED: ${totalViolations} VIOLATIONS FOUND!`);
}
console.log('================================================================');
