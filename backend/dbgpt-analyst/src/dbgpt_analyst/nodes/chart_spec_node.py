"""nodes/chart_spec_node.py — Chart Specification Generator Node.

Canonically maps to cuccu_legal node architecture:
- Generates normalized JSON chart specifications (Recharts/ECharts/AntV)
- Inspects SQL query rows for numeric and categorical dimensions
- Embeds chart model for frontend Studio Canvas rendering
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.tools.presentation.chart import build_chart_spec

logger = logging.getLogger(__name__)


@observe(name="chart_spec_node")
async def chart_spec_node(
    state: dict[str, Any]
) -> dict[str, Any]:
    """Derive interactive chart specification from query results."""
    query_results = state.get("query_results", [])
    question = state.get("question", "")
    llm_chart = state.get("chart")

    spec = build_chart_spec(llm_chart, query_results, question)

    diagnostics = list(state.get("diagnostics", []))
    if spec:
        diagnostics.append({
            "step": "chart_spec",
            "label": f"📊 Biểu đồ ({spec.get('type', 'bar')})",
            "content": f"Title: {spec.get('title')} | X: {spec.get('xKey')} | Y: {spec.get('yKeys')}",
        })

    return {
        "chart": spec,
        "display_type": "chart" if spec else state.get("display_type"),
        "diagnostics": diagnostics,
    }


__all__ = ["chart_spec_node"]
