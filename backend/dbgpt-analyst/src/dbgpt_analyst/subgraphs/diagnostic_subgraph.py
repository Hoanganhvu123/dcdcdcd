"""subgraphs/diagnostic_subgraph.py — Diagnostic Subgraph (Root-Cause Analysis).

Subgraph that #2 cua he thong (sau deep_research_graph).
Pattern: StateGraph(DiagnosticState) + adapter layer + compile.

Luong:
    generate_sql (adapter -> node_generate_sql)
        -> execute_sql (adapter -> node_execute_sql)
        -> [retry neu loi] hoac summarize (node_mini_summarize)
        -> END

Invoke: diagnostic_graph.ainvoke({...}) — KHONG dung topology graph.py.
Template vang: subgraphs/deep_research_graph.py

State: subgraphs/states/diagnostic_state.py (co lap memory)
Nodes: nodes/diagnostic.py (node_mini_summarize, route_after_execute)
Adapter: subgraphs/adapters/sql_chain_adapter.py (adapt_generate_sql, adapt_execute_sql)
"""
from __future__ import annotations

from langgraph.graph import END, StateGraph

from dbgpt_analyst.nodes.diagnostic import (
    node_mini_summarize,
    route_after_execute,
)
from dbgpt_analyst.subgraphs.adapters.sql_chain_adapter import (
    adapt_execute_sql,
    adapt_generate_sql,
)
from dbgpt_analyst.subgraphs.states.diagnostic_state import DiagnosticState


def build_diagnostic_graph():
    """Build va compile diagnostic subgraph."""
    workflow = StateGraph(DiagnosticState)

    # ── Nodes ──────────────────────────────────────────────────────────
    workflow.add_node("generate_sql", adapt_generate_sql)    # adapter -> node_generate_sql
    workflow.add_node("execute_sql", adapt_execute_sql)      # adapter -> node_execute_sql
    workflow.add_node("summarize", node_mini_summarize)      # node rieng (nodes/diagnostic.py)

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
