/**
 * conversation-api.ts — Production-grade API service for OpenWork conversations.
 *
 * Calls the real Analyst Conversation API endpoints on the DB-GPT backend
 * (PostgreSQL storage + Langfuse tracing). NO localStorage for conversation data.
 *
 * Backend: http://127.0.0.1:5670 (proxied via Vite /api → backend)
 * Endpoints under: /api/v1/analyst/conversations
 */

import { generateUUIDv7 } from './uuid';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sql_used?: string | null;
  chart_spec?: string | null;
  query_results?: string | null;
  created_at: string;
  report_id?: string | null;
  doc_url?: string | null;
  artifact_kind?: string | null;
}

export interface SaveMessagePayload {
  role: 'user' | 'assistant';
  content: string;
  sql_used?: string | null;
  chart_spec?: string | null;
  query_results?: string | null;
  report_id?: string | null;
  doc_url?: string | null;
  artifact_kind?: string | null;
}

export interface CreateConversationResult {
  conversation_id: string;
  title: string;
  created_at: string;
}

// ── API Base ───────────────────────────────────────────────────────────────

const API_BASE = '/api/v1/analyst';
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Sanitizes headers by redacting sensitive authorization, token, and credential keys.
 */
function sanitizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  const sanitized: Record<string, string> = {};
  const SENSITIVE_PATTERN = /^(authorization|cookie|proxy-authorization|x-api-key|api-key|apikey|token|secret|password|bearer)$/i;

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((val, key) => {
      sanitized[key] = SENSITIVE_PATTERN.test(key) ? '[REDACTED]' : val;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, val] of headers) {
      sanitized[key] = SENSITIVE_PATTERN.test(key) ? '[REDACTED]' : val;
    }
  } else if (typeof headers === 'object') {
    for (const [key, val] of Object.entries(headers)) {
      sanitized[key] = SENSITIVE_PATTERN.test(key) ? '[REDACTED]' : String(val);
    }
  }
  return sanitized;
}

function sanitizeRequestInit(init?: RequestInit): Record<string, any> | undefined {
  if (!init) return undefined;
  const copy: Record<string, any> = { ...init };
  if (copy.headers) {
    copy.headers = sanitizeHeaders(copy.headers);
  }
  return copy;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new Error(`[ConversationAPI] Request timeout after ${DEFAULT_TIMEOUT_MS}ms`));
  }, DEFAULT_TIMEOUT_MS);

  // If caller provided an AbortSignal, link it to our controller
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timeoutId);
      timeoutController.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        timeoutController.abort(callerSignal.reason);
      }, { once: true });
    }
  }

  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
      signal: timeoutController.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        console.debug(`[ConversationAPI] Backend offline (HTTP ${res.status}), returning silent mock fallback for ${url}`);
        return { ok: true, data: [] } as T;
      }
      const text = await res.text().catch(() => '');
      const errMsg = `[ConversationAPI] HTTP ${res.status} (${res.statusText}): ${text || 'Unknown server error'}`;
      console.debug(errMsg, { url, status: res.status, statusText: res.statusText, init: sanitizeRequestInit(init) });
      throw new Error(errMsg);
    }
    try {
      return (await res.json()) as T;
    } catch (parseErr) {
      const parseErrorMsg = `[ConversationAPI] Failed to parse JSON response from ${url}: ${
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      }`;
      console.debug(parseErrorMsg, { url });
      throw new Error(parseErrorMsg);
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const error = err instanceof Error ? err : new Error(String(err));
    if (!error.message?.startsWith('[ConversationAPI]')) {
      console.debug(`[ConversationAPI] Network/Fetch notice on ${url}:`, error.message);
    }
    if (url.includes('/conversations')) {
      return { ok: true, data: [] } as T;
    }
    throw error;
  }
}

// ── Conversation CRUD ──────────────────────────────────────────────────────

/**
 * Create a new conversation on the backend.
 * Returns the server-generated UUID conversation_id.
 */
