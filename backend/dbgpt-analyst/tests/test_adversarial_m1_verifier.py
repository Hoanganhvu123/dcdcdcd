"""Empirical Adversarial Challenge Suite for Milestone 1 (m1_it2_challenger_2).

Strictly challenges:
1. Cold start of memory tables (`ensure_tables(conn=None)` and `_ensure_experience_table(conn=None)`).
2. Elimination of `sqlite3.ProgrammingError: Cannot operate on a closed database` under all initialization orders and repeated invocations.
3. Zero connection leakage in `get_confirmed_relationships()` across diverse runtime exceptions.
4. Strict physical and logical separation: metadata operations never connect to Customer DW, and DW queries never connect to metadata store.
"""

import os
import sqlite3
import threading
import random
from unittest.mock import MagicMock, patch
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
    list_experiences,
    _ensure_experience_table,
)


# ===========================================================================
# HELPER: Spy / Tracking Connection for Empirical Leak & Lifecycle Detection
# ===========================================================================

class TrackingConnection:
    """Connection wrapper that records open/close lifecycles and permits fault injection."""
    def __init__(self, inner: sqlite3.Connection):
        self._inner = inner
        self.dialect = "sqlite"
        self.closed = False
        self.close_count = 0
        self.cursor_created_count = 0
        self.fault_on_execute = None
        self.fault_on_fetchall = None
        self.fault_on_description = None

    def cursor(self):
        if self.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        self.cursor_created_count += 1
        return TrackingCursor(self, self._inner.cursor())

    def commit(self):
        if self.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        return self._inner.commit()

    def rollback(self):
        if self.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        return self._inner.rollback()

    def close(self):
        self.close_count += 1
        self.closed = True
        return self._inner.close()

    @property
    def is_closed(self) -> bool:
        return self.closed


class TrackingCursor:
    def __init__(self, conn: TrackingConnection, inner: sqlite3.Cursor):
        self._conn = conn
        self._inner = inner

    def execute(self, sql, *args, **kwargs):
        if self._conn.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        if self._conn.fault_on_execute:
            raise self._conn.fault_on_execute
        return self._inner.execute(sql, *args, **kwargs)

    def fetchall(self):
        if self._conn.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        if self._conn.fault_on_fetchall:
            raise self._conn.fault_on_fetchall
        return self._inner.fetchall()

    def fetchone(self):
        if self._conn.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        return self._inner.fetchone()

    @property
    def description(self):
        if self._conn.fault_on_description:
            raise self._conn.fault_on_description
        return self._inner.description

    def close(self):
        return self._inner.close()


class StrictReadOnlyDWConnection:
    """Mock connection representing a customer data warehouse that strictly forbids DDL/DML."""
    def __init__(self, inner: sqlite3.Connection):
        self._inner = inner
        self.dialect = "sqlite"
        self.write_attempts = []

    def cursor(self):
        return StrictReadOnlyDWCursor(self, self._inner.cursor())

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        self._inner.close()


