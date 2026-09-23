"""Dual-format Server-Sent Events (SSE) streaming adapter.

Supports:
1. Canonical R01 JSON Envelope ('canonical')
   - data: {"schemaVersion": 1, "eventId": "evt-...", "runId": "...", "seq": 1, "type": "answer.delta", ...}\n\n
2. Vercel AI SDK v6 Data Stream Protocol ('ai-sdk-v6')
   - 0:"text delta"\n
   - b:{"type": "...", ...}\n
   - d:{"finishReason": "stop"}\n
3. Legacy / Cuccu SSE Format ('legacy', 'cuccu')
   - data: {"type": "text-delta", "content": "..."}\n\n
   - data: {"type": "data-todos", "data": ...}\n\n
   - data: [DONE]\n\n
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, Literal, Optional
import uuid

logger = logging.getLogger(__name__)

StreamFormat = Literal["canonical", "cuccu", "legacy", "ai-sdk-v6"]


class DualFormatStreamAdapter:
    """Transforms native LangGraph astream chunks into standard SSE streams.

    Supports canonical R01 event envelopes (schemaVersion: 1) as well as legacy cuccu and ai-sdk-v6.
    """

    def __init__(
        self,
        format_mode: StreamFormat = "canonical",
        run_id: str = "",
        thread_id: str = "",
    ):
        self.format_mode: StreamFormat = format_mode
        self.run_id: str = run_id or f"run-{uuid.uuid4().hex[:12]}"
        self.thread_id: str = thread_id
        self._seq: int = 0

    @property
    def seq(self) -> int:
        return self._seq

    @staticmethod
    def _iso_now() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()

    def encode_text_delta(self, text: str, visibility: str = "answer") -> str:
        """Encodes an incremental text token delta."""
        if self.format_mode == "canonical":
            self._seq += 1
            envelope = {
                "schemaVersion": 1,
                "eventId": f"evt-{uuid.uuid4().hex[:12]}",
                "runId": self.run_id,
                "threadId": self.thread_id,
                "seq": self._seq,
                "type": "answer.delta",
                "timestamp": self._iso_now(),
                "payload": {"text": text, "visibility": visibility},
            }
            return f"data: {json.dumps(envelope, ensure_ascii=False)}\n\n"
        elif self.format_mode == "ai-sdk-v6":
            return f"0:{json.dumps(text, ensure_ascii=False)}\n"
        payload = {"type": "text-delta", "content": text}
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def encode_custom_event(self, event_type: str, data: Any) -> str:
        """Encodes custom metadata events (todos, subagent discovery, skills, artifacts)."""
        if self.format_mode == "canonical":
            self._seq += 1
            envelope = {
                "schemaVersion": 1,
                "eventId": f"evt-{uuid.uuid4().hex[:12]}",
                "runId": self.run_id,
                "threadId": self.thread_id,
                "seq": self._seq,
                "type": event_type,
                "timestamp": self._iso_now(),
                "payload": data if isinstance(data, dict) else {"data": data},
            }
            return f"data: {json.dumps(envelope, ensure_ascii=False)}\n\n"
        elif self.format_mode == "ai-sdk-v6":
            if isinstance(data, dict):
                envelope = {"type": event_type, **data}
            else:
                envelope = {"type": event_type, "data": data}
            return f"b:{json.dumps(envelope, ensure_ascii=False)}\n"

        # Legacy / Cuccu mapping
        type_mapping = {
            "todos_update": "data-todos",
            "subagent_start": "data-subagent",
            "subagent_token": "data-subagent-delta",
            "subagent_complete": "data-subagent",
            "skill_loaded": "data-skill",
            "thinking": "data-thinking",
            "audit_card": "data-audit-card",
            "data-audit-card": "data-audit-card",
            "sql_delta": "data-sql-delta",
            "chart_spec": "data-chart-spec",
            "artifact": "data-artifact",
        }
        legacy_type = type_mapping.get(event_type, f"data-{event_type}")
        payload = {"type": legacy_type, "data": data}
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def encode_finish(self, finish_reason: str = "stop", usage: Optional[Dict[str, Any]] = None) -> str:
        """Encodes stream completion delimiter."""
        if self.format_mode == "canonical":
            self._seq += 1
            envelope = {
                "schemaVersion": 1,
                "eventId": f"evt-{uuid.uuid4().hex[:12]}",
                "runId": self.run_id,
                "threadId": self.thread_id,
                "seq": self._seq,
                "type": "run.completed",
                "timestamp": self._iso_now(),
                "payload": {"finishReason": finish_reason, "usage": usage or {}},
            }
            return f"data: {json.dumps(envelope, ensure_ascii=False)}\n\n"
        elif self.format_mode == "ai-sdk-v6":
            payload: Dict[str, Any] = {"finishReason": finish_reason}
            if usage:
                payload["usage"] = usage
            return f"d:{json.dumps(payload, ensure_ascii=False)}\n"

        finish_payload = {
            "type": "finish",
            "finishReason": finish_reason,
            "usage": usage or {}
        }
        return f"data: {json.dumps(finish_payload, ensure_ascii=False)}\n\ndata: [DONE]\n\n"

    async def stream_graph_execution(
        self,
        graph: Any,
        initial_state: dict,
        config: dict
    ) -> AsyncIterator[str]:
        """Executes compiled StateGraph and yields formatted SSE chunks."""
        try:
            from langchain_core.messages import AIMessage, AIMessageChunk
        except ImportError:
            AIMessage = AIMessageChunk = None  # type: ignore

        usage_metadata: Dict[str, Any] = {}

        async for mode, payload in graph.astream(
            initial_state,
            config=config,
            stream_mode=["custom", "messages"]
        ):
            if mode == "custom":
                if isinstance(payload, dict):
                    event_type = payload.get("type", "custom")
                else:
                    event_type = "custom"
                yield self.encode_custom_event(event_type, payload)

            elif mode == "messages":
                message_chunk, metadata = payload
                node_name = metadata.get("langgraph_node", "")

                # Only author nodes emit final synthesis text
                if node_name in ("answer_node", "supervisor", "supervisor_node", "analyst"):
                    if AIMessageChunk is not None and isinstance(message_chunk, (AIMessageChunk, AIMessage)) and message_chunk.content:
                        if isinstance(message_chunk.content, str):
                            yield self.encode_text_delta(message_chunk.content)
                        elif isinstance(message_chunk.content, list):
                            for part in message_chunk.content:
                                if isinstance(part, dict) and part.get("type") == "text":
                                    yield self.encode_text_delta(part["text"])
                    elif hasattr(message_chunk, "content") and message_chunk.content:
                        content = message_chunk.content
                        if isinstance(content, str):
                            yield self.encode_text_delta(content)
                        elif isinstance(content, list):
                            for part in content:
                                if isinstance(part, dict) and part.get("type") == "text":
                                    yield self.encode_text_delta(part.get("text", ""))

                    if hasattr(message_chunk, "usage_metadata") and message_chunk.usage_metadata:
                        usage_metadata = message_chunk.usage_metadata

        # Completion delimiter
        yield self.encode_finish(finish_reason="stop", usage=usage_metadata)


__all__ = [
    "DualFormatStreamAdapter",
    "StreamFormat",
]
