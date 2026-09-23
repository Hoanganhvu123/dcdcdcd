"""api/sql/explore_tools.py — Bộ công cụ introspection cho node_explore (ReAct)."""
import logging
import re
from contextlib import contextmanager
from typing import Any

from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA

logger = logging.getLogger(__name__)

_SAFE_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")

#: Deadline for a query whose cost the model controls. The agent writes the SQL,
#: so a cross join or an unfiltered scan against a customer warehouse is a normal
#: mistake rather than an exotic one; without a deadline it hangs the run and
#: pins a connection for as long as the warehouse is willing to keep computing.
DEFAULT_STATEMENT_TIMEOUT_MS = 30_000


def _apply_statement_timeout(cursor, db_type: str | None, timeout_ms: int) -> None:
    """Bound the next statement's server-side runtime, where the engine allows it.

    Best-effort: an engine that rejects the setting (or has none) must not fail
    the query the caller actually asked for.
    """
    try:
        if db_type in ("postgres", "postgresql"):
            # LOCAL scopes it to the current transaction, so the rollback in
            # _cursor clears it and a pooled connection is handed back unchanged.
            cursor.execute("SET LOCAL statement_timeout = %s", (timeout_ms,))
        elif db_type == "mysql":
            cursor.execute("SET SESSION MAX_EXECUTION_TIME = %s", (timeout_ms,))
        # SQLite has no statement timeout; interruption there is a client-side
        # concern and is out of scope here.
    except Exception as e:  # noqa: BLE001 - never let the guard break the query
        logger.debug("statement timeout not applied for %s: %s", db_type, e)


@contextmanager
def _cursor(conn, db_type: str | None = None, timeout_ms: int | None = None):
    """Yield a cursor and always hand the connection back in a usable state.

    These connections come from SQLAlchemy ``raw_connection()``, which is *not*
    autocommit, so every statement opens a transaction. Two consequences the
    call sites here used to ignore:

    * On Postgres a failed statement poisons the transaction — every later query
      on that connection fails with "current transaction is aborted" until it is
      rolled back. The model writes bad SQL routinely, so one typo used to kill
      the rest of the session.
    * A successful read leaves the connection idle-in-transaction, holding a
      snapshot open against vacuum for as long as it is pooled.

    Rolling back unconditionally settles both, and read-only work has nothing to
    lose by it.
    """
    cursor = conn.cursor()
    if timeout_ms:
        _apply_statement_timeout(cursor, db_type, timeout_ms)
    try:
        yield cursor
    finally:
        try:
            cursor.close()
        except Exception as e:  # noqa: BLE001
            logger.debug("cursor close failed: %s", e)
        try:
            conn.rollback()
        except Exception as e:  # noqa: BLE001
            logger.debug("rollback failed: %s", e)


def _validate_identifier(name: str, kind: str = "identifier") -> str:
    """Validate that *name* is a safe SQL identifier (table/column).

    Raises ValueError if the name contains characters outside
    [A-Za-z0-9_.] or doesn't start with a letter/underscore.
    """
    if not name or not _SAFE_IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid {kind} name: {name!r}")
    return name


def _tool_list_tables(conn, db_type: str) -> list[str]:
    """List all user tables/collections in the active connection."""
    if db_type == "mongodb":
        db = conn.get_default_database() if conn.get_default_database() else conn["admin"]
        return db.list_collection_names()
    if db_type == "redis":
        keys = conn.keys("*")
        seen: dict[str, bool] = {}
        result = []
        for k in keys[:200]:
            name = k.decode() if isinstance(k, bytes) else k
            prefix = name.split(":")[0]
            if prefix not in seen:
                seen[prefix] = True
                result.append(prefix)
        return result or ["(redis-keys)"]
    with _cursor(conn) as cursor:
        if db_type in ("postgres", "postgresql"):
            cursor.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = %s ORDER BY table_name",
                (CHECKPOINT_POSTGRES_SCHEMA,),
            )
        elif db_type == "mysql":
            cursor.execute("SHOW TABLES")
        else:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        return [row[0] for row in cursor.fetchall()]


