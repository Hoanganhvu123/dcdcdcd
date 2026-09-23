"""libs/bi/introspection.py — Introspect schema (bảng + cột) trực tiếp từ nguồn.

Tách khỏi `api/bi_platform/dataset_router.py` (task #31). Dùng chung bởi:
- router (UI hiển thị bảng/cột),
- agent NL→SQL (introspect LIVE mỗi câu hỏi),
- schema_cache (làm mới cache).

`get_table_columns` gắn cờ `is_dttm` (cột thời gian) qua libs.bi.temporal_detect
→ cả cache lẫn agent đều nhận cờ này miễn phí.
"""
import logging

from dbgpt_analyst.common.db import get_db_connection, is_sqlite_conn, normalize_sql
from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
from dbgpt_analyst.libs.bi.temporal_detect import detect_temporal

logger = logging.getLogger(__name__)


def get_tables_list(conn, db_type: str) -> list[str]:
    cursor = conn.cursor()
    if db_type == "sqlite":
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        all_tables = [row[0] for row in cursor.fetchall()]
        if "excel_column_definitions" in all_tables:
            return [
                t for t in all_tables
                if t.startswith("excel_") and t not in (
                    "excel_column_definitions",
                    "excel_formula_reports_history",
                    "excel_db_connections",
                    "datasource_schema_cache",
                    "query_lineage",
                )
            ]
        return [
            t for t in all_tables
            if not t.startswith("sqlite_") and t not in (
                "excel_column_definitions",
                "excel_formula_reports_history",
                "excel_db_connections",
                "datasource_schema_cache",
                "query_lineage",
            )
        ]
    if db_type == "postgresql":
        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
              AND table_type = 'BASE TABLE'
        """,
            (CHECKPOINT_POSTGRES_SCHEMA,),
        )
        return [row[0] for row in cursor.fetchall()]
    if db_type == "mysql":
        cursor.execute("SHOW TABLES")
        return [row[0] for row in cursor.fetchall()]
    return []


def get_table_columns(conn, db_type: str, table_name: str) -> list[dict]:
    cursor = conn.cursor()
    columns = []
    col_definitions = {}
    try:
        local_conn = get_db_connection()
        local_cursor = local_conn.cursor()
        local_cursor.execute(
            normalize_sql(
                "SELECT column_name, description FROM excel_column_definitions "
                "WHERE table_name = %s OR table_name = %s",
                is_sqlite_conn(local_conn),
            ),
            (table_name, table_name.replace("excel_", "")),
        )
        col_definitions = {row[0]: row[1] for row in local_cursor.fetchall()}
        local_conn.close()
    except Exception as e:
        logger.error(f"Error fetching column descriptions: {e}")

    # D5: fetch PostgreSQL native column COMMENTs as fallback descriptions
    pg_comments: dict[str, str] = {}

    if db_type == "sqlite":
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns_info = cursor.fetchall()
        for c in columns_info:
            col_name = c[1]
            col_type = c[2]
            description = col_definitions.get(col_name, "")
            columns.append({
                "name": col_name,
                "type": col_type,
                "description": description,
            })
    elif db_type == "postgresql":
        # D5: pull column comments from pg_catalog (col_description)
        try:
            cc = conn.cursor()
            cc.execute(
                """
                SELECT a.attname,
                       pg_catalog.col_description(a.attrelid, a.attnum)
                FROM   pg_catalog.pg_attribute a
                JOIN   pg_catalog.pg_class c ON c.oid = a.attrelid
                JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE  c.relname = %s
                  AND  n.nspname = %s
                  AND  a.attnum > 0
                  AND  NOT a.attisdropped
                """,
                (table_name, CHECKPOINT_POSTGRES_SCHEMA),
            )
            pg_comments = {row[0]: row[1] for row in cc.fetchall() if row[1]}
        except Exception:
            pass

        query = """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = %s AND table_schema = %s
            ORDER BY ordinal_position
        """
        cursor.execute(query, (table_name, CHECKPOINT_POSTGRES_SCHEMA))
        columns_info = cursor.fetchall()
        for c in columns_info:
            col_name = c[0]
            col_type = c[1]
            # manual excel_column_definitions wins; DB comment is fallback (D5)
            description = col_definitions.get(col_name) or pg_comments.get(col_name, "")
            columns.append({
                "name": col_name,
                "type": col_type,
                "description": description,
            })
    elif db_type == "mysql":
        # D5: MySQL column comments live in information_schema.columns
        try:
            cc = conn.cursor()
            cc.execute(
                """
                SELECT COLUMN_NAME, COLUMN_COMMENT
                FROM   information_schema.COLUMNS
                WHERE  TABLE_NAME = %s AND TABLE_SCHEMA = DATABASE()
                  AND  COLUMN_COMMENT != ''
                """,
                (table_name,),
            )
            pg_comments = {row[0]: row[1] for row in cc.fetchall() if row[1]}
        except Exception:
            pass

        query = """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = %s AND table_schema = DATABASE()
            ORDER BY ordinal_position
        """
        cursor.execute(query, (table_name,))
        columns_info = cursor.fetchall()
        for c in columns_info:
            col_name = c[0]
            col_type = c[1]
            description = col_definitions.get(col_name) or pg_comments.get(col_name, "")
            columns.append({
                "name": col_name,
                "type": col_type,
                "description": description,
            })

    # Gắn cờ cột thời gian (is_dttm) — port tinh thần fetch_metadata của Superset.
    # Cả cache lẫn agent (introspect live) đều qua đây nên agent được cờ này miễn phí.
    for col in columns:
        col["is_dttm"] = detect_temporal(col.get("name", ""), col.get("type", ""))
    return columns
