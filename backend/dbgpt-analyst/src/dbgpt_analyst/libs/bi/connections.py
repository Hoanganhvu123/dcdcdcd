"""libs/bi/connections.py — Lớp kết nối nguồn dữ liệu cho BI platform.

Tách khỏi `api/bi_platform/dataset_router.py` (task #31) để file router gọn lại.
Chứa: khởi tạo bảng metadata, lấy connection đang active, auto-deactivate
connection hỏng, và liệt kê tất cả connection enabled (cho federation).

⚠️ KHÔNG bao giờ log `connection_string`/credential ở bất kỳ đâu trong file này.
"""
import json
import logging
import math
import os
import random
import time
from typing import Any, Callable

from dbgpt._private.config import Config
from dbgpt.component import ComponentType

from dbgpt_analyst.common.db import get_db_connection, get_metadata_db_connection
from dbgpt_analyst.common.redis_client import get_redis_client

logger = logging.getLogger(__name__)
CFG = Config()


def get_cached_or_fetch(
    key: str,
    fetch_func: Callable[[], Any],
    ttl: int = 300,
    lock_timeout: int = 10,
    beta: float = 1.0,
) -> Any:
    """Cache-aside wrapper with XFetch probabilistic early expiration and distributed locking.
    Prevents cache stampedes (thundering herd problem).
    """
    client = get_redis_client()
    lock_key = f"lock:{key}"
    stale_val = None
    has_stale = False

    raw = client.get(key)
    if raw is not None:
        try:
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            payload = json.loads(raw)
            val = payload.get("val")
            delta = float(payload.get("delta", 0.0))
            p_ttl = int(payload.get("ttl", ttl))
            ctime = float(payload.get("ctime", 0.0))

            stale_val = val
            has_stale = True

            # XFetch early expiration condition:
            # time.time() - delta * beta * log(rnd) > ctime + ttl
            r = max(random.random(), 1e-10)
            if time.time() - delta * beta * math.log(r) <= ctime + p_ttl:
                return val
        except Exception as e:
            logger.warning(f"Error parsing cache for key {key}: {e}")

    # Cache miss or XFetch early expiration -> try lock to fetch fresh value
    max_retries = int(lock_timeout / 0.05)
    for _ in range(max_retries):
        acquired = client.set(lock_key, "locked", nx=True, ex=lock_timeout)
        if acquired:
            try:
                t0 = time.time()
                res = fetch_func()
                duration = time.time() - t0
                new_payload = {
                    "val": res,
                    "delta": duration,
                    "ttl": ttl,
                    "ctime": time.time(),
                }
                client.set(key, json.dumps(new_payload, default=str), ex=ttl)
                return res
            finally:
                client.delete(lock_key)
        else:
            time.sleep(0.05)
            # Retry reading cache
            retry_raw = client.get(key)
            if retry_raw is not None:
                try:
                    if isinstance(retry_raw, bytes):
                        retry_raw = retry_raw.decode("utf-8")
                    retry_payload = json.loads(retry_raw)
                    return retry_payload.get("val")
                except Exception:
                    pass

    if has_stale:
        return stale_val
    return fetch_func()


