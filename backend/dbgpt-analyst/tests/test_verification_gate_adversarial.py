"""tests/test_verification_gate_adversarial.py — Empirical Adversarial Challenge Suite (Task F - R2).

Adversarially tests VerificationGateMiddleware across:
1. Vietnamese currency formatting permutations & complex expressions.
2. Subtle numerical hallucinations (scale errors, small drift beyond tolerance).
3. Cross-column aggregates, derived ratios, proportions, and zero-division resilience.
4. Qualitative external web research pass-through without corruption.
5. Coexistence and pipeline chaining with DoomLoopGuard and CircuitBreaker.
"""

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from dbgpt_analyst.middleware.doom_loop_guard import DoomLoopGuardMiddleware
from dbgpt_analyst.middleware.step_budget import StepBudgetMiddleware
from dbgpt_analyst.middleware.verification_gate import (
    VerificationGateMiddleware,
    _extract_ground_truth_values,
    _parse_number_value,
    verify_numerical_claims,
)

ADVERSARIAL_QUERY_RESULTS = [
    {
        "period": "2025-Q1",
        "region": "Miền Bắc",
        "revenue": 5_140_000_000,
        "orders": 1000,
        "profit": 1_028_000_000,
    },
    {
        "period": "2025-Q2",
        "region": "Miền Nam",
        "revenue": 7_710_000_000,
        "orders": 1500,
        "profit": 1_542_000_000,
    },
]


class TestVietnameseFormattingPermutations:
    """Stress tests for Vietnamese currency notation, abbreviations, symbols, and signs."""

    @pytest.mark.parametrize(
        "token,expected_val,expected_pct",
        [
            ("12,85 tỷ VND", 12_850_000_000.0, False),
            ("12.85 tỷ đồng", 12_850_000_000.0, False),
            ("12,85 tỷ", 12_850_000_000.0, False),
            ("12.85B", 12_850_000_000.0, False),
            ("12.85 bn", 12_850_000_000.0, False),
            ("$12.85B", 12_850_000_000.0, False),
            ("₫12,85 tỷ", 12_850_000_000.0, False),
            ("350 triệu đồng", 350_000_000.0, False),
            ("350 triệu VND", 350_000_000.0, False),
            ("350M", 350_000_000.0, False),
            ("350m", 350_000_000.0, False),
            ("₫350M", 350_000_000.0, False),
            ("1.250.000 VNĐ", 1_250_000.0, False),
            ("1.250.000 đ", 1_250_000.0, False),
            ("1,250,000", 1_250_000.0, False),
            ("1.250.000", 1_250_000.0, False),
            ("500 nghìn", 500_000.0, False),
            ("500 ngàn", 500_000.0, False),
            ("500k", 500_000.0, False),
            ("500K", 500_000.0, False),
            ("+36,9%", 36.9, True),
            ("+36.9%", 36.9, True),
            ("-5,2%", -5.2, True),
            ("-5.2%", -5.2, True),
            ("0%", 0.0, True),
            ("+0,0%", 0.0, True),
            ("100%", 100.0, True),
            ("20,0%", 20.0, True),
        ],
    )
    def test_parse_number_value_permutations(self, token, expected_val, expected_pct):
        res = _parse_number_value(token)
        assert res is not None, f"Failed to parse token: {token}"
        val, is_pct = res
        assert is_pct == expected_pct
        assert pytest.approx(val, rel=1e-3, abs=1e-3) == expected_val

    def test_grounded_vietnamese_prose_verification(self):
        """Verify prose containing various Vietnamese formatting styles passes when grounded."""
        prose = (
            "# Báo cáo tổng hợp kinh doanh 2025\n"
            "- Tổng doanh thu toàn hệ thống đạt 12,85 tỷ VND (tương đương 12.85B đồng).\n"
            "- Doanh thu miền Bắc Q1 đạt 5,14 tỷ đồng với 1.000 đơn hàng.\n"
            "- Doanh thu miền Nam Q2 ghi nhận 7,71 tỷ VNĐ với 1.500 đơn hàng.\n"
            "- Tổng số lượng đơn hàng đạt 2.500 đơn.\n"
            "- Tỷ suất lợi nhuận trên doanh thu đạt 20,0%.\n"
            "- Giá trị đơn hàng trung bình (AOV) đạt 5.140.000 đồng.\n"
            "- Tăng trưởng doanh thu giữa 2 kỳ đạt +50,0%."
        )
        is_valid, ungrounded = verify_numerical_claims(prose, ADVERSARIAL_QUERY_RESULTS)
        assert is_valid is True, f"Expected valid prose but got ungrounded claims: {ungrounded}"
        assert ungrounded == []


