"""memory_checkpointer.py — checkpointer cho LangGraph state (SQLite/Postgres)."""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Any

if sys.platform == "win32":
    try:
        if not isinstance(asyncio.get_event_loop_policy(), asyncio.WindowsSelectorEventLoopPolicy):
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import ChannelVersions, Checkpoint, CheckpointMetadata
from langgraph.checkpoint.memory import MemorySaver

from dbgpt_analyst.config import CONV_DATABASE_URL

logger = logging.getLogger(__name__)

def _extract_message_content(m: Any) -> str:
    if isinstance(m, BaseMessage):
        content = m.content
        if isinstance(content, list):
            return " ".join(
                c.get("text", "") if isinstance(c, dict) else str(c)
                for c in content
            )
        return str(content) if content else ""
    if isinstance(m, dict):
        return str(m.get("content", ""))
    return str(m)

class MessageTruncator:
    def __init__(self, max_messages: int = 30, recent_keep: int = 8, first_keep: int = 2):
        self.max_messages = max_messages
        self.recent_keep = recent_keep
        self.first_keep = first_keep

    def maybe_truncate(
        self,
        thread_id: str,
        messages: list[Any],
    ) -> tuple[list[Any], str]:
        if len(messages) <= self.max_messages:
            return messages, ""

        head = messages[: self.first_keep]
        recent = messages[-self.recent_keep :]

        from langchain_core.messages import AIMessage as LC_AIMessage
        from langchain_core.messages import ToolMessage
        recent_start_idx = len(messages) - self.recent_keep
        while recent_start_idx > self.first_keep:
            first_recent = messages[recent_start_idx]
            is_tool_msg = (
                isinstance(first_recent, ToolMessage)
                or (isinstance(first_recent, dict) and first_recent.get("role") == "tool")
            )
            if not is_tool_msg:
                break
            recent_start_idx -= 1

        if recent_start_idx > self.first_keep:
            prev_msg = messages[recent_start_idx - 1]
            is_ai_with_tools = (
                (isinstance(prev_msg, LC_AIMessage) and getattr(prev_msg, "tool_calls", []))
                or (isinstance(prev_msg, dict) and prev_msg.get("role") == "assistant" and prev_msg.get("tool_calls"))
            )
            if is_ai_with_tools:
                recent_start_idx -= 1

        recent = messages[recent_start_idx:]
        middle = messages[self.first_keep : recent_start_idx]

        parts = []
        for m in middle:
            content = _extract_message_content(m)
            if content:
                if isinstance(m, BaseMessage):
                    role = m.__class__.__name__.replace("Message", "")
                elif isinstance(m, dict):
                    role = m.get("role", "?")
                else:
                    role = "?"
                if role.lower() == "tool" and len(content) > 1000:
                    content = content[:1000] + "\n...[Truncated to save context]"
                parts.append(f"[{role}] {content}")

        summary_text = "Nén hội thoại tự động (Tóm tắt chưa khả dụng)."

        logger.info(
            "[Checkpointer] Thread '%s': truncated %d -> %d messages.",
            thread_id,
            len(messages),
            len(head) + len(recent) + 1,
        )

        checkpoint_msg = SystemMessage(
            content=(
                "[[ CHECKPOINT ]]\n"
                f"Đoạn hội thoại ở giữa đã được nén lại ({len(middle)} tin nhắn).\n"
                f"Tóm tắt:\n{summary_text}"
            )
        )
        return [*head, checkpoint_msg, *recent], summary_text

_checkpointer_instance = None
_init_lock: asyncio.Lock | None = None

async def get_checkpointer(max_messages: int = 30):
    global _checkpointer_instance, _init_lock

    if _checkpointer_instance is not None:
        return _checkpointer_instance
    
    if _init_lock is None:
        _init_lock = asyncio.Lock()
    
    async with _init_lock:
        if _checkpointer_instance is not None:
            return _checkpointer_instance

        try:
            # ponytail: nguồn duy nhất quyết định backend (xem common/db.py).
            # Mặc định là SQLite trong lúc Postgres chưa sẵn sàng.
            from dbgpt_analyst.common.db import resolve_conv_database_url
            db_url = resolve_conv_database_url()
            if not db_url:
                raise ValueError("CONV_DATABASE_URL is not set")
            
            if db_url.startswith("postgresql"):
                import sys
                if sys.platform == "win32":
                    try:
                        if not isinstance(asyncio.get_event_loop_policy(), asyncio.WindowsSelectorEventLoopPolicy):
                            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
                    except Exception:
                        pass

                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
                from psycopg_pool import AsyncConnectionPool
                from psycopg.rows import dict_row
                from dbgpt_analyst.context.manager import ContextBudgetManager

                class CustomPostgresSaver(AsyncPostgresSaver):
                    def __init__(self, conn, **kwargs):
                        super().__init__(conn, **kwargs)
                        self._budget_manager = ContextBudgetManager()

                    async def aput(self, config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: ChannelVersions) -> RunnableConfig:
                        c: Checkpoint = {
                            **checkpoint,
                            "channel_values": dict(checkpoint.get("channel_values") or {}),
                        }
                        cv = c["channel_values"]
                        if "messages" in cv and isinstance(cv["messages"], list):
                            cv["messages"] = self._budget_manager.manage_context(cv["messages"])
                        return await super().aput(config, c, metadata, new_versions)

                pool = AsyncConnectionPool(
                    conninfo=db_url,
                    min_size=1, max_size=10, open=False,
                    kwargs={"autocommit": True, "row_factory": dict_row}
                )
                await pool.open(wait=True)
                instance = CustomPostgresSaver(pool)
                await instance.setup()
                _checkpointer_instance = instance
                return _checkpointer_instance

            elif db_url.startswith("sqlite"):
                from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
                import aiosqlite
                from dbgpt_analyst.context.manager import ContextBudgetManager
                
                db_path = db_url.replace("sqlite:///", "").replace("sqlite://", "")

                class CustomSqliteSaver(AsyncSqliteSaver):
                    def __init__(self, conn, **kwargs):
                        super().__init__(conn, **kwargs)
                        self._budget_manager = ContextBudgetManager()

                    async def aput(self, config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: ChannelVersions) -> RunnableConfig:
                        c: Checkpoint = {
                            **checkpoint,
                            "channel_values": dict(checkpoint.get("channel_values") or {}),
                        }
                        cv = c["channel_values"]
                        if "messages" in cv and isinstance(cv["messages"], list):
                            cv["messages"] = self._budget_manager.manage_context(cv["messages"])
                        return await super().aput(config, c, metadata, new_versions)

                conn = await aiosqlite.connect(db_path)
                instance = CustomSqliteSaver(conn)
                await instance.setup()
                _checkpointer_instance = instance
                return _checkpointer_instance

            else:
                raise ValueError(f"Unsupported database scheme: {db_url.split(':', 1)[0]}")

        except Exception as e:
            logger.error("Checkpointer setup failed (%s) - falling back to MemorySaver.", e)
            _checkpointer_instance = MemorySaver()
            return _checkpointer_instance
