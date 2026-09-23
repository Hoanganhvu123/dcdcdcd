"""api/sql/nodes/schema_resolver.py — Node: resolve_schema."""
import logging as _logging
from typing import Any

from dbgpt_analyst.domains.analysis.explore_tools import _tool_list_tables
from dbgpt_analyst.memory import (
    describe_schema_with_context,
    format_experiences_for_llm,
    format_recall_content,
    get_descriptions,
    recall_experiences,
)
from dbgpt_analyst.memory import (
    recall_queries as memory_recall,
)
from dbgpt_analyst.events import ErrorEvent, MemoryRecalledEvent, SchemaEnrichedEvent, WorkflowTaskEvent
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.adapters.bi_platform import get_active_connection, get_table_columns
from dbgpt_analyst.adapters.bi_platform import get_active_instructions
from dbgpt_analyst.adapters.bi_platform import get_confirmed_relationships
from dbgpt_analyst.libs.bi.connections import get_enabled_connections
from dbgpt_analyst.libs.bi.schema_cache import resolve_table_source
from dbgpt_analyst.common.langfuse_client import observe

logger = _logging.getLogger(__name__)

# Constants from planning.py
_MAX_COLS_PER_TABLE = 25
_COMPACT_MAX_COLS = 15
_FULL_MAX_COLS = 40

_SCHEMA_FULL_THRESHOLD = 30_000  # chars — dưới ngưỡng này, bỏ cắt cột, nhét toàn bộ schema

_COMPACT_KEYWORDS = {
    "tong", "total", "count", "dem", "hom_nay", "today", "hom nay",
    "sum", "trung binh", "average", "avg", "max", "min", "nhieu nhat",
    "it nhat", "bao nhieu", "how many", "how much",
}

_FULL_KEYWORDS = {
    "so sanh", "compare", "xu huong", "trend", "breakdown", "phan tich",
    "analysis", "chi tiet", "detail", "join", "ket hop", "lien quan",
    "relate", "qua cac", "across", "theo tung", "per each",
    "day over day", "mom", "yoy", "cohort", "segment",
}

def select_context_mode(question: str, retry_count: int = 0) -> str:
    if retry_count > 0:
        return "full"
    q_lower = question.lower()
    if any(kw in q_lower for kw in _FULL_KEYWORDS):
        return "full"
    if any(kw in q_lower for kw in _COMPACT_KEYWORDS):
        return "compact"
    return "standard"

def _score_col_relevance(col_line: str, q_tokens: set[str]) -> int:
    low = col_line.lower()
    return sum(1 for t in q_tokens if len(t) > 2 and t in low)

def _filter_top_k_columns(col_lines: list[str], question: str, max_cols: int = _MAX_COLS_PER_TABLE) -> list[str]:
    if len(col_lines) <= max_cols:
        return col_lines
    q_tokens = set(question.lower().split())
    scored = sorted(col_lines, key=lambda l: _score_col_relevance(l, q_tokens), reverse=True)
    return scored[:max_cols]

