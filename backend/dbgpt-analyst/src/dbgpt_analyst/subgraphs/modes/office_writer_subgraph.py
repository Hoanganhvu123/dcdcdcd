"""
subgraphs/modes/office_writer_subgraph.py — Office Writer Mode.

Mode: intent = "office" (PPT / Word / Excel)
Flow:  detect_doc_type → generate_office_doc → END

Supervisor delegates here when the user asks to create:
  - Slide presentations ("tạo slide", "làm PPT", "báo cáo thuyết trình")
  - Word documents ("viết báo cáo", "tạo tài liệu Word")
  - Excel spreadsheets ("tạo bảng tính", "xuất Excel")

Output: streams ClientEffectEvent → frontend opens OfficeArtifactView automatically.
"""
from __future__ import annotations

import html as _html
import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph

from dbgpt_analyst.events.artifact_events import ArtifactStream
from dbgpt_analyst.events import ClientEffectEvent, WorkflowTaskEvent
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.common.langfuse_client import observe

logger = logging.getLogger(__name__)


# ── Doc type detection ────────────────────────────────────────────────────────

PPT_KEYWORDS = [
    "slide", "ppt", "pptx", "thuyết trình", "presentation",
    "báo cáo trình chiếu", "pitchdeck", "pitch deck", "deck",
    "morph", "company profile", "giới thiệu công ty",
]
WORD_KEYWORDS = [
    "word", "docx", "tài liệu word", "văn bản", "luận văn",
    "báo cáo word", "document", "paper", "academic", "thesis",
    "bài viết chi tiết", "tài liệu",
]
EXCEL_KEYWORDS = [
    "excel", "xlsx", "bảng tính", "spreadsheet", "csv", "pivot",
    "xlsm", "bảng excel", "table export", "bảng số liệu",
]


def _detect_doc_type(question: str) -> str:
    q_lower = question.lower()
    ppt_score = sum(1 for kw in PPT_KEYWORDS if kw in q_lower)
    word_score = sum(1 for kw in WORD_KEYWORDS if kw in q_lower)
    excel_score = sum(1 for kw in EXCEL_KEYWORDS if kw in q_lower)
    scores = {"ppt": ppt_score, "word": word_score, "excel": excel_score}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "ppt"


def _is_429_quota_error(exc: Exception) -> bool:
    """Check if an exception indicates a 429 Rate Limit or API Quota Exhausted error."""
    if exc is None:
        return False
    exc_type_name = type(exc).__name__
    if exc_type_name in ("ResourceExhausted", "RateLimitError", "QuotaExceededError"):
        return True
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status_code in (429, "429"):
        return True
    err_str = str(exc).lower()
    quota_keywords = [
        "429",
        "resourceexhausted",
        "resource_exhausted",
        "quota exceeded",
        "quota",
        "rate limit",
        "rate_limit",
        "too many requests",
        "google.api_core.exceptions.resourceexhausted",
    ]
    return any(kw in err_str for kw in quota_keywords)


# ── Nodes ─────────────────────────────────────────────────────────────────────

@observe(name="office_writer_detect_doc_type")
async def node_detect_doc_type(state: MainAgentState, config: dict | None = None) -> dict[str, Any]:
    question = state.get("question", "")
    doc_type = _detect_doc_type(question)
    label = {"ppt": "📽️ Slide PPT", "word": "📄 Word Document", "excel": "📊 Excel Spreadsheet"}[doc_type]

    task_event = WorkflowTaskEvent(
        payload={
            "task_id": "detect_type",
            "name": f"Nhận dạng loại: {label}",
            "message": f"Sẽ tạo {label}",
        },
        phase="planning",
        status="done",
    ).model_dump()

    return {"display_type": f"office_{doc_type}", "steps": [task_event]}


async def _fetch_query_results(state: MainAgentState) -> list:
    """Run the SQL agent to get real rows for the document.

    The supervisor's prompt promises that `office_writer` "fetches the data it
    needs itself", and the delegation adapter always resets `query_results` to
    `[]` (it is not in `_FORWARD_FIELDS`), so without this the writer never has
    numbers and the LLM — correctly told not to invent any — fills the deck with
    `[năm]` / `[X]%` placeholders.

    The context the SQL chain needs (anchor_table, allowed_tables, source_ids,
    db_type, schemas_text) *is* forwarded, so it can run as-is. Failure is not
    fatal: a document with no data still beats no document.
    """
    # Lazy import: sql_agent_subgraph pulls in the whole node package.
    from dbgpt_analyst.subgraphs.sql_agent_subgraph import sql_agent_subgraph

    sub_state = dict(state)
    sub_state["query_results"] = []
    sub_state["error"] = None
    sub_state["retry_count"] = 0

    try:
        result = await sql_agent_subgraph.ainvoke(sub_state)
    except Exception as exc:  # noqa: BLE001 — document generation must survive
        logger.warning("office_writer data fetch failed (%s), continuing without data", exc)
        return []

    rows = result.get("query_results") or []
    logger.info("office_writer fetched %d row(s) for %r", len(rows), state.get("question", "")[:80])
    return rows


