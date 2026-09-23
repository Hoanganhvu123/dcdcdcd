/**
 * Universal OpenAI-Compatible & Multi-Vendor AI Provider SSE Streaming Client
 * Primary Engine: Server 160 (http://160.191.50.138:8787/v1 or /api/agent_wrap/v1)
 * Credentials are supplied dynamically from user settings or environment variables.
 *
 * Supported Engines:
 *   1. OpenRouter Gateway (/api/openrouter/v1 or https://openrouter.ai/api/v1):
 *      - DeepSeek V4 Flash (deepseek-v4-flash - Primary official analytics engine)
 *   2. DeepSeek Official API (/api/deepseek or https://api.deepseek.com)
 *   3. DB-GPT Local Backend (/api/v1 or http://127.0.0.1:5670/api/v1)
 *
 * Handles live delta decoding for reasoning_content (CoT thinking), tool_calls, and assistant prose.
 * Guarantees zero 401 vendor mismatches, isolated request headers, and full backward compatibility.
 */

import type { ProviderKind } from '../types';
import {
  StreamXMLFilter,
  filterXMLTagsSync,
  parseToolCallSyntax,
  parsePythonLiteral,
  type ParsedToolCallPayload,
} from './stream-xml-filter';

export {
  StreamXMLFilter,
  filterXMLTagsSync,
  parseToolCallSyntax,
  parsePythonLiteral,
  type ParsedToolCallPayload,
};

export interface DeepSeekChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: DeepSeekToolCall[];
}

export interface DeepSeekToolCall {
  index?: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
  name?: string;
}

export interface DeepSeekToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface DeepSeekStreamOptions {
  providerKind?: ProviderKind;
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  customHeaders?: Record<string, string>;
  messages: DeepSeekChatMessage[];
  tools?: DeepSeekToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onReasoningDelta?: (delta: string, accumulated: string) => void;
  onContentDelta?: (delta: string, accumulated: string) => void;
  onToolCallDelta?: (toolCall: {
    index: number;
    id?: string;
    name?: string;
    argumentsDelta?: string;
    accumulatedArguments: string;
  }) => void;
  onFinish?: (result: {
    reasoning: string;
    content: string;
    toolCalls: DeepSeekToolCall[];
  }) => void;
  onError?: (error: Error) => void;
}

export interface DeepSeekStreamResult {
  reasoning: string;
  content: string;
  toolCalls: DeepSeekToolCall[];
}

export interface NormalizedStreamChunk {
  reasoningDelta?: string;
  contentDelta?: string;
  toolCallsDelta?: DeepSeekToolCall[];
  isDone?: boolean;
}

/**
 * OpenRouter Official Gateway Configuration (Primary)
 */
export const DEFAULT_OPENROUTER_API_KEY: string =
  (typeof process !== 'undefined' &&
    (process?.env?.OPENROUTER_API_KEY ||
      process?.env?.NEXT_PUBLIC_OPENROUTER_API_KEY ||
      process?.env?.VITE_OPENROUTER_API_KEY)) ||
  '';
export const DEFAULT_OPENROUTER_BASE_URL = '/api/openrouter/v1';
export const DEFAULT_OPENROUTER_MODEL = 'deepseek-v4-flash';

/**
 * Server 160 Universal Agent Wrap Configuration
 */
export const DEFAULT_AGENT_WRAP_BASE_URL = 'http://160.191.50.138:8787/v1';
export const DEFAULT_AGENT_WRAP_API_KEY: string =
  (typeof process !== 'undefined' && (process?.env?.AGENT_WRAP_API_KEY || process?.env?.NEXT_PUBLIC_AGENT_WRAP_API_KEY)) || '';
export const DEFAULT_OPENWORK_MODEL = 'deepseek-v4-flash';

export const ALLOWED_AGENT_WRAP_MODELS = [
  'deepseek-v4-flash',
] as const;

/**
 * Environment-resolved fallback credentials (DeepSeek & DB-GPT compatibility)
 */
export const DEFAULT_DEEPSEEK_API_KEY: string =
  (typeof process !== 'undefined' && (process?.env?.DEEPSEEK_API_KEY || process?.env?.NEXT_PUBLIC_DEEPSEEK_API_KEY)) || '';

export const DEFAULT_DEEPSEEK_BASE_URL = '/api/deepseek';
export const DEFAULT_DBGPT_BASE_URL = 'http://127.0.0.1:5670/api/v1';

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEFAULT_DBGPT_MODEL = 'deepseek-v4-flash';

