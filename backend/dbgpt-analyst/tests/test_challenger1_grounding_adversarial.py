# test_challenger1_grounding_adversarial.py — Empirical Challenger 1 Adversarial Suite.
import io
from pathlib import Path
import pytest
from docx import Document
from openpyxl import load_workbook
from pptx import Presentation
from pptx.enum.chart import XL_CHART_TYPE
from langchain_core.messages import AIMessage, HumanMessage

from dbgpt_analyst.tools import deck, officecli
from dbgpt_analyst.tools.deck import (
    _has_unverified_number,
    compute_metric,
    format_metric,
    format_number,
    render_deck,
    render_deck_bytes,
    render_html,
)
from dbgpt_analyst.middleware.verification_gate import (
    VerificationGateMiddleware,
    _extract_ground_truth_values,
    _is_benign_label,
    _parse_number_value,
    inject_grounded_facts,
    strip_ungrounded_claims,
    verify_numerical_claims,
)
from dbgpt_analyst.subgraphs.modes.docx_generator import html_to_docx
from dbgpt_analyst.subgraphs.modes.office_writer_subgraph import (
    _grounded_facts,
    _strip_unverified_lines,
    _facts_section,
)


class TestGroundingVerificationGateAdversarial:
    """Empirical challenge tests for VerificationGateMiddleware & numerical verification."""

    def test_subtle_hallucinated_percentages(self):
        """Subtle percentage shifts outside 2% tolerance must be intercepted."""
        gt_rows = [
            {"segment": "A", "revenue": 500},
            {"segment": "B", "revenue": 500},
        ]
        # 50.5% is within 2% tolerance of 50.0% (1% relative error <= 2%)
        valid_prose = "Phan khuc A chiem 50.5% tong doanh thu."
        is_valid, ungrounded = verify_numerical_claims(valid_prose, gt_rows, tolerance=0.02)
        assert is_valid, f"50.5% within 2% tolerance, got {ungrounded}"

        # 52.3% is outside 2% tolerance (4.6% relative error > 2%) -> MUST BE FLAGGED
        hallucinated_prose = "Phan khuc A chiem 52.3% tong doanh thu."
        is_valid, ungrounded = verify_numerical_claims(hallucinated_prose, gt_rows, tolerance=0.02)
        assert not is_valid, "52.3% must be flagged as ungrounded!"
        assert any("52.3%" in u for u in ungrounded)

    def test_fake_currency_and_multiplier_parsing(self):
        """Tests varied currency symbols, abbreviations, and units."""
        # 12.85 ty -> 1.285e10
        val, is_pct = _parse_number_value("12.85 ty")
        assert val == 12.85 * 1e9 and not is_pct
        
        # $500M -> 5e8
        val, is_pct = _parse_number_value("$500M")
        assert val == 500 * 1e6 and not is_pct

        # ₫450.000 -> 450000.0
        val, is_pct = _parse_number_value("₫450.000")
        assert val == 450000.0 and not is_pct

        # 450.000 VND -> 450000.0
        val, is_pct = _parse_number_value("450.000 VND")
        assert val == 450000.0 and not is_pct

        # 450.000 dong -> 450000.0
        val, is_pct = _parse_number_value("450.000 dong")
        assert val == 450000.0 and not is_pct

        # 50k -> 50000.0
        val, is_pct = _parse_number_value("50k")
        assert val == 50000.0 and not is_pct

        # -15.5% -> -15.5, is_pct=True
        val, is_pct = _parse_number_value("-15.5%")
        assert val == -15.5 and is_pct

        gt_rows = [{"doanh_thu": 12_850_000_000, "loi_nhuan": 450_000}]
        is_valid, ungrounded = verify_numerical_claims("Tong doanh thu dat 12.85 ty dong", gt_rows)
        assert is_valid, f"12.85 ty should match 12_850_000_000, got {ungrounded}"

        is_valid, ungrounded = verify_numerical_claims("Doanh thu 99 ty dong va loi nhuan $500M", gt_rows)
        assert not is_valid
        assert len(ungrounded) >= 2

    def test_zero_division_resilience(self):
        """Zero sums or zero denominators in rows must not cause crash or inf/nan values."""
        zero_rows = [
            {"quy": "Q1", "revenue": 0, "cost": 0},
            {"quy": "Q2", "revenue": 0, "cost": 0},
        ]
        gt_vals = _extract_ground_truth_values(zero_rows)
        assert isinstance(gt_vals, set)
        for v in gt_vals:
            assert v == v, "NaN detected in gt_vals!"
            assert v != float("inf") and v != float("-inf"), "Inf detected in gt_vals!"

        is_valid, ungrounded = verify_numerical_claims("Tong doanh thu la 0 dong.", zero_rows)
        assert is_valid

    def test_missing_sql_columns_and_empty_query_results(self):
        """Empty or malformed query results handled safely."""
        # Empty list
        is_valid, ungrounded = verify_numerical_claims("Doanh thu dat 500 trieu", [])
        assert not is_valid
        assert len(ungrounded) == 1

        # None query results
        is_valid, ungrounded = verify_numerical_claims("Doanh thu dat 500 trieu", None)
        assert not is_valid
        assert len(ungrounded) == 1

        # Text with no numbers and empty query results
        is_valid, ungrounded = verify_numerical_claims("Tinh hinh kinh doanh kha quan.", [])
        assert is_valid

    def test_benign_label_preservation_under_adversarial_text(self):
        """Labels like years, quarters, top-k, steps, and identifiers are never stripped."""
        gt_rows = [{"sales": 1000}]
        text_with_labels = (
            "Theo ke hoach nam 2025 tai Quy 4, chien luoc Top 3 thuong hieu "
            "se hoan thanh o Buoc 2 cho ma don `order_101` voi id: 509."
        )
        is_valid, ungrounded = verify_numerical_claims(text_with_labels, gt_rows)
        assert is_valid, f"Benign labels falsely flagged: {ungrounded}"

    def test_middleware_sanitize_mode_action(self):
        """VerificationGateMiddleware(mode='sanitize') strips ungrounded lines & appends GT facts."""
        mw = VerificationGateMiddleware(mode="sanitize")
        gt_rows = [
            {"kenh": "Online", "doanh_thu": 1000},
            {"kenh": "Offline", "doanh_thu": 2000},
        ]
        state = {
            "messages": [
                AIMessage(
                    content=(
                        "Bao cao tong ket:\n"
                        "- Kenh Online ghi nhan 1000 dong.\n"
                        "- Kenh Offline ghi nhan 999999 dong bia dat.\n"
                        "- Chien luoc nam 2025 rat kha quan."
                    )
                )
            ],
            "query_results": gt_rows,
        }
        res = mw.after_agent(state)
        assert res is not None and "messages" in res
        sanitized_msg = res["messages"][0].content
        assert "1000" in sanitized_msg
        assert "999999" not in sanitized_msg
        assert "2025" in sanitized_msg
        assert "Ground Truth" in sanitized_msg

    def test_middleware_warn_and_strict_modes(self):
        """Test warn and strict feedback modes."""
        gt_rows = [{"val": 100}]
        hallucinated_state = {
            "messages": [AIMessage(content="So lieu bia: 7777777")],
            "query_results": gt_rows,
        }
        # Warn mode
        warn_mw = VerificationGateMiddleware(mode="warn")
        warn_res = warn_mw.after_agent(hallucinated_state)
        assert "[VERIFICATION WARNING]" in warn_res["messages"][0].content
        assert "7777777" in warn_res["messages"][0].content

        # Strict mode
        strict_mw = VerificationGateMiddleware(mode="strict")
        strict_res = strict_mw.after_agent(hallucinated_state)
        assert isinstance(strict_res["messages"][0], HumanMessage)
        assert "VERIFICATION GATE FAILED" in strict_res["messages"][0].content

    def test_circuit_breaker_passthrough(self):
        """VerificationGateMiddleware must not overwrite circuit breaker abort messages."""
        mw = VerificationGateMiddleware(mode="sanitize")
        gt_rows = [{"sales": 100}]
        state = {
            "messages": [
                AIMessage(content="_CIRCUIT_BREAKER_TRIGGERED_: Halting due to recursive loop.")
            ],
            "query_results": gt_rows,
        }
        res = mw.after_agent(state)
        assert res is None, "Must pass through without modifying circuit breaker state"


