"""common/sql_guard.py — Backward-compatible re-export from guard.sql_guard."""
from dbgpt_analyst.guard.sql_guard import (
    SQLGuardError,
    _normalize_identifier,
    apply_rls_mutation,
    secure_sql,
)

__all__ = [
    "SQLGuardError",
    "_normalize_identifier",
    "apply_rls_mutation",
    "secure_sql",
]