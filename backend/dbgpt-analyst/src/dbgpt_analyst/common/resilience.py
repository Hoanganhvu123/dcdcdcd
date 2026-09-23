# ponytail: pass-through, không có retry/circuit-breaker thật. Nâng cấp: port common/resilience.py gốc
# (514 dòng, ResiliencePool class) khi cần retry logic thật cho web_search/web_scrape.

class CircuitBreakerOpenException(Exception):
    pass

class _ResiliencePool:
    async def execute(self, name: str, func):
        return await func()


resilience_pool = _ResiliencePool()