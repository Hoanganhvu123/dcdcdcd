import logging
from typing import Any

import sqlglot
from sqlglot import exp

from dbgpt_analyst.adapters.db_engine.base import BaseEngineAdapter

logger = logging.getLogger(__name__)

# ponytail: secure_sql() luôn parse/regenerate SQL ở dialect Postgres (hardcoded),
# nên clean_sql tới đây luôn là cú pháp Postgres. sqlglot.transpile tự xử lý phần
# lớn khác biệt cú pháp (ILIKE, DISTINCT ON, ...), nhưng KHÔNG rewrite EXTRACT(...)
# và DATE_TRUNC(...) sang cú pháp SQLite hợp lệ (giữ nguyên EXTRACT gây lỗi
# 'near "FROM"', hoặc sinh TIMESTAMP_TRUNC kiểu BigQuery không tồn tại ở SQLite).
# Transform 2 node này thủ công sang strftime() trước khi generate.
_EXTRACT_UNIT_FMT = {
    "YEAR": "%Y", "MONTH": "%m", "DAY": "%d",
    "HOUR": "%H", "MINUTE": "%M", "SECOND": "%S",
    "DOW": "%w", "WEEK": "%W",
}
_TRUNC_UNIT_FMT = {
    "YEAR": "%Y-01-01", "MONTH": "%Y-%m-01", "DAY": "%Y-%m-%d",
    "HOUR": "%Y-%m-%dT%H:00:00", "MINUTE": "%Y-%m-%dT%H:%M:00",
}


def _rewrite_date_funcs(node: exp.Expression) -> exp.Expression:
    if isinstance(node, exp.Extract):
        fmt = _EXTRACT_UNIT_FMT.get(node.this.name.upper())
        if fmt:
            strftime = exp.func("strftime", exp.Literal.string(fmt), node.expression)
            return exp.cast(strftime, "INT")
    elif isinstance(node, (exp.DateTrunc, exp.TimestampTrunc)):
        unit_node = node.args.get("unit")
        fmt = _TRUNC_UNIT_FMT.get((unit_node.name if unit_node else "").upper())
        if fmt:
            return exp.func("strftime", exp.Literal.string(fmt), node.this)
    return node


class SqliteAdapter(BaseEngineAdapter):
    engine_name = "sqlite"

    def apply_statement_timeout(self, cursor: Any, timeout_ms: int) -> None:
        pass

    def generate_dialect_sql(self, sql: str) -> str:
        try:
            tree = sqlglot.parse_one(sql, read="postgres")
            tree = tree.transform(_rewrite_date_funcs)
            return tree.sql(dialect="sqlite")
        except Exception as e:
            logger.warning(f"generate_dialect_sql: transpile postgres->sqlite failed, dùng SQL gốc: {e}")
            return sql