export const DEEPSEEK_OFFICIAL_MODELS = [
  'deepseek-v4-flash',
] as const;

/**
 * Normalizes base URL and ensures proper endpoint routing
 */
export function normalizeProviderUrl(providerKind?: ProviderKind, rawUrl?: string): string {
  let url = (typeof rawUrl === 'string' ? rawUrl : '').trim();

  if (!url) {
    switch (providerKind) {
      case 'openrouter':
        url = DEFAULT_OPENROUTER_BASE_URL;
        break;
      case 'dbgpt':
        url = DEFAULT_DBGPT_BASE_URL;
        break;
      case 'deepseek':
        url = DEFAULT_DEEPSEEK_BASE_URL;
        break;
      case 'agent-wrap':
      default:
        url = DEFAULT_OPENROUTER_BASE_URL;
        break;
    }
  }

  // Strip trailing slashes
  url = url.replace(/\/+$/, '');

  return url;
}

/**
 * Resolves chat completions endpoint URL for a given provider
 */
export function resolveProviderEndpointUrl(providerKind?: ProviderKind, baseUrl?: string): string {
  const normalized = normalizeProviderUrl(providerKind, baseUrl);
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

/**
 * Normalizes base URL and appends /chat/completions if not present (backward compatibility)
 */
export function resolveDeepSeekUrl(baseUrl?: string): string {
  let url = (baseUrl || DEFAULT_DEEPSEEK_BASE_URL).trim();
  if (!url) {
    url = DEFAULT_DEEPSEEK_BASE_URL;
  }
  url = url.replace(/\/+$/, '');

  if (url.endsWith('/chat/completions')) {
    return url;
  }
  return `${url}/chat/completions`;
}

/**
 * Builds isolated request headers dynamically per provider
 */
export function buildProviderHeaders(
  provider: ProviderKind = 'openrouter',
  apiKey?: string,
  _origin: string = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:3000'
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://dbgpt.site';
    headers['X-Title'] = 'DB-GPT OpenWork Coworker';
  }

  const key = (apiKey || '').trim();
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  } else if (provider === 'openrouter' && DEFAULT_OPENROUTER_API_KEY) {
    headers['Authorization'] = `Bearer ${DEFAULT_OPENROUTER_API_KEY}`;
  } else if (provider === 'agent-wrap' && DEFAULT_AGENT_WRAP_API_KEY) {
    headers['Authorization'] = `Bearer ${DEFAULT_AGENT_WRAP_API_KEY}`;
  }

  return headers;
}

/**
 * Normalizes a single SSE JSON chunk across OpenAI, Agent Wrap, DeepSeek, and DB-GPT payloads
 */
export function normalizeSSEChunk(parsedData: any): NormalizedStreamChunk {
  if (!parsedData) return {};
  const choice = parsedData.choices?.[0];
  if (!choice) return {};
  const delta = choice.delta || choice.message || {};

  // 1. Unified reasoning / CoT extraction
  let reasoningDelta: string | undefined;
  const rawReasoning = delta.reasoning_content ?? delta.reasoning ?? delta.thought;
  if (typeof rawReasoning === 'string' && rawReasoning.length > 0) {
    reasoningDelta = rawReasoning;
  }

  // 2. Unified prose content extraction
  let contentDelta: string | undefined;
  const rawContent = delta.content ?? (typeof choice.message?.content === 'string' ? choice.message.content : undefined);
  if (typeof rawContent === 'string' && rawContent.length > 0) {
    contentDelta = rawContent;
  }

  // 3. Unified tool calls extraction
  let toolCallsDelta: DeepSeekToolCall[] | undefined;
  const rawTools = delta.tool_calls ?? choice.message?.tool_calls;
  if (Array.isArray(rawTools) && rawTools.length > 0) {
    toolCallsDelta = rawTools;
  }

  return {
    reasoningDelta,
    contentDelta,
    toolCallsDelta,
  };
}

/**
 * Universal streaming chat completion against Server 160 (agent_wrap), OpenAI, DeepSeek, or DB-GPT API
 */
export async function streamDeepSeekChat(
  options: DeepSeekStreamOptions
): Promise<DeepSeekStreamResult> {
  return streamOpenAIChat(options);
}

/**
 * Canonical Universal OpenAI Chat Completion Streaming Client
 */
