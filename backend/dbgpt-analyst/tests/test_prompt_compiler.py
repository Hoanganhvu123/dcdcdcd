"""Unit tests for OpenMAIC File-Based Prompt Compiler & Snippet Engine.

Verifies:
1. Basic variable interpolation & JSON serialization.
2. Snippet inclusion ({{snippet:name}}) and nested snippet expansion.
3. Snippet recursion limit and missing snippet handling.
4. Conditional block evaluation ({{#if ...}} and {{#if !...}}).
5. Strict placeholder validation (UnrenderedPlaceholderError).
6. Template caching and invalidation.
7. File not found error handling (TemplateNotFoundError).
8. Production template and snippet integrity checks.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from dbgpt_analyst.prompts.compiler import (
    MissingSnippetError,
    PromptError,
    PromptManager,
    TemplateNotFoundError,
    UnrenderedPlaceholderError,
)


@pytest.fixture
def isolated_prompt_dir(tmp_path: Path) -> Path:
    """Create an isolated prompts directory structure."""
    templates_dir = tmp_path / "templates"
    snippets_dir = tmp_path / "snippets"
    templates_dir.mkdir(parents=True)
    snippets_dir.mkdir(parents=True)
    return tmp_path


def test_basic_variable_interpolation(isolated_prompt_dir: Path):
    tpl_dir = isolated_prompt_dir / "templates" / "greeting"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("Hello {{userName}}, welcome to {{service}}!", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    rendered = pm.render("greeting", {"userName": "Alex", "service": "DB-GPT Analyst"})
    assert rendered == "Hello Alex, welcome to DB-GPT Analyst!"


def test_json_serialization_in_interpolation(isolated_prompt_dir: Path):
    tpl_dir = isolated_prompt_dir / "templates" / "data_view"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("Configuration:\n{{config}}", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    payload = {"db": "postgres", "timeout": 30, "tables": ["users", "orders"]}
    rendered = pm.render("data_view", {"config": payload})

    assert "Configuration:" in rendered
    assert '"db": "postgres"' in rendered
    assert '"timeout": 30' in rendered
    assert '"orders"' in rendered


def test_none_variable_interpolation(isolated_prompt_dir: Path):
    tpl_dir = isolated_prompt_dir / "templates" / "optional_view"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("Prefix{{extra}}Suffix", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    rendered = pm.render("optional_view", {"extra": None})
    assert rendered == "PrefixSuffix"


def test_unrendered_placeholder_error(isolated_prompt_dir: Path):
    tpl_dir = isolated_prompt_dir / "templates" / "strict_view"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("Hello {{name}}, your token is {{secret_token}}.", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    with pytest.raises(UnrenderedPlaceholderError) as exc_info:
        pm.render("strict_view", {"name": "Alice"})

    assert "secret_token" in str(exc_info.value)
    assert "strict_view" in str(exc_info.value)


def test_snippet_inclusion(isolated_prompt_dir: Path):
    snippets_dir = isolated_prompt_dir / "snippets"
    (snippets_dir / "header.md").write_text("=== EXECUTIVE REPORT HEADER ===", encoding="utf-8")

    tpl_dir = isolated_prompt_dir / "templates" / "report"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("{{snippet:header}}\nQuarterly Performance Summary.", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    rendered = pm.render("report")
    assert "=== EXECUTIVE REPORT HEADER ===" in rendered
    assert "Quarterly Performance Summary." in rendered


def test_nested_snippet_inclusion(isolated_prompt_dir: Path):
    snippets_dir = isolated_prompt_dir / "snippets"
    (snippets_dir / "leaf.md").write_text("LEAF_CONTENT", encoding="utf-8")
    (snippets_dir / "parent.md").write_text("PARENT_START [{{snippet:leaf}}] PARENT_END", encoding="utf-8")

    tpl_dir = isolated_prompt_dir / "templates" / "nested"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("ROOT: {{snippet:parent}}", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    rendered = pm.render("nested")
    assert rendered == "ROOT: PARENT_START [LEAF_CONTENT] PARENT_END"


def test_snippet_recursion_depth_limit(isolated_prompt_dir: Path):
    snippets_dir = isolated_prompt_dir / "snippets"
    # Circular reference
    (snippets_dir / "loop.md").write_text("LOOP: {{snippet:loop}}", encoding="utf-8")

    tpl_dir = isolated_prompt_dir / "templates" / "cycle"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("START {{snippet:loop}} END", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    with pytest.raises(PromptError) as exc_info:
        pm.render("cycle")
    assert "recursion depth exceeded" in str(exc_info.value)


def test_missing_snippet_error(isolated_prompt_dir: Path):
    tpl_dir = isolated_prompt_dir / "templates" / "bad_snippet"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("Include: {{snippet:non_existent_snippet_id}}", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    with pytest.raises(MissingSnippetError) as exc_info:
        pm.render("bad_snippet")
    assert "non_existent_snippet_id" in str(exc_info.value)


def test_conditional_blocks_truthy_and_falsy(isolated_prompt_dir: Path):
    tpl_dir = isolated_prompt_dir / "templates" / "conditional"
    tpl_dir.mkdir()
    content = (
        "Status:\n"
        "{{#if is_admin}}\n"
        "ADMIN_PANEL_ENABLED\n"
        "{{/if}}\n"
        "{{#if !is_admin}}\n"
        "STANDARD_USER_PANEL\n"
        "{{/if}}"
    )
    (tpl_dir / "system.md").write_text(content, encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)

    # Truthy
    rendered_admin = pm.render("conditional", {"is_admin": True})
    assert "ADMIN_PANEL_ENABLED" in rendered_admin
    assert "STANDARD_USER_PANEL" not in rendered_admin

    # Falsy
    rendered_user = pm.render("conditional", {"is_admin": False})
    assert "STANDARD_USER_PANEL" in rendered_user
    assert "ADMIN_PANEL_ENABLED" not in rendered_user


def test_template_caching_and_invalidation(isolated_prompt_dir: Path):
    tpl_dir = isolated_prompt_dir / "templates" / "cache_test"
    tpl_dir.mkdir()
    tpl_file = tpl_dir / "system.md"
    tpl_file.write_text("Version 1.0", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    r1 = pm.render("cache_test")
    assert r1 == "Version 1.0"

    # Modify file on disk
    tpl_file.write_text("Version 2.0", encoding="utf-8")

    # Should hit cache
    r2 = pm.render("cache_test")
    assert r2 == "Version 1.0"

    # Clear cache
    pm.clear_cache()
    r3 = pm.render("cache_test")
    assert r3 == "Version 2.0"


def test_template_not_found_error(isolated_prompt_dir: Path):
    pm = PromptManager(base_dir=isolated_prompt_dir)
    with pytest.raises(TemplateNotFoundError) as exc_info:
        pm.render("ghost_template")
    assert "ghost_template" in str(exc_info.value)


def test_render_user_and_build_prompt(isolated_prompt_dir: Path):
    tpl_dir = isolated_prompt_dir / "templates" / "duo"
    tpl_dir.mkdir()
    (tpl_dir / "system.md").write_text("SYSTEM: {{role}}", encoding="utf-8")
    (tpl_dir / "user.md").write_text("USER: {{task}}", encoding="utf-8")

    pm = PromptManager(base_dir=isolated_prompt_dir)
    prompts = pm.build_prompt("duo", {"role": "Auditor", "task": "Verify integrity"})

    assert prompts["system"] == "SYSTEM: Auditor"
    assert prompts["user"] == "USER: Verify integrity"


def test_static_shorthand_methods():
    pm = PromptManager.get_default()
    assert pm is not None
    # Verify get_snippet shorthand works on production snippet
    guardrails = PromptManager.get_snippet("sql_guardrails")
    assert "Read-Only Invariant" in guardrails


def test_all_production_templates_and_snippets_valid():
    """Verify that all production templates and snippets load and compile cleanly."""
    pm = PromptManager.get_default()
    templates = pm.list_templates()
    snippets = pm.list_snippets()

    assert len(templates) >= 8, f"Expected at least 8 templates, found {len(templates)}"
    assert len(snippets) >= 4, f"Expected at least 4 snippets, found {len(snippets)}"

    # Required snippets
    assert "sql_guardrails" in snippets
    assert "format_rules" in snippets
    assert "data_formatting" in snippets
    assert "executive_standards.md".replace(".md", "") in snippets

    # Required templates
    assert "supervisor" in templates
    assert "sql_analyst" in templates
    assert "office_writer" in templates
    assert "classifier" in templates
    assert "tools" in templates
    assert "answer" in templates
    assert "artifact" in templates

    # Context map with sample values to test rendering without leaks
    sample_context = {
        "supervisor": {"domain": "sales", "db_name": "retail.db"},
        "sql_analyst": {"dialect": "sqlite", "schema": "CREATE TABLE orders (id INT, total FLOAT);"},
        "office_writer": {"doc_type": "excel", "title": "Báo cáo doanh số"},
        "classifier": {"allowed_modes": "sql, office, report"},
        "tools": {"tool_name": "execute_sql"},
        "answer": {"query_context": "Revenue query", "thought_id": "t1", "dialect": "sqlite", "chart_type": "bar", "artifact_type": "excel", "title": "BC"},
        "artifact": {"artifact_kind": "excel", "artifact_title": "P&L", "thought_id": "t2", "dialect": "sqlite", "chart_type": "line", "artifact_type": "excel", "title": "P&L"},
        "diagnostic": {"error_message": "no such column: rev"},
        "explorer": {"tables": "orders, customers"},
        "report": {"topic": "Q3 Revenue Review"},
        "researcher": {"search_query": "e-commerce benchmark 2026"},
    }

    for tpl in templates:
        ctx = sample_context.get(tpl, {})
        rendered = pm.render(tpl, ctx, check_unrendered=True)
        assert len(rendered) > 10, f"Template {tpl} rendered unexpectedly empty"
        assert "{{" not in rendered, f"Template {tpl} left unrendered placeholders: {rendered}"
