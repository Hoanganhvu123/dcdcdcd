"""middleware/step_budget.py — Dynamic Step Budgeting & Countdown Middleware (Task F - R1).

Monitors agent turn progress, injects countdown warnings when step allowances are running low,
wraps model calls with turn headers, and triggers emergency cutoff upon budget exhaustion.
"""

from typing import Any, Callable
from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

DEFAULT_WARNING_THRESHOLD = 5
STEP_ALERT_PREFIX = "[SYSTEM ALERT: Step budget remaining:"


def count_ai_turns(messages: list[Any]) -> int:
    """Count number of AI messages in message history."""
    if not messages:
        return 0
    return sum(
        1 for m in messages
        if isinstance(m, AIMessage) or getattr(m, "type", "") == "ai"
    )


class StepBudgetMiddleware(AgentMiddleware):
    """Middleware for dynamic step budgeting, low-budget warnings, and emergency termination."""

    def __init__(
        self,
        max_steps: int = 50,
        warning_threshold: int = DEFAULT_WARNING_THRESHOLD,
        alert_threshold: int | None = None,
        emergency_cutoff: bool = True,
    ):
        self.max_steps = max_steps
        effective_warning = alert_threshold if alert_threshold is not None else warning_threshold
        self.warning_threshold = effective_warning
        self.alert_threshold = effective_warning
        self.emergency_cutoff = emergency_cutoff

    def get_step_count(self, state_or_messages: Any) -> int:
        """Extract current step count from state dict/object or message list with compaction fallback."""
        state_steps = None
        messages = []

        if isinstance(state_or_messages, dict):
            state_steps = state_or_messages.get("steps")
            messages = state_or_messages.get("messages", [])
        elif hasattr(state_or_messages, "steps") or hasattr(state_or_messages, "messages"):
            state_steps = getattr(state_or_messages, "steps", None)
            messages = getattr(state_or_messages, "messages", [])
        elif isinstance(state_or_messages, list):
            messages = state_or_messages

        msg_turns = count_ai_turns(messages)
        if isinstance(state_steps, int):
            return max(state_steps, msg_turns)
        return msg_turns

    def get_remaining_steps(self, state_or_messages: Any) -> int:
        """Calculate remaining steps allowed in execution budget."""
        current_turns = self.get_step_count(state_or_messages)
        return max(0, self.max_steps - current_turns)

    def _get_effective_threshold(self) -> int:
        """Adaptive threshold calculation for micro budgets."""
        threshold = self.warning_threshold
        if self.max_steps <= threshold:
            return max(1, self.max_steps // 2)
        return threshold

    def before_agent(self, state: AgentState, runtime: Any = None, config: Any = None) -> dict[str, Any] | None:
        """Inspect step progress before agent node execution."""
        messages = state.get("messages", []) if isinstance(state, dict) else getattr(state, "messages", [])
        current_turns = self.get_step_count(state)
        remaining = max(0, self.max_steps - current_turns)

        # Do not fire alert at turn 0
        if current_turns == 0:
            return None

        # Check emergency cutoff when budget is completely exhausted
        if remaining == 0 and self.emergency_cutoff:
            cutoff_msg = (
                f"{STEP_ALERT_PREFIX} 0/{self.max_steps} turns. "
                "Execution budget exhausted. Halting graph execution. "
                "Tôi đã hoàn thành các bước điều tra và tổng hợp kết quả phân tích theo dữ liệu hiện có."
            )
            return {
                "messages": [AIMessage(content=cutoff_msg)],
                "jump_to": "end",
            }

        effective_threshold = self._get_effective_threshold()
        if remaining <= effective_threshold:
            alert_content = (
                f"{STEP_ALERT_PREFIX} {remaining}/{self.max_steps} turns. "
                "Please finalize your analysis and output your final response immediately."
            )

            # Warning deduplication check
            if messages:
                last_msg = messages[-1]
                last_content = getattr(last_msg, "content", "")
                if isinstance(last_content, str) and STEP_ALERT_PREFIX in last_content:
                    return None

            return {"messages": [HumanMessage(content=alert_content)]}

        return None

    def before_model(self, state: AgentState, runtime: Any = None, config: Any = None) -> dict[str, Any] | None:
        """Alias before_model to before_agent."""
        return self.before_agent(state, runtime, config)

    async def abefore_agent(self, state: AgentState, runtime: Any = None, config: Any = None) -> dict[str, Any] | None:
        """Async hook for before_agent."""
        return self.before_agent(state, runtime, config)

    async def abefore_model(self, state: AgentState, runtime: Any = None, config: Any = None) -> dict[str, Any] | None:
        """Async hook for before_model."""
        return self.before_agent(state, runtime, config)

    def _build_model_request(self, request: ModelRequest) -> ModelRequest:
        """Construct model request with turn countdown header."""
        current_ai = count_ai_turns(request.messages)
        turn_number = current_ai + 1
        remaining = max(0, self.max_steps - current_ai)
        header = f"[Step Budget: Turn {turn_number}/{self.max_steps} | {remaining} steps remaining]"

        if request.system_message is None:
            new_sys = SystemMessage(content=header)
            return request.override(system_message=new_sys)

        sys_content = request.system_message.content
        if isinstance(sys_content, str):
            new_content = sys_content + f"\n\n{header}"
            return request.override(system_message=SystemMessage(content=new_content))
        elif isinstance(sys_content, list):
            new_list = list(sys_content) + [{"type": "text", "text": f"\n\n{header}"}]
            return request.override(system_message=SystemMessage(content=new_list))

        return request

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Any],
    ) -> Any:
        """Append step budget countdown header to system message on synchronous model call."""
        updated_request = self._build_model_request(request)
        return handler(updated_request)

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Any],
    ) -> Any:
        """Append step budget countdown header to system message on async model call."""
        updated_request = self._build_model_request(request)
        return await handler(updated_request)
