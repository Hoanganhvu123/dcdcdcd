"""api/sql/nodes_execution.py — Node execute_sql + cache + safety limits."""
import logging as _logging
import time
from typing import Any

logger = _logging.getLogger(__name__)

# Import DB Adapters
from dbgpt_analyst.adapters.db_engine.base import BaseEngineAdapter
from dbgpt_analyst.adapters.db_engine.postgres import PostgresAdapter
from dbgpt_analyst.core.helpers import log_query_lineage
from dbgpt_analyst.events import ErrorEvent, WorkflowTaskEvent
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.adapters.bi_platform import get_active_connection

# Import SQLGuard (Superset AST pattern)
from dbgpt_analyst.common.sql_guard import SQLGuardError, secure_sql
from dbgpt_analyst.config import SQL_MAX_ROW
from dbgpt_analyst.libs.bi.connections import get_enabled_connections
from dbgpt_analyst.libs.bi.federation import classify_query, run_federated_sql
from dbgpt_analyst.libs.bi.query_cache import make_query_cache_key
from dbgpt_analyst.libs.bi.schema_cache import resolve_table_source
from dbgpt_analyst.common.langfuse_client import observe


from dbgpt_analyst.adapters.db_engine.sqlite import SqliteAdapter


def get_adapter(db_type: str) -> BaseEngineAdapter:
    t = (db_type or "").lower()
    if "sqlite" in t:
        return SqliteAdapter()
    if "postgre" in t:
        return PostgresAdapter()
    return PostgresAdapter()


