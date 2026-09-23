"""nodes/sql_gen_node.py — SQL Generation Node according to Schema Cache.

Canonically maps to cuccu_legal node architecture:
- Generates executable SQL query against cached schema
- Validates syntax and table references
- Emits task events for tracing
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.nodes.sql_generator import node_generate_sql

logger = logging.getLogger(__name__)


@observe(name="sql_gen_node")
async def sql_gen_node(
    state: dict[str, Any], config: RunnableConfig
) -> dict[str, Any]:
    """Generate SQL SELECT query using schema cache and LLM."""
    return await node_generate_sql(state, config)


__all__ = ["sql_gen_node"]
