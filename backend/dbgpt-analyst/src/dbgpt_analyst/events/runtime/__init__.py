"""Runtime Streaming Engine Package for dbgpt-analyst.

Houses active SSE adapters, stream state, session fold models, and envelope emitters.
"""

from .state import StreamState
from .sse_adapter import DualFormatStreamAdapter, StreamFormat
from .envelope import (
    EventEmitter,
    RunStatus,
    TERMINAL_STATUSES,
    STREAM_TERMINAL_STATUSES,
    ABSORBING_TERMINAL_STATUSES,
    EVENT_TYPES,
)
from .session_fold import (
    DurableSessionState,
    SessionEvent,
    SessionStatus,
    extract_semantic_xml_blocks,
    extract_semantic_tags,
    foldEvent,
    foldEvents,
    fold_event,
    fold_events,
    format_clause_xml,
    format_contract_xml,
    format_thought_xml,
    format_tool_xml,
    resume_session,
)

__all__ = [
    "StreamState",
    "DualFormatStreamAdapter",
    "StreamFormat",
    "EventEmitter",
    "RunStatus",
    "TERMINAL_STATUSES",
    "STREAM_TERMINAL_STATUSES",
    "ABSORBING_TERMINAL_STATUSES",
    "EVENT_TYPES",
    "DurableSessionState",
    "SessionEvent",
    "SessionStatus",
    "extract_semantic_xml_blocks",
    "extract_semantic_tags",
    "foldEvent",
    "foldEvents",
    "fold_event",
    "fold_events",
    "format_clause_xml",
    "format_contract_xml",
    "format_thought_xml",
    "format_tool_xml",
    "resume_session",
]
