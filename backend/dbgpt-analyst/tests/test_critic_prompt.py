"""Regression test cho bug: get_critic_prompt bị import ở nodes/analysis.py
nhưng chưa từng được định nghĩa trong prompts/ -> ImportError, khiến toàn bộ
Tầng 2 LLM-Critic trong node_critic luôn fail và fallback về heuristic thuần.
"""

from dbgpt_analyst.prompts import get_critic_prompt


def test_get_critic_prompt_returns_nonempty_string():
    prompt = get_critic_prompt(
        question="Doanh thu tháng 3 là bao nhiêu?",
        generated_sql="SELECT SUM(revenue) FROM sales WHERE month = 3",
        row_count=1,
        error_msg="",
        selected_tables=["sales"],
        schema_tables=["sales(id, revenue, month)"],
        preview_rows="[{\"revenue\": 1000}]",
    )
    assert isinstance(prompt, str)
    assert "Doanh thu tháng 3" in prompt
    assert "SELECT SUM(revenue)" in prompt
    assert "sales(id, revenue, month)" in prompt


def test_get_critic_prompt_handles_missing_sql_and_error():
    prompt = get_critic_prompt(
        question="q",
        generated_sql=None,
        row_count=0,
        error_msg="near \"FROM\": syntax error",
        selected_tables=[],
        schema_tables=[],
        preview_rows="",
    )
    assert "near \"FROM\": syntax error" in prompt
    assert "không có SQL" in prompt
