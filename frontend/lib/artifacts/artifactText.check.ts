/**
 * Runnable check for the artifact text reader.
 *   node lib/artifacts/artifactText.check.ts        (from frontend/)
 *
 * The bug this pins: the code pane rendered `{"code":"SELECT …","language":"sql"}`
 * instead of the query, and the copy button put that envelope on the clipboard.
 */
import assert from 'node:assert/strict';
import { artifactText, artifactLanguage } from './artifactText.ts';

// --- the shape the store actually writes for a code artifact ---------------
assert.equal(
  artifactText({ code: 'SELECT store, SUM(sales) FROM w GROUP BY 1', language: 'sql' }),
  'SELECT store, SUM(sales) FROM w GROUP BY 1',
  'the code pane must show the query, not the envelope',
);
assert.equal(artifactLanguage({ code: 'x', language: 'sql' }), 'sql');

// --- the other envelopes agents emit ---------------------------------------
assert.equal(artifactText('plain string'), 'plain string');
assert.equal(artifactText({ source: 'print(1)' }), 'print(1)');
assert.equal(artifactText({ script: 'ls -la' }), 'ls -la');
assert.equal(artifactText({ sql: 'SELECT 1' }), 'SELECT 1');
assert.equal(artifactText({ content: 'nested string' }), 'nested string');
assert.equal(artifactText({ content: { code: 'deep' } }), 'deep', 'one envelope layer deep');

// --- precedence: `code` wins when several keys are present -----------------
assert.equal(artifactText({ code: 'winner', text: 'loser' }), 'winner');

// --- empties fall through rather than rendering as blank -------------------
assert.equal(artifactText(null), '');
assert.equal(artifactText(undefined), '');
assert.ok(
  artifactText({ code: '   ', rows: [[1]] }).includes('rows'),
  'a whitespace-only code field must not mask real payload',
);

// --- no text at all: readable JSON beats [object Object] -------------------
const sheet = artifactText({ sheets: [{ name: 'Query_Result', rows: [['store', 'sales']] }] });
assert.ok(sheet.includes('Query_Result') && sheet.includes('\n'), 'pretty-printed, not collapsed');

// --- a cycle must not throw inside a render --------------------------------
const cyc: any = { a: 1 };
cyc.self = cyc;
assert.doesNotThrow(() => artifactText(cyc), 'circular payload must degrade, not crash the pane');

assert.equal(artifactLanguage({ rows: [] }), 'text', 'default when nothing hints');
assert.equal(artifactLanguage({ query: 'SELECT 1' }), 'sql');

console.log('artifactText.check OK - envelopes unwrap, payloads without text stay readable');
