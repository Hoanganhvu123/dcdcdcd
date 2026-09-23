"""Durable Session State & Pure Event Log Fold Test Suite (Data Analytics & OpenMAIC Standard).

Validates:
1. Pure Event Log Reducer: foldEvent(prevState, event) -> newState (pure, immutable).
2. Idempotency & Overlap Protection: Re-applying events with id <= last_event_id is a strict no-op.
3. Last-Event-ID Reconnect & Resume: Server replays events after client's last_event_id without duplicating state.
4. Host Lifecycle Events:
   - session_start: initializes run, avoids double-painting when user_message preceded.
   - session_resumed: updates workerId and keeps session running.
   - thinking_start / thinking_delta / thinking_end: captures thought sequence and calculates duration_ms.
   - tool_call / tool_result: tracks tool execution status, duration, and outputs.
   - sql_delta / sql_validated: tracks SQL query generation and validation lifecycle.
   - row_batch / chart_spec / artifact: tracks Data Analytics deliverables.
   - user_question: captures HITL question envelope and pauses in waiting_user status.
5. Standardized Semantic XML Protocol:
   - <thought id="..." seq="..." status="complete">...</thought>
   - <tool id="..." name="..." seq="..." status="complete">...</tool>
   - <clause id="..." no="..." title="...">...</clause>
   - <contract id="..." type="..." title="...">...</contract>
"""

from __future__ import annotations

import pytest
from dbgpt_analyst.events import (
    DurableSessionState,
    SessionEvent,
    extract_semantic_tags,
    extract_semantic_xml_blocks,
    foldEvent,
    foldEvents,
    format_clause_xml,
    format_contract_xml,
    format_thought_xml,
    format_tool_xml,
    resume_session,
)


def test_session_start_opens_run():
    s0 = DurableSessionState()
    assert s0.status == "connecting"

    e1 = SessionEvent(id=1, ts=100.0, type="session_start", data={"prompt": "Phân tích doanh thu theo quý", "workerId": "worker-analyst-1"})
    s1 = foldEvent(s0, e1)

    assert s1.status == "running"
    assert s1.last_event_id == 1
    assert s1.user_query == "Phân tích doanh thu theo quý"
    assert s1.worker_id == "worker-analyst-1"
    assert len(s1.chat_history) == 1
    assert s1.chat_history[0]["text"] == "Phân tích doanh thu theo quý"


def test_session_start_deduplicates_preceding_user_message():
    """A session created with durable user_message before session_start must not paint the bubble twice."""
    s0 = DurableSessionState()
    e1 = SessionEvent(id=1, ts=100.0, type="user_message", data={"text": "Top 10 cửa hàng có GMV cao nhất"})
    e2 = SessionEvent(id=2, ts=100.1, type="session_start", data={"prompt": "Top 10 cửa hàng có GMV cao nhất", "workerId": "w1"})

    s1 = foldEvent(s0, e1)
    s2 = foldEvent(s1, e2)

    assert s2.status == "running"
    user_nodes = [n for n in s2.chat_history if n.get("kind") == "user"]
    assert len(user_nodes) == 1
    assert user_nodes[0]["text"] == "Top 10 cửa hàng có GMV cao nhất"


def test_idempotency_duplicate_event_replay_is_noop():
    """Applying an already-applied event (id <= last_event_id) returns state unchanged."""
    s0 = DurableSessionState()
    e1 = SessionEvent(id=1, ts=100.0, type="session_start", data={"prompt": "Test data query"})
    e2 = SessionEvent(id=2, ts=100.1, type="thinking_start", data={"id": "th-1", "head": "Lập kế hoạch truy vấn"})

    s1 = foldEvent(s0, e1)
    s2 = foldEvent(s1, e2)
    assert s2.last_event_id == 2

    # Replay event #1 and #2
    s_dup1 = foldEvent(s2, e1)
    assert s_dup1 == s2
    s_dup2 = foldEvent(s2, e2)
    assert s_dup2 == s2


