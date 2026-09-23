"""DB-GPT Analyst package.

Enterprise Multi-Agent Architecture for autonomous data analysis, SQL reasoning,
data engineering, diagnostic root-cause analysis, and Office artifact generation.
"""
from dbgpt_analyst.controller import (
    AnalystController,
    AnalystRequest,
    get_analyst_controller,
    run_analyst_stream,
)
from dbgpt_analyst.graphs.supervisor import (
    build_main_graph,
    build_supervisor_graph,
)

__version__ = "0.8.1"

__all__ = [
    "AnalystController",
    "AnalystRequest",
    "__version__",
    "build_main_graph",
    "build_supervisor_graph",
    "get_analyst_controller",
    "run_analyst_stream",
]