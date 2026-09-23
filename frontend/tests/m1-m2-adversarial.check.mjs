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
  OPENWORK_CONTEXT_SCHEMA_VERSION,
  openworkScreenSchema,
  openworkContextSnapshotSchema,
  openworkGuidanceDescriptorSchema,
  openworkFeatureContributionSchema,
  openworkProviderCatalogSchema,
  openworkCapabilityResultSchema,
  CONTROL_API_VERSION,
  SPOTLIGHT_TIMING_MS,
  describeError,
  returnedActionError,
  effectsForSideEffect,
  metadataForAction,
  affordanceForAction,
} = await import('../shell/control/index.ts');

console.log('================================================================');
console.log('⚡ ADVERSARIAL STRESS TEST: DIRECT MODULE VALIDATION (M1 & M2)');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function run(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// 1. Zod schema boundary & adversarial fuzzing
run('A1.1: Malformed and Negative expectedRevision Rejection', () => {
  assert.throws(() => openworkAffordanceRequestSchema.parse({ id: 'test', expectedRevision: -1 }));
  assert.throws(() => openworkAffordanceRequestSchema.parse({ id: 'test', expectedRevision: 1.5 }));
  assert.throws(() => openworkAffordanceRequestSchema.parse({ id: 'test', expectedRevision: '10' }));
  assert.throws(() => openworkAffordanceRequestSchema.parse({ id: '' }));
  assert.throws(() => openworkAffordanceRequestSchema.parse({ id: '   ' }));
});

run('A1.2: Effects Matrix Strict Enum Invariants', () => {
  assert.throws(() => openworkAffordanceEffectsSchema.parse({ data: 'delete', ui: 'none', external: false }));
  assert.throws(() => openworkAffordanceEffectsSchema.parse({ data: 'read', ui: 'modal', external: false }));
  assert.throws(() => openworkAffordanceEffectsSchema.parse({ data: 'read', ui: 'none', external: 'yes' }));
});

run('A1.3: Discriminated Union Strict Result Parsing', () => {
  const validSuccess = openworkAffordanceResultSchema.parse({
    ok: true,
    id: 'query.db',
    result: { count: 100 },
    effects: { data: 'read', ui: 'none', external: false },
  });
  assert.equal(validSuccess.ok, true);

  const validFailure = openworkAffordanceResultSchema.parse({
    ok: false,
    id: 'command.save',
    error: 'Disk full',
    code: 'conflict',
  });
  assert.equal(validFailure.ok, false);

  // Invalid code in failure
  assert.throws(() =>
    openworkAffordanceResultSchema.parse({
      ok: false,
      id: 'command.save',
      error: 'Disk full',
      code: 'internal-error',
    })
  );
});

// 2. Error handling robustness
run('A2.1: describeError Deep Edge-Cases', () => {
  assert.equal(describeError(new Error('Test error')), 'Test error');
  assert.equal(describeError('String error'), 'String error');
  assert.equal(describeError(123), '123');
  assert.equal(describeError(null), 'Unknown error');
  assert.equal(describeError(undefined), 'Unknown error');
  assert.equal(describeError(false), 'Unknown error');
  assert.equal(describeError({}), '[object Object]');
});

run('A2.2: returnedActionError Deep Edge-Cases', () => {
  assert.equal(returnedActionError({ ok: false, error: 'Custom failed' }), 'Custom failed');
  assert.equal(returnedActionError({ ok: false }), 'Action returned an error.');
  assert.equal(returnedActionError({ ok: false, error: '   ' }), 'Action returned an error.');
  assert.equal(returnedActionError({ ok: false, error: 123 }), 'Action returned an error.');
  assert.equal(returnedActionError({ ok: true, error: 'ignored' }), null);
  assert.equal(returnedActionError('not an object'), null);
  assert.equal(returnedActionError(null), null);
});

// 3. Action metadata and affordance projection under varying states
run('A3.1: metadataForAction and affordanceForAction Projection', () => {
  const registered = {
    id: 'test.export',
    order: 42,
    token: Symbol('test'),
    ref: {
      current: {
        id: 'test.export',
        label: 'Export Data',
        description: 'Export database rows to CSV',
        kind: 'command',
        sideEffect: 'external',
        requiresConfirmation: true,
        args: [{ name: 'format', type: 'string', required: true }],
        disabled: false,
        execute: () => ({ ok: true }),
      },
    },
  };

  const metaIdle = metadataForAction(registered, null);
  assert.equal(metaIdle.id, 'test.export');
  assert.equal(metaIdle.busy, false);
  assert.equal(metaIdle.effects.external, true);
  assert.equal(metaIdle.requiresConfirmation, true);

  const affIdle = affordanceForAction(metaIdle);
  assert.equal(affIdle.id, 'test.export');
  assert.equal(affIdle.availability.enabled, true);
  assert.equal(affIdle.confirmation, 'destructive');

  const metaBusy = metadataForAction(registered, 'test.export');
  assert.equal(metaBusy.busy, true);
  const affBusy = affordanceForAction(metaBusy);
  assert.equal(affBusy.availability.enabled, false);
});

console.log('\n================================================================');
console.log(`📊 CHECK RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('================================================================\n');

if (failed > 0) process.exit(1);
