"""api/sql/analyst/profiler.py — Compute-First Analyst: Python tính số, LLM chỉ kể chuyện."""
import math
from typing import Any


def profile(rows: list[dict[str, Any]], question: str = "") -> dict[str, Any]:  # noqa: ARG001
    """
    Tính thống kê thuần Python (pandas) từ query_results.
    Luôn trả về dict an toàn, KHÔNG raise.
    """
    if not rows or not isinstance(rows, list) or not isinstance(rows[0], dict):
        return {"n_rows": 0, "columns": {}, "growth": {}}

    try:
        import pandas as pd
    except ImportError:
        return {"n_rows": len(rows), "columns": {}, "growth": {}}

    try:
        df = pd.DataFrame(rows)
    except Exception:
        return {"n_rows": len(rows), "columns": {}, "growth": {}}

    n_rows = len(df)
    columns: dict[str, Any] = {}
    time_cols: list[str] = []
    metric_cols: list[str] = []

    for col in df.columns:
        series = df[col].dropna()
        if series.empty:
            columns[col] = {"kind": "category", "n_unique": 0, "top": {}}
            continue

        col_info: dict[str, Any] = {}

        # --- Try datetime (coerce: count valid parses) ---
        parsed_as_time = False
        if pd.api.types.is_string_dtype(series) or series.dtype == object:
            for _fmt in ["mixed", "%Y-%m-%d", "%Y-%m", "%d/%m/%Y", "%m/%d/%Y"]:
                try:
                    if _fmt == "mixed":
                        dt_s = pd.to_datetime(series, errors="coerce", format="mixed")
                    else:
                        dt_s = pd.to_datetime(series, errors="coerce", format=_fmt)
                    valid = int(dt_s.notna().sum())  # type: ignore[union-attr]
                    if valid >= max(1, len(series) * 0.8):
                        col_info["kind"] = "time"
                        col_info["min_date"] = str(dt_s.min().date())  # type: ignore[union-attr]
                        col_info["max_date"] = str(dt_s.max().date())  # type: ignore[union-attr]
                        col_info["n_periods"] = int(dt_s.nunique())  # type: ignore[union-attr]
                        time_cols.append(col)
                        parsed_as_time = True
                        break
                except Exception:
                    continue

        if parsed_as_time:
            columns[col] = col_info
            continue

        if pd.api.types.is_bool_dtype(series):
            vc = series.value_counts().head(3)
            col_info["kind"] = "category"
            col_info["n_unique"] = series.nunique()
            col_info["top"] = {str(k): int(v) for k, v in vc.items()}

        elif pd.api.types.is_numeric_dtype(series):
            col_info["kind"] = "metric"
            total = float(series.sum())
            mean_val = float(series.mean())
            std_val = float(series.std()) if len(series) > 1 else 0.0
            col_info["sum"] = round(total, 4)
            col_info["mean"] = round(mean_val, 4)
            col_info["median"] = round(float(series.median()), 4)
            col_info["min"] = round(float(series.min()), 4)
            col_info["max"] = round(float(series.max()), 4)
            col_info["std"] = round(std_val, 4)

            # Pareto: top 20% dòng chiếm % tổng
            top_n = max(1, math.ceil(len(series) * 0.2))
            top_sum = float(series.nlargest(top_n).sum())
            col_info["pareto_top20_pct"] = round(top_sum / total * 100, 2) if total != 0 else 0.0

            # Outliers via IQR (robust với small samples, tránh masking effect)
            outliers: list[dict[str, Any]] = []
            q1 = float(series.quantile(0.25))
            q3 = float(series.quantile(0.75))
            iqr = q3 - q1
            if iqr > 0:
                upper = q3 + 1.5 * iqr
                lower = q1 - 1.5 * iqr
                outlier_mask = (series > upper) | (series < lower)
                for idx in series[outlier_mask].index:
                    raw_idx = int(idx)
                    val = rows[raw_idx].get(col) if raw_idx < len(rows) else None
                    z = (float(series[idx]) - mean_val) / std_val if std_val > 0 else 0.0
                    outliers.append({"row_index": raw_idx, "value": val, "zscore": round(abs(z), 3)})
            col_info["outliers"] = outliers[:5]
            metric_cols.append(col)

        else:
            vc = series.value_counts().head(3)
            col_info["kind"] = "category"
            col_info["n_unique"] = series.nunique()
            col_info["top"] = {str(k): int(v) for k, v in vc.items()}

        columns[col] = col_info

    # --- Growth: chỉ khi đúng 1 time col + >=1 metric ---
    growth: dict[str, Any] = {}
    if len(time_cols) == 1 and metric_cols:
        try:
            import pandas as pd
            time_col = time_cols[0]
            df2 = df.copy()
            df2["_dt"] = pd.to_datetime(df2[time_col], errors="coerce")
            df2["_month"] = df2["_dt"].dt.to_period("M")  # type: ignore[union-attr]
            for mcol in metric_cols[:3]:
                monthly = df2.groupby("_month")[mcol].sum().sort_index()
                if len(monthly) >= 2:
                    last_val = float(monthly.iloc[-1])
                    prev_val = float(monthly.iloc[-2])
                    if prev_val != 0:
                        pct = round((last_val - prev_val) / abs(prev_val) * 100, 2)
                        growth[mcol] = {"period": "MoM", "pct_change": pct}
        except Exception:
            pass

    return {"n_rows": n_rows, "columns": columns, "growth": growth}


def format_profile_for_llm(prof: dict[str, Any], max_cols: int = 8) -> str:
    """Tóm tắt profile thành text ngắn để nhét vào LLM prompt."""
    if not prof or prof.get("n_rows", 0) == 0:
        return "Khong co du lieu."

    lines = [f"Tong {prof['n_rows']} dong."]
    cols = prof.get("columns", {})
    growth = prof.get("growth", {})

    for col, info in list(cols.items())[:max_cols]:
        kind = info.get("kind", "")
        if kind == "metric":
            line = (
                f"- {col} (so): tong={info.get('sum')}, tb={info.get('mean')}, "
                f"min={info.get('min')}, max={info.get('max')}, std={info.get('std')}"
            )
            pct = info.get("pareto_top20_pct")
            if pct:
                line += f", top20% dong chiem {pct}% tong"
            if info.get("outliers"):
                line += f" [CANH BAO: {len(info['outliers'])} outlier(s)]"
            lines.append(line)
        elif kind == "time":
            lines.append(
                f"- {col} (thoi gian): {info.get('min_date')} -> {info.get('max_date')}, "
                f"{info.get('n_periods')} ky"
            )
        elif kind == "category":
            top = info.get("top", {})
            top_str = ", ".join(f"{k}={v}" for k, v in list(top.items())[:3])
            lines.append(f"- {col} (danh muc): {info.get('n_unique')} gia tri. Top: {top_str}")

    for mcol, g in growth.items():
        sign = "tang" if g["pct_change"] > 0 else "giam"
        lines.append(f"Tang truong {mcol} ({g['period']}): {sign} {abs(g['pct_change'])}%")

    return "\n".join(lines)


if __name__ == "__main__":
    import json
    test_rows = [
        {"product": "A", "revenue": 100, "month": "2024-01"},
        {"product": "B", "revenue": 200, "month": "2024-02"},
        {"product": "C", "revenue": 150, "month": "2024-03"},
        {"product": "D", "revenue": 9999, "month": "2024-04"},  # outlier
        {"product": "E", "revenue": 120, "month": "2024-05"},
    ]
    result = profile(test_rows, "doanh thu theo san pham")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("\n--- Format for LLM ---")
    print(format_profile_for_llm(result))
