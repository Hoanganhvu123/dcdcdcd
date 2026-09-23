import uuid
from typing import Any, Literal

from .base import BaseEvent, emit_custom


class ExcalidrawElement(dict[str, Any]):
    """Represents a single Excalidraw JSON element."""

class ChartData(dict[str, Any]):
    """Represents a single chart data point for Recharts."""

class ChartConfig(dict[str, Any]):
    type: Literal["BAR_CHART", "LINE_CHART", "PIE_CHART", "AREA_CHART"]
    title: str
    data: list[ChartData]
    dataKey: str
    xAxisKey: str

ArtifactPhase = Literal[
    "artifact.start", "artifact.progress", "artifact.ready", "artifact.error"
]


class ArtifactEvent(BaseEvent):
    """Một file đang được sinh ra, kể theo thời gian thực.

    Trước đây frontend phải regex bới URL `/uploads/...` ra khỏi văn xuôi của model
    mới biết có file — nghĩa là file chỉ tồn tại với UI sau khi model nói xong.
    Bốn event này nói thẳng: bắt đầu, đang tới đâu, xong (kèm URL), hoặc hỏng.

    `id` giữ nguyên suốt một lần sinh file, nên UI ghép được các mốc vào cùng một thẻ.
    """

    type: ArtifactPhase
    payload: dict[str, Any]


class ArtifactStream:
    """Phát chuỗi `artifact.*` cho MỘT file, qua kênh custom event của LangGraph.

    Streamer đã có nhánh passthrough cho custom event nên không cần sửa gì ở đó:
    một `{"name": ..., "data": ...}` ghi vào kênh custom ra tới client thành
    `{type: name, payload: data}`. Vì sao phải là `emit_custom` chứ không phải
    `adispatch_custom_event`: xem docstring của `emit_custom`.
    """

    def __init__(self, kind: str, title: str, artifact_id: str | None = None) -> None:
        self.id = artifact_id or uuid.uuid4().hex
        self.kind = kind
        self.title = title

    async def _emit(self, phase: ArtifactPhase, payload: dict[str, Any]) -> None:
        event = ArtifactEvent(type=phase, payload={"id": self.id, **payload})
        emit_custom(event.type, event.payload)

    async def start(self) -> None:
        await self._emit("artifact.start", {"kind": self.kind, "title": self.title})

    async def progress(self, stage: str, pct: int) -> None:
        await self._emit("artifact.progress", {"stage": stage, "pct": max(0, min(100, int(pct)))})

    async def ready(
        self, *, url: str, filename: str = "", size: int = 0, preview_html: str | None = None
    ) -> None:
        payload: dict[str, Any] = {
            "url": url,
            "filename": filename or url.rsplit("/", 1)[-1],
            "bytes": size,
        }
        if preview_html:
            payload["preview_html"] = preview_html
        await self._emit("artifact.ready", payload)

    async def error(self, message: str) -> None:
        await self._emit("artifact.error", {"message": message})


class ArtifactRenderEvent(BaseEvent):
    """Event emitted when the AI Agent wants the frontend to render a UI Widget."""
    type: Literal["artifact_render"] = "artifact_render"
    widget_type: Literal["EXCALIDRAW", "DASHBOARD_GRID", "MARKDOWN"]
    payload: dict[str, Any]

    @classmethod
    def create_excalidraw(cls, elements: list[ExcalidrawElement], agent_id: str, parent_id: str = None):
        return cls(
            agent_id=agent_id,
            parent_agent_id=parent_id,
            widget_type="EXCALIDRAW",
            payload={"elements": elements}
        )

    @classmethod
    def create_dashboard(cls, charts: list[ChartConfig], agent_id: str, parent_id: str = None):
        return cls(
            agent_id=agent_id,
            parent_agent_id=parent_id,
            widget_type="DASHBOARD_GRID",
            payload={"charts": charts}
        )
