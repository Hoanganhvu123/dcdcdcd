"""
Challenger 2 Empirical Stress and Anti-Mock Benchmark Script.
Performs 10 consecutive live requests measuring TTFT, inter-chunk jitter, variance, and semantic validity.
"""

import json
import statistics
import time
import uuid
import httpx

BACKEND_URL = "http://127.0.0.1:5670"
FRONTEND_URL = "http://localhost:3000"

PROMPTS = [
    ("direct", f"{BACKEND_URL}/api/v1/chat/completions", "Define atomicity in ACID."),
    ("proxy", f"{FRONTEND_URL}/api/v1/chat/completions", "Define consistency in ACID."),
    ("direct", f"{BACKEND_URL}/api/v1/chat/completions", "Define isolation in ACID."),
    ("proxy", f"{FRONTEND_URL}/api/v1/chat/completions", "Define durability in ACID."),
    ("direct", f"{BACKEND_URL}/api/v1/chat/completions", "What is an inverted index in search engines?"),
    ("proxy", f"{FRONTEND_URL}/api/v1/chat/completions", "What is write-ahead logging (WAL)?"),
    ("direct", f"{BACKEND_URL}/api/v1/chat/completions", "What is B-tree indexing?"),
    ("proxy", f"{FRONTEND_URL}/api/v1/chat/completions", "What is read replica replication lag?"),
    ("direct", f"{BACKEND_URL}/api/v1/chat/completions", "What is optimistic concurrency control?"),
    ("proxy", f"{FRONTEND_URL}/api/v1/chat/completions", "What is a deadlock and how to prevent it?"),
]

def benchmark():
    results = []
    print(f"{'#':<3} | {'Type':<7} | {'TTFT (s)':<9} | {'Dur (s)':<8} | {'Chunks':<7} | {'Mean Int (ms)':<14} | {'Var (s^2)':<12} | {'Term [DONE]':<11} | {'Status'}")
    print("-" * 90)

    for idx, (typ, url, prompt) in enumerate(PROMPTS, 1):
        t0 = time.perf_counter()
        timestamps = []
        chunks = []
        accumulated = ""
        ttft = None
        done = False

        payload = {
            "conv_uid": f"stress-{idx}-{uuid.uuid4().hex[:6]}",
            "chat_mode": "chat_normal",
            "model_name": "deepseek-v4-flash",
            "user_input": prompt,
            "incremental": True,
            "temperature": 0.5,
            "max_new_tokens": 120,
        }

        with httpx.Client(timeout=30.0) as client:
            with client.stream("POST", url, json=payload, headers={"Accept": "text/event-stream"}) as resp:
                for line in resp.iter_lines():
                    t_chunk = time.perf_counter()
                    line = line.strip()
                    if not line or line.startswith(":"):
                        continue
                    if line.startswith("data:"):
                        raw = line[5:].strip()
                        if raw == "[DONE]":
                            done = True
                            break
                        try:
                            parsed = json.loads(raw)
                            choices = parsed.get("choices", [])
                            delta = choices[0].get("delta", {}).get("content", "") if choices else ""
                            if ttft is None and delta:
                                ttft = t_chunk - t0
                            accumulated += delta
                            timestamps.append(t_chunk)
                            chunks.append(delta)
                        except Exception:
                            pass

        total_dur = time.perf_counter() - t0
        intervals = [timestamps[i] - timestamps[i-1] for i in range(1, len(timestamps))]
        mean_int = statistics.mean(intervals) * 1000 if intervals else 0
        var_int = statistics.variance(intervals) if len(intervals) >= 2 else 0

        # Assertions
        passed = (
            done and 
            ttft is not None and 
            ttft >= 0.050 and 
            len(chunks) >= 5 and 
            var_int > 0.0 and 
            len(accumulated.strip()) > 20
        )
        status_str = "PASS" if passed else "FAIL"

        print(f"{idx:<3} | {typ:<7} | {ttft:8.4f}s | {total_dur:7.4f}s | {len(chunks):<7} | {mean_int:12.2f}ms | {var_int:12.8f} | {str(done):<11} | {status_str}")
        results.append({
            "run": idx,
            "type": typ,
            "prompt": prompt,
            "ttft": ttft,
            "duration": total_dur,
            "chunks": len(chunks),
            "mean_interval_ms": mean_int,
            "var_interval": var_int,
            "done": done,
            "response_preview": accumulated[:60] + "...",
            "passed": passed,
        })

    print("-" * 90)
    ttfts = [r["ttft"] for r in results if r["ttft"]]
    print(f"Summary over 10 runs:")
    print(f"Min TTFT: {min(ttfts):.4f}s | Max TTFT: {max(ttfts):.4f}s | Avg TTFT: {statistics.mean(ttfts):.4f}s")
    print(f"All 10 runs passed empirical anti-mock criteria: {all(r['passed'] for r in results)}")

if __name__ == "__main__":
    benchmark()
