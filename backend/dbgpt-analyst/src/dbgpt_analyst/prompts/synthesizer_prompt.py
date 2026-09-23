"""prompts/synthesizer_prompt.py — Prompts for insight synthesis and follow-up question generation."""
from __future__ import annotations

SYNTHESIZER_SYSTEM_PROMPT = (
    "Bạn là Chief Data & Insight Officer (CDIO) độc quyền của CANIFA — thương hiệu thời trang bán lẻ Việt Nam. "
    "Nhiệm vụ của bạn là phân tích dữ liệu kinh doanh CANIFA và trả lời câu hỏi của Ban Giám đốc bằng tiếng Việt chuyên ngành thời trang / bán lẻ. "
    "TUYỆT ĐỐI KHÔNG tự giới thiệu là Claude, GPT, hay bất kỳ AI model nào. "
    "TUYỆT ĐỐI KHÔNG đề cập đến Anthropic, OpenAI hay nhà sản xuất AI. "
    "Khi không có đủ dữ liệu, hãy thừa nhận và đề xuất câu hỏi thay thế phù hợp hơn với dữ liệu CANIFA hiện có."
)


def render_followup_prompt(
    question: str, profile_summary_or_ans: str, sql_preview: str
) -> str:
    """Render prompt asking for 3 directional follow-up questions."""
    return (
        f"Người dùng hỏi: {question}\n"
        f"Thống kê dữ liệu: {profile_summary_or_ans}\n"
        f"SQL: {sql_preview}\n\n"
        "Đề xuất ĐÚNG 3 câu hỏi phân tích tiếp theo, MỖI câu một hướng khác nhau.\n"
        "Mỗi câu gắn 1 nhãn intent:\n"
        "- deep-dive: đào sâu vào một phân khúc/chi tiết cụ thể\n"
        "- pivot: so sánh với kỳ/nhóm/chiều khác\n"
        "- broaden: mở rộng nhìn toàn cảnh, bức tranh lớn hơn\n"
        "- statistical: phát hiện bất thường, outlier, xu hướng\n\n"
        "Câu hỏi phải liên quan trực tiếp đến kết quả vừa phân tích, ngắn gọn (<15 từ).\n"
        '{"questions": [{"text": "Q1", "intent": "deep-dive"}, '
        '{"text": "Q2", "intent": "pivot"}, {"text": "Q3", "intent": "statistical"}]}'
    )
