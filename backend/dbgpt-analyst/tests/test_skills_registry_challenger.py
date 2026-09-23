"""Adversarial & Empirical Edge-Case Verification for Progressive Skills Registry.

Executed by Challenger 1 for Milestone 1.
Validates:
1. Corrupt/invalid YAML frontmatter resilience (empty files, missing frontmatter, unclosed markers, non-dict YAML, missing name, extreme file sizes, max length truncation, binary data).
2. Non-existent skill lookup via load_skill_body and @tool load_skill (empty strings, path traversal, unknown skills, graceful error recovery).
3. Name normalization edge cases (leading/trailing whitespace, mixed case, hyphens vs underscores, multiple hyphens).
4. Validation rules evaluation (missing triggers, matching triggers with missing required keywords, fully compliant text, mandatory tool enforcement, multiple violations).
5. Comprehensive schema and markdown integrity for all 6 standard analytics domain skills.
"""

from pathlib import Path
import pytest
import tiktoken

from dbgpt_analyst.skills.registry import (
    MAX_SKILL_DESCRIPTION_LENGTH,
    MAX_SKILL_FILE_SIZE,
    MAX_SKILL_NAME_LENGTH,
    SkillMetadata,
    SkillRegistry,
    get_skill_registry,
)
from dbgpt_analyst.skills.tool import load_skill


@pytest.fixture(autouse=True)
def reset_registry():
    """Ensure clean registry state before and after each test."""
    SkillRegistry.reset_instance()
    yield
    SkillRegistry.reset_instance()


class TestYAMLFrontmatterEdgeCases:
    """Stress-test SkillRegistry resilience against corrupt, malformed, or hostile skill files."""

    def test_empty_file_skipped_gracefully(self, tmp_path):
        skill_dir = tmp_path / "empty_skill"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_text("", encoding="utf-8")

        registry = SkillRegistry(skills_dir=tmp_path)
        assert registry.list_skills() == []

    def test_no_frontmatter_markers_skipped(self, tmp_path):
        skill_dir = tmp_path / "plain_markdown"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_text(
            "# Pure Markdown\n\nNo YAML frontmatter markers here.\n",
            encoding="utf-8",
        )

        registry = SkillRegistry(skills_dir=tmp_path)
        assert registry.list_skills() == []

    def test_unclosed_frontmatter_skipped(self, tmp_path):
        skill_dir = tmp_path / "unclosed_frontmatter"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_text(
            "---\nname: unclosed\ndescription: missing end dashes\n# Body without closing dashes",
            encoding="utf-8",
        )

        registry = SkillRegistry(skills_dir=tmp_path)
        assert registry.list_skills() == []

    def test_non_dictionary_yaml_frontmatter_skipped(self, tmp_path):
        # Case A: List instead of dict
        dir_list = tmp_path / "list_frontmatter"
        dir_list.mkdir()
        (dir_list / "SKILL.md").write_text(
            "---\n- item1\n- item2\n---\n# Body\n",
            encoding="utf-8",
        )

        # Case B: Scalar string instead of dict
        dir_str = tmp_path / "string_frontmatter"
        dir_str.mkdir()
        (dir_str / "SKILL.md").write_text(
            "---\nJust a scalar string\n---\n# Body\n",
            encoding="utf-8",
        )

        # Case C: Scalar number instead of dict
        dir_num = tmp_path / "number_frontmatter"
        dir_num.mkdir()
        (dir_num / "SKILL.md").write_text(
            "---\n42\n---\n# Body\n",
            encoding="utf-8",
        )

        # Case D: Null frontmatter
        dir_null = tmp_path / "null_frontmatter"
        dir_null.mkdir()
        (dir_null / "SKILL.md").write_text(
            "---\nnull\n---\n# Body\n",
            encoding="utf-8",
        )

        registry = SkillRegistry(skills_dir=tmp_path)
        assert registry.list_skills() == []

    def test_missing_name_field_skipped(self, tmp_path):
        skill_dir = tmp_path / "no_name_skill"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_text(
            "---\ndomain: test_domain\ndescription: Has domain and description but no name\n---\n# Body\n",
            encoding="utf-8",
        )

        registry = SkillRegistry(skills_dir=tmp_path)
        assert registry.list_skills() == []

    def test_oversized_file_skipped(self, tmp_path):
        skill_dir = tmp_path / "giant_skill"
        skill_dir.mkdir()
        big_file = skill_dir / "SKILL.md"

        # Create file exceeding MAX_SKILL_FILE_SIZE (10MB)
        with open(big_file, "wb") as f:
            f.write(b"---\nname: giant\n---\n")
            f.seek(MAX_SKILL_FILE_SIZE + 1024)
            f.write(b"EOF")

        registry = SkillRegistry(skills_dir=tmp_path)
        assert "giant" not in registry.list_skills()

    def test_extreme_name_and_description_truncation(self, tmp_path):
        skill_dir = tmp_path / "long_fields_skill"
        skill_dir.mkdir()

        very_long_name = "a" * 100
        very_long_desc = "d" * 2000

        (skill_dir / "SKILL.md").write_text(
            f"---\nname: {very_long_name}\ndescription: {very_long_desc}\n---\n# Playbook Body\n",
            encoding="utf-8",
        )

        registry = SkillRegistry(skills_dir=tmp_path)
        skills = registry.list_skills()
        assert len(skills) == 1

        expected_truncated_name = very_long_name[:MAX_SKILL_NAME_LENGTH]
        assert skills[0] == expected_truncated_name
        meta = registry.get_skill(skills[0])
        assert meta is not None
        assert len(meta.name) == MAX_SKILL_NAME_LENGTH
        assert len(meta.description) == MAX_SKILL_DESCRIPTION_LENGTH

    def test_binary_corrupted_file_resilience(self, tmp_path):
        skill_dir = tmp_path / "corrupted_bytes"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_bytes(b"\x80\x81\xff\xfe---\nname: corrupted\n---\n")

        valid_dir = tmp_path / "valid_skill"
        valid_dir.mkdir()
        (valid_dir / "SKILL.md").write_text(
            "---\nname: valid_one\ndescription: Valid skill description\n---\n# Valid Body\n",
            encoding="utf-8",
        )

        registry = SkillRegistry(skills_dir=tmp_path)
        # Corrupted file should be safely skipped, valid skill loaded cleanly
        assert registry.list_skills() == ["valid_one"]


