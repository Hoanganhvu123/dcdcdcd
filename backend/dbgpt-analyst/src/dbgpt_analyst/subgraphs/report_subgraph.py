"""subgraphs/report_subgraph.py — Report Subgraph (Real StateGraph).

Wraps node_report_agent (executive report generator) into a proper
LangGraph StateGraph.

Phase 2: Add internal nodes (build_context → generate_sections → format_markdown).
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
