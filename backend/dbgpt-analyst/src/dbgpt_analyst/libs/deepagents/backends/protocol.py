"""Protocol definition for pluggable memory backends.

This module defines the BackendProtocol that all backend implementations
must follow. Backends can store files in different locations (state, filesystem,
database, etc.) and provide a uniform interface for file operations.
"""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Final, Literal, Protocol, TypeAlias, TypedDict, runtime_checkable

from langchain.tools import ToolRuntime


FileOperationError = Literal[
    "file_not_found",
    "permission_denied",
    "is_directory",
    "invalid_path",
]

FILE_NOT_FOUND: Final = "file_not_found"
PERMISSION_DENIED: Final = "permission_denied"
IS_DIRECTORY: Final = "is_directory"
INVALID_PATH: Final = "invalid_path"


try:
    from deepagents.backends.protocol import (  # type: ignore[no-redef]
        EditResult as _BaseEditResult,
        FileDownloadResponse,
        FileInfo,
        FileUploadResponse,
        GlobResult,
        GrepMatch,
        GrepResult,
        LsResult,
        WriteResult as _BaseWriteResult,
    )

    if not hasattr(LsResult, "__iter__"):
        LsResult.__iter__ = lambda self: iter(self.entries or [])  # type: ignore[attr-defined]

    @dataclass
    class WriteResult(_BaseWriteResult):
        error: str | None = None
        path: str | None = None
        files_update: dict[str, Any] | None = None

    @dataclass
    class EditResult(_BaseEditResult):
        error: str | None = None
        path: str | None = None
        files_update: dict[str, Any] | None = None
        occurrences: int | None = None
except ImportError:
    @dataclass
    class FileDownloadResponse:
        """Result of a single file download operation."""

        path: str
        content: bytes | None = None
        error: FileOperationError | str | None = None

    @dataclass
    class FileUploadResponse:
        """Result of a single file upload operation."""

        path: str
        error: FileOperationError | str | None = None

    @dataclass
    class LsResult:
        """Result from backend `ls` operations."""

        error: str | None = None
        entries: list["FileInfo"] | None = None

        def __iter__(self):
            return iter(self.entries or [])

    @dataclass
    class GrepResult:
        """Result from backend `grep` operations."""

        error: str | None = None
        matches: list["GrepMatch"] | None = None

    @dataclass
    class GlobResult:
        """Result from backend `glob` operations."""

        error: str | None = None
        matches: list["FileInfo"] | None = None

    class FileInfo(TypedDict, total=False):
        """Structured file listing info.

        Minimal contract used across backends. Only "path" is required.
        Other fields are best-effort and may be absent depending on backend.
        """

        path: str
        is_dir: bool
        size: int  # bytes (approx)
        modified_at: str  # ISO timestamp if known

    class GrepMatch(TypedDict):
        """Structured grep match entry."""

        path: str
        line: int
        text: str

    @dataclass
    class WriteResult:
        """Result from backend write operations.

        Attributes:
            error: Error message on failure, None on success.
            path: Absolute path of written file, None on failure.
            files_update: State update dict for checkpoint backends, None for external storage.
                Checkpoint backends populate this with {file_path: file_data} for LangGraph state.
                External backends set None (already persisted to disk/S3/database/etc).

        Examples:
            >>> # Checkpoint storage
            >>> WriteResult(path="/f.txt", files_update={"/f.txt": {...}})
            >>> # External storage
            >>> WriteResult(path="/f.txt", files_update=None)
            >>> # Error
            >>> WriteResult(error="File exists")
        """

        error: str | None = None
        path: str | None = None
        files_update: dict[str, Any] | None = None

    @dataclass
    class EditResult:
        """Result from backend edit operations.

        Attributes:
            error: Error message on failure, None on success.
            path: Absolute path of edited file, None on failure.
            files_update: State update dict for checkpoint backends, None for external storage.
                Checkpoint backends populate this with {file_path: file_data} for LangGraph state.
                External backends set None (already persisted to disk/S3/database/etc).
            occurrences: Number of replacements made, None on failure.

        Examples:
            >>> # Checkpoint storage
            >>> EditResult(path="/f.txt", files_update={"/f.txt": {...}}, occurrences=1)
            >>> # External storage
            >>> EditResult(path="/f.txt", files_update=None, occurrences=2)
            >>> # Error
            >>> EditResult(error="File not found")
        """

        error: str | None = None
        path: str | None = None
        files_update: dict[str, Any] | None = None
        occurrences: int | None = None