class TestBulletGuardAdversarial:
    """Tests Bullet Guard (_has_unverified_number) in deck.py and office_writer."""

    def test_bullet_drop_with_numbers(self):
        """Any bullet with percentage or >=2 digits must be flagged as unverified measurement."""
        assert _has_unverified_number("Tang truong 15% trong quy")
        assert _has_unverified_number("Dat 50 khach hang moi")
        assert _has_unverified_number("Doanh thu 12.85 ty dong")
        assert _has_unverified_number("Tong so 100 don hang")

    def test_bullet_keep_benign_labels(self):
        """Single digit labels and valid 4-digit years must NOT be dropped."""
        assert not _has_unverified_number("Uu tien so 1 trong nam")
        assert not _has_unverified_number("Ke hoach trien khai nam 2025")
        assert not _has_unverified_number("Dinh huong tang truong ben vung")

    def test_strip_unverified_lines_in_office_writer(self):
        """Verifies _strip_unverified_lines in office_writer_subgraph cleanly filters text."""
        markdown = (
            "# Tieu de bao cao\n"
            "Kenh phan phoi mo rong on dinh nam 2025.\n"
            "Doanh so dat 987654321 dong ky luc.\n"
            "Doi ngu nhan su hoan thanh muc tieu 1."
        )
        stripped = _strip_unverified_lines(markdown)
        assert "987654321" not in stripped
        assert "2025" in stripped
        assert "muc tieu 1" in stripped


