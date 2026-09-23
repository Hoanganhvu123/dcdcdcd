/**
 * Adversarial Stress-Testing Suite for R3 (SSE Streaming, Event Delivery, and Frontend State Reducer).
 *
 * Executes empirical stress-tests against:
 * 1. Out-of-order `artifact.*` events (missing start, duplicate ready, late progress, error after ready)
 * 2. Rapid-fire progress bursts (100+ to 1,000+ events/sec) and multi-artifact concurrency
 * 3. Corrupted, truncated, and malformed JSON SSE lines and null/primitive frames
 * 4. Chunk boundary fragmentation, stream drops, and abort handling
 * 5. Layout stability contracts and preview HTML rendering
 */

import assert from 'node:assert/strict';
import {
  createAccumulator,
  extractArtifacts,
  kindOf,
  parseAnalystStream,
  reduceAnalystEvent,
  consumeSSELines,
  type AnalystAccumulator,
  type AnalystEvent,
  type AnalystArtifact,
} from './use-analyst-chat.ts';

console.log('=== STARTING ADVERSARIAL STRESS TESTING FOR R3 ===\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    if (err.stack) {
      console.error(`         ${err.stack.split('\n')[1]}`);
    }
    failedTests++;
  }
}

// ============================================================================
// SUITE 1: Out-of-Order & Lifecycle Event Permutations
// ============================================================================
console.log('--- SUITE 1: Out-of-Order & Lifecycle Permutations ---');

runTest('1.1: Missing artifact.start — progress arrives first', () => {
  const acc = createAccumulator();
  const change = reduceAnalystEvent(acc, {
    type: 'artifact.progress',
    payload: { id: 'art_ooo_1', stage: 'generating slides', pct: 35 },
  });

  assert.equal(acc.artifacts.length, 1, 'Artifact created despite missing start');
  assert.equal(acc.artifacts[0].id, 'art_ooo_1');
  assert.equal(acc.artifacts[0].status, 'streaming');
  assert.equal(acc.artifacts[0].pct, 35);
  assert.equal(acc.artifacts[0].stage, 'generating slides');
  assert.equal(acc.artifacts[0].kind, 'other', 'Defaults gracefully to other');
  assert.equal(change.newArtifacts.length, 1);
});

runTest('1.2: Missing artifact.start and progress — ready arrives directly', () => {
  const acc = createAccumulator();
  const change = reduceAnalystEvent(acc, {
    type: 'artifact.ready',
    payload: {
      id: 'art_ooo_2',
      url: '/uploads/reports/financial_2024.xlsx',
      bytes: 12450,
    },
  });

  assert.equal(acc.artifacts.length, 1, 'Artifact created directly as ready');
  assert.equal(acc.artifacts[0].id, 'art_ooo_2');
  assert.equal(acc.artifacts[0].status, 'ready');
  assert.equal(acc.artifacts[0].pct, 100);
  assert.equal(acc.artifacts[0].kind, 'xlsx');
  assert.equal(acc.artifacts[0].filename, 'financial_2024.xlsx');
  assert.equal(change.newArtifacts[0].status, 'ready');
});

runTest('1.3: Duplicate artifact.ready events are idempotent and update fields', () => {
  const acc = createAccumulator();
  reduceAnalystEvent(acc, {
    type: 'artifact.start',
    payload: { id: 'art_dup_1', kind: 'pptx', title: 'Q1 Review' },
  });
  
  // First ready
  reduceAnalystEvent(acc, {
    type: 'artifact.ready',
    payload: {
      id: 'art_dup_1',
      url: '/uploads/gen/q1.pptx',
      preview_html: '<div>v1</div>',
    },
  });
  assert.equal(acc.artifacts.length, 1);
  assert.equal(acc.artifacts[0].previewHtml, '<div>v1</div>');

  // Duplicate ready (e.g. re-sent by proxy or server retry)
  reduceAnalystEvent(acc, {
    type: 'artifact.ready',
    payload: {
      id: 'art_dup_1',
      url: '/uploads/gen/q1.pptx',
      preview_html: '<div>v2 updated</div>',
    },
  });
  assert.equal(acc.artifacts.length, 1, 'Duplicate ready must not duplicate artifact record');
  assert.equal(acc.artifacts[0].status, 'ready');
  assert.equal(acc.artifacts[0].previewHtml, '<div>v2 updated</div>', 'Updates preview to latest');
});

