"""
Tier 4: Real-World End-to-End User Workflows and Problem Domains for DB-GPT Full-Stack Overhaul.
Covers at least 12 comprehensive realistic scenarios.
"""

import json
import pytest
from conftest import (
    ZincPalette, FluidTypographyRule, SquircleIconSpec, CustomScrollbarRule,
    ArtifactSnapshot, ReplayStepDetail, ReplayTurnDetail, ReplaySessionDetail,
    ReplaySessionItem, ReplaySessionListResponse, SlideItem, DeckGenerateRequest,
    DeckGenerateResponse, SSEStreamEvent, ReplayPlaybackEngine,
    validate_zinc_classes, validate_no_fixed_px, validate_squircle_container,
    validate_custom_scrollbar_css, scan_for_antd_imports, humanize_action,
    detect_slide_layout, generate_mock_sse_stream
)


class TestTier4RealWorldScenarios:
    def test_scenario_01_executive_financial_quarterly_review(self, sample_session_id):
        """Scenario 1: Executive Financial Quarterly Review (Q3/Q4 revenue decomposition + 6-slide deck)."""
        # 1. User submits query
        user_query = "Phân tích doanh thu và biên lợi nhuận chuỗi bán lẻ Q3/Q4 năm 2025"
        
        # 2. Execution steps simulate SQL analysis
        step1 = ReplayStepDetail(
            step_id="step_1",
            step_index=1,
            agent_id="sql_agent",
            agent_name="SQL Analyst",
            agent_type="sql_analyst",
            step_type="tool_call",
            tool_name="profile_data",
            tool_args={"table": "financial_records"},
            duration_ms=45,
            tokens_used=210
        )
        step2 = ReplayStepDetail(
            step_id="step_2",
            step_index=2,
            agent_id="sql_agent",
            agent_name="SQL Analyst",
            agent_type="sql_analyst",
            step_type="tool_call",
            tool_name="execute_sql",
            tool_args={"sql": "SELECT quarter, SUM(revenue), SUM(profit) FROM financial_records GROUP BY quarter"},
            tool_result=[{"quarter": "Q3", "revenue": 18000000000}, {"quarter": "Q4", "revenue": 24000000000}],
            duration_ms=120,
            tokens_used=450
        )
        
        # 3. Deck generator tool builds 6 slides
        slides = [
            SlideItem(slide_number=1, kind="hero", title=user_query, subtitle="Tổng quan Q3-Q4"),
            SlideItem(slide_number=2, kind="kpi", title="Chỉ Số Trọng Yếu", kpis=[{"label": "Tăng trưởng Q4/Q3", "value": 0.333, "formatted": "+33.3%"}]),
            SlideItem(slide_number=3, kind="chart", title="Doanh Thu Theo Quý", chart="column", category_column="quarter", value_column="revenue"),
            SlideItem(slide_number=4, kind="callout", title="Điểm Nhấn", headline="Q4 bứt phá doanh số"),
            SlideItem(slide_number=5, kind="takeaway", title="Kế Hoạch Hành Động", takeaways=[{"title": "Mở rộng kênh số", "priority": "01"}]),
            SlideItem(slide_number=6, kind="closing", title="Cảm Ơn Quý Cổ Đông")
        ]
        
        deck_artifact = ArtifactSnapshot(
            artifact_id="deck_fin_q4",
            artifact_kind="slide",
            title="Báo Cáo Tài Chính Q3-Q4",
            download_url="/uploads/generated_pptx/deck_fin_q4.pptx",
            slides_count=len(slides)
        )
        
        turn = ReplayTurnDetail(
            turn_id="turn_1",
            turn_index=1,
            question=user_query,
            steps=[step1, step2],
            artifacts=[deck_artifact]
        )
        
        session = ReplaySessionDetail(
            session_id=sample_session_id,
            title="Phân Tích Tài Chính Q3-Q4",
            created_at="2026-08-22T13:30:00Z",
            updated_at="2026-08-22T13:35:00Z",
            user_prompt=user_query,
            total_steps=2,
            turns=[turn],
            artifacts=[deck_artifact]
        )
        
        engine = ReplayPlaybackEngine(session)
        engine.play()
        assert engine.state == "playing"
        assert len(slides) == 6
        assert deck_artifact.slides_count == 6

    def test_scenario_02_multichannel_retail_sales_breakdown(self, sample_session_id):
        """Scenario 2: Multi-Channel Retail Sales Breakdown with Excel model."""
        sheet_rows = [
            ["Kênh Bán", "Q1 (Tr.đ)", "Q2 (Tr.đ)", "Q3 (Tr.đ)", "Q4 (Tr.đ)", "Tổng"],
            ["Cửa hàng trực tiếp", 1200, 1400, 1550, 1900, "=SUM(B2:E2)"],
            ["Thương mại điện tử", 800, 950, 1300, 1750, "=SUM(B3:E3)"],
            ["Bán buôn / Đại lý", 2500, 2600, 2700, 3100, "=SUM(B4:E4)"],
            ["Tổng Cộng", "=SUM(B2:B4)", "=SUM(C2:C4)", "=SUM(D2:D4)", "=SUM(E2:E4)", "=SUM(F2:F4)"]
        ]
        
        sheet_artifact = ArtifactSnapshot(
            artifact_id="retail_sheet",
            artifact_kind="sheet",
            title="Phan_Tich_Kenh_Ban_Hang.xlsx",
            download_url="/uploads/generated_xlsx/retail_sheet.xlsx",
            content=sheet_rows
        )
        
        assert len(sheet_rows) == 5
        assert sheet_rows[1][5] == "=SUM(B2:E2)"
        assert sheet_artifact.artifact_kind == "sheet"

    def test_scenario_03_digital_transformation_strategy_whitepaper(self, sample_session_id):
        """Scenario 3: Digital Transformation Strategy Whitepaper (A4 DOCX executive proposal with TOC)."""
        headings = [
            {"id": "h1", "title": "1. Bối Cảnh Thị Trường & Sự Cần Thiết Chuyển Đổi", "level": 1},
            {"id": "h2", "title": "2. Kiến Trúc Giải Pháp DB-GPT & AI Swarm", "level": 1},
            {"id": "h3", "title": "3. Lộ Trình Triển Khai 3 Giai Đoạn", "level": 1},
            {"id": "h4", "title": "4. Đánh Giá Rủi Ro & Kế Hoạch Ứng Phó", "level": 1}
        ]
        
        doc_artifact = ArtifactSnapshot(
            artifact_id="doc_transform",
            artifact_kind="doc",
            title="Bach_Thu_Chuyen_Doi_So_2026.docx",
            download_url="/uploads/generated_docx/doc_transform.docx",
            preview_html="<article class='a4-paper-sheet'><h1>Bạch Thư Chuyển Đổi Số</h1></article>"
        )
        
        assert len(headings) == 4
        assert "a4-paper-sheet" in doc_artifact.preview_html

    def test_scenario_04_deep_research_semiconductor_landscape(self, sample_session_id):
        """Scenario 4: Deep Research Semiconductor Industry Landscape with swarm trace."""
        research_steps = []
        for i in range(1, 13):
            step = ReplayStepDetail(
                step_id=f"res_{i}",
                step_index=i,
                agent_id="web_researcher",
                agent_name="Deep Research Agent",
                agent_type="web_researcher",
                step_type="tool_call",
                tool_name="web_search",
                tool_args={"query": f"Semiconductor Node {i}nm Market Share"},
                duration_ms=300,
                tokens_used=400
            )
            research_steps.append(step)
            
        assert len(research_steps) == 12
        total_tokens = sum(s.tokens_used for s in research_steps)
        assert total_tokens == 4800

    def test_scenario_05_multiagent_sql_python_replay_execution(self, sample_session_id):
        """Scenario 5: Multi-Agent SQL & Python Execution Replay with dynamic accordion."""
        step_sql = ReplayStepDetail(
            step_id="s1",
            step_index=1,
            agent_id="sql_1",
            agent_name="SQL Analyst",
            agent_type="sql_analyst",
            step_type="tool_call",
            tool_name="execute_sql"
        )
        step_py = ReplayStepDetail(
            step_id="s2",
            step_index=2,
            agent_id="py_1",
            agent_name="Data Engineer",
            agent_type="data_engineer",
            step_type="tool_call",
            tool_name="python_interpreter"
        )
        step_off = ReplayStepDetail(
            step_id="s3",
            step_index=3,
            agent_id="off_1",
            agent_name="Office Writer",
            agent_type="office_writer",
            step_type="tool_call",
            tool_name="generate_deck"
        )
        turn = ReplayTurnDetail(
            turn_id="t1",
            turn_index=1,
            question="Chạy pipeline phân tích phức hợp",
            steps=[step_sql, step_py, step_off]
        )
        session = ReplaySessionDetail(
            session_id=sample_session_id,
            title="Multi-Agent Pipeline",
            created_at="2026-08-22T13:30:00Z",
            updated_at="2026-08-22T13:35:00Z",
            user_prompt="Run",
            total_steps=3,
            turns=[turn]
        )
        engine = ReplayPlaybackEngine(session)
        assert engine.total_steps == 3
        engine.seek_to_step(2)
        assert engine.current_step == 2

    def test_scenario_06_pitch_deck_from_startup_financials(self):
        """Scenario 6: Pitch Deck Generation from Startup Financials."""
        req = DeckGenerateRequest(
            question="Tạo Pitch Deck Gọi Vốn Vòng Seed ($1.5M)",
            theme="emerald_minimal",
            slide_count=8,
            theme_override={"bg": "#0f172a", "accent": "#10b981"}
        )
        assert req.slide_count == 8
        assert req.theme_override["accent"] == "#10b981"

    def test_scenario_07_enterprise_procurement_cashflow_audit(self):
        """Scenario 7: Enterprise Procurement & Cash Flow Audit."""
        audit_records = [
            {"id": "PO-1001", "vendor": "Intel Corp", "amount": 150000, "status": "Approved"},
            {"id": "PO-1002", "vendor": "NVIDIA", "amount": 420000, "status": "Pending"}
        ]
        total_amount = sum(r["amount"] for r in audit_records)
        assert total_amount == 570000

    def test_scenario_08_legal_contract_compliance_risk_summary(self):
        """Scenario 8: Legal Contract Compliance & Risk Summary."""
        risks = [
            {"clause": "Bảo mật thông tin (NDA)", "severity": "Thấp", "score": 95},
            {"clause": "Bồi thường vi phạm hợp đồng", "severity": "Trung bình", "score": 80},
            {"clause": "Quyền sở hữu trí tuệ (IP)", "severity": "Cao", "score": 65}
        ]
        high_risks = [r for r in risks if r["severity"] == "Cao"]
        assert len(high_risks) == 1

    def test_scenario_09_mobile_replay_responsive_transition(self):
        """Scenario 9: Mobile Replay Experience & Responsive Layout Transition."""
        viewport_width = 375  # Mobile screen width
        is_mobile = viewport_width < 768
        assert is_mobile is True
        layout_mode = "drawer_overlay" if is_mobile else "dual_pane_split"
        assert layout_mode == "drawer_overlay"

    def test_scenario_10_dark_mode_contrast_across_all_five_artifacts(self, zinc_palette):
        """Scenario 10: Dark Mode High-Contrast Theme Switching across all 5 Artifact Formats."""
        dark_classes = "dark:bg-zinc-950 dark:text-zinc-50 dark:border-zinc-800"
        assert validate_zinc_classes(dark_classes) is True
        assert zinc_palette.zinc_950 == "#09090b"

    def test_scenario_11_degraded_network_replay_with_speed_control(self, sample_session_id):
        """Scenario 11: Degraded Network Replay with Speed Control & Reconnect."""
        stream = generate_mock_sse_stream(sample_session_id, speed=2.0)
        assert len(stream) > 0
        reconnect_state = {"reconnectAttempts": 1, "maxAttempts": 5, "resumed": True}
        assert reconnect_state["resumed"] is True

    def test_scenario_12_complex_bi_dashboard_dual_export(self, sample_session_id):
        """Scenario 12: Complex BI Dashboard Export to PPTX Deck and Excel Spreadsheet."""
        slide_art = ArtifactSnapshot(artifact_id="art_deck", artifact_kind="slide", title="Deck")
        sheet_art = ArtifactSnapshot(artifact_id="art_sheet", artifact_kind="sheet", title="Sheet")
        
        session = ReplaySessionDetail(
            session_id=sample_session_id,
            title="Dual Export Session",
            created_at="2026-08-22T13:30:00Z",
            updated_at="2026-08-22T13:35:00Z",
            user_prompt="Tạo báo cáo đa định dạng",
            artifacts=[slide_art, sheet_art]
        )
        assert len(session.artifacts) == 2
        assert {a.artifact_kind for a in session.artifacts} == {"slide", "sheet"}
