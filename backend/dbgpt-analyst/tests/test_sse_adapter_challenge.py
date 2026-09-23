"""Adversarial stress harness for Milestone 2 (DualFormatStreamAdapter & EventEmitter).

Empirical challenger tests covering:
1. Wire format compliance: Canonical JSON envelope, AI SDK v6, Legacy SSE.
2. Sequence number monotonicity (seq increments by 1 per event without gaps/duplicates).
3. Edge cases: empty deltas, complex JSON, unicode, emoji, newlines, special characters.
4. Non-author node suppression in stream_graph_execution.
"""

from __future__ import annotations

import json
import pytest
from dbgpt_analyst.events.sse_adapter import DualFormatStreamAdapter
from dbgpt_analyst.events.envelope import EventEmitter


# ═════════════════════════════════════════════════════════════════════════════
# 1. Wire Format Compliance Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestWireFormatCompliance:
    """Verify exact SSE outputs against Canonical, AI SDK v6, and Legacy specifications."""

    def test_canonical_text_delta_wire_format(self):
        adapter = DualFormatStreamAdapter(
            format_mode="canonical",
            run_id="run-c1",
            thread_id="th-c1"
        )
        raw = adapter.encode_text_delta("Xin chào dữ liệu", visibility="analyst_reasoning")

        assert raw.startswith("data: ")
        assert raw.endswith("\n\n")

        line = raw[len("data: "):-2]
        assert "\n" not in line  # SSE line must be a single line without raw newlines

        envelope = json.loads(line)
        assert envelope["schemaVersion"] == 1
        assert envelope["eventId"].startswith("evt-")
        assert envelope["runId"] == "run-c1"
        assert envelope["threadId"] == "th-c1"
        assert envelope["seq"] == 1
        assert envelope["type"] == "answer.delta"
        assert isinstance(envelope["timestamp"], str)
        assert envelope["payload"] == {
            "text": "Xin chào dữ liệu",
            "visibility": "analyst_reasoning"
        }

    def test_canonical_custom_event_wire_format(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical", run_id="run-c2")
        raw = adapter.encode_custom_event("tool.execution.step", {"step": 2, "status": "running"})
        envelope = json.loads(raw[len("data: "):-2])

        assert envelope["schemaVersion"] == 1
        assert envelope["type"] == "tool.execution.step"
        assert envelope["payload"] == {"step": 2, "status": "running"}
        assert envelope["seq"] == 1

    def test_canonical_finish_wire_format(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical")
        usage = {"prompt_tokens": 120, "completion_tokens": 45, "total_tokens": 165}
        raw = adapter.encode_finish(finish_reason="stop", usage=usage)
        envelope = json.loads(raw[len("data: "):-2])

        assert envelope["schemaVersion"] == 1
        assert envelope["type"] == "run.completed"
        assert envelope["payload"]["finishReason"] == "stop"
        assert envelope["payload"]["usage"] == usage
        assert envelope["seq"] == 1

    def test_ai_sdk_v6_text_delta_wire_format(self):
        adapter = DualFormatStreamAdapter(format_mode="ai-sdk-v6")
        raw = adapter.encode_text_delta("Streaming chunk v6")

        assert raw.startswith("0:")
        assert raw.endswith("\n")
        assert not raw.endswith("\n\n")

        unpacked = json.loads(raw[2:].rstrip("\n"))
        assert unpacked == "Streaming chunk v6"

    def test_ai_sdk_v6_custom_event_wire_format(self):
        adapter = DualFormatStreamAdapter(format_mode="ai-sdk-v6")
        raw = adapter.encode_custom_event("data-chart", {"spec": {"type": "bar"}})

        assert raw.startswith("b:")
        assert raw.endswith("\n")
        assert not raw.endswith("\n\n")

        envelope = json.loads(raw[2:].rstrip("\n"))
        assert envelope["type"] == "data-chart"
        assert envelope["spec"] == {"type": "bar"}

    def test_ai_sdk_v6_finish_wire_format(self):
        adapter = DualFormatStreamAdapter(format_mode="ai-sdk-v6")
        raw = adapter.encode_finish(finish_reason="length", usage={"tokens": 4096})

        assert raw.startswith("d:")
        assert raw.endswith("\n")
        assert not raw.endswith("\n\n")

        payload = json.loads(raw[2:].rstrip("\n"))
        assert payload["finishReason"] == "length"
        assert payload["usage"] == {"tokens": 4096}

    def test_legacy_text_delta_wire_format(self):
        adapter = DualFormatStreamAdapter(format_mode="legacy")
        raw = adapter.encode_text_delta("Token legacy")

        assert raw.startswith("data: ")
        assert raw.endswith("\n\n")
        parsed = json.loads(raw[len("data: "):-2])
        assert parsed == {"type": "text-delta", "content": "Token legacy"}

    def test_legacy_all_custom_mappings_wire_format(self):
        adapter = DualFormatStreamAdapter(format_mode="legacy")
        mappings = {
            "todos_update": "data-todos",
            "subagent_start": "data-subagent",
            "subagent_token": "data-subagent-delta",
            "subagent_complete": "data-subagent",
            "skill_loaded": "data-skill",
            "thinking": "data-thinking",
            "audit_card": "data-audit-card",
            "data-audit-card": "data-audit-card",
            "sql_delta": "data-sql-delta",
            "chart_spec": "data-chart-spec",
            "artifact": "data-artifact",
            "unmapped_custom_event": "data-unmapped_custom_event",
        }
        for orig_type, expected_legacy in mappings.items():
            raw = adapter.encode_custom_event(orig_type, {"val": 123})
            parsed = json.loads(raw[len("data: "):-2])
            assert parsed["type"] == expected_legacy
            assert parsed["data"] == {"val": 123}

    def test_legacy_finish_with_done_sentinel_wire_format(self):
        adapter = DualFormatStreamAdapter(format_mode="legacy")
        raw = adapter.encode_finish(finish_reason="stop", usage={"cost": 0.01})
        lines = [line for line in raw.split("\n\n") if line.strip()]

        assert len(lines) == 2
        finish_part = json.loads(lines[0][len("data: "):])
        assert finish_part["type"] == "finish"
        assert finish_part["finishReason"] == "stop"
        assert finish_part["usage"] == {"cost": 0.01}
        assert lines[1] == "data: [DONE]"

    def test_event_emitter_wire_compliance_and_finality(self):
        emitter = EventEmitter(run_id="run-emitter-1", thread_id="th-1")
        # 1. run.started
        e1 = emitter.emit("run.started")
        assert json.loads(e1[6:-2])["type"] == "run.started"
        assert emitter.status == "running"

        # 2. heartbeat does not increment seq
        seq_before = emitter.seq
        hb = emitter.emit("heartbeat", {"ping": "pong"})
        assert json.loads(hb[6:-2])["type"] == "heartbeat"
        assert emitter.seq == seq_before

        # 3. run.completed (terminal)
        term = emitter.emit("run.completed", {"summary": "done"})
        assert json.loads(term[6:-2])["type"] == "run.completed"
        assert emitter.status == "completed"

        # 4. Drop events after terminal state
        dropped = emitter.emit("answer.delta", {"text": "should be dropped"})
        assert dropped == ""

        # 5. Resume restores emitter
        emitter.resume()
        assert emitter.status == "running"
        e_resumed = emitter.emit("answer.delta", {"text": "resumed"})
        assert json.loads(e_resumed[6:-2])["type"] == "answer.delta"


# ═════════════════════════════════════════════════════════════════════════════
# 2. Sequence Monotonicity Stress Tests
# ═════════════════════════════════════════════════════════════════════════════

class TestSequenceMonotonicity:
    """Verify seq strictly increments by 1 per event with 0 duplicates and 0 gaps."""

    def test_seq_monotonicity_mixed_events(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical")
        assert adapter.seq == 0

        # Emit 100 mixed events
        for i in range(1, 101):
            if i % 3 == 0:
                raw = adapter.encode_custom_event("custom.event", {"idx": i})
            elif i % 3 == 1:
                raw = adapter.encode_text_delta(f"token_{i}")
            else:
                raw = adapter.encode_custom_event("thinking", {"thought": f"t_{i}"})

            env = json.loads(raw[len("data: "):-2])
            assert env["seq"] == i
            assert adapter.seq == i

        # Emit finish event
        fin = adapter.encode_finish("stop")
        env_fin = json.loads(fin[len("data: "):-2])
        assert env_fin["seq"] == 101
        assert adapter.seq == 101

    def test_seq_monotonicity_rapid_stress_5000(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical", run_id="stress-seq")
        count = 5000
        prev_seq = 0
        for i in range(1, count + 1):
            raw = adapter.encode_text_delta(f"t{i}")
            env = json.loads(raw[len("data: "):-2])
            curr_seq = env["seq"]
            assert curr_seq == prev_seq + 1
            prev_seq = curr_seq

        assert adapter.seq == count


# ═════════════════════════════════════════════════════════════════════════════
# 3. Edge Cases Tests (Empty Deltas, Complex JSON, Unicode, Special Chars)
# ═════════════════════════════════════════════════════════════════════════════

class TestEdgeCases:
    """Stress test boundary inputs and edge conditions."""

    @pytest.mark.parametrize("empty_text", ["", "   ", "\t", "\n", "\r\n", "   \n\t   "])
    def test_empty_and_whitespace_deltas_canonical(self, empty_text):
        adapter = DualFormatStreamAdapter(format_mode="canonical")
        raw = adapter.encode_text_delta(empty_text)
        assert raw.startswith("data: ")
        assert raw.endswith("\n\n")

        line = raw[len("data: "):-2]
        # In SSE, text with newlines MUST be JSON-escaped, so no raw newlines in `line`
        assert "\n" not in line
        assert "\r" not in line

        env = json.loads(line)
        assert env["payload"]["text"] == empty_text

    @pytest.mark.parametrize("empty_text", ["", "   ", "\t", "\n", "\r\n"])
    def test_empty_and_whitespace_deltas_ai_sdk_v6(self, empty_text):
        adapter = DualFormatStreamAdapter(format_mode="ai-sdk-v6")
        raw = adapter.encode_text_delta(empty_text)
        assert raw.startswith("0:")
        assert raw.endswith("\n")
        assert not raw.endswith("\n\n")

        val = json.loads(raw[2:].rstrip("\n"))
        assert val == empty_text

    @pytest.mark.parametrize("empty_text", ["", "   ", "\t", "\n", "\r\n"])
    def test_empty_and_whitespace_deltas_legacy(self, empty_text):
        adapter = DualFormatStreamAdapter(format_mode="legacy")
        raw = adapter.encode_text_delta(empty_text)
        assert raw.startswith("data: ")
        assert raw.endswith("\n\n")

        line = raw[len("data: "):-2]
        assert "\n" not in line
        parsed = json.loads(line)
        assert parsed["content"] == empty_text

    def test_unicode_and_emoji_stress(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical")
        sample_text = (
            "Tiếng Việt: Thử nghiệm phân tích PnL 📊🚀\n"
            "CJK: 中文分析 and 日本語テスト and 한국어 테스트\n"
            "Special symbols: © ® ™ § ¶ † ‡ € £ ¥ ₹ ₿\n"
            "Math: ∑ ∏ √ ∫ ≈ ≠ ≤ ≥ ± ∞\n"
            "Quotes & backslashes: \"double\" 'single' `backtick` \\backslash /slash\n"
            "Null byte: \u0000 and bell: \u0007"
        )
        raw = adapter.encode_text_delta(sample_text)
        line = raw[len("data: "):-2]
        # Verify valid single-line SSE
        assert "\n" not in line

        env = json.loads(line)
        assert env["payload"]["text"] == sample_text

    def test_deeply_nested_complex_json_payload(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical")
        deep_dict = {
            "level1": {
                "level2": {
                    "level3": [
                        {"id": 1, "val": 3.141592653589793, "active": True, "nullable": None},
                        {"id": 2, "tags": ["alpha", "beta", "gamma"], "sub": {"flag": False}},
                    ],
                    "metrics": {
                        "revenue": 100_000_000_000,
                        "growth_rate": -0.045,
                        "nan_replacement": "N/A",
                    },
                }
            },
            "columns": ["col_1", "col_2", "col_3"],
            "rows": [list(range(50)) for _ in range(20)],
        }

        raw = adapter.encode_custom_event("data_table_analysis", deep_dict)
        env = json.loads(raw[len("data: "):-2])
        assert env["payload"] == deep_dict

    def test_non_dict_payload_in_custom_event(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical")
        # List payload
        r1 = adapter.encode_custom_event("list_event", [1, 2, "three"])
        e1 = json.loads(r1[6:-2])
        assert e1["payload"] == {"data": [1, 2, "three"]}

        # Primitive string payload
        r2 = adapter.encode_custom_event("str_event", "raw_message")
        e2 = json.loads(r2[6:-2])
        assert e2["payload"] == {"data": "raw_message"}

        # Int payload
        r3 = adapter.encode_custom_event("int_event", 42)
        e3 = json.loads(r3[6:-2])
        assert e3["payload"] == {"data": 42}

        # None payload
        r4 = adapter.encode_custom_event("none_event", None)
        e4 = json.loads(r4[6:-2])
        assert e4["payload"] == {"data": None}


# ═════════════════════════════════════════════════════════════════════════════
# 4. Non-Author Node Suppression Tests in stream_graph_execution
# ═════════════════════════════════════════════════════════════════════════════

class TestNonAuthorNodeSuppression:
    """Verify only authorized author nodes emit text deltas."""

    @pytest.mark.asyncio
    async def test_non_author_suppression_exhaustive(self):
        class MockChunk:
            def __init__(self, content, usage=None):
                self.content = content
                self.usage_metadata = usage or {}

        class MockExhaustiveGraph:
            async def astream(self, initial_state, config, stream_mode):
                # Non-author nodes that MUST be suppressed
                suppressed_nodes = [
                    "tools_node",
                    "classifier_node",
                    "artifact_node",
                    "retriever_node",
                    "sql_executor",
                    "validator",
                    "",
                    "unknown_node"
                ]
                for node in suppressed_nodes:
                    yield ("messages", (MockChunk(f"Confidential data from {node}"), {"langgraph_node": node}))

                # Messages without metadata node name
                yield ("messages", (MockChunk("No node metadata"), {}))

                # Empty content messages from author nodes should also produce no text delta
                yield ("messages", (MockChunk(""), {"langgraph_node": "answer_node"}))

                # Custom events MUST NOT be suppressed regardless of node
                yield ("custom", {"type": "thinking", "content": "Valid thinking block"})
                yield ("custom", {"type": "todos_update", "todos": ["t1", "t2"]})

                # Authorized author nodes that MUST emit
                author_nodes = ["supervisor", "supervisor_node", "analyst", "answer_node"]
                for i, author in enumerate(author_nodes):
                    yield ("messages", (
                        MockChunk(f"Author text {i+1} from {author}"),
                        {"langgraph_node": author}
                    ))

        adapter = DualFormatStreamAdapter(format_mode="canonical", run_id="run-suppress")
        graph = MockExhaustiveGraph()
        emitted_chunks = []
        async for chunk in adapter.stream_graph_execution(graph, {}, {}):
            emitted_chunks.append(chunk)

        # Parse all emitted events
        parsed_events = []
        for c in emitted_chunks:
            assert c.startswith("data: ")
            assert c.endswith("\n\n")
            parsed_events.append(json.loads(c[len("data: "):-2]))

        event_types = [e["type"] for e in parsed_events]

        # Expect:
        # 1. custom "thinking"
        # 2. custom "todos_update"
        # 3. 4 author text deltas (supervisor, supervisor_node, analyst, answer_node)
        # 4. 1 final run.completed
        assert len(parsed_events) == 7

        assert event_types == [
            "thinking",
            "todos_update",
            "answer.delta",
            "answer.delta",
            "answer.delta",
            "answer.delta",
            "run.completed",
        ]

        # Verify NO suppressed node text leaked into answer.delta
        author_texts = [e["payload"]["text"] for e in parsed_events if e["type"] == "answer.delta"]
        assert len(author_texts) == 4
        assert author_texts[0] == "Author text 1 from supervisor"
        assert author_texts[1] == "Author text 2 from supervisor_node"
        assert author_texts[2] == "Author text 3 from analyst"
        assert author_texts[3] == "Author text 4 from answer_node"

        for leak_keyword in ["Confidential", "No node metadata"]:
            for text in author_texts:
                assert leak_keyword not in text

    @pytest.mark.asyncio
    async def test_multi_part_content_filtering(self):
        """Verify list-format content blocks (like Anthropic / OpenAI tool calls + text)."""
        class MultiPartChunk:
            def __init__(self, content):
                self.content = content

        class MockMultiPartGraph:
            async def astream(self, initial_state, config, stream_mode):
                # Mixed list: text part + non-text part (e.g. tool_call)
                yield ("messages", (
                    MultiPartChunk([
                        {"type": "text", "text": "Part A text"},
                        {"type": "tool_use", "id": "call_1", "name": "sql"},
                        {"type": "text", "text": " Part B text"},
                        "unstructured string in list (should not crash)",
                        12345,  # non-dict in list
                    ]),
                    {"langgraph_node": "answer_node"}
                ))

        adapter = DualFormatStreamAdapter(format_mode="canonical")
        graph = MockMultiPartGraph()
        chunks = []
        async for c in adapter.stream_graph_execution(graph, {}, {}):
            chunks.append(c)

        # Should emit: Part A text, Part B text, and finish
        assert len(chunks) == 3
        e1 = json.loads(chunks[0][6:-2])
        e2 = json.loads(chunks[1][6:-2])
        e3 = json.loads(chunks[2][6:-2])

        assert e1["type"] == "answer.delta"
        assert e1["payload"]["text"] == "Part A text"
        assert e2["type"] == "answer.delta"
        assert e2["payload"]["text"] == " Part B text"
        assert e3["type"] == "run.completed"
