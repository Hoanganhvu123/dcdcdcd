"""graphs/supervisor.py — Enterprise Multi-Agent Supervisor powered by DeepAgents SDK.

Standardized architecture with fully decoupled prompt layer, defensive guards,
and compiled subagents (sql_analyst, report_writer, hybrid_analyst, web_researcher,
office_writer, diagnostic).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph

from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.common.llm_factory import create_llm, preferred_model_name
from dbgpt_analyst.core.config import SUPERVISOR_RECURSION_LIMIT
from dbgpt_analyst.core.helpers import json_serial
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.guard import (
    DoomLoopGuardMiddleware,
    StepBudgetMiddleware,
    VerificationGateMiddleware,
)
from dbgpt_analyst.libs.deepagents import (
    CompiledSubAgent,
    SubAgentAdapterState,
    create_deep_agent,
)
from dbgpt_analyst.memory.memory_checkpointer import get_checkpointer
from dbgpt_analyst.middleware import AgentContext, configurable_model_middleware
from dbgpt_analyst.middleware.guarded_tools import GuardedToolMiddleware
from dbgpt_analyst.prompts.supervisor_prompt import (
    ALERT_MONITOR_PROMPT,
    DATA_VISUALIZER_PROMPT,
    SYSTEM_PROMPT,
    render_supervisor_system_prompt,
)

logger = logging.getLogger(__name__)


def _extract_question(state: SubAgentAdapterState) -> str:
    """Extract the user's question from the last HumanMessage."""
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, HumanMessage):
            content = msg.content
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        return block.get("text", "")
    return state.get("question", "")


def _build_domain_state(question: str) -> dict[str, Any]:
    """Build a minimal MainAgentState for domain subgraph invocation."""
    return {
        "question": question,
        "source_ids": [],
        "anchor_table": "",
        "selected_tables": [],
        "allowed_tables": [],
        "schemas_text": "",
        "map_qualified": {},
        "db_type": "",
        "generated_sql": None,
        "query_results": [],
        "error": None,
        "retry_count": 0,
        "answer": None,
        "chart": None,
        "display_type": None,
        "session_history": None,
        "golden_sqls": None,
        "business_docs": None,
        "steps": [],
        "plan_steps": None,
        "query_type": None,
        "force_query_type": None,
        "web_findings": [],
        "exploration_log": [],
        "validation_result": None,
        "critic_verdict": None,
        "critic_retry_count": 0,
        "critic_fix_hint": None,
        "golden_sqls_data": None,
        "schema_descriptions": None,
        "followup_questions": None,
        "detected_intent": None,
        "intent_reasoning": None,
        "clarifier_assumptions": None,
        "data_engineer_report": None,
        "report_markdown": None,
        "session_id": None,
        "agent_id": None,
        "parent_agent_id": None,
        "implementation_plan": None,
        "user_feedback": None,
    }


def _format_result(state: dict[str, Any]) -> str:
    """Pack domain subgraph output into structured text for the Supervisor."""
    sections: list[str] = []

    if state.get("answer"):
        sections.append(f"## Analysis\n{state['answer']}")

    if state.get("generated_sql"):
        sections.append(f"## SQL Query\n```sql\n{state['generated_sql']}\n```")

    if state.get("query_results"):
        rows = state["query_results"]
        try:
            rows_str = json.dumps(rows[:50], ensure_ascii=False, default=json_serial)
        except Exception:
            rows_str = str(rows[:10])
        sections.append(f"## Data ({len(rows)} rows)\n{rows_str}")

    if state.get("chart"):
        try:
            chart_str = json.dumps(state["chart"], ensure_ascii=False, default=json_serial)
        except Exception:
            chart_str = str(state["chart"])
        sections.append(f"## Chart Configuration\n{chart_str}")

    if state.get("display_type"):
        sections.append(f"Recommended display: {state['display_type']}")

    if state.get("data_engineer_report"):
        sections.append(f"## Data Quality Profile\n{state['data_engineer_report']}")

    if state.get("report_markdown"):
        sections.append(f"## Executive Report\n{state['report_markdown']}")

    if state.get("web_findings"):
        sections.append("## Web Research Findings\n" + "\n".join(state["web_findings"]))

    if state.get("mini_summary"):
        sections.append(f"## Diagnostic Summary\n{state['mini_summary']}")

    if state.get("followup_questions"):
        try:
            fq_str = json.dumps(state["followup_questions"], ensure_ascii=False)
        except Exception:
            fq_str = str(state["followup_questions"])
        sections.append(f"## Suggested Follow-ups\n{fq_str}")

    if state.get("error"):
        sections.append(f"## Error\n{state['error']}")

    return "\n\n".join(sections) if sections else "No results produced."


