"""subgraphs/ — DEPRECATED: Consolidated into dbgpt_analyst.graphs.

Canonical graph modules now live in `dbgpt_analyst.graphs`.
This package is maintained for backward compatibility.
"""


def __getattr__(name: str):
    import dbgpt_analyst.graphs as _graphs
    if hasattr(_graphs, name):
        return getattr(_graphs, name)
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")