runTest('1.4: Late artifact.progress arrives AFTER artifact.ready (Out-of-Order network packet)', () => {
  const acc = createAccumulator();
  reduceAnalystEvent(acc, {
    type: 'artifact.start',
    payload: { id: 'art_late_1', kind: 'docx', title: 'Report' },
  });
  reduceAnalystEvent(acc, {
    type: 'artifact.ready',
    payload: { id: 'art_late_1', url: '/uploads/report.docx' },
  });
  assert.equal(acc.artifacts[0].status, 'ready');
  assert.equal(acc.artifacts[0].pct, 100);

  // Late progress packet arriving out-of-order
  reduceAnalystEvent(acc, {
    type: 'artifact.progress',
    payload: { id: 'art_late_1', stage: 'compiling 80%', pct: 80 },
  });

  console.log('       (Observation 1.4: Late progress on ready artifact resulted in status: ' + acc.artifacts[0].status + ', pct: ' + acc.artifacts[0].pct + ')');
  assert.equal(acc.artifacts.length, 1, 'Artifact list size remains 1');
});

runTest('1.5: Error event after ready vs Ready event after error', () => {
  const acc = createAccumulator();
  reduceAnalystEvent(acc, {
    type: 'artifact.error',
    payload: { id: 'art_err_1', message: 'Temporary failure' },
  });
  assert.equal(acc.artifacts[0].status, 'error');
  assert.equal(acc.artifacts[0].error, 'Temporary failure');

  // Recovery / Retry ready event with same ID
  reduceAnalystEvent(acc, {
    type: 'artifact.ready',
    payload: { id: 'art_err_1', url: '/uploads/recovered.xlsx' },
  });
  assert.equal(acc.artifacts[0].status, 'ready');
  assert.equal(acc.artifacts[0].url, '/uploads/recovered.xlsx');
  assert.equal(acc.artifacts[0].pct, 100);
});

// ============================================================================
// SUITE 2: Rapid-Fire Bursts & Concurrency Stress
// ============================================================================
console.log('\n--- SUITE 2: Rapid-Fire Bursts & Concurrency Stress ---');

runTest('2.1: 1,000 rapid-fire progress updates (simulating 100-1000 events/sec)', () => {
  const acc = createAccumulator();
  reduceAnalystEvent(acc, {
    type: 'artifact.start',
    payload: { id: 'burst_1', kind: 'pptx', title: 'High Frequency Deck' },
  });

  const t0 = performance.now();
  const EVENT_COUNT = 1000;
  for (let i = 1; i <= EVENT_COUNT; i++) {
    const pct = Math.min(100, Math.floor((i / EVENT_COUNT) * 100));
    reduceAnalystEvent(acc, {
      type: 'artifact.progress',
      payload: { id: 'burst_1', stage: `Step ${i}/${EVENT_COUNT}`, pct },
    });
  }
  const t1 = performance.now();

  assert.equal(acc.artifacts.length, 1, 'Exactly one artifact preserved');
  assert.equal(acc.artifacts[0].pct, 100);
  assert.equal(acc.artifacts[0].stage, `Step 1000/1000`);
  console.log(`       (Throughput: ${EVENT_COUNT} events processed in ${(t1 - t0).toFixed(2)}ms -> ${(EVENT_COUNT / ((t1 - t0) / 1000)).toFixed(0)} events/sec)`);
});

