from abc import ABC, abstractmethod
import os
import time
from typing import Any
import uuid
import zlib

import pyarrow as pa


class BaseEngineAdapter(ABC):
    engine_name = "base"

    @abstractmethod
    def apply_statement_timeout(self, cursor: Any, timeout_ms: int) -> None:
        pass

    @abstractmethod
    def generate_dialect_sql(self, sql: str) -> str:
        pass

    def write_ipc_buffer(self, rows: list[dict[str, Any]], columns: list[str]) -> bytes:
        """Sử dụng cơ chế IPC/PyArrow của Superset để chống nổ RAM"""
        # Tránh lỗi nếu rỗng
        if not rows:
            table = pa.Table.from_arrays([pa.array([]) for _ in columns], names=columns)
        else:
            # Chuyển dict list sang list các cột
            column_data = {col: [] for col in columns}
            for row in rows:
                for col in columns:
                    column_data[col].append(row.get(col))

            pa_arrays = [pa.array(column_data[col]) for col in columns]
            table = pa.Table.from_arrays(pa_arrays, names=columns)

        sink = pa.BufferOutputStream()
        with pa.ipc.new_stream(sink, table.schema) as writer:
            writer.write_table(table)

        # Nén giống Superset
        return zlib.compress(sink.getvalue().to_pybytes())

    def store_results_in_backend(self, compressed_data: bytes) -> str:
        """Lưu kết quả ngầm (Results Backend cache) thay vì giữ RAM"""
        import tempfile
        results_dir = os.path.join(tempfile.gettempdir(), "agent_results")
        os.makedirs(results_dir, exist_ok=True)
        key = str(uuid.uuid4())
        path = os.path.join(results_dir, f"{key}.arrow.zlib")
        with open(path, "wb") as f:
            f.write(compressed_data)
        return key

    def execute_and_buffer(self, conn: Any, sql: str, timeout_ms: int = 30000, chunk_size: int = 10000) -> dict[str, Any]:
        """Thực thi và stream từng chunk vào buffer IPC thay vì ném RAM toàn bộ (Streaming Essence)"""
        cursor = conn.cursor()
        self.apply_statement_timeout(cursor, timeout_ms)

        _t0 = time.perf_counter()
        cursor.execute(sql)
        elapsed_ms = int((time.perf_counter() - _t0) * 1000)

        col_names = [desc[0] for desc in cursor.description]

        sink = pa.BufferOutputStream()
        writer = None
        schema = None
        total_rows = 0
        preview = []

        # Tinh hoa: Lặp liên tục từng chunk để giữ RAM ổn định
        while True:
            rows = cursor.fetchmany(chunk_size)
            if not rows:
                break

            query_results = [dict(zip(col_names, r)) for r in rows]
            if total_rows == 0:
                preview = query_results[:5]

            total_rows += len(query_results)

            # Chuyển chunk thành RecordBatch
            column_data = {col: [] for col in col_names}
            for row in query_results:
                for col in col_names:
                    column_data[col].append(row.get(col))

            pa_arrays = [pa.array(column_data[col]) for col in col_names]

            if writer is None:
                schema = pa.schema([(col, pa_arrays[i].type) for i, col in enumerate(col_names)])
                writer = pa.ipc.new_stream(sink, schema)

            batch = pa.RecordBatch.from_arrays(pa_arrays, schema=schema)
            writer.write_batch(batch)

        if writer is not None:
            writer.close()
        else:
            # Trường hợp query không có dòng nào (Empty Result)
            schema = pa.schema([(col, pa.string()) for col in col_names])
            writer = pa.ipc.new_stream(sink, schema)
            writer.close()

        compressed_ipc = zlib.compress(sink.getvalue().to_pybytes())
        results_key = self.store_results_in_backend(compressed_ipc)

        return {
            "elapsed_ms": elapsed_ms,
            "columns": col_names,
            "results_count": total_rows,
            "results_key": results_key,
            "preview_data": preview
        }