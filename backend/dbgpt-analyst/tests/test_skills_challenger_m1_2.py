"""Empirical Stress Test Harness for Milestone 1 (Challenger 2).

Adversarial validation covering:
1. Token preservation: compute token count of get_prompt_index() with tiktoken cl100k_base across multiple domain hints.
2. Multi-source layering: add a temporary custom directory layer with an overriding skill and assert Layer 2 overrides Layer 0.
3. Thread safety: test concurrent access to SkillRegistry.get_instance() across 20 threads.
4. @tool load_skill invocation: execute tool directly and assert string output and error string.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import threading
import pytest
import tiktoken

from dbgpt_analyst.skills.registry import SkillRegistry, get_skill_registry
from dbgpt_analyst.skills.tool import load_skill


@pytest.fixture(autouse=True)
def clean_registry():
    """Ensure a clean registry singleton before and after each test."""
    SkillRegistry.reset_instance()
    yield
    SkillRegistry.reset_instance()


# ============================================================================
# Objective 1: Token Preservation Harness
# ============================================================================

class TestTokenPreservationChallenger:
    """Stress test token budget preservation of get_prompt_index across extensive domain hints."""

    DOMAIN_HINTS_TO_TEST = [
        # Explicit domains and aliases from _DOMAIN_SKILL_MAP
        None,
        "sql",
        "sql_opt",
        "sql_optimization",
        "sql_engineering",
        "financial",
        "finance",
        "financial_metrics",
        "corporate_finance",
        "retail",
        "pos",
        "retail_pos",
        "retail_pos_analytics",
        "retail_commerce",
        "supply_chain",
        "inventory",
        "supply_chain_inventory",
        "spreadsheet",
        "excel",
        "xlsx",
        "spreadsheet_modeling",
        "financial_engineering",
        "deck",
        "slide",
        "slides",
        "presentation",
        "executive_deck",
        "executive_deck_synthesis",
        "executive_presentation",
        # Case variations & trimming
        "  SQL_ENGINEERING  ",
        "Financial-Metrics",
        "RETAIL_COMMERCE",
        "SuPpLy_ChAiN",
        # Unmapped / arbitrary / non-existent domains
        "unknown_domain_xyz",
        "random_analytics_topic",
        "machine_learning_pipeline",
        "crm_churn_prediction",
        "deep_learning_nlp",
        # Empty & whitespace
        "",
        "   ",
        # Unicode / Vietnamese
        "tối_ưu_hóa_sql",
        "báo_cáo_tài_chính",
    ]

    def test_token_preservation_across_all_domain_hints(self):
        registry = get_skill_registry()
        enc = tiktoken.get_encoding("cl100k_base")

        token_counts = {}
        for domain in self.DOMAIN_HINTS_TO_TEST:
            prompt_index = registry.get_prompt_index(domain=domain)
            token_count = len(enc.encode(prompt_index))
            token_counts[str(domain)] = token_count

            # Hard ceiling check
            assert token_count <= 650, (
                f"Domain hint '{domain}' produced {token_count} tokens, exceeding ceiling of 650 tokens! "
                f"Content:\n{prompt_index}"
            )
            # Must advertise dynamic load_skill call
            assert "load_skill(name=...)" in prompt_index
            assert "## KỸ NĂNG CHUYÊN SÂU:" in prompt_index

        # Empirical observations
        max_tokens = max(token_counts.values())
        min_tokens = min(token_counts.values())
        avg_tokens = sum(token_counts.values()) / len(token_counts)

        # Baseline index is very compact (~100-140 tokens)
        assert max_tokens < 300, f"Max token count {max_tokens} unexpectedly high (budget ceiling is 650)"
        assert min_tokens > 50, f"Min token count {min_tokens} unexpectedly low"

    def test_token_preservation_with_different_roles(self):
        registry = get_skill_registry()
        enc = tiktoken.get_encoding("cl100k_base")

        for role in ["worker", "all", "supervisor", "non_existent_role"]:
            prompt_index = registry.get_prompt_index(domain="sql", role=role)
            tokens = len(enc.encode(prompt_index))
            assert tokens <= 650, f"Role '{role}' produced {tokens} tokens > 650"


# ============================================================================
# Objective 2: Multi-Source Layering (Layer 2 Overrides Layer 0)
# ============================================================================

class TestMultiSourceLayeringChallenger:
    """Stress test Deep Agents Multi-Source Layering precedence (Layer 2 > Layer 1 > Layer 0)."""

    def test_layer_2_overrides_layer_0_and_cache_invalidation(self, tmp_path):
        # 1. Setup Layer 0 built-in registry
        registry = get_skill_registry()
        initial_meta = registry.get_skill("sql_optimization")
        assert initial_meta is not None
        assert initial_meta.source_layer == 0
        assert initial_meta.source_label == "Built-in"
        assert initial_meta.version == "1.0.0"

        # Prime the body cache in Layer 0
        initial_body = registry.load_skill_body("sql_optimization")
        assert "Explain First, Refactor Later" in initial_body
        assert "sql_optimization" in registry._body_cache

        # 2. Construct Layer 1 (Project directory)
        layer1_dir = tmp_path / "project_skills" / "sql_optimization"
        layer1_dir.mkdir(parents=True)
        (layer1_dir / "SKILL.md").write_text(
            "---\n"
            "name: sql_optimization\n"
            "domain: sql_optimization\n"
            "description: Layer 1 Project Level SQL Optimization\n"
            "version: 1.5.0\n"
            "required_tools: [project_sql_tool]\n"
            "---\n"
            "# LAYER 1 PROJECT SQL PLAYBOOK\n"
            "Project customized query optimization guidelines.\n",
            encoding="utf-8",
        )

        # 3. Construct Layer 2 (Custom/Firm directory)
        layer2_dir = tmp_path / "firm_skills" / "sql_optimization"
        layer2_dir.mkdir(parents=True)
        (layer2_dir / "SKILL.md").write_text(
            "---\n"
            "name: sql_optimization\n"
            "domain: sql_optimization\n"
            "description: Layer 2 Firm Override SQL Optimization\n"
            "version: 2.0.0\n"
            "required_tools: [firm_sql_tool, firm_security_guard]\n"
            "mandatory_tools: [firm_sql_tool]\n"
            "---\n"
            "# LAYER 2 FIRM OVERRIDE SQL PLAYBOOK\n"
            "Strict firm-wide policy: all queries must pass through firm_sql_tool.\n",
            encoding="utf-8",
        )

        # Add Layer 1
        registry.add_source((tmp_path / "project_skills", "ProjectLayer"), reload=True)
        meta_l1 = registry.get_skill("sql_optimization")
        assert meta_l1.source_layer == 1
        assert meta_l1.source_label == "ProjectLayer"
        assert meta_l1.version == "1.5.0"
        assert "LAYER 1 PROJECT SQL PLAYBOOK" in registry.load_skill_body("sql_optimization")

        # Add Layer 2
        registry.add_source((tmp_path / "firm_skills", "FirmCustomLayer"), reload=True)

        # 4. Verify Layer 2 overrides Layer 1 and Layer 0
        meta_l2 = registry.get_skill("sql_optimization")
        assert meta_l2 is not None
        assert meta_l2.source_layer == 2, f"Expected source_layer 2, got {meta_l2.source_layer}"
        assert meta_l2.source_label == "FirmCustomLayer"
        assert meta_l2.version == "2.0.0"
        assert meta_l2.description == "Layer 2 Firm Override SQL Optimization"
        assert "firm_security_guard" in meta_l2.required_tools
        assert "firm_sql_tool" in meta_l2.mandatory_tools

        # Verify body cache was properly invalidated and returns Layer 2 content
        overridden_body = registry.load_skill_body("sql_optimization")
        assert "LAYER 2 FIRM OVERRIDE SQL PLAYBOOK" in overridden_body
        assert "Explain First, Refactor Later" not in overridden_body
        assert "LAYER 1 PROJECT" not in overridden_body

        # Verify non-overridden Layer 0 skills remain intact
        fin_meta = registry.get_skill("financial_metrics")
        assert fin_meta is not None
        assert fin_meta.source_layer == 0
        assert fin_meta.source_label == "Built-in"
        assert "Biên Lợi Nhuận Gộp (Gross Margin %)" in registry.load_skill_body("financial_metrics")

    def test_layer_2_custom_unique_skill_coexistence(self, tmp_path):
        """Verify Layer 2 can introduce brand new skills while coexisting with Layer 0."""
        custom_dir = tmp_path / "custom_pack" / "esg_compliance"
        custom_dir.mkdir(parents=True)
        (custom_dir / "SKILL.md").write_text(
            "---\n"
            "name: esg_compliance\n"
            "domain: sustainability\n"
            "description: Corporate ESG carbon accounting and green audit.\n"
            "required_tools: [carbon_calculator]\n"
            "---\n"
            "# ESG COMPLIANCE PLAYBOOK\n"
            "Calculate Scope 1, 2, 3 greenhouse emissions.\n",
            encoding="utf-8",
        )

        registry = get_skill_registry()
        registry.add_source((tmp_path / "custom_pack", "ESG-Custom"), reload=True)

        # Layer 0 still present
        assert len(registry.list_skills()) >= 7
        assert "sql_optimization" in registry.list_skills()
        assert "esg_compliance" in registry.list_skills()

        esg_meta = registry.get_skill("esg_compliance")
        assert esg_meta is not None
        assert esg_meta.domain == "sustainability"
        assert "ESG COMPLIANCE PLAYBOOK" in registry.load_skill_body("esg_compliance")


# ============================================================================
# Objective 3: Thread Safety Harness (20 Concurrent Threads)
# ============================================================================

class TestThreadSafetyChallenger:
    """Stress test concurrent access to SkillRegistry.get_instance() across 20 threads."""

    def test_concurrent_get_instance_20_threads_singleton_guarantee(self):
        """20 threads race to call get_instance() on a cold (uninitialized) singleton."""
        SkillRegistry.reset_instance()
        num_threads = 20
        barrier = threading.Barrier(num_threads)
        instances = [None] * num_threads
        exceptions = [None] * num_threads

        def worker(idx: int):
            try:
                # Wait for all 20 threads to align at the barrier
                barrier.wait(timeout=5.0)
                # Simultaneous invocation of singleton factory
                inst = SkillRegistry.get_instance()
                instances[idx] = inst
            except Exception as ex:
                exceptions[idx] = ex

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)

        # Assert zero exceptions in all threads
        assert all(e is None for e in exceptions), f"Exceptions occurred in threads: {exceptions}"

        # Assert every thread received a valid SkillRegistry instance
        assert all(inst is not None for inst in instances)
        assert all(isinstance(inst, SkillRegistry) for inst in instances)

        # CRITICAL ASSERTION: All 20 threads must receive the EXACT SAME singleton object
        first_id = id(instances[0])
        for idx, inst in enumerate(instances):
            assert id(inst) == first_id, (
                f"Thread {idx} got a different instance (id {id(inst)}) than Thread 0 (id {first_id})!"
            )

        # Assert registry was fully loaded with standard catalog
        assert len(instances[0].list_skills()) >= 6

    def test_concurrent_load_skill_body_race_resistance(self):
        """20 threads concurrently invoke load_skill_body to test lazy cache thread safety."""
        registry = get_skill_registry()
        num_threads = 20
        calls_per_thread = 20
        skills_to_call = [
            "sql_optimization",
            "financial_metrics",
            "retail_pos_analytics",
            "supply_chain_inventory",
            "spreadsheet_modeling",
            "executive_deck_synthesis",
        ]

        def worker():
            results = []
            for _ in range(calls_per_thread):
                for skill_name in skills_to_call:
                    body = registry.load_skill_body(skill_name)
                    assert len(body) > 100
                    results.append(len(body))
            return len(results)

        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(worker) for _ in range(num_threads)]
            for future in as_completed(futures):
                count = future.result()
                assert count == calls_per_thread * len(skills_to_call)

        # Cache must contain all 6 skills
        for s in skills_to_call:
            assert s in registry._body_cache


# ============================================================================
# Objective 4: @tool load_skill Invocation & Schema
# ============================================================================

class TestLoadSkillToolChallenger:
    """Stress test direct execution of the @tool load_skill LangChain decorator."""

    def test_tool_schema_compliance(self):
        assert load_skill.name == "load_skill"
        assert "Nạp toàn văn cẩm nang" in load_skill.description
        schema = load_skill.args_schema.model_json_schema()
        assert "name" in schema["properties"]
        assert schema["required"] == ["name"]

    def test_tool_direct_invocation_all_standard_skills(self):
        standard_skills = [
            ("sql_optimization", "sql_optimization", "TỐI ƯU HÓA TRUY VẤN SQL"),
            ("financial_metrics", "financial_metrics", "CHỈ SỐ TÀI CHÍNH"),
            ("retail_pos_analytics", "retail_pos_analytics", "PHÂN TÍCH BÁN LẺ"),
            ("supply_chain_inventory", "supply_chain_inventory", "CHUỖI CUNG ỨNG"),
            ("spreadsheet_modeling", "spreadsheet_modeling", "MÔ HÌNH HÓA BẢNG TÍNH"),
            ("executive_deck_synthesis", "executive_deck_synthesis", "TRÌNH CHIẾU ĐIỀU HÀNH"),
        ]

        for skill_id, expected_domain, expected_snippet in standard_skills:
            # 1. Via invoke dictionary
            output = load_skill.invoke({"name": skill_id})
            assert isinstance(output, str)
            assert f"=== ĐÃ NẠP KỸ NĂNG: {skill_id}" in output
            assert f"Lĩnh vực: {expected_domain}" in output
            assert expected_snippet in output

            # 2. Case and hyphen normalization check
            hyphenated_name = skill_id.replace("_", "-").upper()
            norm_output = load_skill.invoke({"name": f"  {hyphenated_name}  "})
            assert f"=== ĐÃ NẠP KỸ NĂNG: {skill_id}" in norm_output

    def test_tool_direct_invocation_error_strings(self):
        """Assert graceful error string output for nonexistent skills and edge cases."""
        # Nonexistent skill
        err_output = load_skill.invoke({"name": "non_existent_skill_999"})
        assert isinstance(err_output, str)
        assert "Lỗi: Kỹ năng 'non_existent_skill_999' không tồn tại." in err_output
        assert "Danh mục khả dụng: [" in err_output
        assert "sql_optimization" in err_output
        assert "financial_metrics" in err_output

        # Empty string
        empty_output = load_skill.invoke({"name": ""})
        assert "Lỗi: Kỹ năng '' không tồn tại." in empty_output
        assert "Danh mục khả dụng: [" in empty_output

        # Whitespace
        space_output = load_skill.invoke({"name": "   "})
        assert "Lỗi: Kỹ năng '   ' không tồn tại." in space_output

        # Special chars
        special_output = load_skill.invoke({"name": "!@#$%^&*()"})
        assert "Lỗi: Kỹ năng '!@#$%^&*()' không tồn tại." in special_output
