---
name: sql_optimization
domain: sql_optimization
description: Tối ưu hóa truy vấn SQL, phân tích EXPLAIN plan, thiết kế chỉ mục (INDEX) và phân vùng bảng (PARTITION) cho hệ thống phân tích dữ liệu.
required_tools:
- sql_query
- python_interpreter
version: 1.0.0
role: worker
domain_key: sql_engineering
output_structure: '## Hiện trạng & EXPLAIN Plan → ## Điểm nghẽn (Bottlenecks) → ## Đề xuất Tối ưu (Index/Partition/Rewrite) → ## Đo lường & So sánh Chi phí'
mandatory_tools:
- sql_query
amendment_check: true
reasoning_steps:
- step: Phân tích Kế hoạch Thực thi (EXPLAIN Plan)
  concept: Trích xuất và giải mã cây thực thi truy vấn (Execution Tree), xác định toán tử chiếm chi phí cao nhất (Seq Scan, Nested Loop, Hash Join, Sort).
  default_anchor:
  - EXPLAIN ANALYZE
  - Cost Estimation (Startup vs Total Cost)
  must_verify_live: true
- step: Nhận diện Anti-Patterns & Điểm nghẽn
  concept: Phát hiện quét toàn bộ bảng (Full Table Scan / Seq Scan), subquery tương quan không cần thiết, Cartesian products, hoặc ép kiểu ngầm làm vô hiệu hóa index.
  default_anchor:
  - Full Table Scan Detection
  - Type Mismatch Implicit Casting
  must_verify_live: true
- step: Thiết kế Giải pháp Chỉ mục & Phân vùng
  concept: Đề xuất cụ thể loại chỉ mục (B-Tree, Hash, GIN, BRIN, Composite Index) hoặc chiến lược phân vùng (Range/List/Hash Partition Pruning).
  default_anchor:
  - Composite Index Strategy (Prefix Match Rule)
  - Partition Pruning
  must_verify_live: true
- step: Benchmark & Thẩm định Hiệu năng
  concept: Viết lại câu truy vấn (Query Rewriting với CTE/Window Functions) và đo đạc lại execution time, buffers read, cache hit ratio.
  default_anchor:
  - Execution Time Reduction %
  - Shared Hit Buffers
  must_verify_live: true
validation_requirements:
- truy vấn tối ưu phải có giải trình EXPLAIN plan hoặc chi phí cost rõ ràng
- khuyến nghị phải chỉ rõ chỉ mục (INDEX) hoặc chiến lược phân vùng (PARTITION)
validation_rules:
- trigger_keywords:
  - tối ưu sql
  - query chậm
  - explain
  - chậm
  required_keywords:
  - - explain
    - execution plan
    - kế hoạch thực thi
  - - index
    - partition
    - chỉ mục
    - phân vùng
  error_message: cần phân tích EXPLAIN execution plan và đề xuất chỉ mục (INDEX) hoặc phân vùng (PARTITION) cụ thể.
ceiling_anchors:
  query_cost_ceiling:
    name: Trần chi phí truy vấn và thời gian thực thi
    concept: Truy vấn OLAP phân tích không được vượt quá 30s hoặc full scan trên bảng lớn > 1M dòng không có filter.
    default_anchor:
    - EXPLAIN ANALYZE
    - Cost Threshold <= 10000
    has_hard_ceiling: true
    must_verify_live: true
  read_only_safety_ceiling:
    name: Giới hạn an toàn đọc dữ liệu (Read-Only Safety)
    concept: Các truy vấn phân tích chỉ được sử dụng SELECT / WITH (CTE), nghiêm cấm thao tác DDL/DML gây biến đổi dữ liệu trái phép.
    default_anchor:
    - Read-Only Mode
    - SELECT / CTE ONLY
    has_hard_ceiling: true
    must_verify_live: true
---
# CẨM NANG NGHIỆP VỤ: TỐI ƯU HÓA TRUY VẤN SQL & KIẾN TRÚC DỮ LIỆU

