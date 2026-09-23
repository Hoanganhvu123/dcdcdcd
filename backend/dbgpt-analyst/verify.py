import asyncio
from dbgpt_analyst.subgraphs.modes.office_writer_subgraph import _detect_doc_type, _export_excel_file, _render_excel_html

assert _detect_doc_type("tạo bảng excel doanh thu") == "excel"
assert _detect_doc_type("viết báo cáo word chi tiết") == "word"
assert _detect_doc_type("làm slide thuyết trình") == "ppt"

rows = [{"ten": "A", "so_luong": 10}, {"ten": "B", "so_luong": 20}]
url = _export_excel_file(rows)
assert url and url.startswith("/uploads/generated_xlsx/") and url.endswith(".xlsx")
print("excel export OK:", url)

html = _render_excel_html("test", rows)
assert "<table" in html or "col-header" in html
print("excel html OK, len =", len(html))
print("ALL OK")
