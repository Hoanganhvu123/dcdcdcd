"""Empirical Stress Tests and Verification for table_relationships DDL, Dual Unique Constraints,
Concurrent Upserts, and get_confirmed_relationships.

Challenger 1 (m1_challenger_1) Adversarial Suite.
"""
import os
import sqlite3
import threading
import time
import random
import pytest

from dbgpt_analyst.libs.bi.connections import (
    init_relationships_table,
    bootstrap_analyst_metadata,
)
from dbgpt_analyst.adapters.bi_platform import (
    get_confirmed_relationships,
    get_active_instructions,
)


class TestTableRelationshipsDDLAndConstraints:
    """Stress tests for DDL, unique indexes, and dialect compatibility."""

    def test_sqlite_ddl_and_dual_indexes_structure(self):
        """Verify SQLite DDL creates expected columns and indexes."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        # Check table columns
        cur.execute("PRAGMA table_info(table_relationships)")
        cols = {row[1]: row[2] for row in cur.fetchall()}
        expected_cols = [
            "id", "source_id", "from_source_id", "from_table", "from_column",
            "to_source_id", "to_table", "to_column", "join_type",
            "confidence", "ai_suggested", "confirmed", "created_at"
        ]
        for col in expected_cols:
            assert col in cols, f"Missing column {col}"

        # Check indexes
        cur.execute("PRAGMA index_list(table_relationships)")
        indexes = {row[1] for row in cur.fetchall()}
        assert "idx_rel_intra_source" in indexes
        assert "idx_rel_cross_source" in indexes
        conn.close()

    def test_single_source_path1_repeated_upsert_updates_confidence_and_flags(self):
        """Test Path 1 (data_sync style) repeated updates on the exact same key."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        # Insert 1: initial suggestion
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_table, from_column, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_dw1', 'orders', 'user_id', 'users', 'id', 'LEFT', 0.60, 1, 0)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=EXCLUDED.ai_suggested
        """)
        conn.commit()

        cur.execute("SELECT confidence, ai_suggested, confirmed FROM table_relationships WHERE source_id='src_dw1'")
        row = cur.fetchone()
        assert row[0] == 0.60
        assert row[1] == 1
        assert row[2] == 0

        # Update 1: higher confidence suggestion
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_table, from_column, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_dw1', 'orders', 'user_id', 'users', 'id', 'LEFT', 0.88, 1, 0)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=EXCLUDED.ai_suggested
        """)
        conn.commit()

        cur.execute("SELECT confidence, ai_suggested, confirmed FROM table_relationships WHERE source_id='src_dw1'")
        row = cur.fetchone()
        assert row[0] == 0.88
        assert row[1] == 1
        assert row[2] == 0

        # Update 2: manual user confirmation
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_table, from_column, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_dw1', 'orders', 'user_id', 'users', 'id', 'INNER', 1.0, 0, 1)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=EXCLUDED.ai_suggested, confirmed=EXCLUDED.confirmed, join_type=EXCLUDED.join_type
        """)
        conn.commit()

        cur.execute("SELECT confidence, ai_suggested, confirmed, join_type FROM table_relationships WHERE source_id='src_dw1'")
        row = cur.fetchone()
        assert row[0] == 1.0
        assert row[1] == 0
        assert row[2] == 1
        assert row[3] == 'INNER'

        # Verify only 1 row exists
        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == 1
        conn.close()

    def test_cross_source_path2_repeated_upsert_updates_confidence_and_flags(self):
        """Test Path 2 (relationship_discovery style) repeated updates on cross-source key."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        # Cross-source insert 1
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('fed_src', 'db_sales', 'invoices', 'client_id', 'db_crm', 'accounts', 'account_id', 'LEFT', 0.75, 1, 0)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=EXCLUDED.ai_suggested
        """)
        conn.commit()

        # Cross-source update 2 with confirmation
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('fed_src', 'db_sales', 'invoices', 'client_id', 'db_crm', 'accounts', 'account_id', 'LEFT', 0.99, 1, 1)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, confirmed=EXCLUDED.confirmed
        """)
        conn.commit()

        cur.execute("""
            SELECT confidence, ai_suggested, confirmed 
            FROM table_relationships 
            WHERE from_source_id='db_sales' AND to_source_id='db_crm'
        """)
        row = cur.fetchone()
        assert row[0] == 0.99
        assert row[1] == 1
        assert row[2] == 1

        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == 1
        conn.close()

    def test_interleaved_path1_and_path2_distinct_keys(self):
        """Verify Path 1 and Path 2 coexistence when keys are distinct."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        # Path 1 inserts 5 relationships in dw1
        for i in range(5):
            cur.execute(f"""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES ('dw1', 'dw1', 'table_{i}', 'id', 'dw1', 'table_{i+1}', 'ref_id', 'LEFT', 0.8, 1, 0)
                ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """)

        # Path 2 inserts 5 cross-source relationships between dw1 and dw2
        for i in range(5):
            cur.execute(f"""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES ('dw2', 'dw1', 'table_{i}', 'id', 'dw2', 'dim_table_{i}', 'dw2_ref_id', 'INNER', 0.9, 1, 1)
                ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """)
        conn.commit()

        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == 10
        conn.close()

    def test_reproduce_path1_multi_source_default_value_collision(self):
        """Empirical Challenge Finding: Demonstrates that Path 1 (data_sync style) without
        from_source_id/to_source_id triggers UNIQUE constraint violation on idx_rel_cross_source
        when two distinct datasources have identical table & column names.
        """
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        # Datasource 1 (source_id='1') inserts orders -> users
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_table, from_column, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('1', 'orders', 'user_id', 'users', 'id', 'LEFT', 0.85, 1, 0)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)
        conn.commit()

        # Datasource 2 (source_id='2') attempts to insert orders -> users
        # Expect IntegrityError because from_source_id='0' and to_source_id='0' collide on idx_rel_cross_source
        with pytest.raises(sqlite3.IntegrityError) as excinfo:
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_table, from_column, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES ('2', 'orders', 'user_id', 'users', 'id', 'LEFT', 0.90, 1, 0)
                ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """)
            conn.commit()
        
        assert "UNIQUE constraint failed" in str(excinfo.value)
        conn.close()

    def test_reproduce_path2_cross_source_intra_index_collision(self):
        """Empirical Challenge Finding: Demonstrates that Path 2 (relationship_discovery style)
        with shared source_id (e.g. target_source_id) triggers UNIQUE constraint violation
        on idx_rel_intra_source when two sources join to the same target table.
        """
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        # Source 1 -> Target 3: orders -> users
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('3', '1', 'orders', 'user_id', '3', 'users', 'id', 'LEFT', 0.85, 1, 0)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)
        conn.commit()

        # Source 2 -> Target 3: orders -> users
        # Expect IntegrityError because source_id='3' collides on idx_rel_intra_source
        with pytest.raises(sqlite3.IntegrityError) as excinfo:
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES ('3', '2', 'orders', 'user_id', '3', 'users', 'id', 'LEFT', 0.90, 1, 0)
                ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """)
            conn.commit()

        assert "UNIQUE constraint failed" in str(excinfo.value)
        conn.close()


class TestConcurrentUpsertStressHarness:
    """Multi-threaded stress testing on table_relationships with WAL mode and connection isolation."""

    def test_concurrent_threads_upserting_and_reading_isolated_keys(self, tmp_path):
        """Spawn 8 concurrent worker threads performing 160 operations on WAL-mode SQLite with isolated keys."""
        db_file = str(tmp_path / "stress_meta.db")
        conn = sqlite3.connect(db_file)
        conn.execute("PRAGMA journal_mode=WAL;")
        init_relationships_table(conn)
        conn.close()

        num_threads = 8
        ops_per_thread = 20
        errors = []
        success_count = [0]
        lock = threading.Lock()

        def worker(thread_id: int):
            try:
                w_conn = sqlite3.connect(db_file, timeout=30.0)
                w_cur = w_conn.cursor()

                for op_idx in range(ops_per_thread):
                    action = random.choice(["path1_upsert", "path2_upsert", "read_confirmed", "confirm_update"])
                    table_idx = random.randint(1, 3)

                    for retry in range(5):
                        try:
                            if action == "path1_upsert":
                                conf = round(random.uniform(0.5, 0.99), 2)
                                w_cur.execute(f"""
                                    INSERT INTO table_relationships
                                        (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                                    VALUES ('src_t{thread_id}', 'src_t{thread_id}', 't{thread_id}_tbl_{table_idx}', 'col_a', 'src_t{thread_id}', 't{thread_id}_tbl_{table_idx+1}', 'col_b', 'LEFT', {conf}, 1, 0)
                                    ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                                        SET confidence=EXCLUDED.confidence, ai_suggested=1
                                """)
                                w_conn.commit()

                            elif action == "path2_upsert":
                                conf = round(random.uniform(0.7, 0.99), 2)
                                w_cur.execute(f"""
                                    INSERT INTO table_relationships
                                        (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                                    VALUES ('fed_{thread_id}', 'src_t{thread_id}', 't{thread_id}_tbl_{table_idx}', 'col_a', 'target_{thread_id}', 'dim_{table_idx}', 'dim_id', 'INNER', {conf}, 1, 0)
                                    ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                                        SET confidence=EXCLUDED.confidence
                                """)
                                w_conn.commit()

                            elif action == "confirm_update":
                                w_cur.execute(f"""
                                    UPDATE table_relationships 
                                    SET confirmed = 1 
                                    WHERE from_source_id = 'src_t{thread_id}' AND from_table = 't{thread_id}_tbl_{table_idx}'
                                """)
                                w_conn.commit()

                            elif action == "read_confirmed":
                                w_cur.execute("SELECT COUNT(*) FROM table_relationships WHERE confirmed = 1")
                                _ = w_cur.fetchone()

                            with lock:
                                success_count[0] += 1
                            break
                        except sqlite3.OperationalError as oe:
                            if "locked" in str(oe) or "busy" in str(oe):
                                time.sleep(0.01 * (retry + 1))
                                continue
                            raise
                    time.sleep(0.001)

                w_conn.close()
            except Exception as e:
                with lock:
                    errors.append((thread_id, type(e).__name__, str(e)))

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Concurrent stress testing encountered errors: {errors}"
        assert success_count[0] == num_threads * ops_per_thread

        verify_conn = sqlite3.connect(db_file)
        v_cur = verify_conn.cursor()
        v_cur.execute("SELECT COUNT(*) FROM table_relationships")
        total_rows = v_cur.fetchone()[0]
        assert total_rows > 0
        verify_conn.close()


class TestGetConfirmedRelationshipsOracle:
    """Oracle testing for get_confirmed_relationships adapter function."""

    def test_filtering_and_dictionary_projection(self, monkeypatch, tmp_path):
        """Verify get_confirmed_relationships handles all Boolean variations, NULLs, and source filters."""
        db_file = str(tmp_path / "oracle_meta.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        # Insert mixed data matrix
        test_matrix = [
            ('src_a', 'src_a', 'users', 'id', 'src_a', 'orders', 'user_id', 'INNER', 0.95, 1, 1),
            ('src_a', 'src_a', 'orders', 'id', 'src_a', 'items', 'order_id', 'LEFT', 0.90, 1, 1),
            ('src_a', 'src_a', 'logs', 'user_id', 'src_a', 'users', 'id', 'LEFT', 0.40, 1, 0),
            ('src_b', 'src_b', 'products', 'cat_id', 'src_b', 'categories', 'id', 'LEFT', 0.88, 1, 1),
            ('src_b', 'src_b', 'suppliers', 'id', 'src_b', 'products', 'sup_id', 'LEFT', 0.50, 1, 0),
            ('fed_x', 'src_a', 'users', 'crm_id', 'src_b', 'crm_customers', 'id', 'FULL', 0.99, 1, 1),
        ]

        for row in test_matrix:
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, row)
        conn.commit()
        conn.close()

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            lambda read_only=True: sqlite3.connect(db_file),
        )

        # 1. Oracle check: All confirmed (should return 4 rows)
        all_confirmed = get_confirmed_relationships(source_id=None)
        assert len(all_confirmed) == 4
        for rec in all_confirmed:
            assert isinstance(rec, dict)
            assert rec["confirmed"] in (1, True)
            assert "from_table" in rec
            assert "from_column" in rec
            assert "to_table" in rec
            assert "to_column" in rec
            assert "join_type" in rec

        # 2. Oracle check: Filter by source_id='src_a'
        src_a_confirmed = get_confirmed_relationships(source_id='src_a')
        assert len(src_a_confirmed) == 3
        tables_a = {(r["from_table"], r["to_table"]) for r in src_a_confirmed}
        assert ("users", "orders") in tables_a
        assert ("orders", "items") in tables_a
        assert ("users", "crm_customers") in tables_a

        # 3. Oracle check: Filter by source_id='src_b'
        src_b_confirmed = get_confirmed_relationships(source_id='src_b')
        assert len(src_b_confirmed) == 1
        assert src_b_confirmed[0]["from_table"] == "products"

        # 4. Oracle check: Nonexistent source_id
        none_confirmed = get_confirmed_relationships(source_id='nonexistent_source')
        assert none_confirmed == []

    def test_get_confirmed_relationships_handles_empty_table(self, monkeypatch, tmp_path):
        """Verify empty metadata table returns empty list gracefully."""
        db_file = str(tmp_path / "empty_meta.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        conn.close()

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            lambda read_only=True: sqlite3.connect(db_file),
        )

        res = get_confirmed_relationships()
        assert res == []

    def test_get_confirmed_relationships_handles_db_exception(self, monkeypatch):
        """Verify DB connection failure returns empty list without raising exception."""
        def raise_broken_conn(*args, **kwargs):
            raise sqlite3.OperationalError("Database disk image is malformed")

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            raise_broken_conn,
        )
        monkeypatch.setattr(
            "dbgpt_analyst.adapters.bi_platform.get_active_connection",
            raise_broken_conn,
        )

        res = get_confirmed_relationships(source_id="any")
        assert res == []


class TestMultiSourceIdenticalTablesAndColumns:
    """Stress tests for multi-source relationship partitioning and cross-source graphs."""

    def test_n_datasources_with_identical_schema_and_upsert_isolation(self):
        """Verify 10 distinct datasources with identical table & column names (users.id -> orders.user_id)
        coexist cleanly without collision on idx_rel_intra_source or idx_rel_cross_source,
        and allow isolated independent updates."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        num_sources = 10
        # 1. Insert identical table & column relationships across 10 distinct datasources
        for i in range(1, num_sources + 1):
            src_id = f"src_{i}"
            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES (?, ?, 'orders', 'user_id', ?, 'users', 'id', 'LEFT', ?, 1, 0)
                ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """, (src_id, src_id, src_id, round(0.5 + i * 0.04, 2)))
        conn.commit()

        # Verify 10 distinct rows exist
        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == num_sources

        # 2. Update a specific datasource (src_3) to confirmed=1, confidence=0.99
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_3', 'src_3', 'orders', 'user_id', 'src_3', 'users', 'id', 'INNER', 0.99, 0, 1)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, ai_suggested=EXCLUDED.ai_suggested, confirmed=EXCLUDED.confirmed, join_type=EXCLUDED.join_type
        """)
        conn.commit()

        # Verify total count is still 10
        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == num_sources

        # Verify only src_3 was updated
        cur.execute("SELECT source_id, confidence, confirmed, join_type FROM table_relationships WHERE confirmed=1")
        confirmed_rows = cur.fetchall()
        assert len(confirmed_rows) == 1
        assert confirmed_rows[0][0] == 'src_3'
        assert confirmed_rows[0][1] == 0.99
        assert confirmed_rows[0][2] == 1
        assert confirmed_rows[0][3] == 'INNER'

        # Verify other datasources remained untouched
        cur.execute("SELECT confidence, confirmed FROM table_relationships WHERE source_id='src_1'")
        row_1 = cur.fetchone()
        assert row_1[0] == 0.54
        assert row_1[1] == 0
        conn.close()

    def test_cross_source_relationships_between_distinct_sources(self, monkeypatch, tmp_path):
        """Verify cross-source joins (e.g. source 1 users.id -> source 2 profiles.user_id)
        can be inserted, updated via Path 2 ON CONFLICT, and retrieved via adapter filter."""
        db_file = str(tmp_path / "cross_src.db")
        conn = sqlite3.connect(db_file)
        init_relationships_table(conn)
        cur = conn.cursor()

        # Insert cross-source relationship: src_1.users.id -> src_2.profiles.user_id
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_1:src_2', 'src_1', 'users', 'id', 'src_2', 'profiles', 'user_id', 'LEFT', 0.85, 1, 0)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)

        # Insert second cross-source: src_1.users.id -> src_3.accounts.user_id
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_1:src_3', 'src_1', 'users', 'id', 'src_3', 'accounts', 'user_id', 'LEFT', 0.88, 1, 1)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)

        # Insert third cross-source: src_2.profiles.id -> src_3.accounts.profile_id
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_2:src_3', 'src_2', 'profiles', 'id', 'src_3', 'accounts', 'profile_id', 'INNER', 0.92, 1, 1)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)
        conn.commit()

        # Update first cross-source to confirmed
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_1:src_2', 'src_1', 'users', 'id', 'src_2', 'profiles', 'user_id', 'LEFT', 0.95, 0, 1)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence, confirmed=EXCLUDED.confirmed, ai_suggested=EXCLUDED.ai_suggested
        """)
        conn.commit()
        conn.close()

        monkeypatch.setattr(
            "dbgpt_analyst.common.db.get_metadata_db_connection",
            lambda read_only=True: sqlite3.connect(db_file),
        )

        # Retrieve all confirmed cross-source relationships (all 3 are confirmed)
        all_confirmed = get_confirmed_relationships(source_id=None)
        assert len(all_confirmed) == 3

        # Retrieve confirmed filtered by source_id='src_1' (matches from_source_id='src_1')
        src_1_rels = get_confirmed_relationships(source_id='src_1')
        assert len(src_1_rels) == 2
        tables = {(r["from_table"], r["to_table"]) for r in src_1_rels}
        assert ("users", "profiles") in tables
        assert ("users", "accounts") in tables

    def test_bidirectional_and_cyclic_cross_source_relationships(self):
        """Verify bidirectional relationships between two sources (A.x -> B.y and B.y -> A.x)
        can coexist without constraint collision."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        # Forward: src_a.users.id -> src_b.profiles.user_id
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_a:src_b', 'src_a', 'users', 'id', 'src_b', 'profiles', 'user_id', 'LEFT', 0.90, 1, 1)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)

        # Reverse: src_b.profiles.user_id -> src_a.users.id
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_b:src_a', 'src_b', 'profiles', 'user_id', 'src_a', 'users', 'id', 'LEFT', 0.90, 1, 1)
            ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)
        conn.commit()

        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == 2
        conn.close()

    def test_self_referencing_hierarchical_relationships(self):
        """Verify self-referencing intra-source tables (e.g. employee.manager_id -> employee.id)."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('hr_dw', 'hr_dw', 'employees', 'manager_id', 'hr_dw', 'employees', 'id', 'LEFT', 0.95, 1, 1)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)
        conn.commit()

        cur.execute("SELECT from_table, to_table, confidence FROM table_relationships WHERE source_id='hr_dw'")
        row = cur.fetchone()
        assert row[0] == "employees"
        assert row[1] == "employees"
        assert row[2] == 0.95
        conn.close()


class TestAdversarialBoundaryEdgeCases:
    """Adversarial stress and edge case suite for table relationships."""

    def test_mixed_case_and_special_character_identifiers(self):
        """Verify identifiers with special characters, dots, and hyphens operate cleanly."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('dw-prod.us-east', 'dw-prod.us-east', 'tbl-orders_2026', 'user-id', 'dw-prod.us-east', 'tbl-users_v2', 'id.key', 'LEFT', 0.85, 1, 0)
            ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                SET confidence=EXCLUDED.confidence
        """)
        conn.commit()

        cur.execute("SELECT from_table, to_table FROM table_relationships WHERE source_id='dw-prod.us-east'")
        row = cur.fetchone()
        assert row[0] == "tbl-orders_2026"
        assert row[1] == "tbl-users_v2"
        conn.close()

    def test_high_volume_batch_inserts_with_frequent_conflict_collisions(self):
        """Stress test: 500 upsert operations across 10 datasources with 50% duplicate rate
        to heavily exercise SQLite B-Tree and ON CONFLICT handling."""
        conn = sqlite3.connect(":memory:")
        init_relationships_table(conn)
        cur = conn.cursor()

        total_ops = 500
        num_sources = 10
        tables = ["users", "orders", "line_items", "products", "categories"]

        for op in range(total_ops):
            src_idx = op % num_sources
            src_id = f"source_{src_idx}"
            tbl_idx = (op // num_sources) % len(tables)
            t1 = tables[tbl_idx]
            t2 = tables[(tbl_idx + 1) % len(tables)]
            conf = round(0.5 + (op % 50) * 0.01, 2)

            cur.execute("""
                INSERT INTO table_relationships
                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                VALUES (?, ?, ?, 'id', ?, ?, 'ref_id', 'LEFT', ?, 1, 0)
                ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                    SET confidence=EXCLUDED.confidence
            """, (src_id, src_id, t1, src_id, t2, conf))

        conn.commit()

        cur.execute("SELECT COUNT(*) FROM table_relationships")
        count = cur.fetchone()[0]
        # Max distinct (src, t1, t2) is 10 * 5 = 50
        assert count == 50
        conn.close()

    def test_concurrent_multi_source_mixed_paths_stress_harness(self, tmp_path):
        """Stress test: 10 worker threads performing concurrent intra-source and cross-source
        upserts on identical table names in WAL mode."""
        db_file = str(tmp_path / "multi_wal.db")
        conn = sqlite3.connect(db_file)
        conn.execute("PRAGMA journal_mode=WAL;")
        init_relationships_table(conn)
        conn.close()

        num_threads = 10
        ops_per_thread = 25
        errors = []
        lock = threading.Lock()

        def worker(t_id: int):
            try:
                t_conn = sqlite3.connect(db_file, timeout=30.0)
                t_cur = t_conn.cursor()

                for op in range(ops_per_thread):
                    # Intra-source on identical table name 'orders -> users'
                    src_id = f"worker_src_{t_id}"
                    conf = round(random.uniform(0.6, 0.99), 2)
                    for retry in range(5):
                        try:
                            t_cur.execute(f"""
                                INSERT INTO table_relationships
                                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                                VALUES ('{src_id}', '{src_id}', 'orders', 'user_id', '{src_id}', 'users', 'id', 'LEFT', {conf}, 1, 0)
                                ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
                                    SET confidence=EXCLUDED.confidence
                            """)
                            
                            # Cross-source from worker_src_t_id to worker_src_(t_id+1)%10
                            target_src_id = f"worker_src_{(t_id + 1) % num_threads}"
                            fed_id = f"{src_id}:{target_src_id}"
                            t_cur.execute(f"""
                                INSERT INTO table_relationships
                                    (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                                VALUES ('{fed_id}', '{src_id}', 'orders', 'user_id', '{target_src_id}', 'users', 'id', 'INNER', {conf}, 1, 1)
                                ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
                                    SET confidence=EXCLUDED.confidence, confirmed=EXCLUDED.confirmed
                            """)
                            t_conn.commit()
                            break
                        except sqlite3.OperationalError as oe:
                            if "locked" in str(oe) or "busy" in str(oe):
                                time.sleep(0.01 * (retry + 1))
                                continue
                            raise
                    time.sleep(0.001)

                t_conn.close()
            except Exception as exc:
                with lock:
                    errors.append((t_id, str(exc)))

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Thread errors: {errors}"

        # Verification: Exactly 10 intra-source + 10 cross-source = 20 distinct records
        v_conn = sqlite3.connect(db_file)
        v_cur = v_conn.cursor()
        v_cur.execute("SELECT COUNT(*) FROM table_relationships")
        total_records = v_cur.fetchone()[0]
        assert total_records == num_threads * 2
        v_conn.close()

    def test_idempotent_init_table_and_bootstrap(self):
        """Verify init_relationships_table and bootstrap_analyst_metadata are 100% idempotent
        and preserve existing records without schema corruption or duplicate index errors."""
        conn = sqlite3.connect(":memory:")
        # First init
        init_relationships_table(conn)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO table_relationships
                (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
            VALUES ('src_init', 'src_init', 't1', 'c1', 'src_init', 't2', 'c2', 'LEFT', 0.9, 1, 1)
        """)
        conn.commit()

        # Call init_relationships_table and bootstrap_analyst_metadata 5 times consecutively
        for _ in range(5):
            init_relationships_table(conn)
            bootstrap_analyst_metadata(conn)

        # Check data is intact
        cur.execute("SELECT COUNT(*) FROM table_relationships")
        assert cur.fetchone()[0] == 1

        # Check indexes exist without duplication
        cur.execute("PRAGMA index_list(table_relationships)")
        index_names = [r[1] for r in cur.fetchall()]
        assert "idx_rel_intra_source" in index_names
        assert "idx_rel_cross_source" in index_names
        conn.close()

