"""tests/test_verification_gate.py — Comprehensive Test Suite for Supervisor Verification Gate (Task F - R2).

Verifies:
1. Ground truth fact extraction (row values, counts, sums, averages, proportions, growth).
2. Verification of grounded numerical claims in generated prose.
3. Detection and isolation of hallucinated/ungrounded figures.
4. Benign label filtering (years 1900-2099, dates, Q1-Q4, months, top-K, rankings, schema identifiers).
5. Vietnamese currency notation and formatting variations (tỷ, triệu, nghìn, k, comma/dot separators).
6. Sanitization via strip_ungrounded_claims and inject_grounded_facts.
7. VerificationGateMiddleware execution across sanitize, warn, and strict modes.
8. Middleware coexistence with SandboxCircuitBreaker.
"""

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from dbgpt_analyst.middleware.verification_gate import (
    VerificationGateMiddleware,
    _extract_ground_truth_values,
    _is_benign_label,
    _parse_number_value,
    inject_grounded_facts,
    strip_ungrounded_claims,
    verify_numerical_claims,
)

SAMPLE_QUERY_RESULTS = [
    {"region": "North", "quarter": "Q1", "revenue": 1_250_000_000, "orders": 3120},
    {"region": "South", "quarter": "Q1", "revenue": 890_000_000, "orders": 1450},
    {"region": "North", "quarter": "Q2", "revenue": 2_140_000_000, "orders": 5210},
]


def test_extract_ground_truth_values():
    """Verify ground truth extraction includes raw rows and summary statistics."""
    gt = _extract_ground_truth_values(SAMPLE_QUERY_RESULTS)

    # Row count
    assert 3.0 in gt

    # Raw values
    assert 1_250_000_000.0 in gt
    assert 890_000_000.0 in gt
    assert 2_140_000_000.0 in gt
    assert 3120.0 in gt
    assert 1450.0 in gt
    assert 5210.0 in gt

    # Sums
    expected_sum_rev = 1_250_000_000 + 890_000_000 + 2_140_000_000
    assert expected_sum_rev in gt
    expected_sum_orders = 3120 + 1450 + 5210
    assert expected_sum_orders in gt

    # Averages
    assert (expected_sum_rev / 3) in gt
    assert (expected_sum_orders / 3) in gt


def test_parse_number_value_variations():
    """Verify parser handles Vietnamese currency abbreviations, signs, and separators."""
    # Vietnamese billion
    val, is_pct = _parse_number_value("12,85 tỷ")
    assert val == 12_850_000_000.0
    assert is_pct is False

    # Millions
    val, is_pct = _parse_number_value("350 triệu")
    assert val == 350_000_000.0
    assert is_pct is False

    # Thousands
    val, is_pct = _parse_number_value("1,2 nghìn")
    assert val == 1200.0
    assert is_pct is False

    # Percentages with signs
    val, is_pct = _parse_number_value("+36,9%")
    assert pytest.approx(val, 0.01) == 36.9
    assert is_pct is True

    val, is_pct = _parse_number_value("-12.5%")
    assert pytest.approx(val, 0.01) == -12.5
    assert is_pct is True

    # Thousands separators
    val, _ = _parse_number_value("27.543")
    assert val == 27543.0

    val, _ = _parse_number_value("1.250.000.000")
    assert val == 1_250_000_000.0


def test_verify_numerical_claims_grounded_passes():
    """Verify valid prose with real numbers passes verification."""
    text = (
        "Báo cáo doanh thu năm 2025:\n"
        "- Doanh thu miền Bắc Q1 đạt 1.250.000.000 đồng với 3.120 đơn hàng.\n"
        "- Doanh thu miền Nam Q1 đạt 890.000.000 đồng.\n"
        "- Tổng cộng có 3 bản ghi dữ liệu."
    )
    is_valid, ungrounded = verify_numerical_claims(text, SAMPLE_QUERY_RESULTS)
    assert is_valid is True
    assert ungrounded == []


def test_verify_numerical_claims_vietnamese_billion_and_million():
    """Verify numbers with Vietnamese abbreviations (tỷ, triệu) match ground truth."""
    text = (
        "- Doanh thu miền Bắc Q2 đạt 2,14 tỷ đồng.\n"
        "- Doanh thu miền Nam đạt 890 triệu đồng."
    )
    is_valid, ungrounded = verify_numerical_claims(text, SAMPLE_QUERY_RESULTS)
    assert is_valid is True
    assert ungrounded == []


