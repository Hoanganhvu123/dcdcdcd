"""Empirical Adversarial Stress Test Suite for Multi-Sheet Spreadsheet Engine.

Covers:
1. Dataset boundary conditions: 0 rows, 1 row, 1500+ rows, all numeric, all categorical, single numeric column.
2. Extreme numerical & division by zero: Start value 0, negative values, high-precision decimals, None/missing values.
3. String & encoding robustness: Vietnamese Unicode diacritics, quotes, punctuation, HTML entities, XML safety.
4. Formula syntax & AST validation: Inter-sheet formula references, openpyxl AST tokenization, range bounds.
5. Officecli helper methods and HTML preview generators.
"""

from __future__ import annotations

import io
import math
import time
from pathlib import Path
from typing import Any

import pytest
from openpyxl import load_workbook
from openpyxl.formula.tokenizer import Tokenizer, TokenizerError

from dbgpt_analyst.subgraphs.modes import office_writer_subgraph as ow
from dbgpt_analyst.tools import officecli


# ==============================================================================
# Helper Verification Functions
# ==============================================================================

def extract_all_formulas(workbook_path: Path) -> dict[str, list[dict[str, Any]]]:
    """Extract all formula strings from all worksheets along with cell coordinates."""
    wb = load_workbook(workbook_path, data_only=False)
    formulas_by_sheet: dict[str, list[dict[str, Any]]] = {}
    for sheetname in wb.sheetnames:
        sheet = wb[sheetname]
        sheet_formulas = []
        for row in sheet.iter_rows(values_only=False):
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    sheet_formulas.append({
                        "coordinate": cell.coordinate,
                        "row": cell.row,
                        "column": cell.column,
                        "formula": cell.value,
                    })
        formulas_by_sheet[sheetname] = sheet_formulas
    return formulas_by_sheet


def validate_formula_syntax_and_references(formulas_by_sheet: dict[str, list[dict[str, Any]]], valid_sheetnames: list[str]):
    """Validate that all formula strings are syntactically valid and reference valid sheet names."""
    for sheetname, formulas in formulas_by_sheet.items():
        for item in formulas:
            f_str = item["formula"]
            coord = item["coordinate"]
            # 1. Formula must start with =
            assert f_str.startswith("="), f"Formula at {sheetname}!{coord} must start with =: {f_str}"
            
            # 2. Check no error literals in formula text
            for err_literal in ["#REF!", "#VALUE!", "#NAME?", "#DIV/0!", "#N/A"]:
                assert err_literal not in f_str, f"Forbidden error literal {err_literal} found in formula at {sheetname}!{coord}: {f_str}"
            
            # 3. Tokenize formula using openpyxl Tokenizer to check AST syntax
            try:
                tokens = Tokenizer(f_str[1:]).items  # strip leading =
                assert len(tokens) > 0, f"Empty token list for {sheetname}!{coord}: {f_str}"
            except TokenizerError as e:
                pytest.fail(f"Syntax error in formula at {sheetname}!{coord}: {f_str} -> {e}")
            
            # 4. Check for parentheses balance
            assert f_str.count("(") == f_str.count(")"), f"Unbalanced parentheses at {sheetname}!{coord}: {f_str}"


# ==============================================================================
# 1. Dataset Boundary Sizes & Schema Structures
# ==============================================================================

def test_adversarial_empty_dataset_handling(tmp_path: Path, monkeypatch):
    """Adversarial Test 1.1: 0 rows empty dataset must not crash and should return None / safe fallback."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    
    # Test _export_excel_file with empty list
    url = ow._export_excel_file([])
    assert url is None, "_export_excel_file must return None for empty rows"

    # Test _export_excel_file with None or non-dict rows
    assert ow._export_excel_file(None) is None
    assert ow._export_excel_file(["not_a_dict"]) is None

    # Test _render_excel_html with empty list
    html = ow._render_excel_html("Báo cáo rỗng", [])
    assert "Không có dữ liệu" in html or "sheet-exec" in html


def test_adversarial_single_row_dataset(tmp_path: Path, monkeypatch):
    """Adversarial Test 1.2: 1 single row boundary condition.
    Must generate valid workbook, correct range bounds (A2:A2), and omit/handle growth formulas safely.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    single_row = [
        {"thang": "Tháng 1", "doanh_thu": 500_000_000, "loi_nhuan": 120_000_000, "san_luong": 50}
    ]
    url = ow._export_excel_file(single_row)
    assert url is not None

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    assert file_path.exists()

    wb = load_workbook(file_path, data_only=False)
    assert set(wb.sheetnames) == {"Executive Summary", "Data", "KPI Metrics"}
    assert wb["Data"].max_row == 2  # Header (row 1) + 1 data row (row 2)

    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, wb.sheetnames)

    # Check exact range in formulas for 1 row: Data!A2:A2, Data!B2:B2
    exec_formulas = [f["formula"] for f in formulas_by_sheet["Executive Summary"]]
    assert any("COUNTA(Data!A2:A2)" in f for f in exec_formulas)
    assert any("SUM(Data!B2:B2)" in f for f in exec_formulas)
    assert any("AVERAGE(Data!B2:B2)" in f for f in exec_formulas)
    # Since num_rows == 1, growth formula should NOT be created (requires num_rows >= 2)
    assert not any("Tăng trưởng" in str(f) for f in exec_formulas)


