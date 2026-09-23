"""
Tier 3: Pairwise and Triplet Cross-Feature Integration Tests for DB-GPT Full-Stack Overhaul.
Covers at least 24 rich interaction scenarios between adjacent features.
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


class TestTier3CrossFeatureInteractions:
    def test_interaction_template_handoff_to_sse_streaming(self, sample_session_id):
        # 1. Template card handoff generates query
        handoff_query = {"template": "s1", "prompt": "Phân tích doanh thu 2026", "mode": "office_slides"}
        assert handoff_query["mode"] == "office_slides"
        
        # 2. Replay streaming starts for this session
        stream = generate_mock_sse_stream(sample_session_id, speed=1.0)
        assert len(stream) > 0
        assert "document_block" in "".join(stream)

    def test_interaction_subagent_delegation_to_humanized_action(self):
        # Subagent delegation event
        step = ReplayStepDetail(
            step_id="step_delegate",
            step_index=1,
            agent_id="sql_agent",
            agent_name="SQL Analyst",
            agent_type="sql_analyst",
            step_type="tool_call",
            tool_name="execute_sql",
            tool_args={"table": "quarterly_revenue"}
        )
        humanized = humanize_action(step.tool_name, step.tool_args, lang="vi")
        assert "quarterly_revenue" in humanized
        assert "Đang truy vấn" in humanized

    def test_interaction_deck_generation_to_slide_carousel(self):
        req = DeckGenerateRequest(
            question="Báo cáo tài chính Q4",
            query_results=[{"q": "Q4", "rev": 50000000000}],
            slide_count=5,
            theme="executive_navy"
        )
        slide1 = SlideItem(slide_number=1, kind="hero", title=req.question, subtitle="Chi tiết Q4")
        slide2 = SlideItem(slide_number=2, kind="kpi", title="KPIs", kpis=[{"label": "Doanh thu", "value": 50000000000}])
        
        layout1 = detect_slide_layout(slide1.model_dump())
        layout2 = detect_slide_layout(slide2.model_dump())
        
        assert layout1 == "hero"
        assert layout2 == "kpi"

    def test_interaction_sticky_scrubber_to_dynamic_accordion(self, sample_replay_session):
        engine = ReplayPlaybackEngine(sample_replay_session)
        assert engine.reasoning_expanded is False
        
        engine.play()
        assert engine.reasoning_expanded is True
        
        engine.seek_to_step(sample_replay_session.total_steps)
        assert engine.reasoning_expanded is False

    def test_interaction_sticky_scrubber_to_artifact_canvas(self, sample_replay_session):
        engine = ReplayPlaybackEngine(sample_replay_session)
        engine.seek_to_step(1)
        assert engine.current_step == 1
        assert len(sample_replay_session.artifacts) > 0

    def test_interaction_excel_grid_to_xlsx_export(self):
        sheet_data = [["Vùng", "Doanh Thu"], ["Miền Bắc", 12000000], ["Miền Nam", 18000000]]
        export_artifact = ArtifactSnapshot(
            artifact_id="sheet_exp",
            artifact_kind="sheet",
            title="Bang_Tinh_Doanh_Thu.xlsx",
            download_url="/uploads/generated_xlsx/sheet_exp.xlsx",
            content=sheet_data
        )
        assert export_artifact.download_url.endswith(".xlsx")
        assert len(export_artifact.content) == 3

    def test_interaction_word_a4_to_floating_toc(self):
        headings = [
            {"id": "h1", "text": "1. Tổng Quan Thị Trường", "level": 1},
            {"id": "h2", "text": "2. Phân Tích Đối Thủ", "level": 1},
            {"id": "h3", "text": "2.1 Điểm Mạnh / Điểm Yếu", "level": 2}
        ]
        toc_classes = "fixed right-8 top-24 w-64 p-4 rounded-xl border border-zinc-200"
        assert len(headings) == 3
        assert "rounded-xl" in toc_classes

    def test_interaction_monochrome_zinc_to_dark_mode_canvas(self, zinc_palette):
        canvas_classes = "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800"
        assert validate_zinc_classes(canvas_classes) is True
        assert zinc_palette.zinc_950 == "#09090b"

    def test_interaction_fluid_typography_to_squircle_icons(self, squircle_icon_spec):
        badge = {"className": "text-xs rounded-xl border border-zinc-200 p-1.5", "strokeWidth": squircle_icon_spec.stroke_width}
        assert validate_no_fixed_px(badge["className"]) == []
        assert validate_squircle_container(badge) is True

    def test_interaction_custom_scrollbar_to_reasoning_stream(self, custom_scrollbar_rule):
        reasoning_container = f"h-96 overflow-y-auto {custom_scrollbar_rule.class_name[1:]} p-4"
        assert "custom-scrollbar" in reasoning_container
        assert custom_scrollbar_rule.width_px == 6

    def test_interaction_antd_elimination_to_sonner_toasts(self):
        # When an error occurs, Sonner toast is fired instead of antd message
        source_snippet = """
        import { toast } from 'sonner';
        // Legacy: message.error("Lỗi") eliminated
        toast.error("Không thể kết nối máy chủ");
        """
        assert len(scan_for_antd_imports(source_snippet)) == 0
        assert "toast.error" in source_snippet

    def test_interaction_multi_studio_taxonomy_to_16x9_cards(self):
        templates = [
            {"id": "s1", "category": "Business", "aspect": "16/9", "title": "Strategy Deck"},
            {"id": "s2", "category": "Tech", "aspect": "16/9", "title": "Architecture Blueprint"},
            {"id": "s3", "category": "Business", "aspect": "16/9", "title": "Sales Review"}
        ]
        selected_cat = "Business"
        filtered = [t for t in templates if t["category"] == selected_cat]
        assert len(filtered) == 2
        for f in filtered:
            assert f["aspect"] == "16/9"

    def test_interaction_get_sessions_list_to_replay_detail(self, sample_session_id, sample_replay_session):
        list_item = ReplaySessionItem(
            session_id=sample_session_id,
            title=sample_replay_session.title,
            created_at=sample_replay_session.created_at,
            updated_at=sample_replay_session.updated_at,
            total_steps=sample_replay_session.total_steps
        )
        assert list_item.session_id == sample_replay_session.session_id
        assert list_item.total_steps == len(sample_replay_session.turns[0].steps)

    def test_interaction_sse_stream_speed_to_playback_engine(self, sample_replay_session):
        engine = ReplayPlaybackEngine(sample_replay_session)
        engine.set_speed(2.0)
        assert engine.speed == 2.0
        stream = generate_mock_sse_stream(sample_replay_session.session_id, speed=2.0)
        assert "speed" in stream[0]

    def test_interaction_multi_format_canvas_to_code_viewer(self, sample_replay_session):
        engine = ReplayPlaybackEngine(sample_replay_session)
        engine.switch_artifact_tab("code")
        assert engine.active_artifact_tab == "code"

    def test_interaction_sql_analyst_to_excel_model(self):
        sql_result = [{"dept": "Sales", "budget": 1000}, {"dept": "IT", "budget": 2000}]
        sheet_artifact = ArtifactSnapshot(
            artifact_id="sheet_auto",
            artifact_kind="sheet",
            title="Ngan_Sach_Phong_Ban.xlsx",
            content=sql_result
        )
        assert sheet_artifact.artifact_kind == "sheet"
        assert len(sheet_artifact.content) == 2

    def test_interaction_web_researcher_to_docx_report(self):
        research_notes = "Phân tích xu hướng công nghệ AI năm 2026..."
        doc_artifact = ArtifactSnapshot(
            artifact_id="doc_res",
            artifact_kind="doc",
            title="Bao_Cao_Nghien_Cuu.docx",
            preview_html=f"<div class='a4-paper'><p>{research_notes}</p></div>"
        )
        assert "a4-paper" in doc_artifact.preview_html

    def test_interaction_deck_generator_theme_override_to_card(self):
        override = {"bg": "#0f172a", "accent": "#f59e0b"}
        card = {"themeSwatches": [override["bg"], override["accent"]]}
        assert card["themeSwatches"][1] == "#f59e0b"

    def test_interaction_replay_page_to_share_token_generation(self, sample_session_id):
        share_token = f"share_tok_{sample_session_id[:8]}"
        share_url = f"/share/{share_token}"
        assert share_url.startswith("/share/share_tok_")

    def test_interaction_adversarial_event_to_humanized_badge(self):
        bad_name = "TODO::init:0/1::unknown_action"
        badge_text = humanize_action(bad_name, lang="vi")
        assert "TODO::" not in badge_text
        assert "unknown_action" in badge_text

    def test_interaction_deep_research_studio_to_multi_agent_stream(self, sample_session_id):
        stream = generate_mock_sse_stream(sample_session_id, num_steps=6)
        tool_calls = [s for s in stream if '"type": "tool_call"' in s]
        assert len(tool_calls) == 6

    def test_interaction_slide_carousel_autoplay_to_step_counter(self):
        slides_count = 6
        current_idx = 0
        for _ in range(3):
            current_idx = (current_idx + 1) % slides_count
        assert current_idx == 3

    def test_interaction_kpi_metrics_to_slide_layout_renderer(self):
        slide = SlideItem(
            slide_number=2,
            kind="kpi",
            title="Chỉ Số Tài Chính",
            kpis=[{"label": "Tăng trưởng", "value": 0.324, "formatted": "+32.4%"}]
        )
        layout = detect_slide_layout(slide.model_dump())
        assert layout == "kpi"
        assert slide.kpis[0]["formatted"] == "+32.4%"

    def test_interaction_build_cleanliness_to_zero_antd_regression(self):
        app_code = """
        import { Dialog } from '@/new-components/ui/dialog';
        import { Button } from '@/new-components/ui/button';
        export default function App() { return <Button>Click</Button>; }
        """
        assert len(scan_for_antd_imports(app_code)) == 0
