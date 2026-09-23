"""Monotonic guard pipeline for tool execution.

Ported from the DeepSeek Harness tool kernel. Three properties the agent did
not have before:

* **Monotonic guards.** Pre-execute guards may only *deny*. Once one denies,
  no later stage can revive the call -- there is no "allow" return value to
  override with, so a guard cannot be defeated by ordering. A guard that
  raises is itself treated as a denial (fail-closed): a broken filter must not
  become an open gate.
* **Per-tool timeout.** Nothing in the middleware stack bounded how long a
  single tool could run, so one hung call hung the whole graph. Every call now
  goes through :func:`asyncio.wait_for`; synchronous tools are pushed to a
  worker thread so a blocking call cannot pin the event loop.
* **Typed result cards.** Tool output carried its own presentation as ad-hoc
  dicts or markdown for the frontend to scrape. :class:`ToolCallView` and
  :class:`ToolResultView` give a closed set of card shapes instead.

The pipeline is deliberately framework-free -- no LangChain imports -- so it
can be unit-tested directly. ``middleware/guarded_tools.py`` adapts it to the
LangGraph ``wrap_tool_call`` protocol.

Repetition detection is *not* here: ``middleware/doom_loop_guard.py`` already
implements the harness ``repeat-tool-reminder`` ladder, and does it against
graph history rather than in-process state.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

__all__ = [
    "CardType",
    "ToolCallView",
    "ToolResultView",
    "ToolExecutionInput",
    "ToolExecutionResult",
    "ToolGuard",
    "GuardedToolPipeline",
    "DENIED_PREFIX",
    "GUARD_ERROR_PREFIX",
    "TIMEOUT_PREFIX",
    "TOOL_ERROR_PREFIX",
]

#: Prefixes for the text the *model* sees. They are constants rather than
#: inline literals so the wording is swappable in one place, and so tests can
#: assert on an outcome class instead of on a sentence.
DENIED_PREFIX = "BỊ_TỪ_CHỐI_THỰC_THI"
GUARD_ERROR_PREFIX = "LỖI_BỘ_LỌC_BẢO_VỆ"
TIMEOUT_PREFIX = "QUÁ_THỜI_GIAN_TIMEOUT"
TOOL_ERROR_PREFIX = "LỖI_CÔNG_CỤ"


class CardType(Enum):
    """Closed set of frontend renderings a tool result may request."""

    GENERIC = "generic"
    TERMINAL = "terminal"
    DIFF = "diff"
    SEARCH = "search"
    READ = "read"
    WEB = "web"


@dataclass(frozen=True)
class ToolCallView:
    """How an in-flight tool call is rendered."""

    card: CardType
    title: str
    icon: str = "execute"
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ToolResultView:
    """How a finished tool call is rendered."""

    card: CardType
    title: str
    status: str = "success"  # "success" | "error" | "truncated"
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ToolExecutionInput:
    """Frozen arguments for one call.

    Frozen on purpose: the guards inspect exactly the arguments that will be
    executed. A guard that could mutate them -- or a tool that could swap them
    after inspection -- would make the audit meaningless.
    """

    call_id: str
    tool_name: str
    arguments: Dict[str, Any]
    session_id: str = ""
    timeout_seconds: Optional[float] = 30.0


@dataclass
class ToolExecutionResult:
    call_id: str
    is_error: bool
    output: Any
    error_message: Optional[str] = None
    additional_context: Optional[str] = None
    call_view: Optional[ToolCallView] = None
    result_view: Optional[ToolResultView] = None

    @property
    def outcome(self) -> str:
        """Coarse outcome class: ``ok``, ``denied``, ``timeout`` or ``error``.

        Exit status and *reason* are orthogonal -- a denied call and a crashed
        call are both ``is_error`` but demand different handling upstream.
        """
        if not self.is_error:
            return "ok"
        msg = self.error_message or ""
        if msg.startswith(DENIED_PREFIX) or msg.startswith(GUARD_ERROR_PREFIX):
            return "denied"
        if msg.startswith(TIMEOUT_PREFIX):
            return "timeout"
        return "error"


#: A guard returns a denial reason, or ``None`` to stay out of the way.
ToolGuard = Callable[[ToolExecutionInput], Optional[str]]


class GuardedToolPipeline:
    """Runs guards, then the tool, under a bounded timeout."""

    def __init__(self, guards: Optional[List[ToolGuard]] = None) -> None:
        self._guards: List[ToolGuard] = list(guards or [])

    def add_guard(self, guard: ToolGuard) -> "GuardedToolPipeline":
        self._guards.append(guard)
        return self

    # -- stages ------------------------------------------------------------

    def _screen(self, input_data: ToolExecutionInput) -> Optional[str]:
        """First denial wins. A raising guard denies rather than passes."""
        for guard in self._guards:
            try:
                reason = guard(input_data)
            except Exception as exc:  # fail-closed
                logger.exception(
                    "Tool guard %r raised on %s; treating as denial",
                    getattr(guard, "__name__", guard),
                    input_data.tool_name,
                )
                return f"{GUARD_ERROR_PREFIX}: {exc}"
            if reason:
                return f"{DENIED_PREFIX}: {reason}"
        return None

    async def execute(
        self,
        input_data: ToolExecutionInput,
        tool_fn: Callable[..., Any],
        call_view_builder: Optional[Callable[[ToolExecutionInput], ToolCallView]] = None,
        result_view_builder: Optional[
            Callable[[ToolExecutionInput, Any], ToolResultView]
        ] = None,
    ) -> ToolExecutionResult:
        call_view = call_view_builder(input_data) if call_view_builder else None

        denial = self._screen(input_data)
        if denial:
            return ToolExecutionResult(
                call_id=input_data.call_id,
                is_error=True,
                output=denial,
                error_message=denial,
                call_view=call_view,
                result_view=ToolResultView(
                    card=CardType.GENERIC,
                    title=f"{input_data.tool_name} denied",
                    status="error",
                    payload={"reason": denial},
                ),
            )

        try:
            output = await self._invoke(input_data, tool_fn)
        except asyncio.TimeoutError:
            msg = (
                f"{TIMEOUT_PREFIX}: {input_data.tool_name} exceeded "
                f"{input_data.timeout_seconds}s"
            )
            return self._failure(input_data, msg, call_view)
        except Exception as exc:
            msg = f"{TOOL_ERROR_PREFIX}: {exc}"
            logger.exception("Tool %s failed", input_data.tool_name)
            return self._failure(input_data, msg, call_view)

        result_view = (
            result_view_builder(input_data, output) if result_view_builder else None
        )
        return ToolExecutionResult(
            call_id=input_data.call_id,
            is_error=False,
            output=output,
            call_view=call_view,
            result_view=result_view,
        )

    async def _invoke(self, input_data: ToolExecutionInput, tool_fn: Callable[..., Any]):
        """Await ``tool_fn`` under the call's timeout.

        A synchronous tool goes to a worker thread: called inline it would
        block the event loop, and ``wait_for`` cannot interrupt a thread that
        never yields, so the timeout would silently not apply.
        """
        if inspect.iscoroutinefunction(tool_fn):
            coro = tool_fn(**input_data.arguments)
        else:
            coro = asyncio.to_thread(tool_fn, **input_data.arguments)

        if input_data.timeout_seconds is None:
            return await coro
        return await asyncio.wait_for(coro, timeout=input_data.timeout_seconds)

    def _failure(
        self,
        input_data: ToolExecutionInput,
        message: str,
        call_view: Optional[ToolCallView],
    ) -> ToolExecutionResult:
        return ToolExecutionResult(
            call_id=input_data.call_id,
            is_error=True,
            output=message,
            error_message=message,
            call_view=call_view,
            result_view=ToolResultView(
                card=CardType.GENERIC,
                title=f"{input_data.tool_name} failed",
                status="error",
                payload={"error": message},
            ),
        )


if __name__ == "__main__":  # pragma: no cover - runnable check
    import time

    def _run(coro):
        return asyncio.run(coro)

    def _inp(name="echo", args=None, timeout=5.0):
        return ToolExecutionInput(
            call_id="c1", tool_name=name, arguments=args or {}, timeout_seconds=timeout
        )

    # Happy path, sync tool.
    p = GuardedToolPipeline()
    r = _run(p.execute(_inp(args={"x": 2}), lambda x: x * 21))
    assert r.outcome == "ok" and r.output == 42, r

    # Happy path, async tool.
    async def _atool(x):
        await asyncio.sleep(0)
        return x + 1

    r = _run(p.execute(_inp(args={"x": 1}), _atool))
    assert r.outcome == "ok" and r.output == 2, r

    # A guard denies; the tool must never run.
    ran = []
    p_deny = GuardedToolPipeline([lambda i: "write tools are read-only here"])
    r = _run(p_deny.execute(_inp(), lambda: ran.append(1)))
    assert r.outcome == "denied" and not ran, (r, ran)
    assert r.error_message.startswith(DENIED_PREFIX)

    # Monotonic: a later guard cannot revive a denied call, whatever it returns.
    p_mono = GuardedToolPipeline([lambda i: "no", lambda i: None])
    assert _run(p_mono.execute(_inp(), lambda: 1)).outcome == "denied"

    # A raising guard denies rather than opening the gate.
    def _broken(_i):
        raise RuntimeError("guard bug")

    r = _run(GuardedToolPipeline([_broken]).execute(_inp(), lambda: ran.append(2)))
    assert r.outcome == "denied" and r.error_message.startswith(GUARD_ERROR_PREFIX), r
    assert ran == [], ran

    # Timeout on a *blocking* sync tool -- the case an inline call would miss.
    r = _run(
        p.execute(_inp(name="sleeper", timeout=0.1), lambda: time.sleep(3) or "late")
    )
    assert r.outcome == "timeout", r
    assert "0.1s" in r.error_message, r.error_message

    # Tool exceptions surface as errors, not crashes, and stay distinct from
    # denials and timeouts.
    def _boom():
        raise ValueError("kaboom")

    r = _run(p.execute(_inp(name="boom"), _boom))
    assert r.outcome == "error" and "kaboom" in r.error_message, r

    # timeout_seconds=None means unbounded, not zero.
    r = _run(p.execute(_inp(timeout=None), lambda: "slow-but-allowed"))
    assert r.outcome == "ok", r

    # Views ride along on both success and failure.
    r = _run(
        p.execute(
            _inp(name="ls"),
            lambda: "a\nb",
            call_view_builder=lambda i: ToolCallView(CardType.READ, f"Read {i.tool_name}"),
            result_view_builder=lambda i, o: ToolResultView(
                CardType.READ, "2 entries", payload={"lines": o.split("\n")}
            ),
        )
    )
    assert r.call_view.card is CardType.READ and r.result_view.status == "success", r
    assert _run(p_deny.execute(_inp(), lambda: 1)).result_view.status == "error"

    print("pipeline self-check OK")
