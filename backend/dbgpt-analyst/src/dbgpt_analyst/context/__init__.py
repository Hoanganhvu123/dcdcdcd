"""Deprecated module: context has been migrated to core/context.
This module provides backward-compatibility forwarding.
"""


from .budget import ContextBudgetConfig, ContextBudgetTracker, TokenState
from .compact import (
    BaseContextCompactor,
    FullContextCompression,
    ObservationMicroCompact,
    ReactiveCompact,
    SessionMemoryCompact,
    detect_round_boundaries,
)
from .manager import ContextBudgetManager
from .pairing import find_orphans, is_balanced, repair

__all__ = [
    "TokenState",
    "ContextBudgetConfig",
    "ContextBudgetTracker",
    "BaseContextCompactor",
    "ObservationMicroCompact",
    "SessionMemoryCompact",
    "FullContextCompression",
    "ReactiveCompact",
    "detect_round_boundaries",
    "ContextBudgetManager",
    "find_orphans",
    "is_balanced",
    "repair",
]
