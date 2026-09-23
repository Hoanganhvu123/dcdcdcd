// Adapted from OpenWork (MIT) — Copyright (c) 2026 Different AI

export const OPENWORK_AFFORDANCE_SCHEMA_VERSION = 1;

export const OPENWORK_AFFORDANCE_KINDS = ['query', 'command', 'guidance'] as const;
export type OpenworkAffordanceKind = (typeof OPENWORK_AFFORDANCE_KINDS)[number];

export const OPENWORK_PROVIDER_KINDS = ['builtin', 'extension', 'mcp', 'connect'] as const;
export type OpenworkProviderKind = (typeof OPENWORK_PROVIDER_KINDS)[number];

export interface OpenworkAffordanceEffects {
  data: 'none' | 'read' | 'write';
  ui: 'none' | 'focus' | 'navigate' | 'layout' | 'dialog';
  external: boolean;
}

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
  providerKind: OpenworkProviderKind;
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

export interface OpenworkAffordanceDescriptor {
  id: string;
  label: string;
  description?: string;
  kind: OpenworkAffordanceKind;
  providerKind: OpenworkProviderKind;
  effects: OpenworkAffordanceEffects;
  requiresConfirmation: boolean;
  args?: OpenworkControlActionArg[];
  handler: (args?: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface OpenworkAffordanceRequest {
  id: string;
  args?: Record<string, unknown>;
  expectedRevision?: number;
  actor?: string;
}

export type OpenworkAffordanceResult<T = unknown> =
  | {
      ok: true;
      revision: number;
      data: T;
    }
  | {
      ok: false;
      revision: number;
      error: string;
      code?: 'STALE_REVISION' | 'NOT_FOUND' | 'DISABLED' | 'CONFIRMATION_REQUIRED' | 'EXECUTION_FAILED';
    };

export interface OpenworkUISnapshot {
  version: number;
  revision: number;
  timestamp: number;
  route: string;
  busyActionId?: string;
  actions: OpenworkControlActionMetadata[];
}

export interface OpenworkUIContext {
  snapshot: OpenworkUISnapshot;
  screen: string;
  activeTabs: string[];
  focusedPane?: string;
  sidebarExpanded: boolean;
  availableQueries: string[];
  availableCommands: string[];
}

export function validateAffordanceEffects(effects: unknown): effects is OpenworkAffordanceEffects {
  if (!effects || typeof effects !== 'object') return false;
  const e = effects as Record<string, unknown>;
  const validData = ['none', 'read', 'write'].includes(e.data as string);
  const validUi = ['none', 'focus', 'navigate', 'layout', 'dialog'].includes(e.ui as string);
  const validExt = typeof e.external === 'boolean';
  return validData && validUi && validExt;
}

export function effectsToSideEffect(effects: OpenworkAffordanceEffects): OpenworkControlSideEffect {
  if (effects.external) return 'external';
  if (effects.data === 'write') return 'mutation';
  if (effects.ui === 'navigate') return 'navigation';
  return 'none';
}

export function descriptorToMetadata(
  desc: OpenworkAffordanceDescriptor,
  busyActionId?: string,
): OpenworkControlActionMetadata {
  return {
    id: desc.id,
    label: desc.label,
    description: desc.description,
    kind: desc.kind === 'query' ? 'query' : 'command',
    // Without this an agent reading the control surface cannot tell a builtin
    // action from an MCP- or extension-provided one.
    providerKind: OPENWORK_PROVIDER_KINDS.includes(desc.providerKind) ? desc.providerKind : 'builtin',
    effects: desc.effects,
    sideEffect: effectsToSideEffect(desc.effects),
    requiresConfirmation: desc.requiresConfirmation,
    requiresArgs: Boolean(desc.args && desc.args.some(a => a.required)),
    hasPreviewArgs: false,
    args: desc.args,
    disabled: false,
    busy: busyActionId === desc.id,
  };
}
