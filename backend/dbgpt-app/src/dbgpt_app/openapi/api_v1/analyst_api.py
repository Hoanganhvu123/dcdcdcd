from dbgpt_serve.utils.auth import UserRequest, get_user_from_headers
from fastapi import Depends
from datetime import UTC
from datetime import datetime as _datetime
import uuid as _uuid

from dbgpt_app.openapi.api_v1.analyst_schemas import *

import json
import logging

from fastapi import APIRouter, File, Form, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from dbgpt_app.openapi.api_v1.analyst_streamer import stream_ai_analytic_agent
class DummyLimiter:
    def limit(self, *args, **kwargs):
        return lambda f: f
limiter = DummyLimiter()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/analyst", tags=["ai_analytics"])





# ═══════════════════════════════════════════════════════════════════════════
# Table Parser Helpers & Request Models
# ═══════════════════════════════════════════════════════════════════════════

def _parse_html_table(html_content: str) -> tuple[list[str], list[list[Any]], str]:
    """Parse HTML <table> element into headers, row tuples, and optional title."""
    if not html_content or not isinstance(html_content, str):
        return [], [], ""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_content, "html.parser")
        table = soup.find("table")
        if not table:
            return [], [], ""

        title = ""
        caption = table.find("caption")
        if caption:
            title = caption.get_text(strip=True)

        headers = []
        rows = []

        thead = table.find("thead")
        if thead:
            th_list = thead.find_all("th") or thead.find_all("td")
            headers = [th.get_text(strip=True) for th in th_list]

        trs = table.find_all("tr")
        for tr in trs:
            ths = tr.find_all("th")
            tds = tr.find_all("td")

            if ths and not headers:
                headers = [th.get_text(strip=True) for th in ths]
                continue

            if thead and tr.parent == thead:
                continue

            if tds:
                rows.append([td.get_text(strip=True) for td in tds])
            elif ths and headers and [th.get_text(strip=True) for th in ths] == headers:
                continue
            elif ths:
                rows.append([th.get_text(strip=True) for th in ths])

        if not headers and len(rows) > 1:
            headers = [str(x) for x in rows[0]]
            rows = rows[1:]

        return headers, rows, title
    except Exception as exc:
        logger.warning("Failed to parse HTML table: %s", exc)
        return [], [], ""


def _parse_markdown_table(md_content: str) -> tuple[list[str], list[list[Any]]]:
    """Parse Markdown table (lines starting with |) into headers and rows."""
    if not md_content or not isinstance(md_content, str):
        return [], []
    try:
        lines = [line.strip() for line in md_content.splitlines() if line.strip()]
        table_lines = [line for line in lines if line.startswith("|")]
        if not table_lines:
            return [], []

        headers = []
        rows = []
        for line in table_lines:
            parts = [p.strip() for p in line.split("|")]
            if parts and parts[0] == "":
                parts.pop(0)
            if parts and parts[-1] == "":
                parts.pop()

            if not parts:
                continue

            if all(set(p).issubset({"-", ":", " "}) for p in parts if p):
                continue

            if not headers:
                headers = parts
            else:
                rows.append(parts)

        return headers, rows
    except Exception as exc:
        logger.warning("Failed to parse markdown table: %s", exc)
        return [], []


class ExportExcelRequest(BaseModel):
    """Request body for /export-excel endpoint."""
    model_config = ConfigDict(populate_by_name=True)

    columns: list[str] = Field(default_factory=list)
    headers: list[str] = Field(default_factory=list)
    rows: list[Any] = Field(default_factory=list)
    data: list[Any] = Field(default_factory=list)
    sheet_name: str = "Sheet1"
    title: str = ""
    filename: str | None = None
    formatting: dict[str, Any] = Field(default_factory=dict)
    html_content: str | None = Field(default=None, alias="htmlContent")
    streaming_markdown: str | None = Field(default=None, alias="streamingMarkdown")
    document_id: str | int | None = Field(default=None, alias="documentId")


class ReportGenerateRequest(BaseModel):
    """Request body for /generate-report endpoint."""
    question: str = ""
    query: str = ""            # alias for question (legacy compat)
    conversation_id: str = ""
    template_slug: str = ""
    model: str = ""
    model_name: str = ""       # alias for model (legacy compat)
    document_id: str | None = None
    report_id: str | None = None       # legacy alias
    parent_report_id: str | None = None  # legacy alias
    tables: list[str] | None = None
    scope: dict | None = None
    source_ids: list[int] | None = None


