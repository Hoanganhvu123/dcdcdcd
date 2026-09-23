"""Context budget manager for dbgpt_analyst.

Orchestrates token tracking and progressive 4-tier compaction.
"""

from __future__ import annotations

import logging
from typing import List, Sequence

from langchain_core.messages import BaseMessage

from .budget import ContextBudgetConfig, ContextBudgetTracker, TokenState
from .compact import (
    FullContextCompression,
    ObservationMicroCompact,
    ReactiveCompact,
    SessionMemoryCompact,
)
from .pairing import repair as repair_tool_pairing

logger = logging.getLogger(__name__)


class ContextBudgetManager:
    """Orchestrates token budget tracking and automatic compaction."""

    def __init__(self, config: ContextBudgetConfig | None = None):
        self.config = config or ContextBudgetConfig()
        self.tracker = ContextBudgetTracker(self.config)
        self.compactors = [
            ObservationMicroCompact(self.config, self.tracker),
            SessionMemoryCompact(self.config, self.tracker),
            FullContextCompression(self.config, self.tracker),
            ReactiveCompact(self.config, self.tracker),
        ]

    def manage_context(self, messages: Sequence[BaseMessage]) -> List[BaseMessage]:
        """Check budget and progressively compact if necessary."""
        if not messages:
            return []

        current_msgs = list(messages)
        state = self.tracker.get_state(current_msgs)

        if state == TokenState.NORMAL:
            return current_msgs

        initial_tokens = self.tracker.count_tokens(current_msgs)
        logger.info(
            "Context token state [%s] (tokens: %d / %d, msgs: %d) — initiating progressive compaction",
            state.value,
            initial_tokens,
            self.config.max_context_tokens,
            len(current_msgs),
        )

        for compactor in self.compactors:
            # repair() is a no-op on balanced history. It exists so that a
            # compactor that ever slices off an AIMessage from its ToolMessage
            # fails loudly here instead of as a provider 400 two layers away.
            current_msgs = repair_tool_pairing(compactor.compact(current_msgs))
            new_state = self.tracker.get_state(current_msgs)
            if new_state < TokenState.WARNING:
                logger.info(
                    "Compaction succeeded via %s: tokens reduced to %d (%s)",
                    compactor.__class__.__name__,
                    self.tracker.count_tokens(current_msgs),
                    new_state.value,
                )
                return current_msgs

        final_tokens = self.tracker.count_tokens(current_msgs)
        logger.info("Final compacted tokens: %d (reduction: %d tokens)", final_tokens, initial_tokens - final_tokens)
        return current_msgs
