---
name: supply_chain_inventory
domain: supply_chain_inventory
description: Quản trị chuỗi cung ứng, phân tích vòng quay tồn kho (Turnover), số ngày tồn kho (DOH), cảnh báo nguy cơ đứt gãy hàng hóa (Stockout), phân loại ma trận ABC-XYZ và mô hình điểm đặt hàng an toàn (Safety Stock & ROP).
required_tools:
- sql_query
- python_interpreter
version: 1.0.0
role: worker
domain_key: supply_chain
output_structure: '## Hiện trạng Tồn kho & Giá trị Lưu kho → ## Hiệu quả Vòng quay (Turnover & DOH) → ## Cảnh báo Rủi ro Stockout & Hàng Chậm Luân chuyển → ## Đề xuất Điểm Đặt hàng (ROP)'
mandatory_tools:
- sql_query
amendment_check: true
reasoning_steps:
- step: Chụp ảnh Hiện trạng Tồn kho & Định giá
  concept: "Phân tích cơ cấu tồn kho khả dụng (Available On-hand), hàng đang về (In-transit), hàng đã cam kết giao (Reserved/Allocated) và tổng giá trị tồn kho theo giá vốn."
  default_anchor:
  - Total Inventory Valuation (COGS basis)
  - On-hand vs In-transit vs Reserved
  must_verify_live: true
- step: Đo lường Vòng quay Tồn kho (Turnover) & Ngày tồn kho (DOH)
  concept: "Tính toán Hệ số vòng quay tồn kho (Inventory Turnover Ratio - ITR) và Số ngày bán hàng tồn kho bình quân (Days of Inventory on Hand - DOH)."
  default_anchor:
  - Inventory Turnover = COGS / Average Inventory
  - DOH = 365 / Inventory Turnover (or Avg Inventory * 365 / COGS)
  must_verify_live: true
- step: Đánh giá Nguy cơ Đứt gãy Hàng (Stockout) & Phân Loại ABC-XYZ
  concept: "Xếp hạng danh mục SKU theo mức độ đóng góp doanh thu (ABC) và mức độ ổn định của nhu cầu thị trường (XYZ: biến thiên thấp/trung bình/cao)."
  default_anchor:
  - ABC Pareto Curve (80/15/5 revenue share)
  - Coefficient of Variation (CV) for XYZ
  must_verify_live: true
- step: Thiết lập Tồn kho An toàn & Điểm Đặt hàng lại (ROP)
  concept: "Ứng dụng phân phối chuẩn xác định mức Safety Stock dự phòng biến động nhu cầu và thời gian giao hàng (Lead Time), từ đó xác lập Điểm đặt hàng lại (Reorder Point)."
  default_anchor:
  - Safety Stock = Z * sqrt(LeadTime * VarDemand + Demand^2 * VarLeadTime)
  - Reorder Point (ROP) = (Lead Time * Avg Daily Demand) + Safety Stock
  must_verify_live: true
validation_requirements:
- báo cáo chuỗi cung ứng phải có chỉ số vòng quay kho (Turnover) hoặc DOH
- phải đánh giá mức an toàn kho (Safety Stock) hoặc nguy cơ stockout
validation_rules:
- trigger_keywords:
  - tồn kho
  - kho hàng
  - vòng quay kho
  - stockout
  - inventory
  required_keywords:
  - - vòng quay
    - doh
    - ngày tồn kho
    - turnover
  - - stockout
    - an toàn
    - safety stock
    - thiếu hàng
  error_message: báo cáo tồn kho bắt buộc phải tính vòng quay kho/DOH và xác định ngưỡng an toàn hoặc nguy cơ stockout.
