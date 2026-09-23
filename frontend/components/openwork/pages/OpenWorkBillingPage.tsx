import React, { useState } from 'react';
import { CreditCard, Download, ExternalLink, FileText, CheckCircle2, AlertTriangle, ArrowUpRight, Building2, Plus, ShieldAlert, Lock, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRBAC } from '@/hooks/useRBAC';
import { DoubleConfirmModal } from '@/components/security/DoubleConfirmModal';

export interface OpenWorkBillingPageProps {
  onDownloadInvoice?: (id: string) => void;
  onViewPricing?: () => void;
}

interface InvoiceItem {
  id: string;
  code: string;
  period: string;
  amount: string;
  status: 'paid' | 'open' | 'late';
  date: string;
}

const INVOICES: InvoiceItem[] = [
  {
    id: 'inv-2025-09',
    code: 'HD-2025-09812',
    period: 'Tháng 09/2025 (Chu kỳ hàng tháng)',
    amount: '36.140.000 đ',
    status: 'paid',
    date: '01/10/2025',
  },
  {
    id: 'inv-2025-08',
    code: 'HD-2025-08701',
    period: 'Tháng 08/2025 (Chu kỳ hàng tháng)',
    amount: '34.820.000 đ',
    status: 'paid',
    date: '01/09/2025',
  },
  {
    id: 'inv-2025-07',
    code: 'HD-2025-07619',
    period: 'Tháng 07/2025 (Chu kỳ hàng tháng)',
    amount: '32.100.000 đ',
    status: 'paid',
    date: '01/08/2025',
  },
  {
    id: 'inv-2025-06',
    code: 'HD-2025-06504',
    period: 'Tháng 06/2025 (Chu kỳ hàng tháng)',
    amount: '30.720.000 đ',
    status: 'paid',
    date: '01/07/2025',
  },
];

const HISTORICAL_MONTHS = ['T5', 'T6', 'T7', 'T8', 'T9', 'T10'];
const PLAN_FEES = [30.7, 30.7, 30.7, 30.7, 30.7, 30.7];
const OVERAGE_FEES = [1.2, 0.0, 1.4, 4.1, 5.4, 6.2];

