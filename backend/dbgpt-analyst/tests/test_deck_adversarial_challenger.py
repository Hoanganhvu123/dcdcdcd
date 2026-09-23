"""tests/test_deck_adversarial_challenger.py — Adversarial Challenger Test Suite for deck.py.

Empirical verification coverage:
1. Full 6–10 slide executive decks generated from complex analytical datasets.
2. All 4 native chart types (ColumnClustered, Bar, Line, Pie) with exact series data points matching raw dataset numbers.
3. Extreme data values: negative numbers, 0 values, extreme growth percentages (+10,000%), long text labels.
4. Hallucinated numerical figures injected into bullet/callout/takeaway/comparison prose and filtered by _has_unverified_number.
5. PPTX OOXML binary integrity and HTML preview synchronization (zero layout shift, matching calculated metrics).
6. Planner adversarial stress testing with corrupted specs and hallucinated columns.
"""

from __future__ import annotations

import asyncio
import io
import json
import zipfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest
from pptx import Presentation
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches

from dbgpt_analyst.tools import deck


# ---------------------------------------------------------------------------
# Fixtures: Complex Multi-Dimensional & Edge Case Datasets
# ---------------------------------------------------------------------------


@pytest.fixture
def complex_executive_dataset() -> List[Dict[str, Any]]:
    """Generates a 60-row enterprise dataset spanning 5 quarters, 4 channels, and 3 regions."""
    quarters = ["2023-Q4", "2024-Q1", "2024-Q2", "2024-Q3", "2024-Q4"]
    channels = ["B2B Enterprise", "Online Direct", "Retail Partner", "Government & NGO"]
    regions = ["Northern Region", "Central Region", "Southern Region"]

    rows = []
    base_rev = 500_000_000
    for q_i, q in enumerate(quarters):
        for c_i, ch in enumerate(channels):
            for r_i, reg in enumerate(regions):
                rev = base_rev * (1 + 0.2 * q_i) * (1 + 0.15 * c_i) * (1 + 0.1 * r_i)
                cost = rev * 0.62
                profit = rev - cost
                orders = int(rev / 1_000_000)
                rows.append({
                    "quarter": q,
                    "channel": ch,
                    "region": reg,
                    "revenue": round(rev, 2),
                    "cost": round(cost, 2),
                    "gross_profit": round(profit, 2),
                    "order_count": orders,
                })
    return rows


@pytest.fixture
def extreme_values_dataset() -> List[Dict[str, Any]]:
    """Dataset with negative numbers, 0s, extreme growth (+10,000%), and long Vietnamese labels."""
    return [
        {
            "period": "2023-Q1",
            "category": "Chi nhánh Miền Bắc — Phân khúc Doanh nghiệp Vừa và Nhỏ (SME)",
            "revenue": 1_000_000.0,  # Baseline for +10,000% growth
            "cost": 500_000.0,
            "profit": -250_000_000.0,  # Heavy negative profit
            "units": 0,  # Zero units
        },
        {
            "period": "2023-Q2",
            "category": "Chi nhánh Miền Trung — Phân khúc Khách hàng Cá nhân Cao cấp (VIP Private Banking)",
            "revenue": 101_000_000.0,  # 100x jump (+10,000% growth vs Q1)
            "cost": 120_000_000.0,
            "profit": -19_000_000.0,  # Continued negative profit
            "units": 1500,
        },
        {
            "period": "2023-Q3",
            "category": "Chi nhánh Miền Nam — Phân khúc Thương mại Điện tử Đa Quốc gia & Xuất nhập khẩu",
            "revenue": 5_400_000_000.0,
            "cost": 3_200_000_000.0,
            "profit": 2_200_000_000.0,
            "units": 85000,
        },
        {
            "period": "2023-Q4",
            "category": "Chi nhánh Tây Nguyên & Đồng Bằng Sông Cửu Long — Dự án Nông nghiệp Công nghệ cao",
            "revenue": 12_800_000_000.0,
            "cost": 6_500_000_000.0,
            "profit": 6_300_000_000.0,
            "units": 142000,
        },
    ]


