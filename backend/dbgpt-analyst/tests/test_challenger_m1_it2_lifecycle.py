"""Adversarial stress test suite for M1 Lifecycle Bootstrap, Memory Provisioning & Connection Leak Prevention.
Authored by m1_it2_challenger_2 (M1 Lifecycle & Leak Challenger).

Coverage:
1. ensure_tables(conn=None) cold start on fresh SQLite & PostgreSQL connections:
   - golden_queries, schema_descriptions, and agent_experiences tables are ALL created.
   - Connection is not closed prematurely before _ensure_experience_table.
   - Caller connection is preserved (not closed) when passed explicitly.
2. bootstrap_analyst_metadata() idempotency:
   - 10-iteration loop on empty SQLite database.
   - 10-iteration loop on pre-populated database with data integrity checks.
   - 10-iteration loop with conn=None (opening/closing per call).
   - 10-iteration loop on simulated PostgreSQL connection.
3. Exception Injection & Resource Leak Prevention:
   - Cursor failure during table creation verifies connection closure in finally: block.
   - Connection rollback invoked on failure.
   - Caller-owned connections are never prematurely closed on error.
   - Subroutine failure inside ensure_tables guarantees parent cleanup.
"""

import sqlite3
import pytest
from unittest.mock import MagicMock, patch

from dbgpt_analyst.common.db import (
    get_db_connection,
    get_metadata_db_connection,
)
from dbgpt_analyst.libs.bi import (
    bootstrap_analyst_metadata,
    init_db_connections_table,
    init_history_table,
    init_relationships_table,
)
from dbgpt_analyst.memory.memory_experiment import (
    ensure_tables,
    _ensure_experience_table,
    store_query,
    recall_queries,
    store_experience,
    recall_experiences,
    upsert_description,
    get_descriptions,
)

ALL_REQUIRED_TABLES = [
    "table_relationships",
    "golden_queries",
    "schema_descriptions",
    "agent_experiences",
    "excel_db_connections",
    "datasource_schema_cache",
    "excel_column_definitions",
    "query_lineage",
    "excel_formula_reports_history",
]


class TrackedConnection:
    """Wrapper around sqlite3.Connection that records method calls (close, commit, rollback)."""
    def __init__(self, inner_conn: sqlite3.Connection):
        self._inner = inner_conn
        self.dialect = "sqlite"
        self.close_count = 0
        self.commit_count = 0
        self.rollback_count = 0
        self.cursor_created_count = 0
        self.history_events = []

    def cursor(self):
        self.cursor_created_count += 1
        return TrackedCursor(self._inner.cursor(), self)

    def commit(self):
        self.commit_count += 1
        self.history_events.append("commit")
        return self._inner.commit()

    def rollback(self):
        self.rollback_count += 1
        self.history_events.append("rollback")
        return self._inner.rollback()

    def close(self):
        self.close_count += 1
        self.history_events.append("close")
        return self._inner.close()

    def execute(self, *args, **kwargs):
        return self._inner.execute(*args, **kwargs)


class TrackedCursor:
    """Cursor wrapper for call tracking and error injection."""
    def __init__(self, inner_cur: sqlite3.Cursor, parent_conn: TrackedConnection):
        self._cur = inner_cur
        self.parent = parent_conn

    def execute(self, sql, *args, **kwargs):
        self.parent.history_events.append(f"execute: {sql.strip()[:40]}")
        return self._cur.execute(sql, *args, **kwargs)

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur)


# ===========================================================================
# SUITE 1: ensure_tables Cold Start & Premature Close Prevention
# ===========================================================================

