"""Empirical Stress Test Harness for Milestone 2 (Challenger 2).

Adversarial validation covering:
1. Reconnection & Idempotency stress test:
   Feed duplicated events with id <= last_event_id and assert state is unchanged.
   Verify payload spoofing/corruption attempts with duplicate IDs are strictly ignored.
2. Rapid event burst test:
   Fold 1,000 synthetic events through fold_events and verify final state consistency,
   thinking duration calculation, and tool count.
3. resume_session test:
   Verify unconsumed events slice boundaries and folded state fidelity.
4. Semantic XML block extraction test:
   Stress-test extract_semantic_xml_blocks and extract_semantic_tags with valid,
   nested, and malformed XML blocks.
"""

from __future__ import annotations

import time
import pytest
from dbgpt_analyst.events.session_fold import (
    DurableSessionState,
    SessionEvent,
    extract_semantic_tags,
    extract_semantic_xml_blocks,
    foldEvent,
    foldEvents,
    fold_event,
    fold_events,
    format_clause_xml,
    format_contract_xml,
    format_thought_xml,
    format_tool_xml,
    resume_session,
)


# ============================================================================
# Objective 1: Reconnection & Idempotency Stress Harness
# ============================================================================

class TestReconnectionAndIdempotencyStress:
    """Stress test idempotency and reconnect protection when events are replayed or duplicated."""

    def test_duplicate_events_strict_noop_equality(self):
        """Applying any event with id <= last_event_id must return the identical state object."""
        s0 = DurableSessionState(session_id="sess-001")
        events = [
            SessionEvent(id=1, ts=100.0, type="session_start", data={"prompt": "Truy vấn doanh thu", "workerId": "worker-1"}),
            SessionEvent(id=2, ts=100.1, type="thinking_start", data={"id": "th-1", "head": "Lập kế hoạch"}),
            SessionEvent(id=3, ts=100.2, type="thinking_delta", data={"delta": "Đang phân tích schema..."}),
            SessionEvent(id=4, ts=100.5, type="thinking_end", data={}),
            SessionEvent(id=5, ts=100.6, type="tool_call", data={"id": "call-1", "name": "sql_db_query", "args": "SELECT 1"}),
            SessionEvent(id=6, ts=100.9, type="tool_result", data={"id": "call-1", "result": "1", "duration_ms": 300}),
            SessionEvent(id=7, ts=101.0, type="answer_delta", data={"delta": "Kết quả là 1."}),
        ]
        state = fold_events(events, s0)
        assert state.last_event_id == 7

        # 1. Replay exact last event
        dup_last = SessionEvent(id=7, ts=102.0, type="answer_delta", data={"delta": "Cố tình duplicate!"})
        state_after_last = fold_event(state, dup_last)
        assert state_after_last == state
        assert state_after_last.final_answer == "Kết quả là 1."

        # 2. Replay all previous events (id 1 through 6)
        for ev in events[:-1]:
            state_after_prev = fold_event(state, ev)
            assert state_after_prev == state

        # 3. Replay with boundary id = 0 and negative id
        e_zero = SessionEvent(id=0, ts=105.0, type="error", data={"message": "Inject error"})
        e_neg = SessionEvent(id=-5, ts=105.0, type="session_complete", data={})
        assert fold_event(state, e_zero) == state
        assert fold_event(state, e_neg) == state

    def test_malicious_payload_spoofing_with_duplicate_ids(self):
        """Adversarial test: An attacker or corrupt network packet sends destructive events with old IDs."""
        s0 = DurableSessionState(session_id="sess-002")
        events = [
            SessionEvent(id=1, ts=1.0, type="session_start", data={"prompt": "Doanh thu"}),
            SessionEvent(id=2, ts=2.0, type="answer_delta", data={"delta": "Dữ liệu chuẩn"}),
            SessionEvent(id=3, ts=3.0, type="session_complete", data={}),
        ]
        state = fold_events(events, s0)
        assert state.status == "completed"
        assert state.final_answer == "Dữ liệu chuẩn"

        # Attempt to spoof/corrupt state using duplicates of ID 1, 2, 3
        spoofed_events = [
            SessionEvent(id=1, ts=4.0, type="error", data={"message": "CORRUPTED ERROR"}),
            SessionEvent(id=2, ts=4.1, type="answer_delta", data={"delta": "CORRUPTED TEXT"}),
            SessionEvent(id=3, ts=4.2, type="session_start", data={"prompt": "HACKED PROMPT"}),
        ]
        corrupted_state = fold_events(spoofed_events, state)

        # State must remain pristine
        assert corrupted_state == state
        assert corrupted_state.status == "completed"
        assert corrupted_state.error is None
        assert corrupted_state.final_answer == "Dữ liệu chuẩn"
        assert corrupted_state.user_query == "Doanh thu"

    def test_interleaved_duplicates_in_stream(self):
        """Simulate flaky network connection where every event is retransmitted twice or out-of-order duplicates arrive."""
        s0 = DurableSessionState(session_id="sess-003")
        clean_events = [
            SessionEvent(id=1, ts=10.0, type="session_start", data={"prompt": "Test"}),
            SessionEvent(id=2, ts=10.1, type="thinking_start", data={"id": "th-1"}),
            SessionEvent(id=3, ts=10.2, type="thinking_end", data={}),
            SessionEvent(id=4, ts=10.3, type="answer_delta", data={"delta": "Chunk 1 "}),
            SessionEvent(id=5, ts=10.4, type="answer_delta", data={"delta": "Chunk 2"}),
            SessionEvent(id=6, ts=10.5, type="session_complete", data={}),
        ]
        expected_state = fold_events(clean_events, s0)

        # Build chaotic stream with duplicate interleavings: [1, 1, 2, 1, 3, 2, 3, 4, 4, 4, 5, 2, 6, 6]
        chaotic_stream = [
            clean_events[0], clean_events[0],  # 1, 1
            clean_events[1],                   # 2
            clean_events[0],                   # 1 (old)
            clean_events[2],                   # 3
            clean_events[1], clean_events[2],  # 2, 3 (old)
            clean_events[3], clean_events[3], clean_events[3], # 4, 4, 4
            clean_events[4],                   # 5
            clean_events[1],                   # 2 (old)
            clean_events[5], clean_events[5],  # 6, 6
        ]

        chaotic_state = fold_events(chaotic_stream, s0)
        assert chaotic_state == expected_state
        assert chaotic_state.last_event_id == 6
        assert chaotic_state.final_answer == "Chunk 1 Chunk 2"
        assert len(chaotic_state.thoughts) == 1


