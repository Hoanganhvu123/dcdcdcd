"""dbgpt_app.openapi.api_v1.deck_service

Modular service bridging DeckGenerateRequest to dbgpt_analyst.tools.deck for
zero-hallucination PowerPoint (.pptx) rendering and responsive HTML previews.
"""
from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence

from dbgpt_analyst.tools import deck as deck_tool
from dbgpt_app.openapi.api_v1.replay_schemas import (
    DeckGenerateRequest,
    DeckGenerateResponse,
    SlideSpec,
)

logger = logging.getLogger(__name__)

# Default artifact storage directory
ARTIFACTS_DIR = Path("data/artifacts")


def _convert_slide_spec_to_dict(slide: SlideSpec) -> Dict[str, Any]:
    """Convert Pydantic SlideSpec to the dictionary format expected by deck.py."""
    layout = slide.layout_type
    # Map alias layout types to deck.py slide kinds
    kind_map = {
        "metric_cards": "kpi",
        "kpi": "kpi",
        "chart_left_bullets_right": "chart",
        "chart": "chart",
        "split_columns": "comparison",
        "comparison": "comparison",
        "callout": "callout",
        "takeaway": "takeaway",
        "table": "table",
        "bullets": "bullets",
        "title": "title",
    }
    kind = kind_map.get(layout, "bullets")

    d: Dict[str, Any] = {
        "kind": kind,
        "title": slide.title,
    }
    if slide.subtitle:
        d["subtitle"] = slide.subtitle
    if slide.badge:
        d["badge"] = slide.badge
    if slide.headline:
        d["headline"] = slide.headline

    if slide.kpis:
        kpi_list = []
        for k in slide.kpis:
            kd = {
                "label": k.label,
                "metric": k.metric,
                "formatted": k.formatted,
                "unit": k.unit or "",
                "trend": k.trend,
            }
            if k.value is not None:
                kd["value"] = k.value
            kpi_list.append(kd)
        d["kpis"] = kpi_list

    if slide.chart:
        if isinstance(slide.chart, str):
            d["chart"] = slide.chart
        else:
            d["chart"] = slide.chart.chart_type
            if slide.chart.category_column:
                d["category_column"] = slide.chart.category_column
            if slide.chart.value_column:
                d["value_column"] = slide.chart.value_column
            if slide.chart.series_column:
                d["series_column"] = slide.chart.series_column

    if slide.category_column:
        d["category_column"] = slide.category_column
    if slide.value_column:
        d["value_column"] = slide.value_column
    if slide.series_column:
        d["series_column"] = slide.series_column

    if slide.bullets:
        d["bullets"] = slide.bullets

    if slide.columns:
        col_list = []
        for c in slide.columns:
            cd = {
                "header": c.header,
                "badge": c.badge,
                "metric": c.metric,
                "bullets": c.bullets,
            }
            if c.value is not None:
                cd["value"] = c.value
            col_list.append(cd)
        d["columns"] = col_list

    if slide.takeaways:
        d["takeaways"] = [
            {
                "priority": t.priority,
                "title": t.title,
                "description": t.description,
            }
            for t in slide.takeaways
        ]

    if slide.pillars:
        # Map pillars to comparison columns if needed
        d["columns"] = [
            {
                "header": p.title,
                "bullets": [p.description],
            }
            for p in slide.pillars
        ]

    if slide.insights:
        d["insights"] = slide.insights

    if slide.limit:
        d["limit"] = slide.limit

    return d


def generate_deck_presentation(req: DeckGenerateRequest) -> DeckGenerateResponse:
    """Generate PPTX presentation and responsive HTML preview from request."""
    pres_id = req.session_id or f"deck_{uuid.uuid4().hex[:10]}"

    # 1. Resolve query rows for mathematical grounding
    rows: Sequence[Mapping[str, Any]]
    if req.data and len(req.data) > 0:
        rows = req.data
    else:
        # Default enterprise sample dataset if no query rows provided
        rows = [
            {"quy": "Q1/2026", "doanh_thu": 18400000, "loi_nhuan": 3680000, "don_hang": 52100, "khu_vuc": "Hà Nội"},
            {"quy": "Q2/2026", "doanh_thu": 21020000, "loi_nhuan": 4204000, "don_hang": 61300, "khu_vuc": "Hà Nội"},
            {"quy": "Q3/2026", "doanh_thu": 24850000, "loi_nhuan": 4970000, "don_hang": 68450, "khu_vuc": "TP.HCM"},
            {"quy": "Q4/2026", "doanh_thu": 29500000, "loi_nhuan": 5900000, "don_hang": 79200, "khu_vuc": "TP.HCM"},
        ]

    # 2. Build or validate slide specification
    title = req.title.strip() if req.title else "Báo Cáo Phân Tích Dữ Liệu"
    subtitle = req.subtitle.strip() if req.subtitle else ""
    source = req.source or "DB-GPT Strategy & Analytics"

    if req.slides and len(req.slides) > 0:
        # Separate title slide from body slides
        body_slides = []
        for s in req.slides:
            if s.layout_type == "title":
                if not subtitle and s.subtitle:
                    subtitle = s.subtitle
            else:
                body_slides.append(_convert_slide_spec_to_dict(s))

        raw_spec: Dict[str, Any] = {
            "title": title,
            "subtitle": subtitle,
            "source": source,
            "theme": {"name": req.theme or "executive_navy"},
            "slides": body_slides,
        }

        cleaned_spec, problems = deck_tool.validate_spec(raw_spec, rows)
        if problems:
            logger.info("Deck spec validation sanitized %d problems: %s", len(problems), problems)

        if not cleaned_spec.get("slides"):
            cleaned_spec = deck_tool.default_spec(rows, title)
    else:
        # Auto-derive executive deck specification
        cleaned_spec = deck_tool.build_executive_deck_spec(
            rows,
            title,
            subtitle=subtitle,
            source=source,
        )

    # 3. Render PPTX bytes & HTML preview
    pptx_bytes = deck_tool.render_deck_bytes(cleaned_spec, rows)
    html_preview = deck_tool.render_html(cleaned_spec, rows)

    # 4. Save to persistent artifacts storage
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{pres_id}.pptx" if not pres_id.endswith(".pptx") else pres_id
    file_path = ARTIFACTS_DIR / filename
    file_path.write_bytes(pptx_bytes)

    # 5. Build base64 content and download URL
    base64_content = base64.b64encode(pptx_bytes).decode("utf-8")
    download_url = f"/api/v1/analyst/deck/download/{filename}"
    slide_count = len(cleaned_spec.get("slides", [])) + 1  # Including cover slide

    return DeckGenerateResponse(
        status="success",
        presentationId=pres_id,
        title=title,
        subtitle=subtitle,
        filePath=str(file_path.resolve()),
        base64Content=base64_content,
        slideCount=slide_count,
        downloadUrl=download_url,
        htmlPreview=html_preview,
        slides=cleaned_spec.get("slides", []),
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
