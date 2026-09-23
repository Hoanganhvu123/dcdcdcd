"""subgraphs/web_researcher_graph.py — Web Researcher Subgraph.

Wraps node_web_researcher (ReAct create_react_agent) vào StateGraph 1-node
để nhất quán với kiến trúc Supervisor: graph.py chỉ thấy subgraph, không thấy node thô.
Logic bên trong không thay đổi.
"""
from langgraph.graph import END, StateGraph

from dbgpt_analyst.nodes.researcher import node_web_researcher as _node_web_researcher
from dbgpt_analyst.core.state import MainAgentState


def build_web_researcher_graph():
    workflow = StateGraph(MainAgentState)
    workflow.add_node("web_researcher", _node_web_researcher)
    workflow.set_entry_point("web_researcher")
    workflow.add_edge("web_researcher", END)
    return workflow.compile()


node_web_researcher = build_web_researcher_graph()