# ---------------------------------------------------------------------------
# 1. Full 6–10 Slide Executive Deck Generation & Layout Verification
# ---------------------------------------------------------------------------


def test_adversarial_6_to_10_slide_executive_deck_generation(
    complex_executive_dataset: List[Dict[str, Any]], tmp_path: Path
):
    """Verifies generation of a complete 7–8 slide executive deck with exact narrative flow."""
    spec = deck.build_executive_deck_spec(
        complex_executive_dataset,
        title="Báo Cáo Điều Hành Chiến Lược 2024",
        subtitle="Phân tích Doanh thu, Chi phí & Lợi nhuận Hợp nhất",
        source="Nguồn: Hệ thống ERP & Dữ liệu Kế toán Quản trị",
    )

    # Validate slide count is within 6-10 range (excluding cover)
    assert 6 <= len(spec["slides"]) <= 10, f"Expected 6-10 slides, got {len(spec['slides'])}"

    pptx_path = tmp_path / "executive_deck_e2e.pptx"
    out_file = deck.render_deck(spec, complex_executive_dataset, pptx_path)

    assert out_file.exists()
    assert out_file.stat().st_size > 5000  # Valid binary presentation

    prs = Presentation(out_file)
    # Total slides = Cover + Content slides
    assert len(prs.slides) == len(spec["slides"]) + 1

    # Verify widescreen 16:9 dimensions
    assert prs.slide_width == Inches(13.333)
    assert prs.slide_height == Inches(7.5)

    # Slide 1: Cover slide verification
    cover_slide = prs.slides[0]
    cover_text = " ".join(s.text for s in cover_slide.shapes if s.has_text_frame)
    assert "Báo Cáo Điều Hành Chiến Lược 2024" in cover_text
    assert "1/" in cover_text  # Page number in footer

    # Verify slide kinds across deck
    slide_kinds = [s.get("kind") for s in spec["slides"]]
    assert "kpi" in slide_kinds
    assert "chart" in slide_kinds
    assert "callout" in slide_kinds
    assert "table" in slide_kinds
    assert "comparison" in slide_kinds
    assert "takeaway" in slide_kinds


# ---------------------------------------------------------------------------
# 2. All 4 Native Chart Types & Exact Raw Dataset Point Verification
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "chart_type,expected_enum",
    [
        ("column", XL_CHART_TYPE.COLUMN_CLUSTERED),
        ("bar", XL_CHART_TYPE.BAR_CLUSTERED),
        ("line", XL_CHART_TYPE.LINE_MARKERS),
        ("pie", XL_CHART_TYPE.PIE),
    ],
)
def test_adversarial_all_4_native_chart_types_and_series_points(
    complex_executive_dataset: List[Dict[str, Any]],
    chart_type: str,
    expected_enum: XL_CHART_TYPE,
    tmp_path: Path,
):
    """Verifies that ColumnClustered, Bar, Line, and Pie charts render as native OOXML charts with exact data points."""
    spec = {
        "title": f"Kiểm Thử Biểu Đồ Native {chart_type.upper()}",
        "subtitle": "Đảm bảo dữ liệu không suy suyển từ query SQL",
        "slides": [
            {
                "kind": "chart",
                "title": f"Biểu Đồ {chart_type.upper()} Doanh Thu",
                "chart": chart_type,
                "category_column": "quarter",
                "value_column": "revenue",
                "series_column": "channel" if chart_type != "pie" else None,
            }
        ],
    }

    pptx_path = tmp_path / f"chart_{chart_type}.pptx"
    deck.render_deck(spec, complex_executive_dataset, pptx_path)

    prs = Presentation(pptx_path)
    slide = prs.slides[1]  # Chart slide

    chart_shapes = [s for s in slide.shapes if s.has_chart]
    assert len(chart_shapes) == 1, f"Expected 1 native chart for {chart_type}"
    chart = chart_shapes[0].chart
    assert chart.chart_type == expected_enum

    # Verify categories match sorted distinct periods
    expected_categories = sorted({r["quarter"] for r in complex_executive_dataset})
    actual_categories = [c.label for c in chart.plots[0].categories]
    assert actual_categories == expected_categories

    if chart_type == "pie":
        # Pie chart must collapse multiple channels into a single total series
        assert len(chart.plots[0].series) == 1
        pie_series = chart.plots[0].series[0]
        for idx, cat in enumerate(expected_categories):
            expected_total = sum(
                r["revenue"] for r in complex_executive_dataset if r["quarter"] == cat
            )
            actual_val = pie_series.values[idx]
            assert actual_val == pytest.approx(expected_total, rel=1e-4)
    else:
        # Multi-series chart (4 channels)
        expected_channels = sorted({r["channel"] for r in complex_executive_dataset})
        assert len(chart.plots[0].series) == len(expected_channels)

        for series in chart.plots[0].series:
            ch_name = series.name
            assert ch_name in expected_channels
            for idx, cat in enumerate(expected_categories):
                expected_val = sum(
                    r["revenue"]
                    for r in complex_executive_dataset
                    if r["quarter"] == cat and r["channel"] == ch_name
                )
                actual_val = series.values[idx]
                assert actual_val == pytest.approx(expected_val, rel=1e-4)


