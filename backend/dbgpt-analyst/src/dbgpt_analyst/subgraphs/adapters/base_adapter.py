"""subgraphs/adapters/base_adapter.py — Helper dung MainAgentState tam tu subgraph state.

Adapter layer: map giua SubgraphState (state rieng, co lap memory) <-> MainAgentState
(shared state cua flat graph). Node goc trong nodes/ KHONG bi sua — adapter chi
dong vai tro "phien dich" state ra/vao.

Pattern:
    1. Dung dict MainAgentState-compatible tu parent_context + subgraph fields
    2. Goi node goc (import tu nodes/)
    3. Map ket qua ve subgraph state
"""
from __future__ import annotations

from typing import Any


def build_parent_state(parent_context: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    """Dung MainAgentState-compatible dict tu parent_context snapshot.

    Chi dien cac field ma node goc thuc su doc (khong phai ca 49 fields).
    parent_context = snapshot tu flat graph luc fan-out (gui qua Send hoac invoke).

    Fields duoc dien:
      node_generate_sql doc (sql_generator.py:25-32, 72):
        question, schemas_text, selected_tables, session_history,
        golden_sqls, business_docs, critic_fix_hint
      node_execute_sql doc (execution.py:46-47, 71, 142, 160, 164):
        generated_sql, retry_count, map_qualified, anchor_table, question, datasource
    """
    base: dict[str, Any] = {
        # --- node_generate_sql fields ---
        "question": parent_context.get("question", ""),
        "schemas_text": parent_context.get("schemas_text", ""),
        "selected_tables": parent_context.get("selected_tables", []),
        "session_history": parent_context.get("session_history", ""),
        "golden_sqls": parent_context.get("golden_sqls", ""),
        "business_docs": parent_context.get("business_docs", ""),
        # --- node_execute_sql fields ---
        "map_qualified": parent_context.get("map_qualified", {}),
        "anchor_table": parent_context.get("anchor_table", ""),
        "datasource": parent_context.get("datasource", ""),
        "db_type": parent_context.get("db_type", "postgresql"),
        # --- shared defaults ---
        "retry_count": 0,
        "error": None,
        "generated_sql": None,
        "query_results": [],
        "steps": [],
    }
    base.update(overrides)
    return base
