"""
Golden Queries Memory Store — Full Port from WrenAI.

Ported from WrenAI's memory/store.py (539 lines) + schema_indexer.py (545 lines)
+ embeddings.py (57 lines). Adapted for PostgreSQL instead of LanceDB.

Architecture:
- WrenAI uses LanceDB (vector DB) with sentence-transformers embeddings
- We use PostgreSQL with pg_trgm text similarity (no GPU needed, simpler ops)
- Same interface: store_query, recall_queries, list_queries, forget, dump/load

Two collections (matching WrenAI's schema):
1. golden_queries (= WrenAI's query_history) — NL→SQL pairs
2. schema_descriptions (= WrenAI's schema_items) — table/column descriptions

Reference: WrenAI/core/wren/src/wren/memory/store.py
"""

import hashlib
import json
import logging
from typing import Any

from dbgpt_analyst.common.db import get_db_connection, get_metadata_db_connection

logger = logging.getLogger(__name__)


def _get_ph(conn) -> str:
    """Return SQL placeholder: '?' for SQLite, '%s' for PostgreSQL/MySQL."""
    import sqlite3
    if isinstance(conn, sqlite3.Connection) or "sqlite" in type(conn).__name__.lower() or getattr(conn, "dialect", None) == "sqlite":
        return "?"
    return "%s"


# ---------------------------------------------------------------------------
# Constants (from WrenAI embeddings.py)
# ---------------------------------------------------------------------------

SEED_TAG = "source:seed"
USER_TAG = "source:user"
CORRECTED_TAG = "source:corrected"

# Threshold for adaptive schema strategy (from WrenAI schema_indexer.py line 36)
# ~30K chars ≈ ~8K tokens. Below this, dump full schema; above, use search.
SCHEMA_DESCRIBE_THRESHOLD = 30_000


# ---------------------------------------------------------------------------
# SQL Schema Definitions
# ---------------------------------------------------------------------------

_CREATE_GOLDEN_QUERIES_PG = """
CREATE TABLE IF NOT EXISTS golden_queries (
    id SERIAL PRIMARY KEY,
    nl_query TEXT NOT NULL,
    sql_query TEXT NOT NULL,
    table_names TEXT[] DEFAULT '{}',
    tags TEXT DEFAULT 'source:user',
    datasource TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

_CREATE_GOLDEN_QUERIES_SQLITE = """
CREATE TABLE IF NOT EXISTS golden_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nl_query TEXT NOT NULL,
    sql_query TEXT NOT NULL,
    table_names TEXT DEFAULT '[]',
    tags TEXT DEFAULT 'source:user',
    datasource TEXT DEFAULT '',
    experience_notes TEXT DEFAULT '',
    pattern_tags TEXT DEFAULT '[]',
    distilled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

_CREATE_SCHEMA_DESCRIPTIONS_PG = """
CREATE TABLE IF NOT EXISTS schema_descriptions (
    id SERIAL PRIMARY KEY,
    item_type TEXT NOT NULL,
    model_name TEXT NOT NULL DEFAULT '',
    item_name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    data_type TEXT DEFAULT '',
    expression TEXT DEFAULT '',
    is_calculated BOOLEAN DEFAULT FALSE,
    is_primary_key BOOLEAN DEFAULT FALSE,
    accepted_values TEXT DEFAULT '',
    business_name TEXT DEFAULT '',
    relationships TEXT DEFAULT '',
    mdl_hash TEXT DEFAULT '',
    indexed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_type, model_name, item_name)
);
"""

_CREATE_SCHEMA_DESCRIPTIONS_SQLITE = """
CREATE TABLE IF NOT EXISTS schema_descriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type TEXT NOT NULL,
    model_name TEXT NOT NULL DEFAULT '',
    item_name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    data_type TEXT DEFAULT '',
    expression TEXT DEFAULT '',
    is_calculated BOOLEAN DEFAULT 0,
    is_primary_key BOOLEAN DEFAULT 0,
    accepted_values TEXT DEFAULT '',
    business_name TEXT DEFAULT '',
    relationships TEXT DEFAULT '',
    mdl_hash TEXT DEFAULT '',
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_type, model_name, item_name)
);
"""

_CREATE_TRGM_INDEX = """
CREATE INDEX IF NOT EXISTS idx_gq_nl_trgm
ON golden_queries USING gin (nl_query gin_trgm_ops);
"""

