"""api/sql/agent.py — Facade mỏng: điểm vào stream_sql_agent + re-export.

File gốc 1726 dòng đã được chẻ nhỏ thành state/helpers/explore_tools/nodes_*/graph
(task: chẻ nhỏ agent.py). Mọi import `from dbgpt_analyst.agent import X` cũ vẫn chạy.
"""
from datetime import UTC
import json
import logging as _logging
import time
from dbgpt_analyst.common.resilience import CircuitBreakerOpenException
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, AIMessageChunk

from dbgpt_analyst.domains.research.reasoning_log import ReasoningLog
from dbgpt_analyst.events_schemas.schemas_stream import (
    AnswerDeltaEvent,
    ChartSpecEvent,
    ErrorEvent,
    FinalEvent,
    FollowupQuestionsEvent,
    IntentDetectedEvent,
    PhaseEvent,
    PlanEvent,
    RowBatchEvent,
    SourceMetaEvent,
    SQLDeltaEvent,
    SQLValidatedEvent,
    StatusEvent,
    TaskCallEvent,
    ThinkingDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    event_to_sse,
)

# ── WrenAI-ported modules ──────────────────────────────────────────────────
from dbgpt_analyst.common.db import get_db_connection

logger = _logging.getLogger(__name__)

# ── Re-export toàn bộ symbol public để giữ tương thích ngược ──────────────
# Lazy-initialized graph singleton (created on first call to stream_ai_analytic_agent)
import asyncio as _asyncio_mod

from dbgpt_analyst.core.helpers import _get_llm, json_serial
from dbgpt_analyst.history.summary_history import SummaryHistoryManager
from dbgpt_analyst.main_agent import build_main_graph

_graph_instances_by_loop = {}

# force_query_type (from the API's `mode` form field) → subagent name registered in
# main_agent.py. Only modes that map to exactly one subagent belong here; "hybrid"
# is deliberately absent because deep-research fans out across several.
_FORCED_SUBAGENT = {
    "office": "office_writer",
    "report": "report_writer",
    "web": "web_researcher",
    "sql": "sql_analyst",
}


async def _get_graph():
    """Get or create the main Supervisor graph for the current event loop.

    Checkpointer is initialized inside build_main_graph() — event_streamer
    only handles streaming, not memory configuration.
    """
    loop = _asyncio_mod.get_running_loop()
    if loop not in _graph_instances_by_loop:
        _graph_instances_by_loop[loop] = await build_main_graph()
    return _graph_instances_by_loop[loop]


def parse_formatted_tool_content(content: str) -> dict[str, Any]:
    """Parse structured markdown output from _format_result back into state fields."""
    result = {}
    if not content:
        return result
    
    if "## Analysis\n" in content:
        parts = content.split("## Analysis\n", 1)[1]
        result["answer"] = parts.split("\n\n## ", 1)[0].strip()
    
    if "## SQL Query\n```sql\n" in content:
        parts = content.split("## SQL Query\n```sql\n", 1)[1]
        sql_part = parts.split("\n```", 1)[0].strip()
        result["generated_sql"] = sql_part

    if "## Chart Configuration\n" in content:
        parts = content.split("## Chart Configuration\n", 1)[1]
        chart_part = parts.split("\n\n## ", 1)[0].strip()
        try:
            result["chart"] = json.loads(chart_part)
        except Exception:
            pass

    if "## Suggested Follow-ups\n" in content:
        parts = content.split("## Suggested Follow-ups\n", 1)[1]
        fq_part = parts.split("\n\n## ", 1)[0].strip()
        try:
            result["followup_questions"] = json.loads(fq_part)
        except Exception:
            pass
            
    return result


def parse_text_tool_call(text: str) -> dict[str, Any] | None:
    """Detect and parse text tool call leaks emitted in LLM text stream.
    Supports formats like:
    <task subagent_type="..." description="...">...</task>
    <task desc="..." subagent_type="..."> (closed or unclosed)
    <task>subagent_type: "..." description: "..."</task> (closed or unclosed)
    <call:default_api:task xmlns:... subagent_type="..." description="...">{}</call:default_api:task>
    <call:default_api:task{description: "...", subagent_type: sql_analyst}>
    <tool_call>...</tool_call>
    """
    if not text:
        return None

    import re
    import ast

    # 1. Direct regex for exact Challenger 2 <task> pattern variations (closed or unclosed)
    match_task_exact = re.search(r'<task>\s*subagent_type:\s*"([^"]+)"\s*description:\s*"([^"]+)"(?:\s*</task>)?', text, re.DOTALL)
    if match_task_exact:
        subagent_type = match_task_exact.group(1)
        description = match_task_exact.group(2)
        return {
            "tool": "task",
            "subagent_type": subagent_type,
            "description": description,
            "args": {"subagent_type": subagent_type, "description": description},
            "raw_match": match_task_exact.group(0),
        }

    # 2. <call:(?:default_api:)?task ...>...</call:...> or <call:...>...</call:...>
    call_tag_match = re.search(r"<call:(?:default_api:)?([a-zA-Z0-9_]+)\b([^>]*)>(.*?)(?:</call:(?:default_api:)?\1>|$)", text, re.DOTALL)
    if call_tag_match:
        tool_name = call_tag_match.group(1)
        attrs_str = call_tag_match.group(2) or ""
        body_str = call_tag_match.group(3) or ""
        full_content = attrs_str + " " + body_str

        subagent_type = "sql_analyst"
        description = ""
        args = {}

        try:
            parsed_j = json.loads(body_str.strip())
            if isinstance(parsed_j, dict):
                args = parsed_j
        except Exception:
            pass

        sub_m = re.search(r"subagent_type\s*[:=]\s*[\"']?([a-zA-Z0-9_]+)[\"']?", full_content)
        if sub_m:
            subagent_type = sub_m.group(1)

        desc_m = re.search(r'\b(?:description|desc)\s*[:=]\s*["\']([^"\']+)["\']', full_content)
        if desc_m:
            description = desc_m.group(1).strip()
        else:
            desc_m = re.search(r"\b(?:description|desc)\s*[:=]\s*[\"']?(.*?)(?:[\"']?\s*,?\s*subagent_type|[\"']?\s*\}|[\"']?\s*[\/>\n]|\s*$)", full_content, re.DOTALL)
            if desc_m:
                description = desc_m.group(1).strip().strip('"').strip("'").rstrip(",")
            elif args.get("description"):
                description = args["description"]

        if isinstance(args, dict):
            subagent_type = args.get("subagent_type", subagent_type)
            description = args.get("description", description)

        return {
            "tool": tool_name,
            "subagent_type": subagent_type,
            "description": description or text,
            "args": args or {"subagent_type": subagent_type, "description": description},
            "raw_match": call_tag_match.group(0),
        }

    # 3. Closed <task ...>...</task>
    match_task = re.search(r"<task\b([^>]*)>(.*?)</task>", text, re.DOTALL)
    if match_task:
        attrs_str = match_task.group(1) or ""
        body_str = match_task.group(2) or ""
        full_content = attrs_str + " " + body_str
        subagent_type = "sql_analyst"
        description = ""
        args = {}

        try:
            parsed_json = json.loads(body_str.strip())
            if isinstance(parsed_json, dict):
                subagent_type = parsed_json.get("subagent_type", "sql_analyst")
                description = parsed_json.get("description") or parsed_json.get("desc", "")
                args = parsed_json
        except Exception:
            pass

        if not description:
            sub_m = re.search(r"subagent_type\s*[:=]\s*[\"']?([a-zA-Z0-9_]+)[\"']?", full_content)
            if sub_m:
                subagent_type = sub_m.group(1)

            desc_m = re.search(r"\b(?:description|desc)\s*[:=]\s*[\"']?(.*?)(?:[\"']?\s*,?\s*subagent_type|[\"']?\s*\}|[\"']?\s*[\/>\n]|\s*$)", full_content, re.DOTALL)
            
            if desc_m:
                description = desc_m.group(1).strip().strip('"').strip("'").rstrip(",")
            else:
                description = body_str.strip()

            args = {"subagent_type": subagent_type, "description": description}

        return {
            "tool": "task",
            "subagent_type": subagent_type,
            "description": description or text,
            "args": args,
            "raw_match": match_task.group(0),
        }

    # 4. <tool_call>...</tool_call>
    match_xml = re.search(r"<tool_call\b([^>]*)>(.*?)</tool_call>", text, re.DOTALL)
    if match_xml:
        inner = match_xml.group(2)
        sub_m = re.search(r"subagent_type\s*[:=]\s*[\"']?([a-zA-Z0-9_]+)[\"']?", inner)
        desc_m = re.search(r"\b(?:description|desc)\s*[:=]\s*[\"']?(.*?)(?:,\s*subagent_type|\}|$)", inner, re.DOTALL)
        subagent_type = sub_m.group(1) if sub_m else "sql_analyst"
        description = desc_m.group(1) if desc_m else inner
        return {
            "tool": "task",
            "subagent_type": subagent_type,
            "description": description,
            "args": {"subagent_type": subagent_type, "description": description},
            "raw_match": match_xml.group(0),
        }

    # 5. Unclosed <task desc="..." subagent_type="..." tag (attributes inside opening tag)
    match_unclosed_attr = re.search(r'<task\b([^>]*)(?:>|$)', text, re.DOTALL)
    if match_unclosed_attr:
        attrs_str = match_unclosed_attr.group(1) or ""
        if attrs_str.strip():
            subagent_type = "sql_analyst"
            description = ""

            sub_m = re.search(r"subagent_type\s*[:=]\s*[\"']?([a-zA-Z0-9_]+)[\"']?", attrs_str)
            if sub_m:
                subagent_type = sub_m.group(1)

            desc_m = re.search(r'\b(?:description|desc)\s*[:=]\s*["\']([^"\']+)["\']', attrs_str)
            if desc_m:
                description = desc_m.group(1).strip()
            else:
                desc_m = re.search(
                    r"\b(?:description|desc)\s*[:=]\s*[\"']?(.*?)(?:[\"']?\s*,?\s*subagent_type|[\"']?\s*\}|[\"']?\s*[\/>\n]|\s*$)",
                    attrs_str,
                    re.DOTALL,
                )
                if desc_m and desc_m.group(1).strip():
                    description = desc_m.group(1).strip().strip('"').strip("'").rstrip(",")

            if sub_m or description:
                return {
                    "tool": "task",
                    "subagent_type": subagent_type,
                    "description": description or text,
                    "args": {"subagent_type": subagent_type, "description": description},
                    "raw_match": match_unclosed_attr.group(0),
                }

    return None


