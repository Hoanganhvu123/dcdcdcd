"""Regression test cho bug: secure_sql() luôn serialize SQL ở dialect Postgres
(hardcoded db_dialect="postgres"), nhưng SqliteAdapter.generate_dialect_sql cũ
là no-op passthrough -> SQL Postgres-only (EXTRACT(x FROM y), DATE_TRUNC,
ILIKE, DISTINCT ON) chạy thẳng vào SQLite và fail với lỗi kiểu
'near "FROM": syntax error'. Test full pipeline y hệt execution.py:
secure_sql(dialect=postgres) -> SqliteAdapter.generate_dialect_sql -> execute
thật trên sqlite3 in-memory.
"""

import sqlite3

import pytest
from dbgpt_analyst.adapters.db_engine.sqlite import SqliteAdapter
from dbgpt_analyst.common.sql_guard import secure_sql

QUERIES = [
    "SELECT EXTRACT(MONTH FROM order_date) FROM walmart_sales",
    "SELECT EXTRACT(YEAR FROM order_date) AS y, SUM(revenue) FROM walmart_sales GROUP BY 1",
    "SELECT DATE_TRUNC('month', order_date) AS month, SUM(revenue) FROM walmart_sales GROUP BY 1 ORDER BY 1",
    "SELECT DATE_TRUNC('year', order_date) AS yr FROM walmart_sales",
    "SELECT category FROM walmart_sales WHERE product ILIKE '%chair%'",
    "SELECT DISTINCT ON (category) category, sales FROM walmart_sales ORDER BY category, sales DESC",
    "SELECT * FROM walmart_sales WHERE category = 'chairs'",
]


@pytest.fixture
def sqlite_conn():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE walmart_sales (order_date TEXT, revenue REAL, category TEXT, product TEXT, sales REAL)"
    )
    conn.execute("INSERT INTO walmart_sales VALUES ('2024-03-15', 100.0, 'chairs', 'Office Chair', 5)")
    conn.commit()
    yield conn
    conn.close()


@pytest.mark.parametrize("raw_sql", QUERIES)
def test_postgres_sql_executes_on_sqlite(sqlite_conn, raw_sql):
    clean_sql = secure_sql(raw_sql, db_dialect="postgres", max_limit=100)
    dialect_sql = SqliteAdapter().generate_dialect_sql(clean_sql)
    sqlite_conn.execute(dialect_sql)  # raises sqlite3.OperationalError if broken
