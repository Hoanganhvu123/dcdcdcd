"""api/ai_analytic/wire_store.py

Persistent wire event store (Postgres & JSONL file backup) and history replay manager.
"""
import asyncio
from collections.abc import AsyncGenerator
import json
import logging
import threading
from pathlib import Path
from typing import Any

from dbgpt_app.openapi.api_v1.wire_protocol import WireMessageEnvelope, to_sse_str
from dbgpt_analyst.common.db import get_db_connection, is_sqlite_conn, normalize_sql
from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA

logger = logging.getLogger(__name__)

_SCHEMA = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
_BASE_DIR = Path("data/wire_events")


def _ensure_wire_events_table():
    """Create the wire_events table in the conversation store if missing."""
    try:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            sqlite = is_sqlite_conn(conn)
            table_ddl = normalize_sql(f"""
                CREATE TABLE IF NOT EXISTS {_SCHEMA}.wire_events (
                    id          BIGSERIAL PRIMARY KEY,
                    session_id  TEXT NOT NULL,
                    event_type  TEXT NOT NULL,
                    payload     JSONB NOT NULL,
                    created_at  TIMESTAMP DEFAULT now()
                )
            """, sqlite, _SCHEMA)
            index_ddl = normalize_sql(
                f"CREATE INDEX IF NOT EXISTS idx_wire_events_session "
                f"ON {_SCHEMA}.wire_events(session_id, id)",
                sqlite, _SCHEMA,
            )
            # sqlite3 executes one statement per call, so keep DDL split.
            cur.execute(table_ddl)
            cur.execute(index_ddl)
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"Could not initialize wire_events table: {e}")


_ensure_wire_events_table()


def get_session_dir(session_id: str) -> Path:
    """Get directory for a specific session's wire store."""
    base_dir = Path("/tmp/kimi_wire_store")
    safe_session_id = Path(session_id).name
    session_dir = base_dir / safe_session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir


_write_lock = threading.Lock()
_background_tasks = set()


def _write_event_sync(session_id: str, event_dict: dict) -> None:
    event_type = event_dict.get("type", "unknown")

    with _write_lock:
        # 1. File backup (JSONL)
        try:
            sdir = get_session_dir(session_id)
            jsonl_file = sdir / "wire.jsonl"
            with jsonl_file.open("a", encoding="utf-8") as f:
                f.write(json.dumps(event_dict, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.warning(f"Failed writing to wire.jsonl for session {session_id}: {e}")

        # 2. Postgres persistence
        try:
            conn = get_db_connection()
            try:
                cur = conn.cursor()
                cur.execute(
                    normalize_sql(
                        f"INSERT INTO {_SCHEMA}.wire_events (session_id, event_type, payload) "
                        "VALUES (%s, %s, %s)",
                        is_sqlite_conn(conn), _SCHEMA,
                    ),
                    (session_id, event_type, json.dumps(event_dict, ensure_ascii=False))
                )
                conn.commit()
            finally:
                conn.close()
        except Exception as e:
            logger.warning(f"Failed inserting wire event into the conversation store: {e}")


_queues = {}
_workers = {}

async def _event_worker(q: asyncio.Queue):
    while True:
        try:
            sid, evt = await q.get()
            await asyncio.to_thread(_write_event_sync, sid, evt)
            q.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in wire store worker: {e}")

def append_event(session_id: str, envelope: Any) -> None:
    """Write wire event line to JSONL file and insert into Postgres wire_events table."""
    if hasattr(envelope, "model_dump"):
        event_dict = envelope.model_dump(exclude_none=True)
    elif isinstance(envelope, dict):
        event_dict = envelope
    else:
        return

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        loop_id = id(loop)
        if loop_id not in _queues:
            q = asyncio.Queue()
            _queues[loop_id] = q
            _workers[loop_id] = loop.create_task(_event_worker(q))
        
        _queues[loop_id].put_nowait((session_id, event_dict))
    else:
        _write_event_sync(session_id, event_dict)

async def async_append_event(session_id: str, envelope: Any) -> None:
    """Non-blocking async version of append_event."""
    if hasattr(envelope, "model_dump"):
        event_dict = envelope.model_dump(exclude_none=True)
    elif isinstance(envelope, dict):
        event_dict = envelope
    else:
        return
    await asyncio.to_thread(_write_event_sync, session_id, event_dict)


async def replay_events(session_id: str) -> AsyncGenerator[str, None]:
    """Read stored wire events sequentially for client replay as SSE formatted strings."""
    # 1. Try DB first
    events_found = []
    try:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                normalize_sql(
                    f"SELECT payload FROM {_SCHEMA}.wire_events "
                    "WHERE session_id = %s ORDER BY id ASC",
                    is_sqlite_conn(conn), _SCHEMA,
                ),
                (session_id,)
            )
            rows = cur.fetchall()
            for r in rows:
                payload = r[0]
                if isinstance(payload, str):
                    events_found.append(json.loads(payload))
                elif isinstance(payload, dict):
                    events_found.append(payload)
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"Could not read replay events from Postgres: {e}")

    # 2. Always check JSONL file as backup/truth source for completeness
    jsonl_events = []
    sdir = get_session_dir(session_id)
    jsonl_file = sdir / "wire.jsonl"
    if jsonl_file.exists():
        try:
            with jsonl_file.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        jsonl_events.append(json.loads(line))
        except Exception as e:
            logger.warning(f"Error reading wire.jsonl: {e}")

    # Use whichever source has more events to avoid dropping mid-stream failures
    if len(jsonl_events) > len(events_found):
        events_found = jsonl_events

    # Stream out as SSE chunks at max throughput (no fixed sleep delay)
    for evt in events_found:
        yield to_sse_str(evt)
