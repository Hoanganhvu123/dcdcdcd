"""Unit and integration tests for DB-GPT Analyst Metadata & BI Platform Bootstrap (Milestone 1).

Tests:
1. Metadata DB vs Customer DW connection isolation (Task W).
2. Dual UNIQUE indexes on table_relationships supporting intra-source and cross-source ON CONFLICT upserts (Task D).
3. bootstrap_analyst_metadata() creating all BI platform and memory metadata tables (Tasks U & V).
4. get_active_instructions() and get_confirmed_relationships() adapter functions (Task D).
5. Schema resolver JOIN relationships prompt injection (Task D).
6. Memory tables lifecycle and persistence operations (Task V).
"""

import sqlite3
import pytest

from dbgpt_analyst.common.db import (
    get_db_connection,
    get_datasource_connection,
    get_metadata_db_connection,
)
from dbgpt_analyst.libs.bi import (
    bootstrap_analyst_metadata,
    init_db_connections_table,
    init_history_table,
    init_relationships_table,
)
from dbgpt_analyst.adapters.bi_platform import (
    get_active_instructions,
    get_confirmed_relationships,
)
from dbgpt_analyst.memory.memory_experiment import (
    ensure_tables,
    store_query,
    recall_queries,
    store_experience,
    recall_experiences,
    upsert_description,
    get_descriptions,
)
from dbgpt_analyst.nodes.schema_resolver import node_resolve_schema


def test_metadata_vs_customer_dw_separation(monkeypatch):
    """Task W: Verify separation between internal metadata connection and customer DW connection."""
    meta_conn = get_metadata_db_connection(read_only=False)
    assert meta_conn is not None
    # Backward compatible get_db_connection should point to metadata store
    compat_conn = get_db_connection(read_only=False)
    assert compat_conn is not None

    # Test customer DW connector routing
    mock_dw_conn = sqlite3.connect(":memory:")
    monkeypatch.setattr(
        "dbgpt_analyst.adapters.bi_platform.get_active_connection",
        lambda read_only=True: (mock_dw_conn, "sqlite"),
    )
    dw_conn, dialect = get_datasource_connection(read_only=True)
    assert dw_conn is mock_dw_conn
    assert dialect == "sqlite"


def test_table_relationships_dual_unique_constraints():
    """Task D: Verify table_relationships supports dual ON CONFLICT targets (intra-source and cross-source)."""
    conn = sqlite3.connect(":memory:")
    init_relationships_table(conn)

    cur = conn.cursor()

    # 1. Test Path 1 (Intra-source upsert)
    insert_intra = """
        INSERT INTO table_relationships
            (source_id, from_table, from_column, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES ('src_dw1', 'orders', 'customer_id', 'customers', 'id', 'LEFT', 0.85, 1, 0)
        ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
            SET confidence=EXCLUDED.confidence, ai_suggested=1
    """
    cur.execute(insert_intra)
    conn.commit()

    # Re-insert with updated confidence to test ON CONFLICT DO UPDATE
    insert_intra_update = """
        INSERT INTO table_relationships
            (source_id, from_table, from_column, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES ('src_dw1', 'orders', 'customer_id', 'customers', 'id', 'LEFT', 0.95, 1, 1)
        ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
            SET confidence=EXCLUDED.confidence, confirmed=EXCLUDED.confirmed
    """
    cur.execute(insert_intra_update)
    conn.commit()

    cur.execute("SELECT confidence, confirmed FROM table_relationships WHERE source_id='src_dw1'")
    row = cur.fetchone()
    assert row[0] == 0.95
    assert row[1] == 1

    # 2. Test Path 2 (Cross-source federation upsert)
    insert_cross = """
        INSERT INTO table_relationships
            (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES ('fed_1', 'dw_a', 'users', 'org_id', 'dw_b', 'organizations', 'id', 'INNER', 0.70, 1, 0)
        ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
            SET confidence=EXCLUDED.confidence, ai_suggested=1
    """
    cur.execute(insert_cross)
    conn.commit()

    insert_cross_update = """
        INSERT INTO table_relationships
            (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES ('fed_1', 'dw_a', 'users', 'org_id', 'dw_b', 'organizations', 'id', 'INNER', 0.99, 1, 1)
        ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
            SET confidence=EXCLUDED.confidence, confirmed=EXCLUDED.confirmed
    """
    cur.execute(insert_cross_update)
    conn.commit()

    cur.execute("SELECT confidence, confirmed FROM table_relationships WHERE from_source_id='dw_a'")
    row2 = cur.fetchone()
    assert row2[0] == 0.99
    assert row2[1] == 1

    # Total count should be 2 distinct relationship rows
    cur.execute("SELECT COUNT(*) FROM table_relationships")
    assert cur.fetchone()[0] == 2
    conn.close()


def test_bootstrap_analyst_metadata_creates_all_tables():
    """Tasks U & V: Verify bootstrap_analyst_metadata creates all 8 BI and Memory metadata tables."""
    conn = sqlite3.connect(":memory:")
    bootstrap_analyst_metadata(conn=conn)

    expected_tables = [
        "table_relationships",
        "excel_formula_reports_history",
        "excel_db_connections",
        "datasource_schema_cache",
        "excel_column_definitions",
        "query_lineage",
        "golden_queries",
        "schema_descriptions",
        "agent_experiences",
    ]

    cur = conn.cursor()
    for table_name in expected_tables:
        cur.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cur.fetchone()
        assert count is not None
        assert count[0] == 0
    conn.close()


