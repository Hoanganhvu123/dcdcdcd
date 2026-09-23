const http = require('http');

const SESSIONS_WITH_MESSAGES = [
  // Group 1: Financial PnL & A4 Executive Report (5 sessions)
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10001",
    title: "Phân tích PnL Q3 & Trích xuất Báo Cáo A4",
    user_msg: "Trích xuất bảng PnL 4 quý từ PostgreSQL DW và tạo báo cáo điều hành A4",
    sql_used: "SELECT quarter, net_revenue, cogs, gross_profit, opex, ebitda FROM q3_financial_records ORDER BY quarter ASC;",
    assistant_msg: `### 📊 Báo cáo Kết quả Hoạt động Kinh doanh PnL 4 Quý (2025 - 2026)

Hệ thống đã trích xuất thành công toàn bộ dữ liệu tài chính PnL từ Data Warehouse. Dưới đây là bảng tổng hợp các chỉ số tài chính trọng yếu:

| Kỳ Báo Cáo | Doanh Thu Thuần | Giá Vốn (COGS) | Lợi Nhuận Gộp | Tỷ Suất LNG | Chi Phí OPEX | EBITDA |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Q4/2025** | $2,100,000 | $1,420,000 | $680,000 | 32.4% | $410,000 | $270,000 |
| **Q1/2026** | $2,250,000 | $1,490,000 | $760,000 | 33.8% | $430,000 | $330,000 |
| **Q2/2026** | $2,380,000 | $1,550,000 | $830,000 | 34.9% | $460,000 | $370,000 |
| **Q3/2026** | **$2,450,000** | **$1,620,000** | **$830,000** | **33.8%** | **$470,000** | **$360,000** |

#### 💡 Nhận định & Khuyến nghị Điều hành:
1. **Tăng trưởng Doanh thu:** Doanh thu thuần Q3/2026 đạt đỉnh **$2.45M** (+16.7% so với cùng kỳ).
2. **Kiểm soát Chi phí:** Tỷ suất lợi nhuận gộp duy trì ổn định trên mức **33.8%**, biên EBITDA đạt **14.7%**.
3. **Artifacts:** Tài liệu báo cáo Executive Summary dạng Word A4 đã được khởi tạo và đồng bộ sang tab Workbench.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10002",
    title: "Đánh giá Chi phí Vận hành OPEX & EBITDA 2026",
    user_msg: "Tổng hợp chi phí vận hành theo phòng ban và tính toán chỉ số EBITDA năm 2026",
    sql_used: "SELECT department, SUM(opex_amount) as total_opex, SUM(budget_allocated) as budget FROM opex_records GROUP BY department;",
    assistant_msg: `### 📈 Đánh giá Chi phí Vận hành OPEX & Phân bổ Ngân sách 2026

Tổng chi phí vận hành (OPEX) lũy kế đạt **$1,770,000** trên tổng ngân sách phân bổ **$1,900,000** (Tỷ lệ giải ngân 93.1%):

- **Phòng Kỹ thuật & Công nghệ (R&D):** $620,000 / $650,000 (95.4%)
- **Phòng Bán hàng & Tiếp thị (Sales & Marketing):** $580,000 / $600,000 (96.7%)
- **Phòng Vận hành & Quản lý (G&A):** $340,000 / $400,000 (85.0%)
- **Chăm sóc Khách hàng (Customer Success):** $230,000 / $250,000 (92.0%)

Chỉ số **EBITDA hợp nhất** dự kiến đạt **$1,330,000**, vượt 8.2% kế hoạch đề ra.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10003",
    title: "Báo cáo Dòng tiền Lưu chuyển Thuần & Dự báo Q4",
    user_msg: "Phân tích dòng tiền kinh doanh thuần và xây dựng mô hình dự phóng dòng tiền Q4",
    sql_used: "SELECT month, operating_cash_flow, investing_cash_flow, financing_cash_flow, net_cash_flow FROM cash_flow_ledger;",
    assistant_msg: `### 💵 Báo cáo Dòng tiền Hoạt động Thuần (Cash Flow Analysis)

- **Dòng tiền từ Hoạt động Kinh doanh (CFO):** +$840,000 (Dương mạnh mẽ nhờ tối ưu công nợ).
- **Dòng tiền Đầu tư (CFI):** -$220,000 (Chi mua sắm hạ tầng máy chủ và Data Lakehouse).
- **Dòng tiền Tài chính (CFF):** -$150,000 (Chi trả cổ tức đợt 1 và lãi vay dài hạn).
- **Dòng tiền Thuần (Net Cash Flow):** **+$470,000**. Số dư tiền mặt cuối kỳ đạt **$3,120,000**.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10004",
    title: "Kiểm toán Biên Lợi Nhuận Gộp Theo Ngành Hàng",
    user_msg: "So sánh biên lợi nhuận gộp giữa các ngành hàng tiêu dùng và công nghệ",
    sql_used: "SELECT category, SUM(revenue) as rev, SUM(gross_profit) as gp, (SUM(gross_profit)*100.0/SUM(revenue)) as margin_pct FROM category_performance GROUP BY category;",
    assistant_msg: `### 🔍 Phân tích Tỷ suất Lợi nhuận Gộp Theo Danh mục Sản phẩm

1. **Thiết bị Điện tử & Công nghệ:** Doanh thu $1,200,000 | Lợi nhuận gộp $444,000 | **Biên LNG 37.0%**
2. **Hàng Tiêu dùng Nhanh (FMCG):** Doanh thu $850,000 | Lợi nhuận gộp $238,000 | **Biên LNG 28.0%**
3. **Phụ kiện & Thời trang:** Doanh thu $400,000 | Lợi nhuận gộp $148,000 | **Biên LNG 37.0%**

Nhóm Hàng Điện tử đóng góp 53.5% tổng lợi nhuận gộp của toàn hệ thống.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10005",
    title: "Tóm lược Tài chính Thường niên Hội đồng Quản trị",
    user_msg: "Biên soạn Executive Summary tổng hợp 5 chỉ số tài chính cốt lõi trình HĐQT",
    sql_used: "SELECT metric_name, target_value, actual_value, variance FROM kpi_board_summary;",
    assistant_msg: `### 🏛️ Executive Summary — Báo cáo Thường niên Trình HĐQT

1. **Doanh thu Thuần (Net Revenue):** $9,180,000 (Đạt 103.5% kế hoạch năm).
2. **Lợi nhuận Trước Thuế (PBT):** $1,420,000 (+18.4% YoY).
3. **Chỉ số ROE:** 22.4% (Tăng 3.1 điểm % so với năm trước).
4. **Vòng quay Vốn Lưu động:** 4.2 vòng/năm.
5. **Đòn bẩy Tài chính (D/E):** 0.45x (Mức độ an toàn cao).`
  },

  // Group 2: Excel 4-Tabs Workbook (5 sessions)
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10006",
    title: "Mô hình Tài chính 3 Báo cáo (3-Statement Model)",
    user_msg: "Xây dựng bảng tính Excel 4 tabs liên kết Income Statement, Balance Sheet, Cashflow và Ratios",
    sql_used: "SELECT * FROM financial_model_master;",
    assistant_msg: `### 📑 Khởi tạo Mô hình Bảng tính 3 Báo cáo Tài chính Liên kết (4 Tabs)

Bảng tính đã được tạo thành công trong **Workbench Excel Viewer**:
- **Tab 1: Income Statement** (Doanh thu, Giá vốn, Chi phí hoạt động, Lợi nhuận ròng).
- **Tab 2: Balance Sheet** (Tài sản ngắn hạn, Tài sản cố định, Nợ phải trả, Vốn chủ sở hữu).
- **Tab 3: Cash Flow Statement** (Dòng tiền kinh doanh, Đầu tư và Tài chính).
- **Tab 4: Financial Ratios** (ROE, ROA, Current Ratio, Quick Ratio, Debt-to-Equity).`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10007",
    title: "Bảng Tính Dự toán Ngân sách & Marketing Q4",
    user_msg: "Tạo Workbook ngân sách marketing đa kênh với hàm SUMIFS và VLOOKUP tự động",
    sql_used: "SELECT channel, allocated_budget, spent_budget, cpa, roas FROM marketing_budget_q4;",
    assistant_msg: `### 🎯 Bảng Phân bổ Ngân sách Marketing Đa kênh Q4

- **Google Ads Search & Performance Max:** Ngân sách $150,000 | Dự kiến ROAS: 4.8x
- **Facebook & TikTok Ads:** Ngân sách $120,000 | Dự kiến ROAS: 3.6x
- **KOL / Influencer Campaign:** Ngân sách $50,000 | Dự kiến CPA: $18.5
- **Email Marketing & CRM Retention:** Ngân sách $20,000 | Dự kiến ROAS: 8.2x

Hàm tính toán tự động \`=SUMIFS()\` và \`=VLOOKUP()\` đã được nạp vào Artifacts Excel.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10008",
    title: "Sổ cái Doanh thu Đa chi nhánh & Chiết khấu",
    user_msg: "Phân tích bảng doanh thu chi nhánh Bắc - Trung - Nam kèm công thức tính hoa hồng động",
    sql_used: "SELECT branch_region, total_sales, commission_rate, net_payout FROM branch_sales_ledger;",
    assistant_msg: `### 🏢 Sổ cái Doanh thu & Tỷ lệ Chiết khấu Đa Chi nhánh