# ═══════════════════════════════════════════════════════════════════════════
# Excel Export Endpoint
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/export-excel")
@router.post("/v3/export-excel")
@limiter.limit("30/minute")
async def export_excel(req: ExportExcelRequest, request: Request):
    """Generate and export a styled Excel (.xlsx) file from spreadsheet JSON data."""
    import io
    import re
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    import pandas as pd

    def _sanitize_val(val: Any) -> Any:
        if isinstance(val, str):
            # Strip ASCII control characters (0x00 - 0x1F except \n, \r, \t)
            return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", val)
        return val

    try:
        cols = list(req.columns or req.headers)
        raw_rows = req.rows or req.data
        sheet_name = req.sheet_name or "Sheet1"
        title = req.title.strip() if req.title else ""
        filename = req.filename or "export"

        # HTML & Markdown Table Fallback: if raw_rows is empty, inspect html_content / streaming_markdown
        if not raw_rows:
            if req.html_content:
                parsed_cols, parsed_rows, parsed_title = _parse_html_table(req.html_content)
                if parsed_cols or parsed_rows:
                    cols = cols or parsed_cols
                    raw_rows = parsed_rows
                    if not title and parsed_title:
                        title = parsed_title

            if not raw_rows and req.streaming_markdown:
                parsed_cols, parsed_rows = _parse_markdown_table(req.streaming_markdown)
                if parsed_cols or parsed_rows:
                    cols = cols or parsed_cols
                    raw_rows = parsed_rows

        # Sheet name sanitization: forbidden chars [/*?:[\]\\]
        sheet_name = re.sub(r"[/*?:\[\]\\]", "_", str(sheet_name)).strip()[:31]
        if not sheet_name:
            sheet_name = "Sheet1"

        # Filename sanitization: strip CRLF (\r, \n), quotes, and backslashes
        filename = re.sub(r'[\r\n"\'\\]', "", str(filename)).strip()
        if not filename:
            filename = "export"
        if filename.endswith(".xlsx"):
            filename = filename[:-5]

        # Row Shape Normalization & Control Character Sanitization
        if isinstance(raw_rows, list):
            norm_rows = []
            for r in raw_rows:
                if isinstance(r, dict):
                    norm_r = {k: _sanitize_val(v) for k, v in r.items()}
                    norm_rows.append(norm_r)
                elif isinstance(r, (list, tuple)):
                    norm_r = [_sanitize_val(v) for v in r]
                    if cols and len(norm_r) < len(cols):
                        norm_r.extend([None] * (len(cols) - len(norm_r)))
                    norm_rows.append(norm_r)
                else:
                    norm_r = [_sanitize_val(r)]
                    if cols and len(norm_r) < len(cols):
                        norm_r.extend([None] * (len(cols) - len(norm_r)))
                    norm_rows.append(norm_r)
            raw_rows = norm_rows

        # Build DataFrame
        if isinstance(raw_rows, list) and len(raw_rows) > 0 and isinstance(raw_rows[0], dict):
            df = pd.DataFrame(raw_rows)
            if cols:
                existing_cols = [c for c in cols if c in df.columns]
                if existing_cols:
                    df = df[existing_cols]
        elif cols:
            df = pd.DataFrame(raw_rows, columns=cols)
        else:
            df = pd.DataFrame(raw_rows)

        # Sanitize DataFrame column names
        df.columns = [_sanitize_val(c) for c in df.columns]

        buf = io.BytesIO()
        start_row = 2 if title else 0

        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name=sheet_name, index=False, startrow=start_row)
            ws = writer.sheets[sheet_name]

            # Enable gridlines explicitly
            ws.sheet_view.showGridLines = True

            num_cols = len(df.columns) if len(df.columns) > 0 else 1

            # Title styling
            if title:
                cell_title = ws.cell(row=1, column=1, value=_sanitize_val(title))
                cell_title.font = Font(name="Calibri", size=14, bold=True, color="1F4E78")
                cell_title.alignment = Alignment(horizontal="left", vertical="center")
                if num_cols > 1:
                    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=num_cols)

            header_row_idx = start_row + 1
            header_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
            header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
            header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
            thin_border = Border(
                left=Side(style="thin", color="D9D9D9"),
                right=Side(style="thin", color="D9D9D9"),
                top=Side(style="thin", color="D9D9D9"),
                bottom=Side(style="thin", color="D9D9D9"),
            )

            # Style header cells
            for col_idx in range(1, len(df.columns) + 1):
                cell = ws.cell(row=header_row_idx, column=col_idx)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = header_align
                cell.border = thin_border

            # Style data cells & Formula Escaping
            data_font = Font(name="Calibri", size=11)
            data_align = Alignment(vertical="center")
            start_data_row = header_row_idx + 1
            end_data_row = header_row_idx + len(df)

            for r in range(start_data_row, end_data_row + 1):
                for c in range(1, len(df.columns) + 1):
                    cell = ws.cell(row=r, column=c)
                    cell.font = data_font
                    cell.alignment = data_align
                    cell.border = thin_border

                    # Formula Escaping: if cell string starts with =, +, -, @ mark as string ('s')
                    if isinstance(cell.value, str) and cell.value.startswith(("=", "+", "-", "@")):
                        cell.data_type = "s"

            # Auto-adjust column widths
            for col in ws.columns:
                col_letter = get_column_letter(col[0].column)
                max_len = 0
                for cell in col:
                    if cell.row == 1 and title and num_cols > 1:
                        continue
                    val_str = str(cell.value) if cell.value is not None else ""
                    if val_str:
                        max_len = max(max_len, len(val_str))
                ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        buf.seek(0)
        xlsx_bytes = buf.getvalue()

        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}.xlsx"'},
        )
    except Exception as e:
        logger.exception("Excel export error: %s", e)
        return JSONResponse(status_code=400, content={"detail": f"Excel export failed: {e!s}"})


# ═══════════════════════════════════════════════════════════════════════════
# 🌟 Report Generation — Senior Dev Pipeline (A4 Full Report)
# Replaces the old /api/reports/generate flow that lived in ai_research.
# Now routes through ai_data_analytic_agent's own report subgraph.
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/generate-report")
@limiter.limit("10/minute")
async def generate_report(body: ReportGenerateRequest, request: Request):
    """Stream a full A4 data-grounded report via SSE.

    This endpoint replaces the legacy /api/reports/generate from ai_research.
    The pipeline lives inside ai_data_analytic_agent/subgraphs/report/pipeline.py.
    """
    import uuid

    user_id = user_token.user_id if user_token else "dev_user"

    # Normalize legacy field names
    query = body.question or body.query
    model_name = body.model or body.model_name
    document_id = body.document_id or (str(body.report_id) if body.report_id else None) or (str(body.parent_report_id) if body.parent_report_id else None)
    conversation_id = body.conversation_id or str(uuid.uuid4())

    # Build scope from tables if provided
    scope = body.scope
    if body.tables and not scope:
        scope = {"tables": body.tables}
    elif body.tables and isinstance(scope, dict) and not scope.get("tables"):
        scope["tables"] = body.tables

    # Create document if needed (best-effort, same as old flow)
    if not document_id:
        try:
            from dbgpt_analyst.database.repositories import DocumentRepo
            repo = DocumentRepo()
            document_id = str(uuid.uuid4())
            await repo.create(
                document_id=document_id,
                title=query[:100] if query else "Báo cáo mới",
                thread_id=conversation_id,
            )
            logger.info("📄 Created new document %s for report", document_id)
        except Exception as e:
            logger.warning("Could not pre-create document: %s", e)

    async def stream():
        try:
            from dbgpt_analyst.subgraphs.report.pipeline import stream_report
            async for chunk in stream_report(
                query=query,
                scope=scope,
                document_id=document_id,
                conversation_id=conversation_id,
                model_name=model_name,
                user_id=user_id,
            ):
                yield chunk
            logger.info("✅ Report pipeline finished | conversation_id=%s", conversation_id)
        except Exception as e:
            logger.exception("❌ Report pipeline crashed: %s", e)
            import json as _json
            yield f"data: {_json.dumps({'type': 'error', 'message': f'Lỗi tạo báo cáo: {e}'}, ensure_ascii=False)}\n\n"
            yield f"data: {_json.dumps({'type': 'done', 'conversation_id': conversation_id}, ensure_ascii=False)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

