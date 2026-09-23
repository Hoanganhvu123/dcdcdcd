import React, { useState } from 'react';
import { Sparkles, AlertTriangle, ShieldAlert, FileQuestion, WifiOff, RefreshCw, ArrowRight, Lock, Database, Search, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkStatesGalleryPageProps {
  onNavigateHome?: () => void;
  onRetry?: () => void;
}

export const OpenWorkStatesGalleryPage: React.FC<OpenWorkStatesGalleryPageProps> = ({
  onNavigateHome,
  onRetry,
}) => {
  const [loadingStep, setLoadingStep] = useState<number>(2);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[var(--bg)] text-[var(--fg)] select-none custom-scrollbar">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Thư viện Trạng thái Giao diện (States Gallery)
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap">
            6 Fallback Cards
          </span>
        </div>

        {onNavigateHome && (
          <button
            type="button"
            onClick={onNavigateHome}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-lg text-[0.71875rem] whitespace-nowrap transition-colors"
          >
            <span>Về Màn hình chính</span>
          </button>
        )}
      </header>

      {/* ── 2. States Canvas Grid ── */}
      <div className="max-w-[1240px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        <div>
          <h1 className="text-[1.25rem] font-semibold text-[var(--fg)] tracking-tight">
            Bộ sưu tập Trạng thái Hệ thống
          </h1>
          <p className="text-[0.78125rem] text-[var(--muted-fg)] mt-1">
            Đảm bảo trải nghiệm người dùng mượt mà và trực quan trong mọi tình huống phản hồi của hệ thống.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* ── Card 1: Empty State ── */}
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-6 shadow-[var(--shadow)] flex flex-col items-center justify-center text-center gap-3 min-h-[280px]">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)]/30 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)]">
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className="text-[0.875rem] font-semibold text-[var(--fg)]">Chưa có phiên phân tích</h3>
              <p className="text-[0.75rem] text-[var(--muted-fg)] mt-1 max-w-[240px] leading-relaxed">
                Bắt đầu cuộc trò chuyện mới hoặc chọn một prompt mẫu trong thư viện để truy vấn dữ liệu.
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateHome}
              className="h-7 px-3 rounded-lg border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 text-[0.71875rem] font-medium transition-opacity shadow-xs"
            >
              Tạo phiên làm việc mới
            </button>
          </div>

          {/* ── Card 2: Loading / Skeleton State ── */}
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-6 shadow-[var(--shadow)] flex flex-col justify-between min-h-[280px]">
            <div className="flex items-center gap-2 text-[0.75rem] font-medium text-[var(--fg)]">
              <RefreshCw size={14} className="text-[var(--accent)] animate-spin" />
              <span>Đang xử lý câu lệnh SQL…</span>
            </div>

            <div className="flex flex-col gap-2.5 py-2">
              <div className="h-3.5 w-3/4 bg-[var(--muted)] rounded-md animate-pulse" />
              <div className="h-3 w-full bg-[var(--muted)] rounded-md animate-pulse" />
              <div className="h-3 w-5/6 bg-[var(--muted)] rounded-md animate-pulse" />
              <div className="h-10 w-full bg-[var(--muted)]/60 rounded-xl animate-pulse mt-2" />
            </div>

            <div className="text-[0.65625rem] font-mono text-[var(--muted-fg)]">
              Ước tính thời gian: ~1,2 giây
            </div>
          </div>

          {/* ── Card 3: Error / SQL Failed State ── */}
          <div className="border border-rose-500/30 bg-rose-500/5 rounded-2xl p-6 shadow-[var(--shadow)] flex flex-col justify-between min-h-[280px]">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle size={16} />
              <h3 className="text-[0.84375rem] font-semibold">Lỗi cú pháp SQL</h3>
            </div>

            <div className="bg-[var(--bg)] border border-rose-500/20 rounded-xl p-3 text-[0.6875rem] font-mono text-rose-700 dark:text-rose-300 leading-relaxed overflow-x-auto">
              <code>ERROR: column "total_revenue" does not exist in table "fact_orders". Gợi ý: Dùng cột "net_amount".</code>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-7 px-3 rounded-lg border-0 bg-rose-600 text-white hover:bg-rose-700 text-[0.71875rem] font-medium shadow-xs"
              >
                Tự động sửa bằng AI
              </button>
            </div>
          </div>

          {/* ── Card 4: Access Denied 403 ── */}
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-6 shadow-[var(--shadow)] flex flex-col items-center justify-center text-center gap-3 min-h-[280px]">
            <div className="w-12 h-12 rounded-2xl bg-zinc-500/10 border border-zinc-500/20 flex items-center justify-center text-zinc-500">
              <Lock size={22} />
            </div>
            <div>
              <h3 className="text-[0.875rem] font-semibold text-[var(--fg)]">Không có quyền truy cập</h3>
              <p className="text-[0.75rem] text-[var(--muted-fg)] mt-1 max-w-[240px] leading-relaxed">
                Tài khoản của bạn cần vai trò "Biên tập" hoặc "Quản trị" để truy vấn bảng `dim_salaries`.
              </p>
            </div>
            <button
              type="button"
              className="h-7 px-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--muted)] text-[0.71875rem] font-medium text-[var(--fg2)]"
            >
              Yêu cầu cấp quyền
            </button>
          </div>

          {/* ── Card 5: Page Not Found 404 ── */}
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-6 shadow-[var(--shadow)] flex flex-col items-center justify-center text-center gap-3 min-h-[280px]">
            <div className="font-mono text-[2.25rem] font-bold text-[var(--muted-fg)] leading-none">
              404
            </div>
            <div>
              <h3 className="text-[0.875rem] font-semibold text-[var(--fg)]">Không tìm thấy trang</h3>
              <p className="text-[0.75rem] text-[var(--muted-fg)] mt-1 max-w-[240px] leading-relaxed">
                Đường dẫn bạn yêu cầu không tồn tại hoặc đã được di chuyển sang địa chỉ khác.
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateHome}
              className="h-7 px-3 rounded-lg border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 text-[0.71875rem] font-medium shadow-xs"
            >
              Quay lại Bảng điều khiển
            </button>
          </div>

          {/* ── Card 6: Database Offline ── */}
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-2xl p-6 shadow-[var(--shadow)] flex flex-col justify-between min-h-[280px]">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <WifiOff size={16} />
              <h3 className="text-[0.84375rem] font-semibold">Mất kết nối Database</h3>
            </div>

            <p className="text-[0.75rem] text-[var(--muted-fg)] leading-relaxed">
              Máy chủ PostgreSQL Data Warehouse (10.0.4.12:5432) không phản hồi trong 30 giây qua. Vui lòng kiểm tra lại mạng nội bộ.
            </p>

            <button
              type="button"
              onClick={onRetry}
              className="h-7 px-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 text-[0.71875rem] font-medium flex items-center justify-center gap-1.5 w-fit"
            >
              <RefreshCw size={12} />
              <span>Thử kết nối lại</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkStatesGalleryPage;
