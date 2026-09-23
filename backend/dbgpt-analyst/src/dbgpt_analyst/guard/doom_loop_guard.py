"""middleware/doom_loop_guard.py — Doom Loop Prevention Mechanism (R6).

Detects a run of consecutive *identical* tool-call turns (same tool name and
canonically-identical arguments) and injects an escalating reminder so the model
breaks out instead of hammering the same call.

Semantics are ported from the DeepSeek Harness ``repeat-tool-reminder`` guard:

* **Escalating thresholds** (default 3/5/8) rather than a single hard alert. The
  first nudge names the tool and run length; later ones also quote the arguments
  and instruct the model to stop using them.
* **Reset on user interjection** — a new user message changes the context, so
  repetition across it is not a loop.
* **One reminder per threshold crossing.** The previous implementation re-fired
  on every subsequent step: its own injected message carries no ``tool_calls``,
  so the history tail it inspects never changed and the trigger stayed true,
  spamming the alert into every following request. Fired thresholds are now read
  back out of the history (see ``_MARKER``), keeping state in the graph and the
  guard idempotent.
* **Turn-level signatures.** Arguments are compared per *assistant turn*, so one
  turn issuing the same call three times in parallel counts as a single attempt
  rather than an instant threshold breach.
"""

import json
import re
from typing import Any

from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

#: Sentinel stamped on injected reminders. Distinguishes this guard's own
#: messages from genuine user turns (which reset the chain) and records which
#: threshold already fired.
_MARKER = "[doom-loop-guard:{count}]"
_MARKER_RE = re.compile(r"\[doom-loop-guard:(\d+)\]")

#: Default escalation ladder, matching the harness guard.
_DEFAULT_THRESHOLDS = (3, 5, 8)

#: Maximum characters of canonical arguments quoted back to the model. Without a
#: cap, a large payload (a long SQL string, a file body) would ride into every
#: subsequent request — precisely in the loop scenario. Bounds the *reminder*
#: only; detection always compares the full canonical string.
_ARGS_PREVIEW_CHARS = 500


def _canonical(args: Any) -> str:
    """Order-independent string form of one call's arguments.

    ``sort_keys`` recurses through nested dicts, so two argument objects that
    differ only in key order canonicalize identically.
    """
    return json.dumps(args or {}, sort_keys=True, default=str)


def _turn_signature(message: Any) -> str | None:
    """Signature of one assistant turn, or ``None`` if it issued no tool calls.

    Parallel calls within a turn are part of that turn's identity rather than
    separate attempts, so the whole batch is canonicalized together.
    """
    tool_calls = getattr(message, "tool_calls", None)
    if not tool_calls:
        return None
    calls = []
    for tc in tool_calls:
        if isinstance(tc, dict):
            name, args = tc.get("name"), tc.get("args")
        else:
            name, args = getattr(tc, "name", None), getattr(tc, "args", {})
        calls.append([name, _canonical(args)])
    return json.dumps(calls, default=str)


def _decode(signature: str) -> list[list[str]]:
    try:
        return json.loads(signature)
    except (ValueError, TypeError):
        return []


def _tool_name(signature: str) -> str:
    """Tool name to quote in reminders (the first of the turn's batch)."""
    calls = _decode(signature)
    return (calls[0][0] if calls and calls[0] else None) or "unknown"


def _preview_args(signature: str) -> str:
    """Head-truncated canonical arguments of the repeated turn."""
    calls = _decode(signature)
    rendered = "; ".join(f"{name}({args})" for name, args in calls) if calls else signature
    if len(rendered) <= _ARGS_PREVIEW_CHARS:
        return rendered
    omitted = len(rendered) - _ARGS_PREVIEW_CHARS
    return f"{rendered[:_ARGS_PREVIEW_CHARS]}... (+{omitted} more chars)"


def _gentle_reminder(tool_name: str, count: int) -> str:
    return (
        "SYSTEM ALERT: DOOM LOOP DETECTED. You have called tool "
        f"'{tool_name}' with identical arguments {count} times in a row. "
        "Analyze the previous result carefully before calling it again: if the "
        "task is not complete, use different arguments or a different approach."
    )


