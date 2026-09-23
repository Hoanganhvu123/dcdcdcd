import logging
from typing import Any

from dbgpt_analyst.common.db import get_db_connection
from dbgpt_analyst.libs.bi.schemas import RelationshipCreate

logger = logging.getLogger(__name__)


def list_candidate_columns(conn, db_type: str, exclude_tables: list[str] | None = None) -> list[dict[str, Any]]:
    """List all candidate columns across all tables in a connection."""
    exclude_tables = exclude_tables or []
    candidates = []

    if db_type == "postgresql":
        cur = conn.cursor()
        cur.execute("""
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema='public' 
            AND data_type IN ('character varying', 'text', 'integer', 'bigint', 'uuid')
        """)
        for row in cur.fetchall():
            if row[0] not in exclude_tables:
                candidates.append({"table": row[0], "column": row[1], "type": row[2]})
    elif db_type == "sqlite":
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]
        for t in tables:
            if t in exclude_tables:
                continue
            cur.execute(f"PRAGMA table_info({t})")
            for c in cur.fetchall():
                if any(t_type in c[2].lower() for t_type in ["int", "char", "text", "varchar"]):
                    candidates.append({"table": t, "column": c[1], "type": c[2]})
    elif db_type == "mysql":
        cur = conn.cursor()
        cur.execute("""
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema=DATABASE()
            AND data_type IN ('varchar', 'text', 'int', 'bigint', 'char')
        """)
        for row in cur.fetchall():
            if row[0] not in exclude_tables:
                candidates.append({"table": row[0], "column": row[1], "type": row[2]})

    return candidates


def sample_distinct(conn, db_type: str, table: str, column: str, limit: int = 1000) -> set:
    """Sample distinct values from a table efficiently based on the database engine."""
    cur = conn.cursor()
    samples = set()
    try:
        if db_type == "postgresql":
            query = f'SELECT DISTINCT "{column}" FROM "{table}" TABLESAMPLE SYSTEM (10) LIMIT {limit}'
            try:
                cur.execute(query)
            except Exception:
                conn.rollback()
                query = f'SELECT DISTINCT "{column}" FROM "{table}" LIMIT {limit}'
                cur.execute(query)
        elif db_type == "mysql":
            query = f"SELECT DISTINCT `{column}` FROM `{table}` LIMIT {limit}"
            cur.execute(query)
        else:  # sqlite
            query = f'SELECT DISTINCT "{column}" FROM "{table}" LIMIT {limit}'
            cur.execute(query)

        for row in cur.fetchall():
            if row[0] is not None:
                val = str(row[0]).strip().lower()
                if val:
                    samples.add(val)
    except Exception as e:
        logger.warning(f"Failed to sample {table}.{column}: {e}")
        if db_type == "postgresql":
            try:
                conn.rollback()
            except Exception:
                pass

    return samples


def is_sequential_id(samples: set) -> bool:
    """False-positive guard: If it's just 1, 2, 3... it's a primary key or sequential ID."""
    if not samples:
        return False

    if not all(s.isdigit() for s in samples):
        return False

    nums = sorted(int(s) for s in samples)
    if len(nums) < 5:
        return False

    return (nums[-1] - nums[0]) <= len(nums) * 2


def profile_value_overlap_multi(
    source_db_type: str,
    source_table: str,
    source_source_id: str,
    target_source_id: str,
    target_db_type: str,
    target_conn=None,
):
    """Background job to compute Value-Overlap between an uploaded table (source)
    and all candidates in the target connection.
    Saves relationships > 80% to table_relationships.
    """
    source_conn = None
    try:
        source_conn = get_db_connection()

        # 1. Get Source columns
        source_cols = list_candidate_columns(source_conn, source_db_type, exclude_tables=[])
        source_cols = [c for c in source_cols if c["table"] == source_table]

        # 2. Get Target columns
        target_cols = list_candidate_columns(target_conn, target_db_type)

        for s_col in source_cols:
            s_samples = sample_distinct(source_conn, source_db_type, source_table, s_col["column"])
            if not s_samples or is_sequential_id(s_samples):
                continue

            for t_col in target_cols:
                # Skip self-joins in the same table if same connection
                if source_source_id == target_source_id and source_table == t_col["table"]:
                    continue

                t_samples = sample_distinct(target_conn, target_db_type, t_col["table"], t_col["column"])
                if not t_samples or is_sequential_id(t_samples):
                    continue

                # Compute Overlap
                intersection = s_samples.intersection(t_samples)
                if not intersection:
                    continue

                confidence = len(intersection) / min(len(s_samples), len(t_samples))

                if confidence >= 0.8:
                    req = RelationshipCreate(
                        from_source_id=str(source_source_id),
                        from_table=source_table,
                        from_column=s_col["column"],
                        to_source_id=str(target_source_id),
                        to_table=t_col["table"],
                        to_column=t_col["column"],
                        join_type="LEFT",
                        ai_suggested=True,
                        confirmed=False,
                        confidence=confidence,
                    )
                    conn = get_db_connection()
                    cur = conn.cursor()
                    try:
                        cur.execute("""
                            INSERT INTO table_relationships
                                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                                SET confidence=EXCLUDED.confidence, ai_suggested=TRUE
                            RETURNING *
                        """, (
                            target_source_id, req.from_source_id, req.from_table, req.from_column,
                            req.to_source_id, req.to_table, req.to_column,
                            req.join_type, req.confidence, req.ai_suggested, req.confirmed
                        ))
                        conn.commit()
                    except Exception as e:
                        logger.warning(f"Error saving relationship: {e}")
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                    finally:
                        conn.close()
    except Exception as e:
        logger.error(f"Value Overlap Multi failed: {e}")
    finally:
        if source_conn:
            try:
                source_conn.close()
            except Exception:
                pass
