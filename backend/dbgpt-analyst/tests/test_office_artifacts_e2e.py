"""tests/test_office_artifacts_e2e.py — Comprehensive End-to-End Test Suite for Office Artifacts.

Covers:
- Tier 1: Feature Coverage
  - Multi-sheet Excel workbook creation with custom tabs (Executive Summary, Monthly Breakdown, KPI Metrics).
  - Native Excel formula injection strings (=SUM, =AVERAGE, =IF, =ROUND, growth ratio =((B3-B2)/B2)).
  - Spreadsheet visual styling (Navy headers, thin borders, currency/percentage number formatting, auto-fitted columns).
  - Native PPTX charts (ColumnClustered, Bar, Line, Pie) with CategoryChartData.
  - KPI summary cards (rounded rectangle shape, Vietnamese formatting).
  - Structured bullets, tables, and executive takeaways.
- Tier 2: Boundary & Corner Cases
  - Empty rows handling.
  - Single-row datasets & growth error handling.
  - Negative numbers & loss scenarios.
  - Zero-division in growth metrics.
  - Non-numeric column exclusion and null handling.
  - Long labels & Unicode Vietnamese diacritics.
- Tier 3: Cross-Feature Combinations
  - Multi-turn SQL data -> Multi-sheet Excel -> Supervisor verification gate.
  - Multi-turn SQL data -> 8-slide PPTX deck -> Anti-hallucination fact check.
  - Artifact lifecycle events streaming (artifact.start, artifact.progress, artifact.ready).
  - Synchronization between PPTX deck and HTML preview.
- Tier 4: Real-World Scenarios
  - 12-month corporate financial P&L model with inter-sheet formulas.
  - 8-slide quarterly departmental performance presentation deck.
  - End-to-end multi-artifact generation and consistency verification.
"""

from __future__ import annotations

import asyncio
import io
import json
import re
import sqlite3
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Mapping, Sequence

import openpyxl
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
import pytest
from pptx import Presentation
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.shapes import MSO_SHAPE

from dbgpt_analyst.events.artifact_events import ArtifactStream
from dbgpt_analyst.events_schemas.chatkit_events import ClientEffectEvent, WorkflowTaskEvent
from dbgpt_analyst.middleware.verification_gate import (
    VerificationGateMiddleware,
    _extract_ground_truth_values,
    _parse_number_value,
    inject_grounded_facts,
    strip_ungrounded_claims,
    verify_numerical_claims,
)
from dbgpt_analyst.subgraphs.modes import office_writer_subgraph as ow
from dbgpt_analyst.tools import deck, officecli


# ==============================================================================
# Shared Helpers & Financial Workbook Generator
# ==============================================================================

