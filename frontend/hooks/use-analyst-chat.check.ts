/**
 * Runnable check for the analyst SSE reduction.
 *
 *   node frontend/hooks/use-analyst-chat.check.ts
 *
 * No test framework: Node 24 strips TypeScript natively. The fixture is a real
 * capture of a `mode=office` run that produced a genuine 5-slide .pptx, trimmed
 * only of the 780 character-level `task_call` noise events (3 kept, to prove
 * they stay ignored).
 *
 * Every expected value below was verified independently of this code — against
 * the raw capture and the generated file — before being asserted here.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createAccumulator,
  extractArtifacts,
  kindOf,
  parseAnalystStream,
  reduceAnalystEvent,
} from './use-analyst-chat.ts';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, '__fixtures__', 'analyst-ppt-stream.sse'), 'utf8');

const PPTX_URL = '/uploads/generated_pptx/7d5b226b4f9349fe92c6b4943e8664e8.pptx';
const STREAMED_LEN = 1133; // concatenated answer_delta
const FINAL_LEN = 279; // final.payload.answer — deliberately different text

/**
 * Count code points, not UTF-16 units. The answers are emoji-heavy and astral
 * characters count twice under `.length`; code points match what the raw
 * capture was measured at.
 */
const glyphs = (s: string) => [...s].length;

// ── 1. Full replay ──────────────────────────────────────────────────────────
const acc = parseAnalystStream(raw);

assert.equal(glyphs(acc.answer), STREAMED_LEN, 'streamed answer length');
assert.ok(acc.answer.startsWith('Đã xong!'), 'streamed prose, not the template');
assert.ok(acc.final, 'final event reached');
assert.equal(glyphs(acc.final!.answer!), FINAL_LEN, 'final.answer length');

// The whole point of the delta-wins rule: these two are NOT the same text.
assert.notEqual(acc.answer, acc.final!.answer, 'streamed prose must survive final');

assert.equal(acc.final!.sql, null, 'office run produces no SQL');
assert.deepEqual(acc.final!.query_results, [], 'office run queries nothing');
assert.equal(acc.status, '', 'status cleared once final lands');

// ── 2. Artifact detection + dedupe ──────────────────────────────────────────
// The URL appears in tool_result, in the streamed prose, and in final.answer.
assert.equal(acc.artifacts.length, 1, 'artifact emitted exactly once');
assert.equal(acc.artifacts[0].url, PPTX_URL);
assert.equal(acc.artifacts[0].kind, 'pptx');
assert.equal(acc.artifacts[0].filename, '7d5b226b4f9349fe92c6b4943e8664e8.pptx');

// Next has no rewrites: links must carry the backend origin, or they 404 in dev.
process.env.API_BASE_URL = 'http://127.0.0.1:5670';
assert.equal(
  extractArtifacts(PPTX_URL)[0].href,
  'http://127.0.0.1:5670' + PPTX_URL,
  'href prefixed with backend origin',
);
delete process.env.API_BASE_URL;
assert.equal(extractArtifacts(PPTX_URL)[0].href, PPTX_URL, 'same-origin when unset');

// ── 3. Fallback: no deltas at all → final.answer is used ────────────────────
const withoutDeltas = raw
  .split('\n')
  .filter(line => !line.includes('"type":"answer_delta"'))
  .join('\n');
const fallback = parseAnalystStream(withoutDeltas);

assert.equal(fallback.answer, fallback.final!.answer, 'falls back when nothing streamed');
assert.equal(glyphs(fallback.answer), FINAL_LEN);
assert.equal(fallback.artifacts.length, 1, 'artifact still found without deltas');

// ── 4. Noise events are inert ───────────────────────────────────────────────
const noise = createAccumulator();
for (const event of [
  { type: 'task_call', payload: { tool: 'task', args: {} } },
  { type: 'AGENT_SLOT_UPDATE', payload: {} },
  { type: 'intent_detected', payload: { intent: 'TEXT_TO_SQL' } },
  { step: 'final_result', message: 'legacy untyped line' },
]) {
  const change = reduceAnalystEvent(noise, event);
  assert.equal(change.answerChanged, false);
  assert.equal(change.newArtifacts.length, 0);
}
assert.equal(noise.answer, '', 'noise never pollutes the answer');
assert.equal(noise.final, null, 'legacy final_result line is not a final event');

// ── 5. Terminator stops the fold ────────────────────────────────────────────
const truncated = parseAnalystStream(
  ['data: {"type":"answer_delta","payload":{"delta":"before"}}', 'data: [DONE]', 'data: {"type":"answer_delta","payload":{"delta":"after"}}'].join('\n'),
);
assert.equal(truncated.answer, 'before', '[DONE] halts consumption');

