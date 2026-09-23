#!/usr/bin/env python3
"""scripts/ast_sentinel_auditor.py — Static AST Auditor for Prompt Purity.

Statically analyzes Python source files using the standard library `ast` module
to verify that ZERO hardcoded system prompts or instructional prompt templates
exist outside the designated `prompts/` single-source-of-truth directory.

Enforces:
1. No multi-line instructional strings ("You are", "Bạn là", "nhiệm vụ", "system prompt", etc.)
   defined inline outside prompts/.
2. No direct message constructors with raw prompt templates outside prompts/.
3. Exemption of genuine module/class/function docstrings, logging, and exceptions.
"""

from __future__ import annotations

import ast
import os
from pathlib import Path
import sys

# Configure UTF-8 for console output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import re

EXCLUDED_DIRS = {
    "prompts",
    "__pycache__",
    ".git",
    ".venv",
    "venv",
    "tests",
    ".pytest_cache",
    "site-packages",
    "deepagents",  # Vendored SDK
}

PROMPT_REGEXES = [
    re.compile(r"\byou are (an?|the|a senior|a data|a research|an ai)\b", re.IGNORECASE),
    re.compile(r"^\s*you are\b", re.IGNORECASE | re.MULTILINE),
    re.compile(r"\bbạn là\b", re.IGNORECASE),
    re.compile(r"\bnhiệm vụ của bạn là\b", re.IGNORECASE),
    re.compile(r"\bsystem prompt\b", re.IGNORECASE),
    re.compile(r"\bquy tắc bắt buộc:\b", re.IGNORECASE),
    re.compile(r"\byêu cầu output:\b", re.IGNORECASE),
    re.compile(r"\btiêu chí chọn:\b", re.IGNORECASE),
]


def is_prompt_text(text: str) -> bool:
    """Determine if a string represents an instructional or system prompt."""
    if len(text) < 50:
        return False
    return any(r.search(text) for r in PROMPT_REGEXES)



class DocstringCollector(ast.NodeVisitor):
    """Collects all docstring AST nodes so they can be exempted."""

    def __init__(self) -> None:
        self.docstring_nodes: set[ast.AST] = set()

    def visit_Module(self, node: ast.Module) -> None:
        if (
            node.body
            and isinstance(node.body[0], ast.Expr)
            and isinstance(node.body[0].value, ast.Constant)
            and isinstance(node.body[0].value.value, str)
        ):
            self.docstring_nodes.add(node.body[0].value)
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        if (
            node.body
            and isinstance(node.body[0], ast.Expr)
            and isinstance(node.body[0].value, ast.Constant)
            and isinstance(node.body[0].value.value, str)
        ):
            self.docstring_nodes.add(node.body[0].value)
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        if (
            node.body
            and isinstance(node.body[0], ast.Expr)
            and isinstance(node.body[0].value, ast.Constant)
            and isinstance(node.body[0].value.value, str)
        ):
            self.docstring_nodes.add(node.body[0].value)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        if (
            node.body
            and isinstance(node.body[0], ast.Expr)
            and isinstance(node.body[0].value, ast.Constant)
            and isinstance(node.body[0].value.value, str)
        ):
            self.docstring_nodes.add(node.body[0].value)
        self.generic_visit(node)


