"""events/schemas_stream.py — SSE and XML stream parsing and serialization."""
from __future__ import annotations

import html
import json
import re
from typing import Annotated, Any
import xml.etree.ElementTree as ET

from pydantic import Field

from dbgpt_analyst.events.base import BaseEvent
from dbgpt_analyst.events.streaming_events import (
    AnswerDeltaEvent,
    ApprovalRequestEvent,
    ChartSpecEvent,
    ClarificationNeededEvent,
    ErrorEvent,
    FinalEvent,
    FollowupQuestionsEvent,
    IntentDetectedEvent,
    JoinPathEvent,
    MemoryRecalledEvent,
    MemoryStoredEvent,
    PhaseEvent,
    PlanEvent,
    PlanStepEvent,
    PolicyCheckedEvent,
    ReasoningEvent,
    ReflectionEvent,
    RowBatchEvent,
    SchemaEnrichedEvent,
    SourceMetaEvent,
    SQLDeltaEvent,
    SQLPlanDeltaEvent,
    SQLValidatedEvent,
    StatusEvent,
    SubagentEvent,
    TableConsideredEvent,
    TableSelectedEvent,
    TextPartEvent,
    ThinkingDeltaEvent,
    ThinkPartEvent,
    ToolCallEvent,
    ToolResultEvent,
    TurnEndEvent,
)
from dbgpt_analyst.events.task_events import (
    ClientEffectEvent,
    StructuredInputEvent,
    TaskCallEvent,
    WorkflowTaskEvent,
)

AgentStreamEvent = Annotated[
    PhaseEvent
    | ThinkingDeltaEvent
    | PlanEvent
    | PlanStepEvent
    | ToolCallEvent
    | TaskCallEvent
    | ToolResultEvent
    | TableConsideredEvent
    | TableSelectedEvent
    | JoinPathEvent
    | SQLDeltaEvent
    | SQLPlanDeltaEvent
    | SQLValidatedEvent
    | RowBatchEvent
    | ChartSpecEvent
    | ReflectionEvent
    | FinalEvent
    | ErrorEvent
    | AnswerDeltaEvent
    | ReasoningEvent
    | FollowupQuestionsEvent
    | MemoryRecalledEvent
    | MemoryStoredEvent
    | SchemaEnrichedEvent
    | IntentDetectedEvent
    | PolicyCheckedEvent
    | ClarificationNeededEvent
    | SourceMetaEvent
    | StructuredInputEvent
    | WorkflowTaskEvent
    | ClientEffectEvent
    | StatusEvent
    | ThinkPartEvent
    | TextPartEvent
    | SubagentEvent
    | ApprovalRequestEvent
    | TurnEndEvent,
    Field(discriminator="type"),
]


def event_to_sse(event: Any) -> str:
    """Serialize event to standard Server-Sent Event data line."""
    from dbgpt_analyst.core.helpers import json_serial

    if hasattr(event, "model_dump"):
        data = event.model_dump(exclude_none=True)
    elif isinstance(event, dict):
        data = event
    else:
        data = {"type": "unknown", "payload": str(event)}

    json_str = json.dumps(data, ensure_ascii=False, default=json_serial)
    return f"data: {json_str}\n\n"


def parse_sse_events(sse_stream_text: str) -> list[str]:
    events = []
    current_data_lines = []

    for line in sse_stream_text.split("\n"):
        if line.startswith("data:"):
            content = line[5:]
            if content.startswith(" "):
                content = content[1:]
            current_data_lines.append(content)
        elif line == "":
            if current_data_lines:
                events.append("\n".join(current_data_lines))
                current_data_lines = []

    if current_data_lines:
        events.append("\n".join(current_data_lines))

    return events


def xml_cdata(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)
    safe_text = text.replace("]]>", "]]]]><![CDATA[>")
    return f"<![CDATA[{safe_text}]]>"


def _is_valid_xml_tag(tag: str) -> bool:
    if not isinstance(tag, str) or not tag:
        return False
    return bool(re.match(r"^[a-zA-Z_][a-zA-Z0-9_\-\.]*$", tag)) and not tag.lower().startswith("xml")


def _make_safe_tag(key: str) -> tuple[str, str]:
    key_str = str(key)
    if _is_valid_xml_tag(key_str):
        return key_str, ""
    cleaned = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", key_str)
    if not cleaned or not re.match(r"^[a-zA-Z_]", cleaned):
        cleaned = f"_{cleaned}"
    escaped_key = html.escape(key_str, quote=True)
    return cleaned, f' orig_key="{escaped_key}"'


_CDATA_TAGS = {"delta", "text", "think", "html", "final_html", "content", "payload_str", "encrypted"}


