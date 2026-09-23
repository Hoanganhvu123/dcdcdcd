"""
agent_core/ai_data_analytic_agent/cache.py — Cache kết quả sinh SQL của LLM (DB-N3).

Port ý tưởng "cache by hash(prompt+params)" của DB-GPT (cache/operators.py):
mỗi lần LLM sinh SQL từ (câu hỏi, schema, danh sách bảng) được băm thành khóa
ổn định; lần sau hỏi y hệt → trả ngay kết quả đã sinh, KHÔNG gọi LLM lại.
Giúp câu hỏi lặp lại trả lời tức thì và giảm chi phí token.

Khác với ``libs/bi/query_cache.py`` (cache *kết quả truy vấn* sau khi chạy SQL),
module này cache *bước sinh SQL* — tức là cái LLM nghĩ ra, trước khi thực thi.

Kiến trúc: Upstash Redis Serverless + In-process TTL/LRU fallback.
Suy biến mượt — mọi lỗi đều bỏ qua, không bao giờ làm hỏng đường sinh SQL.

⚠️ Khóa băm từ câu hỏi + schema + tên bảng. KHÔNG chứa credential/connection_string.
"""
from __future__ import annotations

from collections import OrderedDict
import hashlib
import json
import logging
import os
import threading
import time
from typing import Any


def is_feature_enabled(flag: str) -> bool:
    # TODO(C1): DB-GPT chưa có feature-flag layer tương đương `common.feature_flags`;
    # trả True tạm để cache hoạt động mặc định.
    return True

logger = logging.getLogger(__name__)

try:
    from dbgpt_analyst.config import SQL_GEN_CACHE_MAXSIZE, SQL_GEN_CACHE_TTL_SEC
except Exception:  # config chưa khai báo → fallback an toàn
    SQL_GEN_CACHE_TTL_SEC = 300  # 5 phút
    SQL_GEN_CACHE_MAXSIZE = 128

_FLAG = "ENABLE_SQL_GEN_CACHE"

_lock = threading.Lock()
# key -> {"payload": dict, "expires": float}
_store: OrderedDict[str, dict[str, Any]] = OrderedDict()
_stats = {"hits": 0, "misses": 0, "sets": 0, "evictions": 0}

# =========================================================================
# UPSTASH REDIS CLOUD INTEGRATION
# =========================================================================
redis_client = None
try:
    from upstash_redis import Redis
    upstash_url = os.getenv("UPSTASH_REDIS_REST_URL")
    upstash_token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if upstash_url and upstash_token:
        redis_client = Redis(url=upstash_url, token=upstash_token)
        logger.info("✅ Upstash Redis Cloud initialized for SQL generation cache.")
except ImportError:
    logger.warning("upstash-redis package not found. Falling back to in-memory cache.")
except Exception as e:
    logger.warning(f"Failed to initialize Upstash Redis: {e}. Falling back to in-memory cache.")


def make_gen_cache_key(question: str, schema_text: str, selected_tables: list[str]) -> str:
    """Sinh khóa cache ổn định (sha256) cho bước sinh SQL."""
    norm_q = " ".join((question or "").strip().lower().split())
    payload = json.dumps(
        {
            "q": norm_q,
            "schema": schema_text or "",
            "tables": sorted(t.lower() for t in (selected_tables or [])),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    # Thêm tiền tố để dễ quản lý key trên Redis
    return "sql_gen_cache:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_cached_generation(key: str) -> dict[str, Any] | None:
    """Tra cache. Trả về payload đã lưu (dict trả về của node) hoặc None."""
    if not is_feature_enabled(_FLAG):
        return None

    # 1. Thử đọc từ Upstash Redis (Serverless)
    if redis_client:
        try:
            val = redis_client.get(key)
            if val:
                _stats["hits"] += 1
                if isinstance(val, dict):
                    return val
                if isinstance(val, str):
                    return json.loads(val)
                return dict(val)
        except Exception as e:
            logger.warning(f"Upstash Redis get error for {key}: {e}")

        _stats["misses"] += 1
        return None

    # 2. Fallback về In-Memory RAM (Nếu không cấu hình Upstash)
    now = time.monotonic()
    with _lock:
        entry = _store.get(key)
        if entry is None:
            _stats["misses"] += 1
            return None
        if entry["expires"] < now:
            _store.pop(key, None)
            _stats["misses"] += 1
            return None
        _store.move_to_end(key)  # LRU touch
        _stats["hits"] += 1
        return dict(entry["payload"])


def set_cached_generation(key: str, payload: dict[str, Any], ttl: int | None = None) -> None:
    """Lưu kết quả sinh SQL vào cache (chỉ khi cờ bật)."""
    if not is_feature_enabled(_FLAG):
        return
    ttl = ttl or SQL_GEN_CACHE_TTL_SEC

    # 1. Lưu vào Upstash Redis (Serverless)
    if redis_client:
        try:
            redis_client.set(key, json.dumps(payload), ex=ttl)
            _stats["sets"] += 1
        except Exception as e:
            logger.warning(f"Upstash Redis set error for {key}: {e}")
        return

    # 2. Fallback về In-Memory RAM
    now = time.monotonic()
    with _lock:
        _store[key] = {"payload": dict(payload), "expires": now + ttl}
        _store.move_to_end(key)
        _stats["sets"] += 1
        while len(_store) > SQL_GEN_CACHE_MAXSIZE:
            _store.popitem(last=False)
            _stats["evictions"] += 1


def clear_all() -> None:
    """Xoá toàn bộ cache bộ nhớ cục bộ."""
    with _lock:
        _store.clear()


def get_stats() -> dict[str, Any]:
    with _lock:
        total = _stats["hits"] + _stats["misses"]
        hit_rate = (_stats["hits"] / total) if total else 0.0
        size = len(_store) if not redis_client else "Redis Managed"
        return {
            **_stats,
            "size": size,
            "hit_rate": round(hit_rate, 3),
            "enabled": is_feature_enabled(_FLAG),
            "engine": "Upstash Redis" if redis_client else "In-Memory LRU"
        }
