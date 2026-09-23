"""
Shared pytest fixtures, schemas, mock generators, and validation helpers for DB-GPT E2E Test Suite.
"""

import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Union
import pytest
from pydantic import BaseModel, Field, ConfigDict, field_validator


# ============================================================================
# 1. Pydantic Contract Schemas (R1, R2, R3, R4)
# ============================================================================

class ZincPalette(BaseModel):
    zinc_50: str = "#fafafa"
    zinc_100: str = "#f4f4f5"
    zinc_200: str = "#e4e4e7"
    zinc_300: str = "#d4d4d8"
    zinc_400: str = "#a1a1aa"
    zinc_500: str = "#71717a"
    zinc_600: str = "#52525b"
    zinc_700: str = "#3f3f46"
    zinc_800: str = "#27272a"
    zinc_900: str = "#18181b"
    zinc_950: str = "#09090b"
    emerald_accent_light: str = "#00a98f"
    emerald_accent_dark: str = "#10b981"


class FluidTypographyRule(BaseModel):
    allowed_units: List[str] = Field(default_factory=lambda: ["rem", "em", "%", "vh", "vw", "ch"])
    banned_units: List[str] = Field(default_factory=lambda: ["px", "pt", "in", "cm", "mm"])
    fluid_classes: List[str] = Field(
        default_factory=lambda: [
            "text-xs", "text-sm", "text-base", "text-lg", "text-xl",
            "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl"
        ]
    )


class SquircleIconSpec(BaseModel):
    stroke_width: float = 1.5
    border_radius_class: str = "rounded-xl"
    border_color_light: str = "border-zinc-200"
    border_color_dark: str = "dark:border-zinc-800"
    size_classes: List[str] = Field(default_factory=lambda: ["w-7 h-7", "w-8 h-8", "w-9 h-9"])


class CustomScrollbarRule(BaseModel):
    class_name: str = ".custom-scrollbar"
    width_px: int = 6
    height_px: int = 6
    track_background: str = "transparent"
    thumb_border_radius: str = "9999px"
    thumb_color_light: str = "rgba(161, 161, 170, 0.4)"
    thumb_color_dark: str = "rgba(63, 63, 70, 0.6)"


