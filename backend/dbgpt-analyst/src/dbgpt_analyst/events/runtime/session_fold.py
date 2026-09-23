"""OpenMAIC-Standard Durable Session State & Pure Event Log Folding.

Architecture principles from OpenMAIC & Dograh:
1. Pure Fold Event Log:
   "The rendered UI / session state is a pure function of the applied event prefix."
   foldEvent(prevState, event) -> newState (pure immutable transition).
2. Overlap & Reconnect Protection:
   Applying an event twice is a strict NO-OP:
   if event.id <= prev_state.last_event_id: return prev_state
   This guarantees that SSE reconnect with `Last-Event-ID` never double-appends.
3. Host Lifecycle Events:
   - `session_start`: opens run with user prompt & workerId; avoids double-painting opening message.
   - `session_resumed`: updates workerId and marks session as running.
   - `thinking_end`: finalizes active thought card and closes duration.
   - `tool_call` / `tool_result`: tracks execution status, outputs, and duration.
   - `sql_delta` / `sql_validated`: captures SQL generation and validation lifecycle.
   - `row_batch` / `chart_spec` / `artifact`: captures Data Analytics artifacts.
   - `user_question`: HITL decision envelope {question, options, multiSelect}, pauses in waiting_user.
4. Standardized Semantic XML Protocol:
   - `<thought id="..." seq="..." status="complete" tag="..." head="...">...</thought>`
   - `<tool id="..." name="..." seq="..." status="complete">...</tool>`
   - `<clause no="..." title="..." id="...">...</clause>`
   - `<contract id="..." title="..." type="...">...</contract>`
"""

from __future__ import annotations

import re
import time
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


SessionStatus = Literal[
    "connecting",
    "running",
    "waiting_user",
    "completed",
    "failed",
    "cancelled",
]


class SessionEvent(BaseModel):
    """Immutable event record in the session event log."""

    model_config = ConfigDict(frozen=True)

    id: int
    ts: float = Field(default_factory=time.time)
    type: str
    data: dict[str, Any] = Field(default_factory=dict)
    attempt: int = 1


class DurableSessionState(BaseModel):
    """Immutable folded view-model representing the complete durable session state."""

    model_config = ConfigDict(frozen=True)

    status: SessionStatus = "connecting"
    last_event_id: int = 0
    session_id: str = ""
    worker_id: str | None = None
    user_query: str | None = None
    chat_history: tuple[dict[str, Any], ...] = Field(default_factory=tuple)
    thoughts: tuple[dict[str, Any], ...] = Field(default_factory=tuple)
    active_thought: dict[str, Any] | None = None
    tools: tuple[dict[str, Any], ...] = Field(default_factory=tuple)
    sql_queries: tuple[dict[str, Any], ...] = Field(default_factory=tuple)
    data_tables: tuple[dict[str, Any], ...] = Field(default_factory=tuple)
    chart_specs: tuple[dict[str, Any], ...] = Field(default_factory=tuple)
    artifacts: tuple[dict[str, Any], ...] = Field(default_factory=tuple)
    clauses: tuple[tuple[str, dict[str, Any]], ...] = Field(default_factory=tuple)
    contract: dict[str, Any] | None = None
    hitl_question: dict[str, Any] | None = None
    xml_blocks: tuple[str, ...] = Field(default_factory=tuple)
    final_answer: str = ""
    error: str | None = None
    metadata: tuple[tuple[str, Any], ...] = Field(default_factory=tuple)

    def get_clauses_dict(self) -> dict[str, dict[str, Any]]:
        """Convenience dictionary view of clauses."""
        return dict(self.clauses)

    def get_metadata_dict(self) -> dict[str, Any]:
        """Convenience dictionary view of metadata."""
        return dict(self.metadata)

    def get_sql_queries(self) -> list[dict[str, Any]]:
        """Convenience list view of SQL queries."""
        return list(self.sql_queries)

    def get_data_tables(self) -> list[dict[str, Any]]:
        """Convenience list view of data tables."""
        return list(self.data_tables)

    def get_chart_specs(self) -> list[dict[str, Any]]:
        """Convenience list view of chart specifications."""
        return list(self.chart_specs)

    def get_artifacts(self) -> list[dict[str, Any]]:
        """Convenience list view of artifacts."""
        return list(self.artifacts)


# ─── XML Tag Protocol Helpers ────────────────────────────────────────────────

def format_thought_xml(
    thought_id: str,
    content: str,
    seq: int = 1,
    status: str = "complete",
    head: str = "",
    tag: str = "Suy nghĩ",
) -> str:
    """Format standardized semantic <thought> tag."""
    head_attr = f' head="{head}"' if head else ""
    return (
        f'<thought id="{thought_id}" seq="{seq}" status="{status}" tag="{tag}"{head_attr}>'
        f"{content}"
        f"</thought>"
    )