class TestEnsureTablesColdStartAndLifecycle:
    """Adversarial tests for ensure_tables lifecycle on fresh SQLite and PostgreSQL."""

    def test_ensure_tables_cold_start_sqlite_conn_none(self, monkeypatch, tmp_path):
        """Verify cold start on fresh SQLite DB with conn=None creates ALL 3 memory tables."""
        db_path = str(tmp_path / "cold_start_meta.db")
        created_connections = []

        def tracked_get_conn(read_only=False):
            conn = TrackedConnection(sqlite3.connect(db_path))
            created_connections.append(conn)
            return conn

        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            tracked_get_conn,
        )

        ensure_tables(conn=None)

        # Verify connection lifecycle: created conn was closed in finally: exactly once
        assert len(created_connections) == 1
        assert created_connections[0].close_count == 1

        # Inspect database on disk to verify tables and schema completeness
        verify_conn = sqlite3.connect(db_path)
        cur = verify_conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cur.fetchall()}

        assert "golden_queries" in tables, "golden_queries was not created!"
        assert "schema_descriptions" in tables, "schema_descriptions was not created!"
        assert "agent_experiences" in tables, "agent_experiences was not created!"

        # Verify column structure of golden_queries
        cur.execute("PRAGMA table_info(golden_queries)")
        gq_cols = {r[1] for r in cur.fetchall()}
        for col in ["id", "nl_query", "sql_query", "table_names", "tags", "datasource",
                    "experience_notes", "pattern_tags", "distilled_at", "created_at"]:
            assert col in gq_cols, f"Column {col} missing in golden_queries"

        # Verify column structure of agent_experiences
        cur.execute("PRAGMA table_info(agent_experiences)")
        exp_cols = {r[1] for r in cur.fetchall()}
        for col in ["id", "context_summary", "pattern", "pitfalls", "agent_name",
                    "task_input", "task_output", "created_at"]:
            assert col in exp_cols, f"Column {col} missing in agent_experiences"

        # Verify column structure of schema_descriptions
        cur.execute("PRAGMA table_info(schema_descriptions)")
        sd_cols = {r[1] for r in cur.fetchall()}
        for col in ["id", "item_type", "model_name", "item_name", "description",
                    "data_type", "is_calculated", "is_primary_key", "relationships", "mdl_hash"]:
            assert col in sd_cols, f"Column {col} missing in schema_descriptions"

        # Verify indexes
        cur.execute("PRAGMA index_list(golden_queries)")
        gq_indexes = {r[1] for r in cur.fetchall()}
        assert "idx_gq_nl_btree" in gq_indexes

        cur.execute("PRAGMA index_list(schema_descriptions)")
        sd_indexes = {r[1] for r in cur.fetchall()}
        assert "idx_sd_model" in sd_indexes

        cur.execute("PRAGMA index_list(agent_experiences)")
        exp_indexes = {r[1] for r in cur.fetchall()}
        assert "idx_exp_context_btree" in exp_indexes

        verify_conn.close()

    def test_ensure_tables_caller_connection_is_not_closed(self):
        """Verify that passing an open connection to ensure_tables does NOT close caller's connection."""
        raw_conn = sqlite3.connect(":memory:")
        tracked = TrackedConnection(raw_conn)

        ensure_tables(conn=tracked)

        # Connection must STILL be open and close_count == 0
        assert tracked.close_count == 0
        # Should be able to query tables on this same open connection
        cur = tracked.cursor()
        cur.execute("SELECT count(*) FROM agent_experiences")
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT count(*) FROM golden_queries")
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT count(*) FROM schema_descriptions")
        assert cur.fetchone()[0] == 0

        tracked.close()
        assert tracked.close_count == 1

    def test_ensure_tables_connection_not_closed_before_experience_table(self):
        """Verify the execution sequence: close is called strictly AFTER _ensure_experience_table."""
        raw_conn = sqlite3.connect(":memory:")
        tracked = TrackedConnection(raw_conn)

        # Track execution event ordering
        with patch("dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection", return_value=tracked):
            ensure_tables(conn=None)

        events = tracked.history_events
        # Check that agent_experiences table creation execute appears BEFORE the close event
        exp_exec_indices = [i for i, e in enumerate(events) if "agent_experiences" in e]
        close_indices = [i for i, e in enumerate(events) if e == "close"]

        assert len(exp_exec_indices) > 0, "No agent_experiences execution found in event history"
        assert len(close_indices) == 1, f"Expected 1 close event, found {len(close_indices)}"
        assert max(exp_exec_indices) < close_indices[0], (
            f"Premature close detected! agent_experiences executed at {exp_exec_indices}, but closed at {close_indices[0]}"
        )

    def test_ensure_experience_table_standalone_conn_none(self, monkeypatch, tmp_path):
        """Verify _ensure_experience_table(conn=None) works standalone and closes its own connection."""
        db_path = str(tmp_path / "exp_standalone.db")
        created_conns = []

        def tracked_get_conn(read_only=False):
            conn = TrackedConnection(sqlite3.connect(db_path))
            created_conns.append(conn)
            return conn

        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            tracked_get_conn,
        )

        _ensure_experience_table(conn=None)

        assert len(created_conns) == 1
        assert created_conns[0].close_count == 1

        vconn = sqlite3.connect(db_path)
        cur = vconn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_experiences'")
        assert cur.fetchone() is not None
        vconn.close()

    def test_ensure_tables_simulated_postgres_ddl_and_indexes(self):
        """Verify PostgreSQL DDL execution path and dialect branching (trgm index & alters)."""
        mock_pg_conn = MagicMock()
        mock_pg_conn.dialect = "postgresql"
        # Ensure it's not detected as sqlite
        type(mock_pg_conn).__name__ = "PgConnection"

        mock_cursor = MagicMock()
        mock_pg_conn.cursor.return_value = mock_cursor

        executed_statements = []

        def record_execute(sql, *args, **kwargs):
            executed_statements.append(sql.strip())

        mock_cursor.execute.side_effect = record_execute

        ensure_tables(conn=mock_pg_conn)

        # Check PG DDL statements executed
        all_sql = "\n".join(executed_statements)
        assert "CREATE TABLE IF NOT EXISTS golden_queries" in all_sql
        assert "SERIAL PRIMARY KEY" in all_sql
        assert "CREATE TABLE IF NOT EXISTS schema_descriptions" in all_sql
        assert "CREATE TABLE IF NOT EXISTS agent_experiences" in all_sql
        assert "idx_sd_model" in all_sql
        assert "idx_gq_nl_trgm" in all_sql or "idx_gq_nl_btree" in all_sql
        assert "idx_exp_context_trgm" in all_sql or "idx_exp_context_btree" in all_sql

        # Because conn was passed by caller, close must NOT be called on mock_pg_conn
        assert mock_pg_conn.close.call_count == 0


