"""common/model_fallback.py — Port từ preferences/aianalytic/backend/common/model_fallback.py.

Bỏ phần SQLite per-user API keys (`user_api_keys` table) — tính năng multi-tenant SaaS của
aianalytic, DB-GPT không có khái niệm này (model đăng ký ở mức cluster). Giữ phần env-vars
và toàn bộ logic fallback.
"""

import asyncio
import logging
from enum import Enum
from typing import Any, AsyncIterator, ClassVar, Iterator

from langchain_core.language_models import BaseChatModel

from dbgpt_analyst.common.llm_factory import LLMFactory
from dbgpt_analyst.config import LLM_CALL_TIMEOUT_SEC

logger = logging.getLogger(__name__)


class ErrorType(Enum):
    """Các loại lỗi có thể fallback"""

    RATE_LIMIT = "rate_limit"
    QUOTA_EXCEEDED = "quota_exceeded"
    CONTEXT_LENGTH = "context_length"
    NETWORK_ERROR = "network_error"
    UNKNOWN = "unknown"


class ExecutionFallbackLLMWrapper(BaseChatModel):
    """
    Wrapper for LLMs to catch errors during execution (ainvoke, invoke, astream, stream)
    and fallback to alternative models dynamically.
    """

    def __init__(self, models: list[tuple[BaseChatModel, str]], fallback_manager: "ModelFallbackManager"):
        """
        Args:
            models: List of tuples (LLM instance, model_name). First is primary, rest are fallbacks.
            fallback_manager: Reference to ModelFallbackManager to detect error types.
        """
        super().__init__()
        self._models = models
        self._fallback_manager = fallback_manager
        self._target = models[0][0]
        self._current_model_name = models[0][1]

    @property
    def _llm_type(self) -> str:
        return getattr(self._target, "_llm_type", "execution_fallback_wrapper")

    def _generate(self, messages: Any, stop: list[str] | None = None, run_manager: Any = None, **kwargs: Any):
        return self._target._generate(messages, stop=stop, run_manager=run_manager, **kwargs)

    async def _agenerate(self, messages: Any, stop: list[str] | None = None, run_manager: Any = None, **kwargs: Any):
        return await self._target._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)

    @property
    def model(self) -> str:
        return self._current_model_name

    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        tried = []
        for i, (llm, model_name) in enumerate(self._models):
            try:
                self._target = llm
                self._current_model_name = model_name
                return llm.invoke(*args, **kwargs)
            except Exception as e:
                tried.append(model_name)
                error_type = self._fallback_manager.detect_error_type(e)
                logger.warning("Model %s failed during invoke (%s): %s", model_name, error_type.value, e)
                if i == len(self._models) - 1:
                    logger.error("All models exhausted during invoke. Tried: %s", tried)
                    raise
                logger.info("Retrying execution with next fallback model...")

    async def ainvoke(self, *args: Any, **kwargs: Any) -> Any:
        tried = []
        for i, (llm, model_name) in enumerate(self._models):
            try:
                self._target = llm
                self._current_model_name = model_name
                return await asyncio.wait_for(llm.ainvoke(*args, **kwargs), timeout=LLM_CALL_TIMEOUT_SEC)
            except Exception as e:
                tried.append(model_name)
                if isinstance(e, TimeoutError | asyncio.TimeoutError):
                    logger.warning("Model %s timed out during ainvoke after %ss", model_name, LLM_CALL_TIMEOUT_SEC)
                else:
                    error_type = self._fallback_manager.detect_error_type(e)
                    logger.warning("Model %s failed during ainvoke (%s): %s", model_name, error_type.value, e)
                if i == len(self._models) - 1:
                    logger.error("All models exhausted during ainvoke. Tried: %s", tried)
                    raise
                logger.info("Retrying execution with next fallback model...")

    def stream(self, *args: Any, **kwargs: Any) -> Iterator[Any]:
        tried = []
        for i, (llm, model_name) in enumerate(self._models):
            try:
                self._target = llm
                self._current_model_name = model_name
                it = llm.stream(*args, **kwargs)
                try:
                    first_chunk = next(it)
                except StopIteration:
                    return iter([])

                def _yield_rest():
                    yield first_chunk
                    yield from it
                return _yield_rest()
            except Exception as e:
                tried.append(model_name)
                error_type = self._fallback_manager.detect_error_type(e)
                logger.warning("Model %s failed during stream (%s): %s", model_name, error_type.value, e)
                if i == len(self._models) - 1:
                    logger.error("All models exhausted during stream. Tried: %s", tried)
                    raise
                logger.info("Retrying execution with next fallback model...")

    async def astream(self, *args: Any, **kwargs: Any) -> AsyncIterator[Any]:
        import inspect
        tried = []
        for i, (llm, model_name) in enumerate(self._models):
            try:
                self._target = llm
                self._current_model_name = model_name
                it = llm.astream(*args, **kwargs)
                if inspect.isawaitable(it):
                    it = await it
                try:
                    first_chunk = await it.__anext__()
                except StopAsyncIteration:
                    return
                yield first_chunk
                async for chunk in it:
                    yield chunk
                return
            except Exception as e:
                tried.append(model_name)
                error_type = self._fallback_manager.detect_error_type(e)
                logger.warning("Model %s failed during astream (%s): %s", model_name, error_type.value, e)
                if i == len(self._models) - 1:
                    logger.error("All models exhausted during astream. Tried: %s", tried)
                    raise
                logger.info("Retrying execution with next fallback model...")

    def with_structured_output(self, *args: Any, **kwargs: Any) -> Any:
        new_models = []
        for llm, name in self._models:
            new_llm = llm.with_structured_output(*args, **kwargs)
            new_models.append((new_llm, name))
        return ExecutionFallbackLLMWrapper(new_models, self._fallback_manager)

    def bind_tools(self, *args: Any, **kwargs: Any) -> Any:
        new_models = []
        for llm, name in self._models:
            new_llm = llm.bind_tools(*args, **kwargs)
            new_models.append((new_llm, name))
        return ExecutionFallbackLLMWrapper(new_models, self._fallback_manager)

    def bind(self, *args: Any, **kwargs: Any) -> Any:
        new_models = []
        for llm, name in self._models:
            new_llm = llm.bind(*args, **kwargs)
            new_models.append((new_llm, name))
        return ExecutionFallbackLLMWrapper(new_models, self._fallback_manager)

    def __getattr__(self, name: str) -> Any:
        if name in ("_target", "_models", "_fallback_manager", "_current_model_name"):
            return object.__getattribute__(self, name)
        try:
            target = object.__getattribute__(self, "_target")
            return getattr(target, name)
        except (AttributeError, KeyError):
            return super().__getattr__(name)