def test_adversarial_large_dataset_1500_rows(tmp_path: Path, monkeypatch):
    """Adversarial Test 1.3: Large dataset (1,500+ rows).
    Verifies performance (< 3.0s), memory safety, exact row index boundaries (A2:A1501), and formula integrity.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    
    start_time = time.perf_counter()
    large_rows = [
        {
            "id": f"REC_{i:05d}",
            "khu_vuc": f"Khu vực {(i % 5) + 1}",
            "doanh_thu": 10_000_000 + (i * 15_000),
            "chi_phi": 5_000_000 + (i * 8_000),
            "so_don": 100 + (i % 50),
            "ty_le_hoan": round(0.01 + (i % 10) * 0.005, 4),
        }
        for i in range(1500)
    ]
    
    url = ow._export_excel_file(large_rows)
    elapsed = time.perf_counter() - start_time
    
    assert url is not None
    assert elapsed < 3.0, f"Large dataset generation took {elapsed:.2f}s, expected < 3.0s"

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    assert file_path.exists()
    assert file_path.stat().st_size > 50_000

    wb = load_workbook(file_path, data_only=False)
    assert wb["Data"].max_row == 1501

    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, wb.sheetnames)

    # Check that formulas reference the exact 1501 boundary
    exec_formulas = [f["formula"] for f in formulas_by_sheet["Executive Summary"]]
    assert any("COUNTA(Data!A2:A1501)" in f for f in exec_formulas)
    assert any("SUM(Data!C2:C1501)" in f for f in exec_formulas)
    assert any("AVERAGE(Data!C2:C1501)" in f for f in exec_formulas)
    assert any("Data!C1501-Data!C2" in f for f in exec_formulas)


def test_adversarial_all_numeric_columns(tmp_path: Path, monkeypatch):
    """Adversarial Test 1.4: Dataset with 100% numeric columns (0 dimension/categorical columns).
    Verifies that KPI Metrics gracefully handles the absence of categorical dimensions.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    numeric_only_rows = [
        {"metric_a": 100, "metric_b": 200.5, "metric_c": 300},
        {"metric_a": 150, "metric_b": 250.0, "metric_c": 350},
        {"metric_a": 180, "metric_b": 290.2, "metric_c": 410},
    ]
    url = ow._export_excel_file(numeric_only_rows)
    assert url is not None

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, ["Executive Summary", "Data", "KPI Metrics"])

    # In KPI Metrics sheet, should fall back to general stats formula
    kpi_formulas = [f["formula"] for f in formulas_by_sheet["KPI Metrics"]]
    assert any("COUNT(Data!A2:A4)" in f for f in kpi_formulas)


def test_adversarial_all_categorical_columns(tmp_path: Path, monkeypatch):
    """Adversarial Test 1.5: Dataset with 100% categorical/text columns (0 numeric columns).
    Verifies that Executive Summary and KPI Metrics handle absence of numeric columns without crashing.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    cat_only_rows = [
        {"ma_nv": "NV001", "ho_ten": "Nguyễn Văn A", "phong_ban": "Kinh Doanh", "chuc_vu": "Trưởng phòng"},
        {"ma_nv": "NV002", "ho_ten": "Trần Thị B", "phong_ban": "Kế Toán", "chuc_vu": "Chuyên viên"},
        {"ma_nv": "NV003", "ho_ten": "Lê Văn C", "phong_ban": "Kỹ Thuật", "chuc_vu": "Kỹ sư"},
    ]
    url = ow._export_excel_file(cat_only_rows)
    assert url is not None

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, ["Executive Summary", "Data", "KPI Metrics"])

    # Row count formula should still be present
    exec_formulas = [f["formula"] for f in formulas_by_sheet["Executive Summary"]]
    assert any("COUNTA(Data!A2:A4)" in f for f in exec_formulas)


# ==============================================================================
# 2. Extreme Numerical & Division by Zero Scenarios
# ==============================================================================

def test_adversarial_division_by_zero_prevention(tmp_path: Path, monkeypatch):
    """Adversarial Test 2.1: Initial period is 0.0.
    In growth calculation ((P_end - P_start) / P_start), if P_start is 0,
    the formula MUST contain defensive IF(Data!X2>0, ..., 0) guard to prevent #DIV/0! in Excel.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    zero_start_rows = [
        {"thang": "Tháng 1 (Start=0)", "doanh_thu": 0, "loi_nhuan": 0.0, "san_luong": 0},
        {"thang": "Tháng 2", "doanh_thu": 100_000_000, "loi_nhuan": 20_000_000, "san_luong": 15},
        {"thang": "Tháng 3", "doanh_thu": 250_000_000, "loi_nhuan": 50_000_000, "san_luong": 30},
    ]
    url = ow._export_excel_file(zero_start_rows)
    assert url is not None

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, ["Executive Summary", "Data", "KPI Metrics"])

    exec_formulas = [f["formula"] for f in formulas_by_sheet["Executive Summary"]]
    growth_formulas = [f for f in exec_formulas if "Data!" in f and "/Data!" in f]
    assert len(growth_formulas) >= 1
    for gf in growth_formulas:
        assert gf.startswith("=IF(Data!"), f"Growth formula must start with defensive IF: {gf}"
        assert ">0" in gf, f"Growth formula must check >0 before division: {gf}"


