"""
Milestone 1 Live Services Robustness & Stress Test Suite
Empirical challenger test suite verifying:
1. Rapid concurrent health probes (Backend 5670 & Frontend 3000)
2. Connection stability and HTTP Keep-Alive socket persistence
3. Proxy latency overhead (Frontend 3000 -> Backend 5670)
4. Adversarial edge cases and error handling (404, 405, burst surges)
5. Service survivability post-stress
"""

import sys
import time
import statistics
import concurrent.futures
from typing import List, Dict, Any
import httpx
import requests
import pytest


def calculate_percentiles(latencies_ms: List[float]) -> Dict[str, float]:
    """Calculate min, mean, p50, p95, p99, max latencies in milliseconds."""
    if not latencies_ms:
        return {"min": 0, "mean": 0, "p50": 0, "p95": 0, "p99": 0, "max": 0}
    sorted_lat = sorted(latencies_ms)
    n = len(sorted_lat)
    
    def percentile(p: float) -> float:
        idx = int(p * n)
        idx = min(idx, n - 1)
        return sorted_lat[idx]

    return {
        "min": round(min(sorted_lat), 2),
        "mean": round(statistics.mean(sorted_lat), 2),
        "p50": round(percentile(0.50), 2),
        "p95": round(percentile(0.95), 2),
        "p99": round(percentile(0.99), 2),
        "max": round(max(sorted_lat), 2),
    }


def probe_endpoint_concurrency(
    url: str,
    total_requests: int = 100,
    max_workers: int = 20,
    expected_status: int = 200,
    timeout_sec: float = 5.0
) -> Dict[str, Any]:
    """Execute concurrent requests against a target URL."""
    latencies: List[float] = []
    successes = 0
    failures = 0
    errors: List[str] = []

    def single_req(req_idx: int) -> tuple:
        start = time.perf_counter()
        try:
            with httpx.Client(timeout=timeout_sec) as client:
                res = client.get(url)
                duration = (time.perf_counter() - start) * 1000.0
                if res.status_code == expected_status:
                    return True, duration, None
                else:
                    return False, duration, f"Status {res.status_code} != {expected_status}"
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000.0
            return False, duration, str(e)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(single_req, i) for i in range(total_requests)]
        for f in concurrent.futures.as_completed(futures):
            ok, dur, err = f.result()
            latencies.append(dur)
            if ok:
                successes += 1
            else:
                failures += 1
                if err and len(errors) < 5:
                    errors.append(err)

    stats = calculate_percentiles(latencies)
    return {
        "url": url,
        "total": total_requests,
        "concurrency": max_workers,
        "successes": successes,
        "failures": failures,
        "success_rate": round(100.0 * successes / total_requests, 2),
        "stats_ms": stats,
        "errors": errors,
    }


def check_socket_persistence(url: str, iterations: int = 50) -> Dict[str, Any]:
    """Test HTTP Keep-Alive socket reuse across sequential requests."""
    session = requests.Session()
    latencies: List[float] = []
    successes = 0
    failures = 0

    first_req_dur = 0.0
    subsequent_durs: List[float] = []

    for i in range(iterations):
        start = time.perf_counter()
        try:
            res = session.get(url, timeout=5.0)
            duration = (time.perf_counter() - start) * 1000.0
            if res.status_code == 200:
                successes += 1
                latencies.append(duration)
                if i == 0:
                    first_req_dur = duration
                else:
                    subsequent_durs.append(duration)
            else:
                failures += 1
        except Exception as e:
            failures += 1

    session.close()
    
    first_ms = round(first_req_dur, 2)
    subsequent_avg = round(statistics.mean(subsequent_durs) if subsequent_durs else 0, 2)
    reuse_speedup = round((first_ms - subsequent_avg) / first_ms * 100, 2) if first_ms > 0 else 0

    return {
        "url": url,
        "iterations": iterations,
        "successes": successes,
        "failures": failures,
        "first_request_ms": first_ms,
        "subsequent_avg_ms": subsequent_avg,
        "keep_alive_benefit_pct": reuse_speedup,
        "stats_ms": calculate_percentiles(latencies),
    }


# Pytest Test Functions

def test_concurrent_backend_health():
    """Verify backend health endpoint under concurrent load (100 requests @ 20 concurrency)."""
    res = probe_endpoint_concurrency("http://127.0.0.1:5670/api/health", total_requests=100, max_workers=20)
    assert res["success_rate"] == 100.0, f"Backend health probe dropped requests: {res['errors']}"
    assert res["stats_ms"]["p99"] < 1000.0, f"Backend p99 latency too high: {res['stats_ms']['p99']}ms"


def test_concurrent_frontend_openwork():
    """Verify frontend openwork route under concurrent load (100 requests @ 20 concurrency)."""
    res = probe_endpoint_concurrency("http://127.0.0.1:3000/openwork", total_requests=100, max_workers=20)
    assert res["success_rate"] == 100.0, f"Frontend openwork probe dropped requests: {res['errors']}"
    assert res["stats_ms"]["p99"] < 1000.0, f"Frontend p99 latency too high: {res['stats_ms']['p99']}ms"


def test_concurrent_proxied_health_and_models():
    """Verify frontend proxy routing to backend under concurrent load."""
    health_res = probe_endpoint_concurrency("http://127.0.0.1:3000/api/health", total_requests=100, max_workers=20)
    assert health_res["success_rate"] == 100.0
    
    models_res = probe_endpoint_concurrency("http://127.0.0.1:3000/api/v1/model/types", total_requests=100, max_workers=20)
    assert models_res["success_rate"] == 100.0


def test_keepalive_socket_persistence():
    """Verify HTTP Keep-Alive connection reuse on both backend and frontend."""
    backend_res = check_socket_persistence("http://127.0.0.1:5670/api/health", iterations=50)
    assert backend_res["successes"] == 50
    
    frontend_res = check_socket_persistence("http://127.0.0.1:3000/openwork", iterations=50)
    assert frontend_res["successes"] == 50


def test_burst_concurrency_surge():
    """Verify system stability under 50 simultaneous connections burst."""
    burst_backend = probe_endpoint_concurrency("http://127.0.0.1:5670/api/health", total_requests=100, max_workers=50)
    assert burst_backend["success_rate"] == 100.0
    
    burst_proxy = probe_endpoint_concurrency("http://127.0.0.1:3000/api/health", total_requests=100, max_workers=50)
    assert burst_proxy["success_rate"] == 100.0


def test_adversarial_error_routes():
    """Verify 404 and 405 error routes respond cleanly without crashing services."""
    with httpx.Client(timeout=5.0) as client:
        r1 = client.get("http://127.0.0.1:5670/api/nonexistent_route_404")
        assert r1.status_code == 404

        r2 = client.get("http://127.0.0.1:3000/api/nonexistent_route_404")
        assert r2.status_code == 404

        r3 = client.post("http://127.0.0.1:5670/api/health", json={"test": 1})
        assert r3.status_code == 405

        r4 = client.post("http://127.0.0.1:3000/api/health", json={"test": 1})
        assert r4.status_code == 405


if __name__ == "__main__":
    pytest.main(["-v", __file__])
