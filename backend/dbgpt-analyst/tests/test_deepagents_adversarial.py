"""Adversarial challenger tests for dbgpt_analyst.libs.deepagents import and standalone execution."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from langchain.agents.middleware.types import AgentMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph.state import CompiledStateGraph

from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.libs.deepagents import (
    BASE_AGENT_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
    AgentContext,
    BackendFactory,
    BackendProtocol,
    CompiledDeepAgent,
    CompiledSubAgent,
    DeepAgent,
    DeepAgentState,
    EditResult,
    FileInfo,
    FilesystemBackend,
    FilesystemMiddleware,
    GrepMatch,
    SandboxBackendProtocol,
    SkillSource,
    SkillsMiddleware,
    SubAgent,
    SubAgentAdapterState,
    SubAgentMiddleware,
    WriteResult,
    create_deep_agent,
)


class StubChatModel(BaseChatModel):
    """Deterministic StubChatModel for graph compilation and execution testing."""

    response_text: str = "stub_response"

    @property
    def _llm_type(self) -> str:
        return "stub_chat_model"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        generation = ChatGeneration(message=AIMessage(content=self.response_text))
        return ChatResult(generations=[generation])


class CustomTestMiddleware(AgentMiddleware):
    """Custom test middleware for verifying middleware chain."""

    name: str = "custom_test_middleware"


def test_isolated_subprocess_import_no_common_in_syspath():
    """Adversarially verify that graph.py and libs.deepagents import in a clean subprocess

    where 'common' is NOT in sys.path (only dbgpt package roots are in sys.path).
    """
    repo_root = Path(__file__).resolve().parents[3]
    src_paths = [
        str(repo_root / "backend" / "dbgpt-analyst" / "src"),
        str(repo_root / "backend" / "dbgpt-core" / "src"),
        str(repo_root / "backend" / "dbgpt-app" / "src"),
        str(repo_root / "backend" / "dbgpt-client" / "src"),
        str(repo_root / "backend" / "dbgpt-serve" / "src"),
        str(repo_root / "backend" / "dbgpt-ext" / "src"),
    ]

    isolation_code = """
import sys

# 1. Assert 'common' is not importable standalone
try:
    import common
    print("UNEXPECTED_COMMON_IMPORT_SUCCEEDED")
    sys.exit(10)
except ModuleNotFoundError:
    pass

# 2. Import dbgpt_analyst.libs.deepagents.graph directly
try:
    from dbgpt_analyst.libs.deepagents import graph
except Exception as e:
    print(f"GRAPH_IMPORT_FAILED: {e}")
    sys.exit(11)

assert hasattr(graph, "create_deep_agent"), "Missing create_deep_agent in graph.py"
assert hasattr(graph, "DEFAULT_SYSTEM_PROMPT"), "Missing DEFAULT_SYSTEM_PROMPT in graph.py"
assert hasattr(graph, "BASE_AGENT_PROMPT"), "Missing BASE_AGENT_PROMPT in graph.py"
assert graph.DEFAULT_SYSTEM_PROMPT == graph.BASE_AGENT_PROMPT

# 3. Import all standardized re-exports from package __init__
try:
    from dbgpt_analyst.libs.deepagents import (
        create_deep_agent,
        CompiledDeepAgent,
        DeepAgent,
        DeepAgentState,
        SubAgentAdapterState,
        AgentContext,
        DEFAULT_SYSTEM_PROMPT,
        BASE_AGENT_PROMPT,
        FilesystemBackend,
        FilesystemMiddleware,
        SubAgent,
        CompiledSubAgent,
        SubAgentMiddleware,
    )
except Exception as e:
    print(f"DEEPAGENTS_INIT_IMPORT_FAILED: {e}")
    sys.exit(12)

