"""Empirical stress test suite authored by m1_challenger_2.

Stress-testing:
1. Database Connection Separation (Task W)
2. Startup Bootstrap Isolation & Idempotency (Task U, V)
3. Zero-contamination of Customer DW
4. Read-only DW immunity during metadata bootstrap
5. All 8 metadata tables provisioning on cold start (conn=None vs conn=open_conn)
6. Dual UNIQUE constraints behavior and collision analysis (Task D)
7. Special characters, SQL injection resistance, and unicode handling in memory tables (Task V)
"""

import os
import sqlite3
import pytest
from unittest.mock import MagicMock

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
    list_experiences,
    _ensure_experience_table,
)


REQUIRED_METADATA_TABLES = [
    "table_relationships",
    "golden_queries",
    "schema_descriptions",
    "agent_experiences",
    "excel_db_connections",
    "datasource_schema_cache",
    "excel_formula_reports_history",
    "query_lineage",
]


class ReadOnlyDWConnection:
    """Mock connection representing a strictly read-only Customer Data Warehouse.
    Throws an error if any DDL/DML write operation is attempted.
    """
    def __init__(self, inner_conn: sqlite3.Connection):
        self._inner = inner_conn

    def cursor(self):
        return ReadOnlyDWCursor(self._inner.cursor())

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        self._inner.close()


class ReadOnlyDWCursor:
    def __init__(self, inner_cur: sqlite3.Cursor):
        self._cur = inner_cur

    def execute(self, sql: str, *args, **kwargs):
        normalized = sql.strip().upper()
        # Block any write / DDL statement
        for forbidden in ["CREATE", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER"]:
            if normalized.startswith(forbidden):
                raise sqlite3.OperationalError(f"Permission denied: Customer DW is strictly read-only ({forbidden})")
        return self._cur.execute(sql, *args, **kwargs)

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()


# ---------------------------------------------------------------------------
# Test 1: Task W - Connection Isolation & Zero Cross-Contamination
# ---------------------------------------------------------------------------

def test_connection_isolation_and_no_cross_contamination(monkeypatch, tmp_path):
    """Task W: Verify get_metadata_db_connection() and get_datasource_connection()
    never cross-contaminate and point to completely separate databases.
    """
    meta_file = str(tmp_path / "metadata_store.db")
    dw_file = str(tmp_path / "customer_dw.db")

    # Set up Customer DW with customer business tables only
    dw_conn = sqlite3.connect(dw_file)
    dw_cur = dw_conn.cursor()
    dw_cur.execute("CREATE TABLE customer_orders (id INTEGER PRIMARY KEY, amount REAL)")
    dw_cur.execute("INSERT INTO customer_orders VALUES (1, 100.50), (2, 250.00)")
    dw_conn.commit()
    dw_conn.close()

    # Route get_metadata_db_connection to meta_file
    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    # Route get_datasource_connection to dw_file
    monkeypatch.setattr(
        "dbgpt_analyst.adapters.bi_platform.get_active_connection",
        lambda read_only=True: (sqlite3.connect(dw_file), "sqlite"),
    )

    # 1. Obtain metadata connection
    meta_conn = get_metadata_db_connection(read_only=False)
    # 2. Obtain datasource connection
    dw_conn_inst, dialect = get_datasource_connection(read_only=True)

    # Verify they are physically distinct
    assert meta_conn is not dw_conn_inst
    assert dialect == "sqlite"

    # Query metadata conn for customer DW table -> must fail (table not in metadata)
    meta_cur = meta_conn.cursor()
    with pytest.raises(sqlite3.OperationalError):
        meta_cur.execute("SELECT * FROM customer_orders")

    # Query DW conn for customer DW table -> succeeds
    dw_cur = dw_conn_inst.cursor()
    dw_cur.execute("SELECT COUNT(*) FROM customer_orders")
    assert dw_cur.fetchone()[0] == 2

    meta_conn.close()
    dw_conn_inst.close()


# ---------------------------------------------------------------------------
# Test 2: Task W & U - Zero Metadata Tables in Customer DW
# ---------------------------------------------------------------------------

def test_bootstrap_zero_tables_in_customer_dw(monkeypatch, tmp_path):
    """Task W & U: Ensure bootstrap_analyst_metadata() creates ZERO metadata tables in customer DW."""
    meta_file = str(tmp_path / "metadata.db")
    dw_file = str(tmp_path / "customer_dw.db")

    # Initial DW state
    dw_conn = sqlite3.connect(dw_file)
    dw_cur = dw_conn.cursor()
    dw_cur.execute("CREATE TABLE sales (id INTEGER, amount REAL)")
    dw_conn.commit()
    dw_conn.close()

    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.libs.bi.connections.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.adapters.bi_platform.get_active_connection",
        lambda read_only=True: (sqlite3.connect(dw_file), "sqlite"),
    )

    # Run bootstrap
    bootstrap_analyst_metadata()

    # Check DW tables
    dw_conn = sqlite3.connect(dw_file)
    dw_cur = dw_conn.cursor()
    dw_cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    dw_tables = [row[0] for row in dw_cur.fetchall()]
    dw_conn.close()

    # DW should only contain customer table
    assert "sales" in dw_tables
    for meta_table in REQUIRED_METADATA_TABLES:
        assert meta_table not in dw_tables, f"Contamination: metadata table {meta_table} was created in customer DW!"


