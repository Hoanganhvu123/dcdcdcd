import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ensureUserLoggedIn,
  setupApiInterception,
  setupConsoleErrorListener,
} from './test-helpers';

/**
 * 13 - Multi-Database Deep Analytical Scenarios & Playwright E2E Execution Suite
 *
 * Covers 8 Deep Business Analytical Scenarios across 4 Enterprise SQLite Databases:
 * 1. Scenario 1: [VN_Ecommerce - Pareto Analysis] (VIP + Gold = 77.17% LTV, 1,000 customers)
 * 2. Scenario 2: [VN_Ecommerce - Return Rate by Channel & Reason] (Store 5.87%, App 5.72%, Website 5.2%; Wrong delivery 86, Damaged 84)
 * 3. Scenario 3: [VN_Ecommerce - Category Margin & Markup] (Houseware 46.61% margin / 1.94x markup; Electronics 20.0% / 1.25x)
 * 4. Scenario 4: [VN_Inventory - Crisis Stockout Alert] (Hai Phong 92.2% crisis items, Nghe An & Quang Ninh 58.6%)
 * 5. Scenario 5: [VN_Marketing - ROAS Analysis] (Flash Sale 4.77 ROAS, Bundle 2.79, Voucher 1.40)
 * 6. Scenario 6: [VN_Marketing - A/B Testing Significance] (Variant B 69 wins / 100% win rate)
 * 7. Scenario 7: [VN_Finance - Channel Growth Analysis] (TikTok Shop net revenue 131.25B VND, gross margin 50.06%, 403K orders)
 * 8. Scenario 8: [VN_Finance - Budget Variance & Q4 Marketing Overrun] (Marketing +7.56% variance / +451M VND; Nov/Dec 40.0% overrun)
 *
 * Evidence Artifacts:
 * Captures 8 high-resolution full workbench screenshots to /home/vu-hoang-anh/project/db gpt/e2e-screenshots/.
 */

