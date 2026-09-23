"""Chuỗi `artifact.*` mà một lần sinh file thật phát ra.

Không mock kênh event, và không dùng `astream_events`: chạy đúng subgraph thật
qua `graph.astream(stream_mode=["messages","updates","custom"])` — nguyên văn lời
gọi trong `analyst_streamer.py` — rồi đếm event nhánh `custom`.

Vì sao khắt khe vậy: `astream_events` và `stream_mode="custom"` là HAI kênh khác
nhau. Bản đầu của test này bắt qua `astream_events` nên xanh, trong khi client
thật nhận 0 event. Test phải chạy đúng kênh mà production đọc.

Không gọi mạng: LLM planner bị thay bằng stub, file .pptx ghi vào tmp_path.
"""

import asyncio
import json
from types import SimpleNamespace

from dbgpt_analyst.events.artifact_events import ArtifactStream
from dbgpt_analyst.subgraphs.modes import office_writer_subgraph as ow

ROWS = [
    {"quy": "Q1", "kenh": "Online", "doanh_thu": 1_250_000_000, "so_don": 3120},
    {"quy": "Q1", "kenh": "Offline", "doanh_thu": 890_000_000, "so_don": 1450},
    {"quy": "Q2", "kenh": "Online", "doanh_thu": 1_480_000_000, "so_don": 3600},
    {"quy": "Q2", "kenh": "Offline", "doanh_thu": 910_000_000, "so_don": 1502},
    {"quy": "Q3", "kenh": "Online", "doanh_thu": 1_620_000_000, "so_don": 3980},
    {"quy": "Q4", "kenh": "Online", "doanh_thu": 2_140_000_000, "so_don": 5210},
]

PLAN = {
    "title": "Doanh thu 2024",
    "slides": [
        {
            "kind": "kpi",
            "title": "Chỉ số chính",
            "kpis": [{"label": "Tổng doanh thu", "metric": "sum:doanh_thu"}],
        },
        {
            "kind": "chart",
            "title": "Doanh thu theo quý",
            "chart": "column",
            "category_column": "quy",
            "value_column": "doanh_thu",
        },
    ],
}


class _StubLLM:
    async def ainvoke(self, messages):
        return SimpleNamespace(content=json.dumps(PLAN, ensure_ascii=False))


async def _fake_create_llm(**kwargs):
    return _StubLLM(), None


