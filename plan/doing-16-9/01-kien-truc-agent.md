# Kiến trúc agent thực tế

Các đường dẫn dưới đây tính từ root repo. B là `backend/dbgpt-analyst/src/dbgpt_analyst`; A là `backend/dbgpt-app/src/dbgpt_app/openapi/api_v1`.

## Ba đường thực thi cần phân biệt

```text
HTTP Analyst:
POST /api/v1/analyst/chat
  -> A/analyst_api.py::multi_agent_stream
  -> A/analyst_streamer.py::stream_ai_analytic_agent
  -> _get_graph -> main_agent.build_main_graph
  -> graphs/supervisor.py -> DeepAgents / domain subgraphs
  -> messages + updates + custom -> SSE -> client

Package controller:
B/controller.py::run_analyst_stream
  -> AnalystController -> EngineLifecycle -> build_supervisor_graph
  -> graph.astream -> StreamTokenFilter -> events -> SSE

OpenWork model loop:
frontend/components/openwork/useOpenWorkStore.ts
  -> streamDeepSeekChat -> services/deepseek-stream.ts -> fetch provider endpoint
  -> token callbacks / tool execution / streamParts / artifacts
```

Đây là các đường thấy trong source, không phải kết quả tracing một deployment đang chạy. Hook `frontend/hooks/use-analyst-chat.ts` đọc endpoint Analyst; không được mặc định mọi màn hình OpenWork đều đi qua hook này. Cần inventory route/mode UI trước khi chọn đường chuẩn.

## Trách nhiệm các lớp

| Lớp | Code | Nhận xét |
|---|---|---|
| HTTP và upload | A/analyst_api.py | Auth dependency, form input, mode, session, file workspace, stream orchestration |
| Stream runtime hiện hành của API | A/analyst_streamer.py | Graph cache theo event loop, history, custom events, agent stamping và lưu dữ liệu |
| Package entrypoint mới | B/controller.py | Lifecycle, request model, graph stream; chưa thay thế toàn bộ API runtime |
| Supervisor | B/graphs/supervisor.py | DeepAgents, compiled subagents, adapter domain state, middleware |
| Facade import cũ | B/main_agent.py | Re-export supervisor; không phải supervisor implementation thứ hai |
| Worker graph | B/graphs/ và B/subgraphs/modes/ | Migration còn phối hợp cả hai cây |
| State / lifecycle / config | B/core/ | Có state chuyên biệt, song SQL/web vẫn compile MainAgentState |
| Guard | B/guard/ | Có doom-loop, budget, circuit breaker, verification, SQL guard; cần test wiring runtime |
| Event contract | B/events/ | BaseEvent dùng payload; events_schemas/schemas_stream.py là compatibility re-export |
| Tool execution | B/tools/execution/ | Adapter bảo toàn tool_call_id; cần xác nhận mọi đường tool sử dụng |
| Prompt | B/prompts/ | Sentinel chạy được; kết quả chỉ trong phạm vi heuristic và exclusions của script |

## Supervisor và worker

`_build_subagents()` đăng ký `sql_analyst`, `report_writer`, `hybrid_analyst`, `web_researcher`, `office_writer`, `diagnostic`. SQL analyst đi qua quick-analysis mode; report/hybrid vẫn nhập graph từ `subgraphs/modes/`.

Adapter domain có chuỗi input -> domain -> output, cùng nhánh revert -> domain. Domain chạy `astream` để đưa event lên graph cha. Cần kiểm tra giới hạn retry ở nhánh revert trong test riêng; chưa kết luận nhánh này luôn thoát đúng.

SQL graph:

```text
table_selector -> resolve_schema -> explore -> plan_sql
-> generate_sql -> validate -> execute_sql -> critic -> END
                    | retry          | retry       | retry
                    +----------------+-------------+-> generate_sql
```

`graphs/sql_agent.py` dùng `MainAgentState`; định nghĩa `SQLAgentState` chưa chứng minh state isolation đã được áp dụng. Khi validation invalid nhưng hết retry, router vẫn trả `execute_sql`. Executor có `secure_sql`, nên không thể suy ra SQL nguy hiểm chắc chắn được chạy; tuy nhiên cần test riêng để đảm bảo validation nghiệp vụ thất bại không tiếp tục thực thi.

## Định hướng cấu trúc sau cleanup

Giữ `core/` cho state/config/lifecycle; `graphs/` cho orchestration; `nodes/` cho nghiệp vụ; `guard/` cho policy; `events/` cho wire contract; `tools/execution/` cho tool adapter; `prompts/` cho prompt. Chốt ownership của mode graph trước khi di chuyển. API giữ transport/auth/upload, service xử lý execution, serializer sở hữu SSE. Giữ facade cũ tới khi không còn consumer và test import tương thích đã xanh.
