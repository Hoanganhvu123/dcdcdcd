"""R01 — Unified Event Envelope for SSE streaming.

Central module that wraps all outgoing SSE events in a standardized envelope
with schemaVersion, eventId, runId, seq, type, timestamp.

Usage:
    emitter = EventEmitter(run_id="run-abc", thread_id="thread-1")
    envelope = emitter.emit("tool.started", {"toolCallId": "call-1", "name": "sql_query"})
    # Returns SSE-formatted string: data: {"schemaVersion":1,"eventId":"evt-...","runId":"run-abc",...}\n\n
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
import json
from typing import Any, Literal
import uuid

# ─── Types ────────────────────────────────────────────────────────────

RunStatus = Literal[
    "running",
    "waiting_user",
    "completed",
    "failed",
    "cancelled",
]

STREAM_TERMINAL_STATUSES: frozenset[str] = frozenset({"completed", "failed", "cancelled", "waiting_user"})
TERMINAL_STATUSES: frozenset[str] = STREAM_TERMINAL_STATUSES
ABSORBING_TERMINAL_STATUSES: frozenset[str] = frozenset({"completed", "failed", "cancelled"})

EVENT_TYPES: frozenset[str] = frozenset({
    # Run lifecycle
    "run.started",
    "run.completed",
    "run.failed",
    "run.cancelled",
    # Activity / progress
    "activity.updated",
    # Tool lifecycle
    "tool.started",
    "tool.progress",
    "tool.completed",
    "tool.failed",
    # Answer streaming
    "answer.delta",
    # Source tracking
    "source.upsert",
    # Artifact lifecycle
    "artifact.started",
    "artifact.section.delta",
    "artifact.section.completed",
    "artifact.committed",
    # HITL
    "input.required",
    # Heartbeat
    "heartbeat",
})


# ─── Envelope ─────────────────────────────────────────────────────────

@dataclass
class EventEmitter:
    """Stateful emitter that tracks seq within a run."""

    run_id: str = field(default_factory=lambda: f"run-{uuid.uuid4().hex[:12]}")
    thread_id: str = ""
    message_id: str = field(default_factory=lambda: f"msg-{uuid.uuid4().hex[:8]}")
    single_turn: bool = True

    # Internal counter — server-owned, monotonically increasing within a run
    _seq: int = field(default=0, init=False, repr=False)
    _status: RunStatus = field(default="running", init=False, repr=False)
    _terminal_emitted: bool = field(default=False, init=False, repr=False)

    @property
    def seq(self) -> int:
        return self._seq

    @property
    def status(self) -> RunStatus:
        return self._status

    @property
    def multi_turn(self) -> bool:
        return not self.single_turn

    @multi_turn.setter
    def multi_turn(self, value: bool) -> None:
        self.single_turn = not value

    def resume(self) -> None:
        """Unlock the emitter for a subsequent stream turn upon human resumption."""
        self._status = "running"
        self._terminal_emitted = False

    def emit(self, event_type: str, payload: dict[str, Any] | None = None) -> str:
        """Build an envelope and return as SSE-formatted string.

        Heartbeats do not increment seq.
        Terminal events (completed/failed/cancelled) can only be emitted once.
        """
        # Guard: Terminal finality — strictly drop all events after terminal emission
        if self._terminal_emitted:
            return ""

        if event_type == "heartbeat":
            return self._format_sse({
                "type": "heartbeat",
                "runId": self.run_id,
                "timestamp": self._iso_now(),
                "payload": payload or {},
            })

        self._seq += 1
        event_id = f"evt-{uuid.uuid4().hex[:12]}"

        envelope: dict[str, Any] = {
            "schemaVersion": 1,
            "eventId": event_id,
            "runId": self.run_id,
            "threadId": self.thread_id,
            "messageId": self.message_id,
            "seq": self._seq,
            "type": event_type,
            "timestamp": self._iso_now(),
            "payload": payload or {},
        }

        # Update run status based on event type
        if event_type == "run.started":
            self._status = "running"
            if not self.single_turn:
                self._terminal_emitted = False
        elif event_type == "input.required":
            self._status = "waiting_user"
            if self.single_turn:
                self._terminal_emitted = True
        elif event_type == "run.completed":
            self._status = "completed"
            self._terminal_emitted = True
        elif event_type == "run.failed":
            self._status = "failed"
            self._terminal_emitted = True
        elif event_type == "run.cancelled":
            self._status = "cancelled"
            self._terminal_emitted = True

        return self._format_sse(envelope)

    def emit_legacy(self, data: dict[str, Any]) -> str:
        """Emit a legacy-format SSE event (for backward compatibility).

        Wraps existing data-* events without envelope overhead during migration.
        Enforces strict terminal finality. Drops emissions after terminal state.
        Locks terminal on finish, error, done.
        """
        if self._terminal_emitted:
            return ""
        evt_type = data.get("type")
        if evt_type in ("finish", "error", "done"):
            self._terminal_emitted = True
        return f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"

    @staticmethod
    def _format_sse(data: dict[str, Any]) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"

    @staticmethod
    def _iso_now() -> str:
        return datetime.now(UTC).isoformat()


__all__ = [
    "EventEmitter",
    "RunStatus",
    "TERMINAL_STATUSES",
    "STREAM_TERMINAL_STATUSES",
    "ABSORBING_TERMINAL_STATUSES",
    "EVENT_TYPES",
]
