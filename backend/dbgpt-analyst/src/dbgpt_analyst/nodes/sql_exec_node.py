"""nodes/sql_exec_node.py — SQL Execution Node via Safe Sandbox & Adapters.

Canonically maps to cuccu_legal node architecture:
- Executes SQL via safe database adapter or sandbox
- Enforces AST-level query guards (SELECT only, limits)
- Captures row results and execution telemetry
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.nodes.execution import node_execute_sql

logger = logging.getLogger(__name__)


@observe(name="sql_exec_node")
async def sql_exec_node(
    state: dict[str, Any]
) -> dict[str, Any]:
    """Execute SQL query safely and capture result rows."""
    return await node_execute_sql(state)


__all__ = ["sql_exec_node"]
