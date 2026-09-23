import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from dbgpt_analyst.middleware.doom_loop_guard import DoomLoopGuardMiddleware
from dbgpt_analyst.middleware.db_circuit_breaker import (
    SandboxCircuitBreakerMiddleware,
    _CIRCUIT_BREAKER_MARKER,
)


def test_doom_loop_guard_triggers():
    guard = DoomLoopGuardMiddleware(threshold=3)
    msg1 = AIMessage(content="", tool_calls=[{"id": "call_1", "name": "query_db", "args": {"sql": "SELECT 1"}}])
    msg2 = AIMessage(content="", tool_calls=[{"id": "call_2", "name": "query_db", "args": {"sql": "SELECT 1"}}])
    msg3 = AIMessage(content="", tool_calls=[{"id": "call_3", "name": "query_db", "args": {"sql": "SELECT 1"}}])

    state = {"messages": [msg1, msg2, msg3]}
    res = guard.before_agent(state)
    assert res is not None
    assert "DOOM LOOP DETECTED" in res["messages"][0].content


def test_doom_loop_guard_passes():
    guard = DoomLoopGuardMiddleware(threshold=3)
    msg1 = AIMessage(content="", tool_calls=[{"id": "call_1", "name": "query_db", "args": {"sql": "SELECT 1"}}])
    msg2 = AIMessage(content="", tool_calls=[{"id": "call_2", "name": "query_db", "args": {"sql": "SELECT 2"}}])

    state = {"messages": [msg1, msg2]}
    res = guard.before_agent(state)
    assert res is None


def test_circuit_breaker_triggers():
    cb = SandboxCircuitBreakerMiddleware(threshold=2)
    t1 = ToolMessage(content="SandboxClientError sb-12345 failed", tool_call_id="call_1")
    t2 = ToolMessage(content="SandboxClientError sb-12345 failed", tool_call_id="call_2")
    t3 = ToolMessage(content="SandboxClientError sb-12345 failed", tool_call_id="call_3")

    state = {"messages": [t1, t2, t3]}
    res = cb.before_model(state, runtime=None)
    assert res is not None
    assert res.get("jump_to") == "end"
    assert _CIRCUIT_BREAKER_MARKER in res["messages"][0].content


def _call(i, sql="SELECT 1", tool="query_db"):
    return AIMessage(content="", tool_calls=[{"id": f"call_{i}", "name": tool, "args": {"sql": sql}}])


def test_doom_loop_guard_fires_once_per_threshold():
    """Regression: the guard used to re-inject its alert on every later step.

    Its own reminder carries no tool_calls, so the history tail it inspects was
    unchanged and the trigger stayed true forever, spamming every request.
    """
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [_call(1), _call(2), _call(3)]

    first = guard.before_agent({"messages": messages})
    assert first is not None
    messages += first["messages"]

    # Same tail, one step later: must stay silent instead of re-alerting.
    assert guard.before_agent({"messages": messages}) is None


def test_doom_loop_guard_escalates_with_arguments():
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [_call(i) for i in range(1, 4)]
    messages += guard.before_agent({"messages": messages})["messages"]

    # Counts 4 is between rungs; 5 is the next rung and escalates.
    messages.append(_call(4))
    assert guard.before_agent({"messages": messages}) is None

    messages.append(_call(5))
    res = guard.before_agent({"messages": messages})
    assert res is not None
    content = res["messages"][0].content
    assert "consecutive_calls: 5" in content
    assert "SELECT 1" in content  # arguments quoted so the model sees what repeats


def test_doom_loop_guard_resets_on_user_interjection():
    """New user input changes the context, so repetition across it is not a loop."""
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [_call(1), _call(2), HumanMessage(content="try it once more"), _call(3)]
    assert guard.before_agent({"messages": messages}) is None


def test_doom_loop_guard_ignores_tool_results():
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = []
    for i in range(1, 4):
        messages.append(_call(i))
        messages.append(ToolMessage(content="[]", tool_call_id=f"call_{i}"))
    assert guard.before_agent({"messages": messages}) is not None


def test_doom_loop_guard_counts_parallel_batch_as_one_turn():
    """Three identical calls issued in one turn are one attempt, not a breach."""
    guard = DoomLoopGuardMiddleware(threshold=3)
    batch = AIMessage(
        content="",
        tool_calls=[
            {"id": f"call_{i}", "name": "query_db", "args": {"sql": "SELECT 1"}} for i in range(3)
        ],
    )
    assert guard.before_agent({"messages": [batch]}) is None


def test_doom_loop_guard_canonicalizes_argument_order():
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [
        AIMessage(content="", tool_calls=[{"id": "a", "name": "q", "args": {"x": 1, "y": 2}}]),
        AIMessage(content="", tool_calls=[{"id": "b", "name": "q", "args": {"y": 2, "x": 1}}]),
        AIMessage(content="", tool_calls=[{"id": "c", "name": "q", "args": {"x": 1, "y": 2}}]),
    ]
    assert guard.before_agent({"messages": messages}) is not None


def test_doom_loop_guard_rejects_degenerate_threshold():
    with pytest.raises(ValueError):
        DoomLoopGuardMiddleware(threshold=1)
