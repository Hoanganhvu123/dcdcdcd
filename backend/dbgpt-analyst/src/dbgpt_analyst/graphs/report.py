"""graphs/report.py — Report Generation Subgraph.

Compiles the executive report agent into a LangGraph StateGraph.
"""
from __future__ import annotations

from typing import Any
from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.subgraphs.report_graph import node_report_agent


def build_report_subgraph() -> Any:
    """Build and compile the Report subgraph."""
    workflow = StateGraph(MainAgentState)
    workflow.add_node("report_agent", node_report_agent)
    workflow.set_entry_point("report_agent")
    workflow.add_edge("report_agent", END)
    return workflow.compile()


report_subgraph = build_report_subgraph()

__all__ = ["build_report_subgraph", "report_subgraph", "node_report_agent"]
