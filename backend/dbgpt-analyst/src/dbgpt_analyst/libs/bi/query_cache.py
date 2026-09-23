"""libs/bi/query_cache.py — Cache kết quả truy vấn (tinh hoa scale của Superset).

Port ý tưởng "results backend + cache_key" của Apache Superset (Apache-2.0):
mỗi truy vấn được băm thành một khóa ổn định từ (SQL, nguồn, strategy, limit);
kết quả immutable được lưu trong TTL để các câu hỏi lặp lại trả lời tức thì,
không phải đập vào DB nguồn lần nữa.

Kiến trúc 2 tầng, suy biến mượt:
  • L1 — in-process TTL + LRU: luôn hoạt động, nhanh, không cần hạ tầng.
  • L2 — Redis (nếu có): chia sẻ giữa worker/restart. Lỗi Redis → bỏ qua, không
    bao giờ làm hỏng đường thực thi truy vấn.

Mỗi entry ghi kèm danh sách source_id để có thể *invalidate theo nguồn* khi
schema/dữ liệu nguồn được làm mới (refresh_schema_cache gọi invalidate_source).

⚠️ Khóa cache băm từ SQL + id nguồn, KHÔNG chứa connection_string/credential.
"""
from __future__ import annotations

from collections import OrderedDict
from collections.abc import Callable
import hashlib
import json
import logging
import threading
import time
from typing import Any

from dbgpt_analyst.common.feature_flags import is_feature_enabled

logger = logging.getLogger(__name__)

try:
    from dbgpt_analyst.config import QUERY_CACHE_MAXSIZE, QUERY_CACHE_TTL_SEC
except Exception:
    QUERY_CACHE_TTL_SEC = 300
    QUERY_CACHE_MAXSIZE = 256

_REDIS_PREFIX = "qcache:"

# --- L1: in-process TTL + LRU ------------------------------------------------
_lock = threading.Lock()
# key -> {"payload": dict, "expires": float, "sources": list[int]}
_store: OrderedDict[str, dict[str, Any]] = OrderedDict()
_stats = {"hits": 0, "misses": 0, "sets": 0, "evictions": 0, "invalidations": 0}