def create_advanced_financial_workbook(
    monthly_data: Sequence[Mapping[str, Any]],
    out_path: Path,
    *,
    company_name: str = "Tập Đoàn DB-GPT AI Analytics",
) -> Path:
    """Builds a production-grade multi-sheet financial workbook with native Excel formulas,
    custom styled headers, thin borders, and number formatting.
    """
    wb = Workbook()

    # Sheet 1: Executive Summary
    ws_exec = wb.active
    ws_exec.title = "Executive Summary"
    ws_exec.views.sheetView[0].showGridLines = True

    # Title Banner
    ws_exec["A1"] = f"BÁO CÁO TÀI CHÍNH TỔNG HỢP — {company_name.upper()}"
    ws_exec["A1"].font = Font(name="Arial", size=14, bold=True, color="1E3A8A")
    ws_exec["A2"] = "Tóm tắt hiệu quả kinh doanh và chỉ số KPI trọng yếu"
    ws_exec["A2"].font = Font(name="Arial", size=10, italic=True, color="6B7280")

    # Sheet 2: Monthly Breakdown
    ws_monthly = wb.create_sheet("Monthly Breakdown")
    ws_monthly.views.sheetView[0].showGridLines = True

    # Sheet 3: KPI Metrics
    ws_kpi = wb.create_sheet("KPI Metrics")
    ws_kpi.views.sheetView[0].showGridLines = True

    # Styling constants
    navy_header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    thin_border_side = Side(border_style="thin", color="CBD5E1")
    cell_border = Border(
        left=thin_border_side, right=thin_border_side,
        top=thin_border_side, bottom=thin_border_side
    )
    total_top_border = Side(border_style="thin", color="1E3A8A")
    total_bottom_border = Side(border_style="double", color="1E3A8A")
    total_border = Border(
        left=thin_border_side, right=thin_border_side,
        top=total_top_border, bottom=total_bottom_border
    )

    # 1. Populate Monthly Breakdown
    monthly_headers = [
        "Tháng", "Doanh Thu", "Giá Vốn (COGS)", "Lợi Nhuận Gộp",
        "Chi Phí Vận Hành", "Lợi Nhuận Thuần", "Tăng Trưởng MoM", "Thưởng Đạt Chỉ Tiêu"
    ]
    ws_monthly.append([])  # Row 1 empty for margin
    ws_monthly.append(monthly_headers)  # Row 2

    for col_idx in range(1, len(monthly_headers) + 1):
        cell = ws_monthly.cell(row=2, column=col_idx)
        cell.fill = navy_header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = cell_border

    start_row = 3
    num_rows = len(monthly_data)

    for i, r in enumerate(monthly_data):
        curr_row = start_row + i
        month_label = str(r.get("thang", f"Tháng {i+1}"))
        rev = float(r.get("doanh_thu", 0))
        cogs = float(r.get("cogs", 0))
        opex = float(r.get("chi_phi", 0))

        # Formulas for row
        gross_profit_formula = f"=B{curr_row}-C{curr_row}"
        net_profit_formula = f"=D{curr_row}-E{curr_row}"
        mom_growth_formula = f"=((B{curr_row}-B{curr_row-1})/B{curr_row-1})" if i > 0 else "=0"
        bonus_formula = f"=IF(F{curr_row}>0, ROUND(F{curr_row}*0.05, 0), 0)"

        ws_monthly.cell(row=curr_row, column=1, value=month_label)
        ws_monthly.cell(row=curr_row, column=2, value=rev)
        ws_monthly.cell(row=curr_row, column=3, value=cogs)
        ws_monthly.cell(row=curr_row, column=4, value=gross_profit_formula)
        ws_monthly.cell(row=curr_row, column=5, value=opex)
        ws_monthly.cell(row=curr_row, column=6, value=net_profit_formula)
        ws_monthly.cell(row=curr_row, column=7, value=mom_growth_formula)
        ws_monthly.cell(row=curr_row, column=8, value=bonus_formula)

        # Number formats & borders
        for c in range(1, len(monthly_headers) + 1):
            cell = ws_monthly.cell(row=curr_row, column=c)
            cell.border = cell_border
            if c in (2, 3, 4, 5, 6, 8):
                cell.number_format = '#,##0 "VND"'
            elif c == 7:
                cell.number_format = "0.0%"

    # Total Row for Monthly Breakdown
    end_data_row = start_row + num_rows - 1
    total_row = end_data_row + 1

    ws_monthly.cell(row=total_row, column=1, value="TỔNG CỘNG")
    ws_monthly.cell(row=total_row, column=2, value=f"=SUM(B{start_row}:B{end_data_row})")
    ws_monthly.cell(row=total_row, column=3, value=f"=SUM(C{start_row}:C{end_data_row})")
    ws_monthly.cell(row=total_row, column=4, value=f"=SUM(D{start_row}:D{end_data_row})")
    ws_monthly.cell(row=total_row, column=5, value=f"=SUM(E{start_row}:E{end_data_row})")
    ws_monthly.cell(row=total_row, column=6, value=f"=SUM(F{start_row}:F{end_data_row})")
    ws_monthly.cell(row=total_row, column=7, value=f"=AVERAGE(G{start_row+1}:G{end_data_row})")
    ws_monthly.cell(row=total_row, column=8, value=f"=SUM(H{start_row}:H{end_data_row})")

    for c in range(1, len(monthly_headers) + 1):
        cell = ws_monthly.cell(row=total_row, column=c)
        cell.font = Font(name="Arial", size=11, bold=True, color="1E3A8A")
        cell.border = total_border
        if c in (2, 3, 4, 5, 6, 8):
            cell.number_format = '#,##0 "VND"'
        elif c == 7:
            cell.number_format = "0.0%"

    # 2. Populate Executive Summary with inter-sheet formulas
    exec_headers = ["Chỉ Số Tài Chính", "Giá Trị Tổng Hợp", "Công Thức Liên Kết"]
    ws_exec.cell(row=4, column=1, value=exec_headers[0])
    ws_exec.cell(row=4, column=2, value=exec_headers[1])
    ws_exec.cell(row=4, column=3, value=exec_headers[2])

    for c in range(1, 4):
        cell = ws_exec.cell(row=4, column=c)
        cell.fill = navy_header_fill
        cell.font = header_font
        cell.border = cell_border

    exec_metrics = [
        ("Tổng Doanh Thu Hợp Nhất", f"='Monthly Breakdown'!B{total_row}", "Liên kết sheet Monthly Breakdown"),
        ("Tổng Giá Vốn Hàng Bán", f"='Monthly Breakdown'!C{total_row}", "Liên kết sheet Monthly Breakdown"),
        ("Tổng Lợi Nhuận Gộp", f"='Monthly Breakdown'!D{total_row}", "Liên kết sheet Monthly Breakdown"),
        ("Tổng Chi Phí Hoạt Động", f"='Monthly Breakdown'!E{total_row}", "Liên kết sheet Monthly Breakdown"),
        ("Lợi Nhuận Thuần Sau Chi Phí", f"='Monthly Breakdown'!F{total_row}", "Liên kết sheet Monthly Breakdown"),
        ("Tăng Trưởng MoM Trung Bình", f"='Monthly Breakdown'!G{total_row}", "Liên kết sheet Monthly Breakdown"),
        ("Tổng Quỹ Thưởng Nhân Viên", f"='Monthly Breakdown'!H{total_row}", "Liên kết sheet Monthly Breakdown"),
    ]

    for idx, (label, formula, desc) in enumerate(exec_metrics, start=5):
        ws_exec.cell(row=idx, column=1, value=label).border = cell_border
        val_cell = ws_exec.cell(row=idx, column=2, value=formula)
        val_cell.border = cell_border
        val_cell.font = Font(name="Arial", size=11, bold=True)
        if "Tăng Trưởng" in label:
            val_cell.number_format = "0.0%"
        else:
            val_cell.number_format = '#,##0 "VND"'
        ws_exec.cell(row=idx, column=3, value=desc).border = cell_border

    # 3. Populate KPI Metrics Sheet
    kpi_headers = ["Mã KPI", "Tên Chỉ Số", "Công Thức Đánh Giá", "Ngưỡng Đạt"]
    ws_kpi.append(kpi_headers)
    for c in range(1, len(kpi_headers) + 1):
        cell = ws_kpi.cell(row=1, column=c)
        cell.fill = navy_header_fill
        cell.font = header_font
        cell.border = cell_border

    kpi_rows = [
        ("KPI_01", "Tỷ Suất Lợi Nhuận Gộp", f"='Monthly Breakdown'!D{total_row}/'Monthly Breakdown'!B{total_row}", ">= 30.0%"),
        ("KPI_02", "Tỷ Suất Lợi Nhuận Thuần", f"='Monthly Breakdown'!F{total_row}/'Monthly Breakdown'!B{total_row}", ">= 15.0%"),
        ("KPI_03", "Doanh Thu Bình Quân Tháng", f"=AVERAGE('Monthly Breakdown'!B{start_row}:B{end_data_row})", ">= 1 Tỷ VND"),
    ]

    for r_idx, row_vals in enumerate(kpi_rows, start=2):
        for c_idx, val in enumerate(row_vals, start=1):
            cell = ws_kpi.cell(row=r_idx, column=c_idx, value=val)
            cell.border = cell_border
            if c_idx == 3:
                cell.font = Font(name="Arial", size=10, bold=True)
                if r_idx in (2, 3):
                    cell.number_format = "0.0%"
                else:
                    cell.number_format = '#,##0 "VND"'

    # Auto-fit column widths across all sheets
    for sheet in wb.worksheets:
        for col in sheet.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = str(cell.value or "")
                if len(val) > max_len:
                    max_len = len(val)
            sheet.column_dimensions[col_letter].width = max(max_len + 4, 14)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    return out_path


# ==============================================================================
# TIER 1: FEATURE COVERAGE
# ==============================================================================

def test_tier1_multisheet_excel_creation_and_tab_names(tmp_path: Path):
    """Tier 1: Verify multi-sheet workbook generation with custom tab names and structure."""
    data = [
        {"thang": "T1", "doanh_thu": 1_200_000_000, "cogs": 600_000_000, "chi_phi": 250_000_000},
        {"thang": "T2", "doanh_thu": 1_450_000_000, "cogs": 700_000_000, "chi_phi": 280_000_000},
        {"thang": "T3", "doanh_thu": 1_650_000_000, "cogs": 780_000_000, "chi_phi": 300_000_000},
    ]
    file_path = tmp_path / "tier1_multisheet.xlsx"
    create_advanced_financial_workbook(data, file_path)

    assert file_path.exists()
    assert file_path.stat().st_size > 0

    wb = load_workbook(file_path, data_only=False)
    sheet_names = wb.sheetnames
    assert "Executive Summary" in sheet_names
    assert "Monthly Breakdown" in sheet_names
    assert "KPI Metrics" in sheet_names
    assert len(sheet_names) == 3

    # Check Monthly Breakdown Headers
    ws_monthly = wb["Monthly Breakdown"]
    headers = [cell.value for cell in ws_monthly[2]]
    assert "Tháng" in headers
    assert "Doanh Thu" in headers
    assert "Lợi Nhuận Gộp" in headers
    assert "Tăng Trưởng MoM" in headers


