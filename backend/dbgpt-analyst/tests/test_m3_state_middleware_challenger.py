"""Milestone 3 State Adaptation and Middleware Integration Challenger Suite.

Adversarially tests:
1. SubAgentAdapterState schema integrity, typing, question extraction, domain state building, result formatting, and adapter graph execution with checkpoint reversion.
2. SkillsMiddleware with FilesystemBackend loading, prompt injection, Unicode handling, and edge cases.
3. Full Supervisor graph execution end-to-end with multiple CompiledSubAgents and Declarative SubAgents attached.
"""

import json
import operator
import typing
from pathlib import Path
from typing import Annotated, Any

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.libs.deepagents import (
    AgentContext,
    CompiledDeepAgent,
    CompiledSubAgent,
    DeepAgent,
    DeepAgentState,
    FilesystemBackend,
    FilesystemMiddleware,
    SkillsMiddleware,
    SubAgent,
    SubAgentAdapterState,
    SubAgentMiddleware,
    create_deep_agent,
)
from dbgpt_analyst.main_agent import (
    _FORWARD_FIELDS,
    _build_declarative_subagents,
    _build_domain_state,
    _build_subagents,
    _extract_question,
    _format_result,
    _make_subagent_adapter,
    checkpoint_revert_node,
    render_supervisor_system_prompt,
)
from dbgpt_analyst.middleware.skills import build_skills_middleware
from dbgpt_analyst.middleware.step_budget import StepBudgetMiddleware
from dbgpt_analyst.middleware.verification_gate import VerificationGateMiddleware
from dbgpt_analyst.middleware.doom_loop_guard import DoomLoopGuardMiddleware


# ══════════════════════════════════════════════════════════════════════════════
# Test Chat Model Doubles
# ══════════════════════════════════════════════════════════════════════════════

class ScriptedChatModel(BaseChatModel):
    """Scripted BaseChatModel returning a sequence of canned responses."""

    responses: list[AIMessage] = []
    _cursor: int = 0

    def __init__(self, responses: list[AIMessage] | None = None, **kwargs: Any):
        super().__init__(**kwargs)
        self.responses = responses or [AIMessage(content="Default test response")]
        self._cursor = 0

    @property
    def _llm_type(self) -> str:
        return "scripted_chat_model"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        if self._cursor < len(self.responses):
            resp = self.responses[self._cursor]
            self._cursor += 1
        else:
            resp = self.responses[-1]
        return ChatResult(generations=[ChatGeneration(message=resp)])


# ══════════════════════════════════════════════════════════════════════════════
# 1. SubAgentAdapterState Schema & Bridge Tests
# ══════════════════════════════════════════════════════════════════════════════

def test_subagent_adapter_state_full_schema_inventory():
    """Verify SubAgentAdapterState contains all required keys for subagent execution."""
    hints = typing.get_type_hints(SubAgentAdapterState)

    # Required core bridge keys
    required_keys = [
        "messages",
        "question",
        "query_results",
        "chart",
        "report_markdown",
        "web_findings",
        "exploration_log",
        "steps",
        "answer",
        "generated_sql",
        "error",
        "session_id",
        "agent_id",
        "parent_agent_id",
        "implementation_plan",
        "user_feedback",
        "anchor_table",
        "allowed_tables",
        "source_ids",
        "selected_tables",
        "schemas_text",
        "map_qualified",
        "db_type",
        "retry_count",
        "validation_retry_count",
        "execution_retry_count",
        "have_retry",
        "display_type",
        "session_history",
        "golden_sqls",
        "business_docs",
        "plan_steps",
        "search_queries",
        "urls_to_scrape",
        "is_sufficient",
        "query_type",
        "force_query_type",
        "validation_result",
        "critic_verdict",
        "critic_retry_count",
        "critic_fix_hint",
        "golden_sqls_data",
        "schema_descriptions",
        "followup_questions",
        "detected_intent",
        "intent_reasoning",
        "clarifier_assumptions",
        "data_engineer_report",
        "sql_reasoning_plan",
        "retry_history",
        "de_mode",
        "test_db_path",
        "db_path",
        "table_names",
        "file_bytes",
    ]

    for key in required_keys:
        assert key in hints, f"Missing field '{key}' in SubAgentAdapterState annotations"


