"""tools/research_toolkit.py — Native LangChain @tool bindings cho web research.

Wraps các hàm web research hiện có thành async LangChain tools
sẵn sàng cho `create_react_agent()`.
"""

import json
import logging
import os
from typing import Any

import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.common.resilience import resilience_pool

logger = logging.getLogger(__name__)

# --- CONSTANTS ---
FIRECRAWL_BASE_URL = os.getenv("FIRECRAWL_API_URL", "http://172.16.210.210:3002").rstrip("/")
SEARCH_ENDPOINT = f"{FIRECRAWL_BASE_URL}/v1/search"
SCRAPE_ENDPOINT = f"{FIRECRAWL_BASE_URL}/v1/scrape"

DEFAULT_SEARCH_TIMEOUT = 30.0
DEFAULT_SCRAPE_TIMEOUT = 60.0
# Natural cap: ReAct recursion_limit=12 → max 6 tool calls per cycle.
# Prompt instructions further limit web calls to 2-3 per explore cycle.
MAX_WEB_CALLS_PER_CYCLE = 3


def _safe_json(result: Any) -> str:
    """Serialize kết quả thành chuỗi JSON an toàn."""
    from datetime import date, datetime
    from decimal import Decimal

    def _default(obj: Any) -> Any:
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, (bytes, bytearray)):
            return obj.decode("utf-8", "replace")
        return str(obj)

    return json.dumps(result, ensure_ascii=False, default=_default)


# NOTE: `config: RunnableConfig` phải khai báo tường minh ở MỌI tool có @traceable.
# @traceable inject một param `config=None` KHÔNG annotation vào wrapper; LangChain
# lọc config khỏi args schema bằng cách so type hint với RunnableConfig, nên param
# không annotation sẽ lọt vào schema với type None → Gemini converter crash
# "1 validation error for Schema / properties.config / model_attributes_type".
# Không xoá dù thân hàm không dùng tới. Xem tests/test_tool_schema_no_config_leak.py
@tool
@observe(name="tool_web_search")
async def web_search(query: str, limit: int = 5, *, config: RunnableConfig = None) -> str:
    """Tìm kiếm nhanh trên web (Google, Bing...), trả về danh sách kết quả.

    CHỈ dùng khi câu hỏi cần thông tin thị trường, thời tiết, hoặc đối thủ cạnh tranh.
    KHÔNG dùng cho câu hỏi có thể trả lời từ dữ liệu nội bộ.
    Giới hạn: tối đa 2-3 lần gọi mỗi chu kỳ phân tích.

    Args:
        query: Từ khóa hoặc câu hỏi cần tìm kiếm.
        limit: Số kết quả tối đa (mặc định 5).
    """
    try:
        headers = {"Content-Type": "application/json"}
        payload = {"query": query, "limit": limit}

        async def _do_web_search():
            async with httpx.AsyncClient(timeout=DEFAULT_SEARCH_TIMEOUT) as client:
                resp = await client.post(SEARCH_ENDPOINT, json=payload, headers=headers)
                resp.raise_for_status()
                return resp.json()

        result = await resilience_pool.execute("http_search", _do_web_search)

        data = result.get("data") or result.get("results") or []
        if not isinstance(data, list):
            data = [data]

        # Trích xuất thông tin cần thiết, giới hạn context window
        results = []
        for item in data[:limit]:
            if not isinstance(item, dict):
                continue
            results.append({
                "title": item.get("title") or "Untitled",
                "url": item.get("url", ""),
                "description": (
                    item.get("description")
                    or (item.get("markdown") or "")[:500]
                ),
            })
        return _safe_json(results)
    except Exception as e:
        logger.exception(f"Web search failed: {e}")
        return _safe_json({"error": f"Web search failed: {e}"})


@tool
@observe(name="tool_web_scrape")
async def web_scrape(url: str, *, config: RunnableConfig = None) -> str:
    """Trích xuất toàn bộ nội dung chính từ một URL cụ thể dưới chuẩn markdown.

    Args:
        url: URL cần scrape nội dung.
    """
    try:
        headers = {"Content-Type": "application/json"}
        payload = {"url": url, "formats": ["markdown"]}

        async def _do_web_scrape():
            async with httpx.AsyncClient(timeout=DEFAULT_SCRAPE_TIMEOUT) as client:
                resp = await client.post(SCRAPE_ENDPOINT, json=payload, headers=headers)
                resp.raise_for_status()
                return resp.json()

        result = await resilience_pool.execute("http_search", _do_web_scrape)

        data = result.get("data") or result
        content = ""
        if isinstance(data, dict):
            content = data.get("markdown") or data.get("content") or str(data)
        elif isinstance(data, str):
            content = data
        else:
            content = str(data)

        # Truncate để giữ context window hợp lý
        content = str(content)[:3000] if content else "No content extracted."
        return _safe_json({"url": url, "content": content})
    except Exception as e:
        logger.exception(f"Web scrape failed: {e}")
        return _safe_json({"error": f"Web scrape failed: {e}"})


@tool
@observe(name="tool_deep_research")
async def deep_research(topic: str, max_depth: int = 2, *, config: RunnableConfig = None) -> str:
    """Nghiên cứu sâu đa vòng: search → extract → analyze → repeat.

    Dùng cho câu hỏi phức tạp cần nhiều nguồn và cross-referencing.
    max_depth=2 cho quick context, max_depth=5 cho phân tích kỹ.

    Args:
        topic: Chủ đề cần nghiên cứu sâu.
        max_depth: Số vòng research tối đa (mặc định 2).
    """
    try:
        # ponytail: subgraph deep_research chưa port (C3/C6) — cờ rõ là chưa khả dụng thay vì import gãy.
        raise NotImplementedError("chờ dbgpt_analyst agent subgraphs.deep_research_graph ở Task C3")
    except Exception as e:
        return _safe_json({"error": f"Deep research failed: {e}"})


def build_research_tools() -> list:
    """Trả về danh sách research tools sẵn sàng cho create_react_agent()."""
    # deep_research chua port (Task C3) - khong dang ky tool luon fail cho supervisor.
    return [web_search, web_scrape]
