"""Middleware to patch dangling tool calls in the messages history.

A provider rejects a transcript in which an assistant message requests a tool
call that no tool result answers, so an interrupted run cannot simply be
resumed: the missing results must be synthesized first.

Semantics follow the DeepSeek Harness ``interruptedTurnClosers`` repair. In
particular the synthetic result reports the outcome as *unknown* rather than as
cancelled. Nothing here can observe whether the tool actually ran, and a call
interrupted by a timeout or a crash may well have completed its side effects —
written a file, issued a DDL statement, sent a request. Telling the model it was
cancelled invites a blind retry of a non-idempotent operation, so the repair
states what is actually known and asks the model to reason about idempotency.
"""

from typing import Any

from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain_core.messages import ToolMessage
from langgraph.runtime import Runtime
from langgraph.types import Overwrite

#: Text of a synthetic result standing in for a tool call with no recorded
#: outcome. Deliberately does not claim the call was cancelled.
INTERRUPTED_TOOL_RESULT = (
    "Tool call {name} (id {call_id}) was interrupted and no result was recorded. "
    "Its outcome is unknown: it may have completed and taken effect, or it may "
    "never have run. Retry it only if the operation is read-only or idempotent. "
    "If it may have side effects, first verify the external state — or ask the "
    "user — before retrying. Do not retry blindly."
)


class PatchToolCallsMiddleware(AgentMiddleware):
    """Middleware to patch dangling tool calls in the messages history."""

    def before_agent(self, state: AgentState, runtime: Runtime[Any]) -> dict[str, Any] | None:
        """Before the agent runs, handle dangling tool calls from any AIMessage."""
        messages = state["messages"]
        if not messages:
            return None

        # One pass to collect answered ids, so the scan stays linear. Matching
        # per call against the tail of the list made this quadratic, which bites
        # exactly on the long histories a resumed run tends to have.
        answered = {
            message.tool_call_id
            for message in messages
            if message.type == "tool" and message.tool_call_id is not None
        }

        patched_messages = []
        dangling = 0
        for message in messages:
            patched_messages.append(message)
            if message.type != "ai" or not message.tool_calls:
                continue
            for tool_call in message.tool_calls:
                if tool_call["id"] in answered:
                    continue
                dangling += 1
                patched_messages.append(
                    ToolMessage(
                        content=INTERRUPTED_TOOL_RESULT.format(
                            name=tool_call["name"], call_id=tool_call["id"]
                        ),
                        name=tool_call["name"],
                        tool_call_id=tool_call["id"],
                        # Marked as an error so the model — and any downstream
                        # error handling — sees a failed call rather than a
                        # normal result whose text happens to read like a notice.
                        status="error",
                    )
                )

        # Overwriting unconditionally rewrote the whole message channel on every
        # single agent step, persisting a full copy of the history to the
        # checkpointer each time even when there was nothing to repair.
        if not dangling:
            return None
        return {"messages": Overwrite(patched_messages)}