class ModelFallbackManager:
    """
    Quản lý auto fallback models khi gặp lỗi.

    Features:
    - Tự động detect loại lỗi
    - Chọn model fallback phù hợp dựa trên error type
    - Quản lý danh sách models có API key trong env
    - Hỗ trợ model="auto" để tự động chọn model tốt nhất
    """

    # Model capabilities (context size, cost tier)
    MODEL_CAPABILITIES: ClassVar[dict[str, dict[str, Any]]] = {
        # OpenAI
        "openai/gpt-5-nano": {"context": 128000, "tier": "cheap", "speed": "fast"},
        "openai/gpt-5-mini": {"context": 128000, "tier": "cheap", "speed": "fast"},
        "openai/gpt-4o": {"context": 128000, "tier": "medium", "speed": "medium"},
        "openai/gpt-4o-mini": {"context": 128000, "tier": "cheap", "speed": "fast"},
        # Gemini
        "google_genai/gemini-2.5-flash": {"context": 1000000, "tier": "cheap", "speed": "fast"},
        "google_genai/gemini-2.5-pro": {"context": 2000000, "tier": "medium", "speed": "medium"},
        "google_genai/gemini-2.0-flash": {"context": 1000000, "tier": "cheap", "speed": "fast"},
        "google_genai/gemini-2.0-pro-exp": {"context": 2000000, "tier": "medium", "speed": "medium"},
        "google_genai/gemini-1.5-flash": {"context": 1000000, "tier": "cheap", "speed": "fast"},
        "google_genai/gemini-1.5-pro": {"context": 2000000, "tier": "medium", "speed": "medium"},
        "google_genai/gemini-3.6-flash": {"context": 1000000, "tier": "cheap", "speed": "fast"},
        "google_genai/gemini-3.5-flash-lite": {"context": 1000000, "tier": "cheap", "speed": "very_fast"},
        "google_genai/gemini-3.1-flash-lite": {"context": 1000000, "tier": "cheap", "speed": "very_fast"},
        # Groq
        "groq/meta-llama/llama-4-maverick-17b-128e-instruct": {
            "context": 128000,
            "tier": "cheap",
            "speed": "very_fast",
        },
        "groq/meta-llama/llama-4-scout-17b-16e-instruct": {"context": 128000, "tier": "cheap", "speed": "very_fast"},
        "groq/openai/gpt-oss-120b": {"context": 128000, "tier": "medium", "speed": "very_fast"},
        "groq/openai/gpt-oss-20b": {"context": 128000, "tier": "cheap", "speed": "very_fast"},
        # Anthropic
        "anthropic/claude-opus-4-8": {"context": 200000, "tier": "medium", "speed": "medium"},
        "anthropic/claude-3-5-sonnet-20241022": {"context": 200000, "tier": "medium", "speed": "medium"},
        "anthropic/claude-3-opus-20240229": {"context": 200000, "tier": "medium", "speed": "medium"},
        # DeepSeek (OpenAI-compatible endpoint, 1M context)
        "deepseek/deepseek-v4-flash": {"context": 1000000, "tier": "cheap", "speed": "fast"},
        "deepseek/deepseek-v4-pro": {"context": 1000000, "tier": "medium", "speed": "medium"},
        # OpenRouter & Qwen Free Models
        "openrouter/qwen/qwen3.8-27b:free": {"context": 262144, "tier": "free", "speed": "fast"},
        "qwen/qwen3.8-27b:free": {"context": 262144, "tier": "free", "speed": "fast"},
        "openrouter/deepseek/deepseek-v4-flash": {"context": 1000000, "tier": "cheap", "speed": "fast"},
        "openrouter/nex-agi/nex-n2.5-pro:free": {"context": 128000, "tier": "free", "speed": "fast"},
        "openrouter/deepseek/deepseek-v4-flash-0731:free": {"context": 128000, "tier": "free", "speed": "fast"},
        "openrouter/z-ai/glm-5.2:free": {"context": 128000, "tier": "free", "speed": "fast"},
        "openrouter/nvidia/nemotron-3.5-lightning:free": {"context": 128000, "tier": "free", "speed": "fast"},
        "openrouter/dots-studio/dots-3-note-preview:free": {"context": 128000, "tier": "free", "speed": "fast"},
    }

    def __init__(self):
        self.llm_factory = LLMFactory.get_instance()

    async def _get_api_key_for_provider(self, user_id: str, provider: str) -> str | None:
        """
        Lấy API key theo provider từ environment variables.
        """
        import os

        # ponytail: user_id không dùng (DB-GPT không có per-user API key, xem ModelFallbackManager gốc).
        _ = user_id

        if provider.lower() in ("google_genai", "gemini", "google"):
            from dbgpt_analyst.common.auto_model import get_gemini_api_key
            key = get_gemini_api_key()
            if key:
                return key

        env_map = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "claude": "ANTHROPIC_API_KEY",
            "groq": "GROQ_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
            "qwen": "OPENROUTER_API_KEY",
        }
        env_var = env_map.get(provider.lower())
        if env_var:
            val = os.getenv(env_var)
            if val:
                return val.strip()

        return None

    def detect_error_type(self, error: Exception) -> ErrorType:
        """
        Detect loại lỗi từ exception.

        Returns:
            ErrorType: Loại lỗi được detect
        """
        error_str = str(error).lower()

        # Rate limit
        if "rate limit" in error_str or "429" in error_str or "too many requests" in error_str:
            return ErrorType.RATE_LIMIT

        # Quota exceeded
        if "quota" in error_str or "insufficient" in error_str or "billing" in error_str:
            return ErrorType.QUOTA_EXCEEDED

        # Context length
        if "context" in error_str and ("length" in error_str or "exceeded" in error_str or "too long" in error_str):
            return ErrorType.CONTEXT_LENGTH
        if "maximum context length" in error_str or "token limit" in error_str:
            return ErrorType.CONTEXT_LENGTH

        # Network errors
        if "timeout" in error_str or "connection" in error_str or "network" in error_str:
            return ErrorType.NETWORK_ERROR

        return ErrorType.UNKNOWN

    async def get_user_available_models(self, user_id: str) -> list[str]:
        """
        Lấy danh sách models có API key trong environment variables.

        Args:
            user_id: User ID

        Returns:
            List[str]: Danh sách model names có key
        """
        import os

        # ponytail: user_id không dùng (DB-GPT không có per-user API key, xem ModelFallbackManager gốc).
        _ = user_id

        models: list[str] = []

        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key and "dummy" not in openai_key.lower():
            models.extend(["openai/gpt-5-nano", "openai/gpt-5-mini", "openai/gpt-4o", "openai/gpt-4o-mini"])

        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if (anthropic_key and "dummy" not in anthropic_key.lower()) or os.getenv("ANTHROPIC_BASE_URL"):
            models.extend(["anthropic/claude-opus-4-8", "anthropic/claude-3-5-sonnet-20241022"])

        from dbgpt_analyst.common.auto_model import get_gemini_api_key
        gemini_key = get_gemini_api_key()
        if gemini_key and "dummy" not in gemini_key.lower():
            models.extend([
                "google_genai/gemini-3.5-flash-lite",
                "google_genai/gemini-3.1-flash-lite",
                "google_genai/gemini-3.6-flash",
                "google_genai/gemini-2.5-flash-lite",
                "google_genai/gemini-2.5-flash",
                "google_genai/gemini-2.0-flash",
            ])

        groq_key = os.getenv("GROQ_API_KEY")
        if groq_key and "dummy" not in groq_key.lower():
            models.extend(["groq/meta-llama/llama-4-maverick-17b-128e-instruct"])

        deepseek_key = os.getenv("DEEPSEEK_API_KEY")
        if deepseek_key and "dummy" not in deepseek_key.lower():
            models.extend(["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro"])

        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        if openrouter_key and "dummy" not in openrouter_key.lower():
            models.extend([
                "openrouter/qwen/qwen3.8-27b:free",
                "openrouter/deepseek/deepseek-v4-flash",
                "openrouter/nex-agi/nex-n2.5-pro:free",
                "openrouter/deepseek/deepseek-v4-flash-0731:free",
                "openrouter/z-ai/glm-5.2:free",
                "openrouter/nvidia/nemotron-3.5-lightning:free",
                "openrouter/dots-studio/dots-3-note-preview:free",
            ])

        # If nothing is configured, default to some standard list but include anthropic if wrapper/env key is set
        if not models:
            models = [
                "openai/gpt-4o-mini",
                "google_genai/gemini-2.5-flash",
                "groq/meta-llama/llama-4-maverick-17b-128e-instruct",
            ]
            if os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_BASE_URL"):
                models.insert(0, "anthropic/claude-opus-4-8")

        unique_models = list(dict.fromkeys(models))
        return self._sort_models_by_priority(unique_models)

    def _sort_models_by_priority(self, models: list[str]) -> list[str]:
        """
        Sort models theo priority: cheap + fast trước, sau đó đến medium.
        """

        def get_priority(model: str) -> int:
            caps = self.MODEL_CAPABILITIES.get(model, {})
            tier = caps.get("tier", "medium")
            speed = caps.get("speed", "medium")

            # Priority: cheap + fast = 1, cheap + medium = 2, medium = 3
            if tier == "cheap" and speed in ["fast", "very_fast"]:
                return 1
            if tier == "cheap":
                return 2
            return 3

        return sorted(models, key=get_priority)

    async def select_best_model(self, user_id: str, preferred_model: str | None = None) -> str:
        """
        Chọn model tốt nhất từ danh sách có key.

        Nếu preferred_model được chỉ định và user có key → dùng preferred_model
        Nếu không → chọn model rẻ + nhanh nhất

        Args:
            user_id: User ID
            preferred_model: Model user muốn dùng (optional)

        Returns:
            str: Model name được chọn
        """
        available = await self.get_user_available_models(user_id)

        if not available:
            # Fallback to default
            logger.warning("No available models for user %s, using default", user_id)
            return "anthropic/claude-opus-4-8"  # internal tool ships only Claude wrapper creds

        # Nếu có preferred_model và có key → dùng preferred_model
        if preferred_model and preferred_model in available:
            return preferred_model

        # Chọn model đầu tiên trong danh sách đã sort (tốt nhất)
        return available[0]

    def get_fallback_model(self, current_model: str, error_type: ErrorType, available_models: list[str]) -> str | None:
        """
        Chọn fallback model dựa trên error type và current model.

        Args:
            current_model: Model hiện tại bị lỗi
            error_type: Loại lỗi
            available_models: Danh sách models user có key

        Returns:
            Optional[str]: Model fallback, None nếu không có
        """
        if not available_models:
            return None

        current_caps = self.MODEL_CAPABILITIES.get(current_model, {})
        current_context = current_caps.get("context", 128000)
        current_provider = current_model.split("/", maxsplit=1)[0] if "/" in current_model else ""

        # Loại bỏ current_model khỏi danh sách
        candidates = [m for m in available_models if m != current_model]

        if not candidates:
            return None

        if error_type == ErrorType.CONTEXT_LENGTH:
            # Chọn model có context lớn hơn
            for model in candidates:
                caps = self.MODEL_CAPABILITIES.get(model, {})
                if caps.get("context", 0) > current_context:
                    logger.info("Context length fallback: %s -> %s", current_model, model)
                    return model

            # Nếu không có model nào có context lớn hơn, chọn model có context lớn nhất
            best = max(candidates, key=lambda m: self.MODEL_CAPABILITIES.get(m, {}).get("context", 0))
            logger.info("Context length fallback (best available): %s -> %s", current_model, best)
            return best

        if error_type == ErrorType.RATE_LIMIT:
            # Chọn model khác provider (tránh cùng rate limit)
            for model in candidates:
                provider = model.split("/")[0] if "/" in model else ""
                if provider != current_provider:
                    logger.info("Rate limit fallback: %s -> %s (different provider)", current_model, model)
                    return model

            # Nếu không có provider khác, chọn model tiếp theo
            logger.info("Rate limit fallback: %s -> %s (next model)", current_model, candidates[0])
            return candidates[0]

        if error_type == ErrorType.QUOTA_EXCEEDED:
            # Chọn model rẻ hơn hoặc provider khác
            for model in candidates:
                caps = self.MODEL_CAPABILITIES.get(model, {})
                provider = model.split("/")[0] if "/" in model else ""
                # Ưu tiên: provider khác hoặc tier rẻ hơn
                if provider != current_provider or caps.get("tier") == "cheap":
                    logger.info("Quota fallback: %s -> %s", current_model, model)
                    return model

            # Fallback to first available
            logger.info("Quota fallback: %s -> %s", current_model, candidates[0])
            return candidates[0]

        # Unknown/Network error: chọn model tiếp theo
        logger.info("Generic fallback: %s -> %s", current_model, candidates[0])
        return candidates[0]

    async def get_model_with_fallback(
        self,
        user_id: str,
        model_name: str,
        streaming: bool = True,
        json_mode: bool = False,
        max_retries: int = 3,
        allow_fallback: bool = True,  # nếu False và model_name != auto: không fallback, báo lỗi thiếu key
        response_schema: Any = None,
    ) -> tuple[BaseChatModel, str]:
        """
        Lấy LLM model với auto fallback khi gặp lỗi.

        Args:
            user_id: User ID
            model_name: Model name (có thể là "auto")
            streaming: Streaming mode
            json_mode: JSON mode
            max_retries: Số lần retry tối đa

        Returns:
            Tuple[BaseChatModel, str]: (LLM instance, actual model name used)

        Raises:
            Exception: Nếu tất cả models đều fail
        """
        # 1. Get available models for fallback (cần có trước để check)
        available_models = await self.get_user_available_models(user_id)

        if not available_models:
            logger.warning("No available models for user %s, using default", user_id)
            available_models = ["anthropic/claude-opus-4-8"]  # internal tool ships only Claude wrapper creds

        # 2. Resolve model name
        if model_name == "auto":
            actual_model = await self.select_best_model(user_id, preferred_model=None)
            logger.info("Auto model selection: %s", actual_model)
        else:
            actual_model = model_name
            if not allow_fallback:
                # Strict: không fallback. Nếu model không nằm trong danh sách gợi ý → báo lỗi ngay.
                if actual_model not in available_models:
                    logger.error(
                        "Strict mode: Model %s không có trong available list và không được phép fallback.",
                        actual_model,
                    )
                    raise Exception(
                        f"Không tìm thấy model {actual_model} trong danh sách được phép, "
                        f"và chế độ strict không cho phép fallback. Vui lòng cấu hình API key cho provider tương ứng."
                    )
            # Cho phép fallback: nếu model không trong available list, chọn best available
            elif actual_model not in available_models:
                logger.warning("Model %s not in available list, using best available", actual_model)
                actual_model = await self.select_best_model(user_id, preferred_model=None)

        # 3. Try to get models
        instantiated_models = []
        tried_models = []

        # Determine the ordered list of fallback candidates
        candidates = [actual_model]
        if allow_fallback or model_name == "auto":
            for m in available_models:
                if m != actual_model:
                    candidates.append(m)

        for candidate in candidates:
            try:
                # Lấy api_key theo provider
                provider = candidate.split("/")[0] if "/" in candidate else candidate
                api_key = await self._get_api_key_for_provider(user_id, provider)
                if not api_key:
                    logger.warning("No API key found for %s provider '%s'", candidate, provider)
                    continue

                if provider.lower() in ("google_genai", "gemini", "google"):
                    from dbgpt_analyst.common.auto_model import get_auto_model
                    llm = get_auto_model(
                        model_name=candidate,
                        streaming=streaming,
                        json_mode=json_mode,
                        api_key=api_key,
                        enable_fallback=False,
                        response_schema=response_schema,
                    )
                else:
                    llm = self.llm_factory.get_model(
                        candidate, streaming=streaming, json_mode=json_mode, api_key=api_key, response_schema=response_schema
                    )
                instantiated_models.append((llm, candidate))
            except Exception as e:
                logger.warning("Failed to instantiate candidate %s: %s", candidate, e)
                tried_models.append(candidate)

        if not instantiated_models:
            if not allow_fallback and model_name != "auto":
                raise Exception(
                    f"Không tìm thấy API key cho provider của {actual_model}. Vui lòng cấu hình API key trong phần Cài đặt."
                )
            raise Exception(f"All available models failed to instantiate. Tried: {tried_models}")

        logger.info("Prepared fallback wrapper with %d models. Primary: %s", len(instantiated_models), instantiated_models[0][1])
        wrapper = ExecutionFallbackLLMWrapper(instantiated_models, self)

        return wrapper, instantiated_models[0][1]


