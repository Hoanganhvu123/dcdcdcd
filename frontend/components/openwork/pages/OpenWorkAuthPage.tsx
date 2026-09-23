import React, { useState } from 'react';
import { ShieldCheck, Eye, EyeOff, Lock, Mail, ArrowRight, Sparkles, Check, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkAuthPageProps {
  initialMode?: 'login' | 'register';
  onLoginSuccess?: (email: string) => void;
  onRegisterSuccess?: (email: string) => void;
}

export const OpenWorkAuthPage: React.FC<OpenWorkAuthPageProps> = ({
  initialMode = 'login',
  onLoginSuccess,
  onRegisterSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState<string>('anh.vh@congty.vn');
  const [password, setPassword] = useState<string>('••••••••••••');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (mode === 'login') {
        onLoginSuccess?.(email);
      } else {
        onRegisterSuccess?.(email);
      }
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full min-h-screen bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── Left Hero Side (44%) ── */}
      <div className="lg:w-[44%] border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--panel)] p-8 lg:p-12 flex flex-col justify-between">
        <div>
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center font-mono text-[0.75rem] font-bold shadow-xs">
              OW
            </div>
            <span className="text-[0.9375rem] font-semibold tracking-tight">OpenWork Data Platform</span>
          </div>

          <div className="mt-12 flex flex-col gap-3">
            <span className="font-mono text-[0.6875rem] text-[var(--accent)] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)]/20 w-fit">
              Doanh nghiệp Thông minh
            </span>
            <h1 className="text-[1.625rem] lg:text-[1.875rem] font-semibold tracking-tight text-[var(--fg)] leading-tight">
              Khai phóng sức mạnh dữ liệu với AI Trợ lý Điều hành
            </h1>
            <p className="text-[0.8125rem] text-[var(--muted-fg)] leading-relaxed mt-1">
              Truy vấn SQL tự động, dựng bảng tính Spreadsheet đa sheet và tạo bài thuyết trình 16:9 trong vài giây.
            </p>
          </div>

          {/* Value props */}
          <div className="mt-8 flex flex-col gap-3.5">
            {[
              { title: 'Truy vấn Kho Dữ liệu An toàn', desc: 'Kết nối PostgreSQL, MySQL, ClickHouse với chính sách Zero-Retention' },
              { title: 'Artifacts Đa Định dạng', desc: 'Tự động xuất Excel XLSX, Slide PPTX 16:9 và báo cáo Word A4' },
              { title: 'Bảo mật Cấp Ngân hàng', desc: 'Hỗ trợ đăng nhập SSO SAML, Okta và phân quyền 4 cấp bậc' },
            ].map((v, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-[0.75rem]">
                <div className="w-4 h-4 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={11} />
                </div>
                <div>
                  <strong className="text-[var(--fg)] font-medium">{v.title}:</strong>{' '}
                  <span className="text-[var(--muted-fg)]">{v.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonial Quote */}
        <div className="mt-8 pt-6 border-t border-[var(--hair)] text-[0.71875rem] text-[var(--muted-fg)] italic leading-relaxed">
          "OpenWork giúp phòng Phân tích Dữ liệu của chúng tôi tiết kiệm hơn 15 giờ mỗi tuần cho các báo cáo định kỳ."
          <div className="not-italic font-medium text-[var(--fg)] mt-1.5 font-sans">
            — Vũ Hoàng Anh, Head of Data Analytics
          </div>
        </div>
      </div>

      {/* ── Right Form Side (56%) ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[420px] flex flex-col gap-6">
          {/* Tab Switcher */}
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={cn(
                  'text-[0.875rem] pb-2 font-semibold transition-colors relative cursor-pointer',
                  mode === 'login'
                    ? 'text-[var(--fg)]'
                    : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                )}
              >
                Đăng nhập
                {mode === 'login' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setMode('register')}
                className={cn(
                  'text-[0.875rem] pb-2 font-semibold transition-colors relative cursor-pointer',
                  mode === 'register'
                    ? 'text-[var(--fg)]'
                    : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                )}
              >
                Đăng ký tài khoản
                {mode === 'register' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] rounded-full" />
                )}
              </button>
            </div>
          </div>

          {/* SSO Buttons */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => onLoginSuccess?.('anh.vh@google.com')}
              className="h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[0.78125rem] font-medium text-[var(--fg)] flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.67v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.16z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.92 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Đăng nhập với Google Workspace</span>
            </button>

            <button
              type="button"
              onClick={() => onLoginSuccess?.('anh.vh@microsoft.com')}
              className="h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[0.78125rem] font-medium text-[var(--fg)] flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Building2 size={15} className="text-sky-500" />
              <span>Đăng nhập với Microsoft Entra ID / SAML</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[0.6875rem] uppercase tracking-wider text-[var(--muted-fg)]">
              hoặc email công ty
            </span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Main Credentials Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label className="text-[0.71875rem] font-medium text-[var(--muted-fg)] block mb-1">
                Địa chỉ email doanh nghiệp
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-2.5 text-[var(--muted-fg)]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ten.ban@congty.vn"
                  className="w-full h-8.5 pl-8.5 pr-3 bg-[var(--card)] border border-[var(--border)] text-[0.78125rem] text-[var(--fg)] placeholder:text-[var(--muted-fg)] rounded-xl outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[0.71875rem] font-medium text-[var(--muted-fg)]">
                  Mật khẩu
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="text-[0.6875rem] text-[var(--accent)] hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-2.5 text-[var(--muted-fg)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-8.5 pl-8.5 pr-8 bg-[var(--card)] border border-[var(--border)] text-[0.78125rem] text-[var(--fg)] placeholder:text-[var(--muted-fg)] rounded-xl outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2 text-[var(--muted-fg)] hover:text-[var(--fg)]"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[var(--border)] text-[var(--accent)]"
              />
              <label htmlFor="remember" className="text-[0.71875rem] text-[var(--fg2)] cursor-pointer">
                Ghi nhớ phiên đăng nhập trên thiết bị này (30 ngày)
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="h-9 w-full rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 text-[0.78125rem] font-medium transition-opacity flex items-center justify-center gap-2 shadow-xs mt-2"
            >
              {isLoading ? (
                <span>Đang xử lý…</span>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Đăng nhập vào hệ thống' : 'Tạo tài khoản mới'}</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </form>

          {/* Bottom Security Footer */}
          <div className="border-t border-[var(--hair)] pt-4 text-center text-[0.6875rem] text-[var(--muted-fg)] flex items-center justify-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-500" />
            <span>Mã hóa TLS 1.3 · Tiêu chuẩn bảo mật ISO 27001</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkAuthPage;
