"""subgraphs/synthesizer_subgraph.py — Synthesizer Subgraph.

Gộp insights_graph.py + synthesizer_subgraph.py thành 1 file duy nhất.

node_synthesizer: tổng hợp SQL + web + data engineer → answer + chart + followup
synthesizer_subgraph: StateGraph wrapper để main_graph compose vào
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph

from dbgpt_analyst.core.helpers import _get_llm, json_serial
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.events import PhaseEvent
from dbgpt_analyst.memory.memory_experiment import (
    distill_and_store_generic_experience,
    format_experiences_for_llm,
    recall_experiences,
)
from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.common.llm_factory import preferred_model_name
from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

logger = logging.getLogger(__name__)

from dbgpt_analyst.prompts.synthesizer_prompt import (
    SYNTHESIZER_SYSTEM_PROMPT,
    render_followup_prompt,
)

_CANIFA_SYSTEM_PROMPT = SYNTHESIZER_SYSTEM_PROMPT

_VALID_INTENTS = {"deep-dive", "pivot", "broaden", "statistical"}


# ── Node ──────────────────────────────────────────────────────────────────────

@observe(name="node_synthesizer")
async def node_synthesizer(state: MainAgentState, config: RunnableConfig = RunnableConfig()) -> dict[str, Any]:
    """Synthesizer Agent — tổng hợp kết quả SQL + web + data engineer → answer + chart."""
    _config = config or RunnableConfig()

    logger.info("Entering node_synthesizer")

    start_step = PhaseEvent(
        phase="insights",
        payload={"message": "📊 Synthesizer tổng hợp tất cả findings..."},
        status="running",
        agent_id="synthesizer_agent",
        agent_name="📊 Synthesizer"
    ).model_dump()

    question = state.get("question", "")
    generated_sql = state.get("generated_sql")
    query_results = state.get("query_results")
    selected_tables = state.get("selected_tables", [])
    anchor_table = state.get("anchor_table", "")
    web_findings = state.get("web_findings", [])
    error = state.get("error")

    # 1. Nếu có lỗi
    if error:
        error_msg = f"Rất tiếc, đã xảy ra lỗi khi truy vấn dữ liệu:\n\n```text\n{error}\n```"
        return {"answer": error_msg, "chart": None, "followup_questions": [], "steps": [start_step]}

    # 2. Xử lý dữ liệu Data Profile
    data_profile: dict[str, Any] = {}
    profile_text = ""
    if query_results:
        try:
            from dbgpt_analyst.analyst.profiler import format_profile_for_llm
            from dbgpt_analyst.analyst.profiler import profile as _compute_profile
            data_profile = _compute_profile(query_results, question)  # type: ignore
            profile_text = format_profile_for_llm(data_profile)
        except Exception:
            profile_text = json.dumps(query_results[:10], ensure_ascii=False, default=json_serial)[:3000]

    # 3. Tổng hợp Web Findings + DE Report
    web_text = ""
    if web_findings:
        web_text = "Kết quả từ Web Research:\n" + "\n".join(web_findings) + "\n\n"

    exp_log = state.get("exploration_log", [])
    if exp_log:
        exp_text = "\n".join([str(e.get("result", "")) for e in exp_log if e.get("result")])
        if exp_text:
            web_text += f"Chi tiết khám phá DB (Exploration Log):\n{exp_text[:1500]}\n\n"

    de_report: str = state.get("data_engineer_report", "") or ""
    if de_report:
        web_text += f"**Data Engineer Report:**\n{de_report[:1500]}\n\n"

    # 3.5. Hồi tưởng Kinh nghiệm (Experiential Memory)
    try:
        exp_rows = recall_experiences(query=question, agent_name="synthesizer_agent", limit=2)
        if exp_rows:
            experiences_text = format_experiences_for_llm(exp_rows)
            web_text += f"**Kinh nghiệm phân tích cũ:**\n{experiences_text}\n\n"
    except Exception as e:
        logger.warning("Synthesizer experience recall failed: %s", e)

    # 4. Sinh Chart
    # D2: ưu tiên display_type đã đồng-sinh cùng SQL (1 call). "table" = không vẽ
    chart_spec = None
    display_type = state.get("display_type")
    if query_results and display_type != "table":
        try:
            from dbgpt_analyst.domains.presentation.chart import build_chart_spec
            chart_hint = {"type": display_type} if display_type in ("bar", "line", "pie", "area") else None
            chart_spec = build_chart_spec(chart_hint, query_results, question)
        except Exception as e:
            logger.exception("Error building chart spec: %s", e)

    # 5. Gọi LLM sinh text
    if generated_sql or web_findings:
        join_text = ""
        if selected_tables and set(selected_tables) != {anchor_table}:
            join_text = f"Các bảng đã JOIN: {', '.join(selected_tables)}\n"

        from dbgpt_analyst.prompts import get_insight_prompt
        text_prompt = get_insight_prompt(
            question=question,
            selected_tables=selected_tables,
            generated_sql=generated_sql,
            profile_text=profile_text,
            web_text=web_text,
            assumptions=state.get("clarifier_assumptions", "") or ""
        )

        stream_llm = await _get_llm(state, streaming=True, json_mode=False)
        try:
            response = await stream_llm.ainvoke([
                SystemMessage(content=_CANIFA_SYSTEM_PROMPT),
                HumanMessage(content=text_prompt)
            ], config=config)
            full_answer = str(response.content)
        except Exception as e:
            logger.exception("Error calling synthesizer LLM")
            full_answer = f"Lỗi sinh câu trả lời: {e}"
    else:
        # Fallback (không có SQL/web data)
        steps_context = [s.get("message", "") for s in state.get("steps", []) if s.get("message")]
        exp_context = [str(e.get("result", "")) for e in state.get("exploration_log", [])]
        context_str = "\n".join(steps_context) + "\n" + "\n".join(exp_context)

        from dbgpt_analyst.prompts import get_fallback_insight_prompt
        text_prompt = get_fallback_insight_prompt(question=question, context_str=context_str)
        stream_llm = await _get_llm(state, streaming=True, json_mode=False)
        response = await stream_llm.ainvoke([
            SystemMessage(content=_CANIFA_SYSTEM_PROMPT),
            HumanMessage(content=text_prompt)
        ], config=config)
        full_answer = str(response.content)

    # 6. Sinh Followup Questions
    #    intent ∈ {deep-dive, pivot, broaden, statistical}
    followup_questions: list[dict[str, str]] = []
    try:
        current_user_id = (_config or {}).get("configurable", {}).get("user_id", "dev_user")
        followup_llm, _ = await create_llm_with_fallback(
            model_name=preferred_model_name(),
            user_id=current_user_id,
            streaming=False,
            json_mode=False,
        )
        profile_summary = profile_text[:600] if profile_text else ""
        ans_preview = str(full_answer)[:400]
        sql_preview = str(generated_sql or "")[:300]
        followup_prompt = render_followup_prompt(
            question, profile_summary or ans_preview, sql_preview
        )
        resp = await followup_llm.ainvoke([HumanMessage(content=followup_prompt)])
        raw = str(resp.content).strip()
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            parsed_fq = json.loads(m.group())
            for item in parsed_fq.get("questions", []):
                if isinstance(item, dict) and item.get("text"):
                    intent = str(item.get("intent", "deep-dive")).strip().lower()
                    if intent not in _VALID_INTENTS:
                        intent = "deep-dive"
                    followup_questions.append({"text": str(item["text"]).strip(), "intent": intent})
                elif isinstance(item, str) and item.strip():
                    followup_questions.append({"text": item.strip(), "intent": "deep-dive"})
    except Exception as _fe:
        logger.debug("AI followup generation failed: %s", _fe)

    if not followup_questions:
        words = question.split()
        last_kw = words[-1] if words else "kết quả"
        followup_questions = [
            {"text": f"Phân tích chi tiết hơn về {last_kw}?", "intent": "deep-dive"},
            {"text": "So sánh với kỳ trước như thế nào?", "intent": "pivot"},
            {"text": "Yếu tố nào ảnh hưởng nhiều nhất đến kết quả này?", "intent": "statistical"},
        ]

    done_step = PhaseEvent(
        phase="insights",
        payload={"message": "✅ Phân tích hoàn tất!"},
        status="done",
        agent_id="synthesizer_agent",
        agent_name="📊 Synthesizer"
    ).model_dump()

    # ── Rút Kinh Nghiệm (Fire-and-forget) ──
    asyncio.create_task(
        distill_and_store_generic_experience(
            agent_name="synthesizer_agent",
            task_input=question,
            task_output=full_answer,
            status="success",
            context_data={"tables": selected_tables}
        )
    )

    return {
        "answer": full_answer,
        "chart": chart_spec,
        "followup_questions": followup_questions,
        "steps": [start_step, done_step]
    }


# ── Subgraph ──────────────────────────────────────────────────────────────────

def build_synthesizer_subgraph() -> Any:
    """Build and compile the Synthesizer subgraph."""
    workflow = StateGraph(MainAgentState)
    workflow.add_node("synthesizer", node_synthesizer)
    workflow.set_entry_point("synthesizer")
    workflow.add_edge("synthesizer", END)
    return workflow.compile()


synthesizer_subgraph = build_synthesizer_subgraph()
