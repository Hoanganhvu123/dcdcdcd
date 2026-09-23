"""tests/test_tools_execution_adapter.py — Tests for ToolExecutionAdapter and Command creation."""
import pytest
from langchain_core.messages import ToolMessage
from langgraph.types import Command

from dbgpt_analyst.tools.execution.adapter import (
    ToolExecutionAdapter,
    create_tool_command,
    create_tool_message,
)


def test_create_tool_message_preserves_id():
    msg = create_tool_message(
        tool_call_id="call_abc123",
        content={"status": "ok", "rows": 10},
        name="test_tool",
    )
    assert isinstance(msg, ToolMessage)
    assert msg.tool_call_id == "call_abc123"
    assert msg.name == "test_tool"
    assert '"status": "ok"' in msg.content


def test_create_tool_command():
    cmd = create_tool_command(
        tool_call_id="call_xyz789",
        content="success data",
        additional_updates={"custom_key": "val"},
    )
    assert isinstance(cmd, Command)
    assert "messages" in cmd.update
    assert len(cmd.update["messages"]) == 1
    assert cmd.update["messages"][0].tool_call_id == "call_xyz789"
    assert cmd.update["custom_key"] == "val"


@pytest.mark.asyncio
async def test_tool_execution_adapter_success():
    adapter = ToolExecutionAdapter()

    def sample_tool(a: int, b: int) -> int:
        return a + b

    adapter.register("add_numbers", sample_tool)

    tool_call = {
        "id": "call_12345",
        "name": "add_numbers",
        "args": {"a": 10, "b": 25},
    }

    msg = await adapter.aexecute(tool_call)
    assert isinstance(msg, ToolMessage)
    assert msg.tool_call_id == "call_12345"
    assert msg.status == "success"
    assert msg.content == "35"


@pytest.mark.asyncio
async def test_tool_execution_adapter_missing_tool():
    adapter = ToolExecutionAdapter()
    tool_call = {
        "id": "call_unregistered",
        "name": "non_existent_tool",
        "args": {},
    }

    msg = await adapter.aexecute(tool_call)
    assert isinstance(msg, ToolMessage)
    assert msg.tool_call_id == "call_unregistered"
    assert msg.status == "error"
    assert "not registered" in msg.content


@pytest.mark.asyncio
async def test_tool_execution_adapter_command_generation():
    adapter = ToolExecutionAdapter()

    async def async_echo(text: str) -> str:
        return f"echo: {text}"

    adapter.register("echo", async_echo)

    tool_call = {
        "id": "call_cmd_1",
        "name": "echo",
        "args": {"text": "hello world"},
    }

    cmd = await adapter.aexecute_command(tool_call, {"step": 2})
    assert isinstance(cmd, Command)
    assert cmd.update["messages"][0].tool_call_id == "call_cmd_1"
    assert cmd.update["messages"][0].content == "echo: hello world"
    assert cmd.update["step"] == 2
