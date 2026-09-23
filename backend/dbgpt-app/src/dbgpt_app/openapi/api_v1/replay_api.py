"""dbgpt_app.openapi.api_v1.replay_api

FastAPI OpenAPI Router for DB-GPT Replay Subsystem:
- GET /api/v1/replay/sessions: Paginated session list with filtering
- GET /api/v1/replay/session/{session_id}: Full session trace detail
- GET /api/v1/replay/session/{session_id}/stream: Server-Sent Events (SSE) live replay stream with speed multiplier
- POST /api/v1/replay/deck/generate: Slide deck generator alias
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, StreamingResponse

from dbgpt_app.openapi.api_v1.deck_service import generate_deck_presentation
from dbgpt_app.openapi.api_v1.replay_schemas import (
    DeckGenerateRequest,
    DeckGenerateResponse,
    ReplaySessionDetailResponse,
    ReplaySessionListResponse,
)
from dbgpt_app.openapi.api_v1.seed_replay_data import get_replay_repository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/replay", tags=["Replay"])


@router.get("/sessions", response_model=ReplaySessionListResponse)
async def list_replay_sessions(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize", description="Items per page"),
    status: Optional[str] = Query(default=None, description="Filter by status: running, completed, failed, all"),
    search: Optional[str] = Query(default=None, description="Search term matching title, prompt, or tags"),
    artifact_kind: Optional[str] = Query(default=None, alias="artifactKind", description="Filter by artifact kind: slide, sheet, doc, chart"),
    model: Optional[str] = Query(default=None, description="Filter by reasoning model"),
) -> ReplaySessionListResponse:
    """List replayable execution sessions with pagination, metadata, and artifact tags."""
    repo = get_replay_repository()
    return repo.list_sessions(
        page=page,
        page_size=page_size,
        search=search,
        status=status,
        artifact_kind=artifact_kind,
        model=model,
    )


@router.get("/session/{session_id}", response_model=ReplaySessionDetailResponse)
async def get_replay_session_detail(
    session_id: str,
) -> ReplaySessionDetailResponse:
    """Retrieve full granular execution trace snapshot for a replay session."""
    repo = get_replay_repository()
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Replay session '{session_id}' not found.",
        )
    return ReplaySessionDetailResponse(
        code=0,
        message="success",
        data=session,
    )


@router.get("/session/{session_id}/stream")
async def stream_replay_session(
    session_id: str,
    speed: float = Query(default=1.0, ge=0.0, le=20.0, description="Replay speed multiplier (0.0 = instant)"),
):
    """Stream replay session step-by-step as real-time Server-Sent Events (SSE).
    
    Streams frames formatted as:
    event: <event_type>
    data: <json_payload>
    """
    repo = get_replay_repository()
    session = repo.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Replay session '{session_id}' not found.",
        )

    return StreamingResponse(
        repo.stream_session_events(session_id, speed=speed),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/deck/generate", response_model=DeckGenerateResponse)
async def generate_deck_alias(req: DeckGenerateRequest) -> DeckGenerateResponse:
    """Generate a PowerPoint (.pptx) presentation and responsive HTML preview (Replay alias)."""
    try:
        return generate_deck_presentation(req)
    except Exception as exc:
        logger.exception("Deck generation failed in replay alias: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deck generation failed: {exc}",
        )
