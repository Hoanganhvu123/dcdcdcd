"""main_agent.py — Clean backward-compatible facade for Supervisor Graph.

Delegates core graph building to dbgpt_analyst.graphs.supervisor and prompts
to dbgpt_analyst.prompts.supervisor_prompt.
"""
from __future__ import annotations

from dbgpt_analyst.graphs.supervisor import (
    SubagentEventStreamWrapper,
    _FORWARD_FIELDS,
    _build_declarative_subagents,
    _build_domain_state,
    _build_subagents,
    _extract_question,
    _format_result,
    _make_subagent_adapter,
    build_main_graph,
    build_supervisor_graph,
    checkpoint_revert_node,
)
from dbgpt_analyst.prompts.supervisor_prompt import (
    ALERT_MONITOR_PROMPT,
    DATA_VISUALIZER_PROMPT,
    SYSTEM_PROMPT,
    render_supervisor_system_prompt,
)
from dbgpt_analyst.middleware.runtime import AgentContext

__all__ = [
    "ALERT_MONITOR_PROMPT",
    "DATA_VISUALIZER_PROMPT",
    "SYSTEM_PROMPT",
    "SubagentEventStreamWrapper",
    "_FORWARD_FIELDS",
    "_build_declarative_subagents",
    "_build_domain_state",
    "_build_subagents",
    "_extract_question",
    "_format_result",
    "_make_subagent_adapter",
    "build_main_graph",
    "build_supervisor_graph",
    "checkpoint_revert_node",
    "render_supervisor_system_prompt",
    "AgentContext",
]
