"""DeepAgents package."""

from typing import Annotated, Any

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.middleware.runtime import AgentContext

from .backends.filesystem import FilesystemBackend
from .backends.protocol import (
    BackendFactory,
    BackendProtocol,
    EditResult,
    FileInfo,
    GrepMatch,
    SandboxBackendProtocol,
    WriteResult,
)
from .graph import BASE_AGENT_PROMPT, DEFAULT_SYSTEM_PROMPT, create_deep_agent
from .middleware.filesystem import FilesystemMiddleware
from .middleware.subagents import CompiledSubAgent, SubAgent, SubAgentMiddleware

try:
    from deepagents.middleware.skills import SkillsMiddleware, SkillSource
except ImportError:
    try:
        from deepagents import SkillsMiddleware
        SkillSource = Any  # type: ignore[misc,assignment]
    except ImportError:
        SkillsMiddleware = None  # type: ignore[misc,assignment]
        SkillSource = Any  # type: ignore[misc,assignment]

try:
    from deepagents import DeepAgentState
except ImportError:
    from langchain.agents.middleware.types import AgentState as DeepAgentState


class SubAgentAdapterState(MainAgentState):
    """MainAgentState extended with `messages` for CompiledSubAgent protocol.

    DeepAgents requires CompiledSubAgent runnables to:
      - Accept state with a `messages` key (list[AnyMessage])
      - Return state with `messages` key, final answer as last AIMessage
    """

    messages: Annotated[list[AnyMessage], add_messages]


# Standard alias definitions for unified deepagents imports
CompiledDeepAgent = CompiledStateGraph
DeepAgent = CompiledStateGraph

__all__ = [
    "AgentContext",
    "BASE_AGENT_PROMPT",
    "BackendFactory",
    "BackendProtocol",
    "CompiledDeepAgent",
    "CompiledSubAgent",
    "DEFAULT_SYSTEM_PROMPT",
    "DeepAgent",
    "DeepAgentState",
    "EditResult",
    "FileInfo",
    "FilesystemBackend",
    "FilesystemMiddleware",
    "GrepMatch",
    "SandboxBackendProtocol",
    "SkillSource",
    "SkillsMiddleware",
    "SubAgent",
    "SubAgentAdapterState",
    "SubAgentMiddleware",
    "WriteResult",
    "create_deep_agent",
]
