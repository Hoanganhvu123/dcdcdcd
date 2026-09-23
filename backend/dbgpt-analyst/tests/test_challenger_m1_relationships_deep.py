"""Empirical Deep Adversarial Challenge Test Suite for Table Relationships (M1).
Authored by m1_it2_challenger_1 (M1 Relationships Adversarial Challenger).

Objective:
1. Test multi-source collisions:
   - Insert relationships across multiple datasource IDs with identical table and column names
     (e.g., source '1' orders->customers and source '2' orders->customers).
   - Verify both exist independently and do not overwrite or fail uniqueness constraints.
   - Test 10-source mesh matrix with identical table and column schemas.
2. Test intra-source vs cross-source ON CONFLICT logic:
   - Verify Path 1 (`data_sync.py`) upserts: preserves user-confirmed flags and custom join_types.
   - Verify Path 2 (`relationship_discovery.py`) upserts: preserves user-confirmed flags and custom join_types.
   - Verify join types (LEFT, RIGHT, INNER, FULL, CROSS) and confidence edge values (0.0, 0.5, 0.8, 1.0, 0.9999).
   - Verify unicode table and column names (Vietnamese accented characters) and special characters.
3. Test get_confirmed_relationships() filtering and connection lifecycle:
   - Verify strict filtering: only confirmed=TRUE / confirmed=1 returned.
   - Verify source_id filtering (both source_id and from_source_id matching).
   - Verify deterministic connection closure (0 resource leaks) under normal execution,
     and under injected exceptions during cursor.execute, fetchall, and cursor.description.
4. Concurrent stress harness:
   - Multi-threaded concurrent upserts, updates, and reads on WAL-mode database.
"""

import sqlite3
import threading
import time
import random
from unittest.mock import MagicMock
import pytest

from dbgpt_analyst.libs.bi.connections import (
    init_relationships_table,
    bootstrap_analyst_metadata,
)
from dbgpt_analyst.adapters.bi_platform import (
    get_confirmed_relationships,
    get_active_instructions,
)


class LeakDetectingConnection:
    """Spy connection wrapper to detect any connection leaks and trace lifecycle events."""
    def __init__(self, inner: sqlite3.Connection):
        self._inner = inner
        self.dialect = "sqlite"
        self.closed = False
        self.close_call_count = 0
        self.fault_execute = None
        self.fault_fetchall = None
        self.fault_description = None

    def cursor(self):
        if self.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        return LeakDetectingCursor(self, self._inner.cursor())

    def commit(self):
        if self.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        return self._inner.commit()

    def rollback(self):
        if self.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        return self._inner.rollback()

    def close(self):
        self.close_call_count += 1
        self.closed = True
        return self._inner.close()


class LeakDetectingCursor:
    def __init__(self, parent: LeakDetectingConnection, inner: sqlite3.Cursor):
        self.parent = parent
        self._inner = inner

    def execute(self, sql, *args, **kwargs):
        if self.parent.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        if self.parent.fault_execute:
            raise self.parent.fault_execute
        return self._inner.execute(sql, *args, **kwargs)

    def fetchall(self):
        if self.parent.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        if self.parent.fault_fetchall:
            raise self.parent.fault_fetchall
        return self._inner.fetchall()

    def fetchone(self):
        if self.parent.closed:
            raise sqlite3.ProgrammingError("Cannot operate on a closed database")
        return self._inner.fetchone()

    @property
    def description(self):
        if self.parent.fault_description:
            raise self.parent.fault_description
        return self._inner.description

    def close(self):
        return self._inner.close()


# ===========================================================================
# 1. MULTI-SOURCE COLLISION STRESS TESTS
# ===========================================================================

