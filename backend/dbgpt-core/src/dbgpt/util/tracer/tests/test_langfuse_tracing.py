import base64
import importlib
import os
import sys
import threading

import pytest

from dbgpt.util.tracer.tracer_impl import TracerParameters


class TestLangfuseTracing:
    def test_no_key_init_returns_none(self, monkeypatch):
        monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
        from dbgpt.util.tracer.langfuse_client import init_langfuse

        result = init_langfuse("", "")
        assert result is None

    def test_no_key_langfuse_exporter_not_added(self, monkeypatch):
        monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
        from dbgpt.util.tracer.opentelemetry import OpenTelemetrySpanStorage

        storage = OpenTelemetrySpanStorage(
            service_name="test",
            otlp_endpoint="http://localhost:4317",
            otlp_insecure=True,
            langfuse_public_key=None,
            langfuse_secret_key=None,
            langfuse_host=None,
        )
        processor_count = len(
            storage.tracer_provider._active_span_processor._span_processors
        )
        assert processor_count == 1

    def test_singleton_same_object(self, monkeypatch):
        monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)

        try:
            import langfuse  # noqa: F401

            import dbgpt.util.tracer.langfuse_client as lf

            original = lf._langfuse_client
            try:
                lf._langfuse_client = None
                c1 = lf.init_langfuse("pk-test", "sk-test")
                c2 = lf.init_langfuse("pk-test", "sk-test")
                assert c1 is c2
            finally:
                lf._langfuse_client = original
        except ImportError:
            pytest.skip("langfuse not installed")

    def test_concurrency_single_instance(self, monkeypatch):
        monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)

        try:
            import langfuse  # noqa: F401

            import dbgpt.util.tracer.langfuse_client as lf

            results = []
            barrier = threading.Barrier(10)

            def _init():
                barrier.wait()
                results.append(lf.init_langfuse("pk-test", "sk-test"))

            original = lf._langfuse_client
            try:
                lf._langfuse_client = None
                threads = [threading.Thread(target=_init) for _ in range(10)]
                for t in threads:
                    t.start()
                for t in threads:
                    t.join()
                first = results[0]
                for r in results:
                    assert r is first
            finally:
                lf._langfuse_client = original
        except ImportError:
            pytest.skip("langfuse not installed")

    def test_decorator_noop_when_disabled(self, monkeypatch):
        monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
        from dbgpt.util.tracer.langfuse_client import get_langfuse_decorator

        dec = get_langfuse_decorator("", "")
        assert dec is None

    def test_no_langchain_core_import(self):
        sys.modules.pop("langchain_core", None)
        import dbgpt.util.tracer.langfuse_client as lf

        importlib.reload(lf)
        assert "langchain_core" not in sys.modules

    def test_tracer_parameters_defaults(self):
        p = TracerParameters()
        assert p.langfuse_public_key is None
        assert p.langfuse_secret_key is None
        assert p.langfuse_host == "https://cloud.langfuse.com"
        assert not p.langfuse_enabled

    def test_tracer_parameters_from_env(self, monkeypatch):
        monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-env")
        monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-env")
        monkeypatch.setenv("LANGFUSE_HOST", "https://custom.langfuse.com")
        p = TracerParameters()
        assert p.langfuse_public_key == "pk-env"
        assert p.langfuse_secret_key == "sk-env"
        assert p.langfuse_host == "https://custom.langfuse.com"
        assert p.langfuse_enabled

    def test_toml_wins_over_env(self, monkeypatch):
        monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-env")
        monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-env")
        p = TracerParameters(
            langfuse_public_key="pk-toml",
            langfuse_secret_key="sk-toml",
        )
        assert p.langfuse_public_key == "pk-toml"
        assert p.langfuse_secret_key == "sk-toml"
        assert p.langfuse_enabled

    def test_decorator_toml_params_no_env(self, monkeypatch):
        monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
        try:
            import langfuse  # noqa: F401
        except ImportError:
            pytest.skip("langfuse not installed")

        from dbgpt.component import SystemApp
        from dbgpt.util.tracer.langfuse_client import (
            get_langfuse_decorator_for_system,
            get_trace_config,
            register_trace_config,
        )

        system_app = SystemApp()
        toml_params = TracerParameters(
            langfuse_public_key="pk-toml",
            langfuse_secret_key="sk-toml",
            langfuse_host="https://toml.langfuse.com",
        )
        register_trace_config(system_app, toml_params)
        assert get_trace_config(system_app) is toml_params

        dec = get_langfuse_decorator_for_system(system_app)
        assert dec is not None

    def test_analytics_client_uses_toml_params(self, monkeypatch):
        monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-env")
        monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-env")
        monkeypatch.setenv("LANGFUSE_HOST", "https://env.langfuse.com")

        from dbgpt.util.tracer.langfuse_client import LangfuseAnalyticsClient

        toml_params = TracerParameters(
            langfuse_public_key="pk-toml",
            langfuse_secret_key="sk-toml",
            langfuse_host="https://toml.langfuse.com",
        )
        client = LangfuseAnalyticsClient(params=toml_params)
        assert client.public_key == "pk-toml"
        assert client.secret_key == "sk-toml"
        assert client.base_url == "https://toml.langfuse.com"
        headers = client._get_auth_headers()
        assert headers["Authorization"] == (
            "Basic " + base64.b64encode(b"pk-toml:sk-toml").decode()
        )


def test_flush_noop_without_client():
    from dbgpt.util.tracer.langfuse_client import flush_langfuse

    flush_langfuse()
