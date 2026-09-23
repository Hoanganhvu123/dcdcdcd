"""events/lifecycle_events.py — Engine and Agent lifecycle events."""
from __future__ import annotations

from typing import Any, Literal
from pydantic import Field

from dbgpt_analyst.events.base import BaseEvent


class PhaseEvent(BaseEvent):
    type: Literal["phase"] = "phase"
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentSpawnedEvent(BaseEvent):
    """Fired when a new Sub-Agent is invoked by a parent agent."""
    type: Literal["agent_spawned"] = "agent_spawned"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["running"] = "running"


class AgentCompletedEvent(BaseEvent):
    """Fired when a Sub-Agent finishes its execution."""
    type: Literal["agent_completed"] = "agent_completed"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["done"] = "done"


class ErrorEvent(BaseEvent):
    type: Literal["error"] = "error"
    payload: dict[str, str] = Field(default_factory=dict)
    status: Literal["error"] = "error"


class FinalEvent(BaseEvent):
    """Final output from the root orchestrator."""
    type: Literal["final"] = "final"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["done"] = "done"


class CheckpointSavedEvent(BaseEvent):
    type: Literal["checkpoint_saved"] = "checkpoint_saved"
    payload: dict[str, Any] = Field(default_factory=dict)


class SessionEvictedEvent(BaseEvent):
    type: Literal["session_evicted"] = "session_evicted"
    payload: dict[str, Any] = Field(default_factory=dict)


class NodeStartEvent(BaseEvent):
    type: Literal["node_start"] = "node_start"
    payload: dict[str, Any] = Field(default_factory=dict)


class NodeEndEvent(BaseEvent):
    type: Literal["node_end"] = "node_end"
    payload: dict[str, Any] = Field(default_factory=dict)


class RunStartEvent(BaseEvent):
    type: Literal["run_start"] = "run_start"
    payload: dict[str, Any] = Field(default_factory=dict)


class RunEndEvent(BaseEvent):
    type: Literal["run_end"] = "run_end"
    payload: dict[str, Any] = Field(default_factory=dict)