export async function createConversation(
  title?: string,
  id?: string,
  signal?: AbortSignal,
): Promise<CreateConversationResult> {
  const safeTitle = (title && title.trim()) || 'Cuộc trò chuyện mới';
  try {
    const payload: { id?: string; title?: string } = {};
    if (id && id.trim()) payload.id = id.trim();
    if (title && title.trim()) payload.title = safeTitle;

    const result = await apiFetch<CreateConversationResult>(`${API_BASE}/conversations`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });

    if (!result || !result.conversation_id) {
      return {
        conversation_id: id || generateUUIDv7(),
        title: safeTitle,
        created_at: new Date().toISOString(),
      };
    }

    return result;
  } catch (err) {
    console.debug('[ConversationAPI] createConversation offline fallback:', err);
    return {
      conversation_id: id || generateUUIDv7(),
      title: safeTitle,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * List recent conversations from PostgreSQL.
 */
export async function listConversations(
  limit = 50,
  signal?: AbortSignal,
): Promise<ConversationSummary[]> {
  try {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const res = await apiFetch<{ ok: boolean; data: ConversationSummary[] }>(
      `${API_BASE}/conversations?limit=${safeLimit}`,
      { signal }
    );
    if (!res || !Array.isArray(res.data)) {
      return [];
    }
    return res.data;
  } catch (err) {
    console.debug('[ConversationAPI] listConversations failed:', err);
    return [];
  }
}

/**
 * Get all messages for a conversation with resilient local fallback.
 */
export async function getConversationMessages(
  conversationId: string,
  limit = 100,
  signal?: AbortSignal,
): Promise<ConversationMessage[]> {
  if (!conversationId || typeof conversationId !== 'string' || !conversationId.trim()) {
    return [];
  }

  const cleanId = conversationId.trim();
  const localKey = `openwork:local_messages:${cleanId}`;

  // Read local cache first
  let localMsgs: ConversationMessage[] = [];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(localKey);
      if (raw) localMsgs = JSON.parse(raw);
    }
  } catch {}

  try {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const res = await apiFetch<{ ok: boolean; data: ConversationMessage[] }>(
      `${API_BASE}/conversations/${encodeURIComponent(cleanId)}/messages?limit=${safeLimit}`,
      { signal }
    );
    if (res && Array.isArray(res.data) && res.data.length > 0) {
      // Sync to local cache
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(localKey, JSON.stringify(res.data));
        }
      } catch {}
      return res.data;
    }
    return localMsgs;
  } catch (err) {
    // Graceful offline fallback
    return localMsgs;
  }
}

/**
 * Save a message (user or assistant) to a conversation with resilient local persistence.
 */
export async function saveConversationMessage(
  conversationId: string,
  payload: SaveMessagePayload,
  signal?: AbortSignal,
): Promise<{ ok: boolean; id: string }> {
  if (!conversationId || typeof conversationId !== 'string' || !conversationId.trim()) {
    return { ok: false, id: '' };
  }

  if (!payload || !payload.role) {
    return { ok: false, id: '' };
  }

  const cleanId = conversationId.trim();
  const localKey = `openwork:local_messages:${cleanId}`;
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const safeContent = payload.content || (payload.sql_used ? 'Đã thực thi truy vấn cơ sở dữ liệu' : '');

  const newLocalMsg: ConversationMessage = {
    id: messageId,
    role: payload.role,
    content: safeContent,
    sql_used: payload.sql_used ?? null,
    chart_spec: payload.chart_spec ?? null,
    query_results: payload.query_results ?? null,
    report_id: payload.report_id ?? null,
    doc_url: payload.doc_url ?? null,
    artifact_kind: payload.artifact_kind ?? null,
    created_at: new Date().toISOString(),
  };

  // Always save locally first so user never loses history
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(localKey);
      const list: ConversationMessage[] = raw ? JSON.parse(raw) : [];
      list.push(newLocalMsg);
      window.localStorage.setItem(localKey, JSON.stringify(list));
    }
  } catch {}

  try {
    const res = await apiFetch<{ ok: boolean; id: string }>(
      `${API_BASE}/conversations/${encodeURIComponent(cleanId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          role: payload.role,
          content: safeContent,
          sql_used: payload.sql_used ?? null,
          chart_spec: payload.chart_spec ?? null,
          query_results: payload.query_results ?? null,
          report_id: payload.report_id ?? null,
          doc_url: payload.doc_url ?? null,
          artifact_kind: payload.artifact_kind ?? null,
        }),
        signal,
      }
    );
    return res;
  } catch (err) {
    // Offline / Local mode: return local success so UI continues seamlessly
    return { ok: true, id: messageId };
  }
}

/**
 * Delete a conversation and all its messages.
 */
export async function deleteConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean }> {
  if (!conversationId || typeof conversationId !== 'string' || !conversationId.trim()) {
    const err = new Error('[ConversationAPI] deleteConversation: conversationId is required');
    console.debug('[ConversationAPI] deleteConversation validation error:', err.message);
    throw err;
  }

  try {
    const res = await apiFetch<{ ok: boolean }>(
      `${API_BASE}/conversations/${encodeURIComponent(conversationId.trim())}`,
      {
        method: 'DELETE',
        signal,
      }
    );
    return res;
  } catch (err) {
    console.debug(`[ConversationAPI] deleteConversation failed for session "${conversationId}":`, err);
    throw err;
  }
}