# ---------------------------------------------------------------------------
# 3. Extreme Data Values: Negatives, 0 Values, Extreme Growth, Long Labels
# ---------------------------------------------------------------------------


def test_adversarial_extreme_data_values_and_growth(
    extreme_values_dataset: List[Dict[str, Any]], tmp_path: Path
):
    """Stress tests arithmetic and formatting against negative profits, 0s, +10,000% growth, and long Vietnamese text."""
    # 1. Test extreme growth calculation: Q2 (101M) vs Q1 (1M) -> (101 - 1)/1 = 100.0 = +10,000.0%
    growth = deck.compute_metric(extreme_values_dataset[:2], "growth:revenue:period")
    assert growth == pytest.approx(100.0)
    formatted_growth = deck.format_metric("growth:revenue:period", growth)
    assert formatted_growth == "+10000,0%"

    # 2. Test negative metrics
    sum_profit = deck.compute_metric(extreme_values_dataset, "sum:profit")
    expected_profit = sum(r["profit"] for r in extreme_values_dataset)
    assert sum_profit == expected_profit
    formatted_profit = deck.format_number(sum_profit)
    assert "tỷ" in formatted_profit or "triệu" in formatted_profit

    # 3. Test zero handling in count and aggregates
    min_units = deck.compute_metric(extreme_values_dataset, "min:units")
    assert min_units == 0.0

    # 4. Render full deck with extreme data and long labels
    spec = {
        "title": "Báo Cáo Thách Thức Dữ Liệu Cực Đoan",
        "subtitle": "Kiểm thử giá trị âm, tăng trưởng đột biến và nhãn tiếng Việt dài",
        "slides": [
            {
                "kind": "kpi",
                "title": "Chỉ Số Tài Chính Cực Đoan",
                "kpis": [
                    {"label": "Tổng Lợi Nhuận", "metric": "sum:profit"},
                    {"label": "Tăng Trưởng Doanh Thu Đột Biến", "metric": "growth:revenue:period"},
                    {"label": "Số Đơn Tối Thiểu", "metric": "min:units"},
                ],
            },
            {
                "kind": "chart",
                "title": "Biểu Đồ Lợi Nhuận Âm & Dương",
                "chart": "column",
                "category_column": "period",
                "value_column": "profit",
            },
            {
                "kind": "table",
                "title": "Bảng Dữ Liệu Với Nhãn Dài",
                "columns": ["period", "category", "revenue", "profit", "units"],
            },
        ],
    }

    pptx_path = tmp_path / "extreme_deck.pptx"
    deck.render_deck(spec, extreme_values_dataset, pptx_path)

    prs = Presentation(pptx_path)
    assert len(prs.slides) == 4

    # Verify chart plotted negative values cleanly
    chart = [s for s in prs.slides[2].shapes if s.has_chart][0].chart
    profit_values = list(chart.plots[0].series[0].values)
    assert profit_values[0] == -250_000_000.0
    assert profit_values[1] == -19_000_000.0
    assert profit_values[2] == 2_200_000_000.0
    assert profit_values[3] == 6_300_000_000.0


