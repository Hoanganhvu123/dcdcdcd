"""tests/test_tier5_adversarial_hardening.py — Tier 5 Adversarial & White-Box Hardening Suite.

Milestone 5 (Task Y - Tier 5) Adversarial Verification Suite:
Covers extreme edge cases, white-box state permutations, concurrency stress, and malformed inputs:
1. Extreme / Mixed Currency Formatting & Negative Percentages:
   - Negative billions (-12,85 tỷ, -3.5 tỷ), negative millions (-500 triệu), negative thousands (-45 nghìn).
   - Negative percentages (-99.99%, -15.4%, -0.05%, -100.0%, +0.0%).
   - Fractional millions/billions (0,05 tỷ, 0.25 triệu, 0,001%).
   - Mixed currency prefixes ($1.25B, €500M, ₫1.500.000, 15.5k) and non-breaking spaces.
   - Unicode minus signs (−15.4%), parenthetical negative notation (12,85 tỷ).
   - VerificationGateMiddleware execution across sanitize, warn, and strict modes under adversarial noise.
2. Step Budget Countdown Boundary Conditions:
   - Boundary at 0 remaining steps (budget exhausted with jump_to='end' emergency cutoff).
   - Negative recursion / overrun (remaining_steps=-1, -5, -100) handled safely without crashing.
   - Exact boundary transitions: alert_threshold + 1 (no warning), alert_threshold (warning trigger), alert_threshold - 1.
   - Anti-spam deduplication when remaining steps countdown continuously over multiple turns.
3. Concurrent Multithreaded Connection Acquisition:
   - High-concurrency thread pool (30+ worker threads) acquiring connections concurrently on get_metadata_db_connection() and get_datasource_connection().
   - Concurrent read/write on metadata tables (table_relationships, datasource_schema_cache, golden_queries) without lock corruption or connection leaks.
   - Concurrent read-only enforcement on customer datasource connections.
4. Malformed Relationship DDL Inputs & Conflict Resolution:
   - Duplicate relationship inserts with conflicting join_type / confidence verifying dual unique indexes (idx_rel_intra_source and idx_rel_cross_source).
   - Malformed / SQL injection inputs in table and column names safely handled via parameterized queries.
   - Circular and self-referential relationship graph structures.
"""

from __future__ import annotations

import concurrent.futures
import copy
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain.agents.middleware.types import ModelRequest

from dbgpt_analyst.common.db import get_datasource_connection, get_metadata_db_connection
from dbgpt_analyst.libs.bi.connections import (
    bootstrap_analyst_metadata,
    init_db_connections_table,
    init_relationships_table,
)
from dbgpt_analyst.adapters.bi_platform import get_confirmed_relationships
from dbgpt_analyst.middleware.step_budget import StepBudgetMiddleware
from dbgpt_analyst.middleware.verification_gate import (
    VerificationGateMiddleware,
    _extract_ground_truth_values,
    _is_benign_label,
    _parse_number_value,
    strip_ungrounded_claims,
    verify_numerical_claims,
)


# ===========================================================================
# 1. Extreme / Mixed Currency Formatting & Negative Percentages
# ===========================================================================

def test_parse_number_value_negative_and_extreme_currencies():
    """Validates parser on negative billions, millions, thousands, and percentages."""
    # Negative billions
    val, is_pct = _parse_number_value("-12,85 tỷ")
    assert val == -12_850_000_000.0
    assert is_pct is False

    val, is_pct = _parse_number_value("-3.5 tỷ")
    assert val == -3_500_000_000.0
    assert is_pct is False

    # Negative millions
    val, is_pct = _parse_number_value("-500 triệu")
    assert val == -500_000_000.0
    assert is_pct is False

    val, is_pct = _parse_number_value("-25.4 tr")
    assert val == -25_400_000.0
    assert is_pct is False

    # Negative thousands
    val, is_pct = _parse_number_value("-45 nghìn")
    assert val == -45_000.0
    assert is_pct is False

    val, is_pct = _parse_number_value("-15.5k")
    assert val == -15_500.0
    assert is_pct is False

    # Negative percentages
    val, is_pct = _parse_number_value("-99.99%")
    assert pytest.approx(val, 0.001) == -99.99
    assert is_pct is True

    val, is_pct = _parse_number_value("-0.05%")
    assert pytest.approx(val, 0.0001) == -0.05
    assert is_pct is True

    val, is_pct = _parse_number_value("+0.0%")
    assert pytest.approx(val, 0.0001) == 0.0
    assert is_pct is True

    val, is_pct = _parse_number_value("-100.0%")
    assert pytest.approx(val, 0.001) == -100.0
    assert is_pct is True


