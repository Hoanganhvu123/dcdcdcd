/**
 * Runnable check for the deck normalizer + PPTX exporter.
 *   node lib/slides/exportPptx.check.ts        (from frontend/)
 *
 * Asserts the produced file is a real OOXML package, not a renamed JSON blob:
 * a ZIP magic header plus the parts PowerPoint requires.
 */
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { normalizeDeck, deckTitleOf } from './normalizeDeck.ts';
import { exportDeckToPptx } from './exportPptx.ts';

// --- normalizeDeck: the six payload shapes the agent actually emits ---------
assert.equal(normalizeDeck(null).length, 0, 'null artifact must yield no slides');
assert.equal(normalizeDeck({ content: 'not json' }).length, 0, 'unparseable content must yield no slides');
assert.equal(normalizeDeck({ slides: [{ title: 'A' }] }).length, 1, 'top-level slides');
assert.equal(normalizeDeck({ content: { slides: [{ title: 'A' }] } }).length, 1, 'content.slides');
assert.equal(normalizeDeck({ content: { deck_data: { slides: [{ title: 'A' }] } } }).length, 1, 'content.deck_data.slides');
assert.equal(normalizeDeck({ content: '{"slides":[{"title":"A"},{"title":"B"}]}' }).length, 2, 'JSON string');

// An explicit `layout: undefined` must not clobber the computed default —
// this is the spread-order trap ({...defaults, ...item} loses here).
const defaulted = normalizeDeck({ slides: [{ title: 'A', layout: undefined }] });
assert.equal(defaulted[0].layout, 'bullets', 'undefined layout must fall back to bullets');

assert.equal(deckTitleOf({ name: 'n' }, []), 'n');
assert.equal(deckTitleOf({ title: 't', name: 'n' }, []), 't', 'title wins over name');

// --- exportDeckToPptx: one slide per body shape, so every renderer runs -----
const deck = normalizeDeck({
  title: 'Check Deck',
  slides: [
    { layout: 'hero', title: 'Cover', subtitle: 'Sub', impact_stat: '+42%', date: '2026' },
    { layout: 'bullets', title: 'Bullets', subtitle: 'Sub', bullets: ['one', 'two'], takeaway: 'So what' },
    { layout: 'stat_grid', title: 'Stats', stats: [{ value: '1', label: 'a' }, { value: '2', label: 'b' }] },
    { layout: 'bento_grid', title: 'Items', items: [{ heading: 'h', body: 'b' }] },
    { layout: 'timeline', title: 'Steps', steps: [{ label: 'l', description: 'd', status: 'completed' }] },
    { layout: 'comparison', title: 'Two col', left_heading: 'L', left_bullets: ['x'], right_heading: 'R', right_bullets: ['y'] },
    { layout: 'quote', quote: 'Q', attribution: 'Someone' },
    { layout: 'wildly_unknown_archetype', title: 'Fallback', subtitle: 'promoted into the body' },
  ],
});
assert.equal(deck.length, 8);

const out = 'Check_Deck.pptx';
await exportDeckToPptx(deckTitleOf({ title: 'Check Deck' }, deck), deck);

const buf = readFileSync(out);
assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'must be a ZIP container');
const text = buf.toString('latin1');
for (const part of ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide8.xml']) {
  assert.ok(text.includes(part), `missing OOXML part: ${part}`);
}
unlinkSync(out);

console.log('exportPptx.check OK - 8 slides, valid OOXML package');
