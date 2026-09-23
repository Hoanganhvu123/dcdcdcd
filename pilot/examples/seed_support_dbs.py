import sqlite3
import random
from datetime import datetime, timedelta
import os

random.seed(42)

BASE_DIR = '/home/vu-hoang-anh/project/db gpt/pilot/examples/'
os.makedirs(BASE_DIR, exist_ok=True)

start_date = datetime(2025, 7, 1)
end_date = datetime(2026, 12, 31)
date_list = [(start_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range((end_date - start_date).days + 1)]
months_list = sorted(list(set([d[:7] for d in date_list])))

def create_connection(db_file):
    conn = sqlite3.connect(os.path.join(BASE_DIR, db_file))
    return conn

# ==========================================
# 1. VN_Inventory.db
# ==========================================
conn_inv = create_connection('VN_Inventory.db')
c = conn_inv.cursor()

c.execute('''CREATE TABLE IF NOT EXISTS warehouses (
    id TEXT PRIMARY KEY, code TEXT, name TEXT, location TEXT, province TEXT, 
    type TEXT, capacity_units INTEGER, manager_name TEXT)''')

c.execute('''CREATE TABLE IF NOT EXISTS stock_balance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, warehouse_id TEXT, product_sku TEXT, product_name TEXT, 
    qty_on_hand INTEGER, qty_reserved INTEGER, qty_available INTEGER, reorder_point INTEGER, 
    safety_stock INTEGER, last_counted_at TEXT)''')

c.execute('''CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, warehouse_id TEXT, product_sku TEXT, movement_type TEXT, 
    quantity INTEGER, unit_cost REAL, reference_no TEXT, note TEXT, created_at TEXT)''')

c.execute('''CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, contact_name TEXT, phone TEXT, email TEXT, 
    province TEXT, payment_terms_days INTEGER, lead_time_days INTEGER, rating REAL, is_active INTEGER)''')

c.execute('''CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, po_number TEXT UNIQUE, supplier_id INTEGER, 
    warehouse_id TEXT, status TEXT, total_amount REAL, order_date TEXT, expected_date TEXT, received_date TEXT)''')

c.execute('''CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, po_id INTEGER, product_sku TEXT, qty_ordered INTEGER, 
    qty_received INTEGER, unit_cost REAL, line_total REAL)''')

# Populate Warehouses (12)
warehouses = [
    ('WH-HN-01', 'HN01', 'Kho Hà Nội 1', 'Quận Cầu Giấy', 'Hà Nội', 'central', 100000, 'Nguyễn Văn A'),
    ('WH-HN-02', 'HN02', 'Kho Hà Nội 2', 'Quận Long Biên', 'Hà Nội', 'regional', 50000, 'Trần Thị B'),
    ('WH-HCM-01', 'HCM01', 'Kho HCM 1', 'Quận 9', 'Hồ Chí Minh', 'central', 150000, 'Lê Văn C'),
    ('WH-HCM-02', 'HCM02', 'Kho HCM 2', 'Quận Tân Bình', 'Hồ Chí Minh', 'regional', 80000, 'Phạm Thị D'),
    ('WH-DN-01', 'DN01', 'Kho Đà Nẵng', 'Quận Hải Châu', 'Đà Nẵng', 'regional', 40000, 'Hoàng Văn E'),
    ('WH-HP-01', 'HP01', 'Kho Hải Phòng', 'Quận Lê Chân', 'Hải Phòng', 'store', 20000, 'Vũ Thị F'),
    ('WH-CT-01', 'CT01', 'Kho Cần Thơ', 'Quận Ninh Kiều', 'Cần Thơ', 'store', 20000, 'Đinh Văn G'),
    ('WH-BD-01', 'BD01', 'Kho Bình Dương', 'Thành phố Dĩ An', 'Bình Dương', 'regional', 60000, 'Lý Thị H'),
    ('WH-KH-01', 'KH01', 'Kho Khánh Hòa', 'Thành phố Nha Trang', 'Khánh Hòa', 'store', 15000, 'Bùi Văn I'),
    ('WH-QN-01', 'QN01', 'Kho Quảng Ninh', 'Thành phố Hạ Long', 'Quảng Ninh', 'store', 15000, 'Đặng Thị J'),
    ('WH-NA-01', 'NA01', 'Kho Nghệ An', 'Thành phố Vinh', 'Nghệ An', 'store', 15000, 'Ngô Văn K'),
    ('WH-FB-01', 'FB01', 'Kho FBShopee', 'KCN VSIP', 'Bắc Ninh', 'FBx', 200000, 'Dương Thị L')
]
c.executemany("INSERT INTO warehouses VALUES (?,?,?,?,?,?,?,?)", warehouses)

# Populate Stock Balance (6000)
skus = [f'SKU-{str(i).zfill(4)}' for i in range(1, 501)]
stock_balances = []
for w in warehouses:
    w_id = w[0]
    w_type = w[5]
    for sku in skus:
        if w_id == 'WH-HP-01' and random.random() < 0.8:
            qty = random.randint(0, 5)
            rp = random.randint(10, 20)
        else:
            if w_type == 'central': qty = random.randint(50, 500)
            elif w_type == 'regional': qty = random.randint(10, 100)
            else: qty = random.randint(5, 30)
            rp = random.randint(5, 50)
            
        res = random.randint(0, min(10, qty))
        avail = qty - res
        ss = int(rp * 0.5)
        stock_balances.append((w_id, sku, f'Product {sku}', qty, res, avail, rp, ss, date_list[-1]))

c.executemany('''INSERT INTO stock_balance 
    (warehouse_id, product_sku, product_name, qty_on_hand, qty_reserved, qty_available, reorder_point, safety_stock, last_counted_at) 
    VALUES (?,?,?,?,?,?,?,?,?)''', stock_balances)

# Populate Stock Movements (12000)
movements = []
m_types = ['receipt']*25 + ['shipment']*40 + ['transfer_in']*10 + ['transfer_out']*10 + ['adjustment']*10 + ['return_in']*5
for _ in range(12000):
    w_id = random.choice(warehouses)[0]
    sku = random.choice(skus)
    m_type = random.choice(m_types)
    qty = random.randint(1, 100) if m_type in ['receipt', 'transfer_in', 'return_in'] else -random.randint(1, 100)
    cost = random.randint(10, 100) * 1000
    ref = f'REF-{random.randint(1000,9999)}'
    dt = random.choice(date_list)
    movements.append((w_id, sku, m_type, qty, cost, ref, '', dt))
c.executemany('''INSERT INTO stock_movements 
    (warehouse_id, product_sku, movement_type, quantity, unit_cost, reference_no, note, created_at) 
    VALUES (?,?,?,?,?,?,?,?)''', movements)

# Populate Suppliers (30)
suppliers = []
for i in range(1, 31):
    suppliers.append((f'Nhà cung cấp {i}', f'Liên hệ {i}', f'09{random.randint(10000000,99999999)}', 
                      f'ncc{i}@example.com', random.choice(['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng']), 
                      random.choice([15, 30, 45, 60]), random.randint(3, 14), round(random.uniform(3.0, 5.0), 1), 1))
c.executemany('''INSERT INTO suppliers (name, contact_name, phone, email, province, payment_terms_days, lead_time_days, rating, is_active) VALUES (?,?,?,?,?,?,?,?,?)''', suppliers)

# Populate POs & Lines
pos = []
po_lines = []
for i in range(1, 501):
    supp = random.randint(1, 30)
    w_id = random.choice(warehouses)[0]
    dt = random.choice(date_list)
    po_num = f'PO-{dt.replace("-","")}-{str(i).zfill(3)}'
    amt = random.randint(10, 100) * 1000000
    pos.append((po_num, supp, w_id, 'received', amt, dt, dt, dt))
    
    for _ in range(4):
        sku = random.choice(skus)
        qty = random.randint(10, 100)
        ucost = random.randint(50, 500)*1000
        po_lines.append((i, sku, qty, qty, ucost, qty*ucost))
        
c.executemany('''INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, total_amount, order_date, expected_date, received_date) VALUES (?,?,?,?,?,?,?,?)''', pos)
c.executemany('''INSERT INTO purchase_order_lines (po_id, product_sku, qty_ordered, qty_received, unit_cost, line_total) VALUES (?,?,?,?,?,?)''', po_lines)

conn_inv.commit()

# ==========================================
# 2. VN_Marketing.db
# ==========================================
conn_mkt = create_connection('VN_Marketing.db')
c2 = conn_mkt.cursor()

c2.execute('''CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, channel TEXT, objective TEXT, 
    start_date TEXT, end_date TEXT, budget_vnd REAL, actual_spend_vnd REAL, status TEXT, target_segment TEXT)''')
c2.execute('''CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, code TEXT UNIQUE, discount_type TEXT, 
    discount_value REAL, min_order_vnd REAL, max_discount_vnd REAL, max_uses INTEGER, actual_uses INTEGER, 
    revenue_generated_vnd REAL, expires_at TEXT)''')
c2.execute('''CREATE TABLE IF NOT EXISTS campaign_daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, date TEXT, impressions INTEGER, 
    clicks INTEGER, ctr REAL, add_to_carts INTEGER, conversions INTEGER, conv_rate REAL, 
    spend_vnd REAL, revenue_vnd REAL, roas REAL, new_customers_acquired INTEGER)''')
c2.execute('''CREATE TABLE IF NOT EXISTS utm_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, source TEXT, medium TEXT, 
    content TEXT, landing_page TEXT, sessions INTEGER, bounces INTEGER, bounce_rate REAL, 
    conversions INTEGER, revenue_vnd REAL)''')
c2.execute('''CREATE TABLE IF NOT EXISTS ab_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, test_name TEXT, variant TEXT, 
    description TEXT, traffic_pct REAL, impressions INTEGER, conversions INTEGER, conv_rate REAL, 
    revenue_per_visitor REAL, is_winner INTEGER)''')
c2.execute('''CREATE TABLE IF NOT EXISTS affiliate_partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, tier TEXT, commission_rate REAL, total_orders INTEGER, 
    total_revenue_vnd REAL, total_commission_vnd REAL, join_date TEXT, status TEXT)''')

# Populate Campaigns (60)
campaign_types = ['flash_sale', 'voucher', 'bundle', 'seasonal', 'BOGO', 'referral']
campaign_names = ['Siêu Sale Tết', 'Flash Sale 11.11', 'Voucher Hè', 'Mừng Lễ', 'Cuối Tuần', 'Tháng Vàng']
campaigns = []
for i in range(1, 61):
    c_type = random.choice(campaign_types)
    name = f"{random.choice(campaign_names)} {i}"
    ch = random.choice(['Facebook', 'TikTok', 'Google', 'Zalo'])
    obj = random.choice(['awareness', 'conversion', 'retention'])
    sd = random.choice(date_list[:-30])
    ed = random.choice(date_list[-30:])
    budget = random.randint(10, 100)*1000000
    spend = budget * random.uniform(0.8, 1.2)
    campaigns.append((name, c_type, ch, obj, sd, ed, budget, spend, 'completed', 'All'))
c2.executemany("INSERT INTO campaigns (name, type, channel, objective, start_date, end_date, budget_vnd, actual_spend_vnd, status, target_segment) VALUES (?,?,?,?,?,?,?,?,?,?)", campaigns)

# Vouchers (300)
vouchers = []
for i in range(1, 301):
    cid = random.randint(1, 60)
    vouchers.append((cid, f'VOUCHER{i}', random.choice(['percent', 'fixed', 'free_ship']), 
                     random.randint(5, 50), random.randint(100, 500)*1000, random.randint(20, 100)*1000,
                     1000, random.randint(100, 900), random.randint(10, 100)*1000000, date_list[-1]))
c2.executemany("INSERT INTO vouchers (campaign_id, code, discount_type, discount_value, min_order_vnd, max_discount_vnd, max_uses, actual_uses, revenue_generated_vnd, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)", vouchers)

# Metrics (2000)
metrics = []
for i in range(2000):
    cid = random.randint(1, 60)
    c_type = campaigns[cid-1][1]
    spend = random.randint(1, 10)*1000000
    if c_type == 'flash_sale': roas = random.uniform(3.5, 6.0)
    elif c_type == 'voucher': roas = random.uniform(0.8, 2.0)
    elif c_type == 'bundle': roas = random.uniform(2.0, 3.5)
    else: roas = random.uniform(1.0, 3.0)
    rev = spend * roas
    metrics.append((cid, random.choice(date_list), 10000, 500, 0.05, 100, 20, 0.04, spend, rev, roas, 5))
c2.executemany("INSERT INTO campaign_daily_metrics (campaign_id, date, impressions, clicks, ctr, add_to_carts, conversions, conv_rate, spend_vnd, revenue_vnd, roas, new_customers_acquired) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", metrics)

# UTM (500)
utms = []
for i in range(500):
    utms.append((random.randint(1, 60), random.choice(['facebook', 'google', 'tiktok', 'zalo']), 
                 random.choice(['cpc', 'cpm', 'organic']), f'content_{i}', '/home', 
                 1000, 400, 0.4, 50, random.randint(5, 20)*1000000))
c2.executemany("INSERT INTO utm_tracking (campaign_id, source, medium, content, landing_page, sessions, bounces, bounce_rate, conversions, revenue_vnd) VALUES (?,?,?,?,?,?,?,?,?,?)", utms)

# AB Tests (100)
ab_tests = []
for i in range(100):
    is_winner = 1 if (random.random() < 0.6 and i % 3 == 1) else 0
    var = 'B' if is_winner else random.choice(['A', 'C'])
    if random.random() < 0.6: var = 'B'; is_winner = 1
    else: var = random.choice(['A', 'C']); is_winner = 0
    ab_tests.append((random.randint(1, 60), f'Test {i}', var, 'desc', 0.33, 5000, 100, 0.02, 50000, is_winner))
c2.executemany("INSERT INTO ab_tests (campaign_id, test_name, variant, description, traffic_pct, impressions, conversions, conv_rate, revenue_per_visitor, is_winner) VALUES (?,?,?,?,?,?,?,?,?,?)", ab_tests)

# Affiliates (40)
affiliates = []
for i in range(40):
    affiliates.append((f'KOC {i}', random.choice(['Gold', 'Silver', 'Bronze']), 0.1, 
                       random.randint(10, 1000), random.randint(10, 500)*1000000, 
                       random.randint(1, 50)*1000000, date_list[0], 'active'))
c2.executemany("INSERT INTO affiliate_partners (name, tier, commission_rate, total_orders, total_revenue_vnd, total_commission_vnd, join_date, status) VALUES (?,?,?,?,?,?,?,?)", affiliates)

conn_mkt.commit()


# ==========================================
# 3. VN_Finance.db
# ==========================================
conn_fin = create_connection('VN_Finance.db')
c3 = conn_fin.cursor()

c3.execute('''CREATE TABLE IF NOT EXISTS daily_channel_revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, channel TEXT, gross_revenue REAL, 
    returns_amount REAL, net_revenue REAL, cogs REAL, gross_profit REAL, order_count INTEGER, avg_order_value REAL)''')
c3.execute('''CREATE TABLE IF NOT EXISTS monthly_pnl (
    id INTEGER PRIMARY KEY AUTOINCREMENT, year_month TEXT, revenue REAL, cogs REAL, gross_profit REAL, 
    marketing_expense REAL, operations_expense REAL, tech_expense REAL, admin_expense REAL, 
    ebitda REAL, depreciation REAL, net_profit REAL, margin_pct REAL)''')
c3.execute('''CREATE TABLE IF NOT EXISTS monthly_kpi (
    id INTEGER PRIMARY KEY AUTOINCREMENT, year_month TEXT, total_orders INTEGER, aov_vnd REAL, 
    new_customers INTEGER, returning_customers INTEGER, returning_pct REAL, cac_vnd REAL, 
    ltv_vnd REAL, ltv_cac_ratio REAL, churn_rate REAL, nps_score INTEGER)''')
c3.execute('''CREATE TABLE IF NOT EXISTS budget_vs_actual (
    id INTEGER PRIMARY KEY AUTOINCREMENT, year_month TEXT, department TEXT, budget_vnd REAL, 
    actual_vnd REAL, variance_vnd REAL, variance_pct REAL)''')
c3.execute('''CREATE TABLE IF NOT EXISTS cashflow (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, type TEXT, category TEXT, amount REAL, 
    running_balance REAL, note TEXT)''')
c3.execute('''CREATE TABLE IF NOT EXISTS cost_centers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, department TEXT, monthly_budget_vnd REAL, 
    ytd_spend_vnd REAL, responsible_person TEXT, cost_type TEXT)''')

# Daily Channel Revenue (3300 = 6 * 550)
channels = ['Website', 'App', 'Shopee', 'Lazada', 'TikTok Shop', 'Cửa hàng']
rev_data = []
month_cnt = 0
prev_month = date_list[0][:7]

for i, dt in enumerate(date_list):
    curr_month = dt[:7]
    if curr_month != prev_month:
        month_cnt += 1
        prev_month = curr_month
        
    is_tet = curr_month in ['2026-01', '2026-02']
    
    for ch in channels:
        if ch == 'Website': base = random.uniform(40, 70)*1000000 * ((0.95)**month_cnt)
        elif ch == 'App': base = random.uniform(20, 40)*1000000
        elif ch == 'Shopee': base = random.uniform(30, 60)*1000000
        elif ch == 'Lazada': base = random.uniform(15, 35)*1000000
        elif ch == 'TikTok Shop': base = random.uniform(10, 30)*1000000 * ((1.25)**month_cnt)
        else: base = random.uniform(50, 90)*1000000
        
        if is_tet and random.random() < 0.2:
            base *= 3.0
            
        gross = base
        ret = gross * random.uniform(0.01, 0.05)
        net = gross - ret
        cogs = net * random.uniform(0.4, 0.6)
        gp = net - cogs
        oc = int(net / random.uniform(200000, 500000))
        aov = net / oc if oc > 0 else 0
        rev_data.append((dt, ch, gross, ret, net, cogs, gp, oc, aov))

c3.executemany("INSERT INTO daily_channel_revenue (date, channel, gross_revenue, returns_amount, net_revenue, cogs, gross_profit, order_count, avg_order_value) VALUES (?,?,?,?,?,?,?,?,?)", rev_data)

# Monthly PnL & KPI (18)
pnl = []
kpis = []
for ym in months_list:
    rev = random.uniform(10, 50)*1000000000
    cogs = rev * 0.5
    gp = rev - cogs
    me = rev * 0.1
    oe = rev * 0.1
    te = rev * 0.05
    ae = rev * 0.05
    ebitda = gp - me - oe - te - ae
    dep = ebitda * 0.1
    np = ebitda - dep
    pnl.append((ym, rev, cogs, gp, me, oe, te, ae, ebitda, dep, np, np/rev))
    kpis.append((ym, 10000, 500000, 3000, 7000, 0.7, 50000, 2000000, 40.0, 0.05, 80))
c3.executemany("INSERT INTO monthly_pnl (year_month, revenue, cogs, gross_profit, marketing_expense, operations_expense, tech_expense, admin_expense, ebitda, depreciation, net_profit, margin_pct) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", pnl)
c3.executemany("INSERT INTO monthly_kpi (year_month, total_orders, aov_vnd, new_customers, returning_customers, returning_pct, cac_vnd, ltv_vnd, ltv_cac_ratio, churn_rate, nps_score) VALUES (?,?,?,?,?,?,?,?,?,?,?)", kpis)

# Budget (90)
depts = ['Marketing', 'Operations', 'Technology', 'Admin', 'Logistics']
budgets = []
for ym in months_list:
    for d in depts:
        budget = random.uniform(100, 500)*1000000
        if d == 'Marketing' and ym[-2:] in ['11', '12']:
            actual = budget * 1.4
        else:
            actual = budget * random.uniform(0.9, 1.1)
        var = actual - budget
        budgets.append((ym, d, budget, actual, var, var/budget))
c3.executemany("INSERT INTO budget_vs_actual (year_month, department, budget_vnd, actual_vnd, variance_vnd, variance_pct) VALUES (?,?,?,?,?,?)", budgets)

# Cashflow (1000)
cfs = []
for i in range(1000):
    cfs.append((random.choice(date_list), random.choice(['inflow', 'outflow']), 'Sales Revenue', 
                random.uniform(10, 100)*1000000, 1000000000, ''))
c3.executemany("INSERT INTO cashflow (date, type, category, amount, running_balance, note) VALUES (?,?,?,?,?,?)", cfs)

# Cost Centers (15)
ccs = []
for i in range(15):
    ccs.append((f'CC {i}', random.choice(depts), 100000000, 500000000, 'PIC', 'fixed'))
c3.executemany("INSERT INTO cost_centers (name, department, monthly_budget_vnd, ytd_spend_vnd, responsible_person, cost_type) VALUES (?,?,?,?,?,?)", ccs)

conn_fin.commit()


# ==========================================
# Verification & Summary
# ==========================================
def print_summary(conn, db_name, expected_tables):
    print(f"\n--- {db_name} ---")
    c = conn.cursor()
    for t in expected_tables:
        c.execute(f"SELECT COUNT(*) FROM {t}")
        cnt = c.fetchone()[0]
        c.execute(f"SELECT * FROM {t} LIMIT 1")
        sample = c.fetchone()
        print(f"Table: {t:<25} | Rows: {cnt:<6} | Sample: {sample}")

print_summary(conn_inv, 'VN_Inventory.db', ['warehouses', 'stock_balance', 'stock_movements', 'suppliers', 'purchase_orders', 'purchase_order_lines'])
print_summary(conn_mkt, 'VN_Marketing.db', ['campaigns', 'vouchers', 'campaign_daily_metrics', 'utm_tracking', 'ab_tests', 'affiliate_partners'])
print_summary(conn_fin, 'VN_Finance.db', ['daily_channel_revenue', 'monthly_pnl', 'monthly_kpi', 'budget_vs_actual', 'cashflow', 'cost_centers'])

print("\n--- Verification Patterns ---")

c.execute("SELECT qty_on_hand FROM stock_balance WHERE warehouse_id='WH-HP-01'")
hp_stock = [r[0] for r in c.fetchall()]
understocked = sum(1 for x in hp_stock if x <= 5)
print(f"Hải Phòng understocked items: {understocked}/{len(hp_stock)} ({(understocked/len(hp_stock))*100:.1f}%)")

c2.execute("SELECT type, AVG(roas) FROM campaigns c JOIN campaign_daily_metrics m ON c.id=m.campaign_id GROUP BY type")
print("\nROAS by Campaign Type:")
for r in c2.fetchall():
    print(f"  {r[0]}: {r[1]:.2f}")

c3.execute("SELECT channel, SUM(net_revenue) FROM daily_channel_revenue GROUP BY channel")
print("\nTotal Net Revenue by Channel:")
for r in c3.fetchall():
    print(f"  {r[0]}: {r[1]:,.0f}")

c3.execute("SELECT department, year_month, variance_pct FROM budget_vs_actual WHERE department='Marketing' AND (year_month LIKE '%-11' OR year_month LIKE '%-12')")
print("\nMarketing Budget Overruns (Nov/Dec):")
for r in c3.fetchall():
    print(f"  {r[1]} - {r[0]}: +{r[2]*100:.1f}%")

conn_inv.close()
conn_mkt.close()
conn_fin.close()