_FORWARD_FIELDS = (
    "source_ids",
    "anchor_table",
    "selected_tables",
    "allowed_tables",
    "schemas_text",
    "map_qualified",
    "db_type",
    "session_history",
    "golden_sqls",
    "business_docs",
    "session_id",
    "agent_id",
    "golden_sqls_data",
    "schema_descriptions",
)


def _make_subagent_adapter(domain_subgraph: Any, name: str) -> Any:
    """Build an adapter StateGraph that wraps a domain subgraph."""

    @observe(name="subagent_adapter_input")
    async def input_node(state: SubAgentAdapterState) -> dict[str, Any]:
        question = _extract_question(state)
        logger.info("[%s] input: %r", name, question[:120])
        return {"question": question}

    @observe(name="subagent_adapter_run_domain")
    async def run_domain(state: SubAgentAdapterState, config: RunnableConfig) -> dict[str, Any]:
        question = state.get("question", "")
        domain_state = _build_domain_state(question)

        for field in _FORWARD_FIELDS:
            val = state.get(field)
            if val:
                domain_state[field] = val

        sub_config = dict(config) if config else {}

        final_state = None
        async for kind, payload in domain_subgraph.astream(
            domain_state,
            stream_mode=["messages", "updates", "custom", "values"],
            config=sub_config,
        ):
            if kind == "values":
                final_state = payload
            else:
                from dbgpt_analyst.events.base import emit_custom

                emit_custom(
                    "subgraph_stream",
                    {"kind": kind, "payload": payload, "subgraph_name": name},
                )

        return final_state or {}

    @observe(name="subagent_adapter_output")
    async def output_node(state: SubAgentAdapterState) -> dict[str, Any]:
        result_text = _format_result(dict(state))
        logger.info("[%s] output: %d chars", name, len(result_text))
        res: dict[str, Any] = {"messages": [AIMessage(content=result_text)]}
        if state.get("steps"):
            res["steps"] = state.get("steps")
        return res

    graph = StateGraph(SubAgentAdapterState)
    graph.add_node("input", input_node)
    graph.add_node("domain", run_domain)
    graph.add_node("revert", checkpoint_revert_node)
    graph.add_node("output", output_node)

    graph.set_entry_point("input")
    graph.add_edge("input", "domain")

    def _route_after_domain(state: dict[str, Any]) -> str:
        if state.get("needs_revert") or (state.get("error") and "revert" in str(state.get("error")).lower()):
            return "revert"
        return "output"

    graph.add_conditional_edges("domain", _route_after_domain, {"revert": "revert", "output": "output"})
    graph.add_edge("revert", "domain")
    graph.add_edge("output", END)

    return graph.compile()


@observe(name="checkpoint_revert_node")
async def checkpoint_revert_node(state: dict[str, Any], config: RunnableConfig) -> dict[str, Any]:
    """Time-travel checkpoint reversion node."""
    logger.info("Triggered checkpoint revert node: rolling back context state.")
    retry_count = (state.get("retry_count") or 0) + 1
    return {
        "generated_sql": None,
        "query_results": [],
        "exploration_log": [],
        "validation_result": None,
        "critic_verdict": None,
        "critic_fix_hint": None,
        "error": "State reverted to previous stable checkpoint.",
        "retry_count": retry_count,
    }


