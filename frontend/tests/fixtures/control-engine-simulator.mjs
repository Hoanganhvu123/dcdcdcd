import { z } from 'zod';

export const OPENWORK_AFFORDANCE_SCHEMA_VERSION = 1;
export const OPENWORK_CONTEXT_SCHEMA_VERSION = 1;
export const CONTROL_API_VERSION = 2;

export const SPOTLIGHT_TIMING_MS = Object.freeze({
  missingTarget: 80,
  scrollIntoView: 180,
  target: 260,
  press: 130,
  release: 80,
  done: 280,
});

// Zod Schemas
export const openworkAffordanceKindSchema = z.enum(['query', 'command', 'guidance']);
export const openworkProviderKindSchema = z.enum(['builtin', 'extension', 'mcp', 'connect']);

export const openworkProviderRefSchema = z.object({
  id: z.string().trim().min(1),
  kind: openworkProviderKindSchema,
});

export const openworkAffordanceArgumentSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'unknown']),
  required: z.boolean(),
  description: z.string().trim().min(1).optional(),
});

export const openworkAffordanceEffectsSchema = z.object({
  data: z.enum(['none', 'read', 'write']),
  ui: z.enum(['none', 'focus', 'navigate', 'layout', 'dialog']),
  external: z.boolean(),
});

export const openworkAffordanceAvailabilitySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(1).optional(),
});

export const openworkAffordanceExecutorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('openwork') }),
  z.object({
    kind: z.literal('tool'),
    tool: z.string().trim().min(1),
  }),
]);

export const openworkAffordanceDescriptorSchema = z.object({
  id: z.string().trim().min(1),
  kind: openworkAffordanceKindSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  provider: openworkProviderRefSchema,
  arguments: z.array(openworkAffordanceArgumentSchema),
  effects: openworkAffordanceEffectsSchema,
  confirmation: z.enum(['never', 'destructive', 'always']),
  availability: openworkAffordanceAvailabilitySchema,
  executor: openworkAffordanceExecutorSchema,
});

export const openworkAffordanceRequestSchema = z.object({
  id: z.string().trim().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  actor: z.string().trim().min(1).optional(),
});

const openworkAffordanceSuccessSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
  result: z.unknown().optional(),
  revision: z.number().int().nonnegative().optional(),
  effects: openworkAffordanceEffectsSchema,
});

const openworkAffordanceFailureSchema = z.object({
  ok: z.literal(false),
  id: z.string(),
  error: z.string(),
  code: z.enum(['unavailable', 'invalid-args', 'conflict', 'failed']),
  revision: z.number().int().nonnegative().optional(),
});

export const openworkAffordanceResultSchema = z.discriminatedUnion('ok', [
  openworkAffordanceSuccessSchema,
  openworkAffordanceFailureSchema,
]);

// Context Schemas
export const openworkSessionRefSchema = z.object({
  workspaceId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  title: z.string().optional(),
});

export const openworkScreenSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('conversation'),
    route: z.string(),
    workspaceId: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('settings'),
    route: z.string(),
    workspaceId: z.string().optional(),
    panel: z.string(),
  }),
  z.object({
    kind: z.literal('other'),
    route: z.string(),
  }),
]);

export const openworkConversationLayoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('empty') }),
  z.object({
    kind: z.literal('single'),
    sessionId: z.string(),
  }),
  z.object({
    kind: z.literal('split'),
    primarySessionId: z.string(),
    secondarySessionId: z.string(),
    focused: z.enum(['primary', 'secondary']),
  }),
]);

export const openworkPanelTabSchema = z.object({
  id: z.string(),
  kind: z.enum(['browser', 'artifact']),
  label: z.string(),
  url: z.string().optional(),
  status: z.enum(['loading', 'ready']).optional(),
});