# ----------------- Core Agent API: streaming entrypoint -----------------

# Node → sub-agent slot mapping. Each fan-out node renders in its OWN live card;
# everything else streams into the main "aggregator" card (SQL + synthesizer).
# Slot ids derive from the caller-supplied base `graph_id` so the FE reducer
# (which infers agentType from the id substring) spawns one card per sub-agent.
def _slot_for(node: str | None, base_graph_id: str, subgraph_name: str | None = None) -> tuple[str, str, str]:
    """(slot_id, slot_name, graph_type) for a producing graph node."""
    # If the subgraph is a top-level mode (quick_analysis, etc.), we must rely on the inner node name
    # to know which actual sub-agent is running.
    if subgraph_name in ("quick_analysis", "deep_report", "hybrid_analysis"):
        key = node or subgraph_name
    else:
        key = subgraph_name or node

    if key in ("web_researcher", "research"):
        return (f"{base_graph_id}-web_researcher", "Web Researcher", "web_researcher")
    if key in ("data_engineer", "clean"):
        return (f"{base_graph_id}-data_engineer", "Data Engineer", "data_engineer")
    if key in ("report_writer", "report_agent", "slide"):
        return (f"{base_graph_id}-report_agent", "Report Agent", "report_agent")
    if key in ("office_writer", "detect_type", "generate", "office"):
        return (f"{base_graph_id}-office_writer", "Office Writer", "office_writer")
    if key in ("deep_search_web_agent", "deep_search", "deep_research"):
        return (f"{base_graph_id}-deep_search_web_agent", "Deep Search Web Agent", "deep_search_web_agent")

    if key in ("sql_analyst", "sql_agent", "generate_sql", "validate", "execute_sql", "critic", "execute", "hybrid_analyst", "sql"):
        return (f"{base_graph_id}-sql_analyst", "SQL Analyst", "sql_analyst")
    
    if key == "synthesizer":
        return (f"{base_graph_id}-synthesizer", "Synthesizer", "synthesizer")

    # Default fallback for unhandled nodes (e.g. main agent nodes like 'call_model', 'supervisor', etc.)
    return (f"{base_graph_id}-main_graph", "Main Graph", "main_graph")


def _stamp_agent(chunk: str, slot_id: str, slot_name: str, session_id: str | None = None) -> str:
    """Fill graph_id/graph_name onto a single `data: {...}\n\n` SSE chunk.

    Fill-if-empty: an id already set upstream (e.g. by the graph) is preserved,
    so this never clobbers genuinely per-sub-agent ids.
    Normalizes thinking and answer deltas for Kimi wire format compatibility and appends to wire_store.
    Supports both JSON SSE and XML SSE formats.
    """
    try:
        if not chunk.startswith("data:"):
            return chunk
        data_str = chunk[5:].strip()
        if data_str == "[DONE]":
            return chunk

        if "<chunk>" in chunk or data_str.startswith("<"):
            from dbgpt_analyst.events_schemas.schemas_stream import (
                parse_sse_events, xml_to_dict, dict_to_xml_sse
            )
            events = parse_sse_events(chunk)
            if events:
                obj = xml_to_dict(events[0])
                if isinstance(obj, dict):
                    if not obj.get("graph_id"):
                        obj["graph_id"] = slot_id
                    if not obj.get("graph_name"):
                        obj["graph_name"] = slot_name

                    evt_type = obj.get("type")
                    payload = obj.get("payload")
                    if isinstance(payload, dict):
                        if evt_type == "thinking_delta" and "think" not in payload:
                            payload["think"] = payload.get("delta", "")
                        elif evt_type == "answer_delta" and "text" not in payload:
                            payload["text"] = payload.get("delta", "")

                    if session_id:
                        try:
                            from dbgpt_app.openapi.api_v1.wire_store import append_event
                            append_event(session_id, obj)
                        except Exception:
                            pass

                    return dict_to_xml_sse(obj)

        obj = json.loads(data_str)
        if isinstance(obj, dict):
            if not obj.get("graph_id"):
                obj["graph_id"] = slot_id
            if not obj.get("graph_name"):
                obj["graph_name"] = slot_name

            evt_type = obj.get("type")
            if evt_type == "thinking_delta" and "think" not in obj.get("payload", {}):
                delta = obj.get("payload", {}).get("delta", "")
                obj["payload"]["think"] = delta
            elif evt_type == "answer_delta" and "text" not in obj.get("payload", {}):
                delta = obj.get("payload", {}).get("delta", "")
                obj["payload"]["text"] = delta

            if session_id:
                try:
                    from dbgpt_app.openapi.api_v1.wire_store import append_event
                    append_event(session_id, obj)
                except Exception:
                    pass

            return f"data: {json.dumps(obj, ensure_ascii=False, default=json_serial)}\n\n"
    except Exception:
        pass
    return chunk


