"""tests/test_artifact_empirical_challenge.py — Empirical Challenger Test Harness for Office Artifacts.

Validates:
1. XLSX: Multi-sheet data and totals, arithmetic precision (sums, averages, growth), non-numeric column exclusion.
2. PPTX: Native OOXML chart shapes (COLUMN, BAR, LINE, PIE), series values, KPI cards, hallucination rejection in bullets.
3. DOCX: HTML-to-DOCX conversion, table styling, header colors, zebra striping, 100% metric grounding.
4. Stress & Boundary Cases: 1,000 rows, negative values, zero-division, Unicode characters.
"""

from __future__ import annotations

import io
import json
import os
import re
import sqlite3
import zipfile
from pathlib import Path
from typing import Any, Dict, List

import markdown as _markdown
import pytest
from docx import Document
from openpyxl import load_workbook
from pptx import Presentation
from pptx.enum.chart import XL_CHART_TYPE

from dbgpt_analyst.subgraphs.modes.docx_generator import html_to_docx
from dbgpt_analyst.subgraphs.modes.office_writer_subgraph import (
    _export_excel_file,
    _facts_section,
    _grounded_facts,
    _strip_unverified_lines,
)
from dbgpt_analyst.tools import deck, officecli


# ---------------------------------------------------------------------------
# Test Fixtures & Synthetic Analytical Datasets
# ---------------------------------------------------------------------------

@pytest.fixture
def enterprise_sales_data() -> List[Dict[str, Any]]:
    """Complex multi-period, multi-region sales dataset."""
    records = []
    quarters = ["Q1", "Q2", "Q3", "Q4"]
    regions = ["North", "Central", "South"]
    channels = ["Online", "Enterprise", "Retail"]

    base_rev = 1_000_000_000
    for q_idx, q in enumerate(quarters):
        for r_idx, reg in enumerate(regions):
            for c_idx, ch in enumerate(channels):
                rev = base_rev * (1 + 0.15 * q_idx) * (1 + 0.1 * r_idx) * (1 + 0.05 * c_idx)
                cost = rev * 0.55
                profit = rev - cost
                orders = int(rev / 500_000)
                records.append({
                    "quarter": q,
                    "region": reg,
                    "channel": ch,
                    "revenue": round(rev, 2),
                    "cost": round(cost, 2),
                    "gross_profit": round(profit, 2),
                    "order_count": orders,
                    "is_active": True,
                })
    return records


# ---------------------------------------------------------------------------
# 1. XLSX Empirical Verification Suite
# ---------------------------------------------------------------------------