class TestSubtleHallucinations:
    """Stress tests detecting subtle hallucinations and magnitude errors."""

    def test_hallucination_10x_and_0_1x_scale_errors(self):
        """Subagent makes off-by-10x and off-by-0.1x scaling errors."""
        prose_10x = "Tổng doanh thu toàn công ty đạt 128,5 tỷ đồng."
        is_valid, ungrounded = verify_numerical_claims(prose_10x, ADVERSARIAL_QUERY_RESULTS)
        assert is_valid is False
        assert any("128,5" in u for u in ungrounded)

        prose_0_1x = "Tổng doanh thu toàn công ty đạt 1,285 tỷ đồng."
        is_valid, ungrounded = verify_numerical_claims(prose_0_1x, ADVERSARIAL_QUERY_RESULTS)
        assert is_valid is False
        assert any("1,285" in u for u in ungrounded)

    def test_hallucination_drift_beyond_tolerance(self):
        """Subagent hallucinates 13.50 tỷ (+5.05% drift) or 13.15 tỷ (+2.33% drift > 2% tol)."""
        prose_drift_5pct = "Tổng doanh thu đạt 13,50 tỷ đồng."
        is_valid, ungrounded = verify_numerical_claims(prose_drift_5pct, ADVERSARIAL_QUERY_RESULTS, tolerance=0.02)
        assert is_valid is False
        assert any("13,50" in u for u in ungrounded)

        prose_drift_2_3pct = "Tổng doanh thu đạt 13,15 tỷ đồng."
        is_valid, ungrounded = verify_numerical_claims(prose_drift_2_3pct, ADVERSARIAL_QUERY_RESULTS, tolerance=0.02)
        assert is_valid is False
        assert any("13,15" in u for u in ungrounded)

    def test_close_rounding_within_tolerance_passes(self):
        """Subagent rounds 12.85 tỷ to 12.87 tỷ (+0.15% drift <= 2% tolerance)."""
        prose_close = "Tổng doanh thu xấp xỉ 12,87 tỷ đồng."
        is_valid, ungrounded = verify_numerical_claims(prose_close, ADVERSARIAL_QUERY_RESULTS, tolerance=0.02)
        assert is_valid is True
        assert ungrounded == []

    def test_middleware_sanitize_mode_action(self):
        """Verify sanitize mode strips hallucinated sentences and injects ground truth facts."""
        middleware = VerificationGateMiddleware(mode="sanitize")
        state = {
            "query_results": ADVERSARIAL_QUERY_RESULTS,
            "messages": [
                HumanMessage(content="Tổng hợp doanh thu"),
                AIMessage(
                    content=(
                        "# Báo cáo quý\n"
                        "Doanh thu thực tế miền Bắc là 5,14 tỷ đồng.\n"
                        "Doanh thu ảo tưởng được bơm lên 99,9 tỷ đồng.\n"
                        "Lợi nhuận toàn công ty đạt 2,57 tỷ đồng."
                    )
                ),
            ],
        }

        res = middleware.after_agent(state)
        assert res is not None
        assert "messages" in res
        output_text = res["messages"][0].content
        assert "99,9" not in output_text
        assert "5,14" in output_text
        assert "2,57" in output_text
        assert "## Số liệu đã xác thực từ cơ sở dữ liệu (Ground Truth)" in output_text

    def test_middleware_warn_mode_action(self):
        """Verify warn mode appends warning banner with specific ungrounded tokens."""
        middleware = VerificationGateMiddleware(mode="warn")
        state = {
            "query_results": ADVERSARIAL_QUERY_RESULTS,
            "messages": [
                AIMessage(content="Doanh thu ghi nhận đạt 13,50 tỷ đồng."),
            ],
        }

        res = middleware.after_agent(state)
        assert res is not None
        output_text = res["messages"][0].content
        assert "[VERIFICATION WARNING]" in output_text
        assert "13,50" in output_text

    def test_middleware_strict_mode_action(self):
        """Verify strict mode returns HumanMessage corrective prompt."""
        middleware = VerificationGateMiddleware(mode="strict")
        state = {
            "query_results": ADVERSARIAL_QUERY_RESULTS,
            "messages": [
                AIMessage(content="Doanh thu dự báo là 128,5 tỷ đồng."),
            ],
        }

        res = middleware.after_agent(state)
        assert res is not None
        feedback_msg = res["messages"][0]
        assert isinstance(feedback_msg, HumanMessage)
        assert "[VERIFICATION GATE FAILED" in feedback_msg.content
        assert "128,5" in feedback_msg.content


