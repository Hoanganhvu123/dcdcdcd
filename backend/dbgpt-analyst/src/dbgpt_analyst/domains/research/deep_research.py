"""
deep_research.py — Multi-depth research engine ported from open-deep-research.

Core loop: search → extract → analyze → gap check → repeat until done.
Streams activity events for real-time UI updates.

Reference: github.com/nickscamara/open-deep-research (route.ts:312-667)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import json
import logging
from typing import Any

import httpx

from dbgpt_analyst.common.llm_factory import preferred_model_name
from dbgpt_analyst.common.resilience import resilience_pool

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Types
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ResearchFinding:
    """A single piece of extracted information with its source."""
    text: str
    source: str


@dataclass
class ResearchSource:
    """A web source discovered during research."""
    url: str
    title: str
    description: str


@dataclass
class ActivityEvent:
    """Real-time activity event streamed to the frontend."""
    type: str          # search | extract | analyze | reasoning | synthesis | thought
    status: str        # pending | complete | error
    message: str
    depth: int
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    completed_steps: int = 0
    total_steps: int = 0


@dataclass
class ResearchResult:
    """Final output of deep research."""
    success: bool
    findings: list[ResearchFinding]
    sources: list[ResearchSource]
    analysis: str
    activities: list[ActivityEvent]
    completed_steps: int
    total_steps: int
    error: str | None = None


# ═══════════════════════════════════════════════════════════════════════════
# Firecrawl Client (async, lightweight)
# ═══════════════════════════════════════════════════════════════════════════

class FirecrawlClient:
    """Async Firecrawl API client for search + extract + scrape."""

    def __init__(self, api_key: str, api_url: str | None = None):
        self.api_key = api_key.strip()
        self.base_url = (api_url or "https://api.firecrawl.dev").rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def search(self, query: str, limit: int = 5, timeout: float = 25.0) -> list[dict]:
        """Search the web. Returns list of {url, title, description, markdown}."""
        async def _do_search():
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/v1/search",
                    json={"query": query, "limit": limit, "scrapeOptions": {"formats": ["markdown"]}},
                    headers=self.headers,
                )
                resp.raise_for_status()
                return resp.json()

        result = await resilience_pool.execute("http_search", _do_search)

        if isinstance(result, dict) and not result.get("success", True):
            raise RuntimeError(result.get("error", "Search failed"))

        return result.get("data") or result.get("results") or []

    async def extract(self, urls: list[str], prompt: str, timeout: float = 30.0) -> list[dict]:
        """Extract structured data from URLs."""
        async def _do_extract():
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/v1/extract",
                    json={"urls": urls, "prompt": prompt},
                    headers=self.headers,
                )
                resp.raise_for_status()
                return resp.json()

        result = await resilience_pool.execute("http_search", _do_extract)

        if isinstance(result, dict) and not result.get("success", True):
            raise RuntimeError(result.get("error", "Extract failed"))

        data = result.get("data", [])
        if isinstance(data, list):
            return data
        return [data] if data else []

    async def scrape(self, url: str, timeout: float = 25.0) -> str:
        """Scrape a single URL and return markdown content."""
        async def _do_scrape():
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/v1/scrape",
                    json={"url": url, "formats": ["markdown"]},
                    headers=self.headers,
                )
                resp.raise_for_status()
                return resp.json()

        result = await resilience_pool.execute("http_search", _do_scrape)

        if isinstance(result, dict):
            return result.get("markdown") or result.get("data", {}).get("markdown", "")
        return ""


# ═══════════════════════════════════════════════════════════════════════════
# Reasoning Analyzer (uses LLM to analyze gaps and plan next steps)
# ═══════════════════════════════════════════════════════════════════════════

async def _analyze_and_plan(
    topic: str,
    findings: list[ResearchFinding],
    time_remaining_minutes: float,
) -> dict | None:
    """
    Ask the reasoning model to analyze findings and decide next steps.

    Returns: {summary, gaps, nextSteps, shouldContinue, nextSearchTopic, urlToSearch}
    or None on failure.
    """
    from langchain_core.messages import HumanMessage

    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

    findings_text = "\n".join(
        f"[From {f.source}]: {f.text[:1000]}" for f in findings[-15:]  # Last 15 findings
    )

    from dbgpt_analyst.prompts.researcher_prompt import render_deep_research_prompt
    prompt = render_deep_research_prompt(topic, time_remaining_minutes, findings_text)

    try:
        llm, _ = await create_llm_with_fallback(
            model_name=preferred_model_name(),
            user_id="deep_research",
            streaming=False,
            json_mode=True,
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        parsed = json.loads(response.content)
        return parsed.get("analysis", parsed)
    except Exception as e:
        logger.warning(f"Analysis failed: {e}")
        return None


async def _final_synthesis(
    topic: str,
    findings: list[ResearchFinding],
    summaries: list[str],
) -> str:
    """Generate the final comprehensive analysis from all findings."""
    from langchain_core.messages import HumanMessage

    from dbgpt_analyst.common.model_fallback import create_llm_with_fallback

    findings_text = "\n".join(
        f"[From {f.source}]: {f.text[:1500]}" for f in findings
    )
    summaries_text = "\n".join(f"[Summary]: {s}" for s in summaries if s)

    prompt = f"""Create a comprehensive analysis of "{topic}" based on these research findings:

{findings_text}

{summaries_text}

Provide a detailed analysis including:
- Key findings with specific data points
- Important insights and patterns
- Conclusions with supporting evidence
- Any remaining uncertainties

Include citations to sources where appropriate.
Write in Vietnamese (tiếng Việt).
The analysis should be thorough, well-structured, and data-driven."""

    try:
        llm, _ = await create_llm_with_fallback(
            model_name=preferred_model_name(),
            user_id="deep_research",
            streaming=False,
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        return response.content
    except Exception as e:
        logger.error(f"Final synthesis failed: {e}")
        return f"Tổng hợp thất bại: {e}. Findings: {len(findings)} nguồn."



# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

async def _extract_one(fc: FirecrawlClient, url: str, topic: str) -> list[Any]:
    """Extract key information from a single URL."""
    try:
        result = await fc.extract(
            [url],
            prompt=f"Extract key information about {topic}. Focus on facts, data, and expert opinions. Be comprehensive.",
        )
        return result
    except Exception:
        # Fallback: try scraping instead
        try:
            markdown = await fc.scrape(url)
            if markdown:
                return [{"data": markdown[:3000], "source": url}]
        except Exception:
            pass
        return []


def _hostname(url: str) -> str:
    """Extract hostname from URL for display."""
    try:
        from urllib.parse import urlparse
        return urlparse(url).hostname or url[:30]
    except Exception:
        return url[:30]