export const openworkResourceDescriptorSchema = z.object({
  ref: z.string().trim().min(1),
  kind: z.enum(['workspace', 'session', 'screen', 'side-panel', 'settings']),
  title: z.string(),
  provider: openworkProviderRefSchema,
  state: z.record(z.string(), z.unknown()),
});

export const openworkGuidanceDescriptorSchema = z.object({
  ref: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  provider: openworkProviderRefSchema,
  loading: z.enum(['eager', 'catalog', 'on-demand']),
});

export const openworkFeatureContributionSchema = z.object({
  featureId: z.string().trim().min(1),
  provider: openworkProviderRefSchema,
  affordances: z.array(openworkAffordanceDescriptorSchema),
  guidance: z.array(openworkGuidanceDescriptorSchema),
});

export const openworkProviderCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  contributions: z.array(openworkFeatureContributionSchema),
});

export const openworkCapabilityResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('completed'),
    data: z.unknown(),
    additionalContext: z.array(z.string()).optional(),
  }),
  z.object({
    status: z.literal('guidance'),
    instructions: z.array(z.string()),
  }),
  z.object({
    status: z.literal('requires-user-action'),
    message: z.string(),
    action: z.string().optional(),
  }),
  z.object({
    status: z.literal('failed'),
    error: z.string(),
    retryable: z.boolean(),
  }),
]);

