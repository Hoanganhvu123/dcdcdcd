"""
Challenger 2 Empirical Verification Test Suite:
Telemetry, Timing, Inter-Chunk Arrival Variance, and Anti-Mock Validation.

Target Endpoints:
- Direct DB-GPT Core Backend: http://127.0.0.1:5670/api/v1/chat/completions
- OpenWork Vite Frontend Proxy: http://localhost:3000/api/v1/chat/completions
- DB-GPT Core API V2: http://127.0.0.1:5670/api/v2/chat/completions
"""

import json
import statistics
import time
import uuid
from typing import Any, Dict, List, Tuple
import httpx
import pytest

BACKEND_URL = "http://127.0.0.1:5670"
FRONTEND_URL = "http://localhost:3000"
MODEL_NAME = "deepseek-v4-flash"


def collect_live_stream_telemetry(
    url: str,
    payload: Dict[str, Any],
    timeout: float = 60.0,
) -> Dict[str, Any]:
    """
    Executes a live SSE stream request and gathers granular per-chunk timing & telemetry.
    """
    timestamps: List[float] = []
    chunk_data_list: List[Dict[str, Any]] = []
    accumulated_text = ""
    accumulated_reasoning = ""
    ttft: float = -1.0
    done_received = False

    t_start = time.perf_counter()

    with httpx.Client(timeout=timeout) as client:
        with client.stream(
            "POST",
            url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
        ) as response:
            assert response.status_code == 200, f"HTTP status was {response.status_code}"
            content_type = response.headers.get("content-type", "")
            assert "text/event-stream" in content_type, f"Content-Type was {content_type}"

            for line in response.iter_lines():
                t_chunk = time.perf_counter()
                line = line.strip()
                if not line or line.startswith(":"):
                    continue

                if line.startswith("data:"):
                    raw_data = line[5:].strip()
                    elapsed = t_chunk - t_start

                    if raw_data == "[DONE]":
                        done_received = True
                        timestamps.append(t_chunk)
                        chunk_data_list.append({
                            "type": "DONE",
                            "elapsed": elapsed,
                            "raw": line,
                            "delta_content": "",
                        })
                        break

                    if raw_data.startswith("[SERVER_ERROR]") or raw_data.startswith("[LLM_ERROR]"):
                        raise RuntimeError(f"Server error in stream: {raw_data}")

                    try:
                        parsed = json.loads(raw_data)
                    except json.JSONDecodeError as exc:
                        raise ValueError(f"Invalid JSON in stream chunk: {exc}") from exc

                    choices = parsed.get("choices", [])
                    delta_content = ""
                    delta_reasoning = ""
                    if choices:
                        delta = choices[0].get("delta", {})
                        delta_content = delta.get("content") or ""
                        delta_reasoning = delta.get("reasoning_content") or ""

                    if ttft < 0 and (delta_content or delta_reasoning):
                        ttft = elapsed

                    accumulated_text += delta_content
                    accumulated_reasoning += delta_reasoning
                    timestamps.append(t_chunk)
                    chunk_data_list.append({
                        "type": "DELTA",
                        "elapsed": elapsed,
                        "raw": line,
                        "data": parsed,
                        "delta_content": delta_content,
                        "delta_reasoning": delta_reasoning,
                    })

    t_end = time.perf_counter()
    total_duration = t_end - t_start

    # Inter-chunk intervals
    intervals = []
    for i in range(1, len(timestamps)):
        intervals.append(timestamps[i] - timestamps[i - 1])

    mean_interval = statistics.mean(intervals) if len(intervals) >= 1 else 0.0
    var_interval = statistics.variance(intervals) if len(intervals) >= 2 else 0.0
    stdev_interval = statistics.stdev(intervals) if len(intervals) >= 2 else 0.0

    return {
        "url": url,
        "status_code": response.status_code,
        "content_type": content_type,
        "ttft": ttft,
        "total_duration": total_duration,
        "total_chunks": len(chunk_data_list),
        "data_chunks_count": sum(1 for c in chunk_data_list if c["type"] == "DELTA"),
        "done_received": done_received,
        "accumulated_text": accumulated_text,
        "accumulated_reasoning": accumulated_reasoning,
        "intervals": intervals,
        "mean_interval_sec": mean_interval,
        "variance_interval_sec2": var_interval,
        "stdev_interval_sec": stdev_interval,
        "chunk_data_list": chunk_data_list,
    }


