import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenworkControlEngine,
  describeError,
  returnedActionError,
  metadataForAction,
  affordanceForAction,
  openworkAffordanceRequestSchema,
  openworkAffordanceResultSchema,
  openworkContextSnapshotSchema,
} from './fixtures/control-engine-simulator.mjs';

test('⚡ ADVERSARIAL CHALLENGER SUITE: Milestone 1 & 2 Stress Tests', async (t) => {

  // =========================================================================
  // CHALLENGE 1: High-Concurrency Race Conditions (50+ simultaneous commands vs queries)
  // =========================================================================
  await t.test('C1.1: 60 Simultaneous Overlapping Commands — Strict Mutex Exclusivity', async () => {
    const engine = new OpenworkControlEngine();
    let totalExecutions = 0;
    const executionLog = [];

    // Register a command that takes 30ms to execute
    engine.registerAction('heavy_computation', {
      current: {
        id: 'heavy_computation',
        label: 'Heavy Computation',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async (args) => {
          totalExecutions++;
          const execId = args?.index;
          executionLog.push({ event: 'start', execId, timestamp: Date.now() });
          await new Promise((resolve) => setTimeout(resolve, 30));
          executionLog.push({ event: 'finish', execId, timestamp: Date.now() });
          return { computed: true, execId };
        },
      },
    });

    // Fire 60 simultaneous command requests with distinct actors
    const commandPromises = Array.from({ length: 60 }, (_, i) =>
      engine.command({
        id: 'heavy_computation',
        args: { index: i },
        actor: `actor_${i}`,
      })
    );

    const results = await Promise.all(commandPromises);

    // Exactly 1 command must succeed
    const successful = results.filter((r) => r.ok === true);
    const conflicts = results.filter((r) => r.ok === false && r.code === 'conflict');

    assert.equal(successful.length, 1, `Expected exactly 1 successful execution, got ${successful.length}`);
    assert.equal(conflicts.length, 59, `Expected 59 conflicts, got ${conflicts.length}`);
    assert.equal(totalExecutions, 1, `Expected total underlying executions to be 1, got ${totalExecutions}`);

    // Verify all 59 failed requests had clean conflict error messages
    for (const conflict of conflicts) {
      assert.match(conflict.error, /^Already acting: heavy_computation/);
    }

    // Verify engine state is completely clean
    assert.equal(engine.busyActionId, null);
    assert.equal(engine.busyActor, null);
    assert.equal(engine.snapshot().status, 'ready');
  });

  await t.test('C1.2: 100 Simultaneous Queries during Active Command Execution (Zero Blocking)', async () => {
    const engine = new OpenworkControlEngine();
    let longCommandRunning = false;
    let resolveCommand;
    const commandPromise = new Promise((resolve) => {
      resolveCommand = resolve;
    });

    engine.registerAction('long_batch_export', {
      current: {
        id: 'long_batch_export',
        label: 'Long Batch Export',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => {
          longCommandRunning = true;
          await commandPromise;
          longCommandRunning = false;
          return { exported: true };
        },
      },
    });

    let queryCounter = 0;
    engine.registerAction('get_metrics', {
      current: {
        id: 'get_metrics',
        label: 'Get Real-time Metrics',
        kind: 'query',
        sideEffect: 'none',
        execute: async () => {
          queryCounter++;
          return { queriesServed: queryCounter, duringActiveCommand: longCommandRunning };
        },
      },
    });

    // Start long command
    const cmdTask = engine.command({ id: 'long_batch_export', actor: 'batch_worker' });
    await new Promise((r) => setTimeout(r, 10)); // Ensure command has started
    assert.equal(engine.busyActionId, 'long_batch_export');

    // Fire 100 simultaneous queries while command is busy
    const queryPromises = Array.from({ length: 100 }, (_, i) =>
      engine.query({ id: 'get_metrics', args: { queryId: i } })
    );

    const queryResults = await Promise.all(queryPromises);

    // All 100 queries must succeed
    assert.equal(queryResults.length, 100);
    for (const qr of queryResults) {
      assert.equal(qr.ok, true);
      assert.equal(qr.result.duringActiveCommand, true);
    }
    assert.equal(queryCounter, 100);

    // Release command
    resolveCommand();
    const cmdResult = await cmdTask;
    assert.equal(cmdResult.ok, true);
  });

  await t.test('C1.3: Chaos Interleaving (50 Random Commands + 50 Random Queries with Micro-Delays)', async () => {
    const engine = new OpenworkControlEngine();
    let activeCommandsCount = 0;
    let maxConcurrentCommandsObserved = 0;

    engine.registerAction('chaos_cmd', {
      current: {
        id: 'chaos_cmd',
        label: 'Chaos Command',
        kind: 'command',
        execute: async () => {
          activeCommandsCount++;
          if (activeCommandsCount > maxConcurrentCommandsObserved) {
            maxConcurrentCommandsObserved = activeCommandsCount;
          }
          await new Promise((r) => setTimeout(r, Math.random() * 15 + 5));
          activeCommandsCount--;
          return { done: true };
        },
      },
    });

    engine.registerAction('chaos_qry', {
      current: {
        id: 'chaos_qry',
        label: 'Chaos Query',
        kind: 'query',
        execute: async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 10 + 2));
          return { data: 'query_ok' };
        },
      },
    });

    // Schedule 100 intermixed requests with random start delays (0-20ms)
    const tasks = [];
    for (let i = 0; i < 50; i++) {
      tasks.push(
        (async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          return engine.command({ id: 'chaos_cmd', actor: `chaos_actor_${i}` });
        })()
      );
      tasks.push(
        (async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          return engine.query({ id: 'chaos_qry' });
        })()
      );
    }

    const allResults = await Promise.all(tasks);
    assert.equal(allResults.length, 100);

    // Invariant: Concurrent active commands executing simultaneously MUST NEVER exceed 1
    assert.ok(maxConcurrentCommandsObserved <= 1, `Max concurrent commands was ${maxConcurrentCommandsObserved}, expected <= 1`);
    assert.equal(activeCommandsCount, 0);
    assert.equal(engine.busyActionId, null);
  });

  // =========================================================================
  // CHALLENGE 2: Rapid Revision Increments & Out-Of-Order expectedRevision
  // =========================================================================
  await t.test('C2.1: Monotonic Revision Invariant under 200 Lifecycle Operations', async () => {
    const engine = new OpenworkControlEngine();
    let lastRevision = engine.contextRevision;
    const revisionHistory = [lastRevision];

    // Perform 200 rapid mutations
    for (let i = 0; i < 50; i++) {
      const actionId = `act_${i}`;
      const unreg = engine.registerAction(actionId, {
        current: { id: actionId, label: `Act ${i}`, kind: 'command', execute: async () => i },
      });
      assert.ok(engine.contextRevision > lastRevision, `Revision did not increment on register: ${engine.contextRevision} vs ${lastRevision}`);
      lastRevision = engine.contextRevision;
      revisionHistory.push(lastRevision);

      // Execute action
      const res = await engine.command({ id: actionId });
      assert.equal(res.ok, true);
      assert.ok(engine.contextRevision > lastRevision, `Revision did not increment on command: ${engine.contextRevision} vs ${lastRevision}`);
      lastRevision = engine.contextRevision;
      revisionHistory.push(lastRevision);

      // Unregister action
      unreg();
      assert.ok(engine.contextRevision > lastRevision, `Revision did not increment on unregister: ${engine.contextRevision} vs ${lastRevision}`);
      lastRevision = engine.contextRevision;
      revisionHistory.push(lastRevision);
    }

    // Verify strict monotonicity across all 151 recorded steps
    for (let i = 1; i < revisionHistory.length; i++) {
      assert.ok(revisionHistory[i] > revisionHistory[i - 1], `Non-monotonic revision at step ${i}: ${revisionHistory[i]} <= ${revisionHistory[i-1]}`);
    }
  });

  await t.test('C2.2: Out-Of-Order expectedRevision Boundary Matrix', async () => {
    const engine = new OpenworkControlEngine();
    engine.registerAction('test_action', {
      current: { id: 'test_action', label: 'Test Action', kind: 'command', execute: async () => ({ ok: true }) },
    });

    const currentRev = engine.contextRevision; // e.g. 1

    // 1. Current matching revision -> SUCCEEDS
    const matchRes = await engine.command({ id: 'test_action', expectedRevision: currentRev });
    assert.equal(matchRes.ok, true);

    const postRev = engine.contextRevision; // Now 3

    // 2. Past / Stale revision (postRev - 1, postRev - 2, 0) -> CONFLICT
    for (const stale of [0, 1, postRev - 1]) {
      const staleRes = await engine.command({ id: 'test_action', expectedRevision: stale });
      assert.equal(staleRes.ok, false);
      if (!staleRes.ok) {
        assert.equal(staleRes.code, 'conflict');
        assert.match(staleRes.error, new RegExp(`OpenWork context changed from revision ${stale} to ${postRev}`));
      }
    }

    // 3. Future revision (postRev + 1, postRev + 500) -> CONFLICT
    for (const future of [postRev + 1, postRev + 500]) {
      const futureRes = await engine.command({ id: 'test_action', expectedRevision: future });
      assert.equal(futureRes.ok, false);
      if (!futureRes.ok) {
        assert.equal(futureRes.code, 'conflict');
        assert.match(futureRes.error, new RegExp(`OpenWork context changed from revision ${future} to ${postRev}`));
      }
    }

    // 4. Undefined / omitted expectedRevision -> SUCCEEDS (optimistic check bypassed)
    const omittedRes = await engine.command({ id: 'test_action' });
    assert.equal(omittedRes.ok, true);
  });

  // =========================================================================
  // CHALLENGE 3: Hook Unmounting Stress (Rapid Registration & Unregistration)
  // =========================================================================
  await t.test('C3.1: 200 Actions Rapid Registration and Unregistration Cycle', () => {
    const engine = new OpenworkControlEngine();
    const cleanups = [];

    // Register 200 actions
    for (let i = 0; i < 200; i++) {
      const id = `action_batch_${i}`;
      const unreg = engine.registerAction(id, {
        current: { id, label: `Action ${i}`, kind: 'command', execute: () => i },
      });
      cleanups.push(unreg);
    }

    assert.equal(engine.listActions().length, 200);

    // Unregister in reverse order
    while (cleanups.length > 0) {
      const unreg = cleanups.pop();
      unreg();
    }

    assert.equal(engine.listActions().length, 0);
  });

  await t.test('C3.2: Stale Cleanup Token Protection on Rapid Component Re-registration', () => {
    const engine = new OpenworkControlEngine();

    // Component V1 mounts
    const refV1 = { current: { id: 'modal.save', label: 'Save V1', kind: 'command', execute: () => 'v1' } };
    const unregisterV1 = engine.registerAction('modal.save', refV1);

    // Component V2 replaces V1 before V1 unregister cleanup runs
    const refV2 = { current: { id: 'modal.save', label: 'Save V2', kind: 'command', execute: () => 'v2' } };
    const unregisterV2 = engine.registerAction('modal.save', refV2);

    assert.equal(engine.listActions().length, 1);
    assert.equal(engine.listActions()[0].label, 'Save V2');

    // V1 unmounts and calls stale cleanup
    unregisterV1();

    // V2 MUST NOT be deleted!
    assert.equal(engine.listActions().length, 1);
    assert.equal(engine.listActions()[0].label, 'Save V2');

    // V2 unmounts
    unregisterV2();
    assert.equal(engine.listActions().length, 0);
  });

  await t.test('C3.3: Action Unregistration Mid-Flight during Active Execution', async () => {
    const engine = new OpenworkControlEngine();
    let resolveExecution;
    const execPromise = new Promise((r) => {
      resolveExecution = r;
    });

    const unreg = engine.registerAction('ephemeral_action', {
      current: {
        id: 'ephemeral_action',
        label: 'Ephemeral Action',
        kind: 'command',
        execute: async () => {
          await execPromise;
          return { completed: true };
        },
      },
    });

    // Start execution
    const task = engine.command({ id: 'ephemeral_action' });
    await new Promise((r) => setTimeout(r, 10));

    // Unregister action mid-flight while executing
    unreg();
    assert.equal(engine.listActions().find((a) => a.id === 'ephemeral_action'), undefined);

    // Resolve execution
    resolveExecution();
    const result = await task;
    assert.equal(result.ok, true);
    assert.equal(result.result.completed, true);

    // Mutex is cleanly freed
    assert.equal(engine.busyActionId, null);
    assert.equal(engine.snapshot().status, 'ready');
  });

  // =========================================================================
  // CHALLENGE 4: Error Propagation (Nested Exceptions & Async Rejections)
  // =========================================================================
  await t.test('C4.1: Synchronous Throws Matrix (Error, TypeError, String, Null, Object)', async () => {
    const engine = new OpenworkControlEngine();

    const testCases = [
      { name: 'Error instance', throwVal: new Error('Standard error message'), expectedMatch: /Standard error message/ },
      { name: 'TypeError instance', throwVal: new TypeError('Type mismatch failure'), expectedMatch: /Type mismatch failure/ },
      { name: 'String throw', throwVal: 'Simple string exception', expectedMatch: /Simple string exception/ },
      { name: 'Null throw', throwVal: null, expectedMatch: /Unknown error/ },
      { name: 'Undefined throw', throwVal: undefined, expectedMatch: /Unknown error/ },
      { name: 'Plain Object throw', throwVal: { message: 'Object error' }, expectedMatch: /\[object Object\]/ },
    ];

    for (const tc of testCases) {
      const actionId = `throw_${tc.name.replace(/\s+/g, '_')}`;
      engine.registerAction(actionId, {
        current: {
          id: actionId,
          label: `Throw ${tc.name}`,
          kind: 'command',
          execute: () => {
            throw tc.throwVal;
          },
        },
      });

      const res = await engine.command({ id: actionId });
      assert.equal(res.ok, false, `Expected failure for ${tc.name}`);
      if (!res.ok) {
        assert.equal(res.code, 'failed');
        assert.match(res.error, tc.expectedMatch);
      }

      // CRITICAL: Busy mutex must be completely unlocked after throw
      assert.equal(engine.busyActionId, null, `Deadlock detected after ${tc.name}!`);
      assert.equal(engine.snapshot().status, 'ready');
    }
  });

  await t.test('C4.2: Asynchronous Promise Rejections (Immediate & Delayed)', async () => {
    const engine = new OpenworkControlEngine();

    engine.registerAction('async_immediate_reject', {
      current: {
        id: 'async_immediate_reject',
        label: 'Async Immediate Reject',
        kind: 'command',
        execute: async () => {
          return Promise.reject(new Error('Immediate async rejection'));
        },
      },
    });

    engine.registerAction('async_delayed_reject', {
      current: {
        id: 'async_delayed_reject',
        label: 'Async Delayed Reject',
        kind: 'command',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 20));
          throw new Error('Delayed async rejection');
        },
      },
    });

    const res1 = await engine.command({ id: 'async_immediate_reject' });
    assert.equal(res1.ok, false);
    if (!res1.ok) {
      assert.equal(res1.code, 'failed');
      assert.match(res1.error, /Immediate async rejection/);
    }
    assert.equal(engine.busyActionId, null);

    const res2 = await engine.command({ id: 'async_delayed_reject' });
    assert.equal(res2.ok, false);
    if (!res2.ok) {
      assert.equal(res2.code, 'failed');
      assert.match(res2.error, /Delayed async rejection/);
    }
    assert.equal(engine.busyActionId, null);
  });

  await t.test('C4.3: Nested Exception Chains with Cause', async () => {
    const engine = new OpenworkControlEngine();

    engine.registerAction('nested_cause_error', {
      current: {
        id: 'nested_cause_error',
        label: 'Nested Cause Error',
        kind: 'command',
        execute: () => {
          const root = new Error('Low-level socket ECONNRESET');
          throw new Error('High-level gateway error', { cause: root });
        },
      },
    });

    const res = await engine.command({ id: 'nested_cause_error' });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 'failed');
      assert.match(res.error, /High-level gateway error/);
    }
    assert.equal(engine.busyActionId, null);
  });

  await t.test('C4.4: Returned Action Error Payloads vs Exceptions Handling', async () => {
    const engine = new OpenworkControlEngine();

    engine.registerAction('payload_error_structured', {
      current: {
        id: 'payload_error_structured',
        label: 'Payload Error Structured',
        kind: 'command',
        execute: () => ({ ok: false, error: 'Database constraint failed: foreign key' }),
      },
    });

    engine.registerAction('payload_error_empty', {
      current: {
        id: 'payload_error_empty',
        label: 'Payload Error Empty',
        kind: 'command',
        execute: () => ({ ok: false }),
      },
    });

    const res1 = await engine.command({ id: 'payload_error_structured' });
    assert.equal(res1.ok, false);
    if (!res1.ok) {
      assert.equal(res1.error, 'Database constraint failed: foreign key');
      assert.equal(res1.code, 'failed');
    }

    const res2 = await engine.command({ id: 'payload_error_empty' });
    assert.equal(res2.ok, false);
    if (!res2.ok) {
      assert.equal(res2.error, 'Action returned an error.');
      assert.equal(res2.code, 'failed');
    }

    assert.equal(engine.busyActionId, null);
  });
});