# ═══════════════════════════════════════════════════════════════════════════
# SSE Streaming Endpoint (existing)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/stream")
@limiter.limit("20/minute")
async def sql_stream(
    req: SQLStreamRequest,
    request: Request,
    user_token: UserRequest = Depends(get_user_from_headers),
):
    """Stream deep SQL agent events as SSE."""
    user_id = user_token.user_id if user_token else "dev_user"

    async def generate():
        try:
            async for chunk in stream_ai_analytic_agent(
                question=req.question,
                anchor_table=req.anchor_table,
                allowed_tables=req.allowed_tables,
                source_ids=req.source_ids,
                user_id=user_id,
                session_id=req.session_id,
                model=req.model,
            ):
                yield chunk
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Error in sql_stream")
            yield f'data: {{"type":"error","payload":{{"error":"{e!s}"}}}}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

_PHASE_TYPE_REMAP = {"phase_start": "running", "phase_done": "done"}

def inject_agent_id(chunk: str, agent_id: str, agent_name: str) -> str:
    if not chunk.startswith("data: "):
        return chunk
    data_str = chunk[6:].strip()
    if data_str == "[DONE]":
        return chunk
    try:
        data = json.loads(data_str)
        # Fill-if-missing: preserve per-sub-agent ids the graph already stamped
        # (deep-research fan-out). Only un-tagged chunks (e.g. the clean agent,
        # which does not self-tag) fall back to this slot's base id.
        data.setdefault("agent_id", agent_id)
        data.setdefault("agent_name", agent_name)
        if not data.get("agent_id"):
            data["agent_id"] = agent_id
        if not data.get("agent_name"):
            data["agent_name"] = agent_name
        # Normalize legacy phase_start / phase_done → "phase" with status
        if data.get("type") in _PHASE_TYPE_REMAP:
            data["status"] = _PHASE_TYPE_REMAP[data["type"]]
            data["type"] = "phase"
        return f"data: {json.dumps(data)}\n\n"
    except Exception:
        return chunk