def test_thinking_lifecycle_and_duration_calculation():
    s0 = DurableSessionState()
    events = [
        SessionEvent(id=1, ts=10.0, type="session_start", data={"prompt": "Dự báo tồn kho"}),
        SessionEvent(id=2, ts=10.1, type="thinking_start", data={"id": "th-1", "head": "Kiểm tra bảng inventory và sales"}),
        SessionEvent(id=3, ts=10.3, type="thinking_delta", data={"delta": "JOIN giữa stores và order_items theo store_id..."}),
        SessionEvent(id=4, ts=10.8, type="thinking_end", data={}),
    ]
    state = foldEvents(events, s0)

    assert state.active_thought is None
    assert len(state.thoughts) == 1
    t = state.thoughts[0]
    assert t["id"] == "th-1"
    assert t["head"] == "Kiểm tra bảng inventory và sales"
    assert "JOIN giữa stores và order_items" in t["content"]
    assert t["status"] == "complete"
    assert t["duration_ms"] == 700  # (10.8 - 10.1) * 1000 = 700ms

    # Check semantic <thought> tag emitted in xml_blocks
    assert any("<thought" in b and 'status="complete"' in b for b in state.xml_blocks)


def test_tool_lifecycle_tracking():
    s0 = DurableSessionState()
    events = [
        SessionEvent(id=1, ts=1.0, type="session_start", data={"prompt": "Chạy SQL"}),
        SessionEvent(id=2, ts=1.1, type="tool_call", data={"id": "call-1", "name": "sql_db_query", "args": "SELECT count(*) FROM orders;"}),
    ]
    s1 = foldEvents(events, s0)
    assert len(s1.tools) == 1
    assert s1.tools[0]["status"] == "running"
    assert any('<tool id="call-1"' in b and 'status="running"' in b for b in s1.xml_blocks)

    e3 = SessionEvent(id=3, ts=1.4, type="tool_result", data={"id": "call-1", "result": "[{'count': 18}]", "ms": "300ms"})
    s2 = foldEvent(s1, e3)
    assert s2.tools[0]["status"] == "complete"
    assert s2.tools[0]["duration_ms"] == "300ms"
    assert any('<tool id="call-1"' in b and 'status="complete"' in b for b in s2.xml_blocks)


def test_data_analytics_events_folding():
    """Verify Data Analytics events: sql_delta, sql_validated, row_batch, chart_spec, artifact."""
    s0 = DurableSessionState()
    events = [
        SessionEvent(id=1, ts=1.0, type="session_start", data={"prompt": "Phân tích doanh số"}),
        SessionEvent(id=2, ts=1.1, type="sql_delta", data={"id": "sql-1", "sql": "SELECT store_name, SUM(revenue) FROM pos_sales GROUP BY store_name"}),
        SessionEvent(id=3, ts=1.2, type="sql_validated", data={"id": "sql-1", "valid": True}),
        SessionEvent(id=4, ts=1.3, type="row_batch", data={"columns": ["store_name", "revenue"], "rows": [["Store A", 1000], ["Store B", 2000]], "total_rows": 2}),
        SessionEvent(id=5, ts=1.4, type="chart_spec", data={"chart_type": "bar", "title": "Doanh thu theo cửa hàng", "spec": {"x": "store_name", "y": "revenue"}}),
        SessionEvent(id=6, ts=1.5, type="artifact", data={"artifact_id": "art-excel-1", "type": "excel", "title": "Báo cáo Doanh thu XLSX", "payload": {"sheets": ["Sheet1"]}}),
    ]
    state = foldEvents(events, s0)

    # SQL queries
    sql_list = state.get_sql_queries()
    assert len(sql_list) == 1
    assert sql_list[0]["valid"] is True
    assert "pos_sales" in sql_list[0]["sql"]

    # Data tables
    tables = state.get_data_tables()
    assert len(tables) == 1
    assert tables[0]["columns"] == ["store_name", "revenue"]
    assert len(tables[0]["rows"]) == 2

    # Chart specs
    charts = state.get_chart_specs()
    assert len(charts) == 1
    assert charts[0]["chart_type"] == "bar"
    assert charts[0]["title"] == "Doanh thu theo cửa hàng"

    # Artifacts
    artifacts = state.get_artifacts()
    assert len(artifacts) == 1
    assert artifacts[0]["type"] == "excel"
    assert artifacts[0]["title"] == "Báo cáo Doanh thu XLSX"


