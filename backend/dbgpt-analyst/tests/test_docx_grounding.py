"""D1: office_writer's docx must never let the LLM author a number.

Numbers reach the doc only via `_grounded_facts` -> `_facts_section`, computed
with `deck.compute_metric` — the exact same primitive officecli's totals sheet
and deck.py's KPI slides already use. `_strip_unverified_lines` drops any
prose line the LLM wrote with a figure in it (deck.py's own bullet-drop rule).

`_export_word_file` itself needs a real LLM call, so it is not exercised here
(same opt-in convention as test_officecli.py's test_live_report). Everything
tested below is pure and deterministic.
"""

import io
import re

import pytest
from docx import Document

from dbgpt_analyst.subgraphs.modes.office_writer_subgraph import (
    _export_word_file,
    _facts_section,
    _grounded_facts,
    _strip_unverified_lines,
)
from dbgpt_analyst.subgraphs.modes.docx_generator import html_to_docx
from dbgpt_analyst.tools.deck import compute_metric, format_number

ROWS = [
    {"quy": "Q1", "kenh": "Online", "doanh_thu": 1_250_000_000, "so_don": 3120},
    {"quy": "Q1", "kenh": "Offline", "doanh_thu": 890_000_000, "so_don": 1450},
    {"quy": "Q4", "kenh": "Online", "doanh_thu": 2_140_000_000, "so_don": 5210},
]

_NUMBER_TOKEN = re.compile(r"\d[\d.,]*\s*%?")


def test_grounded_facts_match_compute_metric_directly():
    facts = _grounded_facts(ROWS)
    assert facts["row_count"] == 3
    assert facts["sum_doanh_thu"] == pytest.approx(compute_metric(ROWS, "sum:doanh_thu"))
    assert facts["avg_so_don"] == pytest.approx(compute_metric(ROWS, "avg:so_don"))


def test_grounded_facts_skip_text_columns():
    facts = _grounded_facts(ROWS)
    assert "sum_kenh" not in facts and "sum_quy" not in facts


def test_grounded_facts_empty_without_rows():
    assert _grounded_facts([]) == {}


def test_strip_unverified_lines_drops_fabricated_numbers():
    text = "Doanh thu tăng mạnh, đạt 12345678 đồng trong quý này."
    assert _strip_unverified_lines(text) == ""


def test_strip_unverified_lines_keeps_qualitative_prose():
    text = "# Báo cáo doanh thu Q4 2025\nDoanh thu tăng trưởng tích cực so với kỳ trước."
    kept = _strip_unverified_lines(text)
    assert "Báo cáo doanh thu Q4 2025" in kept
    assert "tăng trưởng tích cực" in kept


def test_facts_section_renders_every_fact_via_format_number():
    facts = _grounded_facts(ROWS)
    section = _facts_section(facts)
    for key, value in facts.items():
        assert f"- {key}: {format_number(value)}" in section


def test_facts_section_empty_without_facts():
    assert _facts_section({}) == ""


def test_docx_round_trip_every_number_traces_to_compute_metric():
    # D1 DoD: mo .docx, moi so khop compute_metric tren rows.
    facts = _grounded_facts(ROWS)
    fabricated_line = "Doanh thu quý này đạt 999999999 đồng, một con số bịa."
    markdown_text = (
        "# Báo cáo doanh thu\n"
        f"{fabricated_line}\n"
        "Xu hướng tăng trưởng tích cực so với kỳ trước.\n"
    )
    markdown_text = _strip_unverified_lines(markdown_text) + _facts_section(facts)

    import markdown as _markdown

    html_content = _markdown.markdown(markdown_text, extensions=["tables"])
    docx_bytes = html_to_docx(html_content, title="Báo cáo doanh thu")

    doc = Document(io.BytesIO(docx_bytes))
    full_text = "\n".join(p.text for p in doc.paragraphs)

    assert "999999999" not in full_text

    expected = {format_number(v) for v in facts.values()}
    for token in _NUMBER_TOKEN.findall(full_text):
        digits = re.sub(r"[.,%\s]", "", token)
        if len(digits) <= 1:
            continue
        if len(digits) == 4 and 1900 <= int(digits) <= 2099:
            continue
        assert any(token.strip() in e or e in token.strip() for e in expected), (
            f"unverified number {token!r} in docx, not in grounded facts {expected}"
        )


def test_export_word_file_is_importable_and_async():
    import inspect

    assert inspect.iscoroutinefunction(_export_word_file)
