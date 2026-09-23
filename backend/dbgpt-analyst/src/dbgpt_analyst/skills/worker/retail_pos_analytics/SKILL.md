---
name: retail_pos_analytics
domain: retail_pos_analytics
description: Phân tích dữ liệu bán lẻ chuỗi và điểm bán (POS), tính toán GMV, AOV, UPT, Sell-Through Rate (STR), phân khúc khách hàng RFM và phân rã hiệu quả theo cửa hàng/SKU.
required_tools:
- sql_query
- python_interpreter
version: 1.0.0
role: worker
domain_key: retail_commerce
output_structure: '## Hiệu suất Bán lẻ & GMV → ## Giỏ hàng & Chỉ số POS (AOV/UPT) → ## Tỷ lệ Bán hết (STR) theo Cửa hàng/SKU → ## Khuyến nghị Tối ưu'
mandatory_tools:
- sql_query
amendment_check: true
reasoning_steps:
- step: Đánh giá GMV, Doanh thu Bán hàng & Lưu lượng Khách
  concept: Tổng hợp Tổng giá trị hàng hóa (GMV), Doanh thu bán hàng thực tế tại quầy và online, lưu lượng khách (Footfall) và tỷ lệ chuyển đổi (Conversion Rate).
  default_anchor:
  - GMV vs Net Sales
  - Footfall & Conversion Rate %
  must_verify_live: true
- step: Đo lường Quy mô Giỏ hàng (Basket Size & Basket Economics)
  concept: Tính toán Giá trị đơn hàng trung bình (AOV - Average Order Value), Số sản phẩm trên mỗi hóa đơn (UPT - Units Per Transaction), Giá trị trung bình mỗi sản phẩm (ATV).
  default_anchor:
  - AOV = Total Sales / Total Orders
  - UPT = Total Units Sold / Total Orders
  must_verify_live: true
- step: Phân tích Tỷ lệ Bán hết (Sell-Through Rate - STR)
  concept: Đánh giá tốc độ tiêu thụ hàng hóa theo dòng sản phẩm, mùa vụ và kênh bán hàng nhằm phát hiện các mặt hàng bán chạy (Hero SKU) hoặc ứ đọng (Slow-moving).
  default_anchor:
  - STR % = Units Sold / (Beginning Inventory + Receipts)
  - Full-Price vs Markdown Sales Ratio
  must_verify_live: true
- step: Phân khúc Khách hàng RFM & Khai phá Giỏ hàng (Market Basket Affinity)
  concept: Xếp hạng tệp khách hàng theo Recency (Gần nhất), Frequency (Tần suất), Monetary (Giá trị) và tìm quy luật mua kèm sản phẩm (Support, Confidence, Lift).
  default_anchor:
  - RFM Scoring (1-5 scale)
  - Cross-sell Affinity Lift >= 1.2
  must_verify_live: true
validation_requirements:
- phân tích bán lẻ POS phải có chỉ số AOV hoặc UPT
- phải phân tích theo chiều kích thước cửa hàng/kênh hoặc mã sản phẩm SKU
validation_rules:
- trigger_keywords:
  - bán lẻ
  - cửa hàng
  - pos
  - đơn hàng
  - retail
  required_keywords:
  - - aov
    - upt
    - giá trị đơn
    - sell-through
    - str
  - - cửa hàng
    - kênh
    - sku
    - sản phẩm
    - store
  error_message: phân tích bán lẻ POS phải tính toán AOV/UPT và phân rã theo cửa hàng, kênh hoặc SKU.