# ============================================================================
# Objective 2: Rapid Event Burst Test (1,000 Synthetic Events)
# ============================================================================

class TestRapidEventBurst1000Events:
    """Stress test folding 1,000 synthetic events at high throughput."""

    @pytest.fixture
    def synthetic_1000_events(self) -> tuple[list[SessionEvent], dict]:
        """Generate exactly 1,000 valid lifecycle events:
        - 1 session_start
        - 100 thinking cycles (5 events each = 500 events): start, 3 deltas, end
        - 100 tool cycles (2 events each = 200 events): tool_call, tool_result
        - 150 data analytics events (30 sql pairs = 60, 30 row_batch = 30, 30 chart_spec = 30, 30 artifact = 30)
        - 148 answer_delta events
        - 1 session_complete
        Total: 1 + 500 + 200 + 150 + 148 + 1 = 1,000 events.
        """
        events: list[SessionEvent] = []
        ev_id = 1
        curr_ts = 1000.0

        # Event 1: session_start
        events.append(SessionEvent(
            id=ev_id,
            ts=curr_ts,
            type="session_start",
            data={"prompt": "Thực hiện đại thử nghiệm 1000 events", "workerId": "worker-burst-01"},
        ))
        ev_id += 1
        curr_ts += 0.01

        # 100 thinking cycles (5 events each = 500 events)
        expected_thought_durations = []
        for i in range(100):
            th_id = f"th-burst-{i}"
            start_ts = curr_ts
            # thinking_start
            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="thinking_start",
                data={"id": th_id, "head": f"Suy nghĩ bước {i}", "tag": "Suy nghĩ", "seq": i + 1},
            ))
            ev_id += 1
            curr_ts += 0.005

            # 3 thinking_delta
            for d in range(3):
                events.append(SessionEvent(
                    id=ev_id,
                    ts=curr_ts,
                    type="thinking_delta",
                    data={"delta": f" [t{i}-d{d}]"},
                ))
                ev_id += 1
                curr_ts += 0.005

            # thinking_end (duration = curr_ts - start_ts)
            end_ts = curr_ts
            expected_ms = int((end_ts - start_ts) * 1000)
            expected_thought_durations.append(expected_ms)
            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="thinking_end",
                data={},
            ))
            ev_id += 1
            curr_ts += 0.01

        # 100 tool cycles (2 events each = 200 events)
        for i in range(100):
            call_id = f"call-burst-{i}"
            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="tool_call",
                data={"id": call_id, "name": "sql_db_query", "args": f"SELECT {i}", "seq": i + 1},
            ))
            ev_id += 1
            curr_ts += 0.005

            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="tool_result",
                data={"id": call_id, "result": f"Result {i}", "duration_ms": 150},
            ))
            ev_id += 1
            curr_ts += 0.005

        # 150 Data Analytics events:
        # 30 SQL pairs (60 events)
        for i in range(30):
            sql_id = f"sql-burst-{i}"
            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="sql_delta",
                data={"id": sql_id, "sql": f"SELECT * FROM table_{i}", "dialect": "sqlite"},
            ))
            ev_id += 1
            curr_ts += 0.002

            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="sql_validated",
                data={"id": sql_id, "valid": True},
            ))
            ev_id += 1
            curr_ts += 0.002

        # 30 row_batch (30 events)
        for i in range(30):
            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="row_batch",
                data={"id": f"tbl-{i}", "columns": ["id", "val"], "rows": [[i, i * 10]], "total_rows": 1},
            ))
            ev_id += 1
            curr_ts += 0.002

        # 30 chart_spec (30 events)
        for i in range(30):
            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="chart_spec",
                data={"id": f"chart-{i}", "chart_type": "bar", "title": f"Biểu đồ {i}", "spec": {"x": "id", "y": "val"}},
            ))
            ev_id += 1
            curr_ts += 0.002

        # 30 artifact (30 events)
        for i in range(30):
            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="artifact",
                data={"artifact_id": f"art-{i}", "type": "excel", "title": f"Báo cáo {i}", "payload": {"data": i}},
            ))
            ev_id += 1
            curr_ts += 0.002

        # 148 answer_delta events
        expected_answer_parts = []
        for i in range(148):
            part = f"p{i} "
            expected_answer_parts.append(part)
            events.append(SessionEvent(
                id=ev_id,
                ts=curr_ts,
                type="answer_delta",
                data={"delta": part},
            ))
            ev_id += 1
            curr_ts += 0.001

        # Event 1000: session_complete
        events.append(SessionEvent(
            id=ev_id,
            ts=curr_ts,
            type="session_complete",
            data={},
        ))

        assert len(events) == 1000, f"Expected 1000 events, got {len(events)}"
        assert events[-1].id == 1000

        meta = {
            "expected_thought_durations": expected_thought_durations,
            "expected_answer": "".join(expected_answer_parts),
        }
        return events, meta

    def test_rapid_burst_1000_events_folding_and_state_consistency(self, synthetic_1000_events):
        events, meta = synthetic_1000_events

        start_time = time.perf_counter()
        state = fold_events(events)
        elapsed_time = time.perf_counter() - start_time

        # 1. Performance check: 1,000 events folded under 500ms
        assert elapsed_time < 0.5, f"Folding 1,000 events took {elapsed_time:.3f}s (budget < 0.5s)"

        # 2. Final state consistency
        assert state.status == "completed"
        assert state.last_event_id == 1000
        assert state.user_query == "Thực hiện đại thử nghiệm 1000 events"
        assert state.worker_id == "worker-burst-01"
        assert state.active_thought is None
        assert state.error is None

        # 3. Thinking duration verification
        assert len(state.thoughts) == 100
        for idx, th in enumerate(state.thoughts):
            assert th["id"] == f"th-burst-{idx}"
            assert th["status"] == "complete"
            assert th["duration_ms"] == meta["expected_thought_durations"][idx]
            assert " [t" in th["content"]

        # 4. Tool count verification
        assert len(state.tools) == 100
        for idx, tool in enumerate(state.tools):
            assert tool["id"] == f"call-burst-{idx}"
            assert tool["name"] == "sql_db_query"
            assert tool["status"] == "complete"
            assert tool["result"] == f"Result {idx}"
            assert tool["duration_ms"] == 150

        # 5. Data analytics deliverables consistency
        sql_queries = state.get_sql_queries()
        assert len(sql_queries) == 30
        assert all(q["valid"] is True for q in sql_queries)

        data_tables = state.get_data_tables()
        assert len(data_tables) == 30

        chart_specs = state.get_chart_specs()
        assert len(chart_specs) == 30

        artifacts = state.get_artifacts()
        assert len(artifacts) == 30

        # 6. Final answer text consistency
        assert state.final_answer == meta["expected_answer"]

        # 7. Semantic XML blocks count:
        # 100 completed thoughts + 100 tool_call running + 100 tool_result complete = 300 blocks
        assert len(state.xml_blocks) == 300


