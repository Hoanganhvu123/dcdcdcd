"""nodes/plan_node.py — Analysis Planning and Query Routing Node.

Canonically maps to cuccu_legal multi-agent node architecture:
- Plans analytical execution steps
- Classifies query intent and determines route
- Formulates execution steps and schema targets
"""
from __future__ import annotations

import logging
import time
from typing import Any

from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.nodes.classifier_node import classifier_node, extract_query

logger = logging.getLogger(__name__)


@observe(name="plan_node")
async def plan_node(
    state: dict[str, Any], config: RunnableConfig
) -> dict[str, Any]:
    """Plan the analysis flow, detect query intent, and route execution."""
    t0 = time.time()
    classification = await classifier_node(state, config=config)

    detected_mode = classification.get("mode") or classification.get("query_type") or "sql"
    messages = state.get("messages", [])
    query = state.get("question") or extract_query(messages) or ""

    # Formulate structured execution plan
    steps: list[dict[str, Any]] = []
    if detected_mode == "sql":
        steps = [
            {"step": 1, "title": "Khảo sát lược đồ cơ sở dữ liệu", "status": "done"},
            {"step": 2, "title": "Sinh câu lệnh truy vấn SQL", "status": "pending"},
            {"step": 3, "title": "Thực thi truy vấn và đối chiếu số liệu", "status": "pending"},
            {"step": 4, "title": "Tổng hợp báo cáo phân tích", "status": "pending"},
        ]
    elif detected_mode in ("office", "excel", "slide", "docx"):
        steps = [
            {"step": 1, "title": "Khởi tạo tài liệu văn phòng Kimi", "status": "done"},
            {"step": 2, "title": "Biên soạn nội dung và công thức", "status": "pending"},
            {"step": 3, "title": "Đóng gói file artifact sẵn sàng tải xuống", "status": "pending"},
        ]
    else:
        steps = [
            {"step": 1, "title": "Phân tích yêu cầu và tổng hợp dữ kiện", "status": "done"},
            {"step": 2, "title": "Biên soạn câu trả lời phân tích", "status": "pending"},
        ]

    elapsed_ms = round((time.time() - t0) * 1000)

    return {
        "query_type": detected_mode,
        "mode": detected_mode,
        "intent": detected_mode,
        "plan": steps,
        "steps": state.get("steps", []) + steps,
        "timing_plan_ms": elapsed_ms,
    }


__all__ = ["plan_node"]