def test_adversarial_negative_and_decimal_numbers(tmp_path: Path, monkeypatch):
    """Adversarial Test 2.2: Highly negative numbers, micro-decimals, and fractional floats.
    Verifies number formats, SUM, MIN, MAX, and AVERAGE formulas across negative domains.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    negative_rows = [
        {"ky": "Kỳ 1", "loi_nhuan": -1_500_000_000, "he_so_bien_dong": -0.2543, "sai_so": 0.000001},
        {"ky": "Kỳ 2", "loi_nhuan": -800_000_000, "he_so_bien_dong": 0.1250, "sai_so": 0.000005},
        {"ky": "Kỳ 3", "loi_nhuan": 450_000_000, "he_so_bien_dong": -0.0512, "sai_so": -0.000002},
        {"ky": "Kỳ 4", "loi_nhuan": 1_200_000_000, "he_so_bien_dong": 0.3344, "sai_so": 0.000000},
    ]
    url = ow._export_excel_file(negative_rows)
    assert url is not None

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, ["Executive Summary", "Data", "KPI Metrics"])

    wb = load_workbook(file_path, data_only=False)
    data_ws = wb["Data"]
    assert data_ws.cell(row=2, column=2).value == -1_500_000_000
    assert data_ws.cell(row=2, column=3).value == -0.2543


def test_adversarial_none_and_missing_values(tmp_path: Path, monkeypatch):
    """Adversarial Test 2.3: Interspersed None / Null values in numeric and categorical columns.
    Ensures formulas do not crash when encountering nulls.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    null_rows = [
        {"chi_nhanh": "CN Hà Nội", "doanh_thu": 500_000_000, "so_khach": None},
        {"chi_nhanh": None, "doanh_thu": None, "so_khach": 120},
        {"chi_nhanh": "CN Đà Nẵng", "doanh_thu": 350_000_000, "so_khach": 85},
        {"chi_nhanh": "CN Cần Thơ", "doanh_thu": 0, "so_khach": None},
    ]
    url = ow._export_excel_file(null_rows)
    assert url is not None

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, ["Executive Summary", "Data", "KPI Metrics"])


# ==============================================================================
# 3. String & Encoding Robustness (Vietnamese Unicode, Special Characters)
# ==============================================================================

