"""tests/test_doom_loop_guard.py — Adversarial & Unit Test Suite for DoomLoopGuardMiddleware.

Verifies:
1. First threshold (3) triggers gentle warning nudge.
2. Second threshold (5) escalates with canonical argument preview.
3. Third threshold (8) triggers hard emergency cutoff with jump_to: "end".
4. Custom threshold ladders trigger cutoff at the specified ceiling.
5. User interjections cleanly reset loop detection.
6. Order-independent JSON argument canonicalization.
7. Varied arguments or varied tools never cause false positive loop alerts.
8. Idempotency: alerts fire only once per threshold crossing.
"""

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from dbgpt_analyst.guard.doom_loop_guard import DoomLoopGuardMiddleware


def _call(turn_idx: int, sql: str = "SELECT * FROM sales", tool: str = "query_db") -> AIMessage:
    """Helper to construct an assistant tool call turn."""
    return AIMessage(
        content="",
        tool_calls=[{"id": f"call_{turn_idx}", "name": tool, "args": {"sql": sql}}],
    )


def test_doom_loop_threshold_3_gentle_nudge():
    """Verify first threshold (count=3) injects a gentle reminder."""
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [_call(1), _call(2), _call(3)]

    res = guard.before_agent({"messages": messages})
    assert res is not None
    assert "jump_to" not in res
    assert len(res["messages"]) == 1
    content = res["messages"][0].content
    assert "[doom-loop-guard:3]" in content
    assert "SYSTEM ALERT: DOOM LOOP DETECTED" in content
    assert "query_db" in content


def test_doom_loop_threshold_5_escalated_warning():
    """Verify second threshold (count=5) escalates with quoted arguments."""
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [_call(i) for i in range(1, 4)]
    
    # Fire threshold 3
    alert_3 = guard.before_agent({"messages": messages})
    assert alert_3 is not None
    messages += alert_3["messages"]

    # Step 4 (between 3 and 5) should stay silent
    messages.append(_call(4))
    assert guard.before_agent({"messages": messages}) is None

    # Step 5 reaches next threshold
    messages.append(_call(5))
    alert_5 = guard.before_agent({"messages": messages})
    assert alert_5 is not None
    assert "jump_to" not in alert_5
    content = alert_5["messages"][0].content
    assert "[doom-loop-guard:5]" in content
    assert "consecutive_calls: 5" in content
    assert "SELECT * FROM sales" in content


def test_doom_loop_threshold_8_emergency_cutoff_jump_to_end():
    """Verify final threshold (count=8) triggers hard emergency cutoff with jump_to: 'end'."""
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [_call(i) for i in range(1, 4)]
    messages += guard.before_agent({"messages": messages})["messages"]

    # Progress to step 5
    messages.append(_call(4))
    messages.append(_call(5))
    messages += guard.before_agent({"messages": messages})["messages"]

    # Steps 6 and 7 (between 5 and 8) stay silent
    messages.append(_call(6))
    assert guard.before_agent({"messages": messages}) is None
    messages.append(_call(7))
    assert guard.before_agent({"messages": messages}) is None

    # Step 8 reaches emergency cutoff threshold!
    messages.append(_call(8))
    cutoff_res = guard.before_agent({"messages": messages})
    assert cutoff_res is not None
    assert cutoff_res.get("jump_to") == "end"
    assert len(cutoff_res["messages"]) == 1
    cutoff_content = cutoff_res["messages"][0].content
    assert "[doom-loop-guard:8]" in cutoff_content
    assert "EMERGENCY CUTOFF: Doom loop detected" in cutoff_content
    assert "query_db" in cutoff_content


def test_doom_loop_custom_ladder_cutoff():
    """Verify custom thresholds ladder (e.g. (2, 4)) triggers cutoff at highest value."""
    guard = DoomLoopGuardMiddleware(threshold=2, thresholds=(2, 4))
    messages = [_call(1), _call(2)]

    # Threshold 2 is warning
    res_2 = guard.before_agent({"messages": messages})
    assert res_2 is not None
    assert "jump_to" not in res_2
    messages += res_2["messages"]

    messages.append(_call(3))
    assert guard.before_agent({"messages": messages}) is None

    messages.append(_call(4))
    res_4 = guard.before_agent({"messages": messages})
    assert res_4 is not None
    assert res_4.get("jump_to") == "end"
    assert "EMERGENCY CUTOFF" in res_4["messages"][0].content


def test_doom_loop_resets_on_user_input():
    """Verify human message breaks the consecutive repetition chain."""
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [
        _call(1),
        _call(2),
        HumanMessage(content="Please adjust the date range instead"),
        _call(3),
        _call(4),
    ]
    # Chain of 2 after user message should not trigger threshold 3
    assert guard.before_agent({"messages": messages}) is None


def test_doom_loop_canonical_argument_order():
    """Verify dictionary key ordering does not disguise identical tool arguments."""
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [
        AIMessage(content="", tool_calls=[{"id": "c1", "name": "filter", "args": {"a": 1, "b": "test", "c": True}}]),
        AIMessage(content="", tool_calls=[{"id": "c2", "name": "filter", "args": {"c": True, "a": 1, "b": "test"}}]),
        AIMessage(content="", tool_calls=[{"id": "c3", "name": "filter", "args": {"b": "test", "c": True, "a": 1}}]),
    ]
    res = guard.before_agent({"messages": messages})
    assert res is not None
    assert "[doom-loop-guard:3]" in res["messages"][0].content


def test_doom_loop_different_queries_do_not_trigger():
    """Verify varying SQL queries make legitimate progress and never trip guard."""
    guard = DoomLoopGuardMiddleware(threshold=3)
    messages = [
        _call(1, sql="SELECT * FROM store_1"),
        _call(2, sql="SELECT * FROM store_2"),
        _call(3, sql="SELECT * FROM store_3"),
        _call(4, sql="SELECT * FROM store_4"),
    ]
    assert guard.before_agent({"messages": messages}) is None