_CREATE_BTREE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_gq_nl_btree
ON golden_queries (nl_query);
"""

_CREATE_SCHEMA_INDEX = """
CREATE INDEX IF NOT EXISTS idx_sd_model
ON schema_descriptions (model_name, item_type);
"""

# ALTER statements for T1 Reflection Agent columns (idempotent — safe to run each startup)
_ALTER_EXPERIENCE_COLUMNS = [
    "ALTER TABLE golden_queries ADD COLUMN IF NOT EXISTS experience_notes TEXT DEFAULT ''",
    "ALTER TABLE golden_queries ADD COLUMN IF NOT EXISTS pattern_tags TEXT[] DEFAULT '{}'",
    "ALTER TABLE golden_queries ADD COLUMN IF NOT EXISTS distilled_at TIMESTAMPTZ",
]


# ---------------------------------------------------------------------------
# Table Setup (from WrenAI store.__init__)
# ---------------------------------------------------------------------------

def ensure_tables(conn=None) -> None:
    """Create golden_queries, schema_descriptions, and agent_experiences tables if they don't exist.

    Ported from WrenAI MemoryStore.__init__ which creates LanceDB tables.
    """
    import sqlite3
    should_close = False
    if conn is None:
        try:
            conn = get_metadata_db_connection(read_only=False)
            should_close = True
        except Exception as e:
            logger.error(f"Error obtaining db connection for memory tables: {e}")
            raise

    try:
        cursor = conn.cursor()
        is_sqlite = isinstance(conn, sqlite3.Connection) or "sqlite" in type(conn).__name__.lower() or getattr(conn, "dialect", None) == "sqlite"

        if is_sqlite:
            cursor.execute(_CREATE_GOLDEN_QUERIES_SQLITE)
            cursor.execute(_CREATE_SCHEMA_DESCRIPTIONS_SQLITE)
        else:
            cursor.execute(_CREATE_GOLDEN_QUERIES_PG)
            cursor.execute(_CREATE_SCHEMA_DESCRIPTIONS_PG)

        cursor.execute(_CREATE_SCHEMA_INDEX)
        conn.commit()

        # T1 Reflection Agent: add columns if this is an older schema
        for alter_sql in _ALTER_EXPERIENCE_COLUMNS:
            try:
                cursor.execute(alter_sql)
                conn.commit()
            except Exception:
                if hasattr(conn, "rollback"):
                    try:
                        conn.rollback()
                    except Exception:
                        pass

        # Try pg_trgm for fuzzy text search (needs extension)
        if not is_sqlite:
            try:
                cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
                conn.commit()
                cursor.execute(_CREATE_TRGM_INDEX)
                conn.commit()
                logger.info("pg_trgm extension enabled for golden_queries")
            except Exception:
                if hasattr(conn, "rollback"):
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                try:
                    cursor.execute(_CREATE_BTREE_INDEX)
                    conn.commit()
                except Exception:
                    if hasattr(conn, "rollback"):
                        try:
                            conn.rollback()
                        except Exception:
                            pass
        else:
            try:
                cursor.execute(_CREATE_BTREE_INDEX)
                conn.commit()
            except Exception:
                pass

        # Ensure agent_experiences table while connection is still open
        _ensure_experience_table(conn=conn)

        logger.info("Memory tables ensured (golden_queries + schema_descriptions + agent_experiences)")
    except Exception as e:
        logger.error(f"Error ensuring memory tables: {e}")
        if hasattr(conn, "rollback"):
            try:
                conn.rollback()
            except Exception:
                pass
        raise
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1: Golden Queries (= WrenAI query_history)
# Ported from: store.py lines 279-522
# ═══════════════════════════════════════════════════════════════════════════


def store_query(
    nl_query: str,
    sql_query: str,
    *,
    table_names: list[str] = None,
    datasource: str = "",
    tags: str = USER_TAG,
) -> int | None:
    """Store a confirmed NL→SQL pair with dedup.

    Ported from WrenAI MemoryStore.store_query() (store.py:279-309).
    WrenAI embeds the nl_query into a vector; we use pg_trgm instead.

    Returns the row ID, or None if skipped.
    """
    if not nl_query or not sql_query:
        return None

    # Skip exploratory queries (WrenAI _tools_memory.py pattern)
    # "Don't store failed queries, queries the user said are wrong,
    #  or exploratory queries." (_prompt.py line 73)
    lower_sql = sql_query.strip().lower()
    if (
        lower_sql.startswith("select *")
        and "limit" in lower_sql
        and "where" not in lower_sql
        and "join" not in lower_sql
        and lower_sql.count("select") == 1
    ):
        logger.debug("Skipping exploratory query from memory storage")
        return None

    try:
        conn = get_metadata_db_connection(read_only=False)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        is_sqlite = ph == "?"

        # Dedup: exact (nl, sql) match → skip
        cursor.execute(
            f"SELECT id FROM golden_queries WHERE nl_query = {ph} AND sql_query = {ph} LIMIT 1",
            (nl_query, sql_query),
        )
        existing = cursor.fetchone()
        if existing:
            try:
                conn.close()
            except Exception:
                pass
            return existing[0]

        tables_val = json.dumps(table_names or []) if is_sqlite else (table_names or [])

        if is_sqlite:
            cursor.execute(
                f"INSERT INTO golden_queries (nl_query, sql_query, table_names, datasource, tags) "
                f"VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                (nl_query, sql_query, tables_val, datasource, tags),
            )
            row_id = cursor.lastrowid
        else:
            cursor.execute(
                f"INSERT INTO golden_queries (nl_query, sql_query, table_names, datasource, tags) "
                f"VALUES ({ph}, {ph}, {ph}, {ph}, {ph}) RETURNING id",
                (nl_query, sql_query, tables_val, datasource, tags),
            )
            row_id = cursor.fetchone()[0]

        conn.commit()
        try:
            conn.close()
        except Exception:
            pass
        logger.info(f"Stored golden query #{row_id}: {nl_query[:80]}...")
        return row_id
    except Exception as e:
        logger.error(f"Error storing golden query: {e}")
        return None


def recall_queries(
    query: str,
    *,
    limit: int = 3,
    table_names: list[str] = None,
    datasource: str = None,
) -> list[dict[str, Any]]:
    """Search past NL→SQL pairs by text similarity.

    Ported from WrenAI MemoryStore.recall_queries() (store.py:311-333).
    WrenAI uses embedding vector search; we use pg_trgm similarity().

    Returns list of {id, nl_query, sql_query, table_names, tags, similarity}.
    """
    if not query:
        return []

    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        is_sqlite = ph == "?"

        if not is_sqlite:
            # Strategy 1: Try pg_trgm similarity (best quality)
            try:
                where_parts = []
                params: list = [query]

                if table_names:
                    where_parts.append("table_names && %s")
                    params.append(table_names)
                if datasource:
                    where_parts.append("datasource = %s")
                    params.append(datasource)

                where_clause = ""
                if where_parts:
                    where_clause = "WHERE " + " AND ".join(where_parts)

                params.append(limit)

                cursor.execute(
                    f"SELECT id, nl_query, sql_query, table_names, tags, "
                    f"similarity(nl_query, %s) AS sim, "
                    f"COALESCE(experience_notes, '') AS experience_notes "
                    f"FROM golden_queries {where_clause} "
                    f"ORDER BY sim DESC LIMIT %s",
                    params,
                )
            except Exception:
                if hasattr(conn, "rollback"):
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                is_sqlite = True

        if is_sqlite:
            # Strategy 2: Fallback to keyword LIKE/ILIKE search
            words = [w for w in query.lower().split() if len(w) > 2]
            if not words:
                try:
                    conn.close()
                except Exception:
                    pass
                return []

            like_op = "LIKE" if ph == "?" else "ILIKE"
            like_clauses = " OR ".join([f"nl_query {like_op} {ph}"] * min(len(words), 5))
            params = [f"%{w}%" for w in words[:5]]

            extra_where = []
            if datasource:
                extra_where.append(f"datasource = {ph}")
                params.append(datasource)

            combined_where = f"({like_clauses})"
            if extra_where:
                combined_where += " AND " + " AND ".join(extra_where)

            params.append(limit)
            cursor.execute(
                f"SELECT id, nl_query, sql_query, table_names, tags, 0.5 AS sim, "
                f"COALESCE(experience_notes, '') AS experience_notes "
                f"FROM golden_queries WHERE {combined_where} "
                f"ORDER BY created_at DESC LIMIT {ph}",
                params,
            )

        rows = cursor.fetchall()
        try:
            conn.close()
        except Exception:
            pass

        results = []
        for row in rows:
            sim = float(row[5]) if row[5] else 0
            if sim < 0.1:  # Filter low similarity
                continue
            tables_raw = row[3]
            if isinstance(tables_raw, str):
                try:
                    tables_list = json.loads(tables_raw)
                except Exception:
                    tables_list = [tables_raw]
            else:
                tables_list = tables_raw or []
            results.append({
                "id": row[0],
                "nl_query": row[1],
                "sql_query": row[2],
                "table_names": tables_list,
                "tags": row[4],
                "similarity": sim,
                "experience_notes": row[6] or "",
            })

        return results

    except Exception as e:
        logger.error(f"Error recalling queries: {e}")
        return []


# ---------------------------------------------------------------------------
# Query Listing & Management (from store.py:337-408)
# ---------------------------------------------------------------------------

def list_queries(
    *,
    source: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """List query_history pairs with pagination.

    Ported from WrenAI MemoryStore.list_queries() (store.py:337-368).
    Returns (rows, total_count).
    """
    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        ph = _get_ph(conn)

        if source:
            cursor.execute(
                f"SELECT COUNT(*) FROM golden_queries WHERE tags = {ph}",
                (f"source:{source}" if not source.startswith("source:") else source,),
            )
        else:
            cursor.execute("SELECT COUNT(*) FROM golden_queries")
        total = cursor.fetchone()[0]

        tag_filter = f"source:{source}" if source and not source.startswith("source:") else source

        if tag_filter:
            cursor.execute(
                f"SELECT id, nl_query, sql_query, table_names, tags, datasource, created_at, "
                f"COALESCE(experience_notes, '') AS experience_notes "
                f"FROM golden_queries WHERE tags = {ph} "
                f"ORDER BY created_at DESC LIMIT {ph} OFFSET {ph}",
                (tag_filter, limit, offset),
            )
        else:
            cursor.execute(
                f"SELECT id, nl_query, sql_query, table_names, tags, datasource, created_at, "
                f"COALESCE(experience_notes, '') AS experience_notes "
                f"FROM golden_queries "
                f"ORDER BY created_at DESC LIMIT {ph} OFFSET {ph}",
                (limit, offset),
            )

        rows = cursor.fetchall()
        try:
            conn.close()
        except Exception:
            pass

        results = []
        for row in rows:
            tables_raw = row[3]
            if isinstance(tables_raw, str):
                try:
                    tables_list = json.loads(tables_raw)
                except Exception:
                    tables_list = [tables_raw]
            else:
                tables_list = tables_raw or []
            results.append({
                "id": row[0],
                "nl_query": row[1],
                "sql_query": row[2],
                "table_names": tables_list,
                "tags": row[4],
                "datasource": row[5] or "",
                "created_at": row[6].isoformat() if hasattr(row[6], "isoformat") else str(row[6]) if row[6] else None,
                "experience_notes": row[7] or "",
            })

        return results, total
    except Exception as e:
        logger.error(f"Error listing golden queries: {e}")
        return [], 0


def count_queries_by_source(source: str) -> int:
    """Count queries by tag source.

    Ported from WrenAI MemoryStore.count_queries_by_source() (store.py:370-376).
    """
    try:
        tag = f"source:{source}" if not source.startswith("source:") else source
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        cursor.execute(f"SELECT COUNT(*) FROM golden_queries WHERE tags = {ph}", (tag,))
        count = cursor.fetchone()[0]
        try:
            conn.close()
        except Exception:
            pass
        return count
    except Exception as e:
        logger.error(f"Error counting queries: {e}")
        return 0


def forget_queries_by_ids(row_ids: list[int]) -> int:
    """Delete rows by IDs.

    Ported from WrenAI MemoryStore.forget_queries_by_ids() (store.py:378-398).
    """
    if not row_ids:
        return 0
    try:
        conn = get_metadata_db_connection(read_only=False)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        placeholders = ",".join([ph] * len(row_ids))
        cursor.execute(f"DELETE FROM golden_queries WHERE id IN ({placeholders})", row_ids)
        deleted = cursor.rowcount
        conn.commit()
        try:
            conn.close()
        except Exception:
            pass
        return deleted
    except Exception as e:
        logger.error(f"Error deleting queries: {e}")
        return 0


def forget_queries_by_source(source: str) -> int:
    """Delete all queries matching source tag.

    Ported from WrenAI MemoryStore.forget_queries_by_source() (store.py:400-408).
    """
    try:
        tag = f"source:{source}" if not source.startswith("source:") else source
        conn = get_metadata_db_connection(read_only=False)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        cursor.execute(f"DELETE FROM golden_queries WHERE tags = {ph}", (tag,))
        deleted = cursor.rowcount
        conn.commit()
        try:
            conn.close()
        except Exception:
            pass
        return deleted
    except Exception as e:
        logger.error(f"Error forgetting queries: {e}")
        return 0


# ---------------------------------------------------------------------------
# Dump / Load (from store.py:412-522)
# ---------------------------------------------------------------------------

def dump_queries(*, source: str | None = None) -> list[dict]:
    """Export all query_history pairs.

    Ported from WrenAI MemoryStore.dump_queries() (store.py:412-425).
    """
    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        if source:
            tag = f"source:{source}" if not source.startswith("source:") else source
            cursor.execute(
                f"SELECT id, nl_query, sql_query, table_names, tags, datasource, created_at "
                f"FROM golden_queries WHERE tags = {ph} ORDER BY created_at ASC",
                (tag,),
            )
        else:
            cursor.execute(
                "SELECT id, nl_query, sql_query, table_names, tags, datasource, created_at "
                "FROM golden_queries ORDER BY created_at ASC"
            )
        rows = cursor.fetchall()
        try:
            conn.close()
        except Exception:
            pass
        return [
            {
                "id": r[0], "nl": r[1], "sql": r[2],
                "table_names": json.loads(r[3]) if isinstance(r[3], str) else (r[3] or []),
                "tags": r[4],
                "datasource": r[5] or "",
                "created_at": r[6].isoformat() if hasattr(r[6], "isoformat") else str(r[6]) if r[6] else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error dumping queries: {e}")
        return []


def load_queries(
    pairs: list[dict],
    *,
    overwrite: bool = False,
    upsert: bool = False,
) -> dict[str, int]:
    """Batch-import NL→SQL pairs.

    Ported from WrenAI MemoryStore.load_queries() (store.py:449-522).
    Returns {"loaded": N, "skipped": M, "updated": U}.
    """
    if overwrite:
        sources = {p.get("source", "user") for p in pairs}
        for src in sources:
            forget_queries_by_source(src)
        loaded = 0
        for p in pairs:
            tags = f"source:{p.get('source', 'user')}"
            store_query(
                nl_query=p["nl"],
                sql_query=p["sql"],
                table_names=p.get("table_names", []),
                datasource=p.get("datasource", ""),
                tags=tags,
            )
            loaded += 1
        return {"loaded": loaded, "skipped": 0, "updated": 0}

    if upsert:
        # Deduplicate by nl_query (last wins) — WrenAI pattern
        seen_nl: dict[str, dict] = {}
        for p in pairs:
            seen_nl[p["nl"]] = p
        deduped = list(seen_nl.values())

        # Find existing and replace
        updated = 0
        try:
            conn = get_metadata_db_connection(read_only=False)
            cursor = conn.cursor()
            ph = _get_ph(conn)
            for p in deduped:
                cursor.execute(
                    f"SELECT id FROM golden_queries WHERE nl_query = {ph}",
                    (p["nl"],),
                )
                existing = cursor.fetchall()
                if existing:
                    ids = [r[0] for r in existing]
                    placeholders = ",".join([ph] * len(ids))
                    cursor.execute(
                        f"DELETE FROM golden_queries WHERE id IN ({placeholders})",
                        ids,
                    )
                    updated += 1
            conn.commit()
            try:
                conn.close()
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Error during upsert delete: {e}")

        for p in deduped:
            tags = f"source:{p.get('source', 'user')}"
            store_query(
                nl_query=p["nl"],
                sql_query=p["sql"],
                table_names=p.get("table_names", []),
                datasource=p.get("datasource", ""),
                tags=tags,
            )
        loaded = len(deduped) - updated
        return {"loaded": loaded, "skipped": 0, "updated": updated}

    # Default: skip exact duplicates (WrenAI pattern store.py:506-522)
    loaded, skipped = 0, 0
    existing_pairs = set()
    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        cursor.execute("SELECT nl_query, sql_query FROM golden_queries")
        for r in cursor.fetchall():
            existing_pairs.add((r[0], r[1]))
        try:
            conn.close()
        except Exception:
            pass
    except Exception:
        pass

    for p in pairs:
        nl, sql = p["nl"], p["sql"]
        if (nl, sql) in existing_pairs:
            skipped += 1
            continue
        existing_pairs.add((nl, sql))
        tags = f"source:{p.get('source', 'user')}"
        store_query(
            nl_query=nl,
            sql_query=sql,
            table_names=p.get("table_names", []),
            datasource=p.get("datasource", ""),
            tags=tags,
        )
        loaded += 1

    return {"loaded": loaded, "skipped": skipped, "updated": 0}


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2: Schema Descriptions (= WrenAI schema_items)
# Ported from: schema_indexer.py lines 220-545
# ═══════════════════════════════════════════════════════════════════════════


def manifest_hash(manifest: dict) -> str:
    """Deterministic SHA-256 hash (16 hex chars) of a manifest dict.

    Ported from WrenAI schema_indexer.py:14-23.
    Internal keys (prefixed with _) are excluded.
    """
    schema_only = {k: v for k, v in manifest.items() if not k.startswith("_")}
    raw = json.dumps(schema_only, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def upsert_description(
    table_name: str,
    column_name: str | None = None,
    *,
    description: str = "",
    business_name: str = "",
    accepted_values: str = "",
    is_primary_key: bool = False,
    data_type: str = "",
    expression: str = "",
    is_calculated: bool = False,
    relationships: str = "",
) -> int | None:
    """Upsert a table/column description.

    Ported from WrenAI schema_indexer.py record builders (lines 265-499).
    """
    item_type = "column" if column_name else "model"
    item_name = column_name or table_name

    try:
        conn = get_metadata_db_connection(read_only=False)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        is_sqlite = ph == "?"

        cursor.execute(
            f"SELECT id FROM schema_descriptions "
            f"WHERE item_type = {ph} AND model_name = {ph} AND item_name = {ph}",
            (item_type, table_name, item_name),
        )
        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                f"UPDATE schema_descriptions SET "
                f"description = {ph}, business_name = {ph}, accepted_values = {ph}, "
                f"is_primary_key = {ph}, data_type = {ph}, expression = {ph}, "
                f"is_calculated = {ph}, relationships = {ph}, indexed_at = CURRENT_TIMESTAMP "
                f"WHERE id = {ph}",
                (
                    description, business_name, accepted_values,
                    1 if (is_primary_key and is_sqlite) else is_primary_key,
                    data_type, expression,
                    1 if (is_calculated and is_sqlite) else is_calculated,
                    relationships, existing[0],
                ),
            )
            row_id = existing[0]
        else:
            if is_sqlite:
                cursor.execute(
                    f"INSERT INTO schema_descriptions "
                    f"(item_type, model_name, item_name, description, business_name, "
                    f"accepted_values, is_primary_key, data_type, expression, "
                    f"is_calculated, relationships) "
                    f"VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})",
                    (
                        item_type, table_name, item_name, description, business_name,
                        accepted_values, 1 if is_primary_key else 0,
                        data_type, expression,
                        1 if is_calculated else 0,
                        relationships,
                    ),
                )
                row_id = cursor.lastrowid
            else:
                cursor.execute(
                    f"INSERT INTO schema_descriptions "
                    f"(item_type, model_name, item_name, description, business_name, "
                    f"accepted_values, is_primary_key, data_type, expression, "
                    f"is_calculated, relationships) "
                    f"VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}) RETURNING id",
                    (
                        item_type, table_name, item_name, description, business_name,
                        accepted_values, is_primary_key, data_type, expression,
                        is_calculated, relationships,
                    ),
                )
                row_id = cursor.fetchone()[0]

        conn.commit()
        try:
            conn.close()
        except Exception:
            pass
        return row_id
    except Exception as e:
        logger.error(f"Error upserting description: {e}")
        return None


def get_descriptions(table_name: str) -> list[dict[str, Any]]:
    """Get all descriptions for a table (table-level + column-level).

    Returns items sorted by item_type (model first, then columns).
    """
    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        cursor.execute(
            f"SELECT id, item_type, model_name, item_name, description, "
            f"business_name, accepted_values, is_primary_key, data_type, "
            f"expression, is_calculated, relationships "
            f"FROM schema_descriptions WHERE model_name = {ph} "
            f"ORDER BY item_type, item_name",
            (table_name,),
        )
        rows = cursor.fetchall()
        try:
            conn.close()
        except Exception:
            pass

        return [
            {
                "id": r[0], "item_type": r[1], "model_name": r[2],
                "item_name": r[3], "description": r[4], "business_name": r[5],
                "accepted_values": r[6], "is_primary_key": r[7],
                "data_type": r[8], "expression": r[9],
                "is_calculated": r[10], "relationships": r[11],
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error getting descriptions: {e}")
        return []


def get_all_descriptions() -> list[dict[str, Any]]:
    """Get ALL schema descriptions across all tables."""
    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, item_type, model_name, item_name, description, "
            "business_name, accepted_values, is_primary_key "
            "FROM schema_descriptions ORDER BY model_name, item_type, item_name"
        )
        rows = cursor.fetchall()
        try:
            conn.close()
        except Exception:
            pass

        return [
            {
                "id": r[0], "item_type": r[1], "model_name": r[2],
                "item_name": r[3], "description": r[4], "business_name": r[5],
                "accepted_values": r[6], "is_primary_key": r[7],
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error getting all descriptions: {e}")
        return []


def delete_description(desc_id: int) -> bool:
    """Delete a schema description by ID."""
    try:
        conn = get_metadata_db_connection(read_only=False)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        cursor.execute(f"DELETE FROM schema_descriptions WHERE id = {ph}", (desc_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        try:
            conn.close()
        except Exception:
            pass
        return deleted
    except Exception as e:
        logger.error(f"Error deleting description: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3: Schema Description Text Builder
# Ported from: schema_indexer.py describe_schema() (lines 39-217)
# ═══════════════════════════════════════════════════════════════════════════


def describe_schema_with_context(schema_text: str, table_names: list[str]) -> str:
    """Enrich raw schema text with stored descriptions.

    This is the key WrenAI pattern: schema_indexer.py describe_schema()
    generates rich text with descriptions, accepted values, relationships,
    calculated fields. We inject our stored descriptions into the raw schema.
    """
    if not table_names:
        return schema_text

    # Load all descriptions for the relevant tables
    enrichments = {}
    for table in table_names:
        descs = get_descriptions(table)
        for d in descs:
            key = (d["model_name"], d["item_name"])
            enrichments[key] = d

    if not enrichments:
        return schema_text

    # Inject descriptions into schema text
    lines = schema_text.split("\n")
    enriched_lines = []

    for line in lines:
        enriched_lines.append(line)

        # Check if this line describes a table
        for table in table_names:
            if f"Table `{table}`" in line or f"Bảng `{table}`" in line:
                table_desc = enrichments.get((table, table))
                if table_desc and table_desc.get("description"):
                    desc = table_desc["description"]
                    biz_name = table_desc.get("business_name", "")
                    extra = f"  📋 Mô tả: {desc}"
                    if biz_name:
                        extra += f" (Tên nghiệp vụ: {biz_name})"
                    enriched_lines.append(extra)

        # Check if this line describes a column
        for (model, item), desc_data in enrichments.items():
            if desc_data["item_type"] == "column" and f"`{item}`" in line and model in table_names:
                extras = []
                if desc_data.get("description"):
                    extras.append(f"Mô tả: {desc_data['description']}")
                if desc_data.get("business_name"):
                    extras.append(f"Tên: {desc_data['business_name']}")
                if desc_data.get("accepted_values"):
                    extras.append(f"Giá trị hợp lệ: {desc_data['accepted_values']}")
                if desc_data.get("is_primary_key"):
                    extras.append("PRIMARY KEY")
                if desc_data.get("relationships"):
                    extras.append(f"Quan hệ: {desc_data['relationships']}")
                if desc_data.get("is_calculated") and desc_data.get("expression"):
                    extras.append(f"Calculated: {desc_data['expression']}")
                if extras:
                    enriched_lines[-1] += f" | 📋 {' | '.join(extras)}"

    return "\n".join(enriched_lines)


def get_context(
    schema_text: str,
    query: str,
    table_names: list[str],
    *,
    threshold: int = SCHEMA_DESCRIBE_THRESHOLD,
) -> dict[str, Any]:
    """Return schema context using the best strategy for the schema size.

    Ported from WrenAI MemoryStore.get_context() (store.py:211-242).
    For small schemas (< threshold), returns full enriched text.
    For large schemas, only returns descriptions for relevant tables.
    """
    enriched = describe_schema_with_context(schema_text, table_names)

    if len(enriched) <= threshold:
        return {"strategy": "full", "schema": enriched}
    # Large schema: return only the enriched sections for selected tables
    return {"strategy": "search", "schema": enriched[:threshold]}


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4: Format Helpers
# Ported from: SDK _format.py (150 lines)
# ═══════════════════════════════════════════════════════════════════════════

CONTENT_CAP_BYTES = 16 * 1024  # From _format.py line 11


def format_recall_content(
    rows: list[dict[str, Any]],
    *,
    max_chars: int = 4_000,
    max_sql_chars: int = 500,
) -> str:
    """Render recalled NL→SQL pairs as numbered list with code fences.

    Ported from WrenAI _format.py:107-117.
    Appends Reflection Agent notes when present so future SQL gen can learn from them.

    T2 Context Budgeting: each SQL is trimmed to max_sql_chars; total output
    is capped at max_chars (~1K tokens) to avoid flooding the SQL-gen prompt.
    """
    if not rows:
        return "_No similar past queries found._"

    chunks = []
    total = 0
    for i, row in enumerate(rows, start=1):
        nl = row.get("nl_query") or row.get("nl") or ""
        sql = row.get("sql_query") or row.get("sql") or ""
        notes = (row.get("experience_notes") or "").strip()
        # T2: trim long SQLs so a single huge query doesn't eat the budget
        if len(sql) > max_sql_chars:
            sql = sql[:max_sql_chars] + "…"
        entry = f'{i}. "{nl}"\n   ```sql\n   {sql}\n   ```'
        if notes:
            entry += f"\n   📝 {notes.replace(chr(10), ' | ')}"
        if total + len(entry) > max_chars:
            break
        chunks.append(entry)
        total += len(entry)
    return "\n".join(chunks)


def update_experience_notes(
    query_id: int,
    notes: str,
    pattern_tags: list[str] | None = None,
) -> None:
    """Persist Reflection Agent distillation back to golden_queries.

    Updates experience_notes, pattern_tags, and stamps distilled_at.
    """
    try:
        conn = get_metadata_db_connection(read_only=False)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        is_sqlite = ph == "?"
        pattern_tags_val = json.dumps(pattern_tags or []) if is_sqlite else (pattern_tags or [])
        cursor.execute(
            f"UPDATE golden_queries "
            f"SET experience_notes = {ph}, pattern_tags = {ph}, distilled_at = CURRENT_TIMESTAMP "
            f"WHERE id = {ph}",
            (notes, pattern_tags_val, query_id),
        )
        conn.commit()
        try:
            conn.close()
        except Exception:
            pass
        logger.debug("Updated experience_notes for golden_query #%s", query_id)
    except Exception as e:
        logger.error("Error updating experience_notes for #%s: %s", query_id, e)


def format_store_content(nl: str, sql: str, tags: str | None = None) -> str:
    """One-liner confirmation.

    Ported from WrenAI _format.py:120-126.
    """
    sql_preview = sql.strip().split("\n")[0]
    if len(sql_preview) > 80:
        sql_preview = sql_preview[:77] + "..."
    return f'Stored: "{nl}" → {sql_preview} ({tags or "user"})'


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5: Housekeeping
# Ported from: store.py:524-539
# ═══════════════════════════════════════════════════════════════════════════

def status() -> dict[str, Any]:
    """Return memory index statistics.

    Ported from WrenAI MemoryStore.status() (store.py:526-532).
    """
    info: dict[str, Any] = {"tables": {}}
    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM golden_queries")
        info["tables"]["golden_queries"] = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM schema_descriptions")
        info["tables"]["schema_descriptions"] = cursor.fetchone()[0]

        # Breakdown by source
        cursor.execute(
            "SELECT tags, COUNT(*) FROM golden_queries GROUP BY tags ORDER BY tags"
        )
        info["queries_by_source"] = {r[0]: r[1] for r in cursor.fetchall()}

        try:
            conn.close()
        except Exception:
            pass
    except Exception as e:
        logger.error(f"Error getting memory status: {e}")
        info["error"] = str(e)

    return info


def reset() -> None:
    """Drop all memory tables.

    Ported from WrenAI MemoryStore.reset() (store.py:534-538).
    """
    try:
        conn = get_metadata_db_connection(read_only=False)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        if ph == "?":
            cursor.execute("DROP TABLE IF EXISTS golden_queries")
            cursor.execute("DROP TABLE IF EXISTS schema_descriptions")
            cursor.execute("DROP TABLE IF EXISTS agent_experiences")
        else:
            cursor.execute("DROP TABLE IF EXISTS golden_queries CASCADE")
            cursor.execute("DROP TABLE IF EXISTS schema_descriptions CASCADE")
            cursor.execute("DROP TABLE IF EXISTS agent_experiences CASCADE")
        conn.commit()
        try:
            conn.close()
        except Exception:
            pass
        logger.info("Memory tables reset")
    except Exception as e:
        logger.error(f"Error resetting memory: {e}")


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 6: Experience Distillation (T1 — Data Formulator flywheel)
# Stores analysis patterns/pitfalls per question category; separate from
# NL→SQL golden queries. Gets recalled + injected into planning prompt.
# ═══════════════════════════════════════════════════════════════════════════

_CREATE_AGENT_EXPERIENCES_PG = """
CREATE TABLE IF NOT EXISTS agent_experiences (
    id SERIAL PRIMARY KEY,
    agent_name TEXT DEFAULT 'sql_agent',
    context_summary TEXT NOT NULL,
    pattern TEXT NOT NULL,
    pitfalls TEXT DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    table_names TEXT[] DEFAULT '{}',
    task_input TEXT DEFAULT '',
    task_output TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

_CREATE_AGENT_EXPERIENCES_SQLITE = """
CREATE TABLE IF NOT EXISTS agent_experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT DEFAULT 'sql_agent',
    context_summary TEXT NOT NULL,
    pattern TEXT NOT NULL,
    pitfalls TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    table_names TEXT DEFAULT '[]',
    task_input TEXT DEFAULT '',
    task_output TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

_CREATE_EXP_TRGM_INDEX = """
CREATE INDEX IF NOT EXISTS idx_exp_context_trgm
ON agent_experiences USING gin (context_summary gin_trgm_ops);
"""

_CREATE_EXP_BTREE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_exp_context_btree
ON agent_experiences (context_summary);
"""


def _ensure_experience_table(conn=None) -> None:
    """Create agent_experiences table if not present. Called inside ensure_tables()."""
    import sqlite3
    should_close = False
    if conn is None:
        try:
            conn = get_metadata_db_connection(read_only=False)
            should_close = True
        except Exception as e:
            logger.error(f"Could not obtain db connection for agent_experiences table: {e}")
            raise

    try:
        cursor = conn.cursor()
        is_sqlite = isinstance(conn, sqlite3.Connection) or "sqlite" in type(conn).__name__.lower() or getattr(conn, "dialect", None) == "sqlite"

        if is_sqlite:
            cursor.execute(_CREATE_AGENT_EXPERIENCES_SQLITE)
        else:
            cursor.execute(_CREATE_AGENT_EXPERIENCES_PG)
        conn.commit()

        # Add generic columns if table existed prior to update
        alter_sqls = [
            "ALTER TABLE agent_experiences ADD COLUMN IF NOT EXISTS agent_name TEXT DEFAULT 'sql_agent'",
            "ALTER TABLE agent_experiences ADD COLUMN IF NOT EXISTS task_input TEXT DEFAULT ''",
            "ALTER TABLE agent_experiences ADD COLUMN IF NOT EXISTS task_output TEXT DEFAULT ''"
        ]
        for sql in alter_sqls:
            try:
                cursor.execute(sql)
                conn.commit()
            except Exception:
                if hasattr(conn, "rollback"):
                    try:
                        conn.rollback()
                    except Exception:
                        pass

        if not is_sqlite:
            try:
                cursor.execute(_CREATE_EXP_TRGM_INDEX)
                conn.commit()
            except Exception:
                if hasattr(conn, "rollback"):
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                try:
                    cursor.execute(_CREATE_EXP_BTREE_INDEX)
                    conn.commit()
                except Exception:
                    if hasattr(conn, "rollback"):
                        try:
                            conn.rollback()
                        except Exception:
                            pass
        else:
            try:
                cursor.execute(_CREATE_EXP_BTREE_INDEX)
                conn.commit()
            except Exception:
                pass
        logger.info("agent_experiences table ensured.")
    except Exception as e:
        logger.error(f"Could not ensure agent_experiences table: {e}")
        if hasattr(conn, "rollback"):
            try:
                conn.rollback()
            except Exception:
                pass
        raise
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass


def store_experience(
    context_summary: str,
    pattern: str,
    pitfalls: str = "",
    tags: list[str] | None = None,
    table_names: list[str] | None = None,
    agent_name: str = "sql_agent",
    task_input: str = "",
    task_output: str = "",
) -> int | None:
    """Persist one distilled analysis pattern."""
    if not context_summary or not pattern:
        return None
    try:
        conn = get_metadata_db_connection(read_only=False)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        is_sqlite = ph == "?"

        tags_val = json.dumps(tags or []) if is_sqlite else (tags or [])
        tables_val = json.dumps(table_names or []) if is_sqlite else (table_names or [])

        if is_sqlite:
            cursor.execute(
                f"INSERT INTO agent_experiences "
                f"(agent_name, context_summary, pattern, pitfalls, tags, table_names, task_input, task_output) "
                f"VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})",
                (
                    agent_name, context_summary, pattern, pitfalls or "",
                    tags_val, tables_val,
                    task_input or "", task_output or "",
                ),
            )
            row_id = cursor.lastrowid
        else:
            cursor.execute(
                f"INSERT INTO agent_experiences "
                f"(agent_name, context_summary, pattern, pitfalls, tags, table_names, task_input, task_output) "
                f"VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}) RETURNING id",
                (
                    agent_name, context_summary, pattern, pitfalls or "",
                    tags_val, tables_val,
                    task_input or "", task_output or "",
                ),
            )
            row_id = cursor.fetchone()[0]

        conn.commit()
        try:
            conn.close()
        except Exception:
            pass
        logger.debug("Stored experience #%s [%s]: %s", row_id, agent_name, context_summary[:80])
        return row_id
    except Exception as e:
        logger.error("Error storing experience: %s", e)
        return None


def recall_experiences(
    query: str,
    agent_name: str = "sql_agent",
    table_names: list[str] | None = None,
    limit: int = 2,
) -> list[dict[str, Any]]:
    """Search stored analysis patterns by text similarity."""
    if not query:
        return []
    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        ph = _get_ph(conn)
        is_sqlite = ph == "?"

        if not is_sqlite:
            where_parts: list[str] = [f"agent_name = {ph}"]
            params: list = [agent_name, query]

            if table_names:
                where_parts.append("table_names && %s")
                params.append(table_names)

            where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
            params.append(limit)

            try:
                cursor.execute(
                    f"SELECT id, agent_name, context_summary, pattern, pitfalls, tags, table_names, "
                    f"task_input, task_output, similarity(context_summary, %s) AS sim "
                    f"FROM agent_experiences {where_clause} "
                    f"ORDER BY sim DESC LIMIT %s",
                    params,
                )
            except Exception:
                if hasattr(conn, "rollback"):
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                is_sqlite = True

        if is_sqlite:
            words = [w for w in query.lower().split() if len(w) > 2]
            if not words:
                try:
                    conn.close()
                except Exception:
                    pass
                return []
            like_op = "LIKE" if ph == "?" else "ILIKE"
            like_clauses = " OR ".join([f"context_summary {like_op} {ph}"] * min(len(words), 4))
            fb_params = [agent_name] + [f"%{w}%" for w in words[:4]]
            fb_params.append(limit)
            cursor.execute(
                f"SELECT id, agent_name, context_summary, pattern, pitfalls, tags, table_names, "
                f"task_input, task_output, 0.4 AS sim "
                f"FROM agent_experiences WHERE agent_name = {ph} AND ({like_clauses}) "
                f"ORDER BY created_at DESC LIMIT {ph}",
                fb_params,
            )

        rows = cursor.fetchall()
        try:
            conn.close()
        except Exception:
            pass

        results = []
        for r in rows:
            sim = float(r[9]) if r[9] else 0
            if sim < 0.1:
                continue
            tags_raw = r[5]
            if isinstance(tags_raw, str):
                try:
                    tags_list = json.loads(tags_raw)
                except Exception:
                    tags_list = [tags_raw]
            else:
                tags_list = tags_raw or []

            tables_raw = r[6]
            if isinstance(tables_raw, str):
                try:
                    tables_list = json.loads(tables_raw)
                except Exception:
                    tables_list = [tables_raw]
            else:
                tables_list = tables_raw or []

            results.append({
                "id": r[0],
                "agent_name": r[1],
                "context_summary": r[2],
                "pattern": r[3],
                "pitfalls": r[4] or "",
                "tags": tags_list,
                "table_names": tables_list,
                "task_input": r[7] or "",
                "task_output": r[8] or "",
                "similarity": sim,
            })
        return results
    except Exception as e:
        logger.error("Error recalling experiences: %s", e)
        return []


def list_experiences(
    *,
    agent_name: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """List distilled agent experiences with pagination, newest first.

    Unlike recall_experiences() (similarity search against a query), this is a
    plain listing — for a "what has the AI learned" UI page where there's no
    search query yet. Mirrors list_queries()'s shape/pattern for golden_queries.

    Returns (rows, total_count).
    """
    try:
        conn = get_metadata_db_connection(read_only=True)
        cursor = conn.cursor()
        ph = _get_ph(conn)

        if agent_name:
            cursor.execute(
                f"SELECT COUNT(*) FROM agent_experiences WHERE agent_name = {ph}",
                (agent_name,),
            )
        else:
            cursor.execute("SELECT COUNT(*) FROM agent_experiences")
        total = cursor.fetchone()[0]

        if agent_name:
            cursor.execute(
                f"SELECT id, agent_name, context_summary, pattern, pitfalls, tags, "
                f"table_names, task_input, task_output, created_at "
                f"FROM agent_experiences WHERE agent_name = {ph} "
                f"ORDER BY created_at DESC LIMIT {ph} OFFSET {ph}",
                (agent_name, limit, offset),
            )
        else:
            cursor.execute(
                f"SELECT id, agent_name, context_summary, pattern, pitfalls, tags, "
                f"table_names, task_input, task_output, created_at "
                f"FROM agent_experiences "
                f"ORDER BY created_at DESC LIMIT {ph} OFFSET {ph}",
                (limit, offset),
            )

        rows = cursor.fetchall()
        try:
            conn.close()
        except Exception:
            pass

        results = [
            {
                "id": r[0],
                "agent_name": r[1],
                "context_summary": r[2],
                "pattern": r[3],
                "pitfalls": r[4] or "",
                "tags": json.loads(r[5]) if isinstance(r[5], str) else (r[5] or []),
                "table_names": json.loads(r[6]) if isinstance(r[6], str) else (r[6] or []),
                "task_input": r[7] or "",
                "task_output": r[8] or "",
                "created_at": r[9].isoformat() if hasattr(r[9], "isoformat") else str(r[9]) if r[9] else None,
            }
            for r in rows
        ]
        return results, total
    except Exception as e:
        logger.error("Error listing agent experiences: %s", e)
        return [], 0


def format_experiences_for_llm(rows: list[dict[str, Any]]) -> str:
    """Render recalled experiences as a compact prompt section."""
    if not rows:
        return ""
    lines = ["## Bài học kinh nghiệm từ phân tích trước\n"]
    for i, r in enumerate(rows, start=1):
        lines.append(f"{i}. **{r['context_summary']}**")
        lines.append(f"   Cách tiếp cận: {r['pattern']}")
        if r.get("pitfalls"):
            lines.append(f"   Cạm bẫy: {r['pitfalls']}")
        if r.get("task_input") and r.get("task_output"):
            preview = r["task_output"][:200].replace("\n", " ")
            lines.append(f"   Ví dụ: \"{r['task_input']}\" → `{preview}`")
        lines.append("")
    return "\n".join(lines)


from dbgpt_analyst.prompts.memory_prompt import DISTILL_PROMPT, GENERIC_DISTILL_PROMPT

_DISTILL_PROMPT = DISTILL_PROMPT


async def distill_and_store_experience(
    question: str,
    sql: str,
    results_summary: str,
    table_names: list[str] | None = None,
) -> None:
    """Legacy backward-compatible wrapper for sql_agent distillation."""
    await distill_and_store_generic_experience(
        agent_name="sql_agent",
        task_input=question,
        task_output=sql,
        status="success",
        context_data={"results_summary": results_summary, "table_names": table_names}
    )

_GENERIC_DISTILL_PROMPT = GENERIC_DISTILL_PROMPT


async def distill_and_store_generic_experience(
    agent_name: str,
    task_input: str,
    task_output: str,
    status: str = "success",
    context_data: dict | None = None,
) -> None:
    """Fire-and-forget: call LLM to distill a pattern for ANY agent, then store it.
    Never raises — any error is logged and swallowed so the caller stream is never affected.
    """
    import json as _json
    if not task_input or not task_output:
        return
    try:
        from dbgpt_analyst.core.helpers import _get_llm
        llm = await _get_llm(None, streaming=False, json_mode=False)
        from langchain_core.messages import HumanMessage
        prompt_text = _GENERIC_DISTILL_PROMPT.format(
            agent_name=agent_name,
            task_input=task_input[:500],
            task_output=task_output[:1000],
            status=status,
            context_data=_json.dumps(context_data or {}, ensure_ascii=False)[:300],
        )
        response = await llm.ainvoke([HumanMessage(content=prompt_text)])
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = _json.loads(raw)
        store_experience(
            agent_name=agent_name,
            context_summary=str(data.get("context_summary", ""))[:300],
            pattern=str(data.get("pattern", ""))[:500],
            pitfalls=str(data.get("pitfalls", ""))[:300],
            tags=data.get("tags") if isinstance(data.get("tags"), list) else [],
            table_names=context_data.get("table_names", []) if context_data else [],
            task_input=task_input[:500],
            task_output=task_output[:1000],
        )
        logger.info("Distilled and stored generic experience for agent %s on: %s", agent_name, task_input[:60])
    except Exception as exc:
        logger.debug("distill_and_store_generic_experience failed (non-fatal): %s", exc)

