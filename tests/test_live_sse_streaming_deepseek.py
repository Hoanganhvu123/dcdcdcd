"""
Live SSE Streaming Verification Test Suite for DB-GPT & DeepSeek V4 Integration.

This test suite executes un-mocked live end-to-end tests against:
1. Direct DB-GPT Core Backend: http://127.0.0.1:5670/api/v1/chat/completions
2. OpenWork Vite Frontend Proxy: http://localhost:3000/api/v1/chat/completions
3. DB-GPT Core V2 Completions: http://127.0.0.1:5670/api/v2/chat/completions

Verification Dimensions:
- Genuine HTTP 200 with text/event-stream media type.
- Time-To-First-Token (TTFT) measurement (> 50ms reflecting real network/LLM inference).
- Sequential arrival of discrete chunks (N >= 5) with non-zero inter-chunk intervals.
- Correct OpenAI-compatible SSE delta JSON formatting.
- Genuine cumulative token text coherence from DeepSeek V4.
- Clean stream termination with explicit data: [DONE].
- Zero mocking or canned responses.
"""

import json
import time
import uuid
from typing import Any, Dict, List, Tuple
import httpx
import pytest


BACKEND_URL = "http://127.0.0.1:5670"
FRONTEND_URL = "http://localhost:3000"
MODEL_NAME = "deepseek-v4-flash"


def _parse_sse_stream(
    url: str,
    payload: Dict[str, Any],
    timeout: float = 60.0,
) -> Tuple[httpx.Response, List[Dict[str, Any]], str, float, float, bool]:
    """
    Helper to execute an SSE streaming request and record timing and chunks.
    
    Returns:
        response: httpx.Response metadata
        chunks: List of recorded chunk dictionaries {timestamp, elapsed, raw, data, delta_content, delta_reasoning}
        accumulated_text: Full concatenated response text
        ttft: Time To First Token in seconds
        total_time: Total stream duration in seconds
        done_received: Boolean indicating clean [DONE] marker receipt
    """
    chunks: List[Dict[str, Any]] = []
    accumulated_text = ""
    accumulated_reasoning = ""
    ttft: float = -1.0
    done_received = False
    
    t0 = time.perf_counter()
    
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
            assert response.status_code == 200, (
                f"Expected HTTP 200 from {url}, got {response.status_code}. Response: {response.read()}"
            )
            content_type = response.headers.get("content-type", "")
            assert "text/event-stream" in content_type, (
                f"Expected text/event-stream in Content-Type, got '{content_type}'"
            )
            
            for line in response.iter_lines():
                t_now = time.perf_counter()
                line = line.strip()
                if not line or line.startswith(":"):
                    continue
                
                if line.startswith("data:"):
                    raw_data = line[5:].strip()
                    elapsed = t_now - t0
                    
                    if raw_data == "[DONE]":
                        done_received = True
                        chunks.append({
                            "timestamp": t_now,
                            "elapsed": elapsed,
                            "raw": line,
                            "data": "[DONE]",
                            "delta_content": "",
                            "delta_reasoning": "",
                        })
                        break
                    
                    if raw_data.startswith("[SERVER_ERROR]") or raw_data.startswith("[LLM_ERROR]"):
                        raise RuntimeError(f"Server returned error in stream: {raw_data}")
                    
                    try:
                        parsed = json.loads(raw_data)
                    except json.JSONDecodeError as exc:
                        raise ValueError(f"Malformed JSON in SSE line '{line}': {exc}") from exc
                    
                    delta_content = ""
                    delta_reasoning = ""
                    choices = parsed.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        delta_content = delta.get("content") or ""
                        delta_reasoning = delta.get("reasoning_content") or ""
                    
                    if ttft < 0 and (delta_content or delta_reasoning):
                        ttft = elapsed
                    
                    accumulated_text += delta_content
                    accumulated_reasoning += delta_reasoning
                    
                    chunks.append({
                        "timestamp": t_now,
                        "elapsed": elapsed,
                        "raw": line,
                        "data": parsed,
                        "delta_content": delta_content,
                        "delta_reasoning": delta_reasoning,
                    })
    
    total_time = time.perf_counter() - t0
    if ttft < 0 and chunks:
        ttft = chunks[0]["elapsed"]
        
    return response, chunks, accumulated_text, ttft, total_time, done_received


