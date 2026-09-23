/**
 * useAnalystChat — consumes the `/api/v1/analyst/chat` SSE stream.
 *
 * Protocol differs from the ReAct one (`use-react-agent.ts`): the endpoint is
 * `Form()`-based (not JSON), and events are shaped
 * `{type, payload, graph_id, agent_name, ...}` terminated by a literal
 * `data: [DONE]`.
 *
 * Two things worth knowing about the backend, both verified against a live
 * capture rather than assumed:
 *
 * 1. `answer_delta` and `final.payload.answer` carry DIFFERENT text. The deltas
 *    are the supervisor's full prose (~1.1k chars); `final.answer` is a short
 *    templated summary (~280 chars) from the subgraph. We keep the streamed
 *    text and fall back to `final.answer` only when nothing streamed — same
 *    rule the backend applies internally.
 * 2. `task_call` streams tool args one character at a time (780 events for a
 *    single delegation). It is ignored here; consumers wanting it can use
 *    `onEvent`.
 * 3. Artifacts stream as 4 typed events — `artifact.start` / `.progress` /
 *    `.ready` / `.error` — keyed by an `id` that's stable for one file's
 *    lifetime (see backend `events/artifact_events.py`). `extractArtifacts`'s
 *    URL regex is a deprecated fallback for servers predating those events.
 *
 * `graph_id`, `agent_name` and `intent_detected` are hardcoded cosmetic stubs
 * server-side — never route on them.
 *
 * The stream reduction is a pure function (`reduceAnalystEvent`) so it can be
 * exercised without React; see `use-analyst-chat.check.ts`.
 */

import { useCallback, useRef, useState } from 'react';

/** Next has no rewrites, so every request carries the backend origin explicitly. */
export const apiBase = (): string => process.env.API_BASE_URL ?? '';

export const ANALYST_CHAT_PATH = '/api/v1/analyst/chat';

export type AnalystArtifactKind = 'pptx' | 'docx' | 'xlsx' | 'csv' | 'pdf' | 'other';

export type AnalystArtifactStatus = 'streaming' | 'ready' | 'error';

export interface AnalystArtifact {
  /** `artifact.*` events key by this; regex fallback uses the URL as id. */
  id: string;
  /** Server-relative path exactly as it appeared in the stream. Empty until ready. */
  url: string;
  /** Same path prefixed with the backend origin — use this for links. Empty until ready. */
  href: string;
  filename: string;
  kind: AnalystArtifactKind;
  status: AnalystArtifactStatus;
  /** 0-100, from `artifact.progress`. 100 once ready, 0 while unset. */
  pct: number;
  /** Human-readable stage label from `artifact.progress`, e.g. "rendering slide 3/5". */
  stage?: string;
  title?: string;
  /** Set on `artifact.error`. */
  error?: string;
  /** Inline HTML preview from `artifact.ready`, when the backend renders one (pptx/docx decks). */
  previewHtml?: string;
}

/** Mirrors the Form() fields of `multi_agent_stream` in analyst_api.py. */
export interface AnalystChatRequest {
  question: string;
  sessionId?: string;
  /** e.g. 'office' to reach office_writer; '' lets the supervisor route. */
  mode?: string;
  model?: string;
  anchorTable?: string;
  allowedTables?: string[];
  sourceIds?: string[];
  file?: File;
}

export interface AnalystFinalPayload {
  answer?: string;
  sql?: string | null;
  chart?: unknown;
  query_results?: unknown[];
  selected_tables?: string[];
  plan_steps?: unknown[];
}

export interface AnalystEvent {
  type?: string;
  phase?: string;
  status?: string;
  ts?: string;
  payload?: Record<string, any>;
  [k: string]: any;
}

// ─── Pure stream reduction ──────────────────────────────────────────────────

export interface AnalystAccumulator {
  answer: string;
  status: string;
  artifacts: AnalystArtifact[];
  final: AnalystFinalPayload | null;
  /** Internal: artifacts keyed by id (regex fallback keys by url). */
  artifactMap: Map<string, AnalystArtifact>;
}

/** What a single event changed, so callers can fire callbacks precisely. */
export interface AnalystEventChange {
  delta?: string;
  answerChanged: boolean;
  statusChanged: boolean;
  newArtifacts: AnalystArtifact[];
  final?: AnalystFinalPayload;
}

export function createAccumulator(): AnalystAccumulator {
  return { answer: '', status: '', artifacts: [], final: null, artifactMap: new Map() };
}

/**
 * @deprecated Fallback for servers predating the `artifact.*` events (see
 * events/artifact_events.py backend-side). Those events carry id/status/pct
 * and arrive as the file is produced, not after the model finishes talking;
 * this regex only catches a URL once it's already sitting in finished prose.
 * Keep until all deployed servers emit `artifact.*`, then delete alongside
 * `extractArtifacts` and `collect`.
 *
 * Server writes artifacts to `<UPLOAD_DIR>/<subdir>/<uuid><ext>`, served at /uploads/.
 */
const ARTIFACT_RE = /\/uploads\/[\w.-]+\/[\w.-]+\.(pptx|docx|xlsx|csv|pdf)\b/gi;

