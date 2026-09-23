import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from dbgpt_app.openapi.api_v1.agentic_data_api import _react_agent_stream


class MockConversationVo:
    """Mock ConversationVo object for stream event testing."""

    def __init__(
        self,
        user_input="Analyze repository structure",
        chat_mode="chat_agent",
        select_param=None,
        model_name="gpt-4o",
        ext_info=None,
        user_name="test_user",
        sys_code=None,
        app_code=None,
        temperature=0.2,
    ):
        self.user_input = user_input
        self.chat_mode = chat_mode
        self.select_param = select_param
        self.model_name = model_name
        self.ext_info = ext_info or {}
        self.user_name = user_name
        self.sys_code = sys_code
        self.app_code = app_code
        self.temperature = temperature
        self.conv_uid = "test_conv_stream_001"


def _parse_sse_events(raw_chunks):
    """Helper to parse a list of SSE strings into structured dicts."""
    events = []
    for chunk in raw_chunks:
        lines = chunk.strip().split("\n")
        for line in lines:
            if line.startswith("data:"):
                data_str = line[5:].strip()
                if data_str:
                    events.append(json.loads(data_str))
    return events


@pytest.mark.asyncio
async def test_agentic_stream_events_normal_flow():
    """Test normal stream execution flow: tool calls, thinking, plan updates, final, done."""
    dialogue = MockConversationVo()

    async def mock_generate_reply(received_message, sender, stream_callback):
        # 1. Stream thinking chunk
        await stream_callback(
            "thinking_chunk",
            {"round": 1, "delta_thinking": "Thought: Searching files in codebase."},
        )

        # 2. Stream tool execution event (grep tool)
        await stream_callback(
            "act",
            {
                "round": 1,
                "action_output": {
                    "thoughts": "Searching files",
                    "action": "grep",
                    "action_input": {"pattern": "main"},
                    "observations": "Found match in main.py:10",
                    "is_exe_success": True,
                },
            },
        )

        # 3. Stream todowrite action event (plan update)
        await stream_callback(
            "act",
            {
                "round": 2,
                "action_output": {
                    "thoughts": "Updating task plan",
                    "action": "todowrite",
                    "action_input": {},
                    "observations": json.dumps(
                        {
                            "__todos__": [
                                {"content": "Search files", "status": "completed"},
                                {"content": "Run analysis", "status": "in_progress"},
                            ]
                        }
                    ),
                    "is_exe_success": True,
                },
            },
        )

        # Return final terminate response
        mock_reply = MagicMock()
        mock_reply.action_report = MagicMock(
            terminate=True,
            content='Thought: Done.\nAction: terminate\nAction Input: {"result": "Analysis complete."}',
        )
        mock_reply.content = "Analysis complete."
        return mock_reply

    mock_agent = MagicMock()
    mock_agent.init_context_management = MagicMock()
    mock_agent.generate_reply = mock_generate_reply

    mock_builder = MagicMock()
    mock_builder.bind.return_value = mock_builder
    mock_builder.build = AsyncMock(return_value=mock_agent)

    mock_storage_conv = MagicMock()
    mock_storage_conv.add_view_message = MagicMock()
    mock_storage_conv.end_current_round = MagicMock()
    mock_storage_conv.save_to_storage = MagicMock()

    mock_cfg = MagicMock()
    mock_system_app = MagicMock()
    mock_cfg.SYSTEM_APP = mock_system_app

    with patch(
        "dbgpt_app.openapi.api_v1.agentic_data_api.CFG",
        mock_cfg,
    ), patch(
        "dbgpt.agent.expand.react_agent.ReActAgent",
        return_value=mock_builder,
    ), patch(
        "dbgpt.core.StorageConversation",
        return_value=mock_storage_conv,
    ):
        sse_chunks = []
        async for chunk in _react_agent_stream(dialogue):
            sse_chunks.append(chunk)

    events = _parse_sse_events(sse_chunks)
    assert len(events) > 0, "SSE stream must yield events"

    # Assert sequence of event types
    event_types = [e["type"] for e in events]

    assert "step.start" in event_types, "Stream must contain step.start"
    assert "step.meta" in event_types, "Stream must contain step.meta"
    assert "step.chunk" in event_types, "Stream must contain step.chunk"
    assert "step.done" in event_types, "Stream must contain step.done"
    assert "plan.update" in event_types, "Stream must contain plan.update"
    assert "final" in event_types, "Stream must contain final event"
    assert "done" in event_types, "Stream must contain done event"

    # Assert stream ordering: final then done at the end
    assert event_types[-2] == "final", "Penultimate event must be 'final'"
    assert event_types[-1] == "done", "Last event must be 'done'"

    # Schema Assertions for each event type
    for e in events:
        etype = e["type"]
        if etype == "step.start":
            assert "step" in e and isinstance(e["step"], int)
            assert "id" in e and isinstance(e["id"], str)
            assert "title" in e and isinstance(e["title"], str)
            assert "detail" in e and isinstance(e["detail"], str)
        elif etype == "step.chunk":
            assert "id" in e and isinstance(e["id"], str)
            assert "output_type" in e and isinstance(e["output_type"], str)
            assert "content" in e
        elif etype == "step.meta":
            assert "id" in e and isinstance(e["id"], str)
            assert "action" in e
        elif etype == "step.done":
            assert "id" in e and isinstance(e["id"], str)
            assert "status" in e and e["status"] in ("done", "failed")
        elif etype == "plan.update":
            assert "tasks" in e and isinstance(e["tasks"], list)
        elif etype == "final":
            assert "content" in e and isinstance(e["content"], str)
            assert e["content"] == "Analysis complete."


@pytest.mark.asyncio
async def test_agentic_stream_events_exception_flow():
    """Test exception branch: stream must still emit final and done events upon failure."""
    dialogue = MockConversationVo()

    async def mock_generate_reply_error(received_message, sender, stream_callback):
        # Emit a step before failing
        await stream_callback(
            "thinking_chunk",
            {"round": 1, "delta_thinking": "Thought: Starting execution..."},
        )
        raise RuntimeError("LLM connection timed out")

    mock_agent = MagicMock()
    mock_agent.init_context_management = MagicMock()
    mock_agent.generate_reply = mock_generate_reply_error

    mock_builder = MagicMock()
    mock_builder.bind.return_value = mock_builder
    mock_builder.build = AsyncMock(return_value=mock_agent)

    mock_storage_conv = MagicMock()
    mock_storage_conv.add_view_message = MagicMock()
    mock_storage_conv.end_current_round = MagicMock()
    mock_storage_conv.save_to_storage = MagicMock()

    mock_cfg = MagicMock()
    mock_system_app = MagicMock()
    mock_cfg.SYSTEM_APP = mock_system_app

    with patch(
        "dbgpt_app.openapi.api_v1.agentic_data_api.CFG",
        mock_cfg,
    ), patch(
        "dbgpt.agent.expand.react_agent.ReActAgent",
        return_value=mock_builder,
    ), patch(
        "dbgpt.core.StorageConversation",
        return_value=mock_storage_conv,
    ):
        sse_chunks = []
        async for chunk in _react_agent_stream(dialogue):
            sse_chunks.append(chunk)

    events = _parse_sse_events(sse_chunks)
    assert len(events) >= 2, "Exception stream must yield at least final and done"

    event_types = [e["type"] for e in events]
    assert event_types[-2] == "final", "Penultimate event must be 'final' on error"
    assert event_types[-1] == "done", "Last event must be 'done' on error"

    final_event = events[-2]
    assert "React agent failed: LLM connection timed out" in final_event["content"]