export const openworkContextSnapshotSchema = z.object({
  schemaVersion: z.literal(OPENWORK_CONTEXT_SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  capturedAt: z.string(),
  screen: openworkScreenSchema,
  conversations: z.object({
    tabs: z.array(openworkSessionRefSchema),
    layout: openworkConversationLayoutSchema,
  }),
  chrome: z.object({
    sidebarOpen: z.boolean(),
    applicationMenuVisible: z.boolean(),
    rightSidebarExpanded: z.boolean(),
  }),
  execution: z.object({
    queries: z.literal('parallel'),
    commands: z.literal('serialized'),
    busyCommandId: z.string().nullable(),
    busyActor: z.string().nullable(),
  }),
  sidePanel: z.object({
    open: z.boolean(),
    ownerSessionId: z.string().nullable(),
    kind: z.enum(['panel', 'extensions', 'voice']).nullable(),
    tabs: z.array(openworkPanelTabSchema),
    activeTabId: z.string().nullable(),
  }),
  resources: z.array(openworkResourceDescriptorSchema),
  availableAffordances: z.array(openworkAffordanceDescriptorSchema),
  contributions: z.array(openworkFeatureContributionSchema),
});

// Effects matrix helper
export function effectsForSideEffect(sideEffect) {
  if (sideEffect === 'navigation') {
    return { data: 'none', ui: 'navigate', external: false };
  }
  if (sideEffect === 'mutation') {
    return { data: 'write', ui: 'none', external: false };
  }
  if (sideEffect === 'external') {
    return { data: 'none', ui: 'none', external: true };
  }
  return { data: 'none', ui: 'none', external: false };
}

export function describeError(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

export function returnedActionError(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.ok !== false) return null;
  return typeof result.error === 'string' && result.error.trim()
    ? result.error
    : 'Action returned an error.';
}

export function metadataForAction(registered, busyActionId) {
  const action = registered.ref.current;
  const sideEffect = action?.sideEffect ?? 'none';
  return {
    id: registered.id,
    label: action?.label ?? registered.id,
    description: action?.description,
    kind: action?.kind ?? 'command',
    effects: action?.effects ?? effectsForSideEffect(sideEffect),
    sideEffect,
    requiresConfirmation: action?.requiresConfirmation === true,
    requiresArgs: action?.requiresArgs === true,
    hasPreviewArgs: action?.previewArgs !== undefined,
    previewArgs: action?.previewArgs,
    args: action?.args,
    disabled: action?.disabled === true,
    busy: busyActionId === registered.id,
  };
}

export function affordanceForAction(action) {
  return {
    id: action.id,
    kind: action.kind,
    title: action.label,
    description: action.description ?? action.label,
    provider: { id: 'openwork-ui', kind: 'builtin' },
    arguments: (action.args ?? []).map((argument) => ({
      name: argument.name,
      type: argument.type ?? 'unknown',
      required: argument.required === true,
      ...(argument.description ? { description: argument.description } : {}),
    })),
    effects: action.effects,
    confirmation: action.requiresConfirmation ? 'destructive' : 'never',
    availability: {
      enabled: !action.disabled && !action.busy,
      ...(action.disabled ? { reason: 'This action is not available in the current app state.' } : {}),
    },
    executor: { kind: 'openwork' },
  };
}

// Headless Simulator Engine
export class OpenworkControlEngine {
  constructor(initialOptions = {}) {
    this.route = initialOptions.route || '/chat/session-1';
    this.enabled = initialOptions.enabled ?? true;
    this.narration = initialOptions.narration || 'Ready. A controller can inspect and run visible actions.';
    this.busyActionId = null;
    this.busyActor = null;
    this.contextRevision = 0;
    this.nextOrder = 1;
    this.actions = new Map();
    this.listeners = new Set();
    this.publishedContext = null;
    this.confirmHandler = initialOptions.confirmHandler || (() => true);
    this.spotlightHistory = [];
    this.spotlightRunId = 0;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.narration = 'Control mode is off.';
    } else if (this.narration === 'Control mode is off.') {
      this.narration = 'Ready. A controller can inspect and run visible actions.';
    }
    this._notifyListeners();
  }

  setRoute(route) {
    this.route = route;
    this._notifyListeners();
  }

  registerAction(actionId, actionRef) {
    const token = Symbol(actionId);
    const previous = this.actions.get(actionId);
    this.actions.set(actionId, {
      id: actionId,
      order: previous?.order ?? this.nextOrder++,
      token,
      ref: actionRef,
    });
    this.contextRevision += 1;
    this._notifyListeners();

    return () => {
      const current = this.actions.get(actionId);
      if (current?.token === token) {
        this.actions.delete(actionId);
        this.contextRevision += 1;
        this._notifyListeners();
      }
    };
  }

  listActions() {
    return Array.from(this.actions.values())
      .sort((a, b) => a.order - b.order)
      .map((action) => metadataForAction(action, this.busyActionId));
  }

  snapshot() {
    const status = !this.enabled ? 'off' : this.busyActionId ? 'acting' : 'ready';
    return {
      version: CONTROL_API_VERSION,
      enabled: this.enabled,
      route: this.route,
      status,
      busyActionId: this.busyActionId,
      narration: this.narration,
      actions: this.listActions(),
    };
  }

  publishContext(context) {
    if (this.publishedContext === context) return;
    this.publishedContext = context;
    this.contextRevision += 1;
    this._notifyListeners();
  }

  context() {
    const availableAffordances = this.listActions().map(affordanceForAction);
    const published = this.publishedContext;
    const revision = this.contextRevision;
    if (published) {
      return {
        ...published,
        revision,
        capturedAt: new Date().toISOString(),
        availableAffordances,
        execution: {
          ...published.execution,
          busyCommandId: this.busyActionId,
          busyActor: this.busyActor,
        },
      };
    }
    return {
      schemaVersion: OPENWORK_CONTEXT_SCHEMA_VERSION,
      revision,
      capturedAt: new Date().toISOString(),
      screen: { kind: 'other', route: this.route },
      conversations: { tabs: [], layout: { kind: 'empty' } },
      chrome: {
        sidebarOpen: true,
        applicationMenuVisible: false,
        rightSidebarExpanded: false,
      },
      execution: {
        queries: 'parallel',
        commands: 'serialized',
        busyCommandId: this.busyActionId,
        busyActor: this.busyActor,
      },
      sidePanel: {
        open: false,
        ownerSessionId: null,
        kind: null,
        tabs: [],
        activeTabId: null,
      },
      resources: [{
        ref: `screen:${this.route}`,
        kind: 'screen',
        title: 'DB-GPT OpenWork',
        provider: { id: 'openwork-ui', kind: 'builtin' },
        state: { kind: 'other', route: this.route },
      }],
      availableAffordances,
      contributions: [],
    };
  }

  async _playChoreography(action, runId) {
    const target = action.targetRef?.current;
    if (!target) {
      this.spotlightHistory.push({ runId, phase: 'missingTarget', duration: SPOTLIGHT_TIMING_MS.missingTarget });
      return;
    }
    this.spotlightHistory.push({ runId, phase: 'scrollIntoView', duration: SPOTLIGHT_TIMING_MS.scrollIntoView });
    this.spotlightHistory.push({ runId, phase: 'target', duration: SPOTLIGHT_TIMING_MS.target });
    this.spotlightHistory.push({ runId, phase: 'press', duration: SPOTLIGHT_TIMING_MS.press });
    this.spotlightHistory.push({ runId, phase: 'release', duration: SPOTLIGHT_TIMING_MS.release });
  }

  async execute(actionId, args) {
    const registered = this.actions.get(actionId);
    const action = registered?.ref.current;
    if (!registered || !action) return { ok: false, actionId, error: `Unknown action: ${actionId}` };
    if (action.disabled) return { ok: false, actionId, error: `Action is disabled: ${action.label}` };
    if (this.busyActionId) {
      const actor = this.busyActor ? ` for ${this.busyActor}` : '';
      return { ok: false, actionId, error: `Already acting: ${this.busyActionId}${actor}` };
    }

    if (action.requiresConfirmation) {
      const confirmed = this.confirmHandler(action);
      if (!confirmed) return { ok: false, actionId, error: 'User cancelled action.' };
    }

    // Argument validation if schema/args defined
    if (action.args && action.args.length > 0) {
      const effective = args === undefined ? action.previewArgs : args;
      for (const expectedArg of action.args) {
        if (expectedArg.required) {
          if (!effective || typeof effective !== 'object' || !(expectedArg.name in effective) || effective[expectedArg.name] === undefined || effective[expectedArg.name] === null) {
            return { ok: false, actionId, error: `Missing required argument: ${expectedArg.name}` };
          }
        }
      }
    }

    const runId = ++this.spotlightRunId;
    this.busyActionId = action.id;
    this.contextRevision += 1;
    this.setEnabled(true);
    this.narration = `Moving to ${action.label}…`;
    this._notifyListeners();

    try {
      await this._playChoreography(action, runId);
      this.narration = `Running ${action.label}…`;
      this._notifyListeners();

      const effectiveArgs = args === undefined ? action.previewArgs : args;
      const result = await action.execute(effectiveArgs, {
        setNarration: (text) => {
          this.narration = text;
          this._notifyListeners();
        },
      });

      const resultError = returnedActionError(result);
      if (resultError) {
        this.narration = `Could not ${action.label}: ${resultError}`;
        this._notifyListeners();
        return { ok: false, actionId, error: resultError };
      }

      this.narration = `Done: ${action.label}`;
      this._notifyListeners();
      return { ok: true, actionId, result };
    } catch (error) {
      const message = describeError(error);
      this.narration = `Could not ${action.label}: ${message}`;
      this._notifyListeners();
      return { ok: false, actionId, error: message };
    } finally {
      if (this.busyActionId === action.id) {
        this.busyActionId = null;
      }
      this.contextRevision += 1;
      this._notifyListeners();
    }
  }

  async query(request) {
    const action = this.actions.get(request.id)?.ref.current;
    const revision = this.contextRevision;
    if (!action || action.kind !== 'query') {
      return {
        ok: false,
        id: request.id,
        error: `Unknown query: ${request.id}`,
        code: 'unavailable',
        revision,
      };
    }
    if (action.disabled) {
      return {
        ok: false,
        id: request.id,
        error: `Query is disabled: ${action.label}`,
        code: 'unavailable',
        revision,
      };
    }
    try {
      const effectiveArgs = request.args === undefined ? action.previewArgs : request.args;
      const result = await action.execute(effectiveArgs, { setNarration: () => undefined });
      const resultError = returnedActionError(result);
      if (resultError) {
        return {
          ok: false,
          id: request.id,
          error: resultError,
          code: 'failed',
          revision,
        };
      }
      return {
        ok: true,
        id: request.id,
        result,
        revision,
        effects: action.effects ?? { data: 'read', ui: 'none', external: false },
      };
    } catch (error) {
      return {
        ok: false,
        id: request.id,
        error: describeError(error),
        code: 'failed',
        revision,
      };
    }
  }

  async command(request) {
    const action = this.actions.get(request.id)?.ref.current;
    const revision = this.contextRevision;
    if (!action || action.kind === 'query') {
      return {
        ok: false,
        id: request.id,
        error: `Unknown command: ${request.id}`,
        code: 'unavailable',
        revision,
      };
    }
    if (this.busyActionId) {
      const actor = this.busyActor ? ` for ${this.busyActor}` : '';
      return {
        ok: false,
        id: request.id,
        error: `Already acting: ${this.busyActionId}${actor}`,
        code: 'conflict',
        revision,
      };
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
    const result = await this.execute(request.id, request.args);
    if (!this.busyActionId) {
      this.busyActor = null;
    }

    if (!result.ok) {
      const isConflict = result.error.startsWith('Already acting:');
      const isInvalidArgs = result.error.startsWith('Missing required argument:') || result.error.includes('Invalid argument');
      return {
        ok: false,
        id: request.id,
        error: result.error,
        code: isConflict ? 'conflict' : isInvalidArgs ? 'invalid-args' : 'failed',
        revision: this.contextRevision,
      };
    }

    const sideEffect = action.sideEffect ?? 'none';
    return {
      ok: true,
      id: request.id,
      result: result.result,
      revision: this.contextRevision,
      effects: action.effects ?? effectsForSideEffect(sideEffect),
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  _notifyListeners() {
    const snap = this.snapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

// UI Control Bridge HTTP Dispatch Simulator
export class UIControlBridgeSimulator {
  constructor(engine) {
    this.engine = engine;
  }

  async handleRequest(method, pathname, body = null) {
    if (method === 'GET' && pathname === '/health') {
      return { status: 200, json: { ok: true, app: 'DB-GPT', version: 2 } };
    }
    if (method === 'GET' && pathname === '/snapshot') {
      return { status: 200, json: this.engine.snapshot() };
    }
    if (method === 'GET' && pathname === '/actions') {
      return { status: 200, json: this.engine.listActions() };
    }
    if (method === 'GET' && pathname === '/context') {
      return { status: 200, json: this.engine.context() };
    }
    if (method === 'POST' && pathname === '/execute') {
      if (!body || !body.actionId) {
        return { status: 400, json: { ok: false, error: 'Missing actionId in body' } };
      }
      const result = await this.engine.execute(body.actionId, body.args);
      return { status: result.ok ? 200 : 400, json: result };
    }
    if (method === 'POST' && pathname === '/query') {
      if (!body || !body.id) {
        return { status: 400, json: { ok: false, error: 'Missing query id in body' } };
      }
      const result = await this.engine.query(body);
      return { status: result.ok ? 200 : 400, json: result };
    }
    if (method === 'POST' && pathname === '/command') {
      if (!body || !body.id) {
        return { status: 400, json: { ok: false, error: 'Missing command id in body' } };
      }
      const result = await this.engine.command(body);
      const statusCode = result.ok ? 200 : result.code === 'conflict' ? 409 : 400;
      return { status: statusCode, json: result };
    }
    return { status: 404, json: { error: `Not found: ${method} ${pathname}` } };
  }
}