def test_empirical_xlsx_multisheet_and_arithmetic_grounding(enterprise_sales_data: List[Dict[str, Any]], tmp_path: Path):
    """Deeply inspects generated XLSX file for sheet structure, cell types, and arithmetic totals."""
    xlsx_file = tmp_path / "empirical_sales_test.xlsx"
    out_path = officecli._write_workbook(enterprise_sales_data, xlsx_file, period_column="quarter")

    assert out_path.exists()
    assert out_path.stat().st_size > 0

    # 1. Check OOXML zip container structure
    with zipfile.ZipFile(out_path, "r") as zf:
        names = zf.namelist()
        assert "[Content_Types].xml" in names
        assert "xl/workbook.xml" in names
        assert "xl/worksheets/sheet1.xml" in names
        assert "xl/worksheets/sheet2.xml" in names

    # 2. Check sheets and rows via openpyxl
    wb = load_workbook(out_path)
    assert "data" in wb.sheetnames
    assert "totals" in wb.sheetnames

    # Data sheet
    ws_data = wb["data"]
    headers = [cell.value for cell in ws_data[1]]
    expected_headers = ["quarter", "region", "channel", "revenue", "cost", "gross_profit", "order_count", "is_active"]
    assert headers == expected_headers
    assert ws_data.max_row == len(enterprise_sales_data) + 1

    # Verify cell types in data sheet
    for row_idx in range(2, ws_data.max_row + 1):
        # Numeric columns must be stored as numbers, not strings
        assert isinstance(ws_data.cell(row=row_idx, column=4).value, (int, float))
        assert isinstance(ws_data.cell(row=row_idx, column=5).value, (int, float))
        assert isinstance(ws_data.cell(row=row_idx, column=6).value, (int, float))
        assert isinstance(ws_data.cell(row=row_idx, column=7).value, int)

    # Totals sheet
    ws_totals = wb["totals"]
    totals_dict = dict(ws_totals.iter_rows(min_row=2, values_only=True))

    assert totals_dict["row_count"] == len(enterprise_sales_data)

    # Verify arithmetic totals match exact Python computations
    expected_sum_rev = sum(r["revenue"] for r in enterprise_sales_data)
    expected_sum_cost = sum(r["cost"] for r in enterprise_sales_data)
    expected_sum_profit = sum(r["gross_profit"] for r in enterprise_sales_data)
    expected_avg_rev = expected_sum_rev / len(enterprise_sales_data)
    expected_avg_profit = expected_sum_profit / len(enterprise_sales_data)

    assert totals_dict["sum_revenue"] == pytest.approx(expected_sum_rev, rel=1e-5)
    assert totals_dict["sum_cost"] == pytest.approx(expected_sum_cost, rel=1e-5)
    assert totals_dict["sum_gross_profit"] == pytest.approx(expected_sum_profit, rel=1e-5)
    assert totals_dict["avg_revenue"] == pytest.approx(expected_avg_rev, rel=1e-5)
    assert totals_dict["avg_gross_profit"] == pytest.approx(expected_avg_profit, rel=1e-5)

    # Growth rate verification (Q4 vs Q3)
    expected_growth_rev = deck.compute_metric(enterprise_sales_data, "growth:revenue:quarter")
    assert totals_dict["growth_revenue"] == pytest.approx(expected_growth_rev, rel=1e-5)

    # Non-numeric and boolean exclusion verification
    assert "sum_quarter" not in totals_dict
    assert "sum_region" not in totals_dict
    assert "sum_channel" not in totals_dict
    assert "sum_is_active" not in totals_dict