# ===========================================================================
# SUITE 2: bootstrap_analyst_metadata Idempotency (10x Loop Stress)
# ===========================================================================

class TestBootstrapMetadataIdempotency:
    """Adversarial stress-testing of bootstrap_analyst_metadata 10x repeated execution."""

    def test_bootstrap_idempotency_10x_empty_sqlite(self):
        """Call bootstrap_analyst_metadata 10 times in a loop on fresh SQLite DB."""
        conn = sqlite3.connect(":memory:")

        for iteration in range(1, 11):
            try:
                bootstrap_analyst_metadata(conn=conn)
            except Exception as e:
                pytest.fail(f"bootstrap_analyst_metadata failed on iteration {iteration}: {e}")

        # Verify all 9 tables exist and are empty
        cur = conn.cursor()
        for tbl in ALL_REQUIRED_TABLES:
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            count = cur.fetchone()[0]
            assert count == 0, f"Table {tbl} should be empty"

        conn.close()

    def test_bootstrap_idempotency_10x_prepopulated_sqlite(self):
        """Call bootstrap_analyst_metadata 10 times on a pre-populated DB; assert zero data loss."""
        conn = sqlite3.connect(":memory:")
        # 1. Initial bootstrap
        bootstrap_analyst_metadata(conn=conn)

        cur = conn.cursor()

        # 2. Populate real data into all 9 tables
        cur.execute("INSERT INTO excel_db_connections (name, db_type, connection_string) VALUES ('dw1', 'postgresql', 'postgresql://localhost/dw')")
        cur.execute("INSERT INTO datasource_schema_cache (source_id, table_name, columns_json) VALUES (1, 'sales', '[]')")
        cur.execute("INSERT INTO excel_column_definitions (table_name, column_name, description) VALUES ('sales', 'rev', 'Revenue in VND')")
        cur.execute("INSERT INTO query_lineage (actor_type, actor_id, source_id, table_name, query_sql) VALUES ('agent', 'a1', 1, 'sales', 'SELECT 1')")
        cur.execute("INSERT INTO excel_formula_reports_history (title, prompt, template_html, table_names) VALUES ('Report 1', 'Prompt 1', '<html/>', 'sales')")
        cur.execute("INSERT INTO table_relationships (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, confirmed) VALUES ('1', '1', 'sales', 'cust_id', '1', 'customers', 'id', 'LEFT', 0.95, 1)")
        cur.execute("INSERT INTO golden_queries (nl_query, sql_query, datasource) VALUES ('Total revenue?', 'SELECT sum(rev) FROM sales', 'dw1')")
        cur.execute("INSERT INTO schema_descriptions (item_type, model_name, item_name, description) VALUES ('table', 'sales', 'sales', 'Sales transactions')")
        cur.execute("INSERT INTO agent_experiences (context_summary, pattern, agent_name) VALUES ('Aggregating monthly sales', 'GROUP BY month', 'sql_agent')")
        conn.commit()

        # Verify all 9 tables have count == 1
        for tbl in ALL_REQUIRED_TABLES:
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            assert cur.fetchone()[0] == 1, f"Initial insert into {tbl} failed"

        # 3. Stress-test: call bootstrap 10 times consecutively
        for iteration in range(1, 11):
            try:
                bootstrap_analyst_metadata(conn=conn)
            except Exception as e:
                pytest.fail(f"bootstrap failed on pre-populated DB iteration {iteration}: {e}")

        # 4. Assert zero data loss and data integrity across all 9 tables
        for tbl in ALL_REQUIRED_TABLES:
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            assert cur.fetchone()[0] == 1, f"Table {tbl} row count changed after bootstrap loop! Data loss/corruption occurred."

        # Verify specific content integrity
        cur.execute("SELECT nl_query, sql_query FROM golden_queries")
        row = cur.fetchone()
        assert row == ("Total revenue?", "SELECT sum(rev) FROM sales")

        cur.execute("SELECT from_table, to_table, confidence, confirmed FROM table_relationships")
        rel_row = cur.fetchone()
        assert rel_row == ("sales", "customers", 0.95, 1)

        conn.close()

    def test_bootstrap_idempotency_10x_conn_none(self, monkeypatch, tmp_path):
        """Call bootstrap_analyst_metadata 10 times with conn=None (managing separate connection lifecycles)."""
        db_path = str(tmp_path / "bootstrap_loop_none.db")

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_path),
        )
        monkeypatch.setattr(
            "dbgpt_analyst.libs.bi.connections.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_path),
        )
        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_path),
        )

        for iteration in range(1, 11):
            try:
                bootstrap_analyst_metadata(conn=None)
            except Exception as e:
                pytest.fail(f"bootstrap(conn=None) failed on iteration {iteration}: {e}")

        # Verify final database state
        vconn = sqlite3.connect(db_path)
        cur = vconn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {r[0] for r in cur.fetchall()}
        for tbl in ALL_REQUIRED_TABLES:
            assert tbl in tables, f"Missing table {tbl} after 10x loop"
        vconn.close()

    def test_bootstrap_idempotency_10x_postgres_mock(self):
        """Call bootstrap_analyst_metadata 10 times on simulated PostgreSQL connection."""
        mock_pg_conn = MagicMock()
        mock_pg_conn.dialect = "postgresql"
        type(mock_pg_conn).__name__ = "PgConnection"
        mock_cur = MagicMock()
        mock_pg_conn.cursor.return_value = mock_cur

        for iteration in range(1, 11):
            try:
                bootstrap_analyst_metadata(conn=mock_pg_conn)
            except Exception as e:
                pytest.fail(f"Postgres mock bootstrap failed on iteration {iteration}: {e}")

        assert mock_pg_conn.close.call_count == 0


