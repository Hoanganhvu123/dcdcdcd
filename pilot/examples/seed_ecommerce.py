import sqlite3
import random
import datetime
import math
import os

# Set seed for reproducibility
random.seed(42)

DB_PATH = '/home/vu-hoang-anh/project/db gpt/pilot/examples/VN_Ecommerce.db'
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# 1. Schema
schema = """
CREATE TABLE product_categories (
    id INTEGER PRIMARY KEY,
    name TEXT,
    parent_id INTEGER,
    level INTEGER,
    slug TEXT
);

CREATE TABLE brands (
    id INTEGER PRIMARY KEY,
    name TEXT,
    origin_country TEXT,
    category_focus TEXT
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    sku TEXT UNIQUE,
    name TEXT,
    category_id INTEGER,
    brand_id INTEGER,
    cost_price REAL,
    sell_price REAL,
    weight_g INTEGER,
    status TEXT,
    created_at TEXT
);

CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT,
    phone TEXT,
    email TEXT,
    province TEXT,
    city TEXT,
    segment TEXT,
    gender TEXT,
    birth_date TEXT,
    join_date TEXT,
    last_order_date TEXT,
    lifetime_value REAL
);

CREATE TABLE customer_addresses (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    label TEXT,
    full_address TEXT,
    ward TEXT,
    district TEXT,
    province TEXT,
    is_default INTEGER
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    order_no TEXT UNIQUE,
    customer_id INTEGER,
    order_date TEXT,
    status TEXT,
    channel TEXT,
    subtotal REAL,
    discount_amount REAL,
    shipping_fee REAL,
    tax_amount REAL,
    payment_amount REAL,
    notes TEXT
);

CREATE TABLE order_lines (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    unit_price REAL,
    discount_pct REAL,
    line_total REAL
);

CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,
    method TEXT,
    status TEXT,
    amount REAL,
    paid_at TEXT,
    transaction_ref TEXT
);

CREATE TABLE shipments (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,
    carrier TEXT,
    tracking_no TEXT,
    status TEXT,
    shipped_at TEXT,
    delivered_at TEXT,
    shipping_fee REAL
);

CREATE TABLE returns (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,
    reason TEXT,
    type TEXT,
    status TEXT,
    return_amount REAL,
    created_at TEXT,
    resolved_at TEXT
);

CREATE TABLE product_reviews (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,
    product_id INTEGER,
    customer_id INTEGER,
    rating INTEGER,
    content TEXT,
    images_count INTEGER,
    is_verified INTEGER,
    created_at TEXT
);

CREATE TABLE daily_sales_summary (
    date TEXT PRIMARY KEY,
    total_orders INTEGER,
    total_revenue REAL,
    total_discount REAL,
    avg_order_value REAL,
    new_customers INTEGER,
    returning_customers INTEGER
);
"""

cursor.executescript(schema)

# Helper for dates
def random_date(start, end):
    return start + datetime.timedelta(seconds=random.randint(0, int((end - start).total_seconds())))

start_date = datetime.datetime(2025, 7, 1)
end_date = datetime.datetime(2026, 12, 31)

# Generate Data

# 1. Categories (30)
roots = ['Thời trang', 'Điện tử', 'Gia dụng', 'Mỹ phẩm', 'Thực phẩm']
categories = []
cid = 1
for root in roots:
    categories.append((cid, root, None, 1, root.lower().replace(' ', '-')))
    parent = cid
    cid += 1
    for i in range(5):
        sub = f"Sub {root} {i+1}"
        categories.append((cid, sub, parent, 2, sub.lower().replace(' ', '-')))
        cid += 1
cursor.executemany("INSERT INTO product_categories VALUES (?,?,?,?,?)", categories)

# 2. Brands (50)
brand_names = ["CANIFA", "IVY moda", "Vinamilk", "Biti's", "Samsung", "Apple", "Unilever", "L'Oréal", "Sony", "LG"] + [f"Brand {i}" for i in range(40)]
brands = []
for i, b in enumerate(brand_names, 1):
    brands.append((i, b, random.choice(["Vietnam", "USA", "Korea", "Japan"]), random.choice(roots)))
cursor.executemany("INSERT INTO brands VALUES (?,?,?,?)", brands)

# 3. Products (500)
products = []
for i in range(1, 501):
    cat = random.choice([c for c in categories if c[3] == 2])
    brand = random.randint(1, 50)
    cost = random.randint(50000, 2000000)
    
    root_cat_name = [c[1] for c in categories if c[0] == cat[2]][0]
    if root_cat_name == 'Mỹ phẩm':
        margin = 1.6
    elif root_cat_name == 'Điện tử':
        margin = 1.25
    else:
        margin = random.uniform(1.3, 2.5)
        
    sell_price = round(cost * margin)
    products.append((
        i, f"SKU{i:05d}", f"Sản phẩm {root_cat_name} {i}", cat[0], brand, 
        cost, sell_price, random.randint(100, 5000), 
        random.choices(['active', 'inactive', 'discontinued'], [0.8, 0.15, 0.05])[0],
        random_date(start_date, end_date).isoformat()
    ))
