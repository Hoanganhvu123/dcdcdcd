"""Smoke test: create a deep agent graph without touching agent_core."""

import os
from pathlib import Path

from dbgpt_analyst.libs.deepagents import (
    AgentContext,
    BASE_AGENT_PROMPT,
    BackendFactory,
    BackendProtocol,
    CompiledDeepAgent,
    CompiledSubAgent,
    DEFAULT_SYSTEM_PROMPT,
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
from dbgpt_analyst.middleware.skills import build_skills_middleware
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph.state import CompiledStateGraph


class FakeChatModel(BaseChatModel):
    """Minimal BaseChatModel used for offline testing."""

    response_text: str | None = None

    @property
    def _llm_type(self) -> str:
        return "fake"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        if self.response_text is None:
            raise AssertionError(
                "FakeChatModel must not be invoked during graph construction"
            )
        generation = ChatGeneration(message=AIMessage(content=self.response_text))
        return ChatResult(generations=[generation])


def test_deepagents_reexports():
    """Verify all standardized symbols are re-exported cleanly from libs.deepagents."""
    assert create_deep_agent is not None
    assert CompiledDeepAgent is CompiledStateGraph
    assert DeepAgent is CompiledStateGraph
    assert DeepAgentState is not None
    assert DEFAULT_SYSTEM_PROMPT == BASE_AGENT_PROMPT
    assert isinstance(DEFAULT_SYSTEM_PROMPT, str)
    assert len(DEFAULT_SYSTEM_PROMPT) > 0
    assert CompiledSubAgent is not None
    assert SubAgent is not None
    assert SubAgentMiddleware is not None
    assert FilesystemMiddleware is not None
    assert FilesystemBackend is not None
    assert BackendProtocol is not None
    assert SandboxBackendProtocol is not None
    assert WriteResult is not None
    assert EditResult is not None

    # Verify SubAgentAdapterState schema
    adapter_state: SubAgentAdapterState = {
        "question": "test question",
        "session_id": "s1",
        "agent_id": "a1",
        "parent_agent_id": None,
        "implementation_plan": None,
        "user_feedback": None,
        "anchor_table": "",
        "allowed_tables": [],
        "source_ids": [],
        "selected_tables": [],
        "schemas_text": "",
        "map_qualified": {},
        "db_type": "",
        "generated_sql": None,
        "query_results": [],
        "error": None,
        "retry_count": 0,
        "validation_retry_count": None,
        "execution_retry_count": None,
        "have_retry": None,
        "answer": None,
        "chart": None,
        "display_type": None,
        "session_history": None,
        "golden_sqls": None,
        "business_docs": None,
        "steps": [],
        "plan_steps": None,
        "search_queries": None,
        "urls_to_scrape": None,
        "is_sufficient": None,
        "query_type": None,
        "force_query_type": None,
        "web_findings": [],
        "exploration_log": [],
        "validation_result": None,
        "critic_verdict": None,
        "critic_retry_count": 0,
        "critic_fix_hint": None,
        "golden_sqls_data": None,
        "schema_descriptions": None,
        "followup_questions": None,
        "detected_intent": None,
        "intent_reasoning": None,
        "clarifier_assumptions": None,
        "data_engineer_report": None,
        "report_markdown": None,
        "sql_reasoning_plan": None,
        "retry_history": None,
        "de_mode": None,
        "test_db_path": None,
        "db_path": None,
        "table_names": None,
        "file_bytes": None,
        "messages": [HumanMessage(content="hi")],
    }
    assert adapter_state["question"] == "test question"
    assert len(adapter_state["messages"]) == 1

    # Verify AgentContext
    ctx = AgentContext(model="anthropic:claude-sonnet-4-5")
    assert ctx.model == "anthropic:claude-sonnet-4-5"


def test_filesystem_backend_operations(tmp_path: Path):
    """Verify FilesystemBackend operations with standardized exports."""
    backend = FilesystemBackend(root_dir=str(tmp_path), virtual_mode=False)

    # 1. Write file
    file_a = str(tmp_path / "hello.txt")
    res_write = backend.write(file_a, "Line 1: Hello World\nLine 2: DB-GPT Analyst\nLine 3: Test DeepAgents")
    assert res_write.error is None
    assert res_write.path == file_a

    # 2. Write duplicate file -> returns error
    res_dup = backend.write(file_a, "Duplicate content")
    assert res_dup.error is not None
    assert "already exists" in res_dup.error

    # 3. Read file
    content = backend.read(file_a)
    assert "Hello World" in content
    assert "1" in content  # formatted with line numbers

    # 4. Edit file
    res_edit = backend.edit(file_a, "Line 2: DB-GPT Analyst", "Line 2: DB-GPT Analyst Standardized")
    assert res_edit.error is None
    assert res_edit.occurrences == 1
    content_updated = backend.read(file_a)
    assert "Standardized" in content_updated

    # 5. List info
    entries = backend.ls_info(str(tmp_path))
    assert len(entries) >= 1
    assert any("hello.txt" in e.get("path", "") for e in entries)

    # 6. Glob info
    matches = backend.glob_info("*.txt", str(tmp_path))
    assert len(matches) >= 1
    assert any("hello.txt" in m.get("path", "") for m in matches)

    # 7. Grep search
    grep_res = backend.grep_raw("Standardized", str(tmp_path))
    assert isinstance(grep_res, list)
    assert len(grep_res) == 1
    assert grep_res[0]["line"] == 2

    # 8. Download files
    downloads = backend.download_files([file_a])
    assert len(downloads) == 1
    assert downloads[0].error is None
    assert downloads[0].content is not None
    assert b"Standardized" in downloads[0].content


def test_skills_middleware_standardized_import_and_build(tmp_path: Path):
    """Verify build_skills_middleware works with standardized deepagents exports."""
    # Test with empty sources -> returns None gracefully
    mw_none = build_skills_middleware(sources=[])
    assert mw_none is None

    # Test with custom fake skills directory
    skills_dir = tmp_path / "skills" / "analyst-skill"
    skills_dir.mkdir(parents=True)
    (skills_dir / "SKILL.md").write_text("# Analyst Skill\nProvides analytical recipes.", encoding="utf-8")

    # When skills dir is present and custom sources are given
    if SkillsMiddleware is not None:
        backend = FilesystemBackend(root_dir=str(tmp_path / "skills"), virtual_mode=True)
        mw = SkillsMiddleware(backend=backend, sources=[("/", "Test-Skills")])
        assert mw is not None
        assert isinstance(mw, SkillsMiddleware)


def test_graph_standalone_import():
    """Verify dbgpt_analyst.libs.deepagents.graph imports cleanly without unqualified common."""
    import sys
    from dbgpt_analyst.libs.deepagents import graph

    assert hasattr(graph, "create_deep_agent")
    assert hasattr(graph, "get_default_model")
    assert hasattr(graph, "DEFAULT_SYSTEM_PROMPT")


def test_create_deep_agent_constructs_graph():
    def fake_tool(content: str) -> str:
        """Echo the input back."""
        return f"echo:{content}"

    model = FakeChatModel()
    subagent_spec: SubAgent = {
        "name": "fake_subagent",
        "description": "Fake subagent used for graph construction only",
        "system_prompt": "You are fake.",
    }
    graph = create_deep_agent(
        model=model,
        tools=[fake_tool],
        system_prompt="You are a test.",
        subagents=[subagent_spec],
    )
    # Graph was constructed without raising and is usable as a Runnable/Graph.
    assert graph is not None
    assert callable(graph.invoke) and callable(graph.stream)
    assert isinstance(graph, CompiledDeepAgent)


def test_create_deep_agent_invokes_end_to_end():
    def fake_tool(content: str) -> str:
        """Echo the input back."""
        return f"echo:{content}"

    model = FakeChatModel(response_text="ok")
    subagent_spec: SubAgent = {
        "name": "fake_subagent",
        "description": "Fake subagent for invoke test",
        "system_prompt": "You are fake.",
    }
    graph = create_deep_agent(
        model=model,
        tools=[fake_tool],
        system_prompt="You are a test.",
        subagents=[subagent_spec],
    )
    result = graph.invoke({"messages": [HumanMessage(content="hello")]})
    assert result is not None
    assert "messages" in result
    last_msg = result["messages"][-1]
    assert isinstance(last_msg, AIMessage)
    assert last_msg.content == "ok"