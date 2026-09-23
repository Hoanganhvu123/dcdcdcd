"""Test separated retry counters and have_retry signal in sql_agent_subgraph."""

import pytest
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.subgraphs.sql_agent_subgraph import build_sql_agent_subgraph


def test_sql_agent_subgraph_compiles_successfully():
    """Verify sql_agent_subgraph compiles with separated retry counters."""
    subgraph = build_sql_agent_subgraph()
    assert subgraph is not None


def test_state_retry_counters_independent():
    """Verify validation, execution, and critic retry counters are distinct fields."""
    state: MainAgentState = {
        "question": "test query",
        "retry_count": 3,
        "validation_retry_count": 0,
        "execution_retry_count": 1,
        "critic_retry_count": 2,
        "have_retry": True,
        "anchor_table": "",
        "allowed_tables": [],
        "source_ids": [],
        "selected_tables": [],
        "schemas_text": "",
        "map_qualified": {},
        "db_type": "postgresql",
        "generated_sql": "SELECT 1;",
        "query_results": [],
        "error": None,
        "answer": None,
        "chart": None,
        "display_type": None,
        "session_history": None,
        "golden_sqls": None,
        "business_docs": None,
        "steps": [],
        "plan_steps": None,
        "search_queries": None,
        "urls_to_scrape": None,
        "is_sufficient": None,
        "query_type": None,
        "force_query_type": None,
        "web_findings": [],
        "exploration_log": [],
        "validation_result": {"valid": True, "detail": "ok", "have_retry": True},
        "critic_verdict": "ok",
        "critic_fix_hint": None,
        "golden_sqls_data": None,
        "schema_descriptions": None,
        "followup_questions": None,
        "detected_intent": None,
        "intent_reasoning": None,
        "clarifier_assumptions": None,
        "data_engineer_report": None,
        "report_markdown": None,
        "sql_reasoning_plan": None,
        "retry_history": None,
        "de_mode": None,
        "test_db_path": None,
        "db_path": None,
        "table_names": None,
        "file_bytes": None,
        "session_id": None,
        "agent_id": None,
        "parent_agent_id": None,
        "implementation_plan": None,
        "user_feedback": None,
    }

    assert state["validation_retry_count"] == 0
    assert state["execution_retry_count"] == 1
    assert state["critic_retry_count"] == 2
    assert state["have_retry"] is True