def test_extract_question_scenarios():
    """Test _extract_question against plain text, multimodal, and fallback inputs."""
    # Scenario A: Plain string HumanMessage
    state_a: SubAgentAdapterState = {"messages": [HumanMessage(content="Doanh thu Q1 2026?")]}
    assert _extract_question(state_a) == "Doanh thu Q1 2026?"

    # Scenario B: Multimodal list of content blocks
    state_b: SubAgentAdapterState = {
        "messages": [
            HumanMessage(
                content=[
                    {"type": "text", "text": "Phân tích top 10 khách hàng lớn nhất."},
                    {"type": "image_url", "image_url": {"url": "https://example.com/chart.png"}},
                ]
            )
        ]
    }
    assert _extract_question(state_b) == "Phân tích top 10 khách hàng lớn nhất."

    # Scenario C: Empty messages list -> fallback to question field
    state_c: SubAgentAdapterState = {"messages": [], "question": "Fallback question text"}
    assert _extract_question(state_c) == "Fallback question text"

    # Scenario D: Only AIMessage / SystemMessage in messages -> fallback
    state_d: SubAgentAdapterState = {
        "messages": [AIMessage(content="I am an AI")],
        "question": "Question from field",
    }
    assert _extract_question(state_d) == "Question from field"


def test_build_domain_state_initialization_and_defaults():
    """Verify _build_domain_state sets safe defaults across all analytical slots."""
    d_state = _build_domain_state("Tổng chi phí vận hành?")
    assert d_state["question"] == "Tổng chi phí vận hành?"
    assert d_state["source_ids"] == []
    assert d_state["selected_tables"] == []
    assert d_state["allowed_tables"] == []
    assert d_state["query_results"] == []
    assert d_state["generated_sql"] is None
    assert d_state["chart"] is None
    assert d_state["report_markdown"] is None
    assert d_state["web_findings"] == []
    assert d_state["exploration_log"] == []
    assert d_state["retry_count"] == 0
    assert d_state["critic_retry_count"] == 0


def test_format_result_serialization_and_truncation():
    """Test _format_result markdown formatting, truncation, and robust error resilience."""
    # 1. Empty state
    assert _format_result({}) == "No results produced."

    # 2. Rich state with all components
    sample_rows = [{"id": i, "revenue": i * 1000, "region": f"Region {i}"} for i in range(100)]
    state: dict[str, Any] = {
        "answer": "Doanh thu tăng trưởng mạnh mẽ trong Q1.",
        "generated_sql": "SELECT id, revenue, region FROM sales WHERE year = 2026;",
        "query_results": sample_rows,
        "chart": {"type": "bar", "series": [{"name": "Revenue", "data": [10, 20, 30]}]},
        "display_type": "bar",
        "data_engineer_report": "Quality Score: 98/100. Zero nulls.",
        "report_markdown": "# Báo cáo Điều hành Q1\nTổng doanh thu đạt 12.8 tỷ VNĐ.",
        "web_findings": ["Thị trường bán lẻ may mặc tăng 12%", "Lạm phát tiêu dùng ổn định"],
        "followup_questions": ["So sánh cùng kỳ 2025?", "Phân tích theo kênh bán hàng?"],
        "error": None,
    }

    formatted = _format_result(state)
    assert "## Analysis" in formatted
    assert "Doanh thu tăng trưởng mạnh mẽ trong Q1." in formatted
    assert "## SQL Query" in formatted
    assert "SELECT id, revenue, region" in formatted
    assert "## Data (100 rows)" in formatted
    # Check that rows are truncated to 50 rows in formatted output
    assert "Region 49" in formatted
    assert "Region 99" not in formatted
    assert "## Chart Configuration" in formatted
    assert "Recommended display: bar" in formatted
    assert "## Data Quality Profile" in formatted
    assert "## Executive Report" in formatted
    assert "## Web Research Findings" in formatted
    assert "## Suggested Follow-ups" in formatted


@pytest.mark.asyncio
async def test_make_subagent_adapter_execution_flow():
    """Test compiled subagent adapter graph executing input -> domain -> output flow."""
    # Build a mock domain subgraph
    async def mock_domain_node(state: dict[str, Any]) -> dict[str, Any]:
        question = state.get("question", "")
        return {
            "answer": f"Processed: {question}",
            "generated_sql": "SELECT 42 AS answer;",
            "query_results": [{"answer": 42}],
            "steps": [{"node": "mock_sql", "status": "done"}],
        }

    sub_builder = StateGraph(MainAgentState)
    sub_builder.add_node("execute", mock_domain_node)
    sub_builder.set_entry_point("execute")
    sub_builder.add_edge("execute", END)
    compiled_domain = sub_builder.compile()

    # Wrap in adapter
    adapter = _make_subagent_adapter(compiled_domain, "test_adapter")
    assert isinstance(adapter, CompiledStateGraph)

    # Invoke adapter with SubAgentAdapterState
    input_state: SubAgentAdapterState = {
        "messages": [HumanMessage(content="What is the meaning of life?")],
        "source_ids": [1, 2],
    }

    result = await adapter.ainvoke(input_state)
    assert "messages" in result
    # LangGraph add_messages reducer appends AIMessage to input HumanMessage -> length 2
    assert len(result["messages"]) == 2
    assert isinstance(result["messages"][0], HumanMessage)
    last_msg = result["messages"][-1]
    assert isinstance(last_msg, AIMessage)
    assert "## Analysis" in last_msg.content
    assert "Processed: What is the meaning of life?" in last_msg.content
    assert "## SQL Query" in last_msg.content
    assert "SELECT 42 AS answer;" in last_msg.content
    assert "steps" in result
    assert result["steps"][0]["status"] == "done"


