import sqlglot
from sqlglot import exp


class SQLGuardError(Exception):
    pass

def secure_sql(sql: str, db_dialect: str = "postgres", max_limit: int = 1000) -> str:
    """
    Sử dụng sqlglot để phân tích AST của câu lệnh SQL.
    - Chặn các câu lệnh DML (INSERT, UPDATE, DELETE) và DDL (DROP, CREATE, ALTER).
    - Chỉ cho phép SELECT.
    - Tự động áp dụng hoặc giới hạn LIMIT.
    """
    try:
        # Parse SQL thành cây AST
        parsed = sqlglot.parse(sql, read=db_dialect)
    except sqlglot.errors.ParseError as e:
        raise SQLGuardError(f"Lỗi cú pháp SQL: {e!s}")

    if not parsed:
        raise SQLGuardError("Câu lệnh SQL trống.")

    # Superset pattern: Check if multiple statements are passed
    if len(parsed) > 1:
        raise SQLGuardError("Chỉ cho phép chạy một câu lệnh SQL duy nhất.")

    statement = parsed[0]

    # Check for SELECT INTO writes
    if any(node.args.get("into") is not None for node in statement.find_all(exp.Select)):
        raise SQLGuardError("Cấm thực thi lệnh thay đổi dữ liệu (SELECT INTO).")

    # Traverse the entire AST tree to check for any DML or DDL nodes (such as exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Alter)
    for node in statement.walk():
        if isinstance(node, (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Alter)):
            raise SQLGuardError(f"Cấm thực thi lệnh thay đổi dữ liệu. Phát hiện lệnh: {node.__class__.__name__}")

    # Kiểm tra loại câu lệnh: chỉ cho phép các dạng truy vấn đọc dữ liệu.
    # exp.Select không bao gồm UNION/EXCEPT/INTERSECT (sqlglot biểu diễn chúng
    # là node exp.Union/Except/Intersect riêng, không kế thừa exp.Select) — dùng
    # exp.Query (lớp cha chung cho mọi dạng SELECT hợp lệ) thay vì exp.Select để
    # câu SQL UNION ALL hợp lệ không bị chặn nhầm thành "lệnh thay đổi dữ liệu".
    # exp.Insert/Update/Delete/Drop/Alter đều không phải exp.Query nên vẫn bị chặn.
    if not isinstance(statement, exp.Query):
        raise SQLGuardError(f"Cấm thực thi lệnh thay đổi dữ liệu. Chỉ cho phép lệnh SELECT. Bắt được lệnh: {statement.__class__.__name__}")

    # Áp dụng hoặc kiểm tra LIMIT
    limit_exp = statement.args.get("limit")
    if limit_exp:
        # Nếu đã có LIMIT, kiểm tra xem nó có vượt max_limit không
        try:
            current_limit = int(limit_exp.expression.name)
            if current_limit > max_limit:
                statement.set("limit", exp.Limit(expression=exp.Literal.number(max_limit)))
        except (ValueError, TypeError):
            # Nếu limit là biểu thức phức tạp, an toàn nhất là đè nó bằng max_limit
            statement.set("limit", exp.Limit(expression=exp.Literal.number(max_limit)))
    else:
        # Nếu chưa có LIMIT, tự động thêm vào
        statement.set("limit", exp.Limit(expression=exp.Literal.number(max_limit)))

    # Generate lại SQL an toàn
    safe_sql = statement.sql(dialect=db_dialect)
    return safe_sql

def _normalize_identifier(node) -> str:
    if not node:
        return ""
    if isinstance(node, exp.Identifier):
        return node.this if node.args.get("quoted") else node.this.lower()
    return str(node).lower()


def apply_rls_mutation(sql: str, tenant_column: str, tenant_value: str, db_dialect: str = "postgres") -> str:
    """
    Tinh hoa Row Level Security (RLS) của Superset.
    Tự động ép điều kiện phân quyền (VD: WHERE tenant_id = 'A') vào mọi câu lệnh SELECT.
    Ngăn chặn việc User lén truy cập dữ liệu của tenant khác.
    """
    try:
        parsed = sqlglot.parse(sql, read=db_dialect)
    except sqlglot.errors.ParseError as e:
        raise SQLGuardError(f"Lỗi cú pháp SQL khi áp dụng RLS: {e!s}")

    if not parsed or not isinstance(parsed[0], exp.Query):
        return sql

    statement = parsed[0]

    # Thu thập tất cả tên CTE để bỏ qua không mutate chúng
    cte_names = {cte.alias_or_name.lower() for cte in statement.find_all(exp.CTE) if cte.alias_or_name}

    # Tìm tất cả exp.Table nodes.
    # Thu thập trước thành list để tránh thay đổi AST khi đang iterate.
    tables = list(statement.find_all(exp.Table))

    for table in tables:
        name_lower = table.name.lower() if table.name else ""

        # Check if this table node refers to a CTE
        is_cte = False
        if table.args.get("db") is None:
            table_identifier = table.args.get("this")
            normalized_table = _normalize_identifier(table_identifier)
            parent = table.parent
            while parent:
                if isinstance(parent, exp.CTE):
                    parent_alias = parent.args.get("alias").this if parent.args.get("alias") else None
                    if _normalize_identifier(parent_alias) == normalized_table:
                        is_cte = False
                        break
                with_node = parent.args.get("with_")
                if with_node and isinstance(with_node, exp.With):
                    for cte in with_node.expressions:
                        cte_alias = cte.args.get("alias").this if cte.args.get("alias") else None
                        if _normalize_identifier(cte_alias) == normalized_table:
                            is_cte = True
                            break
                    if is_cte:
                        break
                parent = parent.parent

        if is_cte:
            continue

        # Skip system tables
        db_lower = table.db.lower() if table.db else ""
        if name_lower.startswith(("pg_", "sqlite_", "sql_")) or db_lower.startswith(("pg_", "sqlite_", "sql_")) or db_lower in ("information_schema", "pg_catalog"):
            continue

        # Lấy alias của table. Nếu không có alias, dùng chính tên table làm alias
        alias_name = table.alias_or_name

        # Tạo copy của table node và xoá alias của nó đi để khi gen SQL phụ
        # không bị lặp lại alias (VD: SELECT * FROM sales AS s -> SELECT * FROM sales)
        table_without_alias = table.copy()
        table_without_alias.set("alias", None)
        table_sql = table_without_alias.sql(dialect=db_dialect)

        # Avoid SQL injection from tenant_value
        safe_tenant_value = tenant_value.replace("'", "''")

        # Wrap trong subquery có filter RLS
        subquery_sql = f"(SELECT * FROM {table_sql} WHERE {tenant_column} = '{safe_tenant_value}')"
        subquery_node = sqlglot.parse_one(subquery_sql, read=db_dialect)

        # Set lại alias gốc cho subquery
        aliased_subquery = subquery_node.as_(alias_name)

        # Thay thế table node cũ trong AST bằng subquery mới
        table.replace(aliased_subquery)

    return statement.sql(dialect=db_dialect)