def init_relationships_table(conn=None) -> None:
    """Initialize table_relationships table with dual unique indexes for intra-source and cross-source joins."""
    import sqlite3
    should_close = False
    if conn is None:
        try:
            conn = get_metadata_db_connection(read_only=False)
            should_close = True
        except Exception as e:
            logger.error(f"Error obtaining db connection for table_relationships: {e}")
            return

    try:
        cursor = conn.cursor()
        is_sqlite = isinstance(conn, sqlite3.Connection) or "sqlite" in type(conn).__name__.lower() or getattr(conn, "dialect", None) == "sqlite"
        pk_def = "id INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "id SERIAL PRIMARY KEY"
        bool_def = "1" if is_sqlite else "TRUE"
        bool_false_def = "0" if is_sqlite else "FALSE"

        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS table_relationships (
                {pk_def},
                source_id TEXT NOT NULL DEFAULT '',
                from_source_id TEXT DEFAULT '0',
                from_table TEXT NOT NULL,
                from_column TEXT NOT NULL,
                to_source_id TEXT DEFAULT '0',
                to_table TEXT NOT NULL,
                to_column TEXT NOT NULL,
                join_type TEXT DEFAULT 'LEFT',
                confidence REAL DEFAULT 0.8,
                ai_suggested BOOLEAN DEFAULT {bool_def},
                confirmed BOOLEAN DEFAULT {bool_false_def},
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()

        # Backward compatibility column migrations
        if is_sqlite:
            cursor.execute("PRAGMA table_info(table_relationships)")
            existing_cols = {row[1] for row in cursor.fetchall()}
            if "from_source_id" not in existing_cols:
                cursor.execute("ALTER TABLE table_relationships ADD COLUMN from_source_id TEXT DEFAULT '0'")
                conn.commit()
            if "to_source_id" not in existing_cols:
                cursor.execute("ALTER TABLE table_relationships ADD COLUMN to_source_id TEXT DEFAULT '0'")
                conn.commit()
        else:
            for col_stmt in [
                "ALTER TABLE table_relationships ADD COLUMN IF NOT EXISTS from_source_id TEXT DEFAULT '0'",
                "ALTER TABLE table_relationships ADD COLUMN IF NOT EXISTS to_source_id TEXT DEFAULT '0'",
            ]:
                try:
                    cursor.execute(col_stmt)
                    conn.commit()
                except Exception:
                    if hasattr(conn, "rollback"):
                        try:
                            conn.rollback()
                        except Exception:
                            pass

        # Dual unique indexes matching both INSERT ON CONFLICT targets
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_intra_source 
            ON table_relationships (source_id, from_table, from_column, to_table, to_column);
        """)
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_cross_source 
            ON table_relationships (from_source_id, from_table, from_column, to_source_id, to_table, to_column);
        """)
        conn.commit()
        logger.info("table_relationships initialized with dual unique indexes.")
    except Exception as e:
        logger.error(f"Error initializing table_relationships: {e}")
        if hasattr(conn, "rollback"):
            try:
                conn.rollback()
            except Exception:
                pass
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass


