"""
Response Envelope & Error Model for SQL Agent.

Full port from WrenAI's:
- model/error.py (90 lines) — Error codes, phases, WrenError
- SDK/_envelope.py (119 lines) — Success/error envelope, JSON safety, secret redaction

These provide structured error handling instead of raw string exceptions.

Reference:
- WrenAI/core/wren/src/wren/model/error.py
- WrenAI/sdk/wren-langchain/src/wren_langchain/_envelope.py
"""

from __future__ import annotations

import datetime as _dt
from decimal import Decimal
from enum import Enum
import json
from typing import Any

# ═══════════════════════════════════════════════════════════════════════════
# Error Model (from WrenAI model/error.py:1-90)
# ═══════════════════════════════════════════════════════════════════════════


class ErrorCode(int, Enum):
    """Error codes for the SQL agent pipeline.

    Ported from WrenAI ErrorCode (error.py:9-31).
    """
    GENERIC_USER_ERROR = 1
    NOT_FOUND = 2
    TABLE_NOT_FOUND = 3
    INVALID_SQL = 4
    INVALID_SCHEMA = 5
    CONNECTION_ERROR = 6
    INVALID_CONNECTION_INFO = 7
    MODEL_NOT_FOUND = 8
    BLOCKED_FUNCTION = 9
    MEMORY_ERROR = 10
    GENERIC_INTERNAL_ERROR = 100
    LLM_ERROR = 101
    STREAM_ERROR = 102
    GENERIC_EXTERNAL_ERROR = 200
    DATABASE_TIMEOUT = 201
    QUERY_TOO_LARGE = 202


class ErrorPhase(int, Enum):
    """Pipeline phase where the error occurred.

    Ported from WrenAI ErrorPhase (error.py:33-46).
    """
    REQUEST_RECEIVED = 1
    SCHEMA_RETRIEVAL = 2
    SQL_PARSING = 3
    SQL_GENERATION = 4
    SQL_VALIDATION = 5
    SQL_EXECUTION = 6
    SQL_DRY_RUN = 7
    RESPONSE_GENERATION = 8
    MEMORY_RECALL = 9
    MEMORY_STORE = 10
    CRITIC = 11
    INSIGHT_GENERATION = 12


class AgentError(Exception):
    """Structured error for the SQL agent pipeline.

    Ported from WrenAI WrenError (error.py:48-77).
    """
    error_code: ErrorCode
    message: str
    phase: ErrorPhase | None
    metadata: dict[str, Any] | None
    timestamp: str | None

    def __init__(
        self,
        error_code: ErrorCode,
        message: str,
        phase: ErrorPhase | None = None,
        metadata: dict[str, Any] | None = None,
        cause: Exception | None = None,
    ):
        self.error_code = error_code
        self.message = message
        self.phase = phase
        self.metadata = metadata
        self.timestamp = _dt.datetime.now().isoformat()
        super().__init__(message)
        if cause is not None:
            self.__cause__ = cause

    def __str__(self) -> str:
        parts = [f"[{self.error_code.name}] {self.message}"]
        if self.phase:
            parts.append(f"phase={self.phase.name}")
        return " ".join(parts)


class DatabaseTimeoutError(AgentError):
    """Ported from WrenAI DatabaseTimeoutError (error.py:79-90)."""

    def __init__(self, message: str):
        enhanced_message = (
            f"{message!s}.\n"
            "Database không phản hồi hoặc query quá lâu. "
            "Kiểm tra trạng thái database và tối ưu query."
        )
        super().__init__(
            error_code=ErrorCode.DATABASE_TIMEOUT,
            message=enhanced_message,
            phase=ErrorPhase.SQL_EXECUTION,
        )


# ═══════════════════════════════════════════════════════════════════════════
# JSON Safety (from WrenAI _envelope.py:20-53)
# ═══════════════════════════════════════════════════════════════════════════

_SECRET_PATTERNS = ("password", "secret", "token", "credential", "api_key")
_DEFAULT_METADATA_CAP = 4 * 1024
_DEFAULT_CONTENT_CAP = 16 * 1024


def json_safe(value: Any) -> Any:
    """Recursively convert non-JSON-serializable values to JSON-friendly forms.

    Ported from WrenAI _envelope.py json_safe() (lines 20-38).
    """
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, (_dt.datetime, _dt.date, _dt.time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def cap_size(data: dict[str, Any], max_bytes: int = _DEFAULT_METADATA_CAP) -> dict[str, Any]:
    """Return data unchanged if JSON size <= max_bytes, else truncate.

    Ported from WrenAI _envelope.py cap_size() (lines 41-53).
    """
    encoded = json.dumps(data, default=str).encode("utf-8")
    if len(encoded) <= max_bytes:
        return data
    return {
        "_truncated": True,
        "original_size_bytes": len(encoded),
    }


def redact_secrets(data: dict[str, Any]) -> dict[str, Any]:
    """Replace values whose keys contain secret patterns with '***'.

    Ported from WrenAI _envelope.py redact_secrets() (lines 56-74).
    """
    def _walk(value: Any, key_hint: str | None = None) -> Any:
        if key_hint and any(pat in key_hint.lower() for pat in _SECRET_PATTERNS):
            return "***"
        if isinstance(value, dict):
            return {k: _walk(v, k) for k, v in value.items()}
        if isinstance(value, list):
            return [_walk(v, key_hint) for v in value]
        return value

    return {k: _walk(v, k) for k, v in data.items()}


# ═══════════════════════════════════════════════════════════════════════════
# Envelope Construction (from WrenAI _envelope.py:77-119)
# ═══════════════════════════════════════════════════════════════════════════

def make_success(
    content: str,
    data: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    """Construct a success envelope.

    Ported from WrenAI _envelope.py make_success() (lines 77-88).
    """
    return {
        "ok": True,
        "content": content,
        "data": data,
        "warnings": warnings or [],
    }


def format_error(exc: Exception) -> dict[str, Any]:
    """Convert an exception into structured error dict.

    Ported from WrenAI _envelope.py format_error() (lines 91-108).
    """
    if isinstance(exc, AgentError):
        metadata = redact_secrets(exc.metadata or {})
        metadata = json_safe(metadata)
        metadata = cap_size(metadata)
        return {
            "code": exc.error_code.name,
            "phase": exc.phase.name if exc.phase else None,
            "message": exc.message,
            "metadata": metadata,
        }
    return {
        "code": "AGENT_ERROR",
        "phase": None,
        "message": str(exc),
        "metadata": {},
    }


def make_error(exc: Exception) -> dict[str, Any]:
    """Construct a failure envelope from an exception.

    Ported from WrenAI _envelope.py make_error() (lines 111-118).
    """
    error = format_error(exc)
    return {
        "ok": False,
        "content": error["message"],
        "error": error,
    }