def test_verify_numerical_claims_growth_percentage():
    """Verify growth rate calculation between periods matches."""
    # First revenue 1_250_000_000, last revenue 2_140_000_000 -> growth = (2140 - 1250) / 1250 = 0.712 (71.2%)
    text = "Tăng trưởng doanh thu đạt +71,2% giữa các kỳ."
    is_valid, ungrounded = verify_numerical_claims(text, SAMPLE_QUERY_RESULTS)
    assert is_valid is True
    assert ungrounded == []


def test_verify_numerical_claims_rounding_tolerance():
    """Verify numbers within 2% relative tolerance pass."""
    # Raw value is 890_000_000 (890 triệu) -> 891 triệu is within 0.11%
    text = "Doanh thu miền Nam xấp xỉ 891 triệu đồng."
    is_valid, ungrounded = verify_numerical_claims(text, SAMPLE_QUERY_RESULTS, tolerance=0.02)
    assert is_valid is True
    assert ungrounded == []


def test_verify_numerical_claims_detects_hallucinations():
    """Verify hallucinated numbers are detected and isolated."""
    text = (
        "- Doanh thu miền Bắc đạt 1.250.000.000 đồng.\n"
        "- Tăng trưởng bất ngờ đạt 999.888.777 đồng vào cuối quý.\n"
        "- Biên lợi nhuận ước tính 88,8%."
    )
    is_valid, ungrounded = verify_numerical_claims(text, SAMPLE_QUERY_RESULTS)
    assert is_valid is False
    assert any("999.888.777" in u for u in ungrounded)
    assert any("88,8%" in u for u in ungrounded)


def test_verify_numerical_claims_ignores_labels_and_dates():
    """Verify years (2024-2026), ISO dates, quarters, months, and rankings are ignored."""
    text = (
        "# Kế hoạch kinh doanh 2026\n"
        "Tính đến ngày 2026-08-20 và 01/12/2024:\n"
        "Trong Q1 và Tháng 12, Top 3 ngành hàng dẫn đầu tăng trưởng.\n"
        "Hạng 1 thuộc về nhóm thiết bị.\n"
        "Bước 1: Tối ưu kênh phân phối.\n"
        "Dữ liệu từ bảng `mock_don_hang` với id_102."
    )
    is_valid, ungrounded = verify_numerical_claims(text, SAMPLE_QUERY_RESULTS)
    assert is_valid is True
    assert ungrounded == []


def test_verify_numerical_claims_empty_query_results():
    """Verify empty query_results allows qualitative text but blocks fabricated numbers."""
    # Pure qualitative prose passes
    qualitative_text = "Không tìm thấy dữ liệu phù hợp với điều kiện tìm kiếm."
    is_valid, ungrounded = verify_numerical_claims(qualitative_text, [])
    assert is_valid is True
    assert ungrounded == []

    # Fabricated metric with empty results fails
    quantitative_text = "Tổng doanh thu đạt 500 triệu đồng."
    is_valid, ungrounded = verify_numerical_claims(quantitative_text, [])
    assert is_valid is False
    assert "500 triệu" in ungrounded


def test_strip_ungrounded_claims():
    """Verify hallucinated lines are dropped while grounded lines and headers remain."""
    text = (
        "# Báo cáo tổng kết 2025\n"
        "Thị trường bán lẻ tiếp tục khởi sắc.\n"
        "Doanh thu đạt mức kỷ lục 99999999999 đồng.\n"
        "Miền Bắc ghi nhận 3.120 đơn hàng trong kỳ."
    )
    cleaned = strip_ungrounded_claims(text, SAMPLE_QUERY_RESULTS)
    assert "99999999999" not in cleaned
    assert "# Báo cáo tổng kết 2025" in cleaned
    assert "Thị trường bán lẻ tiếp tục khởi sắc." in cleaned
    assert "Miền Bắc ghi nhận 3.120 đơn hàng trong kỳ." in cleaned


def test_inject_grounded_facts():
    """Verify inject_grounded_facts appends verified metrics section."""
    text = "Báo cáo doanh thu tổng quan."
    res = inject_grounded_facts(text, SAMPLE_QUERY_RESULTS)
    assert "## Số liệu đã xác thực từ cơ sở dữ liệu (Ground Truth)" in res
    assert "Tổng revenue" in res
    assert "Trung bình orders" in res
    assert "**Tổng số bản ghi (row_count)**: 3" in res


