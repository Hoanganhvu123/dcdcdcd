"""Planning & HITL Business Domain Events.

Handles:
- Plan prompts & strategic roadmaps (data-plan-prompt)
- Todo items and execution checklists (data-todos)
- Human-in-the-loop decisions (input.required)
"""

from __future__ import annotations

from typing import Any
from ..shared.stream_utils import sse_json


def emit_plan_prompt(plan_data: dict[str, Any]) -> str:
    """Format strategic plan for user approval."""
    payload = plan_data.get("payload", plan_data) if isinstance(plan_data, dict) else plan_data
    return sse_json({"type": "data-plan-prompt", "data": payload})


def emit_todos(todos: list[dict[str, Any]] | dict[str, Any]) -> str:
    """Format checklist of execution steps."""
    return sse_json({"type": "data-todos", "data": todos})


def emit_input_required(checkpoint_id: str, question: str, options: list[str] | None = None) -> str:
    """Format interrupt waiting for human steering."""
    return sse_json({
        "type": "input.required",
        "data": {
            "checkpointId": checkpoint_id,
            "question": question,
            "options": options or [],
        }
    })


__all__ = [
    "emit_plan_prompt",
    "emit_todos",
    "emit_input_required",
]
