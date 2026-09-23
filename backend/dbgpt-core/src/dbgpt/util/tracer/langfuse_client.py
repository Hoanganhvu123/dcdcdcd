import base64
import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

import requests

from dbgpt.component import BaseComponent
from dbgpt.util.tracer.tracer_impl import TracerParameters

logger = logging.getLogger(__name__)

_langfuse_client: Any = None
_lock: threading.Lock = threading.Lock()

try:
    from langfuse import Langfuse as _Langfuse
    from langfuse import get_client as _get_client
    from langfuse import observe as _observe
except ImportError:
    _Langfuse = None
    _get_client = None
    _observe = None

TRACE_CONFIG_COMPONENT_NAME = "dbgpt_tracer_config"


def _get_credentials():
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
    return public_key, secret_key, host


def init_langfuse(
    public_key: Optional[str] = None,
    secret_key: Optional[str] = None,
    host: Optional[str] = None,
) -> Optional[Any]:
    global _langfuse_client

    if _Langfuse is None:
        logger.warning("langfuse package not installed, init_langfuse() is a no-op")
        return None

    if public_key is None or secret_key is None:
        public_key, secret_key, host = _get_credentials()

    if not public_key or not secret_key:
        logger.warning(
            "Langfuse keys not configured, init_langfuse() is a no-op"
        )
        return None

    if _langfuse_client is not None:
        return _langfuse_client

    with _lock:
        if _langfuse_client is not None:
            return _langfuse_client
        host = host or "https://cloud.langfuse.com"
        logger.info("Initializing Langfuse client: host=%s", host)
        _langfuse_client = _Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=host,
        )
        return _langfuse_client


def flush_langfuse() -> None:
    if _get_client is None:
        return
    try:
        _get_client().flush()
        logger.debug("Langfuse client flushed")
    except Exception:
        logger.warning("Failed to flush Langfuse client", exc_info=True)


def get_langfuse_decorator(
    public_key: Optional[str] = None,
    secret_key: Optional[str] = None,
    host: Optional[str] = None,
) -> Optional[Callable]:
    if _observe is None:
        return None

    if public_key is None or secret_key is None:
        public_key, secret_key, host = _get_credentials()

    client = init_langfuse(public_key, secret_key, host)
    if client is None:
        return None
    return _observe


class TracerParametersComponent(BaseComponent):
    """Expose the running :class:`TracerParameters` (TOML config) via ``system_app``.

    ``TracerParameters`` is a dataclass, not a ``BaseComponent``, so wrap it to make
    it retrievable with ``system_app.get_component`` — same pattern as
    ``ComponentType.TRACER_SPAN_STORAGE``.
    """

    name = TRACE_CONFIG_COMPONENT_NAME

    def __init__(self, tracer_parameters: Optional[TracerParameters] = None):
        self.tracer_parameters = tracer_parameters
        super().__init__()

    def init_app(self, system_app):
        pass


def register_trace_config(
    system_app, tracer_parameters: Optional[TracerParameters] = None
) -> None:
    """Register the running trace config on ``system_app``.

    TOML config must win over env: this object is the single source of truth, it
    already fell back to env vars in ``TracerParameters.__post_init__``.
    """
    if system_app is None:
        return
    if (
        system_app.get_component(
            TRACE_CONFIG_COMPONENT_NAME, TracerParametersComponent, None
        )
        is not None
    ):
        return
    system_app.register_instance(TracerParametersComponent(tracer_parameters))


def get_trace_config(system_app) -> Optional[TracerParameters]:
    """Return the registered tracer config (TOML) or None."""
    if system_app is None:
        return None
    component = system_app.get_component(
        TRACE_CONFIG_COMPONENT_NAME, TracerParametersComponent, None
    )
    return component.tracer_parameters if component else None


def get_langfuse_decorator_for_system(system_app=None) -> Optional[Callable]:
    """Build the ``@observe`` decorator from the running trace config (TOML wins).

    Falls back to env vars only when no trace config is registered (e.g. outside the
    webserver).
    """
    trace_config = get_trace_config(system_app)
    if trace_config is None:
        return get_langfuse_decorator()
    return get_langfuse_decorator(
        trace_config.langfuse_public_key,
        trace_config.langfuse_secret_key,
        trace_config.langfuse_host,
    )