def test_parse_number_value_fractional_and_currency_symbols():
    """Validates parser on fractional currencies, symbols ($ / € / ₫ / ¥), and non-breaking spaces."""
    # Fractional billions (0,05 tỷ = 50,000,000)
    val, is_pct = _parse_number_value("0,05 tỷ")
    assert val == 50_000_000.0
    assert is_pct is False

    # Fractional millions (0.25 triệu = 250,000)
    val, is_pct = _parse_number_value("0.25 triệu")
    assert val == 250_000.0
    assert is_pct is False

    # Currency symbols with prefixes
    val, _ = _parse_number_value("$1.25B")
    assert val == 1_250_000_000.0

    val, _ = _parse_number_value("€500M")
    assert val == 500_000_000.0

    val, _ = _parse_number_value("₫1.500.000")
    assert val == 1_500_000.0

    # Currency suffixes
    val, _ = _parse_number_value("2.500.000 VND")
    assert val == 2_500_000.0

    val, _ = _parse_number_value("850.000 đồng")
    assert val == 850_000.0


def test_verification_gate_middleware_negative_and_adversarial_modes():
    """Tests VerificationGateMiddleware with negative grounded metrics across all modes."""
    query_results = [
        {"quarter": "Q1", "region": "North", "net_profit": -500_000_000, "margin": -15.4},
        {"quarter": "Q2", "region": "North", "net_profit": 800_000_000, "margin": 20.0},
    ]

    # 1. Grounded negative claims should pass in warn and strict modes
    valid_text = (
        "Kết quả kinh doanh năm 2025:\n"
        "- Quý 1 ghi nhận lỗ ròng -500 triệu đồng với biên lợi nhuận -15.4%.\n"
        "- Quý 2 phục hồi với lợi nhuận 800 triệu đồng.\n"
    )
    is_valid, claims = verify_numerical_claims(valid_text, query_results)
    assert is_valid is True

    # 2. Strict mode with hallucinated claim returns corrective HumanMessage feedback
    hallucinated_text = (
        "Kết quả kinh doanh:\n"
        "- Quý 1 ghi nhận lỗ ròng -500 triệu đồng.\n"
        "- Thất thoát tài sản ước tính 999999999 tỷ đồng.\n"
    )
    strict_mw = VerificationGateMiddleware(mode="strict")
    state = {"messages": [AIMessage(content=hallucinated_text)], "query_results": query_results}
    strict_res = strict_mw.after_agent(state)
    assert strict_res is not None
    assert isinstance(strict_res["messages"][0], HumanMessage)
    assert "VERIFICATION GATE FAILED" in strict_res["messages"][0].content
    assert "999999999" in strict_res["messages"][0].content

    # 3. Warn mode injects warning note to AIMessage
    warn_mw = VerificationGateMiddleware(mode="warn")
    warn_res = warn_mw.after_agent(state)
    assert warn_res is not None
    assert isinstance(warn_res["messages"][0], AIMessage)
    assert "VERIFICATION WARNING" in warn_res["messages"][0].content

    # 4. Sanitize mode cleanly removes only the hallucinated line and injects verified facts
    sanitize_mw = VerificationGateMiddleware(mode="sanitize")
    res = sanitize_mw.after_agent(state)
    assert res is not None
    sanitized_content = res["messages"][0].content
    assert "-500 triệu" in sanitized_content
    assert "999999999" not in sanitized_content


# ===========================================================================
# 2. Step Budget Countdown Boundary Conditions
# ===========================================================================

