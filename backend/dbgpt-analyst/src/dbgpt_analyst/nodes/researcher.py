"""nodes/researcher.py — Web Researcher Agent dùng create_react_agent() native tool binding."""
import json
import logging
from typing import Any

from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.prebuilt import create_react_agent

from dbgpt_analyst.core.helpers import _get_llm
from dbgpt_analyst.prompts import get_researcher_prompt
from dbgpt_analyst.events import WorkflowTaskEvent
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.tools.research_toolkit import build_research_tools
from dbgpt_analyst.common.langfuse_client import observe

logger = logging.getLogger(__name__)


@observe(name="node_web_researcher")
async def node_web_researcher(state: MainAgentState, config: RunnableConfig = None) -> dict[str, Any]:
    """
    Node: Web Researcher Agent — dùng create_react_agent() với native tool binding.

    Upgraded từ manual JSON tool dispatch → LangGraph ReAct agent thực thụ.
    Agent tự quyết định khi nào search web, scrape URL, hay deep research.
    Emits tool_call / tool_result events tương thích với SSE protocol.
    """

    question = state.get("question", "")
    query_results = state.get("query_results", [])
    generated_sql = state.get("generated_sql", "")
    plan_steps = state.get("plan_steps", [])

    logger.info("Entering node_web_researcher (ReAct mode)")

    # Tóm tắt context DB cho researcher
    context_str = ""
    if generated_sql:
        context_str += f"SQL Query đã chạy:\n{generated_sql}\n\n"
        if not query_results:
            context_str += (
                "CHÚ Ý: Truy vấn SQL trên không tìm thấy dữ liệu nào (0 dòng). "
                "Hãy search web để tìm hiểu xem có sự kiện hoặc nguyên nhân bên ngoài "
                "nào giải thích cho sự bất thường này không.\n\n"
            )
        else:
            context_str += (
                f"Kết quả dữ liệu mẫu (đã tìm thấy):\n"
                f"{json.dumps(query_results[:5], ensure_ascii=False)}\n\n"
            )

    plan_str = "\n".join(plan_steps) if plan_steps else ""
    if plan_str:
        context_str += f"Kế hoạch phân tích:\n{plan_str}\n\n"

    # ── Build ReAct agent với research tools ────────────────────────────────
    llm = await _get_llm(state, streaming=False, json_mode=False)
    research_tools = build_research_tools()

    system_prompt = get_researcher_prompt() + f"\n\nNgữ cảnh hiện tại từ DB:\n{context_str}"

    # ── Invoke agent ────────────────────────────────────────────────────────
    web_findings: list[str] = []
    steps: list[dict] = []

    try:
        research_agent = create_react_agent(
            model=llm,
            tools=research_tools,
            prompt=system_prompt,
        )

        if config is None:
            config = RunnableConfig()
        merged_config = config.copy()
        merged_config["recursion_limit"] = 12

        result = await research_agent.ainvoke(
            {"messages": [{"role": "user", "content": f"Câu hỏi của người dùng: {question}\n\nHãy tìm kiếm thông tin liên quan."}]},
            config=merged_config
        )

        # ── Extract tool calls/results → SSE steps ──────────────────────────
        # Not pushing tool calls to 'steps' anymore to prevent duplicates because config streams them live
        agent_msgs = result.get("messages", [])
        for msg in agent_msgs:
            if isinstance(msg, AIMessage) and msg.tool_calls:
                pass
            elif isinstance(msg, ToolMessage):
                tool_name_str = getattr(msg, "name", None) or "tool"
                web_findings.append(f"Kết quả từ {tool_name_str}: {str(msg.content)[:1000]}")

        # Lấy final summary từ AI message cuối
        final_summary = ""
        for msg in reversed(agent_msgs):
            if isinstance(msg, AIMessage) and not msg.tool_calls and msg.content:
                final_summary = str(msg.content)
                break

        if final_summary:
            web_findings.append(final_summary)

    except Exception as e:
        logger.exception("Error in node_web_researcher")
        web_findings.append(f"Lỗi khi search web: {e}")

    done_step = WorkflowTaskEvent(
        payload={
            "message": f"Web Researcher đã hoàn tất với {len(web_findings)} kết quả.",
            "findings_count": len(web_findings)
        },
        phase="researching",
        status="done"
    ).model_dump()
    steps.append(done_step)

    return {
        "web_findings": web_findings,
        "steps": steps
    }