# ===========================================================================
# SUITE 3: Exception Injection & Resource Leak Prevention
# ===========================================================================

class TestExceptionInjectionAndLeakPrevention:
    """Adversarially inject cursor and DB exceptions to verify deterministic resource cleanup."""

    def test_ensure_tables_exception_closes_self_created_conn(self, monkeypatch):
        """When conn=None and cursor.execute raises an exception in ensure_tables, connection MUST be closed."""
        tracked_conn = TrackedConnection(sqlite3.connect(":memory:"))

        class FaultyCursor:
            def execute(self, sql, *args, **kwargs):
                raise sqlite3.OperationalError("Simulated disk error during CREATE TABLE")
            def fetchone(self):
                return None
            def fetchall(self):
                return []

        # Patch cursor to return FaultyCursor
        monkeypatch.setattr(tracked_conn, "cursor", lambda: FaultyCursor())
        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            lambda read_only=False: tracked_conn,
        )

        with pytest.raises(sqlite3.OperationalError, match="Simulated disk error"):
            ensure_tables(conn=None)

        # Connection MUST have been closed in finally:
        assert tracked_conn.close_count == 1, "Connection was leaked on cursor exception in ensure_tables!"
        assert tracked_conn.rollback_count >= 1, "Rollback was not invoked on exception!"

    def test_ensure_tables_exception_preserves_caller_conn(self):
        """When conn is provided by caller, cursor exception should rollback but NOT close caller conn."""
        tracked_conn = TrackedConnection(sqlite3.connect(":memory:"))

        class FaultyCursor:
            def execute(self, sql, *args, **kwargs):
                raise sqlite3.OperationalError("Simulated execution failure")
            def fetchone(self):
                return None
            def fetchall(self):
                return []

        tracked_conn.cursor = lambda: FaultyCursor()

        with pytest.raises(sqlite3.OperationalError):
            ensure_tables(conn=tracked_conn)

        # Caller connection must NOT be closed (caller manages lifecycle)
        assert tracked_conn.close_count == 0, "ensure_tables unexpectedly closed caller-owned connection on error!"
        assert tracked_conn.rollback_count >= 1

        tracked_conn.close()

    def test_ensure_experience_table_exception_closes_conn(self, monkeypatch):
        """When _ensure_experience_table(conn=None) fails, its self-created connection MUST be closed."""
        tracked_conn = TrackedConnection(sqlite3.connect(":memory:"))

        class FaultyCursor:
            def execute(self, sql, *args, **kwargs):
                raise sqlite3.DatabaseError("Corrupted database page")

        monkeypatch.setattr(tracked_conn, "cursor", lambda: FaultyCursor())
        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            lambda read_only=False: tracked_conn,
        )

        with pytest.raises(sqlite3.DatabaseError, match="Corrupted database page"):
            _ensure_experience_table(conn=None)

        assert tracked_conn.close_count == 1, "Connection was leaked in _ensure_experience_table!"
        assert tracked_conn.rollback_count >= 1

    def test_init_relationships_table_exception_closes_conn(self, monkeypatch):
        """When init_relationships_table(conn=None) fails, its self-created connection MUST be closed."""
        tracked_conn = TrackedConnection(sqlite3.connect(":memory:"))

        class FaultyCursor:
            def execute(self, sql, *args, **kwargs):
                raise sqlite3.OperationalError("Lock timeout during DDL")

        monkeypatch.setattr(tracked_conn, "cursor", lambda: FaultyCursor())
        monkeypatch.setattr(
            "dbgpt_analyst.libs.bi.connections.get_metadata_db_connection",
            lambda read_only=False: tracked_conn,
        )

        # Function catches exception and logs, but MUST still close connection in finally:
        init_relationships_table(conn=None)

        assert tracked_conn.close_count == 1, "Connection leaked in init_relationships_table!"
        assert tracked_conn.rollback_count >= 1

    def test_init_history_table_exception_closes_conn(self, monkeypatch):
        """When init_history_table(conn=None) fails, its self-created connection MUST be closed."""
        tracked_conn = TrackedConnection(sqlite3.connect(":memory:"))

        class FaultyCursor:
            def execute(self, sql, *args, **kwargs):
                raise sqlite3.OperationalError("Table creation error")

        monkeypatch.setattr(tracked_conn, "cursor", lambda: FaultyCursor())
        monkeypatch.setattr(
            "dbgpt_analyst.libs.bi.connections.get_metadata_db_connection",
            lambda read_only=False: tracked_conn,
        )

        init_history_table(conn=None)

        assert tracked_conn.close_count == 1, "Connection leaked in init_history_table!"
        assert tracked_conn.rollback_count >= 1

    def test_init_db_connections_table_exception_closes_conn(self, monkeypatch):
        """When init_db_connections_table(conn=None) fails, its self-created connection MUST be closed."""
        tracked_conn = TrackedConnection(sqlite3.connect(":memory:"))

        class FaultyCursor:
            def execute(self, sql, *args, **kwargs):
                raise sqlite3.OperationalError("Index creation error")

        monkeypatch.setattr(tracked_conn, "cursor", lambda: FaultyCursor())
        monkeypatch.setattr(
            "dbgpt_analyst.libs.bi.connections.get_metadata_db_connection",
            lambda read_only=False: tracked_conn,
        )

        init_db_connections_table(conn=None)

        assert tracked_conn.close_count == 1, "Connection leaked in init_db_connections_table!"
        assert tracked_conn.rollback_count >= 1

    def test_midway_subroutine_failure_in_ensure_tables_closes_conn(self, monkeypatch):
        """When an exception is raised halfway through ensure_tables (in _ensure_experience_table),
        the parent ensure_tables MUST cleanly close the connection and not leak it.
        """
        raw_conn = sqlite3.connect(":memory:")
        tracked_conn = TrackedConnection(raw_conn)

        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            lambda read_only=False: tracked_conn,
        )

        def faulty_experience_table(conn=None):
            raise RuntimeError("Subroutine crash inside experience table creation")

        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment._ensure_experience_table",
            faulty_experience_table,
        )

        with pytest.raises(RuntimeError, match="Subroutine crash"):
            ensure_tables(conn=None)

        assert tracked_conn.close_count == 1, "Parent ensure_tables leaked connection when subroutine failed!"
        assert tracked_conn.rollback_count >= 1


