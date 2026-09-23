"""
Adversarial Stress-Testing Suite for Live SSE Streaming (DeepSeek V4 Integration).

Tests:
1. Diverse Prompt Topologies:
   - Code generation with nested quotes, markdown fences, and type signatures.
   - Complex markdown tables, bullet points, and multi-paragraph technical comparisons.
   - Multilingual unicode, Vietnamese diacritics, and emoji streams.
   - Injection payloads with raw JSON, SQL syntax, escaped backslashes, and HTML tags.
2. Streaming Cancellation & Early Socket Disconnect:
   - Direct backend abort after 4 chunks.
   - Frontend proxy abort after 4 chunks.
   - Immediate server health and follow-up query verification after aborts.
3. Rapid Sequential Streaming Bursts:
   - 5 consecutive back-to-back streaming queries.
4. Concurrent Streaming Load:
   - 3 simultaneous live SSE streams.
"""

import asyncio
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
    """Helper to execute an SSE streaming request and record timing and chunks."""
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


async def _async_parse_sse_stream(
    url: str,
    payload: Dict[str, Any],
    timeout: float = 60.0,
) -> Tuple[int, int, str, bool]:
    """Async helper for concurrent streaming tests."""
    accumulated_text = ""
    chunk_count = 0
    done_received = False
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
        ) as response:
            if response.status_code != 200:
                return response.status_code, 0, "", False
            
            async for line in response.aiter_lines():
                line = line.strip()
                if not line or line.startswith(":"):
                    continue
                if line.startswith("data:"):
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        done_received = True
                        break
                    try:
                        parsed = json.loads(raw)
                        chunk_count += 1
                        choices = parsed.get("choices", [])
                        if choices:
                            accumulated_text += choices[0].get("delta", {}).get("content") or ""
                    except Exception:
                        pass
                        
    return 200, chunk_count, accumulated_text, done_received