def test_verification_gate_middleware_sanitize_mode():
    """Verify middleware in sanitize mode strips ungrounded claims and injects verified facts."""
    middleware = VerificationGateMiddleware(mode="sanitize")

    state = {
        "query_results": SAMPLE_QUERY_RESULTS,
        "messages": [
            HumanMessage(content="Tổng hợp kết quả"),
            AIMessage(
                content=(
                    "# Tổng hợp\n"
                    "Doanh thu bịa đặt 555555555 đồng.\n"
                    "Miền Nam đạt 890.000.000 đồng."
                )
            ),
        ],
    }

    res = middleware.after_agent(state)
    assert res is not None
    assert "messages" in res
    final_msg = res["messages"][0]
    assert "555555555" not in final_msg.content
    assert "890.000.000" in final_msg.content
    assert "## Số liệu đã xác thực từ cơ sở dữ liệu (Ground Truth)" in final_msg.content


def test_verification_gate_middleware_warn_mode():
    """Verify middleware in warn mode appends warning message."""
    middleware = VerificationGateMiddleware(mode="warn")

    state = {
        "query_results": SAMPLE_QUERY_RESULTS,
        "messages": [
            AIMessage(content="Doanh thu dự báo 777777777 đồng."),
        ],
    }

    res = middleware.after_agent(state)
    assert res is not None
    assert "[VERIFICATION WARNING]" in res["messages"][0].content
    assert "777777777" in res["messages"][0].content


def test_verification_gate_middleware_strict_mode():
    """Verify middleware in strict mode returns corrective feedback."""
    middleware = VerificationGateMiddleware(mode="strict")

    state = {
        "query_results": SAMPLE_QUERY_RESULTS,
        "messages": [
            AIMessage(content="Doanh thu bịa 999999999 đồng."),
        ],
    }

    res = middleware.after_agent(state)
    assert res is not None
    assert isinstance(res["messages"][0], HumanMessage)
    assert "[VERIFICATION GATE FAILED" in res["messages"][0].content


def test_verification_gate_middleware_passes_when_grounded():
    """Verify middleware passes without intervention when claims are grounded."""
    middleware = VerificationGateMiddleware(mode="sanitize")

    state = {
        "query_results": SAMPLE_QUERY_RESULTS,
        "messages": [
            AIMessage(content="Miền Bắc đạt 1.250.000.000 đồng."),
        ],
    }

    res = middleware.after_agent(state)
    assert res is None


def test_verification_gate_coexists_with_circuit_breaker():
    """Verify verification gate does not alter circuit breaker triggered states."""
    middleware = VerificationGateMiddleware(mode="sanitize")

    state = {
        "query_results": SAMPLE_QUERY_RESULTS,
        "messages": [
            AIMessage(content="_CIRCUIT_BREAKER_TRIGGERED_: Database unreachable"),
        ],
    }

    res = middleware.after_agent(state)
    assert res is None


COMPLEX_QUERY_RESULTS = [
    {"product": "Laptop Pro", "sales": 1_500_000, "revenue": 45_000_000_000, "profit_margin": 0.3333, "loss": -500_000_000},
    {"product": "Phone Air", "sales": 3_000_000, "revenue": 60_000_000_000, "profit_margin": 0.6667, "loss": -2_000_000_000},
]


def test_adversarial_complex_dataframe_representations():
    """Test 1: Complex DataFrame numbers, abbreviations, and unit conversions."""
    text = (
        "Báo cáo hiệu suất sản phẩm:\n"
        "- Doanh số Laptop Pro đạt 1.5M sản phẩm (tương đương 1,5 triệu chiếc hay 1.5tr).\n"
        "- Doanh số Phone Air đạt 3M sản phẩm (tương đương 3 triệu chiếc hay 3tr).\n"
        "- Tổng doanh thu đạt 105 tỷ đồng (105B hoặc 105 ty).\n"
        "- Doanh thu Phone Air đạt 60.000.000.000 đồng (60 tỷ hoặc 60ty hoặc 60B).\n"
    )
    is_valid, ungrounded = verify_numerical_claims(text, COMPLEX_QUERY_RESULTS)
    assert is_valid is True, f"Failed with ungrounded: {ungrounded}"


