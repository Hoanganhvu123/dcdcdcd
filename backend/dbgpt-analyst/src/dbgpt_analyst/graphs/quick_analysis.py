"""graphs/quick_analysis.py — Quick Analysis Mode Subgraph.

Mode: query_type = "sql"
Flow: sql_agent → data_engineer → synthesizer → END
Usecase: "Top 10 sản phẩm bán chạy", "Doanh thu tháng này"
"""
from __future__ import annotations

from typing import Any
from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.graphs.data_engineer import data_engineer_subgraph
from dbgpt_analyst.graphs.sql_agent import sql_agent_subgraph
from dbgpt_analyst.graphs.synthesizer import synthesizer_subgraph


def build_quick_analysis_subgraph() -> Any:
    """Build and compile the Quick Analysis mode subgraph."""
    workflow = StateGraph(MainAgentState)

    workflow.add_node("sql_agent", sql_agent_subgraph)
    workflow.add_node("data_engineer", data_engineer_subgraph)
    workflow.add_node("synthesizer", synthesizer_subgraph)

    workflow.set_entry_point("sql_agent")
    workflow.add_edge("sql_agent", "data_engineer")
    workflow.add_edge("data_engineer", "synthesizer")
    workflow.add_edge("synthesizer", END)

    return workflow.compile()


quick_analysis_subgraph = build_quick_analysis_subgraph()

__all__ = ["build_quick_analysis_subgraph", "quick_analysis_subgraph"]
