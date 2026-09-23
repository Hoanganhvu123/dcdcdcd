"""Event phát từ trong subgraph phải ra tới `astream` của graph cha.

Đây là bài test canh cho một lỗi đã có thật trong repo: 9 chỗ dùng
`adispatch_custom_event` để re-broadcast, và không chỗ nào tới được client. Lý do:
LangGraph có hai kênh custom event riêng biệt, `adispatch_custom_event` chỉ chảy vào
`astream_events(version="v2")`, còn `analyst_streamer` đọc
`graph.astream(stream_mode=["custom"])`.

Test này cố tình khẳng định CẢ HAI CHIỀU — cái mới chạy được, cái cũ thì không —
để lần sau ai đổi ngược lại thì đỏ ngay, thay vì im lặng mất event như trước.
"""

import asyncio

from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from dbgpt_analyst.events.base import emit_custom


class _S(TypedDict, total=False):
    n: int


def _run(node):
    """Chạy `node` trong một graph, trả về payload nhánh `custom`."""
    builder = StateGraph(_S)
    builder.add_node("go", node)
    builder.set_entry_point("go")
    builder.add_edge("go", END)
    graph = builder.compile()

    async def _collect():
        return [
            payload
            async for kind, payload in graph.astream(
                {"n": 0}, stream_mode=["updates", "custom"]
            )
            if kind == "custom"
        ]

    return asyncio.run(_collect())


def test_emit_custom_reaches_the_stream_the_streamer_reads():
    async def node(_state):
        emit_custom("ping", {"a": 1})
        return {"n": 1}

    assert _run(node) == [{"name": "ping", "data": {"a": 1}}]


def test_adispatch_custom_event_does_not_reach_it():
    """Bằng chứng đo được, không phải phỏng đoán: API cũ phát vào hư không."""

    async def node(_state, config):
        from langchain_core.callbacks import adispatch_custom_event

        await adispatch_custom_event("ping", {"a": 1}, config=config)
        return {"n": 1}

    assert _run(node) == [], "nếu chỗ này xanh lại thì bỏ được emit_custom"


def test_event_from_inside_a_subgraph_reaches_the_parent_stream():
    """Đúng hình dạng re-broadcast của `subgraph_stream`: node cha tự lái subgraph
    bằng `astream` rồi phát tiếp từng mẩu ra kênh custom của chính nó."""

    child_builder = StateGraph(_S)

    async def child_node(_state):
        emit_custom("child_tick", {"i": 7})
        return {"n": 2}

    child_builder.add_node("c", child_node)
    child_builder.set_entry_point("c")
    child_builder.add_edge("c", END)
    child = child_builder.compile()

    async def parent_node(state):
        async for kind, payload in child.astream(
            state, stream_mode=["updates", "custom"]
        ):
            emit_custom("subgraph_stream", {"kind": kind, "payload": payload})
        return {"n": 3}

    names = [p["name"] for p in _run(parent_node)]
    assert names.count("subgraph_stream") >= 2, names

    inner = [
        p["data"]["payload"]
        for p in _run(parent_node)
        if p["data"]["kind"] == "custom"
    ]
    assert inner == [{"name": "child_tick", "data": {"i": 7}}]


def test_recursive_subgraph_stream_unwrapping_reaches_root_event():
    """Mô phỏng 2 tầng subagent (subgraph -> subagent adapter -> deepagents atask):
    Unwrap đệ quy bằng vòng lặp while phải bóc hết các lớp subgraph_stream để chạm tới
    event gốc (artifact.start, artifact.ready, thinking_delta, etc.)."""
    root_payload = {"name": "artifact.start", "data": {"id": "ppt123", "kind": "ppt", "title": "Sales Report"}}
    # Layer 1: wrapped by adapter
    layer1 = {"name": "subgraph_stream", "data": {"kind": "custom", "payload": root_payload, "subgraph_name": "office_writer"}}
    # Layer 2: wrapped by atask middleware
    layer2 = {"name": "subgraph_stream", "data": {"kind": "custom", "payload": layer1, "subagent_type": "office_writer"}}

    # Simulate the unwrapping loop from analyst_streamer.py
    kind = "custom"
    payload = layer2
    subgraph_name = None

    while (
        kind == "custom"
        and isinstance(payload, dict)
        and payload.get("name") == "subgraph_stream"
        and isinstance(payload.get("data"), dict)
    ):
        event_data = payload["data"]
        subgraph_name = event_data.get("subgraph_name") or event_data.get("subagent_type") or subgraph_name
        kind = event_data.get("kind", kind)
        payload = event_data.get("payload", payload)

    assert kind == "custom"
    assert subgraph_name == "office_writer"
    assert payload == root_payload
    assert payload.get("name") == "artifact.start"
    assert payload.get("data") == {"id": "ppt123", "kind": "ppt", "title": "Sales Report"}

