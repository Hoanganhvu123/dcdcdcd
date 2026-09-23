"""Shared Event Payload Definitions for Frontend Streaming.

Universal event models used across all graph nodes, lifecycle managers, and SSE adapters.
Every event carries optional 'node' identification so Frontend can isolate rendering context.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class BaseEventPayload(BaseModel):
    """Base event payload contract with node origin tracking."""

    type: str
    node: str = Field(
        default="global",
        description="Graph node that emitted this event",
    )


class ThinkingPayload(BaseModel):
    """Realtime thinking / reasoning token delta emitted during <think> phase."""

    type: Literal["thinking"] = "thinking"
    content: str = Field(..., description="Incremental thinking text token")
    node: str = Field(
        default="global",
        description="Origin node: classifier, sql_analyst, supervisor, answer, artifact",
    )


class ThinkingDonePayload(BaseModel):
    """Completion signal for a node's <think> phase."""

    type: Literal["thinking_done"] = "thinking_done"
    content: str = Field(default="", description="Consolidated thought summary")
    node: str = Field(
        default="global",
        description="Origin node that completed its thinking phase",
    )


class TodoItemSchema(BaseModel):
    id: int
    title: str
    status: Literal["pending", "in_progress", "completed", "failed"] = "pending"
    detail: str = ""


class TodosUpdatePayload(BaseModel):
    type: Literal["todos_update"] = "todos_update"
    todos: Optional[List[TodoItemSchema]] = None
    step_id: Optional[int] = None
    status: Optional[str] = None
    detail: Optional[str] = None
    node: str = "planner"


class SubagentStartPayload(BaseModel):
    type: Literal["subagent_start"] = "subagent_start"
    id: str = Field(..., description="Unique tool_call_id or subagent task ID")
    name: str = Field(..., description="Subagent name e.g. sql_analyst")
    status: Literal["running"] = "running"
    task: str = Field(..., description="Brief task description")
    node: str = "subagents"


class SubagentTokenPayload(BaseModel):
    type: Literal["subagent_token"] = "subagent_token"
    id: str
    subagent: str
    delta: str
    node: str = "subagents"


class SubagentCompletePayload(BaseModel):
    type: Literal["subagent_complete"] = "subagent_complete"
    id: str
    name: str
    status: Literal["complete", "error"] = "complete"
    output: Optional[str] = None
    node: str = "subagents"


class SkillLoadedPayload(BaseModel):
    type: Literal["skill_loaded"] = "skill_loaded"
    skill_name: str
    domain: str
    node: str = "skills"


class AuditCardPayload(BaseModel):
    type: Literal["data-audit-card"] = "data-audit-card"
    data: Dict[str, Any] = Field(..., description="Audit Card payload")
    node: str = "auditor"


__all__ = [
    "BaseEventPayload",
    "ThinkingPayload",
    "ThinkingDonePayload",
    "TodoItemSchema",
    "TodosUpdatePayload",
    "SubagentStartPayload",
    "SubagentTokenPayload",
    "SubagentCompletePayload",
    "SkillLoadedPayload",
    "AuditCardPayload",
]
