"""tools/explore_toolkit.py — Native LangChain @tool bindings cho DB exploration.

Chuyển đổi các hàm explore từ explore_tools.py thành @tool decorators.
Factory `build_explore_tools()` trả về danh sách tool đã bind connection info
dưới dạng closure, sẵn sàng cho `create_react_agent()`.
"""

from datetime import date, datetime
from decimal import Decimal
import json
import logging
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from dbgpt_analyst.domains.analysis.explore_tools import (
    _tool_describe_table,
    _tool_find_foreign_keys,
    _tool_profile_column,
    _tool_run_sql,
    _tool_sample_rows,
)
from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.libs.bi.federation import run_federated_sql

logger = logging.getLogger(__name__)


def _json_serial(obj: Any) -> Any:
    """Bộ chuyển đổi JSON an toàn cho kết quả tool (date, Decimal, bytes...)."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (bytes, bytearray)):
        return obj.decode("utf-8", "replace")
    if isinstance(obj, (set, frozenset)):
        return list(obj)
    return str(obj)


def _safe_json(result: Any) -> str:
    """Serialize kết quả tool thành chuỗi JSON an toàn."""
    return json.dumps(result, ensure_ascii=False, default=_json_serial)


def build_explore_tools(
    source_conns: dict[int, tuple],
    selected_tables: list[str],
    db_types: dict[str, str],
    table_conn_map: dict[str, tuple] | None = None,
    fed_sources: dict[str, dict] | None = None,
    active_conn: Any = None,
    active_db_type: str | None = None,
) -> list:
    """Build danh sách LangChain tools đã bind connection info."""
    _fed = fed_sources or {}
    _distinct_sids = {s.get("source_id") for s in _fed.values()}
    multi_source = len(_distinct_sids) > 1
    _table_conn_map = table_conn_map or {}

    def _conn_for(table_name: str = "") -> tuple:
        tbl = table_name.lower()
        if tbl and tbl in _table_conn_map:
            return _table_conn_map[tbl]
        if _table_conn_map:
            return next(iter(_table_conn_map.values()))
        return (active_conn, active_db_type or "postgres", table_name)

    # ── Tool definitions sử dụng closure variables ─────────────────────────

    @tool
    @observe(name="explore_tool_list_tables")
    def list_tables(*, config: RunnableConfig = None) -> str:
        """Liệt kê tên các bảng/collections khả dụng trong database đã chọn."""
        return _safe_json(selected_tables)

    @tool
    @observe(name="explore_tool_describe_table")
    def describe_table(table: str, *, config: RunnableConfig = None) -> str:
        """Trả về thông tin cột (tên, kiểu dữ liệu) của một bảng cụ thể."""
        try:
            conn, db_type, raw_table = _conn_for(table)
            result = _tool_describe_table(conn, db_type, raw_table)
            return _safe_json(result)
        except Exception as e:
            return _safe_json({"error": str(e)})

    @tool
    @observe(name="explore_tool_sample_rows")
    def sample_rows(table: str, limit: int = 5, *, config: RunnableConfig = None) -> str:
        """Lấy vài dòng dữ liệu mẫu từ bảng để hiểu cấu trúc dữ liệu thực tế."""
        try:
            conn, db_type, raw_table = _conn_for(table)
            result = _tool_sample_rows(conn, raw_table, limit=limit, db_type=db_type)
            return _safe_json(result)
        except Exception as e:
            return _safe_json({"error": str(e)})

    @tool
    @observe(name="explore_tool_profile_column")
    def profile_column(table: str, column: str, *, config: RunnableConfig = None) -> str:
        """Thống kê nhanh cho một cột: distinct count, null count, min/max."""
        try:
            conn, db_type, raw_table = _conn_for(table)
            result = _tool_profile_column(conn, raw_table, column, db_type=db_type)
            return _safe_json(result)
        except Exception as e:
            return _safe_json({"error": str(e)})

    @tool
    @observe(name="explore_tool_find_foreign_keys")
    def find_foreign_keys(table: str, *, config: RunnableConfig = None) -> str:
        """Tìm các mối quan hệ foreign key của bảng (hiện chỉ hỗ trợ Postgres)."""
        try:
            conn, db_type, raw_table = _conn_for(table)
            result = _tool_find_foreign_keys(conn, db_type, raw_table)
            return _safe_json(result)
        except Exception as e:
            return _safe_json({"error": str(e)})

    @tool
    @observe(name="explore_tool_run_sql")
    def run_sql(sql: str, *, config: RunnableConfig = None) -> str:
        """Chạy câu SQL SELECT đọc dữ liệu (chỉ đọc, không cho INSERT/UPDATE/DELETE)."""
        try:
            if multi_source and sql:
                fed = run_federated_sql(sql, _fed, limit=50)
                result = fed.get("rows", fed)
                return _safe_json(result)

            conn, db_type, _ = _conn_for("")
            result = _tool_run_sql(conn, sql, db_type=db_type)
            return _safe_json(result)
        except Exception as e:
            return _safe_json({"error": str(e)})

    return [list_tables, describe_table, sample_rows, profile_column, find_foreign_keys, run_sql]
