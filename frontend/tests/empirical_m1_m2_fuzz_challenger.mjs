import test from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
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
  CONTROL_API_VERSION,
  OpenworkControlEngine,
  UIControlBridgeSimulator,
} from './fixtures/control-engine-simulator.mjs';

// ============================================================================
// EMPIRICAL CHALLENGER: SCHEMA BOUNDARIES, FUZZING & CONTROL API ROBUSTNESS
// ============================================================================

test('Empirical Challenger: Schema Boundaries, Fuzzing & Discriminated Unions', async (t) => {

  // ==========================================================================
  // SUITE 1: AFFORDANCE DESCRIPTOR ARGUMENTS, EFFECTS MATRIX & EXECUTOR FUZZING
  // ==========================================================================
  await t.test('Suite 1: Affordance Argument, Effects Matrix & Executor Fuzzing', async (st) => {

    await st.test('1.1: Fuzz argument name boundary (empty, whitespace, non-string, special chars)', () => {
      // Valid names
      assert.doesNotThrow(() => openworkAffordanceArgumentSchema.parse({ name: 'param1', type: 'string', required: true }));
      assert.doesNotThrow(() => openworkAffordanceArgumentSchema.parse({ name: '  trimmedParam  ', type: 'string', required: true }));
      assert.equal(openworkAffordanceArgumentSchema.parse({ name: '  trimmedParam  ', type: 'string', required: true }).name, 'trimmedParam');
      assert.doesNotThrow(() => openworkAffordanceArgumentSchema.parse({ name: '🔥_emoji_param', type: 'number', required: false }));
      assert.doesNotThrow(() => openworkAffordanceArgumentSchema.parse({ name: '<script>alert(1)</script>', type: 'string', required: true }));
      assert.doesNotThrow(() => openworkAffordanceArgumentSchema.parse({ name: 'A'.repeat(5000), type: 'string', required: true }));

      // Invalid names: empty, whitespace-only, non-string
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: '', type: 'string', required: true }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: '    ', type: 'string', required: true }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: null, type: 'string', required: true }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: undefined, type: 'string', required: true }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: 123, type: 'string', required: true }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: {}, type: 'string', required: true }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: ['param'], type: 'string', required: true }), ZodError);
    });

    await st.test('1.2: Fuzz argument type enum boundaries and reject invalid types', () => {
      const validTypes = ['string', 'number', 'boolean', 'object', 'array', 'unknown'];
      for (const valid of validTypes) {
        const parsed = openworkAffordanceArgumentSchema.parse({ name: 'arg', type: valid, required: false });
        assert.equal(parsed.type, valid);
      }

      const invalidTypes = ['int', 'float', 'str', 'dict', 'any', 'function', 'symbol', 'bigint', null, undefined, 123, true, {}];
      for (const invalid of invalidTypes) {
        assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: 'arg', type: invalid, required: false }), ZodError);
      }
    });

    await st.test('1.3: Fuzz argument required flag and description boundaries', () => {
      // Boolean strictly enforced
      assert.equal(openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: true }).required, true);
      assert.equal(openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: false }).required, false);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: 'true' }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: 1 }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: null }), ZodError);
      assert.throws(() => openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string' }), ZodError);

      // Description optional, but if provided, must be trimmed non-empty string
      assert.equal(openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: true }).description, undefined);
      assert.equal(
        openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: true, description: '  desc  ' }).description,
        'desc'
      );
      assert.throws(
        () => openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: true, description: '   ' }),
        ZodError
      );
      assert.throws(
        () => openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: true, description: '' }),
        ZodError
      );
      assert.throws(
        () => openworkAffordanceArgumentSchema.parse({ name: 'a', type: 'string', required: true, description: 123 }),
        ZodError
      );
    });

    await st.test('1.4: Fuzz effects matrix dimensions and exhaustively check valid/invalid states', () => {
      // Valid matrix combinations
      const dataValues = ['none', 'read', 'write'];
      const uiValues = ['none', 'focus', 'navigate', 'layout', 'dialog'];
      const externalValues = [false, true];

      for (const data of dataValues) {
        for (const ui of uiValues) {
          for (const external of externalValues) {
            const parsed = openworkAffordanceEffectsSchema.parse({ data, ui, external });
            assert.equal(parsed.data, data);
            assert.equal(parsed.ui, ui);
            assert.equal(parsed.external, external);
          }
        }
      }

      // Invalid matrix values
      const invalidData = ['delete', 'update', 'all', 'mutate', '', null, 1];
      for (const d of invalidData) {
        assert.throws(() => openworkAffordanceEffectsSchema.parse({ data: d, ui: 'none', external: false }), ZodError);
      }

      const invalidUI = ['modal', 'popup', 'alert', 'toast', '', null, 1];
      for (const u of invalidUI) {
        assert.throws(() => openworkAffordanceEffectsSchema.parse({ data: 'none', ui: u, external: false }), ZodError);
      }

      const invalidExternal = ['yes', 'no', 'false', 0, 1, null, undefined, {}];
      for (const ext of invalidExternal) {
        assert.throws(() => openworkAffordanceEffectsSchema.parse({ data: 'none', ui: 'none', external: ext }), ZodError);
      }
    });

    await st.test('1.5: Verify effectsForSideEffect fallback safety on invalid inputs', () => {
      assert.deepEqual(effectsForSideEffect('navigation'), { data: 'none', ui: 'navigate', external: false });
      assert.deepEqual(effectsForSideEffect('mutation'), { data: 'write', ui: 'none', external: false });
      assert.deepEqual(effectsForSideEffect('external'), { data: 'none', ui: 'none', external: true });
      assert.deepEqual(effectsForSideEffect('none'), { data: 'none', ui: 'none', external: false });

      // Robust fallback on unrecognized/corrupt inputs
      assert.deepEqual(effectsForSideEffect('unrecognized'), { data: 'none', ui: 'none', external: false });
      assert.deepEqual(effectsForSideEffect(null), { data: 'none', ui: 'none', external: false });
      assert.deepEqual(effectsForSideEffect(undefined), { data: 'none', ui: 'none', external: false });
      assert.deepEqual(effectsForSideEffect(123), { data: 'none', ui: 'none', external: false });
    });

    await st.test('1.6: Fuzz executor discriminated union on kind property', () => {
      // Valid openwork executor
      const ow = openworkAffordanceExecutorSchema.parse({ kind: 'openwork' });
      assert.equal(ow.kind, 'openwork');

      // Valid tool executor
      const tool = openworkAffordanceExecutorSchema.parse({ kind: 'tool', tool: 'dbgpt_sql_executor' });
      assert.equal(tool.kind, 'tool');
      assert.equal(tool.tool, 'dbgpt_sql_executor');

      // Invalid executors
      assert.throws(() => openworkAffordanceExecutorSchema.parse({ kind: 'tool' }), ZodError); // Missing tool
      assert.throws(() => openworkAffordanceExecutorSchema.parse({ kind: 'tool', tool: '' }), ZodError); // Empty tool
      assert.throws(() => openworkAffordanceExecutorSchema.parse({ kind: 'tool', tool: '   ' }), ZodError); // Whitespace tool
      assert.throws(() => openworkAffordanceExecutorSchema.parse({ kind: 'custom' }), ZodError); // Unregistered discriminator
      assert.throws(() => openworkAffordanceExecutorSchema.parse({}), ZodError); // Missing kind
      assert.throws(() => openworkAffordanceExecutorSchema.parse(null), ZodError);
      assert.throws(() => openworkAffordanceExecutorSchema.parse(123), ZodError);
    });

    await st.test('1.7: Fuzz full OpenworkAffordanceDescriptorSchema against corrupt shapes', () => {
      const baseValid = {
        id: 'action.test.fuzz',
        kind: 'command',
        title: 'Test Action',
        description: 'Test Description',
        provider: { id: 'builtin-prov', kind: 'builtin' },
        arguments: [{ name: 'arg1', type: 'string', required: true }],
        effects: { data: 'read', ui: 'focus', external: false },
        confirmation: 'never',
        availability: { enabled: true },
        executor: { kind: 'openwork' },
      };

      assert.doesNotThrow(() => openworkAffordanceDescriptorSchema.parse(baseValid));

      // Test missing required fields
      const requiredKeys = ['id', 'kind', 'title', 'description', 'provider', 'arguments', 'effects', 'confirmation', 'availability', 'executor'];
      for (const key of requiredKeys) {
        const corrupt = { ...baseValid };
        delete corrupt[key];
        assert.throws(() => openworkAffordanceDescriptorSchema.parse(corrupt), ZodError, `Failed to reject descriptor missing key: ${key}`);
      }

      // Test invalid confirmation enum
      assert.throws(() => openworkAffordanceDescriptorSchema.parse({ ...baseValid, confirmation: 'sometimes' }), ZodError);
      assert.throws(() => openworkAffordanceDescriptorSchema.parse({ ...baseValid, confirmation: 'auto' }), ZodError);

      // Test invalid provider ref kind
      assert.throws(() => openworkAffordanceDescriptorSchema.parse({
        ...baseValid,
        provider: { id: 'prov1', kind: 'custom_plugin' },
      }), ZodError);
    });
  });

  // ==========================================================================
  // SUITE 2: CONTEXT SNAPSHOTS & DISCRIMINATED UNIONS
  // ==========================================================================
  await t.test('Suite 2: Context Snapshot, Screen & Layout Discriminated Unions', async (st) => {

    await st.test('2.1: Fuzz openworkScreenSchema discriminated union (conversation, settings, other)', () => {
      // Valid screens
      const conv = openworkScreenSchema.parse({ kind: 'conversation', route: '/chat/1', workspaceId: 'ws-1', sessionId: 'sess-1' });
      assert.equal(conv.kind, 'conversation');
      assert.equal(conv.sessionId, 'sess-1');

      const settings = openworkScreenSchema.parse({ kind: 'settings', route: '/settings/general', panel: 'general' });
      assert.equal(settings.kind, 'settings');
      assert.equal(settings.panel, 'general');

      const other = openworkScreenSchema.parse({ kind: 'other', route: '/models_evaluation' });
      assert.equal(other.kind, 'other');

      // Invalid screens
      assert.throws(() => openworkScreenSchema.parse({ kind: 'settings', route: '/s' }), ZodError); // Missing panel
      assert.throws(() => openworkScreenSchema.parse({ kind: 'other' }), ZodError); // Missing route
      assert.throws(() => openworkScreenSchema.parse({ kind: 'dashboard', route: '/dash' }), ZodError); // Invalid discriminator
      assert.throws(() => openworkScreenSchema.parse({ route: '/chat' }), ZodError); // Missing discriminator
      assert.throws(() => openworkScreenSchema.parse(null), ZodError);
    });

    await st.test('2.2: Fuzz openworkConversationLayoutSchema discriminated union (empty, single, split)', () => {
      // Valid layouts
      const empty = openworkConversationLayoutSchema.parse({ kind: 'empty' });
      assert.equal(empty.kind, 'empty');

      const single = openworkConversationLayoutSchema.parse({ kind: 'single', sessionId: 'sess-1' });
      assert.equal(single.kind, 'single');
      assert.equal(single.sessionId, 'sess-1');

      const split = openworkConversationLayoutSchema.parse({
        kind: 'split',
        primarySessionId: 'sess-1',
        secondarySessionId: 'sess-2',
        focused: 'primary',
      });
      assert.equal(split.kind, 'split');
      assert.equal(split.focused, 'primary');

      // Invalid layouts
      assert.throws(() => openworkConversationLayoutSchema.parse({ kind: 'single' }), ZodError); // Missing sessionId
      assert.throws(() => openworkConversationLayoutSchema.parse({ kind: 'split', primarySessionId: 's1' }), ZodError); // Missing secondary & focused
      assert.throws(() => openworkConversationLayoutSchema.parse({
        kind: 'split',
        primarySessionId: 's1',
        secondarySessionId: 's2',
        focused: 'tertiary', // Invalid enum
      }), ZodError);
      assert.throws(() => openworkConversationLayoutSchema.parse({ kind: 'triple' }), ZodError);
    });

    await st.test('2.3: Fuzz openworkCapabilityResultSchema discriminated union (completed, guidance, requires-user-action, failed)', () => {
      const completed = openworkCapabilityResultSchema.parse({
        status: 'completed',
        data: { reportId: 'rep_123' },
        additionalContext: ['Context A', 'Context B'],
      });
      assert.equal(completed.status, 'completed');
      assert.equal(completed.data.reportId, 'rep_123');

      // In Zod, z.unknown() matches any value including undefined
      const completedEmpty = openworkCapabilityResultSchema.parse({
        status: 'completed',
      });
      assert.equal(completedEmpty.status, 'completed');

      const guidance = openworkCapabilityResultSchema.parse({
        status: 'guidance',
        instructions: ['Step 1: Open chat', 'Step 2: Type prompt'],
      });
      assert.equal(guidance.status, 'guidance');

      const userAction = openworkCapabilityResultSchema.parse({
        status: 'requires-user-action',
        message: 'Please authorize database connection',
        action: 'auth_db',
      });
      assert.equal(userAction.status, 'requires-user-action');

      const failed = openworkCapabilityResultSchema.parse({
        status: 'failed',
        error: 'Database timeout',
        retryable: true,
      });
      assert.equal(failed.status, 'failed');
      assert.equal(failed.retryable, true);

      // Invalid capability status
      assert.throws(() => openworkCapabilityResultSchema.parse({ status: 'running' }), ZodError);
      assert.throws(() => openworkCapabilityResultSchema.parse({ status: 'guidance' }), ZodError); // Missing instructions array
      assert.throws(() => openworkCapabilityResultSchema.parse({ status: 'guidance', instructions: 'not-array' }), ZodError);
      assert.throws(() => openworkCapabilityResultSchema.parse({ status: 'failed', error: 'err' }), ZodError); // Missing retryable boolean
      assert.throws(() => openworkCapabilityResultSchema.parse({ status: 'failed', retryable: true }), ZodError); // Missing error string
    });

    await st.test('2.4: Fuzz openworkContextSnapshotSchema boundaries and constraints', () => {
      const validSnapshot = {
        schemaVersion: OPENWORK_CONTEXT_SCHEMA_VERSION,
        revision: 42,
        capturedAt: new Date().toISOString(),
        screen: { kind: 'conversation', route: '/chat', workspaceId: 'w1', sessionId: 's1' },
        conversations: {
          tabs: [{ workspaceId: 'w1', sessionId: 's1', title: 'Analysis 1' }],
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
          tabs: [{ id: 'tab1', kind: 'artifact', label: 'Financial.xlsx', status: 'ready' }],
          activeTabId: 'tab1',
        },
        resources: [{
          ref: 'screen:/chat',
          kind: 'screen',
          title: 'Main Chat Screen',
          provider: { id: 'openwork-ui', kind: 'builtin' },
          state: { active: true },
        }],
        availableAffordances: [],
        contributions: [],
      };

      assert.doesNotThrow(() => openworkContextSnapshotSchema.parse(validSnapshot));

      // Revision must be non-negative integer
      assert.throws(() => openworkContextSnapshotSchema.parse({ ...validSnapshot, revision: -1 }), ZodError);
      assert.throws(() => openworkContextSnapshotSchema.parse({ ...validSnapshot, revision: 3.14 }), ZodError);
      assert.throws(() => openworkContextSnapshotSchema.parse({ ...validSnapshot, revision: '10' }), ZodError);
      assert.throws(() => openworkContextSnapshotSchema.parse({ ...validSnapshot, revision: NaN }), ZodError);

      // Schema version must match literal constant 1
      assert.throws(() => openworkContextSnapshotSchema.parse({ ...validSnapshot, schemaVersion: 2 }), ZodError);
      assert.throws(() => openworkContextSnapshotSchema.parse({ ...validSnapshot, schemaVersion: 0 }), ZodError);

      // Execution constraints: queries must be 'parallel', commands must be 'serialized'
      assert.throws(() => openworkContextSnapshotSchema.parse({
        ...validSnapshot,
        execution: { queries: 'sequential', commands: 'serialized', busyCommandId: null, busyActor: null },
      }), ZodError);

      // SidePanel kind enum ('panel', 'extensions', 'voice', null)
      assert.throws(() => openworkContextSnapshotSchema.parse({
        ...validSnapshot,
        sidePanel: { ...validSnapshot.sidePanel, kind: 'custom_widget' },
      }), ZodError);
    });

    await st.test('2.5: Fuzz openworkAffordanceResultSchema discriminated union (ok: true vs ok: false)', () => {
      // Valid success result
      const success = openworkAffordanceResultSchema.parse({
        ok: true,
        id: 'action.save',
        result: { rowsInserted: 100 },
        revision: 5,
        effects: { data: 'write', ui: 'none', external: false },
      });
      assert.equal(success.ok, true);
      assert.equal(success.id, 'action.save');

      // Valid failure result
      const failure = openworkAffordanceResultSchema.parse({
        ok: false,
        id: 'action.save',
        error: 'Permission denied',
        code: 'conflict',
        revision: 5,
      });
      assert.equal(failure.ok, false);
      assert.equal(failure.code, 'conflict');

      // Failure codes must be strictly in enum
      const validCodes = ['unavailable', 'invalid-args', 'conflict', 'failed'];
      for (const code of validCodes) {
        assert.doesNotThrow(() => openworkAffordanceResultSchema.parse({
          ok: false,
          id: 'test',
          error: 'err',
          code,
        }));
      }

      // Invalid failure code
      assert.throws(() => openworkAffordanceResultSchema.parse({
        ok: false,
        id: 'test',
        error: 'err',
        code: 'timeout',
      }), ZodError);

      // Success missing effects
      assert.throws(() => openworkAffordanceResultSchema.parse({
        ok: true,
        id: 'test',
        result: 'ok',
      }), ZodError);

      // Mixed/invalid ok discriminator
      assert.throws(() => openworkAffordanceResultSchema.parse({
        ok: 'true',
        id: 'test',
      }), ZodError);
    });
  });

  // ==========================================================================
  // SUITE 3: ERROR CATCHING & FORMATTING (describeError & returnedActionError)
  // ==========================================================================
  await t.test('Suite 3: describeError & returnedActionError Error Handling', async (st) => {

    await st.test('3.1: describeError handles Errors, custom subclasses, and exceptions', () => {
      assert.equal(describeError(new Error('Network connection timeout')), 'Network connection timeout');
      assert.equal(describeError(new TypeError('Invalid property access')), 'Invalid property access');
      assert.equal(describeError(new RangeError('Index out of bounds')), 'Index out of bounds');

      class CustomDomainError extends Error {
        constructor(msg) { super(msg); this.name = 'CustomDomainError'; }
      }
      assert.equal(describeError(new CustomDomainError('Domain rule violated')), 'Domain rule violated');
    });

    await st.test('3.2: describeError handles primitives, null, undefined, BigInt and Symbol without crashing', () => {
      assert.equal(describeError('Direct string error'), 'Direct string error');
      assert.equal(describeError(404), '404');
      assert.equal(describeError(0), 'Unknown error'); // 0 is falsy, defaults to 'Unknown error'
      assert.equal(describeError(false), 'Unknown error'); // false is falsy
      assert.equal(describeError(true), 'true');
      assert.equal(describeError(null), 'Unknown error');
      assert.equal(describeError(undefined), 'Unknown error');
      assert.equal(describeError(100n), '100');
      assert.equal(describeError(Symbol('err_token')), 'Symbol(err_token)');
    });

    await st.test('3.3: describeError cleanly stringifies ZodErrors thrown by schema boundaries', () => {
      try {
        openworkAffordanceArgumentSchema.parse({ name: '', type: 'bad_type' });
        assert.fail('Should have thrown ZodError');
      } catch (err) {
        assert.ok(err instanceof ZodError);
        const described = describeError(err);
        assert.ok(typeof described === 'string');
        assert.ok(described.length > 0);
        assert.ok(described.includes('Invalid enum value') || described.includes('type') || described.includes('name'));
      }
    });

    await st.test('3.4: returnedActionError cleanly extracts error strings from action payloads', () => {
      // Standard failure objects
      assert.equal(returnedActionError({ ok: false, error: 'Database locked' }), 'Database locked');
      assert.equal(returnedActionError({ ok: false, error: 'Custom error detail' }), 'Custom error detail');

      // Empty, whitespace or missing error defaults to fallback
      assert.equal(returnedActionError({ ok: false }), 'Action returned an error.');
      assert.equal(returnedActionError({ ok: false, error: '' }), 'Action returned an error.');
      assert.equal(returnedActionError({ ok: false, error: '   ' }), 'Action returned an error.');
      assert.equal(returnedActionError({ ok: false, error: null }), 'Action returned an error.');
      assert.equal(returnedActionError({ ok: false, error: 500 }), 'Action returned an error.');
      assert.equal(returnedActionError({ ok: false, error: {} }), 'Action returned an error.');

      // Success payloads return null (no error)
      assert.equal(returnedActionError({ ok: true, result: 'data' }), null);
      assert.equal(returnedActionError({ ok: true, error: 'ignored because ok=true' }), null);
      assert.equal(returnedActionError({ ok: 'not-boolean-false' }), null);

      // Non-objects return null
      assert.equal(returnedActionError(null), null);
      assert.equal(returnedActionError(undefined), null);
      assert.equal(returnedActionError('error string'), null);
      assert.equal(returnedActionError(123), null);
      assert.equal(returnedActionError(true), null);
      assert.equal(returnedActionError(false), null);
      assert.equal(returnedActionError([]), null);
    });
  });

  // ==========================================================================
  // SUITE 4: OPENWORK CONTROL ENGINE & GLOBAL METHODS RESILIENCE
  // ==========================================================================
  await t.test('Suite 4: OpenworkControlEngine & Global Methods Boundary Robustness', async (st) => {

    await st.test('4.1: Initial snapshot and state inspection', () => {
      const engine = new OpenworkControlEngine({ route: '/chat', enabled: true });
      const snap = engine.snapshot();
      assert.equal(snap.version, CONTROL_API_VERSION);
      assert.equal(snap.enabled, true);
      assert.equal(snap.status, 'ready');
      assert.equal(snap.route, '/chat');
      assert.deepEqual(snap.actions, []);
    });

    await st.test('4.2: Action Registration, Metadata generation and Unregistration idempotency', () => {
      const engine = new OpenworkControlEngine();
      const mockAction = {
        id: 'action.click.btn',
        label: 'Click Button',
        description: 'Test button click',
        kind: 'command',
        sideEffect: 'mutation',
        requiresConfirmation: false,
        args: [{ name: 'btnId', type: 'string', required: true }],
        disabled: false,
        execute: async () => ({ clicked: true }),
      };

      const ref = { current: mockAction };
      const cleanup = engine.registerAction('action.click.btn', ref);

      const actions = engine.listActions();
      assert.equal(actions.length, 1);
      assert.equal(actions[0].id, 'action.click.btn');
      assert.equal(actions[0].sideEffect, 'mutation');
      assert.deepEqual(actions[0].effects, { data: 'write', ui: 'none', external: false });
      assert.equal(actions[0].disabled, false);
      assert.equal(actions[0].busy, false);

      // Unregister
      cleanup();
      assert.equal(engine.listActions().length, 0);

      // Double cleanup is safe no-op
      assert.doesNotThrow(() => cleanup());
    });

    await st.test('4.3: execute() handles null, undefined, unknown and disabled action IDs', async () => {
      const engine = new OpenworkControlEngine();

      // Unknown action
      const resNull = await engine.execute(null);
      assert.equal(resNull.ok, false);
      assert.equal(resNull.error, 'Unknown action: null');

      const resUndef = await engine.execute(undefined);
      assert.equal(resUndef.ok, false);
      assert.equal(resUndef.error, 'Unknown action: undefined');

      const resUnknown = await engine.execute('non.existent.action');
      assert.equal(resUnknown.ok, false);
      assert.equal(resUnknown.error, 'Unknown action: non.existent.action');

      // Disabled action
      const disabledRef = {
        current: {
          id: 'action.disabled',
          label: 'Disabled Action',
          disabled: true,
          execute: () => ({ ok: true }),
        },
      };
      engine.registerAction('action.disabled', disabledRef);
      const resDisabled = await engine.execute('action.disabled');
      assert.equal(resDisabled.ok, false);
      assert.equal(resDisabled.error, 'Action is disabled: Disabled Action');
    });

    await st.test('4.4: execute() validates required arguments and catches missing args', async () => {
      const engine = new OpenworkControlEngine();
      const actionWithArgs = {
        id: 'action.submit',
        label: 'Submit Form',
        args: [
          { name: 'query', type: 'string', required: true },
          { name: 'limit', type: 'number', required: false },
        ],
        execute: async (args) => ({ submitted: args }),
      };
      engine.registerAction('action.submit', { current: actionWithArgs });

      // Missing query arg
      const missingRes1 = await engine.execute('action.submit', {});
      assert.equal(missingRes1.ok, false);
      assert.equal(missingRes1.error, 'Missing required argument: query');

      const missingRes2 = await engine.execute('action.submit', null);
      assert.equal(missingRes2.ok, false);
      assert.equal(missingRes2.error, 'Missing required argument: query');

      // Valid args passed
      const successRes = await engine.execute('action.submit', { query: 'SELECT * FROM users' });
      assert.equal(successRes.ok, true);
      assert.deepEqual(successRes.result, { submitted: { query: 'SELECT * FROM users' } });
    });

    await st.test('4.5: execute() catches exceptions thrown in action handlers cleanly', async () => {
      const engine = new OpenworkControlEngine();
      const throwingAction = {
        id: 'action.crash',
        label: 'Crashing Action',
        execute: async () => {
          throw new Error('Database disk I/O error');
        },
      };
      engine.registerAction('action.crash', { current: throwingAction });

      const res = await engine.execute('action.crash');
      assert.equal(res.ok, false);
      assert.equal(res.error, 'Database disk I/O error');

      // Verify engine is not stuck in busy state after crash
      assert.equal(engine.busyActionId, null);
      assert.equal(engine.snapshot().status, 'ready');
    });

    await st.test('4.6: execute() handles user confirmation dialog rejection', async () => {
      const engine = new OpenworkControlEngine({
        confirmHandler: () => false, // User clicks 'Cancel'
      });
      const confirmAction = {
        id: 'action.delete_all',
        label: 'Delete All Records',
        requiresConfirmation: true,
        execute: async () => ({ deleted: true }),
      };
      engine.registerAction('action.delete_all', { current: confirmAction });

      const res = await engine.execute('action.delete_all');
      assert.equal(res.ok, false);
      assert.equal(res.error, 'User cancelled action.');
      assert.equal(engine.busyActionId, null);
    });

    await st.test('4.7: Concurrency Mutex: rejects concurrent execute/command requests during acting', async () => {
      const engine = new OpenworkControlEngine();
      let resolveSlow;
      const slowPromise = new Promise((resolve) => { resolveSlow = resolve; });

      const slowAction = {
        id: 'action.slow',
        label: 'Slow Task',
        kind: 'command',
        execute: async () => {
          await slowPromise;
          return { done: true };
        },
      };
      const fastAction = {
        id: 'action.fast',
        label: 'Fast Task',
        kind: 'command',
        execute: async () => ({ done: true }),
      };

      engine.registerAction('action.slow', { current: slowAction });
      engine.registerAction('action.fast', { current: fastAction });

      // Start slow action in background
      const slowExecPromise = engine.execute('action.slow');
      assert.equal(engine.busyActionId, 'action.slow');
      assert.equal(engine.snapshot().status, 'acting');

      // Attempt second execution while busy
      const conflictRes = await engine.execute('action.fast');
      assert.equal(conflictRes.ok, false);
      assert.equal(conflictRes.error, 'Already acting: action.slow');

      // Attempt command while busy
      const conflictCmd = await engine.command({ id: 'action.fast' });
      assert.equal(conflictCmd.ok, false);
      assert.equal(conflictCmd.code, 'conflict');
      assert.equal(conflictCmd.error, 'Already acting: action.slow');

      // Finish slow action
      resolveSlow();
      const slowResult = await slowExecPromise;
      assert.equal(slowResult.ok, true);
      assert.equal(engine.busyActionId, null);
      assert.equal(engine.snapshot().status, 'ready');
    });

    await st.test('4.8: query() handles non-query actions, missing requests, and failure states', async () => {
      const engine = new OpenworkControlEngine();
      const queryAction = {
        id: 'query.user_info',
        label: 'Get User Info',
        kind: 'query',
        effects: { data: 'read', ui: 'none', external: false },
        execute: async () => ({ user: 'admin', role: 'root' }),
      };
      const cmdAction = {
        id: 'cmd.restart',
        label: 'Restart Server',
        kind: 'command',
        execute: async () => ({ restarted: true }),
      };

      engine.registerAction('query.user_info', { current: queryAction });
      engine.registerAction('cmd.restart', { current: cmdAction });

      // Successful query
      const resQuery = await engine.query({ id: 'query.user_info' });
      assert.equal(resQuery.ok, true);
      assert.deepEqual(resQuery.result, { user: 'admin', role: 'root' });
      assert.deepEqual(resQuery.effects, { data: 'read', ui: 'none', external: false });

      // Querying a command should fail with unavailable
      const resCmd = await engine.query({ id: 'cmd.restart' });
      assert.equal(resCmd.ok, false);
      assert.equal(resCmd.code, 'unavailable');
      assert.equal(resCmd.error, 'Unknown query: cmd.restart');

      // Querying non-existent
      const resMissing = await engine.query({ id: 'non.existent' });
      assert.equal(resMissing.ok, false);
      assert.equal(resMissing.code, 'unavailable');
    });

    await st.test('4.9: command() enforces optimistic expectedRevision check', async () => {
      const engine = new OpenworkControlEngine();
      const cmdAction = {
        id: 'cmd.update_row',
        label: 'Update Table Row',
        kind: 'command',
        sideEffect: 'mutation',
        execute: async () => ({ updated: true }),
      };
      engine.registerAction('cmd.update_row', { current: cmdAction });

      const currentRev = engine.contextRevision;

      // Stale revision mismatch
      const staleRes = await engine.command({
        id: 'cmd.update_row',
        expectedRevision: currentRev - 1,
      });
      assert.equal(staleRes.ok, false);
      assert.equal(staleRes.code, 'conflict');
      assert.ok(staleRes.error.includes('OpenWork context changed from revision'));

      // Matching revision succeeds
      const matchRes = await engine.command({
        id: 'cmd.update_row',
        expectedRevision: currentRev,
      });
      assert.equal(matchRes.ok, true);
      assert.deepEqual(matchRes.effects, { data: 'write', ui: 'none', external: false });
    });

    await st.test('4.10: subscribe() lifecycle and listener dispatch on mutations', () => {
      const engine = new OpenworkControlEngine();
      let listenerCalls = 0;
      let lastReceivedSnapshot = null;

      const unsubscribe = engine.subscribe((snap) => {
        listenerCalls++;
        lastReceivedSnapshot = snap;
      });

      // Immediate call on subscription
      assert.equal(listenerCalls, 1);
      assert.equal(lastReceivedSnapshot.version, CONTROL_API_VERSION);

      // Trigger mutation
      engine.setEnabled(false);
      assert.equal(listenerCalls, 2);
      assert.equal(lastReceivedSnapshot.enabled, false);
      assert.equal(lastReceivedSnapshot.status, 'off');

      engine.setRoute('/deep-research');
      assert.equal(listenerCalls, 3);
      assert.equal(lastReceivedSnapshot.route, '/deep-research');

      // Unsubscribe
      unsubscribe();
      engine.setEnabled(true);
      assert.equal(listenerCalls, 3); // No more calls
    });

    await st.test('4.11: UIControlBridgeSimulator handles endpoints with fuzzed payloads', async () => {
      const engine = new OpenworkControlEngine();
      const bridge = new UIControlBridgeSimulator(engine);

      // GET /health
      const health = await bridge.handleRequest('GET', '/health');
      assert.equal(health.status, 200);
      assert.deepEqual(health.json, { ok: true, app: 'DB-GPT', version: 2 });

      // GET /snapshot
      const snap = await bridge.handleRequest('GET', '/snapshot');
      assert.equal(snap.status, 200);
      assert.equal(snap.json.version, 2);

      // POST /execute with missing actionId
      const badExec = await bridge.handleRequest('POST', '/execute', {});
      assert.equal(badExec.status, 400);
      assert.equal(badExec.json.ok, false);

      // POST /query with missing id
      const badQuery = await bridge.handleRequest('POST', '/query', {});
      assert.equal(badQuery.status, 400);
      assert.equal(badQuery.json.ok, false);

      // POST /command with missing id
      const badCmd = await bridge.handleRequest('POST', '/command', {});
      assert.equal(badCmd.status, 400);
      assert.equal(badCmd.json.ok, false);

      // Unknown route
      const notFound = await bridge.handleRequest('GET', '/unknown_route');
      assert.equal(notFound.status, 404);
    });

    await st.test('4.12: High-Volume Fuzzing Stress Test (500 rapid random mutations)', async () => {
      const engine = new OpenworkControlEngine();
      const actionCount = 20;

      // Register batch of actions
      const cleanups = [];
      for (let i = 0; i < actionCount; i++) {
        const id = `action.fuzz.${i}`;
        const kind = i % 2 === 0 ? 'command' : 'query';
        const cleanup = engine.registerAction(id, {
          current: {
            id,
            label: `Action ${i}`,
            kind,
            sideEffect: i % 3 === 0 ? 'mutation' : 'none',
            execute: async (args) => ({ executed: id, args }),
          },
        });
        cleanups.push(cleanup);
      }

      assert.equal(engine.listActions().length, actionCount);

      // Run 500 randomized operations
      for (let op = 0; op < 500; op++) {
        const rand = Math.random();
        if (rand < 0.3) {
          // Rapid snapshot query
          const snap = engine.snapshot();
          assert.equal(snap.version, CONTROL_API_VERSION);
          assert.ok(snap.actions.length <= actionCount);
        } else if (rand < 0.6) {
          // Random query execution
          const targetId = `action.fuzz.${(op % 10) * 2 + 1}`; // Pick query
          const res = await engine.query({ id: targetId, args: { randVal: op } });
          assert.equal(res.ok, true);
        } else if (rand < 0.8) {
          // Route and enabled toggling
          engine.setRoute(`/route/${op}`);
          engine.setEnabled(op % 2 === 0);
        } else {
          // Monotonic context revision progression
          const prevRev = engine.contextRevision;
          engine.publishContext({
            schemaVersion: 1,
            revision: prevRev,
            capturedAt: new Date().toISOString(),
            screen: { kind: 'other', route: `/fuzz/${op}` },
            conversations: { tabs: [], layout: { kind: 'empty' } },
            chrome: { sidebarOpen: true, applicationMenuVisible: false, rightSidebarExpanded: false },
            execution: { queries: 'parallel', commands: 'serialized', busyCommandId: null, busyActor: null },
            sidePanel: { open: false, ownerSessionId: null, kind: null, tabs: [], activeTabId: null },
            resources: [],
            availableAffordances: [],
            contributions: [],
          });
          assert.ok(engine.contextRevision > prevRev);
        }
      }

      // Cleanup all
      for (const cleanup of cleanups) cleanup();
      assert.equal(engine.listActions().length, 0);
    });

    await st.test('4.13: Rapid 1000 Subscribe/Unsubscribe cycles verify zero memory leak', () => {
      const engine = new OpenworkControlEngine();
      for (let i = 0; i < 1000; i++) {
        let called = 0;
        const unsub = engine.subscribe(() => {
          called++;
        });
        assert.equal(called, 1);
        unsub();
      }
      assert.equal(engine.listeners.size, 0);
    });
  });

});
