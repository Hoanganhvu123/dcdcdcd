"""middleware/doom_loop_guard.py — Backward-compatible re-export from guard.doom_loop_guard."""
from dbgpt_analyst.guard.doom_loop_guard import (
    _ARGS_PREVIEW_CHARS,
    _DEFAULT_THRESHOLDS,
    _MARKER,
    _MARKER_RE,
    DoomLoopGuardMiddleware,
    _canonical,
    _decode,
    _detailed_reminder,
    _gentle_reminder,
    _preview_args,
    _tool_name,
    _turn_signature,
)

__all__ = [
    "_ARGS_PREVIEW_CHARS",
    "_DEFAULT_THRESHOLDS",
    "_MARKER",
    "_MARKER_RE",
    "DoomLoopGuardMiddleware",
    "_canonical",
    "_decode",
    "_detailed_reminder",
    "_gentle_reminder",
    "_preview_args",
    "_tool_name",
    "_turn_signature",
]
