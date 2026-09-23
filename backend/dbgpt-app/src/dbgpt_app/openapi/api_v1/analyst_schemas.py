from typing import Any

from pydantic import BaseModel


class SQLStreamRequest(BaseModel):
    question: str
    anchor_table: str = ""
    allowed_tables: list[str] = []
    source_ids: list[int] = []
    model: str | None = None
    session_id: str | None = None


class StoreQueryRequest(BaseModel):
    nl_query: str
    sql_query: str
    table_names: list[str] = []
    datasource: str = ""
    tags: str = "source:user"


class RecallRequest(BaseModel):
    query: str
    limit: int = 3
    table_names: list[str] | None = None
    datasource: str | None = None


class LoadQueriesRequest(BaseModel):
    pairs: list[dict]
    overwrite: bool = False
    upsert: bool = False


class DeleteQueriesRequest(BaseModel):
    ids: list[int]


class DescriptionRequest(BaseModel):
    table_name: str
    column_name: str | None = None
    description: str = ""
    business_name: str = ""
    accepted_values: str = ""
    is_primary_key: bool = False
    data_type: str = ""
    expression: str = ""
    is_calculated: bool = False
    relationships: str = ""


class SqlToQuestionRequest(BaseModel):
    sql: str
    context: str | None = None


class ToMetricSqlRequest(BaseModel):
    description: str
    context: str | None = None


class ToInsightRequest(BaseModel):
    chart_type: str | None = None
    title: str | None = None
    columns: list[str] | None = None
    rows: list[list[Any]] | None = None
    sql: str | None = None


class AskChartRequest(BaseModel):
    question: str
    chart_type: str | None = None
    title: str | None = None
    data: list[dict[str, Any]] | None = None
    summary: str | None = None


class DashboardSummaryRequest(BaseModel):
    dashboard_name: str
    charts: list[dict[str, Any]]  # [{title, chartType, summary, data_preview: [{...}]}]

class SqlExecuteRequest(BaseModel):
    sql: str


class CreateConversationRequest(BaseModel):
    id: str | None = None
    title: str | None = None


class SaveMessageRequest(BaseModel):
    role: str = "user"
    content: str
    sql_used: str | None = None
    chart_spec: str | None = None
    query_results: str | None = None
    report_id: str | None = None
    doc_url: str | None = None
    artifact_kind: str | None = None


class ListenRequest(BaseModel):
    session_id: str


class ChartAdjustRequest(BaseModel):
    current_spec: dict[str, Any]
    instruction: str