class TestNonExistentSkillLookup:
    """Stress-test non-existent lookups and path traversal attempts."""

    def test_load_skill_body_empty_and_whitespace(self):
        registry = get_skill_registry()

        with pytest.raises(KeyError):
            registry.load_skill_body("")

        with pytest.raises(KeyError):
            registry.load_skill_body("   ")

    def test_load_skill_body_arbitrary_nonexistent_name(self):
        registry = get_skill_registry()

        with pytest.raises(KeyError) as exc_info:
            registry.load_skill_body("super_secret_unregistered_skill_12345")
        assert "not found in registry" in str(exc_info.value)

    def test_path_traversal_attempt_fails_cleanly(self):
        registry = get_skill_registry()

        with pytest.raises(KeyError):
            registry.load_skill_body("../../etc/passwd")

        with pytest.raises(KeyError):
            registry.load_skill_body("/root/.ssh/id_rsa")

    def test_load_skill_tool_empty_input_graceful_recovery(self):
        result_empty = load_skill.invoke({"name": ""})
        assert "Lỗi: Kỹ năng '' không tồn tại." in result_empty
        assert "Danh mục khả dụng:" in result_empty

        result_spaces = load_skill.invoke({"name": "   "})
        assert "Lỗi: Kỹ năng '   ' không tồn tại." in result_spaces

    def test_load_skill_tool_path_traversal_graceful_recovery(self):
        result = load_skill.invoke({"name": "../../../etc/shadow"})
        assert "Lỗi: Kỹ năng '../../../etc/shadow' không tồn tại." in result
        assert "Danh mục khả dụng:" in result
        # Ensure available skills are enumerated
        assert "sql_optimization" in result
        assert "financial_metrics" in result

    def test_load_skill_tool_special_characters(self):
        result = load_skill.invoke({"name": "!@#$%^&*()_+"})
        assert "không tồn tại" in result
        assert "Danh mục khả dụng:" in result


