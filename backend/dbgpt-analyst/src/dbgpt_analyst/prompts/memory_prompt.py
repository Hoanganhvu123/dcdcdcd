"""prompts/memory_prompt.py — Centralized prompt templates for memory distillation and scoring."""
from __future__ import annotations

DISTILL_PROMPT = """\
Bạn là AI phân tích rút kinh nghiệm từ một lần truy vấn dữ liệu.

Câu hỏi người dùng: {question}
SQL đã sinh: {sql}
Tóm tắt kết quả: {results_summary}
Bảng liên quan: {table_names}

Hãy rút ra bài học cho lần sau. Trả về JSON (không có ```):
{{
  "context_summary": "<loại câu hỏi 10-20 từ, ví dụ: Câu hỏi về doanh thu tổng hợp theo tháng>",
  "pattern": "<cách tiếp cận đúng, 1-2 câu>",
  "pitfalls": "<điều cần tránh, 1-2 câu hoặc rỗng>",
  "tags": ["<tag1>", "<tag2>"]
}}"""


GENERIC_DISTILL_PROMPT = """\
Bạn là AI có nhiệm vụ rút kinh nghiệm (Reflection) cho Agent có tên: {agent_name}
Agent này vừa hoàn thành một tác vụ:
- Input/Yêu cầu: {task_input}
- Output/Kết quả: {task_output}
- Trạng thái: {status}
- Bối cảnh phụ: {context_data}

Hãy rút ra bài học kinh nghiệm để Agent này có thể làm tốt hơn hoặc tái sử dụng tư duy này cho các lần sau. Trả về JSON (không có ```):
{{
  "context_summary": "<Tóm tắt loại tác vụ 10-20 từ. VD: Tóm tắt báo cáo tài chính>",
  "pattern": "<Cách tiếp cận đã dùng và thành công, 1-2 câu>",
  "pitfalls": "<Cạm bẫy cần tránh (nếu có lỗi xảy ra hoặc rủi ro), rỗng nếu không có>",
  "tags": ["<tag1>", "<tag2>"]
}}"""


IMPORTANCE_SCORER_PROMPT = (
    "You are an AI Memory Evaluator. Rate the importance of this analytical insight "
    "for future data queries on a scale of 1 to 10 (1 = trivial/temporary error, "
    "10 = vital business logic / database schema discovery / golden insight).\n"
    "Content: {content}\n"
    "Respond ONLY with a single numeric number between 1 and 10."
)


def render_importance_scorer_prompt(content: str) -> str:
    """Render the memory importance evaluation prompt."""
    return IMPORTANCE_SCORER_PROMPT.format(content=content[:1000])


def render_distill_prompt(
    question: str,
    sql: str,
    results_summary: str,
    table_names: list[str] | str | None = None,
) -> str:
    """Render experience distillation prompt for SQL queries."""
    tables_str = ", ".join(table_names) if isinstance(table_names, list) else str(table_names or "")
    return DISTILL_PROMPT.format(
        question=question,
        sql=sql,
        results_summary=results_summary,
        table_names=tables_str,
    )


def render_generic_distill_prompt(
    agent_name: str,
    task_input: str,
    task_output: str,
    status: str = "success",
    context_data: object = None,
) -> str:
    """Render generic reflection and distillation prompt for any agent."""
    return GENERIC_DISTILL_PROMPT.format(
        agent_name=agent_name,
        task_input=task_input,
        task_output=task_output,
        status=status,
        context_data=context_data,
    )