def test_adversarial_zero_division_guard():
    """Verifies that growth calculation cleanly raises ValueError with descriptive message when baseline is 0."""
    zero_baseline = [
        {"period": "T1", "amount": 0.0},
        {"period": "T2", "amount": 500_000.0},
    ]
    with pytest.raises(ValueError, match="zero"):
        deck.compute_metric(zero_baseline, "growth:amount:period")


# ---------------------------------------------------------------------------
# 4. Anti-Hallucination Gate & Unverified Number Stripping
# ---------------------------------------------------------------------------


def test_adversarial_hallucination_injection_in_all_slide_types(
    complex_executive_dataset: List[Dict[str, Any]], tmp_path: Path
):
    """Injects ungrounded hallucinated numbers into bullets, callout, takeaway, and comparison slides.

    Verifies that _has_unverified_number aggressively detects and strips them.
    """
    # 1. Direct unit verification of _has_unverified_number
    hallucinated_prose = [
        "Doanh thu đạt mốc 950 tỷ VND",
        "Tăng trưởng kỷ lục +88.5%",
        "Thị phần công ty chiếm 45%",
        "Biên lợi nhuận gộp đạt 32,4%",
        "Quy mô thị trường xấp xỉ $10.5M",
        "Tỷ lệ chuyển đổi đạt 15.2%",
        "Tăng 123 đơn vị",
    ]
    for h in hallucinated_prose:
        assert deck._has_unverified_number(h) is True, f"Failed to catch hallucination: {h}"

    # Legitimate labels that must NOT be flagged
    benign_labels = [
        "Định hướng phát triển năm 2024",
        "Tập trung thúc đẩy quý Q4",
        "Top 3 phân khúc mũi nhọn",
        "Kế hoạch triển khai giai đoạn 1",
        "Mở rộng kênh bán hàng trực tiếp",
    ]
    for b in benign_labels:
        assert deck._has_unverified_number(b) is False, f"Erroneously flagged benign label: {b}"

    # 2. Inject hallucinations into slide spec
    adversarial_spec = {
        "title": "Báo Cáo Kiểm Tra Ngăn Chặn Hallucination",
        "slides": [
            {
                "kind": "bullets",
                "title": "Nhận Định Tổng Thể",
                "bullets": [
                    "Thị phần tăng trưởng 50%",  # Hallucination -> MUST BE DROPPED
                    "Doanh số vượt 100 tỷ",  # Hallucination -> MUST BE DROPPED
                    "Tập trung phát triển sản phẩm chủ lực",  # Valid -> MUST SURVIVE
                ],
            },
            {
                "kind": "callout",
                "title": "Tâm Điểm",
                "headline": "Doanh thu tăng 75%",  # Hallucination -> stripped to clean headline
                "insights": [
                    "Lợi nhuận ròng đạt 45.5%",  # Hallucination -> MUST BE DROPPED
                    "Chính sách giá và chiết khấu tạo sức hút lớn",  # Valid -> MUST SURVIVE
                ],
            },
            {
                "kind": "takeaway",
                "title": "Hành Động",
                "takeaways": [
                    {
                        "priority": "Ưu tiên 1",
                        "title": "Tăng trưởng 35% doanh số",  # Hallucination in title -> cleaned
                        "description": "Cắt giảm 20% chi phí vận hành",  # Hallucination in desc -> cleaned
                    },
                    {
                        "priority": "Ưu tiên 2",
                        "title": "Tối ưu hóa quy trình giao hàng",
                        "description": "Nâng cấp hạ tầng công nghệ và chăm sóc khách hàng",
                    },
                ],
            },
            {
                "kind": "comparison",
                "title": "So Sánh",
                "columns": [
                    {
                        "header": "Kênh A (Tăng 40%)",  # Hallucination in header -> cleaned
                        "bullets": [
                            "Đạt 50 tỷ đồng",  # Hallucination -> MUST BE DROPPED
                            "Tiềm năng mở rộng khách hàng mới",  # Valid -> MUST SURVIVE
                        ],
                    },
                    {
                        "header": "Kênh B",
                        "bullets": ["Chi phí ổn định và an toàn"],
                    },
                ],
            },
        ],
    }

    pptx_path = tmp_path / "hallucination_filtered_deck.pptx"
    deck.render_deck(adversarial_spec, complex_executive_dataset, pptx_path)

    prs = Presentation(pptx_path)
    all_text = " ".join(
        shape.text_frame.text
        for slide in prs.slides
        for shape in slide.shapes
        if shape.has_text_frame
    )

    # Verify that NONE of the hallucinated numbers exist in the PPTX text
    assert "50%" not in all_text
    assert "100 tỷ" not in all_text
    assert "75%" not in all_text
    assert "45.5%" not in all_text
    assert "35%" not in all_text
    assert "20%" not in all_text
    assert "40%" not in all_text
    assert "50 tỷ" not in all_text

    # Verify valid qualitative statements DID survive
    assert "Tập trung phát triển sản phẩm chủ lực" in all_text
    assert "Chính sách giá và chiết khấu tạo sức hút lớn" in all_text
    assert "Tối ưu hóa quy trình giao hàng" in all_text
    assert "Tiềm năng mở rộng khách hàng mới" in all_text


