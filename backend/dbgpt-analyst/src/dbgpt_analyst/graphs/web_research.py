"""graphs/web_research.py — Consolidated Web Research Subgraph.

Provides:
- build_web_research_subgraph: Full mode workflow (web_researcher → synthesizer → END).
- build_web_researcher_graph: 1-node agent graph for supervisor delegation.
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.nodes.researcher import node_web_researcher as _raw_web_researcher
from dbgpt_analyst.subgraphs.synthesizer_subgraph import synthesizer_subgraph


def build_web_researcher_graph() -> Any:
    """Build and compile 1-node Web Researcher subagent graph."""
    workflow = StateGraph(MainAgentState)
    workflow.add_node("web_researcher", _raw_web_researcher)
    workflow.set_entry_point("web_researcher")
    workflow.add_edge("web_researcher", END)
    return workflow.compile()


def build_web_research_subgraph() -> Any:
    """Build and compile the Web Research mode subgraph (web_researcher → synthesizer)."""
    workflow = StateGraph(MainAgentState)
    workflow.add_node("web_researcher", _raw_web_researcher)
    workflow.add_node("synthesizer", synthesizer_subgraph)

    workflow.set_entry_point("web_researcher")
    workflow.add_edge("web_researcher", "synthesizer")
    workflow.add_edge("synthesizer", END)
    return workflow.compile()


web_researcher_graph = build_web_researcher_graph()
web_research_subgraph = build_web_research_subgraph()

__all__ = [
    "build_web_research_subgraph",
    "build_web_researcher_graph",
    "web_research_subgraph",
    "web_researcher_graph",
]
