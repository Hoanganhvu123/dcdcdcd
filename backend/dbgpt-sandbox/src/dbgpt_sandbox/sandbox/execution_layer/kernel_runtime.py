"""OS-kernel confinement for locally executed sandbox code.

The local runtime executes untrusted code as a plain child process. Its only
containment today is :meth:`SecurityUtils.validate_code`, a substring blacklist
(``"import os"``, ``"eval("``, ...) that any generated code defeats by splitting
a literal or base64-decoding it. Environment leakage is already handled --
:func:`local_runtime.build_child_env` filters the parent environment to an
allowlist -- but the filesystem is not: a child process can still read and write
anything the server account can.

This module adds the missing half: the argv a supervisor would run is rewritten
into an argv that the *kernel* confines, so escaping it requires a kernel bug
rather than a clever string.

Two invariants, both ported from the DeepSeek Harness sandbox:

* **Fail-closed.** When confinement is required but no backend is available,
  :class:`SandboxUnavailable` is raised. No path in this module silently
  returns an unwrapped argv.
* **Orthogonal denials.** A sandbox denial is not an exit code. Each backend
  publishes the stderr signatures it emits on refusal
  (:attr:`ConfinedCommand.denial_signatures`) so a caller can tell "the policy
  said no" from "the program failed", including when the program exits 0.

Backends: Bubblewrap on Linux, ``sandbox-exec`` (Seatbelt) on macOS. Windows has
no equivalent primitive reachable without a new dependency -- see
:meth:`KernelSandboxRunner._wrap_windows`.
"""

from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass, field
from typing import List, Optional

__all__ = [
    "SandboxUnavailable",
    "ConfinedCommand",
    "KernelSandboxRunner",
    "confinement_policy",
    "POLICY_ENV_VAR",
]

#: Environment variable selecting the confinement policy.
#:
#: ``off`` (default) leaves the local runtime exactly as it was, so enabling
#: this module is an explicit operator decision rather than a silent behaviour
#: change on upgrade. ``require`` refuses to run at all without a kernel
#: backend. ``prefer`` confines when a backend exists and runs bare otherwise --
#: useful on a developer machine, never in production.
POLICY_ENV_VAR = "DBGPT_KERNEL_SANDBOX"

_VALID_POLICIES = ("off", "prefer", "require")


class SandboxUnavailable(RuntimeError):
    """Confinement was required but no kernel backend could provide it."""


def confinement_policy() -> str:
    """Current policy: ``"off"``, ``"prefer"`` or ``"require"``.

    An unrecognised value is treated as ``"require"``. A typo in the deployment
    config must not quietly downgrade to running untrusted code bare.
    """
    raw = (os.environ.get(POLICY_ENV_VAR) or "off").strip().lower()
    return raw if raw in _VALID_POLICIES else "require"


@dataclass(frozen=True)
class ConfinedCommand:
    """An argv rewritten to run under a kernel confinement backend."""

    argv: List[str]
    backend: str
    workspace_root: str
    temp_dir: str
    denial_signatures: List[str] = field(default_factory=list)

    @property
    def confined(self) -> bool:
        return self.backend != "none"

    def is_denial(self, stderr: str) -> bool:
        """Whether ``stderr`` carries this backend's refusal signature."""
        if not stderr:
            return False
        return any(sig in stderr for sig in self.denial_signatures)


