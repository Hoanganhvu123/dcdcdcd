"""common/auto_model.py — Port từ preferences/aianalytic/backend/common/auto_model.py.

Chỉ port phần dbgpt_analyst cần: `get_gemini_api_key`, `resolve_gemini_model_name`,
`get_auto_model` (auto-select + fallback cascade cho Gemini). Bỏ `get_gemini_client` /
`with_gemini_retry` (không ai gọi tới — YAGNI).
"""

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

# Default primary model mode if not specified in env
DEFAULT_GEMINI_MODEL_MODE = "gemini-2.5-flash-lite"

# Ordered list of Gemini models for automatic fallback cascade when rate limit (429) occurs
GEMINI_FALLBACK_CASCADE = [
    "gemini-2.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
]


def get_gemini_api_key() -> str | None:
    """
    Get the single dedicated GEMINI_API_KEY from environment.
    Relies exclusively on GEMINI_API_KEY.
    """
    import os

    key = os.getenv("GEMINI_API_KEY")
    if key and key.strip():
        return key.strip()

    logger.warning("GEMINI_API_KEY is not set in environment.")
    return None


def resolve_gemini_model_name(
    model_name: str | None = None,
    with_provider_prefix: bool = True,
) -> str:
    """
    Resolve Gemini model name from parameter or environment GEMINI_MODEL_MODE.

    Args:
        model_name: Optional explicit model name (e.g. "gemini-3.6-flash", "google_genai/gemini-2.5-pro", or "auto")
        with_provider_prefix: If True, ensures model name starts with "google_genai/" (for LangChain).

    Returns:
        Resolved model name string.
    """
    import os

    if not model_name or model_name.strip() in ("", "auto", "default"):
        raw_mode = os.getenv("GEMINI_MODEL_MODE", DEFAULT_GEMINI_MODEL_MODE).strip()
    else:
        raw_mode = model_name.strip()

    # Strip provider prefix if present to normalize
    if raw_mode.startswith("google_genai/"):
        clean_name = raw_mode[len("google_genai/"):]
    elif raw_mode.startswith("google/"):
        clean_name = raw_mode[len("google/"):]
    elif raw_mode.startswith("gemini/"):
        clean_name = raw_mode[len("gemini/"):]
    else:
        clean_name = raw_mode

    if with_provider_prefix:
        return f"google_genai/{clean_name}"
    return clean_name


def get_auto_model(
    model_name: str | None = None,
    streaming: bool = True,
    json_mode: bool = False,
    api_key: str | None = None,
    enable_fallback: bool = True,
    **kwargs: Any,
) -> BaseChatModel:
    """
    Centralized factory function to retrieve or instantiate a Gemini BaseChatModel
    with automatic Model Fallback Cascade if enabled.

    If primary model hits rate limits or errors, LangChain will automatically
    switch to fallback models in order.

    Args:
        model_name: Primary model name, "auto", or None.
        streaming: Enable streaming output.
        json_mode: Enable JSON response mode.
        api_key: Optional explicit API key.
        enable_fallback: If True, wraps model with automatic fallback cascade.
        **kwargs: Additional parameters passed to LLMFactory.

    Returns:
        BaseChatModel instance (or RunnableWithFallbacks) configured for Gemini.
    """
    primary_name = resolve_gemini_model_name(model_name, with_provider_prefix=True)
    key_to_use = api_key or get_gemini_api_key()

    from dbgpt_analyst.common.llm_factory import LLMFactory
    factory = LLMFactory.get_instance()

    primary_model = factory.get_model(
        model_name=primary_name,
        streaming=streaming,
        json_mode=json_mode,
        api_key=key_to_use,
        **kwargs,
    )

    if not enable_fallback:
        return primary_model

    # ponytail: `with_fallbacks` trả RunnableWithFallbacks, KHÔNG có `.bind_tools()`
    # trong langchain-core <=1.5 → nhánh model auto của middleware sẽ lỗi khi agent
    # bind tools. Nâng cấp: dùng ExecutionFallbackLLMWrapper (common.model_fallback) — có
    # bind_tools — thay cho with_fallbacks.
    clean_primary = resolve_gemini_model_name(primary_name, with_provider_prefix=False)
    fallback_models = []

    for fb_name in GEMINI_FALLBACK_CASCADE:
        clean_fb = resolve_gemini_model_name(fb_name, with_provider_prefix=False)
        if clean_fb != clean_primary:
            try:
                fb_model_name = f"google_genai/{clean_fb}"
                fb_llm = factory.get_model(
                    model_name=fb_model_name,
                    streaming=streaming,
                    json_mode=json_mode,
                    api_key=key_to_use,
                    **kwargs,
                )
                fallback_models.append(fb_llm)
            except Exception as e:
                logger.debug("Could not load fallback model %s: %s", fb_name, e)

    if fallback_models:
        logger.info(
            "Registered Model Fallback Cascade for %s",
            clean_primary,
        )
        return primary_model.with_fallbacks(fallback_models)

    return primary_model