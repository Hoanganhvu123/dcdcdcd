"""common/db.py — Database Connection Router for DB-GPT Analyst.

Architecture (Task W):
1. Internal Metadata Store (`get_metadata_db_connection`):
   Connects to DB-GPT application metadata database (`dbgpt.storage.metadata.db`).
   Used by: memory layer (golden_queries, schema_descriptions, agent_experiences),
   BI platform metadata (table_relationships, excel_db_connections, schema_cache, query_lineage).
   
2. Customer Data Warehouse (`get_datasource_connection`):
   Connects to customer analytical database via ConnectorManager / get_active_connection.
   Used by: SQL execution node, introspection, and data profiling.
"""

import logging
import os
import sqlite3
from typing import Any, Tuple

from dbgpt._private.config import Config

logger = logging.getLogger(__name__)
CFG = Config()


# ponytail: tạm ép conversation store về SQLite vì Postgres chưa sẵn sàng
# (credential trong CONV_DATABASE_URL đang chờ rotate). Ceiling: SQLite chỉ
# chịu được 1 writer, không dùng cho multi-process production. Quay lại
# Postgres bằng ANALYST_DB_BACKEND=postgres (vẫn đọc CONV_DATABASE_URL).
CONV_DB_BACKEND_ENV = "ANALYST_DB_BACKEND"
DEFAULT_CONV_DB_BACKEND = "sqlite"


def _meta_dir() -> str:
    """Directory holding the local SQLite stores."""
    try:
        from dbgpt.configs.model_config import PILOT_PATH
        meta_dir = os.path.join(PILOT_PATH, "meta_data")
    except Exception:
        meta_dir = os.path.join(os.path.expanduser("~"), ".dbgpt", "meta_data")
    os.makedirs(meta_dir, exist_ok=True)
    return meta_dir


def _meta_sqlite_path() -> str:
    """Absolute path of the DB-GPT application metadata SQLite file."""
    return os.path.join(_meta_dir(), "dbgpt.db")


def conv_sqlite_path() -> str:
    """Absolute path of the conversation/checkpoint SQLite file.

    Kept separate from `dbgpt.db` so the checkpointer's writes do not take the
    single write lock of the application metadata store.
    """
    return os.path.join(_meta_dir(), "conv_store.db")


def conv_db_backend() -> str:
    """Which backend the conversation store should use: 'sqlite' or 'postgres'."""
    return (os.getenv(CONV_DB_BACKEND_ENV) or DEFAULT_CONV_DB_BACKEND).strip().lower()


def resolve_conv_database_url() -> str:
    """Single source of truth for the conversation-store URL.

    Returns a `sqlite:///...` URL while the temporary SQLite switch is on,
    otherwise the configured `CONV_DATABASE_URL`.
    """
    if conv_db_backend() == "sqlite":
        return "sqlite:///" + conv_sqlite_path()
    try:
        from dbgpt_analyst.config import CONV_DATABASE_URL
    except Exception:
        CONV_DATABASE_URL = None
    url = os.getenv("CONV_DATABASE_URL") or CONV_DATABASE_URL
    return url or ("sqlite:///" + _meta_sqlite_path())


def is_sqlite_conn(conn: Any) -> bool:
    """True when `conn` is a SQLite DB-API connection."""
    return "sqlite" in type(conn).__name__.lower() or hasattr(conn, "backup")


def normalize_sql(sql: str, is_sqlite: bool, schema: str = "") -> str:
    """Rewrite PostgreSQL-flavoured SQL so SQLite accepts it.

    Shared by every caller of `get_db_connection` so the temporary SQLite
    switch does not need a per-module dialect fork.
    """
    if not is_sqlite:
        return sql
    if schema:
        sql = sql.replace(f"{schema}.", "")
    return (
        sql.replace("%s", "?")
        .replace("now()", "CURRENT_TIMESTAMP")
        .replace("TIMESTAMPTZ", "TIMESTAMP")
        .replace("JSONB", "TEXT")
        .replace("BIGSERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
        .replace("BIGSERIAL", "INTEGER")
    )


def get_metadata_db_connection(read_only: bool = False) -> Any:
    """Connect to DB-GPT internal application metadata store.
    
    Primary: Returns raw connection from `dbgpt.storage.metadata.db_manager.db.engine.raw_connection()`.
    Fallback: Connects to local SQLite metadata database file for standalone/test environments.
    """
    try:
        from dbgpt.storage.metadata.db_manager import db
        if db and getattr(db, "is_initialized", False) and getattr(db, "engine", None) is not None:
            return db.engine.raw_connection()
        if db and getattr(db, "_engine", None) is not None:
            return db.engine.raw_connection()
    except Exception as e:
        logger.debug(f"DB-GPT DatabaseManager metadata connection fallback: {e}")

    # Fallback to local SQLite metadata file (useful in pytest / CLI isolated runs)
    try:
        conn = sqlite3.connect(_meta_sqlite_path(), check_same_thread=False)
        return conn
    except Exception as e:
        logger.warning(f"Fallback to memory sqlite metadata database: {e}")
        return sqlite3.connect(":memory:", check_same_thread=False)


def get_datasource_connection(
    db_name: str | None = None, read_only: bool = True
) -> Tuple[Any, str]:
    """Connect to customer data warehouse via DB-GPT ConnectorManager.
    
    Returns:
        Tuple of (raw_connection, dialect_name)
    """
    from dbgpt_analyst.adapters.bi_platform import get_active_connection
    return get_active_connection(read_only=read_only)


def get_db_connection(read_only: bool = False, *args, **kwargs) -> Any:
    """Connect to conversation metadata store (SQLite while the temporary switch is on)."""
    conv_url = resolve_conv_database_url()
    if conv_url.startswith("postgresql://") or conv_url.startswith("postgres://"):
        try:
            import psycopg
            return psycopg.connect(conv_url, autocommit=True)
        except Exception as e:
            logger.warning(f"Failed to connect to PostgreSQL via CONV_DATABASE_URL: {e}")
    return get_metadata_db_connection(read_only=read_only)