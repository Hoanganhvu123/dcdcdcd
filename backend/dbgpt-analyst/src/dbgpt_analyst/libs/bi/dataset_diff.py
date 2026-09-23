import json
import logging

logger = logging.getLogger(__name__)


def compute_diff(old_columns_json: str, new_columns_json: str, old_row_est: int, new_row_est: int) -> dict:
    try:
        old_cols = json.loads(old_columns_json) if old_columns_json else []
    except Exception:
        old_cols = []

    try:
        new_cols = json.loads(new_columns_json) if new_columns_json else []
    except Exception:
        new_cols = []

    old_map = {c["name"]: c for c in old_cols}
    new_map = {c["name"]: c for c in new_cols}

    added_cols = [name for name in new_map if name not in old_map]
    removed_cols = [name for name in old_map if name not in new_map]

    type_changes = []
    for name in new_map:
        if name in old_map and old_map[name].get("type") != new_map[name].get("type"):
            type_changes.append({
                "column": name,
                "old_type": old_map[name].get("type"),
                "new_type": new_map[name].get("type")
            })

    row_delta = (new_row_est or 0) - (old_row_est or 0)

    # Nếu không có diff nào đáng kể
    if not added_cols and not removed_cols and not type_changes and row_delta == 0:
        return {}

    return {
        "added_cols": added_cols,
        "removed_cols": removed_cols,
        "type_changes": type_changes,
        "row_delta": row_delta
    }


def compute_dq_score(conn, db_type: str, table_name: str) -> tuple[int, str]:
    """
    Returns (score 0-100, issues_json)
    """
    cursor = conn.cursor()
    quoted_table = f"`{table_name}`" if db_type == "mysql" else f'"{table_name}"'

    try:
        cursor.execute(f"SELECT COUNT(*) FROM {quoted_table}")
        row = cursor.fetchone()
        total_rows = row[0] if row else 0

        if total_rows == 0:
            return 0, json.dumps(["Table is empty"])

        # Sample to compute null percentage
        cursor.execute(f"SELECT * FROM {quoted_table} LIMIT 100")
        sample_rows = cursor.fetchall()

        if not sample_rows:
            return 100, "[]"

        num_cols = len(sample_rows[0])
        null_count = 0
        for r in sample_rows:
            for val in r:
                if val is None or str(val).strip() == "":
                    null_count += 1

        null_pct = null_count / (len(sample_rows) * num_cols)

        score = max(0, min(100, 100 - int(null_pct * 100)))

        issues = []
        if null_pct > 0.1:
            issues.append(f"High null rate: {int(null_pct*100)}% (in sample)")

        return score, json.dumps(issues, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error computing DQ for {table_name}: {e}")
        return 0, json.dumps([f"Error computing DQ: {e}"])
