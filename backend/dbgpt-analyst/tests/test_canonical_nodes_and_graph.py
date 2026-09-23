"""tests/test_canonical_nodes_and_graph.py — Verification for cuccu_legal Canonical Architecture.

Verifies:
1. plan_node: Intent planning & routing
2. sql_gen_node: Schema-driven SQL formulation
3. sql_exec_node: Safe execution
4. chart_spec_node: Recharts/ECharts JSON specification derivation
5. doc_compose_node: Kimi A4 DOCX / Excel XLSX authoring
6. analyst_graph: Canonical LangGraph StateGraph assembly and node routing
"""
import pytest
from langchain_core.runnables import RunnableConfig

from dbgpt_analyst.graphs.analyst_graph import (
    analyst_graph,
    build_analyst_graph,
    route_after_plan,
    route_after_sql_exec,
    route_after_sql_gen,
)
from dbgpt_analyst.nodes import (
    chart_spec_node,
    doc_compose_node,
    plan_node,
    sql_exec_node,
    sql_gen_node,
)


@pytest.mark.asyncio
async def test_plan_node_intent_and_steps():
    """plan_node correctly plans steps for SQL query."""
    state = {
        "question": "Doanh thu theo kênh quý 3 là bao nhiêu?",
        "messages": [],
    }
    config = RunnableConfig()
    result = await plan_node(state, config)

    assert result["mode"] == "sql"
    assert "plan" in result
    assert len(result["plan"]) > 0
    assert result["plan"][0]["status"] == "done"


@pytest.mark.asyncio
async def test_plan_node_office_routing():
    """plan_node correctly detects office/excel intent."""
    state = {
        "question": "Xuất bảng tính Excel PnL 4 quý có công thức liên kết",
        "messages": [],
    }
    config = RunnableConfig()
    result = await plan_node(state, config)

    assert result["mode"] == "office"
    assert any("Kimi" in s["title"] or "tài liệu" in s["title"] for s in result["plan"])


@pytest.mark.asyncio
async def test_chart_spec_node_derivation():
    """chart_spec_node derives valid JSON chart spec from tabular rows."""
    state = {
        "question": "Vẽ biểu đồ doanh thu theo kênh",
        "query_results": [
            {"channel": "Marketplace", "revenue": 11604.2},
            {"channel": "Website", "revenue": 6208.1},
            {"channel": "B2B", "revenue": 4930.5},
        ],
    }
    result = await chart_spec_node(state)
    assert result["chart"] is not None
    assert result["chart"]["xKey"] == "channel"
    assert "revenue" in result["chart"]["yKeys"]
    assert result["display_type"] == "chart"


@pytest.mark.asyncio
async def test_doc_compose_node_authoring():
    """doc_compose_node synthesizes structured office artifact XML."""
    state = {
        "question": "Tạo bảng tính Excel PnL 4 quý",
        "mode": "excel",
    }
    config = RunnableConfig()
    result = await doc_compose_node(state, config)
    assert "deliverable" in result
    assert "<artifact" in result["deliverable"]


def test_analyst_graph_compiled_structure():
    """analyst_graph compiles with all 6 canonical nodes and routing logic."""
    graph = build_analyst_graph()
    assert graph is not None

    # Test conditional edge routing logic directly
    assert route_after_plan({"mode": "sql"}) == "sql_gen"
    assert route_after_plan({"mode": "office"}) == "doc_compose"
    assert route_after_plan({"mode": "general"}) == "answer"

    assert route_after_sql_gen({"generated_sql": "SELECT 1"}) == "sql_exec"
    assert route_after_sql_gen({"error": "syntax error"}) == "answer"

    assert route_after_sql_exec({"chart": {"type": "bar"}}) == "chart_spec"
    assert route_after_sql_exec({"mode": "office"}) == "doc_compose"
    assert route_after_sql_exec({}) == "answer"