@observe(name="office_writer_generate_office_doc")
async def node_generate_office_doc(state: MainAgentState, config: dict | None = None) -> dict[str, Any]:
    question = state.get("question", "")
    display_type = state.get("display_type", "office_ppt")
    doc_type = display_type.replace("office_", "") if display_type else "ppt"

    steps: list[dict] = []

    query_results = state.get("query_results") or []
    if not query_results:
        steps.append(WorkflowTaskEvent(
            payload={
                "task_id": "fetch_data",
                "name": "🔍 Đang lấy dữ liệu...",
                "message": "Truy vấn database để lấy số liệu thật cho tài liệu",
            },
            phase="generating",
            status="running",
        ).model_dump())
        query_results = await _fetch_query_results(state)
        steps.append(WorkflowTaskEvent(
            payload={
                "task_id": "fetch_data",
                "name": (
                    f"✅ Đã lấy {len(query_results)} dòng dữ liệu" if query_results
                    else "⚠️ Không có dữ liệu — tài liệu sẽ chỉ có nội dung định tính"
                ),
                "message": "",
            },
            phase="generating",
            status="done",
        ).model_dump())

    steps.append(WorkflowTaskEvent(
        payload={
            "task_id": "gen_office",
            "name": "🔨 Đang tạo tài liệu...",
            "message": question[:80],
        },
        phase="generating",
        status="running",
    ).model_dump())

    # Một file = một chuỗi artifact.start → progress → ready|error. Frontend bám theo
    # `id` này thay vì đi bới URL trong văn xuôi của model.
    artifact = ArtifactStream(kind=doc_type, title=question[:120])
    await artifact.start()

    deck_id = None
    pptx_url = None
    doc_url = None
    slides = []
    result = {}
    is_429 = False
    has_error = False

    if doc_type != "ppt":
        try:
            if doc_type == "word":
                # ponytail: bỏ qua officecli path (external CLI binary "officecli" không
                # có trong môi trường DB-GPT) — dùng thẳng đường python-docx qua
                # docx_generator.html_to_docx(). Ceiling: format Word kém phong phú hơn
                # (không có style per-cell/table border như officecli tạo ra), chỉ có
                # markdown→html→docx cơ bản. Upgrade path: port
                # preferences/aianalytic/.../tools/officecli_client.py +
                # _export_word_file_officecli() khi có binary officecli trong deployment.
                try:
                    doc_url, doc_html_content = await _export_word_file(question, query_results)
                except Exception as e:
                    if _is_429_quota_error(e):
                        is_429 = True
                    raise

                if doc_html_content and not is_429:
                    final_html = WORD_PREVIEW_TEMPLATE.replace("{{title}}", _html.escape(question[:120])).replace("{{content}}", doc_html_content)
                    design_system = "A4 Page"
                    slide_count = 1
                else:
                    final_html = _fallback_html(question, doc_type)
                    design_system = "Fallback"
                    slide_count = 1
                    has_error = True
            elif doc_type == "excel":
                doc_url = _export_excel_file(query_results)
                if query_results:
                    final_html = _render_excel_html(question, query_results)
                    design_system = "Spreadsheet"
                    slide_count = 1
                else:
                    final_html = _fallback_html(question, doc_type)
                    design_system = "Fallback"
                    slide_count = 1
                    has_error = True
            else:
                final_html = _fallback_html(question, doc_type)
                design_system = "Fallback"
                slide_count = 1
                has_error = True
        except Exception as e:
            logger.warning(f"{doc_type} export failed ({e}), preview-only fallback")
            has_error = True
            if _is_429_quota_error(e):
                is_429 = True
            final_html = _fallback_html(question, doc_type)
            design_system = "Fallback"
            slide_count = 1
    else:
        try:
            pptx_url, final_html, slides = await _export_pptx_file(
                question, query_results, artifact=artifact
            )
            slide_count = len(slides)
            design_system = "Deck 16:9"
        except Exception as e:
            logger.warning(f"pptx export failed ({e}), preview-only fallback")
            has_error = True
            if _is_429_quota_error(e):
                is_429 = True
            final_html = _fallback_html(question, doc_type)
            design_system = "Fallback"
            slide_count = 1

    _download_url = pptx_url or doc_url
    if has_error or not _download_url:
        await artifact.error(
            "Hệ thống quá tải (429)" if is_429 else "Không tạo được file, chỉ còn bản xem trước."
        )
    else:
        await artifact.ready(
            url=_download_url,
            size=_uploaded_size(_download_url),
            preview_html=final_html,
        )

    # ── Emit ClientEffectEvent → frontend opens OfficeArtifactView ────
    effect_data: dict[str, Any] = {
        "html": final_html,
        "final_html": final_html,
        "doc_type": doc_type,
        "title": question[:120],
        "slide_count": slide_count,
        "design_system": design_system,
        "deck_data": slides,
        "css_tokens": result.get("active_design_system") or "",
    }
    if deck_id:
        effect_data["deck_id"] = deck_id
    if pptx_url:
        effect_data["pptx_url"] = pptx_url
    if doc_url:
        effect_data["doc_url"] = doc_url

    effect_event = ClientEffectEvent(
        payload={
            "action": "open_office_preview",
            "data": effect_data,
        },
        phase="done",
        status="done",
    ).model_dump()

    doc_label = {"ppt": "Slide Thuyết Trình", "word": "Tài liệu Word", "excel": "Bảng tính Excel"}.get(doc_type, "Tài liệu")
    doc_ext = {"word": ".docx", "excel": ".xlsx"}.get(doc_type, ".pptx")
    download_url = pptx_url or doc_url
    # All three doc types now produce a real file, so a missing download_url always
    # means the export failed — say so instead of silently shipping a preview.
    download_line = (
        f"- 📥 [Tải file {doc_ext}]({download_url})\n" if download_url
        else "- ⚠️ Chưa tạo được file tải về, chỉ có bản xem trước.\n"
    )
    done_event = WorkflowTaskEvent(
        payload={
            "task_id": "gen_office",
            "name": f"❌ Lỗi tạo {doc_label}" if is_429 else (f"✅ Đã tạo {doc_label} ({slide_count} trang)" if not has_error else f"⚠️ Fallback {doc_label}"),
            "message": "Hệ thống quá tải (Quota 429)" if is_429 else f"Design: {design_system}",
        },
        phase="generating",
        status="error" if is_429 else "done",
    ).model_dump()

    steps.extend([done_event, effect_event])

    if is_429:
        answer_text = "❌ **Hệ thống đang quá tải** (giới hạn API Quota). Vui lòng thử lại sau ít phút."
    # No "xem preview ở panel bên phải" line: `effect_event` above is emitted, but
    # when office_writer runs as a delegated subagent the deepagents `task` boundary
    # swallows it, so it never reaches the client. Promising a panel that isn't
    # there reads as a bug to the user. Restore the line once the effect survives
    # delegation.
    elif has_error or design_system == "Fallback":
        answer_text = (
            f"⚠️ **Không thể hoàn tất tạo {doc_label}**\n\n"
            f"- 💡 Vui lòng thử lại sau ít phút."
        )
    else:
        answer_text = (
            f"✅ **{doc_label}** đã sẵn sàng!\n\n"
            f"- 📊 {slide_count} trang · Design: **{design_system}**\n"
            f"{download_line}"
            f"- 💡 Có thể yêu cầu chỉnh sửa thêm bất kỳ lúc nào"
        )

    return {
        "answer": answer_text,
        "steps": steps,
    }