- **Chi nhánh Miền Bắc (Hà Nội):** Doanh số $1,150,000 | Hoa hồng: $57,500 (5.0%)
- **Chi nhánh Miền Nam (TP.HCM):** Doanh số $1,480,000 | Hoa hồng: $88,800 (6.0%)
- **Chi nhánh Miền Trung (Đà Nẵng):** Doanh số $420,000 | Hoa hồng: $16,800 (4.0%)

Tổng thanh toán hoa hồng toàn hệ thống: **$163,100**.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10009",
    title: "Bảng Theo dõi Tồn kho & Vòng quay FIFO",
    user_msg: "Lập mô hình phân loại tồn kho FIFO và tính số ngày tồn kho bình quân (DSI)",
    sql_used: "SELECT sku_code, category, qty_on_hand, unit_cost, inventory_value, dsi_days FROM inventory_aging;",
    assistant_msg: `### 📦 Bảng Theo dõi Tồn kho & Tuổi hàng Tồn (FIFO Aging)

- **Tổng giá trị tồn kho:** $1,850,000 (14,200 đơn vị SKU).
- **Hàng lưu kho dưới 30 ngày (Tốt):** 76.5% ($1,415,250).
- **Hàng lưu kho 31 - 60 ngày (Cảnh báo nhẹ):** 18.2% ($336,700).
- **Hàng lưu kho trên 90 ngày (Chậm luân chuyển):** 5.3% ($98,050).
- **Số ngày tồn kho bình quân (DSI):** **26.4 ngày**.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10010",
    title: "Bảng Tính Định giá Doanh nghiệp DCF & WACC",
    user_msg: "Xây dựng ma trận độ nhạy định giá chiết khấu dòng tiền DCF theo biến số lãi suất",
    sql_used: "SELECT year, fcf_forecast, discount_factor, pv_fcf FROM dcf_valuation_model;",
    assistant_msg: `### 💎 Mô hình Định giá Doanh nghiệp Chiết khấu Dòng tiền (DCF Model)