def format_tool_xml(
    tool_id: str,
    name: str,
    content: str,
    seq: int = 2,
    status: str = "complete",
    ms: str = "",
) -> str:
    """Format standardized semantic <tool> tag."""
    ms_attr = f' ms="{ms}"' if ms else ""
    return (
        f'<tool id="{tool_id}" name="{name}" seq="{seq}" status="{status}"{ms_attr}>'
        f"{content}"
        f"</tool>"
    )


def format_clause_xml(
    clause_no: int | str,
    title: str,
    content: str,
    clause_id: str | None = None,
    sub: str = "",
) -> str:
    """Format standardized semantic <clause> tag."""
    cid = clause_id or f"cl-{clause_no}"
    sub_attr = f' sub="{sub}"' if sub else ""
    return (
        f'<clause id="{cid}" no="{clause_no}" title="{title}"{sub_attr}>'
        f"{content}"
        f"</clause>"
    )


def format_contract_xml(
    contract_id: str,
    title: str,
    clauses: list[str] | str,
    contract_type: str = "legal-document",
) -> str:
    """Format standardized semantic <contract> tag."""
    inner = "\n".join(clauses) if isinstance(clauses, list) else clauses
    return (
        f'<contract id="{contract_id}" type="{contract_type}" title="{title}">\n'
        f"{inner}\n"
        f"</contract>"
    )


_XML_CARD_REGEX = re.compile(
    r"<(thought|tool|clause|contract)(?:\s+[^>]*)?>[\s\S]*?</\1>",
    re.IGNORECASE,
)


def extract_semantic_xml_blocks(text: str) -> list[str]:
    """Extract top-level semantic XML blocks: <thought>, <tool>, <clause>, <contract>."""
    return [m.group(0) for m in _XML_CARD_REGEX.finditer(text)]


def extract_semantic_tags(text: str) -> list[str]:
    """Extract semantic XML tag names found in the text."""
    return [m.group(1).lower() for m in _XML_CARD_REGEX.finditer(text)]


# ─── Pure Event Fold Reducer ────────────────────────────────────────────────

