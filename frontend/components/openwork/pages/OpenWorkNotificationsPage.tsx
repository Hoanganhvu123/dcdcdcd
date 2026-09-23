import React, { useState, useMemo } from 'react';
import { Bell, CheckCheck, Settings, AlertTriangle, ShieldCheck, Database, CreditCard, Sparkles, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkNotificationsPageProps {
  onMarkAllRead?: () => void;
  onNavigateAction?: (target: string) => void;
}

interface NotificationItem {
  id: string;
  category: 'data' | 'security' | 'system' | 'billing';
  typeBadge: string;
  typeTone: string;
  title: string;
  body: string;
  time: string;
  dateGroup: string;
  read: boolean;
  actionLabel?: string;
  actionTarget?: string;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    category: 'billing',
    typeBadge: 'BILLING',
    typeTone: 'var(--c1)',
    title: 'Cảnh báo mức chi phí tháng 10/2025',
    body: 'Chi phí tháng này đã đạt 36,1 triệu đ (90% hạn mức cảnh báo 40 triệu đ). Khuyến nghị kiểm tra các tác vụ truy vấn lặp lại.',
    time: '10 phút trước',
    dateGroup: 'Hôm nay',
    read: false,
    actionLabel: 'Xem mức dùng',
    actionTarget: 'billing',
  },
  {
    id: 'n2',
    category: 'data',
    typeBadge: 'DATA',
    typeTone: 'var(--c2)',
    title: 'Đồng bộ dữ liệu Kho phân tích hoàn tất',
    body: '14 bảng trong cơ sở dữ liệu PostgreSQL đã được làm mới lược đồ thành công (719k dòng, độ trễ 18ms).',
    time: '09:38',
    dateGroup: 'Hôm nay',
    read: false,
    actionLabel: 'Xem nguồn dữ liệu',
    actionTarget: 'datasource',
  },
  {
    id: 'n3',
    category: 'security',
    typeBadge: 'SECURITY',
    typeTone: 'var(--c4)',
    title: 'Yêu cầu quyền truy cập từ thành viên mới',
    body: 'Thành viên `ngoc.tb@congty.vn` yêu cầu nâng quyền lên `Phân tích` để truy vấn nguồn dữ liệu ERP & Kế toán.',
    time: 'Hôm qua 16:20',
    dateGroup: 'Hôm qua',
    read: false,
    actionLabel: 'Phê duyệt phân quyền',
    actionTarget: 'members',
  },
  {
    id: 'n4',
    category: 'system',
    typeBadge: 'SYSTEM',
    typeTone: 'var(--c3)',
    title: 'Cập nhật phiên bản OpenWork v2.4.1',
    body: 'Bổ sung tính năng Spreadsheet Studio đa sheet với công thức Excel động và ma trận kiểm toán bảo mật 90 ngày.',
    time: '04/10/2025',
    dateGroup: 'Tuần này',
    read: true,
    actionLabel: 'Xem nhật ký phát hành',
  },
];

