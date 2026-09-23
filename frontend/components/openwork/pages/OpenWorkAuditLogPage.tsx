import React, { useState, useMemo } from 'react';
import { Shield, Search, Download, Filter, FileText, CheckCircle2, AlertTriangle, XCircle, Code2, Copy, Check, ChevronRight, Trash2, Lock, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRBAC } from '@/hooks/useRBAC';
import { DoubleConfirmModal } from '@/components/security/DoubleConfirmModal';

export interface OpenWorkAuditLogPageProps {
  onExportCsv?: () => void;
}

type EventKind = 'AUTH' | 'SQL' | 'EXPORT' | 'ROLE' | 'KEY' | 'SYS';

interface AuditEvent {
  id: string;
  time: string;
  dateGroup: string;
  kind: EventKind;
  kindTone: string;
  user: string;
  summary: string;
  status: 'success' | 'warning' | 'denied';
  ip: string;
  client: string;
  sessionHash: string;
  sha256: string;
  payload?: string;
}

const INITIAL_EVENTS: AuditEvent[] = [
  {
    id: 'evt-20251006-0941',
    time: '09:41:12',
    dateGroup: 'Hôm nay — 06/10/2025',
    kind: 'SQL',
    kindTone: 'var(--c2)',
    user: 'anh.vh@congty.vn',
    summary: 'Chạy truy vấn tổng hợp `fact_orders` & `dim_products` 4 quý',
    status: 'success',
    ip: '118.69.182.45 (Hà Nội, VN)',
    client: 'OpenWork Webapp / Chrome 129',
    sessionHash: 'sess_019183ab-4521-7294-81d3',
    sha256: '9f88c3a10123e44b802a948f102a8c39e8b71d9042faZgE',
    payload: `SELECT \n  p.category_name, \n  DATE_TRUNC('quarter', o.created_at) AS qtr, \n  SUM(o.net_amount) AS revenue, \n  AVG(o.net_amount) AS aov \nFROM fact_orders o \nJOIN dim_products p ON o.product_id = p.product_id \nWHERE o.created_at >= '2025-01-01' \nGROUP BY 1, 2 \nORDER BY 2 DESC, 3 DESC;`,
  },
  {
    id: 'evt-20251006-0935',
    time: '09:35:40',
    dateGroup: 'Hôm nay — 06/10/2025',
    kind: 'EXPORT',
    kindTone: 'var(--c3)',
    user: 'trang.nm@congty.vn',
    summary: 'Xuất bảng tính `PnL_Consolidated_Q3.xlsx` (184 dòng)',
    status: 'success',
    ip: '14.162.140.88 (TP. Hồ Chí Minh, VN)',
    client: 'OpenWork Desktop Client / v2.4.0',
    sessionHash: 'sess_019183a0-1122-3344-5566',
    sha256: '778f9104b2c3a99e8d103387faK9001122334455',
    payload: `{\n  "export_type": "xlsx",\n  "file_name": "PnL_Consolidated_Q3.xlsx",\n  "row_count": 184,\n  "formula_cells": 42,\n  "checksum": "sha256:8899aabbccddeeff"\n}`,
  },
  {
    id: 'evt-20251006-0920',
    time: '09:20:05',
    dateGroup: 'Hôm nay — 06/10/2025',
    kind: 'KEY',
    kindTone: 'var(--c1)',
    user: 'anh.vh@congty.vn',
    summary: 'Tạo API Key mới: `Metabase Integration Connector`',
    status: 'success',
    ip: '118.69.182.45 (Hà Nội, VN)',
    client: 'OpenWork Webapp / Chrome 129',
    sessionHash: 'sess_019183ab-4521-7294-81d3',
    sha256: '33b79f11a00c88de44d722pL88p0123456789abc',
    payload: `{\n  "action": "create_api_key",\n  "name": "Metabase Integration Connector",\n  "scopes": ["read:sql"],\n  "rate_limit_rpm": 600\n}`,
  },
  {
    id: 'evt-20251006-0850',
    time: '08:50:18',
    dateGroup: 'Hôm nay — 06/10/2025',
    kind: 'AUTH',
    kindTone: 'var(--c4)',
    user: 'kiet.lt@congty.vn',
    summary: 'Đăng nhập thành công qua Google Workspace SSO',
    status: 'success',
    ip: '27.72.100.12 (Đà Nẵng, VN)',
    client: 'OpenWork Webapp / Safari 18',
    sessionHash: 'sess_01918388-9900-1122-3344',
    sha256: '5566778899aabbccddeeff001122334455667788',
  },
  {
    id: 'evt-20251005-1810',
    time: '18:10:44',
    dateGroup: 'Hôm qua — 05/10/2025',
    kind: 'ROLE',
    kindTone: 'var(--accent)',
    user: 'anh.vh@congty.vn',
    summary: 'Nâng quyền thành viên `ngoc.tb@congty.vn` lên Phân tích',
    status: 'success',
    ip: '118.69.182.45 (Hà Nội, VN)',
    client: 'OpenWork Webapp / Chrome 129',
    sessionHash: 'sess_019182ff-8899-0011-2233',
    sha256: 'aabbccddeeff0011223344556677889900aabbcc',
    payload: `{\n  "target_user": "ngoc.tb@congty.vn",\n  "previous_role": "Chỉ xem",\n  "assigned_role": "Phân tích",\n  "data_scopes": ["Kho phân tích", "ERP"]\n}`,
  },
  {
    id: 'evt-20251005-1422',
    time: '14:22:09',
    dateGroup: 'Hôm qua — 05/10/2025',
    kind: 'SYS',
    kindTone: 'var(--c5)',
    user: 'system-agent',
    summary: 'Từ chối truy vấn SQL chứa từ khóa DROP TABLE trái phép',
    status: 'denied',
    ip: '10.0.4.12 (Internal VPC)',
    client: 'OpenWork SQL Guardrail Engine',
    sessionHash: 'sess_019182aa-4455-6677-8899',
    sha256: 'deadbeef00112233445566778899aabbccddeeff',
    payload: `/* BLOCKED QUERY */\nDROP TABLE fact_temporary_cache_2024;\n\n-- Guardrail Violation: DDL DROP/TRUNCATE prohibited in analytics workspace`,
  },
];

