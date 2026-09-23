"""Progressive Skills Registry package for DB-GPT Analyst.

Standardized 100% with the Senior Staff progressive disclosure pattern:
- Level 1: YAML metadata scanning (tokens <= 650)
- Level 2: Lazy markdown procedure loading via load_skill
"""

from .registry import SkillMetadata, SkillRegistry, get_skill_registry
from .tool import load_skill

__all__ = [
    "SkillRegistry",
    "SkillMetadata",
    "load_skill",
    "get_skill_registry",
]