class TestAdversarialSSEStreaming:
    """Empirical Adversarial Test Suite for DB-GPT Live SSE Streaming."""

    # -------------------------------------------------------------
    # 1. DIVERSE PROMPT TOPOLOGIES & EDGE CASES
    # -------------------------------------------------------------
    def test_code_generation_prompt(self):
        """Verify complex code generation with nested quotes, markdown fences, and type hints."""
        conv_id = f"adv-code-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": (
                "Write a complete Python function `def evaluate_rpn(tokens: list[str]) -> int:` "
                "that evaluates Reverse Polish Notation with error handling and docstrings."
            ),
            "incremental": True,
            "temperature": 0.2,
            "max_new_tokens": 400,
        }
        
        url = f"{BACKEND_URL}/api/v1/chat/completions"
        _, chunks, text, ttft, total_time, done = _parse_sse_stream(url, payload, timeout=60.0)
        
        assert done is True, "Code generation stream did not conclude with [DONE]"
        assert len(chunks) >= 15, f"Expected substantial chunk count for code, got {len(chunks)}"
        assert "def evaluate_rpn" in text or "evaluate_rpn" in text, f"Code missing target function: {text}"
        assert ("```" in text or "return" in text), f"Expected code block or python syntax: {text}"

    def test_structured_markdown_table_prompt(self):
        """Verify multi-column markdown table generation and structured text."""
        conv_id = f"adv-table-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": (
                "Create a markdown table comparing PostgreSQL, MySQL, and SQLite on 3 criteria: "
                "Concurrency Model, Default Storage Engine, Best Use Case."
            ),
            "incremental": True,
            "temperature": 0.3,
            "max_new_tokens": 350,
        }
        
        url = f"{FRONTEND_URL}/api/v1/chat/completions"
        _, chunks, text, _, _, done = _parse_sse_stream(url, payload, timeout=60.0)
        
        assert done is True
        assert len(chunks) >= 10
        assert "|" in text, f"Expected markdown table delimiter '|' in response: {text}"
        assert "PostgreSQL" in text or "sqlite" in text.lower()

    def test_multilingual_and_emoji_prompt(self):
        """Verify non-ASCII, Vietnamese diacritics, and multi-byte Unicode/Emoji handling."""
        conv_id = f"adv-unicode-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": (
                "Giải thích ngắn gọn 2 lý do tại sao lập chỉ mục (index) giúp tăng tốc truy vấn CSDL 🚀📊. "
                "Trả lời bằng tiếng Việt."
            ),
            "incremental": True,
            "temperature": 0.4,
            "max_new_tokens": 300,
        }
        
        url = f"{BACKEND_URL}/api/v1/chat/completions"
        _, chunks, text, _, _, done = _parse_sse_stream(url, payload, timeout=60.0)
        
        assert done is True
        assert len(chunks) >= 8
        # Validate Vietnamese characters remain intact without UTF-8 corruption
        assert any(ch in text for ch in "àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ"), (
            f"Vietnamese diacritics were lost or corrupted: {text}"
        )

    def test_injection_and_escaping_edge_cases(self):
        """Verify resilience against quotes, backslashes, SQL injection patterns, and HTML."""
        conv_id = f"adv-escape-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": (
                'What is the result of running: SELECT * FROM "users" WHERE \'1\'=\'1\'; '
                '<script>alert("XSS")</script> \\n\\t {"nested": [1, 2, 3]} ? '
                'Explain how parameterized queries prevent this in 1 sentence.'
            ),
            "incremental": True,
            "temperature": 0.2,
            "max_new_tokens": 200,
        }
        
        url = f"{BACKEND_URL}/api/v1/chat/completions"
        _, chunks, text, _, _, done = _parse_sse_stream(url, payload, timeout=60.0)
        
        assert done is True
        assert len(chunks) >= 5
        assert len(text.strip()) > 20
        assert "parameter" in text.lower() or "sql" in text.lower() or "inject" in text.lower()

    # -------------------------------------------------------------
    # 2. STREAMING CANCELLATION / EARLY SOCKET DISCONNECT
    # -------------------------------------------------------------
    def test_early_socket_disconnect_direct_backend(self):
        """
        Verify that abruptly disconnecting the HTTP socket after reading a few chunks
        does not crash the backend or hang subsequent requests.
        """
        conv_id = f"adv-abort-backend-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": "Write a long essay on the history of relational databases from 1970 to 2026.",
            "incremental": True,
            "max_new_tokens": 600,
        }
        
        url = f"{BACKEND_URL}/api/v1/chat/completions"
        received_chunks = 0
        
        # Abruptly close connection after 4 chunks
        with httpx.Client(timeout=30.0) as client:
            with client.stream(
                "POST",
                url,
                json=payload,
                headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            ) as response:
                assert response.status_code == 200
                for line in response.iter_lines():
                    if line.startswith("data:"):
                        received_chunks += 1
                        if received_chunks >= 4:
                            break  # Exit context manager abruptly -> closes TCP socket
        
        assert received_chunks >= 4
        
        # Verify server is immediately healthy and handles a fresh complete request
        health_resp = httpx.get(f"{BACKEND_URL}/api/health", timeout=5.0)
        assert health_resp.status_code == 200
        assert health_resp.json() == {"status": "ok"}
        
        # Follow-up streaming request must succeed completely
        follow_conv = f"adv-followup-{uuid.uuid4().hex[:8]}"
        follow_payload = {
            "conv_uid": follow_conv,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": "Say 'OK' if you can read this.",
            "incremental": True,
            "max_new_tokens": 50,
        }
        _, f_chunks, f_text, _, _, f_done = _parse_sse_stream(url, follow_payload, timeout=30.0)
        assert f_done is True
        assert len(f_chunks) >= 1

    def test_early_socket_disconnect_frontend_proxy(self):
        """
        Verify that early client socket disconnect through the Vite proxy (port 3000)
        does not freeze Vite or DB-GPT.
        """
        conv_id = f"adv-abort-proxy-{uuid.uuid4().hex[:8]}"
        payload = {
            "conv_uid": conv_id,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": "Detail the inner workings of B+ Tree balancing algorithms with pseudo code.",
            "incremental": True,
            "max_new_tokens": 600,
        }
        
        url = f"{FRONTEND_URL}/api/v1/chat/completions"
        received_chunks = 0
        
        with httpx.Client(timeout=30.0) as client:
            with client.stream(
                "POST",
                url,
                json=payload,
                headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            ) as response:
                assert response.status_code == 200
                for line in response.iter_lines():
                    if line.startswith("data:"):
                        received_chunks += 1
                        if received_chunks >= 4:
                            break
        
        assert received_chunks >= 4
        
        # Verify frontend proxy health
        health_resp = httpx.get(f"{FRONTEND_URL}/api/health", timeout=5.0)
        assert health_resp.status_code == 200
        
        # Follow-up verification through proxy
        follow_conv = f"adv-followup-proxy-{uuid.uuid4().hex[:8]}"
        follow_payload = {
            "conv_uid": follow_conv,
            "chat_mode": "chat_normal",
            "model_name": MODEL_NAME,
            "user_input": "Return the number 42.",
            "incremental": True,
            "max_new_tokens": 30,
        }
        _, f_chunks, f_text, _, _, f_done = _parse_sse_stream(url, follow_payload, timeout=30.0)
        assert f_done is True
        assert "42" in f_text

    # -------------------------------------------------------------
    # 3. RAPID SEQUENTIAL STREAMING BURSTS
    # -------------------------------------------------------------
    def test_rapid_sequential_burst(self):
        """
        Execute 5 rapid sequential streaming calls without rest intervals
        to verify no resource starvation, socket exhaustion, or deadlocks.
        """
        url = f"{BACKEND_URL}/api/v1/chat/completions"
        prompts = [
            "What is 2+2? Answer in one word.",
            "Name the primary author of Python.",
            "What does SQL stand for?",
            "What is the time complexity of binary search?",
            "What is the default port for PostgreSQL?",
        ]
        
        results = []
        for i, prompt in enumerate(prompts):
            conv_id = f"adv-burst-{i}-{uuid.uuid4().hex[:6]}"
            payload = {
                "conv_uid": conv_id,
                "chat_mode": "chat_normal",
                "model_name": MODEL_NAME,
                "user_input": prompt,
                "incremental": True,
                "max_new_tokens": 60,
            }
            _, chunks, text, ttft, dur, done = _parse_sse_stream(url, payload, timeout=30.0)
            results.append({
                "index": i,
                "prompt": prompt,
                "text": text,
                "chunks": len(chunks),
                "ttft": ttft,
                "done": done,
            })
            
        assert len(results) == 5
        for res in results:
            assert res["done"] is True, f"Request {res['index']} failed to complete: {res}"
            assert res["chunks"] >= 2, f"Request {res['index']} had insufficient chunks: {res}"
            assert len(res["text"].strip()) > 0

    # -------------------------------------------------------------
    # 4. CONCURRENT STREAMING LOAD
    # -------------------------------------------------------------
    @pytest.mark.asyncio
    async def test_concurrent_streaming_streams(self):
        """
        Fire 3 concurrent live SSE streaming requests simultaneously.
        Verifies async non-blocking concurrency across the Uvicorn/FastAPI pipeline.
        """
        url = f"{BACKEND_URL}/api/v1/chat/completions"
        tasks = []
        prompts = [
            "Explain HTTP/2 multiplexing in 2 sentences.",
            "Explain Raft consensus in 2 sentences.",
            "Explain Redis memory eviction policies in 2 sentences.",
        ]
        
        for i, prompt in enumerate(prompts):
            payload = {
                "conv_uid": f"adv-conc-{i}-{uuid.uuid4().hex[:6]}",
                "chat_mode": "chat_normal",
                "model_name": MODEL_NAME,
                "user_input": prompt,
                "incremental": True,
                "max_new_tokens": 100,
            }
            tasks.append(_async_parse_sse_stream(url, payload, timeout=60.0))
            
        results = await asyncio.gather(*tasks)
        
        assert len(results) == 3
        for idx, (status, chunk_count, text, done) in enumerate(results):
            assert status == 200, f"Concurrent stream {idx} returned status {status}"
            assert done is True, f"Concurrent stream {idx} did not receive [DONE]"
            assert chunk_count >= 5, f"Concurrent stream {idx} had only {chunk_count} chunks"
            assert len(text.strip()) > 20, f"Concurrent stream {idx} output too short: {text}"
