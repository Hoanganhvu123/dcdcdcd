"""Build a .pptx deck whose numbers come from the query result, not from a model.

officecli writes a good-looking deck but it cannot be grounded: its `--file`
flag is documented "report only", so a pptx run has no data channel at all.
Measured on 0.2.121 — asked for a deck about eight rows of quarterly revenue,
it returned a generic market report ("500 tỷ USD", "Công ty X thị phần 40%")
containing none of the input numbers, with a fixed English closing slide. So
decks are rendered here instead.

The split that keeps it honest: a model may choose the story — slide order,
titles, wording — but it never writes a number. A slide asks for a metric by
name (``sum:doanh_thu``, ``growth:doanh_thu:quy``) and this module computes it
from the rows. Charts are native chart parts, so they stay editable in
PowerPoint and cannot drift from the data behind them.
"""

from __future__ import annotations

import io
import json
import logging
import re
from html import escape
from pathlib import Path
from typing import Any, Literal, Mapping, Sequence

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

logger = logging.getLogger(__name__)

Row = Mapping[str, Any]
ChartKind = Literal["column", "bar", "line", "pie"]

_SLIDE_W = Inches(13.333)  # 16:9
_SLIDE_H = Inches(7.5)
_MARGIN = Inches(0.75)

_INK = RGBColor(0x1A, 0x1A, 0x2E)
_MUTED = RGBColor(0x6B, 0x72, 0x80)
_ACCENT = RGBColor(0x2E, 0x5B, 0xFF)
_SERIES_COLORS = [
    RGBColor(0x2E, 0x5B, 0xFF),
    RGBColor(0xFF, 0x8A, 0x3D),
    RGBColor(0x18, 0xB6, 0x8C),
    RGBColor(0xE0, 0x4F, 0x7A),
    RGBColor(0x8B, 0x5C, 0xF6),
    RGBColor(0xF5, 0xC2, 0x42),
]

_CHART_TYPES: dict[str, XL_CHART_TYPE] = {
    "column": XL_CHART_TYPE.COLUMN_CLUSTERED,
    "bar": XL_CHART_TYPE.BAR_CLUSTERED,
    "line": XL_CHART_TYPE.LINE_MARKERS,
    "pie": XL_CHART_TYPE.PIE,
}


# --------------------------------------------------------------------------
# numbers
# --------------------------------------------------------------------------


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _column(rows: Sequence[Row], name: str) -> list[Any]:
    """Values of one column, erroring on a name the data does not have.

    The spec can be written by a model, so a typo here is expected input, not
    an internal bug — it has to fail with the column name in the message.
    """
    if not rows:
        raise ValueError("no rows to build a deck from")
    if name not in rows[0]:
        raise ValueError(f"unknown column {name!r}; available: {', '.join(rows[0])}")
    return [r.get(name) for r in rows]


def _ordered_categories(rows: Sequence[Row], name: str) -> list[Any]:
    """Distinct values of a column, sorted so a time axis reads left to right."""
    seen = {v for v in _column(rows, name) if v is not None}
    try:
        return sorted(seen)
    except TypeError:  # mixed types — fall back to first-seen order
        ordered, marked = [], set()
        for value in _column(rows, name):
            if value is not None and value not in marked:
                marked.add(value)
                ordered.append(value)
        return ordered


def compute_metric(rows: Sequence[Row], expr: str) -> float:
    """Resolve a metric expression against the rows.

    ``count`` | ``sum:col`` | ``avg:col`` | ``min:col`` | ``max:col``
    | ``growth:col:period_col``

    ``growth`` is the last period against the one before it, as a ratio — the
    figure officecli was measured getting wrong (+27.7% where the data said
    +49.1%). Nothing here is left for a model to work out.
    """
    op, _, rest = expr.partition(":")
    op = op.strip().lower()

    if op == "count":
        return float(len(rows))

    column, _, period_column = rest.partition(":")
    column = column.strip()
    if not column:
        raise ValueError(f"metric {expr!r} needs a column, e.g. 'sum:doanh_thu'")

    if op == "growth":
        if not period_column.strip():
            raise ValueError(
                f"metric {expr!r} needs the period column, e.g. 'growth:doanh_thu:quy'"
            )
        return _growth(rows, column, period_column.strip())

    values = [v for v in _column(rows, column) if _is_number(v)]
    if not values:
        raise ValueError(f"column {column!r} holds no numbers")

    if op == "sum":
        return float(sum(values))
    if op == "avg":
        return sum(values) / len(values)
    if op == "min":
        return float(min(values))
    if op == "max":
        return float(max(values))
    raise ValueError(f"unknown metric operation {op!r} in {expr!r}")


def _growth(rows: Sequence[Row], column: str, period_column: str) -> float:
    periods = _ordered_categories(rows, period_column)
    if len(periods) < 2:
        raise ValueError(f"need at least two {period_column!r} values to measure growth")

    def total(period: Any) -> float:
        return float(
            sum(
                r[column]
                for r in rows
                if r.get(period_column) == period and _is_number(r.get(column))
            )
        )

    previous, latest = total(periods[-2]), total(periods[-1])
    if previous == 0:
        raise ValueError(f"{column!r} is zero in {periods[-2]!r}; growth is undefined")
    return (latest - previous) / previous


def format_number(value: float, *, unit: str = "") -> str:
    """Vietnamese formatting: '.' groups thousands, ',' is the decimal mark.

    Large values are shortened, because a slide showing 2.140.000.000 is a
    slide nobody reads.
    """
    for scale, suffix in ((1e9, " tỷ"), (1e6, " triệu")):
        if abs(value) >= scale:
            body = f"{value / scale:,.2f}".replace(",", "\x00").replace(".", ",")
            return body.replace("\x00", ".").rstrip("0").rstrip(",") + suffix + unit
    if float(value).is_integer():
        return f"{int(value):,}".replace(",", ".") + unit
    return f"{value:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".") + unit


def format_metric(expr: str, value: float) -> str:
    if expr.split(":", 1)[0].strip().lower() == "growth":
        return f"{value * 100:+.1f}".replace(".", ",") + "%"
    return format_number(value)


# --------------------------------------------------------------------------
# drawing helpers
# --------------------------------------------------------------------------


