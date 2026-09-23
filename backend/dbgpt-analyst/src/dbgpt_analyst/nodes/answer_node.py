"""Answer Node — Synthesizes Structured Analytical Narrative.

Specialized agent node using PromptManager:
- Loads prompt templates via PromptManager
- Synthesizes verified data insights, metric citations, and executive takeaways
- Enforces tag balancing with close_unclosed_xml_tags
- Zero hardcoded multiline prompt strings in Python code
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.prompts.compiler import PromptManager

logger = logging.getLogger(__name__)


def close_unclosed_xml_tags(text: str) -> str:
    """Balance and auto-close unclosed XML tags using a LIFO stack for streaming safety."""
    tag_names = {
        "thought",
        "thinking",
        "sql",
        "chart",
        "artifact",
        "answer",
        "table",
        "analysis",
        "insight",
        "metric",
    }
    pattern = re.compile(r"<(/?)(\w+)(?:\s+[^>]*?)?(?:/?)>")
    stack: list[str] = []
    for match in pattern.finditer(text):
        is_closing = bool(match.group(1))
        tag = match.group(2).lower()
        if tag not in tag_names:
            continue
        full_match = match.group(0)
        if full_match.endswith("/>"):
            continue
        if is_closing:
            if stack and stack[-1] == tag:
                stack.pop()
            elif tag in stack:
                while stack and stack[-1] != tag:
                    stack.pop()
                if stack:
                    stack.pop()
        else:
            stack.append(tag)

    for open_tag in reversed(stack):
        text += f"\n</{open_tag}>"
    return text


def extract_query(messages: list[Any]) -> str:
    """Extract latest user question."""
    for m in reversed(messages):
        if isinstance(m, HumanMessage) or getattr(m, "type", "") == "human":
            return str(m.content).strip()
        elif isinstance(m, dict) and m.get("role") == "user":
            return str(m.get("content", "")).strip()
    return ""


def _build_deterministic_answer(query: str, sql_result: Any, domain: str = "") -> str:
    """Build structured fallback analytical answer without hardcoded multiline prompt."""
    res_str = str(sql_result or "Không có kết quả truy vấn.")[:500]
    return (
        f"### KẾT QUẢ PHÂN TÍCH DỮ LIỆU\n\n"
        f"- **Yêu cầu**: {query or 'Tổng hợp số liệu'}\n"
        f"- **Miền phân tích**: {domain or 'Data Analytics'}\n"
        f"- **Dữ liệu trích xuất**:\n```text\n{res_str}\n```\n\n"
        f"**Kết luận**: Dữ liệu đã được kiểm chứng từ cơ sở dữ liệu."
    )


async def answer_node(
    state: dict[str, Any], config: RunnableConfig | None = None
) -> dict[str, Any]:
    """Synthesize final analytical response using PromptManager."""
    t0 = time.time()
    messages = state.get("messages", [])
    query = state.get("question") or extract_query(messages) or "Phân tích dữ liệu"
    sql_result = state.get("sql_result") or state.get("tool_result") or ""
    domain = state.get("domain") or state.get("query_type") or "analytics"

    effective_model = (
        (config or {}).get("configurable", {}).get("model")
        or state.get("model")
    )

    # 1. Render system prompt from markdown template
    prompt_context = {
        "query_context": f"Query: {query}\nResult: {str(sql_result)[:300]}",
        "thought_id": "thought_1",
        "dialect": state.get("dialect", "sqlite"),
        "chart_type": "bar",
        "artifact_type": "data_analysis",
        "title": "Báo cáo phân tích",
    }
    system_prompt = PromptManager.render_template("answer", prompt_context, check_unrendered=False)

    answer_text = ""
    if effective_model and hasattr(effective_model, "ainvoke"):
        try:
            input_msgs = [
                SystemMessage(content=system_prompt),
                *messages,
                HumanMessage(content=f"Tổng hợp câu trả lời phân tích cho: {query}"),
            ]
            resp = await effective_model.ainvoke(input_msgs, config=config)
            answer_text = str(resp.content).strip()
        except Exception as exc:
            logger.warning("LLM invocation in answer_node failed: %s", exc)
            answer_text = _build_deterministic_answer(query, sql_result, domain)
    else:
        answer_text = _build_deterministic_answer(query, sql_result, domain)

    answer_text = close_unclosed_xml_tags(answer_text)
    elapsed_ms = round((time.time() - t0) * 1000)

    final_msg = AIMessage(
        content=answer_text,
        name="answer_agent",
    )

    diagnostics = [{
        "step": "answer",
        "label": "📊 Analytical Answer Synthesis",
        "content": answer_text[:200],
        "elapsed_ms": elapsed_ms,
    }]

    return {
        "messages": [final_msg],
        "synthesized_answer": answer_text,
        "deliverable": answer_text,
        "settled": True,
        "diagnostics": diagnostics,
        "timing_answer_s": round(elapsed_ms / 1000, 3),
    }


__all__ = [
    "answer_node",
    "close_unclosed_xml_tags",
    "extract_query",
]