@pytest.mark.asyncio
async def test_subagent_adapter_checkpoint_reversion():
    """Test adapter routing to checkpoint_revert_node when needs_revert or revert error occurs."""
    attempt = 0

    async def faulty_domain_node(state: dict[str, Any]) -> dict[str, Any]:
        nonlocal attempt
        attempt += 1
        if attempt == 1:
            return {"needs_revert": True, "error": "Query timeout, request revert", "retry_count": 0}
        return {
            "needs_revert": False,
            "error": None,
            "answer": "Recovered from checkpoint",
            "generated_sql": "SELECT 100;",
            "query_results": [{"val": 100}],
        }

    sub_builder = StateGraph(MainAgentState)
    sub_builder.add_node("run", faulty_domain_node)
    sub_builder.set_entry_point("run")
    sub_builder.add_edge("run", END)
    compiled_sub = sub_builder.compile()

    adapter = _make_subagent_adapter(compiled_sub, "revert_adapter")

    res = await adapter.ainvoke({"messages": [HumanMessage(content="Trigger revert")]})
    assert "messages" in res
    assert "Recovered from checkpoint" in res["messages"][-1].content


# ══════════════════════════════════════════════════════════════════════════════
# 2. SkillsMiddleware + FilesystemBackend Integration Tests
# ══════════════════════════════════════════════════════════════════════════════

def test_skills_middleware_filesystem_backend_loading(tmp_path: Path):
    """Verify SkillsMiddleware loads skills from directory structure and formats them."""
    skills_root = tmp_path / "skills"
    skills_root.mkdir()

    # Skill 1: fashion_retail_metrics
    skill_1 = skills_root / "fashion_retail_metrics"
    skill_1.mkdir()
    (skill_1 / "SKILL.md").write_text(
        "---\nname: fashion_retail_metrics\ndescription: KPIs for fashion retail in Vietnam\n---\n# Fashion KPIs\n- Sell-through rate\n- GMROI",
        encoding="utf-8",
    )

    # Skill 2: reporting_templates (Vietnamese content)
    skill_2 = skills_root / "reporting_templates"
    skill_2.mkdir()
    (skill_2 / "SKILL.md").write_text(
        "---\nname: reporting_templates\ndescription: Mẫu báo cáo điều hành chuẩn tiếng Việt\n---\n# Mẫu Báo Cáo\n- Báo cáo tuần\n- Báo cáo tháng",
        encoding="utf-8",
    )

    backend = FilesystemBackend(root_dir=str(skills_root), virtual_mode=True)
    mw = SkillsMiddleware(backend=backend, sources=[("/", "DB-GPT-Analyst")])

    assert mw is not None
    assert isinstance(mw, SkillsMiddleware)

    # Check files listed via backend
    ls_entries = backend.ls_info("/")
    paths = [e.get("path", "") for e in ls_entries]
    assert any("fashion_retail_metrics" in p for p in paths)
    assert any("reporting_templates" in p for p in paths)

    # Check read content with Vietnamese preservation
    content_2 = backend.read("/reporting_templates/SKILL.md")
    assert "Mẫu báo cáo điều hành chuẩn tiếng Việt" in content_2


def test_build_skills_middleware_with_missing_and_empty_dirs(tmp_path: Path, monkeypatch):
    """Verify build_skills_middleware degrades gracefully when SKILLS_DIR is missing or empty."""
    non_existent = tmp_path / "non_existent_skills"
    monkeypatch.setattr("dbgpt.configs.model_config.SKILLS_DIR", str(non_existent))

    mw = build_skills_middleware()
    assert mw is None

    empty_dir = tmp_path / "empty_skills"
    empty_dir.mkdir()
    monkeypatch.setattr("dbgpt.configs.model_config.SKILLS_DIR", str(empty_dir))

    # Empty sources returns None
    mw_empty = build_skills_middleware(sources=[])
    assert mw_empty is None