def test_adversarial_floating_point_and_percentage_rounding():
    """Test 2: Floating point precision and percentage formatting within tolerance."""
    text = (
        "Phân tích tỷ suất sinh lời:\n"
        "- Tỷ suất lợi nhuận Laptop Pro xấp xỉ 33,33% (hoặc 33,3%).\n"
        "- Tỷ suất Phone Air là 66,67%.\n"
    )
    is_valid, ungrounded = verify_numerical_claims(text, COMPLEX_QUERY_RESULTS, tolerance=0.02)
    assert is_valid is True, f"Floating point rounding failed: {ungrounded}"


def test_adversarial_negative_numbers():
    """Test 3: Negative metrics and loss proportions."""
    text = (
        "Khoản lỗ được ghi nhận như sau:\n"
        "- Lỗ Laptop Pro là -500.000.000 đồng (-500 triệu hoặc -500tr).\n"
        "- Tổng lỗ của hai sản phẩm là -2.500.000.000 đồng (-2,5 tỷ).\n"
        "- Laptop Pro chiếm 20% tổng lỗ."
    )
    is_valid, ungrounded = verify_numerical_claims(text, COMPLEX_QUERY_RESULTS)
    assert is_valid is True, f"Negative numbers failed: {ungrounded}"


def test_adversarial_hallucinations_deterministic_strip():
    """Test 4: Deterministic detection and stripping of fabricated hallucinated numbers."""
    hallucinated_text = (
        "# Phân tích kinh doanh\n"
        "- Doanh thu thực tế Phone Air là 60 tỷ đồng.\n"
        "- Doanh thu bịa đặt đạt 99.5 tỷ đồng với tốc độ tăng trưởng 45,8%.\n"
        "- Lượng khách hàng ảo là 88.400 người."
    )
    is_valid, ungrounded = verify_numerical_claims(hallucinated_text, COMPLEX_QUERY_RESULTS)
    assert is_valid is False
    assert any("99.5" in u or "99.5 tỷ" in u for u in ungrounded)
    assert any("45,8%" in u for u in ungrounded)
    assert any("88.400" in u for u in ungrounded)

    stripped = strip_ungrounded_claims(hallucinated_text, COMPLEX_QUERY_RESULTS)
    assert "99.5" not in stripped
    assert "45,8%" not in stripped
    assert "88.400" not in stripped
    assert "60 tỷ" in stripped


def test_adversarial_false_positive_resistance():
    """Test 5: False-positive resistance for qualitative statements, years, quarters, top-K, steps, months."""
    benign_text = (
        "# Chiến lược phát triển năm 2024, 2025 và tầm nhìn 2026\n"
        "Thị trường công nghệ tiếp tục ghi nhận sự chuyển dịch tích cực.\n"
        "- Trong Q1, Q2, Q3 và Q4, các chỉ số vận hành được kiểm soát chặt chẽ.\n"
        "- Top 3 và Top 10 sản phẩm chủ lực đóng góp lớn vào danh mục.\n"
        "- Bước 1: Khảo sát nhu cầu khách hàng.\n"
        "- Bước 2: Tối ưu hoá chuỗi cung ứng.\n"
        "- Bước 10: Đánh giá hiệu quả định kỳ theo Tháng 1 và Tháng 12.\n"
        "- Doanh số thực tế của Laptop Pro là 1.500.000 sản phẩm."
    )
    is_valid, ungrounded = verify_numerical_claims(benign_text, COMPLEX_QUERY_RESULTS)
    assert is_valid is True, f"Benign labels were falsely flagged as ungrounded: {ungrounded}"


def test_vietnamese_number_shorthand_units():
    """Test 6: Shorthand Vietnamese units (tr, ty, trieu, nghin, ngan)."""
    # 1.5tr = 1.5 million = 1,500,000
    val, is_pct = _parse_number_value("1.5tr")
    assert val == 1_500_000.0
    assert is_pct is False

    # 2.5ty = 2.5 billion = 2,500,000,000
    val, is_pct = _parse_number_value("2.5ty")
    assert val == 2_500_000_000.0
    assert is_pct is False

    # 450 trieu = 450 million
    val, is_pct = _parse_number_value("450 trieu")
    assert val == 450_000_000.0

    # 250 nghin = 250,000
    val, is_pct = _parse_number_value("250 nghin")
    assert val == 250_000.0

    # 150 ngan = 150,000
    val, is_pct = _parse_number_value("150 ngan")
    assert val == 150_000.0

