"""Kiểm thử cho module insight_loop.

Tất cả offline: sử dụng SQLite in-memory cho dữ liệu thật và Stub LLM cho phản hồi mô phỏng.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
from types import SimpleNamespace
from typing import Any

import pytest

from dbgpt_analyst.analyst.insight_loop import Finding, run_insight_loop
from dbgpt_analyst.tools import deck

# 12 dòng dữ liệu bán hàng theo tháng với bất thường tại tháng 7 (doanh thu tụt còn 20tr so với ~100tr)
DATA_12_MONTHS = [
    {"thang": "T1", "doanh_thu": 100_000_000, "so_don": 500},
    {"thang": "T2", "doanh_thu": 105_000_000, "so_don": 520},
    {"thang": "T3", "doanh_thu": 110_000_000, "so_don": 540},
    {"thang": "T4", "doanh_thu": 98_000_000, "so_don": 490},
    {"thang": "T5", "doanh_thu": 102_000_000, "so_don": 510},
    {"thang": "T6", "doanh_thu": 108_000_000, "so_don": 530},
    {"thang": "T7", "doanh_thu": 20_000_000, "so_don": 100},  # Bất thường rõ ràng
    {"thang": "T8", "doanh_thu": 104_000_000, "so_don": 515},
    {"thang": "T9", "doanh_thu": 107_000_000, "so_don": 525},
    {"thang": "T10", "doanh_thu": 112_000_000, "so_don": 550},
    {"thang": "T11", "doanh_thu": 115_000_000, "so_don": 560},
    {"thang": "T12", "doanh_thu": 120_000_000, "so_don": 580},
]


def _sqlite_runner(rows: list[dict[str, Any]] | None = None, table_name: str = "ban_hang"):
    """Tạo runner SQLite in-memory cho bảng dữ liệu."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    if rows is None:
        rows = DATA_12_MONTHS

    if rows:
        cols = list(rows[0].keys())
        col_defs = ", ".join(
            f'"{c}" TEXT' if isinstance(rows[0][c], str) else f'"{c}" REAL' for c in cols
        )
        conn.execute(f'CREATE TABLE "{table_name}" ({col_defs})')
        placeholders = ", ".join("?" for _ in cols)
        col_names = ", ".join(f'"{c}"' for c in cols)
        insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES ({placeholders})'
        for r in rows:
            conn.execute(insert_sql, [r[c] for c in cols])
        conn.commit()

    def run_sql(sql: str) -> list[dict]:
        cur = conn.cursor()
        cur.execute(sql)
        if cur.description:
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
        return []

    return run_sql


class _StubLLM:
    """Mô phỏng LLM trả về phản hồi mô phỏng hoặc ném Exception."""

    def __init__(self, reply: Any):
        self._reply = reply

    async def ainvoke(self, messages: list[dict[str, str]]) -> Any:
        assert any("TUYỆT ĐỐI KHÔNG viết bất kỳ con số nào" in m["content"] for m in messages)
        if isinstance(self._reply, Exception):
            raise self._reply

        content = self._reply
        if isinstance(content, (list, dict)):
            content = json.dumps(content, ensure_ascii=False)

        return SimpleNamespace(content=content)


# --- 1. test_loop_finds_the_planted_anomaly ---------------------------------


def test_loop_finds_the_planted_anomaly():
    runner = _sqlite_runner()
    stub_reply = [
        {
            "claim": "Doanh thu tháng 7 tụt giảm bất thường",
            "metric_expr": "min:doanh_thu",
            "sql": "SELECT thang, doanh_thu FROM ban_hang WHERE thang = 'T7'",
        }
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Tìm bất thường trong doanh thu cả năm",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
        )
    )
    assert len(findings) >= 1
    anomaly = next((f for f in findings if "tháng 7" in f.claim.lower()), None)
    assert anomaly is not None
    assert anomaly.value == 20_000_000.0
    assert anomaly.evidence_rows[0]["thang"] == "T7"


# --- 2. test_every_finding_recomputes_from_its_own_sql ----------------------


def test_every_finding_recomputes_from_its_own_sql():
    runner = _sqlite_runner()
    stub_reply = [
        {
            "claim": "Doanh thu tháng 7 tụt giảm bất thường",
            "metric_expr": "min:doanh_thu",
            "sql": "SELECT thang, doanh_thu FROM ban_hang WHERE thang = 'T7'",
        },
        {
            "claim": "Tổng doanh thu cả năm",
            "metric_expr": "sum:doanh_thu",
            "sql": "SELECT doanh_thu FROM ban_hang",
        },
        {
            "claim": "Số tháng bán hàng ghi nhận",
            "metric_expr": "count",
            "sql": "SELECT thang FROM ban_hang",
        },
        {
            "claim": "Doanh thu trung bình theo tháng",
            "metric_expr": "avg:doanh_thu",
            "sql": "SELECT doanh_thu FROM ban_hang",
        },
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Tổng kết số liệu bán hàng",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
        )
    )
    assert len(findings) == 4
    for f in findings:
        rows = runner(f.evidence_sql)
        recomputed = deck.compute_metric(rows, f.metric_expr)
        assert recomputed == pytest.approx(f.value)


# --- 3. test_a_claim_carrying_a_number_is_dropped ---------------------------


