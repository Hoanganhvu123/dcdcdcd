"""graphs/deep_report.py — Deep Report Mode Subgraph.

Mode: query_type = "report"
Flow: sql_agent → data_engineer → report_agent → END
Usecase: "Báo cáo phân tích chi tiết doanh thu Q2", "Executive summary"
"""
from __future__ import annotations

from typing import Any
from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.graphs.data_engineer import data_engineer_subgraph
from dbgpt_analyst.graphs.report import report_subgraph
from dbgpt_analyst.graphs.sql_agent import sql_agent_subgraph


def build_deep_report_subgraph() -> Any:
    """Build and compile the Deep Report mode subgraph."""
    workflow = StateGraph(MainAgentState)

    workflow.add_node("sql_agent", sql_agent_subgraph)
    workflow.add_node("data_engineer", data_engineer_subgraph)
    workflow.add_node("report_agent", report_subgraph)

    workflow.set_entry_point("sql_agent")
    workflow.add_edge("sql_agent", "data_engineer")
    workflow.add_edge("data_engineer", "report_agent")
    workflow.add_edge("report_agent", END)

    return workflow.compile()


deep_report_subgraph = build_deep_report_subgraph()

__all__ = ["build_deep_report_subgraph", "deep_report_subgraph"]