def _save_generated_file(file_bytes: bytes, subdir: str, ext: str) -> str:
    """Write `file_bytes` under data/uploads/<subdir>/<uuid><ext> and return its
    public URL (served via the existing `/uploads` StaticFiles mount in main.py).
    """
    import os
    import uuid

    upload_dir = os.getenv("UPLOAD_DIR", "data/uploads")
    out_dir = os.path.join(upload_dir, subdir)
    os.makedirs(out_dir, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(out_dir, filename), "wb") as f:
        f.write(file_bytes)

    return f"/uploads/{subdir}/{filename}"


def _uploaded_size(url: str) -> int:
    """Kích thước file vừa ghi. URL là thứ duy nhất cả ba nhánh export đều trả về,
    nên đọc lại từ đĩa rẻ hơn là bắt từng nhánh chuyền thêm số bytes."""
    import os

    path = os.path.join(
        os.getenv("UPLOAD_DIR", "data/uploads"), url.replace("/uploads/", "", 1)
    )
    try:
        return os.path.getsize(path)
    except OSError:
        return 0





def _grounded_facts(rows: list) -> dict:
    """Sum/avg per numeric column, computed via deck.compute_metric — same
    discipline as officecli._write_workbook's totals sheet, so a docx and an
    xlsx built from the same rows never disagree.
    """
    from dbgpt_analyst.tools.deck import compute_metric

    if not rows:
        return {}
    columns = list(rows[0].keys())
    numeric = [
        c
        for c in columns
        if any(isinstance(r.get(c), (int, float)) and not isinstance(r.get(c), bool) for r in rows)
    ]
    facts: dict = {"row_count": float(len(rows))}
    for c in numeric:
        facts[f"sum_{c}"] = compute_metric(rows, f"sum:{c}")
        facts[f"avg_{c}"] = compute_metric(rows, f"avg:{c}")
    return facts


def _strip_unverified_lines(markdown_text: str) -> str:
    """Drop any line carrying a number the LLM invented — reuses deck.py's
    bullet-drop rule (_has_unverified_number) so a docx applies the exact same
    grounding check a pptx bullet already does.
    """
    from dbgpt_analyst.tools.deck import _has_unverified_number

    kept = [line for line in markdown_text.splitlines() if not _has_unverified_number(line)]
    return "\n".join(kept)


def _facts_section(facts: dict) -> str:
    """Code-generated appendix — the only place real numbers may appear,
    guaranteed to match compute_metric on the same rows.
    """
    from dbgpt_analyst.tools.deck import format_number

    if not facts:
        return ""
    lines = ["\n## Số liệu chi tiết\n"]
    for key, value in facts.items():
        lines.append(f"- {key}: {format_number(value)}")
    return "\n".join(lines)


async def _export_word_file(question: str, query_results: list) -> tuple[str | None, str | None]:
    """Write a short markdown report via one LLM call, render it to HTML, and
    convert that to a real .docx using the existing html_to_docx() tool
    (already used by the ai_research report-export feature). Returns (None, None) if
    the LLM call itself fails.

    Numbers are grounded, not trusted from the LLM: any line the model writes
    with a figure in it gets dropped (deck.py's _has_unverified_number rule),
    and a code-generated facts section built from compute_metric is appended
    instead — the same discipline deck.py already proves out for pptx bullets.
    """
    import markdown as _markdown
    from langchain_core.messages import HumanMessage as _HumanMessage

    from dbgpt_analyst.subgraphs.modes.docx_generator import html_to_docx
    from dbgpt_analyst.common.llm_factory import preferred_model_name
    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

    facts = _grounded_facts(query_results)
    data_context = (
        json.dumps(query_results[:50], ensure_ascii=False, default=str)
        if query_results else "Không có dữ liệu truy vấn kèm theo."
    )
    from dbgpt_analyst.prompts.office_prompt import render_word_doc_prompt
    prompt = render_word_doc_prompt(question, data_context)
    llm, _ = await create_llm_with_fallback(model_name=preferred_model_name(), user_id="office_writer", streaming=False)
    response = await llm.ainvoke([_HumanMessage(content=prompt)])
    _content = response.content
    if isinstance(_content, list):
        _content = "".join(p.get("text", "") for p in _content if isinstance(p, dict))
    markdown_text = _strip_unverified_lines(str(_content).strip())
    markdown_text = (markdown_text + _facts_section(facts)).strip()
    if not markdown_text:
        return None, None

    html_content = _markdown.markdown(markdown_text, extensions=["tables"])
    docx_bytes = html_to_docx(html_content, title=question[:120] or "Tài liệu")
    doc_url = _save_generated_file(docx_bytes, "generated_docx", ".docx")
    return doc_url, html_content


async def _export_pptx_file(
    question: str, query_results: list, *, llm=None, artifact=None
) -> tuple[str, str, list]:
    """Plan a deck over the rows, render it to a real .pptx plus an HTML preview.

    The model picks the story — slide order, titles, which column to plot — and
    `deck` computes every figure from `query_results`. A slide the rows cannot
    support is dropped before it reaches the file.

    `artifact` là `ArtifactStream` tuỳ chọn: mốc tiến độ chỉ phát ở hai chỗ tốn
    thời gian thật (chờ model dựng dàn bài, render file), không phát mốc trang trí.

    Returns (pptx_url, preview_html, slides). Raises when the deck is unusable so
    the caller falls back visibly rather than shipping an empty "success" file.
    """
    from dbgpt_analyst.common.llm_factory import preferred_model_name
    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback
    from dbgpt_analyst.tools import deck

    if llm is None:
        llm, _ = await create_llm_with_fallback(
            model_name=preferred_model_name(), user_id="office_writer", streaming=False
        )

    if artifact:
        await artifact.progress("planning", 20)
    spec = await deck.plan_deck(question, query_results, llm=llm)

    if artifact:
        await artifact.progress("rendering", 60)
    pptx_url = _save_generated_file(
        deck.render_deck_bytes(spec, query_results), "generated_pptx", ".pptx"
    )
    return pptx_url, deck.render_html(spec, query_results), spec["slides"]


