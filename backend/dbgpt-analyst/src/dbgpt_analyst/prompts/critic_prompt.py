from dbgpt_analyst.common.prompt_hub import pull_prompt_with_fallback

LOCAL_FALLBACK_CRITIC_TEMPLATE = r"""# VAI TRÒ
Bạn là SQL Critic — kiểm tra xem kết quả SQL có thực sự trả lời đúng câu hỏi nghiệp vụ không.
Không viết lại toàn bộ SQL trừ khi phát hiện lỗi logic rõ ràng.

# CÂU HỎI GỐC
"{question}"

# BẢNG ĐÃ CHỌN
{selected_tables}

# SCHEMA CÁC BẢNG LIÊN QUAN
{schema_tables}

# SQL ĐÃ THỰC THI
```sql
{generated_sql}
```

# KẾT QUẢ
- Số dòng trả về: {row_count}
- Lỗi thực thi (nếu có): {error_msg}
- Preview dữ liệu (tối đa 10 dòng):
{preview_rows}

# NHIỆM VỤ
Đánh giá SQL/kết quả trên có TRẢ LỜI ĐÚNG câu hỏi không. Kiểm tra:
1. SQL có JOIN/filter/group đúng bảng, đúng điều kiện câu hỏi yêu cầu không?
2. Kết quả có hợp lý về mặt nghiệp vụ không (không rỗng bất thường, không sai đơn vị/thời gian)?
3. Có bỏ sót điều kiện nào trong câu hỏi mà SQL quên áp dụng không?

Trả lời DUY NHẤT một JSON object, không thêm chữ nào khác, đúng format:
{{
  "verdict": "ok" | "retry" | "REJECT",
  "root_cause": "nguyên nhân lỗi nếu retry/REJECT, null nếu ok",
  "reason": "giải thích ngắn gọn quyết định",
  "fix_hint": "gợi ý cách sửa SQL nếu retry, null nếu ok",
  "fixed_sql": "SQL đã sửa nếu chắc chắn được, null nếu không"
}}

- "ok": SQL và kết quả đúng, có thể dùng để phân tích tiếp.
- "retry": SQL sai logic nhưng có thể sửa được, cần chạy lại.
- "REJECT": Câu hỏi không thể trả lời được với schema hiện có.
"""


def get_critic_prompt(
    question: str,
    generated_sql: str | None,
    row_count: int,
    error_msg: str,
    selected_tables: list[str],
    schema_tables: list[str],
    preview_rows: str,
) -> str:
    """Prompt cho LLM-Critic kiểm tra chất lượng SQL/kết quả (Tầng 2 của node_critic)."""
    return pull_prompt_with_fallback(
        "ai-data-analytics-critic",
        fallback_template=LOCAL_FALLBACK_CRITIC_TEMPLATE,
        kwargs={
            "question": question,
            "generated_sql": generated_sql or "(không có SQL)",
            "row_count": row_count,
            "error_msg": error_msg or "(không có lỗi)",
            "selected_tables": ", ".join(selected_tables) if selected_tables else "(không có)",
            "schema_tables": "\n".join(schema_tables) if schema_tables else "(không có)",
            "preview_rows": preview_rows or "(không có dữ liệu)",
        },
    )


def render_sql_judge_prompt(
    schema_text: str,
    question: str,
    candidates: list[dict],
) -> str:
    """Prompt for LLM-as-judge self-consistency SQL candidate evaluation."""
    judge_prompt = f"""Bạn là một chuyên gia cơ sở dữ liệu. Nhiệm vụ của bạn là chấm điểm và chọn ra CÂU SQL TỐT NHẤT trong các ứng viên.

SCHEMA:
{schema_text}

CÂU HỎI NGƯỜI DÙNG: {question}

CÁC ỨNG VIÊN SQL:
"""
    for i, c in enumerate(candidates):
        judge_prompt += f"--- Ứng viên {i+1} ---\n{c.get('sql')}\n\n"

    judge_prompt += """Tiêu chí chọn:
1. Đúng cú pháp ANSI SQL/PostgreSQL.
2. Logic tổng hợp, JOIN và điều kiện WHERE chính xác nhất so với yêu cầu.
3. KHÔNG chọn câu SQL tham chiếu sai tên bảng/cột.

ĐẦU RA BẮT BUỘC (CHỈ TRẢ VỀ ĐÚNG 1 SỐ NGUYÊN DUY NHẤT LÀ SỐ THỨ TỰ CỦA ỨNG VIÊN TỐT NHẤT, VD: 1, 2 hoặc 3):"""
    return judge_prompt

