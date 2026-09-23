"""Federation Query Engine
-----------------------
Uses DuckDB in-process to execute cross-source SQL queries.
Supports: PostgreSQL, MySQL, SQLite (via DuckDB extensions), CSV/JSON files.

Lazy-initialized singleton – no DuckDB overhead until the first federated query.
"""

import logging
import re
from typing import Any

from dbgpt_analyst.common.duckdb_client import DuckDBClient
from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Federated SQL execution
# ---------------------------------------------------------------------------


def _rewrite_table_refs(
    sql: str,
    table_map: dict[str, dict[str, Any]],
) -> str:
    """Rewrite unqualified / qualified table names in *sql* so they reference the
    correct DuckDB catalog + schema.

    ``table_map`` keys are the table names the LLM used; values carry
    ``catalog``, ``schema`` (optional), and ``raw_table``.
    """
    for llm_name, info in table_map.items():
        catalog = info["catalog"]
        schema = info.get("schema", "public")
        raw_table = info["raw_table"]

        qualified = f"{catalog}.{schema}.{raw_table}"
        # Replace whole-word occurrences (case-insensitive) of the LLM name
        pattern = re.compile(rf"\b{re.escape(llm_name)}\b", re.IGNORECASE)
        sql = pattern.sub(qualified, sql)

    return sql


def run_federated_sql(
    sql: str,
    sources: dict[str, dict[str, Any]],
    limit: int = 500,
) -> dict[str, Any]:
    """Execute a federated SQL statement on DuckDB.

    Parameters
    ----------
    sql : str
        The SQL query (may reference tables from multiple sources).
    sources : dict
        Mapping of ``{table_name_used_by_llm: {source_id, db_type,
        raw_table, connection_string, source_name, schema?}}``.
        Each source is attached on-demand.
    limit : int
        Maximum rows to return (safety cap).

    Returns
    -------
    dict  ``{"columns": [...], "rows": [...]}``
    """
    # Security: SELECT-only.
    # Word-boundary match (not bare substring) so legitimate identifiers like
    # created_at / last_updated / updated_at don't false-trip the guard —
    # "create" ⊄ "\bcreate\b" inside "created_at" (trailing 'd' breaks \b).
    forbidden = ["insert", "update", "delete", "drop", "alter", "create", "replace", "truncate", "pragma"]
    sql_lower = sql.lower().strip().rstrip(";")
    if any(re.search(rf"\b{kw}\b", sql_lower) for kw in forbidden):
        raise PermissionError("Federated engine only allows SELECT queries.")

    duck = DuckDBClient.get_instance()

    # 1. Attach every source referenced by the query
    table_map: dict[str, dict[str, Any]] = {}
    for llm_table, info in sources.items():
        sid = info["source_id"]
        db_type = info["db_type"]
        conn_str = info.get("connection_string", "")

        catalog = duck.attach_source(sid, db_type, conn_str)

        # Determine the schema inside the catalog
        if db_type == "postgresql":
            schema = CHECKPOINT_POSTGRES_SCHEMA
        else:
            # MySQL and SQLite don't have schemas in the same way;
            # DuckDB usually exposes them under 'main' or similar.
            schema = "main"

        table_map[llm_table] = {
            "catalog": catalog,
            "schema": schema,
            "raw_table": info["raw_table"],
        }

    # 2. Rewrite SQL so table names point to the attached catalogs
    rewritten = _rewrite_table_refs(sql, table_map)

    # 3. Apply limit safety
    if "limit" not in rewritten.lower():
        rewritten = rewritten.rstrip(";") + f" LIMIT {limit}"

    logger.info(f"Federated SQL (rewritten): {rewritten}")

    # 4. Execute
    try:
        result = duck.execute(rewritten)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()

        # Convert to list-of-dicts for consistency with the rest of the codebase
        return {
            "columns": columns,
            "rows": [dict(zip(columns, row)) for row in rows],
        }
    except Exception as e:
        logger.error(f"Federated SQL execution failed: {e}")
        raise


# ---------------------------------------------------------------------------
# Query classification helpers
# ---------------------------------------------------------------------------


def classify_query(tables: dict[str, dict[str, Any]]) -> str:
    """Decide execution strategy.

    Parameters
    ----------
    tables : dict
        ``{table_name: {source_id, db_type, ...}, ...}``

    Returns
    -------
    ``'push_down'`` if all tables belong to the same source;
    ``'federate'``  otherwise.
    """
    source_ids = {info["source_id"] for info in tables.values()}
    return "push_down" if len(source_ids) == 1 else "federate"


def generate_dialect_sql(sql: str, db_type: str) -> str:
    """Apply lightweight dialect adjustments so the SQL can run natively on the
    target database when push_down is used.

    Only handles the most common quoting differences – the LLM already
    generates mostly-ANSI SQL.
    """
    if db_type == "mysql":
        # Replace double-quoted identifiers → backtick-quoted
        sql = re.sub(r'"([^"]+)"', r"`\1`", sql)
    elif db_type == "sqlite":
        # SQLite doesn't support schema-qualified names; strip them
        sql = re.sub(r"\b\w+\.(\w+)\.(\w+)\b", r'"\1".\2', sql)
    elif db_type == "postgresql":
        # Backtick → double-quote
        sql = re.sub(r"`([^`]+)`", r'"\1"', sql)
    return sql
