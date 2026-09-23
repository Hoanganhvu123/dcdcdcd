"""guard/db_circuit_breaker.py — Enterprise Circuit Breaker & Connection Resilience.

Provides two-tier circuit breaking:
1. DatabaseCircuitBreaker: True 3-state (CLOSED, OPEN, HALF_OPEN) circuit breaker
   handling analytical DB disconnects, socket drops, timeouts, and pool exhaustion.
2. SandboxCircuitBreakerMiddleware: LangGraph middleware for dead sandbox recovery.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
import logging
import re
import time
from typing import Any, Literal

from langchain.agents.middleware import AgentMiddleware, AgentState, hook_config
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langgraph.runtime import Runtime

logger = logging.getLogger(__name__)

# --- 1. Sandbox Circuit Breaker Definitions (Legacy & DeepAgents) ---

SANDBOX_CIRCUIT_BREAKER_THRESHOLD = 2
SANDBOX_UNRECOVERABLE_MESSAGE = "Sandbox became unrecoverable mid-task. Please retrigger."

_CIRCUIT_BREAKER_MARKER = "Sandbox circuit breaker triggered"
_SANDBOX_RECREATED_AFTER_CLIENT_ERROR = "sandbox_recreated_after_client_error"
_SANDBOX_ID_RE = re.compile(r"\bsb-[A-Za-z0-9-]+\b")


@dataclass(frozen=True)
class SandboxErrorStreak:
    reason: Literal["client_error", "recreated"]
    sandbox_id: str | None
    count: int


def _content_to_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content)

    parts: list[str] = []
    for block in content:
        if isinstance(block, Mapping):
            text = block.get("text", "")
            parts.append(text if isinstance(text, str) else str(text))
        else:
            parts.append(str(block))
    return " ".join(parts)


def _extract_sandbox_id(text: str) -> str | None:
    match = _SANDBOX_ID_RE.search(text)
    return match.group(0) if match else None


def _last_message_has_circuit_breaker_marker(messages: Sequence[BaseMessage]) -> bool:
    if not messages:
        return False
    content = _content_to_text(getattr(messages[-1], "content", "") or "")
    return _CIRCUIT_BREAKER_MARKER in content


def _sandbox_error_streak(messages: Sequence[BaseMessage]) -> SandboxErrorStreak | None:
    sandbox_id: str | None = None
    reason: Literal["client_error", "recreated"] | None = None
    count = 0

    for message in reversed(messages):
        if isinstance(message, ToolMessage):
            text = _content_to_text(message.content)
            if _SANDBOX_RECREATED_AFTER_CLIENT_ERROR in text:
                if reason is None:
                    reason = "recreated"
                elif reason != "recreated":
                    break
                count += 1
                continue

            message_sandbox_id = _extract_sandbox_id(text)
            if "SandboxClientError" not in text or message_sandbox_id is None:
                break
            if reason is None:
                reason = "client_error"
                sandbox_id = message_sandbox_id
            elif reason != "client_error" or message_sandbox_id != sandbox_id:
                break
            count += 1
            continue

        text = _content_to_text(getattr(message, "content", "") or "")
        if _CIRCUIT_BREAKER_MARKER in text:
            return None
        if getattr(message, "type", "") in {"human", "system"}:
            break

    if reason is None:
        return None
    return SandboxErrorStreak(reason=reason, sandbox_id=sandbox_id, count=count)


class SandboxCircuitBreakerMiddleware(AgentMiddleware[AgentState, Any]):
    """Stop runs that repeatedly hit the same dead sandbox."""

    state_schema = AgentState

    def __init__(self, *, threshold: int = SANDBOX_CIRCUIT_BREAKER_THRESHOLD) -> None:
        self.threshold = threshold

    @hook_config(can_jump_to=["end"])
    def before_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:  # noqa: ARG002
        messages = state.get("messages", [])
        if _last_message_has_circuit_breaker_marker(messages):
            return None

        streak = _sandbox_error_streak(messages)
        if streak is None or streak.count <= self.threshold:
            return None

        if streak.reason == "recreated":
            detail = (
                f"{streak.count} consecutive sandbox recreations did not recover tool execution"
            )
        else:
            detail = f"{streak.count} consecutive sandbox tool failures against {streak.sandbox_id}"
        content = f"{_CIRCUIT_BREAKER_MARKER}: {detail}. {SANDBOX_UNRECOVERABLE_MESSAGE}"
        return {"jump_to": "end", "messages": [AIMessage(content=content)]}

    @hook_config(can_jump_to=["end"])
    async def abefore_model(
        self,
        state: AgentState,
        runtime: Runtime,
    ) -> dict[str, Any] | None:
        return self.before_model(state, runtime)

    async def aafter_agent(
        self,
        state: AgentState,
        runtime: Runtime,  # noqa: ARG002
    ) -> dict[str, Any] | None:
        return None


# --- 2. True Analytical Database Circuit Breaker ---


class CircuitBreakerState(str, Enum):
    """Operational state of the circuit breaker."""
    CLOSED = "CLOSED"      # Normal operation, traffic allowed
    OPEN = "OPEN"          # Tripped, traffic blocked immediately
    HALF_OPEN = "HALF_OPEN"  # Testing recovery with canary probe


class DatabaseCircuitBreakerOpenError(Exception):
    """Raised when an operation is blocked because the DB circuit breaker is OPEN."""
    pass


class DatabaseCircuitBreaker:
    """Production-grade circuit breaker protecting against database connection failures,
    timeouts, deadlocks, and connection starvation.
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        recovery_timeout_sec: float = 30.0,
        half_open_success_threshold: int = 1,
        backoff_factor: float = 1.0,
        max_recovery_timeout_sec: float = 300.0,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout_sec = recovery_timeout_sec
        self.half_open_success_threshold = half_open_success_threshold
        self.backoff_factor = backoff_factor
        self.max_recovery_timeout_sec = max_recovery_timeout_sec

        self._state: CircuitBreakerState = CircuitBreakerState.CLOSED
        self._consecutive_failures: int = 0
        self._consecutive_successes: int = 0
        self._last_failure_time: float = 0.0
        self._last_error: str | None = None
        self._current_recovery_timeout: float = recovery_timeout_sec
        self._trip_count: int = 0

    @property
    def state(self) -> CircuitBreakerState:
        if self._state == CircuitBreakerState.OPEN:
            if time.monotonic() - self._last_failure_time >= self._current_recovery_timeout:
                logger.info(
                    "[DatabaseCircuitBreaker] Recovery timeout expired (%.1fs). Transitioning OPEN -> HALF_OPEN.",
                    self._current_recovery_timeout,
                )
                self._state = CircuitBreakerState.HALF_OPEN
                self._consecutive_successes = 0
        return self._state

    @property
    def consecutive_failures(self) -> int:
        return self._consecutive_failures

    @property
    def current_recovery_timeout(self) -> float:
        return self._current_recovery_timeout

    @property
    def trip_count(self) -> int:
        return self._trip_count

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def can_execute(self) -> bool:
        """Check if request execution is permitted."""
        return self.state != CircuitBreakerState.OPEN

    def record_success(self) -> None:
        """Record successful database interaction."""
        if self._state == CircuitBreakerState.HALF_OPEN:
            self._consecutive_successes += 1
            if self._consecutive_successes >= self.half_open_success_threshold:
                logger.info(
                    "[DatabaseCircuitBreaker] Canary probe succeeded. Transitioning HALF_OPEN -> CLOSED."
                )
                self._state = CircuitBreakerState.CLOSED
                self._consecutive_failures = 0
                self._last_error = None
                self._trip_count = 0
                self._current_recovery_timeout = self.recovery_timeout_sec
        else:
            self._consecutive_failures = 0
            self._last_error = None

    def record_failure(self, exc: BaseException | None = None) -> None:
        """Record failed database interaction (disconnection, timeout, socket error)."""
        self._consecutive_failures += 1
        self._last_failure_time = time.monotonic()
        if exc is not None:
            self._last_error = f"{type(exc).__name__}: {exc}"

        logger.warning(
            "[DatabaseCircuitBreaker] Recorded DB failure #%d/%d: %s",
            self._consecutive_failures,
            self.failure_threshold,
            self._last_error,
        )

        if self._state in (CircuitBreakerState.CLOSED, CircuitBreakerState.HALF_OPEN):
            if self._consecutive_failures >= self.failure_threshold or self._state == CircuitBreakerState.HALF_OPEN:
                self._trip_count += 1
                if self._trip_count > 1 and self.backoff_factor > 1.0:
                    self._current_recovery_timeout = min(
                        self._current_recovery_timeout * self.backoff_factor,
                        self.max_recovery_timeout_sec,
                    )
                logger.error(
                    "[DatabaseCircuitBreaker] Tripped! Transitioning to OPEN. Calls blocked for %.1fs.",
                    self._current_recovery_timeout,
                )
                self._state = CircuitBreakerState.OPEN

    def reset(self) -> None:
        """Manually reset circuit breaker to normal CLOSED state."""
        self._state = CircuitBreakerState.CLOSED
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._last_failure_time = 0.0
        self._last_error = None
        self._trip_count = 0
        self._current_recovery_timeout = self.recovery_timeout_sec

    def call(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Execute callable protected by circuit breaker."""
        if not self.can_execute():
            raise DatabaseCircuitBreakerOpenError(
                f"Database circuit breaker is OPEN due to repeated failures ({self._last_error}). "
                f"Recovery timeout: {self.recovery_timeout_sec}s."
            )

        try:
            result = func(*args, **kwargs)
            self.record_success()
            return result
        except Exception as exc:
            if self._is_connection_error(exc):
                self.record_failure(exc)
            raise

    async def acall(self, async_func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Execute async callable protected by circuit breaker."""
        if not self.can_execute():
            raise DatabaseCircuitBreakerOpenError(
                f"Database circuit breaker is OPEN due to repeated failures ({self._last_error}). "
                f"Recovery timeout: {self.recovery_timeout_sec}s."
            )

        try:
            result = await async_func(*args, **kwargs)
            self.record_success()
            return result
        except Exception as exc:
            if self._is_connection_error(exc):
                self.record_failure(exc)
            raise

    @staticmethod
    def _is_connection_error(exc: BaseException) -> bool:
        """Check if exception represents a connection or availability failure."""
        err_name = type(exc).__name__.lower()
        err_msg = str(exc).lower()
        connection_indicators = (
            "connection",
            "timeout",
            "timed out",
            "refused",
            "disconnected",
            "broken pipe",
            "closed",
            "database is locked",
            "busy",
            "server closed the connection",
            "cannot connect",
        )
        return any(ind in err_name or ind in err_msg for ind in connection_indicators)


# Alias for convenience
DBCircuitBreaker = DatabaseCircuitBreaker


# Global singleton instance for shared connection protection
_global_db_circuit_breaker = DatabaseCircuitBreaker()


def get_db_circuit_breaker() -> DatabaseCircuitBreaker:
    """Access global database circuit breaker singleton."""
    return _global_db_circuit_breaker