def test_user_question_hitl_envelope():
    s0 = DurableSessionState()
    e1 = SessionEvent(id=1, ts=1.0, type="session_start", data={"prompt": "Lọc doanh thu theo kênh bán lẻ"})
    e2 = SessionEvent(id=2, ts=1.2, type="user_question", data={
        "question": "Bạn muốn xem kênh bán hàng nào?",
        "options": [
            {"id": "online", "title": "Kênh Online (Website & Shopee)"},
            {"id": "pos", "title": "Kênh Cửa hàng POS Offline"},
            {"id": "all", "title": "Hợp nhất đa kênh (Omnichannel)"},
        ],
        "multiSelect": False,
    })

    state = foldEvents([e1, e2], s0)
    assert state.status == "waiting_user"
    assert state.hitl_question is not None
    assert state.hitl_question["question"] == "Bạn muốn xem kênh bán hàng nào?"
    assert len(state.hitl_question["options"]) == 3
    assert state.hitl_question["multiSelect"] is False


def test_last_event_id_resume_contract():
    events = [
        SessionEvent(id=1, ts=1.0, type="session_start", data={"prompt": "Truy vấn 1"}),
        SessionEvent(id=2, ts=1.1, type="thinking_start", data={"head": "Suy nghĩ 1"}),
        SessionEvent(id=3, ts=1.2, type="thinking_end", data={}),
        SessionEvent(id=4, ts=1.3, type="answer_delta", data={"delta": "Đoạn 1 "}),
        SessionEvent(id=5, ts=1.4, type="answer_delta", data={"delta": "Đoạn 2."}),
        SessionEvent(id=6, ts=1.5, type="session_complete", data={}),
    ]

    # Client reconnects after receiving event #3
    state, new_events = resume_session(events, last_event_id=3)
    assert state.status == "completed"
    assert state.final_answer == "Đoạn 1 Đoạn 2."
    assert [e.id for e in new_events] == [4, 5, 6]

    # Re-folding new_events produces identical state
    re_folded = foldEvents(new_events, state)
    assert re_folded == state


def test_clause_and_contract_compatibility():
    s0 = DurableSessionState()
    events = [
        SessionEvent(id=1, ts=1.0, type="session_start", data={"prompt": "Dự thảo tài liệu"}),
        SessionEvent(id=2, ts=1.1, type="clause_update", data={"no": 1, "title": "Phạm vi", "body": "Nội dung"}),
        SessionEvent(id=3, ts=1.2, type="contract_update", data={"id": "doc-1", "title": "TÀI LIỆU QUẢN TRỊ"}),
    ]
    state = foldEvents(events, s0)
    clauses = state.get_clauses_dict()
    assert "1" in clauses
    assert clauses["1"]["title"] == "Phạm vi"
    assert state.contract["id"] == "doc-1"


def test_xml_card_extraction():
    sample = """
    <thought id="th-1" seq="1" status="complete" tag="Suy nghĩ" head="Chiến lược">
    Phân tích GMV theo store.
    </thought>

    <tool id="tl-1" name="sql_query" seq="2" status="complete">
    SELECT * FROM stores
    </tool>

    <clause id="cl-1" no="1" title="Mục 1">Nội dung 1</clause>

    <contract id="ct-1" type="report" title="BÁO CÁO">
    Báo cáo chi tiết
    </contract>
    """
    blocks = extract_semantic_xml_blocks(sample)
    assert len(blocks) == 4
    assert any("<thought" in b for b in blocks)
    assert any("<tool" in b for b in blocks)
    assert any("<clause" in b for b in blocks)
    assert any("<contract" in b for b in blocks)

    tags = extract_semantic_tags(sample)
    assert tags == ["thought", "tool", "clause", "contract"]
