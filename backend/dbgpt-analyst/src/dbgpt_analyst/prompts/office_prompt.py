"""prompts/office_prompt.py — Prompts for Office documents (Slides PPTX, Word DOCX, Excel XLSX)."""
from __future__ import annotations

SLIDE_PLANNER_RULES = """Bạn thiết kế cấu trúc một bộ slide trình chiếu điều hành cao cấp (Executive Presentation Deck, 6-10 slide).

TUYỆT ĐỐI KHÔNG viết bất kỳ con số nào. Mọi con số do hệ thống tự tính từ dữ liệu
thật; bạn chỉ chọn câu chuyện: thứ tự slide, tiêu đề, nhận định định tính, và chỉ ra cột nào
cần vẽ. Nếu bạn viết một con số cụ thể, nó sẽ bị loại.

Hỗ trợ các loại slide sau:
1. "kpi": Chỉ số chính (kpis: [{"label": "...", "metric": "sum:<cot_so>|avg:<cot_so>|count|growth:<cot_so>:<cot_ky>"}])
2. "chart": Biểu đồ ("chart": "column|bar|line|pie", "category_column": "<cot>", "value_column": "<cot_so>", "series_column": "<cot, tuy chon>")
3. "table": Bảng dữ liệu ("columns": ["<cot>"], "limit": 8)
4. "callout": Khung nhận định chiến lược ("headline": "...", "insights": ["nhan dinh 1", "nhan dinh 2"], "badge": "TÂM ĐIỂM CHIẾN LƯỢC")
5. "takeaway": Kế hoạch hành động ("takeaways": [{"priority": "Ưu tiên 1", "title": "...", "description": "..."}])
6. "comparison": So sánh đa cột ("columns": [{"header": "...", "badge": "...", "metric": "sum:<cot_so>", "bullets": ["..."]}])
7. "bullets": Danh sách nhận định định tính ("bullets": ["nhan dinh 1", "nhan dinh 2"])

Trả về DUY NHẤT một JSON object:
{
  "title": "...", "subtitle": "...",
  "slides": [
    {"kind": "kpi", "title": "Tổng quan Chỉ số", "kpis": [{"label": "Tổng", "metric": "sum:<cot_so>"}]},
    {"kind": "chart", "title": "Xu hướng Tăng trưởng", "chart": "column", "category_column": "<cot_ky>", "value_column": "<cot_so>"},
    {"kind": "chart", "title": "Cơ cấu Phân bổ", "chart": "pie", "category_column": "<cot_nhom>", "value_column": "<cot_so>"},
    {"kind": "callout", "title": "Nhận định Chiến lược", "headline": "...", "insights": ["..."]},
    {"kind": "table", "title": "Chi tiết Vận hành", "columns": ["<cot>"], "limit": 8},
    {"kind": "comparison", "title": "Đánh giá Phân khúc", "columns": [{"header": "A", "bullets": ["..."]}, {"header": "B", "bullets": ["..."]}]},
    {"kind": "takeaway", "title": "Khuyến nghị & Hành động", "takeaways": [{"priority": "01", "title": "...", "description": "..."}]}
  ]
}

Cú pháp metric hợp lệ: count | sum:<cot> | avg:<cot> | min:<cot> | max:<cot> | growth:<cot_so>:<cot_thoi_gian>
Chỉ dùng đúng tên cột có trong danh sách được cấp. 6-10 slide."""


def render_word_doc_prompt(question: str, data_context: str) -> str:
    """Render prompt for Word document drafting."""
    return (
        "Bạn là chuyên viên viết báo cáo doanh nghiệp. Viết một tài liệu Word ngắn gọn, "
        "chuyên nghiệp (định dạng Markdown, có tiêu đề # và mục ##) trả lời yêu cầu sau. "
        "Phần thân KHÔNG được tự viết bất kỳ con số cụ thể nào — chỉ phân tích định tính "
        "(xu hướng, so sánh, nhận định); số liệu sẽ được hệ thống tự chèn vào mục "
        "'Số liệu chi tiết' ở cuối tài liệu.\n\n"
        f"Yêu cầu: {question}\n\n"
        f"Dữ liệu tham khảo (nếu có): {data_context}"
    )