class StrictReadOnlyDWCursor:
    def __init__(self, conn: StrictReadOnlyDWConnection, inner: sqlite3.Cursor):
        self._conn = conn
        self._inner = inner

    def execute(self, sql: str, *args, **kwargs):
        upper_sql = sql.strip().upper()
        for forbidden in ("CREATE", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE"):
            if upper_sql.startswith(forbidden):
                self._conn.write_attempts.append(sql)
                raise sqlite3.OperationalError(
                    f"PERMISSION DENIED: Customer DW is read-only. Blocked command: {sql[:30]}..."
                )
        return self._inner.execute(sql, *args, **kwargs)

    def fetchall(self):
        return self._inner.fetchall()

    def fetchone(self):
        return self._inner.fetchone()

    def close(self):
        return self._inner.close()


# ===========================================================================
# CHALLENGE 1 & 2: Cold Start & SQLite Closed Database Immunity
# ===========================================================================

class TestMemoryTablesColdStartAndLifecycle:
    """Challenge 1 & 2: Cold start of memory tables and connection lifecycle integrity."""

    def test_ensure_tables_conn_none_provisions_all_three_tables_clean(self, monkeypatch, tmp_path):
        """Cold start with conn=None: must cleanly provision golden_queries, schema_descriptions, agent_experiences."""
        db_file = str(tmp_path / "cold_start_none.db")
        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_file),
        )

        ensure_tables(conn=None)

        verify_conn = sqlite3.connect(db_file)
        cur = verify_conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cur.fetchall()}
        verify_conn.close()

        assert "golden_queries" in tables
        assert "schema_descriptions" in tables
        assert "agent_experiences" in tables

    def test_ensure_experience_table_conn_none_direct_call(self, monkeypatch, tmp_path):
        """Direct call to _ensure_experience_table(conn=None) must provision table and close connection."""
        db_file = str(tmp_path / "cold_start_exp_none.db")
        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_file),
        )

        _ensure_experience_table(conn=None)

        verify_conn = sqlite3.connect(db_file)
        cur = verify_conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cur.fetchall()}
        verify_conn.close()

        assert "agent_experiences" in tables

    def test_ensure_tables_with_caller_managed_connection_does_not_close_caller_conn(self, tmp_path):
        """When caller provides an open connection, ensure_tables MUST NOT close it."""
        db_file = str(tmp_path / "caller_conn.db")
        raw_conn = sqlite3.connect(db_file)
        tracking_conn = TrackingConnection(raw_conn)

        ensure_tables(conn=tracking_conn)

        # Connection MUST still be open
        assert not tracking_conn.is_closed
        assert tracking_conn.close_count == 0

        # Caller can continue executing queries on the same connection
        cur = tracking_conn.cursor()
        cur.execute("SELECT COUNT(*) FROM golden_queries")
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT COUNT(*) FROM agent_experiences")
        assert cur.fetchone()[0] == 0
        tracking_conn.close()
        assert tracking_conn.is_closed

    def test_ensure_experience_table_with_caller_managed_conn_does_not_close_caller_conn(self, tmp_path):
        """When caller passes open conn to _ensure_experience_table, conn must stay open."""
        db_file = str(tmp_path / "caller_exp_conn.db")
        raw_conn = sqlite3.connect(db_file)
        tracking_conn = TrackingConnection(raw_conn)

        _ensure_experience_table(conn=tracking_conn)

        assert not tracking_conn.is_closed
        assert tracking_conn.close_count == 0

        cur = tracking_conn.cursor()
        cur.execute("SELECT COUNT(*) FROM agent_experiences")
        assert cur.fetchone()[0] == 0
        tracking_conn.close()

    def test_all_initialization_order_permutations_never_raise_closed_database(self, monkeypatch, tmp_path):
        """Stress-test permutations of initialization order to guarantee no ProgrammingError."""
        db_file = str(tmp_path / "perm_test.db")
        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_file),
        )
        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_file),
        )

        # Permutation 1: _ensure_experience_table(None) -> ensure_tables(None)
        _ensure_experience_table(conn=None)
        ensure_tables(conn=None)

        # Permutation 2: ensure_tables(None) -> _ensure_experience_table(None)
        ensure_tables(conn=None)
        _ensure_experience_table(conn=None)

        # Permutation 3: 50 repeated sequential ensure_tables calls (idempotency check)
        for _ in range(50):
            ensure_tables(conn=None)
            _ensure_experience_table(conn=None)

        # Permutation 4: Interleaving with real CRUD operations
        store_query(
            nl_query="Total revenue in Q1 2026?",
            sql_query="SELECT sum(rev) FROM q1_sales",
            table_names=["q1_sales"],
        )
        ensure_tables(conn=None)
        store_experience(
            context_summary="Test context summary",
            pattern="SELECT * FROM table",
            pitfalls="Avoid full table scans",
            agent_name="sql_agent",
        )
        _ensure_experience_table(conn=None)

        recalled_q = recall_queries("Total revenue")
        assert len(recalled_q) >= 1
        recalled_e = recall_experiences("Test context", agent_name="sql_agent")
        assert len(recalled_e) >= 1

    def test_concurrent_cold_start_bootstrap(self, monkeypatch, tmp_path):
        """Stress-test concurrent calls to ensure_tables(None) and bootstrap_analyst_metadata()."""
        db_file = str(tmp_path / "concurrent_meta.db")
        # Enable WAL mode first
        init_conn = sqlite3.connect(db_file)
        init_conn.execute("PRAGMA journal_mode=WAL;")
        init_conn.close()

        def get_conn(read_only=False):
            return sqlite3.connect(db_file, timeout=20.0)

        monkeypatch.setattr("dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection", get_conn)
        monkeypatch.setattr("dbgpt_analyst.libs.bi.connections.get_metadata_db_connection", get_conn)
        monkeypatch.setattr("dbgpt_analyst.common.db.get_metadata_db_connection", get_conn)

        errors = []
        def worker():
            try:
                for _ in range(10):
                    action = random.choice(["bootstrap", "ensure", "ensure_exp"])
                    if action == "bootstrap":
                        bootstrap_analyst_metadata(conn=None)
                    elif action == "ensure":
                        ensure_tables(conn=None)
                    elif action == "ensure_exp":
                        _ensure_experience_table(conn=None)
            except Exception as e:
                errors.append((type(e).__name__, str(e)))

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Concurrent initialization errors: {errors}"