## 1. Nguyên Tắc Cốt Lõi Khi Tối Ưu Truy Vấn
1. **Explain First, Refactor Later**: Tuyệt đối không võ đoán nguyên nhân câu lệnh chậm khi chưa chạy `EXPLAIN (ANALYZE, BUFFERS)` (hoặc `EXPLAIN QUERY PLAN` với SQLite).
2. **SARGable Query Design**: Đảm bảo biểu thức tìm kiếm trong mệnh đề `WHERE`, `ON` có tính chất tìm kiếm được (Search Argument Able):
   - Không áp dụng hàm tính toán lên cột có chỉ mục: `WHERE YEAR(order_date) = 2026` ❌ → Thay bằng `WHERE order_date >= '2026-01-01' AND order_date < '2027-01-01'` ✅.
   - Tránh ép kiểu ngầm: cột `VARCHAR` tìm kiếm với số nguyên bắt buộc phải có nháy đơn `'...'`.
3. **Giảm Chi Phí I/O (Buffer Reads)**: 90% nguyên nhân chậm chạp của cơ sở dữ liệu xuất phát từ việc đọc đĩa (Disk I/O). Tối ưu hóa tập trung vào việc tăng tỷ lệ hit buffer trong bộ nhớ cache.

## 2. Quy Trình 4 Bước Chuẩn Hóa
### Bước 1: Trích xuất & Diễn giải Execution Plan
- Đối với SQLite: `EXPLAIN QUERY PLAN SELECT ...`
  * Tìm kiếm từ khóa nguy hiểm: `SCAN TABLE` (quét toàn bảng thay vì `SEARCH TABLE ... USING INDEX`).
- Đối với PostgreSQL/MySQL: `EXPLAIN (ANALYZE, BUFFERS) SELECT ...`
  * Nhận diện các nút chi phí: `cost=startup_cost..total_cost`, `rows=estimated_rows`, `actual time=startup..total`, `loops=iterations`.

### Bước 2: Nhận Diện 5 Anti-Patterns Phổ Biến Nhất
1. **N+1 Query & Correlated Subqueries**:
   - Biến đổi Subquery lặp trong `SELECT` thành `JOIN` hoặc Window Function `OVER (PARTITION BY ...)`.
2. **SELECT * Trên Bảng Rộng (Wide Tables)**:
   - Chỉ lấy đúng các cột cần dùng, tránh tải các cột TEXT/JSONB lớn gây nghẽn RAM và mạng.
3. **Wildcard Bắt Đầu Trong LIKE (`LIKE '%abc'`)**:
   - Chỉ mục B-Tree không thể sử dụng prefix matching nếu bắt đầu bằng dấu `%`. Cân nhắc sử dụng Full-Text Search (tsvector/FTS5) hoặc pg_trgm GIN index.
4. **Hàm Phân Tích (Window Function) Không Có Filter Thu Hẹp**:
   - Đặt mệnh đề lọc phạm vi ngày tháng/phân vùng trước khi tính toán `ROW_NUMBER()` hoặc `RANK()`.
5. **DISTINCT Trên Tập Dữ Liệu Thiếu Khóa Chính**:
   - Dùng `DISTINCT` trên tập hợp nhiều bảng thường che giấu lỗi `Cartesian Product (CROSS JOIN)`.

### Bước 3: Chiến Lược Thiết Kế Index & Phân Vùng
- **B-Tree Composite Index (Quy tắc Tiền tố Trái)**:
  * Đặt các cột đẳng thức (`WHERE col = 'val'`) lên trước, các cột khoảng giá trị (`col BETWEEN ...` hoặc `col > ...`) ở sau cùng: `CREATE INDEX idx_orders_status_date ON orders(status, order_date);`
- **Covering Index (INDEX ... INCLUDE)**:
  * Đưa thêm các cột phụ trợ vào `INCLUDE (...)` để công cụ truy vấn thực hiện `Index Only Scan` mà không cần lookup ngược vào Heap.
- **Partition Pruning**:
  * Phân vùng theo tháng/quý: `PARTITION BY RANGE (order_date)`. Khi câu truy vấn có điều kiện lọc theo ngày, query planner sẽ tự động loại bỏ (prune) các phân vùng không liên quan.

### Bước 4: Benchmark & Báo Cáo Hiệu Năng
Mọi đề xuất tối ưu phải đi kèm bảng so sánh định lượng:
- Thời gian thực thi ban đầu vs sau tối ưu (Execution Time ms).
- Số khối I/O đọc vào (Buffers hit / read).
- Mức độ cải thiện tổng thể (% reduction).