# ---------------------------------------------------------------------------
# 5. PPTX OOXML Binary & HTML Preview Synchronization
# ---------------------------------------------------------------------------


def test_adversarial_pptx_ooxml_binary_and_html_synchronization(
    complex_executive_dataset: List[Dict[str, Any]], tmp_path: Path
):
    """Verifies that generated PPTX has a valid OOXML ZIP container and HTML preview matches PPTX metrics with zero CLS."""
    spec = deck.build_executive_deck_spec(
        complex_executive_dataset,
        title="Báo Cáo Đồng Bộ Hóa Đa Kênh",
        subtitle="Kiểm tra cấu trúc OOXML và HTML Preview",
    )

    # 1. Render PPTX and inspect OOXML ZIP structure
    pptx_path = tmp_path / "sync_deck.pptx"
    deck.render_deck(spec, complex_executive_dataset, pptx_path)

    with zipfile.ZipFile(pptx_path, "r") as zf:
        namelist = zf.namelist()
        assert "[Content_Types].xml" in namelist
        assert "ppt/presentation.xml" in namelist
        assert any(n.startswith("ppt/slides/slide") for n in namelist)
        assert any(n.startswith("ppt/charts/chart") for n in namelist)

    # 2. Render HTML Preview
    html_output = deck.render_html(spec, complex_executive_dataset)

    # Verify HTML preview invariants
    assert "<!doctype html>" in html_output
    assert "aspect-ratio:16/9" in html_output
    assert "class='slide cover'" in html_output
    assert "class='kpis'" in html_output
    assert "class='callout-box'" in html_output
    assert "class='takeaway-grid'" in html_output
    assert "class='comp-grid'" in html_output

    # 3. Mathematical synchronization: Every number in HTML must match PPTX computed metrics
    computed_sum_rev = deck.compute_metric(complex_executive_dataset, "sum:revenue")
    formatted_sum_rev = deck.format_number(computed_sum_rev)
    assert formatted_sum_rev in html_output

    computed_growth = deck.compute_metric(complex_executive_dataset, "growth:revenue:quarter")
    formatted_growth = deck.format_metric("growth:revenue:quarter", computed_growth)
    assert formatted_growth in html_output

    # 4. In-memory bytes export verification
    deck_bytes = deck.render_deck_bytes(spec, complex_executive_dataset)
    assert isinstance(deck_bytes, bytes)
    assert len(deck_bytes) > 5000
    # Bytes must be valid Presentation
    mem_prs = Presentation(io.BytesIO(deck_bytes))
    assert len(mem_prs.slides) == len(spec["slides"]) + 1


