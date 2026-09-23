"""Environment confinement for the local sandbox runtime.

The local runtime runs untrusted code as a plain child process, so whatever sits
in that child's environment is readable by the code being sandboxed. It used to
be spawned with ``env=dict(os.environ, ...)``, handing every sandboxed snippet
the server's own secrets.
"""

import os

import pytest

from dbgpt_sandbox.sandbox.execution_layer.local_runtime import build_child_env


@pytest.fixture
def host_secrets(monkeypatch):
    """Plant secret-shaped variables in the host environment."""
    secrets = {
        "DEEPSEEK_API_KEY": "sk-should-never-reach-the-sandbox",
        "LANGFUSE_SECRET_KEY": "lf-should-never-reach-the-sandbox",
        "CONV_DATABASE_URL": "postgresql://should-never-reach-the-sandbox",
        "AWS_SECRET_ACCESS_KEY": "should-never-reach-the-sandbox",
    }
    for name, value in secrets.items():
        monkeypatch.setenv(name, value)
    return secrets


def test_host_secrets_are_not_inherited(host_secrets):
    env = build_child_env({})
    for name in host_secrets:
        assert name not in env, f"{name} leaked into the sandbox environment"


def test_secret_values_absent_even_under_other_names(host_secrets):
    """Guard against a variable being renamed rather than dropped."""
    leaked = set(build_child_env({}).values()) & set(host_secrets.values())
    assert not leaked


def test_process_basics_survive():
    """Over-scrubbing is its own failure: the child must still be able to start."""
    env = build_child_env({})
    required = "SYSTEMROOT" if os.name == "nt" else "PATH"
    assert required in env


def test_session_vars_are_passed_through():
    env = build_child_env({"MY_SESSION_VAR": "value"})
    assert env["MY_SESSION_VAR"] == "value"


def test_session_vars_override_host(monkeypatch):
    monkeypatch.setenv("LANG", "host-value")
    assert build_child_env({"LANG": "session-value"})["LANG"] == "session-value"


def test_no_host_mutation(host_secrets):
    """build_child_env must not write back into the server's own environment."""
    before = dict(os.environ)
    build_child_env({"MY_SESSION_VAR": "value"})
    assert "MY_SESSION_VAR" not in os.environ
    assert dict(os.environ) == before


@pytest.mark.asyncio
async def test_local_runtime_refuses_unenforceable_network_isolation():
    """Fail closed: the local runtime cannot remove the host network stack.

    Starting anyway would run with full network access while the caller believes
    it was disabled.
    """
    from dbgpt_sandbox.sandbox.execution_layer.base import SessionConfig
    from dbgpt_sandbox.sandbox.execution_layer.local_runtime import LocalSandboxSession

    session = LocalSandboxSession(
        "net", SessionConfig(language="python", network_disabled=True)
    )
    assert await session.start() is False


@pytest.mark.asyncio
async def test_local_runtime_starts_without_network_isolation():
    from dbgpt_sandbox.sandbox.execution_layer.base import SessionConfig
    from dbgpt_sandbox.sandbox.execution_layer.local_runtime import LocalSandboxSession

    session = LocalSandboxSession("ok", SessionConfig(language="python"))
    assert await session.start() is True
    await session.stop()