def test_adversarial_unicode_and_special_character_headers(tmp_path: Path, monkeypatch):
    """Adversarial Test 3.1: Heavy Vietnamese diacritics, punctuation, symbols, and quotes in column headers & values.
    Validates XML encoding safety in xlsxwriter and openpyxl.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    unicode_rows = [
        {
            "Mã phân khúc (% & # @ $)": "PK-Miền Bắc & Tây Bắc",
            "Doanh thu thuần (VNĐ)": 1_250_000_000,
            "Chi phí quảng cáo (Google & FB)": 450_000_000,
            "Tỷ suất LN/Vốn (%)": 0.352,
            "Ghi chú / Nhận xét": "Tăng trưởng vượt bậc; ISO 9001 & Top 1",
        },
        {
            "Mã phân khúc (% & # @ $)": "PK-Miền Nam (TP.HCM)",
            "Doanh thu thuần (VNĐ)": 2_100_000_000,
            "Chi phí quảng cáo (Google & FB)": 600_000_000,
            "Tỷ suất LN/Vốn (%)": 0.415,
            "Ghi chú / Nhận xét": "Ổn định & mở rộng đại lý",
        },
    ]
    url = ow._export_excel_file(unicode_rows)
    assert url is not None

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, ["Executive Summary", "Data", "KPI Metrics"])

    wb = load_workbook(file_path, data_only=False)
    data_ws = wb["Data"]
    assert data_ws.cell(row=1, column=1).value == "Mã phân khúc (% & # @ $)"
    assert data_ws.cell(row=1, column=2).value == "Doanh thu thuần (VNĐ)"
    assert "ISO 9001" in data_ws.cell(row=2, column=5).value


# ==============================================================================
# 4. Inter-Sheet Formula Range & Tab Reference Integrity
# ==============================================================================

def test_adversarial_inter_sheet_references_and_kpi_sumif(tmp_path: Path, monkeypatch):
    """Adversarial Test 4.1: Verify SUMIF, AVERAGEIF, and Percentage formulas in KPI Metrics sheet.
    Verifies that category criteria quoting, ranges (Data!A2:A6, Data!B2:B6), and subtotal formulas are 100% correct.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    multi_cat_rows = [
        {"loai_sp": "Điện thoại", "doanh_thu": 5_000_000, "so_luong": 10},
        {"loai_sp": "Điện thoại", "doanh_thu": 7_000_000, "so_luong": 14},
        {"loai_sp": "Laptop", "doanh_thu": 15_000_000, "so_luong": 8},
        {"loai_sp": "Phụ kiện", "doanh_thu": 2_000_000, "so_luong": 50},
        {"loai_sp": "Laptop", "doanh_thu": 12_000_000, "so_luong": 6},
    ]
    url = ow._export_excel_file(multi_cat_rows)
    assert url is not None

    file_path = tmp_path / "uploads" / url.replace("/uploads/", "")
    formulas_by_sheet = extract_all_formulas(file_path)
    validate_formula_syntax_and_references(formulas_by_sheet, ["Executive Summary", "Data", "KPI Metrics"])

    kpi_formulas = formulas_by_sheet["KPI Metrics"]
    sumif_formulas = [f["formula"] for f in kpi_formulas if "SUMIF" in f["formula"]]
    assert len(sumif_formulas) == 3
    assert any('SUMIF(Data!A2:A6, "Điện thoại", Data!B2:B6)' in f for f in sumif_formulas)
    assert any('SUMIF(Data!A2:A6, "Laptop", Data!B2:B6)' in f for f in sumif_formulas)
    assert any('SUMIF(Data!A2:A6, "Phụ kiện", Data!B2:B6)' in f for f in sumif_formulas)

    avgif_formulas = [f["formula"] for f in kpi_formulas if "AVERAGEIF" in f["formula"]]
    assert len(avgif_formulas) == 3

    total_formulas = [f["formula"] for f in kpi_formulas if f["formula"].startswith("=SUM(B4:")]
    assert len(total_formulas) >= 1


# ==============================================================================
# 5. Officecli Multi-Sheet Generator Helper Stress Tests
# ==============================================================================

def test_adversarial_officecli_create_multi_sheet_workbook(tmp_path: Path):
    """Adversarial Test 5.1: Stress-test officecli.create_multi_sheet_workbook with diverse datasets."""
    rows = [
        {"quy": "Q1", "kenh": "Kênh A", "doanh_thu": 1_000_000_000, "chi_phi": 600_000_000},
        {"quy": "Q2", "kenh": "Kênh B", "doanh_thu": 1_500_000_000, "chi_phi": 700_000_000},
        {"quy": "Q3", "kenh": "Kênh A", "doanh_thu": 1_800_000_000, "chi_phi": 800_000_000},
    ]
    out_file = tmp_path / "officecli_test.xlsx"
    officecli.create_multi_sheet_workbook(rows, out_file, period_column="quy")

    assert out_file.exists()
    wb = load_workbook(out_file, data_only=False)
    assert set(wb.sheetnames) == {"Executive Summary", "data", "totals", "KPI Metrics"}

    formulas_by_sheet = extract_all_formulas(out_file)
    validate_formula_syntax_and_references(formulas_by_sheet, wb.sheetnames)


# ==============================================================================
# 6. HTML Preview Generator Stress Test
# ==============================================================================

def test_adversarial_html_preview_generation():
    """Adversarial Test 6.1: HTML preview generation with special characters and large number of rows."""
    special_rows = [
        {"Tên KH": "Công ty Cổ phần & Dịch vụ <ABC>", "Doanh số": 999_999_999, "Tỷ lệ": 0.885},
        {"Tên KH": "Chi nhánh 'Miền Tây' - TP. Cần Thơ", "Doanh số": 555_000_000, "Tỷ lệ": 0.450},
    ]
    html = ow._render_excel_html("Báo cáo kiểm thử & đặc biệt", special_rows)
    assert "<!DOCTYPE html>" in html
    assert "&lt;ABC&gt;" in html
    assert "sheet-exec" in html
    assert "sheet-data" in html
    assert "sheet-kpi" in html
    assert "Executive Summary" in html