class SubagentEventStreamWrapper:
    """Wraps subagent event emissions into parent-linked SubagentEvent wire envelopes."""

    def __init__(self, parent_tool_call_id: str, subagent_id: str, subagent_type: str):
        self.parent_tool_call_id = parent_tool_call_id
        self.subagent_id = subagent_id
        self.subagent_type = subagent_type

    def wrap_event(self, inner_event: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "subagent_event",
            "payload": {
                "parent_tool_call_id": self.parent_tool_call_id,
                "subagent_id": self.subagent_id,
                "subagent_type": self.subagent_type,
                "inner_event": inner_event,
            },
        }


def _build_subagents() -> list[CompiledSubAgent]:
    """Build CompiledSubAgent specs from domain subgraphs including diagnostic."""
    from dbgpt_analyst.graphs.diagnostic import diagnostic_graph
    from dbgpt_analyst.graphs.office_writer import office_writer_subgraph
    from dbgpt_analyst.graphs.web_research import web_research_subgraph
    from dbgpt_analyst.graphs.deep_report import deep_report_subgraph
    from dbgpt_analyst.graphs.hybrid_analysis import hybrid_analysis_subgraph
    from dbgpt_analyst.graphs.quick_analysis import quick_analysis_subgraph

    return [
        CompiledSubAgent(
            name="sql_analyst",
            description=(
                "Queries the internal business database using SQL to answer "
                "quantitative questions. Executes SQL, profiles the result data, "
                "detects anomalies, and generates analysis with chart configuration. "
                "Use for: revenue, orders, customer counts, product rankings, "
                "time-series trends, period-over-period comparisons, and any "
                "question answerable from the company's own data."
            ),
            runnable=_make_subagent_adapter(quick_analysis_subgraph, "sql_analyst"),
        ),
        CompiledSubAgent(
            name="report_writer",
            description=(
                "Generates comprehensive executive reports with strategic insights. "
                "Runs SQL analysis, profiles data quality, then synthesizes findings "
                "into a structured markdown report with recommendations. "
                "Use when the user explicitly asks for a 'report', 'executive summary', "
                "'detailed analysis', 'presentation-ready document', or any deliverable "
                "requiring narrative structure beyond a simple answer."
            ),
            runnable=_make_subagent_adapter(deep_report_subgraph, "report_writer"),
        ),
        CompiledSubAgent(
            name="hybrid_analyst",
            description=(
                "Combines internal database analysis with external web research "
                "to produce context-enriched insights. Runs SQL queries AND web "
                "searches in parallel, then merges findings. "
                "Use when the question requires BOTH internal company metrics AND "
                "external context: competitor benchmarks, market trends explaining "
                "internal anomalies, or industry comparisons."
            ),
            runnable=_make_subagent_adapter(hybrid_analysis_subgraph, "hybrid_analyst"),
        ),
        CompiledSubAgent(
            name="web_researcher",
            description=(
                "Conducts web research for information NOT available in the internal "
                "database. Searches the web, extracts content, and synthesizes findings. "
                "Use ONLY when the question is purely about external knowledge: market "
                "trends, competitor intelligence, industry definitions, news, or "
                "general knowledge with zero connection to internal business data."
            ),
            runnable=_make_subagent_adapter(web_research_subgraph, "web_researcher"),
        ),
        CompiledSubAgent(
            name="office_writer",
            description=(
                "Creates Office documents: PowerPoint slide decks (PPT), Word documents "
                "(DOCX), or Excel spreadsheets (XLSX). "
                "Use when the user explicitly requests creating any of these: "
                "'tạo slide', 'làm PPT', 'thuyết trình', 'slide báo cáo', "
                "'viết tài liệu word', 'tạo bảng tính excel', 'xuất excel', "
                "'pitch deck', 'company profile', 'báo cáo trình chiếu'. "
                "This agent generates a live interactive preview that opens in the "
                "right panel automatically. Can incorporate data from previous "
                "SQL analysis if available in the conversation context."
            ),
            runnable=_make_subagent_adapter(office_writer_subgraph, "office_writer"),
        ),
        CompiledSubAgent(
            name="diagnostic",
            description=(
                "Performs root-cause analysis (RCA) and multi-angle causal diagnosis "
                "on analytical anomalies and business metric changes. "
                "Use for: 'tại sao doanh thu giảm', 'nguyên nhân sụt giảm', 'phân tích nguyên nhân gốc rễ', "
                "'root cause analysis', anomaly investigation across time, region, or segment."
            ),
            runnable=_make_subagent_adapter(diagnostic_graph, "diagnostic"),
        ),
    ]


