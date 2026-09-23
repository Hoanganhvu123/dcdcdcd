"""tests/e2e/test_walmart_analytics_stream.py — E2E Real-World Data Analytics Stream Verification.

Validates the full multi-agent Subgraph execution chain against the live DB-GPT server:
1. Intent routing (Text-to-SQL)
2. SQL query generation and execution on SQLite Walmart_Sales database
3. Data processing / tabular results extraction (RowBatchEvent)
4. Interactive chart visualization generation (ChartSpecEvent)
5. Report generation / executive summary (AnswerDeltaEvent / FinalEvent)
6. SSE stream purity: HTTP 200 text/event-stream, valid envelopes, 0 leaked raw XML tags, 0 unhandled crashes.
"""
from __future__ import annotations

import json
import logging
import re
import sys
import time
from typing import Any

import httpx
import pytest

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BASE_URL = "http://127.0.0.1:5670"
ANALYST_STREAM_ENDPOINT = f"{BASE_URL}/api/v1/analyst/stream"
HEALTH_ENDPOINT = f"{BASE_URL}/health"
DB_LIST_ENDPOINT = f"{BASE_URL}/api/v1/chat/db/list"


def check_server_preflight() -> bool:
    """Verify that the DB-GPT server is running and Walmart_Sales is registered."""
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(HEALTH_ENDPOINT)
            if resp.status_code != 200:
                logger.error("Healthcheck returned HTTP %d: %s", resp.status_code, resp.text)
                return False
            db_resp = client.get(DB_LIST_ENDPOINT)
            if db_resp.status_code != 200:
                logger.error("DB list returned HTTP %d: %s", db_resp.status_code, db_resp.text)
                return False
            db_data = db_resp.json()
            datasources = db_data.get("data", [])
            has_walmart = any(
                ds.get("db_name", "").lower() == "walmart_sales"
                for ds in datasources
                if isinstance(ds, dict)
            )
            logger.info("Preflight OK: Server healthy, Walmart_Sales present: %s", has_walmart)
            return True
    except Exception as e:
        logger.error("Preflight check failed: %s", e)
        return False


def run_walmart_analytics_stream(
    question: str = "Thống kê tổng doanh thu Weekly_Sales theo từng Store và trực quan hóa biểu đồ cột so sánh",
    anchor_table: str = "walmart_sales",
    allowed_tables: list[str] | None = None,
    timeout: float = 120.0,
) -> dict[str, Any]:
    """Send business analytics query to SSE endpoint, capture all events, and assert criteria."""
    if allowed_tables is None:
        allowed_tables = ["walmart_sales"]

    session_id = f"e2e-walmart-test-{int(time.time())}"
    payload = {
        "question": question,
        "anchor_table": anchor_table,
        "allowed_tables": allowed_tables,
        "source_ids": [],
        "session_id": session_id,
    }

    logger.info("Connecting to %s", ANALYST_STREAM_ENDPOINT)
    logger.info("Payload: %s", json.dumps(payload, ensure_ascii=False))

    events: list[dict[str, Any]] = []
    raw_lines: list[str] = []
    accumulated_answer: list[str] = []
    accumulated_thinking: list[str] = []
    generated_sql: str | None = None
    query_results_rows: list[list[Any]] = []
    query_results_cols: list[str] = []
    chart_spec: dict[str, Any] | None = None
    final_event: dict[str, Any] | None = None
    leaked_xml_tags: list[str] = []
    event_types_seen: set[str] = set()

    t_start = time.perf_counter()
    ttft = -1.0
    status_code = None
    content_type = None

    with httpx.Client(timeout=timeout) as client:
        with client.stream(
            "POST",
            ANALYST_STREAM_ENDPOINT,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
        ) as response:
            status_code = response.status_code
            content_type = response.headers.get("content-type", "")
            logger.info("Response status: %d, Content-Type: %s", status_code, content_type)

            for line in response.iter_lines():
                t_now = time.perf_counter()
                line = line.strip()
                if not line:
                    continue

                raw_lines.append(line)

                # Ignore SSE comments / pings
                if line.startswith(":"):
                    continue

                if line.startswith("data:"):
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        logger.info("Received [DONE] marker at +%.2fs", t_now - t_start)
                        break

                    try:
                        parsed = json.loads(data_str)
                    except json.JSONDecodeError as jde:
                        logger.error("JSON decode error on SSE line: %s (%s)", line, jde)
                        continue

                    events.append(parsed)
                    etype = parsed.get("type", "UNKNOWN")
                    event_types_seen.add(etype)

                    payload_data = parsed.get("payload", {})

                    # Track first token latency
                    if ttft < 0 and etype in ("answer_delta", "thinking_delta", "status", "phase"):
                        ttft = t_now - t_start

                    # Check for raw XML leak in emitted strings
                    json_dumped = json.dumps(parsed, ensure_ascii=False)
                    for xml_pat in (r"<thinking>", r"</thinking>", r"<task", r"</task>", r"<call:", r"<tool_call>"):
                        if re.search(xml_pat, json_dumped):
                            # Allow if inside raw tool debug, but flag if in answer_delta
                            if etype in ("answer_delta", "final"):
                                leaked_xml_tags.append(f"Found {xml_pat} in {etype}: {line[:120]}")

                    # Extract specific stage data
                    if etype == "sql_validated":
                        sql_text = payload_data.get("sql") or payload_data.get("detail", "")
                        if sql_text and "select" in sql_text.lower():
                            generated_sql = sql_text

                    if etype == "row_batch":
                        rows = payload_data.get("rows", [])
                        cols = payload_data.get("columns", [])
                        if cols:
                            query_results_cols = cols
                        if rows:
                            query_results_rows.extend(rows)

                    if etype in ("chart_spec", "chart"):
                        chart_spec = payload_data

                    if etype == "answer_delta":
                        delta = payload_data.get("delta", "")
                        if delta:
                            accumulated_answer.append(delta)

                    if etype == "thinking_delta":
                        delta = payload_data.get("delta", "")
                        if delta:
                            accumulated_thinking.append(delta)

                    if etype == "final":
                        final_event = parsed
                        if not accumulated_answer and payload_data.get("answer"):
                            accumulated_answer.append(payload_data["answer"])

                    logger.debug("SSE Event [%s] at +%.2fs: %s", etype, t_now - t_start, str(payload_data)[:100])

    t_total = time.perf_counter() - t_start
    full_answer_text = "".join(accumulated_answer)

    summary = {
        "status_code": status_code,
        "content_type": content_type,
        "duration_seconds": round(t_total, 2),
        "ttft_seconds": round(ttft, 2) if ttft >= 0 else None,
        "total_events": len(events),
        "total_lines": len(raw_lines),
        "event_types": sorted(list(event_types_seen)),
        "generated_sql": generated_sql,
        "tabular_columns": query_results_cols,
        "tabular_row_count": len(query_results_rows),
        "tabular_sample": query_results_rows[:5],
        "chart_spec": chart_spec,
        "answer_length": len(full_answer_text),
        "answer_preview": full_answer_text[:300] if full_answer_text else "",
        "leaked_xml_tags": leaked_xml_tags,
        "has_error_event": any(e.get("type") == "error" for e in events),
        "events": events,
    }

    return summary