# Global instance
_fallback_manager: ModelFallbackManager | None = None


def get_fallback_manager() -> ModelFallbackManager:
    """Get singleton ModelFallbackManager instance"""
    global _fallback_manager
    if _fallback_manager is None:
        _fallback_manager = ModelFallbackManager()
    return _fallback_manager


# ========== Public API for backward compatibility ==========
async def create_llm_with_fallback(
    model_name: str,
    user_id: str | None = None,
    streaming: bool = True,
    json_mode: bool = False,
    allow_fallback: bool = True,  # nếu False và model_name != "auto": không fallback, báo lỗi
    response_schema: Any = None,
) -> tuple[BaseChatModel, str]:
    """
    Tạo LLM với auto fallback khi gặp lỗi.

    Nếu có user_id, LUÔN dùng fallback manager (có fallback logic).
    Nếu không có user_id, dùng key mặc định (backward compatibility).
    """
    # Import here to avoid circular dependency
    from dbgpt_analyst.common.llm_factory import create_llm

    if user_id:
        fallback_manager = get_fallback_manager()
        return await fallback_manager.get_model_with_fallback(
            user_id=user_id,
            model_name=model_name,  # Có thể là "auto" hoặc model cụ thể
            streaming=streaming,
            json_mode=json_mode,
            allow_fallback=allow_fallback,
            response_schema=response_schema,
        )
    # Không có user_id → dùng key mặc định (backward compatibility)
    llm = create_llm(model_name, streaming=streaming, json_mode=json_mode, response_schema=response_schema)
    return llm, model_name