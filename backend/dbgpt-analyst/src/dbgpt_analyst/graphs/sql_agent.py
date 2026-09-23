"""graphs/sql_agent.py — Consolidated SQL Agent Subgraph.

Compiles the SQL chain:
table_selector → resolve_schema → explore → plan_sql → generate_sql → validate → execute_sql → critic
with internal validation, execution, and critic retry loops.
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.nodes.analysis import node_critic, node_validate
from dbgpt_analyst.nodes.data_explorer import node_explore
from dbgpt_analyst.nodes.execution import node_execute_sql
from dbgpt_analyst.nodes.schema_resolver import node_resolve_schema
from dbgpt_analyst.nodes.sql_generator import node_generate_sql
from dbgpt_analyst.nodes.sql_planner import node_plan_sql
from dbgpt_analyst.nodes.table_selector import node_table_selector


def build_sql_agent_subgraph() -> Any:
    """Build and compile the SQL Agent subgraph."""
    workflow = StateGraph(MainAgentState)

    # ── Nodes ──────────────────────────────────────────────────────────
    workflow.add_node("table_selector", node_table_selector)
    workflow.add_node("resolve_schema", node_resolve_schema)
    workflow.add_node("explore", node_explore)
    workflow.add_node("plan_sql", node_plan_sql)
    workflow.add_node("generate_sql", node_generate_sql)
    workflow.add_node("validate", node_validate)
    workflow.add_node("execute_sql", node_execute_sql)
    workflow.add_node("critic", node_critic)

    # ── Edges ──────────────────────────────────────────────────────────
    workflow.set_entry_point("table_selector")
    workflow.add_edge("table_selector", "resolve_schema")
    workflow.add_edge("resolve_schema", "explore")
    workflow.add_edge("explore", "plan_sql")
    workflow.add_edge("plan_sql", "generate_sql")
    workflow.add_edge("generate_sql", "validate")

    def route_after_validation(state: MainAgentState):
        vr = state.get("validation_result", {})
        if not vr.get("valid", True):
            have_retry = vr.get("have_retry", True)
            val_retry = state.get("validation_retry_count", 0)
            if have_retry and val_retry < 2:
                return "generate_sql"
            return "execute_sql"
        return "execute_sql"

    workflow.add_conditional_edges(
        "validate",
        route_after_validation,
        {"generate_sql": "generate_sql", "execute_sql": "execute_sql"},
    )

    def route_after_execution(state: MainAgentState):
        if state.get("error"):
            have_retry = state.get("have_retry", True)
            exec_retry = state.get("execution_retry_count", 0)
            if have_retry and exec_retry < 2:
                return "generate_sql"
        return "critic"

    workflow.add_conditional_edges(
        "execute_sql",
        route_after_execution,
        {"generate_sql": "generate_sql", "critic": "critic"},
    )

    def route_after_critic(state: MainAgentState):
        """Retry inside subgraph, or exit to main_graph."""
        verdict = state.get("critic_verdict", "ok")
        critic_retry = state.get("critic_retry_count", 0)
        have_retry = state.get("have_retry", True)
        if verdict == "retry" and have_retry and critic_retry < 2:
            return "generate_sql"
        return END

    workflow.add_conditional_edges(
        "critic",
        route_after_critic,
        {"generate_sql": "generate_sql", END: END},
    )

    return workflow.compile()


sql_agent_subgraph = build_sql_agent_subgraph()

__all__ = ["build_sql_agent_subgraph", "sql_agent_subgraph"]
