"""Vòng lặp khám phá insights (Finding) từ dữ liệu thực tế.

Nguyên tắc cốt lõi:
- LLM chỉ được đề xuất giả thuyết định tính bằng lời.
- MỌI con số do code tính toán từ dữ liệu thật.
- Một Finding có value không tính lại được từ evidence_sql là lỗi.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re
from typing import Any, Callable, Sequence

from dbgpt_analyst.tools.deck import _has_unverified_number, compute_metric

logger = logging.getLogger(__name__)

# Chặn các câu lệnh thay đổi dữ liệu hoặc cấu trúc DB
_FORBIDDEN_SQL_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)\b",
    re.IGNORECASE,
)

from dbgpt_analyst.prompts.insight_prompt import HYPOTHESIZER_SYSTEM_PROMPT
_HYPOTHESIZER_SYSTEM_PROMPT = HYPOTHESIZER_SYSTEM_PROMPT


@dataclass(frozen=True)
class Finding:
    claim: str  # câu nhận định, KHÔNG chứa số (bị chặn khi verify)
    metric_expr: str  # ví dụ "sum:doanh_thu", "count", "avg:gia"
    value: float  # code tính, không phải model viết
    evidence_sql: str  # chạy lại ra đúng `value`
    evidence_rows: list[dict]  # tối đa 20 dòng chứng cứ
    confidence: float  # 0.0–1.0


def _probe_tables(tables: list[str], run_sql: Callable[[str], list[dict]]) -> str:
    """Lấy cấu trúc và 3 dòng mẫu cho mỗi bảng để cung cấp ngữ cảnh cho LLM."""
    if not tables:
        return "Không có bảng nào được cung cấp."

    parts: list[str] = []
    for table in tables:
        sample_sql = f'SELECT * FROM "{table}" LIMIT 3'
        try:
            rows = run_sql(sample_sql)
        except Exception:
            try:
                sample_sql = f"SELECT * FROM {table} LIMIT 3"
                rows = run_sql(sample_sql)
            except Exception as exc:
                logger.warning("Không thể probe bảng %s: %s", table, exc)
                continue

        if not rows:
            parts.append(f"Bảng: {table} (không có dữ liệu)")
            continue

        first_row = rows[0]
        col_types: list[str] = []
        for col, val in first_row.items():
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                inferred = "số"
            elif isinstance(val, str):
                inferred = "văn bản"
            elif isinstance(val, bool):
                inferred = "logic"
            else:
                inferred = type(val).__name__ if val is not None else "không rõ"
            col_types.append(f"{col} ({inferred})")

        sample_json = json.dumps(rows[:3], ensure_ascii=False, default=str)
        parts.append(
            f"Bảng: {table}\n"
            f"- Các cột: {', '.join(col_types)}\n"
            f"- Dữ liệu mẫu (3 dòng): {sample_json}"
        )

    return "\n\n".join(parts) if parts else "Không thể đọc dữ liệu từ các bảng."


def _parse_hypotheses(content: Any) -> list[dict]:
    """Trích xuất danh sách giả thuyết từ phản hồi của LLM."""
    if isinstance(content, list):
        return [item for item in content if isinstance(item, dict)]
    if isinstance(content, dict):
        for key in ("hypotheses", "findings", "items", "data", "results"):
            if isinstance(content.get(key), list):
                return [item for item in content[key] if isinstance(item, dict)]
        return [content]

    text = str(content).strip()
    if text.startswith("```"):
        blocks = text.split("```")
        if len(blocks) >= 2:
            inner = blocks[1].strip()
            if inner.lower().startswith("json"):
                inner = inner[4:].strip()
            text = inner

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
        if isinstance(parsed, dict):
            for key in ("hypotheses", "findings", "items", "data", "results"):
                if isinstance(parsed.get(key), list):
                    return [item for item in parsed[key] if isinstance(item, dict)]
            return [parsed]
    except Exception:
        pass

    # Tìm mảng [ ... ]
    start_arr = text.find("[")
    end_arr = text.rfind("]")
    if start_arr != -1 and end_arr > start_arr:
        try:
            parsed = json.loads(text[start_arr : end_arr + 1])
            if isinstance(parsed, list):
                return [item for item in parsed if isinstance(item, dict)]
        except Exception:
            pass

    # Tìm object { ... }
    start_obj = text.find("{")
    end_obj = text.rfind("}")
    if start_obj != -1 and end_obj > start_obj:
        try:
            parsed = json.loads(text[start_obj : end_obj + 1])
            if isinstance(parsed, dict):
                for key in ("hypotheses", "findings", "items", "data", "results"):
                    if isinstance(parsed.get(key), list):
                        return [item for item in parsed[key] if isinstance(item, dict)]
                return [parsed]
        except Exception:
            pass

    return []


def _compute_confidence(rows: Sequence[dict], metric_expr: str) -> float:
    """Tính confidence = tỉ lệ dòng không null trên cột đo (count -> 1.0)."""
    if not rows:
        return 0.0

    op, _, rest = metric_expr.partition(":")
    op = op.strip().lower()
    if op == "count":
        return 1.0

    column, _, _ = rest.partition(":")
    column = column.strip()
    if not column:
        return 1.0

    def _val(row: Any) -> Any:
        if isinstance(row, dict):
            return row.get(column)
        try:
            return row[column]
        except Exception:
            return None

    non_null = sum(1 for r in rows if _val(r) is not None)
    return max(0.0, min(1.0, float(non_null / len(rows))))


async def run_insight_loop(
    question: str,
    *,
    run_sql: Callable[[str], list[dict]],
    tables: list[str],
    llm: Any = None,
    max_findings: int = 5,
    max_rounds: int = 3,
) -> list[Finding]:
    """Chạy vòng lặp khám phá insights (Finding) dựa trên dữ liệu thật.

    Mỗi vòng:
    1. probe — lấy schema và mẫu dữ liệu từ tables qua run_sql.
    2. hypothesize — LLM sinh JSON danh sách giả thuyết (không có số).
    3. verify — loại bỏ giả thuyết có số, SQL ghi, SQL lỗi, 0 dòng hoặc metric hỏng.
    4. keep — giả thuyết hợp lệ thành Finding với value tính từ run_sql + compute_metric.
    """
    findings: list[Finding] = []
    if max_findings <= 0 or max_rounds <= 0:
        return findings

    # 1. probe — chuẩn bị ngữ cảnh bảng và dữ liệu mẫu
    probe_text = _probe_tables(tables, run_sql)

    # Khởi tạo LLM nếu chưa được inject (lazy import)
    if llm is None:
        try:
            from dbgpt_analyst.core.helpers import _get_llm

            llm = await _get_llm(streaming=False, json_mode=True)
        except Exception as exc:
            logger.warning("Không thể khởi tạo LLM trong insight_loop: %s", exc)
            return findings

    dropped_history: list[dict[str, str]] = []

    for round_num in range(1, max_rounds + 1):
        if len(findings) >= max_findings:
            break

        # 2. hypothesize — gọi LLM xin danh sách giả thuyết
        user_content = (
            f"Câu hỏi: {question}\n\n"
            f"Thông tin bảng và mẫu dữ liệu:\n{probe_text}"
        )
        if dropped_history:
            dropped_desc = "\n".join(
                f"- Claim: {d.get('claim', '')} | SQL: {d.get('sql', '')} | Lý do: {d.get('reason', '')}"
                for d in dropped_history[-10:]
            )
            user_content += (
                f"\n\nCác giả thuyết đã bị loại ở vòng trước (TUYỆT ĐỐI KHÔNG lặp lại):\n{dropped_desc}"
            )

        try:
            reply = await llm.ainvoke(
                [
                    {"role": "system", "content": _HYPOTHESIZER_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ]
            )
            raw_content = getattr(reply, "content", reply)
            hypotheses = _parse_hypotheses(raw_content)
        except Exception as exc:
            # LLM lỗi/chết cả cụm -> trả về những Finding đã có, không ném
            logger.warning("LLM gọi thất bại ở vòng %d: %s", round_num, exc)
            break

        if not hypotheses:
            logger.warning("Không tìm thấy giả thuyết hợp lệ từ LLM ở vòng %d", round_num)
            continue

        # 3. verify & 4. keep
        for hyp in hypotheses:
            if len(findings) >= max_findings:
                break

            claim = str(hyp.get("claim", "")).strip()
            metric_expr = str(hyp.get("metric_expr", "")).strip()
            sql = str(hyp.get("sql", "")).strip()

            # Tránh thêm Finding trùng lặp đã được chấp nhận ở vòng trước
            if any(
                f.claim == claim and f.metric_expr == metric_expr and f.evidence_sql == sql
                for f in findings
            ):
                continue

            # Kiểm tra claim: không rỗng và không chứa số chưa kiểm chứng
            if not claim:
                logger.warning("Loại giả thuyết không có claim: %s", hyp)
                dropped_history.append({"claim": claim, "sql": sql, "reason": "Thiếu claim"})
                continue

            if _has_unverified_number(claim):
                logger.warning("Loại claim chứa số chưa kiểm chứng: %s", claim)
                dropped_history.append({"claim": claim, "sql": sql, "reason": "Claim chứa số chưa kiểm chứng"})
                continue

            # Kiểm tra SQL
            if not sql:
                logger.warning("Loại giả thuyết không có SQL: %s", hyp)
                dropped_history.append({"claim": claim, "sql": sql, "reason": "Thiếu SQL"})
                continue

            # Chặn dấu chấm phẩy (chống multi-statement injection)
            if ";" in sql:
                logger.warning("Loại SQL chứa dấu chấm phẩy (;): %s", sql)
                dropped_history.append({"claim": claim, "sql": sql, "reason": "SQL chứa dấu ;"})
                continue

            # Chặn thao tác ghi hoặc phá hủy dữ liệu
            if _FORBIDDEN_SQL_RE.search(sql):
                logger.warning("Loại SQL chứa từ khóa cấm/ghi: %s", sql)
                dropped_history.append({"claim": claim, "sql": sql, "reason": "SQL chứa từ khóa cấm"})
                continue

            # Chỉ chấp nhận SELECT hoặc WITH (CTE)
            sql_lower = sql.lower()
            if not (sql_lower.startswith("select") or sql_lower.startswith("with")):
                logger.warning("Loại SQL không phải SELECT/WITH: %s", sql)
                dropped_history.append({"claim": claim, "sql": sql, "reason": "SQL không phải SELECT thuần"})
                continue

            # Chạy SQL thực tế
            try:
                rows = run_sql(sql)
            except Exception as exc:
                logger.warning("Chạy SQL thất bại (%s): %s", sql, exc)
                dropped_history.append({"claim": claim, "sql": sql, "reason": f"SQL lỗi: {exc}"})
                continue

            if not rows or not isinstance(rows, list) or len(rows) == 0:
                logger.warning("SQL không trả về dòng nào: %s", sql)
                dropped_history.append({"claim": claim, "sql": sql, "reason": "0 dòng trả về"})
                continue

            # Tính toán metric từ kết quả thật
            try:
                value = compute_metric(rows, metric_expr)
            except Exception as exc:
                logger.warning("Tính metric '%s' thất bại: %s", metric_expr, exc)
                dropped_history.append({"claim": claim, "sql": sql, "reason": f"Metric lỗi: {exc}"})
                continue

            # Tính confidence và lưu Finding
            confidence = _compute_confidence(rows, metric_expr)
            evidence_rows = [dict(r) for r in rows[:20]]

            finding = Finding(
                claim=claim,
                metric_expr=metric_expr,
                value=float(value),
                evidence_sql=sql,
                evidence_rows=evidence_rows,
                confidence=confidence,
            )
            findings.append(finding)

    return findings