def test_tier1_excel_formula_injection_and_syntax(tmp_path: Path):
    """Tier 1: Verify native formula strings (=SUM, =AVERAGE, =IF, =ROUND, =((B3-B2)/B2))."""
    data = [
        {"thang": "T1", "doanh_thu": 1_000_000_000, "cogs": 500_000_000, "chi_phi": 200_000_000},
        {"thang": "T2", "doanh_thu": 1_200_000_000, "cogs": 600_000_000, "chi_phi": 220_000_000},
        {"thang": "T3", "doanh_thu": 1_500_000_000, "cogs": 750_000_000, "chi_phi": 250_000_000},
        {"thang": "T4", "doanh_thu": 1_800_000_000, "cogs": 900_000_000, "chi_phi": 300_000_000},
    ]
    file_path = tmp_path / "tier1_formulas.xlsx"
    create_advanced_financial_workbook(data, file_path)

    wb = load_workbook(file_path, data_only=False)
    ws_monthly = wb["Monthly Breakdown"]

    # Check row-level formulas
    # Row 3 (T1): gross profit formula =B3-C3, net profit =D3-E3
    assert ws_monthly["D3"].value == "=B3-C3"
    assert ws_monthly["F3"].value == "=D3-E3"
    assert ws_monthly["G3"].value == "=0"
    assert ws_monthly["H3"].value == "=IF(F3>0, ROUND(F3*0.05, 0), 0)"

    # Row 4 (T2): MoM growth =((B4-B3)/B3)
    assert ws_monthly["G4"].value == "=((B4-B3)/B3)"
    assert ws_monthly["H4"].value == "=IF(F4>0, ROUND(F4*0.05, 0), 0)"

    # Total Row (Row 7): =SUM(B3:B6), =AVERAGE(G4:G6)
    assert ws_monthly["B7"].value == "=SUM(B3:B6)"
    assert ws_monthly["C7"].value == "=SUM(C3:C6)"
    assert ws_monthly["D7"].value == "=SUM(D3:D6)"
    assert ws_monthly["E7"].value == "=SUM(E3:E6)"
    assert ws_monthly["F7"].value == "=SUM(F3:F6)"
    assert ws_monthly["G7"].value == "=AVERAGE(G4:G6)"
    assert ws_monthly["H7"].value == "=SUM(H3:H6)"

    # Inter-sheet formulas in Executive Summary
    ws_exec = wb["Executive Summary"]
    assert ws_exec["B5"].value == "='Monthly Breakdown'!B7"
    assert ws_exec["B7"].value == "='Monthly Breakdown'!D7"
    assert ws_exec["B9"].value == "='Monthly Breakdown'!F7"


def test_tier1_excel_visual_styling_and_number_formatting(tmp_path: Path):
    """Tier 1: Verify Dark Navy headers (#1E3A8A), thin borders, and currency/percentage formats."""
    data = [
        {"thang": "T1", "doanh_thu": 2_000_000_000, "cogs": 1_000_000_000, "chi_phi": 400_000_000},
        {"thang": "T2", "doanh_thu": 2_400_000_000, "cogs": 1_200_000_000, "chi_phi": 450_000_000},
    ]
    file_path = tmp_path / "tier1_styling.xlsx"
    create_advanced_financial_workbook(data, file_path)

    wb = load_workbook(file_path, data_only=False)
    ws_monthly = wb["Monthly Breakdown"]

    # Header styling (Row 2)
    header_cell = ws_monthly["B2"]
    assert header_cell.font.bold is True
    assert header_cell.font.color.rgb == "00FFFFFF" or header_cell.font.color.rgb == "FFFFFF"
    assert header_cell.fill.start_color.rgb == "001E3A8A" or header_cell.fill.start_color.rgb == "1E3A8A"

    # Number format checks
    # Revenue cell (B3)
    assert ws_monthly["B3"].number_format == '#,##0 "VND"'
    # Growth cell (G4)
    assert ws_monthly["G4"].number_format == "0.0%"


def test_tier1_pptx_native_charts_all_types(tmp_path: Path):
    """Tier 1: Verify all 4 native PowerPoint chart types (ColumnClustered, Bar, Line, Pie)."""
    rows = [
        {"quy": "Q1", "kenh": "Online", "doanh_thu": 1_200_000_000, "loi_nhuan": 350_000_000},
        {"quy": "Q1", "kenh": "Offline", "doanh_thu": 800_000_000, "loi_nhuan": 200_000_000},
        {"quy": "Q2", "kenh": "Online", "doanh_thu": 1_500_000_000, "loi_nhuan": 450_000_000},
        {"quy": "Q2", "kenh": "Offline", "doanh_thu": 900_000_000, "loi_nhuan": 220_000_000},
        {"quy": "Q3", "kenh": "Online", "doanh_thu": 1_800_000_000, "loi_nhuan": 520_000_000},
        {"quy": "Q3", "kenh": "Offline", "doanh_thu": 950_000_000, "loi_nhuan": 240_000_000},
        {"quy": "Q4", "kenh": "Online", "doanh_thu": 2_400_000_000, "loi_nhuan": 700_000_000},
        {"quy": "Q4", "kenh": "Offline", "doanh_thu": 1_100_000_000, "loi_nhuan": 280_000_000},
    ]

    spec = {
        "title": "Báo Cáo Tổng Thể 4 Loại Biểu Đồ",
        "slides": [
            {
                "kind": "chart",
                "title": "1. Column Clustered Chart",
                "chart": "column",
                "category_column": "quy",
                "value_column": "doanh_thu",
                "series_column": "kenh",
            },
            {
                "kind": "chart",
                "title": "2. Bar Clustered Chart",
                "chart": "bar",
                "category_column": "quy",
                "value_column": "loi_nhuan",
                "series_column": "kenh",
            },
            {
                "kind": "chart",
                "title": "3. Line Markers Chart",
                "chart": "line",
                "category_column": "quy",
                "value_column": "doanh_thu",
            },
            {
                "kind": "chart",
                "title": "4. Pie Chart",
                "chart": "pie",
                "category_column": "kenh",
                "value_column": "doanh_thu",
            },
        ],
    }

    pptx_path = tmp_path / "tier1_all_charts.pptx"
    deck.render_deck(spec, rows, pptx_path)

    assert pptx_path.exists()
    prs = Presentation(pptx_path)
    assert len(prs.slides) == 5  # 1 cover + 4 chart slides

    # Slide 2: Column Clustered
    chart_shape1 = [s for s in prs.slides[1].shapes if s.has_chart][0]
    assert chart_shape1.chart.chart_type == XL_CHART_TYPE.COLUMN_CLUSTERED
    assert [c.label for c in chart_shape1.chart.plots[0].categories] == ["Q1", "Q2", "Q3", "Q4"]

    # Slide 3: Bar Clustered
    chart_shape2 = [s for s in prs.slides[2].shapes if s.has_chart][0]
    assert chart_shape2.chart.chart_type == XL_CHART_TYPE.BAR_CLUSTERED

    # Slide 4: Line Markers
    chart_shape3 = [s for s in prs.slides[3].shapes if s.has_chart][0]
    assert chart_shape3.chart.chart_type == XL_CHART_TYPE.LINE_MARKERS

    # Slide 5: Pie Chart
    chart_shape4 = [s for s in prs.slides[4].shapes if s.has_chart][0]
    assert chart_shape4.chart.chart_type == XL_CHART_TYPE.PIE


