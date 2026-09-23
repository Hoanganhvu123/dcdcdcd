"""Unit tests for MemoryImportanceScorer."""

import pytest
from dbgpt_analyst.memory.importance_scorer import MemoryImportanceScorer


def test_score_heuristically():
    """Verify heuristic importance scoring for high, medium, and low value memories."""
    scorer = MemoryImportanceScorer()

    # High value
    high_score = scorer.score_heuristically("Golden query: SELECT store_id, sum(revenue) FROM sales GROUP BY 1")
    assert high_score >= 7.0

    # Low value
    low_score = scorer.score_heuristically("Syntax error on line 4: unexpected token")
    assert low_score <= 4.0


def test_filter_important_memories():
    """Verify filtering retains only memories meeting or exceeding the score threshold."""
    scorer = MemoryImportanceScorer()

    memories = [
        {"content": "Golden query schema mapping for quarterly revenue", "id": 1},
        {"content": "syntax error connection retry_count", "id": 2},
        {"content": "Quy ước tính EBITDA theo chuẩn báo cáo tài chính", "id": 3},
    ]

    filtered = scorer.filter_important_memories(memories, threshold=6.0)
    assert len(filtered) == 2
    ids = [m["id"] for m in filtered]
    assert 1 in ids
    assert 3 in ids
    assert 2 not in ids
