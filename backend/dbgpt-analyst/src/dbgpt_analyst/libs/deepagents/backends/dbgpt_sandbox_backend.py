"""DbgptSandboxBackend — sandbox backend adapter integrating with dbgpt-sandbox / Docker."""
from __future__ import annotations

import logging
import subprocess
from typing import Any

from .protocol import ExecuteResponse
from .sandbox import BaseSandbox

logger = logging.getLogger(__name__)


class DbgptSandboxBackend(BaseSandbox):
    """Sandbox backend implementation connecting to DB-GPT Sandbox / Docker runtime."""

    def __init__(
        self,
        sandbox_id: str = "dbgpt-sandbox",
        timeout_sec: float = 60.0,
        working_dir: str | None = None,
        **kwargs: Any,
    ):
        self._id = sandbox_id
        self._timeout_sec = timeout_sec
        self._working_dir = working_dir
        self._kwargs = kwargs

    @property
    def id(self) -> str:
        """Unique identifier for the sandbox backend."""
        return self._id

    def execute(self, command: str) -> ExecuteResponse:
        """Execute a shell command within the sandbox environment.

        Attempts to execute within the DB-GPT Docker sandbox when available,
        falling back to a subprocess execution with timeout and output capture.
        """
        logger.debug("[DbgptSandboxBackend] Executing command in sandbox %s: %s", self._id, command)

        # 1. Try DB-GPT Sandbox Docker execution layer if available
        try:
            from dbgpt_sandbox.sandbox.control_layer.docker_manager import DockerManager
            # If docker manager is actively running
            if hasattr(DockerManager, "execute_command"):
                result = DockerManager.execute_command(command, timeout=self._timeout_sec)
                output = getattr(result, "output", str(result))
                exit_code = getattr(result, "exit_code", 0)
                return ExecuteResponse(
                    output=output,
                    exit_code=exit_code,
                    truncated=len(output) > 50000,
                )
        except Exception:
            # Fall through to subprocess execution
            pass

        # 2. Subprocess execution
        try:
            proc = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=self._timeout_sec,
                cwd=self._working_dir,
            )
            output = proc.stdout
            if proc.stderr:
                output = f"{output}\n{proc.stderr}" if output else proc.stderr
            return ExecuteResponse(
                output=output,
                exit_code=proc.returncode,
                truncated=len(output) > 50000,
            )
        except subprocess.TimeoutExpired:
            return ExecuteResponse(
                output=f"Execution timed out after {self._timeout_sec}s",
                exit_code=124,
                truncated=False,
            )
        except Exception as e:
            return ExecuteResponse(
                output=f"Execution error: {e}",
                exit_code=1,
                truncated=False,
            )
