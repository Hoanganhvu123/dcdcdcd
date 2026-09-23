"""Oversized data-engineer tool output must stay parseable and say it was cut.

The tools used to end in ``json.dumps(...)[:_TOOL_OUTPUT_MAX_CHARS]``, which
slices mid-token: an over-budget result reached the model as broken JSON with
nothing marking the cut, so the model either retried the same query or invented
the missing rows. These tests pin the replacement's two guarantees -- always
valid JSON, and an explicit ``truncated`` flag.
"""

import datetime
import decimal
import json

from dbgpt_analyst.subgraphs.data_engineer_subgraph import (
    _TOOL_OUTPUT_MAX_CHARS,
    _clip,
)


def test_small_payload_passes_through_unwrapped():
    out = json.loads(_clip({"rows": [1, 2]}))
    assert out == {"rows": [1, 2]}


def test_dates_and_decimals_keep_their_type_fidelity():
    """``str()`` would flatten both; the fallback only catches what json_serial rejects."""
    out = json.loads(
        _clip({"when": datetime.date(2026, 8, 23), "amt": decimal.Decimal("1.5")})
    )
    assert out == {"when": "2026-08-23", "amt": 1.5}


def test_unserialisable_value_does_not_raise():
    class Weird:
        pass

    assert "Weird" in _clip({"x": Weird()})


def test_oversized_payload_is_valid_json_and_flagged():
    payload = {"rows": ["x" * 100 for _ in range(200)]}
    out = json.loads(_clip(payload))  # the old slicing raised JSONDecodeError here

    assert out["truncated"] is True
    assert out["original_chars"] > _TOOL_OUTPUT_MAX_CHARS
    assert len(out["preview"]) == _TOOL_OUTPUT_MAX_CHARS
    assert "LIMIT" in out["note"]
