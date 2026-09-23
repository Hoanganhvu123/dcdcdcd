"""Connection hygiene for the schema-exploration tools.

These tools run against a customer warehouse over a SQLAlchemy ``raw_connection()``,
which is not autocommit. Every statement therefore opens a transaction, and the
call sites used to leak both the cursor and that transaction:

* on Postgres a failed statement poisons the connection — every later query on it
  fails with "current transaction is aborted" — and the model writes bad SQL
  routinely, so one typo killed the rest of the session;
* a successful read left the connection idle-in-transaction while pooled.

The SQL the model authors is also unbounded in cost, so it needs a deadline.
"""

import pytest

from dbgpt_analyst.domains.analysis.explore_tools import (
    DEFAULT_STATEMENT_TIMEOUT_MS,
    _tool_list_tables,
    _tool_profile_column,
    _tool_run_sql,
    _tool_sample_rows,
)


class FakeCursor:
    def __init__(self, conn, fail_on=None):
        self._conn = conn
        self._fail_on = fail_on
        self.closed = False
        self.description = [("a",)]

    def execute(self, sql, params=None):
        self._conn.statements.append((sql, params))
        if self._fail_on and self._fail_on in sql:
            raise RuntimeError("syntax error at or near ...")

    def fetchall(self):
        return [("x",)]

    fetchone = lambda self: ("x",)  # noqa: E731

    def fetchmany(self, n):
        return [("x",)]

    def close(self):
        self.closed = True


class FakeConn:
    """Records what a real driver would care about: closes and transaction state."""

    def __init__(self, fail_on=None):
        self.statements = []
        self.cursors = []
        self.rollbacks = 0
        self._fail_on = fail_on

    def cursor(self):
        c = FakeCursor(self, self._fail_on)
        self.cursors.append(c)
        return c

    def rollback(self):
        self.rollbacks += 1


def test_cursor_is_closed_on_success():
    conn = FakeConn()
    _tool_list_tables(conn, "postgres")
    assert [c.closed for c in conn.cursors] == [True]


def test_cursor_is_closed_when_the_query_fails():
    conn = FakeConn(fail_on="SELECT")
    with pytest.raises(RuntimeError):
        _tool_run_sql(conn, "SELECT 1", db_type="postgres")
    assert [c.closed for c in conn.cursors] == [True]


def test_failed_query_does_not_leave_a_poisoned_transaction():
    """Without the rollback, every later query on this connection dies too."""
    conn = FakeConn(fail_on="SELECT")
    with pytest.raises(RuntimeError):
        _tool_run_sql(conn, "SELECT bad syntax", db_type="postgres")
    assert conn.rollbacks == 1


def test_successful_read_does_not_stay_idle_in_transaction():
    conn = FakeConn()
    _tool_run_sql(conn, "SELECT 1", db_type="postgres")
    assert conn.rollbacks == 1


def test_model_authored_sql_gets_a_postgres_deadline():
    conn = FakeConn()
    _tool_run_sql(conn, "SELECT 1", db_type="postgres")
    assert ("SET LOCAL statement_timeout = %s", (DEFAULT_STATEMENT_TIMEOUT_MS,)) in conn.statements


def test_model_authored_sql_gets_a_mysql_deadline():
    conn = FakeConn()
    _tool_run_sql(conn, "SELECT 1", db_type="mysql")
    assert ("SET SESSION MAX_EXECUTION_TIME = %s", (DEFAULT_STATEMENT_TIMEOUT_MS,)) in conn.statements


def test_engine_without_a_deadline_still_runs_the_query():
    """SQLite has no statement timeout; refusing to run there would be worse."""
    conn = FakeConn(fail_on="statement_timeout")
    assert _tool_run_sql(conn, "SELECT 1", db_type="sqlite") == [{"a": "x"}]


def test_a_rejected_timeout_setting_does_not_fail_the_query():
    conn = FakeConn(fail_on="SET LOCAL")
    assert _tool_run_sql(conn, "SELECT 1", db_type="postgres") == [{"a": "x"}]


def test_write_rejection_still_precedes_any_connection_use():
    conn = FakeConn()
    assert _tool_run_sql(conn, "DROP TABLE users", db_type="postgres") == [
        {"error": "Write operations are not allowed."}
    ]
    assert conn.cursors == []


@pytest.mark.parametrize(
    "call",
    [
        lambda conn: _tool_sample_rows(conn, "t", db_type="postgres"),
        lambda conn: _tool_profile_column(conn, "t", "c", db_type="postgres"),
    ],
)
def test_unbounded_introspection_queries_are_also_deadlined(call):
    """A COUNT(DISTINCT) over a warehouse table is as unbounded as arbitrary SQL."""
    conn = FakeConn()
    call(conn)
    assert ("SET LOCAL statement_timeout = %s", (DEFAULT_STATEMENT_TIMEOUT_MS,)) in conn.statements
    assert conn.rollbacks == 1
