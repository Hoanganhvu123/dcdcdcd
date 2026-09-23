import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  openworkSessionRefSchema,
  openworkScreenSchema,
  openworkConversationLayoutSchema,
  openworkPanelTabSchema,
  openworkResourceDescriptorSchema,
  openworkGuidanceDescriptorSchema,
  openworkFeatureContributionSchema,
  openworkProviderCatalogSchema,
  openworkCapabilityResultSchema,
  openworkContextSnapshotSchema,
  effectsForSideEffect,
  metadataForAction,
  affordanceForAction,
  describeError,
  returnedActionError,
  OPENWORK_AFFORDANCE_SCHEMA_VERSION,
  OPENWORK_CONTEXT_SCHEMA_VERSION,
} from './fixtures/control-engine-simulator.mjs';

test('Tier 1: OpenWork Control Core Features & Schemas', async (t) => {

  await t.test('T1.1: Affordance Descriptor Schema Parsing & Validation', () => {
    assert.equal(OPENWORK_AFFORDANCE_SCHEMA_VERSION, 1);

    const validDescriptor = {
      id: 'session.action.create_sheet',
      kind: 'command',
      title: 'Create Financial Sheet',
      description: 'Generates a financial spreadsheet in the workspace',
      provider: { id: 'openwork-ui', kind: 'builtin' },
      arguments: [
        { name: 'sheetName', type: 'string', required: true, description: 'Name of the sheet tab' },
        { name: 'rowCount', type: 'number', required: false, description: 'Initial row allocation' },
      ],
      effects: { data: 'write', ui: 'layout', external: false },
      confirmation: 'never',
      availability: { enabled: true },
      executor: { kind: 'openwork' },
    };

    const parsed = openworkAffordanceDescriptorSchema.parse(validDescriptor);
    assert.equal(parsed.id, 'session.action.create_sheet');
    assert.equal(parsed.kind, 'command');
    assert.equal(parsed.arguments.length, 2);
    assert.equal(parsed.arguments[0].type, 'string');
    assert.equal(parsed.arguments[0].required, true);
    assert.equal(parsed.effects.data, 'write');
    assert.equal(parsed.effects.ui, 'layout');
    assert.equal(parsed.effects.external, false);

    // Invalid kind should throw
    assert.throws(() => {
      openworkAffordanceDescriptorSchema.parse({
        ...validDescriptor,
        kind: 'unsupported_kind',
      });
    });

    // Missing id or provider should throw
    assert.throws(() => {
      openworkAffordanceDescriptorSchema.parse({
        ...validDescriptor,
        id: '',
      });
    });

    // Tool executor variant
    const toolDescriptor = {
      ...validDescriptor,
      executor: { kind: 'tool', tool: 'dbgpt_sql_executor' },
    };
    const parsedTool = openworkAffordanceDescriptorSchema.parse(toolDescriptor);
    assert.equal(parsedTool.executor.kind, 'tool');
    if (parsedTool.executor.kind === 'tool') {
      assert.equal(parsedTool.executor.tool, 'dbgpt_sql_executor');
    }
  });

  await t.test('T1.2: Affordance Result Discriminated Union Parsing (Success vs Failure)', () => {
    const successResult = {
      ok: true,
      id: 'session.query.metrics',
      result: { totalRows: 42, activeUsers: 1500 },
      revision: 7,
      effects: { data: 'read', ui: 'none', external: false },
    };

    const parsedSuccess = openworkAffordanceResultSchema.parse(successResult);
    assert.equal(parsedSuccess.ok, true);
    if (parsedSuccess.ok) {
      assert.equal(parsedSuccess.revision, 7);
      assert.deepEqual(parsedSuccess.result, { totalRows: 42, activeUsers: 1500 });
      assert.equal(parsedSuccess.effects.data, 'read');
    }

    const failureCodes = ['unavailable', 'invalid-args', 'conflict', 'failed'];
    for (const code of failureCodes) {
      const failureResult = {
        ok: false,
        id: 'session.command.mutate',
        error: `Operation failed with reason: ${code}`,
        code,
        revision: 8,
      };
      const parsedFail = openworkAffordanceResultSchema.parse(failureResult);
      assert.equal(parsedFail.ok, false);
      if (!parsedFail.ok) {
        assert.equal(parsedFail.code, code);
        assert.equal(parsedFail.revision, 8);
      }
    }

    // Invalid failure code should fail schema validation
    assert.throws(() => {
      openworkAffordanceResultSchema.parse({
        ok: false,
        id: 'invalid.code',
        error: 'Invalid error code test',
        code: 'random_code',
      });
    });
  });

  await t.test('T1.3: Effects Matrix Validation & SideEffect Mapping', () => {
    const dataValues = ['none', 'read', 'write'];
    const uiValues = ['none', 'focus', 'navigate', 'layout', 'dialog'];
    const extValues = [true, false];

    // Validate exhaustive 3x5x2 combinations
    let totalCombinations = 0;
    for (const data of dataValues) {
      for (const ui of uiValues) {
        for (const external of extValues) {
          const effect = { data, ui, external };
          const parsed = openworkAffordanceEffectsSchema.parse(effect);
          assert.equal(parsed.data, data);
          assert.equal(parsed.ui, ui);
          assert.equal(parsed.external, external);
          totalCombinations++;
        }
      }
    }
    assert.equal(totalCombinations, 30);

    // Verify sideEffect mapper rules
    assert.deepEqual(effectsForSideEffect('navigation'), { data: 'none', ui: 'navigate', external: false });
    assert.deepEqual(effectsForSideEffect('mutation'), { data: 'write', ui: 'none', external: false });
    assert.deepEqual(effectsForSideEffect('external'), { data: 'none', ui: 'none', external: true });
    assert.deepEqual(effectsForSideEffect('none'), { data: 'none', ui: 'none', external: false });
  });

  await t.test('T1.4: OpenWork Context Snapshot Schema Parsing (Screen & Layout Variants)', () => {
    assert.equal(OPENWORK_CONTEXT_SCHEMA_VERSION, 1);

    const baseSnapshot = {
      schemaVersion: 1,
      revision: 12,
      capturedAt: '2026-08-24T04:30:00.000Z',
      screen: { kind: 'conversation', route: '/chat/ses_101', workspaceId: 'ws_main', sessionId: 'ses_101' },
      conversations: {
        tabs: [{ workspaceId: 'ws_main', sessionId: 'ses_101', title: 'Executive Analysis' }],
        layout: { kind: 'split', primarySessionId: 'ses_101', secondarySessionId: 'ses_102', focused: 'primary' },
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
        ownerSessionId: 'ses_101',
        kind: 'panel',
        tabs: [
          { id: 'tab_sheet', kind: 'artifact', label: 'Financial Sheet', url: '/artifacts/sheet_1', status: 'ready' },
        ],
        activeTabId: 'tab_sheet',
      },
      resources: [
        {
          ref: 'screen:/chat/ses_101',
          kind: 'screen',
          title: 'Chat Canvas',
          provider: { id: 'openwork-ui', kind: 'builtin' },
          state: { kind: 'conversation', route: '/chat/ses_101' },
        },
      ],
      availableAffordances: [],
      contributions: [],
    };

    const parsed = openworkContextSnapshotSchema.parse(baseSnapshot);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.revision, 12);
    assert.equal(parsed.screen.kind, 'conversation');
    assert.equal(parsed.conversations.layout.kind, 'split');
    assert.equal(parsed.execution.queries, 'parallel');
    assert.equal(parsed.execution.commands, 'serialized');

    // Settings screen variant
    const settingsSnapshot = {
      ...baseSnapshot,
      screen: { kind: 'settings', route: '/settings/ai', panel: 'ai' },
      conversations: { tabs: [], layout: { kind: 'empty' } },
    };
    const parsedSettings = openworkContextSnapshotSchema.parse(settingsSnapshot);
    assert.equal(parsedSettings.screen.kind, 'settings');

    // Other screen variant
    const otherSnapshot = {
      ...baseSnapshot,
      screen: { kind: 'other', route: '/models' },
      conversations: { tabs: [], layout: { kind: 'single', sessionId: 'ses_99' } },
    };
    const parsedOther = openworkContextSnapshotSchema.parse(otherSnapshot);
    assert.equal(parsedOther.screen.kind, 'other');
    assert.equal(parsedOther.conversations.layout.kind, 'single');
  });

  await t.test('T1.5: Provider Catalog, Guidance & Capability Result Schema Validation', () => {
    const catalog = {
      schemaVersion: 1,
      contributions: [
        {
          featureId: 'excel_modeling',
          provider: { id: 'dbgpt-excel', kind: 'builtin' },
          affordances: [
            {
              id: 'excel.add_row',
              kind: 'command',
              title: 'Add Row to Excel',
              description: 'Appends a structured row to the active sheet',
              provider: { id: 'dbgpt-excel', kind: 'builtin' },
              arguments: [{ name: 'values', type: 'array', required: true }],
              effects: { data: 'write', ui: 'none', external: false },
              confirmation: 'never',
              availability: { enabled: true },
              executor: { kind: 'openwork' },
            },
          ],
          guidance: [
            {
              ref: 'guidance:excel:formulas',
              title: 'Use Excel Formulas',
              description: 'Prefer SUM and AVERAGE over hardcoded aggregates',
              provider: { id: 'dbgpt-excel', kind: 'builtin' },
              loading: 'eager',
            },
          ],
        },
      ],
    };

    const parsedCatalog = openworkProviderCatalogSchema.parse(catalog);
    assert.equal(parsedCatalog.schemaVersion, 1);
    assert.equal(parsedCatalog.contributions.length, 1);
    assert.equal(parsedCatalog.contributions[0].guidance[0].loading, 'eager');

    // Capability result statuses
    const completedResult = {
      status: 'completed',
      data: { rowsAdded: 5 },
      additionalContext: ['Updated column totals automatically'],
    };
    assert.equal(openworkCapabilityResultSchema.parse(completedResult).status, 'completed');

    const guidanceResult = {
      status: 'guidance',
      instructions: ['Check cell formatting before exporting'],
    };
    assert.equal(openworkCapabilityResultSchema.parse(guidanceResult).status, 'guidance');

    const failedResult = {
      status: 'failed',
      error: 'Formula parse error in cell C12',
      retryable: true,
    };
    assert.equal(openworkCapabilityResultSchema.parse(failedResult).status, 'failed');
  });

  await t.test('T1.6: Metadata & Affordance Conversion Logic Verification', () => {
    const dummyActionRef = {
      current: {
        id: 'db.query.tables',
        label: 'List Database Tables',
        description: 'Queries schema for available tables',
        kind: 'query',
        sideEffect: 'none',
        requiresConfirmation: false,
        requiresArgs: false,
        disabled: false,
        execute: async () => ['users', 'orders', 'sales'],
      },
    };

    const registered = {
      id: 'db.query.tables',
      order: 1,
      token: Symbol('db.query.tables'),
      ref: dummyActionRef,
    };

    const meta = metadataForAction(registered, null);
    assert.equal(meta.id, 'db.query.tables');
    assert.equal(meta.label, 'List Database Tables');
    assert.equal(meta.kind, 'query');
    assert.equal(meta.busy, false);
    assert.deepEqual(meta.effects, { data: 'none', ui: 'none', external: false });

    const affordance = affordanceForAction(meta);
    assert.equal(affordance.id, 'db.query.tables');
    assert.equal(affordance.kind, 'query');
    assert.equal(affordance.availability.enabled, true);
    assert.equal(affordance.confirmation, 'never');

    // Error helper verification
    assert.equal(describeError(new Error('Sample error')), 'Sample error');
    assert.equal(describeError('String error'), 'String error');
    assert.equal(returnedActionError({ ok: false, error: 'Custom error' }), 'Custom error');
    assert.equal(returnedActionError({ ok: true, data: 123 }), null);
  });
});
