"""events_schemas/base_event.py — Backward-compatible re-export from events.base."""
from dbgpt_analyst.events.base import BaseEvent, emit_custom

__all__ = ["BaseEvent", "emit_custom"]
