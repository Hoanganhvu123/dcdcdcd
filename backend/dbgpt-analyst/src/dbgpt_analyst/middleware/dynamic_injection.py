"""agent_core/ai_data_analytic_agent/middleware/dynamic_injection.py

Per-step dynamic prompt injection provider for plan mode reminders and step guidance.
"""
from typing import Any

class DynamicInjectionProvider:
    def __init__(self):
        pass

    def get_step_reminder(self, plan_mode: bool, current_step: int, total_steps: int) -> str | None:
        if not plan_mode:
            return None
        from dbgpt_analyst.prompts.supervisor_prompt import render_step_reminder_prompt
        return render_step_reminder_prompt(current_step, total_steps)

    def inject_messages(self, messages: list[Any], reminder_text: str | None) -> list[Any]:
        if not reminder_text:
            return messages
        # Append system reminder at the end of prompt context
        from langchain_core.messages import SystemMessage
        return list(messages) + [SystemMessage(content=reminder_text)]