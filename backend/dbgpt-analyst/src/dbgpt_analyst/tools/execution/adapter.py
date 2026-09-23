"""tools/execution/adapter.py — Execution adapter preserving tool_call_id for LangGraph Command updates.

Ensures that every tool invocation produces a properly correlated ToolMessage
bearing the exact tool_call_id, suitable for direct state update or LangGraph Command(update=...).
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
import inspect
import json
import logging
from typing import Any

from langchain_core.messages import ToolMessage
from langgraph.types import Command

from dbgpt_analyst.core.helpers import json_serial
from dbgpt_analyst.guard.db_circuit_breaker import (
    DatabaseCircuitBreakerOpenError,
    get_db_circuit_breaker,
)

logger = logging.getLogger(__name__)


def format_tool_content(result: Any) -> str:
    """Format arbitrary tool output into a clean string representation."""
    if isinstance(result, str):
        return result
    if isinstance(result, (dict, list, tuple)):
        try:
            return json.dumps(result, ensure_ascii=False, default=json_serial)
        except Exception:
            return str(result)
    return str(result)


def create_tool_message(
    tool_call_id: str,
    content: Any,
    name: str | None = None,
    status: str = "success",
    artifact: Any = None,
) -> ToolMessage:
    """Create a ToolMessage with preserved tool_call_id and formatted content."""
    content_str = format_tool_content(content)
    kwargs: dict[str, Any] = {
        "tool_call_id": tool_call_id,
        "content": content_str,
        "status": status,
    }
    if name:
        kwargs["name"] = name
    if artifact is not None:
        kwargs["artifact"] = artifact
    return ToolMessage(**kwargs)


def create_tool_command(
    tool_call_id: str,
    content: Any,
    name: str | None = None,
    status: str = "success",
    additional_updates: dict[str, Any] | None = None,
) -> Command:
    """Create a LangGraph Command(update=...) preserving tool_call_id."""
    tool_msg = create_tool_message(
        tool_call_id=tool_call_id,
        content=content,
        name=name,
        status=status,
    )
    updates: dict[str, Any] = {"messages": [tool_msg]}
    if additional_updates:
        updates.update(additional_updates)
    return Command(update=updates)


class ToolExecutionAdapter:
    """Enterprise tool execution adapter.

    Guarantees:
    1. tool_call_id preservation on success, failure, or timeout.
    2. Exception handling with structured error ToolMessage.
    3. DB Circuit Breaker protection for database operations.
    4. Generation of valid LangGraph Command(update=...).
    """

    def __init__(
        self,
        tool_registry: dict[str, Callable[..., Any]] | None = None,
        timeout_sec: float = 60.0,
    ):
        self.tool_registry: dict[str, Callable[..., Any]] = dict(tool_registry or {})
        self.timeout_sec = timeout_sec
        self._circuit_breaker = get_db_circuit_breaker()

    def register(self, name: str, func: Callable[..., Any]) -> None:
        """Register a tool callable under a given name."""
        self.tool_registry[name] = func

    def get_tool(self, name: str) -> Callable[..., Any] | None:
        return self.tool_registry.get(name)

    async def aexecute(
        self,
        tool_call: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> ToolMessage:
        """Execute a tool call asynchronously and return a verified ToolMessage."""
        tool_call_id = tool_call.get("id") or "call_unknown"
        tool_name = tool_call.get("name") or "unknown_tool"
        raw_args = tool_call.get("args") or {}

        # Normalize args if passed as JSON string
        if isinstance(raw_args, str):
            try:
                args = json.loads(raw_args)
            except Exception:
                args = {"input": raw_args}
        elif isinstance(raw_args, dict):
            args = raw_args
        else:
            args = {"input": raw_args}

        tool_func = self.get_tool(tool_name)
        if tool_func is None:
            err_msg = f"Error: Tool '{tool_name}' is not registered in execution adapter."
            logger.warning("[ToolExecutionAdapter] %s", err_msg)
            return create_tool_message(
                tool_call_id=tool_call_id,
                content=err_msg,
                name=tool_name,
                status="error",
            )

        # Execute with timeout and error handling
        try:
            # Check DB circuit breaker if tool is database-related
            is_db_tool = any(term in tool_name.lower() for term in ("sql", "query", "database", "schema", "table"))
            if is_db_tool and not self._circuit_breaker.can_execute():
                raise DatabaseCircuitBreakerOpenError(
                    f"Tool '{tool_name}' blocked: Database circuit breaker is OPEN."
                )

            if inspect.iscoroutinefunction(tool_func):
                result = await asyncio.wait_for(
                    tool_func(**args),
                    timeout=self.timeout_sec,
                )
            else:
                result = await asyncio.to_thread(tool_func, **args)

            if is_db_tool:
                self._circuit_breaker.record_success()

            return create_tool_message(
                tool_call_id=tool_call_id,
                content=result,
                name=tool_name,
                status="success",
            )

        except asyncio.TimeoutError:
            err_msg = f"Error: Tool '{tool_name}' timed out after {self.timeout_sec}s."
            logger.error("[ToolExecutionAdapter] %s", err_msg)
            return create_tool_message(
                tool_call_id=tool_call_id,
                content=err_msg,
                name=tool_name,
                status="error",
            )
        except DatabaseCircuitBreakerOpenError as dbe:
            err_msg = f"Database Circuit Breaker: {dbe}"
            logger.error("[ToolExecutionAdapter] %s", err_msg)
            return create_tool_message(
                tool_call_id=tool_call_id,
                content=err_msg,
                name=tool_name,
                status="error",
            )
        except Exception as exc:
            err_msg = f"Error executing tool '{tool_name}': {type(exc).__name__}: {exc}"
            logger.error("[ToolExecutionAdapter] %s", err_msg, exc_info=True)
            if any(term in tool_name.lower() for term in ("sql", "query", "database")):
                self._circuit_breaker.record_failure(exc)
            return create_tool_message(
                tool_call_id=tool_call_id,
                content=err_msg,
                name=tool_name,
                status="error",
            )

    async def aexecute_command(
        self,
        tool_call: dict[str, Any],
        additional_updates: dict[str, Any] | None = None,
    ) -> Command:
        """Execute a tool call asynchronously and return a LangGraph Command."""
        tool_msg = await self.aexecute(tool_call)
        updates: dict[str, Any] = {"messages": [tool_msg]}
        if additional_updates:
            updates.update(additional_updates)
        return Command(update=updates)
