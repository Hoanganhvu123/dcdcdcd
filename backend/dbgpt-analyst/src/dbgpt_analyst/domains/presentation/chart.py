import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from dbgpt_analyst.core.helpers import parse_llm_json
from dbgpt_analyst.common.llm_factory import preferred_model_name
from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

logger = logging.getLogger(__name__)

_CHART_WORDS = re.compile(
    r"biểu\s*đồ|biểu\s*diễn|đồ\s*thị|trực\s*quan|vẽ|chart|graph|plot|visuali", re.I
)

def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def build_chart_spec(llm_chart: Any, rows: Any, question: str) -> dict[str, Any] | None:
    """Chuẩn hoá gợi ý chart của LLM về ĐÚNG shape frontend."""
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return None

    cols = list(rows[0].keys())
    num_cols, cat_cols = [], []
    for c in cols:
        vals = [r.get(c) for r in rows if r.get(c) is not None]
        (num_cols if vals and all(_is_number(v) for v in vals) else cat_cols).append(c)

    ch = dict(llm_chart) if isinstance(llm_chart, dict) else {}
    xkey = ch.get("xKey") or ch.get("x_key")
    if xkey not in cols:
        xkey = cat_cols[0] if cat_cols else cols[0]

    ykeys = ch.get("yKeys") if isinstance(ch.get("yKeys"), list) else None
    if not ykeys:
        yk = ch.get("y_key") or ch.get("yKey")
        ykeys = [yk] if yk else []
    ykeys = [y for y in ykeys if y in cols and y != xkey]

    if not ykeys:
        cand = [c for c in num_cols if c != xkey]
        _id_like = re.compile(r"(^|_)id$|^id$|code$|^mã", re.I)
        metrics = [c for c in cand if not _id_like.search(c)]
        ykeys = metrics or cand

    if not ykeys:
        return None  # không có trục số → không vẽ được

    wants = bool(_CHART_WORDS.search(question or ""))
    auto_ok = len(num_cols) >= 1 and len(cat_cols) >= 1 and 1 <= len(rows) <= 50
    if not wants and not auto_ok and not isinstance(llm_chart, dict):
        return None

    ctype = (ch.get("type") or "").lower()
    if ctype not in ("bar", "line", "pie", "area"):
        ctype = "bar"
    title = ch.get("title") or (question[:80] if question else "Biểu đồ")

    # --- C1: AI Anomaly Detection Heuristic ---
    anomaly_obj = None
    if len(rows) >= 2 and ykeys:
        main_y = ykeys[0]
        try:
            values = [float(r.get(main_y, 0) or 0) for r in rows]
            last_val = values[-1]
            prev_val = values[-2]

            if prev_val != 0:
                delta_pct = (last_val - prev_val) / abs(prev_val)
                if abs(delta_pct) >= 0.3:
                    direction = "Tăng" if delta_pct > 0 else "Giảm"
                    level = "critical" if abs(delta_pct) >= 0.5 else "warning"
                    anomaly_obj = {
                        "level": level,
                        "reason": f"{direction} đột biến {abs(delta_pct)*100:.1f}% ở điểm cuối."
                    }

            if not anomaly_obj and len(values) >= 5:
                import statistics
                mean_val = statistics.mean(values[:-1])
                stdev_val = statistics.stdev(values[:-1]) if len(values) > 2 else 0
                if stdev_val > 0:
                    z_score = (last_val - mean_val) / stdev_val
                    if abs(z_score) > 2.0:
                        direction = "Cao" if z_score > 0 else "Thấp"
                        level = "critical" if abs(z_score) > 3.0 else "warning"
                        anomaly_obj = {
                            "level": level,
                            "reason": f"{direction} bất thường (z-score: {z_score:.1f})."
                        }
        except Exception:
            pass

    # --- T5: Semantic Type System ---
    SEMANTIC_TYPES = {
        "doanh_thu": {"color": "#1E40AF", "format": "currency"},
        "doanh_so": {"color": "#1E40AF", "format": "currency"},
        "chi_phi": {"color": "#DC2626", "format": "currency"},
        "loi_nhuan": {"color": "#10B981", "format": "currency"},
        "ti_le": {"format": "percent"},
        "ty_le": {"format": "percent"},
    }
    chart_color = None
    value_format = None
    for yk in ykeys:
        yk_lower = yk.lower()
        for k, v in SEMANTIC_TYPES.items():
            if k in yk_lower:
                if not chart_color: chart_color = v.get("color")
                if not value_format: value_format = v.get("format")
        if chart_color and value_format:
            break

    spec = {
        "type": ctype,
        "title": title,
        "xKey": xkey,
        "yKeys": ykeys,
        "data": rows[:200],  # cap số điểm vẽ
    }
    if anomaly_obj:
        spec["anomaly"] = anomaly_obj
    if chart_color:
        spec["colors"] = [chart_color]
    if value_format:
        spec["format"] = value_format
    return spec

async def generate_chart_spec(question: str, query_results: list[dict[str, Any]], user_id: str = "dev_user") -> dict[str, Any] | None:
    """Tự động sinh cấu hình chart bằng LLM dựa trên kết quả data."""
    if not query_results:
        return None

    # Lấy sample data để giảm token
    sample_data = query_results[:5]

    model_name = preferred_model_name()
    response_llm, _ = await create_llm_with_fallback(
        model_name=model_name,
        user_id=user_id,
        streaming=False,
        json_mode=True
    )

    from dbgpt_analyst.prompts.chart_prompt import render_chart_spec_prompt
    system_prompt = render_chart_spec_prompt(question, sample_data)

    try:
        response = await response_llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Sinh cấu hình biểu đồ.")])
        result = parse_llm_json(response.content)
        if not result.get("type"):
            return None
        return build_chart_spec(result, query_results, question)
    except Exception as e:
        logger.warning(f"Error generating chart spec: {e}")
        # Fallback cứng bằng Python rules
        return build_chart_spec({}, query_results, question)

async def adjust_chart(current_spec: dict[str, Any], user_command: str, user_id: str = "dev_user") -> dict[str, Any]:
    """Điều chỉnh biểu đồ dựa trên lệnh chat của người dùng (vd: đổi sang hình tròn)."""
    model_name = preferred_model_name()
    response_llm, _ = await create_llm_with_fallback(
        model_name=model_name,
        user_id=user_id,
        streaming=False,
        json_mode=True
    )

    from dbgpt_analyst.prompts.chart_prompt import render_chart_adjust_prompt
    system_prompt = render_chart_adjust_prompt(current_spec, user_command)
    try:
        response = await response_llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content="Điều chỉnh biểu đồ.")])
        new_spec = parse_llm_json(response.content)

        # Merge new spec with current spec to preserve data
        adjusted = dict(current_spec)
        if new_spec.get("type"): adjusted["type"] = new_spec["type"]
        if new_spec.get("title"): adjusted["title"] = new_spec["title"]
        if new_spec.get("xKey"): adjusted["xKey"] = new_spec["xKey"]
        if new_spec.get("yKeys"): adjusted["yKeys"] = new_spec["yKeys"]

        return adjusted
    except Exception as e:
        logger.warning(f"Error adjusting chart: {e}")
        return current_spec
