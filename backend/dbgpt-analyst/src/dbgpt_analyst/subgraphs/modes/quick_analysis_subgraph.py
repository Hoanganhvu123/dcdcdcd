"""subgraphs/modes/quick_analysis_subgraph.py — Quick Analysis Mode (Layer 2).

Mode: query_type = "sql"
Flow: sql_agent → data_engineer → synthesizer → END
Usecase: "Top 10 sản phẩm bán chạy", "Doanh thu tháng này"

Reuses Layer 3 agent subgraphs — no new logic, just wiring.
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.subgraphs.data_engineer_subgraph import data_engineer_subgraph
from dbgpt_analyst.subgraphs.sql_agent_subgraph import sql_agent_subgraph
from dbgpt_analyst.subgraphs.synthesizer_subgraph import synthesizer_subgraph


def build_quick_analysis_subgraph() -> Any:
    """Build and compile the Quick Analysis mode subgraph.

    Sequential flow: SQL Agent → Data Engineer → Synthesizer.
    No fan-out, no branching — the simplest mode.
    """
    workflow = StateGraph(MainAgentState)

    # ── Layer 3 Agent Subgraphs (reuse 100%) ──────────────────────────
    workflow.add_node("sql_agent", sql_agent_subgraph)
    workflow.add_node("data_engineer", data_engineer_subgraph)
    workflow.add_node("synthesizer", synthesizer_subgraph)

    # ── Sequential edges ──────────────────────────────────────────────
    workflow.set_entry_point("sql_agent")
    workflow.add_edge("sql_agent", "data_engineer")
    workflow.add_edge("data_engineer", "synthesizer")
    workflow.add_edge("synthesizer", END)

    return workflow.compile()


quick_analysis_subgraph = build_quick_analysis_subgraph()