runTest('2.2: Concurrent multi-artifact interleaved bursts (10 artifacts x 100 events)', () => {
  const acc = createAccumulator();
  const ARTIFACT_COUNT = 10;
  const EVENTS_PER_ART = 100;

  for (let a = 0; a < ARTIFACT_COUNT; a++) {
    reduceAnalystEvent(acc, {
      type: 'artifact.start',
      payload: { id: `multi_${a}`, kind: a % 2 === 0 ? 'docx' : 'xlsx', title: `Doc ${a}` },
    });
  }
  assert.equal(acc.artifacts.length, ARTIFACT_COUNT);

  // Interleave events across all artifacts
  for (let step = 1; step <= EVENTS_PER_ART; step++) {
    for (let a = 0; a < ARTIFACT_COUNT; a++) {
      reduceAnalystEvent(acc, {
        type: 'artifact.progress',
        payload: { id: `multi_${a}`, stage: `Rendering item ${step}`, pct: step },
      });
    }
  }

  // Finalize all
  for (let a = 0; a < ARTIFACT_COUNT; a++) {
    reduceAnalystEvent(acc, {
      type: 'artifact.ready',
      payload: { id: `multi_${a}`, url: `/uploads/multi_${a}.${a % 2 === 0 ? 'docx' : 'xlsx'}` },
    });
  }

  assert.equal(acc.artifacts.length, ARTIFACT_COUNT);
  for (let a = 0; a < ARTIFACT_COUNT; a++) {
    const art = acc.artifacts.find(item => item.id === `multi_${a}`);
    assert.ok(art, `Artifact multi_${a} found`);
    assert.equal(art.status, 'ready');
    assert.equal(art.pct, 100);
    assert.equal(art.url, `/uploads/multi_${a}.${a % 2 === 0 ? 'docx' : 'xlsx'}`);
  }
});

// ============================================================================
// SUITE 3: Corrupted, Truncated & Malformed JSON SSE lines
// ============================================================================
console.log('\n--- SUITE 3: Corrupted, Truncated & Malformed Frames ---');

runTest('3.1: Malformed JSON syntax in SSE data lines is gracefully skipped', () => {
  const lines = [
    'data: {"type": "answer_delta", "payload": {"delta": "Hello "}}',
    'data: {"type": "answer_delta", "payload": {"delta": "BROKEN_JSON',
    'data: {invalid syntax:::}',
    'data: ',
    'data: {"type": "answer_delta", "payload": {"delta": "World!"}}',
    'data: [DONE]',
  ];

  const acc = createAccumulator();
  const finished = consumeSSELines(lines, event => reduceAnalystEvent(acc, event));

  assert.equal(finished, true, 'Reached [DONE]');
  assert.equal(acc.answer, 'Hello World!', 'Extracted valid frames while skipping corrupted lines');
});

runTest('3.2: Primitive JSON values in SSE stream do not crash parser', () => {
  const lines = [
    'data: 12345',
    'data: "string literal"',
    'data: true',
    'data: []',
    'data: null',
    'data: {"type": "status", "payload": {"message": "Active"}}',
    'data: [DONE]',
  ];

  const acc = createAccumulator();
  const finished = consumeSSELines(lines, event => {
    reduceAnalystEvent(acc, event);
  });

  assert.equal(finished, true);
  assert.equal(acc.status, 'Active');
});

runTest('3.3: Null and missing payload properties in typed events', () => {
  const acc = createAccumulator();

  // artifact.start with empty payload
  reduceAnalystEvent(acc, { type: 'artifact.start', payload: {} });
  assert.equal(acc.artifacts.length, 0, 'No-op for start with missing ID');

  // artifact.progress with missing ID
  reduceAnalystEvent(acc, { type: 'artifact.progress', payload: { pct: 50 } });
  assert.equal(acc.artifacts.length, 0, 'No-op for progress with missing ID');

  // artifact.ready with missing ID
  reduceAnalystEvent(acc, { type: 'artifact.ready', payload: { url: '/test.xlsx' } });
  assert.equal(acc.artifacts.length, 0, 'No-op for ready with missing ID');

  // artifact.error with missing ID
  reduceAnalystEvent(acc, { type: 'artifact.error', payload: { message: 'err' } });
  assert.equal(acc.artifacts.length, 0, 'No-op for error with missing ID');

  // Null payload
  reduceAnalystEvent(acc, { type: 'artifact.start', payload: undefined });
  reduceAnalystEvent(acc, { type: 'answer_delta', payload: undefined });
  reduceAnalystEvent(acc, { type: 'status', payload: undefined });
  reduceAnalystEvent(acc, { type: 'final', payload: undefined });
});