print("ISOLATED_IMPORT_SUCCESS")
"""

    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(src_paths)

    result = subprocess.run(
        [sys.executable, "-c", isolation_code],
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"Subprocess failed with code {result.returncode}:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
    assert "ISOLATED_IMPORT_SUCCESS" in result.stdout


def test_reexported_symbols_exhaustive():
    """Verify all re-exported symbols in libs.deepagents match contract."""
    assert create_deep_agent is not None
    assert callable(create_deep_agent)
    assert CompiledDeepAgent is CompiledStateGraph
    assert DeepAgent is CompiledStateGraph
    assert DeepAgentState is not None
    assert DEFAULT_SYSTEM_PROMPT == BASE_AGENT_PROMPT
    assert isinstance(DEFAULT_SYSTEM_PROMPT, str)
    assert len(DEFAULT_SYSTEM_PROMPT) > 0
    assert SubAgentAdapterState is not None
    assert AgentContext is not None
    assert FilesystemBackend is not None
    assert FilesystemMiddleware is not None
    assert SubAgentMiddleware is not None
    assert SubAgent is not None
    assert CompiledSubAgent is not None
    assert BackendProtocol is not None
    assert SandboxBackendProtocol is not None
    assert BackendFactory is not None
    assert WriteResult is not None
    assert EditResult is not None
    assert FileInfo is not None
    assert GrepMatch is not None


def test_subagent_adapter_state_schema_and_annotations():
    """Verify SubAgentAdapterState inherits MainAgentState fields and adds messages."""
    import typing

    # Verify annotations encompass MainAgentState keys plus messages
    type_hints = typing.get_type_hints(SubAgentAdapterState)
    assert "messages" in type_hints

    for k in typing.get_type_hints(MainAgentState):
        assert k in type_hints, f"Missing key '{k}' from MainAgentState in SubAgentAdapterState"

    sample_state: SubAgentAdapterState = {
        "question": "Adversarial Test Question",
        "session_id": "sess-adv-1",
        "agent_id": "agent-adv-1",
        "parent_agent_id": None,
        "implementation_plan": None,
        "user_feedback": None,
        "anchor_table": "sales",
        "allowed_tables": ["sales", "orders"],
        "source_ids": ["src-1"],
        "selected_tables": ["sales"],
        "schemas_text": "CREATE TABLE sales (id INT);",
        "map_qualified": {},
        "db_type": "sqlite",
        "generated_sql": "SELECT 1;",
        "query_results": [],
        "error": None,
        "retry_count": 0,
        "validation_retry_count": 0,
        "execution_retry_count": 0,
        "have_retry": False,
        "answer": "Answer here",
        "chart": None,
        "display_type": "table",
        "session_history": [],
        "golden_sqls": [],
        "business_docs": [],
        "steps": [],
        "plan_steps": [],
        "search_queries": [],
        "urls_to_scrape": [],
        "is_sufficient": True,
        "query_type": "sql",
        "force_query_type": None,
        "web_findings": [],
        "exploration_log": [],
        "validation_result": None,
        "critic_verdict": "PASSED",
        "critic_retry_count": 0,
        "critic_fix_hint": None,
        "golden_sqls_data": [],
        "schema_descriptions": {},
        "followup_questions": [],
        "detected_intent": "analytics",
        "intent_reasoning": "sql reason",
        "clarifier_assumptions": [],
        "data_engineer_report": None,
        "report_markdown": None,
        "sql_reasoning_plan": None,
        "retry_history": [],
        "de_mode": None,
        "test_db_path": None,
        "db_path": None,
        "table_names": ["sales"],
        "file_bytes": None,
        "messages": [HumanMessage(content="Analyze sales data")],
    }
    assert sample_state["question"] == "Adversarial Test Question"
    assert len(sample_state["messages"]) == 1


def test_create_deep_agent_compile_and_invoke():
    """Compile and invoke a deep agent graph with stub model, tools, and subagents."""
    def sample_tool(param: str) -> str:
        """Sample test tool."""
        return f"result_{param}"

    model = StubChatModel(response_text="Analysis complete successfully.")

    subagent_spec: SubAgent = {
        "name": "data_subagent",
        "description": "Subagent for data tasks",
        "system_prompt": "You are a data assistant.",
    }

    graph = create_deep_agent(
        model=model,
        tools=[sample_tool],
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        subagents=[subagent_spec],
    )

    assert graph is not None
    assert isinstance(graph, CompiledDeepAgent)
    assert isinstance(graph, CompiledStateGraph)
    assert callable(graph.invoke)

    # Invoke graph
    state_input = {"messages": [HumanMessage(content="Run analysis")]}
    output = graph.invoke(state_input)

    assert output is not None
    assert "messages" in output
    assert len(output["messages"]) >= 2
    last_msg = output["messages"][-1]
    assert isinstance(last_msg, AIMessage)
    assert last_msg.content == "Analysis complete successfully."


def test_create_deep_agent_with_custom_backend_and_middleware(tmp_path: Path):
    """Compile and invoke deep agent graph configured with custom backend and additional middleware."""
    backend = FilesystemBackend(root_dir=str(tmp_path), virtual_mode=False)
    custom_mw = CustomTestMiddleware()

    model = StubChatModel(response_text="Filesystem agent invoked.")

    graph = create_deep_agent(
        model=model,
        tools=[],
        system_prompt="You are a filesystem-enabled agent.",
        backend=backend,
        middleware=[custom_mw],
    )

    assert isinstance(graph, CompiledDeepAgent)
    output = graph.invoke({"messages": [HumanMessage(content="Check files")]})
    assert output is not None
    assert output["messages"][-1].content == "Filesystem agent invoked."


def test_fallback_when_pip_deepagents_uninstalled():
    """Adversarially verify that fallback imports in libs.deepagents work when pip deepagents is absent."""
    repo_root = Path(__file__).resolve().parents[3]
    src_paths = [
        str(repo_root / "backend" / "dbgpt-analyst" / "src"),
        str(repo_root / "backend" / "dbgpt-core" / "src"),
        str(repo_root / "backend" / "dbgpt-app" / "src"),
        str(repo_root / "backend" / "dbgpt-client" / "src"),
        str(repo_root / "backend" / "dbgpt-serve" / "src"),
        str(repo_root / "backend" / "dbgpt-ext" / "src"),
    ]

    fallback_simulation_code = """