class TestOfficeArtifactsAdversarialIntegrity:
    """Tests structural resilience of PPTX, XLSX, and DOCX generation under edge cases."""

    def test_pptx_chart_extreme_inputs(self, tmp_path):
        """PPTX chart rendering with negative values, extreme magnitude, and single rows."""
        extreme_rows = [
            {"quy": "Q1", "kenh": "Online", "doanh_thu": -500_000_000},
            {"quy": "Q2", "kenh": "Online", "doanh_thu": 1_000_000_000_000},
            {"quy": "Q3", "kenh": "Online", "doanh_thu": 0},
        ]
        spec = {
            "title": "Extreme Chart Test",
            "slides": [
                {
                    "kind": "chart",
                    "title": "Bieu Do Doanh Thu Cuc Tri",
                    "chart": "column",
                    "category_column": "quy",
                    "value_column": "doanh_thu",
                    "series_column": "kenh",
                },
                {
                    "kind": "table",
                    "title": "Bang Du Lieu Khuyet",
                    "columns": ["quy", "kenh", "doanh_thu"],
                }
            ]
        }
        out_file = tmp_path / "extreme_test.pptx"
        render_deck(spec, extreme_rows, out_file)
        assert out_file.exists()
        assert out_file.stat().st_size > 0

        prs = Presentation(str(out_file))
        assert len(prs.slides) == 3
        chart_slide = prs.slides[1]
        assert len(chart_slide.shapes) >= 2

    def test_pptx_missing_columns_raise_error(self):
        """Missing category/value column must raise ValueError instead of corrupted deck."""
        rows = [{"col_a": 1, "col_b": 2}]
        bad_spec = {
            "title": "Bad Spec",
            "slides": [
                {
                    "kind": "chart",
                    "title": "Missing Col",
                    "category_column": "non_existent_category",
                    "value_column": "col_b",
                }
            ]
        }
        with pytest.raises(ValueError, match="unknown column 'non_existent_category'"):
            render_deck_bytes(bad_spec, rows)

    def test_xlsx_workbook_edge_cases(self, tmp_path):
        """Tests officecli._write_workbook with 0-division in growth, all zeros, and single row."""
        rows = [
            {"quy": "Q1", "sales": 0, "orders": 10},
            {"quy": "Q2", "sales": 0, "orders": 20},
        ]
        xlsx_path = tmp_path / "zero_growth.xlsx"
        officecli._write_workbook(rows, xlsx_path, period_column="quy")
        assert xlsx_path.exists()

        wb = load_workbook(xlsx_path)
        assert "data" in wb.sheetnames
        assert "totals" in wb.sheetnames
        totals_sheet = wb["totals"]
        totals_dict = {row[0]: row[1] for row in totals_sheet.iter_rows(values_only=True) if row[0]}
        assert totals_dict.get("sum_sales") == 0
        assert totals_dict.get("sum_orders") == 30
        assert totals_dict.get("row_count") == 2

    def test_docx_html_to_docx_adversarial(self):
        """Tests docx generator with malformed HTML, missing tags, and special characters."""
        malformed_html = """
        <html>
        <head><meta name="theme" content="cobalt"></head>
        <body>
            <h1>Bao Cao Phan Tich &lt;Adversarial&gt;</h1>
            <p>Doan van chua ky tu dac biet: &amp;, &quot;, &lt;, &gt;, ₫, €</p>
            <table>
                <tr><th>Cot 1<th>Cot 2
                <tr><td>Gia tri 1<td>Gia tri 2
                <tr><td>Dong thieu o
            </table>
            <div><p>Paragraph long nhau</div></p>
        </body>
        </html>
        """
        docx_bytes = html_to_docx(malformed_html, title="Adversarial Test Report")
        assert isinstance(docx_bytes, bytes)
        assert len(docx_bytes) > 0
        doc = Document(io.BytesIO(docx_bytes))
        assert len(doc.paragraphs) >= 1
        assert any("Adversarial" in p.text for p in doc.paragraphs)
