"""nodes/merge.py — Merge Results node for concurrent sub-agent fan-in.

After data_engineer and web_researcher run in parallel (via Send()),
this node gathers their outputs and prepares state for synthesizer.
"""
import logging
from typing import Any

from dbgpt_analyst.events import PhaseEvent
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.common.langfuse_client import observe

logger = logging.getLogger(__name__)


@observe(name="node_merge_results")
async def node_merge_results(state: MainAgentState) -> dict[str, Any]:
    """Fan-in node: merge results from concurrent sub-agents.

    This node is the convergence point after parallel execution of
    data_engineer and/or web_researcher. It emits a phase event
    and passes state through to synthesizer.
    """
    de_report = state.get("data_engineer_report", "")
    web_findings = state.get("web_findings", [])

    merge_summary_parts = []
    if de_report:
        merge_summary_parts.append(f"Data Engineer: {len(de_report)} chars")
    if web_findings:
        merge_summary_parts.append(f"Web Research: {len(web_findings)} findings")

    summary = ", ".join(merge_summary_parts) or "No sub-agent outputs"

    step = PhaseEvent(
        phase="merge",
        payload={
            "has_data_engineer": bool(de_report),
            "has_web_research": bool(web_findings),
            "message": f"🔀 Gom kết quả từ sub-agents: {summary}",
        },
        status="done",
        agent_name="🔀 Merge",
        agent_id="merge_node"
    ).model_dump()

    return {"steps": [step]}