def _offline_ppt(tmp_path, monkeypatch):
    """Sinh pptx thật nhưng không chạm mạng và không ghi ra thư mục repo."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(
        "dbgpt_analyst.common.model_fallback.create_llm_with_fallback", _fake_create_llm
    )
    monkeypatch.setattr(
        "dbgpt_analyst.common.llm_factory.preferred_model_name", lambda *a, **k: "stub"
    )


def _collect(state):
    """Chạy node trong một graph thật, trả về [(tên event, payload)] theo thứ tự.

    Graph một node thay vì cả subgraph: khỏi phụ thuộc heuristic đoán loại tài liệu
    từ câu hỏi, nhưng vẫn đi qua đúng cơ chế Pregel mà production dùng.
    """
    from langgraph.graph import END, StateGraph

    from dbgpt_analyst.core.state import MainAgentState

    builder = StateGraph(MainAgentState)
    builder.add_node("generate", ow.node_generate_office_doc)
    builder.set_entry_point("generate")
    builder.add_edge("generate", END)
    graph = builder.compile()

    async def _run():
        seen = []
        # Nguyên văn lời gọi trong analyst_streamer.py.
        async for kind, payload in graph.astream(
            state, stream_mode=["messages", "updates", "custom"]
        ):
            if kind == "custom":
                seen.append((payload["name"], payload["data"]))
        return seen

    return asyncio.run(_run())


def _names(events):
    return [name for name, _ in events]


# --- đường hạnh phúc: pptx ------------------------------------------------


def test_one_pptx_run_streams_start_progress_ready(tmp_path, monkeypatch):
    _offline_ppt(tmp_path, monkeypatch)
    events = _collect(
        {
            "question": "Doanh thu 2024 theo quý",
            "display_type": "office_ppt",
            "query_results": ROWS,
        }
    )

    assert _names(events) == [
        "artifact.start",
        "artifact.progress",
        "artifact.progress",
        "artifact.ready",
    ]

    start = events[0][1]
    assert start["kind"] == "ppt"
    assert start["title"].startswith("Doanh thu 2024")

    assert [e[1]["stage"] for e in events[1:3]] == ["planning", "rendering"]
    assert [e[1]["pct"] for e in events[1:3]] == [20, 60]

    ready = events[-1][1]
    assert ready["url"].startswith("/uploads/generated_pptx/")
    assert ready["filename"].endswith(".pptx")
    assert ready["preview_html"]
    # `bytes` phải là kích thước file thật trên đĩa, không phải số ước lượng.
    on_disk = tmp_path / ready["url"].replace("/uploads/", "")
    assert on_disk.exists()
    assert ready["bytes"] == on_disk.stat().st_size > 0


def test_every_event_of_one_file_carries_the_same_id(tmp_path, monkeypatch):
    _offline_ppt(tmp_path, monkeypatch)
    events = _collect(
        {"question": "Doanh thu", "display_type": "office_ppt", "query_results": ROWS}
    )
    ids = {payload["id"] for _, payload in events}
    assert len(ids) == 1, "UI ghép các mốc vào một thẻ bằng `id`, khác id là vỡ thẻ"


# --- excel: nhánh không có LLM cũng phải kể chuyện -------------------------


def test_excel_export_also_streams_start_and_ready(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    events = _collect(
        {
            "question": "Xuất bảng doanh thu",
            "display_type": "office_excel",
            "query_results": ROWS,
        }
    )
    assert _names(events) == ["artifact.start", "artifact.ready"]
    assert events[0][1]["kind"] == "excel"
    assert events[-1][1]["url"].endswith(".xlsx")


# --- hỏng thì phải nói, không được im ------------------------------------


def test_a_failed_export_streams_artifact_error(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))

    async def _boom(*a, **k):
        raise RuntimeError("planner chết giữa chừng")

    monkeypatch.setattr(ow, "_export_pptx_file", _boom)
    events = _collect(
        {"question": "Doanh thu", "display_type": "office_ppt", "query_results": ROWS}
    )

    assert _names(events) == ["artifact.start", "artifact.error"]
    assert "Không tạo được file" in events[-1][1]["message"]


def test_a_quota_error_says_quota_not_a_generic_failure(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))

    async def _boom(*a, **k):
        raise RuntimeError("429 quota exceeded")

    monkeypatch.setattr(ow, "_export_pptx_file", _boom)
    events = _collect(
        {"question": "Doanh thu", "display_type": "office_ppt", "query_results": ROWS}
    )
    assert _names(events) == ["artifact.start", "artifact.error"]
    assert "429" in events[-1][1]["message"]


def test_no_data_excel_streams_error_instead_of_a_silent_empty_file(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    events = _collect(
        {"question": "Xuất bảng", "display_type": "office_excel", "query_results": []}
    )
    # `_fetch_query_results` không tìm được gì → không có file → phải báo lỗi.
    assert _names(events)[0] == "artifact.start"
    assert _names(events)[-1] == "artifact.error"


# --- phát event không bao giờ được làm hỏng việc sinh file -----------------


def test_emitting_outside_a_graph_run_is_swallowed():
    """Gọi trực tiếp (unit test, script) thì không có callback manager trong
    context. Nuốt lỗi, vì mất một event nhẹ hơn mất cả file."""
    stream = ArtifactStream("ppt", "tiêu đề")
    asyncio.run(stream.start())
    asyncio.run(stream.progress("planning", 20))
    asyncio.run(stream.ready(url="/uploads/x/y.pptx", size=1))
    asyncio.run(stream.error("hỏng"))


def test_progress_pct_is_clamped_to_a_sane_range():
    stream = ArtifactStream("ppt", "t")
    captured = []

    async def _fake_emit(phase, payload):
        captured.append(payload["pct"])

    stream._emit = _fake_emit
    asyncio.run(stream.progress("s", -10))
    asyncio.run(stream.progress("s", 500))
    assert captured == [0, 100]