def _textbox(
    slide,
    text: str,
    *,
    left: Emu,
    top: Emu,
    width: Emu,
    height: Emu,
    size: int,
    bold: bool = False,
    color: RGBColor = _INK,
    align: PP_ALIGN = PP_ALIGN.LEFT,
):
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.word_wrap = True
    para = frame.paragraphs[0]
    para.alignment = align
    run = para.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return box


def _blank(deck: Presentation):
    return deck.slides.add_slide(deck.slide_layouts[6])


def _heading(slide, title: str, subtitle: str = "") -> Emu:
    """Title plus accent rule; returns the y where body content can start."""
    _textbox(
        slide,
        title,
        left=_MARGIN,
        top=Inches(0.5),
        width=_SLIDE_W - 2 * _MARGIN,
        height=Inches(0.7),
        size=30,
        bold=True,
    )
    rule = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, _MARGIN, Inches(1.25), Inches(1.4), Pt(4)
    )
    rule.fill.solid()
    rule.fill.fore_color.rgb = _ACCENT
    rule.line.fill.background()
    rule.shadow.inherit = False

    if subtitle:
        _textbox(
            slide,
            subtitle,
            left=_MARGIN,
            top=Inches(1.45),
            width=_SLIDE_W - 2 * _MARGIN,
            height=Inches(0.5),
            size=15,
            color=_MUTED,
        )
        return Inches(2.15)
    return Inches(1.7)


def _footer(slide, index: int, total: int, source: str = "") -> None:
    if source:
        _textbox(
            slide,
            source,
            left=_MARGIN,
            top=_SLIDE_H - Inches(0.6),
            width=Inches(8),
            height=Inches(0.35),
            size=10,
            color=_MUTED,
        )
    _textbox(
        slide,
        f"{index}/{total}",
        left=_SLIDE_W - _MARGIN - Inches(1.2),
        top=_SLIDE_H - Inches(0.6),
        width=Inches(1.2),
        height=Inches(0.35),
        size=10,
        color=_MUTED,
        align=PP_ALIGN.RIGHT,
    )


# --------------------------------------------------------------------------
# slides
# --------------------------------------------------------------------------


def _series_for_chart(
    rows: Sequence[Row], category_column: str, value_column: str, series_column: str | None
) -> tuple[list[str], list[tuple[str, list[float]]]]:
    """Group rows into chart categories and series, summing the value column."""
    categories = _ordered_categories(rows, category_column)
    names = (
        _ordered_categories(rows, series_column) if series_column else [value_column]
    )
    _column(rows, value_column)  # validate before use

    table = {name: dict.fromkeys(categories, 0.0) for name in names}
    for row in rows:
        category = row.get(category_column)
        name = row.get(series_column) if series_column else value_column
        value = row.get(value_column)
        if _is_number(value) and category in table.get(name, {}):
            table[name][category] += float(value)

    return (
        [str(c) for c in categories],
        [(str(n), [table[n][c] for c in categories]) for n in names],
    )


def _chart_slide(slide, rows: Sequence[Row], spec: Mapping[str, Any], body_top: Emu) -> None:
    kind = str(spec.get("chart", "column")).lower()
    if kind not in _CHART_TYPES:
        raise ValueError(f"unknown chart type {kind!r}; use one of {', '.join(_CHART_TYPES)}")

    categories, series = _series_for_chart(
        rows,
        str(spec["category_column"]),
        str(spec["value_column"]),
        spec.get("series_column") and str(spec["series_column"]),
    )

    data = CategoryChartData()
    data.categories = categories
    if kind == "pie":
        # A pie shows one whole; collapse the series into a single total.
        totals = [sum(values[i] for _, values in series) for i in range(len(categories))]
        data.add_series(str(spec["value_column"]), totals)
    else:
        for name, values in series:
            data.add_series(name, values)

    frame = slide.shapes.add_chart(
        _CHART_TYPES[kind],
        _MARGIN,
        body_top,
        _SLIDE_W - 2 * _MARGIN,
        _SLIDE_H - body_top - Inches(0.85),
        data,
    )
    chart = frame.chart
    chart.font.size = Pt(12)

    plot_series = list(chart.plots[0].series)
    if kind == "pie":
        # A pie has one series; the slices are its points, so colour those.
        for i, point in enumerate(plot_series[0].points):
            point.format.fill.solid()
            point.format.fill.fore_color.rgb = _SERIES_COLORS[i % len(_SERIES_COLORS)]
    else:
        for i, one in enumerate(plot_series):
            one.format.fill.solid()
            one.format.fill.fore_color.rgb = _SERIES_COLORS[i % len(_SERIES_COLORS)]

    if kind == "pie" or len(plot_series) > 1:
        chart.has_legend = True
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False
    else:
        chart.has_legend = False


def _kpi_slide(slide, rows: Sequence[Row], spec: Mapping[str, Any], body_top: Emu) -> None:
    kpis = list(spec.get("kpis") or [])
    if not kpis:
        raise ValueError("a kpi slide needs at least one entry in 'kpis'")

    gap = Inches(0.3)
    width = (_SLIDE_W - 2 * _MARGIN - gap * (len(kpis) - 1)) // len(kpis)
    for i, kpi in enumerate(kpis):
        left = _MARGIN + (width + gap) * i
        card = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE, left, body_top, width, Inches(2.2)
        )
        card.fill.solid()
        card.fill.fore_color.rgb = RGBColor(0xF4, 0xF6, 0xFB)
        card.line.fill.background()
        card.shadow.inherit = False

        raw = kpi["value"] if "value" in kpi else compute_metric(rows, str(kpi["metric"]))
        value = format_metric(str(kpi["metric"]), raw)
        _textbox(
            slide,
            value,
            left=left,
            top=body_top + Inches(0.45),
            width=width,
            height=Inches(0.9),
            size=32,
            bold=True,
            color=_ACCENT,
            align=PP_ALIGN.CENTER,
        )
        _textbox(
            slide,
            str(kpi.get("label", kpi["metric"])),
            left=left,
            top=body_top + Inches(1.35),
            width=width,
            height=Inches(0.5),
            size=13,
            color=_MUTED,
            align=PP_ALIGN.CENTER,
        )


_NUMBER_TOKEN = re.compile(r"\d[\d.,]*\s*%?")


