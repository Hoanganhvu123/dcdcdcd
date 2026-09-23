"""runtime.py — Custom DeepAgents Middleware Stack.

Middleware Ordering (DeepAgents SDK, from first to last):
══════════════════════════════════════════════════════════
 1. TodoListMiddleware        — write_todos tool (always)
 2. SkillsMiddleware          — when skills= is passed
 3. FilesystemMiddleware      — ls, read_file, write_file, etc.
 4. SubAgentMiddleware        — task tool, spawns subagents
 5. SummarizationMiddleware   — auto-compress at 85% context
 6. PatchToolCallsMiddleware  — repair malformed tool calls
 7. AsyncSubAgentMiddleware   — when async subagents configured
>>> 8. [THIS FILE] configurable_model_middleware ← our slot
 9. Harness profile extras    — provider-specific additions
10. Excluded-tool filtering   — from harness profile
11. AnthropicPromptCachingMiddleware / BedrockPromptCachingMiddleware
12. MemoryMiddleware          — when memory= is passed
13. HumanInTheLoopMiddleware  — when interrupt_on= is passed
══════════════════════════════════════════════════════════

Usage in build_main_graph():
    from dbgpt_analyst.middleware import (
        AgentContext,
        configurable_model_middleware,
    )

    middleware = [configurable_model_middleware]
    return create_deep_agent(
        ...,
        context_schema=AgentContext,
        middleware=middleware,
    )
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
import dataclasses

from langchain.agents.middleware import ModelRequest, ModelResponse

# ══════════════════════════════════════════════════════════════════════════════
# Runtime Context Schema
# ══════════════════════════════════════════════════════════════════════════════

@dataclasses.dataclass
class AgentContext:
    """Runtime context injected by the frontend UI per-request.

    Fields:
        model: Optional LLM override. Format: "provider:model-name".
               Examples: "openai:gpt-4o", "anthropic:claude-sonnet-4-5",
                         "google_genai:gemini-2.5-flash"
               If None, the agent uses the default model passed to build_main_graph().
    """
    model: str | None = None


from langchain.agents.middleware.types import AgentMiddleware


class ConfigurableModelMiddleware(AgentMiddleware):
    """Swap the underlying LLM at runtime based on AgentContext.model.

    Implements both sync and async hooks to avoid awrap_model_call errors
    when executing the agent asynchronously (e.g. graph.astream_events).
    """

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        ctx = getattr(request.runtime, "context", None)
        if not ctx or not getattr(ctx, "model", None):
            return handler(request)

        model_name: str = ctx.model
        if model_name == "auto":
            from dbgpt_analyst.common.auto_model import get_auto_model
            new_model = get_auto_model(model_name="auto")
        else:
            from dbgpt_analyst.common.llm_factory import create_llm
            new_model = create_llm(model_name)
        return handler(request.override(model=new_model))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        ctx = getattr(request.runtime, "context", None)
        if not ctx or not getattr(ctx, "model", None):
            return await handler(request)

        model_name: str = ctx.model
        if model_name == "auto":
            from dbgpt_analyst.common.auto_model import get_auto_model
            new_model = get_auto_model(model_name="auto")
        else:
            from dbgpt_analyst.common.llm_factory import create_llm
            new_model = create_llm(model_name)
        return await handler(request.override(model=new_model))


configurable_model_middleware = ConfigurableModelMiddleware()