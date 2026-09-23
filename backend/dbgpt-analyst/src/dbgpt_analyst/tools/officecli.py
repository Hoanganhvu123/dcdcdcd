"""Generate real .docx/.pptx/.xlsx/report files by shelling out to `officecli`.

Why a third-party CLI instead of building a document writer: officecli already
owns the hard parts (OOXML assembly, layout, theming, chart objects). We only
need to (a) point it at our own LLM so it costs nothing per document, and
(b) hand it real numbers instead of letting it invent them.

External mode is what makes this viable — `OFFICE_CLI_RUNTIME=external` sends
requests straight to our configured endpoint and charges 0 hosted credits.
The API key is read from the environment only; it is never written to a config
file inside the repo.

Known ceilings (measured on officecli 0.2.121 + deepseek-chat):
  * The LLM does its own arithmetic on the workbook and gets aggregates wrong
    (observed: total 10.28bn vs the true 10.21bn). `_write_workbook` therefore
    writes a pre-computed totals sheet so the model transcribes instead of adds.
  * `--mode best` opens an interactive questionnaire on stdin, so it can never
    be used from a server. `fast` is the only automatable mode.
  * pptx output carries no native charts and truncates numbers written with a
    "." thousands separator. Prefer `report` for anything number-heavy.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any, Iterable, Literal, Sequence

logger = logging.getLogger(__name__)

DocKind = Literal["pptx", "docx", "xlsx", "report"]

#: officecli emits malformed JSON now and then — DeepSeek rejects the
#: `response_format` officecli asks for, so nothing enforces the schema and a
#: stray brace fails the whole run. Retrying is cheaper than a custom parser.
_MAX_ATTEMPTS = 3
_RETRYABLE = ("parse LLM response", "llm request failed", "invalid character")


def _executable() -> str:
    exe = shutil.which("officecli")
    if not exe:
        raise RuntimeError(
            "officecli not found on PATH. Install it with: npm install -g officecli"
        )
    return exe


def _environment() -> dict[str, str]:
    """Child env pointing officecli at our own LLM.

    Falls back to the DeepSeek settings the rest of the project already uses so
    a deployment only has to set `DEEPSEEK_API_KEY`.
    """
    key = os.getenv("OFFICE_CLI_LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError(
            "No LLM key for officecli. Set OFFICE_CLI_LLM_API_KEY or DEEPSEEK_API_KEY."
        )

    env = dict(os.environ)
    env.update(
        OFFICE_CLI_RUNTIME="external",
        OFFICE_CLI_LLM_PROVIDER=os.getenv("OFFICE_CLI_LLM_PROVIDER", "openai"),
        OFFICE_CLI_LLM_BASE_URL=os.getenv(
            "OFFICE_CLI_LLM_BASE_URL", "https://api.deepseek.com/v1"
        ),
        OFFICE_CLI_LLM_MODEL=os.getenv("OFFICE_CLI_LLM_MODEL", "deepseek-chat"),
        OFFICE_CLI_LLM_API_KEY=key,
        OFFICE_CLI_LLM_TIMEOUT_SEC=os.getenv("OFFICE_CLI_LLM_TIMEOUT_SEC", "300"),
        # The update check phones home on every invocation and adds seconds.
        OFFICECLI_SKIP_UPDATE_CHECK="1",
    )
    return env


def _apply_sheet_styling(ws, has_header: bool = True):
    """Apply dark navy #1E3A8A headers, thin borders #CBD5E1, and auto-fit column widths."""
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    hdr_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    hdr_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_side = Side(style="thin", color="CBD5E1")
    cell_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

    for row_idx, row in enumerate(ws.iter_rows(), start=1):
        for cell in row:
            cell.border = cell_border
            if row_idx == 1 and has_header:
                cell.fill = hdr_fill
                cell.font = hdr_font
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                if isinstance(cell.value, float):
                    if -1.0 <= cell.value <= 1.0 and cell.value != 0:
                        cell.number_format = "0.0%"
                    else:
                        cell.number_format = '#,##0 "₫"'
                elif isinstance(cell.value, int) and not isinstance(cell.value, bool):
                    cell.number_format = "#,##0"

    # Auto-fit column widths
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)