@runtime_checkable
class BackendProtocol(Protocol):
    """Protocol for pluggable memory backends (single, unified).

    Backends can store files in different locations (state, filesystem, database, etc.)
    and provide a uniform interface for file operations.

    All file data is represented as dicts with the following structure:
    {
        "content": list[str],      # Lines of text content
        "created_at": str,         # ISO format timestamp
        "modified_at": str,        # ISO format timestamp
    }
    """

    def ls(self, path: str) -> "LsResult":
        """List all files in a directory with metadata."""
        if hasattr(self, "ls_info") and callable(getattr(self, "ls_info")):
            try:
                entries = getattr(self, "ls_info")(path)
                return LsResult(entries=entries)
            except Exception as e:
                return LsResult(error=str(e))
        raise NotImplementedError

    async def als(self, path: str) -> "LsResult":
        """Async version of ls."""
        return await asyncio.to_thread(self.ls, path)

    def download_files(self, paths: list[str]) -> list["FileDownloadResponse"]:
        """Download multiple files from the backend."""
        responses: list[FileDownloadResponse] = []
        for path in paths:
            try:
                if hasattr(self, "_resolve_path") and callable(getattr(self, "_resolve_path")):
                    resolved_path = getattr(self, "_resolve_path")(path)
                    if resolved_path.is_dir():
                        responses.append(FileDownloadResponse(path=path, content=None, error=IS_DIRECTORY))
                        continue
                    if not resolved_path.exists():
                        responses.append(FileDownloadResponse(path=path, content=None, error=FILE_NOT_FOUND))
                        continue
                    with open(resolved_path, "rb") as f:
                        content_bytes = f.read()
                    responses.append(FileDownloadResponse(path=path, content=content_bytes, error=None))
                elif hasattr(self, "runtime") and hasattr(getattr(self, "runtime", None), "state"):
                    files = getattr(self.runtime, "state", {}).get("files", {})
                    file_data = files.get(path)
                    if file_data is None:
                        responses.append(FileDownloadResponse(path=path, content=None, error=FILE_NOT_FOUND))
                    else:
                        content_val = file_data.get("content", "")
                        if isinstance(content_val, list):
                            content_str = "\n".join(content_val)
                        else:
                            content_str = str(content_val)
                        responses.append(FileDownloadResponse(path=path, content=content_str.encode("utf-8"), error=None))
                else:
                    res = self.read(path)
                    if isinstance(res, str) and (res.startswith("Error:") or "not found" in res.lower()):
                        if "not found" in res.lower():
                            responses.append(FileDownloadResponse(path=path, content=None, error=FILE_NOT_FOUND))
                        else:
                            responses.append(FileDownloadResponse(path=path, content=None, error=res))
                    else:
                        content_bytes = res.encode("utf-8") if isinstance(res, str) else res
                        responses.append(FileDownloadResponse(path=path, content=content_bytes, error=None))
            except Exception as exc:
                responses.append(FileDownloadResponse(path=path, content=None, error=str(exc)))
        return responses

    async def adownload_files(self, paths: list[str]) -> list["FileDownloadResponse"]:
        """Async version of download_files."""
        return await asyncio.to_thread(self.download_files, paths)

    def ls_info(self, path: str) -> list["FileInfo"]:
        """Structured listing with file metadata."""
        ...

    def read(
        self,
        file_path: str,
        offset: int = 0,
        limit: int = 2000,
    ) -> str:
        """Read file content with line numbers or an error string."""
        ...

    def grep_raw(
        self,
        pattern: str,
        path: str | None = None,
        glob: str | None = None,
    ) -> list["GrepMatch"] | str:
        """Structured search results or error string for invalid input."""
        ...

    def glob_info(self, pattern: str, path: str = "/") -> list["FileInfo"]:
        """Structured glob matching returning FileInfo dicts."""
        ...

    def write(
        self,
        file_path: str,
        content: str,
    ) -> WriteResult:
        """Create a new file. Returns WriteResult; error populated on failure."""
        ...

    def edit(
        self,
        file_path: str,
        old_string: str,
        new_string: str,
        replace_all: bool = False,
    ) -> EditResult:
        """Edit a file by replacing string occurrences. Returns EditResult."""
        ...


@dataclass
class ExecuteResponse:
    """Result of code execution.

    Simplified schema optimized for LLM consumption.
    """

    output: str
    """Combined stdout and stderr output of the executed command."""

    exit_code: int | None = None
    """The process exit code. 0 indicates success, non-zero indicates failure."""

    truncated: bool = False
    """Whether the output was truncated due to backend limitations."""


@runtime_checkable
class SandboxBackendProtocol(BackendProtocol, Protocol):
    """Protocol for sandboxed backends with isolated runtime.

    Sandboxed backends run in isolated environments (e.g., separate processes,
    containers) and communicate via defined interfaces.
    """

    def execute(
        self,
        command: str,
    ) -> ExecuteResponse:
        """Execute a command in the process.

        Simplified interface optimized for LLM consumption.

        Args:
            command: Full shell command string to execute.

        Returns:
            ExecuteResponse with combined output, exit code, optional signal, and truncation flag.
        """
        ...

    @property
    def id(self) -> str:
        """Unique identifier for the sandbox backend."""
        ...


BackendFactory: TypeAlias = Callable[[ToolRuntime], BackendProtocol]
BACKEND_TYPES = BackendProtocol | BackendFactory


def _resolve_backend(backend: BACKEND_TYPES, runtime: ToolRuntime[Any, Any]) -> BackendProtocol:
    """Resolve a backend instance or backend factory."""
    if isinstance(backend, BackendProtocol):
        return backend
    return backend(runtime)

