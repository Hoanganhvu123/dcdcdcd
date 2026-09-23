from pathlib import Path

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from dbgpt_analyst.common.langfuse_client import observe
from dbgpt_analyst.common.workspace_manager import WorkspaceManager


@tool
@observe(name="tool_export_to_workspace")
def export_to_workspace(filename: str, content: str, *, config: RunnableConfig = None) -> str:
    """Xuất file (CSV, TXT, JSON, MD...) vào Workspace của người dùng hiện tại để họ có thể tải xuống.
    LUÔN SỬ DỤNG tool này thay vì `write_file` khi người dùng yêu cầu "xuất báo cáo", "xuất file csv", hoặc tạo file cho họ tải về.

    Args:
        filename: Tên file kèm phần mở rộng (ví dụ: report.csv, data.json)
        content: Nội dung của file dạng chuỗi (text/csv).
    """
    session_id = config.get("configurable", {}).get("thread_id")
    if not session_id:
        return "Error: Could not determine session ID (thread_id) from configuration."

    try:
        WorkspaceManager.save_artifact_sync(
            session_id=session_id,
            filename=filename,
            content=content,
            file_type="result",
        )
        safe_filename = Path(filename).name
        return f"Thành công! File đã được lưu tại Workspace: {safe_filename}. Người dùng có thể tải xuống bằng cách mở panel Workspace trên giao diện."
    except Exception as e:
        return f"Error writing file: {e!s}"
