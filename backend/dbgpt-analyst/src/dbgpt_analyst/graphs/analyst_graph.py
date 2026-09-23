"""graphs/analyst_graph.py — Central LangGraph StateGraph Architecture.

Consolidates all atomic nodes with conditional routing:
- plan_node: Query intent planning & routing
- sql_gen_node: Schema-guided SQL query formulation
- sql_exec_node: Safe AST-guarded database execution
- chart_spec_node: Recharts / ECharts JSON specification derivation
- doc_compose_node: Kimi A4 DOCX & multi-tab Excel XLSX synthesis
- answer_node: Grounded analytical narrative formulation
"""
from __future__ import annotations

import logging
from typing import Any, Literal

from langgraph.graph import END, START, StateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.nodes import (
    answer_node,
    chart_spec_node,
    doc_compose_node,
    plan_node,
    sql_exec_node,
    sql_gen_node,
)

logger = logging.getLogger(__name__)


def route_after_plan(state: MainAgentState) -> Literal["sql_gen", "doc_compose", "answer"]:
    """Conditional edge from plan: route based on classified intent."""
    mode = str(state.get("mode") or state.get("query_type") or "sql").lower()
    if mode in ("office", "excel", "slide", "docx"):
        return "doc_compose"
    if mode in ("sql", "report"):
        return "sql_gen"
    return "answer"


def route_after_sql_gen(state: MainAgentState) -> Literal["sql_exec", "answer"]:
    """Conditional edge from sql_gen: proceed to execution if valid SQL generated."""
    if state.get("error") or not state.get("generated_sql"):
        return "answer"
    return "sql_exec"


def route_after_sql_exec(state: MainAgentState) -> Literal["chart_spec", "doc_compose", "answer"]:
    """Conditional edge from sql_exec: derive chart or document if applicable."""
    mode = str(state.get("mode") or state.get("query_type") or "").lower()
    question = str(state.get("question") or "").lower()

    if mode in ("office", "excel", "slide", "docx"):
        return "doc_compose"

    chart_triggers = ("biểu đồ", "chart", "đồ thị", "visual", "trực quan", "plot")
    if state.get("chart") or any(kw in question for kw in chart_triggers):
        return "chart_spec"

    return "answer"


def build_analyst_graph() -> Any:
    """Build and compile the canonical single StateGraph for DB-GPT Analyst."""
    workflow = StateGraph(MainAgentState)

    # Register canonical atomic nodes
    workflow.add_node("plan", plan_node)
    workflow.add_node("sql_gen", sql_gen_node)
    workflow.add_node("sql_exec", sql_exec_node)
    workflow.add_node("chart_spec", chart_spec_node)
    workflow.add_node("doc_compose", doc_compose_node)
    workflow.add_node("answer", answer_node)

    # Wire starting edge
    workflow.add_edge(START, "plan")

    # Wire conditional edges
    workflow.add_conditional_edges(
        "plan",
        route_after_plan,
        {
            "sql_gen": "sql_gen",
            "doc_compose": "doc_compose",
            "answer": "answer",
        },
    )

    workflow.add_conditional_edges(
        "sql_gen",
        route_after_sql_gen,
        {
            "sql_exec": "sql_exec",
            "answer": "answer",
        },
    )

    workflow.add_conditional_edges(
        "sql_exec",
        route_after_sql_exec,
        {
            "chart_spec": "chart_spec",
            "doc_compose": "doc_compose",
            "answer": "answer",
        },
    )

    # Convergence edges to final answer node
    workflow.add_edge("chart_spec", "answer")
    workflow.add_edge("doc_compose", "answer")
    workflow.add_edge("answer", END)

    return workflow.compile()


analyst_graph = build_analyst_graph()

__all__ = [
    "analyst_graph",
    "build_analyst_graph",
    "route_after_plan",
    "route_after_sql_exec",
    "route_after_sql_gen",
]
