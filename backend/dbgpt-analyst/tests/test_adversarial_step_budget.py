
import pytest
from dataclasses import dataclass
from typing import Any
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel

from dbgpt_analyst.config import SUPERVISOR_RECURSION_LIMIT
from dbgpt_analyst.main_agent import (
    SYSTEM_PROMPT,
    build_main_graph,
    render_supervisor_system_prompt,
)
from dbgpt_analyst.middleware.step_budget import (
    DEFAULT_WARNING_THRESHOLD,
    STEP_ALERT_PREFIX,
    StepBudgetMiddleware,
    count_ai_turns,
)

@pytest.mark.parametrize(
    'max_steps,turns,expected_remaining,should_alert,should_cutoff',
    [
        (1, 0, 1, False, False),
        (1, 1, 0, False, True),
        (2, 0, 2, False, False),
        (2, 1, 1, True, False),
        (2, 2, 0, False, True),
        (3, 0, 3, False, False),
        (3, 1, 2, False, False),
        (3, 2, 1, True, False),
        (3, 3, 0, False, True),
        (4, 0, 4, False, False),
        (4, 1, 3, False, False),
        (4, 2, 2, True, False),
        (4, 3, 1, True, False),
        (4, 4, 0, False, True),
        (500, 490, 10, False, False),
        (500, 494, 6, False, False),
        (500, 495, 5, True, False),
        (500, 499, 1, True, False),
        (500, 500, 0, False, True),
        (10000, 9994, 6, False, False),
        (10000, 9995, 5, True, False),
        (10000, 10000, 0, False, True),
    ]
)
def test_budget_scale_adversarial_matrix(
    max_steps: int,
    turns: int,
    expected_remaining: int,
    should_alert: bool,
    should_cutoff: bool,
):
    middleware = StepBudgetMiddleware(max_steps=max_steps, warning_threshold=5, emergency_cutoff=True)
    messages = [HumanMessage(content='User query')]
    for i in range(turns):
        messages.append(AIMessage(content=f'Turn {i+1}'))

    state = {'messages': messages}
    assert middleware.get_remaining_steps(state) == expected_remaining

    res = middleware.before_agent(state)
    if should_cutoff:
        assert res is not None
        assert res.get('jump_to') == 'end'
        assert f'0/{max_steps} turns' in res['messages'][0].content
    elif should_alert:
        assert res is not None
        assert 'jump_to' not in res
        assert f'{expected_remaining}/{max_steps} turns' in res['messages'][0].content
    else:
        assert res is None

def test_zero_budget_adversarial():
    middleware = StepBudgetMiddleware(max_steps=0, warning_threshold=5, emergency_cutoff=True)
    state_0 = {'messages': [HumanMessage(content='Hi')]}
    assert middleware.get_step_count(state_0) == 0
    assert middleware.get_remaining_steps(state_0) == 0
    assert middleware.before_agent(state_0) is None

    state_1 = {'messages': [HumanMessage(content='Hi'), AIMessage(content='Turn 1')]}
    assert middleware.get_step_count(state_1) == 1
    assert middleware.get_remaining_steps(state_1) == 0
    res = middleware.before_agent(state_1)
    assert res is not None
    assert res.get('jump_to') == 'end'
    assert '0/0 turns' in res['messages'][0].content

@dataclass
class MockAgentStateObj:
    messages: list
    steps: int

def test_compaction_with_state_steps_counter():
    middleware = StepBudgetMiddleware(max_steps=50, warning_threshold=5)
    compacted_state = {
        'messages': [
            SystemMessage(content='System prompt'),
            HumanMessage(content='[Summary of previous 45 turns]'),
            AIMessage(content='Understood the summary.'),
            HumanMessage(content='Analyze latest Q3 trend'),
        ],
        'steps': 46,
    }
    assert middleware.get_step_count(compacted_state) == 46
    assert middleware.get_remaining_steps(compacted_state) == 4

    res = middleware.before_agent(compacted_state)
    assert res is not None
    assert 'messages' in res
    assert 'Step budget remaining: 4/50 turns.' in res['messages'][0].content

def test_compaction_with_pydantic_or_dataclass_state():
    middleware = StepBudgetMiddleware(max_steps=50, warning_threshold=5)
    state_obj = MockAgentStateObj(
        messages=[HumanMessage(content='Q'), AIMessage(content='A')],
        steps=48,
    )
    assert middleware.get_step_count(state_obj) == 48
    assert middleware.get_remaining_steps(state_obj) == 2

    res = middleware.before_agent(state_obj)
    assert res is not None
    assert 'Step budget remaining: 2/50 turns.' in res['messages'][0].content

def test_compaction_budget_exhaustion():
    middleware = StepBudgetMiddleware(max_steps=50, warning_threshold=5, emergency_cutoff=True)
    state = {
        'messages': [HumanMessage(content='Q'), AIMessage(content='A')],
        'steps': 50,
    }
    assert middleware.get_remaining_steps(state) == 0
    res = middleware.before_agent(state)
    assert res is not None
    assert res.get('jump_to') == 'end'
    assert '0/50 turns' in res['messages'][0].content

def test_compaction_fallback_when_steps_is_smaller_than_messages():
    middleware = StepBudgetMiddleware(max_steps=20, warning_threshold=5)
    messages = [HumanMessage(content='Start')]
    for i in range(10):
        messages.append(AIMessage(content=f'AI {i}'))
    state = {'messages': messages, 'steps': 2}
    assert middleware.get_step_count(state) == 10
    assert middleware.get_remaining_steps(state) == 10