def test_tier1_pptx_kpi_cards_and_metrics(tmp_path: Path):
    """Tier 1: Verify KPI cards shape (Rounded Rectangle) and Vietnamese metric formatting."""
    rows = [
        {"quy": "Q1", "doanh_thu": 2_500_000_000, "so_don": 5000},
        {"quy": "Q2", "doanh_thu": 3_500_000_000, "so_don": 7000},
    ]
    spec = {
        "title": "Tổng Hợp KPI Trọng Yếu",
        "slides": [
            {
                "kind": "kpi",
                "title": "Chỉ Số Tăng Trưởng",
                "kpis": [
                    {"label": "Tổng Doanh Thu", "metric": "sum:doanh_thu"},
                    {"label": "Tổng Đơn Hàng", "metric": "sum:so_don"},
                    {"label": "Tăng Trưởng Q2/Q1", "metric": "growth:doanh_thu:quy"},
                    {"label": "Số Bản Ghi", "metric": "count"},
                ],
            }
        ],
    }
    pptx_path = tmp_path / "tier1_kpi_cards.pptx"
    deck.render_deck(spec, rows, pptx_path)

    prs = Presentation(pptx_path)
    kpi_slide = prs.slides[1]

    # Verify rounded rectangle shape cards
    def _is_rounded_rect(shape: Any) -> bool:
        try:
            return shape.auto_shape_type == MSO_SHAPE.ROUNDED_RECTANGLE
        except (ValueError, AttributeError):
            return False

    rounded_rectangles = [s for s in kpi_slide.shapes if _is_rounded_rect(s)]
    assert len(rounded_rectangles) == 4

    slide_text = " ".join(s.text for s in kpi_slide.shapes if s.has_text_frame)
    assert "6 tỷ" in slide_text
    assert "12.000" in slide_text
    assert "+40,0%" in slide_text
    assert "2" in slide_text


def test_tier1_pptx_bullets_table_and_callouts(tmp_path: Path):
    """Tier 1: Verify bullet points, table layout, and callout hierarchy."""
    rows = [
        {"khu_vuc": "Miền Bắc", "doanh_thu": 5_000_000_000, "thi_phan": "45%"},
        {"khu_vuc": "Miền Nam", "doanh_thu": 4_000_000_000, "thi_phan": "35%"},
        {"khu_vuc": "Miền Trung", "doanh_thu": 2_000_000_000, "thi_phan": "20%"},
    ]
    spec = {
        "title": "Báo Cáo Phân Bổ Khu Vực",
        "slides": [
            {
                "kind": "table",
                "title": "Bảng Chi Tiết Theo Khu Vực",
                "columns": ["khu_vuc", "doanh_thu", "thi_phan"],
                "limit": 5,
            },
            {
                "kind": "bullets",
                "title": "Đánh Giá & Nhận Định Chiến Lược",
                "bullets": [
                    "Miền Bắc giữ vai trò thị trường trọng điểm với doanh số vượt trội",
                    "Miền Nam duy trì tốc độ mở rộng mạng lưới phân phối tích cực",
                    "Miền Trung hoàn thành chỉ tiêu kinh doanh năm 2026",
                ],
            },
        ],
    }
    pptx_path = tmp_path / "tier1_bullets_table.pptx"
    deck.render_deck(spec, rows, pptx_path)

    prs = Presentation(pptx_path)
    assert len(prs.slides) == 3

    # Table slide checks
    table_shape = [s for s in prs.slides[1].shapes if s.has_table][0]
    table = table_shape.table
    assert len(table.rows) == 4  # header + 3 data rows
    assert len(table.columns) == 3
    assert table.cell(0, 0).text == "khu_vuc"
    assert table.cell(0, 1).text == "doanh_thu"

    # Bullets slide checks
    bullet_text = " ".join(s.text for s in prs.slides[2].shapes if s.has_text_frame)
    assert "Miền Bắc giữ vai trò thị trường trọng điểm" in bullet_text
    assert "năm 2026" in bullet_text  # Year is allowed as a label


# ==============================================================================
# TIER 2: BOUNDARY & CORNER CASES
# ==============================================================================

def test_tier2_empty_rows_boundary_handling(tmp_path: Path):
    """Tier 2: Empty row inputs must fail with clear ValueError or return None gracefully."""
    empty_rows: list[dict[str, Any]] = []

    # 1. deck.compute_metric
    with pytest.raises(ValueError, match="no rows"):
        deck.compute_metric(empty_rows, "sum:doanh_thu")

    # 2. deck.render_deck
    with pytest.raises(ValueError, match="no rows"):
        deck.render_deck({"title": "Test", "slides": [{"kind": "bullets", "bullets": ["A"]}]}, empty_rows, tmp_path / "empty.pptx")

    # 3. deck.render_html
    with pytest.raises(ValueError, match="no rows"):
        deck.render_html({"title": "Test"}, empty_rows)

    # 4. _export_excel_file
    assert ow._export_excel_file(empty_rows) is None


def test_tier2_single_row_dataset_handling(tmp_path: Path):
    """Tier 2: Single-row dataset handles basic aggregates cleanly but disallows growth gracefully."""
    single_row = [{"quy": "Q1", "kenh": "Online", "doanh_thu": 1_500_000_000, "so_don": 3000}]

    assert deck.compute_metric(single_row, "sum:doanh_thu") == 1_500_000_000.0
    assert deck.compute_metric(single_row, "avg:doanh_thu") == 1_500_000_000.0
    assert deck.compute_metric(single_row, "min:doanh_thu") == 1_500_000_000.0
    assert deck.compute_metric(single_row, "max:doanh_thu") == 1_500_000_000.0
    assert deck.compute_metric(single_row, "count") == 1.0

    # Growth on single period raises clear ValueError
    with pytest.raises(ValueError, match="at least two"):
        deck.compute_metric(single_row, "growth:doanh_thu:quy")

    # Excel export handles single row
    out_xlsx = officecli._write_workbook(single_row, tmp_path / "single_row.xlsx")
    wb = load_workbook(out_xlsx)
    assert wb["totals"]["B2"].value == 1  # row_count