class TestMultiSourceCollisionsAndIsolation:
    """Challenge 1: Verify multi-source collisions across distinct datasources with identical table/column schemas."""

    def test_multi_source_identical_schema_isolation_10_sources(self, tmp_path):
        """Insert identical table/column relationships across 10 distinct datasources.
        Assert that all 30 relationships exist simultaneously and each source remains fully isolated.
        """
        db_file = str(tmp_path / "multi_source_test.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        # Schema to replicate across all 10 sources
        relationships_template = [
            ("orders", "customer_id", "customers", "id", "LEFT", 0.90),
            ("order_items", "order_id", "orders", "id", "LEFT", 0.95),
            ("order_items", "product_id", "products", "id", "LEFT", 0.85),
        ]

        # Insert 3 relationships for each of 10 sources (IDs: "src_1" .. "src_10")
        for src_idx in range(1, 11):
            source_id = f"src_{src_idx}"
            for from_tbl, from_col, to_tbl, to_col, jtype, conf in relationships_template:
                # Exact query pattern executed in data_sync.py:profile_value_overlap
                cur.execute("""
                    INSERT INTO table_relationships
                        (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
                    ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                        SET confidence=EXCLUDED.confidence, ai_suggested=1
                """, (
                    source_id, source_id, from_tbl, from_col,
                    source_id, to_tbl, to_col,
                    jtype, conf
                ))
        conn.commit()

        # 1. Verify total row count is exactly 30 (10 sources * 3 relationships)
        cur.execute("SELECT COUNT(*) FROM table_relationships")
        total_rows = cur.fetchone()[0]
        assert total_rows == 30, f"Expected 30 rows, got {total_rows}"

        # 2. Verify each source has exactly 3 rows
        for src_idx in range(1, 11):
            source_id = f"src_{src_idx}"
            cur.execute("SELECT COUNT(*) FROM table_relationships WHERE source_id = ?", (source_id,))
            assert cur.fetchone()[0] == 3, f"Source {source_id} does not have 3 relationships"

        # 3. Update confidence & confirmation on source 'src_1' ONLY
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_1', 'src_1', 'orders', 'customer_id', 'src_1', 'customers', 'id', 'INNER', 1.0, 0, 1)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, join_type=EXCLUDED.join_type, confirmed=EXCLUDED.confirmed
        """)
        conn.commit()

        # Verify src_1 was updated
        cur.execute("SELECT confidence, join_type, confirmed FROM table_relationships WHERE source_id = 'src_1' AND from_table = 'orders'")
        src_1_row = cur.fetchone()
        assert src_1_row == (1.0, "INNER", 1)

        # Verify src_2 .. src_10 were UNTOUCHED
        for src_idx in range(2, 11):
            source_id = f"src_{src_idx}"
            cur.execute("SELECT confidence, join_type, confirmed FROM table_relationships WHERE source_id = ? AND from_table = 'orders'", (source_id,))
            other_row = cur.fetchone()
            assert other_row == (0.90, "LEFT", 0), f"Source {source_id} was corrupted by update to src_1!"

        conn.close()

    def test_cross_source_and_intra_source_full_mesh_coexistence(self, tmp_path):
        """Test full mesh of intra-source and cross-source joins between 3 distinct datasources."""
        db_file = str(tmp_path / "mesh_test.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        sources = ["dw_alpha", "dw_beta", "dw_gamma"]

        # 1. Intra-source joins
        for s in sources:
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES (?, ?, 'orders', 'cust_id', ?, 'customers', 'id', 'LEFT', 0.85, 1, 0)
                ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """, (s, s, s))

        # 2. Cross-source joins (alpha->beta, beta->gamma, gamma->alpha, and reverse)
        cross_pairs = [
            ("dw_alpha", "dw_beta"),
            ("dw_beta", "dw_gamma"),
            ("dw_gamma", "dw_alpha"),
            ("dw_beta", "dw_alpha"),
        ]
        for src_from, src_to in cross_pairs:
            fed_source_id = f"fed_{src_from}_{src_to}"
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES (?, ?, 'orders', 'cust_id', ?, 'customers', 'id', 'INNER', 0.92, 1, 1)
                ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """, (fed_source_id, src_from, src_to))
        conn.commit()

        # Total rows must be 3 (intra) + 4 (cross) = 7
        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == 7

        # Verify dual unique constraints prevent duplicate insert on both paths
        # Attempt duplicate on Path 1 (intra)
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('dw_alpha', 'dw_alpha', 'orders', 'cust_id', 'dw_alpha', 'customers', 'id', 'LEFT', 0.99, 1, 0)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == 7

        # Verify confidence was updated to 0.99 for dw_alpha
        cur.execute("SELECT confidence FROM table_relationships WHERE source_id='dw_alpha' AND from_source_id='dw_alpha'")
        assert cur.fetchone()[0] == 0.99

        conn.close()


# ===========================================================================
# 2. ON CONFLICT SEMANTICS, JOIN TYPES & BOUNDARY VALUES
# ===========================================================================

class TestOnConflictSemanticsAndBoundaryValues:
    """Challenge 2: Verify ON CONFLICT behavior, user edit retention, join types, and unicode handling."""

    def test_path1_background_sync_preserves_confirmed_status_and_user_join_type(self, tmp_path):
        """Verify that data_sync.py background profiling NEVER un-confirms a relationship or reverts user join_type."""
        db_file = str(tmp_path / "preserve_user_edits.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        # Step 1: Initial AI suggestion via data_sync (confirmed=False, join_type='LEFT', confidence=0.81)
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_prod', 'src_prod', 'invoices', 'client_id', 'src_prod', 'clients', 'id', 'LEFT', 0.81, 1, 0)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=1
        """)
        conn.commit()

        # Step 2: User explicitly confirms relationship and changes join_type to 'INNER'
        cur.execute("""
            UPDATE table_relationships
            SET confirmed = 1, join_type = 'INNER', confidence = 1.0, ai_suggested = 0
            WHERE source_id = 'src_prod' AND from_table = 'invoices'
        """)
        conn.commit()

        cur.execute("SELECT confirmed, join_type, confidence, ai_suggested FROM table_relationships WHERE source_id='src_prod'")
        user_row = cur.fetchone()
        assert user_row == (1, "INNER", 1.0, 0)

        # Step 3: Background cron job runs profile_value_overlap again (exact query from data_sync.py:195-204)
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_prod', 'src_prod', 'invoices', 'client_id', 'src_prod', 'clients', 'id', 'LEFT', 0.85, 1, 0)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=1
        """)
        conn.commit()

        # CRITICAL ASSERTION: confirmed MUST remain 1, join_type MUST remain 'INNER', confidence updated
        cur.execute("SELECT confirmed, join_type, confidence, ai_suggested FROM table_relationships WHERE source_id='src_prod'")
        after_sync_row = cur.fetchone()
        assert after_sync_row[0] == 1, "Background sync illegally un-confirmed a user-approved relationship!"
        assert after_sync_row[1] == "INNER", "Background sync illegally reverted user's join_type!"
        assert after_sync_row[2] == 0.85
        assert after_sync_row[3] == 1

        conn.close()

    def test_path2_cross_source_preserves_confirmed_status_and_user_join_type(self, tmp_path):
        """Verify relationship_discovery.py background job preserves user edits on cross-source relationships."""
        db_file = str(tmp_path / "preserve_cross_user_edits.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        # Step 1: Initial AI suggestion via relationship_discovery
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('fed_main', 'crm_db', 'leads', 'company_code', 'erp_db', 'organizations', 'code', 'LEFT', 0.82, 1, 0)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=1
        """)
        conn.commit()

        # Step 2: User sets join_type='FULL', confirmed=1
        cur.execute("""
            UPDATE table_relationships
            SET confirmed = 1, join_type = 'FULL', confidence = 0.99
            WHERE from_source_id = 'crm_db' AND to_source_id = 'erp_db'
        """)
        conn.commit()

        # Step 3: relationship_discovery runs again (exact query from relationship_discovery.py:164-175)
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('fed_main', 'crm_db', 'leads', 'company_code', 'erp_db', 'organizations', 'code', 'LEFT', 0.88, 1, 0)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=1
        """)
        conn.commit()

        cur.execute("""
            SELECT confirmed, join_type, confidence 
            FROM table_relationships 
            WHERE from_source_id='crm_db' AND to_source_id='erp_db'
        """)
        row = cur.fetchone()
        assert row[0] == 1, "Cross-source discovery un-confirmed relationship!"
        assert row[1] == "FULL", "Cross-source discovery reverted join_type!"
        assert row[2] == 0.88

        conn.close()

    def test_join_types_and_confidence_boundary_matrix(self, tmp_path):
        """Test all join type variations and extreme confidence values."""
        db_file = str(tmp_path / "join_types_matrix.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        join_types = ["LEFT", "RIGHT", "INNER", "FULL", "CROSS", "NATURAL", "LEFT OUTER", "RIGHT OUTER"]
        confidences = [0.0, 0.0001, 0.5, 0.8, 0.95, 0.99, 0.999999, 1.0]

        for i, (jt, conf) in enumerate(zip(join_types, confidences)):
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
            """, (
                f"src_{i}", f"src_{i}", f"table_{i}", f"col_{i}",
                f"src_{i}", f"target_{i}", f"tcol_{i}",
                jt, conf
            ))
        conn.commit()

        cur.execute("SELECT COUNT(*) FROM table_relationships WHERE confirmed = 1")
        assert cur.fetchone()[0] == len(join_types)

        conn.close()

    def test_unicode_and_special_character_table_and_column_names(self, tmp_path):
        """Test Vietnamese accented characters, spaces, and special symbols in table and column names."""
        db_file = str(tmp_path / "unicode_names.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        unicode_records = [
            ("bảng_hóa_đơn", "mã_khách_hàng", "bảng_khách_hàng", "mã_định_danh", "LEFT", 0.95),
            ("chi_tiết_đơn_hàng", "mã_sản_phẩm", "danh_mục_hàng_hóa", "id", "INNER", 0.90),
            ("table with spaces", "col-with-dash", "target.table.dots", "col$dollar", "FULL", 0.88),
        ]

        for from_tbl, from_col, to_tbl, to_col, jt, conf in unicode_records:
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES ('vn_src', 'vn_src', ?, ?, 'vn_src', ?, ?, ?, ?, 1, 1)
                ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """, (from_tbl, from_col, to_tbl, to_col, jt, conf))
        conn.commit()

        cur.execute("SELECT COUNT(*) FROM table_relationships WHERE source_id='vn_src'")
        assert cur.fetchone()[0] == 3

        # Test query retrieval with Vietnamese string
        cur.execute("SELECT from_column FROM table_relationships WHERE from_table = 'bảng_hóa_đơn'")
        assert cur.fetchone()[0] == "mã_khách_hàng"

        conn.close()


# ===========================================================================
# 3. GET_CONFIRMED_RELATIONSHIPS FILTERING & LEAK PREVENTION
# ===========================================================================

class TestGetConfirmedRelationshipsFilteringAndLeakPrevention:
    """Challenge 3: Verify get_confirmed_relationships strict filtering and deterministic connection lifecycle."""

    def test_strict_filtering_returns_only_confirmed_true(self, monkeypatch, tmp_path):
        """Verify unconfirmed relationships (confirmed=0/FALSE) are strictly excluded from results."""
        db_file = str(tmp_path / "filtering_test.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        # Insert 6 records: 3 confirmed (1), 3 unconfirmed (0)
        data = [
            ("src_1", "src_1", "t1", "c1", "src_1", "t2", "c2", "LEFT", 0.90, 1),
            ("src_1", "src_1", "t3", "c3", "src_1", "t4", "c4", "LEFT", 0.40, 0),
            ("src_2", "src_2", "t5", "c5", "src_2", "t6", "c6", "INNER", 0.95, 1),
            ("src_2", "src_2", "t7", "c7", "src_2", "t8", "c8", "LEFT", 0.50, 0),
            ("fed_x", "src_1", "t1", "c1", "src_2", "t5", "c5", "FULL", 0.99, 1),
            ("fed_x", "src_1", "t3", "c3", "src_2", "t7", "c7", "FULL", 0.30, 0),
        ]
        for s_id, fs_id, ft, fc, ts_id, tt, tc, jt, conf, cfm in data:
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (s_id, fs_id, ft, fc, ts_id, tt, tc, jt, conf, cfm))
        conn.commit()
        conn.close()

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            lambda read_only=True: sqlite3.connect(db_file),
        )

        # 1. Global filter (source_id=None): must return all 3 confirmed records
        global_results = get_confirmed_relationships(source_id=None)
        assert len(global_results) == 3
        for r in global_results:
            assert r["confirmed"] in (1, True)
            assert (r["from_table"], r["to_table"]) in [("t1", "t2"), ("t5", "t6"), ("t1", "t5")]

        # 2. Source-scoped filter (source_id='src_1'): must match source_id='src_1' OR from_source_id='src_1'
        src_1_results = get_confirmed_relationships(source_id="src_1")
        assert len(src_1_results) == 2
        tables_1 = {(r["from_table"], r["to_table"]) for r in src_1_results}
        assert ("t1", "t2") in tables_1
        assert ("t1", "t5") in tables_1

        # 3. Source-scoped filter (source_id='src_2'): matches source_id='src_2'
        src_2_results = get_confirmed_relationships(source_id="src_2")
        assert len(src_2_results) == 1
        assert src_2_results[0]["from_table"] == "t5"

        # 4. Unknown source: returns empty list
        assert get_confirmed_relationships(source_id="unknown_db") == []

    def test_get_confirmed_relationships_deterministic_connection_cleanup_on_all_paths(self, monkeypatch, tmp_path):
        """Fault injection matrix: verify connection is ALWAYS closed under normal and 3 fault modes."""
        db_file = str(tmp_path / "cleanup_test.db")
        init_conn = sqlite3.connect(db_file)
        init_relationships_table(init_conn)
        init_conn.close()

        opened_conns = []

        def tracked_factory(read_only=True):
            conn = LeakDetectingConnection(sqlite3.connect(db_file))
            opened_conns.append(conn)
            return conn

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            tracked_factory,
        )

        # Mode A: Happy path
        res = get_confirmed_relationships()
        assert res == []
        assert opened_conns[-1].closed is True
        assert opened_conns[-1].close_call_count == 1

        # Mode B: Fault on cursor.execute
        fault_conn_b = LeakDetectingConnection(sqlite3.connect(db_file))
        fault_conn_b.fault_execute = sqlite3.OperationalError("Simulated disk error during execute")
        monkeypatch.setattr("dbgpt_analyst.common.db.get_metadata_db_connection", lambda read_only=True: fault_conn_b)
        res_b = get_confirmed_relationships()
        assert res_b == []
        assert fault_conn_b.closed is True
        assert fault_conn_b.close_call_count == 1

        # Mode C: Fault on cursor.fetchall
        fault_conn_c = LeakDetectingConnection(sqlite3.connect(db_file))
        fault_conn_c.fault_fetchall = sqlite3.DatabaseError("Corrupt page on fetchall")
        monkeypatch.setattr("dbgpt_analyst.common.db.get_metadata_db_connection", lambda read_only=True: fault_conn_c)
        res_c = get_confirmed_relationships()
        assert res_c == []
        assert fault_conn_c.closed is True
        assert fault_conn_c.close_call_count == 1

        # Mode D: Fault on cursor.description
        fault_conn_d = LeakDetectingConnection(sqlite3.connect(db_file))
        fault_conn_d.fault_description = RuntimeError("Driver error on description property")
        monkeypatch.setattr("dbgpt_analyst.common.db.get_metadata_db_connection", lambda read_only=True: fault_conn_d)
        res_d = get_confirmed_relationships()
        assert res_d == []
        assert fault_conn_d.closed is True
        assert fault_conn_d.close_call_count == 1

    def test_get_active_instructions_returns_empty_list_cleanly(self):
        """Verify get_active_instructions returns [] without throwing any exceptions."""
        result = get_active_instructions(query="What is total revenue?", scope="global")
        assert isinstance(result, list)
        assert len(result) == 0


# ===========================================================================
# 4. CONCURRENT MULTI-THREADED STRESS HARNESS
# ===========================================================================

class TestConcurrentRelationshipsStressHarness:
    """Challenge 4: Multi-threaded concurrent upserts, updates, and reads on WAL mode database."""

    def test_10_concurrent_threads_upserts_and_reads_under_wal(self, tmp_path):
        """10 concurrent threads executing 30 operations each on WAL-mode SQLite database."""
        db_file = str(tmp_path / "concurrent_stress.db")
        init_conn = sqlite3.connect(db_file)
        init_conn.execute("PRAGMA journal_mode=WAL;")
        init_relationships_table(init_conn)
        init_conn.close()

        num_threads = 10
        ops_per_thread = 30
        errors = []
        success_count = [0]
        lock = threading.Lock()

        def worker(thread_idx: int):
            try:
                t_conn = sqlite3.connect(db_file, timeout=30.0)
                t_cur = t_conn.cursor()

                for op_idx in range(ops_per_thread):
                    action = random.choice(["path1_insert", "path2_insert", "confirm", "read"])
                    tbl_id = random.randint(1, 5)

                    for retry in range(5):
                        try:
                            if action == "path1_insert":
                                conf = round(random.uniform(0.6, 0.99), 2)
                                t_cur.execute(f"""
                                    INSERT INTO table_relationships
                                        (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                                    VALUES ('src_{thread_idx}', 'src_{thread_idx}', 't_{tbl_id}', 'id', 'src_{thread_idx}', 't_{tbl_id+1}', 'ref_id', 'LEFT', {conf}, 1, 0)
                                    ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                                        SET confidence=EXCLUDED.confidence
                                """)
                                t_conn.commit()

                            elif action == "path2_insert":
                                target_thread = (thread_idx + 1) % num_threads
                                conf = round(random.uniform(0.7, 0.99), 2)
                                t_cur.execute(f"""
                                    INSERT INTO table_relationships
                                        (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                                    VALUES ('fed_{thread_idx}', 'src_{thread_idx}', 't_{tbl_id}', 'id', 'src_{target_thread}', 'target_{tbl_id}', 't_id', 'INNER', {conf}, 1, 0)
                                    ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                                        SET confidence=EXCLUDED.confidence
                                """)
                                t_conn.commit()

                            elif action == "confirm":
                                t_cur.execute(f"""
                                    UPDATE table_relationships
                                    SET confirmed = 1
                                    WHERE from_source_id = 'src_{thread_idx}' AND from_table = 't_{tbl_id}'
                                """)
                                t_conn.commit()

                            elif action == "read":
                                t_cur.execute("SELECT COUNT(*) FROM table_relationships WHERE confirmed = 1")
                                _ = t_cur.fetchone()

                            with lock:
                                success_count[0] += 1
                            break
                        except sqlite3.OperationalError as oe:
                            if "locked" in str(oe) or "busy" in str(oe):
                                time.sleep(0.01 * (retry + 1))
                                continue
                            raise
                    time.sleep(0.001)

                t_conn.close()
            except Exception as e:
                with lock:
                    errors.append((thread_idx, type(e).__name__, str(e)))

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Concurrent execution errors: {errors}"
        assert success_count[0] == num_threads * ops_per_thread

        # Final verification
        verify_conn = sqlite3.connect(db_file)
        v_cur = verify_conn.cursor()
        v_cur.execute("SELECT COUNT(*) FROM table_relationships")
        total = v_cur.fetchone()[0]
        assert total > 0
        verify_conn.close()