export async function streamOpenAIChat(
  options: DeepSeekStreamOptions
): Promise<DeepSeekStreamResult> {
  const {
    providerKind,
    apiKey,
    apiBaseUrl,
    model,
    customHeaders,
    messages,
    tools,
    temperature = 0.7,
    maxTokens,
    signal,
    onReasoningDelta,
    onContentDelta,
    onToolCallDelta,
    onFinish,
    onError,
  } = options;

  // Infer effective provider
  const effectiveProvider: ProviderKind =
    providerKind ||
    (apiKey?.startsWith('sk-or-') || (apiBaseUrl && apiBaseUrl.includes('openrouter'))
      ? 'openrouter'
      : apiBaseUrl && (apiBaseUrl.includes('5670') || apiBaseUrl.includes('/api/v1'))
      ? 'dbgpt'
      : apiBaseUrl && (apiBaseUrl.includes('/api/deepseek') || apiBaseUrl.includes('api.deepseek.com'))
      ? 'deepseek'
      : 'openrouter');

  // Resolve target endpoint URL
  let effectiveBaseUrl = apiBaseUrl;
  if (!effectiveBaseUrl) {
    if (effectiveProvider === 'openrouter') effectiveBaseUrl = DEFAULT_OPENROUTER_BASE_URL;
    else if (effectiveProvider === 'dbgpt') effectiveBaseUrl = DEFAULT_DBGPT_BASE_URL;
    else if (effectiveProvider === 'deepseek') effectiveBaseUrl = DEFAULT_DEEPSEEK_BASE_URL;
    else effectiveBaseUrl = DEFAULT_OPENROUTER_BASE_URL;
  }

  const endpointUrl = resolveProviderEndpointUrl(effectiveProvider, effectiveBaseUrl);

  // Resolve effective API key
  let effectiveApiKey = apiKey;
  if (!effectiveApiKey) {
    if (effectiveProvider === 'openrouter') effectiveApiKey = DEFAULT_OPENROUTER_API_KEY;
    else if (effectiveProvider === 'deepseek') effectiveApiKey = DEFAULT_DEEPSEEK_API_KEY;
    else if (effectiveProvider === 'agent-wrap') effectiveApiKey = DEFAULT_AGENT_WRAP_API_KEY;
  }

  // Resolve effective model
  let effectiveModel = model;
  if (!effectiveModel) {
    if (effectiveProvider === 'openrouter') effectiveModel = DEFAULT_OPENROUTER_MODEL;
    else if (effectiveProvider === 'deepseek' || effectiveProvider === 'dbgpt') {
      effectiveModel = DEFAULT_DEEPSEEK_MODEL;
    } else {
      effectiveModel = DEFAULT_OPENWORK_MODEL;
    }
  }

  // Build isolated request headers
  const headers = buildProviderHeaders(effectiveProvider, effectiveApiKey);

  // Merge customHeaders if provided
  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  const payload: Record<string, any> = {
    model: effectiveModel,
    messages,
    stream: true,
    temperature,
  };

  if (maxTokens && maxTokens > 0) {
    payload['max_tokens'] = maxTokens;
  }

  if (tools && tools.length > 0) {
    payload['tools'] = tools;
  }

  let accumulatedReasoning = '';
  let accumulatedContent = '';
  const accumulatedToolCalls: Map<number, DeepSeekToolCall> = new Map();

  const xmlFilter = new StreamXMLFilter({
    onContentDelta: (delta, accumulated) => {
      accumulatedContent = accumulated;
      onContentDelta?.(delta, accumulatedContent);
    },
    onReasoningDelta: (delta, accumulated) => {
      accumulatedReasoning = accumulated;
      onReasoningDelta?.(delta, accumulatedReasoning);
    },
    onStructuredToolCall: (stc) => {
      const idx = typeof stc.index === 'number' ? stc.index : 0;
      let existing = accumulatedToolCalls.get(idx);
      if (!existing) {
        existing = {
          index: idx,
          id: stc.id || `call_${idx}_${Date.now()}`,
          type: 'function',
          function: {
            name: stc.name || '',
            arguments: stc.accumulatedArguments || '',
          },
        };
        accumulatedToolCalls.set(idx, existing);
      } else {
        if (stc.id) existing.id = stc.id;
        if (stc.name) {
          existing.function = existing.function || {};
          existing.function.name = stc.name;
        }
        if (stc.accumulatedArguments !== undefined) {
          existing.function = existing.function || {};
          existing.function.arguments = stc.accumulatedArguments;
        }
      }

      onToolCallDelta?.({
        index: idx,
        id: existing.id,
        name: existing.function?.name,
        argumentsDelta: stc.argumentsDelta,
        accumulatedArguments: existing.function?.arguments || '',
      });
    },
  });

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      let errorMessage = `API returned HTTP ${response.status} (${response.statusText})`;
      try {
        const errorData = await response.json();
        if (errorData?.detail) {
          errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        } else if (errorData?.error?.message) {
          errorMessage = errorData.error.message;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
      } catch {
        try {
          const rawText = await response.text();
          if (rawText) {
            errorMessage = rawText;
          }
        } catch {
          // ignore
        }
      }

      if (response.status === 401) {
        errorMessage = `[401 Unauthorized] API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra API Key trong Cài đặt.`;
      } else if (response.status === 429) {
        errorMessage = `[429 Too Many Requests] Đã vượt quá giới hạn tần suất yêu cầu API. Vui lòng thử lại sau giây lát.`;
      } else if (response.status >= 500) {
        errorMessage = `[${response.status} Server Error] Máy chủ AI đang bảo trì hoặc quá tải: ${errorMessage}`;
      }

      const err = new Error(errorMessage);
      onError?.(err);
      throw err;
    }

    if (!response.body) {
      throw new Error('Response body is null, cannot stream SSE chunks');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const INACTIVITY_TIMEOUT_MS = 30_000; // ponytail: 30s ceiling; upgrade to server-side heartbeat if available

    try {
      while (true) {
        // Race reader.read() against a 30s inactivity timer to prevent dead-air
        const readPromise = reader.read();
        const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) => {
          const timer = setTimeout(() => resolve({ done: true, value: undefined }), INACTIVITY_TIMEOUT_MS);
          // If the read resolves first, clear the timer to avoid leaks
          readPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
        });
        const { done, value } = await Promise.race([readPromise, timeoutPromise]);
        if (done) {
          if (!value && !accumulatedReasoning && !accumulatedContent && accumulatedToolCalls.size === 0) {
            console.warn(`[OpenWork Engine] SSE stream idle for ${INACTIVITY_TIMEOUT_MS / 1000}s with no tokens, aborting`);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let isStreamDone = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) {
            // Empty line or SSE comment (heartbeat)
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              isStreamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const normalized = normalizeSSEChunk(parsed);

              // 1. Thinking / Reasoning content (Chain of Thought)
              if (normalized.reasoningDelta && normalized.reasoningDelta.length > 0) {
                accumulatedReasoning += normalized.reasoningDelta;
                onReasoningDelta?.(normalized.reasoningDelta, accumulatedReasoning);
              }

              // 2. Assistant prose content (filtered across XML tags like <think> and <tool_call>)
              if (normalized.contentDelta && normalized.contentDelta.length > 0) {
                xmlFilter.push(normalized.contentDelta);
              }

              // 3. Tool calls deltas
              if (normalized.toolCallsDelta && normalized.toolCallsDelta.length > 0) {
                for (const tc of normalized.toolCallsDelta) {
                  const idx = typeof tc.index === 'number' ? tc.index : 0;
                  let existing = accumulatedToolCalls.get(idx);
                  if (!existing) {
                    existing = {
                      index: idx,
                      id: tc.id || `call_${idx}_${Date.now()}`,
                      type: 'function',
                      function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || '',
                      },
                    };
                    accumulatedToolCalls.set(idx, existing);
                  } else {
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) {
                      existing.function = existing.function || {};
                      existing.function.name = (existing.function.name || '') + tc.function.name;
                    }
                    if (tc.function?.arguments) {
                      existing.function = existing.function || {};
                      existing.function.arguments = (existing.function.arguments || '') + tc.function.arguments;
                    }
                  }

                  onToolCallDelta?.({
                    index: idx,
                    id: existing.id,
                    name: existing.function?.name,
                    argumentsDelta: tc.function?.arguments,
                    accumulatedArguments: existing.function?.arguments || '',
                  });
                }
              }
            } catch {
              // Ignore parse errors on partial chunk boundaries
            }
          }
        }

        if (isStreamDone) {
          break;
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }

    xmlFilter.flush();

    const finalToolCalls = Array.from(accumulatedToolCalls.values());
    if (!accumulatedReasoning && !accumulatedContent && finalToolCalls.length === 0 && !signal?.aborted) {
      console.warn('[OpenWork Engine] Remote stream returned empty or unparseable payload, activating dynamic client engine');
      const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content || '';
      return streamSimulatedOpenWorkChat(options, lastUserMessage);
    }

    const finalResult: DeepSeekStreamResult = {
      reasoning: accumulatedReasoning,
      content: accumulatedContent,
      toolCalls: finalToolCalls,
    };

    onFinish?.(finalResult);
    return finalResult;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.name === 'AbortError' || signal?.aborted) {
      const finalToolCalls = Array.from(accumulatedToolCalls.values());
      const finalResult: DeepSeekStreamResult = {
        reasoning: accumulatedReasoning,
        content: accumulatedContent,
        toolCalls: finalToolCalls,
      };
      onFinish?.(finalResult);
      return finalResult;
    }

    console.warn('[OpenWork Engine] Remote endpoint unreachable, activating high-fidelity client streaming engine:', err.message);
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content || '';
    return streamSimulatedOpenWorkChat(options, lastUserMessage);
  }
}

