"""core/config.py — Enterprise EngineConfig for DB-GPT Analyst.

Uses Pydantic BaseSettings for strong typing, environment variable binding,
and validation. Exposes module-level constants for backward compatibility.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class EngineConfig(BaseSettings):
    """Strongly-typed runtime configuration for DB-GPT Analyst."""

    model_config = SettingsConfigDict(
        env_prefix="",
        extra="ignore",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # Conversation / Checkpoint persistence
    conv_database_url: str | None = Field(default=None, alias="CONV_DATABASE_URL")
    checkpoint_postgres_schema: str = Field(default="public", alias="CHECKPOINT_POSTGRES_SCHEMA")
    analyst_sandbox_mode: Literal["local", "docker", "remote"] = Field(
        default="local", alias="ANALYST_SANDBOX_MODE"
    )

    # Caching
    sql_gen_cache_ttl_sec: int = Field(default=300, alias="SQL_GEN_CACHE_TTL_SEC")
    sql_gen_cache_maxsize: int = Field(default=128, alias="SQL_GEN_CACHE_MAXSIZE")
    query_cache_ttl_sec: int = Field(default=300, alias="QUERY_CACHE_TTL_SEC")
    query_cache_maxsize: int = Field(default=256, alias="QUERY_CACHE_MAXSIZE")

    # Execution limits & Guardrails
    sql_max_row: int = Field(default=100, alias="SQL_MAX_ROW")
    llm_call_timeout_sec: float = Field(default=90.0, alias="ANALYST_LLM_CALL_TIMEOUT_SEC")
    analyst_default_db_name: str = Field(default="", alias="ANALYST_DB_NAME")
    supervisor_recursion_limit: int = Field(default=50, alias="ANALYST_RECURSION_LIMIT")
    max_session_timeout_sec: float = Field(default=600.0, alias="ANALYST_SESSION_TIMEOUT_SEC")


@lru_cache(maxsize=1)
def get_engine_config() -> EngineConfig:
    """Return singleton EngineConfig instance loaded from environment."""
    return EngineConfig()


# Module-level backward compatibility aliases
_default_cfg = get_engine_config()

CONV_DATABASE_URL: str | None = _default_cfg.conv_database_url
CHECKPOINT_POSTGRES_SCHEMA: str = _default_cfg.checkpoint_postgres_schema
ANALYST_SANDBOX_MODE: str = _default_cfg.analyst_sandbox_mode

SQL_GEN_CACHE_TTL_SEC: int = _default_cfg.sql_gen_cache_ttl_sec
SQL_GEN_CACHE_MAXSIZE: int = _default_cfg.sql_gen_cache_maxsize

QUERY_CACHE_TTL_SEC: int = _default_cfg.query_cache_ttl_sec
QUERY_CACHE_MAXSIZE: int = _default_cfg.query_cache_maxsize

SQL_MAX_ROW: int = _default_cfg.sql_max_row
LLM_CALL_TIMEOUT_SEC: float = _default_cfg.llm_call_timeout_sec
ANALYST_DEFAULT_DB_NAME: str = _default_cfg.analyst_default_db_name
SUPERVISOR_RECURSION_LIMIT: int = _default_cfg.supervisor_recursion_limit
MAX_SESSION_TIMEOUT_SEC: float = _default_cfg.max_session_timeout_sec
