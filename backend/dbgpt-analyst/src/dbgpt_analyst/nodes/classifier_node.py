"""Classifier Node — Query Intent Routing & Fast-Path Detection.

Specialized agent node using PromptManager to load prompts from markdown files:
- Determines query type: 'sql', 'office', 'report', 'research', or 'general'
- Dispatches domain and heuristics with zero hardcoded multiline prompt strings
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.prompts.compiler import PromptManager

logger = logging.getLogger(__name__)

# Fast-path heuristics
_SQL_PATTERNS = re.compile(
    r"\b(select|query|sql|database|table|revenue|doanh thu|đơn hàng|orders|bán hàng|khách hàng|top \d+|bao nhiêu|tổng số|liệt kê)\b",
    re.IGNORECASE,
)
_OFFICE_PATTERNS = re.compile(
    r"\b(excel|xlsx|slide|pptx|powerpoint|word|docx|thuyết trình|tài liệu|bảng tính|báo cáo word)\b",
    re.IGNORECASE,
)
_REPORT_PATTERNS = re.compile(
    r"\b(report|báo cáo|tổng kết|phân tích chuyên sâu|audit|đánh giá tổng thể)\b",
    re.IGNORECASE,
)
_RESEARCH_PATTERNS = re.compile(
    r"\b(nghiên cứu|tìm kiếm|internet|thị trường|đối thủ|benchmark|google|web research)\b",
    re.IGNORECASE,
)


def extract_query(messages: list[Any]) -> str:
    """Extract latest human query from message list."""
    for m in reversed(messages):
        if isinstance(m, HumanMessage) or getattr(m, "type", "") == "human":
            return str(m.content).strip()
        elif isinstance(m, dict) and m.get("role") == "user":
            return str(m.get("content", "")).strip()
    return ""


def classify_intent_heuristics(query: str) -> str:
    """Fast deterministic intent detection based on regex tokens."""
    if not query:
        return "general"
    if _OFFICE_PATTERNS.search(query):
        return "office"
    if _RESEARCH_PATTERNS.search(query):
        return "research"
    if _REPORT_PATTERNS.search(query):
        return "report"
    if _SQL_PATTERNS.search(query):
        return "sql"
    return "general"


async def classifier_node(
    state: dict[str, Any], config: RunnableConfig | None = None
) -> dict[str, Any]:
    """Classify user intent using PromptManager and heuristic fallbacks."""
    t0 = time.time()
    messages = state.get("messages", [])
    query = state.get("question") or extract_query(messages) or ""

    # Check override in state
    preset_mode = state.get("query_type") or state.get("mode")
    if preset_mode:
        detected_mode = str(preset_mode)
    else:
        detected_mode = classify_intent_heuristics(query)

    effective_model = (
        (config or {}).get("configurable", {}).get("model")
        or state.get("model")
    )

    # If LLM model is provided and query is ambiguous, leverage prompt-driven classification
    if effective_model and hasattr(effective_model, "ainvoke") and not preset_mode and detected_mode == "general" and len(query) > 10:
        try:
            prompt_text = PromptManager.render_template(
                "classifier",
                {
                    "allowed_modes": "sql, office, report, research, general",
                },
            )
            response = await effective_model.ainvoke(
                [
                    SystemMessage(content=prompt_text),
                    HumanMessage(content=f"Phân loại truy vấn người dùng: {query}"),
                ],
                config=config,
            )
            resp_content = str(response.content).strip()
            # Attempt parsing JSON response
            parsed = json.loads(resp_content)
            if isinstance(parsed, dict) and "mode" in parsed:
                detected_mode = str(parsed["mode"]).lower()
        except Exception as exc:
            logger.debug("Prompt-driven classification fallback: %s", exc)

    elapsed_ms = round((time.time() - t0) * 1000)

    diagnostics = [{
        "step": "classifier",
        "label": f"🎯 Intent Classifier ({detected_mode})",
        "content": f"Mode: {detected_mode} | Query: {query[:80]}",
        "elapsed_ms": elapsed_ms,
    }]

    return {
        "query_type": detected_mode,
        "mode": detected_mode,
        "intent": detected_mode,
        "diagnostics": diagnostics,
        "timing_classifier_s": round(elapsed_ms / 1000, 3),
    }


__all__ = [
    "classifier_node",
    "classify_intent_heuristics",
    "extract_query",
]
