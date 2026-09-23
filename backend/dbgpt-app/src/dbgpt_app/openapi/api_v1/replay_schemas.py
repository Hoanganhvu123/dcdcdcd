"""dbgpt_app.openapi.api_v1.replay_schemas

Pydantic V2 schemas for DB-GPT Replay Engine, SSE Streaming Wire Frames,
and AI Analyst Presentation Deck Generation.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field


# ═══════════════════════════════════════════════════════════════════════════
# 1. Replay Session Summary & Index Pagination Schemas
# ═══════════════════════════════════════════════════════════════════════════

class ReplaySessionSummary(BaseModel):
    """Summary record for session listing in Replay Gallery."""
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    session_id: str = Field(..., description="Unique identifier of the execution session", alias="sessionId")
    title: str = Field(..., description="Human-readable title of the session")
    user_query: str = Field(..., description="Original user prompt or business question", alias="userQuery")
    status: Literal["running", "completed", "failed"] = Field(default="completed", description="Lifecycle status")
    created_at: str = Field(..., description="ISO 8601 creation timestamp", alias="createdAt")
    updated_at: str = Field(..., description="ISO 8601 last update timestamp", alias="updatedAt")
    total_turns: int = Field(default=1, ge=0, description="Total conversation turns", alias="totalTurns")
    total_steps: int = Field(default=0, ge=0, description="Total execution/reasoning steps", alias="totalSteps")
    artifact_count: int = Field(default=0, ge=0, description="Total generated artifacts", alias="artifactCount")
    preview_tags: List[str] = Field(default_factory=list, description="Badge tags e.g. ['SQL', '16:9 Slides', 'Excel']", alias="previewTags")
    duration_ms: Optional[int] = Field(default=0, ge=0, description="Total elapsed runtime in milliseconds", alias="durationMs")
    model: Optional[str] = Field(default="deepseek-v4-flash", description="AI model used for reasoning")
    mode: Optional[Literal["slides", "sheets", "docs", "deep-research", "chat"]] = Field(default="slides", description="Primary interaction mode")


class ReplaySessionListEnvelope(BaseModel):
    """Pagination envelope for session listing."""
    model_config = ConfigDict(populate_by_name=True)

    total: int = Field(..., ge=0, description="Total matching sessions count")
    page: int = Field(..., ge=1, description="Current page number")
    page_size: int = Field(..., ge=1, description="Items per page", alias="pageSize")
    total_pages: int = Field(..., ge=0, description="Total available pages", alias="totalPages")
    items: List[ReplaySessionSummary] = Field(default_factory=list, description="List of session summaries")


class ReplaySessionListResponse(BaseModel):
    """Standard API response envelope for GET /api/v1/replay/sessions."""
    model_config = ConfigDict(populate_by_name=True)

    code: int = Field(default=0, description="Response status code (0 for success)")
    message: str = Field(default="success", description="Status message")
    data: ReplaySessionListEnvelope = Field(..., description="Pagination envelope containing session items")


# ═══════════════════════════════════════════════════════════════════════════
# 2. Replay Session Detail, Execution Steps, Thinking & Artifacts
# ═══════════════════════════════════════════════════════════════════════════

class SubThoughtItem(BaseModel):
    """Granular reasoning item within a thinking block."""
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Sub-thought unique ID")
    text: str = Field(..., description="Sub-thought description or hypothesis")
    state: Literal["pending", "running", "completed", "error"] = Field(default="completed", description="Execution state")
    duration_ms: Optional[int] = Field(default=0, ge=0, description="Sub-thought duration in ms", alias="durationMs")


class ReplayThinkingBlock(BaseModel):
    """Collapsible reasoning accordion state (<think> block)."""
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Thinking block unique ID")
    title: str = Field(default="Quá trình suy luận & Lập kế hoạch", description="Thinking block title")
    tokens: int = Field(default=0, ge=0, description="Thinking tokens consumed")
    elapsed_ms: int = Field(default=0, ge=0, description="Elapsed thinking time in milliseconds", alias="elapsedMs")
    content: str = Field(default="", description="Full internal monologue / thought markdown")
    sub_thought_items: List[SubThoughtItem] = Field(default_factory=list, description="Granular thought breakdown", alias="subThoughtItems")
    key_decisions: List[str] = Field(default_factory=list, description="Key architectural or analytical decisions made", alias="keyDecisions")


class ReplayToolCall(BaseModel):
    """Detailed tool execution record."""
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Unique tool call ID")
    tool_type: str = Field(default="sql", description="Tool category (sql, python, office, deck, web_search)", alias="toolType")
    title: str = Field(..., description="Humanized tool execution title")
    name: Optional[str] = Field(default=None, description="Actual function or tool name called")
    status: Literal["running", "success", "error"] = Field(default="success", description="Execution status")
    duration_ms: int = Field(default=0, ge=0, description="Tool execution duration in ms", alias="durationMs")
    input: Dict[str, Any] = Field(default_factory=dict, description="Structured arguments passed to tool")
    output: Dict[str, Any] = Field(default_factory=dict, description="Observation or structured return value from tool")
    error_message: Optional[str] = Field(default=None, description="Error message if execution failed", alias="errorMessage")


class ReplayStepDetail(BaseModel):
    """Granular execution step within a conversational turn."""
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Step unique ID")
    step_index: int = Field(..., ge=0, description="0-indexed step sequence number", alias="stepIndex")
    title: str = Field(..., description="Human-readable step title")
    phase: Literal["intent", "query", "code", "report", "review", "completed"] = Field(default="completed", description="Execution phase")
    status: Literal["pending", "running", "completed", "error"] = Field(default="completed", description="Step status")
    agent_id: Optional[str] = Field(default=None, description="Subagent identifier if delegated", alias="agentId")
    agent_name: Optional[str] = Field(default=None, description="Subagent human-readable name", alias="agentName")
    agent_type: Optional[str] = Field(default=None, description="Subagent role type e.g. 'sql_analyst'", alias="agentType")
    start_time_ms: int = Field(default=0, ge=0, description="Step start offset in ms", alias="startTimeMs")
    end_time_ms: int = Field(default=0, ge=0, description="Step end offset in ms", alias="endTimeMs")
    duration_ms: int = Field(default=0, ge=0, description="Step duration in ms", alias="durationMs")
    summary: str = Field(default="", description="Summary of actions taken in this step")
    thinking: Optional[ReplayThinkingBlock] = Field(default=None, description="Reasoning trace for this step")
    tool_calls: List[ReplayToolCall] = Field(default_factory=list, description="Tools invoked in this step", alias="toolCalls")
    artifact_patch: Optional[Dict[str, Any]] = Field(default=None, description="Artifact update patch", alias="artifactPatch")


class ReplayArtifactDetail(BaseModel):
    """Multi-format artifact snapshot rendered in 60% right canvas."""
    model_config = ConfigDict(populate_by_name=True)

    artifact_id: str = Field(..., description="Unique artifact ID", alias="artifactId")
    artifact_kind: Literal["slide", "sheet", "doc", "chart", "table", "sql", "code"] = Field(..., description="Artifact kind", alias="artifactKind")
    title: str = Field(..., description="Display title of the artifact")
    mime_type: Optional[str] = Field(default=None, description="MIME type e.g. 'application/vnd.openxmlformats-officedocument.presentationml.presentation'", alias="mimeType")
    version: int = Field(default=1, ge=1, description="Artifact version number")
    content: Any = Field(default=None, description="Structured artifact content (SlideData[], SheetData[], HTML string, or Markdown)")
    preview_html: Optional[str] = Field(default=None, description="Rendered HTML preview string", alias="previewHtml")
    file_path: Optional[str] = Field(default=None, description="Server storage file path", alias="filePath")
    download_url: Optional[str] = Field(default=None, description="Public download URL for binary export", alias="downloadUrl")
    slide_count: Optional[int] = Field(default=None, description="Number of slides if artifact_kind is slide", alias="slideCount")
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z", description="Creation timestamp", alias="createdAt")


class ReplayTurnDetail(BaseModel):
    """Complete conversational turn with user prompt, execution steps, and artifacts."""
    model_config = ConfigDict(populate_by_name=True)

    turn_id: str = Field(..., description="Turn unique ID", alias="turnId")
    turn_index: int = Field(..., ge=1, description="1-indexed turn number", alias="turnIndex")
    query: str = Field(..., description="User query for this turn")
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z", description="Turn timestamp", alias="createdAt")
    final_response: Optional[str] = Field(default=None, description="Final synthesized agent response markdown", alias="finalResponse")
    steps: List[ReplayStepDetail] = Field(default_factory=list, description="Sequence of execution steps")
    artifacts: List[ReplayArtifactDetail] = Field(default_factory=list, description="Artifacts generated or modified in this turn")
    sql_used: Optional[str] = Field(default=None, description="Primary SQL query executed in this turn", alias="sqlUsed")
    chart_spec: Optional[Dict[str, Any]] = Field(default=None, description="Primary interactive chart configuration", alias="chartSpec")


class ReplaySessionDetail(BaseModel):
    """Complete granular execution replay snapshot for a session."""
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(..., description="Session unique ID", alias="sessionId")
    title: str = Field(..., description="Session display title")
    subtitle: Optional[str] = Field(default=None, description="Session subtitle or strategic context")
    mode: Literal["slides", "sheets", "docs", "deep-research", "chat"] = Field(default="slides", description="Primary interaction mode")
    badge: Optional[str] = Field(default=None, description="Category or priority badge")
    description: Optional[str] = Field(default=None, description="Detailed session description")
    author: Optional[str] = Field(default="DB-GPT Strategy Lab", description="Session creator/author")
    created_at: str = Field(..., description="ISO 8601 creation timestamp", alias="createdAt")
    updated_at: str = Field(..., description="ISO 8601 last update timestamp", alias="updatedAt")
    status: Literal["running", "completed", "failed"] = Field(default="completed", description="Execution status")
    total_duration_ms: int = Field(default=0, ge=0, description="Total duration in ms", alias="totalDurationMs")
    user_prompt: str = Field(..., description="Initial user prompt", alias="userPrompt")
    model: str = Field(default="deepseek-v4-flash", description="Reasoning model used")
    tags: List[str] = Field(default_factory=list, description="Searchable tags")
    theme: Optional[Dict[str, str]] = Field(default=None, description="Theme tokens for visual presentation")
    turns: List[ReplayTurnDetail] = Field(default_factory=list, description="Conversation turns list")
    total_wire_events: int = Field(default=0, ge=0, description="Total wire protocol events streamed", alias="totalWireEvents")


class ReplaySessionDetailResponse(BaseModel):
    """API response envelope for GET /api/v1/replay/session/{session_id}."""
    model_config = ConfigDict(populate_by_name=True)

    code: int = Field(default=0, description="Response status code (0 for success)")
    message: str = Field(default="success", description="Status message")
    data: Optional[ReplaySessionDetail] = Field(default=None, description="Session detail snapshot")


# ═══════════════════════════════════════════════════════════════════════════
# 3. SSE Streaming Wire Frame Models
# ═══════════════════════════════════════════════════════════════════════════

class SessionStartPayload(BaseModel):
    session_id: str
    title: str
    model: str = "deepseek-v4-flash"
    created_at: str
    total_turns: int = 1
    total_steps: int = 0


class TurnStartPayload(BaseModel):
    turn_id: str
    turn_index: int
    query: str


class StepStartPayload(BaseModel):
    step_id: str
    step_index: int
    phase: str = "query"
    title: str
    agent_type: Optional[str] = None
    agent_name: Optional[str] = None


class ThoughtChunkPayload(BaseModel):
    step_id: str
    thought_id: str
    delta: str
    is_first_chunk: bool = False
    is_last_chunk: bool = False


class ToolCallPayload(BaseModel):
    id: str
    step_id: str
    tool_type: str = "sql"
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)


class ToolResultPayload(BaseModel):
    tool_call_id: str
    name: str
    status: Literal["success", "error"] = "success"
    duration_ms: int = 0
    return_value: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None


class ArtifactCreatedPayload(BaseModel):
    artifact_id: str
    artifact_kind: Literal["slide", "sheet", "doc", "chart", "table", "sql", "code"]
    title: str
    patch: Dict[str, Any] = Field(default_factory=dict)


class TurnEndPayload(BaseModel):
    turn_id: str
    outcome: Literal["success", "error"] = "success"
    total_tokens: int = 0
    duration_ms: int = 0
    final_response: Optional[str] = None


class SessionEndPayload(BaseModel):
    session_id: str
    status: Literal["completed", "failed"] = "completed"
    total_turns: int = 1
    total_steps: int = 0
    total_artifacts: int = 0


class ErrorPayload(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


# ═══════════════════════════════════════════════════════════════════════════
# 4. Presentation Deck Generation Schemas
# ═══════════════════════════════════════════════════════════════════════════

class SlideChartConfig(BaseModel):
    """Chart specification embedded within a presentation slide."""
    model_config = ConfigDict(populate_by_name=True)

    chart_type: Literal["column", "bar", "line", "pie"] = Field(..., alias="chartType")
    category_column: str = Field(..., alias="categoryColumn")
    value_column: str = Field(..., alias="valueColumn")
    series_column: Optional[str] = Field(default=None, alias="seriesColumn")


class SlideKpiItem(BaseModel):
    """Metric card embedded in a KPI slide."""
    model_config = ConfigDict(populate_by_name=True)

    label: str = Field(..., description="KPI label or title")
    metric: str = Field(..., description="Metric expression e.g. 'sum:revenue', 'growth:revenue:quarter', 'avg:margin'")
    value: Optional[float] = Field(default=None, description="Computed numeric value")
    formatted: Optional[str] = Field(default=None, description="Formatted string display")
    unit: Optional[str] = Field(default="", description="Unit suffix (e.g. '$', 'VND', '%')")
    trend: Optional[str] = Field(default=None, description="Trend indicator e.g. '+18.2% QoQ'")
    color: Optional[str] = Field(default="emerald", description="Accent color: emerald, navy, violet, amber")


class SlideComparisonCol(BaseModel):
    """Column in a comparative slide layout."""
    model_config = ConfigDict(populate_by_name=True)

    header: str = Field(..., description="Column header title")
    badge: Optional[str] = Field(default=None, description="Badge text e.g. 'DẪN ĐẦU', 'TIỀM NĂNG'")
    metric: Optional[str] = Field(default=None, description="Metric expression for column aggregate")
    value: Optional[float] = Field(default=None, description="Computed metric value")
    bullets: List[str] = Field(default_factory=list, description="Bulleted takeaway points")


class SlideTakeawayItem(BaseModel):
    """Priority action item in a takeaway slide."""
    model_config = ConfigDict(populate_by_name=True)

    priority: str = Field(..., description="Priority number or code e.g. '01', '02', '03'")
    title: str = Field(..., description="Action title")
    description: str = Field(..., description="Detailed action description")


class SlidePillarItem(BaseModel):
    """Strategic pillar in a split column slide."""
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(..., description="Pillar title")
    description: str = Field(..., description="Pillar explanation")


class SlideSpec(BaseModel):
    """Grounded slide layout definition."""
    model_config = ConfigDict(populate_by_name=True)

    slide_number: Optional[int] = Field(default=1, ge=1, alias="slideNumber")
    layout_type: Literal[
        "title", "bullets", "metric_cards", "kpi", "comparison",
        "chart", "chart_left_bullets_right", "split_columns", "callout",
        "takeaway", "table"
    ] = Field(default="bullets", alias="layoutType")
    title: str = Field(..., description="Slide headline title")
    subtitle: Optional[str] = Field(default=None, description="Slide subtitle or context")
    badge: Optional[str] = Field(default=None, description="Section badge or category")
    headline: Optional[str] = Field(default=None, description="Callout or focus headline")
    kpis: Optional[List[SlideKpiItem]] = Field(default=None, description="List of KPI cards")
    chart: Optional[Union[SlideChartConfig, str]] = Field(default=None, description="Chart configuration or chart kind")
    category_column: Optional[str] = Field(default=None, alias="categoryColumn")
    value_column: Optional[str] = Field(default=None, alias="valueColumn")
    series_column: Optional[str] = Field(default=None, alias="seriesColumn")
    bullets: Optional[List[str]] = Field(default=None, description="Bullet points")
    columns: Optional[List[SlideComparisonCol]] = Field(default=None, description="Comparison columns")
    takeaways: Optional[List[SlideTakeawayItem]] = Field(default=None, description="Action items")
    pillars: Optional[List[SlidePillarItem]] = Field(default=None, description="Strategic pillars")
    insights: Optional[List[str]] = Field(default=None, description="Insights for callout slide")
    left_column: Optional[Dict[str, Any]] = Field(default=None, alias="leftColumn")
    right_column: Optional[Dict[str, Any]] = Field(default=None, alias="rightColumn")
    notes: Optional[str] = Field(default=None, description="Presenter speaker notes")
    limit: Optional[int] = Field(default=8, ge=1, le=50, description="Row limit for table slide")


class DeckGenerateRequest(BaseModel):
    """Request payload for presentation deck generation."""
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(..., description="Presentation main title")
    subtitle: Optional[str] = Field(default=None, description="Subtitle or focus statement")
    theme: Optional[Literal["executive_navy", "emerald_minimal", "tech_slate", "modern_dark", "warm_amber"]] = Field(
        default="executive_navy", description="Visual theme palette"
    )
    slides: Optional[List[SlideSpec]] = Field(default=None, description="Structured slide specifications (auto-derived if omitted)")
    data: Optional[List[Dict[str, Any]]] = Field(default=None, description="Raw query result rows for metric grounding")
    source: Optional[str] = Field(default="DB-GPT Strategy & Analytics", description="Data source attribution in slide footer")
    session_id: Optional[str] = Field(default=None, description="Session ID for artifact linking", alias="sessionId")
    prompt: Optional[str] = Field(default=None, description="Natural language prompt if requesting AI planning")


class DeckGenerateResponse(BaseModel):
    """Response payload returning generated PPTX presentation and responsive HTML preview."""
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["success", "error"] = Field(default="success", description="Generation status")
    presentation_id: str = Field(..., description="Generated presentation UUID", alias="presentationId")
    title: str = Field(..., description="Presentation title")
    subtitle: Optional[str] = Field(default=None, description="Presentation subtitle")
    file_path: str = Field(..., description="Server file path to .pptx file", alias="filePath")
    base64_content: Optional[str] = Field(default=None, description="Base64 encoded PPTX binary bytes", alias="base64Content")
    slide_count: int = Field(..., ge=1, description="Total slide count in presentation", alias="slideCount")
    download_url: str = Field(..., description="Direct download URL for .pptx", alias="downloadUrl")
    html_preview: str = Field(..., description="Responsive 16:9 HTML slide carousel preview", alias="htmlPreview")
    slides: List[Dict[str, Any]] = Field(default_factory=list, description="Resolved slide specifications with computed metrics")
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z", description="Creation timestamp", alias="createdAt")
