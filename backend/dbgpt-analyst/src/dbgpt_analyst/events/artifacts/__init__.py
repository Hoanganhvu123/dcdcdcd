"""Artifact & Drafting Business Domain Events.

Handles:
- Draft CTA triggers (data-draft-cta)
- Incremental section deltas (artifact.section.delta)
- Revision commits & lockouts (artifact.committed)
"""

from __future__ import annotations

from typing import Any
from ..shared.stream_utils import sse_json


def emit_draft_cta(cta_payload: dict[str, Any]) -> str:
    """Format contextual CTA action to transition user to drafting."""
    payload = cta_payload.get("data", cta_payload) if isinstance(cta_payload, dict) else cta_payload
    return sse_json({"type": "data-draft-cta", "data": payload})


def emit_artifact_delta(artifact_id: str, section_id: str, delta: str, revision: int = 1) -> str:
    """Format incremental clause / section stream into workstation."""
    return sse_json({
        "type": "artifact.section.delta",
        "artifactId": artifact_id,
        "sectionId": section_id,
        "delta": delta,
        "revision": revision,
    })


def emit_artifact_committed(artifact_id: str, revision: int, hash_digest: str) -> str:
    """Format final revision commitment event."""
    return sse_json({
        "type": "artifact.committed",
        "artifactId": artifact_id,
        "revision": revision,
        "hash": hash_digest,
    })


__all__ = [
    "emit_draft_cta",
    "emit_artifact_delta",
    "emit_artifact_committed",
]
