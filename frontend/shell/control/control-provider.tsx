// Adapted from OpenWork (MIT) — Copyright (c) 2026 Different AI
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  OpenworkAffordanceDescriptor,
  OpenworkAffordanceEffects,
  OpenworkAffordanceRequest,
  OpenworkAffordanceResult,
} from './openwork-affordance';
import type { OpenworkContextSnapshot } from './openwork-context';

export type OpenworkControlSideEffect = 'none' | 'navigation' | 'mutation' | 'external';

export type OpenworkControlActionArg = {
  name: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';
  required?: boolean;
  description?: string;
};

export type OpenworkControlActionMetadata = {
  id: string;
  label: string;
  description?: string;
  kind: 'query' | 'command';
  effects: OpenworkAffordanceEffects;
  sideEffect: OpenworkControlSideEffect;
  requiresConfirmation: boolean;
  requiresArgs: boolean;
  hasPreviewArgs: boolean;
  previewArgs?: unknown;
  args?: OpenworkControlActionArg[];
  disabled: boolean;
  busy: boolean;
};

export type OpenworkControlSnapshot = {
  version: number;
  enabled: boolean;
  route: string;
  status: 'off' | 'ready' | 'acting';
  busyActionId: string | null;
  narration: string;
  actions: OpenworkControlActionMetadata[];
};

export type OpenworkControlResult =
  | { ok: true; actionId: string; result?: unknown }
  | { ok: false; actionId: string; error: string };

export type OpenworkControlHelpers = {
  setNarration: (text: string) => void;
};

export type OpenworkControlTargetRef = {
  readonly current: HTMLElement | null;
};

export type OpenworkControlAction = {
  id: string;
  label: string;
  description?: string;
  kind?: 'query' | 'command';
  effects?: OpenworkAffordanceEffects;
  sideEffect?: OpenworkControlSideEffect;
  requiresConfirmation?: boolean;
  requiresArgs?: boolean;
  args?: OpenworkControlActionArg[];
  previewArgs?: unknown;
  disabled?: boolean;
  targetRef?: OpenworkControlTargetRef;
  execute: (args: unknown, helpers: OpenworkControlHelpers) => unknown | Promise<unknown>;
};

export type ControlActionRef = {
  readonly current: OpenworkControlAction | null;
};

export type RegisteredAction = {
  id: string;
  order: number;
  token: symbol;
  ref: ControlActionRef;
};

export type SpotlightState = {
  visible: boolean;
  phase: 'target' | 'press';
  rect: { x: number; y: number; width: number; height: number } | null;
};

export type OpenworkControlContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  route: string;
  narration: string;
  busyActionId: string | null;
  actions: OpenworkControlActionMetadata[];
  registerAction: (actionId: string, actionRef: ControlActionRef) => () => void;
  executeAction: (actionId: string, args?: unknown) => Promise<OpenworkControlResult>;
  publishContext: (context: OpenworkContextSnapshot) => void;
  snapshot: () => OpenworkControlSnapshot;
};

export type OpenworkControlAPI = {
  version: number;
  snapshot: () => OpenworkControlSnapshot;
  listActions: () => OpenworkControlActionMetadata[];
  execute: (actionId: string, args?: unknown) => Promise<OpenworkControlResult>;
  context: () => OpenworkContextSnapshot;
  query: (request: OpenworkAffordanceRequest) => Promise<OpenworkAffordanceResult>;
  command: (request: OpenworkAffordanceRequest) => Promise<OpenworkAffordanceResult>;
  setEnabled: (enabled: boolean) => void;
  subscribe: (listener: (snapshot: OpenworkControlSnapshot) => void) => () => void;
};

declare global {
  interface Window {
    __openworkControl?: OpenworkControlAPI;
  }
}

export const CONTROL_API_VERSION = 2;

export const OpenworkControlContext = createContext<OpenworkControlContextValue | null>(null);

export const SPOTLIGHT_TIMING_MS = Object.freeze({
  missingTarget: 80,
  scrollIntoView: 180,
  target: 260,
  press: 130,
  release: 80,
  done: 280,
});