def dict_to_xml(data: Any, root_tag: str = "chunk") -> str:
    def _to_xml(obj: Any, tag_name: str) -> str:
        tag, attr = _make_safe_tag(tag_name)
        if obj is None:
            return f"<{tag}{attr}></{tag}>"
        elif isinstance(obj, bool):
            val_str = "true" if obj else "false"
            return f"<{tag}{attr}>{val_str}</{tag}>"
        elif isinstance(obj, (int, float)):
            return f"<{tag}{attr}>{obj}</{tag}>"
        elif isinstance(obj, str):
            if tag_name in _CDATA_TAGS or any(c in obj for c in ("<", ">", "&", "\n", "\r", "\t")):
                cdata_content = xml_cdata(obj)
                return f"<{tag}{attr}>{cdata_content}</{tag}>"
            else:
                return f"<{tag}{attr}>{obj}</{tag}>"
        elif isinstance(obj, dict):
            inner_parts = []
            for k, v in obj.items():
                inner_parts.append(_to_xml(v, k))
            inner_content = "".join(inner_parts)
            return f"<{tag}{attr}>{inner_content}</{tag}>"
        elif isinstance(obj, (list, tuple)):
            inner_parts = []
            for item in obj:
                inner_parts.append(_to_xml(item, "item"))
            inner_content = "".join(inner_parts)
            return f"<{tag}{attr}>{inner_content}</{tag}>"
        else:
            obj_str = str(obj)
            if tag_name in _CDATA_TAGS or any(c in obj_str for c in ("<", ">", "&", "\n", "\r", "\t")):
                return f"<{tag}{attr}>{xml_cdata(obj_str)}</{tag}>"
            return f"<{tag}{attr}>{obj_str}</{tag}>"

    return _to_xml(data, root_tag)


def dict_to_xml_sse(data: dict, root_tag: str = "chunk") -> str:
    xml_str = dict_to_xml(data, root_tag=root_tag)
    lines = xml_str.split("\n")
    sse_lines = [f"data: {line}" for line in lines]
    return "\n".join(sse_lines) + "\n\n"


def event_to_xml_sse(event: Any, root_tag: str = "chunk") -> str:
    if hasattr(event, "model_dump"):
        data = event.model_dump(exclude_none=True)
    elif isinstance(event, dict):
        data = event
    else:
        data = {"type": "unknown", "payload": str(event)}
    return dict_to_xml_sse(data, root_tag=root_tag)


def xml_to_dict(xml_str: str) -> dict | Any:
    if "data:" in xml_str:
        events = parse_sse_events(xml_str)
        if events:
            xml_str = events[0]

    root = ET.fromstring(xml_str)

    def _node_to_val(node: ET.Element) -> Any:
        children = list(node)

        if children:
            res = {}
            is_list = len(children) > 0 and all(child.tag in ("item", "_item") for child in children)
            if is_list:
                return [_node_to_val(child) for child in children]
            for child in children:
                key = child.attrib.get("orig_key", child.tag)
                res[key] = _node_to_val(child)
            return res

        text = node.text or ""
        if text.lower() == "true":
            return True
        if text.lower() == "false":
            return False
        if text.lower() in ("null", "none"):
            return None
        if text.isdigit():
            return int(text)
        try:
            if "." in text:
                return float(text)
        except ValueError:
            pass
        return text

    val = _node_to_val(root)
    if isinstance(val, dict):
        return val
    res_key = root.attrib.get("orig_key", root.tag)
    return {res_key: val}


__all__ = [
    "_CDATA_TAGS",
    "AgentStreamEvent",
    "AnswerDeltaEvent",
    "ApprovalRequestEvent",
    "BaseEvent",
    "ChartSpecEvent",
    "ClarificationNeededEvent",
    "ClientEffectEvent",
    "ErrorEvent",
    "FinalEvent",
    "FollowupQuestionsEvent",
    "IntentDetectedEvent",
    "JoinPathEvent",
    "MemoryRecalledEvent",
    "MemoryStoredEvent",
    "PhaseEvent",
    "PlanEvent",
    "PlanStepEvent",
    "PolicyCheckedEvent",
    "ReasoningEvent",
    "ReflectionEvent",
    "RowBatchEvent",
    "SQLDeltaEvent",
    "SQLPlanDeltaEvent",
    "SQLValidatedEvent",
    "SchemaEnrichedEvent",
    "SourceMetaEvent",
    "StatusEvent",
    "StructuredInputEvent",
    "SubagentEvent",
    "TableConsideredEvent",
    "TableSelectedEvent",
    "TaskCallEvent",
    "TextPartEvent",
    "ThinkingDeltaEvent",
    "ThinkPartEvent",
    "ToolCallEvent",
    "ToolResultEvent",
    "TurnEndEvent",
    "WorkflowTaskEvent",
    "_is_valid_xml_tag",
    "_make_safe_tag",
    "dict_to_xml",
    "dict_to_xml_sse",
    "event_to_sse",
    "event_to_xml_sse",
    "parse_sse_events",
    "xml_cdata",
    "xml_to_dict",
]
