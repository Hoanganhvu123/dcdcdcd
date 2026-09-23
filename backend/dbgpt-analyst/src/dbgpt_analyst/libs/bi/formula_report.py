"""libs/bi/formula_report.py — Engine biên dịch "formula-first report".

Tách khỏi `api/bi_platform/dataset_router.py` (task #31). Đây là phần chạy SQL
cục bộ để thay các thẻ <formula>/<formula-table>/<formula-chart> bằng giá trị/
bảng/biểu đồ thật — KHÔNG gửi dữ liệu thật cho LLM.

Chứa: lấy mô tả schema cho LLM, format giá trị, resolve {{query:...}},
compile bảng, compile biểu đồ (sinh Chart.js).
"""
import json
import logging
import os
import re
from typing import Any

from dbgpt_analyst.common.db import get_db_connection

logger = logging.getLogger(__name__)


def get_tables_schema_desc(table_names: list[str]) -> str:
    """Fetch schemas of selected tables to send to the LLM (no data records)"""
    schema_desc = []
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        for table in table_names:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=%s", (table,))
            if not cursor.fetchone():
                continue

            cursor.execute(
                "SELECT column_name, description FROM excel_column_definitions WHERE table_name = %s OR table_name = %s",
                (table, table.replace("excel_", "")),
            )
            col_definitions = {row[0]: row[1] for row in cursor.fetchall()}

            cursor.execute(f"PRAGMA table_info({table})")
            columns_info = cursor.fetchall()

            table_desc = [f"Bảng: {table}"]
            for col in columns_info:
                col_name = col[1]
                col_type = col[2]
                desc = col_definitions.get(col_name, "Không có mô tả")
                table_desc.append(f"  - Cột: {col_name} ({col_type}) - Mô tả: {desc}")
            schema_desc.append("\n".join(table_desc))
        conn.close()
    except Exception as e:
        logger.error(f"Error getting schema description for report templates: {e}")
    return "\n\n".join(schema_desc)


def format_value(val: Any, fmt: str) -> str:
    """Format single database value based on formula format requirements"""
    if val is None:
        return "0"
    try:
        val_float = float(val)
        if fmt == "money":
            if val_float >= 1000:
                return f"{val_float:,.0f} đ".replace(",", ".")
            return f"{val_float:,.2f} đ".replace(",", ".")
        if fmt == "number":
            if val_float.is_integer():
                return f"{int(val_float):,}".replace(",", ".")
            return f"{val_float:,.2f}".replace(",", ".")
        if fmt == "percent":
            return f"{val_float:.1f}%"
    except (ValueError, TypeError):
        pass
    return str(val)


def resolve_named_queries(sql: str, conn: Any) -> str:
    """Resolve {{query: name}} syntax into actual SQL query strings"""
    if not sql or "{{query:" not in sql:
        return sql

    try:
        cursor = conn.cursor()
        matches = re.finditer(r"\{\{query:\s*([^}]+)\s*\}\}", sql)
        matches_list = list(matches)
        matches_list.reverse()

        for match in matches_list:
            name = match.group(1).strip()
            cursor.execute("SELECT sql_query FROM named_queries WHERE name = %s", (name,))
            row = cursor.fetchone()
            if row:
                replacement = row[0]
                if sql.strip() == match.group(0):
                    sql = replacement
                else:
                    sql = sql[:match.start()] + f"({replacement})" + sql[match.end():]
        return sql
    except Exception as e:
        logger.error(f"Error resolving named queries: {e}")
        return sql


def compile_table(sql: str, headers_attr: str, conn: Any) -> str:
    """Thực thi SQL và trả về HTML của bảng dữ liệu."""
    try:
        sql = resolve_named_queries(sql, conn)
        cursor = conn.cursor()
        cursor.execute(sql)
        rows = cursor.fetchall()
        col_names = [desc[0] for desc in cursor.description]

        headers = []
        if headers_attr:
            headers = [h.strip() for h in headers_attr.split(",")]

        if len(headers) < len(col_names):
            headers.extend(col_names[len(headers):])

        thead = "".join(f"<th>{h}</th>" for h in headers)

        tbody_rows = []
        for idx, r in enumerate(rows):
            row_class = (
                " class='trow-total'"
                if idx == len(rows) - 1 and any("tổng" in str(x).lower() or "total" in str(x).lower() for x in r)
                else ""
            )
            cells = []
            for cell_val in r:
                if isinstance(cell_val, (int, float)):
                    if cell_val >= 1000:
                        formatted = f"{cell_val:,.0f}".replace(",", ".")
                    else:
                        formatted = str(cell_val)
                else:
                    formatted = str(cell_val)
                cells.append(f"<td>{formatted}</td>")
            tbody_rows.append(f"<tr{row_class}>" + "".join(cells) + "</tr>")

        tbody = "\n".join(tbody_rows)

        table_html = f"""
        <div class="tbl-wrap">
          <table>
            <thead>
              <tr>{thead}</tr>
            </thead>
            <tbody>
              {tbody}
            </tbody>
          </table>
        </div>
        """
        return table_html
    except Exception as e:
        logger.error(f"Error compiling table: {e}")
        return f"<div class='note warn'><p><strong>Lỗi SQL Table:</strong> {e!s}</p><pre>{sql}</pre></div>"


