"""SSE Adapter Façade re-exporting from runtime.sse_adapter."""
from .runtime.sse_adapter import (
    DualFormatStreamAdapter,
    StreamFormat,
)

__all__ = [
    "DualFormatStreamAdapter",
    "StreamFormat",
]