class PromptPurityVisitor(ast.NodeVisitor):
    """Scans AST for hardcoded prompt strings or direct message constructor leaks."""

    def __init__(self, filename: str, docstring_nodes: set[ast.AST]) -> None:
        self.filename = filename
        self.docstring_nodes = docstring_nodes
        self.violations: list[tuple[int, str]] = []
        self._call_stack: list[ast.AST] = []

    def visit_Call(self, node: ast.Call) -> None:
        self._call_stack.append(node)
        
        func_name = ""
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            func_name = node.func.attr

        # Check direct message constructors: SystemMessage(content="raw prompt...")
        if func_name in ("SystemMessage", "HumanMessage"):
            for arg in node.args:
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    if is_prompt_text(arg.value):
                        self.violations.append(
                            (node.lineno, f"Direct hardcoded prompt in {func_name} constructor: {arg.value[:60]!r}...")
                        )
            for kw in node.keywords:
                if kw.arg == "content" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                    if is_prompt_text(kw.value.value):
                        self.violations.append(
                            (node.lineno, f"Direct hardcoded prompt in {func_name}(content=...): {kw.value.value[:60]!r}...")
                        )

        self.generic_visit(node)
        self._call_stack.pop()

    def visit_Constant(self, node: ast.Constant) -> None:
        if node in self.docstring_nodes:
            self.generic_visit(node)
            return

        if isinstance(node.value, str) and is_prompt_text(node.value):
            # Ignore if inside logger calls or exception raises
            in_logger_or_exc = False
            for parent in reversed(self._call_stack):
                if isinstance(parent, ast.Call):
                    func_name = ""
                    if isinstance(parent.func, ast.Name):
                        func_name = parent.func.id
                    elif isinstance(parent.func, ast.Attribute):
                        func_name = parent.func.attr
                    if func_name in ("debug", "info", "warning", "error", "critical", "exception", "log"):
                        in_logger_or_exc = True
                        break
                    if func_name.endswith("Error") or func_name.endswith("Exception"):
                        in_logger_or_exc = True
                        break

            if not in_logger_or_exc:
                snippet = node.value.replace("\n", " ")[:70]
                self.violations.append(
                    (node.lineno, f"Hardcoded instructional prompt string detected: {snippet!r}...")
                )

        self.generic_visit(node)

    def visit_JoinedStr(self, node: ast.JoinedStr) -> None:
        # Check f-string components
        pieces = []
        for val in node.values:
            if isinstance(val, ast.Constant) and isinstance(val.value, str):
                pieces.append(val.value)
        combined = " ".join(pieces)
        if is_prompt_text(combined):
            # Check call stack
            in_logger = False
            for parent in reversed(self._call_stack):
                if isinstance(parent, ast.Call):
                    func_name = ""
                    if isinstance(parent.func, ast.Name):
                        func_name = parent.func.id
                    elif isinstance(parent.func, ast.Attribute):
                        func_name = parent.func.attr
                    if func_name in ("debug", "info", "warning", "error", "critical", "exception", "log"):
                        in_logger = True
                        break
            if not in_logger:
                snippet = combined.replace("\n", " ")[:70]
                self.violations.append(
                    (node.lineno, f"Hardcoded instructional f-string prompt detected: {snippet!r}...")
                )
        self.generic_visit(node)


def audit_path(root_path: Path) -> tuple[int, int, list[tuple[str, int, str]]]:
    """Audit all python files in root_path.

    Returns:
        (total_files_scanned, total_violations, violation_details)
    """
    total_files = 0
    all_violations: list[tuple[str, int, str]] = []

    if root_path.is_file():
        py_files = [root_path]
    else:
        py_files = sorted(root_path.rglob("*.py"))

    for py_file in py_files:
        # Check exclusions
        parts = set(py_file.parts)
        if any(exc in parts for exc in EXCLUDED_DIRS):
            continue

        try:
            content = py_file.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError:
            try:
                content = py_file.read_text(encoding="latin-1")
            except Exception as e:
                print(f"[ERROR] Cannot read {py_file}: {e}", file=sys.stderr)
                continue

        try:
            tree = ast.parse(content, filename=str(py_file))
        except SyntaxError as e:
            print(f"[ERROR] Syntax error parsing {py_file}: {e}", file=sys.stderr)
            all_violations.append((str(py_file), e.lineno or 0, f"SyntaxError: {e}"))
            continue

        total_files += 1

        # Exempt docstrings
        doc_collector = DocstringCollector()
        doc_collector.visit(tree)

        # Audit prompt purity
        visitor = PromptPurityVisitor(str(py_file), doc_collector.docstring_nodes)
        visitor.visit(tree)

        for lineno, msg in visitor.violations:
            all_violations.append((str(py_file), lineno, msg))

    return total_files, len(all_violations), all_violations


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    default_target = repo_root / "backend" / "dbgpt-analyst" / "src" / "dbgpt_analyst"

    if len(sys.argv) > 1:
        target_path = Path(sys.argv[1]).resolve()
    else:
        target_path = default_target.resolve()

    print(f"============================================================")
    print(f"  AST Sentinel Auditor — Static Prompt Purity Verification")
    print(f"  Target: {target_path}")
    print(f"  Single Source of Truth: prompts/ (Exempt)")
    print(f"============================================================\n")

    if not target_path.exists():
        print(f"[ERROR] Target path does not exist: {target_path}", file=sys.stderr)
        return 2

    files_scanned, violation_count, violations = audit_path(target_path)

    print(f"Scanned {files_scanned} Python file(s).")

    if violation_count == 0:
        print("\n✅ AST SENTINEL PASSED: 0 hardcoded prompts found outside prompts/.")
        print("All system prompt templates are cleanly decoupled and imported.")
        return 0

    print(f"\n❌ AST SENTINEL FAILED: {violation_count} prompt purity violation(s) detected:\n")
    for file_path, lineno, msg in violations:
        rel_path = file_path
        try:
            rel_path = os.path.relpath(file_path, str(repo_root))
        except Exception:
            pass
        print(f"  [VIOLATION] {rel_path}:{lineno} -> {msg}")

    print("\nPlease refactor these prompts into dbgpt_analyst.prompts to satisfy architecture contracts.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
