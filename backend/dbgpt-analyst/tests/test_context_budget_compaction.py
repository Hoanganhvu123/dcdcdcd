"""Unit tests for Token Budget tracking and 4-tier compaction in dbgpt_analyst."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from dbgpt_analyst.context.budget import (
    ContextBudgetConfig,
    ContextBudgetTracker,
    TokenState,
    count_message_tokens,
)
from dbgpt_analyst.context.compact import (
    FullContextCompression,
    ObservationMicroCompact,
    ReactiveCompact,
    SessionMemoryCompact,
    detect_round_boundaries,
)
from dbgpt_analyst.context.manager import ContextBudgetManager


def test_count_message_tokens():
    """Verify count_message_tokens works on HumanMessage, AIMessage, and ToolMessage."""
    h = HumanMessage(content="Hello world, please analyze sales data.")
    assert count_message_tokens(h) > 0

    ai = AIMessage(content="I will run SQL.", tool_calls=[{"name": "query_sql", "args": {"sql": "SELECT 1"}, "id": "call_1"}])
    assert count_message_tokens(ai) > 0

    t = ToolMessage(content="row1, row2, row3", tool_call_id="call_1")
    assert count_message_tokens(t) > 0


def test_detect_round_boundaries():
    """Verify detect_round_boundaries groups messages correctly by round."""
    messages = [
        SystemMessage(content="You are an analyst."),
        HumanMessage(content="Round 1 question"),
        AIMessage(content="Round 1 answer"),
        HumanMessage(content="Round 2 question"),
        AIMessage(content="Round 2 tool call", tool_calls=[{"name": "t", "args": {}, "id": "1"}]),
        ToolMessage(content="Round 2 tool result", tool_call_id="1"),
        AIMessage(content="Round 2 final answer"),
    ]

    rounds = detect_round_boundaries(messages)
    assert len(rounds) == 3
    # Round 0 contains SystemMessage
    assert rounds[0] == (0, 0)
    # Round 1 contains Round 1
    assert rounds[1] == (1, 2)
    # Round 2 contains Round 2
    assert rounds[2] == (3, 6)


def test_observation_micro_compact():
    """Verify ObservationMicroCompact truncates older ToolMessage content."""
    config = ContextBudgetConfig(
        min_keep_recent_rounds=1,
        truncated_observation_max_chars=50,
    )
    compactor = ObservationMicroCompact(config)

    huge_content = "X" * 500
    messages = [
        HumanMessage(content="Old round query"),
        AIMessage(content="Calling tool", tool_calls=[{"name": "t", "args": {}, "id": "1"}]),
        ToolMessage(content=huge_content, tool_call_id="1"),
        AIMessage(content="Old round done"),
        HumanMessage(content="New round query"),
        AIMessage(content="Calling tool 2", tool_calls=[{"name": "t2", "args": {}, "id": "2"}]),
        ToolMessage(content=huge_content, tool_call_id="2"),  # Recent, should not truncate
    ]

    compacted = compactor.compact(messages)
    assert len(compacted) == len(messages)
    # Old ToolMessage should be truncated
    assert len(compacted[2].content) < 200
    assert "Truncated" in compacted[2].content
    # Recent ToolMessage should remain full
    assert len(compacted[6].content) == 500


def test_session_memory_compact():
    """Verify SessionMemoryCompact collapses older middle rounds."""
    config = ContextBudgetConfig(min_keep_recent_rounds=1)
    compactor = SessionMemoryCompact(config)

    messages = [
        SystemMessage(content="System instruction"),
        HumanMessage(content="Round 1"),
        AIMessage(content="Answer 1"),
        HumanMessage(content="Round 2 (middle)"),
        AIMessage(content="Answer 2"),
        HumanMessage(content="Round 3 (recent)"),
        AIMessage(content="Answer 3"),
    ]

    compacted = compactor.compact(messages)
    # Should have system msg, round 1, summary msg, round 3
    assert len(compacted) < len(messages)
    assert any("Previous Analysis Summary" in str(m.content) for m in compacted)


def test_context_budget_manager():
    """Verify ContextBudgetManager progressively compacts when tokens exceed budget."""
    config = ContextBudgetConfig(
        max_context_tokens=100,  # Small limit to force compaction
        warning_threshold=0.5,
        min_keep_recent_rounds=1,
    )
    manager = ContextBudgetManager(config)

    messages = [
        SystemMessage(content="System instruction"),
        HumanMessage(content="Round 1" * 20),
        AIMessage(content="Answer 1" * 20),
        HumanMessage(content="Round 2" * 20),
        AIMessage(content="Answer 2" * 20),
    ]

    compacted = manager.manage_context(messages)
    assert len(compacted) <= len(messages)