export const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

export function returnedActionError(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const payload = result as { ok?: unknown; error?: unknown };
  if (payload.ok !== false) return null;
  return typeof payload.error === 'string' && payload.error.trim()
    ? payload.error
    : 'Action returned an error.';
}

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function effectsForSideEffect(sideEffect: OpenworkControlSideEffect): OpenworkAffordanceEffects {
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

export function metadataForAction(
  registered: RegisteredAction,
  busyActionId: string | null,
): OpenworkControlActionMetadata {
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

export function affordanceForAction(action: OpenworkControlActionMetadata): OpenworkAffordanceDescriptor {
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

export function ControlModeSpotlight({ spotlight }: { spotlight: SpotlightState }) {
  const rect = spotlight.rect;
  if (!spotlight.visible || !rect) return null;

  const pad = spotlight.phase === 'press' ? 8 : 12;
  return (
    <div
      className="pointer-events-none fixed z-[9998] rounded-[18px] bg-[rgba(var(--dls-accent-rgb,23,131,255),0.1)] shadow-[0_0_0_9999px_rgba(7,10,18,0.08),0_0_36px_rgba(var(--dls-accent-rgb,23,131,255),0.32),inset_0_0_0_1px_rgba(var(--dls-accent-rgb,23,131,255),0.24)] transition-all duration-200 ease-out"
      style={{
        left: `${rect.x - pad}px`,
        top: `${rect.y - pad}px`,
        width: `${rect.width + pad * 2}px`,
        height: `${rect.height + pad * 2}px`,
        transform: spotlight.phase === 'press' ? 'scale(0.985)' : 'scale(1)',
      }}
    />
  );
}

export function OpenworkControlProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const actionsRef = useRef(new Map<string, RegisteredAction>());
  const listenersRef = useRef(new Set<(snapshot: OpenworkControlSnapshot) => void>());
  const contextRef = useRef<OpenworkContextSnapshot | null>(null);
  const contextRevisionRef = useRef(0);
  const nextOrderRef = useRef(1);
  const [version, setVersion] = useState(0);
  const [enabledState, setEnabledState] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [narration, setNarration] = useState('Control mode is off.');
  const [spotlight, setSpotlight] = useState<SpotlightState>({ visible: false, phase: 'target', rect: null });
  const busyActionIdRef = useRef<string | null>(null);
  const busyActorRef = useRef<string | null>(null);
  const spotlightRunRef = useRef(0);

  const route = `${location.pathname}${location.search}${location.hash}`;
  const enabled = enabledState;
  const status: OpenworkControlSnapshot['status'] = !enabled ? 'off' : busyActionId ? 'acting' : 'ready';

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
  }, []);

  const listActionMetadata = useCallback((nextBusyActionId = busyActionId) => {
    return Array.from(actionsRef.current.values())
      .sort((left, right) => left.order - right.order)
      .map((action) => metadataForAction(action, nextBusyActionId));
  }, [busyActionId, version]);

  const actions = useMemo(() => {
    return listActionMetadata();
  }, [listActionMetadata]);

  const snapshot = useCallback((): OpenworkControlSnapshot => ({
    version: CONTROL_API_VERSION,
    enabled,
    route,
    status,
    busyActionId,
    narration,
    actions: listActionMetadata(),
  }), [busyActionId, enabled, listActionMetadata, narration, route, status]);

  const publishContext = useCallback((context: OpenworkContextSnapshot) => {
    if (contextRef.current === context) return;
    contextRef.current = context;
    contextRevisionRef.current += 1;
  }, []);

  const contextSnapshot = useCallback((): OpenworkContextSnapshot => {
    const availableAffordances = listActionMetadata().map(affordanceForAction);
    const published = contextRef.current;
    const revision = contextRevisionRef.current;
    if (published) {
      return {
        ...published,
        revision,
        capturedAt: new Date().toISOString(),
        availableAffordances,
        execution: {
          ...published.execution,
          busyCommandId: busyActionId,
          busyActor: busyActorRef.current,
        },
      };
    }
    return {
      schemaVersion: 1,
      revision,
      capturedAt: new Date().toISOString(),
      screen: { kind: 'other', route },
      conversations: { tabs: [], layout: { kind: 'empty' } },
      chrome: {
        sidebarOpen: true,
        applicationMenuVisible: false,
        rightSidebarExpanded: false,
      },
      execution: {
        queries: 'parallel',
        commands: 'serialized',
        busyCommandId: busyActionId,
        busyActor: busyActorRef.current,
      },
      sidePanel: {
        open: false,
        ownerSessionId: null,
        kind: null,
        tabs: [],
        activeTabId: null,
      },
      resources: [{
        ref: `screen:${route}`,
        kind: 'screen',
        title: 'DB-GPT OpenWork',
        provider: { id: 'openwork-ui', kind: 'builtin' },
        state: { kind: 'other', route },
      }],
      availableAffordances,
      contributions: [],
    };
  }, [busyActionId, listActionMetadata, route]);

  const registerAction = useCallback((actionId: string, actionRef: ControlActionRef) => {
    const token = Symbol(actionId);
    const previous = actionsRef.current.get(actionId);
    actionsRef.current.set(actionId, {
      id: actionId,
      order: previous?.order ?? nextOrderRef.current++,
      token,
      ref: actionRef,
    });
    contextRevisionRef.current += 1;
    setVersion((current) => current + 1);

    return () => {
      const current = actionsRef.current.get(actionId);
      if (current?.token === token) {
        actionsRef.current.delete(actionId);
        contextRevisionRef.current += 1;
        setVersion((value) => value + 1);
      }
    };
  }, []);

  const playTargetChoreography = useCallback(async (action: OpenworkControlAction, runId: number) => {
    if (!isBrowser()) return;
    const stillCurrent = () => spotlightRunRef.current === runId;
    const target = action.targetRef?.current;
    if (!target) {
      await wait(SPOTLIGHT_TIMING_MS.missingTarget);
      return;
    }

    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    await wait(SPOTLIGHT_TIMING_MS.scrollIntoView);
    if (!stillCurrent() || !target.isConnected) return;
    const rect = target.getBoundingClientRect();
    setSpotlight({
      visible: true,
      phase: 'target',
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
    await wait(SPOTLIGHT_TIMING_MS.target);
    if (!stillCurrent()) return;
    setSpotlight((current) => ({ ...current, phase: 'press' }));
    await wait(SPOTLIGHT_TIMING_MS.press);
    if (!stillCurrent()) return;
    setSpotlight((current) => ({ ...current, phase: 'target' }));
    await wait(SPOTLIGHT_TIMING_MS.release);
  }, []);

  const executeAction = useCallback(async (actionId: string, args?: unknown): Promise<OpenworkControlResult> => {
    const registered = actionsRef.current.get(actionId);
    const action = registered?.ref.current;
    if (!registered || !action) return { ok: false, actionId, error: `Unknown action: ${actionId}` };
    if (action.disabled) return { ok: false, actionId, error: `Action is disabled: ${action.label}` };
    if (busyActionIdRef.current) {
      const actor = busyActorRef.current ? ` for ${busyActorRef.current}` : '';
      return { ok: false, actionId, error: `Already acting: ${busyActionIdRef.current}${actor}` };
    }

    if (action.requiresConfirmation && isBrowser()) {
      const confirmed = window.confirm(`Allow Control Mode to ${action.label}?`);
      if (!confirmed) return { ok: false, actionId, error: 'User cancelled action.' };
    }

    const runId = spotlightRunRef.current + 1;
    spotlightRunRef.current = runId;
    busyActionIdRef.current = action.id;
    contextRevisionRef.current += 1;
    setEnabled(true);
    setBusyActionId(action.id);
    setNarration(`Moving to ${action.label}…`);

    try {
      await playTargetChoreography(action, runId);
      setNarration(`Running ${action.label}…`);
      const effectiveArgs = args === undefined ? action.previewArgs : args;
      const result = await action.execute(effectiveArgs, { setNarration });
      const resultError = returnedActionError(result);
      if (resultError) {
        setNarration(`Could not ${action.label}: ${resultError}`);
        if (spotlightRunRef.current === runId) {
          setSpotlight({ visible: false, phase: 'target', rect: null });
        }
        return { ok: false, actionId, error: resultError };
      }
      setNarration(`Done: ${action.label}`);
      await wait(SPOTLIGHT_TIMING_MS.done);
      if (spotlightRunRef.current === runId) {
        setSpotlight({ visible: false, phase: 'target', rect: null });
      }
      return { ok: true, actionId, result };
    } catch (error) {
      const message = describeError(error);
      setNarration(`Could not ${action.label}: ${message}`);
      if (spotlightRunRef.current === runId) {
        setSpotlight({ visible: false, phase: 'target', rect: null });
      }
      return { ok: false, actionId, error: message };
    } finally {
      if (busyActionIdRef.current === action.id) busyActionIdRef.current = null;
      contextRevisionRef.current += 1;
      setBusyActionId(null);
    }
  }, [playTargetChoreography, setEnabled]);

  const queryAffordance = useCallback(async (
    request: OpenworkAffordanceRequest,
  ): Promise<OpenworkAffordanceResult> => {
    const action = actionsRef.current.get(request.id)?.ref.current;
    const revision = contextRevisionRef.current;
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
  }, []);

  const executeCommand = useCallback(async (
    request: OpenworkAffordanceRequest,
  ): Promise<OpenworkAffordanceResult> => {
    const action = actionsRef.current.get(request.id)?.ref.current;
    const revision = contextRevisionRef.current;
    if (!action || action.kind === 'query') {
      return {
        ok: false,
        id: request.id,
        error: `Unknown command: ${request.id}`,
        code: 'unavailable',
        revision,
      };
    }
    if (busyActionIdRef.current) {
      const actor = busyActorRef.current ? ` for ${busyActorRef.current}` : '';
      return {
        ok: false,
        id: request.id,
        error: `Already acting: ${busyActionIdRef.current}${actor}`,
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
    busyActorRef.current = request.actor ?? null;
    const result = await executeAction(request.id, request.args);
    if (!busyActionIdRef.current) busyActorRef.current = null;
    if (!result.ok) {
      return {
        ok: false,
        id: request.id,
        error: result.error,
        code: result.error.startsWith('Already acting:') ? 'conflict' : 'failed',
        revision: contextRevisionRef.current,
      };
    }
    const sideEffect = action.sideEffect ?? 'none';
    return {
      ok: true,
      id: request.id,
      result: result.result,
      revision: contextRevisionRef.current,
      effects: action.effects ?? effectsForSideEffect(sideEffect),
    };
  }, [executeAction]);

  const value = useMemo<OpenworkControlContextValue>(() => ({
    enabled,
    setEnabled,
    route,
    narration,
    busyActionId,
    actions,
    registerAction,
    executeAction,
    publishContext,
    snapshot,
  }), [
    actions,
    busyActionId,
    enabled,
    executeAction,
    narration,
    publishContext,
    registerAction,
    route,
    setEnabled,
    snapshot,
  ]);

  useEffect(() => {
    if (!enabled) {
      setNarration('Control mode is off.');
    } else if (narration === 'Control mode is off.') {
      setNarration('Ready. A controller can inspect and run visible actions.');
    }
  }, [enabled, narration]);

  useEffect(() => {
    if (!isBrowser()) return;

    const api: OpenworkControlAPI = {
      version: CONTROL_API_VERSION,
      snapshot,
      listActions: () => snapshot().actions,
      execute: executeAction,
      context: contextSnapshot,
      query: queryAffordance,
      command: executeCommand,
      setEnabled,
      subscribe(listener) {
        listenersRef.current.add(listener);
        listener(snapshot());
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    };

    window.__openworkControl = api;
    return () => {
      if (window.__openworkControl === api) {
        delete window.__openworkControl;
      }
    };
  }, [contextSnapshot, executeAction, executeCommand, queryAffordance, setEnabled, snapshot]);

  useEffect(() => {
    busyActionIdRef.current = busyActionId;
  }, [busyActionId]);

  useEffect(() => {
    const next = snapshot();
    listenersRef.current.forEach((listener) => listener(next));
  }, [snapshot, version]);

  return (
    <OpenworkControlContext.Provider value={value}>
      {children}
      <ControlModeSpotlight spotlight={spotlight} />
    </OpenworkControlContext.Provider>
  );
}

export function useOpenworkControl() {
  return useContext(OpenworkControlContext);
}

export function usePublishOpenworkContext(context: OpenworkContextSnapshot) {
  const control = useOpenworkControl();
  const publishContext = control?.publishContext;

  useEffect(() => {
    publishContext?.(context);
  }, [context, publishContext]);
}

export function useControlAction(action: OpenworkControlAction | null | false | undefined) {
  const control = useOpenworkControl();
  const registerAction = control?.registerAction;
  const latestActionRef = useRef<OpenworkControlAction | null>(action || null);
  latestActionRef.current = action || null;
  const actionId = action ? action.id : null;

  useEffect(() => {
    if (!registerAction || !actionId) return undefined;
    return registerAction(actionId, latestActionRef);
  }, [actionId, registerAction]);
}

/**
 * Register a dynamic list of control actions. Scales to an arbitrary,
 * changing number of actions without violating rules of hooks.
 */
export function useControlActions(actions: readonly OpenworkControlAction[]) {
  const control = useOpenworkControl();
  const registerAction = control?.registerAction;

  // One ref per action id, so executeAction always sees the freshest closure.
  const refsById = useRef<Map<string, { current: OpenworkControlAction | null }>>(new Map());
  for (const action of actions) {
    const existing = refsById.current.get(action.id);
    if (existing) {
      existing.current = action;
    } else {
      refsById.current.set(action.id, { current: action });
    }
  }

  const ids = actions.map((action) => action.id).join('\u0000');

  useEffect(() => {
    if (!registerAction) return undefined;
    const liveIds = new Set(actions.map((action) => action.id));
    for (const id of Array.from(refsById.current.keys())) {
      if (!liveIds.has(id)) refsById.current.delete(id);
    }
    const cleanups = actions.map((action) => {
      const ref = refsById.current.get(action.id);
      return ref ? registerAction(action.id, ref) : undefined;
    });
    return () => {
      for (const cleanup of cleanups) cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerAction, ids]);
}

export function OpenworkRouteControlActions() {
  const navigate = useNavigate();

  const actions = useMemo<OpenworkControlAction[]>(() => [
    {
      id: 'route.chat',
      label: 'Open Chat',
      description: 'Navigate to the primary DB-GPT Chat view.',
      sideEffect: 'navigation',
      execute: () => navigate('/chat'),
    },
    {
      id: 'route.conversations',
      label: 'Open Conversations',
      description: 'Navigate to conversations management list.',
      sideEffect: 'navigation',
      execute: () => navigate('/conversations'),
    },
    {
      id: 'route.construct.skills',
      label: 'Open Skills Constructor',
      description: 'Navigate to Skills Constructor view.',
      sideEffect: 'navigation',
      execute: () => navigate('/construct/skills'),
    },
    {
      id: 'route.construct.knowledge',
      label: 'Open Knowledge Constructor',
      description: 'Navigate to Knowledge Space Constructor.',
      sideEffect: 'navigation',
      execute: () => navigate('/construct/knowledge'),
    },
    {
      id: 'route.construct.models',
      label: 'Open Models Constructor',
      description: 'Navigate to Model Management Constructor.',
      sideEffect: 'navigation',
      execute: () => navigate('/construct/models'),
    },
    {
      id: 'route.construct.flow',
      label: 'Open Flow Constructor',
      description: 'Navigate to AWEL Flow visual builder.',
      sideEffect: 'navigation',
      execute: () => navigate('/construct/flow'),
    },
    {
      id: 'route.construct.database',
      label: 'Open Database Constructor',
      description: 'Navigate to Database Connection Constructor.',
      sideEffect: 'navigation',
      execute: () => navigate('/construct/database'),
    },
    {
      id: 'route.construct.agent',
      label: 'Open Agent Constructor',
      description: 'Navigate to Multi-Agent Constructor.',
      sideEffect: 'navigation',
      execute: () => navigate('/construct/agent'),
    },
    {
      id: 'route.evaluation',
      label: 'Open Models Evaluation',
      description: 'Navigate to LLM & Agent Evaluation dashboard.',
      sideEffect: 'navigation',
      execute: () => navigate('/models_evaluation'),
    },
    {
      id: 'route.deep_research',
      label: 'Open Deep Research',
      description: 'Navigate to Deep Research and web analysis workbench.',
      sideEffect: 'navigation',
      execute: () => navigate('/deep-research'),
    },
    {
      id: 'route.replay',
      label: 'Open Replay',
      description: 'Navigate to Agent Execution Replay view.',
      sideEffect: 'navigation',
      execute: () => navigate('/replay'),
    },
    {
      id: 'route.sheets',
      label: 'Open Sheets',
      description: 'Navigate to Spreadsheet Artifact Studio.',
      sideEffect: 'navigation',
      execute: () => navigate('/sheets'),
    },
    {
      id: 'route.slides',
      label: 'Open Slides',
      description: 'Navigate to Presentation Slide Studio.',
      sideEffect: 'navigation',
      execute: () => navigate('/slides'),
    },
    {
      id: 'route.openwork',
      label: 'Open OpenWork Coworker Workspace',
      description: 'Navigate to OpenWork Coworker Workspace and Session UI.',
      sideEffect: 'navigation',
      execute: () => navigate('/openwork'),
    },
    {
      id: 'route.back',
      label: 'Go back',
      description: 'Navigate back one entry in history.',
      sideEffect: 'navigation',
      execute: () => navigate(-1),
    },
    {
      id: 'route.forward',
      label: 'Go forward',
      description: 'Navigate forward one entry in history.',
      sideEffect: 'navigation',
      execute: () => navigate(1),
    },
    {
      id: 'help.capabilities',
      label: 'What can DB-GPT OpenWork do?',
      description: 'List the main capabilities of DB-GPT and OpenWork.',
      kind: 'query',
      effects: { data: 'read', ui: 'none', external: false },
      sideEffect: 'none',
      execute: () => ({
        capabilities: [
          { id: 'chat', label: 'Conversational Data Analysis', description: 'Interactive AI Chat with database querying and analytical chart generation.' },
          { id: 'deep-research', label: 'Deep Research', description: 'Autonomous web search, literature synthesis, and evidence-grounded reports.' },
          { id: 'sheets', label: 'Spreadsheets Studio', description: 'Formulated multi-sheet Excel (.xlsx) financial modeling and computation.' },
          { id: 'slides', label: 'Executive Presentations', description: 'Executive PowerPoint (.pptx) deck generation with native chart shapes.' },
          { id: 'flow', label: 'AWEL Flow', description: 'Agentic Workflow Expression Language orchestration and visual workflow execution.' },
          { id: 'knowledge', label: 'Knowledge Base', description: 'RAG vector retrieval, document extraction, and hybrid search.' },
          { id: 'replay', label: 'Execution Replay', description: 'Time-travel debugging and replay inspection for agent execution steps.' },
          { id: 'control', label: 'Autonomous Control Bridge', description: 'External MCP control and affordance dispatch surface.' },
        ],
        hint: 'Use route actions to navigate between studios, or execute affordance actions to interact directly with tools.',
      }),
    },
  ], [navigate]);

  useControlActions(actions);
  return null;
}
