"""lib/react_agent.py — Custom ReAct Agent core with streaming event hooks.

Stripped-down fork of langgraph.prebuilt.create_react_agent.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMOVED (upstream boilerplate):
  - Deprecated AgentState/Pydantic types and warnings
  - response_format / generate_structured_response
  - pre_model_hook / post_model_hook
  - Dynamic model selection (callable model)
  - config_schema deprecation dance
  - Sync call_model (async-first)
  - Send API v2 parallel dispatch (use v1 sequential tools)

ADDED (our custom extensions):
  - event_dispatcher: async callback (event_type, data, config)
    → Fires on "tool_call" and "tool_result" for SSE streaming
  - Custom tool execution (no ToolNode dependency) for full control
  - Proper async-first with sync fallback

GRAPH STRUCTURE (same as upstream):
  ┌─────┐     tool_calls?     ┌───────┐
  │agent│────── yes ──────────▶│ tools │
  │(LLM)│◀─────────────────────│(exec) │
  └──┬──┘                     └───────┘
     │ no tool_calls
     ▼
    END

Usage:
    from dbgpt_analyst.libs.react_agent import create_react_agent

    agent = create_react_agent(
        model=llm,
        tools=[profile_data, detect_anomalies, ...],
        prompt="You are a data engineer...",
        event_dispatcher=my_sse_emitter,  # async (type, data, config) -> None
        name="data_engineer",
    )
    result = await agent.ainvoke({"messages": [...]}, config={...})
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Sequence
from typing import Annotated, Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph
from typing_extensions import TypedDict

logger = logging.getLogger(__name__)


# ── Minimal agent state ──────────────────────────────────────────────────────

class ReactAgentState(TypedDict):
    """Minimal state for ReAct agent — only messages."""
    messages: Annotated[list[BaseMessage], add_messages]


# ── Type aliases ──────────────────────────────────────────────────────────────

EventDispatcher = Callable[[str, dict, RunnableConfig], Awaitable[None]] | None
Prompt = str | SystemMessage | None


# ── Core factory ──────────────────────────────────────────────────────────────

def create_react_agent(
    model: BaseChatModel,
    tools: Sequence[BaseTool | Callable],
    *,
    prompt: Prompt = None,
    event_dispatcher: EventDispatcher = None,
    name: str | None = None,
) -> CompiledStateGraph:
    """Create a ReAct agent graph with optional streaming event hooks.

    Args:
        model: Chat model instance (auto bind_tools applied)
        tools: List of tools — @tool decorated functions or BaseTool instances
        prompt: System prompt (str or SystemMessage)
        event_dispatcher: Async callback ``(event_type, data, config) -> None``
            Fired on ``"tool_call"`` and ``"tool_result"`` events
        name: Optional name tag for AIMessage.name

    Returns:
        CompiledStateGraph with ``agent → tools`` loop
    """
    # ── Prepare tools ─────────────────────────────────────────────────────
    from langchain_core.tools import BaseTool as _BT

    tool_instances: list[_BT] = []
    for t in tools:
        if isinstance(t, _BT):
            tool_instances.append(t)
        elif callable(t):
            # Wrap plain functions via @tool decorator if not already
            from langchain_core.tools import tool as tool_decorator
            tool_instances.append(tool_decorator(t))
        else:
            raise TypeError(f"Expected BaseTool or callable, got {type(t)}")

    tools_by_name: dict[str, _BT] = {t.name: t for t in tool_instances}

    # Bind tools to model so LLM knows available functions
    bound_model = model.bind_tools(tool_instances) if tool_instances else model

    # Build system message
    sys_msg: BaseMessage | None = None
    if isinstance(prompt, str):
        sys_msg = SystemMessage(content=prompt)
    elif isinstance(prompt, SystemMessage):
        sys_msg = prompt

    # ── Agent node (calls LLM) ────────────────────────────────────────────

    async def acall_model(state: ReactAgentState, config: RunnableConfig) -> dict:
        messages = list(state["messages"])
        if sys_msg is not None:
            messages = [sys_msg] + messages

        response = await bound_model.ainvoke(messages, config)

        # Tag with agent name
        if isinstance(response, AIMessage):
            response.name = name

            # ── Fire tool_call events ─────────────────────────────────────
            if event_dispatcher and response.tool_calls:
                for tc in response.tool_calls:
                    await event_dispatcher("tool_call", {
                        "tool": tc["name"],
                        "args": tc.get("args", {}),
                    }, config)

        return {"messages": [response]}

    # ── Tools node (executes tools sequentially) ──────────────────────────

    async def aexecute_tools(state: ReactAgentState, config: RunnableConfig) -> dict:
        messages = state["messages"]
        last_msg = messages[-1]

        if not isinstance(last_msg, AIMessage) or not last_msg.tool_calls:
            return {"messages": []}

        tool_results: list[ToolMessage] = []
        for tc in last_msg.tool_calls:
            tool_name = tc["name"]
            tool_args = tc.get("args", {})
            tool_id = tc["id"]

            tool_fn = tools_by_name.get(tool_name)
            if tool_fn is None:
                result = f"Error: Unknown tool '{tool_name}'. Available: {list(tools_by_name.keys())}"
            else:
                try:
                    result = await tool_fn.ainvoke(tool_args, config)
                except Exception as exc:
                    logger.exception("Tool '%s' failed", tool_name)
                    result = f"Error executing {tool_name}: {exc}"

            # ── Fire tool_result event ────────────────────────────────────
            if event_dispatcher:
                await event_dispatcher("tool_result", {
                    "tool": tool_name,
                    "result": str(result)[:400],
                }, config)

            tool_results.append(
                ToolMessage(content=str(result), tool_call_id=tool_id, name=tool_name)
            )

        return {"messages": tool_results}

    # ── Routing: continue if tool_calls, else END ─────────────────────────

    def should_continue(state: ReactAgentState) -> str:
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and last.tool_calls:
            return "tools"
        return END

    # ── Build graph ───────────────────────────────────────────────────────

    workflow = StateGraph(ReactAgentState)
    workflow.add_node("agent", acall_model)
    workflow.add_node("tools", aexecute_tools)
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue, ["tools", END])
    workflow.add_edge("tools", "agent")

    return workflow.compile(name=name)
