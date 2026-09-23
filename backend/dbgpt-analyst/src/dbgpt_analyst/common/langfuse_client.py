"""common/langfuse_client.py — nối vào dbgpt.util.tracer.langfuse_client thật
(port từ plan 01, backend/dbgpt-core/src/dbgpt/util/tracer/langfuse_client.py)
thay cho stub no-op.

`observe` được dùng làm decorator `@observe(name="...")` áp lên nodes/tools
NGAY LÚC MODULE IMPORT (12 chỗ trong nodes/*.py, tools/*.py) — không có
system_app/FastAPI request context tại thời điểm đó, nên dùng thẳng
`get_langfuse_decorator()` (đọc trực tiếp env var LANGFUSE_PUBLIC_KEY /
LANGFUSE_SECRET_KEY / LANGFUSE_HOST), KHÔNG dùng bản
`get_langfuse_decorator_for_system(system_app)` (cần TOML config đã đăng ký
qua `register_trace_config`, chỉ có trong lifecycle webserver).

Nếu chưa cấu hình Langfuse (thiếu key, hoặc package `langfuse` chưa cài) thì
`get_langfuse_decorator()` trả None -> fallback no-op decorator, y hệt hành
vi stub cũ, không chặn app chạy.
"""
try:
    from dbgpt.util.tracer.langfuse_client import get_langfuse_decorator
    _real_observe = get_langfuse_decorator()
except Exception:
    _real_observe = None


def observe(*args, **kwargs):
    if _real_observe is not None:
        return _real_observe(*args, **kwargs)

    def decorator(func):
        return func

    return decorator