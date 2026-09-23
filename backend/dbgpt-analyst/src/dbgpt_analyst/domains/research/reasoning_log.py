"""reasoning_log.py — JSONL per-session observability for the AI analytic agent.

Level controlled by env var AI_AGENT_LOG (default: off):
  off     → no-op (zero overhead)
  on      → counts + latency only (no message/SQL text)
  verbose → full events including messages, SQL, chart (trims at 400 chars)
"""
from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
import os
from pathlib import Path
import time
from typing import Any

_logger = logging.getLogger(__name__)

# Read level once at import time; readable via process restart.
_RAW_LEVEL = os.getenv("AI_AGENT_LOG", "off").lower().strip()
_LEVEL = _RAW_LEVEL if _RAW_LEVEL in ("on", "verbose") else "off"

_LOG_ROOT = Path(os.getenv("AI_AGENT_LOG_DIR", "agent-logs"))

_TRIM = 400  # max chars for any string field in verbose mode


def _trim(val: Any) -> Any:
    """Truncate long strings to avoid logging PII / large blobs."""
    if isinstance(val, str) and len(val) > _TRIM:
        return val[:_TRIM] + "…"
    return val


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class ReasoningLog:
    """Per-request JSONL audit log.

    Usage:
        rlog = ReasoningLog(session_id="abc")
        rlog.start()
        rlog.log("phase", node="generate_sql", status="running")
        rlog.end(total_nodes=5)
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self._enabled = _LEVEL != "off"
        self._verbose = _LEVEL == "verbose"
        self._file = None
        self._t0: float = 0.0
        self._node_count: int = 0
        self._error_count: int = 0
        self._llm_calls: int = 0
        self._last_node_t: float = 0.0

        if self._enabled:
            date_str = datetime.now(UTC).strftime("%Y-%m-%d")
            log_dir = _LOG_ROOT / date_str
            log_dir.mkdir(parents=True, exist_ok=True)
            safe_sid = session_id.replace("/", "_").replace("\\", "_")[:64]
            log_path = log_dir / f"{safe_sid}.jsonl"
            try:
                self._file = log_path.open("a", encoding="utf-8")
            except OSError as exc:
                _logger.warning("ReasoningLog: cannot open %s: %s", log_path, exc)
                self._enabled = False

    def _write(self, record: dict) -> None:
        if not self._enabled or self._file is None:
            return
        try:
            self._file.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
            self._file.flush()
        except OSError as exc:
            _logger.debug("ReasoningLog write error: %s", exc)

    def start(self, question: str = "") -> None:
        self._t0 = time.monotonic()
        self._last_node_t = self._t0
        if not self._enabled:
            return
        rec: dict[str, Any] = {
            "ts": _now_iso(),
            "event": "session_start",
            "session_id": self.session_id,
        }
        if self._verbose:
            rec["question"] = _trim(question)
        self._write(rec)

    def log(self, event_type: str, **kwargs: Any) -> None:
        if not self._enabled:
            return

        now = time.monotonic()
        rec: dict[str, Any] = {
            "ts": _now_iso(),
            "event": event_type,
            "elapsed_ms": round((now - self._t0) * 1000),
        }

        if event_type == "phase":
            self._node_count += 1
            node = kwargs.get("node", "")
            status = kwargs.get("status", "")
            node_elapsed_ms = round((now - self._last_node_t) * 1000)
            if status == "running":
                self._last_node_t = now
            rec["node"] = node
            rec["status"] = status
            rec["node_elapsed_ms"] = node_elapsed_ms
            if self._verbose:
                rec["detail"] = _trim(kwargs.get("detail", ""))

        elif event_type == "llm_call":
            self._llm_calls += 1
            rec["node"] = kwargs.get("node", "")
            rec["latency_ms"] = kwargs.get("latency_ms", 0)
            if self._verbose:
                rec["model"] = kwargs.get("model", "")
                rec["prompt_len"] = kwargs.get("prompt_len", 0)
                rec["response_preview"] = _trim(kwargs.get("response", ""))

        elif event_type == "error":
            self._error_count += 1
            rec["node"] = kwargs.get("node", "")
            if self._verbose:
                rec["detail"] = _trim(str(kwargs.get("detail", "")))
            else:
                rec["detail"] = str(kwargs.get("detail", ""))[:120]

        # Generic event: only include kwargs in verbose mode
        elif self._verbose:
            for k, v in kwargs.items():
                rec[k] = _trim(v) if isinstance(v, str) else v

        self._write(rec)

    def end(self, total_iterations: int = 0) -> None:
        if not self._enabled:
            return
        elapsed_s = round(time.monotonic() - self._t0, 3)
        rec: dict[str, Any] = {
            "ts": _now_iso(),
            "event": "session_end",
            "session_id": self.session_id,
            "elapsed_s": elapsed_s,
            "total_nodes": self._node_count,
            "total_llm_calls": self._llm_calls,
            "total_errors": self._error_count,
            "total_iterations": total_iterations,
        }
        self._write(rec)
        if self._file:
            try:
                self._file.close()
            except OSError:
                pass
            self._file = None
