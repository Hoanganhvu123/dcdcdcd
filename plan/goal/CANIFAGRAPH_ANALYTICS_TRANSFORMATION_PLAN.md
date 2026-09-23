# KIẾN TRÚC TINH HOA: KẾ THỪA TỪ CANIFA_TEST VÀO DB-GPT ANALYST

> **Tài liệu quy hoạch & lộ trình triển khai chi tiết (`/goal`)**  
> **Nguồn tham chiếu**: `/home/vu-hoang-anh/project/canifa/canifa_test`  
> **Hệ thống đích**: `/home/vu-hoang-anh/project/db gpt` (`dbgpt-analyst` & `frontend/components/openwork`)

---

## I. TỔNG QUAN ĐỐI CHIẾU: CANIFA_TEST vs DB-GPT

| Hạng mục kiến trúc | `canifa_test` (Mẫu chuẩn Senior Staff) | Hiện trạng `db gpt` (Cần nâng cấp) | Phương án tinh hoa chuyển giao |
| :--- | :--- | :--- | :--- |
| **1. Quản lý Kỹ năng (Skills)** | **Progressive Skills Registry**: Quét Level 1 (YAML frontmatter siêu nhẹ) + Tải Level 2 (Markdown procedure khi cần). Có quy tắc thẩm định (validation rules), trần pháp lý, mandatory tools. | Kỹ năng chia nhỏ dạng python tools tĩnh hoặc config rời rạc, chưa có catalog phân tầng metadata/procedure. | Xây dựng `dbgpt_analyst/skills/` theo chuẩn **Deep Agents / Progressive Registry**: Level 1 scan YAML + Level 2 lazy load markdown cho các kỹ năng Data Analytics (SQL tuning, RFM, Financial modeling...). |
| **2. Giao thức Stream (SSE)** | **DualFormatStreamAdapter**: Chuẩn hóa envelope `schemaVersion: 1`, `runId`, `seq`, hỗ trợ song song cả Vercel AI SDK v6 (`0:...`, `b:...`) và Legacy SSE. | Emit SSE thô `data: {"event": ...}` qua `StreamTokenFilter`, chưa có `seq`, thiếu schema envelope đồng nhất. | Áp dụng `DualFormatStreamAdapter` vào `dbgpt-analyst/events/` và `controller.py`: đồng bộ cấu trúc sự kiện với OpenWork stream parts. |
| **3. Bền vững phiên (Session Fold)** | **Durable Session State**: Hàm thuần `foldEvent(prevState, event)`, hỗ trợ `Last-Event-ID` resume, tự phục hồi khi rớt mạng. | Dựa hoàn toàn vào checkpointer backend, nếu ngắt kết nối stream thì UI mất trạng thái dở dang. | Thêm module `session_fold.py` và event fold reducer ở frontend, đảm bảo 0 token bị rơi rớt khi ngắt/tiếp tục. |
| **4. Kiến trúc Prompt** | **OpenMAIC File-Based Prompts**: Thư mục `templates/` & `snippets/` (`{{snippet:name}}`, `{{#if cond}}`), có AST Sentinel test chặn 100% hardcode string trong code. | Prompt viết xen kẽ trong code Python hoặc Jinja2 rời rạc, khó tái sử dụng snippet chung giữa các sub-agents. | Chuyển toàn bộ prompts của Analyst sang File-based Markdown + `PromptManager` compiler + kiểm thử AST chống hardcode. |
| **5. Phản hồi giao diện (UI State)** | **4-Track Parser & RAF Batching**: Bóc tách 4 luồng (`thought`, `tool_call`, `artifact`, `prose`) với `requestAnimationFrame` batching đạt 60fps mượt mà. | React component cập nhật state liên tục qua state setter trực tiếp, dễ gây giật lag khi model nhả token tốc độ cao. | Đưa `useAnalystStream` kết hợp RAF batching vào OpenWork, ánh xạ thẳng sang các block: Reasoning, Plan Card, Capability Call, Subagent Run, Answer. |

---

## II. 5 TRỤ CỘT TINH HOA CẦN MÓT VÀ THỰC THI

