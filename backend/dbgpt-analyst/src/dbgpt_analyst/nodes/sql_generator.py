"""nodes/sql_generator.py — Node: generate_sql."""

import logging as _logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.core.cache import (
    get_cached_generation,
    make_gen_cache_key,
    set_cached_generation,
)
from dbgpt_analyst.core.helpers import parse_llm_xml
from dbgpt_analyst.events.base import emit_custom
from dbgpt_analyst.prompts import get_sql_generator_prompt
from dbgpt_analyst.events import ErrorEvent, WorkflowTaskEvent
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.common.llm_factory import preferred_model_name
from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

logger = _logging.getLogger(__name__)


@observe(name="node_generate_sql")
async def node_generate_sql(state: MainAgentState, config: RunnableConfig) -> dict[str, Any]:
    """Node: Ask LLM to generate the SQL SELECT query (possibly with JOINs)."""
    question = state["question"]
    schema_text = state["schemas_text"]
    selected_tables = state.get("selected_tables", [])
    error = state.get("error")
    retry_count = state.get("retry_count", 0)
    session_history = state.get("session_history", "")
    golden_sqls = state.get("golden_sqls", "")
    business_docs = state.get("business_docs", "")

    # DB-N3: cache bước sinh SQL. Chỉ tra/lưu ở lần sinh "sạch" (không phải retry lỗi).
    _is_fresh_gen = not (error and retry_count > 0)
    _cache_key = make_gen_cache_key(question, schema_text, selected_tables) if _is_fresh_gen else None
    if _cache_key:
        _cached = get_cached_generation(_cache_key)
        if _cached is not None:
            logger.info("node_generate_sql: cache HIT (DB-N3) — bỏ qua gọi LLM")
            result = dict(_cached)
            step = WorkflowTaskEvent(
                payload={
                    "sql": result.get("generated_sql"),
                    "reasoning": None,
                    "direct_response": result.get("answer"),
                    "display_type": result.get("display_type"),
                    "message": "Tái sử dụng SQL đã sinh trước đó (cache) — trả lời tức thì."
                },
                phase="generating",
                status="done"
            ).model_dump()
            result["steps"] = [step]
            return result

    model_name = preferred_model_name()

    # Lấy user_id thực từ config (tránh hardcode)
    current_user_id = config.get("configurable", {}).get("user_id", "dev_user")

    sql_llm, _ = await create_llm_with_fallback(
        model_name=model_name,
        user_id=current_user_id,
        streaming=True,
        json_mode=False
    )

    prompt = get_sql_generator_prompt(
        schema_text=schema_text,
        business_docs=business_docs,
        golden_sqls=golden_sqls,
        session_history=session_history,
        sql_reasoning_plan=state.get("sql_reasoning_plan", ""),
        retry_history=state.get("retry_history"),
    )

    messages = [SystemMessage(content=prompt)]

    if error and retry_count > 0:
        critic_hint = state.get("critic_fix_hint")
        if critic_hint:
            messages.append(HumanMessage(content=f"Truy vấn trước bị lỗi logic/nghiệp vụ: {error}.\nGợi ý sửa từ Critic: {critic_hint}\nVui lòng viết lại câu lệnh SQL chính xác hơn theo định hướng trên."))
        else:
            messages.append(HumanMessage(content=f"Truy vấn trước đó của bạn bị lỗi CSDL: {error}. Vui lòng viết lại câu lệnh SQL khác chính xác hơn."))
    else:
        messages.append(HumanMessage(content=f"Câu hỏi của người dùng: {question}"))

    try:
        import asyncio

        # Notify UI about CSC
        emit_custom(
            "sql_plan_delta",
            {"delta": "\n\n> 🤖 **Self-Consistency Active**: Đang sinh song song 3 phương án SQL để chọn ra ứng viên tốt nhất (Majority Vote)..."},
        )

        async def _silent_call():
            try:
                # Dùng ainvoke cho các call ngầm
                resp = await sql_llm.ainvoke(messages)
                return str(resp.content)
            except Exception as e:
                logger.warning(f"Silent LLM call failed: {e}")
                return ""

        stream_buffer = ""
        parsed_cursor = 0
        active_xml_node = "none"

        # Khởi chạy 2 luồng ngầm song song với luồng stream chính
        task_2 = asyncio.create_task(_silent_call())
        task_3 = asyncio.create_task(_silent_call())

        async for chunk in sql_llm.astream(messages, config):
            if not chunk.content:
                continue
            text_chunk = chunk.content if isinstance(chunk.content, str) else "".join(c.get("text", "") if isinstance(c, dict) else str(c) for c in chunk.content)
            if not text_chunk:
                continue
            stream_buffer += text_chunk

            while parsed_cursor < len(stream_buffer):
                if active_xml_node == "none":
                    reasoning_tag_pos = stream_buffer.find("<reasoning>", parsed_cursor)
                    sql_tag_pos = stream_buffer.find("<sql>", parsed_cursor)

                    next_tag_name = ""
                    closest_tag_pos = -1
                    if reasoning_tag_pos != -1 and sql_tag_pos != -1:
                        if reasoning_tag_pos < sql_tag_pos:
                            next_tag_name, closest_tag_pos = "reasoning", reasoning_tag_pos
                        else:
                            next_tag_name, closest_tag_pos = "sql", sql_tag_pos
                    elif reasoning_tag_pos != -1:
                        next_tag_name, closest_tag_pos = "reasoning", reasoning_tag_pos
                    elif sql_tag_pos != -1:
                        next_tag_name, closest_tag_pos = "sql", sql_tag_pos

                    if next_tag_name == "reasoning":
                        active_xml_node = "reasoning"
                        parsed_cursor = closest_tag_pos + 11
                    elif next_tag_name == "sql":
                        active_xml_node = "sql"
                        parsed_cursor = closest_tag_pos + 5
                    else:
                        break

                elif active_xml_node == "reasoning":
                    end_idx = stream_buffer.find("</reasoning>", parsed_cursor)
                    if end_idx != -1:
                        delta = stream_buffer[parsed_cursor:end_idx]
                        if delta:
                            emit_custom("thinking_delta", {"delta": delta})
                        parsed_cursor = end_idx + 12
                        active_xml_node = "none"
                    else:
                        safe_end = len(stream_buffer) - 15
                        if safe_end > parsed_cursor:
                            delta = stream_buffer[parsed_cursor:safe_end]
                            emit_custom("thinking_delta", {"delta": delta})
                            parsed_cursor = safe_end
                        break

                elif active_xml_node == "sql":
                    end_idx = stream_buffer.find("</sql>", parsed_cursor)
                    if end_idx != -1:
                        delta = stream_buffer[parsed_cursor:end_idx]
                        if delta:
                            emit_custom("sql_delta", {"delta": delta})
                        parsed_cursor = end_idx + 6
                        active_xml_node = "none"
                    else:
                        safe_end = len(stream_buffer) - 15
                        if safe_end > parsed_cursor:
                            delta = stream_buffer[parsed_cursor:safe_end]
                            emit_custom("sql_delta", {"delta": delta})
                            parsed_cursor = safe_end
                        break

        # Đợi 2 luồng ngầm hoàn thành
        res_2, res_3 = await asyncio.gather(task_2, task_3)

        res_xml_1 = parse_llm_xml(stream_buffer)
        res_xml_2 = parse_llm_xml(res_2) if res_2 else {}
        res_xml_3 = parse_llm_xml(res_3) if res_3 else {}

        # Majority Vote & LLM-as-judge Logic
        def normalize_sql(s):
            return s.strip().lower().replace('\n', ' ').replace('\r', '').replace(' ', '') if s else ""

        cands = [res_xml_1, res_xml_2, res_xml_3]
        unique_sqls = []
        unique_cands = []
        for c in cands:
            sql_val = c.get("sql", "").strip()
            if not sql_val or sql_val.lower() in ["null", "none", ""]:
                continue
            norm = normalize_sql(sql_val)
            if not any(normalize_sql(ex) == norm for ex in unique_sqls):
                unique_sqls.append(sql_val)
                unique_cands.append(c)

        best_cand = res_xml_1
        if len(unique_cands) == 1:
            best_cand = unique_cands[0]
            logger.info("Self-Consistency: All candidates agree on the same SQL.")
        elif len(unique_cands) > 1:
            # Dùng LLM-as-judge để chấm điểm
            from dbgpt_analyst.prompts.critic_prompt import render_sql_judge_prompt
            judge_prompt = render_sql_judge_prompt(schema_text, question, unique_cands)
            
            try:
                # Thông báo UI đang gọi Judge
                emit_custom(
                    "sql_plan_delta",
                    {"delta": "\n\n> ⚖️ **LLM-as-judge**: Các luồng sinh ra kết quả khác nhau. Đang gọi Trọng tài LLM để đánh giá và chọn câu SQL tốt nhất..."},
                )
                
                # Gọi LLM
                judge_resp = await sql_llm.ainvoke([SystemMessage(content=judge_prompt)])
                judge_ans = str(judge_resp.content).strip()
                
                selected_idx = 0
                for i in range(len(unique_cands)):
                    if str(i+1) in judge_ans:
                        selected_idx = i
                        break
                
                best_cand = unique_cands[selected_idx]
                
                if selected_idx != 0:
                    logger.info(f"Self-Consistency: LLM Judge selected candidate {selected_idx+1}.")
                    emit_custom(
                        "sql_plan_delta",
                        {"delta": f"\n\n> ✅ **LLM-as-judge**: Trọng tài đã chọn phương án SQL thứ {selected_idx+1} làm kết quả tối ưu nhất!"},
                    )
            except Exception as e:
                logger.warning(f"LLM Judge failed: {e}. Fallback to candidate 1.")
                best_cand = unique_cands[0]


        generated_sql = best_cand.get("sql", "").strip()
        if generated_sql.lower() in ["null", "none", ""]:
            generated_sql = None

        direct_resp = best_cand.get("direct_response", "").strip()
        if direct_resp.lower() in ["null", "none", ""]:
            direct_resp = None

        reasoning = best_cand.get("reasoning", "").strip()

        # D2: co-generated chart type (display_type) — sanitize to allowed set.
        _ALLOWED_DISPLAY_TYPES = {"bar", "line", "pie", "area", "table"}
        raw_display = (best_cand.get("display_type") or "").strip().lower()
        cleaned_display = raw_display.strip("`'\"*[] ")
        tokens = cleaned_display.split()
        display_type = tokens[0] if tokens else None
        if display_type not in _ALLOWED_DISPLAY_TYPES:
            display_type = None
        if not generated_sql:
            display_type = None

        step_msg = f"Đã lập kế hoạch truy vấn và sinh mã SQL. Lý do: {reasoning}"
        if not generated_sql:
            step_msg = "Xác định câu hỏi không cần truy vấn SQL, chuẩn bị phản hồi trực tiếp."
        elif display_type:
            step_msg += f" (Biểu đồ đề xuất: {display_type})"

        step = WorkflowTaskEvent(
            payload={
                "message": step_msg,
                "sql": generated_sql,
                "reasoning": reasoning,
                "direct_response": direct_resp,
                "display_type": display_type,
            },
            phase="generating",
            status="done"
        ).model_dump()

        result = {
            "generated_sql": generated_sql,
            "answer": direct_resp,
            "display_type": display_type,
            "steps": [step],
            "error": None
        }
        if _cache_key:
            try:
                set_cached_generation(_cache_key, {
                    "generated_sql": generated_sql,
                    "answer": direct_resp,
                    "display_type": display_type,
                    "error": None,
                })
            except Exception as _ce:
                logger.debug("set_cached_generation bỏ qua: %s", _ce)
        return result
    except Exception as e:
        logger.exception("Error in node_generate_sql")
        return {
            "error": f"Lỗi sinh câu lệnh SQL: {e!s}",
            "steps": [ErrorEvent(payload={"error": f"Lỗi sinh câu lệnh SQL: {e!s}"}, phase="generating").model_dump()],
            "retry_count": retry_count + 1
        }
