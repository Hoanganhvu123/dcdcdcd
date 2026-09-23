"""agent_core/ai_data_analytic_agent/middleware/approval_policy.py

Action approval policy manager for human-in-the-loop interjections.
Emits approval_request wire events when high-risk operations (e.g. write queries) are triggered.
"""
from typing import Any
import uuid


class ActionApprovalPolicy:
    def __init__(self, mode: str = "interactive"):
        self.mode = mode  # "interactive", "yolo", "afk"

    def requires_approval(self, action_name: str, payload: dict[str, Any]) -> bool:
        if self.mode == "yolo":
            return False
        high_risk_actions = ("write_query", "update_schema", "delete_records", "execute_write_sql")
        if any(hr in action_name.lower() for hr in high_risk_actions):
            return True
        return False

    def create_approval_request(
        self,
        sender: str,
        action: str,
        description: str,
        tool_call_id: str | None = None
    ) -> dict[str, Any]:
        req_id = f"appr_{uuid.uuid4().hex[:8]}"
        tc_id = tool_call_id or f"call_{uuid.uuid4().hex[:8]}"
        return {
            "type": "approval_request",
            "payload": {
                "id": req_id,
                "tool_call_id": tc_id,
                "sender": sender,
                "action": action,
                "description": description,
                "requires_confirmation": True,
            }
        }