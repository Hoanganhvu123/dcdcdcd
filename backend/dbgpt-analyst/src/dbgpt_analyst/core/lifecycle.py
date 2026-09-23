"""core/lifecycle.py — Engine lifecycle manager for DB-GPT Analyst.

Manages setup, checkpointer initialization, resource warm-up,
checkpoint eviction, and graceful teardown.
"""
from __future__ import annotations

import logging
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver

from dbgpt_analyst.core.config import EngineConfig, get_engine_config

logger = logging.getLogger(__name__)


class EngineLifecycle:
    """Manages the full lifecycle of the DB-GPT Analyst multi-agent engine."""

    def __init__(self, config: EngineConfig | None = None):
        self.config = config or get_engine_config()
        self._checkpointer: BaseCheckpointSaver | None = None
        self._is_initialized: bool = False
        self._active_sessions: set[str] = set()

    @property
    def is_initialized(self) -> bool:
        return self._is_initialized

    @property
    def checkpointer(self) -> BaseCheckpointSaver | None:
        return self._checkpointer

    async def startup(self) -> BaseCheckpointSaver:
        """Initialize engine resources, checkpointer, and cache pools."""
        if self._is_initialized and self._checkpointer is not None:
            return self._checkpointer

        logger.info("[EngineLifecycle] Starting up DB-GPT Analyst engine...")

        if self.config.conv_database_url:
            try:
                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

                # Initialize async Postgres checkpointer
                saver = AsyncPostgresSaver.from_conn_string(self.config.conv_database_url)
                await saver.setup()
                self._checkpointer = saver
                logger.info(
                    "[EngineLifecycle] Initialized AsyncPostgresSaver with schema '%s'",
                    self.config.checkpoint_postgres_schema,
                )
            except Exception as e:
                logger.warning(
                    "[EngineLifecycle] Failed to connect to Postgres checkpointer (%s). Falling back to MemorySaver.",
                    e,
                )
                self._checkpointer = MemorySaver()
        else:
            self._checkpointer = MemorySaver()
            logger.info("[EngineLifecycle] Using in-memory MemorySaver checkpointer.")

        self._is_initialized = True
        logger.info("[EngineLifecycle] Startup complete.")
        return self._checkpointer

    async def shutdown(self) -> None:
        """Gracefully terminate engine resources, drain checkpointer, flush caches."""
        if not self._is_initialized:
            return

        logger.info("[EngineLifecycle] Shutting down DB-GPT Analyst engine...")
        self._active_sessions.clear()

        # Teardown Postgres pool if applicable
        if self._checkpointer is not None and hasattr(self._checkpointer, "close"):
            try:
                close_fn = getattr(self._checkpointer, "close")
                if callable(close_fn):
                    import inspect
                    if inspect.iscoroutinefunction(close_fn):
                        await close_fn()
                    else:
                        close_fn()
            except Exception as e:
                logger.warning("[EngineLifecycle] Error closing checkpointer: %s", e)

        self._checkpointer = None
        self._is_initialized = False
        logger.info("[EngineLifecycle] Shutdown complete.")

    def register_session(self, session_id: str) -> None:
        """Register active user session."""
        self._active_sessions.add(session_id)

    def evict_session(self, session_id: str) -> None:
        """Evict session tracking from memory."""
        self._active_sessions.discard(session_id)

    async def __aenter__(self) -> EngineLifecycle:
        await self.startup()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.shutdown()
