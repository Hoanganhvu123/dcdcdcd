# Phần đã xác nhận ngày 16/09/2026

## DONE trong đợt này

- Tạo folder kế hoạch, kiến trúc, audit streaming và backlog theo bằng chứng source.
- Xác nhận tồn tại core, graphs, guard, events, prompts và execution adapter.
- Xác nhận main_agent.py là facade; events_schemas/schemas_stream.py là re-export.
- Tái hiện lỗi closing-tag split và EOF trong controller bằng class trích AST, không gọi mạng.
- Chạy `python3 scripts/ast_sentinel_auditor.py`: exit 0, scan 150 file, báo 0 vi phạm. Đây là kết quả heuristic của script, có exclusions, không phải chứng minh mọi prompt trong repo đều externalized.

## Giới hạn kiểm chứng

- Test frontend `node --experimental-strip-types tests/stream-xml-filter.check.mjs` không chạy được: Node v22.22.1 báo ERR_NO_TYPESCRIPT; local frontend không có tsx executable. Không tính là test pass hoặc lỗi business logic.
- Chưa chạy full pytest, full frontend regression hoặc E2E với model/DB thật.
- Typecheck ghi kết quả riêng trong validation.md.
- Không thay code runtime; không xóa folder hay di chuyển tài liệu cũ.