# ---------------------------------------------------------------------------
# Test 3: Task W - Read-Only Customer DW Immunity
# ---------------------------------------------------------------------------

def test_read_only_customer_dw_immunity(monkeypatch, tmp_path):
    """Task W: Ensure read-only customer DW permissions cannot cause metadata bootstrap crashes."""
    meta_file = str(tmp_path / "metadata.db")
    dw_file = str(tmp_path / "customer_dw.db")

    # Setup DW with customer table
    dw_raw = sqlite3.connect(dw_file)
    dw_raw.execute("CREATE TABLE products (id INT, name TEXT)")
    dw_raw.commit()
    dw_raw.close()

    dw_conn = sqlite3.connect(dw_file)
    read_only_dw = ReadOnlyDWConnection(dw_conn)

    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.libs.bi.connections.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.adapters.bi_platform.get_active_connection",
        lambda read_only=True: (read_only_dw, "sqlite"),
    )

    # Bootstrap should run completely without error even if DW is strictly read-only
    try:
        bootstrap_analyst_metadata()
    except Exception as e:
        pytest.fail(f"Bootstrap crashed when customer DW was read-only: {e}")


# ---------------------------------------------------------------------------
# Test 4: Task U & V - Cold-start bootstrap with conn=None (Production Startup)
# ---------------------------------------------------------------------------

def test_bootstrap_initializes_all_8_tables_with_conn_none(monkeypatch, tmp_path):
    """Task U & V: Ensure bootstrap_analyst_metadata() when called without conn parameter
    (as happens during server startup) initializes all 8 required tables in the metadata database.
    """
    meta_file = str(tmp_path / "test_app_metadata.db")

    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.libs.bi.connections.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )

    # Call bootstrap with NO arguments (exact production startup path)
    bootstrap_analyst_metadata()

    # Inspect created tables in metadata file
    conn = sqlite3.connect(meta_file)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    created_tables = {row[0] for row in cur.fetchall()}
    conn.close()

    for table in REQUIRED_METADATA_TABLES:
        assert table in created_tables, f"Missing required metadata table: {table}. Found tables: {created_tables}"


# ---------------------------------------------------------------------------
# Test 5: Task U & V - Explicit conn parameter bootstrap
# ---------------------------------------------------------------------------

def test_bootstrap_initializes_all_8_tables_with_explicit_conn(tmp_path):
    """Tasks U & V: Ensure bootstrap_analyst_metadata(conn=conn) initializes all tables when open conn is passed."""
    meta_file = str(tmp_path / "test_explicit_conn.db")
    conn = sqlite3.connect(meta_file)

    bootstrap_analyst_metadata(conn=conn)

    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    created_tables = {row[0] for row in cur.fetchall()}
    conn.close()

    for table in REQUIRED_METADATA_TABLES:
        assert table in created_tables, f"Missing table with explicit conn: {table}"


# ---------------------------------------------------------------------------
# Test 6: Task U & V - Direct ensure_tables(conn=None) behavior
# ---------------------------------------------------------------------------