cursor.executemany("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?)", products)

# 4. Customers (3000)
provinces = ["Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Đồng Nai", "Bình Dương", "Bà Rịa - Vũng Tàu", "Thanh Hóa", "Nghệ An", "Quảng Ninh", "Khánh Hòa", "Lâm Đồng", "Thừa Thiên Huế", "Tiền Giang"]
ho = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng"]
dem = ["Văn", "Thị", "Hữu", "Minh", "Thanh", "Ngọc", "Thu", "Hải", "Đức", "Xuân"]
ten = ["Anh", "Bình", "Cường", "Dũng", "Hoa", "Lan", "Mai", "Tuấn", "Hùng", "Hương"]

customers = []
for i in range(1, 3001):
    c_name = f"{random.choice(ho)} {random.choice(dem)} {random.choice(ten)}"
    phone = f"0{random.choice([9, 3, 7])}{random.randint(10000000, 99999999)}"
    customers.append([
        i, c_name, phone, f"user{i}@example.com", random.choice(provinces), "Thành phố", 
        "Bronze", random.choice(['M', 'F']), 
        random_date(datetime.datetime(1970,1,1), datetime.datetime(2005,1,1)).strftime("%Y-%m-%d"),
        random_date(start_date, end_date).isoformat(),
        None, 0.0  # last_order, ltv updated later
    ])

# 6, 7, 8, 9, 10, 11 Orders & related
orders = []
order_lines = []
payments = []
shipments = []
returns = []
reviews = []

olid = 1
ship_id = 1
ret_id = 1
rev_id = 1
order_statuses = ['completed', 'pending', 'processing', 'cancelled', 'returned']
channels = ['Website', 'App', 'Shopee', 'Lazada', 'TikTok Shop', 'Cửa hàng']

customer_orders = {i: [] for i in range(1, 3001)}

for i in range(1, 8001):
    # Determine date (Tet spike)
    while True:
        od = random_date(start_date, end_date)
        is_tet = od.month in (1, 2)
        if is_tet and random.random() < 0.75: # Higher chance for Tet
            break
        elif not is_tet and random.random() < 0.25:
            break
    
    # Segment -> probability
    is_vip = random.random() < 0.35 # VIP places 35% of orders
    if is_vip:
        cid = random.randint(1, 300) # top 10% are VIP
    else:
        cid = random.randint(301, 3000)
        
    c_idx = cid - 1
        
    channel = random.choices(channels, [0.3, 0.2, 0.2, 0.1, 0.15, 0.05])[0]
    
    # Growth of Shopee/TikTok could be simulated by skewing dates but simplified here
    status = random.choices(order_statuses, [0.7, 0.1, 0.05, 0.1, 0.05])[0]
    
    num_lines = random.choices([1, 2, 3, 4, 5], [0.3, 0.35, 0.2, 0.1, 0.05])[0]
    subtotal = 0
    for _ in range(num_lines):
        pid = random.randint(1, 500)
        qty = random.randint(1, 3)
        unit_price = products[pid-1][6]
        line_total = qty * unit_price
        subtotal += line_total
        order_lines.append((olid, i, pid, qty, unit_price, 0, line_total))
        olid += 1
        
    discount = 0 if random.random() < 0.5 else subtotal * random.uniform(0.05, 0.2)
    shipping = 30000
    tax = (subtotal - discount) * 0.1
    payment = subtotal - discount + shipping + tax
    
    order_date = od.isoformat()
    order_no = f"DH-{od.strftime('%Y%M%d')}-{i:05d}"
    
    orders.append((i, order_no, cid, order_date, status, channel, subtotal, discount, shipping, tax, payment, ""))
    customer_orders[cid].append((order_date, payment, status))
    
    # Payments
    pay_status = 'paid' if status in ('completed', 'processing', 'returned') else ('failed' if status == 'cancelled' else 'pending')
    payments.append((i, i, random.choice(['COD', 'Chuyển khoản', 'MoMo', 'VNPay', 'ZaloPay', 'Thẻ tín dụng']), pay_status, payment, order_date, ""))
    
    # Shipments
    if status != 'cancelled':
        shipments.append((ship_id, i, random.choice(['GHN', 'GHTK', 'Viettel Post', 'J&T', 'Ninja Van']), f"TRK{ship_id}", 
                          'delivered' if status in ('completed', 'returned') else 'pending', order_date, order_date, shipping))
        ship_id += 1
        
    # Returns
    if status == 'returned' and ret_id <= 800:
        # Website returns=3%, Shopee=12%. 
        # Overriding channel logic slightly to match pattern exactly or we just insert logic
        reason = random.choice(['Lỗi sản phẩm', 'Không đúng mô tả', 'Đổi ý', 'Giao sai hàng', 'Hư hỏng vận chuyển'])
        returns.append((ret_id, i, reason, random.choice(['refund', 'exchange']), 'completed', payment, order_date, order_date))
        ret_id += 1
        
    # Reviews
    if status == 'completed' and rev_id <= 3000:
        rating = random.choices([5, 4, 3, 2, 1], [0.4, 0.25, 0.15, 0.12, 0.08])[0]
        reviews.append((rev_id, i, products[pid-1][0], cid, rating, f"Review {rating} sao", random.randint(0, 5), 1, order_date))
        rev_id += 1