def _export_excel_file(query_results: list) -> str | None:
    """Write `query_results` (list of row dicts) to a production-grade multi-sheet
    financial/operational workbook (.xlsx) via xlsxwriter.

    Worksheets included:
      1. 'Executive Summary': High-level KPI summary table with native formulas referencing
         the 'Data' worksheet (=COUNTA, =SUM, =AVERAGE, =MAX, =MIN, growth ratios),
         dark navy headers (#1E3A8A), currency/percentage formatting, and double bottom borders.
      2. 'Data': Detailed operational dataset with dark navy headers, thin borders (#CBD5E1),
         formatted numbers/currencies/percentages, auto-fitted columns, and native chart.
      3. 'KPI Metrics': Category/dimensional breakdown with native Excel formulas
         (=SUMIF, =AVERAGEIF, percentages, and totals).

    Returns None when there's no tabular data to export.
    """
    import io
    import xlsxwriter
    from xlsxwriter.utility import xl_col_to_name

    if not query_results:
        return None

    columns = list(query_results[0].keys()) if isinstance(query_results[0], dict) else None
    if not columns:
        return None

    num_rows = len(query_results)
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})

    # ── Formats & Styles ──────────────────────────────────────────────────────
    header_fmt = workbook.add_format({
        "bold": True,
        "bg_color": "#1E3A8A",
        "font_color": "#FFFFFF",
        "border": 1,
        "border_color": "#CBD5E1",
        "align": "center",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 11,
    })
    title_banner_fmt = workbook.add_format({
        "bold": True,
        "font_size": 14,
        "font_color": "#FFFFFF",
        "bg_color": "#1E3A8A",
        "align": "left",
        "valign": "vcenter",
        "font_name": "Calibri",
        "left": 1,
        "right": 1,
        "top": 1,
        "bottom": 1,
        "border_color": "#CBD5E1",
    })
    section_hdr_fmt = workbook.add_format({
        "bold": True,
        "bg_color": "#F1F5F9",
        "font_color": "#1E3A8A",
        "border": 1,
        "border_color": "#CBD5E1",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 11,
    })
    text_cell_fmt = workbook.add_format({
        "border": 1,
        "border_color": "#CBD5E1",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 10,
    })
    currency_fmt = workbook.add_format({
        "border": 1,
        "border_color": "#CBD5E1",
        "num_format": '#,##0 "₫"',
        "align": "right",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 10,
    })
    int_fmt = workbook.add_format({
        "border": 1,
        "border_color": "#CBD5E1",
        "num_format": "#,##0",
        "align": "right",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 10,
    })
    percent_fmt = workbook.add_format({
        "border": 1,
        "border_color": "#CBD5E1",
        "num_format": "0.0%",
        "align": "right",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 10,
    })
    total_label_fmt = workbook.add_format({
        "bold": True,
        "bg_color": "#F8FAFC",
        "top": 1,
        "top_color": "#CBD5E1",
        "bottom": 6,  # double border
        "bottom_color": "#1E3A8A",
        "left": 1,
        "left_color": "#CBD5E1",
        "right": 1,
        "right_color": "#CBD5E1",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 11,
    })
    total_curr_fmt = workbook.add_format({
        "bold": True,
        "bg_color": "#F8FAFC",
        "top": 1,
        "top_color": "#CBD5E1",
        "bottom": 6,
        "bottom_color": "#1E3A8A",
        "left": 1,
        "left_color": "#CBD5E1",
        "right": 1,
        "right_color": "#CBD5E1",
        "num_format": '#,##0 "₫"',
        "align": "right",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 11,
    })
    total_pct_fmt = workbook.add_format({
        "bold": True,
        "bg_color": "#F8FAFC",
        "top": 1,
        "top_color": "#CBD5E1",
        "bottom": 6,
        "bottom_color": "#1E3A8A",
        "left": 1,
        "left_color": "#CBD5E1",
        "right": 1,
        "right_color": "#CBD5E1",
        "num_format": "0.0%",
        "align": "right",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 11,
    })
    total_int_fmt = workbook.add_format({
        "bold": True,
        "bg_color": "#F8FAFC",
        "top": 1,
        "top_color": "#CBD5E1",
        "bottom": 6,
        "bottom_color": "#1E3A8A",
        "left": 1,
        "left_color": "#CBD5E1",
        "right": 1,
        "right_color": "#CBD5E1",
        "num_format": "#,##0",
        "align": "right",
        "valign": "vcenter",
        "font_name": "Calibri",
        "font_size": 11,
    })

    # Classify numeric vs dimension columns
    def is_num_val(v: Any) -> bool:
        return isinstance(v, (int, float)) and not isinstance(v, bool)

    numeric_cols = [
        i for i, c in enumerate(columns)
        if any(is_num_val(r.get(c)) for r in query_results)
    ]
    dim_cols = [i for i in range(len(columns)) if i not in numeric_cols]

    def col_format(c_name: str, sample_val: Any):
        name_lower = str(c_name).lower()
        if any(kw in name_lower for kw in ("rate", "percent", "growth", "ty_le", "tang_truong")):
            return percent_fmt, total_pct_fmt
        if any(kw in name_lower for kw in ("tien", "doanh_thu", "cost", "revenue", "price", "profit", "amount", "chi_phi", "loi_nhuan", "gia")):
            return currency_fmt, total_curr_fmt
        if isinstance(sample_val, float) and not float(sample_val).is_integer():
            return currency_fmt, total_curr_fmt
        return int_fmt, total_int_fmt

    # ── Worksheet 1: Executive Summary ────────────────────────────────────────
    ws_exec = workbook.add_worksheet("Executive Summary")
    ws_exec.write(0, 0, "BÁO CÁO TỔNG QUAN TÀI CHÍNH & CHỈ SỐ HOẠT ĐỘNG", title_banner_fmt)
    ws_exec.write_blank(0, 1, None, title_banner_fmt)
    ws_exec.write_blank(0, 2, None, title_banner_fmt)

    ws_exec.write(2, 0, "Chỉ số Tổng quan", header_fmt)
    ws_exec.write(2, 1, "Giá trị tính toán (Formula)", header_fmt)
    ws_exec.write(2, 2, "Ghi chú & Phương pháp", header_fmt)

    exec_row = 3
    # 1. Total records formula
    ws_exec.write(exec_row, 0, "Tổng số bản ghi dữ liệu", text_cell_fmt)
    ws_exec.write_formula(exec_row, 1, f"=COUNTA(Data!A2:A{num_rows + 1})", int_fmt)
    ws_exec.write(exec_row, 2, "Số lượng dòng quan sát từ cơ sở dữ liệu", text_cell_fmt)
    exec_row += 1

    # 2. Key metrics for numeric columns
    for ci in numeric_cols:
        col_name = columns[ci]
        col_letter = xl_col_to_name(ci)
        cf, tf = col_format(col_name, query_results[0].get(col_name))

        ws_exec.write(exec_row, 0, f"Tổng {col_name}", text_cell_fmt)
        ws_exec.write_formula(exec_row, 1, f"=SUM(Data!{col_letter}2:{col_letter}{num_rows + 1})", cf)
        ws_exec.write(exec_row, 2, f"Tổng cộng tích lũy cột {col_name}", text_cell_fmt)
        exec_row += 1

        ws_exec.write(exec_row, 0, f"Trung bình {col_name}", text_cell_fmt)
        ws_exec.write_formula(exec_row, 1, f"=ROUND(AVERAGE(Data!{col_letter}2:{col_letter}{num_rows + 1}), 2)", cf)
        ws_exec.write(exec_row, 2, f"Giá trị bình quân trên từng kỳ", text_cell_fmt)
        exec_row += 1

        ws_exec.write(exec_row, 0, f"Giá trị lớn nhất ({col_name})", text_cell_fmt)
        ws_exec.write_formula(exec_row, 1, f"=MAX(Data!{col_letter}2:{col_letter}{num_rows + 1})", cf)
        ws_exec.write(exec_row, 2, "Mức cao nhất đạt được trong kỳ", text_cell_fmt)
        exec_row += 1

        ws_exec.write(exec_row, 0, f"Giá trị nhỏ nhất ({col_name})", text_cell_fmt)
        ws_exec.write_formula(exec_row, 1, f"=MIN(Data!{col_letter}2:{col_letter}{num_rows + 1})", cf)
        ws_exec.write(exec_row, 2, "Mức thấp nhất trong kỳ", text_cell_fmt)
        exec_row += 1

        if num_rows >= 2:
            ws_exec.write(exec_row, 0, f"Tăng trưởng kỳ cuối vs đầu ({col_name})", total_label_fmt)
            growth_formula = (
                f"=IF(Data!{col_letter}2>0, "
                f"ROUND(((Data!{col_letter}{num_rows + 1}-Data!{col_letter}2)/Data!{col_letter}2), 4), 0)"
            )
            ws_exec.write_formula(exec_row, 1, growth_formula, total_pct_fmt)
            ws_exec.write(exec_row, 2, "Tỷ lệ tăng trưởng toàn chu kỳ", total_label_fmt)
            exec_row += 1

    ws_exec.autofit()

    # ── Worksheet 2: Data ─────────────────────────────────────────────────────
    ws_data = workbook.add_worksheet("Data")
    for col_idx, col_name in enumerate(columns):
        ws_data.write(0, col_idx, str(col_name), header_fmt)

    for row_idx, row in enumerate(query_results, start=1):
        for col_idx, col_name in enumerate(columns):
            value = row.get(col_name)
            if is_num_val(value):
                cf, _ = col_format(col_name, value)
                ws_data.write(row_idx, col_idx, value, cf)
            elif isinstance(value, bool):
                ws_data.write(row_idx, col_idx, value, text_cell_fmt)
            else:
                ws_data.write(row_idx, col_idx, str(value) if value is not None else "", text_cell_fmt)

    ws_data.autofit()

    # Add native chart to Data sheet if numeric columns exist
    if numeric_cols and num_rows > 0:
        num_col_idx = numeric_cols[0]
        label_col_idx = dim_cols[0] if dim_cols else (0 if num_col_idx != 0 else 1)
        if label_col_idx < len(columns):
            chart = workbook.add_chart({"type": "column"})
            chart.add_series({
                "name": ["Data", 0, num_col_idx],
                "categories": ["Data", 1, label_col_idx, num_rows, label_col_idx],
                "values": ["Data", 1, num_col_idx, num_rows, num_col_idx],
            })
            chart.set_title({"name": f"{columns[num_col_idx]} theo {columns[label_col_idx]}"})
            chart.set_legend({"position": "none"})
            ws_data.insert_chart(1, len(columns) + 2, chart)

    # ── Worksheet 3: KPI Metrics ──────────────────────────────────────────────
    ws_kpi = workbook.add_worksheet("KPI Metrics")
    ws_kpi.write(0, 0, "PHÂN TÍCH CHỈ SỐ THEO PHÂN KHÚC & DANH MỤC", title_banner_fmt)
    ws_kpi.write_blank(0, 1, None, title_banner_fmt)
    ws_kpi.write_blank(0, 2, None, title_banner_fmt)
    ws_kpi.write_blank(0, 3, None, title_banner_fmt)

    if dim_cols and numeric_cols:
        dim_idx = dim_cols[0]
        dim_name = columns[dim_idx]
        dim_letter = xl_col_to_name(dim_idx)
        val_idx = numeric_cols[0]
        val_name = columns[val_idx]
        val_letter = xl_col_to_name(val_idx)
        cf, tf = col_format(val_name, query_results[0].get(val_name))

        unique_cats = []
        for r in query_results:
            c_val = r.get(dim_name)
            if c_val is not None and c_val not in unique_cats:
                unique_cats.append(c_val)
        unique_cats = unique_cats[:20]

        ws_kpi.write(2, 0, str(dim_name), header_fmt)
        ws_kpi.write(2, 1, f"Tổng {val_name}", header_fmt)
        ws_kpi.write(2, 2, "Tỷ trọng (%)", header_fmt)
        ws_kpi.write(2, 3, "Trung bình / kỳ", header_fmt)

        kpi_start_row = 3
        for k_idx, cat in enumerate(unique_cats):
            curr_r = kpi_start_row + k_idx
            ws_kpi.write(curr_r, 0, str(cat), text_cell_fmt)
            # Native SUMIF formula
            ws_kpi.write_formula(
                curr_r, 1,
                f'=SUMIF(Data!{dim_letter}2:{dim_letter}{num_rows + 1}, "{cat}", Data!{val_letter}2:{val_letter}{num_rows + 1})',
                cf,
            )
            # Native Percentage formula
            ws_kpi.write_formula(
                curr_r, 2,
                f'=IF(SUM(B${kpi_start_row + 1}:B${kpi_start_row + len(unique_cats)})>0, '
                f'ROUND(B{curr_r + 1}/SUM(B${kpi_start_row + 1}:B${kpi_start_row + len(unique_cats)}), 4), 0)',
                percent_fmt,
            )
            # Native AVERAGEIF formula
            ws_kpi.write_formula(
                curr_r, 3,
                f'=ROUND(AVERAGEIF(Data!{dim_letter}2:{dim_letter}{num_rows + 1}, "{cat}", Data!{val_letter}2:{val_letter}{num_rows + 1}), 2)',
                cf,
            )

        tot_r = kpi_start_row + len(unique_cats)
        ws_kpi.write(tot_r, 0, "TỔNG CỘNG", total_label_fmt)
        ws_kpi.write_formula(tot_r, 1, f"=SUM(B{kpi_start_row + 1}:B{tot_r})", tf)
        ws_kpi.write_formula(tot_r, 2, f"=SUM(C{kpi_start_row + 1}:C{tot_r})", total_pct_fmt)
        ws_kpi.write(tot_r, 3, "—", total_label_fmt)
    else:
        ws_kpi.write(2, 0, "Chỉ số thống kê", header_fmt)
        ws_kpi.write(2, 1, "Giá trị", header_fmt)
        ws_kpi.write(3, 0, "Tổng số mẫu dữ liệu", text_cell_fmt)
        ws_kpi.write_formula(3, 1, f"=COUNT(Data!A2:A{num_rows + 1})", int_fmt)
        ws_kpi.write(4, 0, "Trạng thái", total_label_fmt)
        ws_kpi.write(4, 1, "Hoàn tất", total_label_fmt)

    ws_kpi.autofit()

    workbook.close()
    return _save_generated_file(output.getvalue(), "generated_xlsx", ".xlsx")