def test_ensure_tables_conn_none_provisions_agent_experiences(monkeypatch, tmp_path):
    """Tasks U & V: Verify whether ensure_tables(conn=None) provisions agent_experiences table."""
    meta_file = str(tmp_path / "test_ensure_tables_direct.db")

    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )

    ensure_tables(conn=None)

    conn = sqlite3.connect(meta_file)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {r[0] for r in cur.fetchall()}
    conn.close()

    assert "golden_queries" in tables
    assert "schema_descriptions" in tables
    assert "agent_experiences" in tables, f"agent_experiences is missing from direct ensure_tables(conn=None)! Tables: {tables}"


# ---------------------------------------------------------------------------
# Test 7: Task D - Dual UNIQUE Indexes Valid Execution Paths
# ---------------------------------------------------------------------------

def test_dual_unique_indexes_standard_paths():
    """Task D: Test table_relationships intra-source and cross-source standard upsert paths."""
    conn = sqlite3.connect(":memory:")
    init_relationships_table(conn)
    cur = conn.cursor()

    # 1. Intra-source upserts
    cur.execute("""
        INSERT INTO table_relationships (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, confidence, confirmed)
        VALUES ('src_1', 'src_1', 'users', 'id', 'src_1', 'orders', 'user_id', 0.8, 1)
        ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE SET confidence = 0.8
    """)
    cur.execute("""
        INSERT INTO table_relationships (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, confidence, confirmed)
        VALUES ('src_2', 'src_2', 'users', 'id', 'src_2', 'orders', 'user_id', 0.9, 1)
        ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE SET confidence = 0.9
    """)
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM table_relationships")
    assert cur.fetchone()[0] == 2

    # 2. Cross-source upserts
    cur.execute("""
        INSERT INTO table_relationships (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, confidence, confirmed)
        VALUES ('fed_1', 'dw_east', 'users', 'id', 'dw_west', 'user_profiles', 'uid', 0.75, 1)
        ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE SET confidence = 0.75
    """)
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM table_relationships")
    assert cur.fetchone()[0] == 3
    conn.close()


# ---------------------------------------------------------------------------
# Test 8: Task V - Memory Layer Resilience (Unicode, Quotes, Special Chars)
# ---------------------------------------------------------------------------

def test_memory_layer_data_resilience(monkeypatch, tmp_path):
    """Task V: Stress-test memory operations against unicode, quotes, and JSON structures."""
    meta_file = str(tmp_path / "metadata_resilience.db")
    conn = sqlite3.connect(meta_file)
    ensure_tables(conn=conn)
    conn.close()

    monkeypatch.setattr(
        "dbgpt_analyst.common.db.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )
    monkeypatch.setattr(
        "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
        lambda read_only=False: sqlite3.connect(meta_file),
    )

    # 1. Query with quotes and SQL keywords
    tricky_nl = "Doanh thu năm 2026 của khách hàng 'VIP & Premium' là bao nhiêu? (tính cả VAT 10%)"
    tricky_sql = "SELECT sum(amount * 1.10) FROM orders WHERE customer_tag = 'VIP & Premium' AND strftime('%Y', date) = '2026'"
    qid = store_query(
        nl_query=tricky_nl,
        sql_query=tricky_sql,
        table_names=["orders", "customer_tags"],
        datasource="sales_dw",
    )
    assert qid is not None

    recalled = recall_queries("Doanh thu năm 2026")
    assert len(recalled) >= 1
    assert recalled[0]["nl_query"] == tricky_nl

    # 2. Store and recall agent experiences with complex structures
    exp_id = store_experience(
        context_summary="Cần cẩn thận với múi giờ GMT+7 khi lọc theo ngày",
        pattern="SELECT * FROM table WHERE condition",
        pitfalls="Không dùng datetime('now') trần trụi",
        agent_name="sql_agent",
        task_input="Lọc theo ngày hôm nay",
        task_output="WHERE date = date('now', '+7 hours')",
    )
    assert exp_id is not None

    exps = recall_experiences("Cần cẩn thận với múi giờ", agent_name="sql_agent")
    assert len(exps) >= 1
    assert "múi giờ GMT+7" in exps[0]["context_summary"]