# ===========================================================================
# CHALLENGE 3: Connection Leak Immunity in get_confirmed_relationships
# ===========================================================================

class TestGetConfirmedRelationshipsLeakImmunity:
    """Challenge 3: Verify get_confirmed_relationships never leaks connections even on exceptions."""

    def test_normal_execution_closes_connection(self, monkeypatch, tmp_path):
        """Happy path: get_confirmed_relationships opens and deterministically closes connection."""
        db_file = str(tmp_path / "normal_meta.db")
        init_conn = sqlite3.connect(db_file)
        init_relationships_table(init_conn)
        init_conn.close()

        opened_conns = []

        def tracked_get_metadata_conn(read_only=True):
            conn = TrackingConnection(sqlite3.connect(db_file))
            opened_conns.append(conn)
            return conn

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            tracked_get_metadata_conn,
        )

        res = get_confirmed_relationships()
        assert res == []
        assert len(opened_conns) == 1
        assert opened_conns[0].is_closed is True
        assert opened_conns[0].close_count == 1

    def test_exception_during_execute_closes_connection(self, monkeypatch, tmp_path):
        """Fault injection: exception raised during cursor.execute() must not leak connection."""
        db_file = str(tmp_path / "fault_exec.db")
        opened_conns = []

        def tracked_get_metadata_conn(read_only=True):
            conn = TrackingConnection(sqlite3.connect(db_file))
            conn.fault_on_execute = sqlite3.OperationalError("Simulated disk error or missing table")
            opened_conns.append(conn)
            return conn

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            tracked_get_metadata_conn,
        )

        res = get_confirmed_relationships()
        assert res == []
        assert len(opened_conns) == 1
        assert opened_conns[0].is_closed is True
        assert opened_conns[0].close_count == 1

    def test_exception_during_fetchall_closes_connection(self, monkeypatch, tmp_path):
        """Fault injection: exception raised during cursor.fetchall() must not leak connection."""
        db_file = str(tmp_path / "fault_fetch.db")
        init_conn = sqlite3.connect(db_file)
        init_relationships_table(init_conn)
        init_conn.close()

        opened_conns = []

        def tracked_get_metadata_conn(read_only=True):
            conn = TrackingConnection(sqlite3.connect(db_file))
            conn.fault_on_fetchall = sqlite3.DatabaseError("Corrupt database page on fetchall")
            opened_conns.append(conn)
            return conn

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            tracked_get_metadata_conn,
        )

        res = get_confirmed_relationships()
        assert res == []
        assert len(opened_conns) == 1
        assert opened_conns[0].is_closed is True

    def test_exception_during_description_access_closes_connection(self, monkeypatch, tmp_path):
        """Fault injection: exception raised during cursor.description access must not leak connection."""
        db_file = str(tmp_path / "fault_desc.db")
        init_conn = sqlite3.connect(db_file)
        init_relationships_table(init_conn)
        init_conn.close()

        opened_conns = []

        def tracked_get_metadata_conn(read_only=True):
            conn = TrackingConnection(sqlite3.connect(db_file))
            conn.fault_on_description = RuntimeError("Simulated driver bug in cursor.description")
            opened_conns.append(conn)
            return conn

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            tracked_get_metadata_conn,
        )

        res = get_confirmed_relationships()
        assert res == []
        assert len(opened_conns) == 1
        assert opened_conns[0].is_closed is True

    def test_100_random_fault_injections_zero_connection_leaks(self, monkeypatch, tmp_path):
        """High-iteration stress test with randomized faults: 100% of opened connections must be closed."""
        db_file = str(tmp_path / "random_faults.db")
        init_conn = sqlite3.connect(db_file)
        init_relationships_table(init_conn)
        init_conn.close()

        opened_conns = []

        def tracked_factory(read_only=True):
            conn = TrackingConnection(sqlite3.connect(db_file))
            fault_mode = random.choice(["none", "exec", "fetch", "desc"])
            if fault_mode == "exec":
                conn.fault_on_execute = sqlite3.OperationalError("Random execute fault")
            elif fault_mode == "fetch":
                conn.fault_on_fetchall = sqlite3.DatabaseError("Random fetch fault")
            elif fault_mode == "desc":
                conn.fault_on_description = RuntimeError("Random desc fault")
            opened_conns.append(conn)
            return conn

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            tracked_factory,
        )

        for i in range(100):
            source_filter = f"src_{i % 5}" if i % 2 == 0 else None
            _ = get_confirmed_relationships(source_id=source_filter)

        assert len(opened_conns) == 100
        unclosed = [c for c in opened_conns if not c.is_closed]
        assert len(unclosed) == 0, f"Found {len(unclosed)} unclosed/leaked connections!"