export const OpenWorkAuditLogPage: React.FC<OpenWorkAuditLogPageProps> = ({
  onExportCsv,
}) => {
  // RBAC permissions hook
  const { canExportLogs, canPurgeLogs, canAdmin } = useRBAC();

  const [events, setEvents] = useState<AuditEvent[]>(INITIAL_EVENTS);
  const [selectedEventId, setSelectedEventId] = useState<string>('evt-20251006-0941');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);

  // RBAC Modals
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  const categories = ['Tất cả', 'Xác thực', 'Dữ liệu', 'Phân quyền', 'Tệp', 'Hệ thống'];

  const categoryKindMap: Record<string, EventKind | null> = {
    'Tất cả': null,
    'Xác thực': 'AUTH',
    'Dữ liệu': 'SQL',
    'Phân quyền': 'ROLE',
    'Tệp': 'EXPORT',
    'Hệ thống': 'SYS',
  };

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const matchSearch =
        e.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.id.toLowerCase().includes(searchQuery.toLowerCase());
      const targetKind = categoryKindMap[selectedCategory];
      const matchCategory = !targetKind || e.kind === targetKind;
      return matchSearch && matchCategory;
    });
  }, [events, searchQuery, selectedCategory]);

  const activeEvent = events.find((e) => e.id === selectedEventId) || filteredEvents[0] || events[0];

  // Group filtered events by date
  const groupedEvents = useMemo(() => {
    const map = new Map<string, AuditEvent[]>();
    filteredEvents.forEach((e) => {
      const list = map.get(e.dateGroup) || [];
      list.push(e);
      map.set(e.dateGroup, list);
    });
    return Array.from(map.entries());
  }, [filteredEvents]);

  const handleCopyPayload = () => {
    if (activeEvent?.payload && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(activeEvent.payload);
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    }
  };

  const handleExportClick = () => {
    if (!canExportLogs) {
      setPermissionNotice('Chỉ Quản trị viên và Biên tập viên mới có quyền xuất nhật ký kiểm toán.');
      setTimeout(() => setPermissionNotice(null), 3500);
      return;
    }
    setShowExportModal(true);
  };

  const confirmExport = () => {
    onExportCsv?.();
    setShowExportModal(false);
  };

  const handlePurgeClick = () => {
    if (!canPurgeLogs) {
      setPermissionNotice('Chỉ Quản trị viên mới có quyền thanh trừng nhật ký kiểm toán.');
      setTimeout(() => setPermissionNotice(null), 3500);
      return;
    }
    setShowPurgeModal(true);
  };

  const confirmPurge = () => {
    setEvents([]);
    setShowPurgeModal(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Nhật ký kiểm toán
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap">
            {events.length > 0 ? 'lưu giữ 90 ngày' : 'trống'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {permissionNotice && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg text-[0.6875rem] font-medium animate-in fade-in">
              <AlertTriangle size={12} />
              <span>{permissionNotice}</span>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1.5 text-[var(--muted-fg)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm sự kiện, IP, người dùng…"
              className="w-40 sm:w-52 h-6.5 pl-7 pr-2.5 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--muted-fg)] rounded-lg text-[0.71875rem] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Purge Logs Button (Admin Only) */}
          <button
            type="button"
            onClick={handlePurgeClick}
            disabled={!canPurgeLogs || events.length === 0}
            title={canPurgeLogs ? 'Thanh trừng toàn bộ nhật ký (Yêu cầu xác nhận cấp 2)' : 'Chỉ Quản trị viên mới có quyền xóa nhật ký'}
            className={cn(
              'h-6.5 px-2.5 flex items-center gap-1.5 border rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-colors shadow-xs',
              canPurgeLogs && events.length > 0
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer'
                : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-fg)] opacity-50 cursor-not-allowed'
            )}
          >
            {canPurgeLogs ? <Trash2 size={12} /> : <Lock size={12} />}
            <span>Xóa nhật ký</span>
          </button>

          {/* Export CSV Button (Admin & Editor) */}
          <button
            type="button"
            onClick={handleExportClick}
            disabled={!canExportLogs}
            title={canExportLogs ? 'Xuất toàn bộ sự kiện ra tệp CSV' : 'Chỉ Quản trị viên và Biên tập viên mới có quyền xuất file'}
            className={cn(
              'h-6.5 px-2.5 flex items-center gap-1.5 border rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-colors shadow-xs',
              canExportLogs
                ? 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:bg-[var(--muted)] cursor-pointer'
                : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-fg)] opacity-60 cursor-not-allowed'
            )}
          >
            {canExportLogs ? <Download size={12} /> : <Lock size={12} />}
            <span>Xuất CSV</span>
          </button>
        </div>
      </header>

      {/* ── 2. Master-Detail Split Canvas ── */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Left Events Stream Panel */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-3.5 custom-scrollbar">
          {/* 4 Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Sự kiện 24 giờ', value: events.length > 0 ? '1.482 lượt' : '0 lượt' },
              { label: 'Cảnh báo bảo mật', value: '0 vụ' },
              { label: 'Người dùng tác vụ', value: events.length > 0 ? '8 tài khoản' : '0 tài khoản' },
              { label: 'Dung lượng log', value: events.length > 0 ? '142 MB' : '0 MB' },
            ].map((st, i) => (
              <div
                key={i}
                className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 shadow-[var(--shadow)]"
              >
                <div className="text-[0.6875rem] text-[var(--muted-fg)] truncate">{st.label}</div>
                <div className="font-mono text-[1.125rem] font-medium tracking-tight text-[var(--fg)] mt-1 tabular-nums">
                  {st.value}
                </div>
              </div>
            ))}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCategory(c)}
                className={cn(
                  'h-6 px-2.5 rounded-md text-[0.71875rem] transition-colors whitespace-nowrap',
                  selectedCategory === c
                    ? 'bg-[var(--primary)] text-[var(--primary-fg)] font-medium shadow-xs'
                    : 'text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)] border border-[var(--border)] bg-[var(--card)]'
                )}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Grouped Day Stream */}
          <div className="flex flex-col gap-4">
            {groupedEvents.length === 0 ? (
              <div className="p-8 text-center text-[var(--muted-fg)] text-[0.75rem] border border-[var(--border)] rounded-xl bg-[var(--card)]">
                {events.length === 0 ? 'Nhật ký kiểm toán đã được xóa an toàn' : 'Không tìm thấy sự kiện nào trong bộ lọc'}
              </div>
            ) : (
              groupedEvents.map(([dateGroup, evts]) => (
                <div key={dateGroup} className="flex flex-col gap-2">
                  <div className="text-[0.6875rem] font-medium text-[var(--muted-fg)] px-1 uppercase tracking-wider">
                    {dateGroup}
                  </div>

                  <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden">
                    {evts.map((e) => {
                      const isSelected = e.id === selectedEventId;
                      return (
                        <div
                          key={e.id}
                          onClick={() => setSelectedEventId(e.id)}
                          className={cn(
                            'p-3 border-b border-[var(--hair)] cursor-pointer transition-colors flex items-center justify-between gap-3',
                            isSelected
                              ? 'bg-[var(--muted)]/80 ring-1 ring-[var(--accent)]/30'
                              : 'hover:bg-[var(--muted)]/40'
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="font-mono text-[0.6875rem] text-[var(--muted-fg)] shrink-0 tabular-nums">
                              {e.time}
                            </span>

                            <span
                              style={{ color: e.kindTone }}
                              className="font-mono text-[0.59375rem] font-semibold px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] shrink-0"
                            >
                              {e.kind}
                            </span>

                            <span className="text-[0.78125rem] text-[var(--fg)] truncate min-w-0 flex-1">
                              {e.summary}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-[0.6875rem] text-[var(--muted-fg)] truncate max-w-[130px] hidden sm:inline">
                              {e.user}
                            </span>

                            {e.status === 'success' ? (
                              <span className="text-[0.625rem] px-2 py-0.5 rounded font-medium border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                Thành công
                              </span>
                            ) : (
                              <span className="text-[0.625rem] px-2 py-0.5 rounded font-medium border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
                                Từ chối
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Event Detail Drawer (330px) */}
        {activeEvent && (
          <div className="w-[330px] flex-none border-l border-[var(--border)] bg-[var(--panel)] overflow-y-auto overflow-x-hidden p-3.5 flex flex-col gap-3 custom-scrollbar">
            <div className="border-b border-[var(--hair)] pb-2.5">
              <div className="flex items-center gap-2">
                <span
                  style={{ color: activeEvent.kindTone }}
                  className="font-mono text-[0.5625rem] font-semibold px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)]"
                >
                  {activeEvent.kind}
                </span>
                <span className="text-[0.8125rem] font-medium text-[var(--fg)] truncate">
                  Chi tiết sự kiện
                </span>
              </div>
              <div className="font-mono text-[0.65625rem] text-[var(--muted-fg)] mt-1 truncate">
                {activeEvent.id}
              </div>
            </div>

            {/* Metadata Table */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 shadow-[var(--shadow)] flex flex-col gap-2 text-[0.71875rem]">
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-1.5">
                <span className="text-[var(--muted-fg)]">Thời gian:</span>
                <span className="font-mono text-[var(--fg)]">{activeEvent.time}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-1.5">
                <span className="text-[var(--muted-fg)]">Người dùng:</span>
                <span className="font-mono text-[var(--fg)] truncate max-w-[170px]">{activeEvent.user}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-1.5">
                <span className="text-[var(--muted-fg)]">Địa chỉ IP:</span>
                <span className="font-mono text-[var(--fg2)] truncate max-w-[170px]">{activeEvent.ip}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-1.5">
                <span className="text-[var(--muted-fg)]">Tác nhân Client:</span>
                <span className="text-[var(--fg2)] truncate max-w-[160px]">{activeEvent.client}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-1.5">
                <span className="text-[var(--muted-fg)]">Mã phiên:</span>
                <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] truncate max-w-[150px]">
                  {activeEvent.sessionHash}
                </span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[var(--muted-fg)]">SHA-256 Hash:</span>
                <span className="font-mono text-[0.625rem] text-[var(--muted-fg)] truncate max-w-[150px]">
                  {activeEvent.sha256.slice(0, 16)}…
                </span>
              </div>
            </div>

            {/* Code / Payload Container */}
            {activeEvent.payload && (
              <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--hair)] bg-[var(--muted)]/40">
                  <span className="text-[0.71875rem] font-medium text-[var(--fg)]">Nội dung ghi nhận</span>
                  <button
                    type="button"
                    onClick={handleCopyPayload}
                    className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)]"
                  >
                    {copiedPayload ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className="p-3 bg-[#0b0b0e] text-[#fafafa] font-mono text-[0.6875rem] overflow-x-auto max-h-[260px] custom-scrollbar">
                  <pre className="whitespace-pre-wrap leading-relaxed m-0">{activeEvent.payload}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3. Export CSV Confirmation Modal (Tier 1) ── */}
      <DoubleConfirmModal
        open={showExportModal}
        onOpenChange={setShowExportModal}
        title="Xác nhận xuất nhật ký kiểm toán"
        actionName="Xuất tệp CSV"
        actionLabel="Xuất dữ liệu"
        tier={1}
        variant="default"
        description="Tệp CSV sẽ bao gồm toàn bộ nhật ký truy vấn SQL, thao tác bảo mật, địa chỉ IP và mã băm SHA-256 đã lọc. Dữ liệu nhạy cảm cần được bảo mật theo quy định của tổ chức."
        onConfirm={confirmExport}
        onCancel={() => setShowExportModal(false)}
      />

      {/* ── 4. Purge Logs Confirmation Modal (Tier 2 Destructive) ── */}
      <DoubleConfirmModal
        open={showPurgeModal}
        onOpenChange={setShowPurgeModal}
        title="CẢNH BÁO: Thanh trừng toàn bộ nhật ký kiểm toán"
        actionName="Xóa nhật ký kiểm toán"
        actionLabel="Thanh trừng vĩnh viễn"
        tier={2}
        requiredPhrase="PURGE_LOGS"
        variant="danger"
        description="Hành động này sẽ xóa vĩnh viễn toàn bộ bản ghi sự kiện kiểm toán, bằng chứng truy vết IP và mã băm toàn vẹn SHA-256. Dữ liệu sau khi xóa sẽ KHÔNG THỂ KHÔI PHỤC trong bất kỳ trường hợp nào."
        impactSummary={
          <div className="space-y-1 text-rose-600 dark:text-rose-400 font-medium">
            <div>• Toàn bộ {events.length} sự kiện kiểm toán sẽ bị xóa sạch khỏi cơ sở dữ liệu.</div>
            <div>• Báo cáo tuân thủ bảo mật và lịch sử điều tra sự cố sẽ bị mất chuỗi truy vết.</div>
          </div>
        }
        onConfirm={confirmPurge}
        onCancel={() => setShowPurgeModal(false)}
      />
    </div>
  );
};

export default OpenWorkAuditLogPage;
