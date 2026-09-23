"""nodes/data_explorer.py — Node: explore."""

from datetime import datetime as _dt
import logging as _logging
from typing import Any

from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.prebuilt import create_react_agent

from dbgpt_analyst.core.helpers import _get_llm
from dbgpt_analyst.prompts import get_explorer_prompt
from dbgpt_analyst.events import ErrorEvent, WorkflowTaskEvent
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.tools.explore_toolkit import build_explore_tools
from dbgpt_analyst.tools.research_toolkit import build_research_tools
from dbgpt_analyst.adapters.bi_platform import get_active_connection
from dbgpt_analyst.libs.bi.connections import get_enabled_connections
from dbgpt_analyst.libs.bi.schema_cache import resolve_table_source
from dbgpt_analyst.common.langfuse_client import observe

logger = _logging.getLogger(__name__)


@observe(name="node_explore")
async def node_explore(state: MainAgentState, config: RunnableConfig = None) -> dict[str, Any]:
    """
    Node: ReAct Explorer Agent dùng create_react_agent() với native tool binding.

    Upgraded từ manual JSON parse loop → LangGraph ReAct agent thực thụ.
    Agent tự động chọn tool, nhận kết quả, và lặp cho đến khi đủ context.
    Emits tool_call / tool_result events tương thích với SSE protocol.
    """
    question = state["question"]
    selected_tables = state.get("selected_tables", [state["anchor_table"]])
    schemas_text = state.get("schemas_text", "")
    plan_steps = state.get("plan_steps", [])

    _today_str = _dt.now().strftime("%Y-%m-%d")

    # ── Resolve ĐÚNG connection cho từng bảng đã chọn ──────────────────────
    # Map từng bảng → connection đúng nguồn (mirror node_resolve_schema).
    # KHÔNG log connection_string.

    source_conns: dict[int, tuple] = {}   # sid -> (conn, db_type, sname)
    try:
        for c, c_db_type, sid, sname in get_enabled_connections(read_only=True):
            if sid in source_conns:
                try:
                    c.close()
                except Exception:
                    pass
                continue
            source_conns[sid] = (c, c_db_type, sname)
    except Exception as e:
        logger.warning(f"node_explore: could not enumerate sources: {e}")

    active_conn, active_db_type = None, None
    try:
        active_conn, active_db_type = get_active_connection()
    except Exception as exc:
        logger.warning(f"node_explore: cannot get active connection: {exc}")

    # Map mỗi bảng đã chọn → (conn, db_type, raw_table) theo đúng nguồn của nó.
    table_conn_map: dict[str, tuple] = {}
    fed_sources: dict[str, dict] = {}
    for t in selected_tables:
        try:
            src = resolve_table_source(t)
        except Exception:
            src = None
        if src and src.get("source_id") in source_conns:
            c, c_db_type, _sn = source_conns[src["source_id"]]
            table_conn_map[t.lower()] = (c, c_db_type, src.get("raw_table", t))
        elif active_conn is not None:
            table_conn_map[t.lower()] = (active_conn, active_db_type, t)
        if src and src.get("source_id") is not None and src.get("connection_string"):
            fed_sources[t] = src

    # Tất cả connections đã mở (để close ở finally)
    all_conns = [c for (c, _dbt, _sn) in source_conns.values()]
    if active_conn is not None:
        all_conns.append(active_conn)

    if not all_conns:
        step = ErrorEvent(
            payload={"error": "Không thể kết nối DB để explore."},
            phase="exploring"
        ).model_dump()
        return {"exploration_log": [step], "steps": [step]}

    steps: list[dict] = []
    exploration_log: list[dict[str, Any]] = []

    try:
        # ── Build native LangChain tools với connection đúng nguồn ──────────

        db_types = {t.lower(): info[1] for t, info in table_conn_map.items()}

        explore_tools = build_explore_tools(
            source_conns=source_conns,
            selected_tables=selected_tables,
            db_types=db_types,
            table_conn_map=table_conn_map,
            fed_sources=fed_sources,
            active_conn=active_conn,
            active_db_type=active_db_type,
        )
        research_tools = build_research_tools()
        all_tools = explore_tools + research_tools


        llm = await _get_llm(state, streaming=False, json_mode=False)

        system_prompt = get_explorer_prompt(
            today_str=_today_str,
            selected_tables=selected_tables,
            schemas_text=schemas_text,
            plan_steps=plan_steps
        )

        explore_agent = create_react_agent(
            model=llm,
            tools=all_tools,
            prompt=system_prompt,
        )

        # ── Invoke ReAct agent ──────────────────────────────────────────────
        if config is None:
            config = RunnableConfig()

        result = await explore_agent.ainvoke({
            "messages": [{"role": "user", "content": f"Câu hỏi: {question}. Hãy khám phá dữ liệu."}]
        }, config=config)

        # ── Extract tool calls/results từ agent messages → SSE steps ───────
        # ── Extract exploration_log từ agent messages ───────
        agent_msgs = result.get("messages", [])
        for msg in agent_msgs:
            if isinstance(msg, AIMessage) and msg.tool_calls:
                for tc in msg.tool_calls:
                    exploration_log.append({"tool": tc["name"], "args": tc.get("args", {})})
            elif isinstance(msg, ToolMessage):
                if exploration_log and "result" not in exploration_log[-1]:
                    exploration_log[-1]["result"] = str(msg.content)[:2000]

        # Lấy final summary từ AI message cuối không có tool_calls
        final_summary = ""
        for msg in reversed(agent_msgs):
            if isinstance(msg, AIMessage) and not msg.tool_calls and msg.content:
                final_summary = str(msg.content)[:1000]
                break

        done_step = WorkflowTaskEvent(
            payload={
                "message": f"Khám phá hoàn tất: {final_summary[:200]}",
                "summary": final_summary
            },
            phase="exploring",
            status="done"
        ).model_dump()
        steps.append(done_step)

    except Exception as e:
        logger.warning(f"node_explore error: {e}", exc_info=True)
        steps.append(ErrorEvent(payload={"error": f"Lỗi explore: {e}"}, phase="exploring").model_dump())
    finally:
        for _c in all_conns:
            try:
                _c.close()
            except Exception:
                pass

    return {"exploration_log": exploration_log, "steps": steps}
