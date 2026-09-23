"""Comprehensive Test Suite for Progressive Skills Registry & Domain Analytics Catalog.

Validates:
1. Dynamic discovery and scanning of all 6 standard analytics domain skills.
2. Progressive disclosure Level 1 (YAML frontmatter parsing) and Level 2 (lazy markdown loading & caching).
3. Stripping YAML frontmatter clean from markdown playbook bodies.
4. Name normalization (case-insensitivity, whitespace trimming, hyphen to underscore replacement).
5. Token budget preservation (<= 650 tokens via tiktoken cl100k_base).
6. `@tool load_skill` tool invocation, schema, normalized routing, and error feedback.
7. Automated validation rules evaluation and business ceiling anchors aggregation.
8. Multi-source layering precedence.
"""

from pathlib import Path
import pytest
import tiktoken

from dbgpt_analyst.skills.registry import SkillMetadata, SkillRegistry, get_skill_registry
from dbgpt_analyst.skills.tool import load_skill


@pytest.fixture(autouse=True)
def reset_registry():
    """Reset the singleton instance before and after each test."""
    SkillRegistry.reset_instance()
    yield
    SkillRegistry.reset_instance()


class TestSkillsDiscoveryAndScanning:
    """Validate dynamic discovery and YAML metadata scanning."""

    def test_discovery_all_six_standard_skills(self):
        registry = get_skill_registry()
        skills = registry.list_skills()

        expected_skills = [
            "sql_optimization",
            "financial_metrics",
            "retail_pos_analytics",
            "supply_chain_inventory",
            "spreadsheet_modeling",
            "executive_deck_synthesis",
        ]
        assert len(skills) >= 6
        for expected in expected_skills:
            assert expected in skills, f"Expected skill '{expected}' not found in registry: {skills}"

    def test_skill_metadata_fields_and_integrity(self):
        registry = get_skill_registry()

        sql_meta = registry.get_skill("sql_optimization")
        assert sql_meta is not None
        assert isinstance(sql_meta, SkillMetadata)
        assert sql_meta.name == "sql_optimization"
        assert sql_meta.domain == "sql_optimization"
        assert sql_meta.domain_key == "sql_engineering"
        assert "sql_query" in sql_meta.required_tools
        assert "sql_query" in sql_meta.mandatory_tools
        assert len(sql_meta.reasoning_steps) >= 3
        assert len(sql_meta.validation_rules) >= 1
        assert "query_cost_ceiling" in sql_meta.ceiling_anchors
        assert sql_meta.file_path.is_file()

        fin_meta = registry.get_skill("financial_metrics")
        assert fin_meta is not None
        assert fin_meta.domain_key == "corporate_finance"
        assert "python_interpreter" in fin_meta.required_tools

        retail_meta = registry.get_skill("retail_pos_analytics")
        assert retail_meta is not None
        assert retail_meta.domain_key == "retail_commerce"

        sc_meta = registry.get_skill("supply_chain_inventory")
        assert sc_meta is not None
        assert sc_meta.domain_key == "supply_chain"

        sheet_meta = registry.get_skill("spreadsheet_modeling")
        assert sheet_meta is not None
        assert sheet_meta.domain_key == "financial_engineering"

        deck_meta = registry.get_skill("executive_deck_synthesis")
        assert deck_meta is not None
        assert deck_meta.domain_key == "executive_presentation"

    def test_malformed_skill_file_resilience(self, tmp_path):
        bad_dir = tmp_path / "bad_skill"
        bad_dir.mkdir()
        bad_file = bad_dir / "SKILL.md"
        bad_file.write_text("---\nmalformed: [unclosed yaml\n---\nBody", encoding="utf-8")

        resilient_registry = SkillRegistry(skills_dir=tmp_path)
        assert resilient_registry.list_skills() == []

    def test_empty_directory_handling(self, tmp_path):
        empty_registry = SkillRegistry(skills_dir=tmp_path)
        assert empty_registry.list_skills() == []
        assert empty_registry.get_prompt_index() == "No specialized skills loaded."