class TestNameNormalizationEdgeCases:
    """Stress-test edge cases in skill name normalization."""

    def test_leading_trailing_whitespace_and_tabs(self):
        registry = get_skill_registry()

        for skill_name in [
            "  sql_optimization  ",
            "\tsql_optimization\t",
            "\nsql_optimization\n",
            " \n\t sql_optimization \t\n ",
        ]:
            meta = registry.get_skill(skill_name)
            assert meta is not None, f"Failed for name with whitespace: {repr(skill_name)}"
            assert meta.name == "sql_optimization"
            body = registry.load_skill_body(skill_name)
            assert len(body) > 100

    def test_mixed_case_variations(self):
        registry = get_skill_registry()

        variations = [
            "SQL_OPTIMIZATION",
            "Sql_Optimization",
            "sQl_OpTiMiZaTiOn",
            "FINANCIAL_METRICS",
            "Financial_Metrics",
            "ReTaiL_Pos_AnAlyTics",
            "sUpPlY_cHaIn_InVeNtOrY",
            "SPREADSHEET_MODELING",
            "Executive_Deck_Synthesis",
        ]
        for var in variations:
            meta = registry.get_skill(var)
            assert meta is not None, f"Failed lookup for mixed-case variant: {var}"

    def test_hyphen_to_underscore_conversion(self):
        registry = get_skill_registry()

        hyphen_cases = {
            "sql-optimization": "sql_optimization",
            "financial-metrics": "financial_metrics",
            "retail-pos-analytics": "retail_pos_analytics",
            "supply-chain-inventory": "supply_chain_inventory",
            "spreadsheet-modeling": "spreadsheet_modeling",
            "executive-deck-synthesis": "executive_deck_synthesis",
        }
        for hyphenated, expected in hyphen_cases.items():
            meta = registry.get_skill(hyphenated)
            assert meta is not None, f"Hyphenated name '{hyphenated}' failed lookup"
            assert meta.name == expected

            tool_result = load_skill.invoke({"name": hyphenated})
            assert f"=== ĐÃ NẠP KỸ NĂNG: {expected}" in tool_result

    def test_mixed_casing_with_hyphens_and_whitespace(self):
        registry = get_skill_registry()

        complex_names = [
            "  SQL-OPTIMIZATION  ",
            " \t FINANCIAL-METRICS \n ",
            " Retail-POS-Analytics ",
            " Supply-Chain-Inventory ",
            " SPREADSHEET-MODELING ",
            " Executive-DECK-Synthesis ",
        ]
        for cname in complex_names:
            meta = registry.get_skill(cname)
            assert meta is not None, f"Complex normalized name failed: {repr(cname)}"
            body = registry.load_skill_body(cname)
            assert len(body) > 100

    def test_double_hyphens_vs_single_underscore(self):
        registry = get_skill_registry()
        # Normalization replaces each hyphen with an underscore:
        # "sql--optimization" -> "sql__optimization", which does not match "sql_optimization"
        assert registry.get_skill("sql--optimization") is None


