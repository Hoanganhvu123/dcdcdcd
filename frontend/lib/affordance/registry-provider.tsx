// Adapted from OpenWork (MIT) — Copyright (c) 2026 Different AI
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  OpenworkAffordanceDescriptor,
  OpenworkAffordanceEffects,
  OpenworkAffordanceRequest,
  OpenworkAffordanceResult,
  OpenworkControlActionMetadata,
  OpenworkControlSideEffect,
  OpenworkUIContext,
  OpenworkUISnapshot,
} from './types';
import {
  OPENWORK_AFFORDANCE_SCHEMA_VERSION,
  descriptorToMetadata,
  effectsToSideEffect,
} from './types';

export { descriptorToMetadata, effectsToSideEffect };

export interface AffordanceContextValue {
  revision: number;
  busyActionId?: string;
  register: (descriptor: OpenworkAffordanceDescriptor) => () => void;
  unregister: (id: string) => void;
  listActions: () => OpenworkControlActionMetadata[];
  snapshot: () => OpenworkUISnapshot;
  getContext: (extra?: Partial<OpenworkUIContext>) => OpenworkUIContext;
  query: <T = unknown>(
    idOrRequest: string | OpenworkAffordanceRequest,
    args?: Record<string, unknown>,
  ) => Promise<OpenworkAffordanceResult<T>>;
  command: <T = unknown>(req: OpenworkAffordanceRequest) => Promise<OpenworkAffordanceResult<T>>;
  execute: <T = unknown>(id: string, args?: Record<string, unknown>) => Promise<OpenworkAffordanceResult<T>>;
}

const AffordanceContext = createContext<AffordanceContextValue | null>(null);


export const AffordanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revision, setRevision] = useState(1);
  const [busyActionId, setBusyActionId] = useState<string | undefined>();
  const registryRef = useRef<Map<string, OpenworkAffordanceDescriptor>>(new Map());

  const register = useCallback((desc: OpenworkAffordanceDescriptor) => {
    registryRef.current.set(desc.id, desc);
    setRevision(r => r + 1);
    return () => {
      registryRef.current.delete(desc.id);
      setRevision(r => r + 1);
    };
  }, []);

  const unregister = useCallback((id: string) => {
    if (registryRef.current.delete(id)) {
      setRevision(r => r + 1);
    }
  }, []);

  const listActions = useCallback((): OpenworkControlActionMetadata[] => {
    return Array.from(registryRef.current.values()).map(d => descriptorToMetadata(d, busyActionId));
  }, [busyActionId]);

  const snapshot = useCallback((): OpenworkUISnapshot => {
    const route = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
    return {
      version: OPENWORK_AFFORDANCE_SCHEMA_VERSION,
      revision,
      timestamp: Date.now(),
      route,
      busyActionId,
      actions: listActions(),
    };
  }, [revision, busyActionId, listActions]);

  const getContext = useCallback(
    (extra?: Partial<OpenworkUIContext>): OpenworkUIContext => {
      const snap = snapshot();
      const queries: string[] = [];
      const commands: string[] = [];

      for (const action of snap.actions) {
        if (action.kind === 'query') queries.push(action.id);
        else commands.push(action.id);
      }

      return {
        snapshot: snap,
        screen: extra?.screen || snap.route,
        activeTabs: extra?.activeTabs || [],
        focusedPane: extra?.focusedPane,
        sidebarExpanded: extra?.sidebarExpanded ?? true,
        availableQueries: queries,
        availableCommands: commands,
      };
    },
    [snapshot],
  );

  // Accepts either the positional form or the same request object `command`
  // takes; both are exposed raw on `window.__dbgptControl`, so an agent that
  // mirrors the command shape must not silently miss the registry lookup.
  const query = useCallback(
    async <T = unknown>(
      idOrRequest: string | OpenworkAffordanceRequest,
      argsArg?: Record<string, unknown>,
    ): Promise<OpenworkAffordanceResult<T>> => {
      const id = typeof idOrRequest === 'string' ? idOrRequest : idOrRequest?.id;
      const args = typeof idOrRequest === 'string' ? argsArg : idOrRequest?.args;
      if (typeof id !== 'string' || !id) {
        return { ok: false, revision, error: 'query requires an action id', code: 'NOT_FOUND' };
      }
      const desc = registryRef.current.get(id);
      if (!desc) {
        return { ok: false, revision, error: `Action '${id}' not found in registry`, code: 'NOT_FOUND' };
      }
      if (desc.kind !== 'query' && desc.effects.data === 'write') {
        return {
          ok: false,
          revision,
          error: `Action '${id}' is mutating and cannot be run as a side-effect-free query`,
          code: 'EXECUTION_FAILED',
        };
      }

      try {
        const data = (await desc.handler(args)) as T;
        return { ok: true, revision, data };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        return { ok: false, revision, error, code: 'EXECUTION_FAILED' };
      }
    },
    [revision],
  );

  const command = useCallback(
    async <T = unknown>(req: OpenworkAffordanceRequest): Promise<OpenworkAffordanceResult<T>> => {
      const { id, args, expectedRevision } = req;
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        return {
          ok: false,
          revision,
          error: `Stale revision: expected ${expectedRevision}, current is ${revision}`,
          code: 'STALE_REVISION',
        };
      }

      const desc = registryRef.current.get(id);
      if (!desc) {
        return { ok: false, revision, error: `Action '${id}' not found in registry`, code: 'NOT_FOUND' };
      }

      setBusyActionId(id);
      try {
        const data = (await desc.handler(args)) as T;
        const nextRev = revision + 1;
        setRevision(nextRev);
        return { ok: true, revision: nextRev, data };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        return { ok: false, revision, error, code: 'EXECUTION_FAILED' };
      } finally {
        setBusyActionId(undefined);
      }
    },
    [revision],
  );

  const execute = useCallback(
    async <T = unknown>(id: string, args?: Record<string, unknown>): Promise<OpenworkAffordanceResult<T>> => {
      return command<T>({ id, args });
    },
    [command],
  );

  // Safe window registration for developer tools & testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const controlSurface = {
        version: OPENWORK_AFFORDANCE_SCHEMA_VERSION,
        listActions,
        snapshot,
        getContext,
        query,
        command,
        execute,
      };
      (window as unknown as Record<string, unknown>).__dbgptControl = controlSurface;
    }
  }, [listActions, snapshot, getContext, query, command, execute]);

  const value = useMemo(
    () => ({
      revision,
      busyActionId,
      register,
      unregister,
      listActions,
      snapshot,
      getContext,
      query,
      command,
      execute,
    }),
    [revision, busyActionId, register, unregister, listActions, snapshot, getContext, query, command, execute],
  );

  return <AffordanceContext.Provider value={value}>{children}</AffordanceContext.Provider>;
};

export function useAffordanceRegistry(): AffordanceContextValue {
  const ctx = useContext(AffordanceContext);
  if (!ctx) {
    throw new Error('useAffordanceRegistry must be used within an AffordanceProvider');
  }
  return ctx;
}

export function useRegisterAffordance(descriptor: OpenworkAffordanceDescriptor, deps: React.DependencyList = []) {
  const { register } = useAffordanceRegistry();
  useEffect(() => {
    const unbind = register(descriptor);
    return unbind;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, descriptor.id, ...deps]);
}