class TestCrossColumnAggregates:
    """Stress tests for derived mathematical quantities and cross-column ratios."""

    def test_cross_column_aov_and_profit_margin(self):
        """Verify cross-column derived ratio AOV (rev/orders) and margin (profit/rev)."""
        gt = _extract_ground_truth_values(ADVERSARIAL_QUERY_RESULTS)
        assert 5_140_000.0 in gt
        assert any(abs(v - 0.20) < 1e-4 for v in gt)
        assert any(abs(v - 20.0) < 1e-2 for v in gt)

    def test_zero_division_resilience(self):
        """Verify zero values or zero-sum columns do not cause ZeroDivisionError."""
        zero_results = [
            {"item": "A", "revenue": 0, "orders": 0},
            {"item": "B", "revenue": 0, "orders": 0},
        ]
        gt = _extract_ground_truth_values(zero_results)
        assert 0.0 in gt
        assert 2.0 in gt

    def test_single_row_dataset(self):
        """Verify single row tables correctly extract metrics without indexing errors."""
        single_row = [{"metric": 42_000_000}]
        gt = _extract_ground_truth_values(single_row)
        assert 42_000_000.0 in gt
        assert 1.0 in gt


class TestQualitativeAnalysisPassThrough:
    """Verify non-database qualitative prose is not corrupted or blocked."""

    def test_pure_qualitative_text_unmodified_in_middleware(self):
        """Qualitative research without DB queries must pass through without alteration."""
        middleware = VerificationGateMiddleware(mode="sanitize")
        qualitative_content = (
            "# Báo cáo Nghiên cứu Thị trường\n"
            "Theo phân tích của chuyên gia, xu hướng tiêu dùng năm 2026 đang dịch chuyển mạnh mẽ "
            "sang các nền tảng thương mại điện tử tích hợp AI.\n"
            "Khách hàng ưu tiên trải nghiệm cá nhân hóa và thời gian giao hàng nhanh chóng."
        )

        state = {
            "query_results": [],
            "messages": [
                AIMessage(content=qualitative_content),
            ],
        }

        res = middleware.after_agent(state)
        assert res is None

    def test_qualitative_text_with_benign_dates_and_ranks(self):
        """Qualitative prose containing years, dates, and rankings is recognized as benign."""
        text = (
            "# Kế hoạch phát triển năm 2026\n"
            "Ngày 2026-08-21, theo xếp hạng Top 5 thương hiệu hàng đầu trong Q3:\n"
            "Hạng 1 thuộc về giải pháp tự động hóa thông minh.\n"
            "Bước 1 là triển khai thử nghiệm trên quy mô nhỏ."
        )
        is_valid, ungrounded = verify_numerical_claims(text, [])
        assert is_valid is True
        assert ungrounded == []

    def test_fabricated_numbers_flagged_on_empty_results(self):
        """Fabricated database numbers claimed when query_results is empty are detected by verify_numerical_claims."""
        fabricated_text = "Doanh thu quý này đạt 500 tỷ đồng và 10.000 đơn hàng."
        is_valid, ungrounded = verify_numerical_claims(fabricated_text, [])
        assert is_valid is False
        assert len(ungrounded) >= 2
        assert any("500" in u for u in ungrounded)
        assert any("10.000" in u for u in ungrounded)


