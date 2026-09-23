# Kế hoạch kiến trúc agent — 16/09/2026

Snapshot: commit `07fab3d12`, rà soát code local ngày 16/09/2026.

**Kết luận: đã có nền tảng refactor, còn việc cần code; chưa đủ bằng chứng để chốt toàn hệ thống DONE.** `PROJECT.md` đánh dấu tất cả milestone DONE nhưng chưa phản ánh đầy đủ các đường runtime đang tồn tại.

## Đọc theo thứ tự

1. [Kiến trúc hiện tại](01-kien-truc-agent.md): module, trách nhiệm, luồng thực tế.
2. [Logic streaming và vấn đề](02-streaming-audit.md): phát hiện có bằng chứng và tác động.
3. [Backlog triển khai](03-ke-hoach-clean-code.md): thứ tự sửa, điều kiện nghiệm thu.
4. [Phần đã xác nhận](done/README.md): những gì có trong code và giới hạn kiểm chứng.

## Trạng thái

| Hạng mục | Trạng thái ngày 16/09 |
|---|---|
| Rà soát kiến trúc và tạo kế hoạch | DONE trong phạm vi các file đã đọc |
| Khung core / graphs / guard / events / prompts | Có code; chưa đồng nghĩa runtime đã hợp nhất |
| Controller là entrypoint duy nhất | Chưa: HTTP API vẫn dùng analyst_streamer |
| Chia state theo agent | Một phần: SQL/web vẫn dùng MainAgentState |
| Streaming controller đúng với mọi chunk boundary | Chưa: tái hiện lỗi closing tag và EOF |
| Typecheck, full regression, live E2E | Xem bằng chứng; không suy ra từ trạng thái cũ |
| Sửa runtime theo backlog | TODO, chưa thực hiện trong đợt lập kế hoạch |

Quy ước: chỉ chuyển task sang `done/` sau khi có diff và kết quả kiểm chứng phù hợp. Không chuyển tài liệu cũ hoặc xóa compatibility facade chỉ vì tên thư mục trùng. Đợt này bổ sung tài liệu kế hoạch; không chỉnh code runtime.