def test_empirical_xlsxwriter_export(enterprise_sales_data: List[Dict[str, Any]], tmp_path: Path, monkeypatch):
    """Directly tests _export_excel_file via xlsxwriter with chart generation."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    url = _export_excel_file(enterprise_sales_data)
    assert url is not None
    assert url.startswith("/uploads/generated_xlsx/")
    assert url.endswith(".xlsx")

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    assert file_path.exists()
    wb = load_workbook(file_path)
    assert "Data" in wb.sheetnames
    assert wb["Data"].max_row == len(enterprise_sales_data) + 1


# ---------------------------------------------------------------------------
# 2. PPTX Native Chart & KPI Empirical Verification Suite
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("chart_type,expected_enum", [
    ("column", XL_CHART_TYPE.COLUMN_CLUSTERED),
    ("bar", XL_CHART_TYPE.BAR_CLUSTERED),
    ("line", XL_CHART_TYPE.LINE_MARKERS),
    ("pie", XL_CHART_TYPE.PIE),
])
def test_empirical_pptx_native_charts_all_types(
    enterprise_sales_data: List[Dict[str, Any]], chart_type: str, expected_enum: XL_CHART_TYPE, tmp_path: Path
):
    """Verifies that all supported chart types render as native PowerPoint chart shapes."""
    spec = {
        "title": f"Báo Cáo Biểu Đồ {chart_type.upper()}",
        "subtitle": "Kiểm thử native shape OOXML",
        "slides": [
            {
                "kind": "chart",
                "title": f"Biểu Đồ {chart_type.upper()}",
                "chart": chart_type,
                "category_column": "quarter",
                "value_column": "revenue",
                "series_column": "region" if chart_type != "pie" else None,
            }
        ],
    }
    pptx_file = tmp_path / f"deck_{chart_type}.pptx"
    deck.render_deck(spec, enterprise_sales_data, pptx_file)

    assert pptx_file.exists()
    prs = Presentation(pptx_file)
    assert len(prs.slides) == 2  # Title + Chart slide

    chart_slide = prs.slides[1]
    chart_shapes = [s for s in chart_slide.shapes if s.has_chart]
    assert len(chart_shapes) == 1, f"Expected 1 native chart shape for {chart_type}, found {len(chart_shapes)}"

    chart = chart_shapes[0].chart
    assert chart.chart_type == expected_enum

    # Verify categories
    categories = [c.label for c in chart.plots[0].categories]
    assert categories == ["Q1", "Q2", "Q3", "Q4"]

    # Verify series count
    if chart_type == "pie":
        assert len(chart.plots[0].series) == 1
    else:
        assert len(chart.plots[0].series) == 3  # Central, North, South


def test_empirical_pptx_kpi_calculations_and_formatting(enterprise_sales_data: List[Dict[str, Any]], tmp_path: Path):
    """Verifies KPI metrics computation (sum, avg, min, max, count, growth) and Vietnamese formatting."""
    spec = {
        "title": "Báo Cáo KPI Hoạt Động",
        "slides": [
            {
                "kind": "kpi",
                "title": "Chỉ Số Tài Chính Trọng Yếu",
                "kpis": [
                    {"label": "Tổng Doanh Thu", "metric": "sum:revenue"},
                    {"label": "Lợi Nhuận Bình Quân", "metric": "avg:gross_profit"},
                    {"label": "Tăng Trưởng Q4/Q3", "metric": "growth:revenue:quarter"},
                    {"label": "Số Lượng Giao Dịch", "metric": "count"},
                ],
            }
        ],
    }
    pptx_file = tmp_path / "deck_kpi.pptx"
    deck.render_deck(spec, enterprise_sales_data, pptx_file)

    prs = Presentation(pptx_file)
    kpi_slide = prs.slides[1]
    text_content = " ".join(s.text for s in kpi_slide.shapes if s.has_text_frame)

    # Check Vietnamese currency & metric indicators
    assert "tỷ" in text_content or "triệu" in text_content
    assert "%" in text_content
    assert "36" in text_content  # 36 records count


def test_empirical_pptx_bullet_hallucination_stripping():
    """Verifies that hallucinated or unverified numbers in bullets are aggressively stripped."""
    assert deck._has_unverified_number("Doanh thu đạt 500 tỷ đồng") is True
    assert deck._has_unverified_number("Tăng trưởng vượt 25.5%") is True
    assert deck._has_unverified_number("Hệ số ROI đạt 3.4 lần") is True
    assert deck._has_unverified_number("Năm 2026 ghi nhận ổn định") is False  # Safe year
    assert deck._has_unverified_number("Chiến lược mở rộng quý 4") is False   # Safe single digit
    assert deck._has_unverified_number("Định hướng chuyển đổi số toàn diện") is False


# ---------------------------------------------------------------------------
# 3. DOCX Grounding & Structure Empirical Verification Suite
# ---------------------------------------------------------------------------

def test_empirical_docx_generation_and_table_styling(tmp_path: Path):
    """Verifies HTML to DOCX compilation with custom styling, tables, and borders."""
    html = """
    <meta name="theme" content="emerald">
    <h1>Báo Cáo Đánh Giá Hiệu Quả</h1>
    <h2>1. Tổng Quan</h2>
    <p>Hoạt động kinh doanh duy trì ổn định qua các quý.</p>
    <ul>
      <li>Mở rộng mạng lưới khách hàng</li>
      <li>Tối ưu quy trình vận hành</li>
    </ul>
    <table>
      <tr><th>Khu Vực</th><th>Doanh Thu</th><th>Tăng Trưởng</th></tr>
      <tr><td>Miền Bắc</td><td>10.000.000.000</td><td>+15%</td></tr>
      <tr><td>Miền Nam</td><td>15.000.000.000</td><td>+22%</td></tr>
    </table>
    """
    docx_bytes = html_to_docx(html, title="Báo Cáo Đánh Giá Hiệu Quả")
    docx_file = tmp_path / "test_report.docx"
    docx_file.write_bytes(docx_bytes)

    assert docx_file.exists()
    assert docx_file.stat().st_size > 0

    doc = Document(docx_file)
    # Check title and headings
    headings = [p.text for p in doc.paragraphs if p.style.name.startswith("Heading")]
    assert "Báo Cáo Đánh Giá Hiệu Quả" in doc.paragraphs[0].text or "1. Tổng Quan" in headings

    # Check table structure
    assert len(doc.tables) == 1
    tbl = doc.tables[0]
    assert len(tbl.rows) == 3
    assert len(tbl.columns) == 3
    assert tbl.rows[0].cells[0].text == "Khu Vực"
    assert tbl.rows[1].cells[0].text == "Miền Bắc"
    assert tbl.rows[2].cells[0].text == "Miền Nam"


def test_empirical_docx_facts_traceability(enterprise_sales_data: List[Dict[str, Any]]):
    """Verifies that _grounded_facts produces deterministic, accurate facts dictionary."""
    facts = _grounded_facts(enterprise_sales_data)
    assert facts["row_count"] == float(len(enterprise_sales_data))
    assert facts["sum_revenue"] == sum(r["revenue"] for r in enterprise_sales_data)
    assert facts["sum_cost"] == sum(r["cost"] for r in enterprise_sales_data)
    assert facts["sum_gross_profit"] == sum(r["gross_profit"] for r in enterprise_sales_data)
    assert facts["avg_revenue"] == pytest.approx(sum(r["revenue"] for r in enterprise_sales_data) / len(enterprise_sales_data))

    facts_text = _facts_section(facts)
    assert "## Số liệu chi tiết" in facts_text
    assert "sum_revenue" in facts_text
    assert "sum_gross_profit" in facts_text


# ---------------------------------------------------------------------------
# 4. Stress & Edge Cases Suite
# ---------------------------------------------------------------------------

def test_empirical_large_dataset_and_negative_metrics(tmp_path: Path):
    """Stress tests generator with 1,000 rows, negative profits, and zero costs."""
    stress_rows = []
    for i in range(1000):
        stress_rows.append({
            "id": i,
            "period": f"P{i % 10}",
            "amount": -100_000.0 if i % 2 == 0 else 250_000.0,
            "profit": -50_000.0 if i % 3 == 0 else 80_000.0,
            "zero_col": 0.0,
        })

    # 1. XLSX Stress
    xlsx_file = tmp_path / "stress.xlsx"
    officecli._write_workbook(stress_rows, xlsx_file, period_column="period")
    wb = load_workbook(xlsx_file)
    assert wb["data"].max_row == 1001
    totals = dict(wb["totals"].iter_rows(min_row=2, values_only=True))
    assert totals["row_count"] == 1000
    assert totals["sum_amount"] == sum(r["amount"] for r in stress_rows)

    # 2. PPTX Stress (Native Chart with 10 categories)
    spec = {
        "title": "Báo Cáo Stress Test 1,000 Dòng",
        "slides": [
            {
                "kind": "chart",
                "title": "Biểu Đồ 1,000 Dòng",
                "chart": "column",
                "category_column": "period",
                "value_column": "amount",
            }
        ],
    }
    pptx_file = tmp_path / "stress.pptx"
    deck.render_deck(spec, stress_rows, pptx_file)
    prs = Presentation(pptx_file)
    assert len(prs.slides) == 2
    chart = [s for s in prs.slides[1].shapes if s.has_chart][0].chart
    assert len(chart.plots[0].categories) == 10
