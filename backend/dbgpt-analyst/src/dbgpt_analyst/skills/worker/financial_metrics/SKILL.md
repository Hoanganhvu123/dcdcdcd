---
name: financial_metrics
domain: financial_metrics
description: Phân tích chỉ số tài chính doanh nghiệp, cơ cấu P&L, biên lợi nhuận (Gross Margin, EBITDA), chỉ số tăng trưởng (MoM, YoY), đơn vị kinh tế (LTV/CAC) và Runway tiền mặt.
required_tools:
- python_interpreter
- spreadsheet_studio
version: 1.0.0
role: worker
domain_key: corporate_finance
output_structure: '## Tổng quan P&L & Doanh thu → ## Ma trận Chỉ số Tài chính Cốt lõi → ## Phân tích Biến động (MoM/YoY) → ## Đánh giá Runway & Khuyến nghị'
mandatory_tools:
- python_interpreter
amendment_check: true
reasoning_steps:
- step: Phân rã Doanh thu & Cơ cấu Chi phí
  concept: "Bóc tách Doanh thu gộp (Gross Revenue), Giảm trừ doanh thu, Doanh thu thuần (Net Revenue), Giá vốn hàng bán (COGS) và Chi phí hoạt động (OPEX: SG&A, R&D)."
  default_anchor:
  - GAAP / IFRS Revenue Recognition
  - P&L Waterfall Breakdown
  must_verify_live: true
- step: Tính toán Chỉ số Tài chính & Đơn vị Kinh tế (Unit Economics)
  concept: "Đo lường Biên lợi nhuận gộp (Gross Margin), EBITDA, Lợi nhuận ròng, LTV (Customer Lifetime Value), CAC (Customer Acquisition Cost) và Tỷ lệ LTV/CAC."
  default_anchor:
  - Gross Margin % = (Net Revenue - COGS) / Net Revenue
  - LTV / CAC Ratio >= 3.0x
  must_verify_live: true
- step: Phân tích Xu hướng Chuỗi Thời gian & Phương sai (Variance Analysis)
  concept: "Đo lường tốc độ tăng trưởng liên tháng (MoM), liên năm (YoY), phân tích chênh lệch giữa kế hoạch ngân sách (Budget) và thực tế (Actual)."
  default_anchor:
  - YoY / MoM Growth %
  - Price-Volume-Mix Variance
  must_verify_live: true
- step: Dự báo Dòng tiền & Đánh giá Runway
  concept: "Tính toán Tốc độ đốt tiền ròng (Net Burn Rate), Dòng tiền tự do (FCF) và số tháng hoạt động an toàn còn lại (Cash Runway)."
  default_anchor:
  - Cash Runway (Months) = Total Cash / Monthly Net Burn
  - Rule of 40 (Growth % + Free Cash Flow Margin %)
  must_verify_live: true
validation_requirements:
- phân tích tài chính phải tính rõ tốc độ tăng trưởng MoM/YoY theo tỷ lệ %
- phải báo cáo biên lợi nhuận (Gross Margin hoặc EBITDA Margin)
validation_rules:
- trigger_keywords:
  - doanh thu
  - lợi nhuận
  - tài chính
  - revenue
  - ebitda
  required_keywords:
  - - mom
    - yoy
    - tăng trưởng
    - '%'
    - growth
  - - biên lợi nhuận
    - margin
    - tỷ suất
    - gross margin
    - ebitda
  error_message: phân tích tài chính bắt buộc phải bao gồm tốc độ tăng trưởng (% MoM/YoY) và biên lợi nhuận (margin).
ceiling_anchors:
  gross_margin_ceiling:
    name: Giới hạn biên lợi nhuận gộp hợp lệ
    concept: Biên lợi nhuận gộp không thể âm hoặc vượt quá 100% trong điều kiện kinh doanh sản xuất thông thường.
    default_anchor:
    - Gross Margin >= 0%
    - Gross Margin <= 100%
    has_hard_ceiling: true
    must_verify_live: true
  positive_runway_anchor:
    name: Kiểm định Runway tiền mặt khả dụng
    concept: Thời gian tồn tại tiền mặt (Cash Runway) phải được biểu diễn bằng số tháng dương; nếu âm tức doanh nghiệp đã mất khả năng thanh toán.
    default_anchor:
    - Runway >= 0 months
    - Monthly Net Burn Rate > 0
    has_hard_ceiling: true
    must_verify_live: true
---
# CẨM NANG NGHIỆP VỤ: PHÂN TÍCH CHỈ SỐ TÀI CHÍNH & HIỆU QUẢ KINH DOANH

## 1. Hệ Thống Công Thức Tài Chính Chuẩn Mực
1. **Biên Lợi Nhuận Gộp (Gross Margin %)**:
   $$\text{Gross Margin} = \frac{\text{Net Revenue} - \text{COGS}}{\text{Net Revenue}} \times 100\%$$
   * Ý nghĩa: Đo lường hiệu quả sản xuất và mức độ thặng dư giá bán trên giá vốn.

2. **EBITDA (Earnings Before Interest, Taxes, Depreciation, and Amortization)**:
   $$\text{EBITDA} = \text{Operating Income (EBIT)} + \text{Depreciation} + \text{Amortization}$$
   * Phản ánh lợi nhuận thuần túy từ hoạt động kinh doanh cốt lõi trước ảnh hưởng của cấu trúc tài chính và kế toán thuế.

3. **Tỷ Lệ Đơn Vị Kinh Tế (Unit Economics - LTV/CAC)**:
   $$\text{LTV} = \frac{\text{ARPU} \times \text{Gross Margin}}{\text{Churn Rate}}, \quad \text{LTV / CAC Benchmark} \ge 3.0\text{x}$$
   * Nếu LTV/CAC < 1.0x: Doanh nghiệp càng tăng trưởng càng lỗ sâu.
   * Nếu LTV/CAC > 5.0x: Doanh nghiệp đang đầu tư dưới mức cho Marketing/Sales.

4. **Nguyên Tắc Rule of 40 (Dành cho Doanh Nghiệp Tăng Trưởng / SaaS)**:
   $$\text{Rule of 40} = \text{Revenue Growth Rate (\%)} + \text{FCF Margin (\%)} \ge 40\%$$

## 2. Quy Trình Phân Tích Phương Sai (Variance Analysis)
Bóc tách chênh lệch giữa Doanh thu Thực tế ($R_A$) và Doanh thu Kế hoạch ($R_B$):
- **Hiệu ứng Giá (Price Effect)**: $\Delta P = (P_A - P_B) \times Q_A$
- **Hiệu ứng Khối lượng (Volume Effect)**: $\Delta Q = (Q_A - Q_B) \times P_B$
- **Hiệu ứng Hỗn hợp Sản phẩm (Mix Effect)**: Chênh lệch tỷ trọng các dòng hàng có biên lợi nhuận khác nhau.

## 3. Quy Chuẩn Báo Cáo & Đối Soát
- Tuyệt đối không nhầm lẫn Doanh số (Gross Sales/GMV) với Doanh thu được ghi nhận (Net Recognized Revenue).
- Mọi tỷ lệ phần trăm tăng trưởng phải đi kèm kỳ so sánh rõ ràng (ví dụ: +12.4% MoM tháng 8/2026 hoặc +28.1% YoY so với cùng kỳ 2025).
- Định dạng tiền tệ: Chuẩn hóa theo triệu VND / tỷ VND hoặc ngàn USD, giữ tối đa 2 chữ số thập phân.
