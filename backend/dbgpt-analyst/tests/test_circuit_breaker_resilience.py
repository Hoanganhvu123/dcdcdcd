"""tests/test_circuit_breaker_resilience.py — Comprehensive tests for DatabaseCircuitBreaker."""
import asyncio
import time
import pytest

from dbgpt_analyst.guard.db_circuit_breaker import (
    CircuitBreakerState,
    DatabaseCircuitBreaker,
    DatabaseCircuitBreakerOpenError,
)


def test_circuit_breaker_initial_state():
    cb = DatabaseCircuitBreaker(failure_threshold=3, recovery_timeout_sec=1.0)
    assert cb.state == CircuitBreakerState.CLOSED
    assert cb.can_execute() is True
    assert cb.consecutive_failures == 0
    assert cb.last_error is None


def test_circuit_breaker_trips_to_open():
    cb = DatabaseCircuitBreaker(failure_threshold=3, recovery_timeout_sec=0.5)

    def failing_db_call():
        raise ConnectionError("PostgreSQL connection refused: socket closed")

    # Failure 1
    with pytest.raises(ConnectionError):
        cb.call(failing_db_call)
    assert cb.state == CircuitBreakerState.CLOSED
    assert cb.consecutive_failures == 1

    # Failure 2
    with pytest.raises(ConnectionError):
        cb.call(failing_db_call)
    assert cb.state == CircuitBreakerState.CLOSED
    assert cb.consecutive_failures == 2

    # Failure 3 -> Tripped!
    with pytest.raises(ConnectionError):
        cb.call(failing_db_call)
    assert cb.state == CircuitBreakerState.OPEN
    assert cb.can_execute() is False

    # Immediate subsequent call is blocked with DatabaseCircuitBreakerOpenError
    with pytest.raises(DatabaseCircuitBreakerOpenError):
        cb.call(failing_db_call)


def test_circuit_breaker_recovery_to_half_open_and_closed():
    cb = DatabaseCircuitBreaker(failure_threshold=2, recovery_timeout_sec=0.2)

    # Trip breaker
    for _ in range(2):
        cb.record_failure(ConnectionError("Timeout connecting to DB"))

    assert cb.state == CircuitBreakerState.OPEN
    assert cb.can_execute() is False

    # Wait for recovery timeout
    time.sleep(0.25)

    # Should now transition to HALF_OPEN
    assert cb.state == CircuitBreakerState.HALF_OPEN
    assert cb.can_execute() is True

    # Successful call closes the breaker
    def successful_db_call():
        return [{"count": 42}]

    result = cb.call(successful_db_call)
    assert result == [{"count": 42}]
    assert cb.state == CircuitBreakerState.CLOSED
    assert cb.consecutive_failures == 0


@pytest.mark.asyncio
async def test_async_circuit_breaker_call():
    cb = DatabaseCircuitBreaker(failure_threshold=2, recovery_timeout_sec=0.5)

    async def async_db_query(val: int):
        await asyncio.sleep(0.01)
        return val * 2

    res = await cb.acall(async_db_query, 21)
    assert res == 42
    assert cb.state == CircuitBreakerState.CLOSED

    # Async failure
    async def failing_async_query():
        await asyncio.sleep(0.01)
        raise TimeoutError("Database connection timed out after 30s")

    for _ in range(2):
        with pytest.raises(TimeoutError):
            await cb.acall(failing_async_query)

    assert cb.state == CircuitBreakerState.OPEN
    with pytest.raises(DatabaseCircuitBreakerOpenError):
        await cb.acall(async_db_query, 10)


def test_circuit_breaker_exponential_backoff():
    """Verify circuit breaker exponentially increases recovery timeout on consecutive trips."""
    cb = DatabaseCircuitBreaker(
        failure_threshold=2,
        recovery_timeout_sec=0.1,
        backoff_factor=2.0,
        max_recovery_timeout_sec=5.0,
    )

    # Trip 1
    cb.record_failure(ConnectionError("DB Down 1"))
    cb.record_failure(ConnectionError("DB Down 2"))
    assert cb.state == CircuitBreakerState.OPEN
    assert cb.trip_count == 1
    assert cb.current_recovery_timeout == pytest.approx(0.1, abs=1e-3)

    # Wait for first recovery timeout (0.1s)
    time.sleep(0.12)
    assert cb.state == CircuitBreakerState.HALF_OPEN

    # Canary failure -> Trip 2 (consecutive trip should trigger 2x backoff: 0.2s)
    cb.record_failure(ConnectionError("DB Down 3"))
    assert cb.state == CircuitBreakerState.OPEN
    assert cb.trip_count == 2
    assert cb.current_recovery_timeout == pytest.approx(0.2, abs=1e-3)

    # After only 0.11s, breaker should STILL be OPEN because timeout is now 0.2s
    time.sleep(0.11)
    assert cb.state == CircuitBreakerState.OPEN
    assert cb.can_execute() is False

    # Wait additional time (total > 0.22s since trip 2)
    time.sleep(0.12)
    assert cb.state == CircuitBreakerState.HALF_OPEN
    assert cb.can_execute() is True

    # Successful canary restores CLOSED state and resets recovery timeout
    cb.record_success()
    assert cb.state == CircuitBreakerState.CLOSED
    assert cb.trip_count == 0
    assert cb.current_recovery_timeout == pytest.approx(0.1, abs=1e-3)


def test_circuit_breaker_manual_reset():
    """Verify manual reset immediately restores CLOSED state and default settings."""
    cb = DatabaseCircuitBreaker(
        failure_threshold=2,
        recovery_timeout_sec=0.1,
        backoff_factor=2.0,
    )
    cb.record_failure(ConnectionError("Fail 1"))
    cb.record_failure(ConnectionError("Fail 2"))
    assert cb.state == CircuitBreakerState.OPEN

    cb.reset()
    assert cb.state == CircuitBreakerState.CLOSED
    assert cb.can_execute() is True
    assert cb.consecutive_failures == 0
    assert cb.trip_count == 0
    assert cb.last_error is None