# ══════════════════════════════════════════════════════════════════════════════
# 3. Full Supervisor Graph Multi-Subagent End-to-End Execution
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_full_supervisor_graph_with_all_subagents_attached():
    """Verify supervisor graph compilation with all custom and declarative subagents attached."""
    custom_subagents = _build_subagents()
    declarative_subagents = _build_declarative_subagents()
    all_subagents = custom_subagents + declarative_subagents

    # Verify all expected subagents are present
    agent_names = {a["name"] for a in all_subagents}
    expected_names = {
        "sql_analyst",
        "report_writer",
        "hybrid_analyst",
        "web_researcher",
        "office_writer",
        "data_visualizer",
        "alert_monitor",
    }
    assert expected_names.issubset(agent_names), f"Missing expected subagents: {expected_names - agent_names}"

    # Build supervisor graph
    model = ScriptedChatModel([
        AIMessage(content="Tôi đã hoàn thành phân tích doanh thu cho bạn.")
    ])

    final_prompt = render_supervisor_system_prompt(max_steps=50)
    assert "Maximum Step Budget: 50 steps" in final_prompt

    middleware = [
        StepBudgetMiddleware(max_steps=50, warning_threshold=5),
        VerificationGateMiddleware(mode="sanitize"),
        DoomLoopGuardMiddleware(),
    ]

    graph = create_deep_agent(
        model=model,
        system_prompt=final_prompt,
        tools=[],
        subagents=all_subagents,
        name="ai_data_analytic_supervisor",
        middleware=middleware,
    )

    assert isinstance(graph, CompiledDeepAgent)
    assert isinstance(graph, CompiledStateGraph)

    # Test invoking graph
    result = await graph.ainvoke({"messages": [HumanMessage(content="Báo cáo tình hình kinh doanh?")]})
    assert result is not None
    assert "messages" in result
    assert len(result["messages"]) >= 2
    assert "Tôi đã hoàn thành phân tích" in result["messages"][-1].content


@pytest.mark.asyncio
async def test_supervisor_subagent_delegation_execution_cycle():
    """Test multi-turn delegation cycle where supervisor invokes a CompiledSubAgent via task tool."""
    # 1. Custom mock domain subgraph for sql_analyst
    async def mock_sql_analysis(state: dict[str, Any]) -> dict[str, Any]:
        return {
            "answer": "Tổng doanh thu đạt 25.5 tỷ VNĐ.",
            "generated_sql": "SELECT SUM(amount) FROM orders;",
            "query_results": [{"sum": 25500000000}],
        }

    sql_builder = StateGraph(MainAgentState)
    sql_builder.add_node("sql_node", mock_sql_analysis)
    sql_builder.set_entry_point("sql_node")
    sql_builder.add_edge("sql_node", END)
    compiled_sql = sql_builder.compile()

    sql_subagent = CompiledSubAgent(
        name="sql_analyst",
        description="Queries internal business database.",
        runnable=_make_subagent_adapter(compiled_sql, "sql_analyst"),
    )

    # 2. Scripted LLM turns:
    # Turn 1: Supervisor calls tool `task` to delegate to sql_analyst
    turn_1 = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "task",
                "args": {
                    "subagent_type": "sql_analyst",
                    "description": "Tính tổng doanh thu năm 2026",
                },
                "id": "call_sql_1",
                "type": "tool_call",
            }
        ],
    )
    # Turn 2: Supervisor synthesizes the answer
    turn_2 = AIMessage(content="Theo số liệu từ cơ sở dữ liệu, tổng doanh thu năm 2026 là 25.5 tỷ VNĐ.")

    model = ScriptedChatModel([turn_1, turn_2])

    graph = create_deep_agent(
        model=model,
        system_prompt="You are a BI supervisor.",
        tools=[],
        subagents=[sql_subagent],
        middleware=[
            StepBudgetMiddleware(max_steps=20, warning_threshold=3),
            VerificationGateMiddleware(mode="sanitize"),
        ],
    )

    result = await graph.ainvoke({"messages": [HumanMessage(content="Doanh thu năm 2026 bao nhiêu?")]})
    assert result is not None
    assert "messages" in result

    # Check message history contains User -> AI(tool_call) -> ToolMessage -> AI(final)
    messages = result["messages"]
    assert len(messages) >= 4

    tool_messages = [m for m in messages if isinstance(m, ToolMessage)]
    assert len(tool_messages) >= 1
    assert "25.5 tỷ VNĐ" in tool_messages[0].content or "25500000000" in tool_messages[0].content

    final_message = messages[-1]
    assert isinstance(final_message, AIMessage)
    assert "25.5 tỷ VNĐ" in final_message.content
