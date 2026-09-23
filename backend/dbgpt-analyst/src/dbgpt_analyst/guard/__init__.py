"""guard package — Defensive perimeter for DB-GPT Analyst multi-agent workflows.

Consolidates:
- doom_loop_guard: Prevents repeated identical tool calls with escalating alerts.
- step_budget: Monitors agent step allowance and enforces emergency termination.
- db_circuit_breaker: 3-state DB circuit breaker and sandbox failure mitigation.
- verification_gate: Prevents numerical hallucinations and validates against SQL ground truth.
- sql_guard: AST-level SQL validation, DDL/DML blocking, and RLS enforcement.
"""
from dbgpt_analyst.guard.db_circuit_breaker import (
    CircuitBreakerState,
    DatabaseCircuitBreaker,
    DatabaseCircuitBreakerOpenError,
    DBCircuitBreaker,
    SandboxCircuitBreakerMiddleware,
    get_db_circuit_breaker,
)
from dbgpt_analyst.guard.doom_loop_guard import DoomLoopGuardMiddleware
from dbgpt_analyst.guard.sql_guard import SQLGuardError, apply_rls_mutation, secure_sql
from dbgpt_analyst.guard.step_budget import StepBudgetMiddleware
from dbgpt_analyst.guard.verification_gate import (
    VerificationGateMiddleware,
    inject_grounded_facts,
    strip_ungrounded_claims,
    verify_numerical_claims,
)

__all__ = [
    "CircuitBreakerState",
    "DBCircuitBreaker",
    "DatabaseCircuitBreaker",
    "DatabaseCircuitBreakerOpenError",
    "DoomLoopGuardMiddleware",
    "SQLGuardError",
    "SandboxCircuitBreakerMiddleware",
    "StepBudgetMiddleware",
    "VerificationGateMiddleware",
    "apply_rls_mutation",
    "get_db_circuit_breaker",
    "inject_grounded_facts",
    "secure_sql",
    "strip_ungrounded_claims",
    "verify_numerical_claims",
]