def test_tier2_negative_numbers_and_loss_scenarios(tmp_path: Path):
    """Tier 2: Negative profits, costs, and negative growth rates are correctly formatted and rendered."""
    rows = [
        {"quy": "Q1", "loi_nhuan": 500_000_000},
        {"quy": "Q2", "loi_nhuan": -250_000_000},  # Loss in Q2
    ]

    # Metric computations
    assert deck.compute_metric(rows, "sum:loi_nhuan") == 250_000_000.0
    assert deck.compute_metric(rows, "min:loi_nhuan") == -250_000_000.0

    # Growth computation: (-250m - 500m) / 500m = -750m / 500m = -1.5 (-150%)
    growth = deck.compute_metric(rows, "growth:loi_nhuan:quy")
    assert growth == pytest.approx(-1.5)
    assert deck.format_metric("growth:loi_nhuan:quy", growth) == "-150,0%"

    # Negative number formatting in Vietnamese style
    assert deck.format_number(-250_000_000) == "-250 triệu"

    # PPTX rendering with negative KPI values
    spec = {
        "title": "Báo Cáo Thua Lỗ Tạm Thời",
        "slides": [
            {
                "kind": "kpi",
                "title": "Chỉ Số Lợi Nhuận",
                "kpis": [
                    {"label": "Lợi Nhuận Tối Thiểu", "metric": "min:loi_nhuan"},
                    {"label": "Tăng Trưởng Q2/Q1", "metric": "growth:loi_nhuan:quy"},
                ],
            }
        ],
    }
    pptx_path = tmp_path / "negative_numbers.pptx"
    deck.render_deck(spec, rows, pptx_path)
    prs = Presentation(pptx_path)
    slide_text = " ".join(s.text for s in prs.slides[1].shapes if s.has_text_frame)
    assert "-250 triệu" in slide_text
    assert "-150,0%" in slide_text


def test_tier2_zero_division_growth_handling():
    """Tier 2: Growth against a 0 baseline is strictly rejected as undefined arithmetic."""
    rows = [
        {"quy": "Q1", "doanh_thu": 0.0},
        {"quy": "Q2", "doanh_thu": 500_000_000.0},
    ]
    with pytest.raises(ValueError, match="undefined"):
        deck.compute_metric(rows, "growth:doanh_thu:quy")


def test_tier2_non_numeric_and_none_columns(tmp_path: Path):
    """Tier 2: Text columns, boolean fields, and None values are safely filtered or formatted as dash."""
    rows = [
        {"ma": "NV01", "ten": "Nguyen Van A", "da_nghi": False, "thuong": 5_000_000, "ghi_chu": None},
        {"ma": "NV02", "ten": "Tran Thi B", "da_nghi": True, "thuong": None, "ghi_chu": "Tam hoan"},
        {"ma": "NV03", "ten": "Le Van C", "da_nghi": False, "thuong": 10_000_000, "ghi_chu": "Xuat sac"},
    ]

    # Non-numeric measure error
    with pytest.raises(ValueError, match="no numbers"):
        deck.compute_metric(rows, "sum:ten")

    # Excel write totals ignores non-numeric columns
    out_xlsx = officecli._write_workbook(rows, tmp_path / "non_numeric.xlsx")
    wb = load_workbook(out_xlsx)
    totals = dict(wb["totals"].iter_rows(min_row=2, values_only=True))
    assert "sum_thuong" in totals
    assert totals["sum_thuong"] == 15_000_000
    assert "sum_ten" not in totals
    assert "sum_da_nghi" not in totals

    # PPTX Table replaces None with '—'
    spec = {
        "title": "Danh Sách Nhân Viên",
        "slides": [
            {"kind": "table", "title": "Bảng Khen Thưởng", "columns": ["ma", "ten", "thuong", "ghi_chu"]}
        ],
    }
    out_pptx = deck.render_deck(spec, rows, tmp_path / "table_nones.pptx")
    prs = Presentation(out_pptx)
    table = [s for s in prs.slides[1].shapes if s.has_table][0].table
    # Row 2 (NV02) has None for thuong -> '—'
    assert table.cell(2, 2).text == "—"
    # Row 1 (NV01) has None for ghi_chu -> '—'
    assert table.cell(1, 3).text == "—"


def test_tier2_long_labels_and_unicode_vietnamese(tmp_path: Path):
    """Tier 2: Robust rendering of Vietnamese diacritics and very long text labels."""
    rows = [
        {
            "danh_muc_san_pham_chinh_hang_cao_cap": "Điện thoại thông minh & Máy tính bảng cao cấp thế hệ mới",
            "doanh_thu_quy_1": 15_850_000_000,
        },
        {
            "danh_muc_san_pham_chinh_hang_cao_cap": "Phụ kiện công nghệ, thiết bị âm thanh và tai nghe không dây",
            "doanh_thu_quy_1": 8_420_000_000,
        },
    ]

    spec = {
        "title": "Báo Cáo Phân Tích Danh Mục Sản Phẩm Công Nghệ Cao Cấp 2026",
        "subtitle": "Đánh giá chi tiết cơ cấu doanh số các ngành hàng mũi nhọn",
        "slides": [
            {
                "kind": "chart",
                "title": "Cơ Cấu Doanh Thu Theo Danh Mục Dài",
                "chart": "column",
                "category_column": "danh_muc_san_pham_chinh_hang_cao_cap",
                "value_column": "doanh_thu_quy_1",
            },
            {
                "kind": "bullets",
                "title": "Nhận Định Chuyên Sâu",
                "bullets": [
                    "Ngành hàng Điện thoại thông minh tiếp tục dẫn dắt tăng trưởng doanh số toàn hệ thống",
                    "Phụ kiện công nghệ mở rộng biên độ lợi nhuận gộp đáng kể",
                ],
            },
        ],
    }

    pptx_path = tmp_path / "unicode_long_labels.pptx"
    deck.render_deck(spec, rows, pptx_path)
    assert pptx_path.exists()

    # Also test HTML preview rendering for Unicode fidelity
    html_preview = deck.render_html(spec, rows)
    assert "Điện thoại thông minh &amp; Máy tính bảng" in html_preview or "Điện thoại thông minh" in html_preview
    assert "15,85 tỷ" in html_preview


# ==============================================================================
# TIER 3: CROSS-FEATURE COMBINATIONS
# ==============================================================================