// ── 6. extractArtifacts unit ────────────────────────────────────────────────
assert.deepEqual(
  extractArtifacts('see /uploads/a/x.docx and /uploads/b/y.xlsx and /uploads/a/x.docx').map(a => a.kind),
  ['docx', 'xlsx'],
  'multi-extension + dedupe',
);
assert.equal(extractArtifacts('no links here').length, 0);
assert.equal(extractArtifacts('/uploads/a/b.exe').length, 0, 'only known document types');

// ── 7. Typed artifact.* lifecycle events ────────────────────────────────────
const lifecycle = createAccumulator();

const startChange = reduceAnalystEvent(lifecycle, {
  type: 'artifact.start',
  payload: { id: 'abc123', kind: 'pptx', title: 'Doanh thu Q4' },
});
assert.equal(startChange.newArtifacts.length, 1, 'artifact.start reported');
assert.equal(lifecycle.artifacts.length, 1);
assert.equal(lifecycle.artifacts[0].id, 'abc123');
assert.equal(lifecycle.artifacts[0].status, 'streaming');
assert.equal(lifecycle.artifacts[0].pct, 0);
assert.equal(lifecycle.artifacts[0].kind, 'pptx');
assert.equal(lifecycle.artifacts[0].title, 'Doanh thu Q4');
assert.equal(lifecycle.artifacts[0].url, '', 'no url until ready');

reduceAnalystEvent(lifecycle, {
  type: 'artifact.progress',
  payload: { id: 'abc123', stage: 'rendering slide 3/5', pct: 60 },
});
assert.equal(lifecycle.artifacts.length, 1, 'progress updates in place, no duplicate');
assert.equal(lifecycle.artifacts[0].status, 'streaming');
assert.equal(lifecycle.artifacts[0].pct, 60);
assert.equal(lifecycle.artifacts[0].stage, 'rendering slide 3/5');
assert.equal(lifecycle.artifacts[0].title, 'Doanh thu Q4', 'earlier fields survive the merge');

process.env.API_BASE_URL = 'http://127.0.0.1:5670';
const readyChange = reduceAnalystEvent(lifecycle, {
  type: 'artifact.ready',
  payload: {
    id: 'abc123',
    url: '/uploads/generated_pptx/abc123.pptx',
    bytes: 40960,
    preview_html: '<html><body>slide preview</body></html>',
  },
});
delete process.env.API_BASE_URL;
assert.equal(lifecycle.artifacts.length, 1);
assert.equal(lifecycle.artifacts[0].status, 'ready');
assert.equal(lifecycle.artifacts[0].pct, 100);
assert.equal(lifecycle.artifacts[0].url, '/uploads/generated_pptx/abc123.pptx');
assert.equal(lifecycle.artifacts[0].href, 'http://127.0.0.1:5670/uploads/generated_pptx/abc123.pptx');
assert.equal(lifecycle.artifacts[0].filename, 'abc123.pptx', 'derived from url when server omits filename');
assert.equal(readyChange.newArtifacts[0].kind, 'pptx');
assert.equal(
  lifecycle.artifacts[0].previewHtml,
  '<html><body>slide preview</body></html>',
  'preview_html payload field captured for inline rendering',
);

// A second, independent artifact must not collide with the first by id.
const errorChange = reduceAnalystEvent(lifecycle, {
  type: 'artifact.error',
  payload: { id: 'def456', message: 'LibreOffice timeout' },
});
assert.equal(lifecycle.artifacts.length, 2, 'distinct id gets its own record');
assert.equal(errorChange.newArtifacts[0].status, 'error');
assert.equal(errorChange.newArtifacts[0].error, 'LibreOffice timeout');
assert.equal(lifecycle.artifacts[0].status, 'ready', 'first artifact untouched by the second');

// Missing id is dropped rather than crashing or polluting the map.
const idless = reduceAnalystEvent(createAccumulator(), { type: 'artifact.progress', payload: { pct: 50 } });
assert.equal(idless.newArtifacts.length, 0, 'event without id is a no-op');

