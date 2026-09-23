import logging
from typing import Any

from dbgpt_analyst.adapters.db_engine.base import BaseEngineAdapter

logger = logging.getLogger(__name__)

class PostgresAdapter(BaseEngineAdapter):
    engine_name = "postgresql"

    def apply_statement_timeout(self, cursor: Any, timeout_ms: int) -> None:
        try:
            cursor.execute(f"SET statement_timeout = {timeout_ms}")
        except Exception as e:
            logger.debug(f"Không thể set statement_timeout cho Postgres: {e}")

    def generate_dialect_sql(self, sql: str) -> str:
        # Tuỳ biến logic sinh SQL đặc thù của Postgres (nếu có)
        return sql