"""nodes/sql_planner.py — Node: plan_sql (Reasoning trước khi sinh SQL).

Node mới trong SQL Agent Subgraph, chạy TRƯỚC generate_sql.
LLM lên kế hoạch truy vấn bằng ngôn ngữ tự nhiên, stream ra thinking_delta
để Frontend hiển thị quá trình suy luận.

Nguồn gốc: WrenAI audit — tách Reasoning vs Generation.
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.events.base import emit_custom
from dbgpt_analyst.events import WorkflowTaskEvent
from dbgpt_analyst.prompts.sql_planner_prompt import get_sql_planner_prompt
from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.common.llm_factory import preferred_model_name
from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

logger = logging.getLogger(__name__)


@observe(name="node_plan_sql")
async def node_plan_sql(state: MainAgentState, config: RunnableConfig) -> dict[str, Any]:
    """Node: LLM lên kế hoạch truy vấn SQL (reasoning plan) — KHÔNG sinh SQL.

    Outputs:
        sql_reasoning_plan (str): Kế hoạch reasoning đầy đủ để generate_sql tuân theo.
        steps: WorkflowTaskEvent ghi nhận bước planning.
    """
    question = state["question"]
    schema_text = state.get("schemas_text", "")
    business_docs = state.get("business_docs", "")
    session_history = state.get("session_history", "")
    error = state.get("error")
    retry_count = state.get("retry_count", 0)

    # Lấy toàn bộ lịch sử retry từ state
    retry_history = state.get("retry_history", [])

    # Chia schema_text thành danh sách bảng (tách bằng dòng trống kép)
    schema_tables = [s.strip() for s in schema_text.split("\n\n") if s.strip()]

    prompt = get_sql_planner_prompt(
        user_query=question,
        schema_tables=schema_tables,
        business_rules=business_docs,
        session_history=session_history,
        retry_history=retry_history,
    )

    current_user_id = (config or {}).get("configurable", {}).get("user_id", "dev_user")

    try:
        llm, _ = await create_llm_with_fallback(
            model_name=preferred_model_name(),
            user_id=current_user_id,
            streaming=True,
            json_mode=False,
        )

        # Stream plan để UI hiển thị reasoning real-time
        buffer = ""
        async for chunk in llm.astream(
            [SystemMessage(content=prompt), HumanMessage(content=question)],
            config,
        ):
            if chunk.content:
                text_chunk = chunk.content if isinstance(chunk.content, str) else "".join(c.get("text", "") if isinstance(c, dict) else str(c) for c in chunk.content)
                buffer += text_chunk
                emit_custom("thinking_delta", {"delta": text_chunk})

        step = WorkflowTaskEvent(
            payload={
                "message": "Đã lên kế hoạch truy vấn SQL chi tiết — chuyển sang sinh SQL.",
                "plan_preview": buffer[:500] if buffer else "",
            },
            phase="planning",
        ).model_dump()

        logger.info("node_plan_sql: reasoning plan generated (%d chars)", len(buffer))
        return {"sql_reasoning_plan": buffer, "steps": [step]}

    except Exception as e:
        logger.exception("Error in node_plan_sql")
        # Không chặn pipeline — nếu planning lỗi, generate_sql vẫn chạy bình thường (không có plan)
        step = WorkflowTaskEvent(
            payload={"message": f"Bỏ qua bước lên kế hoạch (lỗi: {e!s}) — sinh SQL trực tiếp."},
            phase="planning",
        ).model_dump()
        return {"sql_reasoning_plan": "", "steps": [step]}
