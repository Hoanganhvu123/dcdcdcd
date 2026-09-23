"""prompts/chart_prompt.py — Prompts for chart visualization generation and adjustment."""
from __future__ import annotations

from typing import Any


def render_chart_spec_prompt(question: str, sample_data: list[dict[str, Any]]) -> str:
    return f"""Bạn là một chuyên gia về Data Visualization.
Nhiệm vụ của bạn là chọn loại biểu đồ phù hợp nhất cho tập dữ liệu và câu hỏi sau.

Câu hỏi: {question}
Sample Data: {sample_data}

Yêu cầu output JSON:
{{
    "type": "bar" | "line" | "pie" | "area",
    "title": "Tiêu đề biểu đồ",
    "xKey": "tên cột làm trục X (phân loại/thời gian)",
    "yKeys": ["tên cột làm trục Y 1", "tên cột trục Y 2"]
}}

Nếu dữ liệu không phù hợp để vẽ biểu đồ (chỉ có 1 dòng, không có cột số, v.v.), hãy trả về rỗng: {{}}
"""


def render_chart_adjust_prompt(current_spec: dict[str, Any], user_command: str) -> str:
    return f"""Bạn là một chuyên gia Data Visualization.
Người dùng đang có một biểu đồ như sau:
{current_spec}

Người dùng yêu cầu điều chỉnh: "{user_command}"

Hãy trả về cấu hình biểu đồ MỚI (chỉ sửa type, title, xKey, yKeys). Dữ liệu (data) giữ nguyên.

Yêu cầu output JSON:
{{
    "type": "bar" | "line" | "pie" | "area",
    "title": "Tiêu đề biểu đồ",
    "xKey": "tên cột trục X",
    "yKeys": ["tên cột trục Y"]
}}
"""
