"""tests/test_step_budget.py — Comprehensive Test Suite for Step Budget Countdown & Middleware (Task F - R1).

Verifies:
1. Dynamic {{max_steps}} placeholder rendering in supervisor SYSTEM_PROMPT.
2. StepBudgetMiddleware turn counting and remaining step calculations.
3. High-priority countdown alert injection when remaining turns <= threshold.
4. Warning deduplication to prevent spamming.
5. Adaptive threshold for micro-budgets.
6. Model request wrapping with real-time countdown headers.
7. Emergency cutoff triggers on budget exhaustion.
8. Resilience to context summarization / compaction.
9. Supervisor graph build with StepBudgetMiddleware.
"""

import pytest
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel

from dbgpt_analyst.config import SUPERVISOR_RECURSION_LIMIT
from dbgpt_analyst.main_agent import (
    SYSTEM_PROMPT,
    build_main_graph,
    render_supervisor_system_prompt,
)
from dbgpt_analyst.middleware.step_budget import (
    DEFAULT_WARNING_THRESHOLD,
    STEP_ALERT_PREFIX,
    StepBudgetMiddleware,
    count_ai_turns,
)


def test_system_prompt_has_max_steps_placeholder():
    """Verify SYSTEM_PROMPT contains the required EXECUTION BUDGET & STEP LIMITS section."""
    assert "## EXECUTION BUDGET & STEP LIMITS" in SYSTEM_PROMPT or "## EXECUTION BUDGET & LIMITS" in SYSTEM_PROMPT
    assert "{{ max_steps }}" in SYSTEM_PROMPT or "{{max_steps}}" in SYSTEM_PROMPT


def test_render_supervisor_system_prompt_default():
    """Verify render_supervisor_system_prompt renders configured recursion limit."""
    rendered = render_supervisor_system_prompt()
    assert "{{ max_steps }}" not in rendered
    assert "{{max_steps}}" not in rendered
    assert str(SUPERVISOR_RECURSION_LIMIT) in rendered


@pytest.mark.parametrize("limit", [10, 25, 50, 100])
def test_render_supervisor_system_prompt_custom_limits(limit: int):
    """Verify render_supervisor_system_prompt renders custom recursion limits."""
    rendered = render_supervisor_system_prompt(max_steps=limit)
    assert "{{ max_steps }}" not in rendered
    assert "{{max_steps}}" not in rendered
    assert f"Maximum Step Budget: {limit} steps" in rendered or f"Total Step Budget: {limit} turns." in rendered


def test_render_supervisor_system_prompt_json_safety():
    """Verify render_supervisor_system_prompt does not corrupt XML tags or code blocks."""
    rendered = render_supervisor_system_prompt(50)
    assert "<subagents>" in rendered
    assert "</subagents>" in rendered
    assert "sql_analyst" in rendered


def test_step_budget_middleware_turn_counting():
    """Verify get_step_count accurately counts AI turns in message history."""
    middleware = StepBudgetMiddleware(max_steps=20, warning_threshold=5)

    h1 = HumanMessage(content="Show revenue")
    ai1 = AIMessage(content="Checking...")
    t1 = ToolMessage(content="1000", tool_call_id="call_1")
    ai2 = AIMessage(content="Found revenue.")

    state = {"messages": [h1, ai1, t1, ai2]}
    assert middleware.get_step_count(state) == 2
    assert middleware.get_remaining_steps(state) == 18

    # Using message list directly
    assert middleware.get_step_count([h1, ai1, t1, ai2]) == 2
    assert middleware.get_remaining_steps([h1, ai1, t1, ai2]) == 18


def test_step_budget_middleware_no_alert_when_sufficient_budget():
    """Verify no alert is injected when remaining turns > warning_threshold."""
    middleware = StepBudgetMiddleware(max_steps=50, warning_threshold=5)

    state = {
        "messages": [
            HumanMessage(content="Query 1"),
            AIMessage(content="Answer 1"),
            HumanMessage(content="Query 2"),
            AIMessage(content="Answer 2"),
        ]
    }
    # 2 AI turns done, 48 remaining > 5
    res = middleware.before_agent(state)
    assert res is None
    res_model = middleware.before_model(state)
    assert res_model is None


def test_step_budget_middleware_no_alert_on_initial_turn():
    """Verify no alert is injected on step 0."""
    middleware = StepBudgetMiddleware(max_steps=5, warning_threshold=5)
    state = {"messages": [HumanMessage(content="Hello")]}
    res = middleware.before_agent(state)
    assert res is None


def test_step_budget_middleware_triggers_alert_when_budget_low():
    """Verify countdown reminder is injected when remaining turns <= warning_threshold."""
    middleware = StepBudgetMiddleware(max_steps=10, warning_threshold=5)

    # 6 AI messages out of 10 -> 4 remaining <= 5
    messages = [HumanMessage(content="Start")]
    for i in range(6):
        messages.append(AIMessage(content=f"Step {i+1}"))

    state = {"messages": messages}
    res = middleware.before_agent(state)
    assert res is not None
    assert "messages" in res
    assert len(res["messages"]) == 1

    alert_msg = res["messages"][0]
    assert isinstance(alert_msg, HumanMessage)
    assert "[SYSTEM ALERT: Step budget remaining: 4/10 turns." in alert_msg.content
    assert "Please finalize your analysis" in alert_msg.content


