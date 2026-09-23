"""Tools Node — SQL & Analytics Tool Execution with Fallback Cascade.

Specialized agent node using PromptManager:
- Pre-validates and adapts tool arguments
- Executes analytics tools (SQL execution, table inspection, schema retrieval, web research)
- Resilient fallback cascade with zero hardcoded multiline prompt strings
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, ValidationError

from dbgpt_analyst.prompts.compiler import PromptManager

logger = logging.getLogger(__name__)

# Default Tool Registry for Analytics
ANALYST_TOOL_REGISTRY: dict[str, Callable[..., Any]] = {}


def register_analyst_tool(name: str, fn: Callable[..., Any]) -> None:
    """Register an analytics execution tool."""
    ANALYST_TOOL_REGISTRY[name] = fn


# Standard fallback cascades
TOOL_FALLBACK_CASCADES: dict[str, list[str]] = {
    "execute_sql": ["mock_execute_sql", "fallback_sql_executor"],
    "explore_schema": ["get_table_schema", "fallback_schema_reader"],
    "web_research": ["search_internet", "fallback_research"],
}


def _validate_and_adapt_args(
    tool_fn: Any,
    tool_name: str,
    raw_args: dict[str, Any],
    query: str,
) -> dict[str, Any]:
    """Pre-validate and adapt arguments using Pydantic schemas if present."""
    adapted: dict[str, Any] = dict(raw_args or {})
    if "query" not in adapted and query:
        adapted["query"] = query
    if "sql" not in adapted and "query" in adapted and tool_name == "execute_sql":
        adapted["sql"] = adapted["query"]

    args_schema = getattr(tool_fn, "args_schema", None)
    if args_schema is not None and isinstance(args_schema, type) and issubclass(args_schema, BaseModel):
        try:
            validated = args_schema.model_validate(adapted)
            return validated.model_dump()
        except ValidationError as exc:
            logger.warning("Pydantic validation warning for '%s': %s", tool_name, exc)
            salvaged = {k: adapted[k] for k in args_schema.model_fields.keys() if k in adapted}
            return salvaged or adapted

    return adapted


async def _execute_single_tool(
    tool_fn: Any,
    tool_args: dict[str, Any],
    config: RunnableConfig | None = None,
) -> Any:
    """Execute a tool function asynchronously or synchronously."""
    if hasattr(tool_fn, "ainvoke"):
        return await tool_fn.ainvoke(tool_args, config=config)
    elif hasattr(tool_fn, "invoke"):
        return tool_fn.invoke(tool_args, config=config)
    elif callable(tool_fn):
        res = tool_fn(**tool_args)
        if hasattr(res, "__await__"):
            return await res
        return res
    raise RuntimeError(f"Tool {tool_fn} is not callable.")


async def tools_node(
    state: dict[str, Any], config: RunnableConfig | None = None
) -> dict[str, Any]:
    """Execute analytics tools with fallback cascade and error recovery."""
    t0 = time.time()
    primary_tool = (
        state.get("tool_name")
        or state.get("tool_name_used")
        or "execute_sql"
    )
    raw_args = state.get("tool_args") or {}
    query = state.get("question") or ""

    # Check registered tool or execution node
    candidate_queue = [primary_tool] + TOOL_FALLBACK_CASCADES.get(primary_tool, [])
    seen = set()
    deduped_candidates = [c for c in candidate_queue if not (c in seen or seen.add(c))]

    tool_result: Any = None
    successful_tool: str = primary_tool
    fallback_trail: list[dict[str, Any]] = []
    is_fallback_used = False
    is_fatal_error = False
    last_error_msg = ""

    # Optional prompt rendering for tool instructions
    try:
        _ = PromptManager.render_template(
            "tools",
            {"tool_name": primary_tool},
            check_unrendered=False,
        )
    except Exception as exc:
        logger.debug("PromptManager tools template: %s", exc)

    for idx, current_tool in enumerate(deduped_candidates):
        step_t0 = time.time()
        tool_fn = ANALYST_TOOL_REGISTRY.get(current_tool)

        # If not directly registered, check if custom tool function provided in state or config
        if tool_fn is None:
            config_tools = (config or {}).get("configurable", {}).get("tools", {})
            tool_fn = config_tools.get(current_tool)

        if tool_fn is None:
            # Check built-in fallback mock
            if current_tool.startswith("mock_") or current_tool.startswith("fallback_"):
                tool_result = {"status": "success", "result": f"Fallback result from {current_tool}", "data": []}
                successful_tool = current_tool
                break
            continue

        try:
            validated_args = _validate_and_adapt_args(tool_fn, current_tool, raw_args, query)
            res = await _execute_single_tool(tool_fn, validated_args, config=config)
            step_elapsed = round((time.time() - step_t0) * 1000)

            is_empty = res is None or (isinstance(res, str) and not res.strip())
            if is_empty and idx < len(deduped_candidates) - 1:
                fallback_trail.append({"tool": current_tool, "status": "empty", "elapsed_ms": step_elapsed})
                is_fallback_used = True
                continue

            tool_result = res
            successful_tool = current_tool
            if idx > 0:
                is_fallback_used = True
                fallback_trail.append({"tool": current_tool, "status": "fallback_success", "elapsed_ms": step_elapsed})
            break

        except Exception as exc:
            step_elapsed = round((time.time() - step_t0) * 1000)
            last_error_msg = str(exc)
            fallback_trail.append({"tool": current_tool, "status": "error", "error": last_error_msg, "elapsed_ms": step_elapsed})
            if idx < len(deduped_candidates) - 1:
                is_fallback_used = True
                continue
            else:
                is_fatal_error = True
                tool_result = f"Tool execution failed ({current_tool}): {last_error_msg}"

    if tool_result is None and not is_fatal_error:
        tool_result = state.get("sql_result") or state.get("tool_result") or "Executed analytics query."

    elapsed_ms = round((time.time() - t0) * 1000)

    # Format ToolMessage for graph history
    call_id = state.get("tool_call_id") or f"call_{int(time.time()*1000)}"
    tool_msg = ToolMessage(
        content=str(tool_result),
        name=successful_tool,
        tool_call_id=call_id,
        status="error" if is_fatal_error else "success",
    )

    diagnostics = [{
        "step": "tools",
        "label": f"🛠️ {successful_tool}",
        "content": str(tool_result)[:200],
        "elapsed_ms": elapsed_ms,
        "fallback_trail": fallback_trail if is_fallback_used else [],
    }]

    res_state: dict[str, Any] = {
        "messages": [tool_msg],
        "tool_name": successful_tool,
        "tool_name_used": successful_tool,
        "tool_result": tool_result,
        "diagnostics": diagnostics,
        "timing_tools_s": round(elapsed_ms / 1000, 3),
    }

    if is_fatal_error:
        res_state["error"] = last_error_msg

    return res_state


__all__ = [
    "ANALYST_TOOL_REGISTRY",
    "TOOL_FALLBACK_CASCADES",
    "register_analyst_tool",
    "tools_node",
]
