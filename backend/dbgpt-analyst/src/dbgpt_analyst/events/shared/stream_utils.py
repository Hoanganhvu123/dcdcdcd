"""Utility helpers for SSE streaming in dbgpt-analyst.

Provides:
- SSE formatting helpers
- Content extraction from LLM chunks (str/list formats)
- Tool output parsing
"""

from __future__ import annotations

import json
from typing import Any


def sse_json(data: dict, **kwargs: Any) -> str:
    """Format a dict as an SSE `data:` line."""
    return f"data: {json.dumps(data, ensure_ascii=False, default=str, **kwargs)}\n\n"


def sse_text_start(part_id: str) -> str:
    return sse_json({"type": "text-start", "id": part_id})


def sse_text_delta(part_id: str, delta: str) -> str:
    return sse_json({"type": "text-delta", "id": part_id, "delta": delta})


def sse_text_end(part_id: str) -> str:
    return sse_json({"type": "text-end", "id": part_id})


def sse_reasoning_token(token: str) -> str:
    return sse_json({"type": "data-reasoning-token", "data": token})


def sse_reasoning_done(text: str) -> str:
    return sse_json({"type": "data-reasoning-done", "data": text})


def sse_reasoning_step(data: dict) -> str:
    return sse_json({"type": "data-reasoning-step", "data": data})


def sse_extract_result(data: dict) -> str:
    return sse_json({"type": "data-extract-result", "data": data})


def sse_documents(documents: list) -> str:
    return f"data: {json.dumps({'type': 'data-documents', 'data': documents}, default=str, ensure_ascii=False)}\n\n"


def sse_thread_id(thread_id: str) -> str:
    return sse_json({"type": "data-thread-id", "data": {"threadId": thread_id}})


def sse_error(error_text: str) -> str:
    return sse_json({"type": "error", "errorText": error_text, "data": error_text})


def extract_text_token(raw_content: Any) -> str:
    """Extract text from LLM chunk content."""
    if isinstance(raw_content, str):
        return raw_content
    if isinstance(raw_content, list):
        parts = []
        for part in raw_content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
        return "".join(parts)
    return ""


__all__ = [
    "sse_json",
    "sse_text_start",
    "sse_text_delta",
    "sse_text_end",
    "sse_reasoning_token",
    "sse_reasoning_done",
    "sse_reasoning_step",
    "sse_extract_result",
    "sse_documents",
    "sse_thread_id",
    "sse_error",
    "extract_text_token",
]
