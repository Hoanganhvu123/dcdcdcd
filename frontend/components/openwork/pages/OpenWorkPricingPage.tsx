import React, { useState } from 'react';
import { Check, Sparkles, HelpCircle, ChevronDown, ChevronUp, ArrowRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkPricingPageProps {
  onSelectPlan?: (planKey: string) => void;
  onBack?: () => void;
}

interface PricingTier {
  key: string;
  name: string;
  desc: string;
  priceMonthly: string;
  priceAnnual: string;
  period: string;
  featured?: boolean;
  ctaText: string;
  features: string[];
}

const TIERS: PricingTier[] = [
  {
    key: 'team',
    name: 'Nhóm',
    desc: 'Phù hợp cho các nhóm nhỏ (3–5 người) bắt đầu khai thác dữ liệu tập trung.',
    priceMonthly: '4,9 tr',
    priceAnnual: '3,9 tr',
    period: 'đ / tháng',
    ctaText: 'Bắt đầu dùng thử',
    features: [
      'Tối đa 5 thành viên',
      '2 kết nối nguồn dữ liệu',
      '1.000 truy vấn SQL / ngày',
      'Xuất bảng tính XLSX cơ bản',
      'Lưu trữ Artifacts 10 GB',
    ],
  },
  {
    key: 'business',
    name: 'Doanh nghiệp',
    desc: 'Dành cho các phòng ban dữ liệu, kinh doanh và vận hành quy mô vừa.',
    priceMonthly: '14,8 tr',
    priceAnnual: '11,8 tr',
    period: 'đ / tháng',
    featured: true,
    ctaText: 'Trải nghiệm 14 ngày',
    features: [
      'Tối đa 25 thành viên',
      'Không giới hạn nguồn dữ liệu',
      'Sandbox Python phân tích dữ liệu lớn',
      'Trọn bộ 14 bố cục Presentation 16:9',
      'Executive Doc Writer (Word A4)',
      'Lưu trữ Artifacts 100 GB',
      'Hỗ trợ kỹ thuật qua Slack riêng',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    desc: 'Dành cho tập đoàn lớn cần bảo mật khắt khe, SSO và hạ tầng VPC riêng.',
    priceMonthly: '38,4 tr',
    priceAnnual: '30,7 tr',
    period: 'đ / tháng',
    ctaText: 'Liên hệ tư vấn',
    features: [
      'Không giới hạn thành viên & nguồn dữ liệu',
      'Triển khai On-Premise hoặc Private VPC',
      'Đăng nhập SSO (SAML, Okta, Azure AD)',
      'Nhật ký kiểm toán bảo mật 1 năm',
      'Cam kết SLA 99.9% hoạt động liên tục',
      'Chuyên gia AI & Data Engineer đồng hành riêng',
    ],
  },
  {
    key: 'research',
    name: 'Nghiên cứu & Edu',
    desc: 'Gói hỗ trợ miễn phí cho sinh viên, giảng viên và lab nghiên cứu.',
    priceMonthly: '0 đ',
    priceAnnual: '0 đ',
    period: 'miễn phí trọn đời',
    ctaText: 'Đăng ký học thuật',
    features: [
      '1 thành viên nghiên cứu',
      'Kết nối SQLite, DuckDB, CSV cục bộ',
      'Đầy đủ tính năng SQL Analyst & Studio',
      'Hỗ trợ cộng đồng Discord',
    ],
  },
];

const COMPARISON_ROWS = [
  { category: 'Số lượng thành viên', team: '5 người', business: '25 người', enterprise: 'Không giới hạn', research: '1 người' },
  { category: 'Số lượng kết nối Database', team: '2 nguồn', business: 'Không giới hạn', enterprise: 'Không giới hạn', research: 'Cục bộ (SQLite/CSV)' },
  { category: 'Truy vấn SQL AI tự động', team: '1.000 req/ngày', business: '10.000 req/ngày', enterprise: 'Không giới hạn', research: '300 req/ngày' },
  { category: 'Python Sandbox cô lập', team: '—', business: '✓ (60 giờ/tháng)', enterprise: '✓ (Không giới hạn)', research: '✓ (Cục bộ)' },
  { category: 'Spreadsheet Studio (XLSX đa sheet)', team: '✓ Cơ bản', business: '✓ Đầy đủ Pivot & Formula', enterprise: '✓ Tùy biến Macro/VBA', research: '✓ Cơ bản' },
  { category: 'Presentation Studio (Slide 16:9)', team: '—', business: '✓ 14 Bố cục', enterprise: '✓ Master Template riêng', research: '✓ 4 Bố cục' },
  { category: 'Word Executive Document (A4)', team: '—', business: '✓', enterprise: '✓ Chuẩn mẫu công ty', research: '—' },
  { category: 'Máy chủ MCP Tools', team: '2 máy chủ', business: '8 máy chủ', enterprise: 'Không giới hạn', research: '1 máy chủ' },
  { category: 'Bảo mật SSO & SAML', team: '—', business: 'Google Workspace', enterprise: 'SAML, Okta, Azure AD', research: '—' },
  { category: 'Nhật ký kiểm toán (Audit Log)', team: '7 ngày', business: '90 ngày', enterprise: '1 năm / Tùy chọn 5 năm', research: '—' },
  { category: 'Cam kết SLA vận hành', team: '—', business: '99.5%', enterprise: '99.9% Uptime', research: '—' },
  { category: 'Hỗ trợ kỹ thuật', team: 'Email (24h)', business: 'Slack & Email (4h)', enterprise: 'Kỹ sư trực 24/7 (15p)', research: 'Cộng đồng' },
];

const FAQS = [
  {
    q: 'Dữ liệu nội bộ của công ty tôi có bị lộ hoặc dùng để huấn luyện mô hình không?',
    a: 'Hoàn toàn không. OpenWork áp dụng chính sách Zero-Data-Retention đối với mọi dữ liệu truy vấn của doanh nghiệp. Toàn bộ câu lệnh SQL và bảng tính được xử lý cô lập trong sandbox riêng và không bao giờ được dùng để huấn luyện mô hình công cộng.',
  },
  {
    q: 'Tôi có thể nâng cấp hoặc hạ cấp gói bất cứ lúc nào không?',
    a: 'Có. Bạn có thể chuyển đổi giữa các gói linh hoạt. Số tiền chênh lệch sẽ được tự động tính toán theo tỷ lệ số ngày thực tế sử dụng (prorated) và khấu trừ vào chu kỳ tiếp theo.',
  },
  {
    q: 'OpenWork có xuất được hóa đơn giá trị gia tăng (VAT) điện tử hợp lệ tại Việt Nam không?',
    a: 'Có. Chúng tôi phát hành hóa đơn VAT điện tử hợp pháp đầy đủ mã tra cứu của Tổng cục Thuế Việt Nam trong vòng 24 giờ sau khi thanh toán thành công.',
  },
  {
    q: 'Doanh nghiệp có thể thanh toán qua hình thức chuyển khoản ngân hàng không?',
    a: 'Có. Ngoài thẻ tín dụng quốc tế, OpenWork hỗ trợ thanh toán chuyển khoản trực tiếp qua tài khoản ngân hàng doanh nghiệp Vietcombank với hợp đồng dịch vụ chính thức.',
  },
];

export const OpenWorkPricingPage: React.FC<OpenWorkPricingPageProps> = ({
  onSelectPlan,
  onBack,
}) => {
  const [annualBilling, setAnnualBilling] = useState<boolean>(true);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[var(--bg)] text-[var(--fg)] select-none custom-scrollbar">
      {/* ── 1. Top Bar ── */}
      <div className="min-h-[44px] flex items-center justify-between px-6 py-2 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2">
          <div className="w-5.5 h-5.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center font-mono text-[0.625rem] font-semibold">
            OW
          </div>
          <span className="text-[0.8125rem] font-medium tracking-tight">OpenWork Bảng Giá</span>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-[0.75rem] text-[var(--muted-fg)] hover:text-[var(--fg)]"
          >
            Quay lại ứng dụng
          </button>
        )}
      </div>

      {/* ── 2. Hero Section ── */}
      <div className="max-w-[1200px] mx-auto px-4 pt-10 pb-6 text-center flex flex-col items-center gap-3">
        <span className="font-mono text-[0.6875rem] text-[var(--accent)] font-medium uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)]/20">
          Minh bạch · Tối ưu hiệu quả
        </span>
        <h1 className="text-[1.75rem] sm:text-[2.125rem] font-semibold tracking-tight text-[var(--fg)] max-w-[720px] leading-tight">
          Bảng giá giải pháp AI Trợ lý Dữ liệu Doanh nghiệp
        </h1>
        <p className="text-[0.84375rem] text-[var(--muted-fg)] max-w-[600px] leading-relaxed">
          Không phụ phí ẩn. Kết nối an toàn cơ sở dữ liệu nội bộ, bảo vệ quyền riêng tư và phân quyền phân tích chuẩn xác.
        </p>

        {/* Annual / Monthly Switch */}
        <div className="mt-4 flex items-center gap-3 bg-[var(--panel)] border border-[var(--border)] p-1 rounded-xl shadow-xs">
          <button
            type="button"
            onClick={() => setAnnualBilling(false)}
            className={cn(
              'h-7 px-3 rounded-lg text-[0.75rem] transition-colors',
              !annualBilling
                ? 'bg-[var(--card)] text-[var(--fg)] font-medium shadow-xs border border-[var(--border)]'
                : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
            )}
          >
            Theo tháng
          </button>
          <button
            type="button"
            onClick={() => setAnnualBilling(true)}
            className={cn(
              'h-7 px-3 rounded-lg text-[0.75rem] transition-colors flex items-center gap-1.5',
              annualBilling
                ? 'bg-[var(--primary)] text-[var(--primary-fg)] font-medium shadow-xs'
                : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
            )}
          >
            <span>Theo năm</span>
            <span className="text-[0.625rem] font-mono px-1.5 py-0.2 rounded bg-amber-500 text-black font-semibold">
              Tiết kiệm 20%
            </span>
          </button>
        </div>
      </div>

      {/* ── 3. Tier Cards Grid ── */}
      <div className="max-w-[1240px] mx-auto px-4 py-6 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {TIERS.map((t) => {
            const price = annualBilling ? t.priceAnnual : t.priceMonthly;
            return (
              <div
                key={t.key}
                className={cn(
                  'rounded-2xl p-5 bg-[var(--card)] border flex flex-col justify-between transition-all duration-200 relative',
                  t.featured
                    ? 'border-[var(--accent)] shadow-lg ring-1 ring-[var(--accent)]/30'
                    : 'border-[var(--border)] shadow-[var(--shadow)]'
                )}
              >
                {t.featured && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-[var(--accent)] text-white text-[0.625rem] font-semibold px-2.5 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                    Phổ biến nhất
                  </div>
                )}

                <div>
                  <div className="text-[1rem] font-semibold text-[var(--fg)]">{t.name}</div>
                  <p className="text-[0.71875rem] text-[var(--muted-fg)] mt-1 min-h-[34px] leading-relaxed">
                    {t.desc}
                  </p>

                  <div className="mt-4 pt-3 border-t border-[var(--hair)] flex items-baseline gap-1.5">
                    <span className="font-mono text-[1.625rem] font-bold text-[var(--fg)] tabular-nums">
                      {price}
                    </span>
                    <span className="text-[0.6875rem] text-[var(--muted-fg)] font-mono">{t.period}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectPlan?.(t.key)}
                    className={cn(
                      'w-full h-8 mt-4 rounded-xl text-[0.75rem] font-medium transition-all shadow-xs flex items-center justify-center gap-1.5',
                      t.featured
                        ? 'bg-[var(--accent)] text-white hover:opacity-95'
                        : 'bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90'
                    )}
                  >
                    <span>{t.ctaText}</span>
                    <ArrowRight size={13} />
                  </button>

                  <div className="mt-5 pt-4 border-t border-[var(--hair)] flex flex-col gap-2">
                    <span className="text-[0.65625rem] font-medium uppercase tracking-wider text-[var(--muted-fg)]">
                      Tính năng bao gồm:
                    </span>
                    {t.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[0.71875rem] text-[var(--fg2)]">
                        <Check size={13} className="text-[var(--ok)] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4. Full Feature Comparison Matrix ── */}
      <div className="max-w-[1240px] mx-auto px-4 py-8 w-full">
        <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl shadow-[var(--shadow)] overflow-hidden">
          <div className="p-4 border-b border-[var(--hair)] flex items-center justify-between">
            <h2 className="text-[0.875rem] font-semibold text-[var(--fg)]">
              So sánh chi tiết tính năng giữa các gói
            </h2>
            <span className="text-[0.6875rem] text-[var(--muted-fg)]">12 tiêu chí đánh giá</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.75rem] border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--hair)] text-[0.65625rem] uppercase tracking-wider text-[var(--muted-fg)] bg-[var(--panel)]/40">
                  <th className="py-2.5 px-4 font-medium">Hạng mục</th>
                  <th className="py-2.5 px-3 font-medium">Nhóm</th>
                  <th className="py-2.5 px-3 font-medium text-[var(--accent)] font-semibold">Doanh nghiệp</th>
                  <th className="py-2.5 px-3 font-medium">Enterprise</th>
                  <th className="py-2.5 px-3 font-medium">Nghiên cứu</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--hair)] hover:bg-[var(--muted)]/30 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-medium text-[var(--fg)]">{row.category}</td>
                    <td className="py-2.5 px-3 text-[var(--fg2)]">{row.team}</td>
                    <td className="py-2.5 px-3 text-[var(--fg)] font-medium">{row.business}</td>
                    <td className="py-2.5 px-3 text-[var(--fg2)]">{row.enterprise}</td>
                    <td className="py-2.5 px-3 text-[var(--muted-fg)]">{row.research}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 5. FAQ Accordion ── */}
      <div className="max-w-[860px] mx-auto px-4 py-8 w-full flex flex-col gap-3">
        <h2 className="text-[1.125rem] font-semibold text-center text-[var(--fg)] mb-2">
          Câu hỏi thường gặp về thanh toán & triển khai
        </h2>

        {FAQS.map((faq, idx) => {
          const isOpen = openFaqIndex === idx;
          return (
            <div
              key={idx}
              className="border border-[var(--border)] bg-[var(--card)] rounded-xl overflow-hidden shadow-xs"
            >
              <button
                type="button"
                onClick={() => toggleFaq(idx)}
                className="w-full p-3.5 text-left flex items-center justify-between gap-3 cursor-pointer hover:bg-[var(--muted)]/40 transition-colors"
              >
                <span className="text-[0.8125rem] font-medium text-[var(--fg)]">{faq.q}</span>
                {isOpen ? <ChevronUp size={15} className="text-[var(--muted-fg)] shrink-0" /> : <ChevronDown size={15} className="text-[var(--muted-fg)] shrink-0" />}
              </button>
              {isOpen && (
                <div className="px-3.5 pb-3.5 text-[0.75rem] text-[var(--muted-fg)] leading-relaxed border-t border-[var(--hair)] pt-2.5 bg-[var(--panel)]/30">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 6. Footer ── */}
      <footer className="border-t border-[var(--border)] py-6 mt-auto text-center text-[0.6875rem] text-[var(--muted-fg)]">
        <p>© 2026 OpenWork Inc. Tiêu chuẩn bảo mật dữ liệu cấp ngân hàng · Máy chủ đặt tại Việt Nam.</p>
      </footer>
    </div>
  );
};

export default OpenWorkPricingPage;