- **WACC (Chi phí vốn bình quân gia quyền):** 10.5%
- **Tốc độ tăng trưởng dài hạn (Terminal Growth Rate g):** 3.5%
- **Giá trị Hiện tại Dòng tiền (PV of FCF 5 năm):** $4,850,000
- **Giá trị Cuối kỳ (Terminal Value):** $12,400,000
- **Định giá Doanh nghiệp (Enterprise Value):** **$17,250,000** ($14.8/cổ phần).`
  },

  // Group 3: Slide 16:9 Presentation (5 sessions)
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10011",
    title: "Slide Báo cáo Kết quả Kinh doanh Q3",
    user_msg: "Tạo bộ Slide 16:9 5 trang tóm tắt thành tích kinh doanh và chiến lược Q4",
    sql_used: "SELECT * FROM q3_presentation_deck;",
    assistant_msg: `### 📽️ Bộ Slide Thuyết trình Điều hành Kết quả Q3/2026

Bộ slide 16:9 5 trang đã được tạo và sẵn sàng trình chiếu trong **Workbench Slide Viewer**:
1. **Slide 1 (Hero Title):** Kết quả Kinh doanh Q3 & Định hướng Bứt phá Q4.
2. **Slide 2 (3-Pillar Metrics):** Doanh thu $2.45M | Lợi nhuận $830K | Tăng trưởng 16.7%.
3. **Slide 3 (Split Grid Analysis):** So sánh hiệu suất sản phẩm chủ lực và kênh bán lẻ.
4. **Slide 4 (Key Takeaways):** 3 điểm sáng trong tối ưu chuỗi cung ứng.
5. **Slide 5 (Next Steps Roadmap):** Lộ trình triển khai chiến dịch Black Friday & Tết 2027.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10012",
    title: "Pitch Deck Gọi vốn Series A — AI Platform",
    user_msg: "Thiết kế Slide thuyết trình sản phẩm, mô hình kinh doanh và chỉ số traction",
    sql_used: "SELECT * FROM series_a_pitch_deck;",
    assistant_msg: `### 🚀 Pitch Deck Series A — Autonomous AI Analytics Platform

Bộ slide thuyết trình gọi vốn $5M:
- **Problem & Solution:** Giải quyết điểm nghẽn phân tích dữ liệu thủ công bằng AI Coworker.
- **Market Size:** TAM $48B | SAM $12B | SOM $1.8B tại thị trường Châu Á - Thái Bình Dương.
- **Traction:** ARR đạt $1.2M (+320% YoY), 45 khách hàng Enterprise, Net Retention 135%.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10013",
    title: "Slide Kế hoạch Mở rộng Thị trường Đông Nam Á",
    user_msg: "Tổng hợp bản đồ cơ hội thị trường và lộ trình go-to-market 4 quý tới",
    sql_used: "SELECT * FROM sea_expansion_plan;",
    assistant_msg: `### 🌏 Kế hoạch Mở rộng Thị trường Khu vực Đông Nam Á 2027