def fold_event(
    prev_state: DurableSessionState,
    event: SessionEvent,
) -> DurableSessionState:
    """Pure event fold function: prevState + event -> newState.

    Implements:
    1. Replay & Reconnect Idempotency:
       If event.id <= prev_state.last_event_id, the event has already been
       applied, so return prev_state unchanged.
    2. Lifecycle event handling:
       - session_start: initializes run, user prompt, and worker ID.
       - session_resumed: updates worker ID and marks session active.
       - user_message: adds user chat bubble without duplication.
       - thinking_start / thinking_delta / thinking_end: builds <thought> block.
       - tool_call / tool_result: builds <tool> block.
       - sql_delta / sql_validated: tracks SQL query state.
       - row_batch: tracks data tables.
       - chart_spec: tracks chart specs.
       - artifact / artifact_render: tracks generated artifacts.
       - clause_update: builds <clause> block.
       - contract_update: builds <contract> block.
       - user_question: sets waiting_user status and stores HITL envelope.
       - answer_delta: accumulates final answer text.
       - session_complete: sets completed status.
       - error: sets failed status.
    """
    # 1. Idempotency guard for Last-Event-ID resume
    if event.id <= prev_state.last_event_id:
        return prev_state

    new_last_id = event.id
    etype = event.type
    edata = event.data

    # State mutations are pure copies
    status = prev_state.status
    worker_id = prev_state.worker_id
    user_query = prev_state.user_query
    chat_history = list(prev_state.chat_history)
    thoughts = list(prev_state.thoughts)
    active_thought = dict(prev_state.active_thought) if prev_state.active_thought else None
    tools = list(prev_state.tools)
    sql_queries = list(prev_state.sql_queries)
    data_tables = list(prev_state.data_tables)
    chart_specs = list(prev_state.chart_specs)
    artifacts = list(prev_state.artifacts)
    clauses_dict = dict(prev_state.clauses)
    contract = dict(prev_state.contract) if prev_state.contract else None
    hitl_question = dict(prev_state.hitl_question) if prev_state.hitl_question else None
    xml_blocks = list(prev_state.xml_blocks)
    final_answer = prev_state.final_answer
    error = prev_state.error
    metadata_dict = dict(prev_state.metadata)

    if etype == "session_start":
        status = "running"
        prompt = edata.get("prompt") or edata.get("query", "")
        worker_id = edata.get("worker_id") or edata.get("workerId") or worker_id
        if prompt:
            user_query = prompt
            # Check if user_message already recorded this prompt
            already_recorded = any(
                m.get("kind") == "user" and m.get("text") == prompt
                for m in chat_history
            )
            if not already_recorded:
                chat_history.append({"kind": "user", "text": prompt, "ts": event.ts})

    elif etype == "session_resumed":
        status = "running"
        worker_id = edata.get("worker_id") or edata.get("workerId") or worker_id

    elif etype == "user_message":
        text = edata.get("text", "")
        # Check if identical prompt exists at head from session_start
        existing_idx = next(
            (i for i, m in enumerate(chat_history) if m.get("kind") == "user" and m.get("text") == text),
            None,
        )
        if existing_idx is not None:
            # Enrich existing record with any metadata
            chat_history[existing_idx] = {**chat_history[existing_idx], **edata, "kind": "user"}
        else:
            chat_history.append({"kind": "user", "text": text, "ts": event.ts, **edata})
        if not user_query and text:
            user_query = text

    elif etype == "thinking_start":
        thought_id = edata.get("id", f"th-{event.id}")
        head = edata.get("head", "")
        tag = edata.get("tag", "Suy nghĩ")
        seq = edata.get("seq", 1)
        active_thought = {
            "id": thought_id,
            "head": head,
            "tag": tag,
            "seq": seq,
            "content": edata.get("content", ""),
            "start_ts": event.ts,
            "status": "running",
        }

    elif etype == "thinking_delta":
        delta = edata.get("delta", "")
        if active_thought is not None:
            active_thought["content"] = active_thought.get("content", "") + delta
        else:
            active_thought = {
                "id": f"th-{event.id}",
                "head": "",
                "tag": "Suy nghĩ",
                "seq": 1,
                "content": delta,
                "start_ts": event.ts,
                "status": "running",
            }

    elif etype == "thinking_end":
        if active_thought is not None:
            active_thought["status"] = "complete"
            duration_ms = int((event.ts - active_thought.get("start_ts", event.ts)) * 1000)
            if duration_ms < 0:
                duration_ms = 0
            active_thought["duration_ms"] = duration_ms
            completed_thought = dict(active_thought)
            thoughts.append(completed_thought)

            # Generate semantic <thought> tag
            xml_tag = format_thought_xml(
                thought_id=completed_thought["id"],
                content=completed_thought["content"],
                seq=completed_thought.get("seq", 1),
                status="complete",
                head=completed_thought.get("head", ""),
                tag=completed_thought.get("tag", "Suy nghĩ"),
            )
            xml_blocks.append(xml_tag)
            chat_history.append({"kind": "thought", **completed_thought})
            active_thought = None

    elif etype == "tool_call":
        tool_id = edata.get("id") or edata.get("tool_call_id") or f"call-{event.id}"
        tool_name = edata.get("name", "")
        tool_args = edata.get("args") or edata.get("call") or ""
        seq = edata.get("seq", 2)
        tool_record = {
            "id": tool_id,
            "name": tool_name,
            "args": tool_args,
            "seq": seq,
            "status": "running",
            "start_ts": event.ts,
        }
        tools.append(tool_record)
        xml_tag = format_tool_xml(
            tool_id=tool_id,
            name=tool_name,
            content=str(tool_args),
            seq=seq,
            status="running",
        )
        xml_blocks.append(xml_tag)

    elif etype == "tool_result":
        tool_id = edata.get("id") or edata.get("tool_call_id")
        result = edata.get("result") or edata.get("out") or ""
        duration_ms = edata.get("duration_ms") or edata.get("ms") or "250ms"
        # Update matching tool record
        for idx, t in enumerate(tools):
            if t.get("id") == tool_id or (tool_id is None and t.get("status") == "running"):
                tools[idx] = {
                    **t,
                    "result": result,
                    "status": "complete",
                    "duration_ms": duration_ms,
                }
                xml_tag = format_tool_xml(
                    tool_id=tools[idx]["id"],
                    name=tools[idx]["name"],
                    content=str(result),
                    seq=tools[idx].get("seq", 2),
                    status="complete",
                    ms=str(duration_ms),
                )
                xml_blocks.append(xml_tag)
                break

    elif etype in ("sql_delta", "sql_plan_delta"):
        sql_text = edata.get("delta") or edata.get("sql") or edata.get("query", "")
        dialect = edata.get("dialect", "sqlite")
        sql_queries.append({
            "id": edata.get("id", f"sql-{event.id}"),
            "sql": sql_text,
            "dialect": dialect,
            "status": "generating",
            "ts": event.ts,
        })

    elif etype == "sql_validated":
        sql_id = edata.get("id")
        valid = edata.get("valid", True)
        for idx, q in enumerate(sql_queries):
            if q.get("id") == sql_id or sql_id is None:
                sql_queries[idx] = {**q, "valid": valid, "status": "validated"}
                break

    elif etype == "row_batch":
        data_tables.append({
            "id": edata.get("id", f"table-{event.id}"),
            "columns": edata.get("columns", []),
            "rows": edata.get("rows", []),
            "total_rows": edata.get("total_rows", 0),
            "ts": event.ts,
        })

    elif etype == "chart_spec":
        chart_specs.append({
            "id": edata.get("id", f"chart-{event.id}"),
            "chart_type": edata.get("chart_type") or edata.get("type", "bar"),
            "spec": edata.get("spec") or edata,
            "title": edata.get("title", ""),
            "ts": event.ts,
        })

    elif etype in ("artifact", "artifact_render", "artifact_ready"):
        artifacts.append({
            "id": edata.get("id") or edata.get("artifact_id", f"art-{event.id}"),
            "type": edata.get("type") or edata.get("artifact_type", "excel"),
            "title": edata.get("title", ""),
            "payload": edata.get("payload") or edata,
            "ts": event.ts,
        })

    elif etype == "clause_update":
        clause_no = edata.get("no", len(clauses_dict) + 1)
        title = edata.get("title", f"Điều {clause_no}")
        body = edata.get("body") or edata.get("content") or ""
        sub = edata.get("sub", "")
        cid = edata.get("id") or f"cl-{clause_no}"
        clauses_dict[str(clause_no)] = {
            "id": cid,
            "no": clause_no,
            "title": title,
            "content": body,
            "sub": sub,
            "status": "complete",
        }
        xml_tag = format_clause_xml(
            clause_no=clause_no,
            title=title,
            content=body,
            clause_id=cid,
            sub=sub,
        )
        xml_blocks.append(xml_tag)

    elif etype == "contract_update":
        contract_id = edata.get("id", "contract-1")
        title = edata.get("title", "Dự thảo hợp đồng")
        doc_type = edata.get("type", "legal-document")
        clauses_list = edata.get("clauses") or [
            format_clause_xml(v["no"], v["title"], v["content"], v["id"], v.get("sub", ""))
            for v in clauses_dict.values()
        ]
        contract = {
            "id": contract_id,
            "title": title,
            "type": doc_type,
            "clauses_count": len(clauses_list),
        }
        xml_tag = format_contract_xml(
            contract_id=contract_id,
            title=title,
            clauses=clauses_list,
            contract_type=doc_type,
        )
        xml_blocks.append(xml_tag)

    elif etype == "user_question":
        status = "waiting_user"
        hitl_question = {
            "question": edata.get("question", ""),
            "options": edata.get("options", []),
            "multiSelect": edata.get("multiSelect", False),
        }
        chat_history.append({"kind": "question", **hitl_question})

    elif etype == "answer_delta":
        final_answer += edata.get("delta", "")

    elif etype == "session_complete":
        status = "completed"

    elif etype == "error":
        status = "failed"
        error = edata.get("message") or edata.get("error") or "Unknown error"

    return DurableSessionState(
        status=status,
        last_event_id=new_last_id,
        session_id=prev_state.session_id,
        worker_id=worker_id,
        user_query=user_query,
        chat_history=tuple(chat_history),
        thoughts=tuple(thoughts),
        active_thought=active_thought,
        tools=tuple(tools),
        sql_queries=tuple(sql_queries),
        data_tables=tuple(data_tables),
        chart_specs=tuple(chart_specs),
        artifacts=tuple(artifacts),
        clauses=tuple(clauses_dict.items()),
        contract=contract,
        hitl_question=hitl_question,
        xml_blocks=tuple(xml_blocks),
        final_answer=final_answer,
        error=error,
        metadata=tuple(metadata_dict.items()),
    )