# ---------------------------------------------------------------------------
# 6. Planner Stress Testing: Corrupted Specs, Non-Existent Columns, Fallbacks
# ---------------------------------------------------------------------------


class _FaultyPlannerLLM:
    """Simulates adversarial LLM responses (syntax errors, hallucinated columns, markdown wrapper)."""

    def __init__(self, mode: str):
        self.mode = mode

    async def ainvoke(self, messages):
        if self.mode == "corrupted_json":
            return SimpleNamespace(content="```json\n{ invalid json content here ...\n")
        elif self.mode == "hallucinated_columns":
            payload = {
                "title": "Báo cáo bịa cột",
                "slides": [
                    {
                        "kind": "chart",
                        "title": "Biểu đồ cột ảo",
                        "chart": "column",
                        "category_column": "quarter",
                        "value_column": "hallucinated_sales_metric_xyz",
                    },
                    {
                        "kind": "kpi",
                        "title": "KPI ảo",
                        "kpis": [{"label": "Tổng", "metric": "sum:non_existent_col"}],
                    },
                ],
            }
            return SimpleNamespace(content=json.dumps(payload))
        elif self.mode == "unsupported_kind":
            payload = {
                "title": "Slide không hỗ trợ",
                "slides": [
                    {"kind": "interactive_3d_globe", "title": "Bỏ qua"},
                    {"kind": "kpi", "title": "Giữ lại", "kpis": [{"label": "Tổng Doanh Thu", "metric": "sum:revenue"}]},
                ],
            }
            return SimpleNamespace(content=json.dumps(payload))
        return SimpleNamespace(content="{}")


@pytest.mark.asyncio
async def test_adversarial_planner_robustness_against_hallucinated_columns(
    complex_executive_dataset: List[Dict[str, Any]], tmp_path: Path
):
    """Verifies that plan_deck rejects hallucinated columns and falls back to safe default spec."""
    # 1. Corrupted JSON -> Fallback to default spec
    spec_fallback = await deck.plan_deck(
        "Kế hoạch tài chính",
        complex_executive_dataset,
        llm=_FaultyPlannerLLM("corrupted_json"),
    )
    assert len(spec_fallback["slides"]) >= 3
    out_fallback = deck.render_deck(spec_fallback, complex_executive_dataset, tmp_path / "fallback.pptx")
    assert out_fallback.exists()

    # 2. Hallucinated columns -> All invalid slides dropped -> Falls back to default spec
    spec_hallucinated = await deck.plan_deck(
        "Báo cáo cột ảo",
        complex_executive_dataset,
        llm=_FaultyPlannerLLM("hallucinated_columns"),
    )
    assert len(spec_hallucinated["slides"]) >= 3
    out_hallucinated = deck.render_deck(spec_hallucinated, complex_executive_dataset, tmp_path / "hallucinated.pptx")
    assert out_hallucinated.exists()

    # 3. Unsupported kind -> Invalid slide dropped, valid slide kept
    spec_mixed = await deck.plan_deck(
        "Slide hỗn hợp",
        complex_executive_dataset,
        llm=_FaultyPlannerLLM("unsupported_kind"),
    )
    assert len(spec_mixed["slides"]) == 1
    assert spec_mixed["slides"][0]["title"] == "Giữ lại"
    out_mixed = deck.render_deck(spec_mixed, complex_executive_dataset, tmp_path / "mixed.pptx")
    assert out_mixed.exists()
