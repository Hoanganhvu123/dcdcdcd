import React, { useState, useMemo } from 'react';
import { Database, Plus, RefreshCw, MessageSquare, Search, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkDatasourcePageProps {
  onAskSource?: (sourceId: string) => void;
  onAddNew?: () => void;
}

interface SourceItem {
  id: string;
  name: string;
  tag: string;
  tone: string;
  host: string;
  tables: string;
  latency: string;
  ok: boolean;
  conn: string;
  tableCount: number;
  totalRows: string;
  storage: string;
  syncedAt: string;
}

interface TableItem {
  name: string;
  rows: string;
  columnsCount: number;
}

interface ColumnItem {
  name: string;
  type: string;
  key: string;
  note: string;
}

const SOURCES: SourceItem[] = [
  {
    id: 'pg-warehouse',
    name: 'Kho phân tích',
    tag: 'PG',
    tone: 'var(--c2)',
    host: 'postgres://warehouse.congty.vn:5432/analytics',
    tables: '14 bảng',
    latency: '18 ms',
    ok: true,
    conn: 'postgres://warehouse.congty.vn:5432/analytics · schema public',
    tableCount: 14,
    totalRows: '719k',
    storage: '4,2 GB',
    syncedAt: '09:38',
  },
  {
    id: 'my-orders',
    name: 'Đơn hàng trực tiếp',
    tag: 'MY',
    tone: 'var(--accent)',
    host: 'mysql://orders-replica.congty.vn:3306/oms',
    tables: '38 bảng',
    latency: '32 ms',
    ok: true,
    conn: 'mysql://orders-replica.congty.vn:3306/oms · bản sao chỉ đọc',
    tableCount: 38,
    totalRows: '1,42M',
    storage: '8,6 GB',
    syncedAt: '09:40',
  },
  {
    id: 'ch-events',
    name: 'Sự kiện người dùng',
    tag: 'CH',
    tone: 'var(--c4)',
    host: 'clickhouse://events.congty.vn:8123/tracking',
    tables: '6 bảng',
    latency: '64 ms',
    ok: true,
    conn: 'clickhouse://events.congty.vn:8123/tracking · cụm 3 node',
    tableCount: 6,
    totalRows: '48,2M',
    storage: '26,1 GB',
    syncedAt: '09:41',
  },
  {
    id: 'sap-erp',
    name: 'ERP & Kế toán',
    tag: 'ODB',
    tone: 'var(--c3)',
    host: 'odbc://sap-ecc.congty.vn:1433/VN_PRD',
    tables: '142 bảng',
    latency: '45 ms',
    ok: true,
    conn: 'odbc://sap-ecc.congty.vn:1433/VN_PRD · cổng kết nối SAP',
    tableCount: 142,
    totalRows: '9,8M',
    storage: '54,0 GB',
    syncedAt: '08:00',
  },
  {
    id: 'csv-reconcile',
    name: 'Dữ liệu đối soát sàn',
    tag: 'CSV',
    tone: 'var(--muted-fg)',
    host: 's3://congty-data-drop/reconcile-2025/',
    tables: '28 tệp',
    latency: '8 ms',
    ok: true,
    conn: 's3://congty-data-drop/reconcile-2025/ · cập nhật tự động',
    tableCount: 28,
    totalRows: '340k',
    storage: '820 MB',
    syncedAt: '06:15',
  },
];

const PG_TABLES: TableItem[] = [
  { name: 'fact_orders', rows: '184k dòng', columnsCount: 14 },
  { name: 'dim_customers', rows: '42k dòng', columnsCount: 9 },
  { name: 'dim_products', rows: '6.4k dòng', columnsCount: 11 },
  { name: 'fact_order_items', rows: '412k dòng', columnsCount: 8 },
  { name: 'dim_stores', rows: '128 dòng', columnsCount: 6 },
  { name: 'dim_promotions', rows: '340 dòng', columnsCount: 7 },
  { name: 'fact_refunds', rows: '8.2k dòng', columnsCount: 10 },
  { name: 'fact_inventory_snapshot', rows: '64k dòng', columnsCount: 6 },
  { name: 'dim_categories', rows: '48 dòng', columnsCount: 4 },
  { name: 'dim_shipping_zones', rows: '63 dòng', columnsCount: 5 },
];

const COLUMNS_FACT_ORDERS: ColumnItem[] = [
  { name: 'order_id', type: 'varchar(32)', key: 'PK', note: 'Mã định danh đơn hàng duy nhất' },
  { name: 'customer_id', type: 'varchar(32)', key: 'FK', note: 'Khóa ngoại trỏ sang dim_customers' },
  { name: 'store_id', type: 'varchar(16)', key: 'FK', note: 'Cửa hàng hoặc chi nhánh xử lý' },
  { name: 'created_at', type: 'timestamp', key: '—', note: 'Thời điểm khách đặt hàng' },
  { name: 'status', type: 'varchar(20)', key: '—', note: 'completed, returned, cancelled, pending' },
  { name: 'channel', type: 'varchar(24)', key: '—', note: 'marketplace, website, b2b, store' },
  { name: 'net_amount', type: 'numeric(14,2)', key: '—', note: 'Doanh thu thuần sau chiết khấu' },
  { name: 'cogs_amount', type: 'numeric(14,2)', key: '—', note: 'Giá vốn hàng bán' },
  { name: 'discount_amount', type: 'numeric(12,2)', key: '—', note: 'Tổng giá trị voucher giảm giá' },
];

const PREVIEW_FACT_ORDERS = [
  { headers: ['order_id', 'customer_id', 'created_at', 'channel', 'net_amount'] },
  { rows: [
    ['ORD-2025-94812', 'CUST-08912', '2025-10-06 09:12:44', 'marketplace', '1.240.000 đ'],
    ['ORD-2025-94813', 'CUST-14022', '2025-10-06 09:14:02', 'website', '580.000 đ'],
    ['ORD-2025-94814', 'CUST-00231', '2025-10-06 09:15:18', 'b2b', '18.400.000 đ'],
    ['ORD-2025-94815', 'CUST-77419', '2025-10-06 09:18:50', 'marketplace', '890.000 đ'],
    ['ORD-2025-94816', 'CUST-29104', '2025-10-06 09:21:11', 'store', '340.000 đ'],
  ]}
];

const COLUMNS_DIM_CUSTOMERS: ColumnItem[] = [
  { name: 'customer_id', type: 'varchar(32)', key: 'PK', note: 'Mã định danh khách hàng' },
  { name: 'customer_name', type: 'varchar(128)', key: '—', note: 'Họ và tên khách hàng' },
  { name: 'email', type: 'varchar(128)', key: '—', note: 'Địa chỉ email' },
  { name: 'phone', type: 'varchar(20)', key: '—', note: 'Số điện thoại liên hệ' },
  { name: 'tier', type: 'varchar(20)', key: '—', note: 'Hạng thành viên (VIP, Gold, Standard)' },
  { name: 'city', type: 'varchar(64)', key: '—', note: 'Tỉnh/Thành phố sinh sống' },
  { name: 'created_at', type: 'timestamp', key: '—', note: 'Thời điểm tạo tài khoản' },
  { name: 'lifetime_value', type: 'numeric(14,2)', key: '—', note: 'Tổng chi tiêu tích lũy' },
];

const PREVIEW_DIM_CUSTOMERS = [
  { headers: ['customer_id', 'customer_name', 'email', 'tier', 'lifetime_value'] },
  { rows: [
    ['CUST-08912', 'Nguyễn Văn An', 'an.nguyen@email.vn', 'VIP', '42.500.000 đ'],
    ['CUST-14022', 'Trần Thị Mai', 'mai.tran@email.vn', 'Gold', '18.200.000 đ'],
    ['CUST-00231', 'Lê Hoàng Long', 'long.le@email.vn', 'Platinum', '95.400.000 đ'],
    ['CUST-77419', 'Phạm Minh Đức', 'duc.pm@email.vn', 'Standard', '4.800.000 đ'],
    ['CUST-29104', 'Vũ Quỳnh Chi', 'chi.vu@email.vn', 'Gold', '15.600.000 đ'],
  ]}
];

const COLUMNS_DIM_PRODUCTS: ColumnItem[] = [
  { name: 'product_id', type: 'varchar(32)', key: 'PK', note: 'Mã SKU sản phẩm' },
  { name: 'product_name', type: 'varchar(256)', key: '—', note: 'Tên thương mại sản phẩm' },
  { name: 'category_id', type: 'varchar(16)', key: 'FK', note: 'Khóa ngoại trỏ sang dim_categories' },
  { name: 'unit_price', type: 'numeric(12,2)', key: '—', note: 'Giá niêm yết bán lẻ' },
  { name: 'cost_price', type: 'numeric(12,2)', key: '—', note: 'Giá vốn nhập kho' },
  { name: 'stock_quantity', type: 'integer', key: '—', note: 'Số lượng tồn kho thực tế' },
  { name: 'status', type: 'varchar(20)', key: '—', note: 'active, discontinued, out_of_stock' },
];

const PREVIEW_DIM_PRODUCTS = [
  { headers: ['product_id', 'product_name', 'category_id', 'stock_quantity', 'unit_price'] },
  { rows: [
    ['SKU-0091', 'Áo Polo Thể Thao Nam Breathable', 'CAT-APP', '1.420', '389.000 đ'],
    ['SKU-0104', 'Quần Jeans Slim-fit Co Giãn', 'CAT-APP', '850', '650.000 đ'],
    ['SKU-0219', 'Giày Chạy Bộ Sneaker Pro Light', 'CAT-FW', '310', '1.290.000 đ'],
    ['SKU-0305', 'Balo Chống Nước Oxford 25L', 'CAT-ACC', '640', '480.000 đ'],
    ['SKU-0412', 'Đồng Hồ Thông Minh Sport Tracking', 'CAT-TECH', '180', '2.490.000 đ'],
  ]}
];

export const OpenWorkDatasourcePage: React.FC<OpenWorkDatasourcePageProps> = ({
  onAskSource,
  onAddNew,
}) => {
  const [activeSourceId, setActiveSourceId] = useState<string>('pg-warehouse');
  const [activeTableName, setActiveTableName] = useState<string>('fact_orders');
  const [tableFilter, setTableFilter] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const activeSource = SOURCES.find((s) => s.id === activeSourceId) || SOURCES[0];

  const filteredTables = useMemo(() => {
    return PG_TABLES.filter((t) =>
      t.name.toLowerCase().includes(tableFilter.toLowerCase())
    );
  }, [tableFilter]);

  const activeColumns = useMemo(() => {
    if (activeTableName === 'dim_customers') return COLUMNS_DIM_CUSTOMERS;
    if (activeTableName === 'dim_products') return COLUMNS_DIM_PRODUCTS;
    return COLUMNS_FACT_ORDERS;
  }, [activeTableName]);

  const activePreview = useMemo(() => {
    if (activeTableName === 'dim_customers') return PREVIEW_DIM_CUSTOMERS;
    if (activeTableName === 'dim_products') return PREVIEW_DIM_PRODUCTS;
    return PREVIEW_FACT_ORDERS;
  }, [activeTableName]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="sticky top-0 z-10 h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)]/60 bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Nguồn dữ liệu
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap">
            {SOURCES.length} kết nối
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-lg text-[0.71875rem] whitespace-nowrap transition-colors cursor-pointer"
          >
            <RefreshCw size={12} className={cn(isRefreshing && 'animate-spin')} />
            <span>Kiểm tra kết nối</span>
          </button>

          <button
            type="button"
            onClick={onAddNew}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-opacity shadow-xs cursor-pointer"
          >
            <Plus size={12} />
            <span>Thêm nguồn</span>
          </button>
        </div>
      </header>

      {/* ── 2. Master-Detail Split Canvas ── */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Left Column: 300px Source Cards List */}
        <div className="w-[300px] flex-none border-r border-[var(--border)] bg-[var(--panel)] overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-2 custom-scrollbar">
          {SOURCES.map((s) => {
            const isActive = s.id === activeSourceId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSourceId(s.id)}
                className={cn(
                  'w-full text-left rounded-xl p-2.5 shadow-[var(--shadow)] flex flex-col gap-1.5 border hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer',
                  isActive
                    ? 'border-[var(--accent)] bg-[var(--card)] ring-1 ring-[var(--accent)]/30'
                    : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    style={{ color: s.tone }}
                    className="w-5.5 h-5.5 rounded-md border border-[var(--border)] flex items-center justify-center font-mono text-[0.5625rem] font-semibold shrink-0 bg-[var(--bg)]"
                  >
                    {s.tag}
                  </span>
                  <span className="text-[0.78125rem] font-medium text-[var(--fg)] truncate flex-1 min-w-0">
                    {s.name}
                  </span>
                  {isRefreshing && isActive ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Đang kiểm tra
                    </span>
                  ) : s.ok ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Đã kết nối
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Ngắt kết nối
                    </span>
                  )}
                </div>

                <div className="font-mono text-[0.65625rem] text-[var(--muted-fg)] truncate">
                  {s.host}
                </div>

                <div className="flex items-center justify-between text-[0.65625rem] text-[var(--muted-fg)] pt-0.5">
                  <span>{s.tables}</span>
                  <span className="font-mono">{s.latency}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Main Panel */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-3.5 custom-scrollbar">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-[1.0625rem] font-medium tracking-tight text-[var(--fg)] truncate">
                  {activeSource.name}
                </h2>
                {isRefreshing ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Đang kiểm tra
                  </span>
                ) : activeSource.ok ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Đã kết nối
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Ngắt kết nối
                  </span>
                )}
              </div>
              <p className="font-mono text-[0.71875rem] text-[var(--muted-fg)] mt-0.5 truncate">
                {activeSource.conn}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onAskSource?.(activeSource.id)}
                className="h-7 px-3 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:bg-[var(--muted)] rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-colors cursor-pointer"
              >
                <MessageSquare size={12} className="text-[var(--accent)]" />
                <span>Hỏi về nguồn này</span>
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                className="h-7 px-3 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-lg text-[0.71875rem] whitespace-nowrap transition-colors cursor-pointer"
              >
                <RefreshCw size={12} className={cn(isRefreshing && 'animate-spin')} />
                <span>Làm mới lược đồ</span>
              </button>
            </div>
          </div>

          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Bảng', value: activeSource.tableCount },
              { label: 'Tổng dòng', value: activeSource.totalRows },
              { label: 'Dung lượng', value: activeSource.storage },
              { label: 'Đồng bộ gần nhất', value: activeSource.syncedAt },
            ].map((m, idx) => (
              <div
                key={idx}
                className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 shadow-[var(--shadow)] hover:-translate-y-1 hover:shadow-md transition-all duration-200"
              >
                <div className="text-[0.6875rem] text-[var(--muted-fg)] truncate">{m.label}</div>
                <div className="font-mono text-[1.1875rem] font-medium tracking-tight text-[var(--fg)] mt-1 tabular-nums">
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Schema & Preview Split */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-3 items-start">
            {/* Table Selector Box */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--hair)] gap-2">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Bảng</span>
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1.5 text-[var(--muted-fg)]" />
                  <input
                    type="text"
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                    placeholder="Lọc bảng…"
                    className="w-28 h-6 pl-6 pr-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--muted-fg)] rounded-md text-[0.6875rem] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                {filteredTables.map((t) => {
                  const isTActive = t.name === activeTableName;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setActiveTableName(t.name)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 border-b border-[var(--hair)] text-left transition-all duration-200 hover:-translate-y-0.5 cursor-pointer',
                        isTActive
                          ? 'bg-[var(--muted)] text-[var(--fg)] font-medium'
                          : 'hover:bg-[var(--muted)]/50 text-[var(--fg2)]'
                      )}
                    >
                      <span className="font-mono text-[0.71875rem] truncate">{t.name}</span>
                      <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] shrink-0">
                        {t.rows}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Schema Column Inspector + 5-Row Preview */}
            <div className="flex flex-col gap-3 min-w-0">
              {/* Column Inspector */}
              <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--hair)]">
                  <span className="font-mono text-[0.75rem] font-medium text-[var(--fg)] truncate">
                    {activeTableName}
                  </span>
                  <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] shrink-0">
                    {activeColumns.length} cột
                  </span>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-[0.75rem] border-collapse min-w-[360px]">
                    <thead>
                      <tr className="border-b border-[var(--hair)] text-[0.65625rem] uppercase tracking-wider text-[var(--muted-fg)]">
                        <th className="py-1.5 px-3 font-medium">Cột</th>
                        <th className="py-1.5 px-3 font-medium">Kiểu</th>
                        <th className="py-1.5 px-3 font-medium">Khóa</th>
                        <th className="py-1.5 px-3 font-medium">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeColumns.map((c, i) => (
                        <tr
                          key={i}
                          className="border-b border-[var(--hair)] hover:bg-[var(--muted)]/40 transition-colors"
                        >
                          <td className="py-1.5 px-3 font-mono text-[0.71875rem] text-[var(--fg)] truncate">
                            {c.name}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-xs text-[var(--muted-fg)] truncate">
                            {c.type}
                          </td>
                          <td className="py-1.5 px-3 text-[0.6875rem]">
                            {c.key === 'PK' ? (
                              <span className="font-mono text-[0.625rem] px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                                PK
                              </span>
                            ) : c.key === 'FK' ? (
                              <span className="font-mono text-[0.625rem] px-1 py-0.2 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold border border-sky-500/20">
                                FK
                              </span>
                            ) : (
                              <span className="text-[var(--muted-fg)]">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-[0.71875rem] text-[var(--fg2)] truncate max-w-[180px]">
                            {c.note}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Live 5-Row Data Preview */}
              <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--hair)]">
                  <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Xem trước dữ liệu</span>
                  <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)]">5 dòng đầu</span>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left font-mono text-[0.6875rem] border-collapse min-w-[500px]">
                    <thead>
                      <tr className="border-b border-[var(--hair)] bg-[var(--muted)]/50 text-[var(--muted-fg)] text-[0.65625rem]">
                        {activePreview[0].headers?.map((h) => (
                          <th key={h} className="py-1.5 px-2.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activePreview[1].rows?.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="border-b border-[var(--hair)] hover:bg-[var(--muted)]/30 transition-colors"
                        >
                          {row.map((val, cIdx) => (
                            <td
                              key={cIdx}
                              className={cn(
                                'py-1.5 px-2.5 truncate max-w-[130px]',
                                cIdx === row.length - 1 ? 'text-right text-[var(--fg2)]' : 'text-[var(--fg)]'
                              )}
                            >
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkDatasourcePage;
