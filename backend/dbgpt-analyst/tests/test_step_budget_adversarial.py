"""tests/test_step_budget_adversarial.py — Adversarial Stress Tests for StepBudgetMiddleware.

Adversarially challenges StepBudgetMiddleware on:
1. Zero / missing / empty messages corner cases
2. Pure non-AI message streams (only HumanMessages, SystemMessages, ToolMessages)
3. Mixed multi-type message streams (Human, AI, Tool, System, ChatMessage, duck-typed)
4. Boundary condition: exactly alert_threshold remaining steps
5. Boundary condition: 1 remaining step
6. Boundary condition: 0 remaining steps (budget exhausted with emergency cutoff)
7. Boundary condition: negative remaining steps (budget exceeded / overrun)
8. Custom threshold configurations (alert_threshold=10, max_steps=20; adaptive threshold on small budgets)
9. Emergency cutoff toggle (emergency_cutoff=True vs False)
10. State immutability & message history protection (no in-place mutation or corruption)
11. Anti-spam deduplication when previous message was already an alert
12. System prompt dynamic countdown injection in wrap_model_call / awrap_model_call
"""

import copy
import pytest
from langchain_core.messages import (
    AIMessage,
    ChatMessage,
    FunctionMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain.agents.middleware.types import ModelRequest

from dbgpt_analyst.middleware.step_budget import StepBudgetMiddleware


def test_corner_zero_and_missing_messages():
    """Test behavior with empty dict, missing messages key, None value, and empty list."""
    middleware = StepBudgetMiddleware(max_steps=10, alert_threshold=5)

    # Empty dict
    state_empty = {}
    assert middleware.get_step_count(state_empty) == 0
    assert middleware.get_remaining_steps(state_empty) == 10
    assert middleware.before_agent(state_empty) is None

    # Empty messages list
    state_empty_list = {"messages": []}
    assert middleware.get_step_count(state_empty_list) == 0
    assert middleware.get_remaining_steps(state_empty_list) == 10
    assert middleware.before_agent(state_empty_list) is None

    # Non-dict object with no messages attribute
    class DummyState:
        pass

    assert middleware.get_step_count(DummyState()) == 0
    assert middleware.get_remaining_steps(DummyState()) == 10
    assert middleware.before_agent(DummyState()) is None


def test_corner_only_human_and_system_messages():
    """Test state containing only Human, System, or Tool messages without any AI turns."""
    middleware = StepBudgetMiddleware(max_steps=5, alert_threshold=5)

    messages = [
        SystemMessage(content="You are a data analyst."),
        HumanMessage(content="Hello"),
        HumanMessage(content="Are you there?"),
        HumanMessage(content="Please respond"),
    ]
    state = {"messages": messages}

    # Step count must remain 0 since no AIMessage has been generated
    assert middleware.get_step_count(state) == 0
    assert middleware.get_remaining_steps(state) == 5
    # Crucial: Even though remaining_steps (5) <= alert_threshold (5),
    # no alert should trigger because current_step is 0 (first user turn).
    assert middleware.before_agent(state) is None


def test_corner_mixed_message_streams():
    """Test accurate turn counting across diverse mixed message streams."""
    middleware = StepBudgetMiddleware(max_steps=20, alert_threshold=5)

    class CustomDuckAIMessage:
        def __init__(self, content: str):
            self.content = content
            self.type = "ai"

    class CustomDuckHumanMessage:
        def __init__(self, content: str):
            self.content = content
            self.type = "human"

    messages = [
        SystemMessage(content="System instruction"),
        HumanMessage(content="User query 1"),
        AIMessage(content="AI response 1"),  # AI 1
        ToolMessage(content="Tool result 1", tool_call_id="call_1"),
        AIMessage(content="AI response 2"),  # AI 2
        FunctionMessage(name="func_a", content="result"),
        ChatMessage(role="assistant", content="Legacy role assistant"),  # Not AIMessage / type='ai' unless typed
        CustomDuckAIMessage(content="Duck typed AI message"),  # AI 3
        CustomDuckHumanMessage(content="Duck typed Human message"),
        HumanMessage(content="User follow up"),
        AIMessage(content="AI response 4"),  # AI 4
    ]

    state = {"messages": messages}
    step_count = middleware.get_step_count(state)
    assert step_count == 4
    assert middleware.get_remaining_steps(state) == 16
    assert middleware.before_agent(state) is None


def test_boundary_exactly_alert_threshold_remaining():
    """Test boundary where remaining_steps == alert_threshold."""
    middleware = StepBudgetMiddleware(max_steps=10, alert_threshold=5)

    # 4 AI turns -> 6 remaining (> 5) -> No alert
    state_4 = {"messages": [AIMessage(content=f"Turn {i}") for i in range(4)]}
    assert middleware.get_step_count(state_4) == 4
    assert middleware.get_remaining_steps(state_4) == 6
    assert middleware.before_agent(state_4) is None

    # 5 AI turns -> 5 remaining (== 5) -> Alert triggered
    state_5 = {"messages": [AIMessage(content=f"Turn {i}") for i in range(5)]}
    assert middleware.get_step_count(state_5) == 5
    assert middleware.get_remaining_steps(state_5) == 5
    res = middleware.before_agent(state_5)
    assert res is not None
    assert "messages" in res
    assert "[SYSTEM ALERT: Step budget remaining: 5/10 turns." in res["messages"][0].content


def test_boundary_one_remaining_step():
    """Test boundary where remaining_steps == 1."""
    middleware = StepBudgetMiddleware(max_steps=10, alert_threshold=5)

    state = {"messages": [AIMessage(content=f"Turn {i}") for i in range(9)]}
    assert middleware.get_step_count(state) == 9
    assert middleware.get_remaining_steps(state) == 1
    res = middleware.before_agent(state)
    assert res is not None
    assert "[SYSTEM ALERT: Step budget remaining: 1/10 turns." in res["messages"][0].content
    assert "Please finalize your analysis" in res["messages"][0].content


def test_boundary_zero_remaining_steps_and_emergency_cutoff():
    """Test boundary where remaining_steps == 0 (budget fully exhausted)."""
    # 1. With default emergency_cutoff=True -> triggers jump_to="end" with AIMessage
    middleware_cutoff = StepBudgetMiddleware(max_steps=10, alert_threshold=5, emergency_cutoff=True)
    state = {"messages": [AIMessage(content=f"Turn {i}") for i in range(10)]}
    assert middleware_cutoff.get_step_count(state) == 10
    assert middleware_cutoff.get_remaining_steps(state) == 0
    res_cutoff = middleware_cutoff.before_agent(state)
    assert res_cutoff is not None
    assert res_cutoff.get("jump_to") == "end"
    assert len(res_cutoff["messages"]) == 1
    assert isinstance(res_cutoff["messages"][0], AIMessage)
    assert "Step budget remaining: 0/10 turns." in res_cutoff["messages"][0].content
    assert "Execution budget exhausted." in res_cutoff["messages"][0].content

    # 2. With emergency_cutoff=False -> triggers warning alert
    middleware_no_cutoff = StepBudgetMiddleware(max_steps=10, alert_threshold=5, emergency_cutoff=False)
    res_no_cutoff = middleware_no_cutoff.before_agent(state)
    assert res_no_cutoff is not None
    assert res_no_cutoff.get("jump_to") is None
    assert isinstance(res_no_cutoff["messages"][0], HumanMessage)
    assert "[SYSTEM ALERT: Step budget remaining: 0/10 turns." in res_no_cutoff["messages"][0].content


def test_boundary_negative_remaining_steps_budget_exceeded():
    """Test boundary where agent execution exceeds max_steps (overrun clamping)."""
    middleware = StepBudgetMiddleware(max_steps=10, alert_threshold=5, emergency_cutoff=True)

    # 15 AI turns when max_steps is 10
    state = {"messages": [AIMessage(content=f"Turn {i}") for i in range(15)]}
    assert middleware.get_step_count(state) == 15
    # Must clamp to 0, never negative
    assert middleware.get_remaining_steps(state) == 0
    res = middleware.before_agent(state)
    assert res is not None
    assert res.get("jump_to") == "end"
    assert "Step budget remaining: 0/10 turns." in res["messages"][0].content


def test_custom_threshold_configuration_20_10():
    """Test custom configuration: max_steps=20, alert_threshold=10."""
    middleware = StepBudgetMiddleware(max_steps=20, alert_threshold=10)

    # Step 9 -> 11 remaining (> 10) -> No alert
    state_9 = {"messages": [AIMessage(content=f"Step {i}") for i in range(9)]}
    assert middleware.get_remaining_steps(state_9) == 11
    assert middleware.before_agent(state_9) is None

    # Step 10 -> 10 remaining (== 10) -> Alert triggered
    state_10 = {"messages": [AIMessage(content=f"Step {i}") for i in range(10)]}
    assert middleware.get_remaining_steps(state_10) == 10
    res_10 = middleware.before_agent(state_10)
    assert res_10 is not None
    assert "Step budget remaining: 10/20 turns." in res_10["messages"][0].content

    # Step 19 -> 1 remaining -> Alert triggered
    state_19 = {"messages": [AIMessage(content=f"Step {i}") for i in range(19)]}
    assert middleware.get_remaining_steps(state_19) == 1
    res_19 = middleware.before_agent(state_19)
    assert res_19 is not None
    assert "Step budget remaining: 1/20 turns." in res_19["messages"][0].content

    # Step 20 -> 0 remaining -> Emergency cutoff triggered
    state_20 = {"messages": [AIMessage(content=f"Step {i}") for i in range(20)]}
    assert middleware.get_remaining_steps(state_20) == 0
    res_20 = middleware.before_agent(state_20)
    assert res_20 is not None
    assert res_20.get("jump_to") == "end"
    assert "Step budget remaining: 0/20 turns." in res_20["messages"][0].content


def test_adaptive_threshold_for_small_budgets():
    """Test adaptive threshold scaling for small budgets (e.g. max_steps <= 5)."""
    # When max_steps=4, alert_threshold=5:
    # effective_threshold = min(5, max(1, 4 // 2)) = 2
    middleware = StepBudgetMiddleware(max_steps=4, alert_threshold=5, emergency_cutoff=True)

    # Step 1 -> 3 remaining (> 2) -> No alert
    state_1 = {"messages": [AIMessage(content="Step 1")]}
    assert middleware.get_remaining_steps(state_1) == 3
    assert middleware.before_agent(state_1) is None

    # Step 2 -> 2 remaining (<= 2) -> Alert
    state_2 = {"messages": [AIMessage(content="Step 1"), AIMessage(content="Step 2")]}
    assert middleware.get_remaining_steps(state_2) == 2
    res_2 = middleware.before_agent(state_2)
    assert res_2 is not None
    assert "Step budget remaining: 2/4 turns." in res_2["messages"][0].content

    # Step 3 -> 1 remaining (<= 2) -> Alert
    state_3 = {"messages": [AIMessage(content=f"Step {i}") for i in range(3)]}
    assert middleware.get_remaining_steps(state_3) == 1
    res_3 = middleware.before_agent(state_3)
    assert res_3 is not None
    assert "Step budget remaining: 1/4 turns." in res_3["messages"][0].content

    # Step 4 -> 0 remaining -> Cutoff
    state_4 = {"messages": [AIMessage(content=f"Step {i}") for i in range(4)]}
    assert middleware.get_remaining_steps(state_4) == 0
    res_4 = middleware.before_agent(state_4)
    assert res_4.get("jump_to") == "end"


def test_anti_spam_duplicate_alert_suppression():
    """Test that consecutive alerts are suppressed if the immediately preceding message is already an alert."""
    middleware = StepBudgetMiddleware(max_steps=10, alert_threshold=5)

    alert_msg = HumanMessage(content="[SYSTEM ALERT: Step budget remaining: 3/10 turns. Please finalize...]")
    state_with_alert_as_last = {
        "messages": [
            AIMessage(content="Step 1"),
            AIMessage(content="Step 2"),
            AIMessage(content="Step 3"),
            AIMessage(content="Step 4"),
            AIMessage(content="Step 5"),
            AIMessage(content="Step 6"),
            AIMessage(content="Step 7"),
            alert_msg,
        ]
    }
    # Since last message is already a step alert, before_agent returns None to avoid spamming the LLM
    res = middleware.before_agent(state_with_alert_as_last)
    assert res is None


def test_state_immutability_and_injection_safety():
    """Verify before_agent never mutates the original state dictionary or messages list."""
    middleware = StepBudgetMiddleware(max_steps=10, alert_threshold=5)

    original_messages = [
        HumanMessage(content="Initial query"),
        AIMessage(content="Step 1"),
        ToolMessage(content="Data", tool_call_id="call_x"),
        AIMessage(content="Step 2"),
        AIMessage(content="Step 3"),
        AIMessage(content="Step 4"),
        AIMessage(content="Step 5"),
        AIMessage(content="Step 6"),
    ]
    # Deep copy for identity / content comparison
    messages_snapshot = copy.deepcopy(original_messages)
    original_state = {
        "messages": original_messages,
        "query_results": [{"id": 1, "val": 100}],
        "custom_metadata": {"user": "tester"},
    }
    state_snapshot = copy.deepcopy(original_state)

    # Invoke before_agent
    result = middleware.before_agent(original_state)

    # 1. Returned dictionary must be a delta dict
    assert isinstance(result, dict)
    assert "messages" in result
    assert len(result["messages"]) == 1
    injected_msg = result["messages"][0]
    assert isinstance(injected_msg, HumanMessage)

    # 2. Original state dictionary must be completely untouched
    assert len(original_state["messages"]) == len(messages_snapshot)
    assert original_state["messages"] == messages_snapshot
    assert original_state["query_results"] == state_snapshot["query_results"]
    assert original_state["custom_metadata"] == state_snapshot["custom_metadata"]

    # 3. Injected message must NOT be present in original state
    assert injected_msg not in original_state["messages"]


def test_warning_message_formatting_and_semantics():
    """Verify the syntactic and semantic structure of the injected warning message."""
    middleware = StepBudgetMiddleware(max_steps=15, alert_threshold=3)

    state = {"messages": [AIMessage(content=f"Step {i}") for i in range(13)]}
    result = middleware.before_agent(state)

    assert result is not None
    msg = result["messages"][0]
    assert isinstance(msg, HumanMessage)
    content = msg.content

    # Strict structure assertions
    assert content.startswith("[SYSTEM ALERT:")
    assert "Step budget remaining: 2/15 turns." in content
    assert "Please finalize your analysis and output your final response immediately." in content


def test_wrap_model_call_system_prompt_enrichment():
    """Verify wrap_model_call enriches SystemMessage with dynamic countdown metadata."""
    middleware = StepBudgetMiddleware(max_steps=20, alert_threshold=5)

    initial_sys_msg = SystemMessage(content="You are a data analyst.")
    req = ModelRequest(
        system_message=initial_sys_msg,
        messages=[HumanMessage(content="Hi"), AIMessage(content="Hello"), HumanMessage(content="Count")],
        model=None,
    )

    def dummy_handler(request: ModelRequest):
        assert request.system_message is not None
        assert "You are a data analyst." in request.system_message.content
        assert "[Step Budget: Turn 2/20 | 19 steps remaining]" in request.system_message.content
        return AIMessage(content="Processed")

    res = middleware.wrap_model_call(req, dummy_handler)
    assert isinstance(res, AIMessage)
    assert res.content == "Processed"