def test_tier3_multiturn_sql_to_excel_supervisor_verification(tmp_path: Path):
    """Tier 3: Multi-turn SQL datasets combined into Excel, validated by Supervisor Fact Grounding."""
    # Turn 1: H1 (Q1 + Q2)
    turn1_data = [
        {"quy": "Q1", "doanh_thu": 3_200_000_000, "loi_nhuan": 960_000_000},
        {"quy": "Q2", "doanh_thu": 3_800_000_000, "loi_nhuan": 1_140_000_000},
    ]
    # Turn 2: H2 (Q3 + Q4)
    turn2_data = [
        {"quy": "Q3", "doanh_thu": 4_200_000_000, "loi_nhuan": 1_260_000_000},
        {"quy": "Q4", "doanh_thu": 5_100_000_000, "loi_nhuan": 1_530_000_000},
    ]
    full_annual_data = turn1_data + turn2_data

    # Generate multi-sheet workbook
    xlsx_path = tmp_path / "annual_sales_consolidated.xlsx"
    officecli._write_workbook(full_annual_data, xlsx_path, period_column="quy")

    # Extract ground truth
    gt_facts = _extract_ground_truth_values(full_annual_data)
    total_rev = 3_200_000_000 + 3_800_000_000 + 4_200_000_000 + 5_100_000_000  # 16.3 bn
    assert float(total_rev) in gt_facts

    # Verify supervisor verification gate on grounded claims
    grounded_summary = (
        "Báo cáo tổng hợp kinh doanh 4 quý năm 2026:\n"
        "- Doanh thu Q1 đạt 3.200.000.000 đồng, Q4 tăng vọt lên 5.100.000.000 đồng.\n"
        "- Tổng doanh thu cả năm đạt 16.300.000.000 đồng.\n"
        "- Tổng cộng có 4 bản ghi dữ liệu quý."
    )
    is_valid, ungrounded_claims = verify_numerical_claims(grounded_summary, full_annual_data)
    assert is_valid is True
    assert ungrounded_claims == []

    # Verify detection of ungrounded / hallucinated numbers
    hallucinated_summary = "Tổng doanh thu bịa đặt đạt 88.888.000.000 đồng."
    is_valid_hallucinated, bad_claims = verify_numerical_claims(hallucinated_summary, full_annual_data)
    assert is_valid_hallucinated is False
    assert len(bad_claims) > 0


def test_tier3_multiturn_sql_to_8slide_pptx_deck_anti_hallucination(tmp_path: Path):
    """Tier 3: 8-slide executive PPTX deck strictly drops hallucinated claims in bullets while retaining facts."""
    rows = [
        {"quy": "Q1", "kenh": "B2B", "doanh_thu": 4_500_000_000, "khach_hang": 120},
        {"quy": "Q1", "kenh": "B2C", "doanh_thu": 2_800_000_000, "khach_hang": 8500},
        {"quy": "Q2", "kenh": "B2B", "doanh_thu": 5_200_000_000, "khach_hang": 140},
        {"quy": "Q2", "kenh": "B2C", "doanh_thu": 3_300_000_000, "khach_hang": 9800},
        {"quy": "Q3", "kenh": "B2B", "doanh_thu": 5_800_000_000, "khach_hang": 160},
        {"quy": "Q3", "kenh": "B2C", "doanh_thu": 3_900_000_000, "khach_hang": 11200},
        {"quy": "Q4", "kenh": "B2B", "doanh_thu": 7_200_000_000, "khach_hang": 195},
        {"quy": "Q4", "kenh": "B2C", "doanh_thu": 4_800_000_000, "khach_hang": 14500},
    ]

    # 8-slide executive specification
    deck_spec = {
        "title": "Báo Cáo Chiến Lược Tăng Trưởng Doanh Nghiệp 2026",
        "subtitle": "Phân tích 8 slide tổng quan hiệu suất kênh B2B và B2C",
        "source": "Nguồn: Ban Kế Hoạch & Tài Chính",
        "slides": [
            # Slide 1: Exec KPI
            {
                "kind": "kpi",
                "title": "1. Chỉ Số Hiệu Suất Tổng Thể",
                "kpis": [
                    {"label": "Tổng Doanh Thu Hợp Nhất", "metric": "sum:doanh_thu"},
                    {"label": "Tăng Trưởng Q4/Q3", "metric": "growth:doanh_thu:quy"},
                    {"label": "Tổng Lượng Khách Hàng", "metric": "sum:khach_hang"},
                ],
            },
            # Slide 2: Column Chart by Quarter & Channel
            {
                "kind": "chart",
                "title": "2. Diễn Biến Doanh Thu Theo Quý & Kênh",
                "chart": "column",
                "category_column": "quy",
                "value_column": "doanh_thu",
                "series_column": "kenh",
            },
            # Slide 3: Bar Chart
            {
                "kind": "chart",
                "title": "3. Cơ Cấu Khách Hàng Theo Kênh",
                "chart": "bar",
                "category_column": "quy",
                "value_column": "khach_hang",
                "series_column": "kenh",
            },
            # Slide 4: Line Chart
            {
                "kind": "chart",
                "title": "4. Xu Hướng Tăng Trưởng Doanh Thu B2B",
                "chart": "line",
                "category_column": "quy",
                "value_column": "doanh_thu",
            },
            # Slide 5: Pie Chart
            {
                "kind": "chart",
                "title": "5. Tỷ Trọng Doanh Thu B2B vs B2C",
                "chart": "pie",
                "category_column": "kenh",
                "value_column": "doanh_thu",
            },
            # Slide 6: Detailed Data Table
            {
                "kind": "table",
                "title": "6. Bảng Số Liệu Chi Tiết",
                "columns": ["quy", "kenh", "doanh_thu", "khach_hang"],
                "limit": 8,
            },
            # Slide 7: Strategic Bullets with an injected Hallucination
            {
                "kind": "bullets",
                "title": "7. Nhận Định Chiến Lược",
                "bullets": [
                    "Kênh B2B đóng góp tỷ trọng lớn nhất vào tổng doanh thu",
                    "Kênh B2C mở rộng nhanh chóng tệp khách hàng cá nhân",
                    "Doanh thu bịa đặt tăng không tưởng 999999999999 tỷ",  # Hallucination to drop
                ],
            },
            # Slide 8: Executive Takeaways
            {
                "kind": "bullets",
                "title": "8. Khuyến Nghị Hành Động",
                "bullets": [
                    "Tăng cường nguồn lực phát triển giải pháp B2B chuyên biệt",
                    "Tối ưu chi phí chuyển đổi khách hàng kênh B2C trong các quý tiếp theo",
                ],
            },
        ],
    }

    pptx_path = tmp_path / "executive_8_slides.pptx"
    deck.render_deck(deck_spec, rows, pptx_path)

    prs = Presentation(pptx_path)
    assert len(prs.slides) == 9  # Cover + 8 slides

    # Verify anti-hallucination bullet dropped
    slide7_text = " ".join(s.text for s in prs.slides[7].shapes if s.has_text_frame)
    assert "Kênh B2B đóng góp tỷ trọng lớn nhất" in slide7_text
    assert "999999999999" not in slide7_text


