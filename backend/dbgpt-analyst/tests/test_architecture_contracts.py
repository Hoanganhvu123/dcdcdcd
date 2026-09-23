"""tests/test_architecture_contracts.py — Architecture and interface contracts verification."""
import pytest

from dbgpt_analyst.controller import AnalystController, AnalystRequest, StreamTokenFilter
from dbgpt_analyst.core import (
    DataEngineerState,
    DiagnosticState,
    EngineConfig,
    EngineLifecycle,
    MainAgentState,
    SQLAgentState,
    SupervisorState,
    WorkerState,
    get_engine_config,
)
from dbgpt_analyst.events import (
    AnswerDeltaEvent,
    BaseEvent,
    ClientEffectEvent,
    FinalEvent,
    SQLDeltaEvent,
    ThinkingDeltaEvent,
    WorkflowTaskEvent,
)
from dbgpt_analyst.guard import (
    DatabaseCircuitBreaker,
    DoomLoopGuardMiddleware,
    SQLGuardError,
    StepBudgetMiddleware,
    VerificationGateMiddleware,
    secure_sql,
)
from dbgpt_analyst.prompts import (
    ALERT_MONITOR_PROMPT,
    DATA_VISUALIZER_PROMPT,
    DIAGNOSTIC_SYSTEM_PROMPT,
    REPORT_SYSTEM_PROMPT,
    SLIDE_PLANNER_RULES,
    SYSTEM_PROMPT,
    SYNTHESIZER_SYSTEM_PROMPT,
    render_chart_spec_prompt,
    render_supervisor_system_prompt,
)


def test_core_state_partitioning():
    # Verify TypedDict instantiation
    sup_state: SupervisorState = {"question": "test", "session_id": "s1"}
    assert sup_state["question"] == "test"

    worker_state: WorkerState = {"agent_id": "a1", "task": "do work"}
    assert worker_state["task"] == "do work"

    sql_state: SQLAgentState = {"question": "sales", "db_type": "postgres"}
    assert sql_state["db_type"] == "postgres"

    diag_state: DiagnosticState = {"angle": "by_region", "mini_summary": "ok"}
    assert diag_state["angle"] == "by_region"

    de_state: DataEngineerState = {"de_mode": "analysis"}
    assert de_state["de_mode"] == "analysis"


def test_core_config_validation():
    cfg = get_engine_config()
    assert isinstance(cfg, EngineConfig)
    assert cfg.sql_max_row > 0
    assert cfg.supervisor_recursion_limit > 0


@pytest.mark.asyncio
async def test_engine_lifecycle():
    lifecycle = EngineLifecycle()
    assert lifecycle.is_initialized is False
    checkpointer = await lifecycle.startup()
    assert checkpointer is not None
    assert lifecycle.is_initialized is True

    lifecycle.register_session("sess-1")
    assert "sess-1" in lifecycle._active_sessions
    lifecycle.evict_session("sess-1")
    assert "sess-1" not in lifecycle._active_sessions

    await lifecycle.shutdown()
    assert lifecycle.is_initialized is False


def test_guard_consolidation():
    # Test sql_guard
    safe = secure_sql("SELECT id, name FROM users", db_dialect="postgres")
    assert "LIMIT" in safe

    with pytest.raises(SQLGuardError):
        secure_sql("DROP TABLE users", db_dialect="postgres")

    # Test guards instantiation
    assert DoomLoopGuardMiddleware() is not None
    assert StepBudgetMiddleware() is not None
    assert VerificationGateMiddleware() is not None
    assert DatabaseCircuitBreaker() is not None


def test_events_models():
    t_ev = ThinkingDeltaEvent(payload={"content": "thinking..."})
    assert t_ev.type == "thinking_delta"
    assert t_ev.payload["content"] == "thinking..."

    a_ev = AnswerDeltaEvent(payload={"content": "answer..."})
    assert a_ev.type == "answer_delta"

    w_ev = WorkflowTaskEvent(payload={"task": "running"}, status="running")
    assert w_ev.type == "workflow_task"
    assert w_ev.status == "running"

    c_ev = ClientEffectEvent(payload={"effect": "open_canvas"})
    assert c_ev.type == "client_effect"


def test_prompts_externalization():
    assert len(SYSTEM_PROMPT) > 100
    rendered = render_supervisor_system_prompt(max_steps=42)
    assert "42 steps" in rendered

    assert len(DIAGNOSTIC_SYSTEM_PROMPT) > 10
    assert len(REPORT_SYSTEM_PROMPT) > 10
    assert len(SYNTHESIZER_SYSTEM_PROMPT) > 10
    assert len(SLIDE_PLANNER_RULES) > 10
    assert len(DATA_VISUALIZER_PROMPT) > 10
    assert len(ALERT_MONITOR_PROMPT) > 10

    chart_p = render_chart_spec_prompt("revenue", [{"a": 1}])
    assert "revenue" in chart_p


def test_stream_token_filter():
    stf = StreamTokenFilter()
    # Intercept thinking tag
    reasoning, tool, prose = stf.process_chunk("<think>pondering the query</think>Here is the answer.")
    assert reasoning == "pondering the query"
    assert tool == ""
    assert prose == "Here is the answer."

    # Process tool call tag
    stf2 = StreamTokenFilter()
    reasoning, tool, prose = stf2.process_chunk("<tool_call>task(a=1)</tool_call>Prose continuation")
    assert tool == "task(a=1)"
    assert prose == "Prose continuation"
