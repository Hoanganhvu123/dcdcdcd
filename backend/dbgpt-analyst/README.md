# dbgpt-analyst

AI data-analytic agent core, ported from `preferences/aianalytic` into the
DB-GPT monorepo as an isolated package (see `plans/doings/02_AGENT_CORE_PORT.md`).

- **Port source**: `preferences/aianalytic/backend/agent_core/ai_data_analytic_agent/` (read-only reference)
- **Status**: package scaffold only. Task C onward (agent_core port, adapters, router) come later.
- **Dependencies**: `langgraph` / `langchain-core` / `deepagents` / `langgraph-checkpoint-postgres` are installed as real pip packages, **not vendored**. We do not copy the vendored `deepagents` fork shipped under `preferences/aianalytic` into this repo.

## Pinned dependency versions

| package                        | version |
| ------------------------------ | ------- |
| `deepagents`                   | 0.7.5   |
| `langgraph`                    | 1.2.10  |
| `langchain-core`               | 1.5.3   |
| `langgraph-checkpoint-postgres`| 3.1.2   |

Versions are pinned (not `>=`) because the port relies on a specific API surface:
`create_deep_agent`, `CompiledSubAgent`, and `stream_events(version="v3")` all
depend on exact versions of `deepagents`/`langgraph`.

## API diff vendor vs pip

Comparison: the vendored `deepagents` fork shipped under `preferences/aianalytic` (its `graph.py` / `middleware/subagents.py`) vs `deepagents==0.7.5` (pip, `.venv/Lib/site-packages/deepagents/`).

**Verdict: khớp.** Fork dựa trên rất gần deepagents 0.7.x.

1. `create_deep_agent` — khớp chữ ký với mọi tham số code nguồn dùng (`model, tools, system_prompt, middleware, subagents, response_format, context_schema, checkpointer, store, backend, interrupt_on, debug, name, cache`). Lệch nhỏ:
   - `backend`: vendor `BackendProtocol | BackendFactory | None`; pip `BackendProtocol | None` — **`BackendFactory` (factory callable) không còn được nhận**, phải truyền instance `BackendProtocol`.
   - Tham số **thêm** ở pip (additive, code cũ vẫn chạy): `skills`, `memory`, `permissions`, `state_schema`; `response_format` mở rộng nhận `type | dict`.
   - Return type generic hóa thành `CompiledStateGraph[AgentState, ContextT, ...]` — vẫn là `CompiledStateGraph`.
2. `CompiledSubAgent` — **còn tồn như nguyên**, đúng tên, đúng chỗ (`deepagents.middleware.subagents`, re-export ở top-level `deepagents`), vẫn là `TypedDict` gồm `name` / `description` / `runnable`. Import thẳng `from deepagents import create_deep_agent, CompiledSubAgent`.
3. `stream_events(version="v3")` — `langchain-core==1.5.3` (`Runnable.stream_events`/`astream_events`) còn param `version`, nhận `"v3"` (default `"v2"`, `"v3"` vẫn được chấp nhận).

### Submodule nội bộ code nguồn import trực tiếp — đều có trong pip 0.7.5
- `deepagents.backends.filesystem.FilesystemBackend(root_dir=..., virtual_mode=...)` khớp
- `deepagents.backends.utils` → `format_content_with_line_numbers`, `sanitize_tool_call_id` khớp
- `deepagents.backends.protocol.BackendProtocol` (vendor là `class.Protocol`, pip là `abc.ABC` — code nguồn chỉ dùng để type-hint, khỏ qua)
- `deepagents.profiles.provider.provider_profiles.apply_provider_profile` khớp
- `deepagents.middleware._message_eviction` (`_aoffload_tool_message_content`, `_extract_text_from_message`, `_offload_tool_message_content`) khớp
- `deepagents._models.resolve_model` khớp

### Lệch duy nhất có thể khiến task C phải để tâm
- `SubAgentMiddleware.__init__` đổi hoàn toàn: vendor nhận `default_model/default_tools/default_middleware/default_interrupt_on/general_purpose_agent`; pip 0.7.5 nhận `backend/subagents/system_prompt/task_description/private_state_keys/state_schema` và **bắt buộc** `subagents` không rỗng (`raise ValueError`). Code aianalytic không tự khởi tạo `SubAgentMiddleware` (nó nằm trong `create_deep_agent`), nên không chặn bước này — chỉ cần biết khi port middleware stack ở task C.

Trạng thái: **khớp đủ để import thẳng, chưa cần shim.** Chỗ nào quyết định khi task C port chạm vào sẽ báo cáo tiếp; không tự write shim ở giai đoạn này.
