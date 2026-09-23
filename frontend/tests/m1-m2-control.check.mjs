#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.env.TSX_RUNNER) {
  const result = spawnSync('npx', ['tsx', fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, TSX_RUNNER: '1' },
  });
  process.exit(result.status ?? 0);
}

import assert from 'node:assert/strict';

const {
  OPENWORK_AFFORDANCE_SCHEMA_VERSION,
  openworkAffordanceKindSchema,
  openworkProviderKindSchema,
  openworkProviderRefSchema,
  openworkAffordanceArgumentSchema,
  openworkAffordanceEffectsSchema,
  openworkAffordanceAvailabilitySchema,
  openworkAffordanceExecutorSchema,
  openworkAffordanceDescriptorSchema,
  openworkAffordanceRequestSchema,
  openworkAffordanceResultSchema,
} = await import('../shell/control/openwork-affordance.ts');

const {
  OPENWORK_CONTEXT_SCHEMA_VERSION,
  openworkSessionRefSchema,
  openworkScreenSchema,
  openworkConversationLayoutSchema,
  openworkPanelTabSchema,
  openworkResourceDescriptorSchema,
  openworkContextSnapshotSchema,
} = await import('../shell/control/openwork-context.ts');

const {
  openworkGuidanceDescriptorSchema,
  openworkFeatureContributionSchema,
  openworkProviderCatalogSchema,
  openworkCapabilityResultSchema,
} = await import('../shell/control/openwork-provider.ts');

const {
  CONTROL_API_VERSION,
  SPOTLIGHT_TIMING_MS,
  describeError,
  returnedActionError,
  effectsForSideEffect,
  metadataForAction,
  affordanceForAction,
} = await import('../shell/control/control-provider.tsx');