@observe(name="node_execute_sql")
async def node_execute_sql(state: MainAgentState) -> dict[str, Any]:
    generated_sql = state.get("generated_sql")
    retry_count = state.get("retry_count", 0)

    if not generated_sql:
        return {
            "query_results": [],
            "steps": [WorkflowTaskEvent(payload={"message": "Bỏ qua thực thi SQL vì không có truy vấn."}, phase="executing", status="done").model_dump()]
        }

    # 1. Bảo mật: Parse AST bằng SQL Guard thay vì Regex (Chặn OOM và cấm lệnh INSERT/UPDATE)
    try:
        # Default fallback dialect for SQLGlot
        clean_sql = secure_sql(generated_sql, db_dialect="postgres", max_limit=SQL_MAX_ROW)
    except SQLGuardError as e:
        exec_retry = state.get("execution_retry_count", 0)
        return {
            "error": str(e),
            "retry_count": retry_count + 1,
            "execution_retry_count": exec_retry + 1,
            "have_retry": False,
            "steps": [ErrorEvent(payload={"error": str(e), "message": "Truy vấn bị từ chối bởi SQLGuard."}, phase="executing").model_dump()]
        }

    try:
        map_qualified = state.get("map_qualified", {})
        resolved_tables: dict[str, dict] = {}

        for table_name, meta in map_qualified.items():
            resolved = resolve_table_source(meta.get("raw_table", table_name))
            if resolved:
                resolved_tables[table_name] = resolved
            else:
                resolved_tables[table_name] = {
                    "source_id": meta.get("source_id", 0),
                    "db_type": meta.get("db_type", "postgresql"),
                    "raw_table": meta.get("raw_table", table_name),
                    "connection_string": meta.get("connection_string", "INTERNAL"),
                    "source_name": meta.get("source_name", "Local DB"),
                }

        strategy = classify_query(resolved_tables) if resolved_tables else "push_down"

        # Cache check (chưa hỗ trợ buffer IPC cho cache ở bản này, tạm thời log cache logic)
        cache_key = make_query_cache_key(clean_sql, resolved_tables, strategy, SQL_MAX_ROW)

        if strategy == "push_down":
            extra_conns_to_close: list = []
            if state.get("db_conn") is not None:
                conn = state["db_conn"]
                active_db_type = state.get("db_type", "sqlite")
            else:
                conn, active_db_type = get_active_connection()
                if resolved_tables:
                    first = next(iter(resolved_tables.values()))
                    if first.get("connection_string") and first["connection_string"] != "INTERNAL":
                        active_db_type = first["db_type"]
                        for c, t, sid, sname in get_enabled_connections(read_only=True):
                            if sid == first["source_id"]:
                                extra_conns_to_close.append(conn)
                                conn = c
                            else:
                                extra_conns_to_close.append(c)

            adapter = get_adapter(active_db_type)
            dialect_sql = adapter.generate_dialect_sql(clean_sql)

            try:
                # 2. Thay vì load toàn bộ data vào RAM (fetchmany -> list), dùng Adapter nén xuống ổ cứng (IPC Buffer)
                result_meta = adapter.execute_and_buffer(conn, dialect_sql)
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
                for _ec in extra_conns_to_close:
                    try:
                        _ec.close()
                    except Exception:
                        pass

            source_name = next(iter(resolved_tables.values()), {}).get("source_name", "Local DB")
            target_table = state.get("anchor_table", "unknown")
            log_query_lineage("bot", "excel_analysis_bot", 0, target_table, dialect_sql)

            step = WorkflowTaskEvent(
                payload={
                    "message": f"Thực thi SQL thành công (push-down), nhận được {result_meta['results_count']} bản ghi. Dữ liệu ghi qua đĩa (IPC).",
                    "sql": dialect_sql,
                    "results_count": result_meta["results_count"],
                    "columns": result_meta["columns"],
                    "results_key": result_meta["results_key"],
                    "strategy": "push_down",
                    "source_name": source_name,
                    "elapsed_ms": result_meta["elapsed_ms"]
                },
                phase="executing",
                status="done"
            ).model_dump()

            # Trả về Preview Data (10 dòng) vào RAM, thay vì trả 1 triệu dòng vào state "query_results"
            return {
                "query_results": result_meta["preview_data"],
                "results_key": result_meta["results_key"],
                "generated_sql": dialect_sql,
                "steps": [step],
                "error": None
            }

        # 2b. Federated
        _t0 = time.perf_counter()
        result = run_federated_sql(clean_sql, resolved_tables, limit=SQL_MAX_ROW)
        elapsed_ms = int((time.perf_counter() - _t0) * 1000)

        query_results = result["rows"]
        col_names_result = result["columns"]

        # Lưu IPC cho Federated
        adapter = get_adapter("duckdb")
        compressed_ipc = adapter.write_ipc_buffer(query_results, col_names_result)
        results_key = adapter.store_results_in_backend(compressed_ipc)
        preview_data = query_results[:5]

        source_names = list({v.get("source_name", "Local DB") for v in resolved_tables.values()})
        source_name = " + ".join(source_names) if source_names else "Federated"

        step = WorkflowTaskEvent(
            payload={
                "message": "Thực thi SQL liên nguồn (federated) thành công, ghi đĩa (IPC).",
                "sql": clean_sql, "results_count": len(query_results), "columns": col_names_result,
                "strategy": "federate", "source_name": source_name, "elapsed_ms": elapsed_ms, "results_key": results_key
            },
            phase="executing",
            status="done"
        ).model_dump()
        return {
            "query_results": preview_data,
            "results_key": results_key,
            "generated_sql": clean_sql,
            "steps": [step],
            "error": None
        }

    except Exception as e:
        logger.warning(f"SQL execution failed: {e}")
        exec_retry = state.get("execution_retry_count", 0)
        err_msg = str(e).lower()
        unrecoverable = any(k in err_msg for k in ["connection refused", "password authentication failed", "access denied", "could not connect"])
        have_retry = not unrecoverable

        step = ErrorEvent(
            payload={
                "message": f"Thực thi SQL thất bại ở lượt {exec_retry + 1}. Lỗi: {e!s}",
                "sql": clean_sql,
                "error": str(e)
            },
            phase="executing"
        ).model_dump()
        return {
            "error": str(e),
            "retry_count": retry_count + 1,
            "execution_retry_count": exec_retry + 1,
            "have_retry": have_retry,
            "steps": [step],
        }
