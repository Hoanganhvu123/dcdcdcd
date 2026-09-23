/**
 * Universal OpenAI-Compatible Chat Completion SSE Streaming Client
 * Primary Gateway: OpenRouter (https://openrouter.ai/api/v1 or /api/openrouter/v1)
 * Default Model: DeepSeek V4 Flash (deepseek-v4-flash)
 *
 * Supported Engines:
 *   - OpenRouter Gateway (deepseek-v4-flash - Primary official analytics engine)
 *   - DeepSeek Official API (/api/deepseek or https://api.deepseek.com)
 *   - DB-GPT Local Backend (/api/v1 or http://127.0.0.1:5670/api/v1)
 *
 * Handles live delta decoding for reasoning_content / thought, tool_calls, and assistant prose.
 */

import type { ProviderKind } from '../types';
import {
  DEFAULT_OPENROUTER_API_KEY,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_DEEPSEEK_API_KEY,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DBGPT_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_DBGPT_MODEL,
  DEEPSEEK_OFFICIAL_MODELS,
  DEFAULT_AGENT_WRAP_BASE_URL,
  DEFAULT_AGENT_WRAP_API_KEY,
  DEFAULT_OPENWORK_MODEL,
  ALLOWED_AGENT_WRAP_MODELS,
  normalizeProviderUrl,
  resolveProviderEndpointUrl,
  resolveDeepSeekUrl,
  buildProviderHeaders,
  normalizeSSEChunk,
  streamDeepSeekChat,
  streamOpenAIChat,
  type DeepSeekChatMessage as OpenAIChatMessage,
  type DeepSeekToolCall as OpenAIToolCall,
  type DeepSeekToolDefinition as OpenAIToolDefinition,
  type DeepSeekStreamOptions as OpenAIStreamOptions,
  type DeepSeekStreamResult as OpenAIStreamResult,
  type NormalizedStreamChunk,
} from './deepseek-stream';

export {
  DEFAULT_OPENROUTER_API_KEY,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_DEEPSEEK_API_KEY,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DBGPT_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_DBGPT_MODEL,
  DEEPSEEK_OFFICIAL_MODELS,
  DEFAULT_AGENT_WRAP_BASE_URL,
  DEFAULT_AGENT_WRAP_API_KEY,
  DEFAULT_OPENWORK_MODEL,
  ALLOWED_AGENT_WRAP_MODELS,
  normalizeProviderUrl,
  resolveProviderEndpointUrl,
  resolveDeepSeekUrl,
  buildProviderHeaders,
  normalizeSSEChunk,
  streamDeepSeekChat,
  streamOpenAIChat,
};

export type {
  OpenAIChatMessage,
  OpenAIToolCall,
  OpenAIToolDefinition,
  OpenAIStreamOptions,
  OpenAIStreamResult,
  NormalizedStreamChunk,
  ProviderKind,
};
