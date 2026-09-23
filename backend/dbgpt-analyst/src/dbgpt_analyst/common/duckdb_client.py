"""
DuckDB Client Manager with lazy loading for federation query engine.
"""

import logging
import os
import threading
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class DuckDBClient:
    """
    Singleton class for DuckDB Federation with lazy loading.
    Handles cross-source querying logic.
    """
    _instance: Optional["DuckDBClient"] = None
    _lock = threading.Lock()

    def __init__(self):
        """
        Private constructor. Do not call directly.
        Use DuckDBClient.get_instance() instead.
        """
        if DuckDBClient._instance is not None:
            raise RuntimeError("Call get_instance() instead")

        logger.info("Initializing DuckDB Federation Engine (Lazy Load)...")
        import duckdb
        self.conn = duckdb.connect(database=":memory:")
        self.attached_sources: dict[str, str] = {}  # catalog_name -> source_id

        # Pre-install extensions we might need
        for ext in ("postgres", "mysql", "sqlite"):
            try:
                self.conn.execute(f"INSTALL {ext};")
                self.conn.execute(f"LOAD {ext};")
            except Exception as e:
                logger.debug(f"DuckDB extension '{ext}' install/load skipped: {e}")

    @classmethod
    def get_instance(cls) -> "DuckDBClient":
        """
        Static access method. Creates the instance only when first called.
        Uses a lock to ensure thread-safety during initial creation.
        """
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _catalog_name(self, source_id: int) -> str:
        """Deterministic catalog name for a source."""
        return f"src_{source_id}"

    def attach_source(self, source_id: int, db_type: str, connection_string: str) -> str:
        """
        ATTACH an external database to DuckDB so its tables become queryable.
        Returns the DuckDB catalog name (e.g. `src_3`).
        Idempotent - re-attaching the same source_id is a no-op.
        """
        catalog = self._catalog_name(source_id)
        if catalog in self.attached_sources:
            return catalog

        try:
            if db_type == "postgresql":
                if connection_string == "INTERNAL":
                    from dbgpt_analyst.common.db import resolve_conv_database_url
                    connection_string = resolve_conv_database_url()
                # The internal store may be SQLite while the temporary switch is
                # on, so attach it with the matching DuckDB extension.
                if connection_string.startswith("sqlite:"):
                    db_abs = os.path.abspath(
                        connection_string.replace("sqlite:///", "").replace("sqlite://", "")
                    )
                    self.conn.execute(
                        f"ATTACH '{db_abs}' AS {catalog} (TYPE SQLITE, READ_ONLY);"
                    )
                else:
                    self.conn.execute(
                        f"ATTACH '{connection_string}' AS {catalog} (TYPE POSTGRES, READ_ONLY);"
                    )

            elif db_type == "mysql":
                # DuckDB mysql extension expects: host=... user=... password=... database=...
                parsed = urlparse(connection_string)
                mysql_conn = (
                    f"host={parsed.hostname} "
                    f"user={parsed.username} "
                    f"password={parsed.password or ''} "
                    f"port={parsed.port or 3306} "
                    f"database={parsed.path.lstrip('/')}"
                )
                self.conn.execute(
                    f"ATTACH '{mysql_conn}' AS {catalog} (TYPE MYSQL, READ_ONLY);"
                )

            elif db_type == "sqlite":
                db_abs = os.path.abspath(connection_string)
                self.conn.execute(
                    f"ATTACH '{db_abs}' AS {catalog} (TYPE SQLITE, READ_ONLY);"
                )
            else:
                raise ValueError(f"Unsupported db_type for federation: {db_type}")

            self.attached_sources[catalog] = str(source_id)
            logger.info(f"Attached source {source_id} ({db_type}) as DuckDB catalog '{catalog}'")
            return catalog

        except Exception as e:
            logger.error(f"Failed to attach source {source_id} ({db_type}): {e}")
            raise

    def detach_source(self, source_id: int) -> None:
        """Detach a previously attached source from DuckDB."""
        catalog = self._catalog_name(source_id)
        if catalog not in self.attached_sources:
            return
        try:
            self.conn.execute(f"DETACH {catalog};")
        except Exception as e:
            logger.warning(f"Error detaching catalog '{catalog}': {e}")
        finally:
            self.attached_sources.pop(catalog, None)

    def execute(self, query: str):
        """Execute a query directly on DuckDB."""
        return self.conn.execute(query)

    def shutdown(self) -> None:
        """Detach all sources and close the DuckDB connection."""
        for catalog in list(self.attached_sources.keys()):
            try:
                self.conn.execute(f"DETACH {catalog};")
            except Exception:
                pass
        self.attached_sources.clear()
        try:
            self.conn.close()
        except Exception:
            pass
        DuckDBClient._instance = None
        logger.info("DuckDB Federation Engine shut down.")