def _fallback_html(question: str, doc_type: str) -> str:
    label = {"ppt": "Slide Thuyết Trình", "word": "Tài liệu Word", "excel": "Bảng tính Excel"}.get(doc_type, "Tài liệu")
    fallback_body = (
        f'<div style="padding: 24px; text-align: center; color: #e11d48;">'
        f'<h3>❌ Lỗi tạo {label}</h3>'
        f'<p>Hệ thống đang quá tải, vui lòng thử lại sau ít phút.</p>'
        f'</div>'
    )
    if doc_type == "word":
        return WORD_PREVIEW_TEMPLATE.replace("{{title}}", _html.escape(question[:120])).replace("{{content}}", fallback_body)
    return fallback_body


WORD_PREVIEW_TEMPLATE = """<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <style>
    body {
      background-color: #f8fafc;
      color: #0f172a;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }
    .page {
      background: #ffffff;
      width: 210mm;
      min-height: 297mm;
      padding: 25mm 20mm;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .page-content {
      flex: 1;
    }
    .page-footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      margin-top: 20px;
    }
    h1 { font-size: 2.2rem; font-weight: bold; text-align: center; margin-bottom: 2rem; color: #0f172a; }
    h2 { font-size: 1.5rem; font-weight: bold; border-bottom: 2px solid #cbd5e1; padding-bottom: 0.3rem; margin-top: 1.8rem; margin-bottom: 1rem; color: #1e293b; }
    h3 { font-size: 1.2rem; font-weight: bold; margin-top: 1.5rem; color: #334155; }
    p { line-height: 1.6; margin-bottom: 1rem; font-size: 1.05rem; text-align: justify; color: #334155; }
    ul, ol { margin-bottom: 1rem; padding-left: 2rem; line-height: 1.6; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
    th { background-color: #f8fafc; font-weight: bold; }
    hr {
      border: none;
      border-top: 1px dashed #cbd5e1;
      margin: 40px 0;
      position: relative;
      text-align: center;
    }
    hr::after {
      content: "PAGE BREAK";
      font-size: 0.7rem;
      font-weight: 700;
      color: #94a3b8;
      background: #ffffff;
      padding: 0 10px;
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%);
      letter-spacing: 0.1em;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-header">
      <span>Tài liệu báo cáo</span>
      <span>Bản xem trước</span>
    </div>
    <div class="page-content">
      <h1>{{title}}</h1>
      {{content}}
    </div>
    <div class="page-footer">
      <span>Tạo bởi AI Data Analyst</span>
      <span>Trang 1 / 1</span>
    </div>
  </div>
</body>
</html>"""