export const OpenWorkBillingPage: React.FC<OpenWorkBillingPageProps> = ({
  onDownloadInvoice,
  onViewPricing,
}) => {
  // RBAC permissions hook
  const { canModifyBilling, canAdmin } = useRBAC();

  const [invoices] = useState<InvoiceItem[]>(INVOICES);
  const [currentPlan, setCurrentPlan] = useState<'Enterprise' | 'Team' | 'Free'>('Enterprise');
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // RBAC Confirmation Modals
  const [showCancelPlanModal, setShowCancelPlanModal] = useState<boolean>(false);
  const [showDowngradeModal, setShowDowngradeModal] = useState<boolean>(false);

  const usageMeters = [
    { label: 'Phiên phân tích', current: '148', limit: '200 phiên', pct: 74, color: 'var(--c2)' },
    { label: 'Token mô hình AI', current: '18,4M', limit: '25M tokens', pct: 73, color: 'var(--c3)' },
    { label: 'Sandbox Python phân tích', current: '42,5', limit: '60 giờ', pct: 70, color: 'var(--c1)' },
    { label: 'Dung lượng lưu trữ Artifacts', current: '38,2', limit: '50 GB', pct: 76, color: 'var(--c4)' },
  ];

  const handleCancelPlanClick = () => {
    if (!canModifyBilling) {
      setPermissionNotice('Chỉ Quản trị viên mới có quyền hủy hoặc thay đổi gói dịch vụ.');
      setTimeout(() => setPermissionNotice(null), 3500);
      return;
    }
    setShowCancelPlanModal(true);
  };

  const confirmCancelPlan = () => {
    setCurrentPlan('Free');
    setShowCancelPlanModal(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Thanh toán & hóa đơn
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap">
            Gói {currentPlan}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {permissionNotice && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg text-[0.6875rem] font-medium animate-in fade-in">
              <AlertTriangle size={12} />
              <span>{permissionNotice}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onViewPricing}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-lg text-[0.71875rem] whitespace-nowrap transition-colors"
          >
            <ExternalLink size={12} />
            <span>Xem bảng giá</span>
          </button>

          {/* Cancel / Modify Subscription Guardrail (Admin Only) */}
          <button
            type="button"
            onClick={handleCancelPlanClick}
            disabled={!canModifyBilling || currentPlan === 'Free'}
            title={canModifyBilling ? 'Hủy gói dịch vụ hoặc hạ cấp (Yêu cầu xác nhận cấp 2)' : 'Chỉ Quản trị viên mới có quyền sửa đổi gói'}
            className={cn(
              'h-6.5 px-2.5 flex items-center gap-1.5 border rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-all shadow-xs',
              canModifyBilling && currentPlan !== 'Free'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer'
                : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-fg)] opacity-50 cursor-not-allowed'
            )}
          >
            {canModifyBilling ? <XCircle size={12} /> : <Lock size={12} />}
            <span>Hủy gói doanh nghiệp</span>
          </button>

          <button
            type="button"
            onClick={() => onDownloadInvoice?.('latest')}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-opacity shadow-xs"
          >
            <Download size={12} />
            <span>Tải hóa đơn mới nhất</span>
          </button>
        </div>
      </header>

      {/* ── 2. Scrollable Canvas Content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--panel)] p-4 custom-scrollbar">
        <div className="max-w-[1280px] mx-auto flex flex-col gap-4">
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Chi phí chu kỳ này', value: currentPlan === 'Free' ? '0 đ' : '36,1 tr đ', sub: 'Dự kiến: 38,4 tr đ', tone: 'var(--fg)' },
              { label: 'Phí gói cơ bản', value: currentPlan === 'Free' ? '0 đ' : '30,7 tr đ', sub: 'Chu kỳ năm (−20%)', tone: 'var(--c1)' },
              { label: 'Vượt hạn mức', value: currentPlan === 'Free' ? '0 đ' : '5,4 tr đ', sub: '+1,2 tr đ vs tháng trước', tone: 'var(--c2)' },
              { label: 'Hạn mức cảnh báo', value: '40,0 tr đ', sub: currentPlan === 'Free' ? 'Gói miễn phí' : 'Đã sử dụng 90%', tone: 'var(--err)' },
            ].map((k, i) => (
              <div
                key={i}
                className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 shadow-[var(--shadow)] flex flex-col justify-between"
              >
                <div className="text-[0.6875rem] text-[var(--muted-fg)] truncate">{k.label}</div>
                <div
                  style={{ color: k.tone }}
                  className="font-mono text-[1.25rem] font-medium tracking-tight mt-1 tabular-nums"
                >
                  {k.value}
                </div>
                <div className="text-[0.65625rem] text-[var(--muted-fg)] mt-1 font-mono">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Row 2: Usage Meters + 6-Month Cost Stacked Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">
            {/* Usage Progress Meters */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-2.5">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Mức sử dụng gói hiện tại</span>
                <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)]">Làm mới ngày 01/11</span>
              </div>

              <div className="flex flex-col gap-3.5 py-2">
                {usageMeters.map((m, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[0.71875rem]">
                      <span className="text-[var(--fg)]">{m.label}</span>
                      <span className="font-mono text-[0.6875rem] text-[var(--muted-fg)]">
                        <strong className="text-[var(--fg)] font-medium">{m.current}</strong> / {m.limit} ({m.pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[var(--muted)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${m.pct}%`, background: m.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 6-Month Stacked Bar Chart */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-2.5">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Chi phí 6 tháng qua</span>
                <div className="flex items-center gap-3 text-[0.625rem] text-[var(--muted-fg)]">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-[2px] bg-[var(--c1)]" /> Gói cơ bản
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-[2px] bg-[var(--c2)]" /> Vượt hạn mức
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <svg viewBox="0 0 360 140" className="w-full h-auto block">
                  <g stroke="var(--hair)" strokeWidth="1">
                    <line x1="20" y1="20" x2="340" y2="20" />
                    <line x1="20" y1="60" x2="340" y2="60" />
                    <line x1="20" y1="100" x2="340" y2="100" />
                    <line x1="20" y1="120" x2="340" y2="120" />
                  </g>

                  {HISTORICAL_MONTHS.map((m, idx) => {
                    const baseH = PLAN_FEES[idx] * 2.2;
                    const overH = OVERAGE_FEES[idx] * 2.2;
                    const x = 36 + idx * 52;
                    return (
                      <g key={m}>
                        {/* Base plan bar */}
                        <rect
                          x={x}
                          y={120 - baseH}
                          width="24"
                          height={baseH}
                          rx="2"
                          fill="var(--c1)"
                        />
                        {/* Overage bar stacked on top */}
                        {overH > 0 && (
                          <rect
                            x={x}
                            y={120 - baseH - overH}
                            width="24"
                            height={overH}
                            rx="2"
                            fill="var(--c2)"
                          />
                        )}
                        <text
                          x={x + 12}
                          y="134"
                          fontSize="9.5"
                          fontFamily="Geist Mono, monospace"
                          fill="var(--muted-fg)"
                          textAnchor="middle"
                        >
                          {m}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          {/* Row 3: Payment Methods & Invoices Table */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-3 items-start">
            {/* Payment Methods & Tax Details */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-2.5">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Phương thức thanh toán</span>
                <span className="text-[0.65625rem] text-[var(--muted-fg)]">Chuyển khoản / Thẻ</span>
              </div>

              {/* Default Method: Corporate Bank Transfer */}
              <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--panel)]/50 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-[var(--accent)]" />
                    <span className="text-[0.75rem] font-medium text-[var(--fg)]">
                      Vietcombank Corporate (Mặc định)
                    </span>
                  </div>
                  <span className="text-[0.625rem] px-1.5 py-0.2 rounded font-medium border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    Chính
                  </span>
                </div>
                <div className="font-mono text-[0.6875rem] text-[var(--muted-fg)]">
                  STK: 0011004829104 · SGD Sở Giao Dịch
                </div>
                <div className="text-[0.65625rem] text-[var(--fg2)]">
                  CTK: CONG TY CO PHAN CONG NGHE OPENWORK
                </div>
              </div>

              {/* Backup Method: Visa */}
              <div className="border border-[var(--hair)] rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard size={15} className="text-[var(--muted-fg)]" />
                  <div>
                    <div className="text-[0.75rem] font-medium text-[var(--fg)]">Visa Corporate Card</div>
                    <div className="font-mono text-[0.65625rem] text-[var(--muted-fg)]">•••• 8912 · Hết hạn 12/28</div>
                  </div>
                </div>
                <span className="text-[0.6875rem] text-[var(--muted-fg)]">Dự phòng</span>
              </div>

              {/* Tax Invoice Details */}
              <div className="border-t border-[var(--hair)] pt-2.5 text-[0.6875rem] text-[var(--muted-fg)] flex flex-col gap-1">
                <div className="font-medium text-[var(--fg)]">Thông tin xuất hóa đơn VAT điện tử:</div>
                <div>MST: 0109848192</div>
                <div>Công ty Cổ phần Công nghệ OpenWork Việt Nam</div>
              </div>
            </div>

            {/* Invoices List Table */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden flex flex-col">
              <div className="p-3 border-b border-[var(--hair)] flex items-center justify-between">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Lịch sử hóa đơn</span>
                <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)]">{invoices.length} kỳ</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[0.75rem] border-collapse min-w-[480px]">
                  <thead>
                    <tr className="border-b border-[var(--hair)] text-[0.625rem] uppercase tracking-wider text-[var(--muted-fg)]">
                      <th className="py-2 px-3.5 font-medium">Mã HĐ</th>
                      <th className="py-2 px-3.5 font-medium">Kỳ hóa đơn</th>
                      <th className="py-2 px-3.5 font-medium text-right">Số tiền</th>
                      <th className="py-2 px-3.5 font-medium">Trạng thái</th>
                      <th className="py-2 px-3.5 text-right font-medium">Tải về</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-[var(--hair)] hover:bg-[var(--muted)]/40 transition-colors"
                      >
                        <td className="py-2.5 px-3.5 font-mono text-[0.71875rem] text-[var(--fg)] truncate">
                          {inv.code}
                        </td>
                        <td className="py-2.5 px-3.5 text-[0.71875rem] text-[var(--fg2)] truncate max-w-[180px]">
                          {inv.period}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-[var(--fg)] font-medium">
                          {inv.amount}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className="text-[0.625rem] px-2 py-0.5 rounded font-medium border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            Đã thanh toán
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => onDownloadInvoice?.(inv.id)}
                            title="Tải PDF hóa đơn"
                            className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)] transition-colors"
                          >
                            <Download size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Cancel Subscription Double Confirmation (Tier 2 Destructive) ── */}
      <DoubleConfirmModal
        open={showCancelPlanModal}
        onOpenChange={setShowCancelPlanModal}
        title="CẢNH BÁO: Hủy gói dịch vụ Enterprise"
        actionName="Hủy gói dịch vụ"
        actionLabel="Hủy gói dịch vụ ngay"
        tier={2}
        requiredPhrase="CANCEL_PLAN"
        variant="danger"
        description="Bạn đang chuẩn bị hủy gói Enterprise cho toàn bộ tổ chức. Các tính năng mở rộng gồm Python Sandbox, 25M AI Tokens, kết nối không giới hạn và hỗ trợ SLA sẽ bị ngừng vào cuối chu kỳ."
        impactSummary={
          <div className="space-y-1 text-rose-600 dark:text-rose-400 font-medium">
            <div>• Toàn bộ thành viên sẽ bị chuyển về hạn mức miễn phí (Free Tier).</div>
            <div>• Giới hạn 20 phiên phân tích / tháng và ngừng hỗ trợ đa người dùng đồng thời.</div>
          </div>
        }
        onConfirm={confirmCancelPlan}
        onCancel={() => setShowCancelPlanModal(false)}
      />
    </div>
  );
};

export default OpenWorkBillingPage;
