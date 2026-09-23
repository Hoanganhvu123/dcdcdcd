"""core/state.py — State partitioning for DB-GPT Analyst multi-agent architecture.

Partitions monolithic agent state into clean TypedDict models:
- SupervisorState: High-level orchestration, user interaction, routing, aggregation.
- WorkerState: Base state for isolated subagent execution.
- SQLAgentState: SQL generation, schema retrieval, query execution, validation.
- DataEngineerState: Data profiling, schema migration, cleaning, ingestion.
- DiagnosticState: Root-cause diagnosis and causal anomaly analysis.
- MainAgentState: Backward-compatible unified state container.
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict


class WorkerState(TypedDict, total=False):
    """Clean isolated base state for worker subagents."""
    agent_id: str
    parent_agent_id: str | None
    session_id: str | None
    task: str
    status: str
    history: list[dict[str, Any]]
    tools_called: list[str]
    result: Any
    error: str | None
    steps: Annotated[list[dict[str, Any]], operator.add]


class SupervisorState(TypedDict, total=False):
    """Supervisor orchestration state."""
    question: str
    session_id: str | None
    agent_id: str | None
    parent_agent_id: str | None
    implementation_plan: str | None
    user_feedback: str | None
    session_history: str | None
    query_type: str | None
    force_query_type: str | None
    detected_intent: str | None
    intent_reasoning: str | None
    clarifier_assumptions: str | None
    selected_subagent: str | None
    sub_results: Annotated[list[dict[str, Any]], operator.add]
    answer: str | None
    chart: dict[str, Any] | None
    display_type: str | None
    report_markdown: str | None
    followup_questions: list[dict[str, Any]] | None
    error: str | None
    steps: Annotated[list[dict[str, Any]], operator.add]


class SQLAgentState(TypedDict, total=False):
    """Specialized state for SQL generation, validation, and execution."""
    question: str
    session_id: str | None
    agent_id: str | None
    anchor_table: str
    allowed_tables: list[str]
    source_ids: list[int]
    selected_tables: list[str]
    schemas_text: str
    map_qualified: dict[str, Any]
    db_type: str
    generated_sql: str | None
    sql_reasoning_plan: str | None
    query_results: list[dict[str, Any]]
    error: str | None
    retry_count: int
    validation_retry_count: int | None
    execution_retry_count: int | None
    have_retry: bool | None
    validation_result: dict[str, Any] | None
    critic_verdict: str | None
    critic_retry_count: int
    critic_fix_hint: str | None
    retry_history: list[dict[str, Any]] | None
    golden_sqls: str | None
    golden_sqls_data: list[dict[str, Any]] | None
    business_docs: str | None
    schema_descriptions: list[dict[str, Any]] | None
    answer: str | None
    chart: dict[str, Any] | None
    display_type: str | None
    steps: Annotated[list[dict[str, Any]], operator.add]


class DataEngineerState(TypedDict, total=False):
    """Specialized state for Data Engineer profiling and data operations."""
    agent_id: str | None
    session_id: str | None
    task: str | None
    de_mode: str | None
    test_db_path: str | None
    db_path: str | None
    table_names: list[str] | None
    file_bytes: bytes | None
    data_engineer_report: str | None
    status: str | None
    error: str | None
    steps: Annotated[list[dict[str, Any]], operator.add]


class DiagnosticState(TypedDict, total=False):
    """Specialized state for root-cause and anomaly diagnostics."""
    angle: str
    question: str
    parent_context: dict[str, Any]
    generated_sql: str | None
    query_results: list[dict[str, Any]]
    retry_count: int
    fix_hint: str | None
    error: str | None
    mini_summary: str
    steps: Annotated[list[dict[str, Any]], operator.add]


class MainAgentState(TypedDict, total=False):
    """Unified backward-compatible state container across all subgraphs."""
    question: str
    session_id: str | None
    agent_id: str | None
    parent_agent_id: str | None
    implementation_plan: str | None
    user_feedback: str | None
    anchor_table: str
    allowed_tables: list[str]
    source_ids: list[int]
    selected_tables: list[str]
    schemas_text: str
    map_qualified: dict[str, Any]
    db_type: str
    generated_sql: str | None
    query_results: list[dict[str, Any]]
    error: str | None
    retry_count: int
    validation_retry_count: int | None
    execution_retry_count: int | None
    have_retry: bool | None
    answer: str | None
    chart: dict[str, Any] | None
    display_type: str | None
    session_history: str | None
    golden_sqls: str | None
    business_docs: str | None
    steps: Annotated[list[dict[str, Any]], operator.add]
    # Deep agent extensions
    plan_steps: list[str] | None
    search_queries: list[str] | None
    urls_to_scrape: list[str] | None
    is_sufficient: bool | None
    query_type: str | None
    force_query_type: str | None
    web_findings: Annotated[list[str], operator.add]
    exploration_log: Annotated[list[dict[str, Any]], operator.add]
    validation_result: dict[str, Any] | None
    critic_verdict: str | None
    critic_retry_count: int
    critic_fix_hint: str | None
    # WrenAI-ported extensions
    golden_sqls_data: list[dict[str, Any]] | None
    schema_descriptions: list[dict[str, Any]] | None
    followup_questions: list[dict[str, Any]] | None
    detected_intent: str | None
    intent_reasoning: str | None
    clarifier_assumptions: str | None
    # Multi-Agent extensions
    data_engineer_report: str | None
    report_markdown: str | None
    sql_reasoning_plan: str | None
    retry_history: list[dict[str, Any]] | None
    de_mode: str | None
    test_db_path: str | None
    db_path: str | None
    table_names: list[str] | None
    file_bytes: bytes | None


def create_clean_state(task_description: str, parent_agent_id: str) -> dict[str, Any]:
    """
    Tạo một 'Bể bơi sạch' (Clean State) cho Sub-agent.
    Tuyệt đối không truyền nguyên cục State của Orchestrator (Mẹ) sang.
    """
    import uuid
    new_agent_id = f"sub-{uuid.uuid4().hex[:8]}"

    clean_state: dict[str, Any] = {
        "agent_id": new_agent_id,
        "parent_agent_id": parent_agent_id,
        "task": task_description,
        "history": [],
        "tools_called": [],
        "result": None,
        "status": "running",
        "steps": [],
    }
    return clean_state


def merge_subagent_result(
    parent_state: dict[str, Any], sub_agent_result: Any, key: str = "sub_results"
) -> dict[str, Any]:
    """Hàm để Mẹ gom kết quả của Đệ về."""
    if key not in parent_state or parent_state[key] is None:
        parent_state[key] = []
    parent_state[key].append(sub_agent_result)
    return parent_state
