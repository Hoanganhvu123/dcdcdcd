"""Feature flags helper for dbgpt_analyst."""
import os


def is_feature_enabled(flag: str) -> bool:
    val = os.getenv(flag, "true").strip().lower()
    return val in ("1", "true", "yes", "on")