const KIND_BY_EXT: Record<string, AnalystArtifactKind> = {
  pptx: 'pptx',
  docx: 'docx',
  xlsx: 'xlsx',
  csv: 'csv',
  pdf: 'pdf',
  ppt: 'pptx',
  word: 'docx',
  doc: 'docx',
  excel: 'xlsx',
  xls: 'xlsx',
  report: 'xlsx',
};

/** Derives kind from a filename, a bare extension, or a URL — whatever's on hand. */
export function kindOf(name: string): AnalystArtifactKind {
  return KIND_BY_EXT[(name.split('.').pop() || '').toLowerCase()] ?? 'other';
}

/** @deprecated See `ARTIFACT_RE`. */
export function extractArtifacts(text: string): AnalystArtifact[] {
  const out: AnalystArtifact[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(ARTIFACT_RE)) {
    const url = match[0];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: url,
      url,
      href: apiBase() + url,
      filename: url.split('/').pop() || url,
      kind: KIND_BY_EXT[match[1].toLowerCase()] ?? 'other',
      status: 'ready',
      pct: 100,
    });
  }
  return out;
}

/** @deprecated See `ARTIFACT_RE`. */
function collect(acc: AnalystAccumulator, text: string, into: AnalystArtifact[]): void {
  for (const artifact of extractArtifacts(text)) {
    if (acc.artifactMap.has(artifact.id)) continue;
    const existsByUrl = Array.from(acc.artifactMap.values()).some(
      existing => Boolean(existing.url && existing.url === artifact.url),
    );
    if (existsByUrl) continue;
    upsertArtifact(acc, artifact.id, artifact);
    into.push(artifact);
  }
}

/** Merge a patch into the artifact keyed by `id`, rebuild `acc.artifacts`, return the record. */
function upsertArtifact(
  acc: AnalystAccumulator,
  id: string,
  patch: Partial<AnalystArtifact>,
): AnalystArtifact {
  const next: AnalystArtifact = {
    id,
    url: '',
    href: '',
    filename: '',
    kind: 'other',
    status: 'streaming',
    pct: 0,
    ...acc.artifactMap.get(id),
    ...patch,
  };
  acc.artifactMap.set(id, next);
  acc.artifacts = Array.from(acc.artifactMap.values());
  return next;
}

/**
 * Fold one event into `acc` (mutated in place) and report what changed.
 * Unknown types — task_call, AGENT_SLOT_UPDATE, intent_detected, and the
 * legacy untyped `final_result` line — are deliberately no-ops.
 */
export function reduceAnalystEvent(
  acc: AnalystAccumulator,
  event: AnalystEvent,
): AnalystEventChange {
  const change: AnalystEventChange = {
    answerChanged: false,
    statusChanged: false,
    newArtifacts: [],
  };
  const payload = event.payload ?? {};

  switch (event.type) {
    case 'answer_delta': {
      const delta: string = payload.delta ?? '';
      if (!delta) break;
      acc.answer += delta;
      change.delta = delta;
      change.answerChanged = true;
      collect(acc, acc.answer, change.newArtifacts);
      break;
    }
    case 'status':
    case 'phase': {
      const message: string = payload.message ?? event.phase ?? '';
      if (message && message !== acc.status) {
        acc.status = message;
        change.statusChanged = true;
      }
      break;
    }
    case 'tool_result': {
      // Carries the artifact link before the prose does.
      if (typeof payload.result === 'string') collect(acc, payload.result, change.newArtifacts);
      break;
    }
    case 'artifact.start': {
      if (!payload.id) break;
      change.newArtifacts = [
        upsertArtifact(acc, payload.id, {
          kind: kindOf(String(payload.kind ?? '')),
          title: payload.title,
          status: 'streaming',
          pct: 0,
        }),
      ];
      break;
    }
    case 'artifact.progress': {
      if (!payload.id) break;
      const existing = acc.artifactMap.get(payload.id);
      if (existing?.status === 'ready') break;
      change.newArtifacts = [
        upsertArtifact(acc, payload.id, {
          stage: payload.stage,
          pct: typeof payload.pct === 'number' ? payload.pct : 0,
          status: 'streaming',
        }),
      ];
      break;
    }
    case 'artifact.ready': {
      if (!payload.id) break;
      const url: string = payload.url ?? '';
      const filename: string = payload.filename || (url.split('/').pop() ?? '');
      change.newArtifacts = [
        upsertArtifact(acc, payload.id, {
          url,
          href: url ? apiBase() + url : '',
          filename,
          kind: kindOf(filename || url),
          status: 'ready',
          pct: 100,
          previewHtml: typeof payload.preview_html === 'string' ? payload.preview_html : undefined,
        }),
      ];
      break;
    }
    case 'artifact.error': {
      if (!payload.id) break;
      change.newArtifacts = [
        upsertArtifact(acc, payload.id, { status: 'error', error: payload.message }),
      ];
      break;
    }
    case 'final': {
      const final = payload as AnalystFinalPayload;
      // Streamed prose is richer than the templated final.answer; only fall
      // back when nothing streamed.
      if (!acc.answer && final.answer) {
        acc.answer = final.answer;
        change.answerChanged = true;
      }
      if (final.answer) collect(acc, final.answer, change.newArtifacts);
      acc.final = final;
      acc.status = '';
      change.final = final;
      break;
    }
    default:
      break;
  }

  return change;
}