# ===========================================================================
# CHALLENGE 4: Strict Separation of Metadata Operations and Customer DW
# ===========================================================================

class TestStrictMetadataAndDWSeparation:
    """Challenge 4: Verify metadata operations never touch customer DW, and DW queries never touch metadata store."""

    def test_metadata_operations_zero_interaction_with_customer_dw(self, monkeypatch, tmp_path):
        """Full suite of metadata operations against a strictly read-only customer DW mock."""
        meta_file = str(tmp_path / "meta_strict.db")
        dw_file = str(tmp_path / "customer_dw.db")

        # Create customer DW with business table
        raw_dw = sqlite3.connect(dw_file)
        raw_dw.execute("CREATE TABLE dim_customers (cust_id INT, cust_name TEXT)")
        raw_dw.execute("INSERT INTO dim_customers VALUES (101, 'Acme Corp')")
        raw_dw.commit()
        raw_dw.close()

        strict_dw_conn = StrictReadOnlyDWConnection(sqlite3.connect(dw_file))

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
            lambda read_only=True: (strict_dw_conn, "sqlite"),
        )

        # 1. Run bootstrap
        bootstrap_analyst_metadata()

        # 2. Run memory writes
        store_query("What is Acme's ID?", "SELECT cust_id FROM dim_customers WHERE cust_name = 'Acme Corp'")
        store_experience(
            context_summary="Querying customer dim table",
            pattern="WHERE cust_name = ?",
            pitfalls="Use exact index lookup",
            agent_name="sql_agent",
        )
        upsert_description("dim_customers", "cust_id", description="Primary customer identifier")

        # 3. Read confirmed relationships
        _ = get_confirmed_relationships()

        # Verify: STRICTLY 0 write attempts were routed to Customer DW
        assert len(strict_dw_conn.write_attempts) == 0, (
            f"Customer DW received illegal write attempts during metadata operations: {strict_dw_conn.write_attempts}"
        )

        # Verify: DW contains ONLY customer table
        chk_dw = sqlite3.connect(dw_file)
        chk_cur = chk_dw.cursor()
        chk_cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in chk_cur.fetchall()]
        chk_dw.close()
        assert tables == ["dim_customers"]

    def test_dw_queries_never_query_internal_metadata_store(self, monkeypatch, tmp_path):
        """Customer DW queries routed via get_datasource_connection() query only DW."""
        meta_file = str(tmp_path / "meta_store.db")
        dw_file = str(tmp_path / "dw_store.db")

        # Bootstrap metadata DB
        m_conn = sqlite3.connect(meta_file)
        bootstrap_analyst_metadata(conn=m_conn)
        m_conn.close()

        # Setup DW with business data
        dw_raw = sqlite3.connect(dw_file)
        dw_raw.execute("CREATE TABLE fact_transactions (tx_id INT, amount REAL)")
        dw_raw.execute("INSERT INTO fact_transactions VALUES (1, 500.0)")
        dw_raw.commit()
        dw_raw.close()

        monkeypatch.setattr(
            "dbgpt_analyst.adapters.bi_platform.get_active_connection",
            lambda read_only=True: (sqlite3.connect(dw_file), "sqlite"),
        )
        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(meta_file),
        )

        # Query datasource connection
        dw_conn, dialect = get_datasource_connection(read_only=True)
        cur = dw_conn.cursor()
        cur.execute("SELECT amount FROM fact_transactions WHERE tx_id = 1")
        row = cur.fetchone()
        assert row[0] == 500.0

        # Confirm that metadata tables do not exist in DW
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        dw_tables = {r[0] for r in cur.fetchall()}
        assert "fact_transactions" in dw_tables
        assert "golden_queries" not in dw_tables
        assert "table_relationships" not in dw_tables
        dw_conn.close()