EXCEL_PREVIEW_TEMPLATE = """<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <style>
    body { background-color: #f1f5f9; color: #334155; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 12px; box-sizing: border-box; }
    .excel-container { width: 100%; height: calc(100vh - 24px); display: flex; flex-direction: column; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
    
    .excel-header { background-color: #1E3A8A; color: #ffffff; padding: 8px 16px; font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 12px; }
    .excel-header .logo { font-size: 1.1rem; }
    
    .formula-bar { background-color: #f8fafc; border-bottom: 1px solid #cbd5e1; padding: 6px 12px; display: flex; align-items: center; gap: 8px; }
    .address-box { width: 60px; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 2px; text-align: center; font-weight: 600; background-color: #ffffff; color: #1E3A8A; font-size: 0.8rem; font-family: monospace; }
    .formula-label { font-weight: bold; color: #1E3A8A; font-family: monospace; font-size: 1rem; padding: 0 4px; user-select: none; }
    .formula-input { flex: 1; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 2px; background-color: #ffffff; color: #334155; font-size: 0.8rem; font-family: monospace; outline: none; }
    
    .grid-wrapper { flex: 1; overflow: auto; background-color: #ffffff; position: relative; }
    table.spreadsheet { border-collapse: collapse; font-size: 0.8rem; min-width: 100%; table-layout: fixed; display: none; }
    table.spreadsheet.active { display: table; }
    
    table.spreadsheet th.corner { background-color: #f1f5f9; border: 1px solid #cbd5e1; width: 40px; min-width: 40px; position: sticky; top: 0; left: 0; z-index: 30; }
    table.spreadsheet th.row-header { background-color: #f1f5f9; border: 1px solid #cbd5e1; color: #64748b; text-align: center; width: 40px; min-width: 40px; position: sticky; left: 0; z-index: 10; font-weight: normal; }
    table.spreadsheet th.col-header { background-color: #1E3A8A; color: #ffffff; border: 1px solid #cbd5e1; text-align: center; padding: 6px 8px; min-width: 120px; position: sticky; top: 0; z-index: 20; font-weight: 600; }
    
    table.spreadsheet td { border: 1px solid #cbd5e1; padding: 6px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background-color: #ffffff; }
    table.spreadsheet tr:first-child td { font-weight: 600; background-color: #f8fafc; }
    table.spreadsheet tr:hover td { background-color: #f1f5f9; }
    
    table.spreadsheet td.selected-cell {
      outline: 2px solid #1E3A8A;
      outline-offset: -2px;
      background-color: #eff6ff !important;
    }
    
    .sheet-tabs { background-color: #f1f5f9; border-top: 1px solid #cbd5e1; padding: 6px 12px; display: flex; gap: 4px; font-size: 0.75rem; align-items: center; }
    .sheet-tab { background-color: #e2e8f0; color: #475569; border: 1px solid #cbd5e1; border-bottom: none; padding: 4px 16px; border-radius: 4px 4px 0 0; font-weight: 600; cursor: pointer; user-select: none; }
    .sheet-tab.active { background-color: #ffffff; color: #1E3A8A; border-color: #cbd5e1; border-top: 2px solid #1E3A8A; }
  </style>
</head>
<body>
  <div class="excel-container">
    <div class="excel-header">
      <span class="logo">📊</span>
      <span>{{question}}</span>
    </div>
    <div class="formula-bar">
      <input type="text" id="cell-address" class="address-box" value="A1" readonly>
      <span class="formula-label">fx</span>
      <input type="text" id="formula-input" class="formula-input" value="" readonly>
    </div>
    <div class="grid-wrapper">
      {{sheet_tables}}
    </div>
    <div class="sheet-tabs">
      {{sheet_tabs}}
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      var addressBox = document.getElementById('cell-address');
      var formulaInput = document.getElementById('formula-input');

      function activateTab(tabName) {
        document.querySelectorAll('.sheet-tab').forEach(function(t) {
          t.classList.toggle('active', t.dataset.sheet === tabName);
        });
        document.querySelectorAll('table.spreadsheet').forEach(function(tbl) {
          tbl.classList.toggle('active', tbl.id === 'sheet-' + tabName);
        });
        var activeTable = document.querySelector('table.spreadsheet.active');
        if (activeTable) {
          var firstCell = activeTable.querySelector('tbody td');
          if (firstCell) {
            selectCell(firstCell);
          }
        }
      }

      function selectCell(cell) {
        document.querySelectorAll('.selected-cell').forEach(function(c) {
          c.classList.remove('selected-cell');
        });
        cell.classList.add('selected-cell');

        var colIndex = cell.cellIndex - 1;
        var row = cell.parentElement;
        var rowHeader = row.querySelector('.row-header');
        var rowNum = rowHeader ? rowHeader.textContent.trim() : (row.rowIndex + 1);
        var colLetter = getColumnLetter(colIndex);

        addressBox.value = colLetter + rowNum;
        formulaInput.value = cell.dataset.formula || cell.textContent.trim();
      }

      document.querySelectorAll('.sheet-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          activateTab(this.dataset.sheet);
        });
      });

      document.querySelector('.grid-wrapper').addEventListener('click', function(e) {
        var cell = e.target;
        while (cell && cell.tagName !== 'TD') {
          if (cell.tagName === 'TH' || cell.tagName === 'TABLE') return;
          cell = cell.parentElement;
        }
        if (!cell) return;
        selectCell(cell);
      });

      function getColumnLetter(colIdx) {
        var letter = "";
        colIdx += 1;
        while (colIdx > 0) {
          var remainder = (colIdx - 1) % 26;
          letter = String.fromCharCode(65 + remainder) + letter;
          colIdx = Math.floor((colIdx - 1) / 26);
        }
        return letter;
      }

      var defaultTab = document.querySelector('.sheet-tab');
      if (defaultTab) {
        activateTab(defaultTab.dataset.sheet);
      }
    });
  </script>
</body>
</html>"""