class TestValidationRulesEvaluationEdgeCases:
    """Stress-test domain validation rules evaluation against varied text payloads."""

    def test_no_trigger_keywords_present_passes_silently(self):
        registry = get_skill_registry()

        unrelated_texts = [
            "Hôm nay thời tiết đẹp, các chỉ số kỹ thuật của server ổn định.",
            "Deploy ứng dụng thành công lên cụm máy chủ phân tán Kubernetes.",
            "Hello world, testing the analytical engine with neutral text.",
        ]

        domains_to_test = [
            "sql_engineering",
            "corporate_finance",
            "retail_commerce",
            "supply_chain",
            "financial_engineering",
            "executive_presentation",
        ]

        for domain in domains_to_test:
            for text in unrelated_texts:
                is_valid, errors = registry.evaluate_validation_rules(domain, text)
                assert is_valid is True, f"Domain {domain} incorrectly failed unrelated text: {errors}"
                assert errors == []

    def test_empty_text_passes_validation(self):
        registry = get_skill_registry()
        is_valid, errors = registry.evaluate_validation_rules("corporate_finance", "")
        assert is_valid is True
        assert errors == []

    def test_case_insensitivity_of_triggers_and_required_keywords(self):
        registry = get_skill_registry()

        # Triggers in UPPERCASE, required keywords in UPPERCASE
        text_upper = (
            "BÁO CÁO TÀI CHÍNH QUÝ 3: DOANH THU THUẦN ĐẠT 50 TỶ ĐỒNG, TĂNG TRƯỞNG 25% YOY, "
            "BIÊN LỢI NHUẬN GỘP (GROSS MARGIN) ĐẠT 42%, EBITDA ĐẠT 15 TỶ."
        )
        is_valid, errors = registry.evaluate_validation_rules(
            "corporate_finance",
            text_upper,
            tools_called=["PYTHON_INTERPRETER"],
        )
        assert is_valid is True, f"Case insensitivity failed: {errors}"
        assert errors == []

    def test_matching_trigger_but_missing_all_required_keywords(self):
        registry = get_skill_registry()

        # Triggered by 'tối ưu sql' but completely lacks explain/plan and index/partition
        non_compliant = "Chúng tôi đã tối ưu sql bằng cách đổi thứ tự bảng trong mệnh đề FROM."
        is_valid, errors = registry.evaluate_validation_rules(
            "sql_optimization",
            non_compliant,
            tools_called=["sql_query"],
        )
        assert is_valid is False
        assert len(errors) == 1
        assert "cần phân tích EXPLAIN execution plan" in errors[0]

    def test_matching_trigger_with_one_keyword_group_satisfied_but_second_missing(self):
        registry = get_skill_registry()

        # Triggered by 'tối ưu sql', contains 'explain' (group 1 satisfied), but lacks index/partition (group 2 fails)
        partial_text = "Thực hiện tối ưu sql dựa trên explain cost = 4500. Query chạy khá nhanh."
        is_valid, errors = registry.evaluate_validation_rules(
            "sql_optimization",
            partial_text,
            tools_called=["sql_query"],
        )
        assert is_valid is False
        assert len(errors) == 1
        assert "đề xuất chỉ mục (INDEX) hoặc phân vùng (PARTITION)" in errors[0]

    def test_mandatory_tool_failure_independent_of_keywords(self):
        registry = get_skill_registry()

        # Text satisfies all keyword rules for retail_pos_analytics
        compliant_text = (
            "Phân tích bán lẻ tại các cửa hàng: Giá trị đơn hàng trung bình (AOV) đạt 450k VND, "
            "tỷ lệ bán hết (sell-through) của mã sản phẩm SKU-01 đạt 82%."
        )
        # But mandatory tool sql_query was NOT called
        is_valid, errors = registry.evaluate_validation_rules(
            "retail_pos_analytics",
            compliant_text,
            tools_called=["python_interpreter"],  # Missing sql_query
        )
        assert is_valid is False
        assert any("Chưa thực thi công cụ bắt buộc: sql_query" in e for e in errors)

    def test_both_mandatory_tool_and_keyword_rules_fail_simultaneously(self):
        registry = get_skill_registry()

        bad_text = "Phân tích bán lẻ hôm nay rất đông khách đến mua sắm tại quầy thu ngân."
        is_valid, errors = registry.evaluate_validation_rules(
            "retail_pos_analytics",
            bad_text,
            tools_called=[],  # Missing sql_query
        )
        assert is_valid is False
        assert len(errors) >= 2
        assert any("Chưa thực thi công cụ bắt buộc: sql_query" in e for e in errors)
        assert any("AOV hoặc UPT" in e or "bán lẻ" in e for e in errors)

    def test_unknown_domain_defaults_to_chung(self):
        registry = get_skill_registry()
        # Non-existent domain key
        is_valid, errors = registry.evaluate_validation_rules(
            "completely_unknown_domain_xyz",
            "Báo cáo phân tích tùy chỉnh",
            tools_called=["any_tool"],
        )
        assert is_valid is True
        assert errors == []


