# Backlog triển khai và điều kiện chốt

## Thứ tự ưu tiên

| ID | Ưu tiên | Công việc | Điều kiện DONE |
|---|---|---|---|
| T01 | P1 | Inventory route UI -> transport -> graph; chốt ownership cho ba đường stream | Bảng mode/route có consumer, request schema, history, upload, artifact và terminal behavior |
| T02 | P1 | Sửa controller token filter và EOF | Regression mọi split point; không lẫn reasoning/prose; giữ phép so sánh có dấu < |
| T03 | P1 | Chuẩn hóa event envelope và custom serializer | Fixture Python serializer -> TS reducer nhận đủ type/payload/agent identity |
| T04 | P1 | Test fail-closed khi validation SQL hết retry | Executor không được gọi khi validation thất bại theo policy; test SQL guard riêng |
| T05 | P1 | Hợp nhất execution service sau khi có parity | API giữ auth/upload/mode; không mất history, cache, file, chart, artifact, forced routing |
| T06 | P2 | Áp dụng state chuyên biệt ở graph boundary | Input/output tối thiểu, reducers rõ, không mất field khi adapter chuyển state |
| T07 | P2 | Dọn import facade và mode graph | Inventory consumer trước/sau; test import compatibility; không xóa wrapper còn dùng |
| T08 | P2 | Tách OpenWork store theo trách nhiệm | Tách transport, session persistence, tool loop; test abort/race/hydration vẫn đạt |
| T09 | P2 | Kiểm chứng guards, lifecycle, tool identity trên đường thực | Test budget/doom-loop, startup-shutdown, cancellation và tool_call_id |
| T10 | P2 | Đồng bộ PROJECT.md, runbook và kết quả kiểm thử | Từng DONE có evidence mới; ghi rõ skipped/blocked; bỏ cam kết full pass thiếu bằng chứng |

Thứ tự: T01 -> T02/T03/T04 -> T05 -> T06/T07/T08/T09 -> T10. Với T04 cần phân biệt validation nghiệp vụ và security SQL guard. Không đổi hành vi bằng một lần di chuyển toàn bộ thư mục.

## Cách chia đợt code

1. Fix filter độc lập kèm regression, chưa đổi API routing.
2. Chốt contract event và thêm fixture liên ngôn ngữ.
3. Bọc runtime API đang dùng thành service; thay implementation khi đạt parity.
4. Thu gọn state/import/module; chạy test theo vùng thay đổi.
5. Chạy suite offline, typecheck, build và E2E cần dịch vụ để nghiệm thu tích hợp.

## Checklist đóng đợt

- [ ] Mỗi thay đổi có lý do, phạm vi ảnh hưởng và bằng chứng kiểm thử.
- [ ] T01–T05 hoàn tất trước khi gọi kiến trúc streaming đã thống nhất.
- [ ] Không xóa compatibility imports còn consumer.
- [ ] Live scenario: SQL, report, web, hybrid, office, upload, chart/artifact, cancel, concurrent sessions.
- [ ] Backend regression, frontend regression, typecheck và build có log.
- [ ] Cập nhật trạng thái trong README và chuyển task đạt điều kiện vào done/.

Hiện tại các mục triển khai trên đều TODO. Bộ tài liệu ngày 16/09 không phải bằng chứng chúng đã được sửa.