def _tool_describe_table(conn, db_type: str, table: str) -> list[dict[str, str]]:
    """Return column/field names and types for *table* or *collection*."""
    if db_type == "mongodb":
        db = conn.get_default_database() if conn.get_default_database() else conn["admin"]
        sample = db[table].find_one()
        if not sample:
            return []
        return [{"name": k, "type": type(v).__name__} for k, v in sample.items()]
    if db_type == "redis":
        # Scan for keys matching the namespace prefix and infer type
        matching = conn.scan_iter(f"{table}:*", count=10)
        fields: dict[str, str] = {}
        for key in matching:
            rtype = conn.type(key).decode()
            fields[key.decode() if isinstance(key, bytes) else key] = rtype
            if len(fields) >= 20:
                break
        return [{"name": k, "type": v} for k, v in fields.items()] or [{"name": table, "type": "redis-key"}]
    with _cursor(conn) as cursor:
        if db_type in ("postgres", "postgresql"):
            cursor.execute(
                "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s AND table_schema = %s ORDER BY ordinal_position",
                (table, CHECKPOINT_POSTGRES_SCHEMA),
            )
        elif db_type == "mysql":
            _validate_identifier(table, "table")
            cursor.execute(f"DESCRIBE `{table}`")
            return [{"name": r[0], "type": r[1]} for r in cursor.fetchall()]
        else:
            _validate_identifier(table, "table")
            cursor.execute(f"PRAGMA table_info('{table}')")
            return [{"name": r[1], "type": r[2]} for r in cursor.fetchall()]
        return [{"name": r[0], "type": r[1]} for r in cursor.fetchall()]


def _tool_sample_rows(conn, table: str, limit: int = 5, db_type: str | None = None) -> list[dict]:
    """Fetch a few sample rows / documents."""
    # MongoDB: return sample documents (excluding _id). Optional dependency —
    # importing it unguarded made this tool raise on every SQL warehouse in a
    # deployment that has no Mongo driver installed, which is most of them.
    try:
        from pymongo import MongoClient as _MgCls
    except ImportError:
        pass
    else:
        if isinstance(conn, _MgCls):
            db = conn.get_default_database() if conn.get_default_database() else conn["admin"]
            docs = list(db[table].find({}, {"_id": 0}).limit(limit))
            return [{k: str(v) for k, v in d.items()} for d in docs]
    # Redis: scan matching keys and fetch values
    try:
        import redis as _redis_mod
        if isinstance(conn, (_redis_mod.Redis, _redis_mod.StrictRedis)):
            result = []
            for key in conn.scan_iter(f"{table}:*", count=limit * 2):
                k = key.decode() if isinstance(key, bytes) else key
                rtype = conn.type(key).decode()
                if rtype == "hash":
                    val = {f.decode(): v.decode() for f, v in conn.hgetall(key).items()}
                elif rtype == "string":
                    val = {"value": conn.get(key).decode()}
                else:
                    val = {"type": rtype, "key": k}
                result.append({"key": k, **val})
                if len(result) >= limit:
                    break
            return result
    except ImportError:
        pass
    _validate_identifier(table, "table")
    limit = int(limit)
    with _cursor(conn, db_type, DEFAULT_STATEMENT_TIMEOUT_MS) as cursor:
        cursor.execute(f'SELECT * FROM "{table}" LIMIT {limit}')
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]


def _tool_profile_column(conn, table: str, column: str, db_type: str | None = None) -> dict[str, Any]:
    """Quick stats for a column: distinct count, nulls, min/max."""
    _validate_identifier(table, "table")
    _validate_identifier(column, "column")
    with _cursor(conn, db_type, DEFAULT_STATEMENT_TIMEOUT_MS) as cursor:
        cursor.execute(
            f'SELECT COUNT(DISTINCT "{column}") AS distinct_cnt, '
            f'COUNT(*) - COUNT("{column}") AS null_cnt, '
            f'MIN("{column}") AS min_val, MAX("{column}") AS max_val '
            f'FROM "{table}"'
        )
        row = cursor.fetchone()
        cols = [d[0] for d in cursor.description]
        return dict(zip(cols, row))


def _tool_find_foreign_keys(conn, db_type: str, table: str) -> list[dict[str, str]]:
    """Return foreign-key relationships for *table* (Postgres only for now)."""
    if db_type not in ("postgres", "postgresql"):
        return []
    with _cursor(conn, db_type) as cursor:
        cursor.execute(
            "SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column "
            "FROM information_schema.table_constraints tc "
            "JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name "
            "JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name "
            "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = %s",
            (table,),
        )
        return [{"column": r[0], "foreign_table": r[1], "foreign_column": r[2]} for r in cursor.fetchall()]


def _tool_run_sql(
    conn,
    sql: str,
    limit: int = 20,
    db_type: str | None = None,
    timeout_ms: int = DEFAULT_STATEMENT_TIMEOUT_MS,
) -> list[dict]:
    """Run an arbitrary read-only SQL and return rows.

    This is the one query here whose cost nothing in this file bounds — the model
    writes the SQL — hence the statement deadline.
    """
    forbidden = ["insert", "update", "delete", "drop", "alter", "create", "replace", "truncate"]
    # Word-boundary: don't reject SELECTs whose columns contain a keyword (created_at…).
    if any(re.search(rf"\b{w}\b", sql.lower()) for w in forbidden):
        return [{"error": "Write operations are not allowed."}]
    with _cursor(conn, db_type, timeout_ms) as cursor:
        cursor.execute(sql)
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchmany(limit)]