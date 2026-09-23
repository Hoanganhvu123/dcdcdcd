"""OpenMAIC-Standard File-Based Prompt Compiler & Snippet Engine for DB-GPT Analyst.

Implements multi-stage prompt loading and compilation:
1. Snippet inclusion: {{snippet:name}} -> loads from dbgpt_analyst/prompts/snippets/<name>.md.
   Raises MissingSnippetError if the snippet file is missing.
2. Conditional blocks: {{#if condition}}...{{/if}} and {{#if !condition}}...{{/if}} -> evaluated
   against context truthiness.
3. Variable interpolation: {{varName}} -> substituted with context values (with JSON serialization for dict/list).
4. Token leak sentinel: checks for unrendered {{...}} placeholders and raises
   UnrenderedPlaceholderError if any unrendered token survives compilation.
5. In-memory caching for loaded template and snippet files.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
import re
from typing import Any, ClassVar, Final

logger = logging.getLogger(__name__)


# ─── Exceptions ─────────────────────────────────────────────────────────────

class PromptError(Exception):
    """Base exception for prompt compiler and template errors."""


class TemplateNotFoundError(PromptError):
    """Raised when a requested prompt template file does not exist."""


class MissingSnippetError(PromptError):
    """Raised when a requested snippet file does not exist (prevents silent typos)."""


class UnrenderedPlaceholderError(PromptError):
    """Raised when an unrendered placeholder survives final template compilation."""


# ─── Compiler & Manager ───────────────────────────────────────────────────

class PromptManager:
    """Manager and multi-stage compiler for file-based Markdown prompts."""

    _instance: ClassVar[PromptManager | None] = None

    _SNIPPET_PATTERN: Final[re.Pattern] = re.compile(r"\{\{snippet:([a-zA-Z0-9_\-]+)\}\}")
    _CONDITIONAL_PATTERN: Final[re.Pattern] = re.compile(
        r"\{\{#if\s+(!?)([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}"
    )
    _VAR_PATTERN: Final[re.Pattern] = re.compile(r"\{\{([a-zA-Z0-9_]+)\}\}")
    _LEAK_PATTERN: Final[re.Pattern] = re.compile(r"\{\{[#\/]?[a-zA-Z0-9_\-:]+\}\}")

    def __init__(self, base_dir: Path | str | None = None) -> None:
        if base_dir is None:
            # Default to backend/dbgpt-analyst/src/dbgpt_analyst/prompts directory
            self.base_dir = Path(__file__).resolve().parent
        else:
            self.base_dir = Path(base_dir).resolve()

        self.templates_dir = self.base_dir / "templates"
        self.snippets_dir = self.base_dir / "snippets"
        self._template_cache: dict[str, str] = {}
        self._snippet_cache: dict[str, str] = {}

    @classmethod
    def get_default(cls) -> PromptManager:
        """Get or initialize the default singleton PromptManager instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    get_instance = get_default

    def clear_cache(self) -> None:
        """Clear the in-memory cache of templates and snippets."""
        self._template_cache.clear()
        self._snippet_cache.clear()

    def load_snippet(self, snippet_id: str, *, use_cache: bool = True) -> str:
        """Load reusable markdown snippet by id from snippets/<snippet_id>.md.

        Raises MissingSnippetError if the snippet file does not exist.
        """
        if use_cache and snippet_id in self._snippet_cache:
            return self._snippet_cache[snippet_id]

        snippet_path = self.snippets_dir / f"{snippet_id}.md"
        if not snippet_path.is_file():
            raise MissingSnippetError(
                f"Snippet '{snippet_id}' not found at {snippet_path}. "
                f"Available snippets: {self.list_snippets()}"
            )
        content = snippet_path.read_text(encoding="utf-8").strip()
        if use_cache:
            self._snippet_cache[snippet_id] = content
        return content

    def process_snippets(self, template: str, max_depth: int = 5) -> str:
        """Splice snippet includes {{snippet:name}} into the template.

        Supports nested snippets up to max_depth.
        """
        curr = template
        depth = 0
        while self._SNIPPET_PATTERN.search(curr):
            if depth >= max_depth:
                raise PromptError(f"Snippet recursion depth exceeded limit ({max_depth})")

            def _repl(match: re.Match) -> str:
                snippet_id = match.group(1)
                return self.load_snippet(snippet_id)

            curr = self._SNIPPET_PATTERN.sub(_repl, curr)
            depth += 1
        return curr

    def process_conditional_blocks(
        self, template: str, conditions: dict[str, Any]
    ) -> str:
        """Evaluate conditional blocks {{#if condition}}...{{/if}}.

        Includes inner content if condition evaluates to truthy; removes block if falsy.
        Supports inverted conditions {{#if !condition}}...{{/if}}.
        """
        def _repl(match: re.Match) -> str:
            negated = match.group(1) == "!"
            cond_key = match.group(2)
            content = match.group(3)

            val = conditions.get(cond_key)
            is_truthy = bool(val)
            if negated:
                is_truthy = not is_truthy

            return content if is_truthy else ""

        return self._CONDITIONAL_PATTERN.sub(_repl, template)

    def interpolate_variables(
        self, template: str, variables: dict[str, Any]
    ) -> str:
        """Substitute {{varName}} placeholders with variables values."""
        def _repl(match: re.Match) -> str:
            key = match.group(1)
            if key not in variables:
                # Leave unrendered for sentinel check
                return match.group(0)

            val = variables[key]
            if val is None:
                return ""
            if isinstance(val, (dict, list)):
                return json.dumps(val, ensure_ascii=False, indent=2)
            return str(val)

        return self._VAR_PATTERN.sub(_repl, template)

    def _read_template_raw(self, template_name: str, filename: str = "system.md", *, use_cache: bool = True) -> str:
        """Read raw template content from templates/<template_name>/<filename> or templates/<template_name>.md."""
        cache_key = f"{template_name}:{filename}"
        if use_cache and cache_key in self._template_cache:
            return self._template_cache[cache_key]

        # Check directory structure templates/<template_name>/<filename>
        target_path = self.templates_dir / template_name / filename
        if not target_path.is_file():
            # Check fallback single-file templates/<template_name>.md if system.md requested
            fallback_path = self.templates_dir / f"{template_name}.md"
            if filename == "system.md" and fallback_path.is_file():
                target_path = fallback_path
            else:
                raise TemplateNotFoundError(
                    f"Template '{template_name}' ({filename}) not found at {target_path}. "
                    f"Available templates: {self.list_templates()}"
                )

        content = target_path.read_text(encoding="utf-8").strip()
        if use_cache:
            self._template_cache[cache_key] = content
        return content

    def render(
        self,
        template_name: str,
        context: dict[str, Any] | None = None,
        *,
        check_unrendered: bool = True,
        use_cache: bool = True,
    ) -> str:
        """Render a system prompt template end-to-end.

        Processing order:
        1. Snippet resolution ({{snippet:name}})
        2. Conditional blocks ({{#if flag}}...{{/if}})
        3. Variable interpolation ({{variable}})
        4. Token leak guard (detects unrendered {{...}} placeholders)
        """
        raw_content = self._read_template_raw(template_name, "system.md", use_cache=use_cache)
        ctx = context or {}

        # 1. Snippets
        step1 = self.process_snippets(raw_content)

        # 2. Conditionals
        step2 = self.process_conditional_blocks(step1, ctx)

        # 3. Variable interpolation
        step3 = self.interpolate_variables(step2, ctx)

        # 4. Sentinel check
        if check_unrendered:
            leftovers = self._LEAK_PATTERN.findall(step3)
            if leftovers:
                raise UnrenderedPlaceholderError(
                    f"Unrendered placeholder(s) detected in template '{template_name}': {leftovers}. "
                    f"Context provided keys: {list(ctx.keys())}"
                )

        return step3.strip()

    def render_user(
        self,
        template_name: str,
        context: dict[str, Any] | None = None,
        *,
        check_unrendered: bool = True,
        use_cache: bool = True,
    ) -> str | None:
        """Render an optional user.md template."""
        user_path = self.templates_dir / template_name / "user.md"
        if not user_path.is_file():
            return None

        raw_content = self._read_template_raw(template_name, "user.md", use_cache=use_cache)
        ctx = context or {}

        step1 = self.process_snippets(raw_content)
        step2 = self.process_conditional_blocks(step1, ctx)
        step3 = self.interpolate_variables(step2, ctx)

        if check_unrendered:
            leftovers = self._LEAK_PATTERN.findall(step3)
            if leftovers:
                raise UnrenderedPlaceholderError(
                    f"Unrendered placeholder(s) detected in user template '{template_name}': {leftovers}. "
                    f"Context provided keys: {list(ctx.keys())}"
                )

        return step3.strip()

    def build_prompt(
        self,
        template_name: str,
        context: dict[str, Any] | None = None,
        *,
        check_unrendered: bool = True,
        use_cache: bool = True,
    ) -> dict[str, str]:
        """Build both system and user prompt strings for an LLM call."""
        system_text = self.render(
            template_name, context, check_unrendered=check_unrendered, use_cache=use_cache
        )
        user_text = self.render_user(
            template_name, context, check_unrendered=check_unrendered, use_cache=use_cache
        )
        return {
            "system": system_text,
            "user": user_text or "",
        }

    def list_templates(self) -> list[str]:
        """List all available template names."""
        if not self.templates_dir.is_dir():
            return []
        names = set()
        for p in self.templates_dir.iterdir():
            if p.is_dir() and (p / "system.md").is_file():
                names.add(p.name)
            elif p.is_file() and p.suffix == ".md":
                names.add(p.stem)
        return sorted(names)

    def list_snippets(self) -> list[str]:
        """List all available snippet names."""
        if not self.snippets_dir.is_dir():
            return []
        return sorted(
            p.stem for p in self.snippets_dir.iterdir()
            if p.is_file() and p.suffix == ".md"
        )

    # ─── Static Convenience API ──────────────────────────────────────────────

    @classmethod
    def render_template(
        cls,
        template_name: str,
        context: dict[str, Any] | None = None,
        *,
        check_unrendered: bool = True,
    ) -> str:
        """Static shorthand for render."""
        return cls.get_default().render(
            template_name, context, check_unrendered=check_unrendered
        )

    @classmethod
    def get_snippet(cls, snippet_id: str) -> str:
        """Static shorthand for load_snippet."""
        return cls.get_default().load_snippet(snippet_id)


__all__ = [
    "MissingSnippetError",
    "PromptError",
    "PromptManager",
    "TemplateNotFoundError",
    "UnrenderedPlaceholderError",
]
