"""controller.py — Unified Package Entrypoint for DB-GPT Analyst.

Coordinates:
- Engine lifecycle & checkpointer initialization
- Request normalization and session tracking
- Supervisor graph execution
- Real-time SSE streaming via DualFormatStreamAdapter & StreamTokenFilter
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
import json
import logging
import re
from typing import Any

from langchain_core.messages import AIMessageChunk, HumanMessage
from pydantic import BaseModel, Field

from dbgpt_analyst.core.config import EngineConfig, get_engine_config
from dbgpt_analyst.core.helpers import json_serial
from dbgpt_analyst.core.lifecycle import EngineLifecycle
from dbgpt_analyst.events import (
    AnswerDeltaEvent,
    ClientEffectEvent,
    ErrorEvent,
    FinalEvent,
    SQLDeltaEvent,
    ThinkingDeltaEvent,
    WorkflowTaskEvent,
    event_to_sse,
)
from dbgpt_analyst.events.sse_adapter import DualFormatStreamAdapter, StreamFormat
from dbgpt_analyst.graphs.supervisor import build_supervisor_graph

logger = logging.getLogger(__name__)


class AnalystRequest(BaseModel):
    """Input payload specification for DB-GPT Analyst chat requests."""
    question: str
    session_id: str | None = None
    user_id: str = "dev_user"
    mode: str | None = None  # "sql", "web", "report", "office", "hybrid"
    db_name: str | None = None
    stream: bool = True
    stream_format: StreamFormat = "legacy"
    extra_context: dict[str, Any] = Field(default_factory=dict)


class StreamTokenFilter:
    """State machine that intercepts <think>...</think> and <tool_call>...</tool_call>
    streaming tags and prevents raw syntax leakage into user prose.
    """

    def __init__(self):
        self.in_think = False
        self.in_tool = False
        self.buffer = ""

    def process_chunk(self, chunk: str) -> tuple[str, str, str]:
        """Processes incoming token chunk.

        Returns: (reasoning_tokens, tool_tokens, prose_tokens)
        """
        self.buffer += chunk
        reasoning = ""
        tool = ""
        prose = ""

        while self.buffer:
            if not self.in_think and not self.in_tool:
                # Look for opening tags
                think_start = self.buffer.find("<think>")
                if think_start == -1:
                    think_start = self.buffer.find("<thought>")

                tool_start = self.buffer.find("<tool_call>")

                candidates = []
                if think_start != -1:
                    candidates.append((think_start, "think"))
                if tool_start != -1:
                    candidates.append((tool_start, "tool"))

                if not candidates:
                    # Check for partial tag prefix at the end of buffer
                    last_open = self.buffer.rfind("<")
                    if last_open != -1 and (len(self.buffer) - last_open < 12):
                        prose += self.buffer[:last_open]
                        self.buffer = self.buffer[last_open:]
                        break
                    else:
                        prose += self.buffer
                        self.buffer = ""
                        break

                candidates.sort(key=lambda x: x[0])
                first_idx, tag_type = candidates[0]

                prose += self.buffer[:first_idx]
                if tag_type == "think":
                    tag_len = len("<thought>") if self.buffer[first_idx:].startswith("<thought>") else len("<think>")
                    self.buffer = self.buffer[first_idx + tag_len:]
                    self.in_think = True
                else:
                    self.buffer = self.buffer[first_idx + len("<tool_call>"):]
                    self.in_tool = True

            elif self.in_think:
                think_end = self.buffer.find("</think>")
                if think_end == -1:
                    think_end = self.buffer.find("</thought>")

                if think_end != -1:
                    reasoning += self.buffer[:think_end]
                    tag_len = len("</thought>") if self.buffer[think_end:].startswith("</thought>") else len("</think>")
                    self.buffer = self.buffer[think_end + tag_len:]
                    self.in_think = False
                else:
                    reasoning += self.buffer
                    self.buffer = ""
                    break

            elif self.in_tool:
                tool_end = self.buffer.find("</tool_call>")
                if tool_end != -1:
                    tool += self.buffer[:tool_end]
                    self.buffer = self.buffer[tool_end + len("</tool_call>"):]
                    self.in_tool = False
                else:
                    tool += self.buffer
                    self.buffer = ""
                    break

        return reasoning, tool, prose


class AnalystController:
    """Enterprise coordinator managing session memory, graph building, and SSE streaming."""

    def __init__(
        self,
        lifecycle: EngineLifecycle | None = None,
        config: EngineConfig | None = None,
    ):
        self.config = config or get_engine_config()
        self.lifecycle = lifecycle or EngineLifecycle(self.config)
        self._graph: Any = None
        self._lock = asyncio.Lock()

    async def get_graph(self, graph_type: str = "supervisor") -> Any:
        """Lazily initialize and return the compiled graph (supervisor or canonical analyst)."""
        if graph_type == "analyst":
            from dbgpt_analyst.graphs.analyst_graph import analyst_graph
            return analyst_graph

        if self._graph is not None:
            return self._graph

        async with self._lock:
            if self._graph is not None:
                return self._graph

            checkpointer = await self.lifecycle.startup()
            self._graph = await build_supervisor_graph(
                checkpointer=checkpointer,
                recursion_limit=self.config.supervisor_recursion_limit,
            )
            return self._graph

    async def run_analyst_stream(
        self,
        request: AnalystRequest | dict[str, Any],
    ) -> AsyncIterator[str]:
        """Primary streaming execution method yielding standard SSE event strings."""
        if isinstance(request, dict):
            req = AnalystRequest(**request)
        else:
            req = request

        session_id = req.session_id or f"session-{asyncio.current_task().get_name()}"
        self.lifecycle.register_session(session_id)

        format_mode: StreamFormat = getattr(req, "stream_format", "legacy") or "legacy"
        adapter = DualFormatStreamAdapter(format_mode=format_mode, run_id=session_id, thread_id=session_id)
        filter_sm = StreamTokenFilter()

        # Emit task start event
        if format_mode == "canonical":
            yield adapter.encode_custom_event(
                "workflow.started",
                {"message": "Initializing DB-GPT Analyst session", "session_id": session_id},
            )
        else:
            yield event_to_sse(
                WorkflowTaskEvent(
                    payload={"message": "Initializing DB-GPT Analyst session", "session_id": session_id},
                    status="running",
                )
            )

        try:
            target_graph = "analyst" if req.mode == "canonical_analyst" else "supervisor"
            graph = await self.get_graph(target_graph)

            runnable_config = {
                "configurable": {
                    "thread_id": session_id,
                    "user_id": req.user_id,
                    "db_name": req.db_name or self.config.analyst_default_db_name,
                },
                "recursion_limit": self.config.supervisor_recursion_limit,
            }

            initial_state = {
                "messages": [HumanMessage(content=req.question)],
                "question": req.question,
                "session_id": session_id,
                "query_type": req.mode,
            }

            async for item in graph.astream(
                initial_state,
                config=runnable_config,
                stream_mode=["messages", "custom", "updates"],
            ):
                mode, payload = item

                if mode == "messages":
                    chunk, metadata = payload
                    if isinstance(chunk, AIMessageChunk) and chunk.content:
                        text = str(chunk.content)
                        reasoning, tool, prose = filter_sm.process_chunk(text)

                        if reasoning:
                            if format_mode == "canonical":
                                yield adapter.encode_custom_event(
                                    "thinking.delta",
                                    {"content": reasoning},
                                )
                            else:
                                yield event_to_sse(
                                    ThinkingDeltaEvent(payload={"content": reasoning})
                                )
                        if prose:
                            if format_mode == "canonical":
                                yield adapter.encode_text_delta(prose)
                            else:
                                yield event_to_sse(
                                    AnswerDeltaEvent(payload={"content": prose})
                                )

                elif mode == "custom":
                    if isinstance(payload, dict):
                        name = payload.get("name") or payload.get("type") or "custom"
                        data = payload.get("data", payload)
                        if format_mode == "canonical":
                            yield adapter.encode_custom_event(name, data)
                        else:
                            yield f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False, default=json_serial)}\n\n"
                    elif hasattr(payload, "model_dump"):
                        if format_mode == "canonical":
                            yield adapter.encode_custom_event(
                                getattr(payload, "type", "custom"),
                                payload.model_dump(),
                            )
                        else:
                            yield event_to_sse(payload)

                elif mode == "updates":
                    # Handle state node updates
                    pass

            if format_mode == "canonical":
                yield adapter.encode_finish(finish_reason="stop")
            else:
                yield event_to_sse(
                    FinalEvent(
                        payload={"status": "completed", "session_id": session_id},
                        status="done",
                    )
                )

        except Exception as exc:
            logger.exception("[AnalystController] Streaming error: %s", exc)
            if format_mode == "canonical":
                yield adapter.encode_custom_event(
                    "run.error",
                    {"error": f"Error during analysis: {exc}"},
                )
            else:
                yield event_to_sse(
                    ErrorEvent(
                        payload={"error": f"Error during analysis: {exc}"},
                        status="error",
                    )
                )
        finally:
            self.lifecycle.evict_session(session_id)


# Global singleton controller
_global_controller: AnalystController | None = None


def get_analyst_controller() -> AnalystController:
    """Access global AnalystController singleton."""
    global _global_controller
    if _global_controller is None:
        _global_controller = AnalystController()
    return _global_controller


async def run_analyst_stream(request: AnalystRequest | dict[str, Any]) -> AsyncIterator[str]:
    """Module-level entrypoint for SSE streaming."""
    controller = get_analyst_controller()
    async for event in controller.run_analyst_stream(request):
        yield event


__all__ = [
    "AnalystController",
    "AnalystRequest",
    "StreamTokenFilter",
    "get_analyst_controller",
    "run_analyst_stream",
]
