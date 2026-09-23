"""common/llm_factory.py — Port từ preferences/aianalytic/backend/common/llm_factory.py.

DB-GPT core (DefaultLLMClient/WorkerManager) KHÔNG có tool-calling — dbgpt_analyst dùng
DeepAgents SDK, bắt buộc LangChain BaseChatModel .bind_tools(). Vì vậy dùng thẳng
langchain init_chat_model() đa provider y hệt nguồn, KHÔNG wrap DefaultLLMClient.
"""

import logging
import os
import threading
from typing import Any, cast

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

load_dotenv()

logger = logging.getLogger(__name__)


class LLMFactory:
    """
    Singleton quản lý khởi tạo và caching LLM Models.
    """

    _instance = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def __init__(self):
        # Cache dict: Key=(model_name, streaming, json_mode, api_key), Value=LLM Instance
        self._cache: dict[tuple[str, bool, bool, str | None], BaseChatModel] = {}

    def get_model(
        self,
        model_name: str,
        streaming: bool = True,
        json_mode: bool = False,
        api_key: str | None = None,
        response_schema: Any = None,
    ) -> BaseChatModel:
        """
        Lấy LLM instance từ cache hoặc tạo mới.
        """
        cache_key = (model_name, streaming, json_mode, api_key)

        if model_name in ("auto", "round-robin", "free", "openrouter/auto", "openrouter-auto", "openrouter/round-robin"):
            llm = build_openrouter_free_resilient_llm(streaming=streaming, api_key=api_key)
        elif cache_key in self._cache:
            logger.debug("Using cached LLM: %s (streaming=%s, json=%s)", model_name, streaming, json_mode)
            llm = self._cache[cache_key]
        else:
            llm = self._create_new_instance(model_name, streaming, json_mode, api_key)

        if response_schema:
            logger.debug("Applying structured output schema: %s", response_schema.__name__)
            llm = llm.with_structured_output(response_schema)

        return llm

    def _create_new_instance(
        self,
        model_name: str,
        streaming: bool = False,
        json_mode: bool = False,
        api_key: str | None = None,
    ) -> BaseChatModel:
        """Internal method để tạo instance thực sự"""
        if model_name.startswith("openrouter-"):
            model_name = f"openrouter/{model_name[11:]}"

        if "/" not in model_name:
            if model_name == "claude-sonnet-4-6":
                model_name = "anthropic/claude-3-5-sonnet"
            elif model_name == "claude-opus-4-8":
                model_name = "anthropic/claude-opus-4-8"
            elif model_name in ("qwen", "qwen-free", "qwen:free", "qwen3.8", "qwen3.8-27b", "qwen3.8-27b:free"):
                model_name = "openrouter/qwen/qwen3.8-27b:free"
            elif model_name in ("auto", "round-robin", "free", "openrouter-auto", "openrouter/auto"):
                model_name = get_next_free_model_round_robin()
            else:
                raise ValueError(f"Invalid format '{model_name}'. Keep 'provider/model-name'.")

        if model_name in ("auto", "openrouter/auto", "openrouter-auto", "round-robin", "openrouter/round-robin", "free"):
            model_name = get_next_free_model_round_robin()

        provider, model = model_name.split("/", maxsplit=1)

        import os

        # Seamlessly alias deepseek/deepseek-v4-flash to OpenRouter if OPENROUTER_API_KEY is configured
        use_openrouter_for_deepseek = os.getenv("USE_OPENROUTER_FOR_DEEPSEEK", "true").lower() == "true"
        if provider == "deepseek" and use_openrouter_for_deepseek and os.getenv("OPENROUTER_API_KEY"):
            provider = "openrouter"
            if model == "deepseek-v4-flash":
                model = "deepseek/deepseek-v4-flash"

        # Seamlessly route qwen models via OpenRouter if OPENROUTER_API_KEY is configured
        if provider == "qwen" and os.getenv("OPENROUTER_API_KEY"):
            provider = "openrouter"
            model = f"qwen/{model}"

        anthropic_base_url = os.getenv("ANTHROPIC_BASE_URL")
        is_anthropic_wrapper = False
        if provider == "anthropic" and anthropic_base_url:
            provider = "openai"
            is_anthropic_wrapper = True
            if "claude-3-5-sonnet" in model or "claude-3.5-sonnet" in model:
                model = "claude-sonnet-4-6"
            elif "claude-opus-4-8" in model:
                model = "claude-opus-4-8"

        # Intercept OpenRouter: OpenAI-compatible API
        is_openrouter = False
        if provider == "openrouter":
            provider = "openai"
            is_openrouter = True

        # Intercept DeepSeek: OpenAI-compatible API, route via openai provider
        is_deepseek = False
        if provider == "deepseek":
            provider = "openai"
            is_deepseek = True

        try:
            # Create base model
            init_kwargs: dict[str, Any] = {"model_provider": provider, "streaming": streaming}
            if is_openrouter:
                init_kwargs["base_url"] = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
                key_to_use = api_key or os.getenv("OPENROUTER_API_KEY")
                if key_to_use:
                    init_kwargs["api_key"] = key_to_use
                # Provider routing:
                # - For paid DeepSeek: lock/prioritize provider order (default: Relace)
                # - For Qwen and other free tiers (:free): allow normal multi-provider fallback
                if "deepseek" in model.lower() and ":free" not in model.lower():
                    order_provider = os.getenv("OPENROUTER_PROVIDER_ORDER", "Relace")
                    init_kwargs["extra_body"] = {
                        "provider": {
                            "order": [order_provider],
                            "allow_fallbacks": True,
                        }
                    }
                else:
                    init_kwargs["extra_body"] = {
                        "provider": {
                            "allow_fallbacks": True,
                        }
                    }
                init_kwargs["default_headers"] = {
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "DB-GPT OpenWork",
                }
            elif is_anthropic_wrapper:
                init_kwargs["base_url"] = anthropic_base_url
                key_to_use = api_key or os.getenv("ANTHROPIC_API_KEY")
                if key_to_use:
                    init_kwargs["api_key"] = key_to_use
                # max_tokens là tham số bậc 1 của ChatOpenAI (wrapper chạy qua
                # provider "openai"). Nhét vào model_kwargs khiến LangChain cảnh
                # báo và có thể bỏ qua giới hạn → đặt trực tiếp cho chắc.
                init_kwargs["max_tokens"] = 8192
            elif is_deepseek:
                init_kwargs["base_url"] = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
                key_to_use = api_key or os.getenv("DEEPSEEK_API_KEY")
                if key_to_use:
                    init_kwargs["api_key"] = key_to_use
                init_kwargs["max_tokens"] = 16384
                # Thinking mode bật mặc định ở DeepSeek V4 (Pro + Flash). Khi bật, tool-call
                # attempt bị model trộn lẫn <thinking> + tool-call syntax thẳng vào content
                # (không populate tool_calls chuẩn) → ReAct route sai, không gọi được tool.
                # Tắt hẳn theo doc chính thức: https://api-docs.deepseek.com/guides/thinking_mode/
                # Chỉ deepseek-reasoner mới cần giữ thinking mode.
                if "reasoner" not in model:
                    init_kwargs["extra_body"] = {"thinking": {"type": "disabled"}}
            elif provider in ("google_genai", "google", "gemini"):
                from dbgpt_analyst.common.auto_model import get_gemini_api_key
                key_to_use = api_key or get_gemini_api_key()
                if key_to_use:
                    init_kwargs["api_key"] = key_to_use
            elif api_key:
                init_kwargs["api_key"] = api_key

            if provider == "groq" or provider == "google_genai":
                llm = init_chat_model(model, **init_kwargs)
            else:
                try:
                    llm = init_chat_model(model, stream_usage=True, **init_kwargs)
                except TypeError:
                    logger.warning("%s không hỗ trợ stream_usage. Đang tạo lại không có tham số này.", model_name)
                    llm = init_chat_model(model, **init_kwargs)

            # Apply JSON mode binding if requested.
            # Bắt buộc raise lỗi nếu xin json_mode mà model/provider không hỗ trợ, không return fallback rác.
            if json_mode:
                if provider == "anthropic" or is_anthropic_wrapper:
                    raise ValueError(f"Provider {provider} không hỗ trợ JSON mode binding qua Langchain.")
                try:
                    llm = llm.bind(response_format={"type": "json_object"})
                    logger.debug("Enabled JSON Mode cho %s", model_name)
                except Exception as ex:
                    logger.error("Model %s không thể bind JSON mode. Lỗi: %s", model_name, ex)
                    raise ValueError(f"Không thể kích hoạt JSON mode cho {model_name}: {ex}") from ex

            cache_key = (model_name, streaming, json_mode, api_key)
            llm_cast = cast(BaseChatModel, llm)
            self._cache[cache_key] = llm_cast

            logger.debug("Created: %s (streaming=%s, json=%s)", model_name, streaming, json_mode)
            return llm_cast

        except Exception as e:
            logger.error("Failed to create %s: %s", model_name, e)
            raise