def _write_workbook(
    rows: Sequence[dict[str, Any]], path: Path, *, period_column: str | None = None
) -> Path:
    """Dump query rows to .xlsx, plus a totals sheet the model can copy verbatim.

    The totals sheet exists because officecli asks the LLM to aggregate the raw
    sheet itself, and it miscounts. Anything we compute here is arithmetic the
    model no longer has to attempt. `period_column`, when given, also grounds
    last-period-vs-previous growth (the other figure officecli gets wrong) via
    `deck.compute_metric` — the same computation slides use, so a report and a
    deck built from the same rows never disagree.
    """
    from openpyxl import Workbook

    from dbgpt_analyst.tools.deck import compute_metric

    columns = list(rows[0].keys())
    wb = Workbook()
    data = wb.active
    data.title = "data"
    data.append(columns)
    for row in rows:
        data.append([row.get(c) for c in columns])

    numeric = [
        c
        for c in columns
        if any(isinstance(r.get(c), (int, float)) and not isinstance(r.get(c), bool) for r in rows)
    ]
    if numeric:
        totals = wb.create_sheet("totals")
        totals.append(["metric", "value"])
        totals.append(["row_count", len(rows)])
        for c in numeric:
            values = [r[c] for r in rows if isinstance(r.get(c), (int, float))]
            totals.append([f"sum_{c}", sum(values)])
            totals.append([f"avg_{c}", sum(values) / len(values)])
            if period_column and period_column in columns and period_column != c:
                try:
                    growth = compute_metric(rows, f"growth:{c}:{period_column}")
                except ValueError:
                    continue
                totals.append([f"growth_{c}", growth])
        _apply_sheet_styling(totals)

    _apply_sheet_styling(data)

    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    return path


