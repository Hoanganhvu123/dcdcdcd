"""events/streaming_events.py — Standard SSE streaming envelope events."""
from __future__ import annotations

from typing import Any, Literal
from pydantic import Field

from dbgpt_analyst.events.base import BaseEvent


class ThinkingDeltaEvent(BaseEvent):
    type: Literal["thinking_delta"] = "thinking_delta"
    payload: dict[str, str] = Field(default_factory=dict)


class AnswerDeltaEvent(BaseEvent):
    type: Literal["answer_delta"] = "answer_delta"
    payload: dict[str, str] = Field(default_factory=dict)


class ReasoningEvent(BaseEvent):
    type: Literal["reasoning"] = "reasoning"
    payload: dict[str, str] = Field(default_factory=dict)


class SQLDeltaEvent(BaseEvent):
    type: Literal["sql_delta"] = "sql_delta"
    payload: dict[str, str] = Field(default_factory=dict)
    phase: Literal["generating"] = "generating"


class SQLPlanDeltaEvent(BaseEvent):
    type: Literal["sql_plan_delta"] = "sql_plan_delta"
    payload: dict[str, Any] = Field(default_factory=dict)
    phase: Literal["planning"] = "planning"


class TableConsideredEvent(BaseEvent):
    type: Literal["table_considered"] = "table_considered"
    payload: dict[str, str] = Field(default_factory=dict)
    phase: Literal["exploring"] = "exploring"


class TableSelectedEvent(BaseEvent):
    type: Literal["table_selected"] = "table_selected"
    payload: dict[str, Any] = Field(default_factory=dict)
    phase: Literal["exploring"] = "exploring"


class JoinPathEvent(BaseEvent):
    type: Literal["join_path"] = "join_path"
    payload: dict[str, Any] = Field(default_factory=dict)
    phase: Literal["exploring"] = "exploring"


class SQLValidatedEvent(BaseEvent):
    type: Literal["sql_validated"] = "sql_validated"
    payload: dict[str, Any] = Field(default_factory=dict)


class RowBatchEvent(BaseEvent):
    type: Literal["row_batch"] = "row_batch"
    payload: dict[str, Any] = Field(default_factory=dict)
    phase: Literal["executing"] = "executing"


class ChartSpecEvent(BaseEvent):
    type: Literal["chart_spec"] = "chart_spec"
    payload: dict[str, Any] = Field(default_factory=dict)
    phase: Literal["insights"] = "insights"


class PhaseEvent(BaseEvent):
    type: Literal["phase"] = "phase"
    payload: dict[str, Any] = Field(default_factory=dict)


class PlanEvent(BaseEvent):
    type: Literal["plan"] = "plan"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["done"] = "done"


class PlanStepEvent(BaseEvent):
    type: Literal["plan_step"] = "plan_step"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["pending", "running", "done", "failed"] = "pending"


class ToolCallEvent(BaseEvent):
    type: Literal["tool_call"] = "tool_call"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["running"] = "running"


class ToolResultEvent(BaseEvent):
    type: Literal["tool_result"] = "tool_result"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["done"] = "done"


class ReflectionEvent(BaseEvent):
    type: Literal["reflection"] = "reflection"
    payload: dict[str, Any] = Field(default_factory=dict)


class FinalEvent(BaseEvent):
    type: Literal["final"] = "final"
    payload: dict[str, Any] = Field(default_factory=dict)
    status: Literal["done"] = "done"


class ErrorEvent(BaseEvent):
    type: Literal["error"] = "error"
    payload: dict[str, str] = Field(default_factory=dict)
    status: Literal["error"] = "error"


class StatusEvent(BaseEvent):
    type: Literal["status"] = "status"
    payload: dict[str, Any] = Field(default_factory=dict)


class ThinkPartEvent(BaseEvent):
    type: Literal["think_part"] = "think_part"
    payload: dict[str, str] = Field(default_factory=dict)


class TextPartEvent(BaseEvent):
    type: Literal["text_part"] = "text_part"
    payload: dict[str, str] = Field(default_factory=dict)


class TurnEndEvent(BaseEvent):
    type: Literal["turn_end"] = "turn_end"
    payload: dict[str, Any] = Field(default_factory=dict)


class ApprovalRequestEvent(BaseEvent):
    type: Literal["approval_request"] = "approval_request"
    payload: dict[str, Any] = Field(default_factory=dict)


class SubagentEvent(BaseEvent):
    type: Literal["subagent"] = "subagent"
    payload: dict[str, Any] = Field(default_factory=dict)


class FollowupQuestionsEvent(BaseEvent):
    type: Literal["followup_questions"] = "followup_questions"
    payload: dict[str, Any] = Field(default_factory=dict)


class MemoryRecalledEvent(BaseEvent):
    type: Literal["memory_recalled"] = "memory_recalled"
    payload: dict[str, Any] = Field(default_factory=dict)


class MemoryStoredEvent(BaseEvent):
    type: Literal["memory_stored"] = "memory_stored"
    payload: dict[str, Any] = Field(default_factory=dict)


class SchemaEnrichedEvent(BaseEvent):
    type: Literal["schema_enriched"] = "schema_enriched"
    payload: dict[str, Any] = Field(default_factory=dict)


class IntentDetectedEvent(BaseEvent):
    type: Literal["intent_detected"] = "intent_detected"
    payload: dict[str, Any] = Field(default_factory=dict)


class PolicyCheckedEvent(BaseEvent):
    type: Literal["policy_checked"] = "policy_checked"
    payload: dict[str, Any] = Field(default_factory=dict)


class ClarificationNeededEvent(BaseEvent):
    type: Literal["clarification_needed"] = "clarification_needed"
    payload: dict[str, Any] = Field(default_factory=dict)


class SourceMetaEvent(BaseEvent):
    type: Literal["source_meta"] = "source_meta"
    payload: dict[str, Any] = Field(default_factory=dict)
    phase: Literal["researching"] = "researching"