@router.post("/chat")
@limiter.limit("20/minute")
async def multi_agent_stream(
    request: Request,
    user_token: UserRequest = Depends(get_user_from_headers),
    question: str = Form(""),
    file: UploadFile | None = File(None),
    anchor_table: str = Form(""),
    allowed_tables: str = Form("[]"),
    source_ids: str = Form("[]"),
    session_id: str = Form(None),
    mode: str = Form(""),
    model: str = Form(None),
):
    """Multi-agent orchestrator: asyncio queue pattern with dynamic agent invoke."""
    import asyncio

    user_id = user_token.user_id if user_token else "dev_user"
    sid = session_id or "default"

    # An explicit mode from the caller pins routing; anything unrecognised (including
    # the empty default) lets the orchestrator LLM pick. "deep_research" maps to the
    # hybrid fan-out (data_engineer ∥ web_researcher → merge → synthesizer); the rest
    # pin a single subagent via _FORCED_SUBAGENT in analyst_streamer.
    force_query_type = {
        "deep_research": "hybrid",
        "office": "office",
        "report": "report",
        "web": "web",
    }.get(mode)

    try:
        allowed_tables_list = json.loads(allowed_tables)
    except Exception:
        allowed_tables_list = []
    try:
        source_ids_list = json.loads(source_ids)
    except Exception:
        source_ids_list = []

    has_file = file is not None
    has_question = bool(question.strip())
    file_bytes = await file.read() if has_file else None
    file_name = (file.filename or "upload.xlsx") if has_file else ""

    if has_file and file_bytes:
        try:
            import hashlib
            file_hash = hashlib.sha256(file_bytes).hexdigest()
            from dbgpt_analyst.common.workspace_manager import WorkspaceManager
            
            cached_meta = WorkspaceManager.find_file_by_hash(sid, file_hash)
            if cached_meta:
                logger.info("File %s exactly matches cached file %s in session %s", file_name, cached_meta["name"], sid)
                file_name = cached_meta["name"]
                request.state.skip_clean = True
            else:
                request.state.skip_clean = False
                await WorkspaceManager.save_artifact(
                    session_id=sid,
                    filename=file_name,
                    content=file_bytes,
                    file_type="original",
                    file_hash=file_hash,
                )
                logger.info("Saved uploaded file %s to workspace %s", file_name, sid)
        except Exception as err:
            logger.warning("Failed to save uploaded file to workspace: %s", err)
            request.state.skip_clean = False
    else:
        request.state.skip_clean = False

    def _slot(agent_id: str, agent_name: str, agent_type: str) -> str:
        ev: dict[str, object] = {"type": "AGENT_SLOT_UPDATE", "agent_id": agent_id,
              "agent_name": agent_name, "agent_type": agent_type, "payload": {}}
        return f"data: {json.dumps(ev)}\n\n"

    async def generate():
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        pending = 0

        # ── Agent runner coroutines ────────────────────────────────────────

        async def run_sql(agent_id: str, agent_name: str) -> None:
            from dbgpt_app.openapi.api_v1.analyst_streamer import stream_ai_analytic_agent
            try:
                async for chunk in stream_ai_analytic_agent(
                    question=question, anchor_table=anchor_table,
                    allowed_tables=allowed_tables_list, source_ids=source_ids_list,
                    user_id=user_id, session_id=sid, agent_id=agent_id,
                    force_query_type=force_query_type, model=model
                ):
                    await queue.put(inject_agent_id(chunk, agent_id, agent_name))
            except Exception as exc:
                err = {"type": "error", "agent_id": agent_id, "payload": {"error": str(exc)}}
                await queue.put(f"data: {json.dumps(err)}\n\n")
            finally:
                await queue.put(None)

        async def run_clean_pipeline(clean_id: str, clean_name: str) -> None:
            """Clean agent → on finish, dynamically invoke SQL if question present."""
            from dbgpt_analyst.ai_data_clean_agent.agent import stream_data_clean_agent
            from dbgpt_analyst.ai_data_clean_agent.reviewer import run_background_review

            final_answer = ""
            assert file_bytes is not None  # guaranteed: only called when has_file
            try:
                async for chunk in stream_data_clean_agent(
                    file_name=file_name, file_bytes=file_bytes,
                    source_id=source_ids_list[0] if source_ids_list else None,
                    user_message=question, session_id=sid,
                ):
                    if '"type": "final"' in chunk or '"type":"final"' in chunk:
                        try:
                            cdata = json.loads(chunk[6:].strip())
                            final_answer = cdata.get("payload", {}).get("answer", "")
                        except Exception:
                            pass
                    await queue.put(inject_agent_id(chunk, clean_id, clean_name))

                if question and final_answer:
                    from dbgpt_analyst.common.queue import enqueue_background_task
                    await enqueue_background_task("run_background_review", question, final_answer, sid)

                # Dynamic invoke: streamer creates its own coordinator/sql slots internally
                if has_question:
                    sql_id = f"sql_{sid}"
                    from dbgpt_app.openapi.api_v1.analyst_streamer import stream_ai_analytic_agent
                    async for chunk in stream_ai_analytic_agent(
                        question=question, anchor_table=anchor_table,
                        allowed_tables=allowed_tables_list, source_ids=source_ids_list,
                        user_id=user_id, session_id=sid, agent_id=sql_id,
                        force_query_type=force_query_type,
                    ):
                        await queue.put(inject_agent_id(chunk, sql_id, "SQL Agent"))

            except Exception as exc:
                err = {"type": "error", "agent_id": clean_id, "payload": {"error": str(exc)}}
                await queue.put(f"data: {json.dumps(err)}\n\n")
            finally:
                await queue.put(None)

        # ── Dispatch ──────────────────────────────────────────────────────

        try:
            yield ": ping\n\n"
            
            reply_param = request.query_params.get("reply", "").lower() == "true"
            # Also check if form parameters contain reply=true
            reply_mock = reply_param or (request.headers.get("x-reply-mock", "").lower() == "true")
            if not reply_mock:
                try:
                    form_data = await request.form()
                    if form_data.get("reply", "").lower() == "true":
                        reply_mock = True
                except Exception:
                    pass

            if reply_mock:
                mock_id = f"mock_{sid}"
                yield _slot(mock_id, "Claude Reasoning Agent", "reasoning")
                await asyncio.sleep(0.5)
                
                # Yield thinking slot update & reasoning steps
                yield f"data: {json.dumps({'type': 'AGENT_SLOT_UPDATE', 'agent_id': mock_id, 'agent_name': 'Claude Reasoning Agent', 'agent_type': 'reasoning', 'payload': {'status': 'thinking', 'thinking': 'Đang suy luận: Phân tích chỉ số tài chính và xây dựng dàn bài tài liệu...'}})}\n\n"
                await asyncio.sleep(1.0)
                
                yield f"data: {json.dumps({'type': 'message', 'agent_id': mock_id, 'payload': {'message': '[Thinking Process] Đang suy luận quy trình tạo tài liệu chuẩn Claude.'}})}\n\n"
                await asyncio.sleep(1.0)
                
                thinking_text = '1. Kiểm tra bảng dữ liệu và xác định các cột chính: Doanh thu, Chi phí, Lợi nhuận.\\n2. Phân tích xu hướng tăng trưởng theo từng quý.\\n3. Khởi tạo cấu trúc báo cáo A4 / Bảng tính.'
                yield f'data: {json.dumps({"type": "thinking_delta", "agent_id": mock_id, "payload": {"text": thinking_text}})}\n\n'
                await asyncio.sleep(1.2)
                
                yield f"data: {json.dumps({'type': 'message', 'agent_id': mock_id, 'payload': {'message': 'Hoàn tất bước phân tích dữ liệu. Bắt đầu tổng hợp và sinh kết quả.'}})}\n\n"
                await asyncio.sleep(1.0)
                
                yield f"data: {json.dumps({'type': 'AGENT_SLOT_UPDATE', 'agent_id': mock_id, 'agent_name': 'Claude Reasoning Agent', 'agent_type': 'reasoning', 'payload': {'status': 'done'}})}\n\n"
                await asyncio.sleep(0.5)
                yield "data: [DONE]\n\n"
                return

            if has_file:
                skip_clean = getattr(request.state, "skip_clean", False)
                if skip_clean:
                    clean_id = f"clean_{sid}"
                    yield _slot(clean_id, "Data Clean Agent", "clean")
                    yield f"data: {json.dumps({'type': 'AGENT_SLOT_UPDATE', 'agent_id': clean_id, 'agent_name': 'Data Clean Agent', 'agent_type': 'clean', 'payload': {'status': 'thinking'}})}\n\n"
                    await asyncio.sleep(0.5)
                    yield f"data: {json.dumps({'type': 'message', 'agent_id': clean_id, 'payload': {'message': f'⚡ File `{file_name}` đã được phân tích trước đó. Đang tải lại kết quả từ bộ nhớ (Cached)...'}})}\n\n"
                    await asyncio.sleep(0.5)
                    yield f"data: {json.dumps({'type': 'AGENT_SLOT_UPDATE', 'agent_id': clean_id, 'agent_name': 'Data Clean Agent', 'agent_type': 'clean', 'payload': {'status': 'done'}})}\n\n"
                    
                    if has_question:
                        sql_id = f"sql_{sid}"
                        pending = 1
                        asyncio.create_task(run_sql(sql_id, "SQL Agent"))
                else:
                    clean_id = f"clean_{sid}"
                    yield _slot(clean_id, "Data Clean Agent", "clean")
                    pending = 1
                    asyncio.create_task(run_clean_pipeline(clean_id, "Data Clean Agent"))
            else:
                # Streamer creates coordinator/sql-analyst slots internally — no outer slot needed
                sql_id = f"sql_{sid}"
                pending = 1
                asyncio.create_task(run_sql(sql_id, "SQL Agent"))

            while pending > 0:
                item = await queue.get()
                if item is None:
                    pending -= 1
                else:
                    yield item

            yield "data: [DONE]\n\n"

        except Exception as exc:
            logger.exception("Error in multi_agent_stream generate()")
            yield f"data: {json.dumps({'type': 'error', 'payload': {'error': str(exc)}})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations/{id}")
async def replay_session_stream(id: str):
    session_id = id
    """GET /api/ai_analytic/v3/replay/{session_id} - SSE endpoint streaming historical wire events."""
    from dbgpt_app.openapi.api_v1.wire_store import replay_events

    async def stream():
        async for chunk in replay_events(session_id):
            yield chunk
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/v3/ws/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: str):
    """WEBSOCKET /api/ai_analytic/v3/ws/{session_id} - Bi-directional WebSocket endpoint handling stream, replay, and approvals."""
    await websocket.accept()
    from dbgpt_app.openapi.api_v1.wire_store import replay_events
    try:
        # Initial replay
        async for sse_str in replay_events(session_id):
            await websocket.send_text(sse_str)

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action")
                if action == "ping":
                    await websocket.send_json({"type": "pong"})
                elif action == "approval_response":
                    logger.info("Received approval response for session %s: %r", session_id, msg)
                    await websocket.send_json({
                        "type": "status",
                        "payload": {"session_id": session_id, "status": "approval_received"}
                    })
            except Exception as ex:
                logger.warning("Error handling WS message: %s", ex)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected for session %s", session_id)
    except Exception as e:
        logger.error("WebSocket error: %s", e)


class GenerateDashboardRequest(BaseModel):
    question: str
    name: str | None = None


