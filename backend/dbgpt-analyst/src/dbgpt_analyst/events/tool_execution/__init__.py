"""Tool Execution & Evidence Business Domain Events.

Handles:
- Tool execution lifecycle (tool.started, tool.progress, tool.completed, tool.failed)
- Search extract parameters (data-extract-result)
- Grounding documents & references (data-documents)
"""

from __future__ import annotations

from typing import Any
from ..shared.stream_utils import (
    sse_documents,
    sse_extract_result,
    sse_json,
)


def emit_tool_extract_result(extract_data: dict[str, Any]) -> str:
    """Format tool parameters into extract result card."""
    return sse_extract_result(extract_data)


def emit_documents(documents: list[dict[str, Any]]) -> str:
    """Format statutory / data grounding documents for citation."""
    return sse_documents(documents)


def emit_tool_call_started(tool_call_id: str, tool_name: str, args: dict[str, Any] | None = None) -> str:
    """Format tool invocation start event."""
    return sse_json({
        "type": "tool.started",
        "toolCallId": tool_call_id,
        "tool": tool_name,
        "args": args or {},
    })


def emit_tool_call_completed(tool_call_id: str, tool_name: str, result_summary: str, elapsed_ms: float = 0.0) -> str:
    """Format tool execution completion event."""
    return sse_json({
        "type": "tool.completed",
        "toolCallId": tool_call_id,
        "tool": tool_name,
        "summary": result_summary,
        "elapsedMs": elapsed_ms,
    })


__all__ = [
    "emit_tool_extract_result",
    "emit_documents",
    "emit_tool_call_started",
    "emit_tool_call_completed",
]
