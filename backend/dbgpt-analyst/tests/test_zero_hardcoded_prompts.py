"""AST Sentinel Regression Guard: Zero-Hardcoded Prompts Policy for DB-GPT Analyst.

Enforces:
1. No inline multiline string literals passed directly to SystemMessage(...) across
   the specialized execution nodes (classifier_node, tools_node, answer_node, artifact_node)
   or controller.py.
2. No local multiline prompt definitions or concatenation inside execution nodes.
3. All agent system prompts must be externalized to Markdown files and loaded via PromptManager.
"""

from __future__ import annotations

import ast
from pathlib import Path
import pytest

from dbgpt_analyst.prompts.compiler import (
    MissingSnippetError,
    PromptError,
    PromptManager,
    TemplateNotFoundError,
    UnrenderedPlaceholderError,
)

_MIN_MULTILINE_PROMPT_LEN = 40
_MIN_FSTRING_PROMPT_LEN = 60

PROMPT_DISCRIMINATORS = (
    "you are",
    "bạn là",
    "quy tắc",
    "hướng dẫn",
    "chỉ đạo",
    "yêu cầu",
    "nhiệm vụ",
    "thực thi",
    "<thought",
    "<artifact",
    "<sql",
    "<chart",
    "directive",
    "adversarial",
    "system prompt",
)


def get_target_files() -> list[Path]:
    """Collect all python files that must satisfy the Zero-Hardcoding policy."""
    base_dir = Path("src/dbgpt_analyst") if Path("src/dbgpt_analyst").is_dir() else Path("backend/dbgpt-analyst/src/dbgpt_analyst")
    files: list[Path] = []

    # 1. Specialized agent nodes
    nodes_dir = base_dir / "nodes"
    if nodes_dir.is_dir():
        for fname in ("classifier_node.py", "tools_node.py", "answer_node.py", "artifact_node.py"):
            target = nodes_dir / fname
            if target.is_file():
                files.append(target)

    # 2. Controller
    controller_file = base_dir / "controller.py"
    if controller_file.is_file():
        files.append(controller_file)

    return files


class SystemMessageVisitor(ast.NodeVisitor):
    """AST visitor that checks for inline string literals and local prompt templates."""

    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.violations: list[str] = []
        self.local_strings: dict[str, tuple[int, str]] = {}

    def visit_Assign(self, node: ast.Assign):
        # Index string constants assigned to variables and guard against local prompt definitions
        if isinstance(node.value, (ast.Constant, ast.JoinedStr)):
            val = ""
            if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                val = node.value.value
            elif isinstance(node.value, ast.JoinedStr):
                val = "".join(
                    p.value
                    for p in node.value.values
                    if isinstance(p, ast.Constant) and isinstance(p.value, str)
                )
            for t in node.targets:
                if isinstance(t, ast.Name):
                    self.local_strings[t.id] = (node.lineno, val)
                    # Guard against locally hardcoded prompt templates in execution files
                    if any(kw in t.id.lower() for kw in ("prompt", "system_instruction")):
                        if val and (len(val) > 30 and any(k in val.lower() for k in PROMPT_DISCRIMINATORS)):
                            self.violations.append(
                                f"{self.file_path}:{node.lineno} — Locally hardcoded prompt template assigned to '{t.id}': {val[:60]!r}..."
                            )

        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        func_name = ""
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            func_name = node.func.attr

        if func_name == "SystemMessage":
            content_node = None
            if node.args:
                content_node = node.args[0]
            for kw in node.keywords:
                if kw.arg == "content":
                    content_node = kw.value

            if content_node:
                self._check_content_expression(content_node, node.lineno)

        self.generic_visit(node)

    def _check_content_expression(self, node: ast.AST, lineno: int):
        # 1. Direct string constant
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            val = node.value.strip()
            if ("\n" in val and len(val) > _MIN_MULTILINE_PROMPT_LEN) or (
                len(val) > 25 and any(k in val.lower() for k in PROMPT_DISCRIMINATORS)
            ):
                self.violations.append(
                    f"{self.file_path}:{lineno} — Hardcoded SystemMessage string literal detected: {val[:60]!r}..."
                )
        # 2. JoinedStr (f-string) with multiline raw template
        elif isinstance(node, ast.JoinedStr):
            full_str = ""
            for part in node.values:
                if isinstance(part, ast.Constant) and isinstance(part.value, str):
                    full_str += part.value
            if ("\n" in full_str and len(full_str) > _MIN_FSTRING_PROMPT_LEN) or (
                len(full_str) > 25 and any(k in full_str.lower() for k in PROMPT_DISCRIMINATORS)
            ):
                self.violations.append(
                    f"{self.file_path}:{lineno} — Hardcoded SystemMessage f-string template detected: {full_str[:60]!r}..."
                )
        # 3. Direct reference to locally defined multiline prompt string
        elif isinstance(node, ast.Name) and node.id in self.local_strings:
            assign_lineno, val = self.local_strings[node.id]
            if (
                "\n" in val
                and len(val) > _MIN_MULTILINE_PROMPT_LEN
                and any(k in val.lower() for k in PROMPT_DISCRIMINATORS)
            ):
                self.violations.append(
                    f"{self.file_path}:{lineno} — SystemMessage refers to locally hardcoded prompt variable '{node.id}' defined at line {assign_lineno}: {val[:60]!r}..."
                )


