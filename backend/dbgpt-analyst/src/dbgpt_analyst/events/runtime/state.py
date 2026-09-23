"""Stream State — mutable state tracked across the entire SSE stream."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class StreamState:
    """Mutable state tracked across the entire SSE stream."""

    # Config
    think_mode: str = "standard"
    msg_id: str = ""
    text_part_id: str = ""

    # Accumulated response
    text_started: bool = False
    full_response: str = ""

    # Tool tracking
    tool_call_counter: int = 0
    last_search_label: str = ""
    any_tool_called: bool = False
    run_id_to_action: dict = field(default_factory=dict)
    run_id_to_start_time: dict = field(default_factory=dict)
    last_tool_start_time: float = 0.0
    grounding_documents: list[dict] = field(default_factory=list)
    grounding_document_keys: set[str] = field(default_factory=set)
    prior_grounding_documents: list[dict] = field(default_factory=list)
    user_query: str = ""

    # Phase state machine: reasoning → post_tool → answering
    stream_phase: str = "reasoning"
    reasoning_text: str = ""
    post_tool_buffer: str = ""
    consuming_thought: bool = False
    in_think_tag: bool = False

    # HITL Steering & Interrupt tracking
    is_interrupted: bool = False
    plan_prompt_emitted: bool = False

    # Event envelope emitter (R01)
    emitter: Any | None = None

    # Sub-agent deliverable harvesting
    last_deliverable: str = ""

    @property
    def show_reasoning(self) -> bool:
        """Whether to emit reasoning steps."""
        return self.think_mode in ("deep", "analyst", "supervisor", "standard")


__all__ = ["StreamState"]
