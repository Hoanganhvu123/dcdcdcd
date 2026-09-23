"""Agent Nodes Package for DB-GPT Analyst.

Consolidates centralized analytical and execution nodes:
- classifier_node: Query intent routing and fast-path detection
- tools_node: SQL and analytics tool execution with fallback cascade
- answer_node: Structured analytical narrative synthesis
- artifact_node: Office deliverable and document drafting
"""

from .analysis import node_critic, node_validate
from .answer_node import answer_node, close_unclosed_xml_tags
from .artifact_node import artifact_node
from .chart_spec_node import chart_spec_node
from .classifier_node import classifier_node
from .data_explorer import node_explore
from .diagnostic import node_mini_summarize, route_after_execute
from .doc_compose_node import doc_compose_node
from .execution import node_execute_sql
from .merge import node_merge_results
from .plan_node import plan_node
from .researcher import node_web_researcher
from .schema_resolver import node_resolve_schema
from .sql_exec_node import sql_exec_node
from .sql_gen_node import sql_gen_node
from .sql_generator import node_generate_sql
from .sql_planner import node_plan_sql
from .table_selector import node_table_selector
from .tools_node import tools_node

__all__ = [
    "answer_node",
    "artifact_node",
    "chart_spec_node",
    "classifier_node",
    "close_unclosed_xml_tags",
    "doc_compose_node",
    "node_critic",
    "node_execute_sql",
    "node_explore",
    "node_generate_sql",
    "node_merge_results",
    "node_mini_summarize",
    "node_plan_sql",
    "node_resolve_schema",
    "node_table_selector",
    "node_validate",
    "node_web_researcher",
    "plan_node",
    "route_after_execute",
    "sql_exec_node",
    "sql_gen_node",
    "tools_node",
]