# ============================================================================
# Objective 3: resume_session Slice and State Fidelity Harness
# ============================================================================

class TestResumeSessionFidelity:
    """Stress test resume_session slice boundaries and state fidelity against full log."""

    def test_resume_session_slice_boundary_conditions(self):
        events = [SessionEvent(id=i, ts=float(i), type="answer_delta", data={"delta": f"{i},"}) for i in range(1, 101)]

        # Case 1: last_event_id is None -> returns all 100 events
        state_none, slice_none = resume_session(events, last_event_id=None)
        assert len(slice_none) == 100
        assert slice_none == events
        assert state_none.last_event_id == 100

        # Case 2: last_event_id is 0 -> returns all 100 events
        state_0, slice_0 = resume_session(events, last_event_id=0)
        assert len(slice_0) == 100
        assert slice_0 == events

        # Case 3: last_event_id is 50 -> returns events with id 51..100 (50 events)
        state_50, slice_50 = resume_session(events, last_event_id=50)
        assert len(slice_50) == 50
        assert [e.id for e in slice_50] == list(range(51, 101))

        # Case 4: last_event_id is 99 -> returns exactly 1 event (id 100)
        state_99, slice_99 = resume_session(events, last_event_id=99)
        assert len(slice_99) == 1
        assert slice_99[0].id == 100

        # Case 5: last_event_id is 100 (complete) -> returns empty list
        state_100, slice_100 = resume_session(events, last_event_id=100)
        assert len(slice_100) == 0

        # Case 6: last_event_id is 200 (ahead of server) -> returns empty list
        state_200, slice_200 = resume_session(events, last_event_id=200)
        assert len(slice_200) == 0

    def test_resume_session_state_fidelity_and_incremental_replay(self):
        """Verify that incremental replaying of new_events onto pre-folded state equals full fold."""
        events = [
            SessionEvent(id=1, ts=1.0, type="session_start", data={"prompt": "Truy vấn lớn"}),
            SessionEvent(id=2, ts=1.1, type="thinking_start", data={"id": "th-1", "head": "Lập kế hoạch"}),
            SessionEvent(id=3, ts=1.2, type="thinking_delta", data={"delta": "Đang suy nghĩ..."}),
            SessionEvent(id=4, ts=1.5, type="thinking_end", data={}),
            SessionEvent(id=5, ts=1.6, type="tool_call", data={"id": "c1", "name": "sql_query", "args": "SELECT 1"}),
            SessionEvent(id=6, ts=1.8, type="tool_result", data={"id": "c1", "result": "1"}),
            SessionEvent(id=7, ts=2.0, type="answer_delta", data={"delta": "Đoạn 1."}),
            SessionEvent(id=8, ts=2.1, type="answer_delta", data={"delta": " Đoạn 2."}),
            SessionEvent(id=9, ts=2.2, type="session_complete", data={}),
        ]
        full_state = fold_events(events)

        # Test reconnection at every possible cutoff point k in [0..9]
        for k in range(0, 10):
            # Server resume
            resumed_state, new_events = resume_session(events, last_event_id=k if k > 0 else None)
            assert resumed_state == full_state, f"Cutoff {k}: resumed state does not match full state"

            # Client side incremental fold simulation:
            # Client has already folded events up to k
            client_prev_state = fold_events(events[:k]) if k > 0 else DurableSessionState()
            client_updated_state = fold_events(new_events, initial=client_prev_state)
            assert client_updated_state == full_state, f"Cutoff {k}: client incremental update mismatch"