class TestProgressiveLoadingAndCaching:
    """Validate Level 2 lazy markdown procedure loading and caching."""

    def test_load_skill_body_strips_yaml_frontmatter(self):
        registry = get_skill_registry()
        body = registry.load_skill_body("sql_optimization")

        # Body must not contain YAML frontmatter markers
        assert not body.startswith("---")
        assert "name: sql_optimization" not in body
        assert "# CẨM NANG NGHIỆP VỤ: TỐI ƯU HÓA TRUY VẤN SQL" in body
        assert "Explain First, Refactor Later" in body

    def test_lazy_loading_caching(self):
        registry = get_skill_registry()
        assert "financial_metrics" not in registry._body_cache

        body_first = registry.load_skill_body("financial_metrics")
        assert "financial_metrics" in registry._body_cache

        body_cached = registry.load_skill_body("financial_metrics")
        assert body_first == body_cached
        assert body_first is body_cached

    def test_unknown_skill_raises_key_error(self):
        registry = get_skill_registry()

        with pytest.raises(KeyError) as exc_info:
            registry.load_skill_body("non_existent_skill_xyz")
        assert "not found in registry" in str(exc_info.value)


class TestNameNormalization:
    """Validate case, hyphen, and whitespace normalization."""

    def test_case_hyphen_and_whitespace_normalization(self):
        registry = get_skill_registry()

        assert registry.get_skill("SQL-OPTIMIZATION") is not None
        assert registry.get_skill("  sql_optimization  ") is not None
        assert registry.get_skill("SQL_OPTIMIZATION") is not None

        assert registry.get_skill("financial-metrics") is not None
        assert registry.get_skill("  FINANCIAL-METRICS  ") is not None

        assert registry.get_skill("retail-pos-analytics") is not None
        assert registry.get_skill("SUPPLY-CHAIN-INVENTORY") is not None
        assert registry.get_skill("Spreadsheet-Modeling") is not None
        assert registry.get_skill("executive-deck-synthesis") is not None

        # load_skill_body with normalized names
        assert len(registry.load_skill_body("  RETAIL-POS-ANALYTICS  ")) > 100


class TestTokenBudgetPreservation:
    """Validate that the Level 1 prompt index strictly honors the <= 650 token ceiling."""

    def test_prompt_index_under_650_tokens(self):
        registry = get_skill_registry()
        prompt_index = registry.get_prompt_index()

        enc = tiktoken.get_encoding("cl100k_base")
        token_count = len(enc.encode(prompt_index))

        # Target: <= 650 tokens
        assert token_count <= 650, (
            f"Prompt index token count {token_count} exceeds target ceiling of 650 tokens."
        )
        # Verify content
        assert "## KỸ NĂNG CHUYÊN SÂU:" in prompt_index
        assert "`sql_optimization`" in prompt_index
        assert "`financial_metrics`" in prompt_index
        assert "`retail_pos_analytics`" in prompt_index
        assert "`supply_chain_inventory`" in prompt_index
        assert "`spreadsheet_modeling`" in prompt_index
        assert "`executive_deck_synthesis`" in prompt_index
        assert "load_skill(name=...)" in prompt_index

    def test_prompt_index_with_domain_recommendation(self):
        registry = get_skill_registry()
        prompt_index = registry.get_prompt_index(domain="sql_engineering")

        enc = tiktoken.get_encoding("cl100k_base")
        token_count = len(enc.encode(prompt_index))
        assert token_count <= 650
        assert "⭐ Khuyến nghị: `sql_optimization`" in prompt_index


class TestLoadSkillToolInvocation:
    """Validate @tool load_skill LangChain tool decorator."""

    def test_tool_metadata(self):
        assert load_skill.name == "load_skill"
        assert "Nạp toàn văn cẩm nang" in load_skill.description
        assert "name" in load_skill.args_schema.model_fields

    def test_tool_invocation_success(self):
        result = load_skill.invoke({"name": "sql_optimization"})

        assert "=== ĐÃ NẠP KỸ NĂNG: sql_optimization" in result
        assert "Lĩnh vực: sql_optimization" in result
        assert "# CẨM NANG NGHIỆP VỤ: TỐI ƯU HÓA TRUY VẤN SQL" in result

    def test_tool_invocation_normalized_input(self):
        result = load_skill.invoke({"name": "  RETAIL-POS-ANALYTICS  "})

        assert "=== ĐÃ NẠP KỸ NĂNG: retail_pos_analytics" in result
        assert "PHÂN TÍCH BÁN LẺ" in result

    def test_tool_invocation_unknown_skill_graceful_recovery(self):
        result = load_skill.invoke({"name": "non_existent_domain_skill"})

        assert "Lỗi: Kỹ năng 'non_existent_domain_skill' không tồn tại." in result
        assert "Danh mục khả dụng:" in result
        assert "sql_optimization" in result
        assert "financial_metrics" in result