/**
 * Walk raw SSE text, invoking `onEvent` per frame. Returns true once the
 * `[DONE]` terminator is seen. Malformed frames are skipped — the stream
 * carries plenty and a partial frame is not worth failing the whole read.
 */
export function consumeSSELines(
  lines: string[],
  onEvent: (event: AnalystEvent) => void,
): boolean {
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const body = line.slice(6).trim();
    if (!body) continue;
    if (body === '[DONE]') return true;
    try {
      onEvent(JSON.parse(body));
    } catch {
      /* partial or malformed frame */
    }
  }
  return false;
}

/** Fold a complete SSE transcript. Used by the check, and handy for replays. */
export function parseAnalystStream(text: string): AnalystAccumulator {
  const acc = createAccumulator();
  consumeSSELines(text.split('\n'), event => reduceAnalystEvent(acc, event));
  return acc;
}

// ─── React hook ─────────────────────────────────────────────────────────────

export interface AnalystChatState {
  isWorking: boolean;
  /** Live text, accumulated from `answer_delta`. */
  answer: string;
  /** Latest human-readable progress line from `status` / `phase`. */
  status: string;
  artifacts: AnalystArtifact[];
  final: AnalystFinalPayload | null;
  error: string | null;
}

export interface UseAnalystChatOptions {
  baseUrl?: string;
  onAnswerDelta?: (full: string, delta: string) => void;
  /** Fires on every lifecycle transition (start/progress/ready/error), not just completion — check `status`. */
  onArtifact?: (artifact: AnalystArtifact) => void;
  onFinal?: (payload: AnalystFinalPayload) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
  /** Escape hatch for raw events (tool_result, AGENT_SLOT_UPDATE, task_call...). */
  onEvent?: (event: AnalystEvent) => void;
}

const EMPTY: AnalystChatState = {
  isWorking: false,
  answer: '',
  status: '',
  artifacts: [],
  final: null,
  error: null,
};

function buildForm(request: AnalystChatRequest): FormData {
  const form = new FormData();
  form.append('question', request.question);
  form.append('session_id', request.sessionId ?? '');
  form.append('mode', request.mode ?? '');
  form.append('anchor_table', request.anchorTable ?? '');
  form.append('allowed_tables', JSON.stringify(request.allowedTables ?? []));
  form.append('source_ids', JSON.stringify(request.sourceIds ?? []));
  if (request.model) form.append('model', request.model);
  if (request.file) form.append('file', request.file);
  return form;
}

export function useAnalystChat(options: UseAnalystChatOptions = {}) {
  const {
    baseUrl = apiBase() + ANALYST_CHAT_PATH,
    onAnswerDelta,
    onArtifact,
    onFinal,
    onError,
    onComplete,
    onEvent,
  } = options;

  const [state, setState] = useState<AnalystChatState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => setState(EMPTY), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(prev => ({ ...prev, isWorking: false }));
  }, []);

  const sendMessage = useCallback(
    async (request: AnalystChatRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ ...EMPTY, isWorking: true });
      const acc = createAccumulator();

      const handleEvent = (event: AnalystEvent) => {
        onEvent?.(event);
        const change = reduceAnalystEvent(acc, event);

        if (change.answerChanged || change.statusChanged || change.newArtifacts.length) {
          setState(prev => ({
            ...prev,
            answer: acc.answer,
            status: acc.status,
            artifacts: change.newArtifacts.length ? [...acc.artifacts] : prev.artifacts,
          }));
        }
        if (change.delta) onAnswerDelta?.(acc.answer, change.delta);
        change.newArtifacts.forEach(a => onArtifact?.(a));
        if (change.final) {
          setState(prev => ({ ...prev, final: change.final!, status: '' }));
          onFinal?.(change.final);
        }
      };

      try {
        const response = await fetch(baseUrl, {
          method: 'POST',
          headers: { Accept: 'text/event-stream' }, // no Content-Type: browser sets the multipart boundary
          body: buildForm(request),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        if (!response.body) throw new Error('Response has no body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finished = false;

        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep the incomplete tail
          finished = consumeSSELines(lines, handleEvent);
        }

        setState(prev => ({ ...prev, isWorking: false }));
        onComplete?.();
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setState(prev => ({ ...prev, isWorking: false }));
          return;
        }
        const messageText = err instanceof Error ? err.message : String(err);
        setState(prev => ({ ...prev, isWorking: false, error: messageText }));
        onError?.(messageText);
      } finally {
        abortRef.current = null;
      }
    },
    [baseUrl, onAnswerDelta, onArtifact, onFinal, onError, onComplete, onEvent],
  );

  return { ...state, sendMessage, stop, reset };
}

export default useAnalystChat;
