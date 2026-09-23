"""Phát hiện cột thời gian (``is_dttm``) — port tinh thần ``fetch_metadata`` của
Superset (``connectors/sqla/models.py`` tự gắn ``is_dttm`` cho cột thời gian).

Thuần — không đụng DB, test được bằng pytest. Dùng trong ``refresh_schema_cache``
để nhét ``is_dttm`` vào ``columns_json``; agent đọc cờ này để biết cột nào là
trục thời gian khi vẽ biểu đồ xu hướng.
"""

import re

# Từ khoá kiểu dữ liệu cho biết cột là thời gian (so theo chuỗi con, đã lowercase).
_TEMPORAL_TYPE_KEYWORDS = ("date", "time", "timestamp", "datetime", "year")

# Token tên cột (sau khi tách theo ký tự không-chữ-số) gợi ý thời gian.
_TEMPORAL_NAME_TOKENS = {
    "date", "time", "timestamp", "datetime",
    "ngay", "created", "updated", "modified", "year",
}

# Cụm tiếng Việt dính liền (sau khi bỏ dấu phân tách) gợi ý thời gian.
_TEMPORAL_NAME_SUBSTRINGS = ("thoigian", "ngaytao", "ngaycapnhat", "ngaythang")


def detect_temporal(col_name: str, col_type: str) -> bool:
    """Trả True nếu cột nhiều khả năng là cột thời gian.

    Ưu tiên ``col_type`` (chắc chắn hơn); nếu type không rõ thì dựa vào tên cột
    theo token để tránh dương tính giả (vd "candidate" chứa "date", "updated"
    chứa "date" — tách token sẽ không dính nhầm).
    """
    type_l = (col_type or "").lower()
    if any(kw in type_l for kw in _TEMPORAL_TYPE_KEYWORDS):
        return True

    name_l = (col_name or "").lower()
    if not name_l:
        return False

    # Hậu tố kiểu created_at / updated_at / deleted_at.
    if name_l.endswith("_at"):
        return True

    tokens = set(re.split(r"[^a-z0-9]+", name_l))
    if tokens & _TEMPORAL_NAME_TOKENS:
        return True

    collapsed = re.sub(r"[^a-z0-9]+", "", name_l)
    if any(sub in collapsed for sub in _TEMPORAL_NAME_SUBSTRINGS):
        return True

    return False
