import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenworkControlEngine,
  UIControlBridgeSimulator,
} from './fixtures/control-engine-simulator.mjs';

test('Tier 4: OpenWork Control Real-World Application Workloads & Bridge E2E', async (t) => {

  await t.test('T4.1: Autonomous Multi-Agent Query & Command Sequence Workload', async () => {
    const engine = new OpenworkControlEngine({ route: '/chat/financial-analyst' });

    // Mock application state
    const appState = {
      selectedModel: 'DeepSeek-V4',
      sheets: ['Executive Summary'],
      cells: { 'Executive Summary': { A1: 'Q1 Revenue', B1: 500000 } },
    };

    // Register actions
    engine.registerAction('sheet.query.active_cells', {
      current: {
        id: 'sheet.query.active_cells',
        label: 'Get Active Cells',
        kind: 'query',
        sideEffect: 'none',
        execute: async (args) => {
          const sheet = args?.sheet || 'Executive Summary';
          return appState.cells[sheet] || {};
        },
      },
    });

    engine.registerAction('sheet.command.add_calculated_row', {
      current: {
        id: 'sheet.command.add_calculated_row',
        label: 'Add Calculated Row',
        kind: 'command',
        sideEffect: 'mutation',
        args: [
          { name: 'sheet', type: 'string', required: true },
          { name: 'rowKey', type: 'string', required: true },
          { name: 'formula', type: 'string', required: true },
        ],
        execute: async (args, { setNarration }) => {
          setNarration(`Inserting calculated formula ${args.formula} for ${args.rowKey}…`);
          appState.cells[args.sheet] = appState.cells[args.sheet] || {};
          appState.cells[args.sheet][args.rowKey] = args.formula;
          return { updatedCells: appState.cells[args.sheet] };
        },
      },
    });

    // 1. Agent inspects snapshot
    const snapshot = engine.snapshot();
    assert.equal(snapshot.version, 2);
    assert.equal(snapshot.actions.length, 2);

    // 2. Agent queries current cell data
    const queryRes = await engine.query({
      id: 'sheet.query.active_cells',
      args: { sheet: 'Executive Summary' },
    });
    assert.equal(queryRes.ok, true);
    if (queryRes.ok) {
      assert.equal(queryRes.result.A1, 'Q1 Revenue');
    }

    // 3. Agent executes command to insert growth formula
    const cmdRes = await engine.command({
      id: 'sheet.command.add_calculated_row',
      args: {
        sheet: 'Executive Summary',
        rowKey: 'B2',
        formula: '=SUM(B1*1.15)',
      },
      actor: 'DeepSeek-V4-Analyst',
    });

    assert.equal(cmdRes.ok, true);
    if (cmdRes.ok) {
      assert.deepEqual(cmdRes.effects, { data: 'write', ui: 'none', external: false });
      assert.equal(cmdRes.result.updatedCells.B2, '=SUM(B1*1.15)');
    }
    assert.equal(appState.cells['Executive Summary']['B2'], '=SUM(B1*1.15)');
  });

  await t.test('T4.2: Stale Revision Conflict & Automatic Retry Recovery Flow', async () => {
    const engine = new OpenworkControlEngine();
    let stateValue = 100;

    engine.registerAction('data.mutate', {
      current: {
        id: 'data.mutate',
        label: 'Mutate Data',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async (args) => {
          stateValue += args?.amount || 10;
          return { stateValue };
        },
      },
    });

    // 1. Agent inspects context and notes current revision
    const agentObservedSnapshot = engine.snapshot();
    const observedRevision = engine.contextRevision;

    // 2. An external event occurs (e.g. another user/agent adds an action or mutates)
    await engine.command({
      id: 'data.mutate',
      args: { amount: 50 },
      actor: 'BackgroundWorker',
    });
    assert.equal(stateValue, 150);
    assert.ok(engine.contextRevision > observedRevision);

    // 3. Original agent attempts command with stale expectedRevision -> Rejected
    const conflictRes = await engine.command({
      id: 'data.mutate',
      args: { amount: 20 },
      expectedRevision: observedRevision, // Stale!
      actor: 'Agent-Analyst',
    });

    assert.equal(conflictRes.ok, false);
    if (!conflictRes.ok) {
      assert.equal(conflictRes.code, 'conflict');
    }
    // State remains 150 (not mutated by failed command)
    assert.equal(stateValue, 150);

    // 4. Agent recovery protocol: Re-fetch current snapshot, inspect state, and retry with new revision
    const refreshedSnapshot = engine.snapshot();
    const freshRevision = engine.contextRevision;

    const retryRes = await engine.command({
      id: 'data.mutate',
      args: { amount: 20 },
      expectedRevision: freshRevision,
      actor: 'Agent-Analyst',
    });

    assert.equal(retryRes.ok, true);
    assert.equal(stateValue, 170);
  });

  await t.test('T4.3: UI Control Bridge HTTP Protocol & Endpoint Simulator', async () => {
    const engine = new OpenworkControlEngine({ route: '/models/evaluation' });
    const bridge = new UIControlBridgeSimulator(engine);

    engine.registerAction('model.eval.run', {
      current: {
        id: 'model.eval.run',
        label: 'Run Evaluation Suite',
        kind: 'command',
        sideEffect: 'mutation',
        args: [{ name: 'dataset', type: 'string', required: true }],
        execute: async (args) => ({ evaluated: true, dataset: args.dataset }),
      },
    });

    // 1. GET /health
    const health = await bridge.handleRequest('GET', '/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.app, 'DB-GPT');
    assert.equal(health.json.version, 2);

    // 2. GET /snapshot
    const snap = await bridge.handleRequest('GET', '/snapshot');
    assert.equal(snap.status, 200);
    assert.equal(snap.json.version, 2);
    assert.equal(snap.json.actions.length, 1);

    // 3. GET /actions
    const acts = await bridge.handleRequest('GET', '/actions');
    assert.equal(acts.status, 200);
    assert.equal(acts.json[0].id, 'model.eval.run');

    // 4. GET /context
    const ctx = await bridge.handleRequest('GET', '/context');
    assert.equal(ctx.status, 200);
    assert.equal(ctx.json.schemaVersion, 1);

    // 5. POST /command (missing id -> 400)
    const badCmd = await bridge.handleRequest('POST', '/command', {});
    assert.equal(badCmd.status, 400);

    // 6. POST /command (valid execution)
    const execCmd = await bridge.handleRequest('POST', '/command', {
      id: 'model.eval.run',
      args: { dataset: 'finance_benchmark_2026' },
      actor: 'Bridge-Client',
    });
    assert.equal(execCmd.status, 200);
    assert.equal(execCmd.json.ok, true);
    assert.equal(execCmd.json.result.dataset, 'finance_benchmark_2026');

    // 7. Unknown route -> 404
    const notFound = await bridge.handleRequest('GET', '/nonexistent');
    assert.equal(notFound.status, 404);
  });

  await t.test('T4.4: Multi-Agent Parallel Inspection + Serialized Mutex Invariant', async () => {
    const engine = new OpenworkControlEngine();
    let resolveCommand;
    const holdPromise = new Promise((resolve) => {
      resolveCommand = resolve;
    });

    engine.registerAction('deck.export.pptx', {
      current: {
        id: 'deck.export.pptx',
        label: 'Export Slide Deck',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => {
          await holdPromise;
          return { file: 'presentation.pptx' };
        },
      },
    });

    // 3 agents inspect snapshot simultaneously
    const snap1 = engine.snapshot();
    const snap2 = engine.snapshot();
    const snap3 = engine.snapshot();
    assert.equal(snap1.status, 'ready');
    assert.equal(snap2.status, 'ready');
    assert.equal(snap3.status, 'ready');

    // Agent 1 starts export
    const agent1Promise = engine.command({
      id: 'deck.export.pptx',
      actor: 'Agent-SlideWriter',
    });

    // Agent 2 attempts export concurrently -> Conflict
    const agent2Res = await engine.command({
      id: 'deck.export.pptx',
      actor: 'Agent-Supervisor',
    });
    assert.equal(agent2Res.ok, false);
    if (!agent2Res.ok) {
      assert.equal(agent2Res.code, 'conflict');
      assert.match(agent2Res.error, /Already acting: deck\.export\.pptx for Agent-SlideWriter/);
    }

    // Complete Agent 1 task
    resolveCommand();
    const agent1Res = await agent1Promise;
    assert.equal(agent1Res.ok, true);

    // Agent 2 retries now that mutex is released
    const agent2Retry = await engine.command({
      id: 'deck.export.pptx',
      actor: 'Agent-Supervisor',
    });
    assert.equal(agent2Retry.ok, true);
  });

  await t.test('T4.5: Full MCP Tool Mapping Verification', async () => {
    const engine = new OpenworkControlEngine({ route: '/chat/mcp-demo' });

    let messageCount = 0;
    engine.registerAction('chat.send_message', {
      current: {
        id: 'chat.send_message',
        label: 'Send Chat Message',
        kind: 'command',
        sideEffect: 'mutation',
        args: [{ name: 'content', type: 'string', required: true }],
        execute: async (args) => {
          messageCount++;
          return { sent: true, content: args.content, count: messageCount };
        },
      },
    });

    engine.registerAction('chat.get_history', {
      current: {
        id: 'chat.get_history',
        label: 'Get Chat History',
        kind: 'query',
        sideEffect: 'none',
        execute: async () => ({ messageCount }),
      },
    });

    // Simulated MCP tool layer
    const mcpTools = {
      ui_context: async () => engine.context(),
      ui_snapshot: async () => engine.snapshot(),
      ui_list_actions: async () => engine.listActions(),
      ui_execute_action: async (params) => engine.execute(params.actionId, params.args),
      ui_query: async (params) => engine.query({ id: params.id, args: params.args }),
      ui_command: async (params) => engine.command({
        id: params.id,
        args: params.args,
        expectedRevision: params.expectedRevision,
        actor: params.actor,
      }),
    };

    // Exercise all 6 MCP tools
    const ctxResult = await mcpTools.ui_context();
    assert.equal(ctxResult.schemaVersion, 1);

    const snapResult = await mcpTools.ui_snapshot();
    assert.equal(snapResult.version, 2);

    const actionsResult = await mcpTools.ui_list_actions();
    assert.equal(actionsResult.length, 2);

    const queryResult = await mcpTools.ui_query({ id: 'chat.get_history' });
    assert.equal(queryResult.ok, true);
    if (queryResult.ok) {
      assert.equal(queryResult.result.messageCount, 0);
    }

    const commandResult = await mcpTools.ui_command({
      id: 'chat.send_message',
      args: { content: 'Hello DeepSeek & DB-GPT!' },
      actor: 'MCP-Agent',
    });
    assert.equal(commandResult.ok, true);
    if (commandResult.ok) {
      assert.equal(commandResult.result.count, 1);
    }

    const executeResult = await mcpTools.ui_execute_action({
      actionId: 'chat.send_message',
      args: { content: 'Second message via direct execute' },
    });
    assert.equal(executeResult.ok, true);
    assert.equal(messageCount, 2);
  });
});