class TestZeroHardcodedPromptsArchitecture:
    """Verify zero-hardcoding policy and PromptManager integration across nodes and controller."""

    def test_target_files_count_and_existence(self):
        target_files = get_target_files()
        assert len(target_files) >= 4, f"Expected at least 4 target files, found: {target_files}"

    def test_no_inline_multiline_system_messages_in_target_files(self):
        target_files = get_target_files()
        all_violations: list[str] = []

        for f in target_files:
            try:
                tree = ast.parse(f.read_text(encoding="utf-8"), filename=str(f))
                visitor = SystemMessageVisitor(f)
                visitor.visit(tree)
                all_violations.extend(visitor.violations)
            except Exception as e:
                pytest.fail(f"Failed to parse {f}: {e}")

        assert not all_violations, (
            "Found hardcoded SystemMessage strings in execution files:\n"
            + "\n".join(all_violations)
            + "\n--> All system prompts must be externalized to markdown and loaded via PromptManager!"
        )

    def test_nodes_use_prompt_manager_calls(self):
        """Verify that specialized nodes invoke PromptManager to retrieve prompts."""
        base_dir = Path("src/dbgpt_analyst") if Path("src/dbgpt_analyst").is_dir() else Path("backend/dbgpt-analyst/src/dbgpt_analyst")
        nodes_to_check = ["classifier_node.py", "answer_node.py", "artifact_node.py"]

        for node_name in nodes_to_check:
            node_path = base_dir / "nodes" / node_name
            assert node_path.is_file(), f"Missing node file: {node_path}"
            code = node_path.read_text(encoding="utf-8")
            tree = ast.parse(code, filename=str(node_path))

            # Check that PromptManager is referenced in AST
            has_prompt_manager = any(
                isinstance(node, ast.Name) and node.id == "PromptManager"
                for node in ast.walk(tree)
            )
            assert has_prompt_manager, f"Node '{node_name}' must use PromptManager to load prompts"

    def test_reexport_contracts_in_prompts_init(self):
        from dbgpt_analyst.prompts import (
            MissingSnippetError,
            PromptError,
            PromptManager,
            TemplateNotFoundError,
            UnrenderedPlaceholderError,
        )
        assert issubclass(TemplateNotFoundError, PromptError)
        assert issubclass(MissingSnippetError, PromptError)
        assert issubclass(UnrenderedPlaceholderError, PromptError)
        assert PromptManager.get_default() is not None

    def test_reexport_contracts_in_nodes_init(self):
        from dbgpt_analyst.nodes import (
            answer_node,
            artifact_node,
            classifier_node,
            tools_node,
        )
        assert callable(answer_node)
        assert callable(artifact_node)
        assert callable(classifier_node)
        assert callable(tools_node)
