"""subgraphs/modes/web_research_subgraph.py — Web Research Mode (Layer 2).

Mode: query_type = "web"
Flow: web_researcher → synthesizer → END
Usecase: "Xu hướng thời trang 2025?", "Đối thủ Canifa là ai?"

No SQL needed — pure web search → synthesis.
Reuses Layer 3 agent subgraphs + node functions.
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from dbgpt_analyst.nodes.researcher import node_web_researcher
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.subgraphs.synthesizer_subgraph import synthesizer_subgraph


def build_web_research_subgraph() -> Any:
    """Build and compile the Web Research mode subgraph.

    Sequential flow: Web Researcher → Synthesizer.
    No SQL Agent, no Data Engineer — pure web-based answering.
    """
    workflow = StateGraph(MainAgentState)

    # ── Layer 3 Agents ────────────────────────────────────────────────
    workflow.add_node("web_researcher", node_web_researcher)
    workflow.add_node("synthesizer", synthesizer_subgraph)

    # ── Sequential edges ──────────────────────────────────────────────
    workflow.set_entry_point("web_researcher")
    workflow.add_edge("web_researcher", "synthesizer")
    workflow.add_edge("synthesizer", END)

    return workflow.compile()


web_research_subgraph = build_web_research_subgraph()
