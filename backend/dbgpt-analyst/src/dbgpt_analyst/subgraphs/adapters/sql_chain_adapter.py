"""subgraphs/adapters/sql_chain_adapter.py — Adapter cho node_generate_sql + node_execute_sql.

Moi adapter:
    1. Nhan DiagnosticState (subgraph state rieng)
    2. Dung MainAgentState tam qua build_parent_state()
    3. Goi node goc (KHONG sua node goc)
    4. Map ket qua ve DiagnosticState

Node goc duoc import truc tiep tu nodes/ — reuse 100% logic.
"""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.nodes.execution import node_execute_sql
from dbgpt_analyst.nodes.sql_generator import node_generate_sql
from dbgpt_analyst.subgraphs.adapters.base_adapter import build_parent_state
from dbgpt_analyst.common.langfuse_client import observe

logger = logging.getLogger(__name__)


@observe(name="adapt_generate_sql")
async def adapt_generate_sql(state: dict[str, Any], config: RunnableConfig) -> dict[str, Any]:
    """Adapter: goi node_generate_sql voi angle_question thay cho question goc.

    Flow:
        DiagnosticState -> MainAgentState tam (question = angle_question)
        -> node_generate_sql(tmp, config)    [code trong nodes/sql_generator.py]
        -> map result ve DiagnosticState
    """
    parent_ctx = state.get("parent_context", {})
    angle_question = state.get("angle_question", parent_ctx.get("question", ""))

    # 1. Dung MainAgentState tam — question = angle_question (khong phai question goc)
    tmp = build_parent_state(
        parent_ctx,
        question=angle_question,
        retry_count=state.get("retry_count", 0),
        error=state.get("error"),
        critic_fix_hint=state.get("fix_hint"),
    )

    # 2. Goi node goc (KHONG sua node goc)
    result = await node_generate_sql(tmp, config)

    # 3. Map nguoc ve DiagnosticState
    return {
        "generated_sql": result.get("generated_sql"),
        "error": result.get("error"),
        "retry_count": result.get("retry_count", state.get("retry_count", 0)),
        "steps": result.get("steps", []),
    }


@observe(name="adapt_execute_sql")
async def adapt_execute_sql(state: dict[str, Any], config: RunnableConfig) -> dict[str, Any]:
    """Adapter: goi node_execute_sql voi generated_sql tu subgraph state.

    Flow:
        DiagnosticState -> MainAgentState tam (generated_sql tu subgraph)
        -> node_execute_sql(tmp)    [code trong nodes/execution.py]
        -> map result ve DiagnosticState
    """
    parent_ctx = state.get("parent_context", {})

    # 1. Dung MainAgentState tam
    tmp = build_parent_state(
        parent_ctx,
        generated_sql=state.get("generated_sql"),
        retry_count=state.get("retry_count", 0),
    )

    # 2. Goi node goc (KHONG sua node goc — node_execute_sql khong nhan config)
    result = await node_execute_sql(tmp)

    # 3. Map nguoc ve DiagnosticState
    return {
        "query_results": result.get("query_results", []),
        "generated_sql": result.get("generated_sql"),
        "error": result.get("error"),
        "retry_count": result.get("retry_count", state.get("retry_count", 0)),
        "steps": result.get("steps", []),
    }