# --- OpenRouter Free Rotation Pool ---
OPENROUTER_FREE_ROTATION_POOL: list[str] = [
    "openrouter/qwen/qwen3.8-27b:free",
    "openrouter/nex-agi/nex-n2.5-pro:free",
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
    "openrouter/z-ai/glm-5.2:free",
    "openrouter/nvidia/nemotron-3.5-lightning:free",
    "openrouter/dots-studio/dots-3-note-preview:free",
]
_or_round_robin_idx = 0
_or_round_robin_lock = threading.Lock()


def get_next_free_model_round_robin() -> str:
    """Return next model from OpenRouter free pool in round-robin sequence."""
    global _or_round_robin_idx
    with _or_round_robin_lock:
        chosen = OPENROUTER_FREE_ROTATION_POOL[_or_round_robin_idx % len(OPENROUTER_FREE_ROTATION_POOL)]
        _or_round_robin_idx += 1
        return chosen


OPENROUTER_PAID_SAFETY_NET_MODEL: str = "openrouter/deepseek/deepseek-v4-flash"


def build_openrouter_free_resilient_llm(
    model_name: str | None = None,
    streaming: bool = True,
    api_key: str | None = None,
) -> BaseChatModel:
    """Wraps selected free model with fallback models:
    1. Primary: next model in the OpenRouter free rotation pool (starting with Qwen 3.8 27B free).
    2. Cascade: remaining free models in rotation ring.
    3. Safety Net: Paid DeepSeek V4 Flash (routed via Relace) when all free tiers hit limits/exhausted.
    """
    factory = LLMFactory.get_instance()
    selected = model_name or get_next_free_model_round_robin()
    if selected in ("auto", "round-robin", "free", "openrouter/auto", "openrouter-auto", "openrouter/round-robin"):
        selected = get_next_free_model_round_robin()
    elif selected in ("qwen", "qwen-free", "qwen:free"):
        selected = "openrouter/qwen/qwen3.8-27b:free"

    pool = list(OPENROUTER_FREE_ROTATION_POOL)
    if selected in pool:
        start_idx = pool.index(selected)
        ordered_candidates = [pool[(start_idx + i) % len(pool)] for i in range(len(pool))]
    else:
        ordered_candidates = [selected] + [m for m in pool if m != selected]

    # Safety Net: When all free models hit rate limits or daily quotas, cascade to paid DeepSeek V4 Flash via Relace
    if OPENROUTER_PAID_SAFETY_NET_MODEL not in ordered_candidates:
        ordered_candidates.append(OPENROUTER_PAID_SAFETY_NET_MODEL)

    primary_model = factory.get_model(ordered_candidates[0], streaming=streaming, api_key=api_key)
    fallbacks: list[BaseChatModel] = []
    for candidate in ordered_candidates[1:]:
        try:
            fb = factory.get_model(candidate, streaming=streaming, api_key=api_key)
            fallbacks.append(fb)
        except Exception as e:
            logger.warning("Failed to initialize OpenRouter tier %s: %s", candidate, e)

    if fallbacks:
        return primary_model.with_fallbacks(fallbacks=fallbacks, exceptions_to_handle=(Exception,))
    return primary_model


