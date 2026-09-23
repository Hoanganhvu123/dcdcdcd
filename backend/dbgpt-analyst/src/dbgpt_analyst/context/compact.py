"""4-Tier context compaction strategies for LangChain BaseMessage sequences.

Preserves tool-call invariants: never splits an AIMessage(tool_calls=...)
from its corresponding ToolMessage(tool_call_id=...).
"""

from __future__ import annotations

import copy
import logging
from abc import ABC, abstractmethod
from typing import List, Sequence, Tuple

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from .budget import ContextBudgetConfig, ContextBudgetTracker, count_message_tokens

logger = logging.getLogger(__name__)


def detect_round_boundaries(messages: Sequence[BaseMessage]) -> List[Tuple[int, int]]:
    """Detect conversation round boundaries (start_idx, end_idx inclusive).

    A round typically starts with a HumanMessage and includes all subsequent
    AIMessages, ToolMessages until the next HumanMessage.
    System messages at index 0 are treated as round 0 or standalone.
    """
    if not messages:
        return []

    boundaries: List[Tuple[int, int]] = []
    current_start = 0

    for i, m in enumerate(messages):
        if i == 0:
            continue
        if isinstance(m, HumanMessage):
            # End previous round before this HumanMessage
            boundaries.append((current_start, i - 1))
            current_start = i

    boundaries.append((current_start, len(messages) - 1))
    return boundaries


class BaseContextCompactor(ABC):
    """Abstract base class for compaction strategies."""

    def __init__(
        self,
        config: ContextBudgetConfig | None = None,
        tracker: ContextBudgetTracker | None = None,
    ):
        self.config = config or ContextBudgetConfig()
        self.tracker = tracker or ContextBudgetTracker(self.config)

    @abstractmethod
    def compact(self, messages: Sequence[BaseMessage]) -> List[BaseMessage]:
        """Compact messages and return new compacted list."""
        pass


class ObservationMicroCompact(BaseContextCompactor):
    """Tier 1: Truncates large ToolMessage observation outputs in older rounds.

    Keeps the recent `min_keep_recent_rounds` untouched.
    For older ToolMessages, truncates content to `truncated_observation_max_chars`.
    """

    def compact(self, messages: Sequence[BaseMessage]) -> List[BaseMessage]:
        if not messages:
            return []

        rounds = detect_round_boundaries(messages)
        if len(rounds) <= self.config.min_keep_recent_rounds:
            return list(messages)

        # Older rounds that are candidates for observation truncation
        cutoff_round_idx = len(rounds) - self.config.min_keep_recent_rounds
        cutoff_msg_idx = rounds[cutoff_round_idx][0]

        max_chars = self.config.truncated_observation_max_chars
        compacted: List[BaseMessage] = []

        for i, m in enumerate(messages):
            if i < cutoff_msg_idx and isinstance(m, ToolMessage):
                content = str(m.content or "")
                if len(content) > max_chars:
                    truncated = (
                        content[:max_chars]
                        + f"\n... [Truncated {len(content) - max_chars} characters by ObservationMicroCompact]"
                    )
                    # Clone message with truncated content
                    new_m = ToolMessage(
                        content=truncated,
                        tool_call_id=m.tool_call_id,
                        name=getattr(m, "name", None),
                        additional_kwargs=m.additional_kwargs,
                    )
                    compacted.append(new_m)
                    continue
            compacted.append(m)

        return compacted


class SessionMemoryCompact(BaseContextCompactor):
    """Tier 2: Collapses older middle rounds into a brief structured summary."""

    def compact(self, messages: Sequence[BaseMessage]) -> List[BaseMessage]:
        if not messages:
            return []

        rounds = detect_round_boundaries(messages)
        if len(rounds) <= self.config.min_keep_recent_rounds + 1:
            return list(messages)

        # Preserve SystemMessage at index 0 if present
        sys_msgs: List[BaseMessage] = [m for m in messages if isinstance(m, SystemMessage)]
        non_sys = [m for m in messages if not isinstance(m, SystemMessage)]

        non_sys_rounds = detect_round_boundaries(non_sys)
        if len(non_sys_rounds) <= self.config.min_keep_recent_rounds:
            return list(messages)

        # First round (initial user query) + recent N rounds are preserved
        first_round = non_sys[non_sys_rounds[0][0] : non_sys_rounds[0][1] + 1]
        recent_start_idx = non_sys_rounds[-self.config.min_keep_recent_rounds][0]
        recent_rounds = non_sys[recent_start_idx:]

        # Middle rounds are summarized
        middle_msgs = non_sys[non_sys_rounds[0][1] + 1 : recent_start_idx]
        if not middle_msgs:
            return list(messages)

        # Build concise extraction of middle rounds
        summary_lines = ["### Previous Analysis Summary:"]
        for m in middle_msgs:
            if isinstance(m, HumanMessage):
                summary_lines.append(f"- User asked: {m.content[:150]}")
            elif isinstance(m, AIMessage) and m.content:
                summary_lines.append(f"- Assistant insight: {str(m.content)[:200]}")
            elif isinstance(m, ToolMessage):
                summary_lines.append(f"- Tool result ({getattr(m, 'name', 'tool')}): completed.")

        summary_msg = SystemMessage(content="\n".join(summary_lines))

        result: List[BaseMessage] = []
        result.extend(sys_msgs)
        result.extend(first_round)
        result.append(summary_msg)
        result.extend(recent_rounds)
        return result


class FullContextCompression(BaseContextCompactor):
    """Tier 3: Aggressive compression of all history before the last N rounds."""

    def compact(self, messages: Sequence[BaseMessage]) -> List[BaseMessage]:
        if not messages:
            return []

        rounds = detect_round_boundaries(messages)
        if len(rounds) <= 1:
            return list(messages)

        recent_keep = max(1, self.config.min_keep_recent_rounds - 1)
        recent_start_idx = rounds[-recent_keep][0] if len(rounds) >= recent_keep else 0

        sys_msgs: List[BaseMessage] = [m for m in messages if isinstance(m, SystemMessage)]
        past_msgs = messages[:recent_start_idx]
        recent_msgs = messages[recent_start_idx:]

        past_summary = []
        for m in past_msgs:
            if isinstance(m, HumanMessage):
                past_summary.append(f"User: {m.content[:100]}")
            elif isinstance(m, AIMessage) and m.content:
                past_summary.append(f"AI: {str(m.content)[:120]}")

        condensed = SystemMessage(
            content="[Compressed Prior Context]\n" + "\n".join(past_summary[:10])
        )

        result: List[BaseMessage] = []
        result.extend(sys_msgs)
        result.append(condensed)
        result.extend(recent_msgs)
        return result


class ReactiveCompact(BaseContextCompactor):
    """Tier 4: Emergency eviction when context is in OVERFLOW or CRITICAL."""

    def compact(self, messages: Sequence[BaseMessage]) -> List[BaseMessage]:
        if not messages:
            return []

        # Keep system messages and the very latest round
        sys_msgs = [m for m in messages if isinstance(m, SystemMessage)]
        non_sys = [m for m in messages if not isinstance(m, SystemMessage)]

        if not non_sys:
            return list(messages)

        rounds = detect_round_boundaries(non_sys)
        # Keep last 1 round only
        last_round = non_sys[rounds[-1][0] :]

        result: List[BaseMessage] = []
        result.extend(sys_msgs)
        result.extend(last_round)
        return result
