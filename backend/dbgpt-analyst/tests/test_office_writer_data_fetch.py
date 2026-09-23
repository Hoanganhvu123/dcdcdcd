"""office_writer must fetch its own data.

The supervisor prompt promises `office_writer` "fetches the data it needs
itself", but the delegation adapter resets `query_results` to `[]` (it is not in
`_FORWARD_FIELDS`). Without a fetch the deck prompt gets an empty data context
and — correctly obeying "TUYỆT ĐỐI không bịa số" — emits `[năm]` / `[X]%`
placeholders. These tests pin the fetch so that regression can't come back.

`asyncio.run` rather than pytest-asyncio: no new dependency.
"""

import asyncio

from dbgpt_analyst.subgraphs.modes import office_writer_subgraph as ow

ROWS = [{"year": 2024, "revenue": 1_234_567}]


def _run(state, monkeypatch, *, fetched=ROWS):
    """Drive node_generate_office_doc with the exporters stubbed out.

    Returns the rows the pptx exporter actually received.
    """
    seen: dict = {}

    async def fake_fetch(_state):
        seen["fetched"] = True
        return fetched

    async def fake_export(question, query_results, **kwargs):
        # **kwargs nuốt `artifact=` (kênh stream artifact.*) — test này chỉ soi dữ liệu.
        seen["rows"] = query_results
        return "/uploads/generated_pptx/stub.pptx", "<html></html>", [{"layout": "cover"}]

    monkeypatch.setattr(ow, "_fetch_query_results", fake_fetch)
    monkeypatch.setattr(ow, "_export_pptx_file", fake_export)

    asyncio.run(ow.node_generate_office_doc(state))
    return seen


def test_fetches_when_state_has_no_rows(monkeypatch):
    seen = _run({"question": "doanh thu 2024", "display_type": "office_ppt"}, monkeypatch)
    assert seen["fetched"] is True
    # The whole point: the exporter must see real rows, not the empty list the
    # delegation adapter handed us.
    assert seen["rows"] == ROWS


def test_reuses_rows_already_in_state(monkeypatch):
    existing = [{"year": 2023, "revenue": 42}]
    seen = _run(
        {"question": "doanh thu", "display_type": "office_ppt", "query_results": existing},
        monkeypatch,
    )
    assert "fetched" not in seen, "must not re-query when the state already has data"
    assert seen["rows"] == existing


def test_empty_fetch_is_not_fatal(monkeypatch):
    seen = _run(
        {"question": "doanh thu", "display_type": "office_ppt"}, monkeypatch, fetched=[]
    )
    assert seen["rows"] == []  # falls through to the old no-data behaviour


def test_excel_no_longer_fabricates_data():
    assert not hasattr(ow, "_generate_mock_excel_data"), (
        "mock generator was removed; real fetching replaces fabrication"
    )