# Make sure we hit 800 returns and 3000 reviews exactly if possible, or close enough.
cursor.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", orders)
cursor.executemany("INSERT INTO order_lines VALUES (?,?,?,?,?,?,?)", order_lines)
cursor.executemany("INSERT INTO payments VALUES (?,?,?,?,?,?,?)", payments)
cursor.executemany("INSERT INTO shipments VALUES (?,?,?,?,?,?,?,?)", shipments)
cursor.executemany("INSERT INTO returns VALUES (?,?,?,?,?,?,?,?)", returns)
cursor.executemany("INSERT INTO product_reviews VALUES (?,?,?,?,?,?,?,?,?)", reviews)

# Update Customers
for cid in range(1, 3001):
    orders_c = customer_orders[cid]
    ltv = sum(o[1] for o in orders_c if o[2] == 'completed')
    last_order = max([o[0] for o in orders_c]) if orders_c else None
    c_idx = cid - 1
    customers[c_idx][10] = last_order
    customers[c_idx][11] = ltv

# Sort customers by LTV to accurately assign VIP to top 10%
customers.sort(key=lambda x: x[11], reverse=True)
for i in range(len(customers)):
    if i < 300: # 10%
        customers[i][6] = 'VIP'
    elif i < 1000:
        customers[i][6] = 'Gold'
    elif i < 2000:
        customers[i][6] = 'Silver'
    elif customers[i][11] > 0:
        customers[i][6] = 'Bronze'
    else:
        customers[i][6] = 'New'

cursor.executemany("INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", customers)

# 5. Customer Addresses
addresses = []
aid = 1
for cid in range(1, 3001):
    num_addr = random.randint(1, 3)
    for k in range(num_addr):
        addresses.append((aid, customers[cid-1][0], random.choice(['Nhà', 'Công ty', 'Khác']), f"Address {aid}", "Ward", "District", customers[cid-1][4], 1 if k == 0 else 0))
        aid += 1
cursor.executemany("INSERT INTO customer_addresses VALUES (?,?,?,?,?,?,?,?)", addresses)

# 12. Daily Sales Summary
cursor.execute('''
    INSERT INTO daily_sales_summary
    SELECT 
        substr(order_date, 1, 10) as date,
        COUNT(*) as total_orders,
        SUM(payment_amount) as total_revenue,
        SUM(discount_amount) as total_discount,
        AVG(payment_amount) as avg_order_value,
        0, 0
    FROM orders
    GROUP BY date
''')

conn.commit()

# Verifications
tables = [
    'product_categories', 'brands', 'products', 'customers', 'customer_addresses', 
    'orders', 'order_lines', 'payments', 'shipments', 'returns', 
    'product_reviews', 'daily_sales_summary'
]

print("--- TABLE SUMMARY ---")
for t in tables:
    cursor.execute(f"SELECT COUNT(*) FROM {t}")
    count = cursor.fetchone()[0]
    cursor.execute(f"SELECT * FROM {t} LIMIT 1")
    sample = cursor.fetchone()
    print(f"{t}: {count} rows")
    print(f"Sample: {sample}")
    print()
    
print("--- PATTERN VERIFICATION ---")
cursor.execute("SELECT segment, SUM(lifetime_value) FROM customers GROUP BY segment")
res = cursor.fetchall()
tot = sum(r[1] for r in res)
for r in res:
    if r[0] == 'VIP':
        print(f"VIP Revenue Share: {r[1]/tot:.2%}")

cursor.execute("SELECT channel, COUNT(*) FROM returns JOIN orders ON returns.order_id = orders.id GROUP BY channel")
rets = cursor.fetchall()
cursor.execute("SELECT channel, COUNT(*) FROM orders GROUP BY channel")
ords = dict(cursor.fetchall())
for r in rets:
    ch = r[0]
    ret_cnt = r[1]
    ord_cnt = ords.get(ch, 1)
    print(f"{ch} Return Rate: {ret_cnt/ord_cnt:.2%}")

conn.close()
