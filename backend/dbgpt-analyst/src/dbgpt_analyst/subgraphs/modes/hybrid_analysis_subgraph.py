"""subgraphs/modes/hybrid_analysis_subgraph.py — Hybrid Analysis Mode (Layer 2).

Mode: query_type = "hybrid"
Flow: sql_agent → [data_engineer ∥ web_researcher] → merge → synthesizer → END
Usecase: "Doanh thu giảm 30% — nguyên nhân gì?", "So sánh với thị trường"

Fan-out (Send API) and fan-in (merge) are ENCAPSULATED inside this subgraph.
They do NOT leak into main_graph.

Reuses Layer 3 agent subgraphs + node functions.
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph
from langgraph.types import Send

from dbgpt_analyst.nodes.merge import node_merge_results
from dbgpt_analyst.nodes.researcher import node_web_researcher
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.subgraphs.data_engineer_subgraph import data_engineer_subgraph
from dbgpt_analyst.subgraphs.sql_agent_subgraph import sql_agent_subgraph
from dbgpt_analyst.subgraphs.synthesizer_subgraph import synthesizer_subgraph
from dbgpt_analyst.common.langfuse_client import observe


def build_hybrid_analysis_subgraph() -> Any:
    """Build and compile the Hybrid Analysis mode subgraph.

    Fan-out flow after SQL Agent:
        sql_agent → Send(data_engineer) + Send(web_researcher) in parallel
        data_engineer  ─┐
                        ├─→ merge_results → synthesizer → END
        web_researcher ─┘

    All fan-out/fan-in complexity is encapsulated HERE.
    """
    workflow = StateGraph(MainAgentState)

    # ── Layer 3 Agent Subgraphs + Node Functions ──────────────────────
    workflow.add_node("sql_agent", sql_agent_subgraph)
    workflow.add_node("data_engineer", data_engineer_subgraph)
    workflow.add_node("web_researcher", node_web_researcher)
    workflow.add_node("merge_results", node_merge_results)
    workflow.add_node("synthesizer", synthesizer_subgraph)

    # ── Entry ─────────────────────────────────────────────────────────
    workflow.set_entry_point("sql_agent")

    # ── Fan-out: sql_agent → [data_engineer ∥ web_researcher] ─────────
    @observe(name="hybrid_analysis_fan_out")
    def fan_out_after_sql(state: MainAgentState):
        """Dispatch data_engineer and web_researcher concurrently via Send()."""
        from dbgpt_analyst.core.state import create_clean_state

        parent_id = "orchestrator-main"
        de_state = create_clean_state(
            task_description="Profile và clean dữ liệu",
            parent_agent_id=parent_id,
        )
        web_state = create_clean_state(
            task_description="Search context thị trường",
            parent_agent_id=parent_id,
        )

        state_for_de = {
            **state,
            "agent_id": de_state["agent_id"],
            "parent_agent_id": parent_id,
        }
        state_for_web = {
            **state,
            "agent_id": web_state["agent_id"],
            "parent_agent_id": parent_id,
        }

        return [
            Send("data_engineer", state_for_de),
            Send("web_researcher", state_for_web),
        ]

    workflow.add_conditional_edges("sql_agent", fan_out_after_sql)

    # ── Fan-in: both agents → merge_results ───────────────────────────
    workflow.add_edge("data_engineer", "merge_results")
    workflow.add_edge("web_researcher", "merge_results")

    # ── merge → synthesizer → END ─────────────────────────────────────
    workflow.add_edge("merge_results", "synthesizer")
    workflow.add_edge("synthesizer", END)

    return workflow.compile()


hybrid_analysis_subgraph = build_hybrid_analysis_subgraph()
