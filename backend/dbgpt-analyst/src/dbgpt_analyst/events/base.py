"""events/base.py — Unified BaseEvent and custom emission for SSE streaming."""
from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
import logging
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


def emit_custom(name: str, data: Any) -> None:
    """Đẩy một event tự định nghĩa ra kênh mà streamer thật sự đọc.

    Sử dụng get_stream_writer()({"name": name, "data": data}) của LangGraph
    để stream mode 'custom' có thể nhận được.
    """
    try:
        from langgraph.config import get_stream_writer

        get_stream_writer()({"name": name, "data": data})
    except Exception as exc:  # noqa: BLE001
        logger.debug("không phát được %s (ngoài graph run?): %s", name, exc)


class BaseEvent(BaseModel):
    """Base model for all SSE events in DB-GPT Analyst."""

    model_config = ConfigDict(
        extra="allow",
        arbitrary_types_allowed=True,
    )

    type: str
    phase: str | None = None
    status: str | None = None  # running, done, error, pending
    agent_id: str | None = None
    agent_name: str | None = None
    parent_agent_id: str | None = None
    ts: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    payload: Any = Field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(exclude_none=True)