class KernelSandboxRunner:
    """Rewrites an argv so the kernel, not a regex, enforces the boundary.

    The runner only *builds* commands; spawning, timeouts and process-tree kills
    stay with the caller, which already implements them
    (``LocalSandboxSession._run_with_limits``).
    """

    def __init__(
        self,
        workspace_root: str,
        temp_dir: Optional[str] = None,
        read_only: bool = False,
        policy: Optional[str] = None,
    ) -> None:
        self.workspace_root = os.path.abspath(workspace_root)
        # Default the scratch directory *inside* the workspace: a separate host
        # temp path would be a second writable mount to reason about, and the
        # child already has the workspace.
        self.temp_dir = os.path.abspath(
            temp_dir or os.path.join(self.workspace_root, ".tmp")
        )
        self.read_only = read_only
        self.policy = policy or confinement_policy()

    # -- backend detection -------------------------------------------------

    @staticmethod
    def detect_backend() -> str:
        """Name of the usable backend, or ``"none"``."""
        if sys.platform.startswith("linux"):
            return "bubblewrap" if shutil.which("bwrap") else "none"
        if sys.platform == "darwin":
            return "seatbelt" if shutil.which("sandbox-exec") else "none"
        return "none"

    @classmethod
    def available(cls) -> bool:
        return cls.detect_backend() != "none"

    # -- public API --------------------------------------------------------

    def wrap(self, argv: List[str]) -> ConfinedCommand:
        """Return ``argv`` wrapped for the active backend.

        Raises :class:`SandboxUnavailable` when the policy demands confinement
        and none is available. Never returns an unconfined command unless the
        policy explicitly permits it.
        """
        if not argv:
            raise ValueError("argv must not be empty")

        if self.policy == "off":
            return self._unconfined(argv)

        backend = self.detect_backend()
        if backend == "none":
            if self.policy == "require":
                raise SandboxUnavailable(
                    f"{POLICY_ENV_VAR}=require but no kernel sandbox backend is "
                    f"available on {sys.platform}: install bubblewrap (Linux) or "
                    "use a container runtime (docker/podman/nerdctl). Refusing "
                    "to execute untrusted code unconfined."
                )
            return self._unconfined(argv)

        os.makedirs(self.temp_dir, exist_ok=True)
        if backend == "bubblewrap":
            return self._wrap_linux(argv)
        if backend == "seatbelt":
            return self._wrap_macos(argv)
        return self._wrap_windows(argv)  # pragma: no cover - unreachable today

    # -- backends ----------------------------------------------------------

    def _unconfined(self, argv: List[str]) -> ConfinedCommand:
        return ConfinedCommand(
            argv=list(argv),
            backend="none",
            workspace_root=self.workspace_root,
            temp_dir=self.temp_dir,
            denial_signatures=[],
        )

    def _wrap_linux(self, argv: List[str]) -> ConfinedCommand:
        """Bubblewrap: read-only root, private namespaces, writable workspace."""
        wrapped = [
            "bwrap",
            # Whole filesystem readable so interpreters and shared libraries
            # resolve, but nothing outside the binds below is writable.
            "--ro-bind", "/", "/",
            "--dev", "/dev",
            "--proc", "/proc",
            # Shadow the host /tmp so leftovers from other sessions are invisible.
            "--tmpfs", "/tmp",
            "--bind", self.temp_dir, self.temp_dir,
            "--ro-bind" if self.read_only else "--bind",
            self.workspace_root, self.workspace_root,
            "--chdir", self.workspace_root,
            # Drops the network, PID, IPC, UTS and user namespaces in one flag.
            "--unshare-all",
            # Guarantees no orphan survives a supervisor crash.
            "--die-with-parent",
            "--",
        ]
        wrapped.extend(argv)
        return ConfinedCommand(
            argv=wrapped,
            backend="bubblewrap",
            workspace_root=self.workspace_root,
            temp_dir=self.temp_dir,
            denial_signatures=["Permission denied", "Operation not permitted"],
        )

    def _wrap_macos(self, argv: List[str]) -> ConfinedCommand:
        """Seatbelt: deny-by-default profile compiled per session."""
        if self.read_only:
            write_rule = "(deny file-write*)"
        else:
            write_rule = (
                "(allow file-write*"
                ' (subpath "{ws}")'
                ' (subpath "{tmp}")'
                ' (subpath "/private/tmp")'
                ' (literal "/dev/null")'
                ' (literal "/dev/zero"))'
            ).format(ws=self.workspace_root, tmp=self.temp_dir)
        profile = (
            "(version 1)"
            "(deny default)"
            "(allow process-exec*)"
            "(allow process-fork)"
            "(allow sysctl-read)"
            "(allow file-read*)"
            + write_rule
        )
        wrapped = ["sandbox-exec", "-p", profile, "--"]
        wrapped.extend(argv)
        return ConfinedCommand(
            argv=wrapped,
            backend="seatbelt",
            workspace_root=self.workspace_root,
            temp_dir=self.temp_dir,
            denial_signatures=[
                "Operation not permitted",
                "deny file-write",
                "sandbox-exec: ",
            ],
        )

    def _wrap_windows(self, argv: List[str]) -> ConfinedCommand:
        """Not implemented -- fails closed rather than pretending.

        ponytail: Windows has no dependency-free equivalent of bwrap. Real
        confinement needs ``CreateRestrictedToken`` with ``WRITE_RESTRICTED``
        plus a Job Object, which means adding pywin32 and a chunk of untestable
        ctypes. Until that is worth its weight, Windows deployments get
        confinement from the container runtimes (docker/podman/nerdctl) already
        implemented in this package. Upgrade path: pywin32
        ``CreateRestrictedToken`` + ``AssignProcessToJobObject``, denial
        signatures ``["Access is denied", "PermissionDenied"]``.
        """
        raise SandboxUnavailable(
            "Kernel confinement is not implemented on Windows; use a container "
            "runtime (docker/podman/nerdctl) for untrusted code."
        )


if __name__ == "__main__":  # pragma: no cover - runnable check
    import tempfile

    ws = tempfile.mkdtemp(prefix="kernel_sandbox_check_")
    payload = ["python", "-c", "print(1)"]

    # Policy default is off -> passthrough, so an upgrade changes nothing.
    os.environ.pop(POLICY_ENV_VAR, None)
    cmd = KernelSandboxRunner(ws).wrap(payload)
    assert cmd.backend == "none" and cmd.argv == payload, cmd
    assert not cmd.confined

    # An unknown policy value must escalate, never downgrade.
    os.environ[POLICY_ENV_VAR] = "yolo"
    assert confinement_policy() == "require", confinement_policy()

    # require + no backend -> halt. On a machine that *has* a backend, the same
    # policy must instead produce a wrapped argv still ending in the payload.
    runner = KernelSandboxRunner(ws, policy="require")
    if KernelSandboxRunner.available():
        cmd = runner.wrap(payload)
        assert cmd.confined, cmd
        assert cmd.argv[-3:] == payload, cmd.argv
        assert cmd.argv[0] in ("bwrap", "sandbox-exec"), cmd.argv
        assert ws in " ".join(cmd.argv), cmd.argv
        assert cmd.is_denial("open: Operation not permitted")
        assert not cmd.is_denial("ZeroDivisionError")
    else:
        try:
            runner.wrap(payload)
        except SandboxUnavailable:
            pass
        else:
            raise AssertionError("require policy must fail closed without a backend")

    # prefer degrades instead of halting.
    cmd = KernelSandboxRunner(ws, policy="prefer").wrap(["true"])
    assert cmd.confined == KernelSandboxRunner.available(), cmd

    # Empty argv is a caller bug, not a policy question.
    try:
        KernelSandboxRunner(ws, policy="off").wrap([])
    except ValueError:
        pass
    else:
        raise AssertionError("empty argv must be rejected")

    os.environ.pop(POLICY_ENV_VAR, None)
    shutil.rmtree(ws, ignore_errors=True)
    print("kernel_runtime self-check OK (backend=%s)" % KernelSandboxRunner.detect_backend())
