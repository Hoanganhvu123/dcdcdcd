"""common/workspace_manager.py — Port từ preferences/aianalytic/backend/common/workspace_manager.py.

Default WORKSPACE_DIR đổi sang dbgpt.configs.model_config.DATA_DIR/workspaces (dùng chung
thư mục data của DB-GPT thay vì relative path phụ thuộc cwd). Còn lại giữ nguyên 100%.
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from dbgpt.configs.model_config import DATA_DIR

import aiofiles

logger = logging.getLogger(__name__)

WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", os.path.join(DATA_DIR, "workspaces"))


class WorkspaceManager:
    """
    Quản lý các file tạm (Artifacts) trong quá trình agent chạy.
    Tạo ra một "Filesystem Context" để agent có thể ghi report, biểu đồ, data
    ra ổ cứng thay vì nhồi nhét tất cả vào context window (State).

    Hỗ trợ:
    - Quản lý storage tại data/workspaces/<conv_id>/
    - Tracking category bằng sidecar .metadata.json ("original" vs "result")
    - Path traversal security checks
    """

    @staticmethod
    def get_safe_session_id(session_id: str) -> str:
        """Sanitize session_id to prevent directory traversal."""
        if not session_id:
            raise ValueError("Session ID cannot be empty.")
        safe_session = "".join(c for c in session_id if c.isalnum() or c in "._- ")
        if not safe_session or ".." in safe_session:
            raise ValueError("Invalid session ID.")
        return safe_session

    @staticmethod
    def get_session_dir(session_id: str) -> Path:
        """Lấy (hoặc tạo) thư mục workspace cho một session với path security check."""
        safe_session = WorkspaceManager.get_safe_session_id(session_id)
        base_dir = Path(WORKSPACE_DIR).resolve()
        session_dir = (base_dir / safe_session).resolve()

        if not session_dir.is_relative_to(base_dir):
            raise ValueError("Path traversal attempt detected in session_id.")

        session_dir.mkdir(parents=True, exist_ok=True)
        return session_dir

    @staticmethod
    def get_safe_file_path(session_id: str, filename: str) -> Path:
        """Lấy đường dẫn an toàn cho file trong session, ngăn path traversal."""
        session_dir = WorkspaceManager.get_session_dir(session_id)
        clean_filename = filename.strip()
        if not clean_filename or clean_filename in (".", ".."):
            raise ValueError("Invalid filename.")
        file_path = (session_dir / clean_filename).resolve()
        if not file_path.is_relative_to(session_dir):
            raise ValueError(f"Path traversal attempt detected for filename: {filename}")
        return file_path

    @staticmethod
    def get_metadata(session_id: str) -> dict[str, dict]:
        """Đọc sidecar .metadata.json của session workspace."""
        session_dir = WorkspaceManager.get_session_dir(session_id)
        meta_file = session_dir / ".metadata.json"
        if meta_file.exists() and meta_file.is_file():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        return data
            except Exception as e:
                logger.warning("Error reading .metadata.json in %s: %s", session_dir, e)
        return {}

    @staticmethod
    def update_metadata(
        session_id: str,
        filename: str,
        file_type: str = "result",
        size: int | None = None,
        extra: dict | None = None,
    ) -> None:
        """Cập nhật sidecar .metadata.json với file category ('original' hoặc 'result')."""
        session_dir = WorkspaceManager.get_session_dir(session_id)
        meta_file = session_dir / ".metadata.json"
        metadata = WorkspaceManager.get_metadata(session_id)

        now_iso = datetime.now(timezone.utc).isoformat()
        safe_name = Path(filename).name

        existing = metadata.get(safe_name, {})
        existing.update({
            "name": safe_name,
            "type": file_type,
            "updated_at": now_iso,
            "created_at": existing.get("created_at", now_iso),
        })
        if size is not None:
            existing["size"] = size
        if extra:
            existing.update(extra)

        metadata[safe_name] = existing

        try:
            temp_file = session_dir / ".metadata.json.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            temp_file.replace(meta_file)
        except Exception as e:
            logger.error("Error writing .metadata.json in %s: %s", session_dir, e)

    @staticmethod
    def find_file_by_hash(session_id: str, file_hash: str) -> dict | None:
        """Tìm xem trong metadata của session có file nào chứa mã hash này chưa."""
        metadata = WorkspaceManager.get_metadata(session_id)
        for fname, meta in metadata.items():
            if meta.get("hash") == file_hash:
                return meta
        return None

    @staticmethod
    async def save_artifact(
        session_id: str,
        filename: str,
        content: str | bytes,
        file_type: str = "result",
        file_hash: str | None = None,
    ) -> str:
        """
        Lưu nội dung vào file workspace và cập nhật metadata sidecar.
        Trả về URL tương đối.
        """
        file_path = WorkspaceManager.get_safe_file_path(session_id, filename)
        safe_session = WorkspaceManager.get_safe_session_id(session_id)

        if isinstance(content, str):
            content_bytes = content.encode("utf-8")
            async with aiofiles.open(file_path, mode="w", encoding="utf-8") as f:
                await f.write(content)
        else:
            content_bytes = content
            async with aiofiles.open(file_path, mode="wb") as f:
                await f.write(content)

        WorkspaceManager.update_metadata(
            session_id=session_id,
            filename=file_path.name,
            file_type=file_type,
            size=len(content_bytes),
            extra={"hash": file_hash} if file_hash else None,
        )

        return f"/api/workspace/{safe_session}/{file_path.name}"

    @staticmethod
    def save_artifact_sync(
        session_id: str,
        filename: str,
        content: str | bytes,
        file_type: str = "result",
        file_hash: str | None = None,
    ) -> str:
        """Bản đồng bộ (sync) của save_artifact."""
        file_path = WorkspaceManager.get_safe_file_path(session_id, filename)
        safe_session = WorkspaceManager.get_safe_session_id(session_id)

        if isinstance(content, str):
            content_bytes = content.encode("utf-8")
            with open(file_path, mode="w", encoding="utf-8") as f:
                f.write(content)
        else:
            content_bytes = content
            with open(file_path, mode="wb") as f:
                f.write(content)

        WorkspaceManager.update_metadata(
            session_id=session_id,
            filename=file_path.name,
            file_type=file_type,
            size=len(content_bytes),
            extra={"hash": file_hash} if file_hash else None,
        )

        return f"/api/workspace/{safe_session}/{file_path.name}"

    @staticmethod
    def list_files(session_id: str) -> list[dict]:
        """Trả về danh sách file trong workspace kèm metadata (name, path, size, type, mtime, url)."""
        safe_session = WorkspaceManager.get_safe_session_id(session_id)
        session_dir = WorkspaceManager.get_session_dir(session_id)
        metadata = WorkspaceManager.get_metadata(session_id)

        files = []
        if not session_dir.exists() or not session_dir.is_dir():
            return files

        for file_path in session_dir.iterdir():
            if file_path.is_file() and not file_path.name.startswith("."):
                stat = file_path.stat()
                file_meta = metadata.get(file_path.name, {})
                file_type = file_meta.get("type", "result")
                mtime_iso = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
                created_at = file_meta.get("created_at", mtime_iso)

                files.append({
                    "name": file_path.name,
                    "path": f"{safe_session}/{file_path.name}",
                    "size": stat.st_size,
                    "type": file_type,
                    "mtime": mtime_iso,
                    "created_at": created_at,
                    "url": f"/api/workspace/{safe_session}/{file_path.name}",
                })

        files.sort(key=lambda x: x["mtime"], reverse=True)
        return files