def _build_declarative_subagents() -> list[dict]:
    """Build lightweight declarative SubAgents (dict format)."""
    return [
        {
            "name": "data_visualizer",
            "description": (
                "Re-formats, customizes, or transforms chart configurations "
                "without re-querying the database. Use when the user wants to "
                "change chart type (bar→pie), add/remove series, adjust colors, "
                "combine multiple charts, or create a dashboard layout from "
                "existing analysis results. Does NOT run SQL — only transforms "
                "visualization configs."
            ),
            "system_prompt": DATA_VISUALIZER_PROMPT,
        },
        {
            "name": "alert_monitor",
            "description": (
                "Configures data-driven alerts and monitoring rules. Use when "
                "the user wants to set up automatic notifications: 'alert me if "
                "revenue drops more than 20%', 'notify when inventory falls below "
                "100 units', 'watch this KPI daily'. Creates structured alert "
                "configurations with metric, threshold, comparison method, and "
                "notification preferences."
            ),
            "system_prompt": ALERT_MONITOR_PROMPT,
        },
    ]


async def build_supervisor_graph(
    model: str | Any = None,
    *,
    checkpointer: Any = None,
    store: Any = None,
    debug: bool = False,
    **kwargs: Any,
) -> Any:
    """Build the Deep Agent Supervisor graph with all enterprise capabilities."""
    if model is None:
        model = create_llm(preferred_model_name(), streaming=True)

    if checkpointer is None:
        checkpointer = await get_checkpointer()

    custom_subagents = _build_subagents()
    declarative_subagents = _build_declarative_subagents()
    all_subagents = custom_subagents + declarative_subagents

    recursion_limit = kwargs.get("recursion_limit", SUPERVISOR_RECURSION_LIMIT)
    final_system_prompt = render_supervisor_system_prompt(max_steps=recursion_limit)

    from dbgpt_analyst.tools.research_toolkit import build_research_tools
    from dbgpt_analyst.tools.workspace_tools import export_to_workspace

    domain_tools = build_research_tools()
    domain_tools.append(export_to_workspace)

    middleware = kwargs.pop("middleware", [])
    middleware.append(configurable_model_middleware)
    middleware.append(StepBudgetMiddleware(max_steps=recursion_limit, warning_threshold=5))
    middleware.append(VerificationGateMiddleware(mode="sanitize"))
    middleware.append(DoomLoopGuardMiddleware())
    middleware.append(GuardedToolMiddleware())

    try:
        from dbgpt_analyst.middleware.skills import build_skills_middleware

        skills_mw = build_skills_middleware()
        if skills_mw:
            middleware.append(skills_mw)
            logger.info("Configured SkillsMiddleware connected to DB-GPT Core global SKILLS_DIR")
    except Exception as e:
        logger.warning("Could not configure SkillsMiddleware: %s", e)

    kwargs.setdefault("recursion_limit", SUPERVISOR_RECURSION_LIMIT)

    return create_deep_agent(
        model=model,
        system_prompt=final_system_prompt,
        tools=domain_tools,
        subagents=all_subagents,
        checkpointer=checkpointer,
        store=store,
        debug=debug,
        name="ai_data_analytic_supervisor",
        context_schema=AgentContext,
        middleware=middleware,
        **kwargs,
    )


# Backward-compatibility alias
build_main_graph = build_supervisor_graph

__all__ = [
    "SubagentEventStreamWrapper",
    "_FORWARD_FIELDS",
    "_build_declarative_subagents",
    "_build_domain_state",
    "_build_subagents",
    "_extract_question",
    "_format_result",
    "_make_subagent_adapter",
    "build_main_graph",
    "build_supervisor_graph",
    "checkpoint_revert_node",
    "render_supervisor_system_prompt",
]
