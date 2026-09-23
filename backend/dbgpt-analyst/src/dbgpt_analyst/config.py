"""config.py — Root re-export facade pointing to core.config.

Maintained for backward-compatibility with existing imports.
"""
from dbgpt_analyst.core.config import (
    ANALYST_DEFAULT_DB_NAME,
    ANALYST_SANDBOX_MODE,
    CHECKPOINT_POSTGRES_SCHEMA,
    CONV_DATABASE_URL,
    LLM_CALL_TIMEOUT_SEC,
    MAX_SESSION_TIMEOUT_SEC,
    QUERY_CACHE_MAXSIZE,
    QUERY_CACHE_TTL_SEC,
    SQL_GEN_CACHE_MAXSIZE,
    SQL_GEN_CACHE_TTL_SEC,
    SQL_MAX_ROW,
    SUPERVISOR_RECURSION_LIMIT,
    EngineConfig,
    get_engine_config,
)

__all__ = [
    "ANALYST_DEFAULT_DB_NAME",
    "ANALYST_SANDBOX_MODE",
    "CHECKPOINT_POSTGRES_SCHEMA",
    "CONV_DATABASE_URL",
    "EngineConfig",
    "LLM_CALL_TIMEOUT_SEC",
    "MAX_SESSION_TIMEOUT_SEC",
    "QUERY_CACHE_MAXSIZE",
    "QUERY_CACHE_TTL_SEC",
    "SQL_GEN_CACHE_MAXSIZE",
    "SQL_GEN_CACHE_TTL_SEC",
    "SQL_MAX_ROW",
    "SUPERVISOR_RECURSION_LIMIT",
    "get_engine_config",
]