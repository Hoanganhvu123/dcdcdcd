import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from dbgpt._private.config import Config
from dbgpt.util.tracer.langfuse_client import LangfuseAnalyticsClient, get_trace_config
from dbgpt_serve.utils.auth import UserRequest, get_user_from_headers

logger = logging.getLogger(__name__)
router = APIRouter()
CFG = Config()


@router.get("/v1/observability/metrics")
async def observability_metrics(
    days: int = Query(default=30, description="Number of days to look back"),
    service: Optional[str] = Query(
        default=None, description="Service filter (chat_with_db_execute, etc.)"
    ),
    user_info: UserRequest = Depends(get_user_from_headers),
):
    client = LangfuseAnalyticsClient(params=get_trace_config(CFG.SYSTEM_APP))
    return client.get_daily_metrics(
        user_id=user_info.user_id, days=days, service=service
    )


@router.get("/v1/observability/traces")
async def observability_traces(
    limit: int = Query(default=10, description="Number of traces to return"),
    service: Optional[str] = Query(
        default=None, description="Service filter (chat_with_db_execute, etc.)"
    ),
    user_info: UserRequest = Depends(get_user_from_headers),
):
    client = LangfuseAnalyticsClient(params=get_trace_config(CFG.SYSTEM_APP))
    return client.get_recent_traces(
        user_id=user_info.user_id, limit=limit, service=service
    )