def test_get_active_instructions_returns_empty_list():
    """Task D: Verify get_active_instructions returns empty list cleanly without raising NotImplementedError."""
    res = get_active_instructions(query="Calculate total profit", scope="sql")
    assert res == []


def test_get_confirmed_relationships_adapter(monkeypatch, tmp_path):
    """Task D: Verify get_confirmed_relationships retrieves confirmed relationships with filtering."""
    db_file = str(tmp_path / "metadata.db")
    conn = sqlite3.connect(db_file)
    init_relationships_table(conn)
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO table_relationships 
            (source_id, from_table, from_column, to_table, to_column, join_type, confidence, confirmed)
        VALUES 
            ('src_main', 'orders', 'user_id', 'users', 'id', 'LEFT', 0.9, 1),
            ('src_main', 'order_items', 'order_id', 'orders', 'id', 'INNER', 0.95, 1),
            ('src_main', 'logs', 'user_id', 'users', 'id', 'LEFT', 0.5, 0),
            ('src_other', 'sales', 'rep_id', 'reps', 'id', 'LEFT', 0.88, 1)
    """)
    conn.commit()
    conn.close()

    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=True: sqlite3.connect(db_file),
    )

    # 1. Fetch all confirmed
    all_confirmed = get_confirmed_relationships()
    assert len(all_confirmed) == 3
    tables = {(r["from_table"], r["to_table"]) for r in all_confirmed}
    assert ("orders", "users") in tables
    assert ("order_items", "orders") in tables
    assert ("sales", "reps") in tables
    assert ("logs", "users") not in tables

    # 2. Fetch filtered by source_id
    src_main_only = get_confirmed_relationships(source_id="src_main")
    assert len(src_main_only) == 2
    assert all(r["source_id"] == "src_main" for r in src_main_only)


@pytest.mark.asyncio
async def test_schema_resolver_join_injection(monkeypatch, tmp_path):
    """Task D: Verify confirmed relationships are formatted into ## JOIN Relationships in schema_resolver."""
    meta_db = str(tmp_path / "metadata.db")
    dw_db = str(tmp_path / "dw.db")

    conn_meta = sqlite3.connect(meta_db)
    init_relationships_table(conn_meta)
    cur_meta = conn_meta.cursor()
    cur_meta.execute("""
        INSERT INTO table_relationships 
            (source_id, from_table, from_column, to_table, to_column, join_type, confirmed)
        VALUES 
            ('src1', 'orders', 'customer_id', 'customers', 'id', 'LEFT', 1),
            ('src1', 'order_items', 'order_id', 'orders', 'id', 'INNER', 1)
    """)
    conn_meta.commit()
    conn_meta.close()

    # Create dummy customer data warehouse tables
    conn_dw = sqlite3.connect(dw_db)
    cur_dw = conn_dw.cursor()
    cur_dw.execute("CREATE TABLE orders (id INTEGER, customer_id INTEGER)")
    cur_dw.execute("CREATE TABLE customers (id INTEGER, name TEXT)")
    cur_dw.execute("CREATE TABLE order_items (id INTEGER, order_id INTEGER, price REAL)")
    conn_dw.commit()
    conn_dw.close()

    monkeypatch.setattr(
        "dbgpt_analyst.nodes.schema_resolver.get_active_connection",
        lambda read_only=True: (sqlite3.connect(dw_db), "sqlite"),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=True: sqlite3.connect(meta_db),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.nodes.schema_resolver.get_enabled_connections",
        lambda read_only=True: [],
    )
    monkeypatch.setattr(
        "dbgpt_analyst.nodes.schema_resolver.resolve_table_source",
        lambda t: None,
    )

    state = {
        "question": "Calculate customer total spend",
        "selected_tables": ["orders", "customers", "order_items"],
        "retry_count": 0,
    }
    res = await node_resolve_schema(state)
    assert res["error"] is None
    assert "business_docs" in res
    assert "## JOIN Relationships" in res["business_docs"]
    assert "orders.customer_id → customers.id (LEFT JOIN)" in res["business_docs"]
    assert "order_items.order_id → orders.id (INNER JOIN)" in res["business_docs"]


def test_memory_layer_operations_on_metadata_db(monkeypatch, tmp_path):
    """Task V: Verify golden_queries and schema_descriptions operations execute against metadata store."""
    meta_db = str(tmp_path / "metadata.db")
    conn = sqlite3.connect(meta_db)
    ensure_tables(conn=conn)
    conn.close()

    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_db),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_db),
    )

    # Test golden query storage
    qid = store_query(
        nl_query="How many customers registered in 2026?",
        sql_query="SELECT count(*) FROM customers WHERE strftime('%Y', created_at) = '2026'",
        table_names=["customers"],
        datasource="main_dw",
    )
    assert qid is not None

    # Test description upsert
    desc_id = upsert_description(
        table_name="customers",
        column_name="created_at",
        description="Timestamp of user signup",
        business_name="Registration Time",
    )
    assert desc_id is not None

    descs = get_descriptions("customers")
    assert len(descs) == 1
    assert descs[0]["item_name"] == "created_at"
    assert descs[0]["description"] == "Timestamp of user signup"

    # Test query recall
    recalled = recall_queries("How many customers registered")
    assert len(recalled) >= 1
    assert recalled[0]["nl_query"] == "How many customers registered in 2026?"
    assert recalled[0]["table_names"] == ["customers"]
