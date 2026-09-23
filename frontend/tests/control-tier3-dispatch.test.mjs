import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenworkControlEngine,
} from './fixtures/control-engine-simulator.mjs';

test('Tier 3: OpenWork Control Cross-Feature Dispatch & Dynamic Lifecycle', async (t) => {

  await t.test('T3.1: Query vs Command Execution Semantics & Revision Invariants', async () => {
    const engine = new OpenworkControlEngine();
    let queryExecutions = 0;
    let commandExecutions = 0;

    const queryRef = {
      current: {
        id: 'workspace.query.stats',
        label: 'Get Workspace Stats',
        kind: 'query',
        sideEffect: 'none',
        execute: async () => {
          queryExecutions++;
          return { activeCharts: 3, memoryMB: 128 };
        },
      },
    };

    const commandRef = {
      current: {
        id: 'workspace.command.clear',
        label: 'Clear Workspace',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => {
          commandExecutions++;
          return { cleared: true };
        },
      },
    };

    engine.registerAction('workspace.query.stats', queryRef);
    engine.registerAction('workspace.command.clear', commandRef);
    const revAfterRegister = engine.contextRevision;

    // 1. Query execution does NOT modify revision and does NOT lock busyActionId
    const queryResult = await engine.query({ id: 'workspace.query.stats' });
    assert.equal(queryResult.ok, true);
    assert.equal(queryExecutions, 1);
    assert.equal(engine.contextRevision, revAfterRegister);
    assert.equal(engine.busyActionId, null);
    if (queryResult.ok) {
      assert.deepEqual(queryResult.effects, { data: 'read', ui: 'none', external: false });
    }

    // 2. Command execution DOES increment revision and locks busyActionId during run
    const commandResult = await engine.command({ id: 'workspace.command.clear' });
    assert.equal(commandResult.ok, true);
    assert.equal(commandExecutions, 1);
    assert.ok(engine.contextRevision > revAfterRegister);
    assert.equal(engine.busyActionId, null);
    if (commandResult.ok) {
      assert.deepEqual(commandResult.effects, { data: 'write', ui: 'none', external: false });
    }
  });

  await t.test('T3.2: Dynamic Single Action Registration, Order Preservation & Token-Based Cleanup', () => {
    const engine = new OpenworkControlEngine();
    assert.equal(engine.listActions().length, 0);

    const actionA = {
      current: { id: 'action.a', label: 'Action A', kind: 'command', execute: async () => 'a' },
    };
    const actionB = {
      current: { id: 'action.b', label: 'Action B', kind: 'command', execute: async () => 'b' },
    };
    const actionC = {
      current: { id: 'action.c', label: 'Action C', kind: 'command', execute: async () => 'c' },
    };

    const unregisterA = engine.registerAction('action.a', actionA);
    const unregisterB = engine.registerAction('action.b', actionB);
    const unregisterC = engine.registerAction('action.c', actionC);

    let actions = engine.listActions();
    assert.equal(actions.length, 3);
    assert.deepEqual(actions.map((a) => a.id), ['action.a', 'action.b', 'action.c']);

    // Re-registering action.a should preserve its original order (order = 1)
    const actionANew = {
      current: { id: 'action.a', label: 'Action A Updated', kind: 'command', execute: async () => 'a_updated' },
    };
    const unregisterANew = engine.registerAction('action.a', actionANew);
    actions = engine.listActions();
    assert.equal(actions.length, 3);
    assert.deepEqual(actions.map((a) => a.id), ['action.a', 'action.b', 'action.c']);
    assert.equal(actions[0].label, 'Action A Updated');

    // Calling old unregister token should NOT delete action.a because token changed
    unregisterA();
    assert.equal(engine.listActions().length, 3);

    // Calling new unregister token DOES delete action.a
    unregisterANew();
    actions = engine.listActions();
    assert.equal(actions.length, 2);
    assert.deepEqual(actions.map((a) => a.id), ['action.b', 'action.c']);

    // Clean up remaining
    unregisterB();
    unregisterC();
    assert.equal(engine.listActions().length, 0);
  });

  await t.test('T3.3: Dynamic Multi-Action Batch Registration (useControlActions Simulation)', () => {
    const engine = new OpenworkControlEngine();

    // Helper simulating React useControlActions hook behavior
    class DynamicActionListManager {
      constructor(engineInstance) {
        this.engine = engineInstance;
        this.refsById = new Map();
        this.cleanups = new Map();
      }

      updateActions(actionsList) {
        // 1. Update/Add refs
        for (const act of actionsList) {
          const existing = this.refsById.get(act.id);
          if (existing) {
            existing.current = act;
          } else {
            const ref = { current: act };
            this.refsById.set(act.id, ref);
            const cleanup = this.engine.registerAction(act.id, ref);
            this.cleanups.set(act.id, cleanup);
          }
        }

        // 2. Remove stale ids
        const liveIds = new Set(actionsList.map((a) => a.id));
        for (const [id, cleanup] of this.cleanups.entries()) {
          if (!liveIds.has(id)) {
            cleanup();
            this.cleanups.delete(id);
            this.refsById.delete(id);
          }
        }
      }

      teardown() {
        for (const cleanup of this.cleanups.values()) {
          cleanup();
        }
        this.cleanups.clear();
        this.refsById.clear();
      }
    }

    const manager = new DynamicActionListManager(engine);

    // Initial batch of 3 actions
    manager.updateActions([
      { id: 'tab.open.1', label: 'Tab 1', kind: 'command', execute: async () => 1 },
      { id: 'tab.open.2', label: 'Tab 2', kind: 'command', execute: async () => 2 },
      { id: 'tab.open.3', label: 'Tab 3', kind: 'command', execute: async () => 3 },
    ]);
    assert.equal(engine.listActions().length, 3);

    // Update batch: remove tab 2, add tab 4, update label of tab 1
    manager.updateActions([
      { id: 'tab.open.1', label: 'Tab 1 Renamed', kind: 'command', execute: async () => 10 },
      { id: 'tab.open.3', label: 'Tab 3', kind: 'command', execute: async () => 3 },
      { id: 'tab.open.4', label: 'Tab 4 New', kind: 'command', execute: async () => 4 },
    ]);

    const activeActions = engine.listActions();
    assert.equal(activeActions.length, 3);
    assert.deepEqual(activeActions.map((a) => a.id), ['tab.open.1', 'tab.open.3', 'tab.open.4']);
    assert.equal(activeActions.find((a) => a.id === 'tab.open.1')?.label, 'Tab 1 Renamed');

    // Teardown
    manager.teardown();
    assert.equal(engine.listActions().length, 0);
  });

  await t.test('T3.4: Real-Time Listener Subscription & Snapshot Broadcasts', () => {
    const engine = new OpenworkControlEngine();
    const snapshotsReceived = [];

    // Subscribe listener
    const unsubscribe = engine.subscribe((snap) => {
      snapshotsReceived.push({
        status: snap.status,
        actionsCount: snap.actions.length,
        narration: snap.narration,
        route: snap.route,
      });
    });

    // 1. First snapshot received immediately upon subscription
    assert.equal(snapshotsReceived.length, 1);
    assert.equal(snapshotsReceived[0].actionsCount, 0);

    // 2. Action registration triggers snapshot emission
    const actionRef = {
      current: { id: 'nav.home', label: 'Go Home', kind: 'command', execute: async () => '/' },
    };
    const unreg = engine.registerAction('nav.home', actionRef);
    assert.equal(snapshotsReceived.length, 2);
    assert.equal(snapshotsReceived[1].actionsCount, 1);

    // 3. Route change triggers snapshot emission
    engine.setRoute('/chat/new-session');
    assert.equal(snapshotsReceived.length, 3);
    assert.equal(snapshotsReceived[2].route, '/chat/new-session');

    // 4. Unsubscribe teardown
    unsubscribe();
    unreg();
    // After unsubscribe, no new snapshots are pushed
    assert.equal(snapshotsReceived.length, 3);
  });

  await t.test('T3.5: Context Publication & Rich Snapshot Generation', () => {
    const engine = new OpenworkControlEngine({ route: '/analytics/dashboard' });

    // Register 2 actions
    engine.registerAction('chart.filter', {
      current: {
        id: 'chart.filter',
        label: 'Filter Chart Data',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => 'filtered',
      },
    });

    // Context before publication provides standard baseline with available affordances
    const initialContext = engine.context();
    assert.equal(initialContext.schemaVersion, 1);
    assert.equal(initialContext.screen.route, '/analytics/dashboard');
    assert.equal(initialContext.availableAffordances.length, 1);
    assert.equal(initialContext.availableAffordances[0].id, 'chart.filter');

    // Publish custom context
    const customSnapshot = {
      schemaVersion: 1,
      revision: 0,
      capturedAt: new Date().toISOString(),
      screen: { kind: 'conversation', route: '/analytics/dashboard', sessionId: 'ses_dash_1' },
      conversations: {
        tabs: [{ workspaceId: 'ws_analytics', sessionId: 'ses_dash_1', title: 'Revenue Analytics' }],
        layout: { kind: 'single', sessionId: 'ses_dash_1' },
      },
      chrome: { sidebarOpen: false, applicationMenuVisible: false, rightSidebarExpanded: true },
      execution: { queries: 'parallel', commands: 'serialized', busyCommandId: null, busyActor: null },
      sidePanel: {
        open: true,
        ownerSessionId: 'ses_dash_1',
        kind: 'panel',
        tabs: [{ id: 'tab1', kind: 'artifact', label: 'Bar Chart', status: 'ready' }],
        activeTabId: 'tab1',
      },
      resources: [],
      availableAffordances: [],
      contributions: [],
    };

    engine.publishContext(customSnapshot);

    const publishedContext = engine.context();
    assert.equal(publishedContext.screen.kind, 'conversation');
    assert.equal(publishedContext.conversations.tabs[0].title, 'Revenue Analytics');
    assert.equal(publishedContext.sidePanel.open, true);
    // Affordances should be automatically populated from registered actions
    assert.equal(publishedContext.availableAffordances.length, 1);
    assert.equal(publishedContext.availableAffordances[0].id, 'chart.filter');
  });

  await t.test('T3.6: Action Execution Narration Progression & Helper Streaming', async () => {
    const engine = new OpenworkControlEngine();
    const narrationHistory = [];

    engine.subscribe((snap) => {
      narrationHistory.push(snap.narration);
    });

    const progressActionRef = {
      current: {
        id: 'generate.excel.model',
        label: 'Generate Financial Excel Model',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async (_args, { setNarration }) => {
          setNarration('Building sheet 1: Income Statement…');
          await new Promise((r) => setTimeout(r, 20));
          setNarration('Building sheet 2: Balance Sheet formulas…');
          await new Promise((r) => setTimeout(r, 20));
          return { generated: true };
        },
      },
    };

    engine.registerAction('generate.excel.model', progressActionRef);

    const result = await engine.execute('generate.excel.model');
    assert.equal(result.ok, true);

    // Verify narration progression sequence
    assert.ok(narrationHistory.includes('Moving to Generate Financial Excel Model…'));
    assert.ok(narrationHistory.includes('Building sheet 1: Income Statement…'));
    assert.ok(narrationHistory.includes('Building sheet 2: Balance Sheet formulas…'));
    assert.ok(narrationHistory.includes('Done: Generate Financial Excel Model'));
  });
});