def create_multi_sheet_workbook(
    rows: Sequence[dict[str, Any]],
    path: Path,
    *,
    period_column: str | None = None,
    include_summary_formulas: bool = True,
) -> Path:
    """Generate an advanced multi-sheet financial/operational workbook with native formulas.

    Creates interconnected sheets: 'Executive Summary', 'data', 'totals', and 'KPI Metrics'.
    All calculated columns and subtotals utilize native Excel formulas (=SUM, =AVERAGE, =IF, =ROUND).
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    from dbgpt_analyst.tools.deck import compute_metric

    wb = Workbook()
    columns = list(rows[0].keys())
    num_rows = len(rows)

    # 1. Executive Summary Sheet
    ws_exec = wb.active
    ws_exec.title = "Executive Summary"
    ws_exec.append(["Chỉ số Tổng quan", "Giá trị tính toán", "Ghi chú"])
    ws_exec.append(["Tổng số dòng", f"=COUNTA(data!A2:A{num_rows + 1})", "Số bản ghi"])

    numeric = [
        c for c in columns
        if any(isinstance(r.get(c), (int, float)) and not isinstance(r.get(c), bool) for r in rows)
    ]
    for c in numeric:
        ci = columns.index(c)
        col_let = get_column_letter(ci + 1)
        ws_exec.append([f"Tổng {c}", f"=SUM(data!{col_let}2:{col_let}{num_rows + 1})", "Tổng cộng"])
        ws_exec.append([f"Trung bình {c}", f"=ROUND(AVERAGE(data!{col_let}2:{col_let}{num_rows + 1}), 2)", "Bình quân"])
        ws_exec.append([f"Lớn nhất {c}", f"=MAX(data!{col_let}2:{col_let}{num_rows + 1})", "Cực đại"])
        ws_exec.append([f"Nhỏ nhất {c}", f"=MIN(data!{col_let}2:{col_let}{num_rows + 1})", "Cực tiểu"])
        if num_rows >= 2:
            ws_exec.append([
                f"Tăng trưởng {c}",
                f"=IF(data!{col_let}2>0, ROUND(((data!{col_let}{num_rows + 1}-data!{col_let}2)/data!{col_let}2), 4), 0)",
                "Tốc độ tăng trưởng",
            ])

    # 2. Data Sheet
    ws_data = wb.create_sheet("data")
    ws_data.append(columns)
    for r in rows:
        ws_data.append([r.get(c) for c in columns])

    # 3. Totals Sheet
    if numeric:
        ws_totals = wb.create_sheet("totals")
        ws_totals.append(["metric", "value"])
        ws_totals.append(["row_count", len(rows)])
        for c in numeric:
            values = [r[c] for r in rows if isinstance(r.get(c), (int, float))]
            ws_totals.append([f"sum_{c}", sum(values)])
            ws_totals.append([f"avg_{c}", sum(values) / len(values)])
            if period_column and period_column in columns and period_column != c:
                try:
                    growth = compute_metric(rows, f"growth:{c}:{period_column}")
                except ValueError:
                    continue
                ws_totals.append([f"growth_{c}", growth])
        _apply_sheet_styling(ws_totals)

    # 4. KPI Metrics Sheet
    ws_kpi = wb.create_sheet("KPI Metrics")
    ws_kpi.append(["Phân tích", "Công thức", "Trạng thái"])
    ws_kpi.append(["Tỷ trọng tổng thể", f"=SUM('Executive Summary'!B4:B{len(numeric)*4 + 3})", "Tính toán tự động"])

    _apply_sheet_styling(ws_exec)
    _apply_sheet_styling(ws_data)
    _apply_sheet_styling(ws_kpi)

    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    return path


def _build_argv(
    kind: DocKind,
    topic: str,
    out_dir: Path,
    *,
    prompt: str | None,
    data_file: Path | None,
    lang: str,
    extra: Iterable[str] = (),
) -> list[str]:
    argv = [
        _executable(),
        "new",
        kind,
        topic,
        "--mode",
        "fast",  # `best` blocks on an interactive questionnaire.
        "--lang",
        lang,
        "--out",
        str(out_dir),
        "--no-publish",
        "--json",
    ]
    if kind == "pptx":
        # pptx-only flag (officecli rejects it elsewhere). Without it officecli
        # walks the whole workspace looking for reference decks — 190 files in
        # this repo, most of them irrelevant fixtures.
        argv.append("--no-reference-scan")
    if prompt:
        argv += ["--prompt", prompt]
    if data_file is not None:
        argv += ["--file", str(data_file)]
    argv += list(extra)
    return argv


async def generate(
    kind: DocKind,
    topic: str,
    out_dir: str | Path,
    *,
    prompt: str | None = None,
    rows: Sequence[dict[str, Any]] | None = None,
    lang: str = "vi",
    extra_args: Iterable[str] = (),
    period_column: str | None = None,
) -> Path:
    """Generate one document and return the path officecli wrote.

    `rows` are query results. For `report` they become the source workbook
    (officecli reads it directly); for the other kinds there is no file input,
    so they are appended to the prompt instead. `period_column` names the
    time-axis column (e.g. "quy") so the report's totals sheet can also carry
    precomputed growth — see `_write_workbook`.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    data_file: Path | None = None
    if rows:
        if kind == "report":
            data_file = _write_workbook(rows, out_dir / "_source.xlsx", period_column=period_column)
        else:
            prompt = _prompt_with_rows(prompt, rows)

    argv = _build_argv(
        kind, topic, out_dir, prompt=prompt, data_file=data_file, lang=lang, extra=extra_args
    )
    env = _environment()

    last_error = ""
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        raw_out, raw_err = await proc.communicate()
        stdout = raw_out.decode("utf-8", "replace")
        stderr = raw_err.decode("utf-8", "replace")

        if proc.returncode == 0:
            path = Path(json.loads(stdout)["file_path"])
            logger.info("officecli produced %s (attempt %d)", path.name, attempt)
            return path

        last_error = (stderr or stdout).strip()
        if not any(marker in last_error for marker in _RETRYABLE):
            break
        logger.warning("officecli attempt %d failed, retrying: %s", attempt, last_error[:200])

    raise RuntimeError(f"officecli {kind} failed: {last_error[:500]}")


def _prompt_with_rows(prompt: str | None, rows: Sequence[dict[str, Any]]) -> str:
    """Inline the data for kinds that have no --file channel.

    Capped: a deck needs a readable summary, not a thousand-row dump, and the
    rows travel inside a single CLI argument.
    """
    shown = rows[:60]
    body = json.dumps(shown, ensure_ascii=False, default=str)
    note = f" (hiển thị {len(shown)}/{len(rows)} dòng)" if len(rows) > len(shown) else ""
    return (
        f"{prompt or ''}\n\n"
        f"Dữ liệu thật{note}, chỉ dùng đúng các số này, tuyệt đối không bịa thêm:\n{body}"
    ).strip()
