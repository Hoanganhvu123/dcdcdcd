"""middleware/verification_gate.py — Supervisor Verification Gate & Numerical Claim Grounding (Task F - R2).

Validates agent generated prose, subagent reports, and final synthesis against executed
SQL ground-truth query results (`state.get("query_results")`). Detects and intercepts
hallucinated/unverified numerical figures, strips ungrounded claims, and injects verified
facts computed directly from database records.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any

from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from dbgpt_analyst.tools.deck import compute_metric, format_number

logger = logging.getLogger(__name__)

# Regex for numbers with optional signs, commas, dots, and suffixes (%, tỷ, ty, triệu, trieu, tr, nghìn, nghin, ngàn, ngan, k, M, B, bn, m)
_NUMBER_PATTERN = re.compile(
    r"(?<!\w)(?:[\$₫€¥]?\s*)?([+-]?\d+(?:[.,]\d+)*(?:\s*(?:%|tỷ|ty|triệu|trieu|tr|nghìn|nghin|ngàn|ngan|k|M|B|bn|m))?)(?!\w)",
    re.IGNORECASE,
)

# Label patterns to exclude from numerical claim verification
_YEAR_PATTERN = re.compile(r"^(?:19\d\d|20\d\d)$")
_DATE_PATTERN = re.compile(r"\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b")
_QUARTER_PATTERN = re.compile(r"(?:^|[^\w])(Q[1-4]|quý\s*[1-4]|quy\s*[1-4])(?=[^\w]|$)", re.IGNORECASE)
_TOP_K_PATTERN = re.compile(r"(?:^|[^\w])(top\s*\d+|top\d+|hạng\s*\d+|hang\s*\d+|thứ\s*\d+|thu\s*\d+)(?=[^\w]|$)", re.IGNORECASE)
_MONTH_PATTERN = re.compile(r"(?:^|[^\w])(tháng\s*\d+|thang\s*\d+|month\s*\d+|T[1-9]|T1[0-2])(?=[^\w]|$)", re.IGNORECASE)
_STEP_PATTERN = re.compile(r"(?:^|[^\w])(bước\s*\d+|buoc\s*\d+|step\s*\d+|tier\s*\d+)(?=[^\w]|$)", re.IGNORECASE)
_IDENTIFIER_PATTERN = re.compile(r"^`?[a-zA-Z_]+_\d+`?$|^`?\d+_[a-zA-Z_]+`?$")


def _parse_number_value(token: str) -> tuple[float, bool] | None:
    """Parse a numerical string token into a float value and is_percentage flag.
    
    Returns (value, is_percentage) or None if not a valid number.
    """
    cleaned = token.strip().rstrip(".,;:()")
    if not cleaned:
        return None

    # Strip leading/trailing currency symbols and common currency units ($, ₫, €, ¥, VND, VNĐ, đồng, dong, đ)
    cleaned = re.sub(r"^[\$₫€¥]\s*", "", cleaned)
    cleaned = re.sub(r"\s*(?:vnd|vnđ|đồng|dong|đ)$", "", cleaned, flags=re.IGNORECASE).strip()
    if not cleaned:
        return None

    # Handle sign
    sign = 1.0
    if cleaned.startswith("+"):
        cleaned = cleaned[1:].strip()
    elif cleaned.startswith("-"):
        sign = -1.0
        cleaned = cleaned[1:].strip()

    is_pct = False
    multiplier = 1.0

    lower = cleaned.lower()
    if lower.endswith("%"):
        is_pct = True
        cleaned = cleaned[:-1].strip()
    elif any(lower.endswith(s) for s in ("tỷ", "ty", "bn", "b")) or "tỷ" in lower or "ty" in lower:
        multiplier = 1e9
        cleaned = re.sub(r"(?i)(tỷ|ty|bn|b)", "", cleaned).strip()
    elif any(lower.endswith(s) for s in ("triệu", "trieu", "tr", "m")) or "triệu" in lower or "trieu" in lower or "tr" in lower:
        multiplier = 1e6
        cleaned = re.sub(r"(?i)(triệu|trieu|tr|m)", "", cleaned).strip()
    elif any(lower.endswith(s) for s in ("nghìn", "nghin", "ngàn", "ngan", "k")) or "nghìn" in lower or "nghin" in lower or "ngàn" in lower or "ngan" in lower:
        multiplier = 1e3
        cleaned = re.sub(r"(?i)(nghìn|nghin|ngàn|ngan|k)", "", cleaned).strip()

    # Normalize decimal separator vs thousands separator
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            # Vietnamese format: 1.250.000,50
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            # US format: 1,250,000.50
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        parts = cleaned.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            # Decimal comma: 12,85 -> 12.85
            cleaned = cleaned.replace(",", ".")
        else:
            # Thousands comma: 1,250,000 -> 1250000 or 27,543 -> 27543
            cleaned = cleaned.replace(",", "")
    elif "." in cleaned:
        parts = cleaned.split(".")
        if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3 and len(parts[0]) <= 3):
            # Thousands dot: 1.000.000 -> 1000000 or 27.543 -> 27543
            cleaned = cleaned.replace(".", "")

    try:
        val = float(cleaned) * multiplier * sign
        return val, is_pct
    except ValueError:
        return None


def _is_benign_label(token: str, line: str = "") -> bool:
    """Check if token is a label (year, date, Q1-Q4, Top-K, bullet number, etc.) rather than a metric claim."""
    clean = token.strip().rstrip(".,;:()")
    clean_unslash = clean.lstrip("+-")
    
    # 4-digit years (1900-2099)
    if clean.isdigit() and len(clean) == 4 and 1900 <= int(clean) <= 2099:
        return True
    if _YEAR_PATTERN.match(clean):
        return True

    # Standalone single digits without % or multiplier (e.g. bullet points 1., 2.)
    if clean.isdigit() and len(clean) == 1:
        return True
        
    # Check context in the line for top-K, ranking, quarter, or month labels
    if line:
        # Check if inside markdown code backticks: `...`
        if f"`{token}`" in line or f"`{clean}`" in line:
            return True
        for bt in re.finditer(r"`([^`]+)`", line):
            if clean in bt.group(1):
                return True
        # Check if part of an identifier e.g. mock_don_hang, id_102, id=102, id: 102
        for id_match in re.finditer(r"\b[a-zA-Z_]+\d+\b|\b\d+_[a-zA-Z_]+\b|\bid[=:]\s*\d+\b", line, re.IGNORECASE):
            if clean in id_match.group() or clean_unslash in id_match.group():
                return True
        for match in _TOP_K_PATTERN.finditer(line):
            lbl = match.group(1) if match.lastindex else match.group()
            if clean.lower() == lbl.lower() or any(clean == n or clean_unslash == n for n in re.findall(r"\d+", lbl)):
                return True
        for match in _QUARTER_PATTERN.finditer(line):
            lbl = match.group(1) if match.lastindex else match.group()
            if clean.lower() == lbl.lower() or any(clean == n or clean_unslash == n for n in re.findall(r"\d+", lbl)):
                return True
        for match in _MONTH_PATTERN.finditer(line):
            lbl = match.group(1) if match.lastindex else match.group()
            if clean.lower() == lbl.lower() or any(clean == n or clean_unslash == n for n in re.findall(r"\d+", lbl)):
                return True
        for match in _STEP_PATTERN.finditer(line):
            lbl = match.group(1) if match.lastindex else match.group()
            if clean.lower() == lbl.lower() or any(clean == n or clean_unslash == n for n in re.findall(r"\d+", lbl)):
                return True
        # Check for full date in line containing the token
        for match in _DATE_PATTERN.finditer(line):
            if clean in match.group() or clean_unslash in match.group():
                return True

    return False


def _extract_ground_truth_values(query_results: list[dict[str, Any]] | list[Any]) -> set[float]:
    """Extract all raw and computed numerical values from query_results rows."""
    gt_values: set[float] = set()
    if not query_results or not isinstance(query_results, list):
        return gt_values

    # Check if elements are dicts
    rows = [r for r in query_results if isinstance(r, dict)]
    if not rows:
        return gt_values

    row_count = float(len(rows))
    gt_values.add(row_count)

    # Collect numeric columns
    numeric_cols = [
        col
        for col in rows[0].keys()
        if any(isinstance(r.get(col), (int, float)) and not isinstance(r.get(col), bool) for r in rows)
    ]

    col_sums: dict[str, float] = {}

    for col in numeric_cols:
        col_values: list[float] = []
        for r in rows:
            val = r.get(col)
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                f_val = float(val)
                gt_values.add(f_val)
                col_values.append(f_val)

        if col_values:
            # Sum
            col_sum = sum(col_values)
            col_sums[col] = col_sum
            gt_values.add(col_sum)
            # Avg / Mean
            col_avg = col_sum / len(col_values)
            gt_values.add(col_avg)
            # Min / Max
            gt_values.add(min(col_values))
            gt_values.add(max(col_values))

            # Ratios and percentages
            if col_sum != 0:
                for v in col_values:
                    gt_values.add(abs(v / col_sum))
                    gt_values.add(abs(v / col_sum) * 100.0)
                    gt_values.add(v / col_sum)  # e.g. 0.25
                    gt_values.add((v / col_sum) * 100.0)  # e.g. 25.0

            # Growth / change if at least 2 rows
            if len(col_values) >= 2 and col_values[0] != 0:
                growth = (col_values[-1] - col_values[0]) / col_values[0]
                gt_values.add(growth)  # e.g. 0.369
                gt_values.add(growth * 100.0)  # e.g. 36.9

    # Cross-column totals ratios (e.g. total_rev / total_orders, profit / revenue)
    if len(numeric_cols) >= 2:
        for c1 in numeric_cols:
            for c2 in numeric_cols:
                if c1 != c2:
                    if col_sums.get(c2, 0) != 0:
                        ratio = col_sums[c1] / col_sums[c2]
                        gt_values.add(ratio)
                        gt_values.add(ratio * 100.0)
                    for r in rows:
                        v1 = r.get(c1)
                        v2 = r.get(c2)
                        if isinstance(v1, (int, float)) and isinstance(v2, (int, float)) and v2 != 0:
                            r_ratio = float(v1) / float(v2)
                            gt_values.add(r_ratio)
                            gt_values.add(r_ratio * 100.0)

    return gt_values


def verify_numerical_claims(
    text: str,
    query_results: list[dict[str, Any]] | list[Any] | None,
    tolerance: float = 0.02,
) -> tuple[bool, list[str]]:
    """Verify that all numerical claims in text match database query results.
    
    Args:
        text: The prose text or markdown report to verify.
        query_results: Ground truth database query results.
        tolerance: Relative error tolerance for float matching (default 2%).
        
    Returns:
        (is_valid, ungrounded_claims) tuple.
    """
    if not text:
        return True, []

    # If query_results is empty or None
    if not query_results:
        # Check if text contains numerical claims that are not benign labels
        ungrounded: list[str] = []
        for line in text.splitlines():
            line_clean = line.strip()
            if not line_clean or line_clean.startswith("#"):
                continue
            for match in _NUMBER_PATTERN.finditer(line_clean):
                token = match.group().strip()
                if _is_benign_label(token, line_clean):
                    continue
                parsed = _parse_number_value(token)
                if parsed is not None:
                    ungrounded.append(token)
        return len(ungrounded) == 0, ungrounded

    gt_values = _extract_ground_truth_values(query_results)
    if not gt_values:
        return True, []

    ungrounded_claims: list[str] = []

    for line in text.splitlines():
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("#"):
            continue

        for match in _NUMBER_PATTERN.finditer(line_clean):
            token = match.group().strip()
            if _is_benign_label(token, line_clean):
                continue

            parsed = _parse_number_value(token)
            if parsed is None:
                continue

            val, is_pct = parsed

            # Check matching against any ground truth number
            matched = False
            for gt in gt_values:
                # Direct match with relative tolerance or small absolute tolerance
                if abs(gt) < 1e-9:
                    if abs(val) < 1e-5:
                        matched = True
                        break
                elif abs(val - gt) / max(abs(gt), 1.0) <= tolerance or abs(val - gt) < 0.01:
                    matched = True
                    break
                
                # Percentage checks (e.g. val=36.9 vs gt=0.369 or val=0.369 vs gt=36.9)
                if is_pct:
                    if abs(val - (gt * 100.0)) / max(abs(gt * 100.0), 1.0) <= tolerance:
                        matched = True
                        break
                    if abs((val / 100.0) - gt) / max(abs(gt), 1.0) <= tolerance:
                        matched = True
                        break

            if not matched:
                ungrounded_claims.append(token)

    is_valid = len(ungrounded_claims) == 0
    return is_valid, ungrounded_claims


def strip_ungrounded_claims(
    text: str,
    query_results: list[dict[str, Any]] | list[Any],
    tolerance: float = 0.02,
) -> str:
    """Filter out lines in text that contain ungrounded numerical claims."""
    if not text or not query_results:
        return text

    gt_values = _extract_ground_truth_values(query_results)
    if not gt_values:
        return text

    kept_lines: list[str] = []
    for line in text.splitlines():
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("#"):
            kept_lines.append(line)
            continue

        has_ungrounded = False
        for match in _NUMBER_PATTERN.finditer(line_clean):
            token = match.group().strip()
            if _is_benign_label(token, line_clean):
                continue

            parsed = _parse_number_value(token)
            if parsed is None:
                continue

            val, is_pct = parsed
            matched = False
            for gt in gt_values:
                if abs(gt) < 1e-9:
                    if abs(val) < 1e-5:
                        matched = True
                        break
                elif abs(val - gt) / max(abs(gt), 1.0) <= tolerance or abs(val - gt) < 0.01:
                    matched = True
                    break
                if is_pct:
                    if abs(val - (gt * 100.0)) / max(abs(gt * 100.0), 1.0) <= tolerance:
                        matched = True
                        break
                    if abs((val / 100.0) - gt) / max(abs(gt), 1.0) <= tolerance:
                        matched = True
                        break

            if not matched:
                has_ungrounded = True
                break

        if not has_ungrounded:
            kept_lines.append(line)

    return "\n".join(kept_lines)


def inject_grounded_facts(
    text: str,
    query_results: list[dict[str, Any]] | list[Any],
) -> str:
    """Compute verified summary metrics from query_results and append as Ground Truth facts section."""
    if not query_results or not isinstance(query_results, list):
        return text

    rows = [r for r in query_results if isinstance(r, dict)]
    if not rows:
        return text

    columns = list(rows[0].keys())
    numeric_cols = [
        c
        for c in columns
        if any(isinstance(r.get(c), (int, float)) and not isinstance(r.get(c), bool) for r in rows)
    ]

    facts_lines: list[str] = ["\n\n## Số liệu đã xác thực từ cơ sở dữ liệu (Ground Truth)"]
    facts_lines.append(f"- **Tổng số bản ghi (row_count)**: {format_number(float(len(rows)))}")

    for c in numeric_cols:
        col_sum = compute_metric(rows, f"sum:{c}")
        col_avg = compute_metric(rows, f"avg:{c}")
        facts_lines.append(f"- **Tổng {c}**: {format_number(col_sum)}")
        facts_lines.append(f"- **Trung bình {c}**: {format_number(col_avg)}")

    appendix = "\n".join(facts_lines)
    return text + appendix


class VerificationGateMiddleware(AgentMiddleware[AgentState, Any]):
    """Supervisor Verification Gate for ensuring numerical claims are grounded in SQL results.
    
    Modes:
        - 'sanitize': Strips ungrounded sentences and injects code-computed verified facts.
        - 'warn': Appends verification warnings for ungrounded claims.
        - 'strict': Returns corrective feedback to prompt regeneration.
    """

    state_schema = AgentState

    def __init__(self, mode: str = "sanitize", tolerance: float = 0.02) -> None:
        super().__init__()
        self.mode = mode
        self.tolerance = tolerance

    def _process_state(self, state: AgentState | dict[str, Any]) -> dict[str, Any] | None:
        """Inspect agent output in state against query_results."""
        # Check for circuit breaker marker
        is_dict = isinstance(state, dict)
        messages = state.get("messages", []) if is_dict else getattr(state, "messages", [])
        if messages:
            for m in messages[-2:]:
                if "_CIRCUIT_BREAKER_TRIGGERED_" in str(getattr(m, "content", "")):
                    return None

        query_results = state.get("query_results") if is_dict else getattr(state, "query_results", None)
        if not query_results:
            return None

        if not messages:
            return None

        last_msg = messages[-1]
        if not isinstance(last_msg, AIMessage) and getattr(last_msg, "type", "") != "ai":
            return None

        content = getattr(last_msg, "content", "")
        if not content or not isinstance(content, str):
            return None

        is_valid, ungrounded = verify_numerical_claims(
            content, query_results, tolerance=self.tolerance
        )

        if is_valid:
            return None

        logger.warning(
            "Verification gate detected ungrounded numerical claims: %s (mode=%s)",
            ungrounded,
            self.mode,
        )

        if self.mode == "sanitize":
            sanitized = strip_ungrounded_claims(content, query_results, tolerance=self.tolerance)
            final_content = inject_grounded_facts(sanitized, query_results)
            return {"messages": [AIMessage(content=final_content)]}
        elif self.mode == "warn":
            warning_note = (
                f"\n\n> ⚠️ **[VERIFICATION WARNING]**: The following numerical figures "
                f"could not be verified against executed query results: {', '.join(ungrounded)}"
            )
            return {"messages": [AIMessage(content=content + warning_note)]}
        elif self.mode == "strict":
            feedback = (
                f"[VERIFICATION GATE FAILED: The claims {ungrounded} are not supported by "
                f"the database query results. Please re-check the data and produce an accurate response.]"
            )
            return {"messages": [HumanMessage(content=feedback)]}

        return None

    def after_agent(
        self,
        state: AgentState | dict[str, Any],
        runtime: Any = None,
        config: Any = None,
    ) -> dict[str, Any] | None:
        """Inspect agent response after execution."""
        return self._process_state(state)

    async def aafter_agent(
        self,
        state: AgentState | dict[str, Any],
        runtime: Any = None,
        config: Any = None,
    ) -> dict[str, Any] | None:
        """Async inspect agent response after execution."""
        return self._process_state(state)

    def before_agent(
        self,
        state: AgentState | dict[str, Any],
        runtime: Any = None,
        config: Any = None,
    ) -> dict[str, Any] | None:
        """Check for ungrounded subagent tool messages before next model turn."""
        return None

    async def abefore_agent(
        self,
        state: AgentState | dict[str, Any],
        runtime: Any = None,
        config: Any = None,
    ) -> dict[str, Any] | None:
        """Async check for ungrounded subagent tool messages before next model turn."""
        return None
