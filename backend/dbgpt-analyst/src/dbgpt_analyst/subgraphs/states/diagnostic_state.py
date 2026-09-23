"""subgraphs/states/diagnostic_state.py — State rieng cho diagnostic subgraph.

Co lap memory voi MainAgentState (khong dung chung 49 fields).
Template: deep_research_graph.DeepResearchState (11 fields rieng).
"""
import operator
from typing import Annotated, Any, TypedDict


class DiagnosticState(TypedDict):
    """Sub-state cho diagnostic subgraph — phan tich root-cause theo goc (angle).

    10 fields (vs MainAgentState 49 fields) — co lap memory, khong trung state flat graph.
    """

    angle: str                                      # Goc nhin: by_industry | by_region | by_time
    question: str                                   # Cau hoi goc (tu flat graph snapshot)
    parent_context: dict[str, Any]                  # Snapshot tu flat graph (question, schemas_text, ...)
    generated_sql: str | None
    query_results: list[dict[str, Any]]
    retry_count: int
    fix_hint: str | None                            # Hint tu LLM-Critic (P0) → adapter truyen vao
    error: str | None
    mini_summary: str                               # Output: 2-4 cau narrative nhan-qua
    steps: Annotated[list[dict[str, Any]], operator.add]
