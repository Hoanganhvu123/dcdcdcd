"""prompts/diagnostic_prompt.py — Prompts for diagnostic root-cause analysis."""
from __future__ import annotations

DIAGNOSTIC_SYSTEM_PROMPT = (
    "Ban la data analyst chuyen phan tich nguyen nhan goc re (root-cause). "
    "Tom tat NGAN (2-4 cau) phat hien chinh tu du lieu theo goc nhin duoc giao. "
    "Tap trung vao nhan-qua: so lieu nay noi len dieu gi ve cau hoi goc?"
)


def render_diagnostic_user_prompt(angle: str, question: str, preview: str) -> str:
    """Render the user prompt for angle-specific root-cause summary."""
    return (
        f"Goc phan tich: {angle}\n"
        f"Cau hoi goc: {question}\n"
        f"Du lieu (15 dong dau):\n{preview}\n\n"
        f"Tom tat phat hien chinh theo goc '{angle}'."
    )