export const OpenWorkNotificationsPage: React.FC<OpenWorkNotificationsPageProps> = ({
  onMarkAllRead,
  onNavigateAction,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Notification Channel Toggles
  const [channels, setChannels] = useState({
    inApp: true,
    emailDaily: true,
    slackWebhook: true,
    smsAlert: false,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markItemAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onMarkAllRead?.();
  };

  const filteredList = useMemo(() => {
    return notifications.filter((n) => {
      if (selectedCategory === 'all') return true;
      return n.category === selectedCategory;
    });
  }, [notifications, selectedCategory]);

  // Group by dateGroup
  const groupedNotifications = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    filteredList.forEach((n) => {
      const list = map.get(n.dateGroup) || [];
      list.push(n);
      map.set(n.dateGroup, list);
    });
    return Array.from(map.entries());
  }, [filteredList]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Thông báo & cảnh báo
          </span>
          {unreadCount > 0 && (
            <span className="font-mono text-[0.65625rem] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5 whitespace-nowrap">
              {unreadCount} chưa đọc
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="h-6.5 px-2.5 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-lg text-[0.71875rem] whitespace-nowrap transition-colors"
            >
              <CheckCheck size={12} />
              <span>Đánh dấu đã đọc</span>
            </button>
          )}
        </div>
      </header>

      {/* ── 2. Canvas Content (Feed Column + Sidebar) ── */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Left Feed Area */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-4 custom-scrollbar">
          <div className="max-w-[820px] w-full mx-auto flex flex-col gap-4">
            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1 border border-[var(--border)] p-0.5 rounded-xl bg-[var(--card)] w-fit">
              {[
                { key: 'all', label: `Tất cả (${notifications.length})` },
                { key: 'billing', label: 'Tài chính & chi phí' },
                { key: 'data', label: 'Dữ liệu' },
                { key: 'security', label: 'Bảo mật' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedCategory(t.key)}
                  className={cn(
                    'h-6 px-2.5 rounded-lg text-[0.71875rem] transition-colors',
                    selectedCategory === t.key
                      ? 'bg-[var(--primary)] text-[var(--primary-fg)] font-medium shadow-xs'
                      : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Notifications Grouped Feed */}
            {groupedNotifications.length === 0 ? (
              <div className="p-12 text-center text-[var(--muted-fg)] border border-[var(--border)] rounded-2xl bg-[var(--card)]">
                Không có thông báo nào trong mục này
              </div>
            ) : (
              groupedNotifications.map(([dateGroup, items]) => (
                <div key={dateGroup} className="flex flex-col gap-2">
                  <div className="text-[0.6875rem] font-medium uppercase tracking-wider text-[var(--muted-fg)] px-1">
                    {dateGroup}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {items.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          'border rounded-2xl p-4 bg-[var(--card)] shadow-[var(--shadow)] flex flex-col gap-2.5 transition-all',
                          !n.read
                            ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]/5 ring-1 ring-[var(--accent)]/20'
                            : 'border-[var(--border)]'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
                            )}
                            <span
                              style={{ color: n.typeTone }}
                              className="font-mono text-[0.59375rem] font-semibold px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)]"
                            >
                              {n.typeBadge}
                            </span>
                            <h3 className="text-[0.8125rem] font-medium text-[var(--fg)] truncate">
                              {n.title}
                            </h3>
                          </div>

                          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] shrink-0">
                            {n.time}
                          </span>
                        </div>

                        <p className="text-[0.75rem] text-[var(--muted-fg)] leading-relaxed pl-1">
                          {n.body}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-[var(--hair)]">
                          <div className="flex items-center gap-2">
                            {n.actionLabel && (
                              <button
                                type="button"
                                onClick={() => {
                                  markItemAsRead(n.id);
                                  if (n.actionTarget) onNavigateAction?.(n.actionTarget);
                                }}
                                className="h-6.5 px-3 flex items-center gap-1 border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--fg)] rounded-lg text-[0.71875rem] font-medium shadow-xs transition-colors"
                              >
                                <span>{n.actionLabel}</span>
                                <ArrowRight size={11} />
                              </button>
                            )}
                          </div>

                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => markItemAsRead(n.id)}
                              className="text-[0.6875rem] text-[var(--muted-fg)] hover:text-[var(--fg)] flex items-center gap-1"
                            >
                              <Check size={11} />
                              <span>Đánh dấu đã đọc</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Notification Channel Settings (300px) */}
        <div className="w-[300px] flex-none border-l border-[var(--border)] bg-[var(--panel)] overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
          <div>
            <div className="text-[0.8125rem] font-medium text-[var(--fg)]">Kênh nhận thông báo</div>
            <p className="text-[0.6875rem] text-[var(--muted-fg)] mt-0.5">
              Cấu hình các kênh gửi cảnh báo tự động
            </p>
          </div>

          <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 flex flex-col gap-3 shadow-[var(--shadow)]">
            {[
              { key: 'inApp', label: 'Thông báo trong ứng dụng', desc: 'Bật popover & badge chuông' },
              { key: 'emailDaily', label: 'Email tổng hợp định kỳ', desc: 'Gửi về anh.vh@congty.vn' },
              { key: 'slackWebhook', label: 'Slack Webhook Bot', desc: 'Kênh #data-alerts-internal' },
              { key: 'smsAlert', label: 'SMS cảnh báo khẩn cấp', desc: 'Chỉ khi hệ thống gặp sự cố' },
            ].map((c) => {
              const checked = (channels as any)[c.key];
              return (
                <div key={c.key} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[0.75rem] font-medium text-[var(--fg)] truncate">{c.label}</div>
                    <div className="text-[0.65625rem] text-[var(--muted-fg)] truncate">{c.desc}</div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    onClick={() =>
                      setChannels((prev) => ({ ...prev, [c.key]: !checked }))
                    }
                    className={cn(
                      'relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      checked ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-[var(--primary-fg)] shadow-transform transition duration-200 ease-in-out',
                        checked ? 'translate-x-3.5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Alert Thresholds Card */}
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 flex flex-col gap-2.5 shadow-[var(--shadow)]">
            <div className="text-[0.75rem] font-medium text-[var(--fg)] border-b border-[var(--hair)] pb-1.5">
              Quy tắc ngưỡng cảnh báo
            </div>
            <div className="flex items-center justify-between text-[0.6875rem]">
              <span className="text-[var(--muted-fg)]">Cảnh báo chi phí:</span>
              <span className="font-mono text-[var(--fg)]">{'>'} 35 triệu đ</span>
            </div>
            <div className="flex items-center justify-between text-[0.6875rem]">
              <span className="text-[var(--muted-fg)]">Độ trễ Database:</span>
              <span className="font-mono text-[var(--fg)]">{'>'} 500 ms</span>
            </div>
            <div className="flex items-center justify-between text-[0.6875rem]">
              <span className="text-[var(--muted-fg)]">Tỷ lệ lỗi truy vấn:</span>
              <span className="font-mono text-[var(--fg)]">{'>'} 1,0%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkNotificationsPage;
