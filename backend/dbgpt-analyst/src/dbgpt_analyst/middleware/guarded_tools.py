"""Adapts :mod:`dbgpt_analyst.tools.pipeline` to the LangGraph middleware protocol.

Two things the stack was missing:

* a place to hang **deny-only** pre-execute guards, so a policy decision is
  made once instead of inside each tool;
* a **timeout** around every tool call. Nothing bounded a single call before,
  so one hung tool -- a query against an unreachable warehouse, a subprocess
  waiting on stdin -- stalled the whole graph until the caller gave up.

Error normalisation is *not* duplicated here: ``ToolErrorMiddleware`` already
converts exceptions into error ``ToolMessage``s, and stacking a second
try/except would just hide which layer produced the payload.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Optional, Sequence

from langchain.agents.middleware.types import AgentMiddleware, AgentState
from langchain_core.messages import ToolMessage
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from dbgpt_analyst.tools.pipeline import (
    DENIED_PREFIX,
    GUARD_ERROR_PREFIX,
    TIMEOUT_PREFIX,
    ToolExecutionInput,
    ToolGuard,
)

from .tool_error_handler import _extract_tool_name, _get_tool_call_id

logger = logging.getLogger(__name__)

__all__ = ["GuardedToolMiddleware", "DEFAULT_TOOL_TIMEOUT_SECONDS"]

#: Deliberately generous. This is a hang detector, not a performance budget:
#: report generation and warehouse scans legitimately run for minutes, and a
#: limit tight enough to be a budget would fail honest work. Per-tool overrides
#: belong in ``timeout_overrides``.
DEFAULT_TOOL_TIMEOUT_SECONDS = 300.0


def _denial_message(reason: str, request: ToolCallRequest) -> ToolMessage:
    return ToolMessage(
        # ensure_ascii=False: the reason is Vietnamese, and unicode-escaping it
        # would hand the model mojibake instead of a sentence it can act on.
        content=json.dumps(
            {
                "error": reason,
                "error_type": "ToolDenied",
                "status": "error",
                "name": _extract_tool_name(request) or "",
            },
            ensure_ascii=False,
        ),
        tool_call_id=_get_tool_call_id(request),
        status="error",
    )


class GuardedToolMiddleware(AgentMiddleware):
    """Deny-only guards plus a per-call timeout."""

    state_schema = AgentState

    def __init__(
        self,
        guards: Optional[Sequence[ToolGuard]] = None,
        timeout_seconds: Optional[float] = DEFAULT_TOOL_TIMEOUT_SECONDS,
        timeout_overrides: Optional[dict[str, Optional[float]]] = None,
    ) -> None:
        super().__init__()
        self.guards: list[ToolGuard] = list(guards or [])
        self.timeout_seconds = timeout_seconds
        self.timeout_overrides = dict(timeout_overrides or {})

    def add_guard(self, guard: ToolGuard) -> "GuardedToolMiddleware":
        self.guards.append(guard)
        return self

    # -- helpers -----------------------------------------------------------

    def _timeout_for(self, tool_name: str) -> Optional[float]:
        return self.timeout_overrides.get(tool_name, self.timeout_seconds)

    def _to_input(self, request: ToolCallRequest) -> ToolExecutionInput:
        tool_call = request.tool_call if isinstance(request.tool_call, dict) else {}
        name = _extract_tool_name(request) or "<unknown>"
        args = tool_call.get("args")
        return ToolExecutionInput(
            call_id=_get_tool_call_id(request) or "",
            tool_name=name,
            arguments=args if isinstance(args, dict) else {},
            timeout_seconds=self._timeout_for(name),
        )

    def _screen(self, request: ToolCallRequest) -> Optional[str]:
        """First denial wins; a raising guard denies (fail-closed)."""
        if not self.guards:
            return None
        payload = self._to_input(request)
        for guard in self.guards:
            try:
                reason = guard(payload)
            except Exception as exc:
                logger.exception(
                    "Tool guard %r raised on %s; treating as denial",
                    getattr(guard, "__name__", guard),
                    payload.tool_name,
                )
                return f"{GUARD_ERROR_PREFIX}: {exc}"
            if reason:
                return f"{DENIED_PREFIX}: {reason}"
        return None

    # -- protocol ----------------------------------------------------------

    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        # Guards only. A synchronous handler cannot be interrupted from this
        # thread, so claiming a timeout here would be a lie; the async path
        # below is the one the graph actually uses.
        reason = self._screen(request)
        if reason:
            return _denial_message(reason, request)
        return handler(request)

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command]],
    ) -> ToolMessage | Command:
        reason = self._screen(request)
        if reason:
            return _denial_message(reason, request)

        timeout = self._timeout_for(_extract_tool_name(request) or "")
        if timeout is None:
            return await handler(request)
        try:
            return await asyncio.wait_for(handler(request), timeout=timeout)
        except asyncio.TimeoutError:
            name = _extract_tool_name(request) or "<unknown>"
            message = f"{TIMEOUT_PREFIX}: {name} exceeded {timeout}s"
            logger.warning("%s", message)
            return _denial_message(message, request)


def _self_check() -> None:  # pragma: no cover - runnable check
    class _Req:
        def __init__(self, name: str, args: dict[str, Any]):
            self.tool_call = {"id": "call_1", "name": name, "args": args}

    req = _Req("run_sql", {"q": "select 1"})

    mw = GuardedToolMiddleware(
        guards=[lambda i: "read-only session" if i.tool_name == "run_sql" else None]
    )
    out = asyncio.run(mw.awrap_tool_call(req, None))  # handler never called
    assert out.status == "error" and DENIED_PREFIX in out.content, out
    assert out.tool_call_id == "call_1", out

    # Non-matching tool passes through untouched.
    async def _ok(_r):
        return ToolMessage(content="fine", tool_call_id="call_1")

    assert asyncio.run(mw.awrap_tool_call(_Req("ls", {}), _ok)).content == "fine"

    # Timeout fires and names the tool.
    async def _hang(_r):
        await asyncio.sleep(5)

    slow = GuardedToolMiddleware(timeout_seconds=0.05)
    out = asyncio.run(slow.awrap_tool_call(_Req("hang", {}), _hang))
    assert TIMEOUT_PREFIX in out.content and "hang" in out.content, out

    # Per-tool override beats the default, including disabling the timeout.
    unbounded = GuardedToolMiddleware(
        timeout_seconds=0.05, timeout_overrides={"slow_report": None}
    )

    async def _slowish(_r):
        await asyncio.sleep(0.2)
        return ToolMessage(content="done", tool_call_id="call_1")

    out = asyncio.run(unbounded.awrap_tool_call(_Req("slow_report", {}), _slowish))
    assert out.content == "done", out

    # A raising guard denies rather than opening the gate.
    def _broken(_i):
        raise RuntimeError("guard bug")

    out = asyncio.run(GuardedToolMiddleware(guards=[_broken]).awrap_tool_call(req, None))
    assert GUARD_ERROR_PREFIX in out.content, out

    print("guarded_tools self-check OK")


if __name__ == "__main__":  # pragma: no cover
    _self_check()
