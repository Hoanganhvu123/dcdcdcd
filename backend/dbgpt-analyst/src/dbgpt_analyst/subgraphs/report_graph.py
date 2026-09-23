"""subgraphs/report_agent.py — Report Agent (Báo cáo) v2 Senior.

Sinh executive report Markdown từ TẤT CẢ findings:
  • SQL results + schema context
  • Data Engineer profiling report
  • Web research findings (nếu có)

Một hàm duy nhất: ``node_report_agent`` (graph node, trả dict).
Streaming answer text qua graph messages mode (không dùng yield).
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from dbgpt_analyst.core.helpers import _get_llm, json_serial
from dbgpt_analyst.memory.memory_experiment import (
    distill_and_store_generic_experience,
    format_experiences_for_llm,
    recall_experiences,
)
from dbgpt_analyst.events import ErrorEvent, PhaseEvent
from dbgpt_analyst.core.state import MainAgentState

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────

_CONTEXT_BUDGET = 6000          # Max chars cho context tổng hợp
_RESULTS_PREVIEW_ROWS = 20     # Max rows gửi vào LLM


# ── System Prompt ─────────────────────────────────────────────────────────

from dbgpt_analyst.prompts.report_prompt import REPORT_SYSTEM_PROMPT
_REPORT_SYSTEM_PROMPT = REPORT_SYSTEM_PROMPT


# ── Context Builder ───────────────────────────────────────────────────────

def _build_report_context(state: MainAgentState) -> str:
    """Xây dựng context string từ state, ưu tiên thông tin quan trọng nhất.

    Budget allocation (ước lượng):
      - SQL query: ~500 chars
      - Query results: ~2000 chars (top N rows)
      - Data Engineer report: ~2000 chars
      - Web findings: ~1000 chars
      - Metadata: ~500 chars
    """
    sections: list[str] = []
    remaining = _CONTEXT_BUDGET

    # 1. SQL Query (priority: high, small)
    sql = state.get("generated_sql")
    if sql:
        sql_section = f"### SQL Query\n```sql\n{sql}\n```"
        sections.append(sql_section)
        remaining -= len(sql_section)

    # 2. Query Results (priority: highest)
    results = state.get("query_results", [])
    if results:
        preview_rows = results[:_RESULTS_PREVIEW_ROWS]
        results_str = json.dumps(preview_rows, ensure_ascii=False, default=json_serial, indent=1)
        # Truncate nếu quá dài
        budget_for_results = min(remaining // 2, 2500)
        if len(results_str) > budget_for_results:
            results_str = results_str[:budget_for_results] + "\n... (truncated)"
        section = f"### Kết Quả ({len(results)} dòng, hiển thị {len(preview_rows)})\n```json\n{results_str}\n```"
        sections.append(section)
        remaining -= len(section)
    else:
        sections.append("### Kết Quả\nKhông có dữ liệu trả về.")

    # 3. Data Engineer Report (priority: high)
    de_report = state.get("data_engineer_report", "")
    if de_report:
        budget_for_de = min(remaining // 2, 2000)
        de_trimmed = de_report[:budget_for_de]
        if len(de_report) > budget_for_de:
            de_trimmed += "\n... (Data Engineer report truncated)"
        sections.append(f"### Data Engineer Analysis\n{de_trimmed}")
        remaining -= len(de_trimmed)

    # 4. Web Findings (priority: medium)
    web = state.get("web_findings", [])
    if web:
        budget_for_web = min(remaining, 1000)
        web_text = "\n".join(web[:5])[:budget_for_web]
        sections.append(f"### Web Research\n{web_text}")

    # 5. Metadata (always)
    tables = state.get("selected_tables", [])
    sections.append(
        f"### Metadata\n"
        f"- Bảng: {', '.join(tables) if tables else 'N/A'}\n"
        f"- Tổng dòng: {len(results)}\n"
        f"- Có Data Engineer report: {'Có' if de_report else 'Không'}\n"
        f"- Có Web Research: {'Có' if web else 'Không'}"
    )

    return "\n\n".join(sections)


# ── Graph Node ────────────────────────────────────────────────────────────

from langchain_core.runnables import RunnableConfig
from dbgpt_analyst.common.langfuse_client import observe


@observe(name="node_report_agent")
async def node_report_agent(state: MainAgentState, config: RunnableConfig = None) -> dict[str, Any]:
    """Report Agent — sinh executive report từ toàn bộ findings.

    Graph node: trả dict, LangGraph stream text qua messages mode.
    Dùng ``ainvoke`` (không phải ``astream``) vì graph node PHẢI return dict.
    Text response sẽ được stream tự động qua graph messages mode ở agent.py.
    """
    if config is None:
        config = RunnableConfig()

    question = state.get("question", "")

    logger.info("Entering node_report_agent")

    # Build context
    context = _build_report_context(state)

    steps: list[dict] = []

    # ── Hồi tưởng Kinh nghiệm (Experiential Memory) ──
    experiences_text = ""
    try:
        exp_rows = recall_experiences(query=question, agent_name="report_agent", limit=2)
        if exp_rows:
            experiences_text = format_experiences_for_llm(exp_rows)
            steps.append(PhaseEvent(
                phase="report",
                payload={"message": f"🧠 Áp dụng {len(exp_rows)} kinh nghiệm từ các báo cáo trước."},
                status="running",
                agent_id="report_agent",
                agent_name="📋 Report Agent"
            ).model_dump())
    except Exception as e:
        logger.warning(f"Report agent experience recall failed: {e}")

    user_msg = (
        f"Câu hỏi: {question}\n\n"
        f"{experiences_text}\n\n"
        f"--- DỮ LIỆU THU THẬP ---\n\n"
        f"{context}\n\n"
        f"--- HẾT ---\n\n"
        f"Sinh báo cáo executive report."
    )

    start_step = PhaseEvent(
        phase="report",
        payload={"message": "📋 Report Agent bắt đầu tổng hợp báo cáo..."},
        status="running",
        agent_id="report_agent",
        agent_name="📋 Report Agent"
    ).model_dump()
    steps.append(start_step)

    try:
        llm = await _get_llm(state, streaming=True, json_mode=False)

        response = await llm.ainvoke([
            SystemMessage(content=_REPORT_SYSTEM_PROMPT),
            HumanMessage(content=user_msg),
        ], config=config)

        report = str(response.content)

        done_step = PhaseEvent(
            phase="report",
            payload={
                "message": "✅ Báo cáo hoàn tất!",
                "report_length": len(report),
                "sections_detected": report.count("## "),
            },
            status="done",
            agent_id="report_agent",
            agent_name="📋 Report Agent"
        ).model_dump()
        steps.append(done_step)

        # ── Rút Kinh Nghiệm (Fire-and-forget) ──
        asyncio.create_task(
            distill_and_store_generic_experience(
                agent_name="report_agent",
                task_input=f"Câu hỏi: {question}\nNgữ cảnh (rút gọn): {context[:500]}...",
                task_output=report,
                status="success",
                context_data={"tables": state.get("selected_tables", [])}
            )
        )

        return {
            "steps": steps,
            "answer": report,
            "report_markdown": report,
        }

    except Exception as e:
        logger.exception("Error in node_report_agent")
        error_msg = f"Lỗi sinh báo cáo: {e}"

        err_step = ErrorEvent(
            payload={"error": error_msg},
            phase="report",
            agent_id="report_agent",
            agent_name="📋 Report Agent"
        ).model_dump()
        steps.append(err_step)

        return {
            "steps": steps,
            "answer": error_msg,
            "report_markdown": error_msg,
        }