# ============================================================================
# Objective 4: Semantic XML Block Extraction with Malformed & Nested Blocks
# ============================================================================

class TestSemanticXMLBlockExtraction:
    """Stress test XML card extraction with nested, malformed, and complex XML."""

    def test_standard_and_mixed_case_extraction(self):
        text = (
            'Leading prose text...\n'
            '<thought id="th-1" seq="1" status="complete" tag="Suy nghĩ" head="Chiến lược">\n'
            'Nội dung suy nghĩ tiếng Việt có dấu: 100% doanh thu.\n'
            '</thought>\n'
            'Middle prose...\n'
            '<TOOL id="tl-1" name="sql_query" seq="2" status="complete" ms="250ms">\n'
            'SELECT * FROM sales;\n'
            '</TOOL>\n'
            '<clause id="cl-1" no="1" title="Điều 1: Định nghĩa">Nội dung điều khoản</clause>\n'
            '<CONTRACT id="ct-1" type="legal" title="HỢP ĐỒNG KINH TẾ">\n'
            '<clause id="cl-sub" no="1.1" title="Khoản 1">Nội dung con</clause>\n'
            '</CONTRACT>\n'
            'Trailing prose.'
        )

        blocks = extract_semantic_xml_blocks(text)
        tags = extract_semantic_tags(text)

        assert len(blocks) == 4
        assert tags == ["thought", "tool", "clause", "contract"]

        # Tag 1: thought
        assert '<thought id="th-1"' in blocks[0]
        assert 'Nội dung suy nghĩ tiếng Việt' in blocks[0]

        # Tag 2: tool (case insensitive match <TOOL>)
        assert '<TOOL id="tl-1"' in blocks[1]

        # Tag 3: clause
        assert '<clause id="cl-1"' in blocks[2]

        # Tag 4: contract (outer contract encloses inner content)
        assert '<CONTRACT id="ct-1"' in blocks[3]
        assert '</CONTRACT>' in blocks[3]

    def test_nested_different_tags_behavior(self):
        """Examine how nested blocks of different types are extracted."""
        # Contract with inner clause: Outer contract is matched as a single top-level block
        text = '<contract id="c-1" title="Hợp đồng"><clause no="1">Khoản 1</clause></contract>'
        blocks = extract_semantic_xml_blocks(text)
        assert len(blocks) == 1
        assert blocks[0] == text
        assert extract_semantic_tags(text) == ["contract"]

        # Thought mentioning tool usage in internal monologue
        thought_with_tool = '<thought id="th-1">Tôi sẽ gọi <tool id="t1" name="query">SELECT 1</tool> để lấy số</thought>'
        t_blocks = extract_semantic_xml_blocks(thought_with_tool)
        assert len(t_blocks) == 1
        assert t_blocks[0] == thought_with_tool
        assert extract_semantic_tags(thought_with_tool) == ["thought"]

    def test_nested_identical_tags_behavior(self):
        """Document non-greedy regex behavior on nested identical tags:
        <thought id="1">outer <thought id="2">inner</thought> tail</thought>
        The non-greedy .*? closes at the first </thought>, extracting outer opening to inner close.
        """
        nested_same = '<thought id="1">outer <thought id="2">inner</thought> tail</thought>'
        nested_blocks = extract_semantic_xml_blocks(nested_same)
        assert len(nested_blocks) == 1
        assert nested_blocks[0] == '<thought id="1">outer <thought id="2">inner</thought>'

    def test_malformed_xml_resilience(self):
        """Malformed XML should not crash or produce invalidly closed blocks."""
        # 1. Truly unclosed tag: no matching closing tag anywhere
        unclosed = '<thought id="th-1">Chưa đóng thẻ này bao giờ...'
        assert extract_semantic_xml_blocks(unclosed) == []
        assert extract_semantic_tags(unclosed) == []

        # 2. Mismatched tag names: <thought>...</tool>
        mismatched = '<thought id="th-1">Nội dung</tool>'
        assert extract_semantic_xml_blocks(mismatched) == []
        assert extract_semantic_tags(mismatched) == []

        # 3. Second mismatched test: <tool>...</clause>
        mismatched_2 = '<tool id="bad">Nội dung</clause>'
        assert extract_semantic_xml_blocks(mismatched_2) == []

        # 4. Corrupted tag opening: missing closing > on tag declaration
        broken_open = '<thought id="th-1" unclosed-attr'
        assert extract_semantic_xml_blocks(broken_open) == []

        # 5. Empty tags: <thought></thought>
        empty_tag = '<thought></thought>'
        assert extract_semantic_xml_blocks(empty_tag) == ['<thought></thought>']
        assert extract_semantic_tags(empty_tag) == ['thought']

        # 6. Non-semantic tag names: e.g. <div>, <p>, <script>
        non_semantic = '<div>hello</div><script>alert(1)</script><p>text</p>'
        assert extract_semantic_xml_blocks(non_semantic) == []
        assert extract_semantic_tags(non_semantic) == []

        # 7. Combined document with mismatched tags and valid standalone tags
        mixed_text = (
            'Normal text\n'
            '<tool id="bad">mismatched tag</clause>\n'
            '<thought id="good">Valid thought</thought>\n'
            '<random>ignored</random>\n'
            '<clause no="2" title="Hợp lệ">Nội dung chuẩn</clause>\n'
        )
        mixed_blocks = extract_semantic_xml_blocks(mixed_text)
        assert len(mixed_blocks) == 2
        assert '<thought id="good">Valid thought</thought>' in mixed_blocks
        assert '<clause no="2" title="Hợp lệ">Nội dung chuẩn</clause>' in mixed_blocks
        assert extract_semantic_tags(mixed_text) == ["thought", "clause"]

    def test_unclosed_tag_swallowing_subsequent_tag_of_same_type(self):
        r"""Adversarial stress test: An unclosed <thought> tag followed later by a valid <thought>...</thought>.
        Because the regex is r'<(thought|...)>[\s\S]*?</\1>', the unclosed opening tag matches forward
        until the first closing tag </thought>, swallowing the second tag.
        This test documents and asserts this exact parser boundary condition.
        """
        problematic_stream = (
            '<thought id="unclosed">Incomplete thought without its own closing tag\n'
            '<thought id="valid">Legitimate thought</thought>'
        )
        extracted = extract_semantic_xml_blocks(problematic_stream)
        # Verify empirical regex behavior: exactly 1 merged/swallowed block is produced
        assert len(extracted) == 1
        assert extracted[0].startswith('<thought id="unclosed">')
        assert extracted[0].endswith('</thought>')
        assert '<thought id="valid">Legitimate thought</thought>' in extracted[0]