@router.post("/generate-dashboard")
@limiter.limit("6/minute")
async def generate_dashboard(req: GenerateDashboardRequest, request: Request):
    """D1 Generative BI — 1 câu hỏi → CẢ dashboard nhiều biểu đồ (SSE).

    Stream: status → planned(titles) → chart_start/chart_done/chart_failed mỗi
    biểu đồ → dashboard_created(dashboard_id). Tái dùng SQL pipeline + grid sẵn.
    """
    from dbgpt_analyst.domains.presentation.dashboard_gen import stream_generate_dashboard

    user_id = getattr(request.state, "user_id", None)

    async def generate():
        try:
            async for chunk in stream_generate_dashboard(
                question=req.question,
                dashboard_name=req.name,
                user_id=user_id,
            ):
                yield chunk
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Error in generate_dashboard")
            yield f'data: {{"type":"error","message":"{e!s}"}}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/recommend")
@limiter.limit("20/minute")
async def get_recommended_questions(request: Request):
    """Lấy 3 câu hỏi gợi ý cho người dùng dựa trên schema."""
    from dbgpt_analyst.memory import get_all_descriptions
    from dbgpt_analyst.domains.analysis.recommend import generate_recommended_questions

    # Lấy metadata schema làm context
    schemas = get_all_descriptions()
    schema_context = json.dumps(schemas, ensure_ascii=False)[:3000] if schemas else "No schema available"

    try:
        questions = await generate_recommended_questions(schema_context)
        return {"ok": True, "questions": questions}
    except Exception as e:
        logger.error(f"Error generating recommended questions: {e}")
        return {"ok": False, "questions": ["Tổng doanh thu là bao nhiêu?", "Sản phẩm nào bán chạy nhất?", "Có bao nhiêu khách hàng mới?"]}

@router.post("/execute")
@limiter.limit("60/minute")
def sql_execute(req: SqlExecuteRequest, request: Request):
    """Execute SQL directly and return results."""
    from dbgpt_analyst.domains.analysis.policy import validate_sql_policy
    from dbgpt_analyst.libs.bi.connections import get_db_connection
    try:
        policy_result = validate_sql_policy(req.sql, known_tables=set())
        if not policy_result["valid"]:
            return {"ok": False, "error": f"SQL Policy violation: {'; '.join(policy_result['issues'])}"}

        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(req.sql)
            columns = [desc[0] for desc in cur.description] if cur.description else []
            rows = cur.fetchall()
            from decimal import Decimal
            data = []
            for row in rows:
                row_dict = dict(zip(columns, row))
                safe_row = {
                    k: float(v) if isinstance(v, Decimal) else v
                    for k, v in row_dict.items()
                }
                data.append(safe_row)
            return {"ok": True, "columns": columns, "data": data}
        finally:
            conn.close()
    except Exception as e:
        logger.error(f"Error in sql_execute: {e}")
        return {"ok": False, "error": str(e)}

@router.post("/to-question")
@limiter.limit("30/minute")
async def sql_to_question(req: SqlToQuestionRequest, request: Request):
    from langchain_core.messages import HumanMessage, SystemMessage

    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

    system_prompt = """Given this SQL query, write a single clear natural language question in Vietnamese that this query answers.
Return ONLY the question, no explanation, no quotes.
Example: "Top 5 khách hàng có doanh thu cao nhất quý 2"
"""
    user_prompt = f"SQL: {req.sql}"
    if req.context:
        user_prompt += f"\nContext: {req.context}"

    try:
        llm = await create_llm_with_fallback("claude-3-5-haiku-latest")
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ])
        question = response.content.strip().strip('"').strip("'")
        return {"ok": True, "question": question}
    except Exception as e:
        logger.error(f"Error in sql_to_question: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/to-metric-sql")
@limiter.limit("30/minute")
def sql_to_metric_sql(req: ToMetricSqlRequest, request: Request):
    """Generate a scalar SELECT SQL from a natural language KPI description."""
    from langchain_core.messages import HumanMessage, SystemMessage

    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

    system_prompt = """You are a SQL expert. The user will describe a business KPI metric in natural language.
Your task: write a single SQL SELECT that returns EXACTLY ONE ROW and ONE COLUMN (the metric value).
Rules:
- Use only SELECT (no INSERT/UPDATE/DELETE/DROP).
- The query must return exactly 1 row, 1 column. Use aggregate functions (COUNT, SUM, AVG, MAX, MIN) or scalar subqueries.
- Name the column descriptively (e.g. total_revenue, active_users, avg_order_value).
- Do not include explanations, markdown fences, or quotes — return ONLY the raw SQL statement.
- If schema context is provided, use the correct table/column names from it.
- If no schema is given, write a plausible generic query using common table names.
Example output: SELECT SUM(amount) AS total_revenue FROM orders WHERE status = 'completed'
"""
    user_prompt = f"KPI description: {req.description}"
    if req.context:
        user_prompt += f"\n\nSchema context:\n{req.context}"

    try:
        llm = create_llm_with_fallback("claude-3-5-haiku-latest")
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        sql = response.content.strip().strip("`").strip()
        if sql.upper().startswith("SQL"):
            sql = sql[3:].strip()
        return {"ok": True, "sql": sql}
    except Exception as e:
        logger.error(f"Error in sql_to_metric_sql: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/to-insight")
@limiter.limit("30/minute")
def sql_to_insight(req: ToInsightRequest, request: Request):
    """Generate a 1-2 sentence insight from chart data using LLM."""
    from langchain_core.messages import HumanMessage, SystemMessage

    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

    system_prompt = """You are a data analyst assistant. Analyze the given chart/table data and write 1-2 concise, insightful sentences in Vietnamese.
Focus on: the main trend, the highest/lowest value, an anomaly, or a business implication.
Be specific (mention actual numbers when interesting). Do not explain what the chart shows — give an INSIGHT.
Return ONLY the insight text, no quotes, no labels."""

    rows_preview = ""
    if req.rows and req.columns:
        top5 = req.rows[:5]
        header = " | ".join(req.columns)
        data_rows = "\n".join([" | ".join(str(v) for v in row) for row in top5])
        rows_preview = f"Columns: {header}\nFirst rows:\n{data_rows}"
        if len(req.rows) > 5:
            rows_preview += f"\n... ({len(req.rows)} total rows)"

    user_prompt = f"Chart type: {req.chart_type or 'table'}\nTitle: {req.title or 'No title'}"
    if req.sql:
        user_prompt += f"\nSQL: {req.sql}"
    if rows_preview:
        user_prompt += f"\n\nData:\n{rows_preview}"

    try:
        llm = create_llm_with_fallback("claude-3-5-haiku-latest")
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        insight = response.content.strip().strip('"').strip("'")
        return {"ok": True, "insight": insight}
    except Exception as e:
        logger.error(f"Error in sql_to_insight: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/dashboard-summary")