// ── 8. kindOf extension & document type aliases ─────────────────────────────
assert.equal(kindOf('ppt'), 'pptx', 'kindOf("ppt") must map to "pptx"');
assert.equal(kindOf('presentation.ppt'), 'pptx', 'kindOf("presentation.ppt") must map to "pptx"');
assert.equal(kindOf('word'), 'docx', 'kindOf("word") must map to "docx"');
assert.equal(kindOf('document.word'), 'docx', 'kindOf("document.word") must map to "docx"');
assert.equal(kindOf('doc'), 'docx', 'kindOf("doc") must map to "docx"');
assert.equal(kindOf('report.doc'), 'docx', 'kindOf("report.doc") must map to "docx"');
assert.equal(kindOf('excel'), 'xlsx', 'kindOf("excel") must map to "xlsx"');
assert.equal(kindOf('sheet.excel'), 'xlsx', 'kindOf("sheet.excel") must map to "xlsx"');
assert.equal(kindOf('xls'), 'xlsx', 'kindOf("xls") must map to "xlsx"');
assert.equal(kindOf('data.xls'), 'xlsx', 'kindOf("data.xls") must map to "xlsx"');
assert.equal(kindOf('report'), 'xlsx', 'kindOf("report") must map to "xlsx"');
assert.equal(kindOf('summary.report'), 'xlsx', 'kindOf("summary.report") must map to "xlsx"');
assert.equal(kindOf('csv'), 'csv', 'kindOf("csv") must map to "csv"');
assert.equal(kindOf('pdf'), 'pdf', 'kindOf("pdf") must map to "pdf"');
assert.equal(kindOf('unknown_ext'), 'other', 'unknown types map to "other"');

// ── 9. Deduplication between typed artifact.ready and streamed prose ────────
const dedupeAcc = createAccumulator();
const READY_URL = '/uploads/generated_pptx/typed-and-prose-uuid.pptx';

// Step A: backend emits typed lifecycle events with custom id
const startAlias = reduceAnalystEvent(dedupeAcc, {
  type: 'artifact.start',
  payload: { id: 'typed-and-prose-uuid', kind: 'ppt', title: 'Q4 Slides' },
});
assert.equal(dedupeAcc.artifacts.length, 1);
assert.equal(startAlias.newArtifacts[0].kind, 'pptx', 'artifact.start with kind="ppt" derives pptx');
assert.equal(dedupeAcc.artifacts[0].kind, 'pptx');

reduceAnalystEvent(dedupeAcc, {
  type: 'artifact.ready',
  payload: {
    id: 'typed-and-prose-uuid',
    url: READY_URL,
    bytes: 1024,
  },
});
assert.equal(dedupeAcc.artifacts.length, 1);
assert.equal(dedupeAcc.artifacts[0].status, 'ready');
assert.equal(dedupeAcc.artifacts[0].url, READY_URL);

// Step B: supervisor streams answer_delta mentioning the exact same URL
const proseChange = reduceAnalystEvent(dedupeAcc, {
  type: 'answer_delta',
  payload: { delta: `Here is the deck: ${READY_URL} for your review.` },
});
assert.equal(dedupeAcc.artifacts.length, 1, 'prose mentioning URL must not duplicate typed artifact');
assert.equal(proseChange.newArtifacts.length, 0, 'no new artifacts produced on duplicate prose URL');

// Step C: final event also containing the URL
const finalChange = reduceAnalystEvent(dedupeAcc, {
  type: 'final',
  payload: { answer: `Done! Download at ${READY_URL}` },
});
assert.equal(dedupeAcc.artifacts.length, 1, 'final event with URL must not duplicate typed artifact');
assert.equal(finalChange.newArtifacts.length, 0, 'no new artifacts produced on final duplicate URL');

// ── 10. artifact.start aliases for word, excel, and report ──────────────────
const aliasAcc = createAccumulator();
reduceAnalystEvent(aliasAcc, {
  type: 'artifact.start',
  payload: { id: 'word-id', kind: 'word', title: 'Word Doc' },
});
assert.equal(aliasAcc.artifacts[0].kind, 'docx', 'kind="word" maps to "docx"');

reduceAnalystEvent(aliasAcc, {
  type: 'artifact.start',
  payload: { id: 'doc-id', kind: 'doc', title: 'Doc' },
});
assert.equal(aliasAcc.artifacts[1].kind, 'docx', 'kind="doc" maps to "docx"');

reduceAnalystEvent(aliasAcc, {
  type: 'artifact.start',
  payload: { id: 'excel-id', kind: 'excel', title: 'Excel Sheet' },
});
assert.equal(aliasAcc.artifacts[2].kind, 'xlsx', 'kind="excel" maps to "xlsx"');

reduceAnalystEvent(aliasAcc, {
  type: 'artifact.start',
  payload: { id: 'report-id', kind: 'report', title: 'Financial Report' },
});
assert.equal(aliasAcc.artifacts[3].kind, 'xlsx', 'kind="report" maps to "xlsx"');
assert.equal(aliasAcc.artifacts.length, 4);

console.log('use-analyst-chat: all checks passed');