### 1. Trụ cột 1: Progressive Skills Registry cho Data Analytics
- **Cấu trúc thư mục**: `backend/dbgpt-analyst/src/dbgpt_analyst/skills/`
  - `registry.py`: Singleton scanner đọc metadata từ YAML frontmatter (Level 1), nạp nội dung theo nhu cầu (Level 2).
  - `catalog/`:
    - `sql_optimization/SKILL.md`: EXPLAIN query plan, indexing, anti-patterns.
    - `financial_metrics/SKILL.md`: CAC, LTV, EBITDA, Cash burn, Cohort analysis.
    - `retail_pos_analytics/SKILL.md`: Sell-through rate, GMV, Basket analysis, RFM segmentation.
    - `supply_chain_inventory/SKILL.md`: Vòng quay kho, Stockout risk, Lead time.
    - `spreadsheet_modeling/SKILL.md`: Quy chuẩn tạo sheet, Pivot table, SUMIFS/XLOOKUP.
    - `executive_deck_synthesis/SKILL.md`: Khung slide 16:9, AIDA, pyramid principle.
- **Tính năng vượt trội**:
  - Tự động kiểm tra điều kiện (validation rules): Nếu hỏi doanh thu bán lẻ mà thiếu chỉ số MoM/YoY hoặc AOV thì trigger cảnh báo tự bổ sung.
  - Tự động gắn tools bắt buộc (`mandatory_tools`) cho từng domain.

### 2. Trụ cột 2: DualFormatStreamAdapter & Chuẩn hóa Envelope
- **Cấu trúc Envelope tiêu chuẩn (Canonical v1)**:
  ```json
  {
    "schemaVersion": 1,
    "eventId": "evt-7f89ab",
    "runId": "run-12345",
    "threadId": "conv-67890",
    "seq": 42,
    "type": "answer.delta",
    "timestamp": "2026-09-18T08:15:30Z",
    "payload": { "text": "Doanh thu quý 3...", "visibility": "answer" }
  }
  ```
- **Các loại sự kiện tương thích OpenWork**:
  - `thought.delta` / `thought.done` -> Render `OpenWorkReasoningBlock`
  - `todos.update` -> Render `OpenWorkPlanCard` (Todo checklist động)
  - `tool.start` / `tool.end` -> Render `OpenWorkCapabilityCallLine` & `OpenWorkToolAggregateGroup`
  - `subagent.start` / `subagent.delta` / `subagent.done` -> Render `OpenWorkSubagentRunLine`
  - `artifact.draft` / `artifact.delta` / `artifact.ready` -> Đồng bộ Artifact Workbench (Excel, Word, Slide)
  - `answer.delta` -> Render `OpenWorkAnswerBlock` (Markdown mượt mà)

### 3. Trụ cột 3: OpenMAIC Prompt Compiler & Snippet Engine
- **Thư mục**: `backend/dbgpt-analyst/src/dbgpt_analyst/prompts/`
  - `templates/<agent_type>/system.md`: Prompt định hướng vai trò.
  - `snippets/<snippet_name>.md`: Các khối dùng chung (`formatting_rules.md`, `guardrails.md`, `chart_syntax.md`, `sql_safety.md`).
  - `compiler.py`:
    - Giải quyết `{{snippet:name}}`
    - Xử lý điều kiện `{{#if cond}}...{{/if}}`
    - Điền biến `{{var}}`
    - Kiểm tra `UnrenderedPlaceholderError` (chống lộ token rác).
- **AST Sentinel Test**: Viết unit test `test_zero_hardcoded_prompts.py` quét toàn bộ codebase backend, chặn triệt để lập trình viên hardcode chuỗi prompt dài trong logic Python.

### 4. Trụ cột 4: Unified Director Graph & HITL Auto-Resume
- Loại bỏ sự phân mảnh giữa nhiều subgraph không đồng nhất.
- Hợp nhất StateGraph theo mô hình **Supervisor Director**:
  - Phân luồng câu hỏi bằng heuristic siêu tốc + intent classifier.
  - Phân quyền thực thi xuống các chuyên viên: SQL Analyst, Python Code Runner, Document Drafter, Visualization Agent.
  - Giới hạn Single-Round Bounds tránh loop vô tận.
  - Cơ chế **HITL Auto-Resume**: Khi cần người dùng duyệt kế hoạch hoặc cung cấp thêm thông tin, đồ thị tạm ngắt (`interrupt`), khi nhận tin nhắn mới tự động resume `Command(resume=...)`.