class TestChallengerLiveStreamingTelemetry:
    """
    Adversarial & Empirical Challenger Suite for Live Token Streaming Telemetry.
    Stress-tests TTFT, variance, non-zero chunk latencies, and anti-mock properties.
    """

    @pytest.mark.parametrize("run_idx,prompt,expected_keywords", [
        (1, "What is the difference between concurrency and parallelism? Explain in 2 sentences.", ["concurrent", "parallel", "task", "simultaneous", "thread"]),
        (2, "Write a Python one-liner to reverse a string and explain how slice notation works.", ["[::-1]", "slice", "step", "reverse", "index"]),
        (3, "Describe the primary role of a reverse proxy like Nginx or Vite in 3 concise bullet points.", ["proxy", "request", "server", "load", "forward", "client", "route"]),
    ])
    def test_direct_backend_multiple_live_runs_telemetry(self, run_idx: int, prompt: str, expected_keywords: List[str]):
        """
        Runs multiple live requests against Direct DB-GPT Backend (5670).
        Verifies:
        - TTFT > 50ms (strictly asserts against instant mock responses)
        - Variance of inter-chunk arrival > 0 (confirms progressive non-deterministic network arrival)
        - Chunk count >= 5
        - Clean [DONE] termination
        - Semantic relevance
        """
        payload = {
            "conv_uid": f"chal-direct-run{run_idx}-{uuid.uuid4().hex[:6]}",
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": prompt,
            "incremental": True,
            "temperature": 0.5,
            "max_new_tokens": 300,
        }
        url = f"{BACKEND_URL}/api/v1/chat/completions"

        telemetry = collect_live_stream_telemetry(url, payload)

        print(f"\n[Direct Run {run_idx}] TTFT: {telemetry['ttft']:.4f}s | "
              f"Duration: {telemetry['total_duration']:.4f}s | "
              f"Chunks: {telemetry['total_chunks']} | "
              f"Mean interval: {telemetry['mean_interval_sec']*1000:.2f}ms | "
              f"Interval Variance: {telemetry['variance_interval_sec2']:.8f} s^2 | "
              f"Interval Stdev: {telemetry['stdev_interval_sec']*1000:.2f}ms")

        # 1. Clean termination
        assert telemetry["done_received"] is True, "Stream did not end with [DONE]"

        # 2. Real latency / Anti-mock validation
        assert telemetry["ttft"] >= 0.050, f"TTFT {telemetry['ttft']:.4f}s is <= 50ms (mock or unnatural speed)"
        assert telemetry["total_chunks"] >= 5, f"Expected >= 5 chunks, got {telemetry['total_chunks']}"
        assert telemetry["total_duration"] >= 0.20, f"Stream completed unrealistically fast: {telemetry['total_duration']:.4f}s"

        # 3. Inter-chunk arrival variance
        assert telemetry["variance_interval_sec2"] > 0.0, "Inter-chunk arrival variance was 0.0 (synthetic or static delivery)"
        assert telemetry["stdev_interval_sec"] > 0.0, "Inter-chunk standard deviation was 0.0"

        # 4. Granularity / Non-bulk check
        deltas = [c["delta_content"] for c in telemetry["chunk_data_list"] if c["type"] == "DELTA" and c["delta_content"]]
        avg_chars = sum(len(d) for d in deltas) / len(deltas) if deltas else 0
        assert avg_chars < 50, f"Average characters per chunk ({avg_chars:.1f}) exceeds token streaming granularity threshold"

        # 5. Semantic validity
        text_lower = telemetry["accumulated_text"].lower()
        assert len(text_lower) >= 30, f"Accumulated text too short: '{telemetry['accumulated_text']}'"
        assert any(kw in text_lower for kw in expected_keywords), (
            f"Generated text '{telemetry['accumulated_text']}' failed semantic keyword check {expected_keywords}"
        )

    @pytest.mark.parametrize("run_idx,prompt,expected_keywords", [
        (1, "What are the three components of MVC architecture? Answer briefly.", ["model", "view", "controller", "data", "logic"]),
        (2, "Give two examples of NoSQL databases and their primary use case.", ["mongo", "redis", "cassandra", "document", "key-value", "cache", "nosql"]),
    ])
    def test_frontend_proxy_multiple_live_runs_telemetry(self, run_idx: int, prompt: str, expected_keywords: List[str]):
        """
        Runs multiple live requests through OpenWork Vite Frontend Proxy (3000).
        Verifies:
        - Proxy passes streaming chunks without buffering (TTFT > 50ms, variance > 0)
        - Clean [DONE]
        - High fidelity token delivery
        """
        payload = {
            "conv_uid": f"chal-proxy-run{run_idx}-{uuid.uuid4().hex[:6]}",
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": prompt,
            "incremental": True,
            "temperature": 0.5,
            "max_new_tokens": 250,
        }
        url = f"{FRONTEND_URL}/api/v1/chat/completions"

        telemetry = collect_live_stream_telemetry(url, payload)

        print(f"\n[Proxy Run {run_idx}] TTFT: {telemetry['ttft']:.4f}s | "
              f"Duration: {telemetry['total_duration']:.4f}s | "
              f"Chunks: {telemetry['total_chunks']} | "
              f"Mean interval: {telemetry['mean_interval_sec']*1000:.2f}ms | "
              f"Interval Variance: {telemetry['variance_interval_sec2']:.8f} s^2 | "
              f"Interval Stdev: {telemetry['stdev_interval_sec']*1000:.2f}ms")

        # 1. Clean termination
        assert telemetry["done_received"] is True, "Proxy stream did not terminate with [DONE]"

        # 2. Anti-mock assertions
        assert telemetry["ttft"] >= 0.050, f"Proxy TTFT {telemetry['ttft']:.4f}s <= 50ms"
        assert telemetry["total_chunks"] >= 5, f"Proxy chunk count {telemetry['total_chunks']} < 5"
        assert telemetry["variance_interval_sec2"] > 0.0, "Proxy inter-chunk variance was 0.0"

        # 3. Content assertions
        text_lower = telemetry["accumulated_text"].lower()
        assert len(text_lower) >= 25
        assert any(kw in text_lower for kw in expected_keywords), (
            f"Generated text '{telemetry['accumulated_text']}' failed proxy semantic check {expected_keywords}"
        )

    def test_v2_completions_telemetry(self):
        """
        Validates API v2 endpoint streaming telemetry.
        """
        payload = {
            "model": MODEL_NAME,
            "messages": [{"role": "user", "content": "Explain binary search in 1 simple sentence."}],
            "stream": True,
            "incremental": True,
            "chat_mode": "chat_normal",
            "conv_uid": f"chal-v2-{uuid.uuid4().hex[:6]}",
        }
        url = f"{BACKEND_URL}/api/v2/chat/completions"
        telemetry = collect_live_stream_telemetry(url, payload)

        print(f"\n[API v2 Run] TTFT: {telemetry['ttft']:.4f}s | "
              f"Duration: {telemetry['total_duration']:.4f}s | "
              f"Chunks: {telemetry['total_chunks']} | "
              f"Mean interval: {telemetry['mean_interval_sec']*1000:.2f}ms | "
              f"Interval Variance: {telemetry['variance_interval_sec2']:.8f} s^2")

        assert telemetry["done_received"] is True
        assert telemetry["ttft"] >= 0.050
        assert telemetry["total_chunks"] >= 5
        assert telemetry["variance_interval_sec2"] > 0.0
        assert "search" in telemetry["accumulated_text"].lower() or "half" in telemetry["accumulated_text"].lower() or "sorted" in telemetry["accumulated_text"].lower() or "divide" in telemetry["accumulated_text"].lower()
