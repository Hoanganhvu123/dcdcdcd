"""nodes/diagnostic.py — Nodes rieng cho diagnostic subgraph (root-cause analysis).

Convention: TAT CA node function nam trong nodes/ folder (giong 9 node khac).
subgraphs/ chi chua graph wiring + adapter, khong chua node logic.

Nodes:
    node_mini_summarize: tom tat ngan ket qua theo goc nhin (angle).
    route_after_execute: routing heuristic — retry generate_sql neu loi, nguoc lai -> summarize.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.core.helpers import json_serial
from dbgpt_analyst.events import WorkflowTaskEvent
from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.common.llm_factory import preferred_model_name
from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

logger = logging.getLogger(__name__)

_MAX_DIAGNOSTIC_RETRIES = 2


def route_after_execute(state: dict[str, Any]) -> str:
    """Routing heuristic: execute_sql -> generate_sql (retry) hoac summarize.

    Rule:
        - Neu co error VA retry_count < 2  -> retry generate_sql
        - Nguoc lai (thanh cong / het luot) -> summarize
    """
    if state.get("error") and state.get("retry_count", 0) < _MAX_DIAGNOSTIC_RETRIES:
        return "generate_sql"
    return "summarize"


@observe(name="node_mini_summarize")
async def node_mini_summarize(state: dict[str, Any], config: RunnableConfig) -> dict[str, Any]:
    """Node: tom tat ngan ket qua theo goc nhin (angle).

    Input: query_results + angle + question
    Output: mini_summary (2-4 cau narrative nhan-qua cho goc nay)

    Logic RIENG cho diagnostic subgraph — KHONG reuse node tu nodes/ khac
    (vi day la phan tom tat theo goc, khong phai tong hop chung).
    """
    angle = state.get("angle", "")
    question = state.get("question", "")
    query_results = state.get("query_results", [])
    error = state.get("error")

    # Fast-exit: khong co data
    if error and not query_results:
        return {
            "mini_summary": f"Goc '{angle}': khong truy xuat duoc du lieu ({error[:100]}).",
            "steps": [WorkflowTaskEvent(
                payload={"message": f"Goc {angle}: loi truy xuat.", "angle": angle, "error": error[:200]},
                phase="insights",
                status="error"
            ).model_dump()],
        }

    if not query_results:
        return {
            "mini_summary": f"Goc '{angle}': khong co du lieu phu hop.",
            "steps": [WorkflowTaskEvent(
                payload={"message": f"Goc {angle}: khong co data.", "angle": angle, "rows": 0},
                phase="insights",
                status="done"
            ).model_dump()],
        }

    # Build prompt
    preview = json.dumps(query_results[:15], ensure_ascii=False, default=json_serial)
    from dbgpt_analyst.prompts.diagnostic_prompt import (
        DIAGNOSTIC_SYSTEM_PROMPT,
        render_diagnostic_user_prompt,
    )
    system_prompt = DIAGNOSTIC_SYSTEM_PROMPT
    user_prompt = render_diagnostic_user_prompt(angle, question, preview)

    try:
        current_user_id = config.get("configurable", {}).get("user_id", "dev_user")
        llm, _ = await create_llm_with_fallback(
            model_name=preferred_model_name(),
            user_id=current_user_id,
            streaming=False,
            json_mode=False,
        )
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ], config=config)
        summary = str(response.content).strip()
    except Exception as e:
        logger.warning("node_mini_summarize LLM failed: %s", e)
        summary = f"Goc '{angle}': co {len(query_results)} dong du lieu (LLM tom tat that bai)."

    return {
        "mini_summary": summary,
        "steps": [WorkflowTaskEvent(
            payload={"message": f"Goc {angle}: da tom tat ({len(query_results)} dong).", "angle": angle, "rows": len(query_results)},
            phase="insights",
            status="done"
        ).model_dump()],
    }
