"""adapters/bi_platform.py — nối vào ConnectorManager thật của DB-GPT
(dbgpt_serve.datasource.manages.ConnectorManager) thay cho stub. Node chỉ
cần các hàm helper bên dưới, không cần lớp FastAPI router.

get_active_instructions / get_confirmed_relationships CHƯA làm ở đây —
để nguyên NotImplementedError, chờ Task E (libs/bi đầy đủ). Cả 2 chỗ gọi
trong nodes/schema_resolver.py đã tự try/except nên không chặn agent chạy.
"""
import logging

from dbgpt._private.config import Config
from dbgpt_serve.datasource.manages import ConnectorManager

from dbgpt_analyst.config import ANALYST_DEFAULT_DB_NAME

logger = logging.getLogger(__name__)

CFG = Config()


def _resolve_db_name() -> str:
    """Chọn db_name để dùng: ưu tiên ANALYST_DB_NAME env, fallback datasource
    đầu tiên đã đăng ký trong ConnectorManager."""
    if ANALYST_DEFAULT_DB_NAME:
        return ANALYST_DEFAULT_DB_NAME
    cm = ConnectorManager.get_instance(CFG.SYSTEM_APP)
    db_list = cm.get_db_list()
    if not db_list:
        raise RuntimeError(
            "Không có datasource nào đăng ký trong DB-GPT. "
            "Set env ANALYST_DB_NAME hoặc đăng ký datasource qua UI trước."
        )
    first = db_list[0]
    db_name = first.get("db_name") if isinstance(first, dict) else getattr(first, "db_name", None)
    if not db_name:
        raise RuntimeError(f"Datasource đầu tiên trong ConnectorManager thiếu db_name: {first!r}")
    return db_name


def get_active_connection(read_only: bool = True):
    """Trả về (conn, db_type) từ ConnectorManager thật của DB-GPT.

    conn là raw DBAPI2 connection (SQLAlchemy Engine.raw_connection()),
    tương thích thẳng với adapters/engine_adapter.py::BaseEngineAdapter.

    ponytail: read_only không tự enforce vật lý ở đây — SELECT-only đã bị
    chặn ở tầng nodes/execution.py (AST check trước khi execute). Nếu sau
    cần enforce vật lý (vd sqlite mode=ro URI), nâng cấp ở đây.
    """
    db_name = _resolve_db_name()
    cm = ConnectorManager.get_instance(CFG.SYSTEM_APP)
    connector = cm.get_connector(db_name)
    conn = connector._engine.raw_connection()
    return conn, connector.dialect


def get_table_columns(conn, db_type: str, table_name: str) -> list[dict]:
    """Trả list cột {name, type, description} cho table_name, dialect-aware.

    Port rút gọn từ preferences/aianalytic/backend/libs/bi/introspection.py::
    get_table_columns — bỏ excel_column_definitions (bảng không tồn tại ở
    DB-GPT) và bỏ is_dttm/temporal_detect (Task E, chỉ dùng cosmetic ở
    nodes/schema_resolver.py, an toàn khi thiếu key).

    postgresql: dùng schema "public" cố định (DB-GPT không có khái niệm
    CHECKPOINT_POSTGRES_SCHEMA của bản gốc).
    """
    cursor = conn.cursor()
    columns: list[dict] = []

    if db_type == "sqlite":
        cursor.execute(f"PRAGMA table_info({table_name})")
        for row in cursor.fetchall():
            columns.append({"name": row[1], "type": row[2], "description": ""})

    elif db_type == "postgresql":
        pg_comments: dict[str, str] = {}
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
                (table_name, "public"),
            )
            pg_comments = {row[0]: row[1] for row in cc.fetchall() if row[1]}
            cc.close()
        except Exception as e:
            logger.warning("Không lấy được pg column comments cho %s: %s", table_name, e)

        cursor.execute(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = %s AND table_schema = %s
            ORDER BY ordinal_position
            """,
            (table_name, "public"),
        )
        for row in cursor.fetchall():
            columns.append({
                "name": row[0],
                "type": row[1],
                "description": pg_comments.get(row[0], ""),
            })

    elif db_type == "mysql":
        col_comments: dict[str, str] = {}
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
            col_comments = {row[0]: row[1] for row in cc.fetchall() if row[1]}
            cc.close()
        except Exception as e:
            logger.warning("Không lấy được mysql column comments cho %s: %s", table_name, e)

        cursor.execute(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = %s AND table_schema = DATABASE()
            ORDER BY ordinal_position
            """,
            (table_name,),
        )
        for row in cursor.fetchall():
            columns.append({
                "name": row[0],
                "type": row[1],
                "description": col_comments.get(row[0], ""),
            })

    else:
        raise NotImplementedError(f"get_table_columns chưa hỗ trợ db_type={db_type!r}")

    cursor.close()
    return columns


def get_active_instructions(query: str = "", scope: str = "global") -> list[str]:
    """Retrieve active business rules/instructions.

    Currently returns an empty list as business instructions are not actively
    populated in DB-GPT metadata storage. Avoids raising NotImplementedError to
    prevent warning noise in schema_resolver.
    """
    return []


def get_confirmed_relationships(source_id: str | None = None) -> list[dict]:
    """Fetch confirmed table relationships from metadata store for prompt injection.

    Returns a list of dicts with keys: from_table, from_column, to_table,
    to_column, join_type, confidence, etc., filtered by confirmed=TRUE.
    """
    import sqlite3
    conn = None
    try:
        try:
            from dbgpt_analyst.common.db import get_metadata_db_connection
            conn = get_metadata_db_connection(read_only=True)
            dialect = getattr(conn, "dialect", None) or (
                "sqlite" if isinstance(conn, sqlite3.Connection) or "sqlite" in type(conn).__name__.lower() else "postgresql"
            )
        except Exception:
            conn, dialect = get_active_connection(read_only=True)

        if conn is None:
            return []

        cursor = conn.cursor()
        ph = "?" if dialect == "sqlite" else "%s"

        if source_id:
            cursor.execute(
                f"SELECT * FROM table_relationships WHERE (confirmed = 1 OR confirmed = TRUE) AND (source_id = {ph} OR from_source_id = {ph}) ORDER BY created_at DESC",
                (str(source_id), str(source_id)),
            )
        else:
            cursor.execute("SELECT * FROM table_relationships WHERE (confirmed = 1 OR confirmed = TRUE) ORDER BY created_at DESC")

        if cursor.description:
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            results = [r if isinstance(r, dict) else dict(zip(columns, r)) for r in rows]
        else:
            results = []

        return results
    except Exception as e:
        logger.warning("Could not fetch confirmed relationships: %s", e)
        return []
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass