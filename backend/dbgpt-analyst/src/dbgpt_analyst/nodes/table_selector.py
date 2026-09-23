"""api/sql/nodes/table_selector.py — Node: table_selector."""
import logging as _logging
import re
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.domains.analysis.explore_tools import _tool_list_tables
from dbgpt_analyst.core.helpers import _get_llm, parse_llm_xml
from dbgpt_analyst.prompts import get_table_selector_prompt
from dbgpt_analyst.events import (
    ErrorEvent,
    JoinPathEvent,
    TableConsideredEvent,
    TableSelectedEvent,
)
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.adapters.bi_platform import get_active_connection
from dbgpt_analyst.common.langfuse_client import observe

logger = _logging.getLogger(__name__)

_SYSTEM_TABLE_PREFIXES = (
    "analytic_", "ai_research_", "agent_", "checkpoint_", "dashboard_",
    "datasource_", "excel_", "metric_", "query_", "report", "schema_",
    "trace_", "audit_", "named_", "sync_", "answer_feed", "localdb_",
    "alembic", "conversation", "document", "knowledge", "skill",
)

def _list_tables_for_sources(source_ids: list[int]) -> list[str]:
    """List all tables across the given enabled source_ids (cross-DB scope)."""
    wanted = {int(s) for s in source_ids}
    tables: list[str] = []
    for c, c_db_type, sid, _sname in get_enabled_connections(read_only=True):
        try:
            if int(sid) in wanted:
                for t in (_tool_list_tables(c, c_db_type) or []):
                    if t not in tables:
                        tables.append(t)
        finally:
            try:
                c.close()
            except Exception:
                pass
    return tables

def _list_business_tables_from_internal() -> list[str]:
    """List business/user-data tables from the internal Postgres, excluding system tables."""
    conn = None
    try:
        conn, db_type = get_active_connection()
        all_tables = _tool_list_tables(conn, db_type) or []
        return [
            t for t in all_tables
            if not any(t.lower().startswith(p) for p in _SYSTEM_TABLE_PREFIXES)
        ]
    except Exception:
        return []
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

@observe(name="node_table_selector")
async def node_table_selector(state: MainAgentState, config: RunnableConfig) -> dict[str, Any]:
    """Node: Decide which tables to JOIN based on the anchor table and the question."""
    question = state["question"]
    anchor_table = state["anchor_table"]
    allowed_tables = state.get("allowed_tables", [])
    source_ids = state.get("source_ids", []) or []
    session_history = state.get("session_history", "")

    # --- Auto-detect mode: no anchor table specified ---
    if not anchor_table:
        try:
            if allowed_tables:
                all_tables = list(dict.fromkeys(allowed_tables))
            elif source_ids:
                all_tables = _list_tables_for_sources(source_ids)
            else:
                all_tables = _list_business_tables_from_internal()
                if not all_tables:
                    from dbgpt_analyst.memory.memory_schema import select_relevant_tables
                    _schema_text, _map = select_relevant_tables(question, top_k=20)
                    all_tables = list(_map.keys()) if _map else []
                if not all_tables:
                    conn, db_type = get_active_connection()
                    try:
                        all_tables = _tool_list_tables(conn, db_type)
                    finally:
                        try:
                            conn.close()
                        except Exception:
                            pass

            if not all_tables:
                step = TableSelectedEvent(payload={"selected_tables": [], "message": "Không tìm thấy bảng nào trong database."}).model_dump()
                return {"selected_tables": [], "steps": [step]}

            if len(all_tables) <= 3:
                step = TableSelectedEvent(
                    payload={
                        "selected_tables": all_tables,
                        "mode": "scoped",
                        "message": f"Đã chọn {len(all_tables)} bảng theo phạm vi: {', '.join(all_tables)}."
                    }
                ).model_dump()
                return {"selected_tables": all_tables, "anchor_table": all_tables[0], "steps": [step]}

            llm = await _get_llm(state, streaming=True, json_mode=False)
            prompt = get_table_selector_prompt(
                question=question,
                all_tables=all_tables,
                session_history=session_history
            )
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            res_xml = parse_llm_xml(response.content)
            reasoning = res_xml.get("reasoning", "")
            tables_str = res_xml.get("selected_tables", "")
            selected = re.findall(r"<table>(.*?)</table>", tables_str, re.DOTALL)
            if not selected:
                selected = all_tables[:1]

            final_list = [t for t in selected if t in all_tables] or all_tables[:1]

            step = TableSelectedEvent(
                payload={
                    "selected_tables": final_list,
                    "reasoning": reasoning,
                    "mode": "auto_detect",
                    "message": f"Auto-detect: đã chọn bảng {', '.join(final_list)} từ {len(all_tables)} bảng. {reasoning}"
                }
            ).model_dump()
            return {"selected_tables": final_list, "anchor_table": final_list[0], "steps": [step]}
        except Exception as e:
            logger.exception("Error in auto-detect table selection")
            step = TableSelectedEvent(payload={"selected_tables": [], "message": f"Lỗi auto-detect bảng: {e}"}).model_dump()
            return {"selected_tables": [], "steps": [step]}

    # --- Normal mode: anchor table specified ---
    if not allowed_tables or len(allowed_tables) <= 1:
        step = TableSelectedEvent(
            payload={
                "selected_tables": [anchor_table],
                "message": f"Chỉ sử dụng bảng gốc {anchor_table} do giới hạn quyền truy cập."
            }
        ).model_dump()
        return {"selected_tables": [anchor_table], "steps": [step]}

    model_name = preferred_model_name()

    current_user_id = config.get("configurable", {}).get("user_id", "dev_user") if config else "dev_user"

    llm, _ = await create_llm_with_fallback(
        model_name=model_name,
        user_id=current_user_id,
        streaming=True,
        json_mode=False
    )

    prompt = get_table_selector_prompt(
        question=question,
        all_tables=allowed_tables,
        anchor_table=anchor_table,
        session_history=session_history
    )

    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        res_xml = parse_llm_xml(response.content)
        reasoning = res_xml.get("reasoning", "")
        tables_str = res_xml.get("selected_tables", "")
        selected_tables = re.findall(r"<table>(.*?)</table>", tables_str, re.DOTALL)
        if not selected_tables:
            selected_tables = [anchor_table]

        final_selected = set([anchor_table])
        for t in selected_tables:
            if t in allowed_tables or t == anchor_table:
                final_selected.add(t)

        final_list = list(final_selected)

        msg = f"Đã chọn các bảng: {', '.join(final_list)} để phân tích."
        steps_out = []
        if len(final_list) > 1:
            msg += f" Lý do JOIN: {reasoning}"
            join_evt = JoinPathEvent(payload={"path": final_list})
            steps_out.append(join_evt.model_dump())

        # Thay vì synthetic TableConsideredEvent trong streamer, emit trực tiếp ở đây
        for t in final_list:
            steps_out.append(TableConsideredEvent(payload={"table": str(t), "reason": "selected"}).model_dump())

        return {"selected_tables": final_list, "steps": steps_out}
    except Exception:
        logger.exception("Error in node_table_selector")
        return {"selected_tables": [anchor_table], "steps": [ErrorEvent(payload={"error": "Lỗi khi chọn bảng, fallback về bảng gốc."}).model_dump()]}