class TestMiddlewareCoexistence:
    """Test interaction across DoomLoopGuard, CircuitBreaker, and VerificationGateMiddleware."""

    def test_circuit_breaker_preservation(self):
        """VerificationGateMiddleware must not overwrite circuit breaker abort markers."""
        middleware = VerificationGateMiddleware(mode="sanitize")
        state = {
            "query_results": ADVERSARIAL_QUERY_RESULTS,
            "messages": [
                AIMessage(
                    content="_CIRCUIT_BREAKER_TRIGGERED_: Repeated sandbox error on execution limit reached."
                ),
            ],
        }

        res = middleware.after_agent(state)
        assert res is None

    def test_doom_loop_guard_interaction(self):
        """DoomLoopGuard intercepts 3 identical tool calls before agent turn."""
        doom_guard = DoomLoopGuardMiddleware(threshold=3)

        messages = [
            AIMessage(
                content="Running SQL query...",
                tool_calls=[{"id": "call_1", "name": "execute_sql", "args": {"query": "SELECT 1;"}}],
            ),
            ToolMessage(content="1", tool_call_id="call_1"),
            AIMessage(
                content="Running SQL query...",
                tool_calls=[{"id": "call_2", "name": "execute_sql", "args": {"query": "SELECT 1;"}}],
            ),
            ToolMessage(content="1", tool_call_id="call_2"),
            AIMessage(
                content="Running SQL query...",
                tool_calls=[{"id": "call_3", "name": "execute_sql", "args": {"query": "SELECT 1;"}}],
            ),
            ToolMessage(content="1", tool_call_id="call_3"),
        ]

        state = {
            "messages": messages,
            "query_results": ADVERSARIAL_QUERY_RESULTS,
        }

        doom_res = doom_guard.before_agent(state)
        assert doom_res is not None
        assert "messages" in doom_res
        alert_msg = doom_res["messages"][0]
        assert isinstance(alert_msg, HumanMessage)
        assert "DOOM LOOP DETECTED" in alert_msg.content

    def test_full_middleware_pipeline_chain(self):
        """Verify sequential chaining through StepBudget -> VerificationGate."""
        budget_mw = StepBudgetMiddleware(max_steps=10, warning_threshold=3)
        verify_mw = VerificationGateMiddleware(mode="sanitize")

        state = {
            "steps": 9,
            "messages": [
                AIMessage(
                    content=(
                        "# Tổng kết\n"
                        "Doanh thu thực 5,14 tỷ đồng.\n"
                        "Doanh thu bịa 888,8 tỷ đồng."
                    )
                ),
            ],
            "query_results": ADVERSARIAL_QUERY_RESULTS,
        }

        budget_res = budget_mw.before_agent(state)
        assert budget_res is not None
        assert "Step budget remaining: 1/10 turns" in budget_res["messages"][0].content

        verify_res = verify_mw.after_agent(state)
        assert verify_res is not None
        final_content = verify_res["messages"][0].content
        assert "888,8" not in final_content
        assert "5,14" in final_content
        assert "Ground Truth" in final_content

    @pytest.mark.asyncio
    async def test_async_verification_gate(self):
        """Verify async aafter_agent method operates identically to sync after_agent."""
        middleware = VerificationGateMiddleware(mode="sanitize")
        state = {
            "query_results": ADVERSARIAL_QUERY_RESULTS,
            "messages": [
                AIMessage(content="Doanh thu ảo 777 tỷ đồng."),
            ],
        }
        res = await middleware.aafter_agent(state)
        assert res is not None
        assert "777" not in res["messages"][0].content
        assert "Ground Truth" in res["messages"][0].content


class TestAdversarialVulnerabilitiesAndBugs:
    """Empirical verification of currency symbols and boundary robustness in VerificationGate."""

    def test_currency_symbol_prefix_properly_detected(self):
        """Verify that numbers with currency symbols ($, ₫, €, ¥) and currency units (VND, VNĐ, đồng)
        are correctly parsed and accurately flagged when ungrounded.
        """
        ground_truth = [{"revenue": 100_000_000}]  # 100 million

        # Test ungrounded claims with currency prefixes and suffixes
        test_cases = [
            ("Doanh thu bịa đặt: $999 tỷ", "$999 tỷ"),
            ("Doanh thu bịa đặt: ₫999 tỷ", "₫999 tỷ"),
            ("Doanh thu bịa đặt: €500M", "€500M"),
            ("Doanh thu bịa đặt: 350 triệu đồng", "350 triệu"),
            ("Doanh thu bịa đặt: 1.250.000 VNĐ", "1.250.000"),
        ]

        for text, expected_token_snippet in test_cases:
            is_valid, ungrounded = verify_numerical_claims(text, ground_truth)
            assert is_valid is False, f"Expected ungrounded detection for: {text}"
            assert len(ungrounded) >= 1, f"Expected ungrounded claims for: {text}"
            assert any(expected_token_snippet in u or u in expected_token_snippet for u in ungrounded)

    def test_currency_grounded_vs_hallucinated_scale(self):
        """Verify that grounded currency values pass while scaled/drifted values are flagged."""
        # Ground truth: 12.85 tỷ (12_850_000_000)
        gt = [{"revenue": 12_850_000_000}]

        # Grounded variations pass
        grounded_text = "Doanh thu đạt $12.85B và ₫12,85 tỷ VND."
        is_valid, ungrounded = verify_numerical_claims(grounded_text, gt)
        assert is_valid is True
        assert ungrounded == []

        # 10x scale hallucination is flagged
        hallucinated_10x = "Doanh thu đạt $128.5B."
        is_valid, ungrounded = verify_numerical_claims(hallucinated_10x, gt)
        assert is_valid is False
        assert any("128.5" in u for u in ungrounded)

        # 5% drift hallucination is flagged
        hallucinated_drift = "Doanh thu đạt $13.50B."
        is_valid, ungrounded = verify_numerical_claims(hallucinated_drift, gt, tolerance=0.02)
        assert is_valid is False
        assert any("13.50" in u for u in ungrounded)