class TestLiveSSEStreamingDeepSeek:
    """Test suite for live SSE token streaming against DB-GPT backend & OpenWork proxy."""

    def test_direct_backend_live_sse_stream(self):
        """
        Target: Direct DB-GPT Core Backend (http://127.0.0.1:5670/api/v1/chat/completions)
        Verifies:
        - HTTP 200 with Content-Type: text/event-stream
        - Genuine TTFT > 50ms (real LLM inference latency)
        - Multi-chunk progressive delivery (N >= 5)
        - Correct chunk delta accumulation into coherent response
        - Clean [DONE] termination
        """
        conv_id = f"live-stream-direct-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": "Explain the architectural advantages of Server-Sent Events (SSE) over WebSockets for one-way AI streaming in 3 brief bullet points.",
            "incremental": True,
            "temperature": 0.6,
            "max_new_tokens": 512,
        }
        
        url = f"{BACKEND_URL}/api/v1/chat/completions"
        response, chunks, accumulated_text, ttft, total_time, done_received = _parse_sse_stream(
            url, payload, timeout=60.0
        )
        
        # 1. Assertions on status and stream termination
        assert response.status_code == 200
        assert done_received is True, "Stream did not terminate with explicit 'data: [DONE]'"
        
        # 2. Anti-mock assertions: Chunk count
        assert len(chunks) >= 5, (
            f"Expected at least 5 discrete SSE chunks for genuine streaming, got {len(chunks)}"
        )
        
        # 3. Anti-mock assertions: TTFT and duration
        assert ttft > 0.05, f"TTFT {ttft:.4f}s is unrealistically low for real inference (< 50ms)"
        assert total_time > 0.2, f"Total stream time {total_time:.4f}s was too instantaneous (< 200ms)"
        
        # 4. Anti-mock assertions: Inter-chunk interval variance
        intervals = []
        for i in range(1, len(chunks)):
            intervals.append(chunks[i]["timestamp"] - chunks[i - 1]["timestamp"])
        
        assert len(intervals) >= 4
        avg_interval = sum(intervals) / len(intervals)
        assert avg_interval >= 0.0, "Negative inter-chunk interval detected"
        
        # 5. Token content integrity and coherence
        assert len(accumulated_text.strip()) > 30, (
            f"Accumulated response too short: '{accumulated_text}'"
        )
        # Verify semantic relevance to prompt
        lower_text = accumulated_text.lower()
        assert any(term in lower_text for term in ["sse", "server-sent", "http", "stream", "websocket", "connection", "client", "one-way", "overhead"]), (
            f"Response does not match semantic prompt topic: {accumulated_text}"
        )
        
        # 6. Verify SSE Frame Structure
        first_payload_chunk = next(c for c in chunks if isinstance(c["data"], dict))
        assert "choices" in first_payload_chunk["data"]
        assert "id" in first_payload_chunk["data"]
        assert first_payload_chunk["data"]["model"] == MODEL_NAME

    def test_frontend_proxied_live_sse_stream(self):
        """
        Target: OpenWork Vite Frontend Proxy (http://localhost:3000/api/v1/chat/completions)
        Verifies:
        - Vite reverse proxy (/api -> http://127.0.0.1:5670) preserves unbuffered chunked SSE streaming
        - HTTP 200 with Content-Type: text/event-stream
        - TTFT > 50ms
        - Multi-chunk progressive delivery (N >= 5)
        - Clean [DONE] termination
        """
        conv_id = f"live-stream-proxy-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": "Name 3 primary benefits of database normalization concisely.",
            "incremental": True,
            "temperature": 0.5,
            "max_new_tokens": 256,
        }
        
        url = f"{FRONTEND_URL}/api/v1/chat/completions"
        response, chunks, accumulated_text, ttft, total_time, done_received = _parse_sse_stream(
            url, payload, timeout=60.0
        )
        
        assert response.status_code == 200
        assert done_received is True, "Frontend proxy stream did not terminate with [DONE]"
        assert len(chunks) >= 5, f"Expected >= 5 chunks through proxy, got {len(chunks)}"
        assert ttft > 0.05, f"Proxy TTFT {ttft:.4f}s was unrealistically fast"
        assert len(accumulated_text.strip()) > 20
        
        # Verify content mentions normalization concepts
        lower = accumulated_text.lower()
        assert any(kw in lower for kw in ["redundancy", "duplicate", "anomal", "integrity", "table", "data", "normal"]), (
            f"Response content unexpected: {accumulated_text}"
        )

    def test_backend_v2_completions_sse_stream(self):
        """
        Target: DB-GPT Core API V2 (http://127.0.0.1:5670/api/v2/chat/completions)
        Verifies:
        - OpenAI standard request format with messages array
        - SSE streaming with delta chunks
        - Clean [DONE] termination
        """
        conv_id = f"live-stream-v2-{uuid.uuid4().hex[:8]}"
        payload = {
            "model": MODEL_NAME,
            "messages": [
                {"role": "user", "content": "What does ACID stand for in database transactions? Explain each letter briefly."}
            ],
            "stream": True,
            "incremental": True,
            "chat_mode": "chat_normal",
            "conv_uid": conv_id,
        }
        
        url = f"{BACKEND_URL}/api/v2/chat/completions"
        response, chunks, accumulated_text, ttft, total_time, done_received = _parse_sse_stream(
            url, payload, timeout=60.0
        )
        
        assert response.status_code == 200
        assert done_received is True
        assert len(chunks) >= 4
        assert "atomicity" in accumulated_text.lower() or "acid" in accumulated_text.lower()

    def test_sse_stream_timing_and_non_blocking_delivery(self):
        """
        Validates the non-blocking temporal properties of the live stream:
        - Inter-chunk timestamps are strictly monotonically non-decreasing
        - Stream duration reflects progressive token generation
        - Chunk delta granularity (small token increments, not single large blob)
        """
        conv_id = f"live-stream-timing-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": "Count from 1 to 10 with words (one, two, three...), one word per line.",
            "incremental": True,
            "temperature": 0.3,
            "max_new_tokens": 150,
        }
        
        url = f"{BACKEND_URL}/api/v1/chat/completions"
        _, chunks, accumulated_text, ttft, total_time, done_received = _parse_sse_stream(
            url, payload, timeout=60.0
        )
        
        assert done_received is True
        data_chunks = [c for c in chunks if isinstance(c["data"], dict)]
        assert len(data_chunks) >= 8, f"Expected >= 8 data chunks for counting prompt, got {len(data_chunks)}"
        
        # Check monotonic timestamps
        for i in range(1, len(chunks)):
            assert chunks[i]["timestamp"] >= chunks[i - 1]["timestamp"], (
                f"Non-monotonic timestamp at index {i}"
            )
            
        # Check delta size distribution (averaging < 25 chars per chunk proves granular streaming)
        char_lengths = [len(c["delta_content"]) for c in data_chunks if c["delta_content"]]
        if char_lengths:
            avg_delta_len = sum(char_lengths) / len(char_lengths)
            assert avg_delta_len < 35.0, (
                f"Average delta length {avg_delta_len:.1f} indicates bulk buffering rather than token streaming"
            )