def compile_chart(chart_node, conn) -> tuple[str, str]:
    """Execute SQL query and return (chart_html, chart_js_initializer)"""
    chart_id = f"c-chart-{os.urandom(4).hex()}"
    chart_type = chart_node.get("type", "bar")
    x_axis = chart_node.get("x-axis")
    y_axis = chart_node.get("y-axis")
    title = chart_node.get("title", "Biểu đồ phân tích")
    sql = chart_node.get("sql", "")

    if not sql:
        return f"<div class='note warn'><p>SQL query is empty for chart '{title}'</p></div>", ""

    try:
        sql = resolve_named_queries(sql, conn)
        cursor = conn.cursor()
        cursor.execute(sql)
        rows = cursor.fetchall()
        col_names = [desc[0] for desc in cursor.description]

        try:
            x_idx = col_names.index(x_axis) if x_axis in col_names else 0
            y_idx = col_names.index(y_axis) if y_axis in col_names else (1 if len(col_names) > 1 else 0)
        except Exception:
            x_idx = 0
            y_idx = 1 if len(col_names) > 1 else 0

        labels = []
        data = []
        for r in rows:
            labels.append(str(r[x_idx]))
            try:
                data.append(float(r[y_idx]))
            except (ValueError, TypeError):
                data.append(0)

        labels_json = json.dumps(labels, ensure_ascii=False)
        data_json = json.dumps(data)

        bg_color = "#1A4A8C"
        if chart_type in ("pie", "doughnut"):
            bg_colors = ["#1A4A8C", "#C8860A", "#0D6E4F", "#7C3AED", "#B91C1C", "#0891B2"]
            bg_color_js = json.dumps([bg_colors[i % len(bg_colors)] for i in range(len(data))])
        else:
            bg_color_js = f"'{bg_color}'"

        if chart_type in ("doughnut", "pie"):
            js_script = f"""
            new Chart("{chart_id}", {{
              type: "doughnut",
              data: {{
                labels: {labels_json},
                datasets: [{{
                  data: {data_json},
                  backgroundColor: {bg_color_js},
                  borderWidth: 2,
                  borderColor: "#fff"
                }}]
              }},
              options: {{
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {{
                  legend: {{ display: true, position: "bottom", labels: {{ font: F }} }},
                  tooltip: TIP
                }}
              }}
            }});
            """
        elif chart_type == "line":
            js_script = f"""
            new Chart("{chart_id}", {{
              type: "line",
              data: {{
                labels: {labels_json},
                datasets: [{{
                  label: "{title}",
                  data: {data_json},
                  borderColor: "{bg_color}",
                  tension: 0.4,
                  pointRadius: 3.5,
                  fill: true,
                  backgroundColor: "rgba(26, 74, 140, 0.1)"
                }}]
              }},
              options: {{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {{
                  legend: {{ display: false }},
                  tooltip: TIP
                }},
                scales: {{
                  x: AXX,
                  y: AX()
                }}
              }}
            }});
            """
        else:  # Bar
            js_script = f"""
            new Chart("{chart_id}", {{
              type: "bar",
              data: {{
                labels: {labels_json},
                datasets: [{{
                  label: "{title}",
                  data: {data_json},
                  backgroundColor: {bg_color_js},
                  borderRadius: 4,
                  borderSkipped: false
                }}]
              }},
              options: {{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {{
                  legend: {{ display: false }},
                  tooltip: TIP
                }},
                scales: {{
                  x: AXX,
                  y: AX()
                }}
              }}
            }});
            """

        html_wrapper = f"""
        <div class="fig">
          <div class="fig-header">
            <span class="fig-num">Biểu đồ</span>
            <span class="fig-title">{title}</span>
          </div>
          <div class="fig-wrap"><canvas id="{chart_id}" height="175"></canvas></div>
          <div class="fig-cap"><strong>Nguồn:</strong> Dữ liệu từ SQLite nội bộ.</div>
        </div>
        """
        return html_wrapper, js_script

    except Exception as e:
        logger.error(f"Error compiling chart: {e}")
        return f"<div class='note warn'><p><strong>Lỗi SQL Chart:</strong> {e!s}</p><pre>{sql}</pre></div>", ""
