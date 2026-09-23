"""libs/bi/schema_cache.py — Làm mới cache metadata + phân giải bảng → nguồn.

Tách khỏi `api/bi_platform/dataset_router.py` (task #31).
- `refresh_schema_cache(source_id)`: introspect nguồn, ghi columns/sample/DQ/diff
  vào `datasource_schema_cache`.
- `resolve_table_source(table_name)`: tra cache + excel_db_connections để biết
  một bảng thuộc nguồn nào (federation cần biết để gán catalog đúng).

⚠️ KHÔNG log connection_string.
"""
import json
import logging
from typing import Any

from dbgpt_analyst.adapters.bi_platform import get_active_connection
from dbgpt_analyst.common.db import get_db_connection
from dbgpt_analyst.common.feature_flags import is_feature_enabled
from dbgpt_analyst.common.redis_client import get_redis_client
from dbgpt_analyst.libs.bi.connections import get_cached_or_fetch, get_enabled_connections
from dbgpt_analyst.libs.bi.dataset_diff import compute_diff, compute_dq_score
from dbgpt_analyst.libs.bi.introspection import get_table_columns, get_tables_list

logger = logging.getLogger(__name__)


def _log_drift(source_name: str, drift_records: list):
    """Ghi tóm tắt drift schema vào ``dataset_drift_log`` (gate sau cờ).

    KHÔNG ghi connection_string — chỉ tên nguồn + tên cột thêm/mất. Bảng tạo
    lười (CREATE IF NOT EXISTS) để không phụ thuộc migration.
    """
    if not drift_records or not is_feature_enabled("ENABLE_DATASET_DRIFT_ALERT"):
        return
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS dataset_drift_log (
                id SERIAL PRIMARY KEY,
                source_name TEXT NOT NULL,
                table_name TEXT NOT NULL,
                added_cols TEXT,
                removed_cols TEXT,
                row_delta BIGINT,
                detected_at TIMESTAMP DEFAULT now()
            )
            """
        )
        for d in drift_records:
            cur.execute(
                "INSERT INTO dataset_drift_log (source_name, table_name, added_cols, removed_cols, row_delta) "
                "VALUES (%s, %s, %s, %s, %s)",
                (
                    source_name,
                    d.get("table"),
                    ", ".join(d.get("added_cols") or []) or None,
                    ", ".join(d.get("removed_cols") or []) or None,
                    int(d.get("row_delta") or 0),
                ),
            )
        conn.commit()
        conn.close()
        logger.info("Drift logged for '%s': %d bảng thay đổi.", source_name, len(drift_records))
    except Exception as e:
        logger.error("Ghi drift log thất bại cho '%s': %s", source_name, e)


def refresh_schema_cache(source_id: int) -> dict | None:
    """Refreshes the schema cache for a given source ID.

    Returns a summary dict ``{source_id, source_name, tables, drift: [...]}``
    (callers cũ bỏ qua giá trị trả về — an toàn). ``drift`` chỉ chứa tên cột,
    KHÔNG connection_string.
    """
    drift_records: list = []
    source_name = None
    try:
        conn_local = get_db_connection()
        cursor_local = conn_local.cursor()

        # Get connection info
        if source_id == 0:
            cursor_local.execute("SELECT id, db_type, connection_string, name FROM excel_db_connections WHERE id = 1")
        else:
            cursor_local.execute("SELECT id, db_type, connection_string, name FROM excel_db_connections WHERE id = %s", (source_id,))

        row = cursor_local.fetchone()
        if not row:
            conn_local.close()
            return None

        real_source_id, db_type, conn_str, source_name = row

        # Connect to source
        enabled_conns = get_enabled_connections(read_only=True)
        source_conn = None
        for c, t, s_id, s_name in enabled_conns:
            if s_id == real_source_id:
                source_conn = c
            else:
                try:
                    c.close()
                except Exception:
                    pass

        if not source_conn:
            logger.error(f"Cannot refresh schema for {source_name}: Connection failed.")
            conn_local.close()
            return None

        tables = get_tables_list(source_conn, db_type)

        redis_client = get_redis_client()
        for table in tables:
            try:
                redis_client.delete(f"bi:table_source:{table}")
            except Exception as cache_err:
                logger.warning(f"Failed to invalidate bi:table_source:{table} cache: {cache_err}")
            try:
                columns = get_table_columns(source_conn, db_type, table)
                columns_json = json.dumps(columns, ensure_ascii=False)

                # Get row estimate and sample
                cursor_source = source_conn.cursor()

                if db_type == "mysql":
                    quoted_table = f"`{table}`"
                else:
                    quoted_table = f'"{table}"'

                cursor_source.execute(f"SELECT COUNT(*) FROM {quoted_table}")
                row_estimate = cursor_source.fetchone()[0]

                cursor_source.execute(f"SELECT * FROM {quoted_table} LIMIT 3")
                rows = cursor_source.fetchall()

                sample_data = []
                col_names = [c["name"] for c in columns]
                for r in rows:
                    sample_data.append(dict(zip(col_names, r)))

                sample_json = json.dumps(sample_data, ensure_ascii=False, default=str)

                # Tính toán DQ score và Diff
                dq_score, dq_issues = compute_dq_score(source_conn, db_type, table)

                cursor_local.execute("SELECT columns_json, row_estimate FROM datasource_schema_cache WHERE source_id = %s AND table_name = %s", (real_source_id, table))
                old_row = cursor_local.fetchone()

                if old_row:
                    old_cols_json, old_row_est = old_row
                    diff_res = compute_diff(old_cols_json, columns_json, old_row_est, row_estimate)

                    if diff_res and (diff_res.get("added_cols") or diff_res.get("removed_cols")):
                        drift_records.append({
                            "table": table,
                            "added_cols": diff_res.get("added_cols") or [],
                            "removed_cols": diff_res.get("removed_cols") or [],
                            "row_delta": diff_res.get("row_delta") or 0,
                        })

                cursor_local.execute("""
                    INSERT INTO datasource_schema_cache
                    (source_id, table_name, columns_json, row_estimate, sample_json, updated_at, dq_score, dq_issues)
                    VALUES (%s, %s, %s, %s, %s, now(), %s, %s)
                    ON CONFLICT (source_id, table_name) DO UPDATE SET
                        prev_columns_json = datasource_schema_cache.columns_json,
                        columns_json = EXCLUDED.columns_json,
                        row_estimate = EXCLUDED.row_estimate,
                        sample_json = EXCLUDED.sample_json,
                        updated_at = now(),
                        dq_score = EXCLUDED.dq_score,
                        dq_issues = EXCLUDED.dq_issues
                """, (real_source_id, table, columns_json, row_estimate, sample_json, dq_score, dq_issues))
            except Exception as table_err:
                logger.warning(f"Skipping table {table} during schema refresh: {table_err}")
                if "conn_local" in locals() and hasattr(conn_local, "rollback"):
                    try:
                        conn_local.rollback()
                    except Exception:
                        pass

        conn_local.commit()
        conn_local.close()
        if source_conn:
            try:
                source_conn.close()
            except Exception:
                pass

        # Nguồn vừa được làm mới → xoá cache kết quả truy vấn chạm tới nó
        try:
            from dbgpt_analyst.libs.bi.query_cache import invalidate_source
            invalidate_source(real_source_id)
        except Exception as e:
            logger.debug(f"qcache invalidate bỏ qua cho source {real_source_id}: {e}")

        # Báo drift (gate sau cờ ENABLE_DATASET_DRIFT_ALERT)
        _log_drift(source_name, drift_records)

        return {
            "source_id": real_source_id,
            "source_name": source_name,
            "tables": len(tables),
            "drift": drift_records,
        }

    except Exception as e:
        logger.error(f"Error refreshing schema cache for source {source_id}: {e}")
        if "conn_local" in locals() and conn_local:
            try:
                conn_local.close()
            except Exception:
                pass
        if "source_conn" in locals() and source_conn:
            try:
                source_conn.close()
            except Exception:
                pass
        return {"source_id": source_id, "source_name": source_name, "tables": 0, "drift": []}


def _uncached_resolve_table_source(table_name: str) -> dict[str, Any] | None:
    """Look up ``datasource_schema_cache`` + ``excel_db_connections`` to resolve
    a table name to its full source metadata.

    Returns
    -------
    dict or None
        ``{source_id, db_type, raw_table, connection_string, source_name}``
        or ``None`` if the table cannot be resolved.
    """
    try:
        conn, dialect = get_active_connection()
        cursor = conn.cursor()
        # ponytail: local metadata DB dùng chung connection với DB đích, nên có thể
        # là sqlite (dev/test) thay vì Postgres. sqlite3 dùng placeholder "?" và
        # KHÔNG %-substitute chuỗi SQL (nên "%%" là literal 2 ký tự, không phải escape
        # của "%") -> query Postgres-style ("%s", "%%") parse lỗi "near '%': syntax error".
        ph = "?" if dialect == "sqlite" else "%s"
        like_pct = "'%'" if dialect == "sqlite" else "'%%'"

        # 1. Find the table in the schema cache
        cursor.execute(
            f"SELECT source_id, table_name FROM datasource_schema_cache WHERE table_name = {ph} LIMIT 1",
            (table_name,),
        )
        cache_row = cursor.fetchone()

        if not cache_row:
            # Fallback: might be a qualified name that includes a source prefix.
            cursor.execute(
                f"SELECT source_id, table_name FROM datasource_schema_cache "
                f"WHERE {ph} LIKE {like_pct} || table_name || {like_pct} LIMIT 1",
                (table_name,),
            )
            cache_row = cursor.fetchone()

        if not cache_row:
            conn.close()
            return None

        source_id = cache_row[0]
        raw_table = cache_row[1]

        # 2. Get the connection details from excel_db_connections
        cursor.execute(
            f"SELECT id, name, db_type, connection_string FROM excel_db_connections WHERE id = {ph}",
            (source_id,),
        )
        conn_row = cursor.fetchone()
        conn.close()

        if not conn_row:
            return {
                "source_id": source_id,
                "db_type": "postgresql",
                "raw_table": raw_table,
                "connection_string": "INTERNAL",
                "source_name": "Local DB",
            }

        return {
            "source_id": conn_row[0],
            "db_type": conn_row[2],
            "raw_table": raw_table,
            "connection_string": conn_row[3],
            "source_name": conn_row[1],
        }
    except Exception as e:
        logger.error(f"Error resolving table source for '{table_name}': {e}")
        return None


def resolve_table_source(table_name: str) -> dict[str, Any] | None:
    """Refactored resolve_table_source using Cache-Aside with Redis and XFetch."""
    return get_cached_or_fetch(
        f"bi:table_source:{table_name}",
        lambda: _uncached_resolve_table_source(table_name),
        ttl=300,
    )
