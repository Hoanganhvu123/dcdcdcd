"""
Redis Client Manager with In-Memory Fallback.

Provides a unified Redis client interface that connects to a real Redis / Upstash instance
if configured via environment variables (REDIS_URL or UPSTASH_REDIS_REST_URL),
or gracefully falls back to a clean in-memory key-value store.
"""

import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class InMemoryRedisClient:
    """Thread-safe in-memory Redis fallback implementation."""

    def __init__(self):
        self._store: Dict[str, Any] = {}
        self._expires: Dict[str, float] = {}
        self._lock = threading.Lock()

    def _purge_expired(self, key: str) -> bool:
        if key in self._expires:
            if time.time() > self._expires[key]:
                self._store.pop(key, None)
                self._expires.pop(key, None)
                return True
        return False

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if self._purge_expired(key):
                return None
            return self._store.get(key)

    def set(
        self,
        key: str,
        value: Any,
        ex: Optional[int] = None,
        px: Optional[int] = None,
        nx: bool = False,
    ) -> bool:
        with self._lock:
            self._purge_expired(key)
            if nx and key in self._store:
                return False
            self._store[key] = value
            now = time.time()
            if ex is not None:
                self._expires[key] = now + ex
            elif px is not None:
                self._expires[key] = now + (px / 1000.0)
            else:
                self._expires.pop(key, None)
            return True

    def setex(self, name: str, time_val: int, value: Any) -> bool:
        return self.set(name, value, ex=time_val)

    def delete(self, *keys: str) -> int:
        with self._lock:
            count = 0
            for k in keys:
                if k in self._store:
                    self._store.pop(k, None)
                    self._expires.pop(k, None)
                    count += 1
            return count

    def exists(self, *keys: str) -> int:
        with self._lock:
            count = 0
            for k in keys:
                if not self._purge_expired(k) and k in self._store:
                    count += 1
            return count

    def expire(self, key: str, seconds: int) -> bool:
        with self._lock:
            if not self._purge_expired(key) and key in self._store:
                self._expires[key] = time.time() + seconds
                return True
            return False

    def ttl(self, key: str) -> int:
        with self._lock:
            if self._purge_expired(key) or key not in self._store:
                return -2
            if key not in self._expires:
                return -1
            rem = int(self._expires[key] - time.time())
            return rem if rem > 0 else -2

    def keys(self, pattern: str = "*") -> List[str]:
        with self._lock:
            valid_keys = []
            for k in list(self._store.keys()):
                if not self._purge_expired(k):
                    valid_keys.append(k)
            return valid_keys

    def flushdb(self) -> bool:
        with self._lock:
            self._store.clear()
            self._expires.clear()
            return True

    def ping(self) -> bool:
        return True


_redis_instance: Optional[Any] = None


def get_redis_client() -> Any:
    """
    Get connected Redis client instance or in-memory fallback.
    """
    global _redis_instance
    if _redis_instance is not None:
        return _redis_instance

    redis_url = os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_REST_URL")
    if redis_url:
        try:
            import redis
            _redis_instance = redis.from_url(redis_url)
            logger.info("Redis client initialized from connection URL.")
            return _redis_instance
        except Exception as e:
            logger.warning(
                f"Failed to initialize Redis client from {redis_url}: {e}. Falling back to in-memory implementation."
            )

    _redis_instance = InMemoryRedisClient()
    logger.info("Initialized InMemoryRedisClient fallback.")
    return _redis_instance