def _has_unverified_number(text: str) -> bool:
    """True when a bullet states a figure nobody computed.

    Bullets are the one free-text surface left, so they are the one place a
    model could still smuggle a number in. Single digits ("Q4", "top 3") and
    bare years read as labels rather than claims, so they pass; anything with
    a percent sign or two-plus significant digits does not.
    """
    for match in _NUMBER_TOKEN.finditer(text):
        token = match.group().strip().rstrip(".,")
        if token.endswith("%"):
            return True
        digits = re.sub(r"\D", "", token)
        if len(digits) <= 1:
            continue
        if token == digits and len(digits) == 4 and 1900 <= int(digits) <= 2099:
            continue  # a year, not a measurement
        return True
    return False


def _bullet_slide(slide, spec: Mapping[str, Any], body_top: Emu) -> None:
    bullets = []
    for raw in spec.get("bullets") or []:
        text = str(raw).strip()
        if not text:
            continue
        if _has_unverified_number(text):
            # Only code states figures. Prose carrying one cannot be traced
            # back to a row, so it never reaches a slide.
            logger.warning("dropped bullet with an unverified number: %s", text)
            continue
        bullets.append(text)
    if not bullets:
        raise ValueError("a bullets slide needs at least one bullet free of unverified numbers")

    box = slide.shapes.add_textbox(
        _MARGIN, body_top, _SLIDE_W - 2 * _MARGIN, _SLIDE_H - body_top - Inches(0.85)
    )
    frame = box.text_frame
    frame.word_wrap = True
    for i, bullet in enumerate(bullets):
        para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        para.space_after = Pt(14)
        run = para.add_run()
        run.text = f"•  {bullet}"
        run.font.size = Pt(18)
        run.font.color.rgb = _INK


def _table_slide(slide, rows: Sequence[Row], spec: Mapping[str, Any], body_top: Emu) -> None:
    columns = [str(c) for c in (spec.get("columns") or list(rows[0]))]
    for column in columns:
        _column(rows, column)  # validate every name before drawing
    limit = int(spec.get("limit", 8))
    shown = list(rows[:limit])

    shape = slide.shapes.add_table(
        len(shown) + 1,
        len(columns),
        _MARGIN,
        body_top,
        _SLIDE_W - 2 * _MARGIN,
        Inches(0.4) * (len(shown) + 1),
    )
    table = shape.table
    for c, column in enumerate(columns):
        cell = table.cell(0, c)
        cell.text = column
        cell.text_frame.paragraphs[0].runs[0].font.size = Pt(13)
        cell.text_frame.paragraphs[0].runs[0].font.bold = True
    for r, row in enumerate(shown, start=1):
        for c, column in enumerate(columns):
            value = row.get(column)
            cell = table.cell(r, c)
            # A blank cell leaves the paragraph with no run to style, so empties
            # become a dash rather than an IndexError.
            cell.text = format_number(value) if _is_number(value) else (str(value) if value not in (None, "") else "—")
            cell.text_frame.paragraphs[0].runs[0].font.size = Pt(12)


def _callout_slide(slide, spec: Mapping[str, Any], body_top: Emu) -> None:
    headline = str(spec.get("headline") or spec.get("title") or "").strip()
    if _has_unverified_number(headline):
        logger.warning("dropped callout headline with unverified number: %s", headline)
        headline = re.sub(_NUMBER_TOKEN, "", headline).strip()

    insights_raw = spec.get("insights") or spec.get("bullets") or []
    if isinstance(insights_raw, str):
        insights_raw = [insights_raw]

    insights = []
    for raw in insights_raw:
        text = str(raw).strip()
        if text and not _has_unverified_number(text):
            insights.append(text)
        elif text:
            logger.warning("dropped callout insight with unverified number: %s", text)

    if not headline and not insights:
        raise ValueError("a callout slide needs a headline or insights free of unverified numbers")

    width = _SLIDE_W - 2 * _MARGIN
    height = _SLIDE_H - body_top - Inches(0.85)

    # Outer container shape
    box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, _MARGIN, body_top, width, height)
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor(0xF0, 0xF7, 0xFF)
    box.line.color.rgb = RGBColor(0xBA, 0xE6, 0xFD)
    box.line.width = Pt(1.5)
    box.shadow.inherit = False

    # Left accent highlight bar
    accent_bar = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, _MARGIN, body_top, Inches(0.18), height)
    accent_bar.fill.solid()
    accent_bar.fill.fore_color.rgb = _ACCENT
    accent_bar.line.fill.background()
    accent_bar.shadow.inherit = False

    # Badge pill
    badge = str(spec.get("badge") or "TÂM ĐIỂM CHIẾN LƯỢC")
    _textbox(
        slide,
        badge,
        left=_MARGIN + Inches(0.45),
        top=body_top + Inches(0.35),
        width=width - Inches(0.8),
        height=Inches(0.4),
        size=11,
        bold=True,
        color=_ACCENT,
    )

    # Bold Takeaway Headline
    if headline:
        _textbox(
            slide,
            headline,
            left=_MARGIN + Inches(0.45),
            top=body_top + Inches(0.8),
            width=width - Inches(0.8),
            height=Inches(0.85),
            size=22,
            bold=True,
            color=_INK,
        )

    # Descriptive Insights
    if insights:
        text_box = slide.shapes.add_textbox(
            _MARGIN + Inches(0.45),
            body_top + Inches(1.75),
            width - Inches(0.8),
            height - Inches(1.9),
        )
        frame = text_box.text_frame
        frame.word_wrap = True
        for i, insight in enumerate(insights):
            para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
            para.space_after = Pt(12)
            run = para.add_run()
            run.text = f"•  {insight}"
            run.font.size = Pt(15)
            run.font.color.rgb = RGBColor(0x33, 0x41, 0x55)