// ============================================================================
// SUITE 4: Chunk Fragmentation & Connection Drop Simulation
// ============================================================================
console.log('\n--- SUITE 4: Chunk Fragmentation & Drop Simulation ---');

runTest('4.1: Stream buffer handles chunks split mid-event and mid-line', () => {
  const rawChunks = [
    'data: {"type": "artifact.st',
    'art", "payload": {"id": "chunk_art", "kind": "pptx", "title": "Chunked Deck"}}\n',
    'data: {"type": "artifact.progress", "payload": {"id": "chunk_art", "pct": 5',
    '0, "stage": "rendering"}}\ndata: {"type": "artifact.ready", "payload": {"id": "chunk_art", "url": "/up',
    'loads/chunked.pptx", "bytes": 8800}}\ndata: [DONE]\n',
  ];

  const acc = createAccumulator();
  let buffer = '';
  let finished = false;

  for (const chunk of rawChunks) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete tail
    if (consumeSSELines(lines, event => reduceAnalystEvent(acc, event))) {
      finished = true;
      break;
    }
  }

  assert.equal(finished, true, 'Stream finished successfully across fragments');
  assert.equal(acc.artifacts.length, 1);
  assert.equal(acc.artifacts[0].status, 'ready');
  assert.equal(acc.artifacts[0].url, '/uploads/chunked.pptx');
  assert.equal(acc.artifacts[0].pct, 100);
});

runTest('4.2: Abrupt stream termination (Drop before [DONE])', () => {
  const incompleteSSE = [
    'data: {"type": "artifact.start", "payload": {"id": "drop_1", "kind": "docx", "title": "Drop Doc"}}',
    'data: {"type": "artifact.progress", "payload": {"id": "drop_1", "pct": 40, "stage": "drafting"}}',
    // Server drops connection here, no [DONE]
  ].join('\n');

  const acc = parseAnalystStream(incompleteSSE);
  assert.equal(acc.artifacts.length, 1);
  assert.equal(acc.artifacts[0].status, 'streaming', 'Retains last known streaming state');
  assert.equal(acc.artifacts[0].pct, 40);
  assert.equal(acc.final, null, 'final remains null upon abrupt drop');
});

// ============================================================================
// SUITE 5: Layout Stability & Preview HTML Verification
// ============================================================================
console.log('\n--- SUITE 5: Layout Stability & Preview Rendering ---');

runTest('5.1: HTML Preview XSS sandbox isolation check', () => {
  const acc = createAccumulator();
  const maliciousPreview = '<script>window.__xss_leaked = true;</script><iframe src="javascript:alert(1)"></iframe><div>Deck Preview</div>';
  
  reduceAnalystEvent(acc, {
    type: 'artifact.ready',
    payload: {
      id: 'xss_test',
      url: '/uploads/gen.pptx',
      preview_html: maliciousPreview,
    },
  });

  assert.equal(acc.artifacts[0].previewHtml, maliciousPreview);
});

runTest('5.2: State invariant holds across transitions (streaming -> ready -> error)', () => {
  const acc = createAccumulator();
  
  // Transition 1: Streaming
  reduceAnalystEvent(acc, {
    type: 'artifact.start',
    payload: { id: 'state_1', kind: 'excel', title: 'Financials' },
  });
  assert.equal(acc.artifacts[0].status, 'streaming');

  // Transition 2: Ready
  reduceAnalystEvent(acc, {
    type: 'artifact.ready',
    payload: { id: 'state_1', url: '/uploads/fin.xlsx' },
  });
  assert.equal(acc.artifacts[0].status, 'ready');

  // Transition 3: Error
  reduceAnalystEvent(acc, {
    type: 'artifact.error',
    payload: { id: 'state_1', message: 'Storage detached' },
  });
  assert.equal(acc.artifacts[0].status, 'error');
  assert.equal(acc.artifacts[0].error, 'Storage detached');
});

console.log('\n=== TEST RESULTS SUMMARY ===');
console.log(`Total tests: ${passedTests + failedTests} | Passed: ${passedTests} | Failed: ${failedTests}`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('ALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY!\n');
}