def test_a_claim_carrying_a_number_is_dropped():
    runner = _sqlite_runner()
    stub_reply = [
        {
            "claim": "Doanh thu tăng 45%",
            "metric_expr": "sum:doanh_thu",
            "sql": "SELECT doanh_thu FROM ban_hang",
        },
        {
            "claim": "Doanh thu đạt 500 tỷ đồng",
            "metric_expr": "sum:doanh_thu",
            "sql": "SELECT doanh_thu FROM ban_hang",
        },
        {
            "claim": "Tổng doanh thu bán hàng cả năm",
            "metric_expr": "sum:doanh_thu",
            "sql": "SELECT doanh_thu FROM ban_hang",
        },
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Đánh giá doanh thu",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
        )
    )
    # 2 giả thuyết đầu chứa số bị loại, chỉ còn lại 1 giả thuyết không chứa số
    assert len(findings) == 1
    assert findings[0].claim == "Tổng doanh thu bán hàng cả năm"


# --- 4. test_a_write_statement_is_refused -----------------------------------


def test_a_write_statement_is_refused():
    runner = _sqlite_runner()
    stub_reply = [
        {
            "claim": "Xóa toàn bộ bảng bán hàng",
            "metric_expr": "count",
            "sql": "DROP TABLE ban_hang",
        },
        {
            "claim": "Xóa dữ liệu bảng bán hàng",
            "metric_expr": "count",
            "sql": "DELETE FROM ban_hang WHERE 1=1",
        },
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Kiểm tra bảo mật SQL",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
        )
    )
    # Tất cả lệnh ghi bị loại bỏ
    assert len(findings) == 0

    # Kiểm tra bảng vẫn nguyên vẹn và query lại được
    rows = runner("SELECT count(*) as cnt FROM ban_hang")
    assert rows[0]["cnt"] == 12


# --- 5. test_a_broken_sql_does_not_kill_the_loop ----------------------------


def test_a_broken_sql_does_not_kill_the_loop():
    runner = _sqlite_runner()
    stub_reply = [
        {
            "claim": "Giả thuyết với SQL sai cú pháp",
            "metric_expr": "sum:doanh_thu",
            "sql": "SELECT * FROM non_existent_table WHERE SYNTAX ERROR",
        },
        {
            "claim": "Tổng doanh thu cả năm",
            "metric_expr": "sum:doanh_thu",
            "sql": "SELECT doanh_thu FROM ban_hang",
        },
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Phân tích chịu lỗi",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
        )
    )
    assert len(findings) == 1
    assert findings[0].claim == "Tổng doanh thu cả năm"


# --- 6. test_the_loop_stops_at_max_findings ---------------------------------


def test_the_loop_stops_at_max_findings():
    runner = _sqlite_runner()
    stub_reply = [
        {
            "claim": f"Doanh thu tại kỳ thứ {i}",
            "metric_expr": "sum:doanh_thu",
            "sql": f"SELECT doanh_thu FROM ban_hang WHERE thang = 'T{i}'",
        }
        for i in range(1, 10)
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Lấy danh sách chỉ số",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
            max_findings=5,
        )
    )
    assert len(findings) == 5


# --- 7. test_no_hypothesis_survives_returns_empty_not_crash ----------------


def test_no_hypothesis_survives_returns_empty_not_crash():
    runner = _sqlite_runner()
    # Stub trả về chuỗi vô nghĩa hoặc JSON rác
    for reply in (
        "Không thể tìm thấy kết quả phù hợp",
        "```json\n[]\n```",
        json.dumps([{"claim": "Tăng 50%", "metric_expr": "sum:doanh_thu", "sql": "SELECT 1"}]),
        RuntimeError("LLM 503 service unavailable"),
    ):
        findings = asyncio.run(
            run_insight_loop(
                "Thử nghiệm",
                run_sql=runner,
                tables=["ban_hang"],
                llm=_StubLLM(reply),
            )
        )
        assert findings == []


# --- Additional edge-case tests --------------------------------------------


def test_sql_with_semicolon_is_refused():
    runner = _sqlite_runner()
    stub_reply = [
        {
            "claim": "SQL tiêm nhiễm nhiều câu lệnh",
            "metric_expr": "count",
            "sql": "SELECT * FROM ban_hang; DROP TABLE ban_hang",
        }
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Kiểm tra injection",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
        )
    )
    assert len(findings) == 0
    rows = runner("SELECT count(*) as cnt FROM ban_hang")
    assert rows[0]["cnt"] == 12


def test_empty_sql_result_is_dropped():
    runner = _sqlite_runner()
    stub_reply = [
        {
            "claim": "Dữ liệu kỳ không tồn tại",
            "metric_expr": "sum:doanh_thu",
            "sql": "SELECT doanh_thu FROM ban_hang WHERE thang = 'T99'",
        }
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Kiểm tra 0 dòng",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
        )
    )
    assert len(findings) == 0


def test_confidence_calculation():
    # Bảng chứa một số giá trị None
    custom_data = [
        {"thang": "T1", "doanh_thu": 100.0},
        {"thang": "T2", "doanh_thu": None},
        {"thang": "T3", "doanh_thu": 200.0},
        {"thang": "T4", "doanh_thu": None},
    ]
    runner = _sqlite_runner(custom_data)
    stub_reply = [
        {
            "claim": "Tổng doanh thu các tháng",
            "metric_expr": "sum:doanh_thu",
            "sql": "SELECT thang, doanh_thu FROM ban_hang",
        },
        {
            "claim": "Số lượng bản ghi",
            "metric_expr": "count",
            "sql": "SELECT thang, doanh_thu FROM ban_hang",
        },
    ]
    findings = asyncio.run(
        run_insight_loop(
            "Kiểm tra confidence",
            run_sql=runner,
            tables=["ban_hang"],
            llm=_StubLLM(stub_reply),
        )
    )
    assert len(findings) == 2
    # sum:doanh_thu có 2/4 non-null -> confidence 0.5
    assert findings[0].confidence == 0.5
    # count -> confidence 1.0
    assert findings[1].confidence == 1.0