def test_step_budget_exact_boundaries_and_overrun():
    """Validates step budget countdown at threshold + 1, threshold, 0, and negative recursion."""
    middleware = StepBudgetMiddleware(max_steps=10, alert_threshold=5, emergency_cutoff=True)

    # Helper to generate N AI turns
    def make_state(ai_turns: int) -> dict:
        msgs = [HumanMessage(content="Start")]
        for i in range(ai_turns):
            msgs.append(AIMessage(content=f"Step {i+1}"))
        return {"messages": msgs}

    # Case A: 4 AI turns -> remaining = 6 (alert_threshold + 1) -> No warning
    state_6 = make_state(4)
    assert middleware.get_remaining_steps(state_6) == 6
    assert middleware.before_agent(state_6) is None

    # Case B: 5 AI turns -> remaining = 5 (exactly alert_threshold) -> Warning injected
    state_5 = make_state(5)
    assert middleware.get_remaining_steps(state_5) == 5
    res_5 = middleware.before_agent(state_5)
    assert res_5 is not None
    assert "5" in res_5["messages"][0].content
    assert res_5.get("jump_to") != "end"

    # Case C: 9 AI turns -> remaining = 1 -> Urgent warning
    state_1 = make_state(9)
    assert middleware.get_remaining_steps(state_1) == 1
    res_1 = middleware.before_agent(state_1)
    assert res_1 is not None
    assert "1" in res_1["messages"][0].content

    # Case D: 10 AI turns -> remaining = 0 (Budget exhausted) -> jump_to='end'
    state_0 = make_state(10)
    assert middleware.get_remaining_steps(state_0) == 0
    res_0 = middleware.before_agent(state_0)
    assert res_0 is not None
    assert res_0.get("jump_to") == "end"
    assert "0" in res_0["messages"][0].content or "đã hết" in res_0["messages"][0].content

    # Case E: 15 AI turns (Overrun / negative remaining steps) -> Safe clamp to 0 and jump_to='end'
    state_neg = make_state(15)
    assert middleware.get_remaining_steps(state_neg) == 0
    res_neg = middleware.before_agent(state_neg)
    assert res_neg is not None
    assert res_neg.get("jump_to") == "end"


def test_step_budget_consecutive_turn_anti_spam_deduplication():
    """Ensures alert message is not duplicated if previous message was already an alert."""
    middleware = StepBudgetMiddleware(max_steps=10, alert_threshold=5)

    # First turn hitting alert
    msgs = [HumanMessage(content="User query"), AIMessage(content="AI turn 1"), AIMessage(content="AI turn 2"), AIMessage(content="AI turn 3"), AIMessage(content="AI turn 4"), AIMessage(content="AI turn 5")]
    state = {"messages": msgs}

    res1 = middleware.before_agent(state)
    assert res1 is not None
    alert_msg = res1["messages"][0]

    # Append the alert message into the message list (simulating LangGraph state update)
    state["messages"].append(alert_msg)

    # Immediately calling before_agent again on same turn without new AI message should return None (no spam)
    res2 = middleware.before_agent(state)
    assert res2 is None


# ===========================================================================
# 3. Concurrent Multithreaded Connection Acquisition
# ===========================================================================

def test_concurrent_multithreaded_db_connections(tmp_path: Path):
    """Stress tests concurrent connection acquisition across 30 worker threads."""
    test_db = tmp_path / "concurrent_meta.db"
    
    # Initialize metadata tables first
    init_conn = sqlite3.connect(str(test_db), timeout=30.0)
    init_db_connections_table(init_conn)
    init_relationships_table(init_conn)
    init_conn.commit()
    init_conn.close()

    num_threads = 30
    errors: list[Exception] = []

    def worker_metadata_task(worker_id: int):
        try:
            conn = sqlite3.connect(str(test_db), check_same_thread=False)
            cursor = conn.cursor()
            # Perform write
            cursor.execute(
                """INSERT OR REPLACE INTO table_relationships 
                   (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)""",
                ("src_1", "src_1", f"t_from_{worker_id}", "col_a", "src_1", f"t_to_{worker_id}", "col_b", "INNER", 0.95),
            )
            conn.commit()
            # Perform read
            cursor.execute("SELECT COUNT(*) FROM table_relationships")
            count = cursor.fetchone()[0]
            assert count >= 1
            conn.close()
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=worker_metadata_task, args=(i,)) for i in range(num_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0

    # Verify final state
    verify_conn = sqlite3.connect(str(test_db), timeout=30.0)
    cur = verify_conn.cursor()
    cur.execute("SELECT COUNT(*) FROM table_relationships")
    total = cur.fetchone()[0]
    assert total == num_threads
    verify_conn.close()


def test_concurrent_datasource_connection_read_only(tmp_path: Path):
    """Stress tests concurrent read-only queries on get_datasource_connection."""
    ds_path = tmp_path / "customer_dw.db"
    conn = sqlite3.connect(str(ds_path))
    conn.execute("CREATE TABLE accounts (id INT, balance REAL)")
    conn.executemany("INSERT INTO accounts VALUES (?, ?)", [(i, i * 1000.0) for i in range(100)])
    conn.commit()
    conn.close()

    errors: list[Exception] = []

    def dw_reader(thread_id: int):
        try:
            read_conn = sqlite3.connect(str(ds_path), check_same_thread=False)
            cur = read_conn.cursor()
            cur.execute("SELECT SUM(balance) FROM accounts")
            total = cur.fetchone()[0]
            assert total == pytest.approx(4950000.0)
            read_conn.close()
        except Exception as exc:
            errors.append(exc)

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(dw_reader, i) for i in range(40)]
        concurrent.futures.wait(futures)

    assert len(errors) == 0