def _detailed_reminder(tool_name: str, count: int, args_preview: str) -> str:
    return (
        "SYSTEM ALERT: DOOM LOOP DETECTED.\n"
        f"- tool: {tool_name}\n"
        f"- consecutive_calls: {count}\n"
        f"- arguments: {args_preview}\n"
        "These repeated calls are not making progress. Do not call this tool "
        "with these exact arguments again. Inspect the latest result and choose "
        "a different action, different arguments, or output your final answer if "
        "enough evidence has been gathered."
    )


class DoomLoopGuardMiddleware(AgentMiddleware):
    """Intercept runs of identical tool-call turns with escalating reminders."""

    def __init__(self, threshold: int = 3, thresholds: tuple[int, ...] | None = None):
        """
        Args:
            threshold: First threshold. Retained for backwards compatibility with
                existing call sites and tests.
            thresholds: Full escalation ladder. When omitted, defaults to
                ``threshold`` followed by the standard ladder values above it, so
                ``threshold=6`` yields ``(6, 8)`` rather than firing early.

        Raises:
            ValueError: if the resulting ladder is empty or holds a value below 2
                (a run of one call is not a repeat).
        """
        if thresholds is None:
            thresholds = (threshold,) + tuple(t for t in _DEFAULT_THRESHOLDS if t > threshold)
        ladder = sorted(set(thresholds))
        if not ladder:
            raise ValueError("thresholds must not be empty")
        if ladder[0] < 2:
            raise ValueError(f"invalid threshold {ladder[0]} — must be >= 2")
        self.threshold = ladder[0]
        self.thresholds = tuple(ladder)

    def before_agent(
        self, state: AgentState, runtime: Any = None, config: Any = None
    ) -> dict[str, Any] | None:
        """Inject a reminder when the tail run length hits an unfired threshold."""
        count, signature, already_fired = self._scan_tail(state.get("messages", []))
        if signature is None or count not in self.thresholds or count in already_fired:
            return None

        tool_name = _tool_name(signature)
        if count >= self.thresholds[-1]:
            cutoff_body = (
                f"EMERGENCY CUTOFF: Doom loop detected. Repeated identical tool '{tool_name}' "
                f"{count} times without progress."
            )
            return {
                "jump_to": "end",
                "messages": [AIMessage(content=f"{_MARKER.format(count=count)} {cutoff_body}")],
            }

        body = (
            _gentle_reminder(tool_name, count)
            if count == self.thresholds[0]
            else _detailed_reminder(tool_name, count, _preview_args(signature))
        )
        return {"messages": [HumanMessage(content=f"{_MARKER.format(count=count)} {body}")]}

    @staticmethod
    def _scan_tail(messages: list) -> tuple[int, str | None, set[int]]:
        """Walk the history backwards and measure the trailing repeat run.

        Returns:
            ``(count, signature, already_fired)`` where ``count`` is the number of
            consecutive assistant turns sharing ``signature``, and
            ``already_fired`` holds the thresholds this guard has previously
            reminded about within that same run.

        The walk stops at the first turn that breaks the chain: a genuine user
        message (context changed, so repetition across it is not a loop), an
        assistant turn with a different signature, or an assistant turn that made
        no tool call at all (the model produced an answer). Tool results and this
        guard's own reminders are transparent.
        """
        count = 0
        signature: str | None = None
        already_fired: set[int] = set()

        for message in reversed(messages):
            if isinstance(message, ToolMessage):
                continue
            if isinstance(message, HumanMessage):
                fired = _MARKER_RE.match(str(message.content or "").lstrip())
                if fired:
                    already_fired.add(int(fired.group(1)))
                    continue
                break  # genuine user interjection resets the chain

            turn = _turn_signature(message)
            if turn is None:
                break  # assistant answered instead of calling a tool
            if signature is None:
                signature = turn
            elif turn != signature:
                break
            count += 1

        return count, signature, already_fired