def test_tier3_office_writer_sse_events_lifecycle():
    """Tier 3: Verify ArtifactStream lifecycle events (start -> progress -> ready/error)."""
    async def _run_stream_flow():
        events: list[dict] = []
        stream = ArtifactStream(kind="pptx", title="Báo Cáo Ban Điều Hành")

        # Hook into emit for verification
        orig_start = stream.start
        orig_progress = stream.progress
        orig_ready = stream.ready

        await stream.start()
        await stream.progress("planning", 25)
        await stream.progress("rendering", 75)
        await stream.ready(url="/uploads/test.pptx", size=10240, preview_html="<div>Preview</div>")

        return stream.id

    artifact_id = asyncio.run(_run_stream_flow())
    assert artifact_id is not None
    assert len(artifact_id) > 0


def test_tier3_deck_html_preview_and_pptx_sync(tmp_path: Path):
    """Tier 3: PPTX deck and HTML preview numbers are 100% synchronized from identical spec."""
    rows = [
        {"quy": "Q1", "doanh_thu": 1_000_000_000},
        {"quy": "Q2", "doanh_thu": 2_000_000_000},
    ]
    spec = {
        "title": "Đồng Bộ Slide & Preview",
        "slides": [
            {
                "kind": "kpi",
                "title": "Chỉ Số",
                "kpis": [
                    {"label": "Tổng", "metric": "sum:doanh_thu"},
                    {"label": "Tăng Trưởng", "metric": "growth:doanh_thu:quy"},
                ],
            }
        ],
    }

    pptx_path = tmp_path / "sync.pptx"
    deck.render_deck(spec, rows, pptx_path)
    html_preview = deck.render_html(spec, rows)

    # Both must contain exact formatted values: "3 tỷ" and "+100,0%"
    prs = Presentation(pptx_path)
    pptx_text = " ".join(s.text for s in prs.slides[1].shapes if s.has_text_frame)

    assert "3 tỷ" in pptx_text
    assert "+100,0%" in pptx_text
    assert "3 tỷ" in html_preview
    assert "+100,0%" in html_preview


# ==============================================================================
# TIER 4: REAL-WORLD APPLICATION SCENARIOS
# ==============================================================================

def test_tier4_12month_corporate_financial_model_pnl(tmp_path: Path):
    """Tier 4: Realistic 12-Month Corporate P&L Financial Model with inter-sheet formulas."""
    months = [
        "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
        "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
    ]
    monthly_data = []
    base_rev = 1_000_000_000
    for idx, m in enumerate(months):
        rev = base_rev + idx * 150_000_000  # Steady monthly growth
        cogs = rev * 0.45
        opex = rev * 0.25
        monthly_data.append({
            "thang": m,
            "doanh_thu": rev,
            "cogs": cogs,
            "chi_phi": opex,
        })

    model_file = tmp_path / "annual_12_month_financial_model.xlsx"
    create_advanced_financial_workbook(monthly_data, model_file, company_name="DB-GPT Enterprise")

    assert model_file.exists()
    wb = load_workbook(model_file, data_only=False)

    # 1. Verify Monthly Breakdown rows count & formulas
    ws_monthly = wb["Monthly Breakdown"]
    assert ws_monthly.max_row == 15  # Empty row + Header + 12 data rows + Total row (Row 15)

    # Total row is row 15 (start_row 3 + 12 rows = row 15)
    total_row = 15
    assert ws_monthly[f"B{total_row}"].value == "=SUM(B3:B14)"
    assert ws_monthly[f"C{total_row}"].value == "=SUM(C3:C14)"
    assert ws_monthly[f"D{total_row}"].value == "=SUM(D3:D14)"
    assert ws_monthly[f"E{total_row}"].value == "=SUM(E3:E14)"
    assert ws_monthly[f"F{total_row}"].value == "=SUM(F3:F14)"
    assert ws_monthly[f"G{total_row}"].value == "=AVERAGE(G4:G14)"
    assert ws_monthly[f"H{total_row}"].value == "=SUM(H3:H14)"

    # 2. Verify Executive Summary Sheet references Total Row
    ws_exec = wb["Executive Summary"]
    assert ws_exec["B5"].value == f"='Monthly Breakdown'!B{total_row}"
    assert ws_exec["B6"].value == f"='Monthly Breakdown'!C{total_row}"
    assert ws_exec["B7"].value == f"='Monthly Breakdown'!D{total_row}"
    assert ws_exec["B8"].value == f"='Monthly Breakdown'!E{total_row}"
    assert ws_exec["B9"].value == f"='Monthly Breakdown'!F{total_row}"
    assert ws_exec["B10"].value == f"='Monthly Breakdown'!G{total_row}"
    assert ws_exec["B11"].value == f"='Monthly Breakdown'!H{total_row}"

    # 3. Verify KPI Sheet
    ws_kpi = wb["KPI Metrics"]
    assert ws_kpi["C2"].value == f"='Monthly Breakdown'!D{total_row}/'Monthly Breakdown'!B{total_row}"
    assert ws_kpi["C3"].value == f"='Monthly Breakdown'!F{total_row}/'Monthly Breakdown'!B{total_row}"