### 5. Trụ cột 5: Frontend State Engine & 60fps RAF Batching
- **Vị trí**: `frontend/hooks/useOpenWorkStream.ts`
- **Cơ chế**:
  - Tách bộ đệm token: Gom các delta đến dồn dập vào buffer, dùng `requestAnimationFrame` (16.6ms/khung hình) để xả vào React state.
  - Loại bỏ hoàn toàn hiện tượng layout reflow liên tục khiến trình duyệt quá tải khi stream 50-100 tokens/giây.
  - Quản lý state ngắt kết nối an toàn (`settleInterruptedSteps`), giữ nguyên nội dung đã sinh khi user bấm Dừng (`Stop`).

---

## III. KẾ HOẠCH HÀNH ĐỘNG (MILESTONES & CHI TIẾT TRIỂN KHAI)

### Milestone 1: Xây dựng Progressive Skills Registry & Domain Analytics Skills
- [ ] Tạo `backend/dbgpt-analyst/src/dbgpt_analyst/skills/registry.py` (quét YAML Level 1 + nạp lazy Level 2).
- [ ] Viết 6 file `SKILL.md` mẫu chuẩn cho Data Analytics: `sql_optimization`, `financial_metrics`, `retail_pos_analytics`, `supply_chain_inventory`, `spreadsheet_modeling`, `executive_deck_synthesis`.
- [ ] Viết bộ test kiểm tra nạp skill, xác thực metadata và validation rules: `test_skills_registry.py`.

### Milestone 2: Cài đặt DualFormatStreamAdapter & Bền vững phiên (Durable Session Fold)
- [ ] Viết module `backend/dbgpt-analyst/src/dbgpt_analyst/events/dual_format_adapter.py`.
- [ ] Bổ sung các event payload: `TodosUpdatePayload`, `SubagentPayload`, `SkillLoadedPayload`, `ThinkingPayload`.
- [ ] Cập nhật `controller.py` trong `dbgpt-analyst` để tích hợp adapter stream mới.
- [ ] Viết test `test_dual_format_streaming.py` xác thực tính chính xác của format Canonical và Vercel AI SDK.

### Milestone 3: OpenMAIC Prompt Modularization & AST Guard
- [ ] Tạo thư mục `backend/dbgpt-analyst/src/dbgpt_analyst/prompts/templates` và `snippets`.
- [ ] Triển khai `PromptManager` compiler trong `compiler.py` với hỗ trợ snippet và biến điều kiện.
- [ ] Di chuyển các prompt từ Python hardcoded sang Markdown files.
- [ ] Viết kiểm thử AST `test_zero_hardcoded_prompts.py` đảm bảo 100% prompt sạch sẽ.

### Milestone 4: Frontend 4-Track Streaming Parser & Tích hợp OpenWork
- [ ] Xây dựng hook `useOpenWorkStream.ts` với cơ chế 4 luồng tách biệt và RAF batching.
- [ ] Kết nối `useOpenWorkStream` với `OpenWorkChatSurface.tsx` (tự động cập nhật `ReasoningBlock`, `PlanCard`, `SubagentRunLine`, `CapabilityCallLine`).
- [ ] Kiểm thử E2E bằng Playwright MCP: Đảm bảo giao diện 60fps, hiển thị hoàn hảo các state, không lỗi console.

---

## IV. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)
1. **Test Suite Backend**: `pytest backend/dbgpt-analyst/tests` đạt **100% Pass** (bao gồm cả các test mới cho Skills, Compiler, Streaming).
2. **Frontend Build**: `npm --prefix frontend run build` hoàn tất không có lỗi Typescript hoặc build error.
3. **Zero Hardcoded Prompts**: Bộ quét AST xác nhận 0 prompt tĩnh trong logic cốt lõi.
4. **Trải nghiệm Stream**: Token truyền mượt mà, phân định rõ rệt Suy luận (<thought>) - Kế hoạch (Todos) - Công cụ (Tools) - Câu trả lời (Answer) mà không làm giật lag giao diện.