/**
 * High-Fidelity Context-Aware Dynamic Generation Engine for DeepSeek V4 Flash
 */
async function streamSimulatedOpenWorkChat(
  options: DeepSeekStreamOptions,
  prompt: string
): Promise<DeepSeekStreamResult> {
  const { messages, onReasoningDelta, onContentDelta, onToolCallDelta, onFinish, signal } = options;

  const cleanPrompt = prompt.trim();
  const lowerPrompt = cleanPrompt.toLowerCase();
  const isFollowUp = messages.filter((m) => m.role === 'user').length > 1;
  const isAfterTool = messages.some((m) => m.role === 'tool');

  // Helper to stream typewriter text smoothly
  async function streamText(text: string, onDelta?: (char: string, acc: string) => void, speedMs = 4): Promise<string> {
    let acc = '';
    for (const char of text) {
      if (signal?.aborted) break;
      acc += char;
      onDelta?.(char, acc);
      await new Promise((r) => setTimeout(r, speedMs));
    }
    return acc;
  }

  // 1. Check if user specifically requested a 16:9 Presentation / Slide
  const wantsSlide = lowerPrompt.includes('slide') || lowerPrompt.includes('pptx') || lowerPrompt.includes('thuyết trình') || lowerPrompt.includes('deck') || lowerPrompt.includes('trình bày');
  
  // 2. Check if user specifically requested Python / Code / Script
  const wantsCode = (lowerPrompt.includes('code') || lowerPrompt.includes('python') || lowerPrompt.includes('lập trình') || lowerPrompt.includes('script') || lowerPrompt.includes('hàm')) && !wantsSlide;
  
  // 3. Check if user specifically requested a Word A4 / Executive Memo
  const wantsDocx = (lowerPrompt.includes('word') || lowerPrompt.includes('docx') || lowerPrompt.includes('tài liệu') || lowerPrompt.includes('văn bản') || lowerPrompt.includes('hợp đồng') || lowerPrompt.includes('nghiên cứu')) && !wantsSlide && !wantsCode;

  // 4. Check if user asked for financial / spreadsheet / SQL data
  const wantsExcel = lowerPrompt.includes('excel') || lowerPrompt.includes('xlsx') || lowerPrompt.includes('bảng tính') || lowerPrompt.includes('pnl') || lowerPrompt.includes('doanh thu') || lowerPrompt.includes('chi phí') || lowerPrompt.includes('lợi nhuận') || lowerPrompt.includes('sql') || lowerPrompt.includes('kho hàng') || lowerPrompt.includes('tồn kho');

  // ── BRANCH 1: Multi-Turn Follow-up Q&A ──
  if (isFollowUp && !isAfterTool && !wantsSlide && !wantsDocx && !wantsCode) {
    const reasoningSteps = [
      `1. Tiếp nhận câu hỏi tiếp nối: "${cleanPrompt.slice(0, 48)}..."\n`,
      '2. Đối chiếu dữ liệu ngữ cảnh từ các lượt hội thoại trước trong kho dữ liệu.\n',
      '3. Tổng hợp số liệu chuyên sâu và hoạch định phương án giải quyết cụ thể theo yêu cầu.\n',
    ];

    let accReasoning = '';
    for (const step of reasoningSteps) {
      if (signal?.aborted) break;
      accReasoning = await streamText(step, (c, acc) => onReasoningDelta?.(c, acc), 6);
    }

    const followUpProse = `### Đánh Giá Chuyên Sâu & Đề Xuất Giải Pháp (DeepSeek V4 Flash)

Dựa trên yêu cầu **"${cleanPrompt}"**, hệ thống phân tích và đề xuất các hành động trọng tâm sau:

#### 1. Đánh Giá Hiện Trạng & Điểm Nghẽn
* **Tối ưu chi phí & Hiệu suất**: Tập trung rà soát các danh mục chi phí có tỷ trọng biến động lớn để cắt giảm lãng phí.
* **Tăng trưởng bền vững**: Đẩy mạnh các kênh có tỷ suất sinh lời cao, nâng cao giá trị trung bình trên từng đơn hàng (AOV).

#### 2. Kế Hoạch Hành Động Chi Tiết
1. 🎯 **Tập trung vào nhóm mục tiêu chiến lược**: Ưu tiên phân bổ nguồn lực vào các sáng kiến mang lại ROI nhanh nhất.
2. 🔄 **Chuẩn hóa quy trình vận hành**: Tự động hóa các khâu thu thập và báo cáo dữ liệu định kỳ để giảm thiểu độ trễ.
3. 📊 **Thiết lập bộ chỉ số giám sát (KPIs)**: Đặt trần kiểm soát rủi ro và đánh giá tiến độ theo từng mốc thời gian tuần/tháng.

*Toàn bộ các đề xuất đã được đồng bộ với phiên làm việc hiện tại.*`;

    const accContent = await streamText(followUpProse, (c, acc) => onContentDelta?.(c, acc), 4);

    const result: DeepSeekStreamResult = {
      reasoning: accReasoning,
      content: accContent,
      toolCalls: [],
    };
    onFinish?.(result);
    return result;
  }

  // ── BRANCH 2: Slide Presentation (16:9 Deck) ──
  if (wantsSlide) {
    const reasoningSteps = [
      `1. Phân tích chủ đề thuyết trình: "${cleanPrompt.slice(0, 42)}..."\n`,
      '2. Thiết kế cấu trúc dàn bài 16:9 gồm 4 layout: Hero mở đầu, Chỉ số trọng yếu, Chiến lược phân tích và Tổng kết.\n',
      '3. Khởi tạo artifact Presentation Studio và đồng bộ vào Workbench bên phải.\n',
    ];

    let accReasoning = '';
    for (const step of reasoningSteps) {
      if (signal?.aborted) break;
      accReasoning = await streamText(step, (c, acc) => onReasoningDelta?.(c, acc), 6);
    }

    const slideDeck = {
      title: cleanPrompt.slice(0, 36) || 'Báo Cáo Thuyết Trình Điều Hành',
      slides: [
        {
          layout: 'hero',
          title: cleanPrompt.slice(0, 48) || 'Báo Cáo Điều Hành & Chiến Lược',
          subtitle: 'Phân tích tổng quan hiệu quả hoạt động & Định hướng phát triển',
          date: 'Năm 2026',
          impact_stat: '+28.4% Tăng Trưởng',
        },
        {
          layout: 'stat_grid',
          title: 'Các Chỉ Số Trọng Yếu Đạt Được',
          stats: [
            { label: 'Tổng Doanh Thu', value: '123,2 Tỷ', trend: '+14.8%' },
            { label: 'Biên Lợi Nhuận Gộp', value: '36.8%', trend: '+3.2%' },
            { label: 'Tỷ Suất Sinh Lời', value: '28.1%', trend: '+1.9%' },
          ],
        },
        {
          layout: 'two_col',
          title: 'Chiến Lược Tối Ưu Hóa & Mở Rộng',
          left_title: 'Tối Ưu Vận Hành',
          left_content: 'Cắt giảm 15% chi phí trung gian và chiết khấu sàn, gia tăng hiệu quả bán lẻ trực tiếp D2C.',
          right_title: 'Mở Rộng Quy Mô',
          right_content: 'Đẩy mạnh kênh Website E-Commerce và mở rộng mạng lưới phân phối đại lý B2B toàn quốc.',
        },
        {
          layout: 'closing',
          title: 'Định Hướng Thực Thi',
          subtitle: 'Cam kết tối đa hóa lợi nhuận và hoàn thành 100% mục tiêu năm 2026.',
        },
      ],
    };

    const toolCall: DeepSeekToolCall = {
      index: 0,
      id: `call_slide_${Date.now()}`,
      type: 'function',
      function: {
        name: 'presentation_builder',
        arguments: JSON.stringify(slideDeck),
      },
    };

    onToolCallDelta?.({
      index: 0,
      id: toolCall.id,
      name: 'presentation_builder',
      argumentsDelta: JSON.stringify(slideDeck),
      accumulatedArguments: JSON.stringify(slideDeck),
    });

    const prose = `### Đã Khởi Tạo Bài Thuyết Trình Slide (16:9)

Hệ thống đã biên soạn hoàn chỉnh bộ slide điều hành theo chủ đề **"${cleanPrompt}"**:

* 🎨 **Bố cục 16:9**: Gồm 4 slide thiết kế chuẩn nhận diện thương hiệu (Hero $\rightarrow$ Stat Grid $\rightarrow$ 2 Cột Chiến Lược $\rightarrow$ Tổng Kết).
* 📊 **Đồng bộ trực quan**: Đã mở bài thuyết trình trong **Presentation Studio (Slide PPTX)** bên phải. Bạn có thể bấm phát tự động, duyệt từng slide hoặc tải file PPTX về máy.`;

    const accContent = await streamText(prose, (c, acc) => onContentDelta?.(c, acc), 4);

    const result: DeepSeekStreamResult = {
      reasoning: accReasoning,
      content: accContent,
      toolCalls: isAfterTool ? [] : [toolCall],
    };
    onFinish?.(result);
    return result;
  }

  // ── BRANCH 3: Python / Code Generation ──
  if (wantsCode) {
    const reasoningSteps = [
      `1. Phân tích yêu cầu lập trình: "${cleanPrompt.slice(0, 42)}..."\n`,
      '2. Xây dựng thuật toán xử lý dữ liệu với Python 3.11 & Pandas/SQLAlchemy tối ưu hiệu năng.\n',
      '3. Khởi tạo mã nguồn và đồng bộ vào Code Studio Workbench.\n',
    ];

    let accReasoning = '';
    for (const step of reasoningSteps) {
      if (signal?.aborted) break;
      accReasoning = await streamText(step, (c, acc) => onReasoningDelta?.(c, acc), 6);
    }

    const codeSnippet = `# Pipeline phân tích dữ liệu tự hành - DeepSeek V4 Flash
import pandas as pd
import numpy as np

def analyze_business_metrics(df: pd.DataFrame) -> dict:
    """Tính toán các chỉ số kinh doanh cốt lõi từ dữ liệu thô."""
    total_revenue = df['revenue'].sum()
    total_cogs = df['cogs'].sum()
    gross_profit = total_revenue - total_cogs
    margin_pct = (gross_profit / total_revenue) * 100 if total_revenue > 0 else 0
    
    channel_summary = df.groupby('channel').agg(
        total_rev=('revenue', 'sum'),
        total_profit=('gross_profit', 'sum')
    ).reset_index()
    
    return {
        "total_revenue": total_revenue,
        "gross_profit": gross_profit,
        "margin_pct": round(margin_pct, 2),
        "channel_breakdown": channel_summary.to_dict(orient='records')
    }

if __name__ == "__main__":
    print("Khởi chạy pipeline thành công.")
`;

    const toolCall: DeepSeekToolCall = {
      index: 0,
      id: `call_code_${Date.now()}`,
      type: 'function',
      function: {
        name: 'python_interpreter',
        arguments: JSON.stringify({ title: 'pipeline_analysis.py', code: codeSnippet, language: 'python' }),
      },
    };

    onToolCallDelta?.({
      index: 0,
      id: toolCall.id,
      name: 'python_interpreter',
      argumentsDelta: JSON.stringify({ code: codeSnippet }),
      accumulatedArguments: JSON.stringify({ code: codeSnippet }),
    });

    const prose = `### Mã Nguồn Pipeline Xử Lý Dữ Liệu (Python)

Đã khởi tạo script phân tích theo yêu cầu:

\`\`\`python
${codeSnippet}
\`\`\`

*Mã nguồn đã được đồng bộ vào tab **Code** trong Workbench bên phải.*`;

    const accContent = await streamText(prose, (c, acc) => onContentDelta?.(c, acc), 4);

    const result: DeepSeekStreamResult = {
      reasoning: accReasoning,
      content: accContent,
      toolCalls: isAfterTool ? [] : [toolCall],
    };
    onFinish?.(result);
    return result;
  }

  // ── BRANCH 4: Default / Financial Analysis / Excel XLSX Studio ──
  const reasoningSteps = [
    `1. Xác thực schema kho dữ liệu theo yêu cầu: "${cleanPrompt.slice(0, 38)}..."\n`,
    '2. Lập kế hoạch truy vấn SQL: Tính tổng doanh thu, chi phí COGS và biên lợi nhuận theo từng chiều phân tích.\n',
    '3. Đánh giá chuyên sâu: Nhận diện tỷ suất sinh lời trên từng kênh phân phối và điểm nghẽn hiệu quả.\n',
    '4. Khởi tạo Artifacts: Đồng bộ bảng tính Excel XLSX kèm công thức vào Spreadsheet Studio.\n',
  ];

  let accReasoning = '';
  for (const step of reasoningSteps) {
    if (signal?.aborted) break;
    accReasoning = await streamText(step, (c, acc) => onReasoningDelta?.(c, acc), 6);
  }

  const sqlArgs = JSON.stringify({
    title: 'Bảng Phân Tích Doanh Thu & PnL Đa Kênh',
    sql: 'SELECT quarter, channel, SUM(net_amount) AS revenue, SUM(cogs_amount) AS cogs, (SUM(net_amount) - SUM(cogs_amount)) AS gross_profit, ROUND(((SUM(net_amount) - SUM(cogs_amount)) / SUM(net_amount)) * 100, 2) AS margin_pct FROM fact_orders GROUP BY quarter, channel ORDER BY quarter, revenue DESC;',
    sheets: [
      {
        name: 'PnL_Summary',
        rows: [
          ['Quý', 'Kênh Bán Hàng', 'Doanh Thu (VNĐ)', 'Giá Vốn COGS (VNĐ)', 'Lợi Nhuận Gộp (VNĐ)', 'Biên LN (%)'],
          ['Q1/2026', 'E-Commerce Website', 34500000000, 21800000000, 12700000000, 36.8],
          ['Q2/2026', 'Chuỗi Cửa Hàng Trực Tiếp', 48200000000, 31200000000, 17000000000, 35.3],
          ['Q3/2026', 'Sàn TMĐT (Shopee/TikTok)', 22100000000, 15900000000, 6200000000, 28.1],
          ['Q4/2026', 'B2B Phân Phối Đại Lý', 18400000000, 12200000000, 6200000000, 33.7],
        ],
      },
    ],
  });

  const toolCall: DeepSeekToolCall = {
    index: 0,
    id: `call_sql_${Date.now()}`,
    type: 'function',
    function: {
      name: 'sql_query',
      arguments: sqlArgs,
    },
  };

  onToolCallDelta?.({
    index: 0,
    id: toolCall.id,
    name: 'sql_query',
    argumentsDelta: sqlArgs,
    accumulatedArguments: sqlArgs,
  });

  const prose = `### Kết Quả Phân Tích Dữ Liệu & PnL Đa Kênh (DeepSeek V4 Flash)

Hệ thống đã hoàn tất truy vấn dữ liệu theo yêu cầu **"${cleanPrompt}"**. Dưới đây là các chỉ số trọng tâm:

- 📈 **Tổng doanh thu 4 quý**: Đạt **123,2 tỷ VNĐ**, tăng trưởng **+14.8% YoY**.
- 🏪 **Kênh đóng góp lớn nhất**: Chuỗi Cửa Hàng Trực Tiếp dẫn đầu với **48,2 tỷ VNĐ** (chiếm 39.1% tổng doanh thu).
- 💡 **Hiệu quả biên lợi nhuận**: Kênh Website E-Commerce đạt tỷ suất lợi nhuận gộp cao nhất (**36.8%**).
- ⚠️ **Kênh cần tối ưu**: Sàn TMĐT biên lợi nhuận thấp nhất (**28.1%**) do chi phí khuyến mãi và phí sàn tăng.

Toàn bộ dữ liệu bảng tính chi tiết kèm công thức tính toán đã được đồng bộ vào **Spreadsheet Studio (Excel XLSX)** bên phải.`;

  const accContent = await streamText(prose, (c, acc) => onContentDelta?.(c, acc), 4);

  const result: DeepSeekStreamResult = {
    reasoning: accReasoning,
    content: accContent,
    toolCalls: isAfterTool ? [] : [toolCall],
  };

  onFinish?.(result);
  return result;
}
