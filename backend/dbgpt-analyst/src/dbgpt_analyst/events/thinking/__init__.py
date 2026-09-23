"""Thinking / Reasoning Business Domain Events.

Handles:
- CoT reasoning token streaming (thinking delta)
- Step progression and phase shifts (thinking_step)
- Completion and closeouts (thinking_done)
"""

from __future__ import annotations

from typing import Any
from ..shared.stream_utils import sse_json, sse_reasoning_step


def emit_thinking_token(token: str, node: str = "global") -> str:
    """Format an incremental reasoning token for thinking stream."""
    return sse_json({"type": "thinking", "content": token, "data": token, "node": node})


def emit_thinking_done(final_thought: str = "", node: str = "global") -> str:
    """Format thinking phase completion event."""
    return sse_json({"type": "thinking_done", "content": final_thought, "data": final_thought, "node": node})


def emit_thinking_step(step_data: dict[str, Any], node: str = "global") -> str:
    """Format a strategic thought step with action and description."""
    if isinstance(step_data, dict) and "node" not in step_data:
        step_data = {**step_data, "node": node}
    return sse_reasoning_step(step_data)


# Backward-compatible aliases for legacy callers
emit_reasoning_token = emit_thinking_token
emit_reasoning_done = emit_thinking_done
emit_reasoning_step = emit_thinking_step

__all__ = [
    "emit_thinking_token",
    "emit_thinking_done",
    "emit_thinking_step",
    "emit_reasoning_token",
    "emit_reasoning_done",
    "emit_reasoning_step",
]