class TestDomainAlgorithmAndCeilingAnchors:
    """Validate domain algorithms, validation rules, and ceiling anchors."""

    def test_ceiling_anchors_aggregation(self):
        registry = get_skill_registry()
        anchors = registry.get_ceiling_anchors()

        assert "query_cost_ceiling" in anchors
        assert "read_only_safety_ceiling" in anchors
        assert "gross_margin_ceiling" in anchors
        assert "positive_runway_anchor" in anchors
        assert "positive_gmv_anchor" in anchors
        assert "non_negative_inventory_anchor" in anchors
        assert "zero_unhandled_errors_anchor" in anchors
        assert "widescreen_aspect_ratio_anchor" in anchors

    def test_domain_algorithm_hint_generation(self):
        registry = get_skill_registry()
        hint = registry.build_domain_algorithm_hint("corporate_finance")

        assert "[DOMAIN METHODOLOGY:" in hint
        assert "Phân rã Doanh thu & Cơ cấu Chi phí" in hint
        assert "Yêu cầu về cấu trúc đầu ra:" in hint
        assert "Yêu cầu kiểm định bắt buộc đối với đáp án:" in hint
        assert "BẮT BUỘC sử dụng các công cụ bổ trợ sau" in hint
        assert "python_interpreter" in hint

    def test_automated_validation_rules_evaluation_success(self):
        registry = get_skill_registry()

        compliant_text = (
            "Báo cáo tài chính: Doanh thu thuần đạt 100 tỷ VND, tăng trưởng 15% YoY và 4% MoM. "
            "Biên lợi nhuận gộp (Gross Margin) đạt mức 38.5%, EBITDA đạt 22 tỷ VND."
        )
        is_valid, errors = registry.evaluate_validation_rules(
            "corporate_finance",
            compliant_text,
            tools_called=["python_interpreter"],
        )
        assert is_valid is True
        assert errors == []

    def test_automated_validation_rules_evaluation_missing_metric_and_tool(self):
        registry = get_skill_registry()

        # Triggered by "doanh thu" but missing required keywords (growth % and margin)
        non_compliant_text = "Báo cáo doanh thu tháng này bán được rất nhiều hàng cho khách."
        is_valid, errors = registry.evaluate_validation_rules(
            "corporate_finance",
            non_compliant_text,
            tools_called=[],  # Missing mandatory tool python_interpreter
        )
        assert is_valid is False
        assert any("Chưa thực thi công cụ bắt buộc: python_interpreter" in e for e in errors)
        assert any("phân tích tài chính bắt buộc phải bao gồm" in e for e in errors)


class TestMultiSourceLayering:
    """Validate that higher layer skill sources override lower layer skills."""

    def test_source_override(self, tmp_path):
        custom_dir = tmp_path / "custom_worker" / "sql_optimization"
        custom_dir.mkdir(parents=True)
        custom_file = custom_dir / "SKILL.md"
        custom_file.write_text(
            "---\n"
            "name: sql_optimization\n"
            "domain: custom_sql\n"
            "description: Custom firm-level SQL skill override.\n"
            "required_tools: [custom_db_tool]\n"
            "---\n"
            "# Custom SQL Playbook Body\n",
            encoding="utf-8",
        )

        registry = get_skill_registry()
        # Initially built-in layer 0
        assert registry.get_skill("sql_optimization").source_label == "Built-in"
        assert "Explain First" in registry.load_skill_body("sql_optimization")

        # Add custom layer
        registry.add_source((tmp_path / "custom_worker", "Firm-Pack"), reload=True)

        # Should now be overridden by Firm-Pack
        overridden_meta = registry.get_skill("sql_optimization")
        assert overridden_meta.source_label == "Firm-Pack"
        assert overridden_meta.domain == "custom_sql"
        assert "custom_db_tool" in overridden_meta.required_tools
        assert "Custom SQL Playbook Body" in registry.load_skill_body("sql_optimization")