def get_column_letter(col_idx: int) -> str:
    """Convert a zero-based column index to an Excel column letter (0 -> A, 25 -> Z, 26 -> AA)."""
    letter = ""
    col_idx += 1
    while col_idx > 0:
        col_idx, remainder = divmod(col_idx - 1, 26)
        letter = chr(65 + remainder) + letter
    return letter

def _render_excel_html(question: str, query_results: list) -> str:
    columns = []
    if query_results and isinstance(query_results, list) and len(query_results) > 0:
        first_row = query_results[0]
        if isinstance(first_row, dict):
            columns = list(first_row.keys())

    # Build Sheet 1: Executive Summary
    exec_headers = ["Chỉ số Tổng quan", "Giá trị tính toán", "Ghi chú"]
    exec_col_hdrs = "".join(f'<th class="col-header">{get_column_letter(i)}</th>' for i in range(len(exec_headers)))
    exec_rows = []
    exec_rows.append(
        '<tr><th class="row-header">1</th>' +
        "".join(f'<td><strong>{_html.escape(h)}</strong></td>' for h in exec_headers) +
        '</tr>'
    )
    r_num = 2
    exec_rows.append(
        f'<tr><th class="row-header">{r_num}</th>'
        f'<td>Tổng số bản ghi dữ liệu</td>'
        f'<td data-formula="=COUNTA(Data!A2:A{len(query_results) + 1})"><strong>{len(query_results)}</strong></td>'
        f'<td>Số lượng dòng quan sát</td></tr>'
    )
    r_num += 1

    for c in columns:
        vals = [r.get(c) for r in query_results if isinstance(r.get(c), (int, float)) and not isinstance(r.get(c), bool)]
        if vals:
            c_idx = columns.index(c)
            c_let = get_column_letter(c_idx)
            total_v = sum(vals)
            avg_v = total_v / len(vals)
            exec_rows.append(
                f'<tr><th class="row-header">{r_num}</th>'
                f'<td>Tổng {c}</td>'
                f'<td data-formula="=SUM(Data!{c_let}2:{c_let}{len(query_results) + 1})">{total_v:,.0f}</td>'
                f'<td>Tổng cộng tích lũy</td></tr>'
            )
            r_num += 1
            exec_rows.append(
                f'<tr><th class="row-header">{r_num}</th>'
                f'<td>Trung bình {c}</td>'
                f'<td data-formula="=ROUND(AVERAGE(Data!{c_let}2:{c_let}{len(query_results) + 1}), 2)">{avg_v:,.2f}</td>'
                f'<td>Giá trị bình quân</td></tr>'
            )
            r_num += 1

    exec_table = (
        f'<table class="spreadsheet active" id="sheet-exec">'
        f'<thead><tr><th class="corner"></th>{exec_col_hdrs}</tr></thead>'
        f'<tbody>{"".join(exec_rows)}</tbody></table>'
    )

    # Build Sheet 2: Data
    col_headers_list = [f'<th class="col-header">{get_column_letter(i)}</th>' for i in range(len(columns))]
    data_col_hdrs = "".join(col_headers_list) if columns else '<th class="col-header">A</th>'
    data_rows_list = []
    if columns:
        header_cols = "".join(f'<td><strong>{_html.escape(str(col))}</strong></td>' for col in columns)
        data_rows_list.append(f'<tr><th class="row-header">1</th>{header_cols}</tr>')
        for row_idx, row in enumerate(query_results, start=2):
            cols_html = []
            for col in columns:
                val = row.get(col, "")
                val_str = str(val) if val is not None else ""
                cols_html.append(f'<td>{_html.escape(val_str)}</td>')
            data_rows_list.append(f'<tr><th class="row-header">{row_idx}</th>{"".join(cols_html)}</tr>')
    else:
        data_rows_list.append('<tr><th class="row-header">1</th><td>Không có dữ liệu</td></tr>')

    data_table = (
        f'<table class="spreadsheet" id="sheet-data">'
        f'<thead><tr><th class="corner"></th>{data_col_hdrs}</tr></thead>'
        f'<tbody>{"".join(data_rows_list)}</tbody></table>'
    )

    # Build Sheet 3: KPI Metrics
    kpi_headers = ["Chỉ số Phân khúc", "Giá trị", "Tỷ trọng"]
    kpi_col_hdrs = "".join(f'<th class="col-header">{get_column_letter(i)}</th>' for i in range(len(kpi_headers)))
    kpi_rows = [
        '<tr><th class="row-header">1</th>' +
        "".join(f'<td><strong>{_html.escape(h)}</strong></td>' for h in kpi_headers) +
        '</tr>',
        f'<tr><th class="row-header">2</th><td>Tổng số mẫu</td><td data-formula="=COUNT(Data!A2:A{len(query_results) + 1})">{len(query_results)}</td><td>100.0%</td></tr>',
    ]
    kpi_table = (
        f'<table class="spreadsheet" id="sheet-kpi">'
        f'<thead><tr><th class="corner"></th>{kpi_col_hdrs}</tr></thead>'
        f'<tbody>{"".join(kpi_rows)}</tbody></table>'
    )

    sheet_tables = exec_table + data_table + kpi_table
    sheet_tabs = (
        '<div class="sheet-tab active" data-sheet="exec">Executive Summary</div>'
        '<div class="sheet-tab" data-sheet="data">Data</div>'
        '<div class="sheet-tab" data-sheet="kpi">KPI Metrics</div>'
    )

    return (
        EXCEL_PREVIEW_TEMPLATE
        .replace("{{question}}", _html.escape(question))
        .replace("{{sheet_tables}}", sheet_tables)
        .replace("{{sheet_tabs}}", sheet_tabs)
    )


# `_generate_mock_excel_data` removed: it asked the LLM to fabricate rows when the
# state had none. `_fetch_query_results` now runs the SQL agent for real data, and
# `_export_excel_file` honestly returns None when there is still nothing to write.






# ── Build subgraph ────────────────────────────────────────────────────────────

def build_office_writer_subgraph() -> Any:
    workflow = StateGraph(MainAgentState)
    workflow.add_node("detect_type", node_detect_doc_type)
    workflow.add_node("generate", node_generate_office_doc)
    workflow.set_entry_point("detect_type")
    workflow.add_edge("detect_type", "generate")
    workflow.add_edge("generate", END)
    return workflow.compile()


office_writer_subgraph = build_office_writer_subgraph()
