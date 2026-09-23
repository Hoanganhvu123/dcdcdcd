# Audit logic streaming

## F1 — Controller không phải đường stream duy nhất [P1]

Bằng chứng: `analyst_api.py` import và gọi `stream_ai_analytic_agent`; `analyst_streamer.py` import `main_agent.build_main_graph`. Controller tự tạo graph và stream riêng. OpenWork store gọi `streamDeepSeekChat`.

Tác động: sửa controller chưa đảm bảo sửa được lỗi trên UI; khác biệt lifecycle, event shape, history, file/mode có thể tồn tại. Trước khi hợp nhất cần fixture parity theo từng mode, gồm upload và artifact.

## F2 — Closing tag cắt giữa chunk bị nhận sai [P1, đã tái hiện]

Chạy class `StreamTokenFilter` trích nguyên AST từ `controller.py`, không import app hoặc gọi model:

```text
input '<think>reason</thi' -> reasoning 'reason</thi', prose ''
input 'nk>answer'         -> reasoning 'nk>answer', prose ''
```

Kỳ vọng reasoning `reason`, answer `answer`. Nhánh in_think đẩy toàn bộ buffer khi chưa thấy closing tag đầy đủ; mất prefix `</thi`, giữ sai trạng thái. Nhánh tool có cấu trúc tương tự, cần regression cho mọi vị trí cắt. Phát hiện này thuộc controller; chưa chứng minh UI hiện hành đi qua filter này.

Cách sửa: giữ suffix có thể là prefix của tag đóng; parse tiếp khi có chunk mới. Test mọi split point của think/thought/tool_call, Unicode và nhiều tag trong một chunk.

## F3 — EOF có thể làm mất prose [P1, đã tái hiện]

`process_chunk('value < 3')` trả prose `value `, giữ buffer `< 3`. Controller không flush filter trước FinalEvent. Cần flush với quy tắc rõ cho prose hợp lệ, tag dở dang và stream bị hủy.

## F4 — Tài liệu event không khớp code [P1]

`PROJECT.md` minh họa `{type, data}`; `events/base.py::BaseEvent` định nghĩa `{type, payload}`. Controller nhánh custom dict tự serialize `data` dưới SSE event name, còn event model dùng `event_to_sse`. `use-analyst-chat.ts::consumeSSELines` chỉ parse dòng `data: `, không lấy tên từ dòng `event:`.

Cần fixture chứng minh custom event giữ được type/payload khi qua serializer -> client reducer. Chuẩn hóa envelope tại một biên; không đổi protocol trước khi cập nhật consumer.

## F5 — Controller bỏ qua một phần dữ liệu [P2]

`updates` hiện là `pass`; biến `tool` từ filter không được emit; metadata của message chưa được dùng để phân biệt agent. Cần quyết định updates phục vụ gì, tool text được parse hay bỏ có chủ đích, và token worker nào được phép vào answer. Đây là khoảng trống contract cần chốt, không mặc định mọi update phải lên UI.

## Bộ ca kiểm chứng bắt buộc

- Message và custom event từ nested subagent giữ parent/tool identity, không lặp text.
- UTF-8 bị cắt ở byte boundary; SSE frame bị cắt tùy vị trí; LF/CRLF; terminal marker.
- Abort khi đổi session, hai request chồng nhau, callback cũ không ghi đè state mới.
- Model lỗi giữa stream; chỉ một kết quả terminal, UI thoát trạng thái loading.
- Final answer không bị mất, nhân đôi hoặc lẫn reasoning/tool XML.
- Artifact và chart vẫn cập nhật đúng task/agent sau khi hợp nhất stream.

Các ca trên là điều kiện triển khai tiếp; chưa có kết quả live E2E trong audit này.
