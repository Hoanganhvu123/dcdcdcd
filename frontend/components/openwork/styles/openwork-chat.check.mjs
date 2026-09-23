/**
 * Runnable check for the chat markdown stylesheet.
 *   node components/openwork/styles/openwork-chat.check.mjs   (from frontend/)
 *
 * The Classical design system is the source of truth for these numbers. This
 * asserts openwork-chat.css still agrees with it, so a retune of the
 * reference (or a stray Tailwind `prose-*` creeping back in) fails loudly
 * instead of silently drifting the chat back to 16px/1.625.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REF = 'D:/DB-GPT/references/_extracted_brief/_ds/classical-a76ada16-6746-47f1-ab9a-b22825166547/styles.css';
const MINE = new URL('./openwork-chat.css', import.meta.url);

const ref = readFileSync(REF, 'utf8');
const mine = readFileSync(MINE, 'utf8');

// Pull a declaration out of a named rule block.
const decl = (css, selector, prop) => {
  // A selector can appear in several rule blocks (the reference splits `body`
  // across two); scan them all and take the block that carries the property.
  let at = css.indexOf(selector + ' {');
  assert.notEqual(at, -1, `missing rule: ${selector}`);
  for (; at !== -1; at = css.indexOf(selector + ' {', at + 1)) {
    const body = css.slice(at + selector.length, css.indexOf('}', at));
    const m = new RegExp(String.raw`(?:^|[;{])\s*` + prop + String.raw`\s*:\s*([^;}]+)`).exec(body);
    if (m) return m[1].trim();
  }
  assert.fail(`missing ${prop} in ${selector}`);
};

// --- body copy: the defect that started this. 15px/1.55, not 16px/1.625 ----
assert.equal(decl(ref, 'body', 'font-size'), '15px');
assert.equal(decl(mine, '.ow-md', 'font-size'), decl(ref, 'body', 'font-size'));
assert.equal(decl(mine, '.ow-md', 'line-height'), decl(ref, 'body', 'line-height'));

// --- heading ladder: chat starts one rung down (md h1 -> system h4) --------
assert.equal(decl(mine, '.ow-md h1', 'font-size'), decl(ref, 'h4', 'font-size'));
assert.equal(decl(mine, '.ow-md h2', 'font-size'), decl(ref, 'h5', 'font-size'));
assert.equal(decl(mine, '.ow-md h6', 'letter-spacing'), decl(ref, 'h6', 'letter-spacing'));

// --- tables: the system's hairline rows, 14px body / 11px uppercase head ---
assert.equal(decl(mine, '.ow-md table', 'font-size'), decl(ref, '.table', 'font-size'));
assert.equal(decl(mine, '.ow-md th', 'font-size'), decl(ref, '.table th', 'font-size'));
assert.equal(decl(mine, '.ow-md th', 'letter-spacing'), decl(ref, '.table th', 'letter-spacing'));

// --- spacing rhythm must be the token scale in hard px, never rem/em ------
for (const [sel, prop, px] of [
  ['.ow-md p', 'margin', '0 0 13.8px'],   // --space-3
  ['.ow-md li', 'margin', '4.6px 0'],     // --space-1
  ['.ow-md hr', 'margin', '18.4px 0'],    // --space-4
  ['.ow-md th', 'padding', '9.2px'],      // --space-2
]) assert.equal(decl(mine, sel, prop), px, `${sel} ${prop}`);

// letter-spacing is em in the reference too (it scales with the type size, by
// design); every *size* must be a hard px literal.
assert.ok(!/\d(?:\.\d+)?(?:rem|em)\b/.test(mine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/letter-spacing\s*:[^;]+;/g, '')),
  'sizes must be hard px - the reference is a measured spec, not a scalable one');

// --- inline code must not match inside fenced blocks (OpenWorkCodeBlock) ---
assert.ok(mine.includes('.ow-md code:not(pre code)'), 'inline-code rule must exclude pre > code');

// --- chat chrome must sit on the same ladder as the markdown body ----------
// One rung each, taken from the reference: h2 32 / h5 16 / body 15 / th 11px.
assert.equal(decl(mine, '.ow-hero-title', 'font-size'), decl(ref, 'h2', 'font-size'));
assert.equal(decl(mine, '.ow-hero-title', 'letter-spacing'), decl(ref, 'h6', 'letter-spacing'));
assert.equal(decl(mine, '.ow-part-title', 'font-size'), decl(ref, 'h5', 'font-size'));
assert.equal(decl(mine, '.ow-body', 'font-size'), decl(ref, 'body', 'font-size'));
assert.equal(decl(mine, '.ow-body', 'line-height'), decl(ref, 'body', 'line-height'));
assert.equal(decl(mine, '.ow-label', 'font-size'), decl(ref, '.table th', 'font-size'));
assert.equal(decl(mine, '.ow-label', 'letter-spacing'), decl(ref, '.table th', 'letter-spacing'));

// The chrome classes only pay off if the call sites actually use them: no
// component may re-declare a type size as an arbitrary Tailwind literal.
// The artifact viewers are on the same contract: their type lives in a
// colocated styles/*.css, so an arbitrary literal here is the same drift.
const surfaces = ['../OpenWorkChatSurface', '../OpenWorkUserBubble', '../OpenWorkSourceCards',
                  '../OpenWorkMarkdownRenderer', '../OpenWorkReasoningBlock',
                  '../OpenWorkChartMediaViewer', '../OpenWorkWorkbench',
                  '../../ai-data-analytic/office-excel/ExcelArtifactViewer',
                  '../../ai-data-analytic/office-slides/SlideArtifactViewer',
                  '../../ai-data-analytic/office-word/WordArtifactViewer'];
for (const name of surfaces) {
  const src = readFileSync(new URL(`${name}.tsx`, import.meta.url), 'utf8');
  // Strip comments first: the word "prose" in a sentence is prose, not a class.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const stray = code.match(/text-\[\d[\d.]*(?:px|rem|em)\]|(?<!not-)\bprose\b/g);
  assert.equal(stray, null, `${name}.tsx re-declares type outside the sheet: ${stray}`);
}

console.log('openwork-chat.check OK - body + chrome match Classical tokens, no stray literals');
