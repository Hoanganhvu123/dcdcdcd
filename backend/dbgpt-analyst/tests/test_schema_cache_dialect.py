"""Regression test cho bug: _uncached_resolve_table_source() hardcode SQL
Postgres-style (placeholder %s, LIKE pattern %%), nhưng metadata DB đích có
thể là sqlite (dev/test). sqlite3 dùng placeholder "?" và KHÔNG %-substitute
chuỗi SQL, nên token "%s"/"%%" literal gây lỗi 'near "%": syntax error'
(log: "Error resolving table source for 'walmart_sales': near '%': syntax error").
"""

import sqlite3

from dbgpt_analyst.libs.bi import schema_cache


def _make_sqlite_conn():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE datasource_schema_cache (source_id INTEGER, table_name TEXT)"
    )
    conn.execute(
        "CREATE TABLE excel_db_connections (id INTEGER, name TEXT, db_type TEXT, connection_string TEXT)"
    )
    conn.execute("INSERT INTO datasource_schema_cache VALUES (1, 'walmart_sales')")
    conn.execute("INSERT INTO excel_db_connections VALUES (1, 'Local DB', 'sqlite', 'sqlite:///test.db')")
    conn.commit()
    return conn


def test_resolve_table_source_on_sqlite_exact_match(monkeypatch):
    conn = _make_sqlite_conn()
    monkeypatch.setattr(schema_cache, "get_active_connection", lambda: (conn, "sqlite"))

    result = schema_cache._uncached_resolve_table_source("walmart_sales")

    assert result is not None
    assert result["raw_table"] == "walmart_sales"
    assert result["db_type"] == "sqlite"
    assert result["source_name"] == "Local DB"


def test_resolve_table_source_on_sqlite_fallback_like(monkeypatch):
    conn = _make_sqlite_conn()
    monkeypatch.setattr(schema_cache, "get_active_connection", lambda: (conn, "sqlite"))

    # Không khớp exact -> rơi vào nhánh LIKE fallback (trước đây dùng %% -> lỗi sqlite).
    result = schema_cache._uncached_resolve_table_source("prefix_walmart_sales_suffix")

    assert result is not None
    assert result["raw_table"] == "walmart_sales"


def test_resolve_table_source_on_sqlite_not_found_returns_none(monkeypatch):
    conn = _make_sqlite_conn()
    monkeypatch.setattr(schema_cache, "get_active_connection", lambda: (conn, "sqlite"))

    result = schema_cache._uncached_resolve_table_source("no_such_table")

    assert result is None