async def stream_ai_analytic_agent(
    question: str,
    anchor_table: str,
    allowed_tables: list[str] = None,
    source_ids: list[int] | None = None,
    user_id: str = "dev_user",
    session_id: str | None = None,
    graph_id: str = "main",
    agent_id: str | None = None,
    force_query_type: str | None = None,
    model: str | None = None,
):
    # agent_id is the per-slot id assigned by router.py's fan-out (SQL/clean
    # agent coroutines); it plays the same role graph_id already serves below
    # (base id for _slot_for()'s sub-agent slot ids) — alias it in so callers
    # that identify agents by agent_id don't need a TypeError-triggering kwarg.
    if agent_id:
        graph_id = agent_id
    if allowed_tables is None:
        allowed_tables = []
    if source_ids is None:
        source_ids = []

    import uuid as _uuid
    _rlog_sid = session_id or str(_uuid.uuid4())
    _rlog = ReasoningLog(_rlog_sid)
    _rlog.start(question=question)

    session_text = ""
    if session_id:
        try:
            history_manager = SummaryHistoryManager(session_id)
            session_text = history_manager.get_context(window_size=6)
        except Exception as e:
            logger.warning(f"Failed to fetch session history from Postgres: {e}")

    # Bỏ pre-routing vì DeepAgent tự routing bằng Tool Call (Tiết kiệm 1 LLM Call)
    detected_intent = "TEXT_TO_SQL"
    reasoning = "Delegated to DeepAgent for routing"
    routed_query_type = force_query_type or "sql"
    rephrased_q = question

    state = {
        "question": question,
        "anchor_table": anchor_table,
        "allowed_tables": allowed_tables,
        "source_ids": source_ids,
        "model_name": model,
        # Default to the caller-scoped table list when one was given (e.g. the
        # UI already picked an anchor_table). Without this, a "task" delegation
        # copies runtime.state as-is into the subagent (create_deep_agent has no
        # state_schema, so table-selection never runs before delegating) — the
        # subagent gets allowed_tables but an empty selected_tables, its critic
        # refuses to generate SQL for it, and the coordinator wanders off into
        # unrelated filesystem tools (ls/read_file) instead of ever recovering.
        "selected_tables": list(allowed_tables) if allowed_tables else [],
        "schemas_text": "",
        "map_qualified": {},
        "db_type": "federated",
        "generated_sql": None,
        "query_results": [],
        "error": None,
        "retry_count": 0,
        "answer": None,
        "chart": None,
        "session_history": session_text,
        "golden_sqls": "",
        "business_docs": "",
        "steps": [],
        # Deep agent extensions
        "plan_steps": [],
        "query_type": routed_query_type,  # Pre-computed by classify_and_route() — 1 LLM call
        "force_query_type": force_query_type,  # deep-research: pin routing
        "web_findings": [],
        "exploration_log": [],
        "validation_result": None,
        "critic_verdict": None,
        "critic_retry_count": 0,
    }

    # Map node names → phase for AgentEvent enrichment
    _node_phase = {
        "planner": "planning",
        "orchestrator": "routing",
        "web_researcher": "researching",
        "table_selector": "selecting",
        "resolve_schema": "resolving",
        "explore": "exploring",
        "generate_sql": "generating",
        "validate": "validating",
        "execute_sql": "executing",
        "critic": "critic",
        "data_engineer": "profiling",    # 🔧 Data Engineer Agent
        "report_agent": "reporting",     # 📋 Report Agent (legacy node name)
        "report_writer": "reporting",    # 📋 Report Agent (registered CompiledSubAgent name)
        "hybrid_analyst": "generating",  # 🧠+🌐 Hybrid Analyst (SQL + web research)
        "office_writer": "office",       # 📄 Office Writer
        "merge_results": "merging",      # 🔀 Fan-in Merge
        "synthesizer": "insights",       # 📊 Synthesizer Agent
        "generate_insights": "insights",
        "sql_analyst": "generating",
    }

    # ── Per-sub-agent slot routing context ───────────────────────────
    # `_ctx["node"]` is set by the inner generator immediately before every
    # yield; the outer wrapper reads it to resolve the slot, opens that slot
    # once (AGENT_SLOT_UPDATE), then stamps the chunk's graph_id/graph_name.
    _ctx: dict[str, str | None] = {"node": None, "subgraph": None}
    _opened: set[str] = set()
    # Some providers (e.g. DeepSeek V4 Flash) never stream a non-empty `name`
    # on ANY tool_call_chunk of a call — not even the first — so the
    # index-only "skip nameless chunks" guard below drops 100% of them and
    # the reasoning card freezes for the whole call. Memoize the resolved
    # name per (message_id, chunk_index) once known, and as a last resort
    # infer a delegate call by sniffing the accumulating args JSON for the
    # "subagent_type" key so progress still flows once it appears.
    _tool_call_name_by_key: dict[tuple, str] = {}
    _tool_call_args_by_key: dict[tuple, str] = {}
    # C4: raw providers stream tool_call_chunks one tiny arg-fragment at a
    # time (measured: 780 events/turn, char-level). Coalesce fragments per
    # key and flush at most every 50ms instead of once per chunk — the first
    # chunk for a key still flushes immediately so the UI card opens without
    # delay. `_taskcall_pending` holds args accumulated since the last flush;
    # concatenating every flushed payload["args"] in order still reconstructs
    # the exact same string the unthrottled stream would have produced.
    _taskcall_pending: dict[tuple, str] = {}
    _taskcall_last_flush: dict[tuple, float] = {}

    def _prefixed(name: str) -> str:
        """Prefix a tool/event name with the current subgraph context.

        E.g. if _ctx['subgraph'] is 'sql_analyst' and name is 'get_table_schema',
        returns 'sql_analyst.get_table_schema'. Top-level events pass through as-is.
        """
        sg = _ctx.get("subgraph")
        if sg and name and not name.startswith(f"{sg}."):
            return f"{sg}.{name}"
        return name

    def _save_to_postgres(ans: str, sql: str = "", chart_str: str = None, qr_str: str = None):
        if not session_id:
            return
        try:
            from datetime import datetime as _dt
            import uuid

            from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
            schema = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
            now = _dt.now(UTC).isoformat()
            conn = get_db_connection()
            try:
                cur = conn.cursor()
                # Defensive: the FE fires POST /conversations (create) and the SSE
                # stream (which lands here) concurrently without awaiting the former,
                # so this INSERT can race ahead of the conversation row actually
                # committing — causing an FK violation on analytic_messages.
                # Self-heal by ensuring the conversation row exists before saving.
                cur.execute(
                    f"INSERT INTO {schema}.analytic_conversations (id, title, created_at, updated_at) "
                    "VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                    (session_id, question[:80], now, now),
                )
                cur.execute(
                    f"INSERT INTO {schema}.analytic_messages (id, conversation_id, role, content, sql_used, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
                    (str(uuid.uuid4()), session_id, "user", question, "", now)
                )
                now2 = _dt.now(UTC).isoformat()
                cur.execute(
                    f"INSERT INTO {schema}.analytic_messages (id, conversation_id, role, content, sql_used, chart_spec, query_results, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (str(uuid.uuid4()), session_id, "ai", ans, sql, chart_str, qr_str, now2)
                )
                cur.execute(f"UPDATE {schema}.analytic_conversations SET updated_at=%s WHERE id=%s", (now2, session_id))
                conn.commit()
            finally:
                conn.close()
        except Exception as ex:
            logger.error(f"Error saving to Postgres: {ex}")
            return

        try:
            from dbgpt_analyst.repositories.analytic_execution_steps import save_execution_step
            save_execution_step(
                conversation_id=session_id,
                step_type="final_answer",
                reasoning=ans[:2000] if ans else None,
            )
        except Exception as ex:
            logger.warning(f"Error saving final_answer execution step: {ex}")

    # ── Inner generator: yields plain SSE chunks, updates _ctx["node"] ──
    async def _inner():
        all_messages = []
        if detected_intent == "GENERAL":
            _ctx["node"] = None
            yield event_to_sse(IntentDetectedEvent(
                payload={"intent": "DIRECT_CHAT", "tables": [], "reasoning": reasoning}
            ))
            yield event_to_sse(PhaseEvent(phase="insights", payload={"message": "Đang trả lời..."}, status="running"))
            try:
                stream_llm = await _get_llm(state, streaming=True, json_mode=False)
                full_answer = ""
                sys_msg = SystemMessage(content=(
                    "Bạn là trợ lý AI phân tích dữ liệu thông minh và thân thiện. "
                    "Giới thiệu ngắn gọn: bạn có thể giúp người dùng truy vấn, phân tích và trực quan hoá dữ liệu. "
                    "Trả lời tự nhiên bằng tiếng Việt, không quá 3 câu."
                ))
                async for chunk in stream_llm.astream([sys_msg, HumanMessage(content=question)]):
                    delta = chunk.content
                    if delta:
                        full_answer += delta
                        yield event_to_sse(AnswerDeltaEvent(payload={"delta": delta}))
            except Exception:
                full_answer = "Xin chào! Tôi là trợ lý AI phân tích dữ liệu. Hãy hỏi tôi về dữ liệu của bạn nhé!"
                yield event_to_sse(AnswerDeltaEvent(payload={"delta": full_answer}))
            yield event_to_sse(PhaseEvent(phase="insights", payload={"message": "Hoàn tất."}, status="done"))
            yield event_to_sse(FinalEvent(payload={"answer": full_answer}))
            _save_to_postgres(full_answer)
            return

        elif detected_intent == "MISLEADING":
            _ctx["node"] = None
            yield event_to_sse(IntentDetectedEvent(
                payload={"intent": "MISLEADING", "tables": [], "reasoning": reasoning}
            ))
            full_answer = "Xin lỗi, tôi chỉ có thể hỗ trợ các câu hỏi liên quan đến phân tích dữ liệu trong hệ thống. Bạn vui lòng hỏi các câu hỏi về dữ liệu nhé."
            yield event_to_sse(PhaseEvent(phase="insights", payload={"message": "Từ chối truy vấn..."}, status="running"))
            yield event_to_sse(AnswerDeltaEvent(payload={"delta": full_answer}))
            yield event_to_sse(PhaseEvent(phase="insights", payload={"message": "Hoàn tất."}, status="done"))
            yield event_to_sse(FinalEvent(payload={"answer": full_answer}))
            _save_to_postgres(full_answer)
            return

        # Emit intent_detected before graph starts
        _ctx["node"] = None
        intent_evt = IntentDetectedEvent(
            payload={
                "intent": "TEXT_TO_SQL",
                "tables": allowed_tables[:5] if allowed_tables else [],
                "reasoning": reasoning or f"Phân tích câu hỏi: {question[:120]}"
            }
        )
        yield event_to_sse(intent_evt)

        # Early user-facing StatusEvent and PhaseEvent yields before graph execution
        yield event_to_sse(StatusEvent(payload={"message": "Đang khởi tạo kết nối...", "status": "running"}))
        yield event_to_sse(StatusEvent(payload={"message": "Đang phân tích dữ liệu...", "status": "running"}))
        yield event_to_sse(PhaseEvent(phase="planning", payload={"message": "Đang phân tích dữ liệu..."}, status="running"))

        # Emit coordinator slot immediately so the UI shows a card while the graph warms up.
        # The streamer will reuse this slot (idempotent AGENT_SLOT_UPDATE).
        _ctx["node"] = None
        coord_id, coord_name, coord_type = _slot_for(None, graph_id)
        early_slot = {
            "type": "AGENT_SLOT_UPDATE",
            "graph_id": coord_id,
            "graph_name": coord_name,
            "graph_type": coord_type,
            "status": "running",
            "payload": {},
        }
        yield f"data: {json.dumps(early_slot, ensure_ascii=False)}\n\n"

        from dbgpt_analyst.main_agent import AgentContext

        run_config = {"configurable": {"thread_id": session_id or "default"}}
        if model:
            run_config["configurable"]["context"] = AgentContext(model=model)

        # NOTE: Semantic Recall Node từng chạy ở đây (core...nodes.recall),
        # nhưng file đó đã bị xóa khỏi codebase — import luôn fail và rơi vào
        # except mỗi request (silent no-op, tốn 1 exception mỗi lần chạy).
        # Bỏ hẳn khối try/except chết, dùng thẳng HumanMessage như nhánh except cũ.
        # Muốn phục hồi tính năng recall: viết lại node dựa trên
        # SemanticMemoryRepo.recall_memories_by_keyword() (memory/semantic_repo.py).
        from langchain_core.messages import HumanMessage, SystemMessage
        state["messages"] = [HumanMessage(content=question)]
        # When the caller names a mode explicitly (a UI mode button, not a guess),
        # pin the delegation. Routing is entirely the supervisor LLM's `task` call,
        # so `force_query_type` in state alone is inert — nothing reads it. Without
        # this, an explicit "office" mode still loses to the prompt's rule that any
        # revenue/sales wording MUST go to sql_analyst.
        _forced_subagent = _FORCED_SUBAGENT.get(force_query_type or "")
        if _forced_subagent:
            state["messages"].insert(0, SystemMessage(content=(
                f"MANDATORY ROUTING OVERRIDE: the user explicitly selected this mode. "
                f"Your FIRST action MUST be task(subagent_type=\"{_forced_subagent}\", ...). "
                f"Do not delegate to any other subagent, and do not answer directly."
            )))
        all_messages.append(state["messages"][-1])

        graph = await _get_graph()
        _parser = {"id": None, "buffer": "", "is_thinking": False, "seen_end": False, "subgraph": None}
        # msg_id -> running-merged AIMessageChunk. Tool-call args stream in as
        # separate JSON-delta chunks, so the raw per-chunk `message.tool_calls`
        # can still be empty/incomplete on the very first chunk that reveals a
        # tool's name (e.g. "task" with args={}) — merging via `+` converges to
        # the fully parsed args as later chunks arrive.
        _ai_chunk_acc: dict[str, Any] = {}
        # ── Context-usage tracking (Kimi-style StatusEvent) ─────────────
        # The final AIMessageChunk of every model call carries usage_metadata
        # (input_tokens = full prompt size = context consumed). Dedupe by
        # message id, count each unique call as one "step", and flag
        # "compacted" when the prompt size suddenly drops (SummarizationMiddleware
        # fired and shrank the history).
        _usage_seen: set[str] = set()
        _step_n = 0
        _prev_tokens_by_subgraph: dict[str, int] = {}
        _MAX_CONTEXT = 128_000  # Default context size
        async for kind, payload in graph.astream(state, stream_mode=["messages", "updates", "custom"], config=run_config):
            subgraph_name = None
            # ── Unwrap subgraph events (recursively handle nested subagent layers) ──
            # Both main_graph.py's run_domain() and deepagents subagents.py's atask()
            # re-broadcast inner subgraph events via:
            #   emit_custom("subgraph_stream",
            #       {"kind": kind, "payload": payload, "subgraph_name": name})
            # When a subagent adapter is wrapped inside DeepAgents atask(), nesting is 2+ levels deep:
            #   kind="custom", payload={"name": "subgraph_stream", "data": {"kind": "custom", "payload": {"name": "subgraph_stream", "data": ...}}}
            # A while loop unwraps all nested layers until reaching the root event (artifact.*, thinking_delta, sql_delta, messages, updates).
            while (
                kind == "custom"
                and isinstance(payload, dict)
                and payload.get("name") == "subgraph_stream"
                and isinstance(payload.get("data"), dict)
            ):
                event_data = payload["data"]
                subgraph_name = event_data.get("subgraph_name") or event_data.get("subagent_type") or subgraph_name
                kind = event_data.get("kind", kind)
                payload = event_data.get("payload", payload)
                logger.info("SUBGRAPH_UNWRAP: subgraph=%r, kind=%r, payload_type=%s, payload_str=%s",
                    subgraph_name, kind, type(payload).__name__, str(payload)[:300])

            # Reset the subgraph context to the current event's subgraph (which is None for top-level events)
            # to prevent context leakage across events.
            _ctx["subgraph"] = subgraph_name

            if kind == "custom":
                # Custom events emitted via events.base.emit_custom() from LangGraph nodes.
                # NOT adispatch_custom_event() — that API feeds astream_events(v2), a
                # different channel this loop never reads (see emit_custom's docstring).
                # subgraph_name (set above when this event came from inside a domain
                # subgraph) is the authoritative routing key — keep it live across every
                # branch below so nested custom events route to their originating card.
                event_name = payload.get("name")
                event_data = payload.get("data")

                # Fast-path: delta events (high frequency)
                if event_name == "thinking_delta":
                    _ctx["node"] = None
                    yield event_to_sse(ThinkingDeltaEvent(payload=event_data))
                    continue
                if event_name == "sql_delta":
                    # Route to SQL Analyst slot, not coordinator
                    _ctx["node"] = "generate_sql"
                    yield event_to_sse(SQLDeltaEvent(payload=event_data))
                    continue

                # All other custom events: route by subgraph_name if present,
                # else fall back to the coordinator (top-level, non-subgraph event).
                _ctx["node"] = None

                # Deep research sub-graph events
                if event_name and event_name.startswith("deep_research_"):
                    from dbgpt_analyst.events_schemas.schemas_stream import BaseEvent
                    class CustomEvent(BaseEvent):
                        type: str = event_name
                        payload: Any = event_data
                    yield event_to_sse(CustomEvent(type=event_name, payload=event_data))
                    continue  # inside if block - intentional

                # Artifact lifecycle events: artifact.start / .progress / .ready / .error
                if event_name and event_name.startswith("artifact."):
                    from dbgpt_analyst.events_schemas.schemas_stream import BaseEvent
                    class ArtifactSSEEvent(BaseEvent):
                        type: str = event_name
                        payload: Any = event_data
                    yield event_to_sse(ArtifactSSEEvent(type=event_name, payload=event_data))
                    continue

                # Generic fallthrough: pass any other custom event directly to FE
                # Handles future events (memory_recalled, schema_enriched, etc.) without
                # needing code changes here.
                if event_name and event_data is not None:
                    from dbgpt_analyst.events_schemas.schemas_stream import BaseEvent
                    class PassthroughEvent(BaseEvent):
                        type: str = event_name
                        payload: Any = event_data
                    yield event_to_sse(PassthroughEvent(type=event_name, payload=event_data))
                continue


            if kind == "messages":
                message, metadata = payload
                msg_type = getattr(message, "type", "")
                if msg_type == "ai" or "AIMessage" in type(message).__name__:
                    # 1. Filter out completely empty AI chunks
                    content = getattr(message, "content", "")
                    has_content = False
                    if isinstance(content, str):
                        if content:
                            has_content = True
                    elif isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict):
                                if block.get("type") == "text" and block.get("text"):
                                    has_content = True
                                    break
                            elif isinstance(block, str) and block:
                                has_content = True
                                break
                    elif content:
                        has_content = True

                    tool_calls = getattr(message, "tool_calls", None)
                    tool_call_chunks = getattr(message, "tool_call_chunks", None)

                    if not has_content and not tool_calls and not tool_call_chunks:
                        logger.info("Filtering out completely empty AI chunk: %r", message)
                        continue

                    # 2. Skip completed duplicate messages of streaming runs
                    msg_id = getattr(message, "id", None)
                    if msg_id is not None and msg_id in _ai_chunk_acc:
                        if type(message).__name__ == "AIMessage" or (isinstance(message, AIMessage) and not isinstance(message, AIMessageChunk)):
                            logger.info("Skipping completed duplicate AI message: %s", msg_id)
                            continue

                all_messages.append(message)

                # ── Emit context-usage status once per completed model call ──
                _usage = getattr(message, "usage_metadata", None)
                _raw_msg_id = getattr(message, "id", None)
                _msg_uid = _raw_msg_id or f"msg-{_step_n+1}-{id(message)}"
                if (
                    isinstance(_usage, dict)
                    and _usage.get("input_tokens")
                    and _msg_uid not in _usage_seen
                ):
                    _usage_seen.add(_msg_uid)
                    _step_n += 1
                    _in_tokens = int(_usage["input_tokens"])

                    _max_ctx = _MAX_CONTEXT
                    if state.get("model_name"):
                        m_lower = str(state.get("model_name")).lower()
                        if any(k in m_lower for k in ("claude", "gpt-4", "gemini")):
                            _max_ctx = 200_000
                        elif any(k in m_lower for k in ("deepseek", "qwen")):
                            _max_ctx = 128_000

                    _sub_key = subgraph_name or _ctx.get("subgraph") or "main"
                    _prev_tok = _prev_tokens_by_subgraph.get(_sub_key)
                    _compacted = (
                        _prev_tok is not None
                        and _in_tokens < _prev_tok * 0.6
                    )
                    _prev_tokens_by_subgraph[_sub_key] = _in_tokens

                    yield event_to_sse(StatusEvent(payload={
                        "context_usage": round(_in_tokens / _max_ctx, 3),
                        "input_tokens": _in_tokens,
                        "max_context": _max_ctx,
                        "step": _step_n,
                        "compacted": _compacted,
                    }))

                # Stamp by the node that produced this message chunk.
                _ctx["node"] = metadata.get("langgraph_node")
                # IMPORTANT: Do NOT overwrite _ctx["subgraph"] here with the local
                # subgraph_name (which is None for unwrapped subgraph events after
                # the wrapper was peeled off above). _ctx["subgraph"] was already set
                # to the correct subgraph name (e.g. 'sql_analyst') when we processed
                # the subgraph_stream wrapper above.
                # Only reset to None when this is a top-level (non-subgraph) message.
                if subgraph_name is None and _ctx.get("subgraph") and kind == "messages":
                    # Keep the existing subgraph context — don't reset it.
                    pass
                logger.info("MSG_EVENT: node=%r, subgraph=%r, msg_type=%s, content_len=%d",
                    _ctx.get("node"), _ctx.get("subgraph"),
                    getattr(message, 'type', type(message).__name__),
                    len(str(getattr(message, 'content', '') or '')))
                
                # Check for ai message or chunk
                msg_type = getattr(message, "type", "")
                if msg_type == "ai" or "AIMessage" in type(message).__name__:
                    msg_id = getattr(message, "id", None)
                    if msg_id is not None:
                        try:
                            _ai_chunk_acc[msg_id] = (
                                _ai_chunk_acc[msg_id] + message if msg_id in _ai_chunk_acc else message
                            )
                        except TypeError:
                            # Not every "ai"-typed object supports chunk merging
                            # (e.g. a full non-chunk AIMessage) — fall back to
                            # treating it as its own complete snapshot.
                            _ai_chunk_acc[msg_id] = message
                    if _parser["id"] != msg_id:
                        if _parser["buffer"]:
                            old_subgraph = _ctx.get("subgraph")
                            _ctx["subgraph"] = _parser.get("subgraph")
                            if _parser["is_thinking"]:
                                yield event_to_sse(ThinkingDeltaEvent(payload={"delta": _parser["buffer"]}))
                            else:
                                yield event_to_sse(AnswerDeltaEvent(payload={"delta": _parser["buffer"]}))
                            _ctx["subgraph"] = old_subgraph
                        _parser["id"] = msg_id
                        _parser["subgraph"] = subgraph_name
                        _parser["buffer"] = ""
                        _parser["is_thinking"] = False
                        _parser["seen_end"] = False

                    if message.content:
                        delta = ""
                        if isinstance(message.content, str):
                            delta = message.content
                        elif isinstance(message.content, list):
                            delta = "".join(b.get("text", "") for b in message.content if isinstance(b, dict) and b.get("type") == "text")
                        
                        if delta:
                            _parser["buffer"] += delta

                            # ── Text Tool Call Leak Interceptor ──
                            if "<call:" in _parser["buffer"] or "<tool_call>" in _parser["buffer"] or "<task" in _parser["buffer"]:
                                parsed_tc = parse_text_tool_call(_parser["buffer"])
                                if parsed_tc:
                                    logger.info("Interception: Leaked text tool call detected: %r", parsed_tc)
                                    raw_tc_match = parsed_tc["raw_match"]
                                    _parser["buffer"] = _parser["buffer"].replace(raw_tc_match, "").strip()
                                    tc_subagent = parsed_tc["subagent_type"]
                                    tc_args = parsed_tc["args"]
                                    tc_desc = parsed_tc.get("description") or tc_args.get("description", "")

                                    # Emit structured TaskCallEvent to SSE
                                    import uuid
                                    task_id = f"task_{uuid.uuid4().hex[:8]}"
                                    old_sub = _ctx.get("subgraph")
                                    _ctx["node"] = "generate_sql"
                                    _ctx["subgraph"] = tc_subagent
                                    yield event_to_sse(TaskCallEvent(
                                        payload={
                                            "task_id": task_id,
                                            "subagent_type": tc_subagent,
                                            "description": tc_desc,
                                            "tool": _prefixed(tc_subagent),
                                            "args": tc_args,
                                        },
                                        phase="exploring"
                                    ))

                                    # Execute subagent delegation fallback
                                    from dbgpt_analyst.subgraphs.modes.quick_analysis_subgraph import quick_analysis_subgraph
                                    domain_state = {
                                        "question": tc_desc or question,
                                        "source_ids": state.get("source_ids", []),
                                        "anchor_table": state.get("anchor_table", ""),
                                        "allowed_tables": state.get("allowed_tables", []),
                                        "selected_tables": state.get("selected_tables", []),
                                        "schemas_text": state.get("schemas_text", ""),
                                        "map_qualified": state.get("map_qualified", {}),
                                        "db_type": state.get("db_type", "federated"),
                                        "generated_sql": None,
                                        "query_results": [],
                                        "error": None,
                                        "retry_count": 0,
                                        "answer": None,
                                        "chart": None,
                                    }
                                    try:
                                        sub_res = await quick_analysis_subgraph.ainvoke(domain_state)
                                        if sub_res.get("generated_sql"):
                                            state["generated_sql"] = sub_res["generated_sql"]
                                            yield event_to_sse(SQLValidatedEvent(payload={
                                                "valid": True,
                                                "detail": "SQL generated and validated",
                                                "sql": sub_res["generated_sql"]
                                            }))
                                        if sub_res.get("query_results"):
                                            state["query_results"] = sub_res["query_results"]
                                            results = sub_res["query_results"]
                                            cols = list(results[0].keys()) if isinstance(results[0], dict) else []
                                            rows = [[r.get(c) for c in cols] for r in results]
                                            yield event_to_sse(RowBatchEvent(payload={"rows": rows, "columns": cols, "batch_index": 0}))
                                        if sub_res.get("chart"):
                                            state["chart"] = sub_res["chart"]
                                            yield event_to_sse(ChartSpecEvent(payload=sub_res["chart"]))
                                        if sub_res.get("answer"):
                                            state["answer"] = sub_res["answer"]
                                            yield event_to_sse(AnswerDeltaEvent(payload={"delta": sub_res["answer"]}))
                                    except Exception as sub_err:
                                        logger.error(f"Text tool call fallback execution error: {sub_err}")

                                    # Emit slot done event
                                    sub_slot_id, sub_slot_name, sub_slot_type = _slot_for(
                                        _ctx["node"], agent_id, tc_subagent
                                    )
                                    sub_done_evt = {
                                        "type": "AGENT_SLOT_UPDATE",
                                        "graph_id": sub_slot_id,
                                        "graph_name": sub_slot_name,
                                        "graph_type": sub_slot_type,
                                        "status": "done",
                                        "payload": {},
                                    }
                                    yield f"data: {json.dumps(sub_done_evt, ensure_ascii=False)}\n\n"
                                    _ctx["subgraph"] = old_sub
                                else:
                                    # If closing tag hasn't arrived yet, hold buffer and pause flushing
                                    if "<task" in _parser["buffer"] and "</task>" not in _parser["buffer"] and len(_parser["buffer"]) < 4000:
                                        continue
                                    if "<tool_call" in _parser["buffer"] and "</tool_call>" not in _parser["buffer"] and len(_parser["buffer"]) < 4000:
                                        continue
                                    if "<call:" in _parser["buffer"] and ">" not in _parser["buffer"] and len(_parser["buffer"]) < 4000:
                                        continue

                            if _parser["seen_end"]:
                                yield event_to_sse(AnswerDeltaEvent(payload={"delta": delta}))
                                _parser["buffer"] = ""
                            elif not _parser["is_thinking"]:
                                if "<thinking>" in _parser["buffer"]:
                                    _parser["is_thinking"] = True
                                    before, after = _parser["buffer"].split("<thinking>", 1)
                                    if before:
                                        yield event_to_sse(AnswerDeltaEvent(payload={"delta": before}))
                                    _parser["buffer"] = after
                                    
                                    if "</thinking>" in _parser["buffer"]:
                                        inside, outside = _parser["buffer"].split("</thinking>", 1)
                                        if inside:
                                            yield event_to_sse(ThinkingDeltaEvent(payload={"delta": inside}))
                                        _parser["is_thinking"] = False
                                        _parser["seen_end"] = True
                                        _parser["buffer"] = outside
                                        if outside:
                                            yield event_to_sse(AnswerDeltaEvent(payload={"delta": outside}))
                                            _parser["buffer"] = ""
                                    else:
                                        yield event_to_sse(ThinkingDeltaEvent(payload={"delta": _parser["buffer"]}))
                                        _parser["buffer"] = ""
                                else:
                                    if len(_parser["buffer"]) > 25:
                                        _parser["seen_end"] = True
                                        yield event_to_sse(AnswerDeltaEvent(payload={"delta": _parser["buffer"]}))
                                        _parser["buffer"] = ""
                            else:
                                if "</thinking>" in _parser["buffer"]:
                                    inside, outside = _parser["buffer"].split("</thinking>", 1)
                                    if inside:
                                        yield event_to_sse(ThinkingDeltaEvent(payload={"delta": inside}))
                                    _parser["is_thinking"] = False
                                    _parser["seen_end"] = True
                                    _parser["buffer"] = outside
                                    if outside:
                                        yield event_to_sse(AnswerDeltaEvent(payload={"delta": outside}))
                                        _parser["buffer"] = ""
                                else:
                                    if len(_parser["buffer"]) > 15:
                                        to_yield = _parser["buffer"][:-15]
                                        _parser["buffer"] = _parser["buffer"][-15:]
                                        if to_yield:
                                            yield event_to_sse(ThinkingDeltaEvent(payload={"delta": to_yield}))
                    if hasattr(message, "tool_calls") and message.tool_calls:
                        logger.info("TC_DEBUG: tool_calls=%r", message.tool_calls)
                        for tc in message.tool_calls:
                            # Providers stream a tool call's `name` only on its first delta
                            # chunk; later chunks carry the same call's args with name="".
                            # Emitting those as their own event misclassifies them as a
                            # generic ToolCallEvent with tool="" (FE renders "Execute task"
                            # and it never matches the eventual ToolResultEvent's real tool
                            # name, so the card freezes mid-run). Skip — the first chunk
                            # already opened the card; nothing to attribute a nameless
                            # follow-up chunk to.
                            if not tc.get("name"):
                                continue
                            is_delegate = tc["name"] == "task" or str(tc["name"]).startswith("delegate")
                            EvtClass = TaskCallEvent if is_delegate else ToolCallEvent
                            yield event_to_sse(EvtClass(
                                payload={"tool": _prefixed(tc["name"]), "args": tc["args"]},
                                phase="exploring"
                            ))
                    elif hasattr(message, "tool_call_chunks") and message.tool_call_chunks:
                        logger.info("TC_DEBUG: tool_call_chunks=%r", message.tool_call_chunks)
                        _msg_key_id = getattr(message, "id", None)
                        for tcc in message.tool_call_chunks:
                            key = (_msg_key_id, tcc.get("index") or 0)
                            name = tcc.get("name") or _tool_call_name_by_key.get(key)
                            if not name:
                                # Never named yet — sniff the growing args JSON
                                # for the delegate-call marker key so this call
                                # isn't skipped for its entire duration.
                                buf = _tool_call_args_by_key.get(key, "") + (tcc.get("args") or "")
                                _tool_call_args_by_key[key] = buf
                                if '"subagent_type"' in buf:
                                    name = "task"
                                else:
                                    continue
                            _tool_call_name_by_key[key] = name
                            _taskcall_pending[key] = _taskcall_pending.get(key, "") + (tcc.get("args") or "")
                            _now = time.monotonic()
                            _first_flush = key not in _taskcall_last_flush
                            if not _first_flush and _now - _taskcall_last_flush[key] < 0.05:
                                continue  # buffered — flushed on next tick or at stream end
                            _taskcall_last_flush[key] = _now
                            args_out = _taskcall_pending.pop(key)
                            is_delegate = name == "task" or str(name).startswith("delegate")
                            EvtClass = TaskCallEvent if is_delegate else ToolCallEvent
                            yield event_to_sse(EvtClass(
                                payload={
                                    "tool": _prefixed(name),
                                    "args": args_out
                                },
                                phase="exploring"
                            ))
                elif getattr(message, "type", "") == "tool":
                    _tool_content = message.content
                    yield event_to_sse(ToolResultEvent(
                        payload={
                            "tool": _prefixed(message.name),
                            "result": _tool_content[:200] + "..." if len(str(_tool_content)) > 200 else _tool_content
                        },
                        phase="exploring"
                    ))
                    try:
                        from dbgpt_analyst.repositories.analytic_execution_steps import save_execution_step
                        save_execution_step(
                            conversation_id=session_id,
                            step_type="tool_call",
                            node_name=_ctx.get("node"),
                            subgraph_name=_ctx.get("subgraph"),
                            tool_name=message.name,
                            tool_result=str(_tool_content)[:2000] if _tool_content else None,
                        )
                    except Exception as ex:
                        logger.warning(f"Error saving tool_call execution step: {ex}")
                    # DeepAgent delegation ("task" tool) returns the sub-agent's full answer
                    # only as ToolMessage content — generate_insights/synthesizer never run
                    # in this routing path, so state["answer"] would otherwise stay empty
                    # and the final SSE event ships a null payload despite a real answer.
                    if message.name == "task":
                        if _tool_content:
                            parsed = parse_formatted_tool_content(_tool_content)
                            if parsed:
                                for pk, pv in parsed.items():
                                    if pv:
                                        state[pk] = pv
                            else:
                                state["answer"] = _tool_content

                        # This ToolMessage is the delegate returning — the sub-agent card
                        # that was "running" for this task just finished. AGENT_SLOT_UPDATE
                        # is otherwise only ever opened once (see _opened below) and never
                        # carries a completion signal, so the FE spinner for this card would
                        # spin forever without this explicit "done" emission.
                        #
                        # _ctx["node"]/_ctx["subgraph"] are NOT usable here: this ToolMessage
                        # comes from the outer graph's own generic "tools" node (not from
                        # inside the domain subgraph's re-broadcast stream), so subgraph is
                        # None and node is just "tools" — _slot_for() would fall through to
                        # the "-main_graph" fallback, which the FE reducer explicitly drops
                        # (AGENT_SLOT_UPDATE for a "-main_graph" id is a no-op), so the real
                        # slot would never see its "done".
                        #
                        # Recover subgraph_type from the original tool call instead. Providers
                        # stream a tool call's `name` only on its very first chunk and the rest
                        # of `args` across later chunks with no name — so gating a per-chunk
                        # capture on `tc["name"] == "task"` (tried first) only ever sees an
                        # empty args dict. By the time this ToolMessage exists, the AIMessage
                        # that requested it is fully merged in _ai_chunk_acc, so look the id up
                        # there directly instead of trying to catch it mid-stream.
                        _tool_call_id = getattr(message, "tool_call_id", None)
                        real_subgraph_type = None
                        if _tool_call_id:
                            for _acc in _ai_chunk_acc.values():
                                _match = next(
                                    (t for t in getattr(_acc, "tool_calls", []) if t.get("id") == _tool_call_id),
                                    None,
                                )
                                if _match:
                                    real_subgraph_type = (_match.get("args") or {}).get("subgraph_type")
                                    break
                        done_slot_id, done_slot_name, done_slot_type = _slot_for(
                            _ctx["node"], graph_id, real_subgraph_type or _ctx.get("subgraph")
                        )
                        done_evt = {
                            "type": "AGENT_SLOT_UPDATE",
                            "graph_id": done_slot_id,
                            "graph_name": done_slot_name,
                            "graph_type": done_slot_type,
                            "status": "done",
                            "payload": {},
                        }
                        yield f"data: {json.dumps(done_evt, ensure_ascii=False)}\n\n"
                        _ctx["subgraph"] = None
                continue

            if kind == "updates":
                graph_event = payload
                for node_name, updates in graph_event.items():
                    # Route every chunk produced for this node to its slot.
                    _ctx["node"] = node_name
                    # IMPORTANT: Do NOT overwrite _ctx["subgraph"] here — preserve
                    # the subgraph context set during subgraph_stream unwrapping.
                    # Only update if we have an explicit new subgraph_name.
                    if subgraph_name is not None:
                        _ctx["subgraph"] = subgraph_name
                    phase = _node_phase.get(node_name)

                    # Skip internal LangGraph middleware nodes (e.g. SkillsMiddleware.before_agent,
                    # model, TodoListMiddleware.after_model) — they flood the UI with noise.
                    is_known_node = phase is not None
                    if not is_known_node:
                        # Still process state updates from middleware, but don't emit phase events
                        if updates and isinstance(updates, dict):
                            for k, v in updates.items():
                                if k not in ("steps", "exploration_log"):
                                    state[k] = v
                        continue

                    # Emit phase-start event (new protocol)
                    phase_label = _prefixed(node_name)
                    phase_start = PhaseEvent(phase=phase, payload={"message": f"Entering {phase_label}"}, status="running")
                    yield event_to_sse(phase_start)
                    _rlog.log("phase", node=phase_label, status="running")

                    has_error = False
                    if updates and isinstance(updates, dict):
                        if updates.get("error"):
                            has_error = True
                        if "steps" in updates:
                            for stp in updates["steps"]:
                                if isinstance(stp, dict) and stp.get("step") == "error":
                                    has_error = True

                        for k, v in updates.items():
                            if k == "steps":
                                state["steps"].extend(v)
                                for step in v:
                                    # BaseEvent.model_dump() already provides exactly what SSE needs (type, payload, etc.)
                                    # We just need to JSON stringify it.
                                    if isinstance(step, dict):
                                        if "type" in step:
                                            # New Pydantic approach
                                            yield f"data: {json.dumps(step, ensure_ascii=False, default=json_serial)}\n\n"
                                        elif "step" in step:
                                            # Legacy dict approach fallback (will be phased out)
                                            yield f"data: {json.dumps(step, ensure_ascii=False, default=json_serial)}\n\n"
                            elif k == "exploration_log":
                                state.setdefault("exploration_log", []).extend(v)
                            else:
                                state[k] = v

                        # Emit rich events per node after state is updated.
                        # Note: table_selector emits its own events via "steps".
                        # Note: generate_sql already streams SQL char-by-char via
                        # emit_custom("sql_delta", ...) in sql_generator.py,
                        # so no node-specific branch is needed for it here.

                        if node_name == "validate":
                            vr = updates.get("validation_result")
                            if vr is not None:
                                yield event_to_sse(SQLValidatedEvent(payload={"valid": bool(vr), "detail": "" if vr else str(vr)}))

                        elif node_name == "execute_sql":
                            results = updates.get("query_results") or []
                            if results:
                                cols: list[str] = list(results[0].keys()) if isinstance(results[0], dict) else []
                                if cols:
                                    rows = [[r.get(c) for c in cols] for r in results]
                                else:
                                    rows = [list(r.values()) if isinstance(r, dict) else r for r in results]
                                batch_size = 100
                                for i in range(0, len(rows), batch_size):
                                    batch_rows = rows[i:i + batch_size]
                                    yield event_to_sse(RowBatchEvent(
                                        payload={"rows": batch_rows, "columns": cols or None, "batch_index": i // batch_size}
                                    ))
                                # Source meta chip (Perplexity pattern)
                                exec_steps = updates.get("steps") or []
                                if exec_steps and isinstance(exec_steps[0], dict):
                                    sd = exec_steps[0].get("data", {})
                                    sn = sd.get("source_name", "")
                                    if sn:
                                        yield event_to_sse(SourceMetaEvent(payload={
                                            "source_name": sn,
                                            "rows_count": sd.get("results_count", len(results)),
                                            "elapsed_ms": sd.get("elapsed_ms", 0),
                                        }))

                        elif node_name in ("generate_insights", "synthesizer"):
                            chart_val = updates.get("chart")
                            if chart_val:
                                yield event_to_sse(ChartSpecEvent(payload=chart_val))
                            # Stream followup_questions from synthesizer
                            fq_from_graph = updates.get("followup_questions")
                            if fq_from_graph and isinstance(fq_from_graph, list):
                                yield event_to_sse(FollowupQuestionsEvent(payload={"questions": fq_from_graph}, phase="insights"))

                    # Emit phase-done event with correct status
                    status_val = "error" if has_error else "done"
                    phase_label = _prefixed(node_name)
                    msg_val = f"Failed {phase_label}" if has_error else f"Finished {phase_label}"
                    phase_done = PhaseEvent(phase=phase, payload={"message": msg_val}, status=status_val)
                    yield event_to_sse(phase_done)
                    # Emit slot done/error event for subagent nodes
                    if node_name in ("sql_analyst", "web_researcher", "data_engineer", "report_writer", "office_writer"):
                        sub_slot_id, sub_slot_name, sub_slot_type = _slot_for(
                            node_name, agent_id, subgraph_name or _ctx.get("subgraph")
                        )
                        sub_done_evt = {
                            "type": "AGENT_SLOT_UPDATE",
                            "graph_id": sub_slot_id,
                            "graph_name": sub_slot_name,
                            "graph_type": sub_slot_type,
                            "status": status_val,
                            "payload": {},
                        }
                        yield f"data: {json.dumps(sub_done_evt, ensure_ascii=False)}\n\n"
                    _rlog.log("phase", node=phase_label, status=status_val)

        # NOTE: Clarifier giờ NON-BLOCKING (assumption engine) — không bao giờ dừng graph
        # để hỏi lại. followup_questions từ synthesizer là "câu hỏi gợi ý" và đã được
        # stream qua FollowupQuestionsEvent ở trên. KHÔNG emit clarification_needed nữa
        # (nhánh cũ bắn nhầm khi câu trả lời không sinh SQL → xoá trắng answer thật).

        # INSIGHTS PHASE IS NOW HANDLED BY THE SYNTHESIZER NODE IN THE GRAPH
        # The node emits answer_delta and chart_spec automatically.

        # --- Final event (new protocol) — FE stream exits after receiving this ---
        _ctx["node"] = None
        _ctx["subgraph"] = None

        # Stream completion / EOF flush: process any unclosed or leaked <task...> tag in _parser["buffer"] or all_messages
        eof_parsed_tc = None
        if _parser.get("buffer") and "<task" in _parser["buffer"]:
            eof_parsed_tc = parse_text_tool_call(_parser["buffer"])
            if eof_parsed_tc:
                logger.info("EOF flush: Leaked unclosed text tool call detected in buffer: %r", eof_parsed_tc)
                raw_tc_match = eof_parsed_tc["raw_match"]
                _parser["buffer"] = _parser["buffer"].replace(raw_tc_match, "").strip()

        if not eof_parsed_tc and (not state.get("generated_sql") or not state.get("answer")):
            for msg in reversed(all_messages):
                content = getattr(msg, "content", "")
                if isinstance(content, str) and ("<call:" in content or "<tool_call>" in content or "<task" in content):
                    eof_parsed_tc = parse_text_tool_call(content)
                    if eof_parsed_tc:
                        logger.info("EOF flush: Leaked text tool call detected in message: %r", eof_parsed_tc)
                        break

        if eof_parsed_tc and (not state.get("generated_sql") or not state.get("answer")):
            tc_subagent = eof_parsed_tc.get("subagent_type") or "sql_analyst"
            tc_args = eof_parsed_tc.get("args") or {}
            tc_desc = eof_parsed_tc.get("description") or tc_args.get("description") or question

            # Emit TaskCallEvent to SSE
            import uuid
            task_id = f"task_{uuid.uuid4().hex[:8]}"
            old_sub = _ctx.get("subgraph")
            _ctx["node"] = "generate_sql"
            _ctx["subgraph"] = tc_subagent
            yield event_to_sse(TaskCallEvent(
                payload={
                    "task_id": task_id,
                    "subagent_type": tc_subagent,
                    "description": tc_desc,
                    "tool": _prefixed(tc_subagent),
                    "args": {"subagent_type": tc_subagent, "description": tc_desc},
                },
                phase="exploring"
            ))

            # Execute subagent delegation to sql_analyst (quick_analysis_subgraph)
            from dbgpt_analyst.subgraphs.modes.quick_analysis_subgraph import quick_analysis_subgraph
            domain_state = {
                "question": tc_desc or question,
                "source_ids": state.get("source_ids", []),
                "anchor_table": state.get("anchor_table", ""),
                "allowed_tables": state.get("allowed_tables", []),
                "selected_tables": state.get("selected_tables", []),
                "schemas_text": state.get("schemas_text", ""),
                "map_qualified": state.get("map_qualified", {}),
                "db_type": state.get("db_type", "federated"),
                "generated_sql": None,
                "query_results": [],
                "error": None,
                "retry_count": 0,
                "answer": None,
                "chart": None,
            }
            try:
                sub_res = await quick_analysis_subgraph.ainvoke(domain_state)
                if sub_res.get("generated_sql"):
                    state["generated_sql"] = sub_res["generated_sql"]
                    yield event_to_sse(SQLValidatedEvent(payload={
                        "valid": True,
                        "detail": "SQL generated and validated",
                        "sql": sub_res["generated_sql"]
                    }))
                if sub_res.get("query_results"):
                    state["query_results"] = sub_res["query_results"]
                    results = sub_res["query_results"]
                    cols = list(results[0].keys()) if isinstance(results[0], dict) else []
                    rows = [[r.get(c) for c in cols] for r in results]
                    yield event_to_sse(RowBatchEvent(payload={"rows": rows, "columns": cols, "batch_index": 0}))
                if sub_res.get("chart"):
                    state["chart"] = sub_res["chart"]
                    yield event_to_sse(ChartSpecEvent(payload=sub_res["chart"]))
                if sub_res.get("answer"):
                    state["answer"] = sub_res["answer"]
                    yield event_to_sse(AnswerDeltaEvent(payload={"delta": sub_res["answer"]}))
            except Exception as ex:
                logger.error("EOF fallback quick_analysis_subgraph execution error: %s", ex)

            # Emit slot done event
            sub_slot_id, sub_slot_name, sub_slot_type = _slot_for(
                _ctx["node"], agent_id, tc_subagent
            )
            sub_done_evt = {
                "type": "AGENT_SLOT_UPDATE",
                "graph_id": sub_slot_id,
                "graph_name": sub_slot_name,
                "graph_type": sub_slot_type,
                "status": "done",
                "payload": {},
            }
            yield f"data: {json.dumps(sub_done_evt, ensure_ascii=False)}\n\n"
            _ctx["subgraph"] = old_sub

        # C4: flush any tool_call_chunks args still buffered when the stream
        # ends — otherwise a call's final <50ms of args never reaches the FE.
        for _tc_key, _tc_buf in _taskcall_pending.items():
            if not _tc_buf:
                continue
            _tc_name = _tool_call_name_by_key.get(_tc_key)
            if not _tc_name:
                continue
            _tc_is_delegate = _tc_name == "task" or str(_tc_name).startswith("delegate")
            _TcEvtClass = TaskCallEvent if _tc_is_delegate else ToolCallEvent
            yield event_to_sse(_TcEvtClass(
                payload={"tool": _prefixed(_tc_name), "args": _tc_buf},
                phase="exploring"
            ))
        _taskcall_pending.clear()

        # Fallback: if state["answer"] is empty, assemble full text from accumulated _ai_chunk_acc
        if not state.get("answer"):
            full_texts = []
            for msg_id, acc_msg in _ai_chunk_acc.items():
                c = getattr(acc_msg, "content", "")
                if c:
                    if isinstance(c, list):
                        c = "".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
                    full_texts.append(str(c))
            if full_texts:
                combined = "\n".join(full_texts).strip()
                if combined:
                    state["answer"] = combined

        # Clean answer text if it contains raw tool call tags
        if state.get("answer"):
            import re
            clean_ans = re.sub(r"<call:.*?>", "", str(state["answer"]), flags=re.DOTALL).strip()
            clean_ans = re.sub(r"<task\b[^>]*>.*?</task>", "", clean_ans, flags=re.DOTALL).strip()
            clean_ans = re.sub(r"<task\b.*$", "", clean_ans, flags=re.DOTALL).strip()
            clean_ans = re.sub(r"<tool_call>.*?</tool_call>", "", clean_ans, flags=re.DOTALL).strip()
            if clean_ans:
                state["answer"] = clean_ans

        final_event = FinalEvent(
            payload={
                "answer": state.get("answer", ""),
                "sql": state.get("generated_sql"),
                "chart": state.get("chart"),
                "query_results": state.get("query_results"),
                "selected_tables": state.get("selected_tables"),
                "plan_steps": state.get("plan_steps")
            }
        )
        yield event_to_sse(final_event)
        _rlog.end(total_iterations=state.get("retry_count", 0) + state.get("critic_retry_count", 0))

        # T1 Experience Distillation: fire-and-forget after FinalEvent (never blocks stream)
        _answer_text = state.get("answer") or ""
        _sql_used = state.get("generated_sql") or ""
        _selected = state.get("selected_tables") or []
        if _answer_text and _sql_used:
            import asyncio as _asyncio

            from dbgpt_analyst.memory import distill_and_store_experience as _distill
            _results_summary = _answer_text[:200]
            _asyncio.create_task(
                _distill(question, _sql_used, _results_summary, _selected)
            )

        # Also emit legacy final_result for backward compat
        final_payload = {
            "step": "final_result",
            "message": "Hoàn thành toàn bộ quy trình truy vấn.",
            "data": {
                "answer": state.get("answer"),
                "sql": state.get("generated_sql"),
                "query_results": state.get("query_results"),
                "chart": state.get("chart"),
                "selected_tables": state.get("selected_tables"),
            }
        }
        yield f"data: {json.dumps(final_payload, ensure_ascii=False, default=json_serial)}\n\n"

        # Save to Postgres
        ans_text = state.get("answer") or f"Đã sinh SQL: {state.get('generated_sql')}"
        sql_used = state.get("generated_sql") or ""
        chart_spec = json.dumps(state.get("chart"), ensure_ascii=False) if state.get("chart") else None

        qr = state.get("query_results")
        query_results_str = json.dumps(qr, ensure_ascii=False, default=json_serial) if qr else None
        if query_results_str and len(query_results_str) > 100000:
            query_results_str = json.dumps({"note": "Results too large to store in DB"})

        _save_to_postgres(ans_text, sql_used, chart_spec, query_results_str)

    # ── Outer wrapper: open each slot once, then stamp every chunk ──────
    try:
        async for chunk in _inner():
            slot_id, slot_name, slot_type = _slot_for(_ctx["node"], graph_id, _ctx.get("subgraph"))
            logger.info("SLOT_DEBUG: node=%r, subgraph=%r, slot_id=%r", _ctx.get("node"), _ctx.get("subgraph"), slot_id)
            if slot_id not in _opened:
                _opened.add(slot_id)
                slot_evt = {
                    "type": "AGENT_SLOT_UPDATE",
                    "graph_id": slot_id,
                    "graph_name": slot_name,
                    "graph_type": slot_type,
                    "status": "running",
                    "payload": {},
                }
                yield f"data: {json.dumps(slot_evt, ensure_ascii=False)}\n\n"
            yield _stamp_agent(chunk, slot_id, slot_name, _rlog_sid)

    except CircuitBreakerOpenException as cbe:
        logger.warning(f"Circuit Breaker Triggered: {cbe}")
        _rlog.log("error", node="stream", detail=str(cbe))
        _rlog.end(total_iterations=0)
        main_id, main_name, _ = _slot_for(None, graph_id)
        err_event = ErrorEvent(payload={"error": "Hệ thống đang quá tải do gọi AI quá nhiều. Xin vui lòng thử lại sau ít phút!"}, phase="stream")
        yield _stamp_agent(event_to_sse(err_event), main_id, main_name, _rlog_sid)
        err_step = {"step": "error", "message": "Hệ thống đang quá tải do gọi AI quá nhiều. Xin vui lòng thử lại sau ít phút!"}
        yield _stamp_agent(f"data: {json.dumps(err_step, ensure_ascii=False, default=json_serial)}\\n\\n", main_id, main_name, _rlog_sid)
        _save_to_postgres("Hệ thống đang quá tải (Circuit Breaker OPEN)")

    except Exception as e:
        logger.exception("Error streaming sql graph")
        _rlog.log("error", node="stream", detail=str(e))
        _rlog.end(total_iterations=0)
        # Error belongs to the main aggregator card.
        main_id, main_name, _ = _slot_for(None, graph_id)
        err_event = ErrorEvent(payload={"error": str(e)}, phase="stream")
        yield _stamp_agent(event_to_sse(err_event), main_id, main_name, _rlog_sid)
        # Legacy format too
        err_step = {"step": "error", "message": f"Hệ thống gặp sự cố: {e!s}"}
        yield _stamp_agent(
            f"data: {json.dumps(err_step, ensure_ascii=False, default=json_serial)}\n\n",
            main_id, main_name, _rlog_sid
        )

        # Save error message to DB so thread is not empty
        _save_to_postgres(f"Lỗi hệ thống: {e!s}")


async def stream_sql_agent(
    question: str | None = None,
    anchor_table: str | None = None,
    allowed_tables: list[str] | None = None,
    source_ids: list[int] | None = None,
    user_id: str = "dev_user",
    session_id: str | None = None,
    graph_id: str = "main",
    agent_id: str | None = None,
    force_query_type: str | None = None,
    model: str | None = None,
    request_data: dict[str, Any] | None = None,
    system_prompt: str | None = None,
    **kwargs: Any,
):
    """Backward-compatible adapter for stream_ai_analytic_agent.

    Accepts both standard parameters (question, anchor_table, etc.)
    and request_data dictionary or system_prompt parameters.
    """
    if request_data:
        question = question or request_data.get("question") or request_data.get("prompt") or ""
        anchor_table = anchor_table or request_data.get("anchor_table") or request_data.get("table_name") or ""
        if not allowed_tables:
            allowed_tables = request_data.get("allowed_tables")
            if not allowed_tables and anchor_table:
                allowed_tables = [anchor_table]
        user_id = user_id or request_data.get("user_id", "dev_user")
        session_id = session_id or request_data.get("session_id")
        source_ids = source_ids or request_data.get("source_ids")
        model = model or request_data.get("model")

    async for chunk in stream_ai_analytic_agent(
        question=question or "",
        anchor_table=anchor_table or "",
        allowed_tables=allowed_tables,
        source_ids=source_ids,
        user_id=user_id,
        session_id=session_id,
        graph_id=graph_id,
        agent_id=agent_id,
        force_query_type=force_query_type,
        model=model,
    ):
        yield chunk