ceiling_anchors:
  positive_gmv_anchor:
    name: Kiểm soát GMV và giá trị đơn hàng dương
    concept: GMV và AOV không được âm ngoại trừ giao dịch hoàn trả (refund) được gắn nhãn riêng biệt.
    default_anchor:
    - GMV >= 0
    - AOV >= 0
    has_hard_ceiling: true
    must_verify_live: true
  upt_reasonable_anchor:
    name: Ngưỡng số sản phẩm trên mỗi đơn hàng (UPT) hợp lý
    concept: UPT thông thường dao động từ 1.0 đến 20.0 sản phẩm; các đơn hàng vượt ngưỡng cần kiểm tra khả năng bán sỉ hoặc lỗi quét trùng mã vạch.
    default_anchor:
    - 1.0 <= UPT <= 20.0
    has_hard_ceiling: true
    must_verify_live: true
---
# CẨM NANG NGHIỆP VỤ: PHÂN TÍCH BÁN LẺ & DỮ LIỆU ĐIỂM BÁN (POS ANALYTICS)

## 1. Bộ Chỉ Số Vận Hành Bán Lẻ (Retail Key Metrics)
1. **Giá Trị Đơn Hàng Trung Bình (AOV - Average Order Value)**:
   $$\text{AOV} = \frac{\text{Tổng Doanh Thu}}{\text{Tổng Số Lượng Đơn Hàng}}$$
   * Tăng AOV bằng các chiến dịch cross-sell, combo hoặc miễn phí vận chuyển trên ngưỡng.

2. **Số Sản Phẩm Trên Mỗi Hóa Đơn (UPT - Units Per Transaction)**:
   $$\text{UPT} = \frac{\text{Tổng Số Lượng Sản Phẩm Đã Bán}}{\text{Tổng Số Lượng Đơn Hàng}}$$
   * Chỉ số phản ánh năng lực tư vấn bán kèm của nhân viên thu ngân / tư vấn viên tại cửa hàng.

3. **Tỷ Lệ Bán Hết (Sell-Through Rate - STR %)**:
   $$\text{STR} = \frac{\text{Số lượng sản phẩm bán ra}}{\text{Tồn đầu kỳ} + \text{Nhập trong kỳ}} \times 100\%$$
   * Chuẩn benchmark ngành thời trang/tiêu dùng: STR > 70% sau 8-10 tuần là dòng hàng thành công; STR < 40% cần lên kế hoạch markdown giảm giá giải phóng mặt bằng.

4. **Doanh Thu Trên Mỗi Mét Vuông (Sales per Square Meter - SPSM)**:
   $$\text{SPSM} = \frac{\text{Doanh thu cửa hàng}}{\text{Diện tích sàn kinh doanh (m}^2\text{)}}$$

## 2. Quy Chuẩn Phân Tích Giỏ Hàng (Market Basket Analysis)
Khi thực hiện phân tích tương quan sản phẩm:
- **Độ hỗ trợ (Support)**: Tỷ lệ đơn hàng chứa đồng thời sản phẩm A và B: $P(A \cap B)$.
- **Độ tin cậy (Confidence)**: Tỷ lệ khách mua A cũng mua B: $P(B|A) = \frac{P(A \cap B)}{P(A)}$.
- **Độ nâng (Lift)**: Mức độ tương tác vượt trội so với ngẫu nhiên: $\text{Lift} = \frac{\text{Confidence}(A \to B)}{P(B)}$.
  * Lift > 1: Sản phẩm A và B kích thích mua kèm lẫn nhau.
  * Lift < 1: Hai sản phẩm có xu hướng thay thế (cannibalization).

## 3. Khung Phân Khúc RFM (Recency - Frequency - Monetary)
- **Champions (555, 554)**: Mua gần đây nhất, mua nhiều nhất, chi tiêu cao nhất → Chăm sóc VIP, giới thiệu sản phẩm sớm.
- **Loyal Customers (X4X, X5X)**: Mua đều đặn → Khuyến mãi tích điểm, cross-sell.
- **At Risk (14X, 15X, 25X)**: Chi tiêu lớn nhưng lâu không quay lại → Chiến dịch re-activation, ưu đãi đặc quyền quay lại.
- **Lost (111)**: Khách hàng rời bỏ → Không tập trung chi phí retargeting tốn kém.
