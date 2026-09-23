import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenworkControlEngine,
  SPOTLIGHT_TIMING_MS,
} from './fixtures/control-engine-simulator.mjs';

test('Tier 2: OpenWork Control Boundary, Concurrency & Error Resilience', async (t) => {

  await t.test('T2.1: Optimistic Revision Mismatch Detection (expectedRevision)', async () => {
    const engine = new OpenworkControlEngine();
    let counter = 0;

    const actionRef = {
      current: {
        id: 'counter.increment',
        label: 'Increment Counter',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => ++counter,
      },
    };

    engine.registerAction('counter.increment', actionRef);
    const initialRevision = engine.contextRevision;
    assert.equal(initialRevision, 1);

    // Command with matching expectedRevision succeeds
    const successRes = await engine.command({
      id: 'counter.increment',
      expectedRevision: initialRevision,
    });
    assert.equal(successRes.ok, true);
    assert.equal(counter, 1);
    const newRevision = engine.contextRevision;
    assert.ok(newRevision > initialRevision);

    // Command with stale expectedRevision fails with code 'conflict'
    const staleRes = await engine.command({
      id: 'counter.increment',
      expectedRevision: initialRevision, // Stale!
    });
    assert.equal(staleRes.ok, false);
    if (!staleRes.ok) {
      assert.equal(staleRes.code, 'conflict');
      assert.match(staleRes.error, /OpenWork context changed from revision/);
      assert.equal(staleRes.revision, newRevision);
    }
    // Counter unchanged on conflict
    assert.equal(counter, 1);
  });

  await t.test('T2.2: Concurrent Command Serialization & Mutex Conflict Rejection', async () => {
    const engine = new OpenworkControlEngine();
    let resolveCommandA;
    const commandAPromise = new Promise((resolve) => {
      resolveCommandA = resolve;
    });

    const actionARef = {
      current: {
        id: 'long.running.task',
        label: 'Long Running Task',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => {
          await commandAPromise;
          return { done: true };
        },
      },
    };

    const actionBRef = {
      current: {
        id: 'secondary.task',
        label: 'Secondary Task',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => ({ secondary: true }),
      },
    };

    engine.registerAction('long.running.task', actionARef);
    engine.registerAction('secondary.task', actionBRef);

    // Launch Command A asynchronously
    const taskAPromise = engine.command({
      id: 'long.running.task',
      actor: 'Agent-Alpha',
    });

    // While Command A is running, verify engine status is acting
    assert.equal(engine.busyActionId, 'long.running.task');
    assert.equal(engine.busyActor, 'Agent-Alpha');
    assert.equal(engine.snapshot().status, 'acting');

    // Attempt concurrent Command B -> must be rejected with conflict
    const concurrentRes = await engine.command({
      id: 'secondary.task',
      actor: 'Agent-Beta',
    });

    assert.equal(concurrentRes.ok, false);
    if (!concurrentRes.ok) {
      assert.equal(concurrentRes.code, 'conflict');
      assert.match(concurrentRes.error, /Already acting: long\.running\.task for Agent-Alpha/);
    }

    // Resolve Command A
    resolveCommandA();
    const taskARes = await taskAPromise;
    assert.equal(taskARes.ok, true);

    // Now engine is free
    assert.equal(engine.busyActionId, null);
    assert.equal(engine.busyActor, null);
    assert.equal(engine.snapshot().status, 'ready');

    // Subsequent command now succeeds
    const followupRes = await engine.command({ id: 'secondary.task' });
    assert.equal(followupRes.ok, true);
  });

  await t.test('T2.3: Parallel Queries Non-Blocking Invariant', async () => {
    const engine = new OpenworkControlEngine();
    let queryCount = 0;

    const queryActionRef = {
      current: {
        id: 'system.query.status',
        label: 'Query System Status',
        kind: 'query',
        sideEffect: 'none',
        execute: async () => {
          queryCount++;
          return { activeNodes: 4 };
        },
      },
    };

    const longCommandRef = {
      current: {
        id: 'system.command.reindex',
        label: 'Reindex Data',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 50));
          return { reindexed: true };
        },
      },
    };

    engine.registerAction('system.query.status', queryActionRef);
    engine.registerAction('system.command.reindex', longCommandRef);

    // Start long command
    const cmdPromise = engine.command({ id: 'system.command.reindex' });

    // Execute multiple parallel queries while command is busy
    const q1Promise = engine.query({ id: 'system.query.status' });
    const q2Promise = engine.query({ id: 'system.query.status' });
    const q3Promise = engine.query({ id: 'system.query.status' });

    const [q1, q2, q3] = await Promise.all([q1Promise, q2Promise, q3Promise]);
    assert.equal(q1.ok, true);
    assert.equal(q2.ok, true);
    assert.equal(q3.ok, true);
    assert.equal(queryCount, 3);

    await cmdPromise;
  });

  await t.test('T2.4: Missing or Invalid Arguments Validation', async () => {
    const engine = new OpenworkControlEngine();

    const paramActionRef = {
      current: {
        id: 'export.report',
        label: 'Export PDF Report',
        kind: 'command',
        sideEffect: 'external',
        args: [
          { name: 'format', type: 'string', required: true },
          { name: 'pageOrientation', type: 'string', required: true },
          { name: 'includeCharts', type: 'boolean', required: false },
        ],
        execute: async (args) => ({ exported: true, args }),
      },
    };

    engine.registerAction('export.report', paramActionRef);

    // Omit required argument 'pageOrientation'
    const invalidRes = await engine.command({
      id: 'export.report',
      args: { format: 'pdf' }, // Missing pageOrientation
    });

    assert.equal(invalidRes.ok, false);
    if (!invalidRes.ok) {
      assert.equal(invalidRes.code, 'invalid-args');
      assert.match(invalidRes.error, /Missing required argument: pageOrientation/);
    }

    // Supply all required arguments
    const validRes = await engine.command({
      id: 'export.report',
      args: { format: 'pdf', pageOrientation: 'landscape' },
    });
    assert.equal(validRes.ok, true);
  });

  await t.test('T2.5: Disabled & Unavailable Actions Handling', async () => {
    const engine = new OpenworkControlEngine();

    const disabledActionRef = {
      current: {
        id: 'admin.purge_cache',
        label: 'Purge Cache',
        kind: 'command',
        sideEffect: 'mutation',
        disabled: true,
        execute: async () => ({ purged: true }),
      },
    };

    engine.registerAction('admin.purge_cache', disabledActionRef);

    // Metadata should flag disabled
    const meta = engine.listActions().find((a) => a.id === 'admin.purge_cache');
    assert.equal(meta?.disabled, true);

    // Command should fail with error
    const cmdRes = await engine.command({ id: 'admin.purge_cache' });
    assert.equal(cmdRes.ok, false);
    if (!cmdRes.ok) {
      assert.match(cmdRes.error, /Action is disabled/);
    }

    // Command on unknown id should fail with unavailable
    const unknownCmdRes = await engine.command({ id: 'unknown.command.id' });
    assert.equal(unknownCmdRes.ok, false);
    if (!unknownCmdRes.ok) {
      assert.equal(unknownCmdRes.code, 'unavailable');
      assert.match(unknownCmdRes.error, /Unknown command/);
    }

    // Query on unknown id should fail with unavailable
    const unknownRes = await engine.query({ id: 'unknown.action.id' });
    assert.equal(unknownRes.ok, false);
    if (!unknownRes.ok) {
      assert.equal(unknownRes.code, 'unavailable');
      assert.match(unknownRes.error, /Unknown query/);
    }
  });

  await t.test('T2.6: Missing TargetRef Fallback & Choreography Timing', async () => {
    const engine = new OpenworkControlEngine();

    const actionWithoutTargetRef = {
      current: {
        id: 'no.target.action',
        label: 'Action without DOM target',
        kind: 'command',
        targetRef: null,
        execute: async () => ({ status: 'ok' }),
      },
    };

    engine.registerAction('no.target.action', actionWithoutTargetRef);

    assert.equal(SPOTLIGHT_TIMING_MS.missingTarget, 80);
    assert.equal(SPOTLIGHT_TIMING_MS.scrollIntoView, 180);
    assert.equal(SPOTLIGHT_TIMING_MS.target, 260);
    assert.equal(SPOTLIGHT_TIMING_MS.press, 130);
    assert.equal(SPOTLIGHT_TIMING_MS.release, 80);
    assert.equal(SPOTLIGHT_TIMING_MS.done, 280);

    const res = await engine.execute('no.target.action');
    assert.equal(res.ok, true);

    // Check recorded choreography in simulator
    const history = engine.spotlightHistory;
    const missingTargetEntry = history.find((h) => h.phase === 'missingTarget');
    assert.ok(missingTargetEntry);
    assert.equal(missingTargetEntry.duration, 80);
  });

  await t.test('T2.7: Confirmation Prompt Cancellation Handling', async () => {
    // Engine with confirmHandler that denies confirmation
    const engineDeny = new OpenworkControlEngine({
      confirmHandler: () => false,
    });

    const destructiveActionRef = {
      current: {
        id: 'database.drop_table',
        label: 'Drop Table',
        kind: 'command',
        requiresConfirmation: true,
        sideEffect: 'mutation',
        execute: async () => ({ dropped: true }),
      },
    };

    engineDeny.registerAction('database.drop_table', destructiveActionRef);

    const deniedRes = await engineDeny.execute('database.drop_table');
    assert.equal(deniedRes.ok, false);
    if (!deniedRes.ok) {
      assert.equal(deniedRes.error, 'User cancelled action.');
    }

    // Engine with confirmHandler that approves confirmation
    const engineAllow = new OpenworkControlEngine({
      confirmHandler: () => true,
    });
    engineAllow.registerAction('database.drop_table', destructiveActionRef);

    const allowedRes = await engineAllow.execute('database.drop_table');
    assert.equal(allowedRes.ok, true);
  });

  await t.test('T2.8: Unhandled Exception Recovery & Mutex Lock Release Invariant', async () => {
    const engine = new OpenworkControlEngine();

    const crashActionRef = {
      current: {
        id: 'unstable.action',
        label: 'Unstable Action',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => {
          throw new Error('Fatal network timeout during RPC');
        },
      },
    };

    engine.registerAction('unstable.action', crashActionRef);

    const crashRes = await engine.command({ id: 'unstable.action' });
    assert.equal(crashRes.ok, false);
    if (!crashRes.ok) {
      assert.equal(crashRes.code, 'failed');
      assert.match(crashRes.error, /Fatal network timeout during RPC/);
    }

    // Crucial check: busy lock MUST be released even after error/exception
    assert.equal(engine.busyActionId, null);
    assert.equal(engine.busyActor, null);
    assert.equal(engine.snapshot().status, 'ready');
  });
});