import sys

# Mask out 'deepagents' pip package in sys.modules to simulate absence
sys.modules['deepagents'] = None
sys.modules['deepagents.middleware'] = None
sys.modules['deepagents.middleware.skills'] = None

from dbgpt_analyst.libs.deepagents import (
    create_deep_agent,
    CompiledDeepAgent,
    DeepAgent,
    DeepAgentState,
    SubAgentAdapterState,
    AgentContext,
    DEFAULT_SYSTEM_PROMPT,
    BASE_AGENT_PROMPT,
)

assert create_deep_agent is not None
assert CompiledDeepAgent is not None
assert DeepAgent is not None
assert DeepAgentState is not None
assert SubAgentAdapterState is not None
assert AgentContext is not None
assert DEFAULT_SYSTEM_PROMPT == BASE_AGENT_PROMPT

print("FALLBACK_SIMULATION_SUCCESS")
"""

    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(src_paths)

    result = subprocess.run(
        [sys.executable, "-c", fallback_simulation_code],
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"Fallback simulation failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
    assert "FALLBACK_SIMULATION_SUCCESS" in result.stdout


def test_filesystem_backend_unicode_and_special_chars(tmp_path: Path):
    """Adversarially stress-test FilesystemBackend with Unicode filenames, emojis, and multilingual content."""
    backend = FilesystemBackend(root_dir=str(tmp_path), virtual_mode=False)

    unicode_filename = "báo_cáo_doanh_thu_データ_🚀.txt"
    unicode_content = (
        "Dòng 1: Doanh thu quý 1 đạt 1.000.000.000 VNĐ 📈\n"
        "Dòng 2: ユーザー数が増加しました 🎉\n"
        "Dòng 3: 数据分析完成 🚀\n"
    )

    # 1. Write Unicode file
    write_res = backend.write(unicode_filename, unicode_content)
    assert write_res.error is None
    assert write_res.path == unicode_filename

    # 2. Read Unicode file and verify line numbering and character encoding
    read_output = backend.read(unicode_filename)
    assert "Doanh thu quý 1 đạt 1.000.000.000 VNĐ 📈" in read_output
    assert "ユーザー数が増加しました 🎉" in read_output
    assert "数据分析完成 🚀" in read_output
    assert "1\t" in read_output or "1 " in read_output

    # 3. Edit Unicode content
    edit_res = backend.edit(
        unicode_filename,
        old_string="🚀",
        new_string="🌟",
        replace_all=False,
    )
    assert edit_res.error is None
    assert edit_res.occurrences == 1

    # Verify updated content
    updated_read = backend.read(unicode_filename)
    assert "🌟" in updated_read
    assert "🚀" not in updated_read

    # 4. List files with unicode characters
    infos = backend.ls_info(".")
    found = any(unicode_filename in fi.get("path", "") for fi in infos)
    assert found, f"Unicode file {unicode_filename} not found in ls_info results"


def test_filesystem_backend_nonexistent_and_duplicate_files(tmp_path: Path):
    """Adversarially test error handling for non-existent files and duplicate write protection."""
    backend = FilesystemBackend(root_dir=str(tmp_path), virtual_mode=False)

    # 1. Read non-existent file
    read_res = backend.read("non_existent_ghost.txt")
    assert "Error: File 'non_existent_ghost.txt' not found" in read_res

    # 2. Edit non-existent file
    edit_res = backend.edit("non_existent_ghost.txt", "old", "new")
    assert edit_res.error is not None
    assert "Error: File 'non_existent_ghost.txt' not found" in edit_res.error

    # 3. Write new file
    write_res1 = backend.write("protected_file.txt", "Initial content")
    assert write_res1.error is None

    # 4. Overwrite attempt on existing file should be rejected with clear instructions
    write_res2 = backend.write("protected_file.txt", "Overwritten content")
    assert write_res2.error is not None
    assert "Cannot write to protected_file.txt because it already exists" in write_res2.error

    # 5. ls_info on non-existent directory returns empty list
    ls_ghost = backend.ls_info("ghost_dir_999")
    assert ls_ghost == []


def test_filesystem_backend_offset_and_limit_boundaries(tmp_path: Path):
    """Adversarially verify line offset and limit boundary conditions."""
    backend = FilesystemBackend(root_dir=str(tmp_path), virtual_mode=False)

    filename = "pagination_test.txt"
    lines = [f"Line {i:02d}: Content sample {i}" for i in range(1, 11)]
    backend.write(filename, "\n".join(lines))

    # Read first 5 lines (offset=0, limit=5)
    page1 = backend.read(filename, offset=0, limit=5)
    assert "Line 01" in page1
    assert "Line 05" in page1
    assert "Line 06" not in page1

    # Read next 5 lines (offset=5, limit=5)
    page2 = backend.read(filename, offset=5, limit=5)
    assert "Line 06" in page2
    assert "Line 10" in page2
    assert "Line 01" not in page2

    # Offset at exactly total lines (offset=10, lines=10)
    page_out_of_bounds = backend.read(filename, offset=10, limit=5)
    assert "Error: Line offset 10 exceeds file length (10 lines)" in page_out_of_bounds

    # Offset far beyond total lines (offset=100)
    page_far_bounds = backend.read(filename, offset=100, limit=5)
    assert "Error: Line offset 100 exceeds file length (10 lines)" in page_far_bounds

    # Empty file handling
    backend.write("empty_file.txt", "")
    empty_read = backend.read("empty_file.txt")
    assert "System reminder: File exists but has empty contents" in empty_read


def test_filesystem_backend_multiline_string_replacement(tmp_path: Path):
    """Adversarially verify exact multiline string replacement and duplicate occurrence safety."""
    backend = FilesystemBackend(root_dir=str(tmp_path), virtual_mode=False)

    multiline_code = (
        "def compute_total():\n"
        "    price = 100\n"
        "    tax = 10\n"
        "    return price + tax\n\n"
        "def compute_total_v2():\n"
        "    price = 100\n"
        "    tax = 10\n"
        "    return price + tax\n"
    )
    backend.write("logic.py", multiline_code)

    target_block = "    price = 100\n    tax = 10"
    replacement_block = "    price = 200\n    tax = 20"

    # 1. Non-unique occurrence with replace_all=False must fail safely
    edit_fail = backend.edit("logic.py", old_string=target_block, new_string=replacement_block, replace_all=False)
    assert edit_fail.error is not None
    assert "appears 2 times in file" in edit_fail.error

    # 2. replace_all=True must replace both occurrences
    edit_success = backend.edit("logic.py", old_string=target_block, new_string=replacement_block, replace_all=True)
    assert edit_success.error is None
    assert edit_success.occurrences == 2

    # Verify content in file
    updated = backend.read("logic.py")
    assert "price = 200" in updated
    assert "price = 100" not in updated


def test_filesystem_backend_virtual_mode_traversal_prevention(tmp_path: Path):
    """Adversarially verify path traversal attacks are blocked in virtual_mode and _validate_path."""
    from dbgpt_analyst.libs.deepagents.middleware.filesystem import _validate_path

    backend = FilesystemBackend(root_dir=str(tmp_path), virtual_mode=True)

    # 1. Traversal sequences in backend._resolve_path
    with pytest.raises(ValueError, match="Path traversal not allowed"):
        backend.read("../../../etc/passwd")

    with pytest.raises(ValueError, match="Path traversal not allowed"):
        backend.write("../escaped_file.txt", "malicious payload")

    # 2. Traversal validation in middleware _validate_path
    with pytest.raises(ValueError, match="Path traversal not allowed"):
        _validate_path("~/secret_key")

    with pytest.raises(ValueError, match="Path traversal not allowed"):
        _validate_path("../relative_escape")


def test_filesystem_middleware_large_tool_result_eviction(tmp_path: Path):
    """Adversarially verify FilesystemMiddleware evicts oversized tool outputs to filesystem."""
    from langchain_core.messages import ToolMessage

    backend = FilesystemBackend(root_dir=str(tmp_path), virtual_mode=True)
    # Set limit to 10 tokens (~40 chars) so any large message is evicted
    middleware = FilesystemMiddleware(backend=backend, tool_token_limit_before_evict=10)

    oversized_content = "SQL Query Result Row " + " | ".join([f"col_{i}=val_{i}" for i in range(50)])
    assert len(oversized_content) > 40

    large_tool_msg = ToolMessage(
        content=oversized_content,
        tool_call_id="call_adversarial_evict_001",
    )

    # Intercept large tool result
    processed_msg, files_update = middleware._process_large_message(large_tool_msg, backend)

    assert processed_msg is not None
    assert "Tool result too large" in processed_msg.content
    assert "/large_tool_results/call_adversarial_evict_001" in processed_msg.content

    # Verify that the evicted file actually exists in backend storage and contains full data
    evicted_file_path = "/large_tool_results/call_adversarial_evict_001"
    read_evicted = backend.read(evicted_file_path)
    assert "SQL Query Result Row" in read_evicted
    assert "col_49=val_49" in read_evicted