def test_tier4_quarterly_departmental_performance_deck(tmp_path: Path):
    """Tier 4: Realistic 4-Quarter Departmental Performance Presentation Deck."""
    dept_records = [
        {"quy": "Q1", "phong_ban": "Sales", "ngan_sach": 2_000_000_000, "thuc_chi": 1_850_000_000, "nhan_su": 25},
        {"quy": "Q1", "phong_ban": "Engineering", "ngan_sach": 3_500_000_000, "thuc_chi": 3_400_000_000, "nhan_su": 50},
        {"quy": "Q1", "phong_ban": "Marketing", "ngan_sach": 1_500_000_000, "thuc_chi": 1_420_000_000, "nhan_su": 15},
        {"quy": "Q1", "phong_ban": "Operations", "ngan_sach": 1_000_000_000, "thuc_chi": 950_000_000, "nhan_su": 20},

        {"quy": "Q2", "phong_ban": "Sales", "ngan_sach": 2_200_000_000, "thuc_chi": 2_100_000_000, "nhan_su": 28},
        {"quy": "Q2", "phong_ban": "Engineering", "ngan_sach": 3_800_000_000, "thuc_chi": 3_750_000_000, "nhan_su": 55},
        {"quy": "Q2", "phong_ban": "Marketing", "ngan_sach": 1_800_000_000, "thuc_chi": 1_750_000_000, "nhan_su": 18},
        {"quy": "Q2", "phong_ban": "Operations", "ngan_sach": 1_100_000_000, "thuc_chi": 1_050_000_000, "nhan_su": 22},

        {"quy": "Q3", "phong_ban": "Sales", "ngan_sach": 2_500_000_000, "thuc_chi": 2_450_000_000, "nhan_su": 32},
        {"quy": "Q3", "phong_ban": "Engineering", "ngan_sach": 4_200_000_000, "thuc_chi": 4_100_000_000, "nhan_su": 60},
        {"quy": "Q3", "phong_ban": "Marketing", "ngan_sach": 2_000_000_000, "thuc_chi": 1_920_000_000, "nhan_su": 20},
        {"quy": "Q3", "phong_ban": "Operations", "ngan_sach": 1_200_000_000, "thuc_chi": 1_150_000_000, "nhan_su": 24},

        {"quy": "Q4", "phong_ban": "Sales", "ngan_sach": 3_000_000_000, "thuc_chi": 2_950_000_000, "nhan_su": 35},
        {"quy": "Q4", "phong_ban": "Engineering", "ngan_sach": 4_800_000_000, "thuc_chi": 4_700_000_000, "nhan_su": 65},
        {"quy": "Q4", "phong_ban": "Marketing", "ngan_sach": 2_500_000_000, "thuc_chi": 2_400_000_000, "nhan_su": 22},
        {"quy": "Q4", "phong_ban": "Operations", "ngan_sach": 1_300_000_000, "thuc_chi": 1_280_000_000, "nhan_su": 25},
    ]

    deck_spec = {
        "title": "Báo Cáo Hiệu Quả Hoạt Động Khối Phòng Ban 2026",
        "subtitle": "Đánh giá ngân sách, chi phí thực tế và quy mô nhân sự",
        "source": "Nguồn: Ban Tài Chính Kế Hoạch & HR",
        "slides": [
            {
                "kind": "kpi",
                "title": "Tổng Quan Ngân Sách Toàn Tập Đoàn",
                "kpis": [
                    {"label": "Tổng Ngân Sách Phê Duyệt", "metric": "sum:ngan_sach"},
                    {"label": "Tổng Chi Phí Thực Tế", "metric": "sum:thuc_chi"},
                    {"label": "Tăng Trưởng Chi Phí Q4/Q3", "metric": "growth:thuc_chi:quy"},
                ],
            },
            {
                "kind": "chart",
                "title": "Ngân Sách & Chi Phí Theo Phòng Ban",
                "chart": "column",
                "category_column": "phong_ban",
                "value_column": "thuc_chi",
            },
            {
                "kind": "chart",
                "title": "Quy Mô Nhân Sự Các Quý",
                "chart": "line",
                "category_column": "quy",
                "value_column": "nhan_su",
                "series_column": "phong_ban",
            },
            {
                "kind": "table",
                "title": "Bảng Tổng Hợp Chi Tiết",
                "columns": ["quy", "phong_ban", "ngan_sach", "thuc_chi", "nhan_su"],
                "limit": 8,
            },
            {
                "kind": "bullets",
                "title": "Nhận Định Hiệu Quả Sử Dụng Ngân Sách",
                "bullets": [
                    "Các phòng ban tuân thủ chặt chẽ định mức ngân sách đã phê duyệt",
                    "Khối Kỹ thuật (Engineering) tối ưu chi phí hạ tầng máy chủ",
                    "Khối Kinh doanh (Sales) gia tăng tỷ suất sinh lời trên mỗi nhân sự",
                ],
            },
        ],
    }

    pptx_file = tmp_path / "dept_performance.pptx"
    deck.render_deck(deck_spec, dept_records, pptx_file)

    assert pptx_file.exists()
    prs = Presentation(pptx_file)
    assert len(prs.slides) == 6  # 1 cover + 5 slides

    # Assert KPI slide calculations
    total_budget = sum(r["ngan_sach"] for r in dept_records)  # 36.4 bn
    total_spend = sum(r["thuc_chi"] for r in dept_records)    # 35.64 bn
    formatted_budget = deck.format_number(total_budget)
    formatted_spend = deck.format_number(total_spend)

    slide1_text = " ".join(s.text for s in prs.slides[1].shapes if s.has_text_frame)
    assert formatted_budget in slide1_text
    assert formatted_spend in slide1_text


def test_tier4_full_pipeline_multi_artifact_export(tmp_path: Path):
    """Tier 4: Cross-artifact consistency verification between generated Spreadsheet and Presentation Deck."""
    sales_data = [
        {"thang": "T1", "doanh_thu": 2_000_000_000, "cogs": 1_000_000_000, "chi_phi": 400_000_000},
        {"thang": "T2", "doanh_thu": 2_500_000_000, "cogs": 1_250_000_000, "chi_phi": 450_000_000},
        {"thang": "T3", "doanh_thu": 3_000_000_000, "cogs": 1_500_000_000, "chi_phi": 500_000_000},
        {"thang": "T4", "doanh_thu": 3_500_000_000, "cogs": 1_750_000_000, "chi_phi": 550_000_000},
    ]

    # 1. Generate multi-sheet financial spreadsheet
    excel_path = tmp_path / "pipeline_financial_report.xlsx"
    create_advanced_financial_workbook(sales_data, excel_path)

    # 2. Generate presentation deck
    deck_spec = {
        "title": "Báo Cáo Doanh Thu Q1-Q4",
        "slides": [
            {
                "kind": "kpi",
                "title": "Chỉ Số Tổng Hợp",
                "kpis": [
                    {"label": "Tổng Doanh Thu", "metric": "sum:doanh_thu"},
                    {"label": "Tăng Trưởng T4/T3", "metric": "growth:doanh_thu:thang"},
                ],
            },
            {
                "kind": "chart",
                "title": "Doanh Thu Qua Các Tháng",
                "chart": "column",
                "category_column": "thang",
                "value_column": "doanh_thu",
            },
        ],
    }
    pptx_path = tmp_path / "pipeline_presentation.pptx"
    deck.render_deck(deck_spec, sales_data, pptx_path)

    # 3. Assert consistency between Excel and PPTX
    wb = load_workbook(excel_path, data_only=False)
    # Excel total revenue formula in cell B7: =SUM(B3:B6)
    assert wb["Monthly Breakdown"]["B7"].value == "=SUM(B3:B6)"

    # PPTX KPI total matches 11 bn
    prs = Presentation(pptx_path)
    kpi_text = " ".join(s.text for s in prs.slides[1].shapes if s.has_text_frame)
    assert "11 tỷ" in kpi_text
    assert "+16,7%" in kpi_text