# Standard CamelCase aliases matching OpenMAIC and DISPATCH.md
foldEvent = fold_event


def fold_events(
    events: list[SessionEvent],
    initial: DurableSessionState | None = None,
) -> DurableSessionState:
    """Fold a list of events sequentially over an initial state."""
    state = initial if initial is not None else DurableSessionState()
    for ev in events:
        state = fold_event(state, ev)
    return state


foldEvents = fold_events


def resume_session(
    event_log: list[SessionEvent],
    last_event_id: int | None = None,
    initial: DurableSessionState | None = None,
) -> tuple[DurableSessionState, list[SessionEvent]]:
    """Resume session state from a durable event log with Last-Event-ID support.

    Returns:
    - folded_state: State folded up to the latest event in the log.
    - new_events: Only the events that occurred after `last_event_id`.
    """
    state = fold_events(event_log, initial)
    if last_event_id is None:
        new_events = list(event_log)
    else:
        new_events = [e for e in event_log if e.id > last_event_id]
    return state, new_events


__all__ = [
    "DurableSessionState",
    "SessionEvent",
    "SessionStatus",
    "extract_semantic_xml_blocks",
    "extract_semantic_tags",
    "foldEvent",
    "foldEvents",
    "fold_event",
    "fold_events",
    "format_clause_xml",
    "format_contract_xml",
    "format_thought_xml",
    "format_tool_xml",
    "resume_session",
]