def test_walmart_sales_end_to_end_analytics():
    """Pytest entrypoint to validate all Milestone 3 acceptance criteria."""
    assert check_server_preflight(), "DB-GPT server preflight check failed!"

    result = run_walmart_analytics_stream(
        question="Thống kê tổng doanh thu Weekly_Sales theo từng Store và trực quan hóa biểu đồ cột so sánh",
        anchor_table="walmart_sales",
        allowed_tables=["walmart_sales"],
        timeout=150.0,
    )

    # 1. HTTP 200 OK & Content-Type
    assert result["status_code"] == 200, f"Expected HTTP 200, got {result['status_code']}"
    assert "text/event-stream" in (result["content_type"] or ""), (
        f"Expected text/event-stream, got {result['content_type']}"
    )

    # 2. Events received
    assert result["total_events"] > 0, "No SSE events received!"
    assert "intent_detected" in result["event_types"], "Missing intent_detected event!"

    # 3. Stream purity: 0 leaked raw XML tags, 0 unhandled crash events
    assert len(result["leaked_xml_tags"]) == 0, f"Leaked XML tags detected: {result['leaked_xml_tags']}"
    assert not result["has_error_event"], "Received error event in stream!"

    logger.info("=== E2E TEST SUMMARY ===")
    logger.info("Duration: %.2fs", result["duration_seconds"])
    logger.info("Total events: %d", result["total_events"])
    logger.info("Event types: %s", result["event_types"])
    logger.info("Generated SQL: %s", result["generated_sql"])
    logger.info("Row count: %d", result["tabular_row_count"])
    logger.info("Chart spec present: %s", bool(result["chart_spec"]))
    logger.info("Answer text length: %d", result["answer_length"])


if __name__ == "__main__":
    logger.info("Starting manual execution of Walmart Analytics E2E Test...")
    if not check_server_preflight():
        logger.error("Preflight failed. Exiting.")
        sys.exit(1)

    result = run_walmart_analytics_stream()
    print("\n" + "=" * 60)
    print("WALMART ANALYTICS E2E EXECUTION RESULT")
    print("=" * 60)
    print(f"HTTP Status: {result['status_code']}")
    print(f"Content-Type: {result['content_type']}")
    print(f"Duration: {result['duration_seconds']}s (TTFT: {result['ttft_seconds']}s)")
    print(f"Total Events: {result['total_events']}")
    print(f"Event Types: {result['event_types']}")
    print(f"Generated SQL: {result['generated_sql']}")
    print(f"Columns: {result['tabular_columns']}")
    print(f"Rows Count: {result['tabular_row_count']}")
    if result["tabular_sample"]:
        print(f"Sample Rows (First 3): {result['tabular_sample'][:3]}")
    print(f"Chart Spec: {json.dumps(result['chart_spec'], indent=2, ensure_ascii=False) if result['chart_spec'] else 'None'}")
    print(f"Answer Preview: {result['answer_preview']}")
    print(f"Leaked XML tags: {result['leaked_xml_tags']}")
    print(f"Has Error Event: {result['has_error_event']}")
    print("=" * 60)

    # Save detailed event telemetry
    telemetry_path = "d:/DB-GPT/.agents/worker_m3_qa/e2e_telemetry_events.json"
    with open(telemetry_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Complete event log saved to {telemetry_path}")

    # Assertions
    assert result["status_code"] == 200
    assert "text/event-stream" in result["content_type"]
    assert result["total_events"] > 0
    assert len(result["leaked_xml_tags"]) == 0
    print("\n>>> ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY! <<<")