def test_consecutive_alert_deduplication_sync_and_async():
    middleware = StepBudgetMiddleware(max_steps=10, warning_threshold=5)
    messages = [HumanMessage(content='Start')]
    for i in range(7):
        messages.append(AIMessage(content=f'Turn {i+1}'))
    state = {'messages': messages}

    res1 = middleware.before_agent(state)
    assert res1 is not None
    alert_msg = res1['messages'][0]
    assert isinstance(alert_msg, HumanMessage)

    state['messages'].append(alert_msg)

    res2 = middleware.before_model(state)
    assert res2 is None

    res3 = middleware.before_agent(state)
    assert res3 is None

@pytest.mark.asyncio
async def test_async_consecutive_alert_deduplication():
    middleware = StepBudgetMiddleware(max_steps=10, warning_threshold=5)
    messages = [HumanMessage(content='Start')]
    for i in range(8):
        messages.append(AIMessage(content=f'Turn {i+1}'))
    state = {'messages': messages}

    res1 = await middleware.abefore_agent(state)
    assert res1 is not None
    state['messages'].append(res1['messages'][0])

    res2 = await middleware.abefore_model(state)
    assert res2 is None

def test_emergency_cutoff_disabled_behavior():
    middleware = StepBudgetMiddleware(max_steps=5, warning_threshold=5, emergency_cutoff=False)
    messages = [AIMessage(content=f'Turn {i}') for i in range(5)]
    state = {'messages': messages}

    res = middleware.before_agent(state)
    assert res is not None
    assert res.get('jump_to') is None
    assert 'messages' in res
    assert '0/5 turns' in res['messages'][0].content

def test_emergency_cutoff_message_coherence():
    middleware = StepBudgetMiddleware(max_steps=50, emergency_cutoff=True)
    messages = [AIMessage(content=f'Turn {i}') for i in range(50)]
    state = {'messages': messages}

    res = middleware.before_agent(state)
    assert res is not None
    assert res.get('jump_to') == 'end'
    ai_msg = res['messages'][0]
    assert isinstance(ai_msg, AIMessage)
    assert '[SYSTEM ALERT: Step budget remaining: 0/50 turns.' in ai_msg.content
    assert 'Tôi đã hoàn thành các bước điều tra và tổng hợp kết quả phân tích theo dữ liệu hiện có.' in ai_msg.content

def test_wrap_model_call_with_list_system_message():
    middleware = StepBudgetMiddleware(max_steps=50)
    original_sys = SystemMessage(content=[{'type': 'text', 'text': 'Base prompt part 1'}])
    msgs = [HumanMessage(content='Query'), AIMessage(content='Resp')]
    req = ModelRequest(messages=msgs, system_message=original_sys, model='test-model')
    captured_req = []
    def handler(r: ModelRequest) -> AIMessage:
        captured_req.append(r)
        return AIMessage(content='Done')
    middleware.wrap_model_call(req, handler)
    assert len(captured_req) == 1
    new_sys = captured_req[0].system_message
    assert isinstance(new_sys.content, list)
    assert len(new_sys.content) == 2
    assert '[Step Budget: Turn 2/50 | 49 steps remaining]' in str(new_sys.content[1])

def test_wrap_model_call_with_none_system_message():
    middleware = StepBudgetMiddleware(max_steps=20)
    req = ModelRequest(messages=[HumanMessage(content='Hi')], system_message=None, model='test-model')
    captured_req = []
    def handler(r: ModelRequest) -> AIMessage:
        captured_req.append(r)
        return AIMessage(content='Done')
    middleware.wrap_model_call(req, handler)
    assert len(captured_req) == 1
    new_sys = captured_req[0].system_message
    assert isinstance(new_sys, SystemMessage)
    assert '[Step Budget: Turn 1/20 | 20 steps remaining]' in str(new_sys.content)

def test_render_supervisor_system_prompt_exhaustive():
    rendered_default = render_supervisor_system_prompt()
    assert '{{ max_steps }}' not in rendered_default
    assert '{{max_steps}}' not in rendered_default
    assert f'Maximum Step Budget: {SUPERVISOR_RECURSION_LIMIT} steps' in rendered_default
    assert f'Total Step Budget: {SUPERVISOR_RECURSION_LIMIT} turns.' in rendered_default

    for custom in [1, 2, 4, 10, 50, 500, 1000]:
        rendered = render_supervisor_system_prompt(custom)
        assert '{{ max_steps }}' not in rendered
        assert '{{max_steps}}' not in rendered
        assert f'Maximum Step Budget: {custom} steps' in rendered
        assert f'Total Step Budget: {custom} turns.' in rendered

    assert '<subagents>' in rendered_default
    assert 'sql_analyst' in rendered_default
    assert 'report_writer' in rendered_default
    assert 'hybrid_analyst' in rendered_default
    assert 'office_writer' in rendered_default
    assert '</subagents>' in rendered_default


from langchain_core.language_models import BaseChatModel
from langchain_core.outputs import ChatGeneration, ChatResult


class MockChatModel(BaseChatModel):
    """Mock chat model that supports bind_tools for testing."""
    response_text: str = "Final report: doanh thu tháng 10 là 500 triệu."

    @property
    def _llm_type(self) -> str:
        return "mock"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        generation = ChatGeneration(message=AIMessage(content=self.response_text))
        return ChatResult(generations=[generation])


@pytest.mark.asyncio
async def test_e2e_supervisor_graph_budget_cutoff():
    model = MockChatModel()
    graph = await build_main_graph(model=model, recursion_limit=20)
    assert graph is not None
    result = await graph.ainvoke(
        {'messages': [HumanMessage(content='Doanh thu tháng 10 bao nhiêu?')]},
        config={'configurable': {'thread_id': 'adversarial_thread_1'}},
    )
    assert result is not None
    assert 'messages' in result
    assert len(result['messages']) >= 1


