"""C4: task_call tool_call_chunks must be coalesced, not emitted per-fragment.

Providers stream a delegate call's args JSON one tiny fragment at a time
(measured: 780 events/turn, char-level). `stream_ai_analytic_agent` buffers
fragments per (message_id, index) key and flushes at most every 50ms (plus
an immediate first flush and a mandatory final flush), so the UI gets far
fewer events without losing any content.

`_get_graph` is the only mock seam needed: `detected_intent` is hardcoded to
"TEXT_TO_SQL" so the GENERAL/MISLEADING LLM branches are dead code, and
`session_id=None` makes history-fetch and Postgres-save no-ops.
"""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from dbgpt_app.openapi.api_v1.analyst_streamer import stream_ai_analytic_agent

ARGS_JSON = (
    '{"subagent_type": "sql_analyst", "description": '
    '"Phân tích doanh thu theo quý và kênh bán hàng, tìm xu hướng tăng trưởng."}'
)


def _parse_sse_events(raw_chunks):
    events = []
    for chunk in raw_chunks:
        for line in chunk.strip().split("\n"):
            if line.startswith("data:"):
                data_str = line[5:].strip()
                if data_str and data_str != "[DONE]":
                    events.append(json.loads(data_str))
    return events


class _FakeAIChunk:
    type = "ai"
    tool_calls = []
    usage_metadata = None
    content = ""

    def __init__(self, msg_id, tool_call_chunks):
        self.id = msg_id
        self.tool_call_chunks = tool_call_chunks


def _make_fake_astream(fragments, sleep_at):
    async def _fake_astream(state, stream_mode=None, config=None):
        yield ("messages", (_FakeAIChunk("msg1", [{"name": "task", "args": "", "index": 0}]), {}))
        for i, frag in enumerate(fragments):
            if i == sleep_at:
                await asyncio.sleep(0.06)  # exercises the periodic 50ms-flush branch
            yield ("messages", (_FakeAIChunk("msg1", [{"args": frag, "index": 0}]), {}))

    return _fake_astream


@pytest.mark.asyncio
async def test_task_call_chunks_are_throttled_without_losing_content():
    fragments = list(ARGS_JSON)  # one event per character — worst-case churn
    raw_chunk_count = 1 + len(fragments)  # + the initial name-only chunk

    fake_graph = SimpleNamespace(astream=_make_fake_astream(fragments, sleep_at=len(fragments) // 2))

    with patch(
        "dbgpt_app.openapi.api_v1.analyst_streamer._get_graph",
        new=AsyncMock(return_value=fake_graph),
    ):
        chunks = []
        async for chunk in stream_ai_analytic_agent(
            question="Doanh thu quý này thế nào?",
            anchor_table="orders",
            session_id=None,
        ):
            chunks.append(chunk)

    events = _parse_sse_events(chunks)
    assert not any(e.get("type") == "error" for e in events)

    task_call_events = [e for e in events if e.get("type") == "task_call"]
    assert task_call_events, "expected at least one task_call event"

    # DoD: number of task_call events drops by >=90% vs. the raw fragment count.
    assert len(task_call_events) <= raw_chunk_count * 0.1

    # DoD: concatenating every emitted args fragment reconstructs the original string.
    rebuilt = "".join(e["payload"]["args"] for e in task_call_events)
    assert rebuilt == ARGS_JSON
