---
name: executive_deck_synthesis
domain: executive_deck_synthesis
description: Thiết kế và tổng hợp bài trình chiếu điều hành C-Suite chuẩn McKinsey/Bain, tỷ lệ 16:9 widescreen, nguyên lý Kim tự tháp Minto (Answer First), Action Titles và ma trận khuyến nghị hành động.
required_tools:
- presentation_builder
- python_interpreter
version: 1.0.0
role: worker
domain_key: executive_presentation
output_structure: '## Thông điệp Điều hành (Executive Summary) → ## Dàn bài Storyboard 16:9 → ## Nội dung Slide & Action Titles → ## Kế hoạch Hành động (Next Steps)'
mandatory_tools:
- presentation_builder
amendment_check: true
reasoning_steps:
- step: Tổng hợp Thông điệp Điều hành Cốt lõi (Answer First)
  concept: "Áp dụng nguyên lý Kim tự tháp Minto: Đặt ngay kết luận cốt lõi và thông điệp hành động ở đầu bài báo cáo (SCQA: Situation - Complication - Question - Answer)."
  default_anchor:
  - Minto Pyramid Principle
  - SCQA Framework (Situation, Complication, Question, Answer)
  must_verify_live: true
- step: Xây dựng Dàn bài Storyboard & Mạch Dẫn dắt
  concept: "Thiết kế luồng câu chuyện xuyên suốt (Narrative Arc) từ 4 đến 8 slides, đảm bảo tính liên kết logic giữa các phần và phân bổ thời lượng trình bày mạch lạc."
  default_anchor:
  - Storyboard Structure
  - MECE Principle (Mutually Exclusive, Collectively Exhaustive)
  must_verify_live: true
- step: Soạn thảo Slide 16:9 với Tiêu đề Hành động (Action Titles)
  concept: "Viết tiêu đề slide dưới dạng câu khẳng định hành động/kết luận phân tích (Action Title) thay vì danh từ chung chung, kết hợp bố cục 2 cột hoặc 3 cột cân xứng."
  default_anchor:
  - Action Title vs Topic Title
  - 16:9 Widescreen (1920x1080 canvas)
  must_verify_live: true
- step: Xác lập Ma trận Khuyến nghị & Kế hoạch Tiếp theo (Next Steps)
  concept: "Chuyển đổi insight phân tích thành danh mục hành động cụ thể kèm mức độ ưu tiên (Impact vs Effort Matrix), chủ sở hữu và mốc thời gian hoàn thành (Deadlines)."
  default_anchor:
  - Impact vs Effort 2x2 Matrix
  - Actionable Next Steps with Owners
  must_verify_live: true
validation_requirements:
- mỗi slide phải có Action Title thể hiện kết luận phân tích thay vì tiêu đề danh từ chung chung
- phần kết thúc phải có khuyến nghị hành động hoặc bước đi tiếp theo (Next Steps)
validation_rules:
- trigger_keywords:
  - slide
  - thuyết trình
  - báo cáo sếp
  - executive deck
  - powerpoint
  - presentation
  required_keywords:
  - - action title
    - tiêu đề hành động
    - takeaway
    - thông điệp chính
  - - hành động
    - khuyến nghị
    - next step
    - bước tiếp theo
  error_message: bài trình bày executive deck phải có Action Titles cho slide và phần khuyến nghị hành động (Next Steps).
ceiling_anchors:
  widescreen_aspect_ratio_anchor:
    name: Chuẩn tỷ lệ khung hình 16:9 hiện đại
    concept: Tránh hoàn toàn tỷ lệ 4:3 cổ điển; toàn bộ slide và bố cục hiển thị phải chuẩn hóa theo tỷ lệ 16:9 widescreen.
    default_anchor:
    - Aspect Ratio 16:9
    - Resolution 1920x1080
    has_hard_ceiling: true
    must_verify_live: true
  minto_lead_anchor:
    name: Quy tắc Minto Answer First (Kết luận lên hàng đầu)
    concept: Mọi slide báo cáo điều hành phải đặt kết luận hoặc khuyến nghị chính lên đầu trang (Top-down reasoning), không bắt ban lãnh đạo đọc qua chi tiết mới thấy kết quả.
    default_anchor:
    - Answer First
    - Headline-Lead-Body Hierarchy
    has_hard_ceiling: true
    must_verify_live: true
---
# CẨM NANG NGHIỆP VỤ: TỔNG HỢP & THIẾT KẾ TRÌNH CHIẾU ĐIỀU HÀNH (EXECUTIVE DECK SYNTHESIS)

## 1. Nguyên Lý Kim Tự Tháp Minto & Khung SCQA
Ban lãnh đạo C-Suite chỉ có 3-5 phút để nắm bắt vấn đề. Cấu trúc bài trình bày tuân thủ chặt chẽ khung SCQA:
- **Situation (Bối cảnh)**: Tình hình hoạt động hiện tại được các bên công nhận (ví dụ: Doanh thu Q2 tăng trưởng 15%).
- **Complication (Vấn đề phát sinh)**: Trở ngại hoặc thách thức bất ngờ (ví dụ: Biên lợi nhuận gộp sụt giảm 400 bps do chi phí logistics tăng vọt).
- **Question (Câu hỏi trọng tâm)**: Cần làm gì để vừa giữ tốc độ tăng trưởng vừa khôi phục biên lợi nhuận?
- **Answer (Giải pháp cốt lõi)**: Tái cấu trúc hợp đồng vận chuyển và áp dụng định giá linh hoạt theo kênh (Dynamic Pricing).

## 2. Quy Chuẩn Action Titles (Tiêu Đề Hành Động)
- ❌ **Topic Title (Kém)**: "Doanh Thu Quý 2 Theo Kênh Bán Hàng"
- ✅ **Action Title (Chuẩn McKinsey)**: "Kênh Thương mại Điện tử Tăng Trưởng 42% Bù Đắp Cho Sự Suy Giảm 8% Tại Các Cửa Hàng Bán Lẻ Truyền Thống"
- ❌ **Topic Title (Kém)**: "Tình Hình Tồn Kho Cuối Kỳ"
- ✅ **Action Title (Chuẩn McKinsey)**: "Tồn Kho Nhóm Hàng Mùa Đông Vượt Ngưỡng An Toàn 35 Ngày Cần Kích Hoạt Chiến Dịch Xả Hàng Ngay Trong Tháng 10"

## 3. Cấu Trúc Khung Trình Bày 16:9 Chuẩn Mực
1. **Slide 1: Executive Summary & Core Takeaway**: Toàn bộ câu trả lời tóm gọn trong 3 bullet points then chốt.
2. **Slide 2: Phân Tích Thực Trạng & Bằng Chứng Dữ Liệu**: Biểu đồ cột/thác nước (Waterfall chart) chứng minh nguyên nhân cốt lõi.
3. **Slide 3: So Sánh Phương Án Chiến Lược (Trade-off Analysis)**: Bảng so sánh Đánh đổi Chi phí - Lợi ích giữa 3 kịch bản.
4. **Slide 4: Kế Hoạch Triển Khai & Khuyến Nghị Tiếp Theo (Next Steps)**: Ma trận phân công trách nhiệm (RACI) và mốc tiến độ cụ thể.