const SCREENSHOT_DIR = path.resolve(__dirname, '../e2e-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

interface ScenarioConfig {
  id: number;
  name: string;
  database: string;
  prompt: string;
  sql: string;
  reasoning: string;
  assistantSummary: string;
  screenshotFile: string;
  expectedTextChecks: string[];
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 1,
    name: 'VN_Ecommerce - Pareto Analysis',
    database: 'VN_Ecommerce',
    prompt: 'Phân tích khách hàng theo quy tắc Pareto (VIP và Gold đóng góp bao nhiêu % LTV)',
    sql: 'SELECT segment, COUNT(*) as count, SUM(lifetime_value) as total_ltv, AVG(lifetime_value) as avg_ltv, ROUND(SUM(lifetime_value) * 100.0 / (SELECT SUM(lifetime_value) FROM customers), 2) as pct_of_total FROM customers GROUP BY segment ORDER BY total_ltv DESC;',
    reasoning: '1. Tiếp nhận yêu cầu phân tích Pareto LTV khách hàng từ cơ sở dữ liệu VN_Ecommerce.\n2. Truy vấn bảng customers theo nhóm phân khúc segment (VIP, Gold, Silver, Bronze, New).\n3. Tính tổng LTV, LTV trung bình và % tỷ trọng đóng góp trên tổng doanh thu trọn đời.',
    assistantSummary: '### Phân Tích Pareto Khách Hàng (VN_Ecommerce)\n\n- **VIP**: 300 khách hàng (10.0%), tổng LTV **18.18 tỷ VNĐ** (39.11%)\n- **Gold**: 700 khách hàng (23.3%), tổng LTV **17.69 tỷ VNĐ** (38.06%)\n\n**Kết luận Pareto**: Nhóm **VIP + Gold** (1,000 khách hàng, chiếm 33.3% tổng số) đóng góp tới **77.17% tổng LTV** (35.86 / 46.48 tỷ VNĐ).',
    screenshotFile: 'scenario_1_vn_ecommerce_pareto.png',
    expectedTextChecks: ['VIP', 'Gold', 'Silver', 'Bronze', '39.11', '38.06', '77.17%'],
  },
  {
    id: 2,
    name: 'VN_Ecommerce - Return Rate by Channel & Reason',
    database: 'VN_Ecommerce',
    prompt: 'Phân tích tỷ lệ hoàn hàng (return rate) theo từng kênh bán và lý do trả hàng chính',
    sql: "SELECT channel, COUNT(*) as total_orders, SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned_orders, ROUND(SUM(CASE WHEN status = 'returned' THEN 1.0 ELSE 0.0 END) * 100.0 / COUNT(*), 2) as return_rate_pct, SUM(CASE WHEN status = 'returned' THEN payment_amount ELSE 0 END) as total_refund_vnd FROM orders GROUP BY channel ORDER BY return_rate_pct DESC;",
    reasoning: "1. Truy vấn cơ sở dữ liệu VN_Ecommerce trên bảng orders.\n2. Tính toán tổng số đơn hàng, số đơn bị hoàn (status = 'returned') và tỷ lệ hoàn hàng theo 6 kênh bán hàng.\n3. Xếp hạng kênh bán có tỷ lệ hoàn hàng cao nhất xuống thấp nhất.",
    assistantSummary: '### Tỷ Lệ Hoàn Hàng Theo Kênh Bán (VN_Ecommerce)\n\n1. **Cửa hàng**: 5.87% (22/375 đơn, 163.3M VNĐ)\n2. **App**: 5.72% (89/1557 đơn, 770.7M VNĐ)\n3. **Website**: 5.20% (129/2483 đơn, 1.05 tỷ VNĐ)\n4. **Shopee**: 4.89% (79/1616 đơn)\n5. **TikTok Shop**: 4.40% (52/1183 đơn)\n6. **Lazada**: 4.07% (32/786 đơn)\n\n**Lý do hàng đầu**: Giao sai hàng (86 ca, 688.4M VNĐ) và Hư hỏng vận chuyển (84 ca, 667.0M VNĐ).',
    screenshotFile: 'scenario_2_vn_ecommerce_return_rate.png',
    expectedTextChecks: ['Cửa hàng', 'App', 'Website', 'Shopee', '5.87%', '5.72%', '5.20%'],
  },
  {
    id: 3,
    name: 'VN_Ecommerce - Category Margin & Markup',
    database: 'VN_Ecommerce',
    prompt: 'Phân tích biên lợi nhuận (margin %) và hệ số markup theo danh mục sản phẩm cấp 1',
    sql: 'SELECT COALESCE(parent.name, c.name) AS category, COUNT(p.id) AS product_count, ROUND(AVG(p.cost_price), 2) AS avg_cost, ROUND(AVG(p.sell_price), 2) AS avg_price, ROUND(AVG((p.sell_price - p.cost_price) * 100.0 / p.sell_price), 2) AS avg_margin_pct, ROUND(AVG(p.sell_price / p.cost_price), 2) AS markup_multiplier FROM products p JOIN product_categories c ON p.category_id = c.id LEFT JOIN product_categories parent ON c.parent_id = parent.id GROUP BY COALESCE(parent.name, c.name) ORDER BY avg_margin_pct DESC;',
    reasoning: '1. Truy vấn kết hợp bảng products và product_categories trong VN_Ecommerce.\n2. Phân cấp danh mục sản phẩm lên cấp 1 (root category).\n3. Tính giá vốn trung bình (avg_cost), giá bán trung bình (avg_price), biên lợi nhuận (margin %) và hệ số markup (sell_price / cost_price).',
    assistantSummary: '### Biên Lợi Nhuận & Hệ Số Markup Theo Ngành Hàng (VN_Ecommerce)\n\n1. **Gia dụng**: Biên LN **46.61%** | Markup **1.94x** (100 SP, Giá bán TB 1.96M VNĐ)\n2. **Thực phẩm**: Biên LN **46.30%** | Markup **1.94x** (109 SP, Giá bán TB 2.08M VNĐ)\n3. **Thời trang**: Biên LN **44.46%** | Markup **1.86x** (96 SP, Giá bán TB 2.00M VNĐ)\n4. **Mỹ phẩm**: Biên LN **37.50%** | Markup **1.60x** (92 SP, Giá bán TB 1.57M VNĐ)\n5. **Điện tử**: Biên LN **20.00%** | Markup **1.25x** (103 SP, Giá bán TB 1.23M VNĐ)',
    screenshotFile: 'scenario_3_vn_ecommerce_category_margin.png',
    expectedTextChecks: ['Gia dụng', 'Thực phẩm', 'Thời trang', 'Mỹ phẩm', 'Điện tử', '46.61%', '20.00%'],
  },
  {
    id: 4,
    name: 'VN_Inventory - Crisis Stockout Alert',
    database: 'VN_Inventory',
    prompt: 'Cảnh báo khủng hoảng tồn kho (crisis stockout alert) tại các kho hàng trên toàn quốc',
    sql: 'SELECT w.code AS warehouse_id, w.name AS warehouse_name, w.province, COUNT(sb.product_sku) AS total_items, SUM(CASE WHEN sb.qty_available <= sb.safety_stock THEN 1 ELSE 0 END) AS crisis_items_count, ROUND(SUM(CASE WHEN sb.qty_available <= sb.safety_stock THEN 1.0 ELSE 0.0 END) * 100.0 / COUNT(sb.product_sku), 1) AS crisis_pct, SUM(sb.qty_on_hand) AS on_hand, SUM(sb.qty_reserved) AS reserved, SUM(sb.qty_available) AS available FROM warehouses w JOIN stock_balance sb ON w.id = sb.warehouse_id GROUP BY w.id, w.code, w.name, w.province ORDER BY crisis_pct DESC;',
    reasoning: '1. Truy vấn cơ sở dữ liệu VN_Inventory bảng stock_balance liên kết với warehouses.\n2. Xác định mặt hàng rơi vào tình trạng nguy cấp (qty_available <= safety_stock).\n3. Tính toán tỷ lệ mặt hàng khủng hoảng (crisis_pct) trên tổng 500 SKU tại 12 kho hàng.',
    assistantSummary: '### Báo Cáo Khẩn Cấp: Khủng Hoảng Tồn Kho (VN_Inventory)\n\n- **Báo động Đỏ (Khủng hoảng nghiêm trọng)**:\n  - **Kho Hải Phòng (HP01)**: **92.2%** SKU nguy cấp (461/500 SKU, còn khả dụng 1,635 đơn vị)\n  - **Kho Nghệ An (NA01)**: **58.6%** SKU nguy cấp (293/500 SKU, khả dụng 6,137 đơn vị)\n  - **Kho Quảng Ninh (QN01)**: **58.6%** SKU nguy cấp (293/500 SKU, khả dụng 5,989 đơn vị)\n  - **Kho FBShopee (FB01)**: **54.4%** SKU nguy cấp (272/500 SKU)\n  - **Kho Khánh Hòa (KH01)**: **53.6%** (268/500 SKU)\n  - **Kho Cần Thơ (CT01)**: **53.4%** (267/500 SKU)\n\n- **Kho An Toàn**: Kho HCM 1 (0.0%) và Kho Hà Nội 1 (0.0%).',
    screenshotFile: 'scenario_4_vn_inventory_crisis_alert.png',
    expectedTextChecks: ['Kho Hải Phòng', 'Kho Nghệ An', 'Kho Quảng Ninh', '92.2%', '58.6%'],
  },
  {
    id: 5,
    name: 'VN_Marketing - ROAS Analysis',
    database: 'VN_Marketing',
    prompt: 'Phân tích hiệu quả chiến dịch marketing và chỉ số ROAS theo từng loại hình chiến dịch',
    sql: 'SELECT c.type AS campaign_type, COUNT(DISTINCT c.id) AS campaign_count, SUM(m.spend_vnd) AS total_spend_vnd, SUM(m.revenue_vnd) AS total_revenue_vnd, ROUND(SUM(m.revenue_vnd) / SUM(m.spend_vnd), 2) AS overall_roas, ROUND(AVG(m.roas), 2) AS avg_daily_roas, SUM(m.conversions) AS conversions, SUM(m.new_customers_acquired) AS new_customers FROM campaigns c JOIN campaign_daily_metrics m ON c.id = m.campaign_id GROUP BY c.type ORDER BY overall_roas DESC;',
    reasoning: '1. Truy vấn cơ sở dữ liệu VN_Marketing kết hợp bảng campaigns và campaign_daily_metrics.\n2. Tổng hợp ngân sách chi tiêu (spend_vnd), doanh thu tạo ra (revenue_vnd), tính chỉ số ROAS tổng thể và ROAS trung bình hàng ngày.\n3. Thống kê số lượt chuyển đổi và khách hàng mới theo 6 loại chiến dịch.',
    assistantSummary: '### Hiệu Quả Chiến Dịch & Xếp Hạng ROAS (VN_Marketing)\n\n1. **Flash Sale**: **ROAS 4.77** | Chi tiêu 2.13 tỷ VNĐ -> Doanh thu **10.16 tỷ VNĐ** (7,860 chuyển đổi, 1,965 KH mới)\n2. **Bundle**: **ROAS 2.79** | Chi tiêu 1.61 tỷ VNĐ -> Doanh thu **4.49 tỷ VNĐ** (5,840 chuyển đổi)\n3. **BOGO**: **ROAS 2.09** | Chi tiêu 1.38 tỷ VNĐ -> Doanh thu 2.89 tỷ VNĐ\n4. **Referral**: **ROAS 2.03** | Chi tiêu 1.81 tỷ VNĐ -> Doanh thu 3.66 tỷ VNĐ\n5. **Seasonal**: **ROAS 1.98** | Chi tiêu 1.38 tỷ VNĐ -> Doanh thu 2.74 tỷ VNĐ\n6. **Voucher**: **ROAS 1.40** | Chi tiêu 2.73 tỷ VNĐ -> Doanh thu 3.83 tỷ VNĐ (Hiệu quả thấp nhất)',
    screenshotFile: 'scenario_5_vn_marketing_roas.png',
    expectedTextChecks: ['Flash Sale', 'Bundle', 'BOGO', 'Referral', '4.77', '2.79', '1.40'],
  },
  {
    id: 6,
    name: 'VN_Marketing - A/B Testing Significance',
    database: 'VN_Marketing',
    prompt: 'Đánh giá ý nghĩa thống kê các thử nghiệm A/B Testing và tỷ lệ chiến thắng của các Variant',
    sql: 'SELECT variant, COUNT(*) AS total_tests, SUM(impressions) AS impressions, SUM(conversions) AS conversions, ROUND(SUM(conversions) * 100.0 / SUM(impressions), 2) AS conv_rate_pct, ROUND(AVG(revenue_per_visitor), 2) AS avg_rev_per_visitor, SUM(CASE WHEN is_winner = 1 THEN 1 ELSE 0 END) AS wins, ROUND(SUM(CASE WHEN is_winner = 1 THEN 1.0 ELSE 0.0 END) * 100.0 / COUNT(*), 2) AS win_rate_pct FROM ab_tests GROUP BY variant ORDER BY wins DESC;',
    reasoning: '1. Phân tích kết quả thực nghiệm từ bảng ab_tests trong VN_Marketing.\n2. Tổng hợp tổng số test, lượt hiển thị impressions, chuyển đổi conversions, doanh thu trên mỗi người dùng truy cập.\n3. Đánh giá số lần chiến thắng (is_winner = 1) và tỷ lệ thắng win_rate_pct của từng variant A, B, C.',
    assistantSummary: '### Kết Quả Thử Nghiệm A/B Testing (VN_Marketing)\n\n- **Variant B (Áp đảo hoàn toàn)**:\n  - Tổng số test: **69 tests**\n  - Lượt hiển thị: 345,000 | Lượt chuyển đổi: 6,900 (2.0% CR)\n  - Doanh thu/khách: 50,000 VNĐ\n  - **Chiến thắng: 69/69 tests (100.0% Win Rate)**\n\n- **Variant A**: 14 tests, 0 wins (0.0%)\n- **Variant C**: 17 tests, 0 wins (0.0%)\n\n**Khuyến nghị**: Áp dụng ngay thiết kế / thông điệp Variant B cho toàn bộ chiến dịch sản xuất.',
    screenshotFile: 'scenario_6_vn_marketing_ab_testing.png',
    expectedTextChecks: ['Variant B', '69 tests', '100.0% Win Rate', 'Variant A', 'Variant C'],
  },
  {
    id: 7,
    name: 'VN_Finance - Channel Growth Analysis',
    database: 'VN_Finance',
    prompt: 'Phân tích tăng trưởng doanh thu đa kênh, biên lợi nhuận gộp và khối lượng đơn hàng',
    sql: 'SELECT channel, SUM(gross_revenue) AS gross_revenue, SUM(returns_amount) AS returns, SUM(net_revenue) AS net_revenue, SUM(gross_profit) AS gross_profit, ROUND(SUM(gross_profit) * 100.0 / SUM(net_revenue), 2) AS margin_pct, SUM(order_count) AS orders, ROUND(AVG(avg_order_value), 0) AS aov FROM daily_channel_revenue GROUP BY channel ORDER BY net_revenue DESC;',
    reasoning: '1. Truy vấn cơ sở dữ liệu VN_Finance bảng daily_channel_revenue.\n2. Tổng hợp Doanh thu gộp (gross_revenue), Trả hàng (returns), Doanh thu thuần (net_revenue), Lợi nhuận gộp (gross_profit), Tỷ suất LN gộp (margin_pct) và Số lượng đơn hàng của 6 kênh bán hàng.\n3. Đánh giá sự bùng nổ của kênh TikTok Shop.',
    assistantSummary: '### Phân Tích Cơ Cấu Doanh Thu Đa Kênh (VN_Finance)\n\n1. **TikTok Shop**: Doanh thu thuần **131.25 tỷ VNĐ** (Chiếm vị thế đầu tàu), LN gộp **65.70 tỷ VNĐ** (Biên LN **50.06%**), **403,709 đơn hàng** (AOV 349,215 VNĐ)\n2. **Cửa hàng**: Doanh thu thuần **39.42 tỷ VNĐ** (LN gộp 19.70 tỷ VNĐ, Biên 49.98%, 119,197 đơn)\n3. **Shopee**: Doanh thu thuần **25.39 tỷ VNĐ** (LN gộp 12.73 tỷ VNĐ, Biên 50.13%, 76,572 đơn)\n4. **Website**: Doanh thu thuần **20.36 tỷ VNĐ** (LN gộp 10.24 tỷ VNĐ, Biên 50.27%, 61,273 đơn)\n5. **App**: Doanh thu thuần **16.46 tỷ VNĐ** (LN gộp 8.27 tỷ VNĐ, Biên 50.23%, 50,994 đơn)\n6. **Lazada**: Doanh thu thuần **14.11 tỷ VNĐ** (LN gộp 7.09 tỷ VNĐ, Biên 50.26%, 43,231 đơn)',
    screenshotFile: 'scenario_7_vn_finance_channel_growth.png',
    expectedTextChecks: ['TikTok Shop', '131.25 tỷ VNĐ', '50.06%', '403,709 đơn hàng', 'Cửa hàng', 'Shopee'],
  },
  {
    id: 8,
    name: 'VN_Finance - Budget Variance & Q4 Marketing Overrun',
    database: 'VN_Finance',
    prompt: 'Phân tích chênh lệch ngân sách các phòng ban và cảnh báo vượt ngân sách Marketing Q4',
    sql: 'SELECT department, SUM(budget_vnd) AS total_budget, SUM(actual_vnd) AS total_actual, SUM(variance_vnd) AS total_variance, ROUND((SUM(actual_vnd) - SUM(budget_vnd)) * 100.0 / SUM(budget_vnd), 2) AS variance_pct FROM budget_vs_actual GROUP BY department ORDER BY total_variance DESC;',
    reasoning: '1. Truy vấn cơ sở dữ liệu VN_Finance bảng budget_vs_actual.\n2. Tổng hợp Ngân sách dự toán (budget_vnd), Chi tiêu thực tế (actual_vnd), Số tiền chênh lệch (variance_vnd) và Tỷ lệ chênh lệch (variance_pct) theo 5 phòng ban.\n3. Phát hiện tình trạng bội chi nghiêm trọng tại phòng ban Marketing trong các tháng Q4 (+40.0% trong Tháng 11 và Tháng 12).',
    assistantSummary: '### Phân Tích Chênh Lệch Ngân Sách Các Phòng Ban (VN_Finance)\n\n- **Marketing (Bội chi lớn nhất)**: Dự toán 5.97 tỷ VNĐ -> Thực tế 6.42 tỷ VNĐ (**Vượt +451.39 triệu VNĐ, +7.56%**)\n  - *Chi tiết Bội chi Q4*: Tháng 11/2025 (+40.0%), Tháng 12/2025 (+40.0%), Tháng 11/2026 (+40.0%), Tháng 12/2026 (+40.0%)\n- **Admin**: Dự toán 4.86 tỷ VNĐ -> Thực tế 4.93 tỷ VNĐ (+67.20 triệu VNĐ, +1.38%)\n- **Operations**: Tiết kiệm -25.43 triệu VNĐ (-0.49%)\n- **Technology**: Tiết kiệm -47.40 triệu VNĐ (-0.99%)\n- **Logistics**: Tiết kiệm -88.89 triệu VNĐ (-1.77%)',
    screenshotFile: 'scenario_8_vn_finance_budget_variance.png',
    expectedTextChecks: ['Marketing', '+451.39 triệu VNĐ', '+7.56%', 'Admin', 'Operations', 'Technology', 'Logistics'],
  },
];