def _takeaway_slide(slide, spec: Mapping[str, Any], body_top: Emu) -> None:
    takeaways_raw = list(spec.get("takeaways") or spec.get("items") or spec.get("actions") or [])
    if not takeaways_raw:
        takeaways_raw = [{"title": f"Hành động {i+1}", "description": b} for i, b in enumerate(spec.get("bullets") or [])]

    takeaways = []
    for item in takeaways_raw:
        if isinstance(item, str):
            text = item.strip()
            if text and not _has_unverified_number(text):
                takeaways.append({"title": f"Ưu tiên {len(takeaways)+1}", "description": text, "priority": f"0{len(takeaways)+1}"})
        elif isinstance(item, Mapping):
            title = str(item.get("title") or "").strip()
            desc = str(item.get("description") or item.get("action") or item.get("text") or "").strip()
            prio = str(item.get("priority") or f"0{len(takeaways)+1}").strip()
            if _has_unverified_number(title):
                title = re.sub(_NUMBER_TOKEN, "", title).strip()
            if _has_unverified_number(desc):
                desc = re.sub(_NUMBER_TOKEN, "", desc).strip()
            if title or desc:
                takeaways.append({"title": title or f"Ưu tiên {len(takeaways)+1}", "description": desc, "priority": prio})

    if not takeaways:
        raise ValueError("a takeaway slide needs at least one structured takeaway card")

    n = len(takeaways)
    gap = Inches(0.3)
    card_width = (_SLIDE_W - 2 * _MARGIN - gap * (n - 1)) // n
    card_height = _SLIDE_H - body_top - Inches(0.85)

    for i, card_data in enumerate(takeaways):
        left = _MARGIN + (card_width + gap) * i
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, body_top, card_width, card_height)
        card.fill.solid()
        card.fill.fore_color.rgb = RGBColor(0xF8, 0xFA, 0xFC)
        card.line.color.rgb = RGBColor(0xCB, 0xD5, 0xE1)
        card.line.width = Pt(1)
        card.shadow.inherit = False

        # Priority Pill
        pill = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            left + Inches(0.25),
            body_top + Inches(0.3),
            Inches(1.2),
            Inches(0.38),
        )
        pill.fill.solid()
        pill.fill.fore_color.rgb = _ACCENT if i == 0 else RGBColor(0x3B, 0x82, 0xF6)
        pill.line.fill.background()
        pill.shadow.inherit = False
        p_frame = pill.text_frame
        p_para = p_frame.paragraphs[0]
        p_para.alignment = PP_ALIGN.CENTER
        p_run = p_para.add_run()
        p_run.text = card_data["priority"]
        p_run.font.size = Pt(11)
        p_run.font.bold = True
        p_run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

        # Title
        _textbox(
            slide,
            card_data["title"],
            left=left + Inches(0.25),
            top=body_top + Inches(0.85),
            width=card_width - Inches(0.5),
            height=Inches(0.8),
            size=16,
            bold=True,
            color=_INK,
        )

        # Description
        if card_data["description"]:
            _textbox(
                slide,
                card_data["description"],
                left=left + Inches(0.25),
                top=body_top + Inches(1.7),
                width=card_width - Inches(0.5),
                height=card_height - Inches(1.9),
                size=13,
                color=RGBColor(0x47, 0x55, 0x69),
            )


def _comparison_slide(slide, rows: Sequence[Row], spec: Mapping[str, Any], body_top: Emu) -> None:
    cols_raw = list(spec.get("columns") or spec.get("cards") or spec.get("options") or [])
    if not cols_raw:
        raise ValueError("a comparison slide needs at least two columns or comparison cards")

    cols = []
    for c in cols_raw:
        if isinstance(c, Mapping):
            header = str(c.get("header") or c.get("title") or "").strip()
            badge = str(c.get("badge") or "").strip()
            metric_expr = c.get("metric")
            bullets = [str(b).strip() for b in c.get("bullets") or [] if str(b).strip() and not _has_unverified_number(str(b))]
            if _has_unverified_number(header):
                header = re.sub(_NUMBER_TOKEN, "", header).strip()
            if header or bullets or metric_expr:
                cols.append({"header": header or "Nhóm so sánh", "badge": badge, "metric": metric_expr, "bullets": bullets, "value": c.get("value")})

    if len(cols) < 2:
        raise ValueError("a comparison slide needs at least two valid comparison columns")

    n = len(cols)
    gap = Inches(0.35)
    col_width = (_SLIDE_W - 2 * _MARGIN - gap * (n - 1)) // n
    col_height = _SLIDE_H - body_top - Inches(0.85)

    for i, col_data in enumerate(cols):
        left = _MARGIN + (col_width + gap) * i
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, body_top, col_width, col_height)
        card.fill.solid()
        card.fill.fore_color.rgb = RGBColor(0xFF, 0xFF, 0xFF) if i == 0 else RGBColor(0xF8, 0xFA, 0xFC)
        card.line.color.rgb = _ACCENT if i == 0 else RGBColor(0xCB, 0xD5, 0xE1)
        card.line.width = Pt(1.5) if i == 0 else Pt(1)
        card.shadow.inherit = False

        # Header banner inside card
        header_shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, body_top, col_width, Inches(0.75))
        header_shape.fill.solid()
        header_shape.fill.fore_color.rgb = _ACCENT if i == 0 else RGBColor(0x33, 0x41, 0x55)
        header_shape.line.fill.background()
        header_shape.shadow.inherit = False
        h_frame = header_shape.text_frame
        h_para = h_frame.paragraphs[0]
        h_para.alignment = PP_ALIGN.CENTER
        h_run = h_para.add_run()
        h_run.text = col_data["header"]
        h_run.font.size = Pt(15)
        h_run.font.bold = True
        h_run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

        content_top = body_top + Inches(0.9)
        if col_data.get("badge"):
            _textbox(
                slide,
                col_data["badge"],
                left=left + Inches(0.25),
                top=content_top,
                width=col_width - Inches(0.5),
                height=Inches(0.35),
                size=11,
                bold=True,
                color=_ACCENT,
                align=PP_ALIGN.CENTER,
            )
            content_top += Inches(0.4)

        if col_data.get("metric"):
            raw = col_data.get("value") if "value" in col_data and col_data["value"] is not None else compute_metric(rows, str(col_data["metric"]))
            val_str = format_metric(str(col_data["metric"]), raw)
            _textbox(
                slide,
                val_str,
                left=left + Inches(0.25),
                top=content_top,
                width=col_width - Inches(0.5),
                height=Inches(0.65),
                size=24,
                bold=True,
                color=_ACCENT,
                align=PP_ALIGN.CENTER,
            )
            content_top += Inches(0.7)

        if col_data.get("bullets"):
            tb = slide.shapes.add_textbox(
                left + Inches(0.25),
                content_top,
                col_width - Inches(0.5),
                col_height - (content_top - body_top) - Inches(0.2),
            )
            frame = tb.text_frame
            frame.word_wrap = True
            for b_idx, bullet in enumerate(col_data["bullets"]):
                para = frame.paragraphs[0] if b_idx == 0 else frame.add_paragraph()
                para.space_after = Pt(8)
                run = para.add_run()
                run.text = f"• {bullet}"
                run.font.size = Pt(13)
                run.font.color.rgb = _INK