# ===========================================================================
# SUITE 4: PostgreSQL Fallback & Concurrent Stress Harness
# ===========================================================================

class TestPostgresFallbackAndConcurrentStress:
    """Adversarial stress-testing of PostgreSQL extension failure rollback & multi-thread concurrency."""

    def test_ensure_tables_postgres_pg_trgm_permission_denied_fallback(self):
        """Simulate Postgres environment where CREATE EXTENSION pg_trgm fails (permission denied).
        Verify transaction rollback occurs and fallback btree indexes are created cleanly.
        """
        mock_pg_conn = MagicMock()
        mock_pg_conn.dialect = "postgresql"
        type(mock_pg_conn).__name__ = "PgConnection"

        mock_cur = MagicMock()
        mock_pg_conn.cursor.return_value = mock_cur

        executed_statements = []

        def side_effect_execute(sql, *args, **kwargs):
            sql_clean = sql.strip()
            executed_statements.append(sql_clean)
            if "pg_trgm" in sql_clean or "gin_trgm_ops" in sql_clean:
                raise Exception("permission denied: must be superuser to create extension")

        mock_cur.execute.side_effect = side_effect_execute

        ensure_tables(conn=mock_pg_conn)

        # Verify rollback was called after pg_trgm failure
        assert mock_pg_conn.rollback.call_count >= 1

        # Verify fallback btree indexes were executed
        all_sql = "\n".join(executed_statements)
        assert "CREATE INDEX IF NOT EXISTS idx_gq_nl_btree" in all_sql
        assert "CREATE INDEX IF NOT EXISTS idx_exp_context_btree" in all_sql

    def test_concurrent_multi_thread_bootstrap(self, monkeypatch, tmp_path):
        """Run bootstrap_analyst_metadata from 10 concurrent threads against on-disk SQLite DB."""
        import threading
        db_path = str(tmp_path / "concurrent_bootstrap.db")

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_path, timeout=30.0),
        )
        monkeypatch.setattr(
            "dbgpt_analyst.libs.bi.connections.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_path, timeout=30.0),
        )
        monkeypatch.setattr(
            "dbgpt_analyst.memory.memory_experiment.get_metadata_db_connection",
            lambda read_only=False: sqlite3.connect(db_path, timeout=30.0),
        )

        errors = []

        def worker_thread():
            try:
                bootstrap_analyst_metadata(conn=None)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker_thread) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Concurrent bootstrap raised exceptions: {errors}"

        # Verify all tables exist in final DB
        vconn = sqlite3.connect(db_path)
        cur = vconn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {r[0] for r in cur.fetchall()}
        for tbl in ALL_REQUIRED_TABLES:
            assert tbl in tables, f"Table {tbl} missing after concurrent bootstrap"
        vconn.close()

    def test_table_relationships_multi_source_identical_table_names(self):
        """Verify intra-source inserts for multiple distinct datasources sharing identical table names
        do not collide on unique constraints.
        """
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        # Datasource 1 has users -> orders
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, confidence, confirmed)
            VALUES ('source_1', 'source_1', 'users', 'id', 'source_1', 'orders', 'user_id', 0.9, 1)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)

        # Datasource 2 also has users -> orders (intra-source)
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, confidence, confirmed)
            VALUES ('source_2', 'source_2', 'users', 'id', 'source_2', 'orders', 'user_id', 0.85, 1)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)
        conn.commit()

        # Both records must exist
        cur.execute("SELECT source_id, from_source_id, confidence FROM table_relationships ORDER BY source_id")
        rows = cur.fetchall()
        assert len(rows) == 2
        assert rows[0] == ("source_1", "source_1", 0.9)
        assert rows[1] == ("source_2", "source_2", 0.85)

        conn.close()

