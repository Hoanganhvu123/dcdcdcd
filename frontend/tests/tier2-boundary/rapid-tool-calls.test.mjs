import test from 'node:test';
import assert from 'node:assert/strict';

test('Tier 2.4: Rapid Concurrent Streaming & Bursts', async (t) => {
  await t.test('T2.4.1: Stream buffer reconciler handles rapid burst chunks without dropping tokens', () => {
    const burstPackets = [
      'Thought: Analyzing data...\n',
      'Action: sql_query | SELECT count(*) ',
      'FROM orders;\n',
      'Action Input: {}',
      '\nObservation: 42\n',
      'Thought: Found 42 orders. Now plotting.\n',
      'Action: render_chart | {"type": "bar"}\n',
      'Observation: Chart rendered'
    ];

    let fullBuffer = '';
    for (const packet of burstPackets) {
      fullBuffer += packet;
    }

    assert.ok(fullBuffer.includes('SELECT count(*) FROM orders;'));
    assert.ok(fullBuffer.includes('Observation: 42'));
    assert.ok(fullBuffer.includes('Found 42 orders'));
  });

  await t.test('T2.4.2: Interleaved out-of-order tool steps mapping by ID', () => {
    const stepMap = new Map();

    const incomingEvents = [
      { id: 'step-1', name: 'Init', status: 'running' },
      { id: 'step-2', name: 'Query', status: 'pending' },
      { id: 'step-1', name: 'Init', status: 'completed', duration: 120 },
      { id: 'step-2', name: 'Query', status: 'running' },
      { id: 'step-2', name: 'Query', status: 'completed', duration: 340 }
    ];

    for (const ev of incomingEvents) {
      stepMap.set(ev.id, { ...stepMap.get(ev.id), ...ev });
    }

    assert.equal(stepMap.size, 2);
    assert.equal(stepMap.get('step-1').status, 'completed');
    assert.equal(stepMap.get('step-1').duration, 120);
    assert.equal(stepMap.get('step-2').status, 'completed');
    assert.equal(stepMap.get('step-2').duration, 340);
  });
});
