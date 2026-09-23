"""subgraphs/modes/deep_report_subgraph.py — Deep Report Mode (Layer 2).

Mode: query_type = "report"
Flow: sql_agent → data_engineer → report_agent → END
Usecase: "Báo cáo phân tích chi tiết doanh thu Q2", "Executive summary"

Reuses Layer 3 agent subgraphs — no new logic, just wiring.
Output: report_markdown (executive Markdown report).
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.subgraphs.data_engineer_subgraph import data_engineer_subgraph
from dbgpt_analyst.subgraphs.report_subgraph import report_subgraph
from dbgpt_analyst.subgraphs.sql_agent_subgraph import sql_agent_subgraph


def build_deep_report_subgraph() -> Any:
    """Build and compile the Deep Report mode subgraph.

    Sequential flow: SQL Agent → Data Engineer → Report Agent.
    Produces an executive Markdown report instead of a chat answer.
    """
    workflow = StateGraph(MainAgentState)

    # ── Layer 3 Agent Subgraphs (reuse 100%) ──────────────────────────
    workflow.add_node("sql_agent", sql_agent_subgraph)
    workflow.add_node("data_engineer", data_engineer_subgraph)
    workflow.add_node("report_agent", report_subgraph)

    # ── Sequential edges ──────────────────────────────────────────────
    workflow.set_entry_point("sql_agent")
    workflow.add_edge("sql_agent", "data_engineer")
    workflow.add_edge("data_engineer", "report_agent")
    workflow.add_edge("report_agent", END)

    return workflow.compile()


deep_report_subgraph = build_deep_report_subgraph()
