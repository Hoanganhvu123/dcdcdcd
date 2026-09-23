"""nodes/doc_compose_node.py — Office Document & Artifact Composer Node.

Canonically maps to cuccu_legal node architecture:
- Composes formal Kimi A4 DOCX executive memos
- Authors structured multi-tab Excel XLSX workbooks with formulas
- Drafs 16:9 presentation slide decks
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.nodes.artifact_node import artifact_node

logger = logging.getLogger(__name__)


@observe(name="doc_compose_node")
async def doc_compose_node(
    state: dict[str, Any], config: RunnableConfig
) -> dict[str, Any]:
    """Compose Kimi A4 DOCX or Excel XLSX artifact draft."""
    return await artifact_node(state, config=config)


__all__ = ["doc_compose_node"]