# --- Public API ---
def create_llm(model_name: str, streaming: bool = True, json_mode: bool = False, api_key: str | None = None, response_schema: Any = None):
    return LLMFactory.get_instance().get_model(model_name, streaming=streaming, json_mode=json_mode, api_key=api_key, response_schema=response_schema)


def preferred_model_name() -> str:
    """Tên model ưu tiên cho mọi node.

    Ưu tiên:
      1. Env var DEFAULT_MODEL (override rõ ràng, ví dụ: "qwen/qwen3.8-27b:free", "deepseek/deepseek-v4-flash")
      2. Env var OPENROUTER_DEFAULT_MODEL nếu có
      3. DB-GPT Config().LLM_MODEL nếu có dạng hợp lệ "provider/model" cho init_chat_model
      4. OPENROUTER_API_KEY có:
         - Mặc định: "auto" (Round-robin free pool Qwen/Nex/DeepSeek trước, hết quota tự động fallback sang DeepSeek V4 Flash trả tiền qua Relace)
      5. GOOGLE_API_KEY / GEMINI_API_KEY có → google_genai/gemini-2.5-flash-lite
      6. DEEPSEEK_API_KEY có → deepseek/deepseek-v4-flash
      7. ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL có → anthropic/claude-opus-4-8
      8. Fallback cuối: auto
    """
    import os
    explicit = os.getenv("DEFAULT_MODEL", "").strip()
    if explicit:
        return explicit

    or_default = os.getenv("OPENROUTER_DEFAULT_MODEL", "").strip()
    if or_default:
        return or_default

    # ponytail: CFG.LLM_MODEL là tên model nội bộ DB-GPT ("glm-4-9b-chat"), không có provider
    # prefix nên hiếm khi dùng được trực tiếp với init_chat_model. Chỉ nhận nếu dạng
    # "provider/model"; không parse sâu thêm — nâng cấp: map model DB-GPT → LangChain provider khi cần.
    try:
        from dbgpt._private.config import Config
        cfg_llm = Config().LLM_MODEL
        if cfg_llm and "/" in cfg_llm.strip():
            return cfg_llm.strip()
    except Exception:
        pass

    or_key = os.getenv("OPENROUTER_API_KEY", "")
    if or_key and "dummy" not in or_key.lower():
        return "auto"

    gemini_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if gemini_key and "dummy" not in gemini_key.lower():
        return "google_genai/gemini-2.5-flash-lite"
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
    if deepseek_key and "dummy" not in deepseek_key.lower():
        return "deepseek/deepseek-v4-flash"
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if (anthropic_key and "dummy" not in anthropic_key.lower()) or os.getenv("ANTHROPIC_BASE_URL"):
        return "anthropic/claude-opus-4-8"
    return "auto"