- **Thị trường Trọng tâm:** Thái Lan, Indonesia, Malaysia và Singapore.
- **Chiến lược Thâm nhập:** Đối tác bản địa phân phối cấp 1 và kênh bán hàng trực tiếp B2B.
- **Dự kiến Doanh thu Quốc tế:** Đóng góp 25% tổng ARR vào cuối năm 2027.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10014",
    title: "Báo cáo Trải nghiệm Khách hàng & NPS 2026",
    user_msg: "Tạo slide trực quan hóa điểm hài lòng khách hàng và phân khúc người dùng",
    sql_used: "SELECT * FROM cx_nps_report;",
    assistant_msg: `### 🌟 Báo cáo Trải nghiệm Khách hàng & Chỉ số Net Promoter Score (NPS)

- **Điểm NPS Chung:** **+68** (Mức xuất sắc trong ngành SaaS).
- **Tỷ lệ Khách hàng Promoter:** 74% | Passive: 20% | Detractor: 6%.
- **Thời gian Giải quyết Yêu cầu (First Contact Resolution):** Giảm từ 4.2h xuống 1.1h.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10015",
    title: "Slide Chiến lược Chuyển đổi Số Lakehouse",
    user_msg: "Trình bày kiến trúc dữ liệu hiện đại và kế hoạch hiện đại hóa hệ thống phân tích",
    sql_used: "SELECT * FROM lakehouse_architecture;",
    assistant_msg: `### 🏗️ Kiến trúc Dữ liệu Hiện đại & Modern Data Lakehouse

- **Lớp Ingestion:** Kafka + CDC thời gian thực kết nối từ 12 cơ sở dữ liệu nguồn.
- **Lớp Lưu trữ:** Apache Iceberg + ClickHouse tốc độ truy vấn mili-giây.
- **Lớp AI Agent:** DB-GPT Autonomous Engine phân tích và tự động xuất tài liệu điều hành.`
  },

  // Group 4: SQL Data Warehouse Queries & Charts (5 sessions)
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10016",
    title: "Truy vấn Chỉ số VN-Index & Biểu đồ Nến",
    user_msg: "Thực thi câu lệnh SQL lấy dữ liệu giá mở/đóng/cao/thấp và render biểu đồ nến",
    sql_used: "SELECT trade_date, open_price, high_price, low_price, close_price, volume FROM market_index_daily ORDER BY trade_date DESC LIMIT 30;",
    assistant_msg: `### 📈 Diễn biến Chỉ số VN-Index & Phân tích Kỹ thuật

Chỉ số VN-Index đóng cửa phiên gần nhất tại mức **1,280.45 điểm** (+15.30 điểm, +1.21%):
- **Khối lượng giao dịch:** 720 triệu cổ phiếu (Thanh khoản đạt 18,450 tỷ VNĐ).
- **Đường trung bình MA20:** 1,262.4 điểm (Duy trì xu hướng tăng giá ngắn hạn).
- **Vùng kháng cự gần nhất:** 1,295 - 1,300 điểm.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10017",
    title: "Top 10 Khách hàng VIP và Doanh số Đóng góp",
    user_msg: "Tìm 10 khách hàng có tổng giá trị đơn hàng cao nhất và phân tích tỷ trọng",
    sql_used: "SELECT customer_name, SUM(order_total) as gmv, COUNT(order_id) as total_orders FROM orders GROUP BY customer_name ORDER BY gmv DESC LIMIT 10;",
    assistant_msg: `### 🏆 Top 10 Khách hàng Doanh nghiệp Đóng góp Doanh số Lớn nhất

1. **Tập đoàn Bán lẻ Vincom Retail:** $485,000 (14 đơn hàng)
2. **Công ty CP Thế Giới Di Động (MWG):** $412,000 (18 đơn hàng)
3. **Tập đoàn FPT Telecom:** $368,000 (11 đơn hàng)
4. **Viettel Post Logistics:** $295,000 (9 đơn hàng)
5. **Tổng Công ty May 10:** $240,000 (8 đơn hàng)

Top 10 khách hàng chiếm 42.8% tổng GMV toàn sàn.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10018",
    title: "Phân tích Cohort Retention 12 Tháng Qua",
    user_msg: "Chạy query phân tích tỷ lệ giữ chân khách hàng 12 tháng qua",
    sql_used: "SELECT cohort_month, month_number, active_users_pct FROM user_retention_cohort ORDER BY cohort_month, month_number;",
    assistant_msg: `### 👥 Phân tích Tỷ lệ Giữ chân Khách hàng (Cohort Retention Analysis)

