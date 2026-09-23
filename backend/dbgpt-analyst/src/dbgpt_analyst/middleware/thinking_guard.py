"""agent_core/ai_data_analytic_agent/middleware/thinking_guard.py

Thinking stream token exhaustion guardrail inspired by Kimi CLI/kosong.
Captures reasoning content deltas and safe-guards against empty outputs.
"""
from typing import Any, AsyncGenerator


class APIEmptyResponseError(Exception):
    """Raised when model output token budget is exhausted inside thinking block without generating answer text."""
    pass


class ThinkingGuardMiddleware:
    def __init__(self, fallback_prompt: str = "[Notice: Reasoning complete. Completing response synthesis...]"):
        self.fallback_prompt = fallback_prompt

    async def process_stream(
        self,
        stream_generator: AsyncGenerator[dict[str, Any], None]
    ) -> AsyncGenerator[dict[str, Any], None]:
        has_thinking = False
        has_text_or_tool = False

        async for chunk in stream_generator:
            if not isinstance(chunk, dict):
                yield chunk
                continue

            chunk_type = chunk.get("type")
            payload = chunk.get("payload") or {}

            if chunk_type in ("think_part", "thinking_delta"):
                has_thinking = True
            elif chunk_type in ("text_part", "answer_delta"):
                text_val = payload.get("text") if "text" in payload else payload.get("delta", "")
                if text_val is not None and str(text_val).strip() != "":
                    has_text_or_tool = True
            elif chunk_type in ("tool_call", "task_call", "document_block"):
                has_text_or_tool = True

            yield chunk

        if has_thinking and not has_text_or_tool:
            # Token budget exhausted in thinking block
            fallback_text = self.fallback_prompt
            if not fallback_text.startswith("\n"):
                fallback_text = f"\n{fallback_text}"
            if not fallback_text.endswith("\n"):
                fallback_text = f"{fallback_text}\n"

            yield {
                "type": "text_part",
                "payload": {
                    "text": fallback_text
                }
            }
        elif not has_thinking and not has_text_or_tool:
            raise APIEmptyResponseError("Reasoning stream ended with no text, thinking, or tool calls.")