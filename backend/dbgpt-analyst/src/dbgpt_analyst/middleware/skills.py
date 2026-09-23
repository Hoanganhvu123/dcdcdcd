"""skills.py — SkillsMiddleware wired to DB-GPT's skill store (not a port).

The original repo carried its own `skills_reference.py` / SkillsMiddleware. DB-GPT
already ships its own skill store (`SKILLS_DIR`, managed through
`dbgpt.agent.skill.manage.get_skill_manager` and used by `agentic_data_api.py`),
so instead of porting a private loader we hand the pip `SkillsMiddleware`
(deepagents) a backend that reads DB-GPT's skills directory directly.

Mapping:
    - DB-GPT skill store: `dbgpt.configs.model_config.SKILLS_DIR` — a directory of
      `skill-name/SKILL.md` folders, exactly the layout `SkillsMiddleware`
      scans (`source_path/<skill-name>/SKILL.md`).
    - `get_skill_manager()` returns an in-memory `SkillManager`; the actual skill
      files live on disk under `SKILLS_DIR`, so the sources given to deepagents
      are filesystem paths rooted at that directory.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Sequence

    from dbgpt_analyst.libs.deepagents import SkillSource, SkillsMiddleware


def build_skills_middleware(
    system_app: Any = None,
    sources: Sequence[SkillSource] | None = None,
) -> Any:  # type: ignore[type-arg]
    """Build a deepagents `SkillsMiddleware` over DB-GPT's skills directory.

    Args:
        system_app: Optional DB-GPT SystemApp to resolve the skill manager from.
        sources: Optional explicit list of skill sources (paths or ``(path,
            label)`` tuples, relative to the DB-GPT skills directory) to expose.
            Defaults to all skills at the store root, labelled "DB-GPT".

    Returns:
        A configured `deepagents.middleware.skills.SkillsMiddleware` instance.
    """
    from dbgpt.agent.skill.manage import get_skill_manager
    from dbgpt.configs.model_config import SKILLS_DIR
    from dbgpt_analyst.libs.deepagents import FilesystemBackend, SkillsMiddleware

    # Touch the DB-GPT skill manager so its lifecycle matches the rest of the app.
    get_skill_manager(system_app)  # type: ignore[arg-type]

    import os

    if sources is None:
        sources = [("/", "DB-GPT")] if os.path.isdir(SKILLS_DIR) else []
    if not os.path.isdir(SKILLS_DIR) or not sources:
        return None

    if SkillsMiddleware is None:
        return None

    backend = FilesystemBackend(root_dir=SKILLS_DIR, virtual_mode=True)
    return SkillsMiddleware(backend=backend, sources=list(sources))


__all__ = ["build_skills_middleware"]