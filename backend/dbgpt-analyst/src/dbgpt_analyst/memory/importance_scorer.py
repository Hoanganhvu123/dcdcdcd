"""Memory Importance Scorer for dbgpt_analyst.

Scores analytical insights and memory fragments (1-10) to retain
high-value knowledge across long sessions, ported from dbgpt-core/agent/core/memory.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class MemoryImportanceScorer:
    """Evaluates and scores importance of analytical memory fragments."""

    def __init__(self, default_weight: float = 0.9):
        self.default_weight = default_weight

    def score_heuristically(self, content: str) -> float:
        """Fast rule-based heuristic scoring without LLM call."""
        if not content:
            return 1.0

        content_lower = content.lower()
        score = 5.0  # baseline

        # High-value signals (+2 to +4)
        high_signals = [
            "golden query",
            "schema mapping",
            "business rule",
            "user preference",
            "kết luận",
            "doanh thu",
            "tăng trưởng",
            "insight",
            "ebitda",
            "công thức",
            "quy ước",
        ]
        for signal in high_signals:
            if signal in content_lower:
                score += 1.5

        # SQL structure signals (+1.5)
        if "select " in content_lower and " from " in content_lower:
            score += 1.5

        # Low-value signals (-2 to -3)
        low_signals = [
            "syntax error",
            "lỗi cú pháp",
            "retry_count",
            "connection error",
            "heartbeat",
            "temp table",
            "test query",
        ]
        for signal in low_signals:
            if signal in content_lower:
                score -= 2.0

        return max(1.0, min(10.0, score))

    async def score_importance(
        self,
        content: str,
        llm: Any = None,
    ) -> float:
        """Score memory importance (1-10) with optional LLM evaluation."""
        if llm is None:
            return self.score_heuristically(content)

        from dbgpt_analyst.prompts.memory_prompt import render_importance_scorer_prompt
        prompt = render_importance_scorer_prompt(content)

        try:
            from langchain_core.messages import HumanMessage
            resp = await llm.ainvoke([HumanMessage(content=prompt)])
            text = resp.content if hasattr(resp, "content") else str(resp)
            match = re.search(r"(\d+(?:\.\d+)?)", str(text))
            if match:
                val = float(match.group(1))
                return max(1.0, min(10.0, val))
        except Exception as e:
            logger.debug("LLM importance scoring fallback to heuristic: %s", e)

        return self.score_heuristically(content)

    def filter_important_memories(
        self,
        memories: List[Dict[str, Any]],
        threshold: float = 6.0,
    ) -> List[Dict[str, Any]]:
        """Filter list of memories keeping only those with score >= threshold."""
        important = []
        for mem in memories:
            score = mem.get("importance")
            if score is None:
                score = self.score_heuristically(str(mem.get("content", "")))
                mem["importance"] = score
            if score >= threshold:
                important.append(mem)
        return sorted(important, key=lambda x: x.get("importance", 0), reverse=True)