@observe(name="node_resolve_schema")
async def node_resolve_schema(state: MainAgentState) -> dict[str, Any]:
    """Node: Fetch database schemas of all SELECTED tables."""
    try:
        selected_tables = state.get("selected_tables", [])
        if not selected_tables and state.get("anchor_table"):
            selected_tables = [state["anchor_table"]]

        if not selected_tables:
            try:
                conn_tmp, db_type_tmp = get_active_connection()
                try:
                    selected_tables = _tool_list_tables(conn_tmp, db_type_tmp)[:5]
                finally:
                    try:
                        conn_tmp.close()
                    except Exception:
                        pass
            except Exception:
                pass

        if not selected_tables:
            return {
                "error": "Không tìm thấy bảng nào để phân tích.",
            "steps": [ErrorEvent(payload={"error": "Không tìm thấy bảng nào để phân tích."}, phase="resolving").model_dump()],
                "retry_count": state.get("retry_count", 0) + 1
            }

        conn, db_type = get_active_connection()
        source_conns: dict[int, tuple] = {}
        try:
            for c, c_db_type, sid, sname in get_enabled_connections(read_only=True):
                if sid in source_conns:
                    try:
                        c.close()
                    except Exception:
                        pass
                    continue
                source_conns[sid] = (c, c_db_type, sname)
        except Exception as e:
            logger.warning(f"Could not enumerate enabled connections: {e}")

        schema_texts = []
        map_qualified = {}
        ctx_mode = select_context_mode(state["question"], state.get("retry_count", 0))
        _ctx_max_cols = {"compact": _COMPACT_MAX_COLS, "standard": _MAX_COLS_PER_TABLE, "full": _FULL_MAX_COLS}[ctx_mode]

        _table_col_lines: list[tuple[str, list[str]]] = []
        for t in selected_tables:
            try:
                src = resolve_table_source(t)
                if src and src.get("source_id") in source_conns:
                    sid = src["source_id"]
                    t_conn, t_db_type, t_sname = source_conns[sid]
                    raw_table = src.get("raw_table", t)
                    columns = get_table_columns(t_conn, t_db_type, raw_table)
                    map_qualified[t] = {"source_id": sid, "db_type": t_db_type, "raw_table": raw_table, "source_name": t_sname}
                else:
                    columns = get_table_columns(conn, db_type, t)
                    sid = src.get("source_id", 0) if src else 0
                    sname = src.get("source_name", "Local DB") if src else "Local DB"
                    map_qualified[t] = {"source_id": sid, "db_type": db_type, "raw_table": t, "source_name": sname}

                col_lines = []
                for col in columns:
                    col_name = col["name"]
                    col_type = col["type"]
                    desc = col.get("description", "")
                    dttm = " ⏱temporal" if col.get("is_dttm") else ""
                    if ctx_mode == "compact":
                        col_lines.append(f"  - `{col_name}`{dttm}")
                    else:
                        col_lines.append(f"  - Column: `{col_name}` (type: {col_type}){dttm} | Description: {desc}")

                # Giữ nguyên (chưa cắt) — quyết định cắt hay không dựa trên tổng
                # kích thước schema của TẤT CẢ bảng đã chọn, sau vòng lặp này.
                _table_col_lines.append((t, col_lines))
            except Exception as ex:
                logger.warning(f"Could not load schema for {t}: {ex}")
                continue

        # Hybrid threshold (theo WrenAI's SCHEMA_DESCRIBE_THRESHOLD): nếu tổng
        # schema của các bảng đã chọn còn nhỏ, nhét full cột — không cắt top-k
        # theo điểm liên quan, tránh bỏ sót cột JOIN/FK không "giống" câu hỏi
        # về mặt từ khóa. Chỉ cắt khi thật sự vượt ngưỡng.
        _raw_total_len = sum(len("\n".join(cl)) for _, cl in _table_col_lines)
        _use_full_columns = _raw_total_len <= _SCHEMA_FULL_THRESHOLD

        for t, col_lines in _table_col_lines:
            if not _use_full_columns:
                col_lines = _filter_top_k_columns(col_lines, state["question"], max_cols=_ctx_max_cols)
            src_label = map_qualified[t]["source_name"]
            schema_texts.append(f"Table `{t}` (source: {src_label}):\n" + "\n".join(col_lines))

        try:
            conn.close()
        except Exception:
            pass
        for c, _dbt, _sn in source_conns.values():
            try:
                c.close()
            except Exception:
                pass

        schema_text = "\n\n".join(schema_texts)
        steps = []
        step = WorkflowTaskEvent(payload={"schema": schema_text, "context_mode": ctx_mode, "message": f"Đã nạp cấu trúc của {len(selected_tables)} bảng (mode: {ctx_mode})."}, phase="resolving", status="done").model_dump()
        steps.append(step)

        golden_sqls_data = []
        golden_text = ""
        try:
            golden_sqls_data = memory_recall(
                state["question"],
                limit=3,
                table_names=selected_tables,
            )
            if golden_sqls_data:
                golden_text = format_recall_content(golden_sqls_data)
                recall_event = MemoryRecalledEvent(payload={"queries": golden_sqls_data, "count": len(golden_sqls_data), "message": f"Tìm thấy {len(golden_sqls_data)} câu SQL mẫu từ bộ nhớ."}, phase="resolving")
                steps.append(recall_event.model_dump())
        except Exception as e:
            logger.warning(f"Memory recall failed (non-fatal): {e}")

        experiences_text = ""
        try:
            exp_rows = recall_experiences(state["question"], table_names=selected_tables, limit=2)
            if exp_rows:
                experiences_text = format_experiences_for_llm(exp_rows)
                exp_step = MemoryRecalledEvent(payload={"count": len(exp_rows), "type": "experiences", "message": f"Tìm thấy {len(exp_rows)} bài học kinh nghiệm tương tự."}, phase="resolving").model_dump()
                steps.append(exp_step)
        except Exception as e:
            logger.warning("Experience recall failed (non-fatal): %s", e)

        schema_descriptions = []
        try:
            for t in selected_tables:
                descs = get_descriptions(t)
                if descs:
                    schema_descriptions.extend(descs)
                    enrich_event = SchemaEnrichedEvent(payload={"table": t, "descriptions_count": len(descs), "message": f"Bảng {t}: thêm {len(descs)} mô tả nghiệp vụ."}, phase="resolving")
                    steps.append(enrich_event.model_dump())

            if schema_descriptions:
                schema_text = describe_schema_with_context(schema_text, selected_tables)
        except Exception as e:
            logger.warning(f"Schema enrichment failed (non-fatal): {e}")

        docs_text = ""
        if experiences_text:
            docs_text = experiences_text + "\n\n" + docs_text

        try:
            active_instructions = get_active_instructions(state.get("question", ""))
            if active_instructions:
                lines = [
                    inst.get("instruction") or str(inst) if isinstance(inst, dict) else str(inst)
                    for inst in active_instructions
                ]
                instructions_str = "Quy định nghiệp vụ công ty:\n- " + "\n- ".join(lines)
                docs_text = instructions_str + "\n\n" + docs_text
        except Exception as e:
            logger.warning(f"Could not load business instructions: {e}")

        try:
            rels = get_confirmed_relationships()
            if rels:
                rel_lines = [
                    f"{r['from_table']}.{r['from_column']} → {r['to_table']}.{r['to_column']} ({r.get('join_type') or 'LEFT'} JOIN)"
                    for r in rels
                    if "from_table" in r and "to_table" in r and "from_column" in r and "to_column" in r
                ]
                if rel_lines:
                    rel_text = "## JOIN Relationships (use these when joining tables)\n" + "\n".join(rel_lines)
                    docs_text = rel_text + "\n\n" + docs_text
        except Exception as e:
            logger.warning(f"Could not load confirmed relationships: {e}")

        return {
            "schemas_text": schema_text,
            "map_qualified": map_qualified,
            "db_type": db_type,
            "steps": steps,
            "retry_count": 0,
            "error": None,
            "golden_sqls": golden_text,
            "golden_sqls_data": golden_sqls_data,
            "schema_descriptions": schema_descriptions,
            "business_docs": docs_text,
        }
    except Exception as e:
        logger.exception("Error in node_resolve_schema")
        return {
            "error": f"Lỗi nạp cấu trúc cơ sở dữ liệu: {e!s}",
            "steps": [ErrorEvent(payload={"error": f"Lỗi nạp cấu trúc cơ sở dữ liệu: {e!s}"}, phase="resolving").model_dump()],
            "retry_count": state.get("retry_count", 0) + 1
        }