class ArtifactSnapshot(BaseModel):
    artifact_id: str
    artifact_kind: Literal["slide", "sheet", "doc", "chart", "table", "code", "dashboard"]
    title: str
    download_url: Optional[str] = None
    preview_html: Optional[str] = None
    slides_count: Optional[int] = None
    content: Optional[Any] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ReplayStepDetail(BaseModel):
    step_id: str
    step_index: int
    agent_id: str
    agent_name: str
    agent_type: Literal["sql_analyst", "office_writer", "web_researcher", "data_engineer", "report_agent", "ai_coordinator", "general"]
    step_type: Literal["tool_call", "tool_result", "reasoning", "final_answer", "status", "subagent_delegation"]
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[Any] = None
    thought_text: Optional[str] = None
    duration_ms: Optional[int] = 0
    tokens_used: Optional[int] = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ReplayTurnDetail(BaseModel):
    turn_id: str
    turn_index: int
    question: str
    ai_answer: Optional[str] = None
    sql_used: Optional[str] = None
    chart_spec: Optional[Dict[str, Any]] = None
    steps: List[ReplayStepDetail] = Field(default_factory=list)
    artifacts: List[ArtifactSnapshot] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ReplaySessionDetail(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    model: str = "deepseek-v4-flash"
    status: Literal["running", "completed", "failed"] = "completed"
    user_prompt: str
    total_steps: int = 0
    total_tokens: Dict[str, int] = Field(
        default_factory=lambda: {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    )
    total_duration_ms: int = 0
    turns: List[ReplayTurnDetail] = Field(default_factory=list)
    artifacts: List[ArtifactSnapshot] = Field(default_factory=list)


class ReplaySessionItem(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    turn_count: int = 1
    total_steps: int = 0
    agent_types: List[str] = Field(default_factory=list)
    has_artifacts: bool = False
    artifact_kinds: List[str] = Field(default_factory=list)
    preview_thumbnail_url: Optional[str] = None
    latest_question: Optional[str] = None
    duration_ms: int = 0


class ReplaySessionListResponse(BaseModel):
    ok: bool = True
    data: Dict[str, Any]


class SlideItem(BaseModel):
    slide_number: int
    kind: Literal["cover", "hero", "kpi", "stat_grid", "chart", "callout", "takeaway", "table", "two_col", "bullets", "closing"]
    title: str
    subtitle: Optional[str] = None
    kpis: Optional[List[Dict[str, Any]]] = None
    chart: Optional[str] = None
    category_column: Optional[str] = None
    value_column: Optional[str] = None
    badge: Optional[str] = None
    headline: Optional[str] = None
    insights: Optional[List[str]] = None
    takeaways: Optional[List[Dict[str, Any]]] = None
    bullets: Optional[List[str]] = None


class DeckGenerateRequest(BaseModel):
    question: str
    query_results: Optional[List[Dict[str, Any]]] = None
    sql: Optional[str] = None
    theme: Optional[str] = "executive_navy"
    slide_count: Optional[int] = 6
    session_id: Optional[str] = None
    source: Optional[str] = "DB-GPT Analytics"
    theme_override: Optional[Dict[str, str]] = None


class DeckGenerateResponse(BaseModel):
    ok: bool = True
    deck_id: str
    title: str
    subtitle: Optional[str] = None
    source: Optional[str] = None
    pptx_url: str
    html_preview: str
    slides: List[SlideItem]
    created_at: str


class SSEStreamEvent(BaseModel):
    type: str
    payload: Dict[str, Any]
    ts: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    agent_type: Optional[str] = None


# ============================================================================
# 2. Validation & Inspection Helper Functions
# ============================================================================

def validate_zinc_classes(class_list_or_str: Union[str, List[str]]) -> bool:
    """Check if CSS class string contains valid Zinc monochrome tokens."""
    text = class_list_or_str if isinstance(class_list_or_str, str) else " ".join(class_list_or_str)
    zinc_pattern = r"(bg|text|border|ring|divide)-zinc-(50|100|200|300|400|500|600|700|800|900|950)"
    return bool(re.search(zinc_pattern, text))


def validate_no_fixed_px(style_text: str) -> List[str]:
    """Return any violations of banned fixed px font sizes or wrapper sizes."""
    violations = []
    # Check for font-size: \d+px or text-[\d+px]
    font_px = re.findall(r"font-size:\s*(\d+)px", style_text)
    if font_px:
        violations.extend([f"font-size: {val}px" for val in font_px])
    tailwind_fixed_px = re.findall(r"text-\[(\d+)px\]", style_text)
    if tailwind_fixed_px:
        violations.extend([f"text-[{val}px]" for val in tailwind_fixed_px])
    return violations


def validate_squircle_container(props: Dict[str, Any]) -> bool:
    """Validate squircle icon container properties (rounded-xl/2xl, 1.5px stroke)."""
    has_radius = any(r in props.get("className", "") for r in ["rounded-xl", "rounded-2xl", "rounded-lg"])
    has_border = any(b in props.get("className", "") for b in ["border-zinc", "border"])
    stroke = props.get("strokeWidth", 1.5)
    return has_radius and has_border and (abs(stroke - 1.5) < 0.01)


def validate_custom_scrollbar_css(css_content: str) -> bool:
    """Validate that custom scrollbar CSS defines 6px width and transparent track."""
    has_class = ".custom-scrollbar" in css_content
    has_width = re.search(r"width:\s*6px", css_content) is not None
    has_thumb = "scrollbar-thumb" in css_content
    return has_class and has_width and has_thumb


def scan_for_antd_imports(source_code: str) -> List[str]:
    """Scan source code for legacy antd / @ant-design imports."""
    found = []
    lines = source_code.splitlines()
    for line in lines:
        if "from 'antd" in line or 'from "antd' in line:
            found.append(line.strip())
        elif "from '@ant-design" in line or 'from "@ant-design' in line:
            found.append(line.strip())
        elif "import('antd" in line or 'import("antd' in line:
            found.append(line.strip())
        elif "require('antd" in line or 'require("antd' in line:
            found.append(line.strip())
    return found


def humanize_action(tool_name: str, tool_args: Optional[Dict[str, Any]] = None, lang: str = "vi") -> str:
    """Translate technical tool actions into clean human-readable bilingual strings."""
    args = tool_args or {}
    clean_tool = tool_name.replace("TODO::", "").replace("init:0/1", "").strip(": ")
    
    mapping_vi = {
        "profile_data": "Đang phân tích và lập hồ sơ dữ liệu...",
        "execute_sql": f"Đang truy vấn cơ sở dữ liệu ({args.get('table', 'toàn bảng')})...",
        "generate_deck": "Đang thiết kế slide thuyết trình 16:9...",
        "export_excel": "Đang tính toán mô hình bảng tính Excel...",
        "generate_report": "Đang soạn thảo báo cáo Word A4...",
        "web_search": f"Đang tìm kiếm thông tin: '{args.get('query', '')}'...",
        "python_interpreter": "Đang chạy mô hình tính toán Python...",
        "deep_research": "Đang tổng hợp nghiên cứu chuyên sâu..."
    }
    
    mapping_en = {
        "profile_data": "Profiling dataset schemas and statistics...",
        "execute_sql": f"Executing database query on {args.get('table', 'tables')}...",
        "generate_deck": "Generating 16:9 executive presentation deck...",
        "export_excel": "Building Excel workbook model...",
        "generate_report": "Drafting A4 Word executive document...",
        "web_search": f"Searching web for '{args.get('query', '')}'...",
        "python_interpreter": "Running Python calculation script...",
        "deep_research": "Synthesizing deep research findings..."
    }
    
    table = mapping_vi if lang == "vi" else mapping_en
    return table.get(clean_tool, f"Đang thực hiện thao tác {clean_tool}..." if lang == "vi" else f"Executing action {clean_tool}...")


def detect_slide_layout(slide: Dict[str, Any]) -> str:
    """Infer slide layout type using ground truth heuristics."""
    if slide.get("kpis"):
        return "kpi"
    if slide.get("chart"):
        return "chart"
    if slide.get("takeaways"):
        return "takeaway"
    if slide.get("badge") or slide.get("headline"):
        return "callout"
    if slide.get("subtitle") and not slide.get("bullets"):
        return "hero"
    if slide.get("columns") and len(slide.get("columns", [])) == 2:
        return "two_col"
    return "bullets"


# ============================================================================
# 3. State Machine Simulators & SSE Stream Generators
# ============================================================================

class ReplayPlaybackEngine:
    """Simulator for the Replay timeline state machine."""
    def __init__(self, session_detail: ReplaySessionDetail, speed: float = 1.0):
        self.session = session_detail
        self.speed = speed
        self.current_step = 0
        self.state: Literal["idle", "playing", "paused", "completed"] = "idle"
        self.active_artifact_tab = "slides"
        self.reasoning_expanded = False

    @property
    def total_steps(self) -> int:
        steps_count = sum(len(turn.steps) for turn in self.session.turns)
        return max(steps_count, self.session.total_steps)

    def play(self):
        if self.current_step >= self.total_steps:
            self.current_step = 0
        self.state = "playing"
        self.reasoning_expanded = True

    def pause(self):
        self.state = "paused"

    def step_forward(self) -> int:
        if self.current_step < self.total_steps:
            self.current_step += 1
        if self.current_step >= self.total_steps:
            self.state = "completed"
            self.reasoning_expanded = False
        return self.current_step

    def step_backward(self) -> int:
        if self.current_step > 0:
            self.current_step -= 1
        if self.state == "completed":
            self.state = "paused"
        return self.current_step

    def seek_to_step(self, step_idx: int) -> int:
        self.current_step = max(0, min(step_idx, self.total_steps))
        if self.current_step >= self.total_steps:
            self.state = "completed"
            self.reasoning_expanded = False
        else:
            self.state = "paused"
        return self.current_step

    def set_speed(self, speed: float):
        if speed <= 0:
            self.speed = 999.0  # instant
        else:
            self.speed = speed

    def switch_artifact_tab(self, tab: str):
        allowed = ["slides", "sheets", "docs", "chart", "code"]
        if tab in allowed:
            self.active_artifact_tab = tab


def generate_mock_sse_stream(session_id: str, speed: float = 1.0, num_steps: int = 5) -> List[str]:
    """Generate wire protocol SSE chunks simulating backend live replay."""
    events = []
    
    # 1. Initial status event
    ev1 = {"type": "status", "payload": {"session_id": session_id, "status": "running", "speed": speed}}
    events.append(f"data: {json.dumps(ev1)}\n\n")
    
    # 2. Agent slot update
    ev2 = {
        "type": "AGENT_SLOT_UPDATE",
        "agent_id": "sql_agent",
        "agent_name": "SQL Analyst",
        "agent_type": "sql_analyst",
        "payload": {"status": "running"}
    }
    events.append(f"data: {json.dumps(ev2)}\n\n")
    
    # 3. Thinking delta
    ev3 = {
        "type": "think_part",
        "payload": {"think": "Đang phân tích cấu trúc dữ liệu và tổng hợp báo cáo...", "is_first_chunk": True}
    }
    events.append(f"data: {json.dumps(ev3)}\n\n")
    
    # 4. Tool call & result
    for i in range(1, num_steps + 1):
        tc = {
            "type": "tool_call",
            "payload": {"id": f"tc_{i}", "name": "execute_sql", "arguments_full": json.dumps({"step": i})}
        }
        events.append(f"data: {json.dumps(tc)}\n\n")
        
        tr = {
            "type": "tool_result",
            "payload": {"tool_call_id": f"tc_{i}", "name": "execute_sql", "return_value": [{"metric": f"val_{i}"}]}
        }
        events.append(f"data: {json.dumps(tr)}\n\n")
    
    # 5. Artifact generation events
    ev5 = {
        "type": "document_block",
        "payload": {"doc_id": f"deck_{session_id[:6]}", "doc_type": "slide", "title": "Báo Cáo Hoạt Động", "slides_count": 6}
    }
    events.append(f"data: {json.dumps(ev5)}\n\n")
    
    # 6. Text answer part
    ev6 = {
        "type": "text_part",
        "payload": {"text": "Đã hoàn thành phân tích và tạo bài thuyết trình 6 slide thành công."}
    }
    events.append(f"data: {json.dumps(ev6)}\n\n")
    
    # 7. Turn end & Done
    ev7 = {
        "type": "turn_end",
        "payload": {"outcome": "success", "total_tokens": 1450, "duration_ms": 3200}
    }
    events.append(f"data: {json.dumps(ev7)}\n\n")
    events.append("data: [DONE]\n\n")
    
    return events


# ============================================================================
# 4. Shared Pytest Fixtures
# ============================================================================

@pytest.fixture
def zinc_palette():
    return ZincPalette()


@pytest.fixture
def fluid_typography_rule():
    return FluidTypographyRule()


@pytest.fixture
def squircle_icon_spec():
    return SquircleIconSpec()


@pytest.fixture
def custom_scrollbar_rule():
    return CustomScrollbarRule()


@pytest.fixture
def sample_session_id():
    return "19eaa8f9-80d2-884c-8000-0000a3850ea9"


@pytest.fixture
def sample_slide_deck():
    return SlideItem(
        slide_number=1,
        kind="hero",
        title="Báo Cáo Chiến Lược Kinh Doanh 2026",
        subtitle="Phân Tích Tăng Trưởng & Kế Hoạch Chuyển Đổi Số",
        kpis=[
            {"label": "Doanh thu Q4", "value": 49085000000, "formatted": "49,08 tỷ"},
            {"label": "Tăng trưởng YoY", "value": 0.324, "formatted": "+32.4%"}
        ],
        bullets=["Mở rộng thị phần chuỗi bán lẻ", "Tối ưu hóa chi phí vận hành kho bãi"]
    )


@pytest.fixture
def sample_replay_session(sample_session_id):
    step1 = ReplayStepDetail(
        step_id="step_1",
        step_index=1,
        agent_id="sql_agent_1",
        agent_name="SQL Analyst",
        agent_type="sql_analyst",
        step_type="tool_call",
        tool_name="profile_data",
        tool_args={"table": "sales_q4"},
        tool_result={"row_count": 15420},
        thought_text="Kiểm tra schema và số lượng bản ghi của bảng sales_q4...",
        duration_ms=120,
        tokens_used=350
    )
    step2 = ReplayStepDetail(
        step_id="step_2",
        step_index=2,
        agent_id="office_agent_1",
        agent_name="Office Writer",
        agent_type="office_writer",
        step_type="tool_call",
        tool_name="generate_deck",
        tool_args={"slide_count": 6, "theme": "executive_navy"},
        tool_result={"deck_id": "deck_88a1"},
        thought_text="Tạo dàn ý 6 slide thuyết trình 16:9...",
        duration_ms=450,
        tokens_used=890
    )
    artifact = ArtifactSnapshot(
        artifact_id="deck_88a1",
        artifact_kind="slide",
        title="Báo Cáo Doanh Thu Bán Lẻ Q4",
        download_url="/uploads/generated_pptx/deck_88a1.pptx",
        preview_html="<div class='slide-preview'>16:9 Slide Content</div>",
        slides_count=6
    )
    turn = ReplayTurnDetail(
        turn_id="turn_1",
        turn_index=1,
        question="Phân tích doanh thu chuỗi bán lẻ Q4 và tạo bài thuyết trình 6 slide",
        ai_answer="Đã tổng hợp số liệu doanh thu Q4 và xuất bản bài thuyết trình 16:9.",
        sql_used="SELECT region, SUM(amount) FROM sales_q4 GROUP BY region",
        steps=[step1, step2],
        artifacts=[artifact]
    )
    return ReplaySessionDetail(
        session_id=sample_session_id,
        title="Phân Tích Doanh Thu Bán Lẻ Q4",
        created_at="2026-08-22T13:30:00Z",
        updated_at="2026-08-22T13:35:00Z",
        model="deepseek-v4-flash",
        status="completed",
        user_prompt="Phân tích doanh thu chuỗi bán lẻ Q4 và tạo bài thuyết trình 6 slide",
        total_steps=2,
        total_tokens={"prompt_tokens": 1240, "completion_tokens": 620, "total_tokens": 1860},
        total_duration_ms=570,
        turns=[turn],
        artifacts=[artifact]
    )