def init_history_table(conn=None) -> None:
    """Initialize excel_formula_reports_history table."""
    import sqlite3
    should_close = False
    if conn is None:
        try:
            conn = get_metadata_db_connection(read_only=False)
            should_close = True
        except Exception as e:
            logger.error(f"Error obtaining db connection for history table: {e}")
            return

    try:
        cursor = conn.cursor()
        is_sqlite = isinstance(conn, sqlite3.Connection) or "sqlite" in type(conn).__name__.lower() or getattr(conn, "dialect", None) == "sqlite"
        pk_def = "id INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "id SERIAL PRIMARY KEY"
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS excel_formula_reports_history (
                {pk_def},
                title TEXT NOT NULL,
                prompt TEXT,
                template_html TEXT NOT NULL,
                table_names TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        logger.info("excel_formula_reports_history table initialized.")
    except Exception as e:
        logger.error(f"Error initializing history table: {e}")
        if hasattr(conn, "rollback"):
            try:
                conn.rollback()
            except Exception:
                pass
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass


def init_db_connections_table(conn=None) -> None:
    """Initialize BI connections, schema cache, column definitions, and query lineage tables."""
    import sqlite3
    should_close = False
    if conn is None:
        try:
            conn = get_metadata_db_connection(read_only=False)
            should_close = True
        except Exception as e:
            logger.error(f"Error obtaining db connection for connections table: {e}")
            return

    try:
        cursor = conn.cursor()
        is_sqlite = isinstance(conn, sqlite3.Connection) or "sqlite" in type(conn).__name__.lower() or getattr(conn, "dialect", None) == "sqlite"
        pk_def = "id INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "id SERIAL PRIMARY KEY"
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS excel_db_connections (
                {pk_def},
                name TEXT NOT NULL,
                db_type TEXT NOT NULL,
                connection_string TEXT NOT NULL,
                is_active INTEGER DEFAULT 0,
                enabled INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS datasource_schema_cache (
                source_id INTEGER,
                table_name TEXT,
                columns_json TEXT,
                row_estimate INTEGER,
                sample_json TEXT,
                prev_columns_json TEXT,
                last_diff TEXT,
                dq_score REAL,
                dq_issues TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (source_id, table_name)
            );
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS excel_column_definitions (
                {pk_def},
                table_name TEXT NOT NULL,
                column_name TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS query_lineage (
                {pk_def},
                actor_type TEXT,
                actor_id TEXT,
                source_id INTEGER,
                table_name TEXT,
                query_sql TEXT,
                ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        logger.info("BI metadata tables initialized (excel_db_connections, datasource_schema_cache, excel_column_definitions, query_lineage).")
    except Exception as e:
        logger.error(f"Error initializing connections table: {e}")
        if hasattr(conn, "rollback"):
            try:
                conn.rollback()
            except Exception:
                pass
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass


def bootstrap_analyst_metadata(conn=None) -> None:
    """Idempotently bootstrap all BI platform metadata tables and memory experiment tables."""
    logger.info("Bootstrapping analyst metadata tables...")
    try:
        init_db_connections_table(conn=conn)
    except Exception as e:
        logger.warning(f"Failed to initialize db connections metadata tables: {e}")

    try:
        init_history_table(conn=conn)
    except Exception as e:
        logger.warning(f"Failed to initialize history table: {e}")

    try:
        init_relationships_table(conn=conn)
    except Exception as e:
        logger.warning(f"Failed to initialize relationships table: {e}")

    try:
        from dbgpt_analyst.memory.memory_experiment import ensure_tables
        ensure_tables(conn=conn)
    except Exception as e:
        logger.warning(f"Failed to ensure memory tables: {e}")

    logger.info("Analyst metadata bootstrap completed.")


def get_active_connection(read_only: bool = True):
    """Lấy active database connection từ ConnectorManager của DB-GPT.
    Fallback về local get_db_connection nếu chưa có SystemApp.
    """
    try:
        from dbgpt_analyst.adapters.bi_platform import get_active_connection as _adapter_get_active
        return _adapter_get_active(read_only=read_only)
    except Exception as e:
        logger.debug(f"ConnectorManager get_active_connection fallback: {e}")

    try:
        conn = get_db_connection(read_only=read_only)
        return conn, "postgresql"
    except Exception as e:
        logger.error(f"Failed to get active database connection: {e}")
        return None, "unknown"


def _auto_deactivate_stale_connection(conn_str: str, db_type: str) -> None:
    """Deactivate a broken active connection so it stops being retried."""
    if conn_str == "INTERNAL":
        return
    try:
        admin_conn = get_db_connection(read_only=False)
        cursor = admin_conn.cursor()
        cursor.execute(
            "UPDATE excel_db_connections SET is_active = 0 WHERE connection_string = %s AND db_type = %s AND is_active = 1",
            (conn_str, db_type),
        )
        admin_conn.commit()
        admin_conn.close()
        logger.info(f"Auto-deactivated stale {db_type} connection.")
    except Exception:
        pass


def get_enabled_connections(read_only: bool = True) -> list:
    """Returns a list of all enabled DB connections via ConnectorManager.
    Returns: list of (conn, db_type, source_id, source_name)
    """
    app = CFG.SYSTEM_APP
    if app:
        try:
            from dbgpt_serve.datasource.manages.connector_manager import ConnectorManager
            connector_manager = app.get_component(ComponentType.CONNECTOR_MANAGER, ConnectorManager)
            dbs = connector_manager.get_db_list()
            connections = []
            for idx, db in enumerate(dbs, start=1):
                db_name = db.get("db_name") if isinstance(db, dict) else getattr(db, "db_name", None)
                db_type = db.get("db_type") if isinstance(db, dict) else getattr(db, "db_type", "unknown")
                if not db_name:
                    continue
                try:
                    connector = connector_manager.get_connector(db_name)
                    engine = getattr(connector, "_engine", None)
                    conn = engine.raw_connection() if engine else None
                    dialect = getattr(connector, "dialect", db_type)
                    connections.append((conn, dialect, idx, db_name))
                except Exception as e:
                    logger.error(f"Failed to connect to enabled DB {db_name}: {e}")
            if connections:
                return connections
        except Exception as e:
            logger.error(f"Error listing enabled DB connections via ConnectorManager: {e}")

    # Fallback to local DB connection
    try:
        local_conn = get_db_connection(read_only=read_only)
        return [(local_conn, "postgresql", 0, "Local DB")]
    except Exception as e:
        logger.error(f"Fallback get_enabled_connections error: {e}")
        return []
