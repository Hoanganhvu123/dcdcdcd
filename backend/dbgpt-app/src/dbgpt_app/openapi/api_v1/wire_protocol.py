import json
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field

class TokenUsage(BaseModel):
    input_other: int = 0
    output: int = 0
    input_cache_read: int = 0
    input_cache_creation: int = 0

class MCPStatus(BaseModel):
    connected_servers: List[str] = Field(default_factory=list)
    active_tools: int = 0

class StatusPayload(BaseModel):
    session_id: str
    context_tokens: int = 0
    max_context_tokens: int = 0
    context_usage: float = 0.0
    token_usage: TokenUsage = Field(default_factory=TokenUsage)
    plan_mode: bool = False
    mcp_status: MCPStatus = Field(default_factory=MCPStatus)

class StatusUpdate(BaseModel):
    type: Literal["status"] = "status"
    payload: StatusPayload

class ThinkPartPayload(BaseModel):
    think: str
    encrypted: Optional[str] = None
    is_first_chunk: bool = False
    is_last_chunk: bool = False

class ThinkPart(BaseModel):
    type: Literal["think_part"] = "think_part"
    payload: ThinkPartPayload

class TextPartPayload(BaseModel):
    text: str

class TextPart(BaseModel):
    type: Literal["text_part"] = "text_part"
    payload: TextPartPayload

class ToolCallPayload(BaseModel):
    id: str
    name: str
    arguments_delta: Optional[str] = None
    arguments_full: Optional[str] = None
    subagent_type: Optional[str] = None

class ToolCall(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    payload: ToolCallPayload

class DisplayBlock(BaseModel):
    type: str
    title: str
    rows: Optional[int] = None
    # Add other display fields as needed

class ToolResultPayload(BaseModel):
    tool_call_id: str
    name: str
    return_value: Any
    is_error: bool = False
    display: Optional[List[DisplayBlock]] = None

class ToolResult(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    payload: ToolResultPayload

class DocumentBlockPayload(BaseModel):
    doc_id: str
    doc_type: Optional[str] = "document"
    title: str
    action: Optional[str] = "update"
    section_type: Optional[str] = None
    content_delta: str

class DocumentBlock(BaseModel):
    type: Literal["document_block"] = "document_block"
    payload: DocumentBlockPayload

class SpreadsheetBlockPayload(BaseModel):
    spreadsheet_id: str
    sheet_name: str
    title: Optional[str] = None
    action: Optional[str] = None
    headers: Optional[List[str]] = None
    rows_delta: Optional[List[List[Any]]] = None
    total_rows: Optional[int] = None
    formatting: Optional[Dict[str, Any]] = None

class SpreadsheetBlock(BaseModel):
    type: Literal["spreadsheet_block"] = "spreadsheet_block"
    payload: SpreadsheetBlockPayload

class SubagentEventPayload(BaseModel):
    parent_tool_call_id: str
    subagent_id: str
    subagent_type: str
    inner_event: Dict[str, Any] # Or WireMessageEnvelope if forward refs allow

class SubagentEvent(BaseModel):
    type: Literal["subagent_event"] = "subagent_event"
    payload: SubagentEventPayload

class ApprovalRequestPayload(BaseModel):
    id: Optional[str] = "approval_1"
    tool_call_id: Optional[str] = "tc_1"
    sender: Optional[str] = "agent"
    action: Optional[str] = "confirm"
    description: Optional[str] = "Requesting approval"
    requires_confirmation: bool = True

class ApprovalRequest(BaseModel):
    type: Literal["approval_request"] = "approval_request"
    payload: ApprovalRequestPayload

class TurnEndPayload(BaseModel):
    outcome: str
    total_tokens: int = 0
    duration_ms: int = 0
    message_id: Optional[str] = None

class TurnEnd(BaseModel):
    type: Literal["turn_end"] = "turn_end"
    payload: TurnEndPayload

# Aliases for event and payload names expected by tests and legacy consumers
StatusUpdatePayload = StatusPayload
StatusUpdateEvent = StatusUpdate
StatusEvent = StatusUpdate
ThinkPartEvent = ThinkPart
TextPartEvent = TextPart
DocumentBlockEvent = DocumentBlock
SpreadsheetBlockEvent = SpreadsheetBlock
ToolCallWireEvent = ToolCall
ToolCallEvent = ToolCall
ToolResultWireEvent = ToolResult
ToolResultEvent = ToolResult
ApprovalRequestEvent = ApprovalRequest
TurnEndEvent = TurnEnd

# The discriminated union for all wire messages
WireMessageEnvelope = Union[
    StatusUpdate,
    ThinkPart,
    TextPart,
    ToolCall,
    ToolResult,
    DocumentBlock,
    SpreadsheetBlock,
    SubagentEvent,
    ApprovalRequest,
    TurnEnd
]

def to_sse_str(envelope: Any) -> str:
    from dbgpt_analyst.events_schemas.schemas_stream import dict_to_xml_sse
    if isinstance(envelope, BaseModel):
        data = envelope.model_dump(exclude_none=True)
    elif isinstance(envelope, dict):
        data = envelope
    else:
        data = {"type": "unknown", "payload": str(envelope)}
    return dict_to_xml_sse(data)


def to_sse_bytes(envelope: BaseModel) -> bytes:
    # Use model_dump_json for Pydantic V2
    if isinstance(envelope, BaseModel):
        data = envelope.model_dump_json(exclude_none=True)
    else:
        data = to_sse_str(envelope)[6:].strip()
    return f"data: {data}\n\n".encode("utf-8")

def to_jsonrpc_frame(envelope: BaseModel) -> dict:
    if isinstance(envelope, BaseModel):
        params = envelope.model_dump(exclude_none=True)
    elif isinstance(envelope, dict):
        params = envelope
    else:
        params = {"payload": str(envelope)}
    return {
        "jsonrpc": "2.0",
        "method": "event",
        "params": params
    }
