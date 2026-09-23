"""Deprecated module: middleware has been consolidated into guard/ and core/.
This module provides backward-compatibility forwarding to dbgpt_analyst.guard and dbgpt_analyst.core.
"""

from .runtime import AgentContext, ConfigurableModelMiddleware, configurable_model_middleware
from .doom_loop_guard import DoomLoopGuardMiddleware
from .guarded_tools import DEFAULT_TOOL_TIMEOUT_SECONDS, GuardedToolMiddleware
from .dynamic_injection import DynamicInjectionProvider
from .messages_reducer import _messages_delta_reducer
from .sanitize_tool_inputs import SanitizeToolInputsMiddleware
from .tool_error_handler import ToolErrorMiddleware
from .approval_policy import ActionApprovalPolicy
from .thinking_guard import APIEmptyResponseError, ThinkingGuardMiddleware
from .db_circuit_breaker import (
    SANDBOX_CIRCUIT_BREAKER_THRESHOLD,
    SANDBOX_UNRECOVERABLE_MESSAGE,
    SandboxCircuitBreakerMiddleware,
    SandboxErrorStreak,
)
from .ensure_no_empty_msg import (
    check_if_confirming_completion,
    check_if_model_messaged_user,
    check_if_no_op,
    ensure_no_empty_msg,
    get_every_message_since_last_human,
)
from .skills import build_skills_middleware
from .step_budget import StepBudgetMiddleware
from .verification_gate import (
    VerificationGateMiddleware,
    inject_grounded_facts,
    strip_ungrounded_claims,
    verify_numerical_claims,
)

__all__ = [
    "APIEmptyResponseError",
    "ActionApprovalPolicy",
    "AgentContext",
    "ConfigurableModelMiddleware",
    "DoomLoopGuardMiddleware",
    "GuardedToolMiddleware",
    "DEFAULT_TOOL_TIMEOUT_SECONDS",
    "DynamicInjectionProvider",
    "SanitizeToolInputsMiddleware",
    "StepBudgetMiddleware",
    "ToolErrorMiddleware",
    "ThinkingGuardMiddleware",
    "VerificationGateMiddleware",
    "SandboxCircuitBreakerMiddleware",
    "SandboxErrorStreak",
    "SANDBOX_CIRCUIT_BREAKER_THRESHOLD",
    "SANDBOX_UNRECOVERABLE_MESSAGE",
    "ensure_no_empty_msg",
    "check_if_confirming_completion",
    "check_if_model_messaged_user",
    "check_if_no_op",
    "get_every_message_since_last_human",
    "build_skills_middleware",
    "configurable_model_middleware",
    "verify_numerical_claims",
    "strip_ungrounded_claims",
    "inject_grounded_facts",
]