class TestStandardSkillsCatalogIntegrity:
    """Verify that all 6 standard domain skills adhere strictly to the Deep Agents specification."""

    STANDARD_SKILLS = [
        ("sql_optimization", "sql_engineering"),
        ("financial_metrics", "corporate_finance"),
        ("retail_pos_analytics", "retail_commerce"),
        ("supply_chain_inventory", "supply_chain"),
        ("spreadsheet_modeling", "financial_engineering"),
        ("executive_deck_synthesis", "executive_presentation"),
    ]

    def test_all_six_skills_registered_with_correct_keys(self):
        registry = get_skill_registry()
        registered = registry.list_skills()

        for skill_name, domain_key in self.STANDARD_SKILLS:
            assert skill_name in registered, f"Missing standard skill: {skill_name}"
            meta = registry.get_skill(skill_name)
            assert meta is not None
            assert meta.name == skill_name
            assert meta.domain_key == domain_key
            assert meta.role == "worker"
            assert meta.file_path.is_file()
            assert meta.file_path.stat().st_size > 0

    def test_all_six_skills_have_mandatory_and_required_tools(self):
        registry = get_skill_registry()

        for skill_name, _ in self.STANDARD_SKILLS:
            meta = registry.get_skill(skill_name)
            assert meta is not None
            assert len(meta.required_tools) >= 1, f"{skill_name} has empty required_tools"
            assert len(meta.mandatory_tools) >= 1, f"{skill_name} has empty mandatory_tools"
            # Every mandatory tool must be listed in required_tools
            for mt in meta.mandatory_tools:
                assert mt in meta.required_tools, (
                    f"Mandatory tool '{mt}' not declared in required_tools for {skill_name}"
                )

    def test_all_six_skills_have_reasoning_steps(self):
        registry = get_skill_registry()

        for skill_name, _ in self.STANDARD_SKILLS:
            meta = registry.get_skill(skill_name)
            assert meta is not None
            assert len(meta.reasoning_steps) >= 3, f"{skill_name} has fewer than 3 reasoning steps"
            for step in meta.reasoning_steps:
                assert "step" in step and step["step"]
                assert "concept" in step and step["concept"]
                assert "must_verify_live" in step

    def test_all_six_skills_have_validation_rules_and_ceiling_anchors(self):
        registry = get_skill_registry()

        for skill_name, _ in self.STANDARD_SKILLS:
            meta = registry.get_skill(skill_name)
            assert meta is not None
            assert len(meta.validation_rules) >= 1, f"{skill_name} missing validation_rules"
            for r in meta.validation_rules:
                assert "trigger_keywords" in r and len(r["trigger_keywords"]) > 0
                assert "required_keywords" in r and len(r["required_keywords"]) > 0
                assert "error_message" in r and r["error_message"]

            assert len(meta.ceiling_anchors) >= 1, f"{skill_name} missing ceiling_anchors"
            for anchor_key, anchor_def in meta.ceiling_anchors.items():
                assert "name" in anchor_def
                assert "concept" in anchor_def

    def test_markdown_bodies_cleanly_loaded_without_frontmatter_artifacts(self):
        registry = get_skill_registry()

        for skill_name, _ in self.STANDARD_SKILLS:
            body = registry.load_skill_body(skill_name)
            assert isinstance(body, str)
            assert len(body) >= 500, f"{skill_name} playbook body suspiciously short ({len(body)} chars)"
            # Ensure YAML delimiters are stripped
            assert not body.startswith("---"), f"{skill_name} body still starts with YAML delimiter"
            assert not body.startswith("name:"), f"{skill_name} body starts with YAML name key"
            # Ensure proper Markdown header
            assert body.startswith("# "), f"{skill_name} body does not start with top-level markdown heading"

    def test_prompt_index_budget_strictly_under_650_tokens(self):
        registry = get_skill_registry()
        prompt_index = registry.get_prompt_index()

        enc = tiktoken.get_encoding("cl100k_base")
        tokens = len(enc.encode(prompt_index))
        # Hard ceiling is 650 tokens
        assert tokens <= 650, f"Token budget exceeded: {tokens} tokens > 650"
        assert tokens < 200, f"Index unexpectedly large: {tokens} tokens"
