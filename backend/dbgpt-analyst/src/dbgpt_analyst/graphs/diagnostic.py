"""graphs/diagnostic.py — Consolidated Diagnostic Subgraph (Root-Cause Analysis).

Wires:
generate_sql (adapter) → execute_sql (adapter) → [retry or summarize] → END
Operating on isolated DiagnosticState.
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.state import DiagnosticState
from dbgpt_analyst.nodes.diagnostic import (
    node_mini_summarize,
    route_after_execute,
)
from dbgpt_analyst.subgraphs.adapters.sql_chain_adapter import (
    adapt_execute_sql,
    adapt_generate_sql,
)


def build_diagnostic_graph() -> Any:
    """Build and compile diagnostic subgraph."""
    workflow = StateGraph(DiagnosticState)

    # ── Nodes ──────────────────────────────────────────────────────────
    workflow.add_node("generate_sql", adapt_generate_sql)
    workflow.add_node("execute_sql", adapt_execute_sql)
    workflow.add_node("summarize", node_mini_summarize)

    # ── Edges ──────────────────────────────────────────────────────────
    workflow.set_entry_point("generate_sql")
    workflow.add_edge("generate_sql", "execute_sql")
    workflow.add_conditional_edges("execute_sql", route_after_execute, {
        "generate_sql": "generate_sql",
        "summarize": "summarize",
    })
    workflow.add_edge("summarize", END)

    return workflow.compile()


diagnostic_graph = build_diagnostic_graph()

__all__ = ["build_diagnostic_graph", "diagnostic_graph"]
