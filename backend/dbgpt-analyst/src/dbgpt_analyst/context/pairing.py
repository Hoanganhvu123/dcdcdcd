"""Tool-call pairing invariant for compacted message histories.

``compact.py`` opens by promising it "never splits an AIMessage(tool_calls=...)
from its corresponding ToolMessage(tool_call_id=...)" -- but nothing checked it.
The promise held only because every compactor happens to slice on round
boundaries; one future edit that slices anywhere else breaks it silently, and
the failure does not surface here. It surfaces at the provider, as a 400
("tool_call_id not found" / "assistant message with tool_calls must be followed
by tool messages"), one layer away from the code that caused it.

Two orphan classes, both rejected by OpenAI-compatible endpoints, so the check
is bidirectional:

* a ``ToolMessage`` whose ``tool_call_id`` was never requested -- the assistant
  turn that asked for it got cut;
* an ``AIMessage`` requesting a ``tool_call`` that nothing answers -- the result
  got cut.

:func:`repair` fixes both rather than raising: compaction runs when the context
is already over budget, and refusing to compact would strand the run. The
orphan result is dropped; the unanswered call gets a placeholder saying so, so
the model learns the observation is gone instead of waiting for it.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Sequence, Tuple

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage

logger = logging.getLogger(__name__)

__all__ = [
    "DROPPED_RESULT_PLACEHOLDER",
    "find_orphans",
    "is_balanced",
    "repair",
]

DROPPED_RESULT_PLACEHOLDER = (
    "[Kết quả công cụ đã bị lược bỏ khi nén ngữ cảnh. Gọi lại nếu vẫn cần.]"
)


def _requested_ids(message: BaseMessage) -> List[Tuple[str, str]]:
    """``(id, name)`` for each tool call an assistant message requests."""
    calls = getattr(message, "tool_calls", None) or []
    out: List[Tuple[str, str]] = []
    for call in calls:
        if isinstance(call, dict):
            call_id, name = call.get("id"), call.get("name")
        else:
            call_id, name = getattr(call, "id", None), getattr(call, "name", None)
        if call_id:
            out.append((call_id, name or "tool"))
    return out


def find_orphans(
    messages: Sequence[BaseMessage],
) -> Tuple[List[int], Dict[str, str]]:
    """Return ``(orphan_result_indices, unanswered_calls)``.

    ``unanswered_calls`` maps ``tool_call_id`` to tool name, in request order.
    Order matters: a result is only paired if its request came *earlier*. A
    ``ToolMessage`` preceding its ``AIMessage`` is as invalid as a missing one.
    """
    requested: Dict[str, str] = {}
    answered: set[str] = set()
    orphan_results: List[int] = []

    for i, m in enumerate(messages):
        if isinstance(m, AIMessage):
            requested.update(dict(_requested_ids(m)))
        elif isinstance(m, ToolMessage):
            call_id = getattr(m, "tool_call_id", None)
            if call_id and call_id in requested:
                answered.add(call_id)
            else:
                orphan_results.append(i)

    unanswered = {cid: name for cid, name in requested.items() if cid not in answered}
    return orphan_results, unanswered


def is_balanced(messages: Sequence[BaseMessage]) -> bool:
    """True when every request has a later result and no result is stray."""
    orphan_results, unanswered = find_orphans(messages)
    return not orphan_results and not unanswered


def repair(messages: Sequence[BaseMessage]) -> List[BaseMessage]:
    """Return ``messages`` with pairing restored. Cheap no-op when balanced."""
    orphan_results, unanswered = find_orphans(messages)
    if not orphan_results and not unanswered:
        return list(messages)

    logger.warning(
        "Compaction broke tool pairing: %d orphan result(s), %d unanswered call(s); repairing",
        len(orphan_results),
        len(unanswered),
    )

    drop = set(orphan_results)
    repaired: List[BaseMessage] = []
    for i, m in enumerate(messages):
        if i in drop:
            continue
        repaired.append(m)
        # Placeholders go directly after the requesting message, not appended at
        # the end: providers require the results to follow their own assistant
        # turn, and a later assistant turn in between invalidates the sequence.
        if isinstance(m, AIMessage):
            for call_id, name in _requested_ids(m):
                if call_id in unanswered:
                    repaired.append(
                        ToolMessage(
                            content=DROPPED_RESULT_PLACEHOLDER,
                            tool_call_id=call_id,
                            name=name,
                            status="error",
                        )
                    )
    return repaired


if __name__ == "__main__":  # pragma: no cover - runnable check
    from langchain_core.messages import HumanMessage, SystemMessage

    def _ai(*ids):
        return AIMessage(
            content="",
            tool_calls=[
                {"id": i, "name": "run_sql", "args": {}} for i in ids
            ],
        )

    def _tm(i):
        return ToolMessage(content="rows", tool_call_id=i, name="run_sql")

    good = [SystemMessage(content="s"), HumanMessage(content="q"), _ai("a"), _tm("a")]
    assert is_balanced(good)
    assert repair(good) == list(good)

    # Plain conversation with no tools is balanced.
    assert is_balanced([HumanMessage(content="hi"), AIMessage(content="hello")])

    # Result whose request was cut -> dropped.
    stray = [HumanMessage(content="q"), _tm("gone"), AIMessage(content="ok")]
    assert not is_balanced(stray)
    fixed = repair(stray)
    assert len(fixed) == 2 and not any(isinstance(m, ToolMessage) for m in fixed), fixed
    assert is_balanced(fixed)

    # Request whose result was cut -> placeholder, inserted right after it.
    lonely = [HumanMessage(content="q"), _ai("x"), AIMessage(content="done")]
    assert not is_balanced(lonely)
    fixed = repair(lonely)
    assert isinstance(fixed[2], ToolMessage) and fixed[2].tool_call_id == "x", fixed
    assert is_balanced(fixed)

    # Parallel calls: only the missing one is filled.
    partial = [_ai("p1", "p2"), _tm("p1")]
    fixed = repair(partial)
    ids = [m.tool_call_id for m in fixed if isinstance(m, ToolMessage)]
    assert sorted(ids) == ["p1", "p2"], ids
    assert is_balanced(fixed)

    # Out-of-order: a result before its request stays an orphan.
    assert not is_balanced([_tm("z"), _ai("z")])

    print("pairing self-check OK")
