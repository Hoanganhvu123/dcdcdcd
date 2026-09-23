"""Cache helpers for async Redis / memory store."""
from dbgpt_analyst.common.redis_client import get_redis_client


class AsyncRedisAdapter:
    def __init__(self, client):
        self._client = client

    async def get(self, key: str):
        val = self._client.get(key)
        if isinstance(val, bytes):
            return val.decode("utf-8")
        return val

    async def set(self, key: str, value: str, ex: int | None = None):
        return self._client.set(key, value, ex=ex)

    async def delete(self, *keys: str):
        return self._client.delete(*keys)


def get_redis() -> AsyncRedisAdapter:
    client = get_redis_client()
    return AsyncRedisAdapter(client)
