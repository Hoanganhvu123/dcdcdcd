"""Runnable check for the temporary SQLite conversation-store switch.

Run:  .venv/Scripts/python.exe backend/dbgpt-analyst/tests/check_sqlite_switch.py
Fails loudly if the switch stops routing the conversation store to SQLite, or
if ANALYST_DB_BACKEND=postgres no longer restores the Postgres URL.
"""

import asyncio
import os
import sqlite3
import sys

os.environ.pop("ANALYST_DB_BACKEND", None)

from dbgpt_analyst.common.db import (  # noqa: E402
    conv_db_backend,
    conv_sqlite_path,
    resolve_conv_database_url,
)

failures = []


def check(cond, label):
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        failures.append(label)


# 1. Default backend is SQLite, and the resolved URL points at the conv store.
check(conv_db_backend() == "sqlite", "default backend is sqlite")
url = resolve_conv_database_url()
check(url.startswith("sqlite:///"), f"resolved URL is a sqlite URL ({url.split(':', 1)[0]})")
check(url.endswith("conv_store.db"), "resolved URL points at conv_store.db")

# 2. The resolved path is a real, writable SQLite database.
path = conv_sqlite_path()
try:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS _sqlite_switch_probe (id INTEGER PRIMARY KEY)")
    conn.execute("INSERT INTO _sqlite_switch_probe DEFAULT VALUES")
    conn.execute("DROP TABLE _sqlite_switch_probe")
    conn.commit()
    conn.close()
    check(True, f"sqlite file is writable ({path})")
except Exception as e:
    check(False, f"sqlite file is writable ({path}): {e}")

# 3. The checkpointer really uses the SQLite saver, not the in-memory fallback.
async def _checkpointer_kind():
    import dbgpt_analyst.memory.memory_checkpointer as mc

    mc._checkpointer_instance = None
    saver = await mc.get_checkpointer()
    return type(saver).__mro__


try:
    mro = asyncio.run(_checkpointer_kind())
    names = [c.__name__ for c in mro]
    check("AsyncSqliteSaver" in names, f"checkpointer is a SQLite saver (got {names[0]})")
    check("MemorySaver" not in names, "checkpointer did not fall back to MemorySaver")
except Exception as e:
    check(False, f"checkpointer built without error: {e}")

# 4. The Postgres-flavoured wire_events SQL survives translation to SQLite.
from dbgpt_analyst.common.db import normalize_sql  # noqa: E402

SCHEMA = "ai_data_analytics"
probe = sqlite3.connect(":memory:")
try:
    probe.execute(
        normalize_sql(
            f"""CREATE TABLE IF NOT EXISTS {SCHEMA}.wire_events (
                id          BIGSERIAL PRIMARY KEY,
                session_id  TEXT NOT NULL,
                event_type  TEXT NOT NULL,
                payload     JSONB NOT NULL,
                created_at  TIMESTAMP DEFAULT now()
            )""",
            True,
            SCHEMA,
        )
    )
    probe.execute(
        normalize_sql(
            f"INSERT INTO {SCHEMA}.wire_events (session_id, event_type, payload) "
            "VALUES (%s, %s, %s)",
            True,
            SCHEMA,
        ),
        ("s1", "delta", '{"a":1}'),
    )
    row = probe.execute(
        normalize_sql(
            f"SELECT payload FROM {SCHEMA}.wire_events WHERE session_id = %s ORDER BY id ASC",
            True,
            SCHEMA,
        ),
        ("s1",),
    ).fetchone()
    check(row is not None and row[0] == '{"a":1}', "wire_events SQL round-trips on SQLite")
except Exception as e:
    check(False, f"wire_events SQL round-trips on SQLite: {e}")
finally:
    probe.close()

check(
    normalize_sql("SELECT 1 WHERE x = %s", False, SCHEMA) == "SELECT 1 WHERE x = %s",
    "normalize_sql leaves PostgreSQL SQL untouched",
)

# 5. Flipping the flag back restores the configured Postgres URL.
os.environ["ANALYST_DB_BACKEND"] = "postgres"
os.environ["CONV_DATABASE_URL"] = "postgresql://probe/only"
check(
    resolve_conv_database_url() == "postgresql://probe/only",
    "ANALYST_DB_BACKEND=postgres restores CONV_DATABASE_URL",
)

print(f"\n{'FAILED' if failures else 'OK'}: {len(failures)} failure(s)")
sys.exit(1 if failures else 0)