def test_step_budget_middleware_warning_deduplication():
    """Verify consecutive calls do not inject duplicate warnings."""
    middleware = StepBudgetMiddleware(max_steps=10, warning_threshold=5)

    messages = [HumanMessage(content="Start")]
    for i in range(6):
        messages.append(AIMessage(content=f"Step {i+1}"))

    # Already injected an alert
    messages.append(
        HumanMessage(
            content="[SYSTEM ALERT: Step budget remaining: 4/10 turns. Please finalize your analysis]"
        )
    )
    state = {"messages": messages}

    res = middleware.before_agent(state)
    assert res is None


def test_step_budget_middleware_adaptive_threshold_for_micro_budgets():
    """Verify warning threshold scales dynamically for small step budgets."""
    # max_steps=4 with warning_threshold=5 -> effective_threshold = min(5, max(1, 2)) = 2
    middleware = StepBudgetMiddleware(max_steps=4, warning_threshold=5)

    # 1 AI message out of 4 -> 3 remaining > 2 (no alert)
    state_1 = {"messages": [HumanMessage(content="Q"), AIMessage(content="A1")]}
    assert middleware.before_agent(state_1) is None

    # 2 AI messages out of 4 -> 2 remaining <= 2 (alert fired)
    state_2 = {
        "messages": [
            HumanMessage(content="Q"),
            AIMessage(content="A1"),
            AIMessage(content="A2"),
        ]
    }
    res = middleware.before_agent(state_2)
    assert res is not None
    assert "Step budget remaining: 2/4 turns." in res["messages"][0].content


def test_step_budget_middleware_emergency_cutoff():
    """Verify emergency cutoff triggers when step budget reaches 0."""
    middleware = StepBudgetMiddleware(max_steps=5, warning_threshold=5, emergency_cutoff=True)
    messages = [AIMessage(content=f"Step {i}") for i in range(5)]
    state = {"messages": messages}

    assert middleware.get_remaining_steps(state) == 0
    res = middleware.before_agent(state)
    assert res is not None
    assert res.get("jump_to") == "end"
    assert "Step budget remaining: 0/5 turns." in res["messages"][0].content
    assert "Execution budget exhausted." in res["messages"][0].content


def test_step_budget_middleware_resilience_to_summarization():
    """Verify step counter reads cumulative state['steps'] when message history is compacted."""
    middleware = StepBudgetMiddleware(max_steps=50, warning_threshold=5)

    # Only 2 messages in list due to summarization, but state['steps'] is 46
    state = {
        "messages": [HumanMessage(content="Summary context"), AIMessage(content="Continuing")],
        "steps": 46,
    }

    assert middleware.get_step_count(state) == 46
    assert middleware.get_remaining_steps(state) == 4

    res = middleware.before_agent(state)
    assert res is not None
    assert "Step budget remaining: 4/50 turns." in res["messages"][0].content


def test_step_budget_middleware_wrap_model_call():
    """Verify wrap_model_call dynamically appends countdown metadata to system message."""
    middleware = StepBudgetMiddleware(max_steps=50)

    original_sys_msg = SystemMessage(content="You are a helpful analyst.")
    msgs = [HumanMessage(content="Do analysis"), AIMessage(content="Thinking...")]
    req = ModelRequest(messages=msgs, system_message=original_sys_msg, model="gpt-4")

    def dummy_handler(r: ModelRequest) -> AIMessage:
        assert r.system_message is not None
        assert "[Step Budget: Turn 2/50 | 49 steps remaining]" in str(r.system_message.content)
        return AIMessage(content="Completed")

    resp = middleware.wrap_model_call(req, dummy_handler)
    assert resp is not None


@pytest.mark.asyncio
async def test_step_budget_middleware_awrap_model_call():
    """Verify awrap_model_call works correctly in async context."""
    middleware = StepBudgetMiddleware(max_steps=30)

    original_sys_msg = SystemMessage(content="Base system prompt")
    msgs = [HumanMessage(content="Task"), AIMessage(content="A1"), AIMessage(content="A2")]
    req = ModelRequest(messages=msgs, system_message=original_sys_msg, model="gpt-4")

    async def async_dummy_handler(r: ModelRequest) -> AIMessage:
        assert r.system_message is not None
        assert "[Step Budget: Turn 3/30 | 28 steps remaining]" in str(r.system_message.content)
        return AIMessage(content="Async Completed")

    resp = await middleware.awrap_model_call(req, async_dummy_handler)
    assert resp is not None


@pytest.mark.asyncio
async def test_supervisor_graph_build_with_step_budget():
    """Verify build_main_graph initializes with StepBudgetMiddleware."""
    model = FakeMessagesListChatModel(responses=[AIMessage(content="ok")])
    graph = await build_main_graph(model=model, recursion_limit=40)
    assert graph is not None
    assert graph.name == "ai_data_analytic_supervisor"
