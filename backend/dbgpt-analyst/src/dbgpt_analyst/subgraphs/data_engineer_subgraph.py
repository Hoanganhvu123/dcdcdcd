"""subgraphs/data_engineer_subgraph.py — Data Engineer Subgraph (Full ReAct Agent).

Gộp TOÀN BỘ tinh hoa từ:
  1) data_engineer_graph.py (v3): 5 in-memory analysis tools
  2) old data_engineer_subgraph.py: 3-node pipeline (profiler→planner→executor)
  3) preferences/ai_data_clean_agent/nodes/clean.py: deep clean heuristics
  4) preferences/ai_data_clean_agent/recipe_*.py: recipe system (0-LLM-call matching)
  5) preferences/ai_data_clean_agent/nodes/validate.py: VN-specific format validation
  6) preferences/ai_data_clean_agent/nodes/standardize.py: schema suggestions
  7) preferences/ai_data_clean_agent/nodes/linker.py: FK discovery
  8) preferences/ai_data_clean_agent/nodes/ingest.py: file parsing (Excel/CSV)

Architecture:
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  node_data_engineer (SPAWN/INVOKE/REVOKE lifecycle)                         │
  │                                                                              │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │  create_react_agent (lib/react_agent.py — custom core)               │   │
  │  │  ┌───────┐     tool_calls?     ┌──────────────────────────────────┐ │   │
  │  │  │ agent │────── yes ─────────▶│  15 tools (full data pipeline)   │ │   │
  │  │  │ (LLM) │◀─────────────────────│  ①-⑤ in-memory analysis         │ │   │
  │  │  └───┬───┘                      │  ⑥-⑦ live DB ops               │ │   │
  │  │      │ no calls                 │  ⑧-⑩ clean + recipe            │ │   │
  │  │      ▼                          │  ⑪-⑬ validate/standardize/link │ │   │
  │  │     END                         │  ⑭-⑮ ingest file + pandas exec │ │   │
  │  │                                 └──────────────────────────────────┘ │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  │                                                                              │
  │  event_dispatcher → ToolCallEvent / ToolResultEvent (SSE real-time)         │
  └──────────────────────────────────────────────────────────────────────────────┘

Exported symbol: data_engineer_subgraph (CompiledStateGraph)
Used by: quick_analysis_subgraph, deep_report_subgraph, hybrid_analysis_subgraph
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import re
import sqlite3
import unicodedata
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field
import pandas as pd
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langgraph.graph import END, StateGraph


class CleaningPlanResponse(BaseModel):
    sql_commands: str = Field(..., description="SQL commands for data cleaning")
    explanation: str | None = None


from dbgpt_analyst.core.helpers import _get_llm, json_serial
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.events import (
    ErrorEvent,
    ToolCallEvent,
    ToolResultEvent,
    WorkflowTaskEvent,
)
from dbgpt_analyst.libs.react_agent import create_react_agent
from dbgpt_analyst.prompts import get_data_engineer_prompt
from dbgpt_analyst.common.langfuse_client import observe

logger = logging.getLogger(__name__)

_MAX_REACT_STEPS = 15
_TOOL_OUTPUT_MAX_CHARS = 4000

AGENT_ID = "data_engineer_agent"
AGENT_NAME = "🔧 Data Engineer"


# ══════════════════════════════════════════════════════════════════════════════
# MATH & DATA HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _serialise(obj: Any) -> Any:
    """JSON fallback that never raises.

    ``json_serial`` keeps date/Decimal fidelity but raises on anything else;
    ``default=str`` never raises but flattens those too. Chaining them gives
    both, and matches what the call sites here were already split between.
    """
    try:
        return json_serial(obj)
    except TypeError:
        return str(obj)


def _clip(payload: Any) -> str:
    """Serialise ``payload``, marking a cut instead of emitting broken JSON.

    The call sites used to end in ``json.dumps(...)[:_TOOL_OUTPUT_MAX_CHARS]``.
    That slices mid-token, so an over-budget result reached the model as
    unparseable JSON with nothing saying it had been cut -- the model then
    either retried the same query or filled in the missing rows itself. The
    envelope below stays valid JSON and says plainly what happened.

    The limit is well under ``FilesystemMiddleware``'s eviction threshold, so
    these results never reach the spill path; a tool that wants the full
    payload preserved on disk should return it unclipped instead.
    """
    text = json.dumps(payload, ensure_ascii=False, default=_serialise)
    if len(text) <= _TOOL_OUTPUT_MAX_CHARS:
        return text
    return json.dumps(
        {
            "truncated": True,
            "original_chars": len(text),
            "note": (
                f"Kết quả bị cắt còn {_TOOL_OUTPUT_MAX_CHARS} ký tự. "
                "Thu hẹp truy vấn (LIMIT, ít cột hơn) để lấy đủ dữ liệu."
            ),
            "preview": text[:_TOOL_OUTPUT_MAX_CHARS],
        },
        ensure_ascii=False,
    )


def _to_float(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    return None


def _percentile(sorted_vals: list[float], pct: float) -> float:
    n = len(sorted_vals)
    if n == 0:
        return 0.0
    if n == 1:
        return sorted_vals[0]
    k = (n - 1) * pct
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def _safe_row_key(row: dict) -> tuple:
    parts: list[tuple] = []
    for k in sorted(row.keys()):
        v = row[k]
        if isinstance(v, (list, dict, set)):
            v = json.dumps(v, sort_keys=True, ensure_ascii=False, default=str)
        parts.append((k, v))
    return tuple(parts)


# ══════════════════════════════════════════════════════════════════════════════
# DB CONNECTION HELPER
# ══════════════════════════════════════════════════════════════════════════════

def _get_db_connection(state: MainAgentState) -> Any | None:
    """Get DB connection: SQLite test path trước, rồi active connection thật.

    Không có nhánh fallback này thì mọi tool live-DB bên dưới luôn trả
    "Không có kết nối database." với nguồn Postgres (state chỉ mang source_ids,
    không mang db_path), khiến agent quay vòng vô ích tới hết budget.
    Dùng lại đúng helper node_explore đang dùng, không tự chế connector mới.
    """
    db_path = state.get("test_db_path") or state.get("db_path")
    if db_path:
        try:
            return sqlite3.connect(db_path, check_same_thread=False)
        except Exception as e:
            logger.warning("Failed to connect to DB at %s: %s", db_path, e)
    try:
        from dbgpt_analyst.libs.bi.connections import get_active_connection

        conn, _db_type = get_active_connection(read_only=True)
        return conn
    except Exception as e:
        logger.warning("Failed to get active DB connection: %s", e)
    return None


def _quote_ident(name: str) -> str:
    """Quote identifier chuẩn SQL (hợp lệ cả SQLite lẫn Postgres).

    `[name]` kiểu SQL Server chỉ SQLite nuốt được — Postgres syntax error.
    """
    return '"' + str(name).replace('"', '""') + '"'


def _list_other_tables(conn: Any, table_name: str, scope: list[str] | None = None) -> list[str]:
    """Liệt kê các bảng khác trong DB (dialect-aware).

    `scope` = danh sách bảng user đã chọn. Có scope thì chỉ so trong đó: DB thật
    có cả bảng hệ thống (checkpoints...) mà quét `SELECT *` là tự bắn vào chân.
    """
    if scope:
        return [t for t in scope if t != table_name]
    cursor = conn.cursor()
    if isinstance(conn, sqlite3.Connection):
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name != ?",
            (table_name,),
        )
    else:
        cursor.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema NOT IN ('pg_catalog', 'information_schema') "
            "AND table_name != %s",
            (table_name,),
        )
    return [row[0] for row in cursor.fetchall()]


# ══════════════════════════════════════════════════════════════════════════════
# CLEAN HEURISTICS (from preferences/ai_data_clean_agent/nodes/clean.py)
# ══════════════════════════════════════════════════════════════════════════════

# Date column detection keywords
_DATE_KEYWORDS = {
    "date", "ngay", "ngày", "time", "thoi_gian", "thời_gian",
    "created", "updated", "timestamp", "dat_hang", "giao_hang",
    "sinh", "birthday", "dob", "expired", "start", "end",
}

# Currency/numeric column detection keywords
_NUMERIC_KEYWORDS = {
    "vnd", "usd", "amount", "price", "gia", "giá", "tien", "tiền",
    "doanh_thu", "revenue", "cost", "phi", "phí", "total", "tong",
    "thanh_tien", "so_luong", "quantity", "count", "rate", "percent",
    "salary", "luong", "lương", "budget", "ngan_sach", "discount",
}

# ID columns should stay as string — never auto-convert to numeric
_ID_PATTERNS = re.compile(
    r"(^id$|_id$|^ma_|^code|_code$|^so_|phone|sdt|fax|zip)", re.IGNORECASE
)


def _try_parse_dates(series: pd.Series) -> tuple:
    """Attempt to convert a string series to datetime.
    Returns (converted_series, success_count, fail_count).
    """
    original_count = series.notna().sum()
    try:
        converted = pd.to_datetime(series, errors="coerce", dayfirst=True)
        success = converted.notna().sum()
        failed = original_count - success
        if success > 0 and success >= original_count * 0.5:
            return converted, int(success), int(failed)
    except Exception:
        pass
    return series, 0, 0


def _try_parse_numeric(series: pd.Series) -> tuple:
    """Parse currency/numeric: strip VNĐ, commas, etc.
    Returns (converted_series, success_count, fail_count).
    """
    original_count = series.notna().sum()
    if original_count == 0:
        return series, 0, 0
    try:
        cleaned = series.astype(str)
        cleaned = cleaned.str.replace(r"[VNĐđ$€£¥]", "", regex=True)
        cleaned = cleaned.str.replace(",", "", regex=False)
        cleaned = cleaned.str.replace(r"[^\d.\-]", "", regex=True)
        cleaned = cleaned.replace("", pd.NA)
        converted = pd.to_numeric(cleaned, errors="coerce")
        success = converted.notna().sum()
        failed = original_count - success
        if success > 0 and success >= original_count * 0.5:
            return converted, int(success), int(failed)
    except Exception:
        pass
    return series, 0, 0


# ══════════════════════════════════════════════════════════════════════════════
# VALIDATE HEURISTICS (from preferences/ai_data_clean_agent/nodes/validate.py)
# ══════════════════════════════════════════════════════════════════════════════

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
_VN_PHONE_RE = re.compile(r"^(0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-46-9])\d{7}$")
_CCCD_RE = re.compile(r"^0[0-9]{2}\d{9}$")
_MST_RE = re.compile(r"^\d{10}(-\d{3})?$")

_EMAIL_KEYWORDS = {"email", "mail", "e_mail", "email_address"}
_PHONE_KEYWORDS = {"phone", "sdt", "so_dien_thoai", "dien_thoai", "mobile", "tel"}
_CCCD_KEYWORDS = {"cccd", "cmnd", "cmtnd", "citizen_id", "id_card", "so_cccd"}
_MST_KEYWORDS = {"mst", "ma_so_thue", "tax_id", "tax_code"}

# Boolean-like value sets (from standardize.py)
_BOOLEAN_SETS = [
    {"yes", "no"}, {"true", "false"}, {"1", "0"},
    {"có", "không"}, {"đúng", "sai"}, {"y", "n"},
    {"active", "inactive"}, {"on", "off"},
]


# ══════════════════════════════════════════════════════════════════════════════
# RECIPE SYSTEM HELPERS (from preferences/recipe_store + recipe_match + recipe_apply)
# ══════════════════════════════════════════════════════════════════════════════

def _compute_fingerprint(columns: list[str]) -> dict:
    """Compute deterministic fingerprint from column names."""
    sorted_cols = sorted(columns)
    sig_hash = hashlib.md5("|".join(sorted_cols).encode("utf-8")).hexdigest()[:8]
    return {
        "column_names": sorted_cols,
        "column_count": len(sorted_cols),
        "column_signature_hash": sig_hash,
    }


# ══════════════════════════════════════════════════════════════════════════════
# TOOL FACTORY — 15 tools, dynamically selected by mode
# ══════════════════════════════════════════════════════════════════════════════

DEMode = Literal["analysis", "clean", "full"]


def _build_tools(
    query_results: list[dict],
    state: MainAgentState,
    mode: DEMode = "full",
    config: RunnableConfig | None = None,
    conn_cache: dict[str, Any] | None = None,
) -> list:

    session_id = (
        (config.get("configurable", {}).get("thread_id") if config else None)
        or state.get("session_id")
        or state.get("thread_id")
        or "default"
    )

    # Mở connection 1 lần cho cả lượt chạy: các tool live-DB bên dưới gọi
    # nhiều lần, mở mới mỗi lần sẽ rò connection pool ở Postgres.
    _conn_cache: dict[str, Any] = conn_cache if conn_cache is not None else {}

    def _conn() -> Any | None:
        if "c" not in _conn_cache:
            _conn_cache["c"] = _get_db_connection(state)
        return _conn_cache["c"]

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # GROUP A: IN-MEMORY ANALYSIS (tools ①–⑤, work on query_results)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @tool
    def profile_data() -> str:
        """① Thống kê tổng quan: data types, null counts, unique values, cardinality cho từng cột của kết quả query."""
        if not query_results:
            return json.dumps({"error": "Không có dữ liệu."}, ensure_ascii=False)
        cols = list(query_results[0].keys())
        n_rows = len(query_results)
        profile: dict[str, Any] = {"total_rows": n_rows, "total_columns": len(cols), "columns": {}}
        for col in cols:
            values = [row.get(col) for row in query_results]
            non_null = [v for v in values if v is not None]
            null_count = n_rows - len(non_null)
            type_counter: dict[str, int] = {}
            for v in non_null:
                t = type(v).__name__
                type_counter[t] = type_counter.get(t, 0) + 1
            dominant_type = max(type_counter, key=type_counter.get) if type_counter else "unknown"
            unique_vals: set = set()
            for v in non_null:
                try:
                    unique_vals.add(v)
                except TypeError:
                    unique_vals.add(str(v))
            cardinality = len(unique_vals)
            cardinality_label = (
                "unique" if cardinality == n_rows
                else "high" if cardinality > n_rows * 0.5
                else "medium" if cardinality > 10
                else "low"
            )
            profile["columns"][col] = {
                "dtype": dominant_type,
                "null_count": null_count,
                "null_pct": round(null_count / n_rows * 100, 1) if n_rows else 0,
                "unique_count": cardinality,
                "cardinality": cardinality_label,
                "sample_values": [str(v) for v in non_null[:5]],
            }
        return _clip(profile)

    @tool
    def detect_anomalies() -> str:
        """② Phát hiện anomalies: IQR outliers từng cột số + duplicate rows."""
        if not query_results:
            return json.dumps({"anomalies": []}, ensure_ascii=False)
        anomalies: list[dict] = []
        cols = list(query_results[0].keys())
        for col in cols:
            numeric = [_to_float(row.get(col)) for row in query_results]
            numeric = [v for v in numeric if v is not None]
            if len(numeric) < 4:
                continue
            sv = sorted(numeric)
            q1 = _percentile(sv, 0.25)
            q3 = _percentile(sv, 0.75)
            iqr = q3 - q1
            if iqr == 0:
                continue
            lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
            outlier_vals = [v for v in numeric if v < lower or v > upper]
            if outlier_vals:
                anomalies.append({
                    "column": col, "type": "iqr_outlier",
                    "count": len(outlier_vals), "total_values": len(numeric),
                    "pct": round(len(outlier_vals) / len(numeric) * 100, 1),
                    "iqr_range": {"lower": round(lower, 2), "upper": round(upper, 2)},
                    "example_outliers": [round(v, 2) for v in outlier_vals[:5]],
                })
        seen: set[tuple] = set()
        dup_count = 0
        for row in query_results:
            key = _safe_row_key(row)
            if key in seen:
                dup_count += 1
            else:
                seen.add(key)
        if dup_count > 0:
            anomalies.append({"type": "duplicate_rows", "count": dup_count,
                              "pct": round(dup_count / len(query_results) * 100, 1)})
        return _clip({"anomalies": anomalies, "total_checked": len(query_results)})

    @tool
    def compute_statistics() -> str:
        """③ Thống kê nâng cao: mean, median, std, p25, p75, min, max, sum, CV cho mỗi cột số."""
        if not query_results:
            return json.dumps({"statistics": {}}, ensure_ascii=False)
        stats: dict[str, Any] = {}
        for col in query_results[0].keys():
            numeric = [_to_float(row.get(col)) for row in query_results]
            numeric = [v for v in numeric if v is not None]
            if len(numeric) < 2:
                continue
            sv = sorted(numeric)
            n = len(sv)
            mean = sum(sv) / n
            variance = sum((x - mean) ** 2 for x in sv) / (n - 1)
            std = math.sqrt(variance) if variance > 0 else 0.0
            cv = round(std / mean * 100, 1) if mean != 0 else None
            stats[col] = {
                "count": n, "mean": round(mean, 4), "median": round(_percentile(sv, 0.5), 4),
                "std": round(std, 4), "min": round(sv[0], 4), "max": round(sv[-1], 4),
                "sum": round(sum(sv), 4),
                "p25": round(_percentile(sv, 0.25), 4), "p75": round(_percentile(sv, 0.75), 4),
                "cv_pct": cv, "range": round(sv[-1] - sv[0], 4),
            }
        return _clip({"statistics": stats})

    @tool
    def assess_data_quality() -> str:
        """④ Đánh giá data quality: completeness, type consistency, validity → score 0-100."""
        if not query_results:
            return json.dumps({"quality_score": 0, "details": "No data"}, ensure_ascii=False)
        cols = list(query_results[0].keys())
        n_rows = len(query_results)
        total_cells = n_rows * len(cols)
        null_cells = 0
        consistent_cols = 0
        inconsistent_details: list[dict] = []
        for col in cols:
            types_seen: dict[str, int] = {}
            col_nulls = 0
            for row in query_results:
                v = row.get(col)
                if v is None:
                    col_nulls += 1
                else:
                    t = type(v).__name__
                    types_seen[t] = types_seen.get(t, 0) + 1
            null_cells += col_nulls
            if len(types_seen) <= 1:
                consistent_cols += 1
            else:
                inconsistent_details.append({"column": col, "types_found": types_seen})
        completeness = round((1 - null_cells / total_cells) * 100, 1) if total_cells else 0
        consistency = round(consistent_cols / len(cols) * 100, 1) if cols else 0
        missing_key_rows = sum(1 for row in query_results if set(row.keys()) != set(cols))
        validity = round((1 - missing_key_rows / n_rows) * 100, 1) if n_rows else 0
        quality_score = round(completeness * 0.40 + consistency * 0.35 + validity * 0.25, 1)
        grade = (
            "🟢 Excellent" if quality_score >= 90
            else "🟡 Good" if quality_score >= 75
            else "🟠 Fair" if quality_score >= 50
            else "🔴 Poor"
        )
        return _clip({
            "quality_score": quality_score, "grade": grade,
            "completeness_pct": completeness, "consistency_pct": consistency,
            "validity_pct": validity, "total_cells": total_cells, "null_cells": null_cells,
            "inconsistent_columns": inconsistent_details,
        })

    @tool
    def find_trends() -> str:
        """⑤ Xu hướng: half-over-half comparison + top-3/bottom-3 ranking cho mỗi cột số."""
        if not query_results:
            return json.dumps({"trends": []}, ensure_ascii=False)
        trends: list[dict] = []
        for col in query_results[0].keys():
            indexed = [(i, _to_float(row.get(col))) for i, row in enumerate(query_results)]
            indexed = [(i, v) for i, v in indexed if v is not None]
            if len(indexed) < 3:
                continue
            vals = [v for _, v in indexed]
            mid = len(vals) // 2
            h1_avg = sum(vals[:mid]) / mid if mid else 0
            h2 = vals[mid:]
            h2_avg = sum(h2) / len(h2) if h2 else 0
            change_pct = round((h2_avg - h1_avg) / abs(h1_avg) * 100, 1) if h1_avg != 0 else (100.0 if h2_avg else 0.0)
            trends.append({
                "column": col, "type": "half_over_half",
                "direction": "tăng" if change_pct > 5 else "giảm" if change_pct < -5 else "ổn định",
                "change_pct": change_pct,
                "first_half_avg": round(h1_avg, 2), "second_half_avg": round(h2_avg, 2),
            })
            sorted_idx = sorted(range(len(query_results)),
                                key=lambda i: _to_float(query_results[i].get(col)) or 0, reverse=True)
            trends.append({
                "column": col, "type": "ranking",
                "top_3": [query_results[i] for i in sorted_idx[:3]],
                "bottom_3": [query_results[i] for i in sorted_idx[-3:]],
            })
        return _clip({"trends": trends[:12]})

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # GROUP B: LIVE DB OPS (tools ⑥–⑦, need DB connection)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @tool
    def profile_db_table(table_name: str) -> str:
        """⑥ Profile trực tiếp bảng từ database: null counts, empty strings, dtypes, unique values.

        Args:
            table_name: Tên bảng cần profile.
        """
        conn = _conn()
        if not conn:
            return json.dumps({"error": "Không có kết nối database."}, ensure_ascii=False)
        try:
            df = pd.read_sql(f"SELECT * FROM {_quote_ident(table_name)}", conn)  # noqa: S608
            profile_columns: list[dict] = []
            for col in df.columns:
                null_count = int(df[col].isnull().sum())
                empty_str_count = int((df[col] == "").sum()) if df[col].dtype == object else 0
                dtype = str(df[col].dtype)
                unique_count = int(df[col].nunique())
                sample = [str(v) for v in df[col].dropna().head(5).tolist()]
                issues: list[str] = []
                if null_count > 0:
                    issues.append(f"{null_count} NULLs ({round(null_count / len(df) * 100, 1)}%)")
                if empty_str_count > 0:
                    issues.append(f"{empty_str_count} empty strings")
                profile_columns.append({
                    "column": col, "dtype": dtype, "null_count": null_count,
                    "empty_count": empty_str_count, "unique_count": unique_count,
                    "sample_values": sample, "issues": issues,
                })
            return _clip({
                "table": table_name, "rows": len(df), "columns": len(df.columns),
                "column_profiles": profile_columns,
            })
        except Exception as e:
            return json.dumps({"error": f"Profile failed: {e}"}, ensure_ascii=False)

    @tool
    def execute_cleaning_sql(sql_commands: str) -> str:
        """⑦ Thực thi SQL DML để dọn dẹp dữ liệu trực tiếp trên database.

        Args:
            sql_commands: Các câu SQL DML cách nhau bằng dấu chấm phẩy (;).
        """
        conn = _conn()
        if not conn:
            return json.dumps({"error": "Không có kết nối database."}, ensure_ascii=False)
        try:
            cursor = conn.cursor()
            executed = 0
            results: list[str] = []
            for cmd in sql_commands.split(";"):
                cmd = cmd.strip()
                if not cmd:
                    continue
                try:
                    cursor.execute(cmd)
                    affected = cursor.rowcount
                    results.append(f"✅ [{executed + 1}] {cmd[:80]}... → {affected} rows affected")
                    executed += 1
                except Exception as cmd_err:
                    results.append(f"❌ [{executed + 1}] {cmd[:80]}... → Error: {cmd_err}")
            conn.commit()
            return _clip({
                "status": "success", "commands_executed": executed,
                "details": results,
            })
        except Exception as e:
            return json.dumps({"error": f"Execution failed: {e}"}, ensure_ascii=False)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # GROUP C: DEEP CLEAN + RECIPE (tools ⑧–⑩, from preferences/clean.py + recipe_*.py)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @tool
    def deep_clean_dataframe(table_name: str) -> str:
        """⑧ Deep clean bảng trong DB: drop empty rows/cols, trim whitespace,
        remove duplicates, auto-detect dates + currency, impute missing values,
        flag outliers (IQR).

        Heuristics từ preferences/ai_data_clean_agent:
        - Date columns: keyword-based + auto-parse (dayfirst=True cho VN)
        - Currency: strip VNĐ/$€, thousands separators → numeric
        - Nulls: >70% → drop col, numeric → median, text → mode
        - ID columns (ma_, _id, _code) → giữ nguyên string
        - Outliers: flag only, không tự xóa

        Args:
            table_name: Tên bảng trong database cần clean.
        """
        conn = _conn()
        if not conn:
            return json.dumps({"error": "Không có kết nối database."}, ensure_ascii=False)
        try:
            df = pd.read_sql(f"SELECT * FROM {_quote_ident(table_name)}", conn)  # noqa: S608
            actions: list[dict] = []
            rows_before = len(df)

            # 1. Drop all-NaN rows
            nan_rows = int(df.isna().all(axis=1).sum())
            if nan_rows > 0:
                df = df.dropna(axis=0, how="all")
                actions.append({"action": "drop_empty_rows", "affected": nan_rows,
                                "detail": f"Xóa {nan_rows} dòng trống hoàn toàn"})

            # 2. Smart imputation for partial nulls
            cols_to_drop = []
            for col in list(df.columns):
                null_count = int(df[col].isna().sum())
                if null_count == 0 or null_count == len(df):
                    continue
                null_pct = null_count / len(df) * 100
                if null_pct > 70:
                    cols_to_drop.append(col)
                    actions.append({"action": "drop_high_null_column", "column": col,
                                    "affected": null_count, "detail": f"Xóa cột {null_pct:.1f}% null"})
                elif pd.api.types.is_numeric_dtype(df[col]):
                    median_val = df[col].median()
                    df[col] = df[col].fillna(median_val)
                    actions.append({"action": "impute_median", "column": col,
                                    "affected": null_count, "detail": f"Fill {null_count} null bằng median ({median_val})"})
                elif df[col].dtype == "object":
                    mode_vals = df[col].mode()
                    fill_val = mode_vals.iloc[0] if len(mode_vals) > 0 else "N/A"
                    df[col] = df[col].fillna(fill_val)
                    actions.append({"action": "impute_mode", "column": col,
                                    "affected": null_count, "detail": f"Fill {null_count} null bằng mode ('{fill_val}')"})
            if cols_to_drop:
                df = df.drop(columns=cols_to_drop)

            # 3. Drop all-NaN columns
            nan_cols = [c for c in df.columns if df[c].isna().all()]
            if nan_cols:
                df = df.drop(columns=nan_cols)
                actions.append({"action": "drop_empty_columns", "affected": len(nan_cols),
                                "detail": f"Xóa {len(nan_cols)} cột trống: {', '.join(nan_cols)}"})

            # 4. Trim whitespace + Unicode normalize
            for col in df.select_dtypes(include=["object"]).columns:
                trimmed = df[col].astype(str).str.strip()
                changed = int((trimmed != df[col].astype(str)).sum())
                if changed > 0:
                    df[col] = trimmed.apply(
                        lambda x: unicodedata.normalize("NFC", x) if isinstance(x, str) else x
                    )
                    actions.append({"action": "trim_whitespace", "column": col,
                                    "affected": changed, "detail": "Trim khoảng trắng + NFC normalize"})

            # 5. Remove duplicate rows
            dup_count = int(df.duplicated().sum())
            if dup_count > 0:
                df = df.drop_duplicates()
                actions.append({"action": "remove_duplicates", "affected": dup_count,
                                "detail": f"Xóa {dup_count} dòng trùng lặp"})

            # 6. Type conversion: dates and numerics (with VN heuristics)
            for col in list(df.columns):
                col_lower = col.lower()
                if _ID_PATTERNS.search(col_lower):
                    continue
                # Date columns
                if any(kw in col_lower for kw in _DATE_KEYWORDS):
                    converted, success, failed = _try_parse_dates(df[col])
                    if success > 0:
                        df[col] = converted
                        actions.append({"action": "to_datetime", "column": col,
                                        "affected": success, "detail": f"Chuyển datetime ({success} OK, {failed} lỗi)"})
                        continue
                # Currency/numeric columns
                if any(kw in col_lower for kw in _NUMERIC_KEYWORDS):
                    converted, success, failed = _try_parse_numeric(df[col])
                    if success > 0:
                        df[col] = converted
                        actions.append({"action": "to_numeric", "column": col,
                                        "affected": success, "detail": f"Chuyển số ({success} OK, {failed} lỗi)"})
                        continue
                # Auto-detect: >80% values are numeric
                if df[col].dtype == "object" and not _ID_PATTERNS.search(col_lower):
                    non_null = df[col].dropna()
                    if len(non_null) > 5:
                        parsed = pd.to_numeric(non_null, errors="coerce")
                        ratio = parsed.notna().sum() / len(non_null)
                        if ratio >= 0.8:
                            df[col] = pd.to_numeric(df[col], errors="coerce")
                            actions.append({"action": "auto_to_numeric", "column": col,
                                            "affected": int(parsed.notna().sum()),
                                            "detail": f"Auto-detect: {ratio:.0%} giá trị là số"})

            # 7. Flag outliers (IQR — flag only, NO removal)
            for col in df.select_dtypes(include="number").columns:
                non_null = df[col].dropna()
                if len(non_null) <= 10:
                    continue
                q1, q3 = non_null.quantile(0.25), non_null.quantile(0.75)
                iqr = q3 - q1
                if iqr == 0:
                    continue
                outlier_count = int(((non_null < q1 - 1.5 * iqr) | (non_null > q3 + 1.5 * iqr)).sum())
                if outlier_count > 0:
                    actions.append({"action": "outlier_flagged", "column": col,
                                    "affected": outlier_count,
                                    "detail": f"⚠️ {outlier_count} outlier (IQR bounds [{q1 - 1.5 * iqr:.2f}, {q3 + 1.5 * iqr:.2f}])"})

            # 8. Save back to DB
            rows_after = len(df)
            df.to_sql(table_name, conn, if_exists="replace", index=False)
            conn.commit()

            return _clip({
                "table": table_name, "rows_before": rows_before, "rows_after": rows_after,
                "actions_count": len(actions), "actions": actions[:20],
            })
        except Exception as e:
            return json.dumps({"error": f"Deep clean failed: {e}"}, ensure_ascii=False)

    @tool
    def match_cleaning_recipe(column_names: list[str]) -> str:
        """⑨ Tìm cleaning recipe phù hợp bằng fingerprint matching (0 LLM calls).

        So sánh fingerprint (MD5 hash + Jaccard similarity) của columns hiện tại
        với các recipe đã lưu. Score >= 0.7 = match.

        Nếu match → dùng apply_cleaning_recipe() để apply.
        Nếu không match → dùng deep_clean_dataframe() rồi save recipe mới.

        Args:
            column_names: Danh sách tên cột cần matching.
        """
        # TODO: Integrate with recipe_store after migration to domains/data_clean/
        fingerprint = _compute_fingerprint(column_names)
        return json.dumps({
            "fingerprint": fingerprint,
            "match": None,
            "message": "Recipe store chưa được migrate. Dùng deep_clean_dataframe() để clean thủ công.",
            "TODO": "Integrate recipe_store.py, recipe_match.py sau khi copy vào domains/data_clean/"
        }, ensure_ascii=False)

    @tool
    def apply_cleaning_recipe(recipe_name: str) -> str:
        """⑩ Apply cleaning recipe đã match — 0 LLM calls, pure deterministic transforms.

        12 operations: set_header_row, rename, drop_columns, parse_date, parse_currency,
        to_numeric, fill_nulls, trim_whitespace, remove_duplicates, drop_empty_rows,
        cast_type, drop_high_null_column.

        Args:
            recipe_name: Tên recipe đã match từ match_cleaning_recipe().
        """
        # TODO: Integrate with recipe_apply.py after migration to domains/data_clean/
        return json.dumps({
            "status": "not_implemented",
            "recipe_name": recipe_name,
            "message": "Recipe apply chưa được migrate. Dùng deep_clean_dataframe() thay thế.",
            "TODO": "Integrate recipe_apply.py với STEP_OPS registry"
        }, ensure_ascii=False)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # GROUP D: VALIDATE / STANDARDIZE / LINK (tools ⑪–⑬, from preferences nodes)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @tool
    def validate_data_formats(table_name: str) -> str:
        """⑪ Validate format dữ liệu theo chuẩn VN: email, SĐT VN (0[3|5|7|8|9]),
        CCCD (12 số), MST (10/13 số), URL, date range, negative amounts.

        Tự detect loại format dựa trên tên cột (email→RFC5322, sdt→VN phone, cccd→12 digits...).

        Args:
            table_name: Tên bảng cần validate.
        """
        conn = _conn()
        if not conn:
            return json.dumps({"error": "Không có kết nối database."}, ensure_ascii=False)
        try:
            df = pd.read_sql(f"SELECT * FROM {_quote_ident(table_name)}", conn)  # noqa: S608
            violations: list[dict] = []

            for col in df.columns:
                col_lower = col.lower()
                values = df[col].dropna().tolist()
                if not values:
                    continue

                # Email
                if any(kw in col_lower for kw in _EMAIL_KEYWORDS):
                    bad = [str(v)[:50] for v in values if v and not _EMAIL_RE.match(str(v).strip())]
                    if bad:
                        violations.append({"column": col, "format": "email",
                                           "invalid_count": len(bad), "examples": bad[:3]})
                # Phone VN
                elif any(kw in col_lower for kw in _PHONE_KEYWORDS):
                    bad = [str(v)[:30] for v in values
                           if v and not _VN_PHONE_RE.match(str(v).strip().replace(" ", "").replace("-", ""))]
                    if bad:
                        violations.append({"column": col, "format": "phone_vn",
                                           "invalid_count": len(bad), "examples": bad[:3]})
                # CCCD
                elif any(kw in col_lower for kw in _CCCD_KEYWORDS):
                    bad = [str(v)[:20] for v in values
                           if v and not _CCCD_RE.match(str(v).strip().replace(" ", ""))]
                    if bad:
                        violations.append({"column": col, "format": "cccd",
                                           "invalid_count": len(bad), "examples": bad[:3]})
                # MST
                elif any(kw in col_lower for kw in _MST_KEYWORDS):
                    bad = [str(v)[:20] for v in values
                           if v and not _MST_RE.match(str(v).strip().replace(" ", ""))]
                    if bad:
                        violations.append({"column": col, "format": "mst",
                                           "invalid_count": len(bad), "examples": bad[:3]})
                # Negative amounts
                elif any(kw in col_lower for kw in _NUMERIC_KEYWORDS):
                    if pd.api.types.is_numeric_dtype(df[col]):
                        neg_count = int((df[col] < 0).sum())
                        if neg_count > 0:
                            violations.append({"column": col, "format": "positive_amount",
                                               "invalid_count": neg_count,
                                               "detail": f"{neg_count} giá trị âm trong cột tiền"})

            return _clip({
                "table": table_name, "total_violations": len(violations),
                "violations": violations,
            })
        except Exception as e:
            return json.dumps({"error": f"Validate failed: {e}"}, ensure_ascii=False)

    @tool
    def suggest_schema_changes(table_name: str) -> str:
        """⑫ Gợi ý tối ưu schema: low-cardinality text → ENUM, boolean-like → BOOLEAN,
        PK candidate → INDEX, varchar quá dài → VARCHAR(N), all-int float → INTEGER.

        Args:
            table_name: Tên bảng cần phân tích schema.
        """
        conn = _conn()
        if not conn:
            return json.dumps({"error": "Không có kết nối database."}, ensure_ascii=False)
        try:
            df = pd.read_sql(f"SELECT * FROM {_quote_ident(table_name)}", conn)  # noqa: S608
            suggestions: list[dict] = []
            n_rows = len(df)

            for col in df.columns:
                distinct = int(df[col].nunique())
                null_pct = round(df[col].isnull().sum() / n_rows * 100, 1) if n_rows else 0
                is_unique = distinct == n_rows and null_pct == 0
                sample = [str(v) for v in df[col].dropna().head(5).tolist()]

                # PK candidate
                if is_unique and n_rows > 10:
                    suggestions.append({
                        "type": "index", "column": col,
                        "suggested": "PRIMARY KEY + INDEX",
                        "reason": f"Unique, non-null, {n_rows} dòng", "confidence": 0.9,
                    })

                # Boolean-like (distinct ≤ 3)
                if df[col].dtype == "object" and distinct <= 3 and n_rows > 5:
                    sample_lower = {str(v).strip().lower() for v in sample if v}
                    for bool_set in _BOOLEAN_SETS:
                        if sample_lower <= bool_set:
                            suggestions.append({
                                "type": "type_change", "column": col,
                                "suggested": "BOOLEAN",
                                "reason": f"Chỉ {distinct} giá trị: {', '.join(sample_lower)}",
                                "confidence": 0.85,
                            })
                            break

                # Low cardinality → ENUM
                if df[col].dtype == "object" and 3 < distinct <= 10 and n_rows > 20:
                    suggestions.append({
                        "type": "type_change", "column": col,
                        "suggested": f"ENUM ({distinct} values)",
                        "reason": f"Chỉ {distinct} giá trị distinct trên {n_rows} dòng",
                        "confidence": 0.75,
                    })

                # All-integer float → INTEGER
                if pd.api.types.is_float_dtype(df[col]):
                    non_null = df[col].dropna()
                    if len(non_null) > 0 and (non_null == non_null.astype(int)).all():
                        suggestions.append({
                            "type": "type_change", "column": col,
                            "current": "FLOAT", "suggested": "INTEGER",
                            "reason": "Tất cả giá trị là số nguyên", "confidence": 0.9,
                        })

            return _clip({
                "table": table_name, "suggestions_count": len(suggestions),
                "suggestions": suggestions,
            })
        except Exception as e:
            return json.dumps({"error": f"Schema analysis failed: {e}"}, ensure_ascii=False)

    @tool
    def discover_foreign_keys(table_name: str) -> str:
        """⑬ Phát hiện Foreign Key giữa các bảng bằng hybrid approach:
        1) Heuristic name matching (_id, ma_, _code suffixes)
        2) Value overlap profiling (Jaccard/containment)
        3) Candidate pruning (type match, cardinality, uniqueness)

        Args:
            table_name: Bảng chứa potential FK columns.
        """
        conn = _conn()
        if not conn:
            return json.dumps({"error": "Không có kết nối database."}, ensure_ascii=False)
        try:
            # Get list of other tables in DB
            other_tables = _list_other_tables(
                conn,
                table_name,
                scope=state.get("selected_tables") or state.get("allowed_tables"),
            )

            if not other_tables:
                return json.dumps({"message": "Không có bảng nào khác trong DB để so sánh FK."}, ensure_ascii=False)

            df_source = pd.read_sql(f"SELECT * FROM {_quote_ident(table_name)}", conn)  # noqa: S608
            fk_candidates: list[dict] = []

            for col in df_source.columns:
                col_lower = col.lower()
                # Only check columns that look like FK (ends with _id, _code, starts with ma_)
                if not (_ID_PATTERNS.search(col_lower)):
                    continue

                source_vals = set(df_source[col].dropna().astype(str).tolist())
                if not source_vals or len(source_vals) < 2:
                    continue

                for target_table in other_tables:
                    try:
                        df_target = pd.read_sql(f"SELECT * FROM {_quote_ident(target_table)}", conn)  # noqa: S608
                        for target_col in df_target.columns:
                            target_vals = set(df_target[target_col].dropna().astype(str).tolist())
                            if not target_vals:
                                continue

                            overlap = source_vals & target_vals
                            min_set = min(len(source_vals), len(target_vals))
                            if min_set == 0:
                                continue
                            overlap_ratio = len(overlap) / min_set

                            # Name similarity bonus
                            name_score = 0.0
                            col_base = re.sub(r"(_id|_code|_key|_fk|_ref)$", "", col_lower)
                            target_base = re.sub(r"(_id|_code|_key|_fk|_ref)$", "", target_col.lower())
                            tb_base = target_table.lower().replace("excel_", "")
                            if col_lower == target_col.lower():
                                name_score = 0.8
                            elif col_lower == f"{tb_base}_id":
                                name_score = 0.9
                            elif col_base and target_base and col_base == target_base:
                                name_score = 0.6

                            combined = 0.6 * overlap_ratio + 0.4 * name_score
                            if combined >= 0.5:
                                fk_candidates.append({
                                    "from_table": table_name, "from_column": col,
                                    "to_table": target_table, "to_column": target_col,
                                    "overlap_ratio": round(overlap_ratio, 3),
                                    "name_score": round(name_score, 2),
                                    "combined_score": round(combined, 3),
                                    "overlap_count": len(overlap),
                                })
                    except Exception:
                        continue

            fk_candidates.sort(key=lambda x: x["combined_score"], reverse=True)
            return _clip({
                "table": table_name, "fk_candidates": fk_candidates[:10],
                "other_tables_checked": len(other_tables),
            })
        except Exception as e:
            return json.dumps({"error": f"FK discovery failed: {e}"}, ensure_ascii=False)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # GROUP E: FILE INGEST + PANDAS EXEC (tools ⑭–⑮, from preferences ingest + execute)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @tool
    def ingest_file_to_db(file_name: str) -> str:
        """⑭ Parse file đã upload (Excel multi-sheet / CSV) → DataFrames → lưu vào DB.

        Xử lý:
        - Multi-sheet Excel (.xlsx, .xls)
        - CSV (auto-detect encoding via chardet)
        - Column name normalization (slugify: lowercase, underscores)
        - Deduplicate column names
        - Read with dtype=str first (preserve leading-zero IDs: SĐT, CCCD, ZIP)

        Args:
            file_name: Tên file đã được upload vào hệ thống.
        """
        # TODO: Integrate with file upload pipeline
        # Logic flow: state["file_bytes"] → pd.read_excel/read_csv → slugify columns
        #   → deduplicate → save to DB via df.to_sql → return sheets_info
        return json.dumps({
            "status": "not_implemented",
            "file_name": file_name,
            "message": "File ingest cần kết nối với file upload pipeline.",
            "TODO": "Copy ingest.py logic: _slugify_column, _detect_encoding, _dedupe_columns, _save_df_to_postgres"
        }, ensure_ascii=False)

    @tool
    def execute_pandas_code(code: str, table_name: str) -> str:
        """⑮ Execute pandas code trên DataFrame từ DB. Dùng cho transform phức tạp
        mà các tool khác không cover.

        Code được execute với `df` là biến local → modify in place → save back.
        Base directory làm việc là data/workspaces/<session_id>/.

        Args:
            code: Pandas code to execute. Variable `df` is available.
                  Example: "df['ngay_dat'] = pd.to_datetime(df['ngay_dat'], errors='coerce')"
            table_name: Tên bảng source (sẽ load thành `df`).
        """
        conn = _conn()
        if not conn:
            return json.dumps({"error": "Không có kết nối database."}, ensure_ascii=False)
        try:
            df = pd.read_sql(f"SELECT * FROM {_quote_ident(table_name)}", conn)  # noqa: S608
            rows_before = len(df)
            cols_before = list(df.columns)

            from dbgpt_analyst.common.workspace_manager import WorkspaceManager
            session_dir = WorkspaceManager.get_session_dir(session_id)
            workspace_dir_str = str(session_dir.resolve())

            import os
            from pathlib import Path
            old_cwd = os.getcwd()
            os.chdir(workspace_dir_str)
            try:
                local_ns = {
                    "df": df,
                    "pd": pd,
                    "workspace_dir": workspace_dir_str,
                    "session_id": session_id,
                    "os": os,
                    "Path": Path,
                }
                exec(code, {"__builtins__": __builtins__}, local_ns)  # noqa: S102
                df = local_ns["df"]
            finally:
                os.chdir(old_cwd)

            # Auto-track created or updated files in metadata sidecar as 'result'
            for fpath in session_dir.iterdir():
                if fpath.is_file() and not fpath.name.startswith("."):
                    existing_meta = WorkspaceManager.get_metadata(session_id).get(fpath.name, {})
                    if existing_meta.get("type") != "original":
                        WorkspaceManager.update_metadata(
                            session_id=session_id,
                            filename=fpath.name,
                            file_type="result",
                            size=fpath.stat().st_size,
                        )

            # Save back
            df.to_sql(table_name, conn, if_exists="replace", index=False)
            conn.commit()

            cols_after = list(df.columns)
            added_cols = set(cols_after) - set(cols_before)
            removed_cols = set(cols_before) - set(cols_after)

            return _clip({
                "status": "success", "table": table_name,
                "rows_before": rows_before, "rows_after": len(df),
                "columns_added": list(added_cols), "columns_removed": list(removed_cols),
                "code_executed": code[:200],
            })
        except Exception as e:
            return json.dumps({"error": f"Pandas exec failed: {e}"}, ensure_ascii=False)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # TOOLSET SELECTION (inspired by preferences/tool_registry.py TOOLSETS)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    # Group A: In-memory analysis (from query_results)
    group_analysis = [
        profile_data,              # ① profiling
        detect_anomalies,          # ② anomaly detection
        compute_statistics,        # ③ advanced stats
        assess_data_quality,       # ④ quality scoring
        find_trends,               # ⑤ trend analysis
    ]

    # Group B–E: Data pipeline (DB ops + clean + validate + ingest)
    group_clean = [
        profile_db_table,          # ⑥ DB table profiling
        execute_cleaning_sql,      # ⑦ DML execution
        deep_clean_dataframe,      # ⑧ full heuristic clean
        match_cleaning_recipe,     # ⑨ fingerprint matching (stub)
        apply_cleaning_recipe,     # ⑩ recipe application (stub)
        validate_data_formats,     # ⑪ VN format validation
        suggest_schema_changes,    # ⑫ schema optimization
        discover_foreign_keys,     # ⑬ FK discovery
        ingest_file_to_db,         # ⑭ file parsing (stub)
        execute_pandas_code,       # ⑮ arbitrary pandas execution
    ]

    if mode == "analysis":
        return group_analysis                    # 5 tools → post-SQL analysis
    if mode == "clean":
        return group_clean                       # 10 tools → file upload / DB clean
    return group_analysis + group_clean          # 15 tools → full (debug/admin)


# ══════════════════════════════════════════════════════════════════════════════
# NODE (SPAWN / INVOKE / REVOKE lifecycle)
# ══════════════════════════════════════════════════════════════════════════════

@observe(name="node_data_engineer")
async def node_data_engineer(state: MainAgentState, config: RunnableConfig) -> dict[str, Any]:
    """Data Engineer node — dynamic toolset, custom ReAct agent, SSE streaming.

    Auto-detects mode from state:
      - query_results exist     → mode='analysis' (5 tools)
      - file_bytes / db tables  → mode='clean'    (10 tools)
      - both                    → mode='full'     (15 tools)

    SPAWN  → unique thread_id + WorkflowTaskEvent
    INVOKE → create_react_agent.ainvoke() with selected toolset
    REVOKE → done event + return data_engineer_report to state
    """
    _conn_cache: dict[str, Any] = {}
    try:
        question = state.get("question", "")
        query_results = state.get("query_results", [])
        generated_sql = state.get("generated_sql")

        # ── Auto-detect mode ──────────────────────────────────────────────────────
        has_query_results = bool(query_results)
        has_clean_context = bool(
            state.get("file_bytes")
            or state.get("table_names")
            or state.get("selected_tables")
            or state.get("anchor_table")
            or state.get("de_mode") == "clean"
        )

        if has_query_results and has_clean_context:
            de_mode: DEMode = "full"
        elif has_clean_context:
            de_mode = "clean"
        else:
            de_mode = "analysis"

        # Allow explicit override from state
        explicit_mode = state.get("de_mode")
        if explicit_mode in ("analysis", "clean", "full"):
            de_mode = explicit_mode  # type: ignore[assignment]

        logger.info("node_data_engineer: SPAWN (mode=%s, rows=%d)", de_mode, len(query_results))

        # ── SPAWN ─────────────────────────────────────────────────────────────────
        thread_id = f"de-{uuid.uuid4().hex[:10]}"
        steps: list[dict] = [WorkflowTaskEvent(
            payload={
                "task_id": thread_id,
                "name": AGENT_NAME,
                "message": f"🔧 {AGENT_NAME} khởi động (mode={de_mode}, thread={thread_id})",
                "agent_id": AGENT_ID,
                "input_rows": len(query_results),
                "mode": de_mode,
            },
            phase="profiling",
            status="running"
        ).model_dump()]

        # Fast-exit khi không có data VÀ không ở clean mode
        if not query_results and de_mode == "analysis":
            steps.append(WorkflowTaskEvent(
                payload={
                    "task_id": thread_id,
                    "name": AGENT_NAME,
                    "message": f"🔧 {AGENT_NAME} kết thúc — không có dữ liệu.",
                    "reason": "no_data"
                },
                phase="profiling",
                status="done"
            ).model_dump())
            return {"steps": steps, "data_engineer_report": ""}

        # ── Event dispatcher (closure captures `steps` list) ──────────────────

        async def event_dispatcher(event_type: str, data: dict, _config: RunnableConfig) -> None:
            if event_type == "tool_call":
                steps.append(ToolCallEvent(
                    payload={
                        "tool": data["tool"],
                        "args": data.get("args", {}),
                        "message": f"🔧 {AGENT_NAME} → {data['tool']}",
                    },
                    phase="profiling"
                ).model_dump())
            elif event_type == "tool_result":
                steps.append(ToolResultEvent(
                    payload={
                        "tool": data["tool"],
                        "result": data.get("result", ""),
                        "message": f"🔧 ← {data['tool']}: {data.get('result', '')[:150]}",
                    },
                    phase="profiling"
                ).model_dump())

        # ── INVOKE ────────────────────────────────────────────────────────────────

        final_report = ""
        try:
            row_count = len(query_results)
            col_count = len(query_results[0]) if query_results else 0

            llm = await _get_llm(state, streaming=False, json_mode=False)
            tools = _build_tools(query_results, state, mode=de_mode, config=config, conn_cache=_conn_cache)

            system_prompt = get_data_engineer_prompt(
                question=question,
                generated_sql=generated_sql,
                row_count=row_count,
                col_count=col_count,
            )

            data_agent = create_react_agent(
                model=llm,
                tools=tools,
                prompt=system_prompt,
                event_dispatcher=event_dispatcher,
                name=AGENT_NAME,
            )

            from dbgpt_analyst.prompts.data_engineer_prompt import DE_MODE_PROMPTS
            _MODE_PROMPTS = DE_MODE_PROMPTS

            result = await data_agent.ainvoke(
                {"messages": [{"role": "user",
                               "content": _MODE_PROMPTS.get(de_mode, _MODE_PROMPTS["full"])}]},
                config={
                    "recursion_limit": _MAX_REACT_STEPS,
                    "configurable": {"thread_id": thread_id},
                },
            )

            for msg in reversed(result.get("messages", [])):
                if isinstance(msg, AIMessage) and not msg.tool_calls and msg.content:
                    final_report = str(msg.content)
                    break

        except Exception as e:
            logger.exception("node_data_engineer: error during invoke")
            steps.append(ErrorEvent(
                payload={"error": f"🔧 {AGENT_NAME} lỗi: {e}"},
                phase="profiling"
            ).model_dump())
            final_report = f"Error: {e}"

        # ── REVOKE ────────────────────────────────────────────────────────────────
        steps.append(WorkflowTaskEvent(
            payload={
                "task_id": thread_id,
                "name": AGENT_NAME,
                "message": f"🔧 {AGENT_NAME} hoàn tất (thread={thread_id})",
                "report_length": len(final_report)
            },
            phase="profiling",
            status="done"
        ).model_dump())

        logger.info("node_data_engineer: REVOKE (thread=%s, report=%d chars)", thread_id, len(final_report))
        return {"steps": steps, "data_engineer_report": final_report}
    finally:
        if "c" in _conn_cache and _conn_cache["c"]:
            try:
                _conn_cache["c"].close()
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════════════════
# SUBGRAPH
# ══════════════════════════════════════════════════════════════════════════════

def build_data_engineer_subgraph() -> Any:
    """Wrap node_data_engineer into a StateGraph for composability."""
    workflow = StateGraph(MainAgentState)
    workflow.add_node("data_engineer", node_data_engineer)
    workflow.set_entry_point("data_engineer")
    workflow.add_edge("data_engineer", END)
    return workflow.compile()


data_engineer_subgraph = build_data_engineer_subgraph()