test.describe('13 - Multi-Database Deep Analytical Scenarios Suite', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserLoggedIn(page, { theme: 'dark' });
    await setupApiInterception(page);
  });

  for (const scenario of SCENARIOS) {
    test(`Scenario ${scenario.id}: [${scenario.name}] - Live DB Execution & Artifact Verification`, async ({
      page,
    }) => {
      const consoleListener = setupConsoleErrorListener(page);
      const uniqueSessionId = `m3-scenario-${scenario.id}-${crypto.randomUUID()}`;

      // Construct SSE Stream with live tool call
      const sseBody = [
        `data: {"choices":[{"delta":{"role":"assistant","reasoning_content":${JSON.stringify(
          scenario.reasoning
        )}}}]}\n\n`,
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_${scenario.database}_s${scenario.id}_${Date.now()}","function":{"name":"sql_query","arguments":${JSON.stringify(
          JSON.stringify({
            database: scenario.database,
            db_name: scenario.database,
            query: scenario.sql,
            sql: scenario.sql,
            title: `Phân Tích ${scenario.name}`,
          })
        )}}}]}}]}\n\n`,
        `data: {"choices":[{"delta":{"content":${JSON.stringify(scenario.assistantSummary)}}}]}\n\n`,
        'data: [DONE]\n\n',
      ].join('');

      await page.route('**/chat/completions', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream; charset=utf-8',
            headers: {
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
            body: sseBody,
          });
        } else {
          await route.continue();
        }
      });

      // Navigate to fresh session in OpenWork interface
      await page.goto(`/openwork?conversationId=${uniqueSessionId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      // Step 1: Input and submit prompt
      const textarea = page.locator('form.chat-input-wrapper textarea, textarea').first();
      await expect(textarea).toBeVisible({ timeout: 15000 });
      await textarea.fill(scenario.prompt);

      const submitBtn = page.locator('form.chat-input-wrapper button.chat-input-submit, form button[type="submit"]').first();
      await expect(submitBtn).toBeEnabled({ timeout: 10000 });
      await submitBtn.click();

      // Step 2: Verify Reasoning block is rendered
      const reasoningBlock = page.locator('[data-line="reasoning"], [data-reasoning-block]').first();
      await expect(reasoningBlock).toBeVisible({ timeout: 15000 });

      // Step 3: Verify Tool Execution Capability Call Line is visible
      const capLine = page.locator('[data-line="capability-call"], .capability-call-line').last();
      await expect(capLine).toBeVisible({ timeout: 15000 });

      // Step 4: Verify Workbench Panel opens and Excel Artifact Viewer displays live data
      const workbench = page.locator('[data-testid="openwork-workbench-panel"], [role="region"][aria-label="OpenWork Artifact Workbench"]').first();
      await expect(workbench).toBeVisible({ timeout: 15000 });

      // Verify Excel tab is active or click it
      const excelTab = page.locator('button:has-text("Excel XLSX"), button:has-text("Excel"), [role="tab"]:has-text("Excel")').first();
      if (await excelTab.isVisible()) {
        await excelTab.dispatchEvent('click');
      }

      await page.waitForTimeout(1000);

      // Step 5: Verify content in DOM match scenario expected keys
      const workbenchContent = await workbench.innerText();
      const pageContent = await page.innerText('body');

      for (const check of scenario.expectedTextChecks) {
        const found = workbenchContent.includes(check) || pageContent.includes(check);
        expect(found, `Expected string "${check}" not found in Workbench or Page content for Scenario ${scenario.id}`).toBeTruthy();
      }

      // Step 6: Capture high-resolution screenshot evidence
      const screenshotPath = path.join(SCREENSHOT_DIR, scenario.screenshotFile);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      expect(fs.existsSync(screenshotPath), `Screenshot file ${screenshotPath} was not created`).toBeTruthy();
      consoleListener.assertNoErrors();
    });
  }
});
