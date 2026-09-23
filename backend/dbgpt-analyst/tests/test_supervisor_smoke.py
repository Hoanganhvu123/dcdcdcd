import sqlite3
import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from dbgpt_analyst.main_agent import build_main_graph
from dbgpt_analyst.core.state import MainAgentState
from dbgpt_analyst.nodes.execution import node_execute_sql


@pytest.mark.asyncio
async def test_supervisor_graph_build():
    model = FakeMessagesListChatModel(responses=[AIMessage(content="ok")])
    graph = await build_main_graph(model=model)
    assert graph is not None
    assert graph.name == "ai_data_analytic_supervisor"


@pytest.mark.asyncio
async def test_supervisor_smoke_sqlite_execution(tmp_path):
    db_file = tmp_path / "sample.db"
    conn = sqlite3.connect(str(db_file))
    cur = conn.cursor()
    cur.execute("CREATE TABLE sales (id INT, product TEXT, revenue REAL);")
    cur.execute("INSERT INTO sales VALUES (1, 'Widget', 100.5), (2, 'Gadget', 250.0);")
    conn.commit()
    conn.close()

    raw_conn = sqlite3.connect(str(db_file))
    state: MainAgentState = {
        "question": "Show all sales",
        "generated_sql": "SELECT product, revenue FROM sales ORDER BY id;",
        "source_ids": [],
        "anchor_table": "sales",
        "selected_tables": ["sales"],
        "allowed_tables": ["sales"],
        "schemas_text": "sales(id, product, revenue)",
        "map_qualified": {},
        "db_type": "sqlite",
        "query_results": [],
        "error": None,
        "retry_count": 0,
        "answer": None,
        "chart": None,
        "display_type": None,
        "session_history": None,
        "golden_sqls": None,
        "business_docs": None,
        "steps": [],
        "plan_steps": None,
        "query_type": "sql",
        "db_conn": raw_conn,
    }

    res = await node_execute_sql(state)
    assert res.get("query_results") is not None
    assert len(res["query_results"]) == 2
    assert res["query_results"][0]["product"] == "Widget"
    assert res["query_results"][0]["revenue"] == 100.5
