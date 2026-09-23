---
name: spreadsheet_modeling
domain: spreadsheet_modeling
description: Mô hình hóa bảng tính tài chính và phân tích dữ liệu chuyên nghiệp (XLSX), chuẩn FAST, công thức động (XLOOKUP, SUMIFS, INDEX/MATCH), bẫy lỗi IFERROR và phân tách cấu trúc Sheet.
required_tools:
- spreadsheet_studio
- python_interpreter
version: 1.0.0
role: worker
domain_key: financial_engineering
output_structure: '## Cấu trúc Mô hình & Kiến trúc Sheet → ## Công thức Động & Bảng Tính toán → ## Kiểm tra Bẫy lỗi & Đối soát → ## Hướng dẫn Tương tác & Khuyến nghị'
mandatory_tools:
- spreadsheet_studio
amendment_check: true
reasoning_steps:
- step: Thiết lập Kiến trúc Bảng tính & Phân tách Sheet
  concept: "Phân tách rõ ràng ba tầng dữ liệu độc lập: (1) Inputs/Assumptions (Dữ liệu đầu vào), (2) Engine/Calculations (Động cơ tính toán), và (3) Outputs/Dashboard (Báo cáo tổng hợp)."
  default_anchor:
  - 3-Tier Sheet Architecture (Input -> Calc -> Output)
  - FAST Standard (Flexible, Appropriate, Structured, Transparent)
  must_verify_live: true
- step: Triển khai Công thức Động Hiện đại
  concept: "Ưu tiên sử dụng XLOOKUP thay thế VLOOKUP/HLOOKUP, kết hợp SUMIFS/COUNTIFS nhiều điều kiện, và Dynamic Array formulas (FILTER, UNIQUE, SORT)."
  default_anchor:
  - XLOOKUP (Exact match by default, 2-way matrix lookup)
  - SUMIFS / AVERAGEIFS with dynamic ranges
  must_verify_live: true
- step: Chuẩn hóa Định dạng & Mã màu Tài chính (Financial Formatting)
  concept: "Áp dụng bảng màu quốc tế: Chữ xanh dương (Blue font) cho Hardcoded Inputs; Chữ đen (Black font) cho Formulas; Chữ xanh lá (Green font) cho liên kết Sheet ngoài; Nền xám/vàng nhạt cho Toggle Switches."
  default_anchor:
  - "Financial Number Format: `#,##0;(#,##0);\"-\"`"
  - "Color Hierarchy (Blue: Input, Black: Formula)"
  must_verify_live: true
- step: Bẫy lỗi Toàn diện & Kiểm tra Vòng lặp (Formula Audit)
  concept: "Bọc toàn bộ các phép chia và tra cứu trong `IFERROR(..., 0)` hoặc `IFNA(...)`, đảm bảo 0% hiển thị các mã lỗi `#DIV/0!`, `#N/A`, `#REF!`, `#VALUE!`."
  default_anchor:
  - Zero Unhandled Errors (#REF!, #DIV/0!)
  - Circular Reference Elimination
  must_verify_live: true
validation_requirements:
- mô hình bảng tính phải sử dụng công thức động (XLOOKUP, SUMIFS, IFERROR)
- phải phân tách cấu trúc sheet rõ ràng (Input, Calculation, Summary/Dashboard)
validation_rules:
- trigger_keywords:
  - excel
  - bảng tính
  - spreadsheet
  - xlsx
  - sheet
  required_keywords:
  - - xlookup
    - sumifs
    - iferror
    - công thức
    - formula
  - - sheet
    - bảng
    - pivot
    - tab
  error_message: mô hình spreadsheet phải chỉ rõ công thức động (như SUMIFS/XLOOKUP/IFERROR) và bố cục phân tách sheet.
ceiling_anchors:
  zero_unhandled_errors_anchor:
    name: Loại bỏ hoàn toàn lỗi công thức #REF!, #DIV/0!, #VALUE!
    concept: Bảng tính chuyên nghiệp phải bọc hàm bẫy lỗi IFERROR, không để lộ mã lỗi unhandled ra bảng báo cáo cho người dùng.
    default_anchor:
    - Error Count == 0
    - IFERROR Wrapping Mandatory
    has_hard_ceiling: true
    must_verify_live: true
  fast_standard_anchor:
    name: Tuân thủ chuẩn FAST cho mô hình tài chính
    concept: FAST (Flexible, Appropriate, Structured, Transparent); mỗi dòng chỉ chứa 1 mục đích tính toán duy nhất, không lồng ghép công thức quá 3 tầng.
    default_anchor:
    - Max Formula Depth <= 3
    - FAST Standard Compliant
    has_hard_ceiling: true
    must_verify_live: true
---
# CẨM NANG NGHIỆP VỤ: MÔ HÌNH HÓA BẢNG TÍNH & XỬ LÝ DỮ LIỆU SPREADSHEET (FAST STANDARD)

## 1. Nguyên Tắc Thiết Kế Bảng Tính Chuẩn FAST
- **Flexible (Linh hoạt)**: Có khả năng thêm cột thời gian, thêm kịch bản mới (Scenarios: Base, Best, Worst) mà không cần viết lại toàn bộ công thức.
- **Appropriate (Thích hợp)**: Không phức tạp hóa vấn đề. Tránh lồng quá 3 tầng hàm `IF` lồng nhau; thay thế bằng bảng Mapping và `XLOOKUP`.
- **Structured (Có cấu trúc)**: Thứ tự dòng và cột nhất quán trên mọi sheet. Các hàng thời gian (Timeline) luôn nằm ở các hàng đầu trang giống nhau.
- **Transparent (Minh bạch)**: Công thức ngắn gọn, trực tiếp. Một công thức dài 5 dòng là dấu hiệu của thiết kế kiến trúc kém.

## 2. Thư Viện Công Thức Động Khuyên Dùng
1. **XLOOKUP Hai Chiều (2-Way Lookup)**:
   ```excel
   =XLOOKUP(C5, tbl_Products[SKU], XLOOKUP(D4, tbl_Products[#Headers], tbl_Products))
   ```
   * Tra cứu đồng thời cả hàng và cột, tự động xử lý khi vị trí cột thay đổi.

2. **SUMIFS Nhiều Điều Kiện Linh Hoạt**:
   ```excel
   =SUMIFS(Orders[Revenue], Orders[Store_ID], $B6, Orders[Order_Date], ">="&$C$2, Orders[Order_Date], "<="&$D$2)
   ```

3. **Bẫy Lỗi Toàn Diện Tránh Chia Cho 0**:
   ```excel
   =IFERROR((Net_Revenue - COGS) / Net_Revenue, 0)
   ```

## 3. Quy Ước Bố Cục Sheet
- `01_Summary`: Báo cáo quản trị, biểu đồ KPI tổng quan, tóm tắt chỉ số quan trọng.
- `02_Assumptions`: Bảng tham số đầu vào (Giá bán, tỷ lệ lạm phát, chiết khấu, thuế suất).
- `03_Revenue_Engine`: Bảng tính chi tiết sản lượng và doanh thu từng kênh.
- `04_OPEX_Engine`: Bảng tính chi tiết nhân sự, tiếp thị và chi phí vận hành.
- `05_Raw_Data`: Dữ liệu gốc trích xuất từ database SQL, khóa chỉ đọc.