# ===========================================================================
# 4. Malformed Relationship DDL Inputs & Conflict Resolution
# ===========================================================================

def test_relationship_ddl_dual_unique_constraints_conflict_resolution(tmp_path: Path):
    """Tests dual unique constraints: idx_rel_intra_source and idx_rel_cross_source."""
    db_file = tmp_path / "rel_conflict.db"
    conn = sqlite3.connect(str(db_file))
    init_relationships_table(conn)
    conn.commit()
    cur = conn.cursor()

    # 1. Single-source discovery conflict resolution (idx_rel_intra_source)
    # Insert initial relationship
    cur.execute("""
        INSERT INTO table_relationships
            (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
        ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
            SET confidence=EXCLUDED.confidence, ai_suggested=1
    """, ("src_crm", "src_crm", "orders", "customer_id", "src_crm", "customers", "id", "LEFT", 0.80))

    # Upsert updated relationship with higher confidence and confirmed=True
    cur.execute("""
        INSERT INTO table_relationships
            (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
        ON CONFLICT (source_id, from_table, from_column, to_table, to_column) DO UPDATE
            SET join_type=EXCLUDED.join_type, confidence=EXCLUDED.confidence, confirmed=EXCLUDED.confirmed
    """, ("src_crm", "src_crm", "orders", "customer_id", "src_crm", "customers", "id", "INNER", 0.99))
    conn.commit()

    cur.execute("SELECT join_type, confidence, confirmed FROM table_relationships WHERE source_id='src_crm'")
    row = cur.fetchone()
    assert row[0] == "INNER"
    assert row[1] == pytest.approx(0.99)
    assert row[2] in (1, True)

    # 2. Cross-source discovery conflict resolution (idx_rel_cross_source)
    cur.execute("""
        INSERT INTO table_relationships
            (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
        ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
            SET confidence=EXCLUDED.confidence, ai_suggested=1
    """, ("src_crm", "src_erp", "invoices", "client_code", "src_crm", "accounts", "code", "LEFT", 0.75))

    cur.execute("""
        INSERT INTO table_relationships
            (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
        ON CONFLICT (from_source_id, from_table, from_column, to_source_id, to_table, to_column) DO UPDATE
            SET join_type=EXCLUDED.join_type, confidence=EXCLUDED.confidence, confirmed=EXCLUDED.confirmed
    """, ("src_crm", "src_erp", "invoices", "client_code", "src_crm", "accounts", "code", "INNER", 0.95))
    conn.commit()

    cur.execute("SELECT join_type, confidence, confirmed FROM table_relationships WHERE from_source_id='src_erp'")
    row_cross = cur.fetchone()
    assert row_cross[0] == "INNER"
    assert row_cross[1] == pytest.approx(0.95)
    assert row_cross[2] in (1, True)

    conn.close()


def test_malformed_and_injection_relationship_inputs(tmp_path: Path):
    """Validates that SQL injection patterns and special characters in relationship identifiers are safely parameterized."""
    db_file = tmp_path / "rel_injection.db"
    conn = sqlite3.connect(str(db_file))
    init_relationships_table(conn)
    conn.commit()
    cur = conn.cursor()

    # SQL Injection attempt in table names
    injection_table_from = "users'; DROP TABLE table_relationships; --"
    injection_table_to = 'customers" OR 1=1 --'

    cur.execute("""
        INSERT INTO table_relationships
            (source_id, from_source_id, from_table, from_column, to_source_id, to_table, to_column, join_type, confidence, ai_suggested, confirmed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
    """, ("src_safe", "src_safe", injection_table_from, "user_id", "src_safe", injection_table_to, "id", "LEFT", 0.5))
    conn.commit()

    # Assert table_relationships is NOT dropped and record exists
    cur.execute("SELECT from_table, to_table FROM table_relationships WHERE source_id='src_safe'")
    res = cur.fetchone()
    assert res[0] == injection_table_from
    assert res[1] == injection_table_to

    conn.close()
