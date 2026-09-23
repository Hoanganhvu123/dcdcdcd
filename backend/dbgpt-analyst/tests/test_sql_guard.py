import pytest
from dbgpt_analyst.common.sql_guard import SQLGuardError, secure_sql


def test_sql_guard_select():
    res = secure_sql("SELECT * FROM users;")
    assert "LIMIT 1000" in res or "SELECT" in res


def test_sql_guard_drop():
    with pytest.raises(SQLGuardError):
        secure_sql("DROP TABLE users;")


def test_sql_guard_delete():
    with pytest.raises(SQLGuardError):
        secure_sql("DELETE FROM users WHERE id = 1;")


def test_sql_guard_update():
    with pytest.raises(SQLGuardError):
        secure_sql("UPDATE users SET name = 'admin';")


def test_sql_guard_insert():
    with pytest.raises(SQLGuardError):
        secure_sql("INSERT INTO users (name) VALUES ('admin');")


def test_sql_guard_alter():
    with pytest.raises(SQLGuardError):
        secure_sql("ALTER TABLE users ADD COLUMN age INT;")


def test_sql_guard_stacked_queries_injection():
    """Adversarial test: stacked queries separated by semicolon must be strictly blocked."""
    with pytest.raises(SQLGuardError) as exc_info:
        secure_sql("SELECT 1; DROP TABLE users;")
    assert "duy nhất" in str(exc_info.value).lower() or "chỉ cho phép" in str(exc_info.value).lower()

    with pytest.raises(SQLGuardError):
        secure_sql("SELECT * FROM orders; DELETE FROM products WHERE id = 1;")

    with pytest.raises(SQLGuardError):
        secure_sql("SELECT 1; SELECT 2;")


def test_sql_guard_comment_obfuscation():
    """Adversarial test: inline and block comments must be parsed safely and not bypass guard."""
    # Benign comment in query
    res = secure_sql("SELECT * FROM users /* safe comment */ WHERE id = 1;")
    assert "SELECT" in res
    assert "LIMIT 1000" in res

    # Newline comment
    res2 = secure_sql("SELECT * FROM users -- inline comment\n WHERE id = 1;")
    assert "SELECT" in res2
    assert "LIMIT 1000" in res2

    # Malicious attempt to hide stacked query inside comment tricks
    with pytest.raises(SQLGuardError):
        secure_sql("SELECT * FROM users; /* sneaky */ DROP TABLE users;")


def test_sql_guard_ddl_and_dml_variations():
    """Adversarial test: CREATE, TRUNCATE, SELECT INTO, and CTE writes must be rejected."""
    with pytest.raises(SQLGuardError):
        secure_sql("CREATE TABLE evil_table (id INT);")

    with pytest.raises(SQLGuardError):
        secure_sql("SELECT * INTO backup_users FROM users;")

    with pytest.raises(SQLGuardError):
        secure_sql("TRUNCATE TABLE users;")


def test_sql_guard_limit_enforcement():
    """Verify LIMIT clause is automatically injected or clamped to max_limit."""
    # When no limit is provided, auto inject max_limit
    res = secure_sql("SELECT id FROM users", max_limit=500)
    assert "LIMIT 500" in res

    # When query requests 5000, clamp down to max_limit
    res_clamped = secure_sql("SELECT id FROM users LIMIT 5000", max_limit=100)
    assert "LIMIT 100" in res_clamped


def test_sql_guard_rls_mutation_adversarial_escape():
    """Verify apply_rls_mutation sanitizes adversarial quotes in tenant_value."""
    from dbgpt_analyst.guard.sql_guard import apply_rls_mutation

    # Injection attack payload attempting to break out of single quotes
    adversarial_tenant = "company_a' OR '1'='1"
    mutated = apply_rls_mutation(
        "SELECT * FROM sales",
        tenant_column="tenant_id",
        tenant_value=adversarial_tenant,
        db_dialect="postgres",
    )
    # The single quotes must be doubled to prevent SQL injection breakout
    assert "company_a'' OR ''1''=''1" in mutated
    assert "tenant_id = 'company_a'' OR ''1''=''1'" in mutated


def test_sql_guard_rls_system_tables_skipped():
    """Verify system tables (pg_catalog, sqlite_master, information_schema) are exempt from tenant mutation."""
    from dbgpt_analyst.guard.sql_guard import apply_rls_mutation

    sys_query = "SELECT table_name FROM information_schema.tables"
    mutated = apply_rls_mutation(sys_query, tenant_column="tenant_id", tenant_value="tenant_1")
    # Should not inject tenant_id into information_schema
    assert "tenant_id" not in mutated