class LangfuseAnalyticsClient:
    def __init__(self, params: Optional[TracerParameters] = None):
        if params and params.langfuse_public_key and params.langfuse_secret_key:
            self.base_url = (params.langfuse_host or "https://cloud.langfuse.com").rstrip("/")
            self.public_key = params.langfuse_public_key
            self.secret_key = params.langfuse_secret_key
        else:
            self.base_url = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com").rstrip("/")
            self.public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
            self.secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")

        if not self.public_key or not self.secret_key:
            logger.warning("Langfuse credentials not set. Analytics client will fail.")

    def _get_auth_headers(self) -> dict[str, str]:
        if not self.public_key or not self.secret_key:
            return {}
        credentials = f"{self.public_key}:{self.secret_key}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        return {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/json",
        }

    def get_daily_metrics(
        self,
        user_id: str,
        days: int = 30,
        service: str | None = None,
    ) -> dict[str, Any]:
        if not self.public_key:
            return self._get_mock_metrics()

        try:
            params = {
                "userId": user_id,
                "limit": 1000,
                "fromTimestamp": (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(),
            }

            response = requests.get(
                f"{self.base_url}/api/public/traces",
                headers=self._get_auth_headers(),
                params=params,
                timeout=10,
            )

            if response.status_code != 200:
                logger.error(f"Langfuse API error: {response.text}")
                return self._get_mock_metrics()

            data = response.json()
            traces = data.get("data", [])

            if service:
                filtered_traces = []
                for t in traces:
                    metadata = t.get("metadata") or {}
                    trace_metadata = metadata if isinstance(metadata, dict) else {}
                    if trace_metadata.get("service") == service:
                        filtered_traces.append(t)
                traces = filtered_traces

            total_requests = len(traces)
            total_cost = sum(t.get("totalCost", 0) or 0 for t in traces)

            total_tokens = 0
            for t in traces:
                usage = t.get("usage") or {}
                total_tokens += usage.get("total", 0) or 0

            return {
                "total_requests": total_requests,
                "total_cost_usd": total_cost,
                "total_tokens": total_tokens,
                "usage_limit": 1000,
                "usage_percentage": min(int((total_requests / 1000) * 100), 100),
                "service": service or "all",
            }

        except Exception as e:
            logger.error(f"Error fetching Langfuse metrics: {e}")
            return self._get_mock_metrics()

    def get_recent_traces(
        self,
        user_id: str,
        limit: int = 10,
        service: str | None = None,
    ) -> list[dict[str, Any]]:
        if not self.public_key:
            return []

        try:
            params = {
                "userId": user_id,
                "limit": limit * 3 if not service else limit,
                "orderBy": "timestamp.desc",
            }

            response = requests.get(
                f"{self.base_url}/api/public/traces",
                headers=self._get_auth_headers(),
                params=params,
                timeout=10,
            )

            if response.status_code != 200:
                logger.error(f"Langfuse API error: {response.status_code}")
                return []

            raw_traces = response.json().get("data", [])

            if service:
                filtered_traces = []
                for t in raw_traces:
                    metadata = t.get("metadata") or {}
                    trace_metadata = metadata if isinstance(metadata, dict) else {}
                    if trace_metadata.get("service") == service:
                        filtered_traces.append(t)
                        if len(filtered_traces) >= limit:
                            break
                raw_traces = filtered_traces

            formatted_traces = []

            for t in raw_traces[:limit]:
                usage = t.get("usage") or {}
                input_tokens = usage.get("input", 0) or 0
                output_tokens = usage.get("output", 0) or 0

                metadata = t.get("metadata") or {}
                trace_metadata = metadata if isinstance(metadata, dict) else {}
                service_name = trace_metadata.get("service", "unknown")

                formatted_trace = {
                    "trace_id": t.get("id"),
                    "question": str(t.get("input") or "")[:100],
                    "duration_ms": int((t.get("latency", 0) or 0) * 1000),
                    "total_cost": t.get("totalCost", 0) or 0,
                    "timestamp": self._format_relative_time(t.get("timestamp")),
                    "service": service_name,
                    "steps": [
                        {
                            "name": "generate-answer",
                            "type": "generation",
                            "duration_ms": int((t.get("latency", 0) or 0) * 1000),
                            "tokens": {
                                "input": input_tokens,
                                "output": output_tokens,
                            },
                            "cost_usd": t.get("totalCost", 0) or 0,
                        }
                    ],
                }

                formatted_traces.append(formatted_trace)

            return formatted_traces

        except Exception as e:
            logger.error(f"Error fetching recent traces: {e}")
            return []

    def get_metrics_by_service(
        self, user_id: str, days: int = 30
    ) -> dict[str, dict[str, Any]]:
        services = [
            "chat_with_db_execute",
            "chat_excel",
            "chat_dashboard",
            "chat_knowledge",
            "react_agent",
        ]
        result = {}

        for service in services:
            result[service] = self.get_daily_metrics(user_id, days=days, service=service)

        total_metrics = self.get_daily_metrics(user_id, days=days, service=None)
        result["total"] = total_metrics

        return result

    def _format_relative_time(self, timestamp_str: str) -> str:
        if not timestamp_str:
            return ""
        try:
            dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            now = datetime.now(dt.tzinfo)
            diff = now - dt

            if diff.days > 0:
                return f"{diff.days} ngày trước"
            hours = diff.seconds // 3600
            if hours > 0:
                return f"{hours} giờ trước"
            minutes = (diff.seconds % 3600) // 60
            return f"{minutes} phút trước"
        except Exception:
            return timestamp_str

    def _get_mock_metrics(self):
        return {
            "total_requests": 0,
            "total_cost_usd": 0.0,
            "total_tokens": 0,
            "usage_limit": 100,
            "usage_percentage": 0,
        }