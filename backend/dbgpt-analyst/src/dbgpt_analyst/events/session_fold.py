"""Session fold Façade re-exporting from runtime.session_fold."""
from .runtime.session_fold import (
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