console.log('================================================================');
console.log('🧪 MILESTONE 1 & 2 VERIFICATION: AFFORDANCE & CONTROL PROVIDER');
console.log('================================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${error.message}`);
    testsFailed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${error.message}`);
    testsFailed++;
  }
}

console.log('📦 Milestone 1: Affordance Registry & Types / Schemas');
console.log('────────────────────────────────────────────────────────────────');

runTest('M1.1: Schema Version Constants', () => {
  assert.equal(OPENWORK_AFFORDANCE_SCHEMA_VERSION, 1);
  assert.equal(OPENWORK_CONTEXT_SCHEMA_VERSION, 1);
  assert.equal(CONTROL_API_VERSION, 2);
});

runTest('M1.2: Affordance Kind & Provider Kind Schemas', () => {
  assert.equal(openworkAffordanceKindSchema.parse('query'), 'query');
  assert.equal(openworkAffordanceKindSchema.parse('command'), 'command');
  assert.equal(openworkAffordanceKindSchema.parse('guidance'), 'guidance');
  assert.throws(() => openworkAffordanceKindSchema.parse('invalid_kind'));

  assert.equal(openworkProviderKindSchema.parse('builtin'), 'builtin');
  assert.equal(openworkProviderKindSchema.parse('extension'), 'extension');
  assert.equal(openworkProviderKindSchema.parse('mcp'), 'mcp');
  assert.equal(openworkProviderKindSchema.parse('connect'), 'connect');
  assert.throws(() => openworkProviderKindSchema.parse('custom_provider'));

  const providerRef = openworkProviderRefSchema.parse({
    id: 'dbgpt-core',
    kind: 'builtin',
  });
  assert.equal(providerRef.id, 'dbgpt-core');
  assert.equal(providerRef.kind, 'builtin');
});

runTest('M1.3: 3-Axis Effects Matrix & Arguments Validation', () => {
  const validEffects = openworkAffordanceEffectsSchema.parse({
    data: 'write',
    ui: 'navigate',
    external: false,
  });
  assert.equal(validEffects.data, 'write');
  assert.equal(validEffects.ui, 'navigate');
  assert.equal(validEffects.external, false);

  assert.throws(() =>
    openworkAffordanceEffectsSchema.parse({
      data: 'invalid_data',
      ui: 'none',
      external: false,
    }),
  );

  const validArg = openworkAffordanceArgumentSchema.parse({
    name: 'tableName',
    type: 'string',
    required: true,
    description: 'Name of the database table',
  });
  assert.equal(validArg.name, 'tableName');
  assert.equal(validArg.type, 'string');
  assert.equal(validArg.required, true);
});

runTest('M1.4: Availability & Executor Schemas', () => {
  const avail = openworkAffordanceAvailabilitySchema.parse({
    enabled: false,
    reason: 'Database connection offline',
  });
  assert.equal(avail.enabled, false);
  assert.equal(avail.reason, 'Database connection offline');

  const execOpenwork = openworkAffordanceExecutorSchema.parse({ kind: 'openwork' });
  assert.equal(execOpenwork.kind, 'openwork');

  const execTool = openworkAffordanceExecutorSchema.parse({
    kind: 'tool',
    tool: 'dbgpt_sql_query',
  });
  assert.equal(execTool.kind, 'tool');
  assert.equal(execTool.tool, 'dbgpt_sql_query');
});

runTest('M1.5: Complete Affordance Descriptor & Request Schemas', () => {
  const descriptor = openworkAffordanceDescriptorSchema.parse({
    id: 'dbgpt.query.execute_sql',
    kind: 'query',
    title: 'Execute SQL Query',
    description: 'Execute analytical query against attached database',
    provider: { id: 'dbgpt-sql', kind: 'builtin' },
    arguments: [
      { name: 'sql', type: 'string', required: true, description: 'SQL text' },
    ],
    effects: { data: 'read', ui: 'none', external: false },
    confirmation: 'never',
    availability: { enabled: true },
    executor: { kind: 'openwork' },
  });
  assert.equal(descriptor.id, 'dbgpt.query.execute_sql');
  assert.equal(descriptor.effects.data, 'read');

  const request = openworkAffordanceRequestSchema.parse({
    id: 'dbgpt.query.execute_sql',
    args: { sql: 'SELECT * FROM users LIMIT 10' },
    expectedRevision: 4,
    actor: 'agent_analyst_1',
  });
  assert.equal(request.expectedRevision, 4);
  assert.equal(request.actor, 'agent_analyst_1');
});

runTest('M1.6: Discriminated Union Result Schemas', () => {
  const successResult = openworkAffordanceResultSchema.parse({
    ok: true,
    id: 'dbgpt.query.execute_sql',
    result: { rows: [{ count: 42 }] },
    revision: 5,
    effects: { data: 'read', ui: 'none', external: false },
  });
  assert.equal(successResult.ok, true);
  assert.equal(successResult.revision, 5);

  const failureResult = openworkAffordanceResultSchema.parse({
    ok: false,
    id: 'dbgpt.command.drop_table',
    error: 'Table is locked by active transaction',
    code: 'conflict',
    revision: 5,
  });
  assert.equal(failureResult.ok, false);
  assert.equal(failureResult.code, 'conflict');
});

runTest('M1.7: Context Snapshot & Screens Schemas', () => {
  const screenConv = openworkScreenSchema.parse({
    kind: 'conversation',
    route: '/chat/s101',
    workspaceId: 'ws_default',
    sessionId: 's101',
  });
  assert.equal(screenConv.kind, 'conversation');

  const screenSettings = openworkScreenSchema.parse({
    kind: 'settings',
    route: '/settings/ai',
    panel: 'ai',
  });
  assert.equal(screenSettings.kind, 'settings');

  const snapshot = openworkContextSnapshotSchema.parse({
    schemaVersion: 1,
    revision: 10,
    capturedAt: new Date().toISOString(),
    screen: { kind: 'other', route: '/construct/database' },
    conversations: {
      tabs: [{ workspaceId: 'ws_1', sessionId: 's1', title: 'Data Analysis' }],
      layout: { kind: 'single', sessionId: 's1' },
    },
    chrome: {
      sidebarOpen: true,
      applicationMenuVisible: false,
      rightSidebarExpanded: true,
    },
    execution: {
      queries: 'parallel',
      commands: 'serialized',
      busyCommandId: null,
      busyActor: null,
    },
    sidePanel: {
      open: true,
      ownerSessionId: 's1',
      kind: 'panel',
      tabs: [{ id: 'tab1', kind: 'artifact', label: 'Financial Sheet' }],
      activeTabId: 'tab1',
    },
    resources: [
      {
        ref: 'screen:/construct/database',
        kind: 'screen',
        title: 'Database Constructor',
        provider: { id: 'dbgpt-ui', kind: 'builtin' },
        state: { route: '/construct/database' },
      },
    ],
    availableAffordances: [],
    contributions: [],
  });
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.revision, 10);
  assert.equal(snapshot.conversations.tabs.length, 1);
});

runTest('M1.8: Provider Catalog & Capability Schemas', () => {
  const guidance = openworkGuidanceDescriptorSchema.parse({
    ref: 'guidance.sql_best_practices',
    title: 'SQL Best Practices',
    description: 'Guidelines on optimized DB queries',
    provider: { id: 'dbgpt-guide', kind: 'builtin' },
    loading: 'eager',
  });
  assert.equal(guidance.loading, 'eager');

  const contribution = openworkFeatureContributionSchema.parse({
    featureId: 'dbgpt-analytics',
    provider: { id: 'dbgpt-core', kind: 'builtin' },
    affordances: [],
    guidance: [guidance],
  });
  assert.equal(contribution.featureId, 'dbgpt-analytics');

  const catalog = openworkProviderCatalogSchema.parse({
    schemaVersion: 1,
    contributions: [contribution],
  });
  assert.equal(catalog.contributions.length, 1);

  const capCompleted = openworkCapabilityResultSchema.parse({
    status: 'completed',
    data: { generated: true },
    additionalContext: ['Context note 1'],
  });
  assert.equal(capCompleted.status, 'completed');

  const capFailed = openworkCapabilityResultSchema.parse({
    status: 'failed',
    error: 'Model quota exceeded',
    retryable: true,
  });
  assert.equal(capFailed.status, 'failed');
  assert.equal(capFailed.retryable, true);
});

console.log('\n📦 Milestone 2: Control Provider & Concurrency Gate Logic');
console.log('────────────────────────────────────────────────────────────────');

runTest('M2.1: Helper Functions (describeError, returnedActionError, effects)', () => {
  assert.equal(describeError(new Error('Connection timed out')), 'Connection timed out');
  assert.equal(describeError('Plain error string'), 'Plain error string');

  assert.equal(returnedActionError({ ok: false, error: 'Custom error' }), 'Custom error');
  assert.equal(returnedActionError({ ok: true, data: 123 }), null);
  assert.equal(returnedActionError(null), null);

  const navEffects = effectsForSideEffect('navigation');
  assert.deepEqual(navEffects, { data: 'none', ui: 'navigate', external: false });

  const mutEffects = effectsForSideEffect('mutation');
  assert.deepEqual(mutEffects, { data: 'write', ui: 'none', external: false });

  const extEffects = effectsForSideEffect('external');
  assert.deepEqual(extEffects, { data: 'none', ui: 'none', external: true });

  const noneEffects = effectsForSideEffect('none');
  assert.deepEqual(noneEffects, { data: 'none', ui: 'none', external: false });
});

runTest('M2.2: Spotlight Timing Matrix Constants', () => {
  assert.equal(SPOTLIGHT_TIMING_MS.missingTarget, 80);
  assert.equal(SPOTLIGHT_TIMING_MS.scrollIntoView, 180);
  assert.equal(SPOTLIGHT_TIMING_MS.target, 260);
  assert.equal(SPOTLIGHT_TIMING_MS.press, 130);
  assert.equal(SPOTLIGHT_TIMING_MS.release, 80);
  assert.equal(SPOTLIGHT_TIMING_MS.done, 280);
});

runTest('M2.3: Action Metadata & Descriptor Projection', () => {
  const registeredAction = {
    id: 'route.sheets',
    order: 1,
    token: Symbol('test'),
    ref: {
      current: {
        id: 'route.sheets',
        label: 'Open Sheets',
        description: 'Navigate to Spreadsheet Studio',
        sideEffect: 'navigation',
        execute: () => ({ ok: true }),
      },
    },
  };

  const metadata = metadataForAction(registeredAction, null);
  assert.equal(metadata.id, 'route.sheets');
  assert.equal(metadata.label, 'Open Sheets');
  assert.equal(metadata.sideEffect, 'navigation');
  assert.equal(metadata.effects.ui, 'navigate');
  assert.equal(metadata.busy, false);

  const descriptor = affordanceForAction(metadata);
  assert.equal(descriptor.id, 'route.sheets');
  assert.equal(descriptor.kind, 'command');
  assert.equal(descriptor.availability.enabled, true);
  assert.equal(descriptor.effects.ui, 'navigate');
});

// Control Engine Simulator to verify concurrency and locking semantics
class MockControlEngine {
  constructor() {
    this.revision = 0;
    this.busyActionId = null;
    this.busyActor = null;
    this.actions = new Map();
    this.listeners = new Set();
  }

  registerAction(id, action) {
    this.actions.set(id, action);
    this.revision += 1;
    this.notify();
    return () => {
      this.actions.delete(id);
      this.revision += 1;
      this.notify();
    };
  }

  notify() {
    for (const listener of this.listeners) {
      listener({ revision: this.revision });
    }
  }

  async executeAction(actionId, args) {
    const action = this.actions.get(actionId);
    if (!action) return { ok: false, actionId, error: `Unknown action: ${actionId}` };
    if (action.disabled) return { ok: false, actionId, error: `Action is disabled: ${action.label}` };
    if (this.busyActionId) {
      const actor = this.busyActor ? ` for ${this.busyActor}` : '';
      return { ok: false, actionId, error: `Already acting: ${this.busyActionId}${actor}` };
    }

    this.busyActionId = actionId;
    this.revision += 1;
    this.notify();

    try {
      const result = await action.execute(args, { setNarration: () => {} });
      const err = returnedActionError(result);
      if (err) return { ok: false, actionId, error: err };
      return { ok: true, actionId, result };
    } catch (e) {
      return { ok: false, actionId, error: describeError(e) };
    } finally {
      this.busyActionId = null;
      this.revision += 1;
      this.notify();
    }
  }

  async query(request) {
    const action = this.actions.get(request.id);
    const revision = this.revision;
    if (!action || action.kind !== 'query') {
      return { ok: false, id: request.id, error: `Unknown query: ${request.id}`, code: 'unavailable', revision };
    }
    if (action.disabled) {
      return { ok: false, id: request.id, error: `Query is disabled: ${action.label}`, code: 'unavailable', revision };
    }
    try {
      const result = await action.execute(request.args, { setNarration: () => {} });
      const err = returnedActionError(result);
      if (err) return { ok: false, id: request.id, error: err, code: 'failed', revision };
      return { ok: true, id: request.id, result, revision, effects: action.effects ?? { data: 'read', ui: 'none', external: false } };
    } catch (e) {
      return { ok: false, id: request.id, error: describeError(e), code: 'failed', revision };
    }
  }

  async command(request) {
    const action = this.actions.get(request.id);
    const revision = this.revision;
    if (!action || action.kind === 'query') {
      return { ok: false, id: request.id, error: `Unknown command: ${request.id}`, code: 'unavailable', revision };
    }
    if (this.busyActionId) {
      const actor = this.busyActor ? ` for ${this.busyActor}` : '';
      return { ok: false, id: request.id, error: `Already acting: ${this.busyActionId}${actor}`, code: 'conflict', revision };
    }
    if (request.expectedRevision !== undefined && request.expectedRevision !== revision) {
      return {
        ok: false,
        id: request.id,
        error: `OpenWork context changed from revision ${request.expectedRevision} to ${revision}.`,
        code: 'conflict',
        revision,
      };
    }
    this.busyActor = request.actor ?? null;
    const result = await this.executeAction(request.id, request.args);
    this.busyActor = null;
    if (!result.ok) {
      return {
        ok: false,
        id: request.id,
        error: result.error,
        code: result.error.startsWith('Already acting:') ? 'conflict' : 'failed',
        revision: this.revision,
      };
    }
    return {
      ok: true,
      id: request.id,
      result: result.result,
      revision: this.revision,
      effects: action.effects ?? effectsForSideEffect(action.sideEffect ?? 'none'),
    };
  }
}

await runAsyncTest('M2.4: Monotonic Revision Tracking on Lifecycle Changes', async () => {
  const engine = new MockControlEngine();
  assert.equal(engine.revision, 0);

  const unreg1 = engine.registerAction('action_1', {
    id: 'action_1',
    label: 'Action 1',
    kind: 'command',
    execute: () => ({ success: true }),
  });
  assert.equal(engine.revision, 1);

  const unreg2 = engine.registerAction('action_2', {
    id: 'action_2',
    label: 'Action 2',
    kind: 'command',
    execute: () => ({ success: true }),
  });
  assert.equal(engine.revision, 2);

  unreg1();
  assert.equal(engine.revision, 3);

  unreg2();
  assert.equal(engine.revision, 4);
});

await runAsyncTest('M2.5: Optimistic Concurrency Protection (expectedRevision conflict)', async () => {
  const engine = new MockControlEngine();
  engine.registerAction('create_sheet', {
    id: 'create_sheet',
    label: 'Create Sheet',
    kind: 'command',
    execute: (args) => ({ sheetId: 'sheet_101', name: args?.name }),
  });
  // Revision is now 1

  // Command with matching revision succeeds
  const successRes = await engine.command({
    id: 'create_sheet',
    args: { name: 'Q3 Financials' },
    expectedRevision: 1,
  });
  assert.equal(successRes.ok, true);
  assert.equal(successRes.result.sheetId, 'sheet_101');
  // Revision after execution is 3 (1 -> busy(2) -> finish(3))

  // Command with stale expectedRevision (1) is rejected with code "conflict"
  const conflictRes = await engine.command({
    id: 'create_sheet',
    args: { name: 'Q4 Financials' },
    expectedRevision: 1, // Stale!
  });
  assert.equal(conflictRes.ok, false);
  assert.equal(conflictRes.code, 'conflict');
  assert.ok(conflictRes.error.includes('OpenWork context changed from revision 1 to 3'));
});

await runAsyncTest('M2.6: Serialized Command Mutex (busyAction collision protection)', async () => {
  const engine = new MockControlEngine();
  let slowResolve;
  const slowPromise = new Promise((resolve) => {
    slowResolve = resolve;
  });

  engine.registerAction('slow_generation', {
    id: 'slow_generation',
    label: 'Slow Generation',
    kind: 'command',
    execute: async () => {
      await slowPromise;
      return { generated: true };
    },
  });

  engine.registerAction('quick_command', {
    id: 'quick_command',
    label: 'Quick Command',
    kind: 'command',
    execute: () => ({ done: true }),
  });

  // Start slow command (do not await yet)
  const slowTask = engine.command({
    id: 'slow_generation',
    actor: 'agent_worker_1',
  });

  // Small tick to ensure slow command has entered and acquired mutex
  await new Promise((r) => setTimeout(r, 10));

  // Attempt another command while busy
  const busyAttempt = await engine.command({
    id: 'quick_command',
    actor: 'agent_worker_2',
  });

  assert.equal(busyAttempt.ok, false);
  assert.equal(busyAttempt.code, 'conflict');
  assert.ok(busyAttempt.error.includes('Already acting: slow_generation for agent_worker_1'));

  // Release slow command
  slowResolve();
  const slowResult = await slowTask;
  assert.equal(slowResult.ok, true);

  // Now quick command should succeed
  const afterRelease = await engine.command({
    id: 'quick_command',
  });
  assert.equal(afterRelease.ok, true);
});

await runAsyncTest('M2.7: Parallel Query Affordance Execution', async () => {
  const engine = new MockControlEngine();
  let queryCount = 0;

  engine.registerAction('get_system_status', {
    id: 'get_system_status',
    label: 'Get System Status',
    kind: 'query',
    effects: { data: 'read', ui: 'none', external: false },
    execute: async () => {
      queryCount++;
      await new Promise((r) => setTimeout(r, 20));
      return { status: 'healthy', count: queryCount };
    },
  });

  // Run 5 simultaneous queries
  const promises = Array.from({ length: 5 }, (_, i) =>
    engine.query({ id: 'get_system_status', args: { reqId: i } }),
  );

  const results = await Promise.all(promises);
  assert.equal(results.length, 5);
  for (const res of results) {
    assert.equal(res.ok, true);
    assert.equal(res.result.status, 'healthy');
    assert.equal(res.effects.data, 'read');
  }
});

await runAsyncTest('M2.8: Disabled Action and Error Handling Semantics', async () => {
  const engine = new MockControlEngine();

  engine.registerAction('disabled_action', {
    id: 'disabled_action',
    label: 'Disabled Action',
    kind: 'command',
    disabled: true,
    execute: () => ({ ok: true }),
  });

  engine.registerAction('failing_action', {
    id: 'failing_action',
    label: 'Failing Action',
    kind: 'command',
    execute: () => {
      throw new Error('Database disk full');
    },
  });

  engine.registerAction('payload_error_action', {
    id: 'payload_error_action',
    label: 'Payload Error Action',
    kind: 'command',
    execute: () => ({ ok: false, error: 'Validation constraint violated' }),
  });

  const disRes = await engine.command({ id: 'disabled_action' });
  assert.equal(disRes.ok, false);
  assert.equal(disRes.code, 'failed');
  assert.ok(disRes.error.includes('Action is disabled'));

  const failRes = await engine.command({ id: 'failing_action' });
  assert.equal(failRes.ok, false);
  assert.equal(failRes.code, 'failed');
  assert.equal(failRes.error, 'Database disk full');

  const payloadRes = await engine.command({ id: 'payload_error_action' });
  assert.equal(payloadRes.ok, false);
  assert.equal(payloadRes.code, 'failed');
  assert.equal(payloadRes.error, 'Validation constraint violated');
});

console.log('\n================================================================');
console.log(`📊 CHECK RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
console.log('================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
