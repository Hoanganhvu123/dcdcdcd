import asyncio
import os
import sys
import dotenv

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
dotenv.load_dotenv()
os.environ["DEFAULT_MODEL"] = "google_genai/gemini-2.5-flash"

from dbgpt_analyst.common.llm_factory import preferred_model_name, create_llm
from dbgpt_analyst.main_agent import build_main_graph

print("Preferred model:", preferred_model_name())

async def main():
    graph = await build_main_graph()
    print("Graph built successfully:", type(graph))
    
    state = {
        "question": "Thống kê tổng doanh thu Weekly_Sales theo từng Store và trực quan hóa biểu đồ cột so sánh",
        "anchor_table": "walmart_sales",
        "allowed_tables": ["walmart_sales"],
        "selected_tables": ["walmart_sales"],
        "source_ids": [],
        "session_id": "test-session-123",
        "messages": [],
    }
    
    from langchain_core.messages import HumanMessage
    state["messages"] = [HumanMessage(content=state["question"])]
    
    print("Streaming graph execution...")
    config = {"configurable": {"thread_id": "test-session-123"}}
    async for kind, payload in graph.astream(state, stream_mode=["messages", "updates", "custom"], config=config):
        if kind == "custom":
            name = payload.get("name")
            print(f"[CUSTOM] {name}: {str(payload.get('data'))[:120]}")
        elif kind == "updates":
            for node, upd in payload.items():
                print(f"[NODE {node}]: keys={list(upd.keys()) if isinstance(upd, dict) else type(upd)}")
                if isinstance(upd, dict):
                    if upd.get("generated_sql"):
                        print(f"  -> Generated SQL: {upd['generated_sql']}")
                    if upd.get("query_results"):
                        print(f"  -> Rows returned: {len(upd['query_results'])}")
                    if upd.get("chart"):
                        print(f"  -> Chart: {upd['chart']}")
        elif kind == "messages":
            msg, _ = payload
            content = getattr(msg, "content", "")
            tc = getattr(msg, "tool_calls", None)
            if tc:
                print(f"[TOOL_CALLS]: {tc}")
            elif content and len(str(content)) < 200:
                print(f"[MSG]: {str(content)[:100]}")

if __name__ == "__main__":
    asyncio.run(main())
