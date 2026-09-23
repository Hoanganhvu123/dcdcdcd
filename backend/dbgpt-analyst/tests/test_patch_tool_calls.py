"""Repair of dangling tool calls left behind by an interrupted run.

A provider rejects a transcript where an assistant tool call has no matching
tool result, so a resumed run must synthesize the missing results first.
"""

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from dbgpt_analyst.libs.deepagents.middleware.patch_tool_calls import (
    PatchToolCallsMiddleware,
)


def _ai(*calls):
    return AIMessage(
        content="",
        tool_calls=[
            {"id": cid, "name": name, "args": {}} for cid, name in calls
        ],
    )


def _state(messages):
    return {"messages": messages}


def test_no_change_returns_none():
    """A balanced history must not rewrite the message channel.

    Returning Overwrite unconditionally persisted a full copy of the history to
    the checkpointer on every agent step.
    """
    guard = PatchToolCallsMiddleware()
    messages = [
        HumanMessage(content="hi"),
        _ai(("c1", "query_db")),
        ToolMessage(content="[]", tool_call_id="c1"),
    ]
    assert guard.before_agent(_state(messages), None) is None


def test_empty_history_returns_none():
    assert PatchToolCallsMiddleware().before_agent(_state([]), None) is None


def test_dangling_call_is_answered():
    guard = PatchToolCallsMiddleware()
    result = guard.before_agent(_state([_ai(("c1", "query_db"))]), None)
    assert result is not None
    patched = result["messages"].value
    tool_messages = [m for m in patched if isinstance(m, ToolMessage)]
    assert [m.tool_call_id for m in tool_messages] == ["c1"]


def test_synthetic_result_is_marked_as_an_error():
    guard = PatchToolCallsMiddleware()
    patched = guard.before_agent(_state([_ai(("c1", "write_file"))]), None)["messages"].value
    assert patched[-1].status == "error"


def test_synthetic_result_does_not_claim_the_call_was_cancelled():
    """Asserting cancellation invites a blind retry of a side-effecting tool.

    The middleware cannot observe whether the tool ran, so it must report the
    outcome as unknown and ask for idempotency reasoning instead.
    """
    guard = PatchToolCallsMiddleware()
    content = guard.before_agent(_state([_ai(("c1", "drop_table"))]), None)["messages"].value[-1].content
    assert "cancelled" not in content.lower()
    assert "unknown" in content.lower()
    assert "idempotent" in content.lower()


def test_only_the_unanswered_call_of_a_batch_is_patched():
    guard = PatchToolCallsMiddleware()
    messages = [
        _ai(("c1", "a"), ("c2", "b"), ("c3", "c")),
        ToolMessage(content="ok", tool_call_id="c1"),
        ToolMessage(content="ok", tool_call_id="c3"),
    ]
    patched = guard.before_agent(_state(messages), None)["messages"].value
    synthetic = [m for m in patched if isinstance(m, ToolMessage) and m.status == "error"]
    assert [m.tool_call_id for m in synthetic] == ["c2"]


def test_every_call_ends_up_answered():
    """The invariant the provider actually enforces."""
    guard = PatchToolCallsMiddleware()
    messages = [
        _ai(("c1", "a")),
        ToolMessage(content="ok", tool_call_id="c1"),
        _ai(("c2", "b"), ("c3", "c")),
        HumanMessage(content="never mind, do something else"),
        _ai(("c4", "d")),
    ]
    patched = guard.before_agent(_state(messages), None)["messages"].value
    answered = {m.tool_call_id for m in patched if isinstance(m, ToolMessage)}
    requested = {
        tc["id"] for m in patched if isinstance(m, AIMessage) for tc in m.tool_calls
    }
    assert requested == answered


def test_result_answering_a_later_message_still_counts():
    """A result may be recorded out of position; it still answers the call."""
    guard = PatchToolCallsMiddleware()
    messages = [
        ToolMessage(content="late result", tool_call_id="c1"),
        _ai(("c1", "query_db")),
    ]
    assert guard.before_agent(_state(messages), None) is None