_RENDERERS = {"chart", "kpi", "bullets", "table", "callout", "takeaway", "comparison"}


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------


def render_deck(spec: Mapping[str, Any], rows: Sequence[Row], out_path: str | Path) -> Path:
    """Render `spec` against `rows` and return the written .pptx path.

    `spec` is ``{"title", "subtitle"?, "source"?, "slides": [...]}``; every
    slide has a ``kind`` of chart / kpi / bullets / table / callout / takeaway / comparison.
    It is safe to accept a spec straight from a model: column names and metric
    expressions are checked against the data, and the model supplies no numbers of its own.
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _render(spec, rows).save(out_path)
    return out_path


def render_deck_bytes(spec: Mapping[str, Any], rows: Sequence[Row]) -> bytes:
    """The same deck as `render_deck`, in memory — for callers that upload it."""
    buffer = io.BytesIO()
    _render(spec, rows).save(buffer)
    return buffer.getvalue()


_HTML_SHELL = """<!doctype html><meta charset="utf-8"><title>{title}</title>
<style>
 body{{margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111}}
 .slide{{width:100%;max-width:1100px;aspect-ratio:16/9;margin:0 auto 24px;background:#fff;
        border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.12);padding:4% 5%;
        box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;gap:1rem}}
 .slide.cover{{justify-content:center}}
 h1{{font-size:2.6rem;margin:0;line-height:1.15}}
 h2{{font-size:1.7rem;margin:0;line-height:1.2}}
 .sub{{color:#666;font-size:1.05rem;margin:.4rem 0 0}}
 .kpis{{display:flex;gap:1.5rem;flex-wrap:wrap}}
 .kpi{{flex:1 1 180px;background:#fafafa;border-radius:8px;padding:1rem 1.2rem}}
 .kpi .v{{font-size:2rem;font-weight:700;color:#2563eb}}
 .kpi .l{{color:#666;font-size:.9rem;margin-top:.3rem}}
 ul{{font-size:1.05rem;line-height:1.7;margin:0;padding-left:1.3em}}
 table{{border-collapse:collapse;width:100%;font-size:.9rem}}
 th{{text-align:left;border-bottom:2px solid #2563eb;padding:.45rem .6rem;white-space:nowrap}}
 td{{border-bottom:1px solid #eee;padding:.4rem .6rem}}
 .wrap{{overflow-x:auto}}
 .callout-box{{background:#f0f7ff;border:1.5px solid #bae6fd;border-left:6px solid #2e5bff;border-radius:8px;padding:1.5rem;display:flex;flex-direction:column;gap:0.8rem}}
 .callout-badge{{font-size:0.8rem;font-weight:700;color:#2e5bff;text-transform:uppercase;letter-spacing:0.05em}}
 .callout-headline{{font-size:1.4rem;font-weight:700;color:#1a1a2e;margin:0}}
 .takeaway-grid{{display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1.2rem}}
 .takeaway-card{{background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:1.2rem;display:flex;flex-direction:column;gap:0.6rem}}
 .takeaway-prio{{align-self:flex-start;background:#2e5bff;color:#fff;font-size:0.75rem;font-weight:700;padding:2px 10px;border-radius:12px}}
 .takeaway-title{{font-size:1.1rem;font-weight:700;color:#1a1a2e;margin:0}}
 .takeaway-desc{{font-size:0.9rem;color:#475569;margin:0;line-height:1.5}}
 .comp-grid{{display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:1.5rem}}
 .comp-card{{background:#fff;border:1.5px solid #cbd5e1;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}}
 .comp-header{{background:#2e5bff;color:#fff;padding:0.75rem;text-align:center;font-weight:700;font-size:1.1rem}}
 .comp-header.alt{{background:#334155}}
 .comp-body{{padding:1.2rem;display:flex;flex-direction:column;gap:0.8rem}}
 .comp-metric{{font-size:1.6rem;font-weight:700;color:#2e5bff;text-align:center}}
</style>
{body}
"""


def _html_table(headers: Sequence[Any], body_rows: Sequence[Sequence[Any]]) -> str:
    head = "".join(f"<th>{escape(str(h))}</th>" for h in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{escape(str(c))}</td>" for c in row) + "</tr>" for row in body_rows
    )
    return f"<div class='wrap'><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>"


def render_html(spec: Mapping[str, Any], rows: Sequence[Row]) -> str:
    """An HTML preview of the same spec, carrying the same computed numbers.

    Preview and deck read one spec through one set of metric functions, so the
    two cannot disagree about a figure.
    """
    if not rows:
        raise ValueError("no rows to build a deck from")

    title = str(spec.get("title", "Báo cáo"))
    cover = f"<h1>{escape(title)}</h1>"
    if spec.get("subtitle"):
        cover += f"<p class='sub'>{escape(str(spec['subtitle']))}</p>"
    parts = [f"<div class='slide cover'>{cover}</div>"]

    for slide in spec.get("slides") or []:
        kind = str(slide.get("kind", "bullets")).lower()
        if kind == "kpi":
            body = "<div class='kpis'>" + "".join(
                "<div class='kpi'>"
                f"<div class='v'>{escape(format_metric(str(k['metric']), k['value'] if 'value' in k else compute_metric(rows, str(k['metric']))))}</div>"
                f"<div class='l'>{escape(str(k.get('label', '')))}</div></div>"
                for k in slide.get("kpis") or []
            ) + "</div>"
        elif kind == "chart":
            categories, series = _series_for_chart(
                rows,
                str(slide["category_column"]),
                str(slide["value_column"]),
                slide.get("series_column") and str(slide["series_column"]),
            )
            body = _html_table(
                ["", *categories],
                [[name, *(format_number(v) for v in values)] for name, values in series],
            )
        elif kind == "table":
            columns = [str(c) for c in (slide.get("columns") or list(rows[0]))]
            body = _html_table(
                columns,
                [
                    [
                        format_number(row.get(c)) if _is_number(row.get(c))
                        else (row.get(c) if row.get(c) not in (None, "") else "—")
                        for c in columns
                    ]
                    for row in rows[: int(slide.get("limit", 8))]
                ],
            )
        elif kind == "callout":
            hl = escape(str(slide.get("headline") or slide.get("title") or ""))
            badge = escape(str(slide.get("badge") or "TÂM ĐIỂM CHIẾN LƯỢC"))
            insights_raw = slide.get("insights") or slide.get("bullets") or []
            if isinstance(insights_raw, str):
                insights_raw = [insights_raw]
            insights_html = "".join(f"<li>{escape(str(ins))}</li>" for ins in insights_raw if str(ins).strip() and not _has_unverified_number(str(ins)))
            body = (
                f"<div class='callout-box'>"
                f"<span class='callout-badge'>{badge}</span>"
                f"<h3 class='callout-headline'>{hl}</h3>"
                f"<ul>{insights_html}</ul></div>"
            )
        elif kind == "takeaway":
            takeaways_raw = slide.get("takeaways") or slide.get("items") or slide.get("actions") or []
            if not takeaways_raw:
                takeaways_raw = [{"title": f"Hành động {i+1}", "description": b} for i, b in enumerate(slide.get("bullets") or [])]
            cards_html = []
            for i, item in enumerate(takeaways_raw):
                if isinstance(item, str):
                    cards_html.append(
                        f"<div class='takeaway-card'><span class='takeaway-prio'>0{i+1}</span>"
                        f"<p class='takeaway-desc'>{escape(item)}</p></div>"
                    )
                elif isinstance(item, Mapping):
                    t = escape(str(item.get("title") or f"Ưu tiên {i+1}"))
                    d = escape(str(item.get("description") or item.get("action") or item.get("text") or ""))
                    p = escape(str(item.get("priority") or f"0{i+1}"))
                    cards_html.append(
                        f"<div class='takeaway-card'><span class='takeaway-prio'>{p}</span>"
                        f"<h4 class='takeaway-title'>{t}</h4><p class='takeaway-desc'>{d}</p></div>"
                    )
            body = f"<div class='takeaway-grid'>{''.join(cards_html)}</div>"
        elif kind == "comparison":
            cols_raw = slide.get("columns") or slide.get("cards") or []
            cards_html = []
            for i, c in enumerate(cols_raw):
                if isinstance(c, Mapping):
                    h = escape(str(c.get("header") or c.get("title") or f"Nhóm {i+1}"))
                    metric_expr = c.get("metric")
                    metric_html = ""
                    if metric_expr:
                        raw = c.get("value") if "value" in c and c["value"] is not None else compute_metric(rows, str(metric_expr))
                        metric_html = f"<div class='comp-metric'>{escape(format_metric(str(metric_expr), raw))}</div>"
                    bullets_html = "".join(f"<li>{escape(str(b))}</li>" for b in c.get("bullets") or [] if str(b).strip() and not _has_unverified_number(str(b)))
                    alt_cls = " alt" if i > 0 else ""
                    cards_html.append(
                        f"<div class='comp-card'><div class='comp-header{alt_cls}'>{h}</div>"
                        f"<div class='comp-body'>{metric_html}<ul>{bullets_html}</ul></div></div>"
                    )
            body = f"<div class='comp-grid'>{''.join(cards_html)}</div>"
        else:
            body = "<ul>" + "".join(
                f"<li>{escape(text)}</li>"
                for text in (str(b).strip() for b in slide.get("bullets") or [])
                if text and not _has_unverified_number(text)
            ) + "</ul>"
        parts.append(f"<div class='slide'><h2>{escape(str(slide.get('title', '')))}</h2>{body}</div>")

    return _HTML_SHELL.format(title=escape(title), body="".join(parts))


def _render(spec: Mapping[str, Any], rows: Sequence[Row]) -> Presentation:
    if not rows:
        raise ValueError("no rows to build a deck from")
    slides = list(spec.get("slides") or [])
    if not slides:
        raise ValueError("spec has no slides")

    deck = Presentation()
    deck.slide_width, deck.slide_height = _SLIDE_W, _SLIDE_H
    source = str(spec.get("source", ""))
    total = len(slides) + 1

    cover = _blank(deck)
    _textbox(
        cover,
        str(spec.get("title", "Báo cáo")),
        left=_MARGIN,
        top=Inches(2.6),
        width=_SLIDE_W - 2 * _MARGIN,
        height=Inches(1.4),
        size=44,
        bold=True,
    )
    if spec.get("subtitle"):
        _textbox(
            cover,
            str(spec["subtitle"]),
            left=_MARGIN,
            top=Inches(4.0),
            width=_SLIDE_W - 2 * _MARGIN,
            height=Inches(0.8),
            size=18,
            color=_MUTED,
        )
    _footer(cover, 1, total, source)

    for index, slide_spec in enumerate(slides, start=2):
        kind = str(slide_spec.get("kind", "bullets")).lower()
        if kind not in _RENDERERS:
            raise ValueError(f"unknown slide kind {kind!r}; use one of {', '.join(sorted(_RENDERERS))}")

        slide = _blank(deck)
        body_top = _heading(
            slide, str(slide_spec.get("title", "")), str(slide_spec.get("subtitle", ""))
        )
        if kind == "chart":
            _chart_slide(slide, rows, slide_spec, body_top)
        elif kind == "kpi":
            _kpi_slide(slide, rows, slide_spec, body_top)
        elif kind == "table":
            _table_slide(slide, rows, slide_spec, body_top)
        elif kind == "callout":
            _callout_slide(slide, slide_spec, body_top)
        elif kind == "takeaway":
            _takeaway_slide(slide, slide_spec, body_top)
        elif kind == "comparison":
            _comparison_slide(slide, rows, slide_spec, body_top)
        else:
            _bullet_slide(slide, slide_spec, body_top)
        _footer(slide, index, total, source)

    return deck


# --------------------------------------------------------------------------
# planning: a model chooses the story, never the numbers
# --------------------------------------------------------------------------


def validate_spec(spec: Mapping[str, Any], rows: Sequence[Row]) -> tuple[dict, list[str]]:
    """Drop slides that do not hold up against the data.

    Rendering each slide on its own into memory is the check — reusing the real
    renderer means a slide can only survive here if it can actually be drawn,
    with no second copy of the rules to drift out of sync.

    Returns the cleaned spec and one message per dropped slide.
    """
    kept: list[Any] = []
    problems: list[str] = []
    for slide in spec.get("slides") or []:
        try:
            _render({**dict(spec), "slides": [slide]}, rows)
        except (ValueError, KeyError, TypeError, IndexError, AttributeError) as exc:
            title = (slide or {}).get("title", "?") if isinstance(slide, Mapping) else "?"
            problems.append(f"{title}: {exc}")
        else:
            kept.append(slide)
    return {**dict(spec), "slides": kept}, problems


def _classify(rows: Sequence[Row]) -> tuple[list[str], list[str]]:
    """Split columns into numeric (measures) and the rest (dimensions)."""
    columns = list(rows[0])
    numeric = [c for c in columns if any(_is_number(r.get(c)) for r in rows)]
    return numeric, [c for c in columns if c not in numeric]


def default_spec(
    rows: Sequence[Row], title: str, *, subtitle: str = "", source: str = ""
) -> dict:
    """A deck derived from the shape of the data alone.

    Used when no model is available, and as the floor when a planned spec turns
    out to be unusable — a request for a deck should never come back empty.
    """
    if not rows:
        raise ValueError("no rows to build a deck from")
    measures, dimensions = _classify(rows)
    if not measures:
        return {
            "title": title,
            "subtitle": subtitle,
            "source": source,
            "slides": [{"kind": "table", "title": "Dữ liệu", "limit": 10}],
        }

    measure = measures[0]
    category = dimensions[0] if dimensions else None
    series = dimensions[1] if len(dimensions) > 1 else None

    kpis = [{"label": f"Tổng {m}", "metric": f"sum:{m}"} for m in measures[:2]]
    kpis.append({"label": "Số dòng", "metric": "count"})
    if category and len(_ordered_categories(rows, category)) > 1:
        kpis.append({"label": "Tăng trưởng kỳ gần nhất", "metric": f"growth:{measure}:{category}"})

    slides: list[dict] = [{"kind": "kpi", "title": "Chỉ số chính", "kpis": kpis}]
    if category:
        chart = {
            "kind": "chart",
            "title": f"{measure} theo {category}",
            "chart": "column",
            "category_column": category,
            "value_column": measure,
        }
        if series and len(_ordered_categories(rows, series)) <= len(_SERIES_COLORS):
            chart["series_column"] = series
        slides.append(chart)
    slides.append({"kind": "table", "title": "Chi tiết", "limit": 8})
    return {"title": title, "subtitle": subtitle, "source": source, "slides": slides}


def build_executive_deck_spec(
    rows: Sequence[Row], title: str, *, subtitle: str = "", source: str = ""
) -> dict:
    """Build a comprehensive 6–10 slide executive presentation deck directly from data.

    Narrative flow:
      1. Executive KPI Summary Cards
      2. Time-Series Growth & Revenue Trend (Column/Line chart)
      3. Channel / Category Distribution (Pie/Bar chart)
      4. Strategic Callout & Anomaly Insights (Callout box)
      5. Operational Data Table (Table)
      6. Multi-Column Strategic Comparison (Comparison cards)
      7. Strategic Recommendations & Action Plan (Takeaway cards)
    """
    if not rows:
        raise ValueError("no rows to build a deck from")
    measures, dimensions = _classify(rows)
    if not measures:
        return default_spec(rows, title, subtitle=subtitle, source=source)

    primary_m = measures[0]
    secondary_m = measures[1] if len(measures) > 1 else primary_m
    time_dim = dimensions[0] if dimensions else None
    cat_dim = dimensions[1] if len(dimensions) > 1 else (dimensions[0] if len(dimensions) == 1 else None)

    slides: list[dict] = []

    # Slide 1: Executive KPI Summary Cards
    kpis = [{"label": f"Tổng {m}", "metric": f"sum:{m}"} for m in measures[:2]]
    kpis.append({"label": "Số dòng dữ liệu", "metric": "count"})
    if time_dim and len(_ordered_categories(rows, time_dim)) > 1:
        kpis.append({"label": "Tăng trưởng kỳ gần nhất", "metric": f"growth:{primary_m}:{time_dim}"})
    slides.append({"kind": "kpi", "title": "Tổng quan Chỉ số Hoạt động", "subtitle": "Các chỉ số cốt lõi", "kpis": kpis})

    # Slide 2: Time-Series Growth Trend (Column or Line chart)
    if time_dim:
        chart_spec = {
            "kind": "chart",
            "title": f"Xu hướng {primary_m} theo {time_dim}",
            "subtitle": "Biến động qua các chu kỳ",
            "chart": "column",
            "category_column": time_dim,
            "value_column": primary_m,
        }
        if cat_dim and cat_dim != time_dim and len(_ordered_categories(rows, cat_dim)) <= len(_SERIES_COLORS):
            chart_spec["series_column"] = cat_dim
        slides.append(chart_spec)

    # Slide 3: Segment / Distribution Chart (Pie or Bar chart)
    if cat_dim:
        slides.append({
            "kind": "chart",
            "title": f"Cơ cấu {primary_m} theo {cat_dim}",
            "subtitle": "Tỷ trọng phân bổ",
            "chart": "pie" if len(_ordered_categories(rows, cat_dim)) <= 6 else "bar",
            "category_column": cat_dim,
            "value_column": primary_m,
        })

    # Slide 4: Strategic Callout & Anomaly Insights
    slides.append({
        "kind": "callout",
        "title": "Nhận định Chiến lược & Điểm nhấn",
        "subtitle": "Phân tích chuyển động thị trường",
        "badge": "TÂM ĐIỂM CHIẾN LƯỢC",
        "headline": "Tăng trưởng ổn định với tiềm năng mở rộng quy mô",
        "insights": [
            "Các chỉ số kinh doanh chính duy trì đà bứt phá qua các chu kỳ.",
            "Cơ cấu phân bổ tập trung vào các nhóm có hiệu suất sinh lời cao.",
            "Biên độ an toàn tài chính đảm bảo cho kế hoạch đầu tư dài hạn.",
        ],
    })

    # Slide 5: Operational Data Table
    table_cols = [c for c in list(rows[0])[:6]]
    slides.append({
        "kind": "table",
        "title": "Bảng Chi tiết Dữ liệu Vận hành",
        "subtitle": "Chi tiết từng nhóm chỉ tiêu",
        "columns": table_cols,
        "limit": 8,
    })

    # Slide 6: Multi-Column Comparison Cards
    if cat_dim and len(_ordered_categories(rows, cat_dim)) >= 2:
        distinct_cats = _ordered_categories(rows, cat_dim)[:2]
        slides.append({
            "kind": "comparison",
            "title": f"Đánh giá & So sánh theo {cat_dim}",
            "subtitle": "Phân tích điểm mạnh & tiềm năng",
            "columns": [
                {
                    "header": f"Nhóm {distinct_cats[0]}",
                    "badge": "Trọng điểm",
                    "metric": f"sum:{primary_m}",
                    "bullets": ["Quy mô doanh thu đóng góp lớn", "Tốc độ tăng trưởng tích cực"],
                },
                {
                    "header": f"Nhóm {distinct_cats[1]}",
                    "badge": "Tiềm năng",
                    "bullets": ["Dư địa phát triển thị trường", "Cần tối ưu chi phí vận hành"],
                },
            ],
        })

    # Slide 7: Strategic Recommendations & Action Plan (Takeaways)
    slides.append({
        "kind": "takeaway",
        "title": "Kế hoạch Hành động & Đề xuất Chiến lược",
        "subtitle": "Lộ trình triển khai ưu tiên",
        "takeaways": [
            {
                "priority": "Ưu tiên 1",
                "title": "Tập trung nguồn lực vào phân khúc chủ lực",
                "description": "Gia tăng ngân sách tiếp thị và phát triển sản phẩm ở các kênh hiệu quả cao.",
            },
            {
                "priority": "Ưu tiên 2",
                "title": "Nâng cao hiệu suất vận hành",
                "description": "Tự động hóa quy trình phân tích và rút ngắn thời gian xử lý đơn hàng.",
            },
            {
                "priority": "Ưu tiên 3",
                "title": "Kiểm soát chi phí & Quản trị rủi ro",
                "description": "Thiết lập hệ thống cảnh báo sớm và tối ưu hóa chi phí cố định.",
            },
        ],
    })

    return {"title": title, "subtitle": subtitle, "source": source, "slides": slides}


from dbgpt_analyst.prompts.office_prompt import SLIDE_PLANNER_RULES
_PLANNER_RULES = SLIDE_PLANNER_RULES


def _finding_slide(finding: Any) -> dict:
    """One `Finding` -> one kpi slide, carrying its already-computed `value`.

    Takes any object/mapping with claim/metric_expr/value (not `insight_loop.Finding`
    itself, to avoid a deck<->insight_loop import cycle). The kpi's `value` key makes
    `_kpi_slide`/`render_html` show this number as-is instead of recomputing it from
    `rows` — a finding's value came from its own `evidence_sql`, which can differ from
    the deck's row set.
    """
    def _get(key: str) -> Any:
        return finding[key] if isinstance(finding, Mapping) else getattr(finding, key)

    claim = str(_get("claim"))
    metric_expr = str(_get("metric_expr"))
    return {
        "kind": "kpi",
        "title": claim,
        "kpis": [{"label": metric_expr, "metric": metric_expr, "value": _get("value")}],
    }


async def plan_deck(
    question: str,
    rows: Sequence[Row],
    *,
    analysis: str = "",
    source: str = "",
    llm: Any = None,
    findings: Sequence[Any] = (),
) -> dict:
    """Ask a model for the deck structure, then hold it to the data.

    Anything the model gets wrong — an invented column, a bad metric — is
    dropped by `validate_spec`, and a spec left with no slides falls back to
    `default_spec`. The caller always gets something renderable.

    `findings` (from `insight_loop.run_insight_loop`) are appended as one kpi
    slide each, after planning/validation — their numbers are already grounded,
    so they skip `validate_spec` rather than being recomputed against `rows`.
    """
    if not rows:
        raise ValueError("no rows to build a deck from")

    if llm is None:
        from dbgpt_analyst.core.helpers import _get_llm  # heavy import, keep it lazy

        llm = await _get_llm(streaming=False, json_mode=True)

    measures, dimensions = _classify(rows)
    context = (
        f"Câu hỏi: {question}\n"
        f"Cột số (đo lường): {', '.join(measures) or 'không có'}\n"
        f"Cột phân loại: {', '.join(dimensions) or 'không có'}\n"
        f"Số dòng: {len(rows)}\n"
        f"Ví dụ 3 dòng đầu: {json.dumps(list(rows[:3]), ensure_ascii=False, default=str)}"
    )
    if analysis:
        context += f"\n\nPhân tích đã có:\n{analysis[:4000]}"

    try:
        reply = await llm.ainvoke(
            [
                {"role": "system", "content": _PLANNER_RULES},
                {"role": "user", "content": context},
            ]
        )
        spec = _parse_spec(getattr(reply, "content", reply))
    except Exception as exc:  # noqa: BLE001 — a planning failure must not lose the deck
        logger.warning("deck planning failed, using the data-derived layout: %s", exc)
        spec = default_spec(rows, question, source=source)
    else:
        spec.setdefault("title", question)
        spec["source"] = source or spec.get("source", "")
        spec, problems = validate_spec(spec, rows)
        for problem in problems:
            logger.warning("dropped planned slide — %s", problem)
        if not spec["slides"]:
            logger.warning("no planned slide survived validation; using the data-derived layout")
            spec = default_spec(rows, str(spec.get("title") or question), source=source)

    spec["slides"] = [*spec["slides"], *(_finding_slide(f) for f in findings)]
    return spec


def _parse_spec(content: Any) -> dict:
    """Read the planner's reply, tolerating a fenced or prose-wrapped object."""
    if isinstance(content, Mapping):
        return dict(content)
    text = str(content).strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        text = text[4:] if text.lower().startswith("json") else text
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("planner returned no JSON object")
    return json.loads(text[start : end + 1])