def make_query_cache_key(sql: str, resolved_tables: dict[str, Any], strategy: str, limit: int) -> str:
    """Sinh khóa cache ổn định (sha256) — port cache_key_wrapper của Superset.

    Khóa phụ thuộc vào: SQL đã chuẩn hoá, tập source_id (sắp xếp), strategy, limit.
    SQL khác source → khóa khác → không đụng nhau.
    """
    source_ids = sorted({int(m.get("source_id", 0)) for m in resolved_tables.values()})
    norm_sql = " ".join(sql.strip().split())
    payload = json.dumps(
        {"sql": norm_sql, "sources": source_ids, "strategy": strategy, "limit": int(limit)},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _source_ids_of(resolved_tables: dict[str, Any]) -> list[int]:
    return sorted({int(m.get("source_id", 0)) for m in resolved_tables.values()})


def _l1_get(key: str) -> dict[str, Any] | None:
    now = time.monotonic()
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        if entry["expires"] < now:
            _store.pop(key, None)
            return None
        _store.move_to_end(key)  # LRU touch
        return entry["payload"]


def _l1_set(key: str, payload: dict[str, Any], ttl: int, sources: list[int]) -> None:
    now = time.monotonic()
    with _lock:
        _store[key] = {"payload": payload, "expires": now + ttl, "sources": sources}
        _store.move_to_end(key)
        while len(_store) > QUERY_CACHE_MAXSIZE:
            _store.popitem(last=False)
            _stats["evictions"] += 1


async def get_cached_result(key: str) -> dict[str, Any] | None:
    """Tra cache (L1 → L2). Trả về payload {"rows","columns","strategy"} hoặc None."""
    if not is_feature_enabled("ENABLE_QUERY_RESULT_CACHE"):
        return None

    hit = _l1_get(key)
    if hit is not None:
        with _lock:
            _stats["hits"] += 1
        return hit

    # L2 — Redis (best-effort)
    try:
        from dbgpt_analyst.common.cache import get_redis
        raw = await get_redis().get(_REDIS_PREFIX + key)
        if raw:
            payload = json.loads(raw)
            # nạp ngược vào L1 để lần sau nhanh hơn
            _l1_set(key, payload, QUERY_CACHE_TTL_SEC, payload.get("_sources", []))
            with _lock:
                _stats["hits"] += 1
            return payload
    except Exception as e:
        logger.debug("Redis qcache get bỏ qua: %s", e)

    with _lock:
        _stats["misses"] += 1
    return None


async def set_cached_result(
    key: str,
    payload: dict[str, Any],
    resolved_tables: dict[str, Any],
    ttl: int | None = None,
) -> None:
    """Lưu kết quả vào cache (L1 + L2 best-effort)."""
    if not is_feature_enabled("ENABLE_QUERY_RESULT_CACHE"):
        return
    ttl = ttl or QUERY_CACHE_TTL_SEC
    sources = _source_ids_of(resolved_tables)
    _l1_set(key, payload, ttl, sources)
    with _lock:
        _stats["sets"] += 1

    try:
        from dbgpt_analyst.common.cache import get_redis
        to_store = dict(payload)
        to_store["_sources"] = sources
        await get_redis().set(_REDIS_PREFIX + key, json.dumps(to_store, ensure_ascii=False, default=str), ex=ttl)
    except Exception as e:
        logger.debug("Redis qcache set bỏ qua: %s", e)


def invalidate_source(source_id: int) -> int:
    """Xoá mọi entry L1 chạm tới ``source_id`` (gọi khi nguồn được refresh).

    Trả về số entry bị xoá. (L2/Redis dùng TTL tự hết hạn — không quét ở đây.)
    """
    sid = int(source_id)
    removed = 0
    with _lock:
        for k in [k for k, v in _store.items() if sid in v.get("sources", [])]:
            _store.pop(k, None)
            removed += 1
        _stats["invalidations"] += removed
    if removed:
        logger.info("qcache: invalidate source %s → xoá %d entry", sid, removed)
    return removed


def clear_all() -> None:
    with _lock:
        _store.clear()


def get_stats() -> dict[str, Any]:
    with _lock:
        total = _stats["hits"] + _stats["misses"]
        hit_rate = (_stats["hits"] / total) if total else 0.0
        return {
            **_stats,
            "size": len(_store),
            "hit_rate": round(hit_rate, 3),
            "enabled": is_feature_enabled("ENABLE_QUERY_RESULT_CACHE"),
        }


async def fetch_cache_aside(
    key: str,
    fetch_func: Callable[[], Any],
    resolved_tables: dict[str, Any] | None = None,
    ttl: int | None = None,
    lock_timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Cache-Aside DB query execution with TTL and single-flight lock protection.
    Prevents cache stampede / thundering herd problem when multiple concurrent
    requests miss the cache simultaneously.
    """
    import asyncio
    import inspect

    if not is_feature_enabled("ENABLE_QUERY_RESULT_CACHE"):
        res = fetch_func()
        if inspect.isawaitable(res):
            res = await res
        return res

    # 1. Cache hit check
    cached = await get_cached_result(key)
    if cached is not None:
        return cached

    # 2. Single-flight lock acquisition via Redis client / in-memory fallback
    from dbgpt_analyst.common.redis_client import get_redis_client
    redis_client = get_redis_client()
    lock_key = f"lock:qcache:{key}"
    resolved_tables = resolved_tables or {}
    ttl = ttl or QUERY_CACHE_TTL_SEC

    max_retries = max(1, int(lock_timeout / 0.05))

    for _ in range(max_retries):
        acquired = redis_client.set(lock_key, "locked", nx=True, ex=int(lock_timeout))
        if acquired:
            try:
                # Double check cache inside lock
                cached = await get_cached_result(key)
                if cached is not None:
                    return cached

                res = fetch_func()
                if inspect.isawaitable(res):
                    res = await res

                if res is not None:
                    await set_cached_result(key, res, resolved_tables=resolved_tables, ttl=ttl)
                return res
            finally:
                redis_client.delete(lock_key)
        else:
            await asyncio.sleep(0.05)
            cached = await get_cached_result(key)
            if cached is not None:
                return cached

    # Fallback if lock acquisition timed out
    res = fetch_func()
    if inspect.isawaitable(res):
        res = await res
    return res


def fetch_cache_aside_sync(
    key: str,
    fetch_func: Callable[[], Any],
    resolved_tables: dict[str, Any] | None = None,
    ttl: int | None = None,
    lock_timeout: float = 10.0,
) -> dict[str, Any] | None:
    """Synchronous Cache-Aside DB query execution with TTL and single-flight lock protection.
    """
    if not is_feature_enabled("ENABLE_QUERY_RESULT_CACHE"):
        return fetch_func()

    hit = _l1_get(key)
    if hit is not None:
        with _lock:
            _stats["hits"] += 1
        return hit

    from dbgpt_analyst.common.redis_client import get_redis_client
    redis_client = get_redis_client()
    lock_key = f"lock:qcache:{key}"
    resolved_tables = resolved_tables or {}
    ttl = ttl or QUERY_CACHE_TTL_SEC

    max_retries = max(1, int(lock_timeout / 0.05))
    for _ in range(max_retries):
        acquired = redis_client.set(lock_key, "locked", nx=True, ex=int(lock_timeout))
        if acquired:
            try:
                hit = _l1_get(key)
                if hit is not None:
                    return hit

                res = fetch_func()
                if res is not None:
                    sources = _source_ids_of(resolved_tables)
                    _l1_set(key, res, ttl, sources)
                    with _lock:
                        _stats["sets"] += 1
                    try:
                        to_store = dict(res)
                        to_store["_sources"] = sources
                        redis_client.set(_REDIS_PREFIX + key, json.dumps(to_store, ensure_ascii=False, default=str), ex=ttl)
                    except Exception:
                        pass
                return res
            finally:
                redis_client.delete(lock_key)
        else:
            time.sleep(0.05)
            hit = _l1_get(key)
            if hit is not None:
                return hit

    return fetch_func()