ceiling_anchors:
  non_negative_inventory_anchor:
    name: Kiểm soát mức tồn kho thực tế không âm
    concept: Tồn kho vật lý (Physical On-hand) không thể nhận giá trị âm; trường hợp âm phản ánh sự bất đồng bộ giữa quét mã vạch POS và nhập kho ERP.
    default_anchor:
    - Physical On-hand >= 0
    has_hard_ceiling: true
    must_verify_live: true
  doh_finite_anchor:
    name: Giới hạn tính toán số ngày tồn kho hợp lệ
    concept: DOH phải là số thực dương hữu hạn; khi COGS hoặc doanh số bằng 0, phải gắn nhãn Dead Stock thay vì hiển thị vô cực (Infinity).
    default_anchor:
    - 0 <= DOH <= 730 days
    - Dead Stock Flagged
    has_hard_ceiling: true
    must_verify_live: true
---
# CẨM NANG NGHIỆP VỤ: QUẢN TRỊ CHUỖI CUNG ỨNG & TỒN KHO

## 1. Công Thức Đo Lường Hiệu Quả Tồn Kho
1. **Hệ Số Vòng Quay Tồn Kho (Inventory Turnover Ratio - ITR)**:
   $$\text{ITR} = \frac{\text{COGS trong kỳ}}{\text{Tồn kho bình quân}} = \frac{\text{COGS}}{\frac{\text{Tồn đầu kỳ} + \text{Tồn cuối kỳ}}{2}}$$
   * ITR cao thể hiện tốc độ luân chuyển vốn nhanh và chi phí lưu kho thấp.

2. **Số Ngày Tồn Kho Bình Quân (Days of Inventory on Hand - DOH)**:
   $$\text{DOH} = \frac{\text{Tồn kho bình quân}}{\text{COGS trong kỳ}} \times 365 = \frac{365}{\text{ITR}}$$
   * Ví dụ: DOH = 45 ngày tức là lượng hàng trong kho đủ đáp ứng nhu cầu bán trong 45 ngày tới nếu không nhập thêm.

3. **Mô Hình Điểm Đặt Hàng Lại (Reorder Point - ROP)**:
   $$\text{ROP} = (\text{Nhu cầu trung bình mỗi ngày} \times \text{Lead Time tính bằng ngày}) + \text{Safety Stock}$$
   * Khi lượng tồn kho khả dụng chạm ngưỡng ROP, hệ thống ERP bắt buộc phải phát lệnh tạo đơn mua hàng (PO).

4. **Tồn Kho An Toàn (Safety Stock - SS)**:
   $$\text{SS} = Z_{\alpha} \times \sqrt{L \times \sigma_D^2 + D^2 \times \sigma_L^2}$$
   * Trong đó: $Z_{\alpha}$ là hệ số dịch vụ (ví dụ: 95% tương ứng $Z = 1.65$), $L$ là Lead Time, $\sigma_D$ là độ lệch chuẩn của nhu cầu ngày.

## 2. Chiến Lược Ma Trận Phân Loại ABC-XYZ
- **Nhóm AX**: Doanh thu lớn, nhu cầu ổn định cao → Áp dụng cơ chế Just-In-Time (JIT), duy trì Safety Stock thấp.
- **Nhóm AZ**: Doanh thu lớn nhưng nhu cầu biến động mạnh → Cần phối hợp dự báo sát sao từ Sales & Marketing, kiểm soát rủi ro thiếu hụt.
- **Nhóm CZ**: Doanh thu nhỏ, biến động thất thường → Nguy cơ trở thành Hàng chết (Dead Stock) cao nhất. Chỉ nhập hàng theo đơn đặt trước (Make to Order).

## 3. Cảnh Báo Hiện Tượng Bullwhip (Hiệu Ứng Chiếc Roi Da)
Sự khuếch đại sai lệch nhu cầu từ hạ nguồn bán lẻ lên thượng nguồn sản xuất. Để giảm thiểu:
- Chia sẻ trực tiếp dữ liệu POS thời gian thực cho nhà máy.
- Tránh các đợt giảm giá giật cục (Price Promotion) gây đột biến giả tạo nhu cầu.
