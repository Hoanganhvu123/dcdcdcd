"""Token budget tracking for LangChain BaseMessage sequences in dbgpt_analyst."""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Sequence

from langchain_core.messages import BaseMessage

logger = logging.getLogger(__name__)

DEFAULT_MAX_CONTEXT_TOKENS = 120000


class TokenState(Enum):
    """Context budget state levels."""

    NORMAL = "normal"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"
    OVERFLOW = "overflow"

    def __ge__(self, other: "TokenState") -> bool:
        order = list(TokenState)
        return order.index(self) >= order.index(other)

    def __gt__(self, other: "TokenState") -> bool:
        order = list(TokenState)
        return order.index(self) > order.index(other)

    def __le__(self, other: "TokenState") -> bool:
        order = list(TokenState)
        return order.index(self) <= order.index(other)

    def __lt__(self, other: "TokenState") -> bool:
        order = list(TokenState)
        return order.index(self) < order.index(other)


class ContextBudgetConfig:
    """Configuration for token budget management."""

    def __init__(
        self,
        max_context_tokens: int = DEFAULT_MAX_CONTEXT_TOKENS,
        warning_threshold: float = 0.70,
        error_threshold: float = 0.90,
        critical_threshold: float = 0.95,
        reserved_tokens: int = 4096,
        min_keep_recent_rounds: int = 3,
        max_compact_failures: int = 3,
        max_observation_age_rounds: int = 3,
        truncated_observation_max_chars: int = 400,
        min_keep_tokens: int = 8000,
    ):
        self.max_context_tokens = (
            max_context_tokens
            if max_context_tokens and max_context_tokens > 0
            else DEFAULT_MAX_CONTEXT_TOKENS
        )
        self.warning_threshold = warning_threshold
        self.error_threshold = error_threshold
        self.critical_threshold = critical_threshold
        self.reserved_tokens = reserved_tokens
        self.min_keep_recent_rounds = min_keep_recent_rounds
        self.max_compact_failures = max_compact_failures
        self.max_observation_age_rounds = max_observation_age_rounds
        self.truncated_observation_max_chars = truncated_observation_max_chars
        self.min_keep_tokens = min_keep_tokens


def count_message_tokens(message: BaseMessage) -> int:
    """Count tokens in a single LangChain BaseMessage."""
    text = ""
    if isinstance(message.content, str):
        text = message.content
    elif isinstance(message.content, list):
        text = " ".join(
            str(item.get("text", "")) if isinstance(item, dict) else str(item)
            for item in message.content
        )
    else:
        text = str(message.content or "")

    # Add tool_calls or additional_kwargs if present
    tool_calls = getattr(message, "tool_calls", None)
    if tool_calls:
        text += " " + str(tool_calls)

    try:
        import tiktoken
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text, disallowed_special=()))
    except Exception:
        # Fallback estimation (~4 chars per token)
        return max(1, len(text) // 4)


class ContextBudgetTracker:
    """Tracks token consumption of LangChain message sequences."""

    def __init__(self, config: ContextBudgetConfig | None = None):
        self.config = config or ContextBudgetConfig()

    def count_tokens(self, messages: Sequence[BaseMessage]) -> int:
        """Count total tokens in a list of messages."""
        if not messages:
            return 0
        return sum(count_message_tokens(m) for m in messages)

    def get_state(self, messages: Sequence[BaseMessage]) -> TokenState:
        """Determine TokenState based on current message tokens."""
        current_tokens = self.count_tokens(messages)
        max_tokens = self.config.max_context_tokens

        if max_tokens <= 0:
            return TokenState.NORMAL

        usage_ratio = current_tokens / max_tokens

        if current_tokens >= (max_tokens - self.config.reserved_tokens) or usage_ratio >= 1.0:
            return TokenState.OVERFLOW
        if usage_ratio >= self.config.critical_threshold:
            return TokenState.CRITICAL
        if usage_ratio >= self.config.error_threshold:
            return TokenState.ERROR
        if usage_ratio >= self.config.warning_threshold:
            return TokenState.WARNING

        return TokenState.NORMAL

    def get_budget_info(self, messages: Sequence[BaseMessage]) -> dict[str, Any]:
        """Get summary info of current budget usage."""
        current = self.count_tokens(messages)
        max_tokens = self.config.max_context_tokens
        return {
            "current_tokens": current,
            "max_tokens": max_tokens,
            "usage_ratio": round(current / max(1, max_tokens), 4),
            "state": self.get_state(messages).value,
            "message_count": len(messages),
        }
