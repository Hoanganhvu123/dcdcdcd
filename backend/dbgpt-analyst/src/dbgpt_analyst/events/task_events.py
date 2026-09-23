"""events/task_events.py — Workflow tasks and client effects envelope events."""
from __future__ import annotations

from typing import Any, Literal
from pydantic import Field

from dbgpt_analyst.events.base import BaseEvent


class StructuredInputEvent(BaseEvent):
    type: Literal["structured_input"] = "structured_input"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["done"] = "done"


class WorkflowTaskEvent(BaseEvent):
    type: Literal["workflow_task"] = "workflow_task"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["running", "done", "error"] | None = None


class ClientEffectEvent(BaseEvent):
    type: Literal["client_effect"] = "client_effect"
    payload: dict[str, Any] = Field(default_factory=dict)


class TaskCallEvent(BaseEvent):
    type: Literal["task_call"] = "task_call"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["running"] = "running"