@limiter.limit("10/minute")
def sql_dashboard_summary(req: DashboardSummaryRequest, request: Request):
    """Generate a multi-paragraph executive summary for an entire dashboard."""
    from langchain_core.messages import HumanMessage, SystemMessage

    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

    system_prompt = """You are a senior business analyst writing an executive summary.
You will receive data from multiple dashboard charts.
Write a concise but comprehensive executive summary in Vietnamese — 3-4 short paragraphs.
- Paragraph 1: Overall business performance overview
- Paragraph 2: Key highlights (top performers, growth drivers)
- Paragraph 3: Areas of concern or anomalies
- Paragraph 4: 2-3 actionable recommendations

Use specific numbers from the data. Be direct and professional. Do NOT use markdown headers or bullet points — just clean paragraph text.
Return ONLY the summary text."""

    charts_desc = []
    for ch in req.charts:
        title = ch.get("title", "Biểu đồ")
        summary = ch.get("summary", "")
        preview = ch.get("data_preview", [])
        text = f"• {title}"
        if summary:
            text += f": {summary}"
        if preview:
            keys = list(preview[0].keys()) if preview else []
            vals = " | ".join([" | ".join(str(row.get(k, "")) for k in keys) for row in preview[:3]])
            text += f"\n  Data: {vals}"
        charts_desc.append(text)

    user_prompt = f"Dashboard: {req.dashboard_name}\n\nCharts:\n" + "\n".join(charts_desc)

    try:
        llm = create_llm_with_fallback("claude-3-5-haiku-latest")
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        summary = response.content.strip()
        return {"ok": True, "summary": summary}
    except Exception as e:
        logger.error(f"Error in dashboard_summary: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/chart/adjust")
@limiter.limit("30/minute")
async def sql_chart_adjust(req: ChartAdjustRequest, request: Request):
    """Adjust chart spec based on user instruction (e.g. 'change to pie chart')."""
    from dbgpt_analyst.domains.presentation.chart import adjust_chart
    try:
        adjusted = await adjust_chart(req.current_spec, req.instruction)
        return {"ok": True, "spec": adjusted}
    except Exception as e:
        logger.error(f"Error in chart_adjust: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/ask-chart")