- **Retention Tháng thứ 1 (M1):** Trung bình đạt 68.4% (Tốt hơn chuẩn ngành 55%).
- **Retention Tháng thứ 3 (M3):** Duy trì ổn định ở mức 52.1%.
- **Retention Tháng thứ 6 (M6):** Đạt 44.8%.
- **Tỷ lệ Churn Rate hàng tháng:** Giảm từ 3.8% xuống 2.1%.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10019",
    title: "Kiểm tra Tốc độ Xử lý Đơn hàng & SLA Logistics",
    user_msg: "Truy vấn thời gian hoàn tất đơn hàng trung bình theo từng trung tâm logistics",
    sql_used: "SELECT hub_location, AVG(fulfillment_hours) as avg_sla, COUNT(shipment_id) as shipments FROM fulfillment_logs GROUP BY hub_location;",
    assistant_msg: `### 🚚 Hiệu suất Trung tâm Xử lý Đơn hàng & SLA Giao nhận

- **Hub Hà Nội (Kho Long Biên):** Thời gian xử lý: **1.8 giờ** | Tỷ lệ đúng hạn SLA: 98.4%
- **Hub TP.HCM (Kho Tân Bình):** Thời gian xử lý: **1.6 giờ** | Tỷ lệ đúng hạn SLA: 99.1%
- **Hub Đà Nẵng (Kho Hòa Khánh):** Thời gian xử lý: **2.3 giờ** | Tỷ lệ đúng hạn SLA: 96.8%

Toàn bộ 98.6% đơn hàng nội thành được giao thành công trong vòng 24 giờ.`
  },
  {
    id: "019183ab-4521-7294-81d3-9f88c3a10020",
    title: "Tổng hợp Tỷ lệ Chuyển đổi Phễu Marketing",
    user_msg: "Trích xuất dữ liệu phễu từ Impression -> Click -> Lead -> Paid Customer",
    sql_used: "SELECT funnel_stage, count_users, conversion_rate FROM marketing_funnel_stats ORDER BY stage_order ASC;",
    assistant_msg: `### 🎯 Tỷ lệ Chuyển đổi Phễu Tiếp thị (Marketing Funnel Conversion)

1. **Lượt hiển thị (Impressions):** 1,450,000 (100%)
2. **Lượt nhấp (Clicks / CTR 4.8%):** 69,600 (4.8%)
3. **Đăng ký tài khoản (Signups / CVR 18.5%):** 12,876 (0.89%)
4. **Kích hoạt dùng thử (Trial Activated / CVR 62%):** 7,983 (0.55%)
5. **Khách hàng trả phí (Paid Customers / CVR 24.2%):** **1,932** (0.13%)

Chi phí trên mỗi khách hàng trả phí (CAC): **$42.5** (LTV/CAC = 5.2x).`
  }
];

function sendPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port: 5670,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      let buf = '';
      res.on('data', (chunk) => buf += chunk);
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function seedMessages() {
  console.log("Starting full message seeding for all 20 sessions...");
  for (const s of SESSIONS_WITH_MESSAGES) {
    // 1. User message
    await sendPost(`/api/v1/analyst/conversations/${s.id}/messages`, {
      role: 'user',
      content: s.user_msg
    });

    // 2. Assistant message with SQL & formatted markdown
    await sendPost(`/api/v1/analyst/conversations/${s.id}/messages`, {
      role: 'assistant',
      content: s.assistant_msg,
      sql_used: s.sql_used
    });
    console.log(`Seeded messages for session: ${s.title}`);
  }
  console.log("All 20 sessions now have rich multi-round conversation history!");
}

seedMessages();
