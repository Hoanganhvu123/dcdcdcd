"""DualFormatStreamAdapter Test Suite (R01 Event Contract & SSE Encodings).

Validates:
1. Canonical R01 JSON Envelope format (schemaVersion: 1, runId, threadId, seq, eventId, timestamp).
2. Vercel AI SDK v6 Data Stream format (0: text delta, b: custom event, d: finish).
3. Legacy / Cuccu SSE format (data: {json}, data: [DONE]).
4. Monotonic sequence numbering and runId continuity across emissions.
5. Async StateGraph stream transformation filtering for author nodes.
"""

from __future__ import annotations

import json
import pytest
from dbgpt_analyst.events import DualFormatStreamAdapter


class TestDualFormatStreamAdapter:
    """Verify Canonical, AI SDK v6, and Legacy output formats."""

    def test_default_adapter_mode_is_canonical(self):
        adapter = DualFormatStreamAdapter()
        assert adapter.format_mode == "canonical"

    # ─── Canonical R01 Envelope Tests ────────────────────────────────────────

    def test_canonical_text_delta_envelope(self):
        adapter = DualFormatStreamAdapter(
            format_mode="canonical",
            run_id="run-test-01",
            thread_id="thread-test-01",
        )
        raw = adapter.encode_text_delta("Xin chào, tôi là trợ lý dữ liệu.")
        assert raw.startswith("data: ")
        assert raw.endswith("\n\n")

        envelope = json.loads(raw[len("data: "):-2])
        assert envelope["schemaVersion"] == 1
        assert envelope["runId"] == "run-test-01"
        assert envelope["threadId"] == "thread-test-01"
        assert envelope["seq"] == 1
        assert envelope["eventId"].startswith("evt-")
        assert envelope["type"] == "answer.delta"
        assert envelope["payload"]["text"] == "Xin chào, tôi là trợ lý dữ liệu."
        assert envelope["payload"]["visibility"] == "answer"
        assert "timestamp" in envelope

    def test_canonical_seq_increments_monotonically(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical")
        e1 = json.loads(adapter.encode_text_delta("Token 1")[6:-2])
        e2 = json.loads(adapter.encode_text_delta("Token 2")[6:-2])
        e3 = json.loads(adapter.encode_custom_event("thinking", {"content": "Thinking..."})[6:-2])
        e4 = json.loads(adapter.encode_finish("stop")[6:-2])

        assert e1["seq"] == 1
        assert e2["seq"] == 2
        assert e3["seq"] == 3
        assert e4["seq"] == 4
        assert adapter.seq == 4

    def test_canonical_custom_event_envelope(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical", run_id="run-custom")
        raw = adapter.encode_custom_event("artifact.section.completed", {"sectionId": "sec-summary"})
        envelope = json.loads(raw[len("data: "):-2])

        assert envelope["schemaVersion"] == 1
        assert envelope["type"] == "artifact.section.completed"
        assert envelope["payload"]["sectionId"] == "sec-summary"
        assert envelope["runId"] == "run-custom"

    def test_canonical_finish_envelope(self):
        adapter = DualFormatStreamAdapter(format_mode="canonical")
        raw = adapter.encode_finish(finish_reason="stop", usage={"prompt_tokens": 50, "completion_tokens": 120})
        envelope = json.loads(raw[len("data: "):-2])

        assert envelope["schemaVersion"] == 1
        assert envelope["type"] == "run.completed"
        assert envelope["payload"]["finishReason"] == "stop"
        assert envelope["payload"]["usage"]["prompt_tokens"] == 50

    # ─── Vercel AI SDK v6 Tests ──────────────────────────────────────────────

    def test_ai_sdk_v6_text_delta(self):
        adapter = DualFormatStreamAdapter(format_mode="ai-sdk-v6")
        raw = adapter.encode_text_delta("Doanh thu quý 3 đạt 12.5 tỷ VND.")
        assert raw.startswith("0:")
        assert raw.endswith("\n")
        assert not raw.endswith("\n\n")

        text = json.loads(raw[2:].strip())
        assert text == "Doanh thu quý 3 đạt 12.5 tỷ VND."

    def test_ai_sdk_v6_custom_event(self):
        adapter = DualFormatStreamAdapter(format_mode="ai-sdk-v6")
        raw = adapter.encode_custom_event("sql_delta", {"query": "SELECT * FROM orders"})
        assert raw.startswith("b:")
        payload = json.loads(raw[2:].strip())
        assert payload["type"] == "sql_delta"
        assert payload["query"] == "SELECT * FROM orders"

    def test_ai_sdk_v6_finish(self):
        adapter = DualFormatStreamAdapter(format_mode="ai-sdk-v6")
        raw = adapter.encode_finish(finish_reason="stop", usage={"total_tokens": 200})
        assert raw.startswith("d:")
        payload = json.loads(raw[2:].strip())
        assert payload["finishReason"] == "stop"
        assert payload["usage"]["total_tokens"] == 200

    # ─── Legacy SSE Tests ───────────────────────────────────────────────────

    def test_legacy_text_delta(self):
        adapter = DualFormatStreamAdapter(format_mode="legacy")
        raw = adapter.encode_text_delta("Phân tích PnL hoàn tất")
        assert raw.startswith("data: ")
        assert raw.endswith("\n\n")

        payload = json.loads(raw[len("data: "):-2])
        assert payload["type"] == "text-delta"
        assert payload["content"] == "Phân tích PnL hoàn tất"

    def test_legacy_custom_event_mapping(self):
        adapter = DualFormatStreamAdapter(format_mode="legacy")
        raw = adapter.encode_custom_event("todos_update", {"todos": [{"id": 1, "title": "Query DB"}]})
        payload = json.loads(raw[len("data: "):-2])
        assert payload["type"] == "data-todos"
        assert len(payload["data"]["todos"]) == 1

    def test_legacy_finish_with_done_sentinel(self):
        adapter = DualFormatStreamAdapter(format_mode="legacy")
        raw = adapter.encode_finish(finish_reason="stop")
        assert "data: [DONE]\n\n" in raw
        parts = raw.split("\n\n")
        finish_json = json.loads(parts[0][len("data: "):])
        assert finish_json["type"] == "finish"
        assert finish_json["finishReason"] == "stop"
        assert parts[1] == "data: [DONE]"

    # ─── Stream Graph Execution Mock Test ────────────────────────────────────

    @pytest.mark.asyncio
    async def test_stream_graph_execution_filters_author_nodes(self):
        class MockMessage:
            def __init__(self, content, usage=None):
                self.content = content
                self.usage_metadata = usage or {}

        class MockGraph:
            async def astream(self, initial_state, config, stream_mode):
                # 1. Custom event
                yield ("custom", {"type": "thinking", "data": "Checking schema"})
                # 2. Non-author node message (e.g., tool node) - should be ignored for text delta
                yield ("messages", (MockMessage("Tool raw output"), {"langgraph_node": "tools_node"}))
                # 3. Author node message (supervisor / answer_node) - should emit text delta
                yield ("messages", (MockMessage("Kết quả: 5 đơn hàng"), {"langgraph_node": "answer_node"}))

        adapter = DualFormatStreamAdapter(format_mode="canonical", run_id="run-graph")
        graph = MockGraph()
        chunks = []
        async for chunk in adapter.stream_graph_execution(graph, {}, {}):
            chunks.append(chunk)

        # Expect 3 chunks: custom thinking, answer_node text delta, run.completed
        assert len(chunks) == 3

        c1 = json.loads(chunks[0][len("data: "):-2])
        assert c1["type"] == "thinking"
        assert c1["payload"]["data"] == "Checking schema"

        c2 = json.loads(chunks[1][len("data: "):-2])
        assert c2["type"] == "answer.delta"
        assert c2["payload"]["text"] == "Kết quả: 5 đơn hàng"

        c3 = json.loads(chunks[2][len("data: "):-2])
        assert c3["type"] == "run.completed"
        assert c3["payload"]["finishReason"] == "stop"