@limiter.limit("30/minute")
def sql_ask_chart(req: AskChartRequest, request: Request):
    """Answer a user's question about a specific chart's data using LLM."""
    from langchain_core.messages import HumanMessage, SystemMessage

    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

    system_prompt = """You are a helpful data analyst. The user will ask a question about a chart or dataset.
Answer concisely and accurately in Vietnamese, using the data provided.
If you reference numbers, be specific. If you cannot answer from the data alone, say so honestly.
Keep your answer to 2-3 sentences maximum."""

    data_preview = ""
    if req.data:
        keys = list(req.data[0].keys()) if req.data else []
        header = " | ".join(keys)
        rows_txt = "\n".join([" | ".join(str(row.get(k, "")) for k in keys) for row in req.data[:8]])
        data_preview = f"Columns: {header}\nRows:\n{rows_txt}"
        if len(req.data) > 8:
            data_preview += f"\n...({len(req.data)} rows total)"

    user_prompt = f"Chart: {req.title or '(no title)'} ({req.chart_type or 'unknown type'})"
    if req.summary:
        user_prompt += f"\nCurrent insight: {req.summary}"
    if data_preview:
        user_prompt += f"\n\nData:\n{data_preview}"
    user_prompt += f"\n\nQuestion: {req.question}"

    try:
        llm = create_llm_with_fallback("claude-3-5-haiku-latest")
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        answer = response.content.strip()
        return {"ok": True, "answer": answer}
    except Exception as e:
        logger.error(f"Error in ask_chart: {e}")
        return {"ok": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════
# Memory API (ported from WrenAI SDK _memory_api.py)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/memory/status")
def memory_status():
    """Return memory index statistics."""
    from dbgpt_analyst.memory import status
    return {"ok": True, "data": status()}


@router.get("/memory/queries")
def list_golden_queries(
    source: str | None = None,
    limit: int = 20,
    offset: int = 0,
):
    """List golden queries with pagination."""
    from dbgpt_analyst.memory import list_queries
    queries, total = list_queries(source=source, limit=limit, offset=offset)
    return {"ok": True, "data": queries, "total": total}


@router.post("/memory/recall")
def recall_golden_queries(req: RecallRequest):
    """Recall similar past NL→SQL pairs."""
    from dbgpt_analyst.memory import format_recall_content, recall_queries
    results = recall_queries(
        req.query,
        limit=req.limit,
        table_names=req.table_names,
        datasource=req.datasource,
    )
    return {
        "ok": True,
        "data": results,
        "formatted": format_recall_content(results),
    }


@router.post("/memory/store")
def store_golden_query(req: StoreQueryRequest):
    """Store a confirmed NL→SQL pair."""
    from dbgpt_analyst.memory import store_query
    row_id = store_query(
        nl_query=req.nl_query,
        sql_query=req.sql_query,
        table_names=req.table_names,
        datasource=req.datasource,
        tags=req.tags,
    )
    return {"ok": True, "id": row_id}


@router.delete("/memory/queries")
def delete_golden_queries(req: DeleteQueriesRequest):
    """Delete golden queries by IDs."""
    from dbgpt_analyst.memory import forget_queries_by_ids
    deleted = forget_queries_by_ids(req.ids)
    return {"ok": True, "deleted": deleted}


@router.post("/memory/seed")
def seed_memory():
    """Generate seed queries for all tables in the active database."""
    from dbgpt_analyst.domains.analysis.seed_queries import seed_all_tables
    result = seed_all_tables()
    return {"ok": True, "data": result}


@router.post("/memory/load")
def load_golden_queries(req: LoadQueriesRequest):
    """Batch import NL→SQL pairs."""
    from dbgpt_analyst.memory import load_queries
    result = load_queries(req.pairs, overwrite=req.overwrite, upsert=req.upsert)
    return {"ok": True, "data": result}


@router.get("/memory/dump")
def dump_golden_queries(source: str | None = None):
    """Export all golden queries."""
    from dbgpt_analyst.memory import dump_queries
    data = dump_queries(source=source)
    return {"ok": True, "data": data, "total": len(data)}


@router.post("/memory/reset")
def reset_memory():
    """Reset all memory tables (dangerous!)."""
    from dbgpt_analyst.memory import ensure_tables, reset
    reset()
    ensure_tables()
    return {"ok": True, "message": "Memory tables reset and recreated."}


# ═══════════════════════════════════════════════════════════════════════════
# Schema Description API (ported from WrenAI schema_indexer)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/descriptions")
def list_all_descriptions():
    """List ALL schema descriptions across all tables."""
    from dbgpt_analyst.memory import get_all_descriptions
    data = get_all_descriptions()
    return {"ok": True, "data": data, "total": len(data)}


@router.get("/descriptions/{table_name}")
def get_table_descriptions(table_name: str):
    """Get descriptions for a specific table."""
    from dbgpt_analyst.memory import get_descriptions
    data = get_descriptions(table_name)
    return {"ok": True, "data": data}


@router.post("/descriptions")
def upsert_description(req: DescriptionRequest):
    """Upsert a table/column description."""
    from dbgpt_analyst.memory import upsert_description
    row_id = upsert_description(
        table_name=req.table_name,
        column_name=req.column_name,
        description=req.description,
        business_name=req.business_name,
        accepted_values=req.accepted_values,
        is_primary_key=req.is_primary_key,
        data_type=req.data_type,
        expression=req.expression,
        is_calculated=req.is_calculated,
        relationships=req.relationships,
    )
    return {"ok": True, "id": row_id}


@router.delete("/descriptions/{desc_id}")
def remove_description(desc_id: int):
    """Delete a schema description by ID."""
    from dbgpt_analyst.memory import delete_description
    deleted = delete_description(desc_id)
    return {"ok": True, "deleted": deleted}


# ═══════════════════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════════════════
# Analytic Conversations API (Dual SQLite & PostgreSQL Compatible)
# ═══════════════════════════════════════════════════════════════════════════

def _is_sqlite_conn(conn: Any) -> bool:
    """Check if the connection is SQLite."""
    from dbgpt_analyst.common.db import is_sqlite_conn
    return is_sqlite_conn(conn)

def _normalize_sql(sql: str, is_sqlite: bool, schema: str) -> str:
    """Normalize SQL syntax between PostgreSQL and SQLite."""
    from dbgpt_analyst.common.db import normalize_sql
    return normalize_sql(sql, is_sqlite, schema)

def _ensure_tables_exist(conn: Any, cur: Any, is_sqlite: bool, schema: str):
    """Ensure conversation and message tables exist on active connection."""
    # 1. Conversations Table
    sql_conv = _normalize_sql(f"""
        CREATE TABLE IF NOT EXISTS {schema}.analytic_conversations (
            id          TEXT PRIMARY KEY,
            title       TEXT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """, is_sqlite, schema)
    cur.execute(sql_conv)

    # 2. Messages Table
    target_table = "analytic_conversations" if is_sqlite else f"{schema}.analytic_conversations"
    sql_msg = _normalize_sql(f"""
        CREATE TABLE IF NOT EXISTS {schema}.analytic_messages (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES {target_table}(id) ON DELETE CASCADE,
            role            TEXT NOT NULL,
            content         TEXT NOT NULL,
            sql_used        TEXT,
            chart_spec      TEXT,
            query_results   TEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """, is_sqlite, schema)
    cur.execute(sql_msg)

    # 3. Index
    try:
        idx_msg = _normalize_sql(f"""
            CREATE INDEX IF NOT EXISTS idx_analytic_messages_conv
            ON {schema}.analytic_messages(conversation_id, created_at ASC)
        """, is_sqlite, schema)
        cur.execute(idx_msg)
    except Exception:
        pass

    # 4. Additive Columns
    for col_name in ["report_id", "doc_url", "artifact_kind"]:
        try:
            sql_col = _normalize_sql(f"ALTER TABLE {schema}.analytic_messages ADD COLUMN {col_name} TEXT", is_sqlite, schema)
            cur.execute(sql_col)
        except Exception:
            pass

    # 5. Execution Steps Table
    sql_steps = _normalize_sql(f"""
        CREATE TABLE IF NOT EXISTS {schema}.analytic_execution_steps (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES {target_table}(id) ON DELETE CASCADE,
            message_id      TEXT,
            turn_index      INT,
            step_index      INT,
            agent_id        TEXT,
            agent_name      TEXT,
            agent_type      TEXT,
            node_name       TEXT,
            subgraph_name   TEXT,
            step_type       TEXT NOT NULL,
            tool_name       TEXT,
            tool_args       TEXT,
            tool_result     TEXT,
            reasoning       TEXT,
            created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """, is_sqlite, schema)
    cur.execute(sql_steps)

    try:
        idx_steps = _normalize_sql(f"""
            CREATE INDEX IF NOT EXISTS idx_analytic_execution_steps_conv
            ON {schema}.analytic_execution_steps(conversation_id, created_at ASC)
        """, is_sqlite, schema)
        cur.execute(idx_steps)
    except Exception:
        pass

    conn.commit()


def _init_conversations_table():
    from dbgpt_analyst.common.db import get_db_connection
    from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
    schema = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
    conn = get_db_connection()
    is_sqlite = _is_sqlite_conn(conn)
    
    try:
        cur = conn.cursor()
        _ensure_tables_exist(conn, cur, is_sqlite, schema)
    finally:
        conn.close()

try:
    _init_conversations_table()
except Exception as _e:
    logger.warning(f"analytic_conversations table init error: {_e}")


@router.post("/conversations")
def create_conversation(req: CreateConversationRequest):
    """Create a new analytic conversation and return its ID."""
    from dbgpt_analyst.common.db import get_db_connection
    from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
    schema = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
    conv_id = req.id or str(_uuid.uuid4())
    now = _datetime.now(UTC).isoformat()
    title = req.title or "Cuộc hội thoại mới"
    conn = get_db_connection()
    is_sqlite = _is_sqlite_conn(conn)
    
    try:
        cur = conn.cursor()
        _ensure_tables_exist(conn, cur, is_sqlite, schema)
        sql = _normalize_sql(
            f"INSERT INTO {schema}.analytic_conversations (id, title, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            is_sqlite,
            schema,
        )
        cur.execute(sql, (conv_id, title, now, now))
        conn.commit()
    finally:
        conn.close()
    return {"conversation_id": conv_id, "title": title, "created_at": now}


@router.get("/conversations")
def list_conversations(limit: int = 50):
    """List recent analytic conversations."""
    from dbgpt_analyst.common.db import get_db_connection
    from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
    schema = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
    conn = get_db_connection()
    is_sqlite = _is_sqlite_conn(conn)
    
    try:
        cur = conn.cursor()
        _ensure_tables_exist(conn, cur, is_sqlite, schema)
        sql = _normalize_sql(
            f"SELECT id, title, created_at, updated_at FROM {schema}.analytic_conversations ORDER BY updated_at DESC LIMIT %s",
            is_sqlite,
            schema,
        )
        cur.execute(sql, (limit,))
        rows = [
            {"id": r[0], "title": r[1], "created_at": str(r[2]), "updated_at": str(r[3])}
            for r in cur.fetchall()
        ]
        return {"ok": True, "data": rows}
    finally:
        conn.close()



@router.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(conversation_id: str, limit: int = 50):
    """Get messages for a specific conversation."""
    from dbgpt_analyst.common.db import get_db_connection
    from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
    schema = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
    conn = get_db_connection()
    is_sqlite = _is_sqlite_conn(conn)
    
    try:
        cur = conn.cursor()
        _ensure_tables_exist(conn, cur, is_sqlite, schema)
        sql = _normalize_sql(
            f"SELECT id, role, content, sql_used, chart_spec, query_results, created_at, report_id, doc_url, artifact_kind FROM {schema}.analytic_messages WHERE conversation_id=%s ORDER BY created_at ASC LIMIT %s",
            is_sqlite,
            schema,
        )
        cur.execute(sql, (conversation_id, limit))
        rows = [
            {
                "id": r[0], "role": r[1], "content": r[2], "sql_used": r[3],
                "chart_spec": r[4], "query_results": r[5], "created_at": str(r[6]),
                "report_id": r[7], "doc_url": r[8], "artifact_kind": r[9]
            }
            for r in cur.fetchall()
        ]
        return {"ok": True, "data": rows}
    finally:
        conn.close()


@router.post("/conversations/{conversation_id}/messages")
def save_conversation_message(conversation_id: str, req: SaveMessageRequest):
    """Save a message to a conversation and update its updated_at."""
    from dbgpt_analyst.common.db import get_db_connection
    from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
    schema = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
    msg_id = str(_uuid.uuid4())
    now = _datetime.now(UTC).isoformat()
    role = req.role
    content = req.content
    sql_used = req.sql_used
    chart_spec = req.chart_spec if hasattr(req, "chart_spec") else None
    query_results = req.query_results if hasattr(req, "query_results") else None
    report_id = req.report_id if hasattr(req, "report_id") else None
    doc_url = req.doc_url if hasattr(req, "doc_url") else None
    artifact_kind = req.artifact_kind if hasattr(req, "artifact_kind") else None
    conn = get_db_connection()
    is_sqlite = _is_sqlite_conn(conn)
    
    try:
        cur = conn.cursor()
        _ensure_tables_exist(conn, cur, is_sqlite, schema)
        sql_conv = _normalize_sql(
            f"INSERT INTO {schema}.analytic_conversations (id, title, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            is_sqlite,
            schema,
        )
        cur.execute(sql_conv, (conversation_id, content[:80], now, now))

        sql_msg = _normalize_sql(
            f"INSERT INTO {schema}.analytic_messages (id, conversation_id, role, content, sql_used, chart_spec, query_results, created_at, report_id, doc_url, artifact_kind) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            is_sqlite,
            schema,
        )
        cur.execute(sql_msg, (msg_id, conversation_id, role, content, sql_used, chart_spec, query_results, now, report_id, doc_url, artifact_kind))

        sql_update = _normalize_sql(
            f"UPDATE {schema}.analytic_conversations SET updated_at=%s WHERE id=%s",
            is_sqlite,
            schema,
        )
        cur.execute(sql_update, (now, conversation_id))
        conn.commit()
        return {"ok": True, "id": msg_id}
    finally:
        conn.close()


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    """Delete a specific conversation and all its messages."""
    from dbgpt_analyst.common.db import get_db_connection
    from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
    schema = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
    conn = get_db_connection()
    is_sqlite = _is_sqlite_conn(conn)
    
    try:
        cur = conn.cursor()
        _ensure_tables_exist(conn, cur, is_sqlite, schema)
        sql_del_msg = _normalize_sql(f"DELETE FROM {schema}.analytic_messages WHERE conversation_id=%s", is_sqlite, schema)
        cur.execute(sql_del_msg, (conversation_id,))
        
        sql_del_conv = _normalize_sql(f"DELETE FROM {schema}.analytic_conversations WHERE id=%s", is_sqlite, schema)
        cur.execute(sql_del_conv, (conversation_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/conversations")
def delete_all_conversations():
    """Delete all analytic conversations and messages."""
    from dbgpt_analyst.common.db import get_db_connection
    from dbgpt_analyst.config import CHECKPOINT_POSTGRES_SCHEMA
    schema = CHECKPOINT_POSTGRES_SCHEMA or "ai_data_analytics"
    conn = get_db_connection()
    is_sqlite = _is_sqlite_conn(conn)
    
    try:
        cur = conn.cursor()
        _ensure_tables_exist(conn, cur, is_sqlite, schema)
        sql_del_msg = _normalize_sql(f"DELETE FROM {schema}.analytic_messages", is_sqlite, schema)
        cur.execute(sql_del_msg)
        
        sql_del_conv = _normalize_sql(f"DELETE FROM {schema}.analytic_conversations", is_sqlite, schema)
        cur.execute(sql_del_conv)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()



# ═══════════════════════════════════════════════════════════════════════════
# PowerPoint Presentation (.pptx) & Responsive HTML Deck Generator Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/deck/generate")
@limiter.limit("20/minute")
async def generate_deck(req: Request):
    """Generate a PowerPoint (.pptx) presentation and responsive HTML preview.
    
    Accepts DeckGenerateRequest JSON payload.
    """
    from dbgpt_app.openapi.api_v1.deck_service import generate_deck_presentation
    from dbgpt_app.openapi.api_v1.replay_schemas import DeckGenerateRequest

    try:
        body = await req.json()
        deck_req = DeckGenerateRequest.model_validate(body)
        res = generate_deck_presentation(deck_req)
        return res.model_dump(by_alias=True)
    except Exception as exc:
        logger.exception("Deck generation failed: %s", exc)
        return JSONResponse(status_code=400, content={"status": "error", "message": str(exc)})


@router.get("/deck/download/{filename}")
async def download_deck(filename: str):
    """Download generated .pptx presentation binary."""
    from pathlib import Path
    from fastapi.responses import Response

    safe_name = Path(filename).name
    file_path = Path("data/artifacts") / safe_name
    if not file_path.exists():
        return JSONResponse(status_code=404, content={"detail": f"Presentation file {safe_name} not found"})

    content = file_path.read_bytes()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )



