"""
Live SSE Stream Telemetry Collector for DB-GPT & DeepSeek V4 Integration.

Connects to:
- Direct Backend: http://127.0.0.1:5670/api/v1/chat/completions
- Frontend Proxy: http://localhost:3000/api/v1/chat/completions

Collects and records granular chunk timestamps, delta contents, TTFT, inter-chunk deltas,
and outputs a structured audit artifact.
"""

import json
import os
import sys
import time
import uuid
import httpx


def record_stream(endpoint_label: str, url: str, prompt: str, output_file: str):
    print(f"\n=======================================================")
    print(f"Executing Live Stream Verification: {endpoint_label}")
    print(f"Target URL: {url}")
    print(f"Prompt: {prompt}")
    print(f"=======================================================")

    payload = {
        "conv_uid": f"telemetry-{uuid.uuid4().hex[:8]}",
        "chat_mode": "chat_normal",
        "model_name": "deepseek-v4-flash",
        "user_input": prompt,
        "incremental": True,
        "temperature": 0.6,
        "max_new_tokens": 256,
    }

    t0 = time.perf_counter()
    chunks = []
    accumulated_text = ""
    ttft = None
    done_marker = False

    with httpx.Client(timeout=60.0) as client:
        with client.stream(
            "POST",
            url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
        ) as response:
            status_code = response.status_code
            content_type = response.headers.get("content-type", "")
            print(f"Response Status: {status_code}")
            print(f"Content-Type: {content_type}")

            for line in response.iter_lines():
                t_now = time.perf_counter()
                line = line.strip()
                if not line or line.startswith(":"):
                    continue

                if line.startswith("data:"):
                    data_str = line[5:].strip()
                    elapsed_sec = t_now - t0

                    if data_str == "[DONE]":
                        done_marker = True
                        print(f"[{elapsed_sec:7.4f}s] [DONE] Stream Terminated Cleanly")
                        chunks.append({
                            "chunk_idx": len(chunks) + 1,
                            "elapsed_sec": round(elapsed_sec, 4),
                            "type": "marker",
                            "content": "[DONE]",
                        })
                        break

                    try:
                        parsed = json.loads(data_str)
                    except Exception as e:
                        print(f"[{elapsed_sec:7.4f}s] [PARSE_ERR] {data_str} ({e})")
                        continue

                    delta_content = ""
                    choices = parsed.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        delta_content = delta.get("content") or ""

                    if ttft is None and delta_content:
                        ttft = elapsed_sec
                        print(f"[{elapsed_sec:7.4f}s] [FIRST_TOKEN / TTFT] -> '{delta_content}'")
                    else:
                        print(f"[{elapsed_sec:7.4f}s] Chunk #{len(chunks)+1:02d} (+{(elapsed_sec - (chunks[-1]['elapsed_sec'] if chunks else 0))*1000:5.1f}ms): '{delta_content}'")

                    accumulated_text += delta_content
                    chunks.append({
                        "chunk_idx": len(chunks) + 1,
                        "elapsed_sec": round(elapsed_sec, 4),
                        "type": "delta",
                        "content": delta_content,
                        "model": parsed.get("model"),
                    })

    total_duration = time.perf_counter() - t0
    print(f"\n--- Stream Summary ---")
    print(f"Total Chunks: {len(chunks)}")
    print(f"TTFT (Time-To-First-Token): {ttft:.4f}s" if ttft else "TTFT: N/A")
    print(f"Total Stream Duration: {total_duration:.4f}s")
    print(f"Done Received: {done_marker}")
    print(f"Accumulated Text ({len(accumulated_text)} chars):\n{accumulated_text}\n")

    telemetry = {
        "endpoint_label": endpoint_label,
        "url": url,
        "model": "deepseek-v4-flash",
        "status_code": status_code,
        "content_type": content_type,
        "ttft_sec": round(ttft, 4) if ttft else None,
        "total_duration_sec": round(total_duration, 4),
        "total_chunks": len(chunks),
        "done_marker": done_marker,
        "accumulated_text": accumulated_text,
        "chunks": chunks,
    }
    return telemetry


if __name__ == "__main__":
    out_dir = "/home/vu-hoang-anh/project/db gpt/.agents/worker_m2"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "live_stream_telemetry.json")

    results = []

    # 1. Direct backend test
    t1 = record_stream(
        "Direct DB-GPT Backend (5670)",
        "http://127.0.0.1:5670/api/v1/chat/completions",
        "List 3 core benefits of asynchronous streaming in modern web apps.",
        out_path,
    )
    results.append(t1)

    # 2. Frontend proxy test
    t2 = record_stream(
        "OpenWork Vite Frontend Proxy (3000)",
        "http://localhost:3000/api/v1/chat/completions",
        "Explain the CAP theorem in 2 concise sentences.",
        out_path,
    )
    results.append(t2)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Saved complete telemetry log to {out_path}")
